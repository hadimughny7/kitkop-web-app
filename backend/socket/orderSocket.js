/**
 * Socket.io event handlers for real-time updates
 */
const setupSocket = (io) => {
  io.on('connection', (socket) => {
    console.log(`🔌 Socket connected: ${socket.id}`);

    // Join role-based rooms
    socket.on('join-room', (room) => {
      socket.join(room);
      console.log(`📡 Socket ${socket.id} joined room: ${room}`);
    });

    // Leave room
    socket.on('leave-room', (room) => {
      socket.leave(room);
      console.log(`📡 Socket ${socket.id} left room: ${room}`);
    });

    // Customer joins order tracking room
    socket.on('track-order', (orderNumber) => {
      socket.join(`order-${orderNumber}`);
      console.log(`📡 Socket ${socket.id} tracking order: ${orderNumber}`);
    });

    // Disconnect
    socket.on('disconnect', () => {
      console.log(`🔌 Socket disconnected: ${socket.id}`);
    });
  });
};

module.exports = setupSocket;
