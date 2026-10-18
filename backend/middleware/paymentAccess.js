const { Order } = require('../models');
const { verifyTrackingToken } = require('../services/orderTracking');
const { verifyToken, authorizeRoles } = require('./auth');

const paymentStaff = authorizeRoles('kasir', 'manajer', 'owner');
const deny = res => res.status(403).json({
  success: false,
  message: 'Akses pembayaran ditolak. Gunakan tab tempat Anda membuat pesanan atau hubungi kasir.',
});

// An explicit guest capability is independent of any staff login in this browser.
// Never fall back to staff privileges after receiving an invalid guest capability.
const requirePaymentAccess = async (req, res, next) => {
  res.set('Cache-Control', 'no-store');
  const rawId = req.params.orderId ?? req.body?.order_id;
  const id = typeof rawId === 'number' || (typeof rawId === 'string' && /^\d+$/.test(rawId))
    ? Number(rawId) : NaN;
  if (!Number.isSafeInteger(id) || id < 1 || id > 2147483647) {
    return res.status(400).json({ success: false, message: 'ID pesanan tidak valid.' });
  }

  const token = req.get('X-Order-Tracking-Token');
  if (token === undefined) {
    return verifyToken(req, res, () => paymentStaff(req, res, next));
  }

  let claims;
  try {
    claims = verifyTrackingToken(token);
    if (claims.sub !== String(id) || typeof claims.orderNumber !== 'string' || !claims.orderNumber
      || !Number.isFinite(claims.exp) || claims.exp * 1000 <= Date.now()) return deny(res);
  } catch {
    return deny(res);
  }

  try {
    const order = await Order.findOne({
      where: { id, order_number: claims.orderNumber }, attributes: ['id'],
    });
    if (!order) return deny(res);
    next();
  } catch (error) {
    next(error);
  }
};

module.exports = { requirePaymentAccess };
