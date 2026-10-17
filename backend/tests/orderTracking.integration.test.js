const test = require('node:test');
const assert = require('node:assert/strict');

test('HTTP tracking requires an expiring capability bound to both order ID and number', { skip: process.env.KITKOP_OPTIONS_DB_TEST !== 'true' }, async t => {
  require('dotenv').config(); process.env.JWT_SECRET = 'tracking-integration-secret';
  const mysql = require('mysql2/promise');
  const database = `kitkop_tracking_test_${process.pid}`;
  const admin = await mysql.createConnection({ host: process.env.DB_HOST, port: process.env.DB_PORT || 3306, user: process.env.DB_USER, password: process.env.DB_PASSWORD });
  await admin.query(`CREATE DATABASE \`${database}\``); process.env.DB_NAME = database;
  const { sequelize } = require('../config/database');
  const { User, Table, MenuCategory, Menu, Order } = require('../models');
  const jwt = require('jsonwebtoken'); let server;
  try {
    await sequelize.sync();
    const owner = await User.create({ name: 'Staff private', username: 'owner', email: 'owner@example.test', role: 'owner', password_hash: 'test' });
    const table = await Table.create({ table_number: 'A1' });
    const category = await MenuCategory.create({ name: 'Kopi' });
    const menu = await Menu.create({ category_id: category.id, name: 'Kopi', price: 10000 });
    const express = require('express'); const app = express(); app.use(express.json());
    app.use('/api/orders', require('../routes/orderRoutes'));
    app.use('/api/payments', require('../routes/paymentRoutes'));
    app.use((err, req, res, next) => res.status(err.statusCode || 500).json({ message: err.message }));
    server = app.listen(0, '127.0.0.1'); await new Promise(resolve => server.once('listening', resolve));
    const base = `http://127.0.0.1:${server.address().port}/api`;
    const create = async name => {
      const response = await fetch(base + '/orders', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ table_id: table.id, customer_name: name, customer_phone: `phone-${name}`, customer_email: `${name}@example.test`, items: [{ menu_id: menu.id, qty: 1, notes: 'Less sugar' }] }) });
      assert.equal(response.status, 201); return (await response.json()).data;
    };
    const a = await create('A'), b = await create('B');
    const track = async (number, token, extraHeaders = {}) => {
      const response = await fetch(base + '/orders/track/' + number, { headers: { ...extraHeaders, ...(token ? { 'X-Order-Tracking-Token': token } : {}) } });
      return { status: response.status, cache: response.headers.get('cache-control'), body: await response.json() };
    };
    const signed = (claims = {}, options = {}) => jwt.sign({ orderNumber: a.order_number, ...claims }, process.env.JWT_SECRET, { subject: String(a.id), audience: 'kitkop-order-tracking', expiresIn: '1h', ...options });
    await t.test('missing, malformed, expired, wrong audience, wrong signature and other-order tokens disclose no data', async () => {
      const expired = signed({}, { expiresIn: -1 });
      const noExpiry = jwt.sign({ orderNumber: a.order_number, sub: String(a.id), aud: 'kitkop-order-tracking' }, process.env.JWT_SECRET);
      const wrongSecret = jwt.sign({ orderNumber: a.order_number }, 'other-secret', { subject: String(a.id), audience: 'kitkop-order-tracking', expiresIn: '1h' });
      for (const token of [undefined, 'bad', expired, noExpiry, signed({}, { audience: 'staff' }), wrongSecret, b.tracking_token, signed({}, { subject: 'invalid' })]) {
        const response = await track(a.order_number, token);
        assert.equal(response.status, 403); assert.equal(response.body.data, undefined); assert.equal(response.cache, 'no-store');
        assert.equal(JSON.stringify(response.body).includes('phone-A'), false);
      }
      const anonymousUnknown = await track('UNKNOWN', undefined);
      assert.deepEqual(anonymousUnknown, await track(a.order_number, undefined));
      assert.equal((await track(a.order_number, undefined, { Authorization: `Bearer ${jwt.sign({ id: owner.id, role: 'owner' }, process.env.JWT_SECRET)}` })).status, 403);
    });
    await t.test('valid signature cannot mix another order ID with this order number', async () => {
      const response = await track(a.order_number, signed({}, { subject: String(b.id) }));
      assert.equal(response.status, 404); assert.equal(response.body.data, undefined);
    });
    await t.test('own token supports repeated tracking, necessary reorder data and minimal response', async () => {
      for (let i = 0; i < 2; i++) {
        const response = await track(a.order_number, a.tracking_token);
        assert.equal(response.status, 200); assert.equal(response.cache, 'no-store');
        const order = response.body.data;
        assert.equal(order.customer.name, 'A'); assert.equal(order.customer.phone, 'phone-A');
        assert.equal(order.table.table_number, 'A1'); assert.equal(order.table_id, table.id);
        assert.equal(order.items[0].notes, 'Less sugar'); assert.equal(order.items[0].menu.name, 'Kopi');
        for (const field of ['cashier', 'cashier_id', 'customer_id', 'statusLogs', 'transaction', 'tracking_token']) assert.equal(field in order, false);
        assert.equal('email' in order.customer, false); assert.equal('stock_usage' in order.items[0], false);
      }
      assert.equal((await track(b.order_number, a.tracking_token)).status, 403);
    });
    await t.test('cash confirmation and production remain visible only to the matching customer', async () => {
      const headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${jwt.sign({ id: owner.id, role: 'owner' }, process.env.JWT_SECRET)}` };
      assert.equal((await fetch(base + `/payments/${a.id}/cash`, { method: 'POST', headers, body: '{}' })).status, 200);
      assert.equal((await track(a.order_number, a.tracking_token)).body.data.status, 'confirmed');
      for (const action of ['process-all', 'complete-all']) assert.equal((await fetch(base + `/orders/${a.id}/items/${action}`, { method: 'PATCH', headers, body: '{}' })).status, 200);
      assert.equal((await track(a.order_number, a.tracking_token)).body.data.status, 'completed');
      assert.equal((await Order.findByPk(b.id)).status, 'pending');
    });
  } finally {
    if (server) await new Promise(resolve => server.close(resolve));
    await sequelize.close(); await admin.query(`DROP DATABASE \`${database}\``); await admin.end();
  }
});
