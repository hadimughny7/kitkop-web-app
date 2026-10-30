const test = require('node:test');
const assert = require('node:assert/strict');

test('malformed order requests return 400 before writing data while normal guest/POS orders still work', { skip: process.env.KITKOP_OPTIONS_DB_TEST !== 'true' }, async t => {
  require('dotenv').config();
  assert.ok(['localhost', '127.0.0.1', '::1'].includes(process.env.DB_HOST), 'Use a local test database only');
  process.env.JWT_SECRET = 'order-input-test-only';
  const database = `kitkop_order_input_test_${process.pid}`;
  const admin = await require('mysql2/promise').createConnection({ host: process.env.DB_HOST, port: process.env.DB_PORT || 3306, user: process.env.DB_USER, password: process.env.DB_PASSWORD });
  await admin.query(`CREATE DATABASE \`${database}\``); process.env.DB_NAME = database;
  const { sequelize } = require('../config/database');
  const { User, Customer, MenuCategory, Menu, MenuRecipe, RawMaterial, OptionGroup, Order, OrderItem, OrderStatusLog, OrderCounter, Transaction, StockLog } = require('../models');
  let server, writeAttempts = 0;
  try {
    await sequelize.sync();
    const cashier = await User.create({ name: 'Cashier', username: 'cashier', email: 'cashier@example.test', role: 'kasir', password_hash: 'unused' });
    const staff = { Authorization: `Bearer ${require('jsonwebtoken').sign({ id: cashier.id, sessionVersion: 0 }, process.env.JWT_SECRET, { expiresIn: '1h' })}` };
    const category = await MenuCategory.create({ name: 'Kopi' });
    const plain = await Menu.create({ name: 'Plain', price: 5000, category_id: category.id });
    const menu = await Menu.create({ name: 'Options', price: 10000, category_id: category.id });
    const material = await RawMaterial.create({ name: 'Fixture beans', stock: 100, min_stock: 10, unit: 'gram' });
    await MenuRecipe.create({ menu_id: menu.id, raw_material_id: material.id, quantity_used: 5 });
    const group = await OptionGroup.create({ name: 'Tambahan', min_choices: 1, max_choices: 1, is_active: true, choices: [
      { id: 'ice', name: 'Ice', price: 500, is_available: true, ingredients: [{ raw_material_id: material.id, quantity_used: 2 }] },
    ] });
    await menu.addOptionGroup(group, { through: { sort_order: 0 } });
    const originalQuery = sequelize.query;
    t.mock.method(sequelize, 'query', function (sql, ...args) {
      if (/^\s*(INSERT|UPDATE|DELETE|REPLACE)\b/i.test(typeof sql === 'string' ? sql : sql?.query || '')) writeAttempts++;
      return originalQuery.call(this, sql, ...args);
    });
    // This validation matrix exceeds normal request budgets; default limits have separate HTTP tests.
    const limits = require('../middleware/orderRateLimit');
    const createOrderRateLimiters = limits.createOrderRateLimiters;
    t.mock.method(limits, 'createOrderRateLimiters', () => createOrderRateLimiters({ guestLimit: 1000, ipLimit: 1000, staffLimit: 1000 }));
    const express = require('express'); const app = express(); app.use(express.json());
    const events = []; app.set('io', { to: () => ({ emit: event => events.push(event) }) });
    app.use('/api/orders', require('../routes/orderRoutes')); app.use('/api/payments', require('../routes/paymentRoutes'));
    t.mock.method(console, 'error', () => {});
    app.use(require('../middleware/errorHandler'));
    server = app.listen(0, '127.0.0.1'); await new Promise(resolve => server.once('listening', resolve));
    const base = `http://127.0.0.1:${server.address().port}/api`;
    const payload = () => ({ customer_name: 'Guest', items: [{ menu_id: plain.id, qty: 1 }] });
    const request = async (body, headers = {}, raw = false) => {
      const response = await fetch(base + '/orders', { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: raw ? body : JSON.stringify(body) });
      return { status: response.status, body: await response.json() };
    };
    const snapshot = async () => ({
      counts: await Promise.all([Customer, Order, OrderItem, OrderStatusLog, Transaction, StockLog].map(model => model.count())),
      counters: (await OrderCounter.findAll({ order: [['date_key', 'ASC']] })).map(row => row.toJSON()),
      stock: Number((await material.reload()).stock), events: [...events],
    });
    const rejected = async (body, headers = {}, raw = false, expected = 400) => {
      const before = await snapshot(); writeAttempts = 0;
      const result = await request(body, headers, raw);
      assert.equal(result.status, expected, JSON.stringify(result.body));
      assert.equal(result.body.success, false); assert.equal(result.body.data, undefined);
      assert.equal(writeAttempts, 0, 'Invalid requests must not attempt writes and then rely on rollback');
      assert.deepEqual(await snapshot(), before);
      return result;
    };

    await t.test('invalid JSON bodies, missing items and empty arrays produce client errors without writes', async () => {
      for (const headers of [{}, staff]) {
        for (const raw of ['null', '[]', '"text"', 'true', '1', '{', '']) await rejected(raw, headers, true);
        for (const body of [{}, { customer_name: 'Guest' }, { ...payload(), items: [] }, { ...payload(), items: {} }]) await rejected(body, headers);
      }
    });
    await t.test('null, array and primitive items are rejected even after an otherwise valid first item', async () => {
      for (const headers of [{}, staff]) {
        for (const item of [null, [], [1], 1, 'item', true, false, {}]) {
          await rejected({ ...payload(), items: [item] }, headers);
          const result = await rejected({ ...payload(), items: [payload().items[0], item] }, headers);
          assert.match(result.body.message, /ke-2/);
        }
      }
    });
    await t.test('malformed known fields are rejected before customer creation for guest and staff paths', async () => {
      const invalidItems = [
        ...[null, true, [], {}, '', 0, -1, 1.5, '1abc', '1e0', 2147483648].map(menu_id => ({ menu_id, qty: 1 })),
        ...[null, true, [], {}, '1', 0, 1.5, 1000].map(qty => ({ menu_id: plain.id, qty })),
        ...[null, {}, 'ice', [null], [[]], [1], ['ice', 'ice'], ['']].map(option_ids => ({ menu_id: plain.id, qty: 1, option_ids })),
        ...[[], {}, true, 12, 'a'.repeat(65536)].map(notes => ({ menu_id: plain.id, qty: 1, notes })),
        ...[null, [], {}, '5abc', -1, 0.001].map(expected_price => ({ menu_id: plain.id, qty: 1, expected_price })),
      ];
      for (const headers of [{}, staff]) {
        for (const item of invalidItems) await rejected({ ...payload(), items: [item] }, headers);
        for (const extra of [{ customer_name: [] }, { customer_name: ' ' }, { customer_name: 'a'.repeat(101) }, { customer_phone: [] }, { customer_phone: '1'.repeat(21) }, { customer_email: {} }, { customer_email: 'a'.repeat(101) }, { order_type: 'unknown' }, { table_id: [] }]) {
          await rejected({ ...payload(), ...extra }, headers);
        }
      }
    });
    await t.test('database-dependent menu/options/price failures also occur before any customer is written', async () => {
      await rejected({ ...payload(), items: [{ menu_id: 2147483647, qty: 1 }] });
      await rejected({ ...payload(), items: [{ menu_id: menu.id, qty: 1, option_ids: [] }] });
      await rejected({ ...payload(), items: [{ menu_id: plain.id, qty: 1, option_ids: ['foreign'] }] });
      await rejected({ ...payload(), items: [{ menu_id: plain.id, qty: 1, expected_price: 1 }] }, {}, false, 409);
      await plain.update({ is_available: false });
      await rejected(payload());
      await plain.update({ is_available: true });
    });
    await t.test('guest checkout with options and optional contacts keeps prices, tracking and stock deduction correct', async () => {
      const result = await request({ customer_name: 'Guest', customer_phone: null, customer_email: '', order_type: 'qr', items: [
        { menu_id: String(menu.id), qty: 2, option_ids: ['ice'], expected_price: '10500.00', notes: 'Less sugar' },
      ] });
      assert.equal(result.status, 201); const order = result.body.data;
      assert.equal(Number(order.total), 23100); assert.equal(order.customer.phone, null); assert.equal(order.customer.email, null);
      assert.equal(order.items[0].notes, 'Less sugar'); assert.ok(order.tracking_token);
      assert.equal(Number((await material.reload()).stock), 100);
      const paid = await fetch(`${base}/payments/${order.id}/cash`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...staff }, body: '{}' });
      assert.equal(paid.status, 200); assert.equal(Number((await material.reload()).stock), 86);
      assert.equal((await Order.findByPk(order.id)).status, 'confirmed');
    });
    await t.test('plain POS orders and empty/omitted optional fields remain supported after rejected requests', async () => {
      for (const contact of [{}, { customer_phone: '', customer_email: null }]) {
        const result = await request({ ...payload(), ...contact, order_type: 'kasir', table_id: null }, staff);
        assert.equal(result.status, 201); const order = result.body.data;
        assert.equal(order.order_type, 'kasir'); assert.equal(order.cashier_id, cashier.id);
        assert.equal(Number(order.total), 5500); assert.equal(order.items[0].notes, null);
        const paid = await fetch(`${base}/payments/${order.id}/cash`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...staff }, body: '{}' });
        assert.equal(paid.status, 200); assert.equal((await Order.findByPk(order.id)).status, 'confirmed');
      }
    });
  } finally {
    if (server) await new Promise(resolve => server.close(resolve));
    await sequelize.close(); assert.match(database, /^kitkop_order_input_test_\d+$/);
    await admin.query(`DROP DATABASE \`${database}\``); await admin.end();
  }
});
