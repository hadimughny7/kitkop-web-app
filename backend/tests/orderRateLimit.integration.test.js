const test = require('node:test');
const assert = require('node:assert/strict');

test('order route enforces session limits before database writes and verifies separate staff accounts', { skip: process.env.KITKOP_OPTIONS_DB_TEST !== 'true' }, async () => {
  require('dotenv').config();
  const mysql = require('mysql2/promise');
  const jwt = require('jsonwebtoken');
  const database = `kitkop_order_limit_test_${process.pid}`;
  const admin = await mysql.createConnection({ host: process.env.DB_HOST, port: process.env.DB_PORT || 3306, user: process.env.DB_USER, password: process.env.DB_PASSWORD });
  await admin.query(`CREATE DATABASE \`${database}\``);
  process.env.DB_NAME = database;
  const { sequelize } = require('../config/database');
  const { Order, OrderItem, Customer, OrderStatusLog, Menu, MenuCategory, User } = require('../models');
  let server;
  try {
    await sequelize.sync();
    const category = await MenuCategory.create({ name: 'Coffee' });
    const menu = await Menu.create({ category_id: category.id, name: 'Limit test', price: 10000 });
    const staff = await Promise.all([1, 2].map(id => User.create({ name: `Cashier ${id}`, username: `cashier${id}`, email: `cashier${id}@example.com`, password_hash: 'test-only', role: 'kasir' })));
    const express = require('express');
    const app = express();
    app.use(express.json());
    app.use('/api/orders', require('../routes/orderRoutes'));
    app.use((error, req, res, next) => res.status(error.statusCode || 500).json({ message: error.message }));
    server = app.listen(0, '127.0.0.1');
    await new Promise(resolve => server.once('listening', resolve));
    const payload = { customer_name: 'Guest', order_type: 'qr', items: [{ menu_id: menu.id, qty: 1 }] };
    const post = async (session, auth, body = payload) => {
      const response = await fetch(`http://127.0.0.1:${server.address().port}/api/orders`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', ...(session ? { 'X-Order-Session': session } : {}), ...(auth ? { Authorization: `Bearer ${auth}` } : {}) }, body: JSON.stringify(body),
      });
      return { status: response.status, data: await response.json(), session: response.headers.get('x-order-session') };
    };
    const first = await post();
    assert.equal(first.status, 201, JSON.stringify(first));
    assert.equal(first.data.data.table_id, null);
    assert.ok(first.data.data.tracking_token);
    assert.equal(Number(first.data.data.total), 11000);
    for (let i = 0; i < 4; i++) assert.equal((await post(first.session)).status, 201);
    const before = await Promise.all([Order, OrderItem, Customer, OrderStatusLog].map(model => model.count()));
    const blocked = await post(first.session);
    assert.equal(blocked.status, 429);
    assert.equal(blocked.data.code, 'ORDER_RATE_LIMITED');
    assert.deepEqual(await Promise.all([Order, OrderItem, Customer, OrderStatusLog].map(model => model.count())), before);
    assert.equal((await post()).status, 201, 'another browser on the same network can order');
    assert.equal((await post(first.session, 'forged-staff-token')).status, 429, 'invalid staff tokens cannot gain a staff budget');

    const tokens = staff.map(user => jwt.sign({ id: user.id, sessionVersion: user.session_version }, process.env.JWT_SECRET, { algorithm: 'HS256', expiresIn: '1h' }));
    assert.equal((await post(first.session, tokens[0])).status, 201, 'verified staff do not inherit an exhausted guest session');
    for (let i = 0; i < 59; i++) assert.equal((await post(undefined, tokens[0], {})).status, 400);
    assert.equal((await post(undefined, tokens[0])).status, 429);
    assert.equal((await post(undefined, tokens[1])).status, 201, 'another cashier keeps an independent budget');
    assert.equal(await Order.count(), 8);
    assert.equal(await OrderItem.count(), 8);
    assert.equal(await Customer.count(), 8);
    assert.equal(await OrderStatusLog.count(), 8);
  } finally {
    if (server) await new Promise(resolve => server.close(resolve));
    await sequelize.close();
    if (!/^kitkop_order_limit_test_\d+$/.test(database)) throw new Error('Unexpected test database');
    await admin.query(`DROP DATABASE \`${database}\``);
    await admin.end();
  }
});
