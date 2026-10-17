const test = require('node:test');
const assert = require('node:assert/strict');

test('explicit category types replace ID assumptions across migrations, APIs and order snapshots', { skip: process.env.KITKOP_OPTIONS_DB_TEST !== 'true' }, async t => {
  require('dotenv').config();
  assert.ok(['localhost', '127.0.0.1', '::1'].includes(process.env.DB_HOST), 'Use a local test database only');
  process.env.JWT_SECRET = 'category-types-test';
  const mysql = require('mysql2/promise');
  const database = `kitkop_category_types_test_${process.pid}`;
  const admin = await mysql.createConnection({ host: process.env.DB_HOST, port: process.env.DB_PORT || 3306, user: process.env.DB_USER, password: process.env.DB_PASSWORD });
  await admin.query(`CREATE DATABASE \`${database}\``); process.env.DB_NAME = database;
  const { sequelize } = require('../config/database');
  const { User, MenuCategory, Menu, Order, OrderItem, Customer, OrderStatusLog } = require('../models');
  const migrate = require('../migrations/add-category-item-types');
  let server;
  try {
    await sequelize.sync();
    const owner = await User.create({ name: 'Owner', username: 'owner', email: 'owner@example.test', role: 'owner', password_hash: 'test' });
    const cashier = await User.create({ name: 'Cashier', username: 'cashier', email: 'cashier@example.test', role: 'kasir', password_hash: 'test' });
    const manager = await User.create({ name: 'Manager', username: 'manager', email: 'manager@example.test', role: 'manajer', password_hash: 'test' });
    const jwt = require('jsonwebtoken');
    const staffToken = user => jwt.sign({ id: user.id }, process.env.JWT_SECRET, { expiresIn: '1h' });
    await MenuCategory.bulkCreate([
      { id: 1, name: 'Makanan' }, { id: 2, name: 'Manual Brew' }, { id: 3, name: 'Non-Coffee' },
      { id: 4, name: 'Pastry & Bakery' }, { id: 5, name: 'Main Course' }, { id: 6, name: 'Mystery' },
      { id: 73, name: 'Snack' }, { id: 101, name: 'Coffee (Espresso Based)' },
    ]);
    const food = await Menu.create({ category_id: 1, name: 'Nasi', price: 10000 });
    const legacy = await Order.create({ order_number: 'LEGACY-CATEGORY', status: 'completed' });
    const legacyItem = await OrderItem.create({ order_id: legacy.id, menu_id: food.id, qty: 1, price: 10000, item_type: 'minuman' });
    await sequelize.getQueryInterface().removeColumn('menu_categories', 'item_type');

    await t.test('old schemas map known names without consulting IDs and leave unknown categories unconfigured', async () => {
      const plan = await migrate.audit();
      assert.equal(plan.find(row => row.id === 1).proposed_type, 'makanan');
      assert.equal(plan.find(row => row.id === 6).proposed_type, null);
      assert.equal(plan.find(row => row.id === 73).proposed_type, 'snack');
      const warnings = [];
      const result = await migrate({ logger: { warn: message => warnings.push(message) } });
      assert.deepEqual(result.pending.map(row => row.id), [6]); assert.equal(warnings.length, 1);
      for (const [id, expected] of [[1, 'makanan'], [2, 'minuman'], [3, 'minuman'], [4, 'makanan'], [5, 'makanan'], [73, 'snack'], [101, 'minuman']]) {
        assert.equal((await MenuCategory.findByPk(id)).item_type, expected);
      }
      assert.equal((await legacyItem.reload()).item_type, 'minuman');
    });

    const express = require('express'); const app = express(); app.use(express.json());
    const events = [];
    app.set('io', { to: () => ({ emit: event => events.push(event) }) });
    app.use('/api/categories', require('../routes/categoryRoutes'));
    app.use('/api/orders', require('../routes/orderRoutes'));
    app.use('/api/payments', require('../routes/paymentRoutes'));
    app.use((err, req, res, next) => res.status(err.statusCode || (err.name === 'SequelizeValidationError' ? 400 : 500)).json({ message: err.message }));
    server = app.listen(0, '127.0.0.1'); await new Promise(resolve => server.once('listening', resolve));
    const base = `http://127.0.0.1:${server.address().port}/api`;
    const request = async (path, method, body, expected = 200, user = owner) => {
      const response = await fetch(base + path, { method, headers: { 'Content-Type': 'application/json', ...(user ? { Authorization: `Bearer ${staffToken(user)}` } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
      const data = await response.json();
      assert.equal(response.status, expected, `${method} ${path}: ${JSON.stringify(data)}`);
      return data.data;
    };
    const order = (menu, user = null, extra = {}) => request('/orders', 'POST', { customer_name: 'Guest', order_type: user ? 'kasir' : 'qr', items: [{ menu_id: menu.id, qty: 1, item_type: 'spoofed', ...extra }] }, 201, user);

    await t.test('owner/manager category API requires valid types on create and rejects partial invalid updates', async () => {
      for (const item_type of [undefined, null, '', 'food', 'MINUMAN', 1, true, [], {}]) {
        const count = await MenuCategory.count();
        await request('/categories', 'POST', { name: 'Invalid', item_type }, 400);
        assert.equal(await MenuCategory.count(), count);
        if (item_type !== undefined) {
          await request('/categories/1', 'PUT', { name: 'Must not save', item_type }, 400);
          assert.equal((await MenuCategory.findByPk(1)).name, 'Makanan');
          assert.equal((await MenuCategory.findByPk(1)).item_type, 'makanan');
        }
      }
      await request('/categories', 'POST', { name: 'Unauthorized', item_type: 'minuman' }, 401, null);
      await request('/categories/1', 'PUT', { item_type: 'minuman' }, 403, cashier);
      await assert.rejects(MenuCategory.create({ name: 'Invalid model', item_type: 'other' }), { name: 'SequelizeValidationError' });
      for (const type of ['makanan', 'minuman', 'snack']) {
        const created = await request('/categories', 'POST', { name: `Custom ${type}`, item_type: type }, 201, type === 'minuman' ? manager : owner);
        assert.equal(created.item_type, type);
        const menu = await Menu.create({ category_id: created.id, name: type, price: 5000 });
        for (const user of [null, cashier]) assert.equal((await order(menu, user)).items[0].item_type, type);
      }
      const list = await request('/categories', 'GET');
      assert.equal(list.find(row => row.id === 6).item_type, null);
      assert.equal(list.find(row => row.id === 1).item_type, 'makanan');
    });

    await t.test('Makanan at ID 1 and Snack at ID 73 reach production using their configured types', async () => {
      const snack = await Menu.create({ category_id: 73, name: 'Camilan', price: 5000 });
      for (const menu of [food, snack]) {
        const created = await order(menu);
        assert.equal(created.items[0].item_type, menu.id === food.id ? 'makanan' : 'snack');
        await request(`/payments/${created.id}/cash`, 'POST', {});
        for (const action of ['process-all', 'complete-all']) await request(`/orders/${created.id}/items/${action}`, 'PATCH', {});
        assert.equal((await Order.findByPk(created.id)).status, 'completed');
      }
    });

    await t.test('renames do not infer types, explicit changes affect only future orders and migration preserves overrides', async () => {
      const drink = await Menu.create({ category_id: 101, name: 'Coffee', price: 10000 });
      const before = await order(drink);
      await request('/categories/101', 'PUT', { name: 'Makanan renamed', description: 'Rename only' });
      assert.equal((await order(drink)).items[0].item_type, 'minuman');
      // Use a known legacy name to prove repeated migration cannot replace explicit overrides.
      await request('/categories/101', 'PUT', { name: 'Coffee (Espresso Based)', item_type: 'snack' });
      await migrate({ logger: { warn() {} } }); await migrate({ logger: { warn() {} } });
      assert.equal((await MenuCategory.findByPk(101)).item_type, 'snack');
      assert.equal((await order(drink)).items[0].item_type, 'snack');
      assert.equal((await OrderItem.findByPk(before.items[0].id)).item_type, 'minuman');
      assert.equal((await legacyItem.reload()).item_type, 'minuman');
    });

    await t.test('unconfigured categories block QR/POS atomically until a manager explicitly chooses a type', async () => {
      const menu = await Menu.create({ category_id: 6, name: 'Mystery menu', price: 5000 });
      const counts = () => Promise.all([Customer.count(), Order.count(), OrderItem.count(), OrderStatusLog.count()]);
      const before = await counts(); const eventCount = events.length;
      for (const user of [null, cashier]) {
        await request('/orders', 'POST', { customer_name: 'Unknown type', items: [{ menu_id: menu.id, qty: 1 }] }, 409, user);
        assert.deepEqual(await counts(), before); assert.equal(events.length, eventCount);
      }
      await request('/categories/6', 'PUT', { item_type: 'minuman' });
      assert.equal((await order(menu)).items[0].item_type, 'minuman');
      assert.equal((await migrate()).pending.length, 0);
    });
  } finally {
    if (server) await new Promise(resolve => server.close(resolve));
    await sequelize.close(); await admin.query(`DROP DATABASE \`${database}\``); await admin.end();
  }
});
