const Auction = require('../models/Auction');
const Bid = require('../models/Bid');
const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');
const { serializeAuction, serializeBid } = require('../utils/serializers');
const { closeDueAuctions } = require('../services/auctionCloser');

const POPULATE_FIELDS = 'name email';

// POST /api/auctions  (admin)
const createAuction = asyncHandler(async (req, res) => {
  const { title, description, startingPrice, minIncrement, startTime, endTime } = req.body;

  if (!title || !description || !startingPrice || !minIncrement || !startTime || !endTime) {
    throw new ApiError(400, 'title, description, startingPrice, minIncrement, startTime and endTime are required');
  }
  if (!req.file) {
    throw new ApiError(400, 'An auction image is required');
  }

  const start = new Date(startTime);
  const end = new Date(endTime);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    throw new ApiError(400, 'startTime / endTime must be valid dates (ISO 8601)');
  }
  if (end <= start) {
    throw new ApiError(400, 'endTime must be after startTime');
  }

  // multer-storage-cloudinary sets .path to the secure_url; disk storage
  // fallback sets .filename - normalize into one imageUrl.
  const imageUrl = req.file.path && req.file.path.startsWith('http')
    ? req.file.path
    : `/uploads/${req.file.filename}`;

  const auction = await Auction.create({
    title,
    description,
    imageUrl,
    imagePublicId: req.file.filename,
    startingPrice: Number(startingPrice),
    minIncrement: Number(minIncrement),
    startTime: start,
    endTime: end,
    status: start > new Date() ? 'upcoming' : 'live',
    createdBy: req.user.id,
  });

  res.status(201).json({ success: true, data: serializeAuction(auction) });
});

// GET /api/auctions?status=upcoming|live|ended  (user + admin)
// Admins additionally get createdBy/winner populated with name+email.
const listAuctions = asyncHandler(async (req, res) => {
  // Lazy-close: guarantees a client never sees a "live" auction whose
  // endTime has already passed, even if the cron tick hasn't run yet.
  await closeDueAuctions();

  const { status } = req.query;
  const query = {};
  if (status && ['upcoming', 'live', 'ended'].includes(status)) {
    query.status = status;
  }

  const auctions = await Auction.find(query)
    .sort({ startTime: -1 })
    .populate('currentHighestBid.bidder', POPULATE_FIELDS)
    .populate('winner', POPULATE_FIELDS)
    .populate('createdBy', POPULATE_FIELDS);

  res.json({ success: true, data: auctions.map((a) => serializeAuction(a)) });
});

// GET /api/auctions/:id  (user + admin)
const getAuction = asyncHandler(async (req, res) => {
  await closeDueAuctions();

  const auction = await Auction.findById(req.params.id)
    .populate('currentHighestBid.bidder', POPULATE_FIELDS)
    .populate('winner', POPULATE_FIELDS)
    .populate('createdBy', POPULATE_FIELDS);

  if (!auction) throw new ApiError(404, 'Auction not found');

  res.json({ success: true, data: serializeAuction(auction) });
});

// GET /api/auctions/:id/bids  (bid history, newest first)
const listBids = asyncHandler(async (req, res) => {
  const auction = await Auction.findById(req.params.id);
  if (!auction) throw new ApiError(404, 'Auction not found');

  const bids = await Bid.find({ auction: auction._id })
    .sort({ createdAt: -1 })
    .populate('bidder', POPULATE_FIELDS);

  res.json({ success: true, data: bids.map(serializeBid) });
});

// GET /api/auctions/mine/bids  (user: outcome of every auction they bid on)
const myBidAuctions = asyncHandler(async (req, res) => {
  await closeDueAuctions();

  const myBids = await Bid.find({ bidder: req.user.id }).distinct('auction');
  const auctions = await Auction.find({ _id: { $in: myBids } })
    .sort({ endTime: -1 })
    .populate('currentHighestBid.bidder', POPULATE_FIELDS)
    .populate('winner', POPULATE_FIELDS);

  res.json({
    success: true,
    data: auctions.map((a) => ({
      ...serializeAuction(a),
      didIWin: a.status === 'ended' && a.winner && a.winner._id.toString() === req.user.id,
    })),
  });
});

module.exports = { createAuction, listAuctions, getAuction, listBids, myBidAuctions };
