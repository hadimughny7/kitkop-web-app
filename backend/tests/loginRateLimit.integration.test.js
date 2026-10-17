const test = require('node:test');
const assert = require('node:assert/strict');
const trustedProxies = require('../config/trustedProxies');

test('proxy trust accepts explicit addresses and rejects unsafe configuration', () => {
  assert.equal(trustedProxies(''), false);
  for (const value of ['true', '1', '*', '0.0.0.0/0', '::/0', '127.0.0.1,', '127.1', '10.0.0.1/33', '::1/129', '127.0.0.1/8/9']) {
    assert.throws(() => trustedProxies(value), /TRUSTED_PROXY_CIDRS/);
  }
  const trust = trustedProxies('127.0.0.1, 10.20.0.0/16, 2001:db8::/64');
  for (const address of ['127.0.0.1', '::ffff:127.0.0.1', '10.20.3.4', '2001:db8::1234']) assert.equal(trust(address), true);
  for (const address of ['127.0.0.2', '10.21.3.4', '2001:db8:0:1::1', 'garbage']) assert.equal(trust(address), false);
});

test('login limits protect real HTTP authentication without global account lockouts', { skip: process.env.KITKOP_OPTIONS_DB_TEST !== 'true' }, async t => {
  require('dotenv').config();
  assert.ok(['localhost', '127.0.0.1', '::1'].includes(process.env.DB_HOST), 'Use a local test database only');
  process.env.JWT_SECRET = 'isolated-login-limits-test';
  const mysql = require('mysql2/promise');
  const database = `kitkop_login_limits_test_${process.pid}`;
  const admin = await mysql.createConnection({ host: process.env.DB_HOST, port: process.env.DB_PORT || 3306, user: process.env.DB_USER, password: process.env.DB_PASSWORD });
  await admin.query(`CREATE DATABASE \`${database}\``);
  process.env.DB_NAME = database;
  const { sequelize } = require('../config/database');
  const { User } = require('../models');
  const { createLoginRateLimiters } = require('../middleware/loginRateLimit');
  const { login, getMe } = require('../controllers/authController');
  const { verifyToken } = require('../middleware/auth');
  const { MemoryStore } = require('express-rate-limit');
  const servers = [], stores = [];
  const password = 'valid-test-password';

  async function serve({ realRoute = false, trust = false, ipStore = new MemoryStore(), accountStore = new MemoryStore() } = {}) {
    const app = require('express')();
    app.set('trust proxy', trust);
    app.use(require('express').json());
    if (realRoute) app.use('/api/auth', require('../routes/authRoutes'));
    else {
      stores.push(ipStore, accountStore);
      app.post('/api/auth/login', ...createLoginRateLimiters({ ipStore, accountStore }), login);
      app.get('/api/auth/me', verifyToken, getMe);
    }
    app.use((err, req, res, next) => res.status(500).json({ success: false, message: 'Test server error' }));
    const server = app.listen(0, '127.0.0.1');
    servers.push(server);
    await new Promise(resolve => server.once('listening', resolve));
    const base = `http://127.0.0.1:${server.address().port}`;
    return {
      base,
      async attempt(identifier = 'cashier', secret = 'wrong-password', headers = {}) {
        const response = await fetch(`${base}/api/auth/login`, {
          method: 'POST', headers: { 'Content-Type': 'application/json', ...headers },
          body: JSON.stringify({ login: identifier, password: secret }),
        });
        const data = await response.json();
        return { status: response.status, headers: response.headers, data };
      },
    };
  }

  async function exhaust(attempt, identifier = 'cashier', headers = {}) {
    for (let i = 0; i < 10; i++) assert.equal((await attempt(identifier, 'wrong-password', headers)).status, 401);
  }

  try {
    await sequelize.sync();
    const hash = await require('bcryptjs').hash(password, 4);
    for (const username of ['cashier', 'other']) await User.create({ name: username, username, email: `${username}@example.test`, password_hash: hash, role: 'kasir' });

    await t.test('actual auth route rejects the eleventh failure, reports retry time, and leaves other accounts/sessions usable', async () => {
      const { base, attempt } = await serve({ realRoute: true });
      const session = await attempt('cashier', password);
      assert.equal(session.status, 200);
      await exhaust(attempt);
      const blocked = await attempt('cashier', password);
      assert.equal(blocked.status, 429);
      assert.equal(blocked.data.code, 'LOGIN_RATE_LIMITED');
      const retry = Number(blocked.headers.get('retry-after'));
      assert.ok(retry > 0 && retry <= 900);
      assert.equal(blocked.data.retry_after_seconds, retry);
      assert.equal(blocked.headers.get('cache-control'), 'no-store');
      assert.ok(blocked.headers.get('ratelimit-policy'));
      assert.equal(blocked.data.data?.token, undefined);
      assert.equal((await attempt('other', password)).status, 200);
      const me = await fetch(`${base}/api/auth/me`, { headers: { Authorization: `Bearer ${session.data.data.token}` } });
      assert.equal(me.status, 200);
    });

    await t.test('username, email and case variants share one account/IP budget', async () => {
      const { attempt } = await serve();
      for (let i = 0; i < 10; i++) {
        const identifier = i % 2 ? 'CASHIER@EXAMPLE.TEST' : 'cashier';
        assert.equal((await attempt(identifier)).status, 401);
      }
      assert.equal((await attempt('cashier@example.test', password)).status, 429);
    });

    await t.test('unknown identities also have limits, including normalized variants', async () => {
      const { attempt } = await serve();
      for (let i = 0; i < 10; i++) assert.equal((await attempt(i % 2 ? ' MISSING ' : 'missing')).status, 401);
      assert.equal((await attempt('ＭＩＳＳＩＮＧ')).status, 429);
    });

    await t.test('failed attempts from one IP cannot globally lock a victim account', async () => {
      const { attempt } = await serve({ trust: trustedProxies('127.0.0.1') });
      await exhaust(attempt, 'cashier', { 'X-Forwarded-For': '198.51.100.10' });
      assert.equal((await attempt('cashier', password, { 'X-Forwarded-For': '198.51.100.10' })).status, 429);
      assert.equal((await attempt('cashier', password, { 'X-Forwarded-For': '198.51.100.11' })).status, 200);
    });

    await t.test('untrusted forwarded headers cannot rotate a direct client IP', async () => {
      const { attempt } = await serve();
      for (let i = 0; i < 10; i++) {
        assert.equal((await attempt('cashier', 'wrong', { 'X-Forwarded-For': `198.51.100.${i + 1}`, Forwarded: `for=203.0.113.${i + 1}` })).status, 401);
      }
      assert.equal((await attempt('cashier', password, { 'X-Forwarded-For': '203.0.113.99' })).status, 429);
    });

    await t.test('trusted proxy chains stop at the nearest untrusted address', async () => {
      const { attempt } = await serve({ trust: trustedProxies('127.0.0.1') });
      for (let i = 0; i < 10; i++) {
        assert.equal((await attempt('cashier', 'wrong', { 'X-Forwarded-For': `203.0.113.${i + 1}, 198.51.100.10` })).status, 401);
      }
      assert.equal((await attempt('cashier', password, { 'X-Forwarded-For': '203.0.113.99, 198.51.100.10' })).status, 429);
    });

    await t.test('IPv6 address rotation within the same /56 does not bypass limits', async () => {
      const { attempt } = await serve({ trust: trustedProxies('127.0.0.1') });
      for (let i = 0; i < 10; i++) assert.equal((await attempt('cashier', 'wrong', { 'X-Forwarded-For': `2001:db8:1234:5600::${i + 1}` })).status, 401);
      assert.equal((await attempt('cashier', password, { 'X-Forwarded-For': '2001:db8:1234:56ff::99' })).status, 429);
      assert.equal((await attempt('cashier', password, { 'X-Forwarded-For': '2001:db8:1234:5700::1' })).status, 200);
    });

    await t.test('IP budget blocks username spraying and is not reset by successful logins', async () => {
      const { attempt } = await serve();
      for (let i = 0; i < 99; i++) assert.equal((await attempt(`missing-${i}`)).status, 401);
      assert.equal((await attempt('cashier', password)).status, 200);
      assert.equal((await attempt('other', password)).status, 429);
    });

    await t.test('successful logins do not consume the account failure budget', async () => {
      const { attempt } = await serve();
      for (let i = 0; i < 12; i++) assert.equal((await attempt('cashier', password)).status, 200);
      await exhaust(attempt);
      assert.equal((await attempt()).status, 429);
    });

    await t.test('concurrent requests cannot overrun the account budget', async () => {
      const { attempt } = await serve();
      const responses = await Promise.all(Array.from({ length: 20 }, () => attempt()));
      assert.equal(responses.filter(response => response.status === 401).length, 10);
      assert.equal(responses.filter(response => response.status === 429).length, 10);
    });

    await t.test('blocked requests do not extend the window and login recovers after expiry', async ctx => {
      let now = Date.now();
      ctx.mock.method(Date, 'now', () => now);
      const { attempt } = await serve();
      await exhaust(attempt);
      assert.equal((await attempt()).status, 429);
      now += 450000;
      const stillBlocked = await attempt();
      assert.equal(stillBlocked.status, 429);
      assert.equal(stillBlocked.data.retry_after_seconds, 450);
      now += 450001;
      assert.equal((await attempt('cashier', password)).status, 200);
    });

    await t.test('invalid credential types return 400 instead of reaching bcrypt or issuing a token', async () => {
      const { attempt } = await serve();
      for (const [identifier, secret] of [[{}, password], [[], password], ['cashier', {}], ['cashier', 123], ['cashier', ''], ['x'.repeat(101), password], ['cashier', 'x'.repeat(1025)]]) {
        assert.equal((await attempt(identifier, secret)).status, 400);
      }
      assert.equal((await attempt('cashier', password)).status, 200);
    });

    await t.test('store errors fail closed instead of bypassing protection', async () => {
      for (const kind of ['ipStore', 'accountStore']) {
        const broken = new MemoryStore();
        broken.increment = async () => { throw new Error('Injected store failure'); };
        const { attempt } = await serve({ [kind]: broken });
        const response = await attempt('cashier', password);
        assert.equal(response.status, 500);
        assert.equal(response.data.data?.token, undefined);
      }
    });
  } finally {
    for (const server of servers) await new Promise(resolve => server.close(resolve));
    for (const store of stores) store.shutdown();
    await sequelize.close();
    assert.match(database, /^kitkop_login_limits_test_\d+$/);
    await admin.query(`DROP DATABASE \`${database}\``);
    await admin.end();
  }
});
