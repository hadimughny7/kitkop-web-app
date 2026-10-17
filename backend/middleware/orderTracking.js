const { verifyTrackingToken } = require('../services/orderTracking');

const requireOrderTracking = (req, res, next) => {
  res.set('Cache-Control', 'no-store');
  try {
    const claims = verifyTrackingToken(req.get('X-Order-Tracking-Token'));
    if (claims.orderNumber !== req.params.orderNumber || !/^\d+$/.test(claims.sub)
      || !Number.isSafeInteger(Number(claims.sub)) || Number(claims.sub) < 1
      || !Number.isFinite(claims.exp) || claims.exp * 1000 <= Date.now()) throw new Error('Invalid tracking scope');
    req.trackingOrderId = Number(claims.sub);
    next();
  } catch {
    res.status(403).json({ success: false, message: 'Akses pelacakan pesanan ditolak. Gunakan tab tempat Anda membuat pesanan atau hubungi kasir.' });
  }
};

module.exports = { requireOrderTracking };
