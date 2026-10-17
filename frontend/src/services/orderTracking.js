const storageKey = orderNumber => `kitkop_tracking:${orderNumber}`;
const tokens = new Map();

export const rememberOrderTracking = order => {
  if (!order?.order_number || !order?.tracking_token) return;
  tokens.set(order.order_number, order.tracking_token);
  try { sessionStorage.setItem(storageKey(order.order_number), order.tracking_token); } catch { /* Keep access in this page session when storage is unavailable. */ }
};

export const getOrderTrackingToken = orderNumber => {
  try { return sessionStorage.getItem(storageKey(orderNumber)) || tokens.get(orderNumber) || null; } catch { return tokens.get(orderNumber) || null; }
};
