const { STAFF_ROLES } = require('../constants/roles');
const roleRoom = role => `staff-role:${role}`;
const userRoom = id => `staff-user:${id}`;
const orderRoom = id => `customer-order:${id}`;
const fields = {
  'new-order': ['orderId', 'orderNumber', 'status'],
  'payment-success': ['orderId', 'orderNumber'],
  'order-status-update': ['orderId', 'orderNumber', 'status', 'updatedAt'],
  'order-item-update': ['orderId', 'orderNumber', 'itemId', 'itemStatus', 'orderStatus', 'bulk'],
};

const emitRealtime = (io, event, data = {}) => {
  if (!io) return;
  if (event === 'menu-updated') {
    io.to('staff').emit(event);
    return;
  }
  if (event === 'stock-updated') {
    io.to(['owner', 'manajer', 'kitchen', 'barista'].map(roleRoom)).emit(event);
    return;
  }
  if (!fields[event]) throw new Error(`Unsupported realtime event: ${event}`);
  const source = { ...data, orderId: data.orderId ?? data.id, orderNumber: data.orderNumber ?? data.order_number };
  // Whitelist identifiers/status. Never forward ORM instances or customer data.
  const payload = Object.fromEntries(fields[event].filter(key => source[key] !== undefined).map(key => [key, source[key]]));
  const rooms = ['staff'];
  if (event !== 'new-order' && payload.orderId != null) rooms.push(orderRoom(payload.orderId));
  io.to(rooms).emit(event, payload);
};

module.exports = { STAFF_ROLES, roleRoom, userRoom, orderRoom, emitRealtime };
