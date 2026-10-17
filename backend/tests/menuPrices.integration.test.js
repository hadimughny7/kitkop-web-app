const test = require('node:test');
const assert = require('node:assert/strict');

test('menu APIs, model, order calculation and database reject invalid prices while allowing free menus', { skip: process.env.KITKOP_OPTIONS_DB_TEST !== 'true' }, async t => {
  require('dotenv').config();
  assert.ok(['localhost', '127.0.0.1', '::1'].includes(process.env.DB_HOST), 'Use a local test database only');
  process.env.JWT_SECRET = 'menu-price-integration-secret';
  const mysql = require('mysql2/promise');
  const database = `kitkop_menu_prices_test_${process.pid}`;
  const admin = await mysql.createConnection({ host: process.env.DB_HOST, port: process.env.DB_PORT || 3306, user: process.env.DB_USER, password: process.env.DB_PASSWORD });
  await admin.query(`CREATE DATABASE \`${database}\``); process.env.DB_NAME = database;
  const { sequelize } = require('../config/database');
  const { User, MenuCategory, Menu, OptionGroup, Customer, Order, OrderItem, OrderStatusLog } = require('../models');
  const { MAX_PRICE } = require('../services/menuPrices');
  const migrate = require('../migrations/validate-menu-prices');
  let server;
  try {
    await sequelize.sync();
    const owner = await User.create({ name: 'Owner', username: 'owner', email: 'owner@example.test', role: 'owner', password_hash: 'test' });
    const token = require('jsonwebtoken').sign({ id: owner.id }, process.env.JWT_SECRET, { expiresIn: '1h' });
    const category = await MenuCategory.create({ name: 'Test' });
    const express = require('express');
    const app = express(); app.use(express.json());
    const events = [];
    app.set('io', { to: () => ({ emit: event => events.push(event) }) });
    app.use('/api/menus', require('../routes/menuRoutes'));
    app.use('/api/orders', require('../routes/orderRoutes'));
    app.use('/api/payments', require('../routes/paymentRoutes'));
    app.use((err, req, res, next) => res.status(err.statusCode || (err.name === 'SequelizeValidationError' ? 400 : 500)).json({ message: err.message }));
    server = app.listen(0, '127.0.0.1'); await new Promise(resolve => server.once('listening', resolve));
    const base = `http://127.0.0.1:${server.address().port}/api`;
    const request = async (path, method, body, expected = 200, staff = true) => {
      const response = await fetch(base + path, { method, headers: { 'Content-Type': 'application/json', ...(staff ? { Authorization: `Bearer ${token}` } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
      const data = await response.json();
      assert.equal(response.status, expected, `${method} ${path}: ${JSON.stringify(data)}`);
      return data.data;
    };
    const createMenu = (price, extra = {}) => request('/menus', 'POST', { category_id: category.id, name: 'Test menu', price, ...extra }, 201);
    const payload = (menu_id, qty = 1, extra = {}) => ({ customer_name: 'Guest', items: [{ menu_id, qty, ...extra }] });
    const counts = async () => Promise.all([Customer.count(), Order.count(), OrderItem.count(), OrderStatusLog.count()]);
    const rejectedOrder = async body => {
      const before = await counts(); const eventCount = events.length;
      for (const staff of [false, true]) {
        await request('/orders', 'POST', { ...body, order_type: staff ? 'kasir' : 'qr' }, 409, staff);
        assert.deepEqual(await counts(), before);
        assert.equal(events.length, eventCount);
      }
    };
    const editable = await createMenu(1000);

    await t.test('invalid create and update prices return 400 without partial menu changes', async () => {
      const count = await Menu.count();
      for (const price of [-100, '-100', -0.001, null, '', ' ', '5abc', 'Infinity', 'NaN', true, false, [], [5], {}, '0x10', '1,000', 0.001, 1.234, 10000000000]) {
        await request('/menus', 'POST', { category_id: category.id, name: 'Invalid', price }, 400);
        await request(`/menus/${editable.id}`, 'PUT', { name: 'Must not save', price }, 400);
        assert.equal(await Menu.count(), count);
        const stored = await Menu.findByPk(editable.id);
        assert.equal(stored.name, 'Test menu'); assert.equal(Number(stored.price), 1000);
      }
      await request('/menus', 'POST', { category_id: category.id, name: 'Missing price' }, 400);
      await request(`/menus/${editable.id}`, 'PUT', { description: 'Metadata only' });
      assert.equal(Number((await Menu.findByPk(editable.id)).price), 1000);
    });

    await t.test('zero and decimal prices work in JSON and multipart forms, including update to numeric zero', async () => {
      for (const price of [0, '0', 0.01, '12500.50']) {
        const created = await createMenu(price);
        assert.equal(Number(created.price), Number(price));
      }
      await request(`/menus/${editable.id}`, 'PUT', { price: 0 });
      assert.equal(Number((await Menu.findByPk(editable.id)).price), 0);
      const form = new FormData(); form.set('category_id', category.id); form.set('name', 'Free multipart'); form.set('price', '0');
      const response = await fetch(base + '/menus', { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: form });
      assert.equal(response.status, 201); assert.equal(Number((await response.json()).data.price), 0);
      form.set('price', '-100');
      assert.equal((await fetch(base + `/menus/${editable.id}`, { method: 'PUT', headers: { Authorization: `Bearer ${token}` }, body: form })).status, 400);
      assert.equal(Number((await Menu.findByPk(editable.id)).price), 0);
    });

    await t.test('direct model create and update cannot persist invalid prices', async () => {
      for (const price of [-1, 'bad', true, 0.001, Infinity, null]) {
        await assert.rejects(Menu.create({ category_id: category.id, name: 'Invalid model', price }), { name: 'SequelizeValidationError' });
        await assert.rejects(Menu.update({ price }, { where: { id: editable.id } }), { name: 'SequelizeValidationError' });
      }
      assert.equal(Number((await Menu.findByPk(editable.id)).price), 0);
    });

    await t.test('server computes valid prices, preserves cents and existing snapshots, and accepts free orders', async () => {
      await request(`/menus/${editable.id}`, 'PUT', { price: 1000.25 });
      const paid = await request('/orders', 'POST', { ...payload(editable.id, 3, { price: -100, base_price: -100 }), total: -100 }, 201, false);
      assert.equal(Number(paid.items[0].price), 1000.25);
      assert.equal(Number(paid.subtotal), 3000.75); assert.equal(Number(paid.tax), 300); assert.equal(Number(paid.total), 3300.75);
      await request(`/menus/${editable.id}`, 'PUT', { price: 0 });
      assert.equal(Number((await OrderItem.findByPk(paid.items[0].id)).price), 1000.25);
      const free = await request('/orders', 'POST', payload(editable.id, 2, { expected_price: 0 }), 201, false);
      assert.equal(Number(free.total), 0); assert.equal(Number(free.items[0].price), 0);
      await request(`/payments/${free.id}/cash`, 'POST', {});
      assert.equal((await Order.findByPk(free.id)).status, 'confirmed');
      await request('/orders', 'POST', payload(editable.id, 1, { expected_price: 1 }), 409, false);
      await request('/orders', 'POST', payload(editable.id, 1, { expected_price: null }), 400, false);
    });

    await t.test('legacy negative prices and invalid selected add-ons reject checkout atomically', async () => {
      const legacy = await Menu.create({ category_id: category.id, name: 'Legacy negative', price: -100 }, { validate: false });
      const group = await OptionGroup.create({ name: 'Extra', min_choices: 0, max_choices: 1, is_active: true, choices: [{ id: 'legacy-extra', name: 'Extra', price: 500, is_available: true }] });
      await legacy.addOptionGroup(group, { through: { sort_order: 0 } });
      // A positive add-on cannot hide an invalid base price.
      await rejectedOrder(payload(legacy.id, 1, { option_ids: ['legacy-extra'] }));
      const warnings = [];
      const audit = await migrate({ logger: { warn: message => warnings.push(message) } });
      assert.equal(audit.enforced, false); assert.deepEqual(audit.invalidMenus.map(row => row.id), [legacy.id]);
      assert.equal(warnings.length, 1); assert.equal(Number((await legacy.reload()).price), -100);
      await request(`/menus/${legacy.id}`, 'PUT', { price: 1000 });
      for (const price of [-100, 'bad', null]) {
        await group.update({ choices: [{ id: 'legacy-extra', name: 'Extra', price, is_available: true }] });
        await rejectedOrder(payload(legacy.id, 1, { option_ids: ['legacy-extra'] }));
      }
      await group.update({ choices: [{ id: 'legacy-extra', name: 'Extra', price: 500.25, is_available: true }] });
      const valid = await request('/orders', 'POST', payload(legacy.id, 2, { option_ids: ['legacy-extra'] }), 201, false);
      assert.equal(Number(valid.subtotal), 3000.5);
    });

    await t.test('database check is idempotent and blocks negative raw SQL writes without banning zero', async () => {
      assert.equal((await migrate()).enforced, true);
      assert.equal((await migrate()).enforced, true);
      await assert.rejects(sequelize.query('UPDATE menus SET price = -100 WHERE id = :id', { replacements: { id: editable.id } }));
      await assert.rejects(sequelize.query("INSERT INTO menus (category_id, name, price, created_at, updated_at) VALUES (:category, 'SQL negative', -100, NOW(), NOW())", { replacements: { category: category.id } }));
      await sequelize.query('UPDATE menus SET price = 0 WHERE id = :id', { replacements: { id: editable.id } });
      assert.equal(Number((await Menu.findByPk(editable.id)).price), 0);
    });

    await t.test('oversized line, combined add-on, subtotal and taxed total are rejected before writing', async () => {
      const large = await createMenu(MAX_PRICE);
      await rejectedOrder(payload(large.id, 2));
      await rejectedOrder(payload(large.id, 1)); // Tax would overflow DECIMAL(12,2).
      const group = await OptionGroup.create({ name: 'Overflow', min_choices: 0, max_choices: 1, is_active: true, choices: [{ id: 'overflow', name: 'Extra', price: 1, is_available: true }] });
      await Menu.findByPk(large.id).then(row => row.addOptionGroup(group, { through: { sort_order: 0 } }));
      await rejectedOrder(payload(large.id, 1, { option_ids: ['overflow'] }));
    });
  } finally {
    if (server) await new Promise(resolve => server.close(resolve));
    await sequelize.close(); await admin.query(`DROP DATABASE \`${database}\``); await admin.end();
  }
});
