const mongoose = require('mongoose');
const Auction = require('../models/Auction');
const Bid = require('../models/Bid');
const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');
const { serializeAuction, serializeBid } = require('../utils/serializers');
const { emitNewBid } = require('../sockets');

/**
 * POST /api/auctions/:id/bids   (user)
 *
 * Concurrency-safety: two users can submit a bid on the same auction at the
 * exact same millisecond. We must never let both "win" the same price slot,
 * and the final currentHighestBid must always reflect the true highest bid.
 *
 * MongoDB guarantees a single document update (findOneAndUpdate) is atomic:
 * the server locks/applies it as one indivisible step. So instead of
 * "read current highest bid, compare in app code, then write" (which has a
 * race window between read and write), we fold the comparison into the
 * query filter itself:
 *
 *   findOneAndUpdate(
 *     { _id: auctionId, <all auction rules>, currentHighestBid.amount: { $lt: amount } },
 *     { $set: { currentHighestBid: {...} }, $inc: { bidCount: 1 } }
 *   )
 *
 * Only ONE of two simultaneous requests can match-and-apply this update for
 * a given amount threshold; whichever reaches Mongo's storage engine first
 * wins the document, and the loser's query simply no longer matches (the
 * highest bid has already moved), so it falls through to the "rejected"
 * branch below with an accurate, current reason - never a silent overwrite.
 */
const placeBid = asyncHandler(async (req, res) => {
  const { id: auctionId } = req.params;
  const { amount } = req.body;

  if (!mongoose.Types.ObjectId.isValid(auctionId)) {
    throw new ApiError(400, 'Invalid auction id');
  }
  const bidAmount = Number(amount);
  if (!amount || Number.isNaN(bidAmount) || bidAmount <= 0) {
    throw new ApiError(400, 'A positive numeric amount is required');
  }

  const auction = await Auction.findById(auctionId);
  if (!auction) throw new ApiError(404, 'Auction not found');

  const now = new Date();

  // --- Auction-window rule ---
  if (now < auction.startTime) {
    throw new ApiError(400, 'This auction has not started yet');
  }
  if (now >= auction.endTime || auction.status === 'ended') {
    throw new ApiError(400, 'This auction has already ended');
  }

  // --- Minimum-amount rule (first bid vs. subsequent bids) ---
  const hasBids = auction.currentHighestBid && auction.currentHighestBid.amount > 0;
  const minimumRequired = hasBids
    ? auction.currentHighestBid.amount + auction.minIncrement
    : auction.startingPrice;

  if (bidAmount < minimumRequired) {
    const reason = hasBids
      ? `Your bid must be at least ${minimumRequired} (current highest bid ${auction.currentHighestBid.amount} + minimum increment ${auction.minIncrement})`
      : `The first bid must be at least the starting price of ${auction.startingPrice}`;
    throw new ApiError(400, reason);
  }

  // --- Atomic, race-safe write: only succeeds if we are STILL the highest
  //     eligible bid at the moment Mongo applies the update. ---
  const updatedAuction = await Auction.findOneAndUpdate(
    {
      _id: auctionId,
      status: { $ne: 'ended' },
      startTime: { $lte: now },
      endTime: { $gt: now },
      'currentHighestBid.amount': { $lt: bidAmount },
    },
    {
      $set: { currentHighestBid: { amount: bidAmount, bidder: req.user.id } },
      $inc: { bidCount: 1 },
    },
    { new: true },
  );

  if (!updatedAuction) {
    // Someone else's bid (or the auction's own closing) got applied first.
    // Re-read to give the user an accurate, current reason instead of a
    // generic failure.
    const fresh = await Auction.findById(auctionId);
    if (!fresh || fresh.status === 'ended' || now >= fresh.endTime) {
      throw new ApiError(409, 'This auction just ended before your bid was placed');
    }
    throw new ApiError(
      409,
      `Someone just placed a higher bid (current highest is now ${fresh.currentHighestBid.amount}). Please bid again with a higher amount.`,
    );
  }

  const bid = await Bid.create({ auction: auctionId, bidder: req.user.id, amount: bidAmount });
  const populatedBid = await bid.populate('bidder', 'name email');

  const io = req.app.get('io');
  if (io) {
    emitNewBid(io, auctionId, {
      auctionId,
      bid: serializeBid(populatedBid),
      currentHighestBid: { amount: bidAmount, bidder: { id: req.user.id, name: req.user.name } },
      bidCount: updatedAuction.bidCount,
    });
  }

  res.status(201).json({
    success: true,
    data: {
      bid: serializeBid(populatedBid),
      auction: serializeAuction(updatedAuction),
    },
  });
});

module.exports = { placeBid };
