const express = require('express');
const { requireAuth, requireRole } = require('../middleware/auth');
const upload = require('../middleware/upload');
const {
  createAuction,
  listAuctions,
  getAuction,
  listBids,
  myBidAuctions,
} = require('../controllers/auctionController');
const { placeBid } = require('../controllers/bidController');

const router = express.Router();

router.use(requireAuth);

router.get('/', listAuctions);
router.get('/mine/bids', myBidAuctions);
router.get('/:id', getAuction);
router.get('/:id/bids', listBids);

router.post('/', requireRole('admin'), upload.single('image'), createAuction);
router.post('/:id/bids', requireRole('user', 'admin'), placeBid);

module.exports = router;
