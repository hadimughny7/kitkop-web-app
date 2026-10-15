const crypto = require('node:crypto');

// Use the exact received bytes, before express.json() parses or normalizes JSON.
const capturePaymentWebhookBody = (req, res, buffer) => {
  if (/^\/api\/payments\/callback\/?$/i.test(req.originalUrl?.split('?')[0] || '')) {
    req.rawBody = Buffer.from(buffer);
  }
};

const validPaymentWebhookSignature = (rawBody, signature, secret) => {
  if (!Buffer.isBuffer(rawBody) || typeof secret !== 'string' || !secret.trim() ||
      typeof signature !== 'string' || !/^[a-f\d]{64}$/i.test(signature)) return false;
  const expected = crypto.createHmac('sha256', secret).update(rawBody).digest();
  return crypto.timingSafeEqual(Buffer.from(signature, 'hex'), expected);
};

module.exports = { capturePaymentWebhookBody, validPaymentWebhookSignature };
