const { randomUUID } = require('node:crypto');
const { isIP } = require('node:net');
const jwt = require('jsonwebtoken');
const { rateLimit, ipKeyGenerator } = require('express-rate-limit');

const SESSION_HEADER = 'X-Order-Session';
const SESSION_AUDIENCE = 'kitkop-order-session';

function guestSession(req, res, next) {
  if (req.user) return next();
  const secret = process.env.JWT_SECRET;
  if (!secret?.trim()) {
    return res.status(503).json({ success: false, message: 'Pemesanan belum dapat diproses. Silakan hubungi kasir.' });
  }
  let token = req.get(SESSION_HEADER);
  try {
    if (typeof token !== 'string' || token.length > 2048) throw new Error('Invalid session');
    const claims = jwt.verify(token, secret, { algorithms: ['HS256'], audience: SESSION_AUDIENCE });
    if (typeof claims.jti !== 'string' || !/^[a-f\d-]{36}$/i.test(claims.jti) || !Number.isFinite(claims.exp)) throw new Error('Invalid session');
    req.orderSessionId = claims.jti;
  } catch {
    req.orderSessionId = randomUUID();
    token = jwt.sign({}, secret, { algorithm: 'HS256', audience: SESSION_AUDIENCE, jwtid: req.orderSessionId, expiresIn: '1d' });
  }
  res.set(SESSION_HEADER, token);
  next();
}

function rejectOrder(req, res) {
  const seconds = Math.max(1, Number(res.getHeader('Retry-After')) || 1);
  res.status(429).json({
    success: false,
    code: 'ORDER_RATE_LIMITED',
    message: `Terlalu sering mengirim pesanan. Coba lagi dalam ${seconds} detik.`,
    retry_after_seconds: seconds,
  });
}

function createOrderRateLimiters({ windowMs = 60000, guestLimit = 5, ipLimit = 300, staffLimit = 60, ipStore, sessionStore } = {}) {
  const common = { windowMs, standardHeaders: 'draft-8', legacyHeaders: false, handler: rejectOrder, passOnStoreError: false };
  return [
    (req, res, next) => { res.set('Cache-Control', 'no-store'); next(); },
    rateLimit({
      ...common,
      limit: ipLimit,
      skip: req => Boolean(req.user),
      keyGenerator: req => ipKeyGenerator(isIP(req.ip) ? req.ip : req.socket.remoteAddress, 56),
      identifier: 'order-guest-ip',
      requestPropertyName: 'orderIpRateLimit',
      ...(ipStore ? { store: ipStore } : {}),
    }),
    guestSession,
    rateLimit({
      ...common,
      limit: req => req.user ? staffLimit : guestLimit,
      keyGenerator: req => req.user ? `staff:${req.user.id}` : `guest:${req.orderSessionId}`,
      identifier: 'order-session',
      requestPropertyName: 'orderSessionRateLimit',
      ...(sessionStore ? { store: sessionStore } : {}),
    }),
  ];
}

module.exports = { createOrderRateLimiters };
