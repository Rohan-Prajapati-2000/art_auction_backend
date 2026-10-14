const express = require('express');
const cors = require('cors');
const path = require('path');

const authRoutes = require('./routes/authRoutes');
const auctionRoutes = require('./routes/auctionRoutes');
const { errorHandler, notFound } = require('./middleware/errorHandler');

function createApp() {
  const app = express();

  const origins = (process.env.CORS_ORIGIN || '*').split(',').map((s) => s.trim());
  app.use(cors({ origin: origins.includes('*') ? true : origins }));
  app.use(express.json());

  // Serves locally-stored images when Cloudinary isn't configured
  // (see src/middleware/upload.js).
  app.use('/uploads', express.static(path.join(__dirname, '..', 'uploads')));

  app.get('/health', (req, res) => res.json({ success: true, status: 'ok', time: new Date() }));

  app.use('/api/auth', authRoutes);
  app.use('/api/auctions', auctionRoutes);

  app.use(notFound);
  app.use(errorHandler);

  return app;
}

module.exports = createApp;
