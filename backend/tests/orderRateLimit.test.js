const test = require('node:test');
const assert = require('node:assert/strict');
const { setTimeout: pause } = require('node:timers/promises');
const express = require('express');
const jwt = require('jsonwebtoken');
const { MemoryStore } = require('express-rate-limit');
const { createOrderRateLimiters } = require('../middleware/orderRateLimit');

test('order limits separate guest sessions, shared networks and verified staff identities', async t => {
  process.env.JWT_SECRET = 'order-limit-test-secret';
  const servers = [], stores = [];
  async function serve(options = {}, trust = false) {
    const app = express();
    app.set('trust proxy', trust);
    app.use(express.json());
    const ipStore = new MemoryStore(), sessionStore = new MemoryStore();
    stores.push(ipStore, sessionStore);
    let writes = 0;
    app.post('/orders', (req, res, next) => {
      // This fixture supplies identities at the boundary after authentication.
      if (req.get('X-Test-Staff')) req.user = { id: Number(req.get('X-Test-Staff')) };
      next();
    }, ...createOrderRateLimiters({ ipStore, sessionStore, ...options }), (req, res) => {
      if (req.body.invalid) return res.status(400).json({ success: false });
      writes++;
      res.status(201).json({ success: true });
    });
    app.use((error, req, res, next) => res.status(500).json({ success: false }));
    const server = app.listen(0, '127.0.0.1');
    servers.push(server);
    await new Promise(resolve => server.once('listening', resolve));
    return {
      get writes() { return writes; },
      ipStore,
      async post(token, headers = {}, body = {}) {
        const response = await fetch(`http://127.0.0.1:${server.address().port}/orders`, {
          method: 'POST', headers: { 'Content-Type': 'application/json', ...(token ? { 'X-Order-Session': token } : {}), ...headers }, body: JSON.stringify(body),
        });
        return { status: response.status, data: await response.json(), headers: response.headers, token: response.headers.get('x-order-session') };
      },
    };
  }
  try {
    await t.test('sixth guest attempt is rejected before the order handler with clear retry time', async () => {
      const app = await serve();
      const first = await app.post();
      assert.equal(first.status, 201);
      const claims = jwt.verify(first.token, process.env.JWT_SECRET, { audience: 'kitkop-order-session' });
      assert.ok(claims.jti && claims.exp);
      for (let i = 0; i < 4; i++) assert.equal((await app.post(first.token)).status, 201);
      const blocked = await app.post(first.token);
      assert.equal(blocked.status, 429);
      assert.equal(blocked.data.code, 'ORDER_RATE_LIMITED');
      assert.ok(blocked.data.retry_after_seconds > 0 && blocked.data.retry_after_seconds <= 60);
      assert.equal(Number(blocked.headers.get('retry-after')), blocked.data.retry_after_seconds);
      assert.equal(blocked.headers.get('cache-control'), 'no-store');
      assert.equal(blocked.token, first.token);
      assert.equal(app.writes, 5);
      assert.equal((await app.post()).status, 201);
    });
    await t.test('100 different customers can each order twice on the same Wi-Fi', async () => {
      const app = await serve();
      for (let i = 0; i < 100; i++) {
        const first = await app.post();
        assert.equal(first.status, 201);
        assert.equal((await app.post(first.token)).status, 201);
      }
      assert.equal(app.writes, 200);
    });
    await t.test('discarded, expired, tampered and unrelated tokens cannot bypass the shared IP ceiling', async () => {
      const app = await serve({ ipLimit: 4 });
      const wrongAudience = jwt.sign({}, process.env.JWT_SECRET, { audience: 'other', jwtid: 'a'.repeat(36), expiresIn: '1h' });
      const expired = jwt.sign({}, process.env.JWT_SECRET, { audience: 'kitkop-order-session', jwtid: 'b'.repeat(36), expiresIn: -1 });
      for (const token of [null, 'forged-session-id', wrongAudience, expired]) {
        const result = await app.post(token);
        assert.equal(result.status, 201);
        assert.ok(jwt.verify(result.token, process.env.JWT_SECRET, { audience: 'kitkop-order-session' }).jti);
      }
      assert.equal((await app.post('another-forged-session')).status, 429);
      assert.equal(app.writes, 4);
    });
    await t.test('staff use an account budget independent of guest IP exhaustion and session rotation', async () => {
      const app = await serve({ ipLimit: 2 });
      await app.post(); await app.post();
      assert.equal((await app.post()).status, 429);
      for (let i = 0; i < 60; i++) assert.equal((await app.post(`rotated-${i}`, { 'X-Test-Staff': '1' })).status, 201);
      assert.equal((await app.post(null, { 'X-Test-Staff': '1' })).status, 429);
      assert.equal((await app.post(null, { 'X-Test-Staff': '2' })).status, 201);
    });
    await t.test('IPv6 addresses in one /56 share a ceiling while other networks remain separate', async () => {
      const app = await serve({ ipLimit: 2 }, require('../config/trustedProxies')('127.0.0.1'));
      assert.equal((await app.post(null, { 'X-Forwarded-For': '2001:db8:abcd:1000::1' })).status, 201);
      assert.equal((await app.post(null, { 'X-Forwarded-For': '2001:db8:abcd:1001::2' })).status, 201);
      assert.equal((await app.post(null, { 'X-Forwarded-For': '2001:db8:abcd:1002::3' })).status, 429);
      assert.equal((await app.post(null, { 'X-Forwarded-For': '2001:db8:ffff::1' })).status, 201);
    });
    await t.test('invalid order attempts still consume the session budget', async () => {
      const app = await serve({ guestLimit: 2 });
      const first = await app.post(null, {}, { invalid: true });
      assert.equal(first.status, 400);
      assert.equal((await app.post(first.token, {}, { invalid: true })).status, 400);
      assert.equal((await app.post(first.token)).status, 429);
      assert.equal(app.writes, 0);
    });
    await t.test('blocked sessions can order again after the window expires', async () => {
      const app = await serve({ guestLimit: 1, windowMs: 1000 });
      const first = await app.post();
      assert.equal((await app.post(first.token)).status, 429);
      await pause(1100);
      assert.equal((await app.post(first.token)).status, 201);
    });
    await t.test('rate store failure and missing signing configuration do not reach order writes', async () => {
      const app = await serve();
      app.ipStore.increment = async () => { throw new Error('Test store unavailable'); };
      assert.equal((await app.post()).status, 500);
      assert.equal(app.writes, 0);
      const unsigned = await serve();
      delete process.env.JWT_SECRET;
      try { assert.equal((await unsigned.post()).status, 503); assert.equal(unsigned.writes, 0); }
      finally { process.env.JWT_SECRET = 'order-limit-test-secret'; }
    });
  } finally {
    await Promise.all(servers.map(server => new Promise(resolve => server.close(resolve))));
    stores.forEach(store => store.shutdown());
  }
});
