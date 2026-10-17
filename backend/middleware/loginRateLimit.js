const { createHash } = require('node:crypto');
const { isIP } = require('node:net');
const { rateLimit, ipKeyGenerator } = require('express-rate-limit');
const { Op } = require('sequelize');
const { User } = require('../models');

const LOGIN_WINDOW_MS = 15 * 60 * 1000;

function clientKey(req) {
  // An invalid forwarded address must not become an attacker-controlled key.
  const address = isIP(req.ip) ? req.ip : req.socket.remoteAddress;
  return ipKeyGenerator(address, 56);
}

async function accountKey(req) {
  const identifier = typeof req.body?.login === 'string'
    ? req.body.login.normalize('NFKC').trim().toLowerCase()
    : '';
  if (typeof req.body?.login === 'string' && req.body.login.length <= 100 && identifier) {
    req.loginUser = await User.findOne({
      where: { [Op.or]: [{ email: req.body.login }, { username: req.body.login }] },
    });
  }
  // Username and email aliases of an existing account share the same budget.
  // Keep supplied usernames/emails out of the store and response headers.
  const identity = req.loginUser ? `user:${req.loginUser.id}` : `login:${identifier}`;
  const digest = createHash('sha256').update(identity).digest('hex');
  return `${clientKey(req)}:${digest}`;
}

function rejectLogin(req, res) {
  const retryAfter = Math.max(1, Number(res.getHeader('Retry-After')) || 1);
  res.status(429).json({
    success: false,
    code: 'LOGIN_RATE_LIMITED',
    message: `Terlalu banyak percobaan login. Coba lagi dalam ${Math.ceil(retryAfter / 60)} menit.`,
    retry_after_seconds: retryAfter,
  });
}

// Each router owns its limiters; the defaults apply in every environment.
// Optional stores/window are for isolated tests or a future shared-store deployment.
function createLoginRateLimiters({ windowMs = LOGIN_WINDOW_MS, ipStore, accountStore } = {}) {
  const common = {
    windowMs,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    handler: rejectLogin,
    passOnStoreError: false,
  };
  return [
    (req, res, next) => { res.set('Cache-Control', 'no-store'); next(); },
    rateLimit({
      ...common,
      limit: 100,
      keyGenerator: clientKey,
      identifier: 'login-ip',
      requestPropertyName: 'loginIpRateLimit',
      ...(ipStore ? { store: ipStore } : {}),
    }),
    rateLimit({
      ...common,
      limit: 10,
      keyGenerator: accountKey,
      identifier: 'login-account-ip',
      requestPropertyName: 'loginAccountRateLimit',
      skipSuccessfulRequests: true,
      // Infrastructure errors and invalid input must not consume the password budget.
      requestWasSuccessful: (req, res) => res.statusCode !== 401 && res.statusCode !== 429,
      ...(accountStore ? { store: accountStore } : {}),
    }),
  ];
}

module.exports = { createLoginRateLimiters };
