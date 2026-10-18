const test = require('node:test');
const assert = require('node:assert/strict');

test('QRIS HTTP access requires the matching guest capability or an authorized live staff session', { skip: process.env.KITKOP_OPTIONS_DB_TEST !== 'true' }, async t => {
  require('dotenv').config();
  assert.ok(['localhost', '127.0.0.1', '::1'].includes(process.env.DB_HOST), 'Use a local test database only');
  process.env.JWT_SECRET = 'payment-access-test-only';
  process.env.KUYZPAY_SECRET = 'payment-access-gateway-test';
  process.env.KUYZPAY_MERCHANT_ID = 'fixture-merchant';
  const database = `kitkop_payment_access_test_${process.pid}`;
  const admin = await require('mysql2/promise').createConnection({
    host: process.env.DB_HOST, port: process.env.DB_PORT || 3306,
    user: process.env.DB_USER, password: process.env.DB_PASSWORD,
  });
  await admin.query(`CREATE DATABASE \`${database}\``);
  process.env.DB_NAME = database;
  const { sequelize } = require('../config/database');
  const { User, MenuCategory, Menu, Order, Transaction, QrisAttempt } = require('../models');
  const jwt = require('jsonwebtoken');
  let server, gateway;
  let calls = 0, failGateway = false;
  try {
    const express = require('express');
    const provider = express(); provider.use(express.json());
    provider.post('/order', (req, res) => {
      calls++;
      if (failGateway) return res.status(503).json({ status: 0 });
      res.json({ status: 1, data: {
        ref_id: req.body.ref_id, trx_id: `GW-${req.body.ref_id}`, status: 'Unpaid',
        total_bayar: req.body.amount, qr_link: 'https://example.test/qr.png',
        expired_ts: Math.floor(Date.now() / 1000) + 300,
      } });
    });
    gateway = provider.listen(0, '127.0.0.1');
    await new Promise(resolve => gateway.once('listening', resolve));
    process.env.KUYZPAY_BASE_URL = `http://127.0.0.1:${gateway.address().port}`;
    await sequelize.sync();
    const users = {};
    for (const role of ['owner', 'manajer', 'kasir', 'kitchen', 'barista']) {
      users[role] = await User.create({ name: role, username: role, email: `${role}@example.test`, password_hash: 'unused', role });
    }
    const category = await MenuCategory.create({ name: 'Kopi' });
    const menu = await Menu.create({ name: 'Fixture coffee', category_id: category.id, price: 10000 });
    const app = express(); app.use(express.json());
    app.use('/api/orders', require('../routes/orderRoutes'));
    app.use('/api/payments', require('../routes/paymentRoutes'));
    app.use((error, req, res, next) => res.status(error.statusCode || 500).json({ message: error.message }));
    server = app.listen(0, '127.0.0.1');
    await new Promise(resolve => server.once('listening', resolve));
    const base = `http://127.0.0.1:${server.address().port}/api`;
    const call = async (path, body, headers = {}, method = 'POST') => {
      const response = await fetch(base + path, {
        method, headers: { 'Content-Type': 'application/json', ...headers },
        body: method === 'GET' ? undefined : JSON.stringify(body),
      });
      return { status: response.status, cache: response.headers.get('cache-control'), body: await response.json() };
    };
    const createOrder = async () => {
      const response = await call('/orders', { customer_name: 'Guest fixture', items: [{ menu_id: menu.id, qty: 1 }] });
      assert.equal(response.status, 201);
      return response.body.data;
    };
    const guest = order => ({ 'X-Order-Tracking-Token': order.tracking_token });
    const staff = (user, version = user.session_version) => ({
      Authorization: `Bearer ${jwt.sign({ id: user.id, role: 'owner', sessionVersion: version }, process.env.JWT_SECRET, { expiresIn: '1h' })}`,
    });
    const create = (order, headers) => call('/payments/create-qris', { order_id: order.id }, headers);
    const status = (order, headers) => call(`/payments/${order.id}/status`, undefined, headers, 'GET');
    const snapshot = async () => ({ calls, transactions: await Transaction.count(), attempts: await QrisAttempt.count() });
    const a = await createOrder(), b = await createOrder();

    await t.test('anonymous requests and invalid or mixed-scope capabilities disclose nothing and cause no gateway/DB changes', async () => {
      const signed = (claims = {}, options = {}) => jwt.sign({ orderNumber: a.order_number, ...claims }, process.env.JWT_SECRET,
        { subject: String(a.id), audience: 'kitkop-order-tracking', expiresIn: '1h', ...options });
      const noExpiry = jwt.sign({ sub: String(a.id), orderNumber: a.order_number, aud: 'kitkop-order-tracking' }, process.env.JWT_SECRET);
      const tokens = ['', 'broken', b.tracking_token, signed({}, { expiresIn: -1 }), noExpiry,
        signed({}, { audience: 'staff' }), signed({}, { algorithm: 'HS512' }),
        signed({ orderNumber: b.order_number }), signed({}, { subject: String(b.id) }),
        jwt.sign({ sub: String(a.id), orderNumber: a.order_number, aud: 'kitkop-order-tracking' }, 'wrong-secret')];
      const before = await snapshot();
      for (const token of tokens) {
        for (const result of [await create(a, { 'X-Order-Tracking-Token': token }), await status(a, { 'X-Order-Tracking-Token': token })]) {
          assert.equal(result.status, 403); assert.equal(result.body.data, undefined); assert.equal(result.cache, 'no-store');
        }
      }
      for (const result of [await create(a), await status(a), await status({ id: 2147483647 })]) {
        assert.equal(result.status, 401); assert.equal(result.body.data, undefined); assert.equal(result.cache, 'no-store');
      }
      assert.deepEqual(await snapshot(), before);
    });

    await t.test('matching guests create/reuse invoices, retry failed invoices, and poll only their own order', async () => {
      const before = calls;
      assert.equal((await status(a, guest(a))).status, 404);
      const invoice = await create(a, guest(a));
      assert.equal(invoice.status, 200); assert.equal(invoice.cache, 'no-store');
      assert.equal(invoice.body.data.qris_state, 'ready'); assert.equal(calls, before + 1);
      for (let index = 0; index < 3; index++) {
        const poll = await status(a, guest(a));
        assert.equal(poll.status, 200); assert.equal(poll.body.data.ref_id, invoice.body.data.ref_id);
      }
      assert.equal((await create(a, guest(a))).body.data.ref_id, invoice.body.data.ref_id);
      assert.equal(calls, before + 1);
      assert.equal((await status(b, guest(a))).status, 403);
      assert.equal((await create(b, guest(a))).status, 403);
      failGateway = true;
      assert.equal((await create(b, guest(b))).status, 502);
      const failed = await status(b, guest(b));
      assert.equal(failed.body.data.can_retry, true);
      failGateway = false;
      const retried = await create(b, guest(b));
      assert.equal(retried.status, 200); assert.equal(retried.body.data.qris_state, 'ready');
      assert.notEqual(retried.body.data.ref_id, invoice.body.data.ref_id);
      assert.equal((await status(b, guest(b))).body.data.ref_id, retried.body.data.ref_id);
      assert.equal((await status(a, guest(b))).status, 403);
    });

    await t.test('cashier, manager and owner use live staff permissions; kitchen/barista claims cannot escalate', async () => {
      for (const role of ['kasir', 'manajer', 'owner']) {
        const order = await createOrder();
        assert.equal((await create(order, staff(users[role]))).status, 200);
        assert.equal((await status(order, staff(users[role]))).status, 200);
      }
      const before = await snapshot();
      for (const role of ['kitchen', 'barista']) {
        assert.equal((await create(a, staff(users[role]))).status, 403);
        assert.equal((await status(a, staff(users[role]))).status, 403);
      }
      assert.equal((await status(a, { Authorization: `Bearer ${a.tracking_token}` })).status, 401);
      assert.deepEqual(await snapshot(), before);
    });

    await t.test('revoked, inactive, deleted and expired staff sessions are rejected before gateway access', async () => {
      const cashier = users.kasir;
      const old = staff(cashier);
      await cashier.update({ session_version: cashier.session_version + 1 });
      assert.equal((await create(a, old)).status, 401); assert.equal((await status(a, old)).status, 401);
      const fresh = staff(cashier);
      assert.equal((await status(a, fresh)).status, 200);
      await cashier.update({ is_active: false });
      assert.equal((await create(a, fresh)).status, 401); assert.equal((await status(a, fresh)).status, 401);
      await cashier.update({ is_active: true });
      const expired = { Authorization: `Bearer ${jwt.sign({ id: cashier.id, sessionVersion: cashier.session_version }, process.env.JWT_SECRET, { expiresIn: -1 })}` };
      assert.equal((await status(a, expired)).status, 401);
      const deleted = await User.create({ name: 'Deleted', username: 'deleted', email: 'deleted@example.test', password_hash: 'unused', role: 'kasir' });
      const deletedHeaders = staff(deleted); await deleted.destroy();
      assert.equal((await create(a, deletedHeaders)).status, 401);
    });

    await t.test('an explicit guest token never falls back to staff authority; guests remain independent of staff sessions', async () => {
      assert.equal((await create(b, { ...staff(users.owner), ...guest(a) })).status, 403);
      assert.equal((await status(b, { ...staff(users.owner), 'X-Order-Tracking-Token': '' })).status, 403);
      assert.equal((await status(a, { ...staff(users.kitchen), ...guest(a) })).status, 200);
      assert.equal((await status(a, { Authorization: 'Bearer expired-or-invalid', ...guest(a) })).status, 200);
      // A guest capability cannot confirm a cash payment, regardless of its scope.
      assert.equal((await call(`/payments/${a.id}/cash`, {}, guest(a))).status, 401);
      assert.equal((await Order.findByPk(a.id)).status, 'pending');
    });

    await t.test('malformed IDs cannot be coerced into another order', async () => {
      const before = await snapshot();
      for (const id of [null, true, [], [a.id], {}, '', ' ', '1abc', '1e0', '0x1', -1, 0, 1.1, 2147483648]) {
        const result = await call('/payments/create-qris', { order_id: id }, guest(a));
        assert.equal(result.status, 400, JSON.stringify(id));
      }
      for (const id of ['0', '-1', '1abc', '2147483648']) assert.equal((await status({ id }, guest(a))).status, 400);
      assert.deepEqual(await snapshot(), before);
    });
  } finally {
    if (server) await new Promise(resolve => server.close(resolve));
    if (gateway) await new Promise(resolve => gateway.close(resolve));
    await sequelize.close();
    assert.match(database, /^kitkop_payment_access_test_\d+$/);
    await admin.query(`DROP DATABASE \`${database}\``); await admin.end();
  }
});
