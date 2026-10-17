const test = require('node:test');
const assert = require('node:assert/strict');

test('guest orders isolate unverified contact details without requiring phone, email or login', { skip: process.env.KITKOP_OPTIONS_DB_TEST !== 'true' }, async t => {
  require('dotenv').config();
  assert.ok(['localhost', '127.0.0.1', '::1'].includes(process.env.DB_HOST), 'Use a local test database only');
  process.env.JWT_SECRET = 'guest-identity-integration-secret';
  const mysql = require('mysql2/promise');
  const database = `kitkop_guest_identity_test_${process.pid}`;
  const admin = await mysql.createConnection({ host: process.env.DB_HOST, port: process.env.DB_PORT || 3306, user: process.env.DB_USER, password: process.env.DB_PASSWORD });
  await admin.query(`CREATE DATABASE \`${database}\``);
  process.env.DB_NAME = database;
  const { sequelize } = require('../config/database');
  const { Customer, Order, Menu, MenuCategory, User } = require('../models');
  const jwt = require('jsonwebtoken');
  let server;
  try {
    await sequelize.sync();
    const owner = await User.create({ name: 'Owner', username: 'owner', email: 'owner@example.test', role: 'owner', password_hash: 'test' });
    const staffHeaders = { Authorization: `Bearer ${jwt.sign({ id: owner.id }, process.env.JWT_SECRET, { expiresIn: '1h' })}` };
    const category = await MenuCategory.create({ name: 'Test' });
    const menu = await Menu.create({ category_id: category.id, name: 'Kopi', price: 10000 });
    const express = require('express');
    const app = express(); app.use(express.json());
    app.use('/api/orders', require('../routes/orderRoutes'));
    app.use((err, req, res, next) => res.status(err.statusCode || 500).json({ success: false, message: err.message }));
    server = app.listen(0, '127.0.0.1');
    await new Promise(resolve => server.once('listening', resolve));
    const base = `http://127.0.0.1:${server.address().port}/api/orders`;
    const create = async (contact, headers = {}, items = [{ menu_id: menu.id, qty: 1 }]) => {
      const response = await fetch(base, { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify({ ...contact, items }) });
      return { status: response.status, body: await response.json() };
    };
    const track = async order => {
      const response = await fetch(`${base}/track/${order.order_number}`, { headers: { 'X-Order-Tracking-Token': order.tracking_token } });
      assert.equal(response.status, 200);
      return (await response.json()).data;
    };
    const sharedPhone = '081000000001';
    const oldDetails = { name: 'Original guest', phone: sharedPhone, email: 'original@example.test' };
    const original = await Customer.create(oldDetails);
    // Existing installations can have multiple historical orders sharing one customer.
    const oldOrders = await Promise.all(['LEGACY-A', 'LEGACY-B'].map(order_number => Order.create({ order_number, customer_id: original.id })));
    const assertOriginalUnchanged = async () => {
      await original.reload();
      assert.deepEqual({ name: original.name, phone: original.phone, email: original.email }, oldDetails);
      for (const old of oldOrders) {
        const stored = await Order.findByPk(old.id, { include: [{ model: Customer, as: 'customer' }] });
        assert.equal(stored.customer_id, original.id);
        assert.equal(stored.customer.name, oldDetails.name);
        assert.equal(stored.customer.email, oldDetails.email);
      }
    };

    await t.test('same name and phone without email cannot disclose a saved email', async () => {
      const result = await create({ customer_name: oldDetails.name, customer_phone: sharedPhone });
      assert.equal(result.status, 201);
      assert.deepEqual(result.body.data.customer, { name: oldDetails.name, phone: sharedPhone, email: null });
      assert.notEqual(result.body.data.customer_id, original.id);
      assert.equal(JSON.stringify(result.body).includes(oldDetails.email), false);
      await assertOriginalUnchanged();
    });

    await t.test('different name and email at the same phone cannot rewrite historical orders', async () => {
      const result = await create({ customer_name: 'Another guest', customer_phone: sharedPhone, customer_email: 'another@example.test' });
      assert.equal(result.status, 201);
      assert.deepEqual(result.body.data.customer, { name: 'Another guest', phone: sharedPhone, email: 'another@example.test' });
      assert.notEqual(result.body.data.customer_id, original.id);
      const tracked = await track(result.body.data);
      assert.deepEqual(tracked.customer, { name: 'Another guest', phone: sharedPhone });
      await assertOriginalUnchanged();
    });

    await t.test('reordering with identical contact details still creates independent identities', async () => {
      const details = { customer_name: 'Repeat guest', customer_phone: sharedPhone, customer_email: 'repeat@example.test' };
      const first = await create(details), second = await create(details);
      assert.equal(first.status, 201); assert.equal(second.status, 201);
      assert.notEqual(first.body.data.customer_id, second.body.data.customer_id);
      assert.deepEqual((await track(first.body.data)).customer, (await track(second.body.data)).customer);
      await assertOriginalUnchanged();
    });

    await t.test('omitted, null and empty contacts, phone-only and email-only checkout remain anonymous', async () => {
      for (const details of [
        {}, { customer_phone: null, customer_email: null }, { customer_phone: '', customer_email: '' },
        { customer_phone: sharedPhone }, { customer_email: oldDetails.email },
      ]) {
        const result = await create({ customer_name: 'Optional contact', ...details });
        assert.equal(result.status, 201);
        assert.deepEqual(result.body.data.customer, { name: 'Optional contact', phone: details.customer_phone || null, email: details.customer_email || null });
      }
      await assertOriginalUnchanged();
    });

    await t.test('authenticated POS orders also isolate contacts and staff detail remains available', async () => {
      const result = await create({ customer_name: 'POS guest', customer_phone: sharedPhone, order_type: 'kasir' }, staffHeaders);
      assert.equal(result.status, 201);
      assert.equal(result.body.data.cashier_id, owner.id);
      assert.notEqual(result.body.data.customer_id, original.id);
      const response = await fetch(`${base}/${result.body.data.id}`, { headers: staffHeaders });
      assert.equal(response.status, 200);
      assert.equal((await response.json()).data.customer.name, 'POS guest');
      await assertOriginalUnchanged();
    });

    await t.test('simultaneous same-phone orders preserve each submitted identity', async () => {
      const results = await Promise.all(Array.from({ length: 5 }, (_, i) => create({ customer_name: `Concurrent ${i}`, customer_phone: sharedPhone, customer_email: `guest${i}@example.test` })));
      const ids = new Set();
      for (const [i, result] of results.entries()) {
        assert.equal(result.status, 201);
        ids.add(result.body.data.customer_id);
        assert.deepEqual(result.body.data.customer, { name: `Concurrent ${i}`, phone: sharedPhone, email: `guest${i}@example.test` });
        assert.equal((await track(result.body.data)).customer.name, `Concurrent ${i}`);
      }
      assert.equal(ids.size, 5);
      await assertOriginalUnchanged();
    });

    await t.test('invalid orders roll back the new guest record without changing existing customers', async () => {
      const count = await Customer.count();
      const result = await create({ customer_name: 'Rejected', customer_phone: sharedPhone }, {}, [{ menu_id: menu.id, qty: 0 }]);
      assert.equal(result.status, 400);
      assert.equal(await Customer.count(), count);
      await assertOriginalUnchanged();
    });
  } finally {
    if (server) await new Promise(resolve => server.close(resolve));
    await sequelize.close();
    await admin.query(`DROP DATABASE \`${database}\``);
    await admin.end();
  }
});
