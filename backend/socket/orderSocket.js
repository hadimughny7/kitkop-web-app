const jwt = require('jsonwebtoken');
const { User, Order } = require('../models');
const { verifyTrackingToken } = require('../services/orderTracking');
const { STAFF_ROLES, roleRoom, userRoom, orderRoom } = require('./realtimeEvents');
const { sessionMatches, endSocketSession } = require('../services/staffSessions');

const setupSocket = io => {
  io.use(async (socket, next) => {
    try {
      const { token, trackingToken, orderNumber } = socket.handshake.auth || {};
      let claims;
      if (token !== undefined) {
        claims = jwt.verify(token, process.env.JWT_SECRET, { algorithms: ['HS256'] });
        if (!Number.isInteger(claims.id) || claims.aud) throw new Error('Invalid staff token');
        const user = await User.findByPk(claims.id, { attributes: ['id', 'role', 'is_active', 'session_version'] });
        if (!user || Number(user.is_active) !== 1 || !STAFF_ROLES.includes(user.role)) throw new Error('Invalid staff account');
        if (!sessionMatches(claims, user)) throw Object.assign(new Error('Revoked staff session'), { code: 'SESSION_REVOKED' });
        socket.data.staffId = user.id;
        socket.data.sessionVersion = user.session_version;
        socket.data.rooms = ['staff', roleRoom(user.role), userRoom(user.id)];
      } else {
        claims = verifyTrackingToken(trackingToken);
        if (typeof orderNumber !== 'string' || claims.orderNumber !== orderNumber || !/^\d+$/.test(claims.sub)) throw new Error('Invalid tracking scope');
        const order = await Order.findOne({ where: { id: Number(claims.sub), order_number: orderNumber }, attributes: ['id', 'order_number'] });
        if (!order) throw new Error('Invalid order');
        socket.data.rooms = [orderRoom(order.id)];
        socket.data.orderNumber = order.order_number;
      }
      if (!Number.isFinite(claims.exp) || claims.exp * 1000 <= Date.now()) throw new Error('Token must expire');
      socket.data.expiresAt = claims.exp * 1000;
      next();
    } catch (cause) {
      const error = new Error('Akses realtime ditolak.');
      error.data = { code: cause.code === 'SESSION_REVOKED' ? 'SESSION_REVOKED' : 'UNAUTHORIZED' };
      next(error);
    }
  });

  io.on('connection', socket => {
    socket.join(socket.data.rooms);
    if (socket.data.staffId) {
      // Cover a reset committed between handshake validation and room entry.
      User.findByPk(socket.data.staffId, { attributes: ['is_active', 'role', 'session_version'] }).then(user => {
        if (!user || Number(user.is_active) !== 1 || !sessionMatches({ sessionVersion: socket.data.sessionVersion }, user)
          || !socket.data.rooms.includes(roleRoom(user.role))) endSocketSession(socket);
      }).catch(() => socket.disconnect(true));
    }
    const expiry = setTimeout(() => socket.disconnect(true), Math.max(0, socket.data.expiresAt - Date.now()));
    expiry.unref();
    socket.on('disconnect', () => clearTimeout(expiry));
    // Membership is assigned exclusively from verified server-side identity.
    for (const event of ['join-room', 'join-role', 'leave-room']) {
      socket.on(event, (room, ack) => { if (typeof ack === 'function') ack({ success: false }); });
    }
    socket.on('track-order', (number, ack) => {
      if (typeof ack === 'function') ack({ success: number === socket.data.orderNumber });
    });
  });
};

module.exports = setupSocket;
