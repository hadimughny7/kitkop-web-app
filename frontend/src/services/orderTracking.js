const storageKey = orderNumber => `kitkop_tracking:${orderNumber}`;

export const rememberOrderTracking = order => {
  if (!order?.order_number || !order?.tracking_token) return;
  try { sessionStorage.setItem(storageKey(order.order_number), order.tracking_token); } catch { /* HTTP polling remains available. */ }
};

export const getOrderTrackingToken = orderNumber => {
  try { return sessionStorage.getItem(storageKey(orderNumber)); } catch { return null; }
};
