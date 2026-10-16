const cron = require('node-cron');
const Auction = require('../models/Auction');

let ioRef = null;

function attachIO(io) {
  ioRef = io;
}

/**
 * Finds every auction that is still marked "live" (or "upcoming", in case
 * one somehow never flipped to live) but whose endTime has passed, and
 * closes it: sets status=ended, winner=highest bidder (or null if no bids).
 *
 * This is driven entirely by data in MongoDB (endTime vs. now), not by an
 * in-memory timer, so:
 *  - it keeps working across server restarts/redeploys (the next cron tick
 *    or the next read just finds the same overdue auctions and closes them)
 *  - it closes auctions even if nobody has the app open at that moment
 *
 * Returns the list of auctions that were closed in this pass (useful for
 * emitting socket events).
 */
async function closeDueAuctions() {
  const now = new Date();

  // Flip auctions whose start time has passed from "upcoming" to "live",
  // so the stored status (used by the ?status= filter) matches reality.
  await Auction.updateMany(
    { status: 'upcoming', startTime: { $lte: now }, endTime: { $gt: now } },
    { $set: { status: 'live' } },
  );

  const dueAuctions = await Auction.find({
    status: { $ne: 'ended' },
    endTime: { $lte: now },
  });

  const closed = [];

  for (const auction of dueAuctions) {
    // Re-fetch+update atomically per auction so two concurrent closer runs
    // (e.g. cron tick + lazy close-on-read at the same instant) can't both
    // "win" and double-process the same auction.
    const updated = await Auction.findOneAndUpdate(
      { _id: auction._id, status: { $ne: 'ended' } },
      {
        $set: {
          status: 'ended',
          closedAt: now,
          winner:
            auction.currentHighestBid && auction.currentHighestBid.amount > 0
              ? auction.currentHighestBid.bidder
              : null,
        },
      },
      { new: true },
    );

    if (updated) {
      closed.push(updated);
    }
  }

  if (closed.length && ioRef) {
    for (const auction of closed) {
      ioRef.to(`auction:${auction._id}`).emit('auction:ended', {
        auctionId: auction._id,
        winner: auction.winner,
        finalAmount: auction.currentHighestBid?.amount || 0,
      });
    }
  }

  return closed;
}

/**
 * Starts the recurring background job. Interval is short (default 5s)
 * because auctions should close close-to-exactly at their endTime, not
 * minutes late.
 */
function startAuctionCloserJob() {
  const seconds = parseInt(process.env.AUCTION_CLOSER_INTERVAL_SECONDS || '5', 10);
  const expr = `*/${Math.max(1, seconds)} * * * * *`;

  const task = cron.schedule(expr, () => {
    closeDueAuctions().catch((err) => {
      console.error('[auctionCloser] failed:', err.message);
    });
  });

  // Also run once immediately on boot, so auctions that ended while the
  // server/process was down (e.g. a redeploy) get closed right away
  // instead of waiting for the first tick.
  closeDueAuctions().catch((err) => {
    console.error('[auctionCloser] initial run failed:', err.message);
  });

  return task;
}

module.exports = { startAuctionCloserJob, closeDueAuctions, attachIO };
