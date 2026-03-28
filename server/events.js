const { Server } = require('socket.io');

let io = null;

function init(httpServer) {
  io = new Server(httpServer, {
    cors: {
      origin: '*',
      methods: ['GET', 'POST'],
    },
  });

  io.on('connection', (socket) => {
    console.log(`\u26a1 Client connected: ${socket.id}`);
    socket.on('disconnect', () => {
      console.log(`\u{1f50c} Client disconnected: ${socket.id}`);
    });
  });

  return io;
}

function emit(eventName, payload) {
  if (io) {
    io.emit(eventName, payload);
  }
}

function getIO() {
  return io;
}

module.exports = { init, emit, getIO };
