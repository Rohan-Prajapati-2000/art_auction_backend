const mongoose = require('mongoose');

// Status is stored but always re-derived (see services/auctionStatus.js)
// so a stale value can never be trusted on its own — it's a cache for
// fast queries/filtering, not the source of truth.
const AUCTION_STATUS = ['upcoming', 'live', 'ended'];

const auctionSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true },
    description: { type: String, required: true, trim: true },
    imageUrl: { type: String, required: true },
    imagePublicId: { type: String }, // cloudinary id, for cleanup if ever needed

    startingPrice: { type: Number, required: true, min: 0 },
    minIncrement: { type: Number, required: true, min: 0.01 },

    startTime: { type: Date, required: true },
    endTime: { type: Date, required: true },

    status: { type: String, enum: AUCTION_STATUS, default: 'upcoming', index: true },

    // Denormalized for fast reads; kept in sync atomically on every bid write.
    currentHighestBid: {
      amount: { type: Number, default: 0 },
      bidder: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    },
    bidCount: { type: Number, default: 0 },

    winner: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    closedAt: { type: Date, default: null },

    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: true },
);

auctionSchema.index({ startTime: 1, endTime: 1 });

auctionSchema.pre('validate', function validateTimes(next) {
  if (this.endTime <= this.startTime) {
    return next(new Error('endTime must be after startTime'));
  }
  next();
});

module.exports = mongoose.model('Auction', auctionSchema);
module.exports.AUCTION_STATUS = AUCTION_STATUS;
