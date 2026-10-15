const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { capturePaymentWebhookBody, validPaymentWebhookSignature } = require('../services/paymentWebhookSignature');
const secret = 'webhook-test-secret';
const body = Buffer.from('{\n  "status": "Success", "customer": "Pelanggan café"\n}\n');
const sign = (bytes) => crypto.createHmac('sha256', secret).update(bytes).digest('hex');

test('HMAC verifies exact raw JSON bytes including whitespace and UTF-8', () => {
  assert.equal(validPaymentWebhookSignature(body, sign(body), secret), true);
  assert.equal(validPaymentWebhookSignature(body, sign(body).toUpperCase(), secret), true);
  const normalized = Buffer.from(JSON.stringify(JSON.parse(body)));
  assert.equal(validPaymentWebhookSignature(normalized, sign(body), secret), false);
  assert.equal(validPaymentWebhookSignature(body, sign(body), 'wrong-secret'), false);
});

test('missing, malformed, truncated, and mismatched signatures fail closed', () => {
  for (const signature of [undefined, null, '', 'not-hex', 'a'.repeat(63), 'a'.repeat(65), 'z'.repeat(64), '0'.repeat(64), [sign(body)]]) {
    assert.equal(validPaymentWebhookSignature(body, signature, secret), false);
  }
  assert.equal(validPaymentWebhookSignature(body, sign(body), undefined), false);
  assert.equal(validPaymentWebhookSignature(body, sign(body), ''), false);
  assert.equal(validPaymentWebhookSignature(body, sign(body), '  '), false);
  assert.equal(validPaymentWebhookSignature(undefined, sign(body), secret), false);
});

test('JSON parser captures callback bytes, including query strings, without retaining other request bodies', () => {
  const req = { originalUrl: '/api/payments/callback?source=test' };
  capturePaymentWebhookBody(req, {}, body);
  assert.deepEqual(req.rawBody, body);
  assert.notEqual(req.rawBody, body);
  const trailingSlash = { originalUrl: '/api/payments/callback/' };
  capturePaymentWebhookBody(trailingSlash, {}, body);
  assert.deepEqual(trailingSlash.rawBody, body);
  const other = { originalUrl: '/api/orders' };
  capturePaymentWebhookBody(other, {}, body);
  assert.equal(other.rawBody, undefined);
});

test('callback refuses to process payments when webhook secret is not configured', () => {
  const { execFileSync } = require('node:child_process');
  const controllerPath = require.resolve('../controllers/paymentController');
  const script = `const { paymentCallback } = require(${JSON.stringify(controllerPath)});
    const res = { status(code) { this.code = code; return this; }, json(body) { console.log(JSON.stringify({ code: this.code, body })); } };
    paymentCallback({ rawBody: Buffer.from('{}'), headers: {} }, res);`;
  const output = execFileSync(process.execPath, ['-e', script], { env: { ...process.env, KUYZPAY_SECRET: '' }, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  const response = JSON.parse(output.trim());
  assert.equal(response.code, 503);
  assert.equal(response.body.status, false);
});
