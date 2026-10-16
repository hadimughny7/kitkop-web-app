const test = require('node:test');
const assert = require('node:assert/strict');

test('QRIS retries replace mock/invalid invoices and preserve real gateway references safely', { skip: process.env.KITKOP_OPTIONS_DB_TEST !== 'true' }, async t => {
  require('dotenv').config();
  process.env.KUYZPAY_SECRET = 'qris-retry-webhook'; process.env.KUYZPAY_MERCHANT_ID = 'test-merchant'; process.env.JWT_SECRET = 'qris-retry-jwt';
  const mysql = require('mysql2/promise'); const database = `kitkop_qris_test_${process.pid}`;
  const admin = await mysql.createConnection({ host: process.env.DB_HOST, port: process.env.DB_PORT || 3306, user: process.env.DB_USER, password: process.env.DB_PASSWORD });
  await admin.query(`CREATE DATABASE \`${database}\``); process.env.DB_NAME = database;
  let gateway, server; const sockets = new Set();
  const { sequelize } = require('../config/database');
  const { User, MenuCategory, Menu, RawMaterial, Order, OrderItem, Transaction, QrisAttempt, StockLog } = require('../models');
  try {
    const express = require('express'); const gatewayApp = express(); gatewayApp.use(express.json());
    const calls = []; let responder;
    gatewayApp.post('/order', async (req, res) => { calls.push(req.body); try { await responder(req, res); } catch (error) { res.status(500).json({ message: error.message }); } });
    gateway = gatewayApp.listen(0, '127.0.0.1'); await new Promise(resolve => gateway.once('listening', resolve));
    gateway.on('connection', socket => { sockets.add(socket); socket.on('close', () => sockets.delete(socket)); });
    process.env.KUYZPAY_BASE_URL = `http://127.0.0.1:${gateway.address().port}`;
    const invoice = (req, overrides = {}) => ({ status: 1, data: { ref_id: req.body.ref_id, trx_id: `KP-${req.body.ref_id}`, qr_link: 'https://example.test/qr.png', qr_string: '0002010102125204000053033606304ABCD',
      pay_url: 'https://example.test/pay', total_bayar: req.body.amount + 50, expired_ts: Math.floor(Date.now() / 1000) + 300, status: 'Unpaid', ...overrides } });
    const success = (req, res) => res.json(invoice(req)); responder = success;
    await sequelize.sync(); const migrate = require('../migrations/add-qris-attempts'); await migrate(); await migrate();
    const user = await User.create({ name: 'Owner', username: 'owner', email: 'owner@example.test', role: 'owner', password_hash: 'test' });
    const cat = await MenuCategory.create({ name: 'Test' }); const menu = await Menu.create({ name: 'Kopi', price: 10000, category_id: cat.id });
    const material = await RawMaterial.create({ name: 'Bahan', stock: 1000, unit: 'gram' });
    const app = express(); const { capturePaymentWebhookBody } = require('../services/paymentWebhookSignature'); app.use(express.json({ verify: capturePaymentWebhookBody }));
    const events = []; app.set('io', { to: () => ({ emit: (...args) => events.push(args) }) });
    app.use('/api/payments', require('../routes/paymentRoutes')); app.use('/api/orders', require('../routes/orderRoutes'));
    app.use((err, req, res, next) => res.status(err.statusCode || 500).json({ success: false, message: err.message }));
    server = app.listen(0, '127.0.0.1'); await new Promise(resolve => server.once('listening', resolve));
    const base = `http://127.0.0.1:${server.address().port}/api`;
    const call = async (path, body, expected = 200, method = 'POST') => {
      const raw = JSON.stringify(body); const headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${require('jsonwebtoken').sign({ id: user.id }, process.env.JWT_SECRET)}` };
      if (path === '/payments/callback') headers['x-kuyzpay-signature'] = require('node:crypto').createHmac('sha256', process.env.KUYZPAY_SECRET).update(raw).digest('hex');
      const response = await fetch(base + path, { method, headers, body: method === 'GET' ? undefined : raw }); const result = await response.json();
      assert.equal(response.status, expected, JSON.stringify(result)); return result;
    };
    let serial = 0;
    const fixture = async () => {
      const order = await Order.create({ order_number: `QRIS-${++serial}`, total: 10000 });
      await OrderItem.create({ order_id: order.id, menu_id: menu.id, qty: 1, price: 10000, stock_usage: [{ raw_material_id: material.id, quantity_used: 1 }] }); return order;
    };
    const create = (order, expected) => call('/payments/create-qris', { order_id: order.id }, expected);
    const state = async order => (await call(`/payments/${order.id}/status`, undefined, 200, 'GET')).data;
    const callback = (ref, event = 'payment.success', status = 'Success') => call('/payments/callback', { ref_id: ref, event, status });
    const legacy = (order, patch = {}) => Transaction.create({ order_id: order.id, ref_id: `KTK-MOCK-${order.id}`, amount: order.total, status: 'pending', payment_method: 'QRIS', qris_content: `mock-qris-${order.id}`, ...patch });

    await t.test('legacy mock is never returned as usable and retry creates a real fresh reference', async () => {
      const order = await fixture(); const old = await legacy(order); const before = calls.length;
      const initial = await state(order); assert.equal(initial.source, 'legacy-mock'); assert.equal(initial.qr_url, null); assert.equal(initial.can_retry, true);
      const created = (await create(order)).data;
      assert.equal(calls.length, before + 1); assert.notEqual(created.ref_id, old.ref_id); assert.equal(created.qris_state, 'ready'); assert.equal(created.source, 'gateway');
      assert.equal(created.amount, 10050); assert.equal(created.qr_url, 'https://example.test/qr.png');
      assert.equal(await Transaction.count({ where: { order_id: order.id } }), 1);
      assert.equal(await QrisAttempt.count({ where: { transaction_id: old.id } }), 2);
      const reused = (await create(order)).data;
      assert.equal(calls.length, before + 1); assert.deepEqual(reused, await state(order)); assert.deepEqual(reused, created);
    });

    await t.test('gateway rejection returns failure without mock, then recovery can create a valid invoice', async () => {
      const order = await fixture(); responder = (req, res) => res.status(503).json({ status: 0, error_code: 'PROVIDER_AUTH_REQUIRED' });
      const error = await create(order, 502); assert.equal(error.success, false);
      const failed = await state(order); assert.equal(failed.qr_url, null); assert.equal(failed.status, 'failed'); assert.equal(failed.can_retry, true);
      const failedRef = failed.ref_id; responder = success;
      const recovered = (await create(order)).data; assert.notEqual(recovered.ref_id, failedRef); assert.equal(recovered.qris_state, 'ready');
    });

    await t.test('expired/failed attempts get fresh refs, and old callbacks cannot expire a newer invoice', async () => {
      const order = await fixture(); const first = (await create(order)).data;
      await QrisAttempt.update({ expires_at: new Date(Date.now() - 1000) }, { where: { ref_id: first.ref_id } });
      const second = (await create(order)).data; assert.notEqual(second.ref_id, first.ref_id);
      await callback(first.ref_id, 'payment.expired', 'Expired'); assert.equal((await state(order)).qris_state, 'ready');
      await callback(second.ref_id, 'payment.cancelled', 'Cancelled');
      const third = (await create(order)).data; assert.notEqual(third.ref_id, second.ref_id);
      const beforeStock = Number((await material.reload()).stock);
      await callback(first.ref_id, 'payment.late', 'PaidLate');
      assert.equal((await state(order)).status, 'paid'); assert.equal((await order.reload()).status, 'confirmed');
      await callback(second.ref_id, 'payment.success', 'Success'); await callback(first.ref_id, 'payment.expired', 'Expired');
      assert.equal((await state(order)).status, 'paid'); assert.equal(Number((await material.reload()).stock), beforeStock - 1);
      assert.equal(await StockLog.count({ where: { reference_order_id: order.id } }), 1);
    });

    await t.test('legacy real refs are archived and remain resolvable after retry', async () => {
      const order = await fixture(); const old = await legacy(order, { ref_id: `OLD-GATEWAY-${order.id}`, qris_content: 'https://example.test/old.png', trx_id: 'OLD-PROVIDER' });
      const fresh = (await create(order)).data; assert.notEqual(fresh.ref_id, old.ref_id);
      await callback(old.ref_id); assert.equal((await state(order)).status, 'paid');
    });

    await t.test('mock, malformed, mismatched and expired gateway data never becomes a usable QR', async () => {
      for (const patch of [{ qr_link: 'mock-qris-old', qr_string: null }, { ref_id: 'WRONG' }, { trx_id: null }, { expired_ts: 1 }, { total_bayar: -5 }, { total_bayar: 'text' }, { status: 'Expired' }]) {
        const order = await fixture(); responder = (req, res) => res.json(invoice(req, patch));
        await create(order, 502); const failed = await state(order); assert.equal(failed.qr_url, null); assert.equal(failed.qr_string, null); assert.equal(failed.can_retry, true);
      }
      responder = (req, res) => res.json(invoice(req, { qr_link: null }));
      const raw = (await create(await fixture())).data; assert.ok(raw.qr_string.startsWith('000201')); assert.equal(raw.qr_url, null);
      responder = success;
    });

    await t.test('connection failure retries the same idempotent reference rather than duplicating an uncertain invoice', async () => {
      const order = await fixture(); responder = (req, res) => req.socket.destroy();
      await create(order, 502); const uncertain = await state(order); assert.equal(uncertain.qris_state, 'unknown');
      responder = success; const recovered = (await create(order)).data;
      assert.equal(recovered.ref_id, uncertain.ref_id); assert.equal(recovered.qris_state, 'ready');
      const trx = await Transaction.findOne({ where: { order_id: order.id } }); assert.equal(await QrisAttempt.count({ where: { transaction_id: trx.id } }), 1);
    });

    await t.test('concurrent creates share one gateway call, and cash/cancellation are never overwritten', async () => {
      const order = await fixture(); let reached, release;
      const entered = new Promise(resolve => { reached = resolve; }); const wait = new Promise(resolve => { release = resolve; });
      responder = async (req, res) => { reached(); await wait; res.json(invoice(req)); };
      const before = calls.length; const creating = create(order); await entered;
      try {
        const competing = await create(order, 202); assert.equal(competing.data.qris_state, 'creating'); assert.equal(calls.length, before + 1);
        await call(`/payments/${order.id}/cash`, {});
      } finally { release(); }
      assert.equal((await creating).data.status, 'paid'); assert.equal((await state(order)).payment_method, 'CASH'); assert.equal((await state(order)).amount, 10000);
      responder = success; const noCalls = calls.length; assert.equal((await create(order)).data.status, 'paid'); assert.equal(calls.length, noCalls);

      const cancelled = await fixture(); let enteredCancel, releaseCancel;
      const arrived = new Promise(resolve => { enteredCancel = resolve; }); const waiting = new Promise(resolve => { releaseCancel = resolve; });
      responder = async (req, res) => { enteredCancel(); await waiting; res.json(invoice(req)); };
      const pending = create(cancelled); await arrived;
      try { await call(`/orders/${cancelled.id}/status`, { status: 'cancelled' }, 200, 'PATCH'); } finally { releaseCancel(); }
      const result = (await pending).data; assert.equal(result.qr_url, null); assert.equal(result.can_retry, false); assert.equal((await cancelled.reload()).status, 'cancelled');
      responder = success;
    });

    await t.test('early callbacks remain recorded while the initial gateway response is still in flight', async () => {
      const order = await fixture(); let reached, release;
      const entered = new Promise(resolve => { reached = resolve; }); const waiting = new Promise(resolve => { release = resolve; });
      responder = async (req, res) => { reached(req.body.ref_id); await waiting; res.json(invoice(req)); };
      const pending = create(order); const ref = await entered;
      try { await callback(ref); } finally { release(); }
      assert.equal((await pending).data.status, 'paid'); assert.equal((await state(order)).amount, 10050);
      assert.equal((await order.reload()).status, 'confirmed'); responder = success;
    });

    await t.test('closed/expired orders never create new invoices and development simulation still works', async () => {
      const closed = await fixture(); await closed.update({ status: 'cancelled' }); const before = calls.length;
      await create(closed, 409); assert.equal(calls.length, before);
      const timedOut = await fixture(); await sequelize.query('UPDATE orders SET created_at = :date WHERE id = :id', { replacements: { date: new Date(Date.now() - 11 * 60000), id: timedOut.id } });
      await create(timedOut, 409); assert.equal(calls.length, before);
      const dev = await fixture(); responder = (req, res) => res.status(503).json({ status: 0 }); await create(dev, 502);
      await call(`/payments/${dev.id}/simulate-pay`, {}); assert.equal((await state(dev)).status, 'paid'); responder = success;
    });
  } finally {
    for (const socket of sockets) socket.destroy();
    if (gateway) await new Promise(resolve => gateway.close(resolve));
    if (server) await new Promise(resolve => server.close(resolve));
    await sequelize.close(); if (!/^kitkop_qris_test_\d+$/.test(database)) throw new Error('Unexpected test database');
    await admin.query(`DROP DATABASE \`${database}\``); await admin.end();
  }
});
