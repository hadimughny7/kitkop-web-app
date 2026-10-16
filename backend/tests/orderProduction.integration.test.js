const test = require('node:test');
const assert = require('node:assert/strict');

test('production requires paid orders and preserves normal kitchen workflows', { skip: process.env.KITKOP_OPTIONS_DB_TEST !== 'true' }, async () => {
  require('dotenv').config();
  process.env.JWT_SECRET = 'production-integration-test';
  const mysql = require('mysql2/promise');
  const database = `kitkop_production_test_${process.pid}`;
  const connection = await mysql.createConnection({ host: process.env.DB_HOST, port: process.env.DB_PORT || 3306, user: process.env.DB_USER, password: process.env.DB_PASSWORD });
  await connection.query(`CREATE DATABASE \`${database}\``);
  process.env.DB_NAME = database;
  const { sequelize } = require('../config/database');
  const { User, MenuCategory, Menu, Order, OrderItem, Transaction, OrderStatusLog, StockLog } = require('../models');
  let server;
  try {
    await sequelize.sync();
    const kitchen = await User.create({ name: 'Kitchen test', email: 'kitchen@example.test', username: 'kitchen', password_hash: 'test', role: 'kitchen' });
    const cashier = await User.create({ name: 'Cashier test', email: 'cashier@example.test', username: 'cashier', password_hash: 'test', role: 'kasir' });
    const category = await MenuCategory.create({ name: 'Test' });
    const menu = await Menu.create({ category_id: category.id, name: 'Test menu', price: 5000 });
    const express = require('express');
    const app = express();
    app.use(express.json());
    const events = [];
    app.set('io', { to: () => ({ emit: (...args) => events.push(args) }) });
    app.use('/api/orders', require('../routes/orderRoutes'));
    app.use('/api/payments', require('../routes/paymentRoutes'));
    app.use((err, req, res, next) => res.status(err.statusCode || 500).json({ message: err.message }));
    server = app.listen(0, '127.0.0.1');
    await new Promise(resolve => server.once('listening', resolve));
    const jwt = require('jsonwebtoken');
    const request = async (path, body = {}, user = kitchen, method = 'PATCH') => {
      const response = await fetch(`http://127.0.0.1:${server.address().port}/api${path}`, {
        method,
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${jwt.sign({ id: user.id }, process.env.JWT_SECRET)}` },
        body: JSON.stringify(body),
      });
      return { status: response.status, body: await response.json() };
    };
    let serial = 0;
    const fixture = async (status, paymentStatus, itemStatuses = ['pending']) => {
      const order = await Order.create({ order_number: `PROD-${++serial}`, status, total: 5000, subtotal: 5000 });
      const items = await OrderItem.bulkCreate(itemStatuses.map(itemStatus => ({ order_id: order.id, menu_id: menu.id, qty: 1, price: 5000, status: itemStatus })));
      if (paymentStatus) await Transaction.create({ order_id: order.id, ref_id: `PROD-${serial}`, amount: 5000, status: paymentStatus });
      return { order, items };
    };
    const snapshot = async order => ({
      order: (await order.reload()).toJSON(),
      items: (await OrderItem.findAll({ where: { order_id: order.id }, order: [['id', 'ASC']] })).map(item => item.toJSON()),
      payments: (await Transaction.findAll({ where: { order_id: order.id } })).map(payment => payment.toJSON()),
      logs: await OrderStatusLog.count(),
      stockLogs: await StockLog.count(),
      events: events.length,
    });
    // Even inconsistent confirmed/preparing orders cannot bypass the payment check.
    for (const payment of [null, 'pending', 'expired', 'failed']) {
      for (const status of ['pending', 'confirmed', 'preparing']) {
        const { order, items } = await fixture(status, payment, [status === 'preparing' ? 'preparing' : 'pending']);
        const before = await snapshot(order);
        for (const action of ['process-all', 'complete-all']) {
          const result = await request(`/orders/${order.id}/items/${action}`);
          assert.equal(result.status, 409, JSON.stringify(result));
        }
        for (const nextStatus of ['preparing', 'completed']) {
          const result = await request(`/orders/${order.id}/items/${items[0].id}/status`, { status: nextStatus });
          assert.equal(result.status, 409, JSON.stringify(result));
        }
        const target = status === 'pending' ? 'confirmed' : status === 'confirmed' ? 'preparing' : 'completed';
        assert.equal((await request(`/orders/${order.id}/status`, { status: target }, cashier)).status, 409);
        assert.deepEqual(await snapshot(order), before, 'rejected production must have no side effects');
      }
    }
    for (const status of ['pending', 'cancelled', 'completed']) {
      const { order, items } = await fixture(status, 'paid');
      const before = await snapshot(order);
      assert.equal((await request(`/orders/${order.id}/items/process-all`)).status, 409);
      assert.equal((await request(`/orders/${order.id}/items/complete-all`)).status, 409);
      assert.equal((await request(`/orders/${order.id}/items/${items[0].id}/status`, { status: 'preparing' })).status, 409);
      assert.deepEqual(await snapshot(order), before);
    }
    // Real cash endpoint confirms payment before kitchen starts production.
    const bulk = await fixture('pending', null, ['pending', 'pending', 'rejected']);
    assert.equal((await request(`/payments/${bulk.order.id}/cash`, {}, cashier, 'POST')).status, 200);
    assert.equal((await bulk.order.reload()).status, 'confirmed');
    assert.equal((await request(`/orders/${bulk.order.id}/items/complete-all`)).status, 409);
    // Concurrent starts serialize and create only one preparing log.
    const starts = await Promise.all([request(`/orders/${bulk.order.id}/items/process-all`), request(`/orders/${bulk.order.id}/items/process-all`)]);
    assert.deepEqual(starts.map(result => result.status), [200, 200]);
    assert.equal(await OrderStatusLog.count({ where: { order_id: bulk.order.id, status: 'preparing' } }), 1);
    assert.equal((await request(`/orders/${bulk.order.id}/items/complete-all`)).status, 200);
    assert.equal((await bulk.order.reload()).status, 'completed');
    assert.equal((await bulk.items[2].reload()).status, 'rejected');
    assert.ok((await bulk.items[0].reload()).completed_at);
    const finished = await snapshot(bulk.order);
    assert.equal((await request(`/orders/${bulk.order.id}/items/complete-all`)).status, 409);
    assert.deepEqual(await snapshot(bulk.order), finished);

    // Mixed station work: one item can finish while another is still pending.
    const single = await fixture('confirmed', 'paid', ['pending', 'pending']);
    for (const item of single.items) {
      assert.equal((await request(`/orders/${single.order.id}/items/${item.id}/status`, { status: 'preparing' })).status, 200);
      assert.equal((await request(`/orders/${single.order.id}/items/${item.id}/status`, { status: 'completed' })).status, 200);
    }
    assert.equal((await single.order.reload()).status, 'completed');
    assert.equal(await OrderStatusLog.count({ where: { order_id: single.order.id, status: 'completed' } }), 1);
    const general = await fixture('confirmed', 'paid');
    assert.equal((await request(`/orders/${general.order.id}/status`, { status: 'preparing' }, cashier)).status, 200);
    assert.equal((await request(`/orders/${general.order.id}/status`, { status: 'completed' }, cashier)).status, 200);
    const cancellable = await fixture('pending', null);
    assert.equal((await request(`/orders/${cancellable.order.id}/status`, { status: 'cancelled' }, cashier)).status, 200);
  } finally {
    if (server) await new Promise(resolve => server.close(resolve));
    await sequelize.close();
    if (!/^kitkop_production_test_\d+$/.test(database)) throw new Error('Unexpected test database');
    await connection.query(`DROP DATABASE \`${database}\``);
    await connection.end();
  }
});
