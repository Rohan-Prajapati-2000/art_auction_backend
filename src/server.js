require('dotenv').config();
const http = require('http');
const { Server } = require('socket.io');

const createApp = require('./app');
const { connectDB } = require('./config/db');
const { initSockets } = require('./sockets');
const { startAuctionCloserJob, attachIO } = require('./services/auctionCloser');

async function main() {
  await connectDB();

  const app = createApp();
  const server = http.createServer(app);

  const origins = (process.env.CORS_ORIGIN || '*').split(',').map((s) => s.trim());
  const io = new Server(server, {
    cors: { origin: origins.includes('*') ? true : origins },
  });

  initSockets(io);
  attachIO(io);
  app.set('io', io);

  // Starts the recurring job that closes auctions whose endTime has
  // passed (and winner determination) - works independently of whether
  // anyone is connected, and independently of this process's uptime,
  // since it re-derives everything from endTime stored in MongoDB.
  startAuctionCloserJob();

  const port = process.env.PORT || 5000;
  server.listen(port, () => {
    console.log(`[server] Auction API listening on port ${port}`);
  });
}

main().catch((err) => {
  console.error('[server] Fatal startup error:', err);
  process.exit(1);
});
