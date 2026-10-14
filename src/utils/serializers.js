const { computeStatus } = require('../services/auctionStatus');

function serializeAuction(auctionDoc, now = new Date()) {
  const a = auctionDoc.toObject ? auctionDoc.toObject() : auctionDoc;
  const status = computeStatus(a, now);
  const msRemaining =
    status === 'upcoming'
      ? new Date(a.startTime).getTime() - now.getTime()
      : status === 'live'
      ? new Date(a.endTime).getTime() - now.getTime()
      : 0;

  return {
    id: a._id,
    title: a.title,
    description: a.description,
    imageUrl: a.imageUrl,
    startingPrice: a.startingPrice,
    minIncrement: a.minIncrement,
    startTime: a.startTime,
    endTime: a.endTime,
    status,
    currentHighestBid: {
      amount: a.currentHighestBid?.amount || 0,
      bidder: a.currentHighestBid?.bidder || null,
    },
    bidCount: a.bidCount || 0,
    winner: a.winner || null,
    msRemaining: Math.max(0, msRemaining),
    createdBy: a.createdBy,
    createdAt: a.createdAt,
  };
}

function serializeBid(bidDoc) {
  const b = bidDoc.toObject ? bidDoc.toObject() : bidDoc;
  return {
    id: b._id,
    auction: b.auction,
    amount: b.amount,
    bidder: b.bidder,
    createdAt: b.createdAt,
  };
}

module.exports = { serializeAuction, serializeBid };
