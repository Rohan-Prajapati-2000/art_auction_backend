const jwt = require('jsonwebtoken');

/**
 * Socket.io wiring. Clients join a room per auction (`auction:<id>`) to get
 * live bid updates and the auction-ended event without polling/refreshing.
 *
 * Auth is optional-but-verified: if a token is supplied we attach the user,
 * but joining/watching an auction room doesn't require auth since bidding
 * itself is already protected on the REST endpoint.
 */
function initSockets(io) {
  io.use((socket, next) => {
    const token = socket.handshake.auth?.token;
    if (token) {
      try {
        socket.user = jwt.verify(token, process.env.JWT_SECRET);
      } catch (err) {
        // invalid token: proceed unauthenticated, REST calls still enforce auth
      }
    }
    next();
  });

  io.on('connection', (socket) => {
    socket.on('auction:join', (auctionId) => {
      if (typeof auctionId === 'string') {
        socket.join(`auction:${auctionId}`);
      }
    });

    socket.on('auction:leave', (auctionId) => {
      if (typeof auctionId === 'string') {
        socket.leave(`auction:${auctionId}`);
      }
    });
  });
}

// Called by the bid controller right after a bid is persisted, so every
// client viewing that auction sees the new highest bid instantly.
function emitNewBid(io, auctionId, payload) {
  io.to(`auction:${auctionId}`).emit('bid:placed', payload);
}

module.exports = { initSockets, emitNewBid };
