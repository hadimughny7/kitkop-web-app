const test = require('node:test');
const assert = require('node:assert/strict');

test('manual stock changes serialize with payments and refunds and commit together with logs', { skip: process.env.KITKOP_OPTIONS_DB_TEST !== 'true' }, async t => {
  require('dotenv').config();
  assert.ok(['localhost', '127.0.0.1', '::1'].includes(process.env.DB_HOST), 'Use a local test database only');
  process.env.JWT_SECRET = 'stock-concurrency-test';
  const mysql = require('mysql2/promise');
  const database = `kitkop_stock_concurrency_test_${process.pid}`;
  const admin = await mysql.createConnection({ host: process.env.DB_HOST, port: process.env.DB_PORT || 3306, user: process.env.DB_USER, password: process.env.DB_PASSWORD });
  await admin.query(`CREATE DATABASE \`${database}\``);
  process.env.DB_NAME = database;
  const { sequelize } = require('../config/database');
  const { User, RawMaterial, StockLog, MenuCategory, Menu, Order, OrderItem, Transaction } = require('../models');
  let server;
  try {
    await sequelize.sync();
    const user = await User.create({ name: 'Owner test', username: 'owner', email: 'owner@example.test', role: 'owner', password_hash: 'test' });
    const jwt = require('jsonwebtoken');
    const token = jwt.sign({ id: user.id }, process.env.JWT_SECRET, { expiresIn: '1h' });
    const category = await MenuCategory.create({ name: 'Test', item_type: 'makanan' });
    const menu = await Menu.create({ category_id: category.id, name: 'Test menu', price: 10000 });
    const express = require('express');
    const app = express(); app.use(express.json());
    const events = [];
    app.set('io', { to: () => ({ emit: event => events.push(event) }) });
    app.use('/api/stocks', require('../routes/stockRoutes'));
    app.use('/api/orders', require('../routes/orderRoutes'));
    app.use('/api/payments', require('../routes/paymentRoutes'));
    app.use((err, req, res, next) => res.status(err.statusCode || 500).json({ success: false, message: err.message }));
    server = app.listen(0, '127.0.0.1'); await new Promise(resolve => server.once('listening', resolve));
    const base = `http://127.0.0.1:${server.address().port}/api`;
    const request = async (path, method = 'POST', body = {}, auth = token) => {
      const response = await fetch(base + path, { method, headers: { 'Content-Type': 'application/json', ...(auth ? { Authorization: `Bearer ${auth}` } : {}) }, body: JSON.stringify(body) });
      return { status: response.status, body: await response.json() };
    };
    const expectSuccess = results => {
      for (const result of results) assert.equal(result.status, 200, JSON.stringify(result.body));
    };
    let serial = 0;
    const material = (stock = 100, min_stock = 20) => RawMaterial.create({ name: `Material ${++serial}`, stock, min_stock, unit: 'gram', status: stock <= 0 ? 'kritis' : stock <= min_stock ? 'menipis' : 'aman' });
    const order = async (raw, quantity = 2) => {
      const row = await Order.create({ order_number: `STOCK-${++serial}`, total: 10000 });
      await OrderItem.create({ order_id: row.id, menu_id: menu.id, qty: 1, price: 10000, stock_usage: [{ raw_material_id: raw.id, quantity_used: quantity }] });
      return row;
    };
    const verify = async (raw, expected, expectedLogs) => {
      await raw.reload();
      assert.equal(Number(raw.stock), expected);
      assert.equal(raw.status, expected <= 0 ? 'kritis' : expected <= Number(raw.min_stock) ? 'menipis' : 'aman');
      const logs = await StockLog.findAll({ where: { raw_material_id: raw.id } });
      assert.equal(logs.length, expectedLogs);
      return logs;
    };
    // Reproduce the audited schedule if a regression ever uses unprotected reads:
    // all five requests finish reading before any can write. Locked reads proceed normally.
    const simultaneous = async (raw, count, run) => {
      let release, timer, arrived = 0;
      const gate = new Promise(resolve => { release = resolve; });
      RawMaterial.addHook('afterFind', 'audit-concurrent-reads', async (row, options) => {
        if (row?.id !== raw.id || options.lock) return;
        if (++arrived === count) release();
        await gate;
      });
      timer = setTimeout(release, 3000);
      try { return await run(); } finally {
        clearTimeout(timer); release(); RawMaterial.removeHook('afterFind', 'audit-concurrent-reads');
      }
    };

    await t.test('five concurrent restocks add all 50 units and preserve five logs', async () => {
      const raw = await material();
      const results = await simultaneous(raw, 5, () => Promise.all(Array.from({ length: 5 }, () => request(`/stocks/${raw.id}/restock`, 'POST', { quantity: 10 }))));
      expectSuccess(results);
      const logs = await verify(raw, 150, 5);
      assert.equal(logs.reduce((sum, log) => sum + Number(log.change_qty), 0), 50);
      assert.deepEqual(results.map(r => Number(r.body.data.stock)).sort((a, b) => a - b), [110, 120, 130, 140, 150]);
      assert.ok(logs.every(log => log.type === 'restock' && log.created_by === user.id));
    });

    await t.test('concurrent reductions retain every decrement and reject reductions beyond the latest stock', async () => {
      const raw = await material();
      expectSuccess(await simultaneous(raw, 5, () => Promise.all(Array.from({ length: 5 }, () => request(`/stocks/${raw.id}/reduce`, 'POST', { quantity: 10 })))));
      await verify(raw, 50, 5);
      const limited = await material(25);
      const results = await simultaneous(limited, 5, () => Promise.all(Array.from({ length: 5 }, () => request(`/stocks/${limited.id}/reduce`, 'POST', { quantity: 10 }))));
      assert.equal(results.filter(r => r.status === 200).length, 2);
      assert.equal(results.filter(r => r.status === 400).length, 3);
      await verify(limited, 5, 2);
    });

    await t.test('restock and reduction on one material preserve fractional changes and final status', async () => {
      const raw = await material(20, 30);
      expectSuccess(await simultaneous(raw, 5, () => Promise.all([
        ...Array.from({ length: 3 }, () => request(`/stocks/${raw.id}/restock`, 'POST', { quantity: '2.25' })),
        ...Array.from({ length: 2 }, () => request(`/stocks/${raw.id}/reduce`, 'POST', { quantity: '1.50' })),
      ])));
      const logs = await verify(raw, 23.75, 5);
      assert.equal(logs.reduce((sum, log) => sum + Number(log.change_qty), 0), 3.75);
      expectSuccess([await request(`/stocks/${raw.id}/reduce`, 'POST', { quantity: 23.75 })]);
      await verify(raw, 0, 6);
    });

    await t.test('manual changes and payments share the latest stock and repeated payments do not double deduct', async () => {
      const raw = await material();
      const orders = await Promise.all(Array.from({ length: 3 }, () => order(raw, 2)));
      // Multiple cash payments in the same millisecond must also keep unique refs.
      const originalNow = Date.now;
      const now = Date.now();
      Date.now = () => now;
      try {
        expectSuccess(await Promise.all([
          ...orders.map(row => request(`/payments/${row.id}/cash`)),
          ...Array.from({ length: 3 }, () => request(`/stocks/${raw.id}/restock`, 'POST', { quantity: 10 })),
          ...Array.from({ length: 2 }, () => request(`/stocks/${raw.id}/reduce`, 'POST', { quantity: 5 })),
        ]));
      } finally { Date.now = originalNow; }
      await verify(raw, 114, 8);
      expectSuccess(await Promise.all(orders.map(row => request(`/payments/${row.id}/cash`))));
      await verify(raw, 114, 8);
      const refs = new Set();
      for (const row of orders) {
        assert.equal((await row.reload()).status, 'confirmed');
        const payment = await Transaction.findOne({ where: { order_id: row.id } });
        assert.equal(payment.status, 'paid'); refs.add(payment.ref_id);
      }
      assert.equal(refs.size, 3);
    });

    await t.test('refunds serialize with restock and manual reduction without restoring twice', async () => {
      const raw = await material();
      const paid = await order(raw, 6);
      expectSuccess([await request(`/payments/${paid.id}/cash`)]);
      expectSuccess(await Promise.all([
        request(`/orders/${paid.id}/status`, 'PATCH', { status: 'cancelled' }),
        request(`/stocks/${raw.id}/restock`, 'POST', { quantity: 10 }),
        request(`/stocks/${raw.id}/reduce`, 'POST', { quantity: 5 }),
      ]));
      await verify(raw, 105, 4);
      expectSuccess([await request(`/orders/${paid.id}/status`, 'PATCH', { status: 'cancelled' })]);
      await verify(raw, 105, 4);
    });

    await t.test('metadata and absolute stock edits wait for committed stock before recalculating status', async () => {
      const raw = await material(10, 20);
      const held = await sequelize.transaction();
      let pending;
      try {
        const locked = await RawMaterial.findByPk(raw.id, { transaction: held, lock: held.LOCK.UPDATE });
        let started;
        const reading = new Promise(resolve => { started = resolve; });
        RawMaterial.addHook('beforeFind', 'audit-edit-wait', options => {
          if (Number(options.where?.id) === raw.id) started();
        });
        pending = request(`/stocks/${raw.id}`, 'PUT', { name: 'Renamed', min_stock: 30 });
        await reading;
        await locked.update({ stock: 40, status: 'aman' }, { transaction: held });
        await held.commit();
        expectSuccess([await pending]);
      } finally {
        RawMaterial.removeHook('beforeFind', 'audit-edit-wait');
        if (!held.finished) await held.rollback();
        if (pending) await pending;
      }
      await verify(raw, 40, 0);
      assert.equal(raw.name, 'Renamed');
      expectSuccess([await request(`/stocks/${raw.id}`, 'PUT', { stock: 5 })]);
      await verify(raw, 5, 0);
      expectSuccess([await request(`/stocks/${raw.id}/restock`, 'POST', { quantity: 10 })]);
      await verify(raw, 15, 1);
    });

    await t.test('failed log writes roll back stock/status and emit no stock notification', async () => {
      await sequelize.query(`CREATE TRIGGER audit_reject_stock_log BEFORE INSERT ON stock_logs FOR EACH ROW
        BEGIN IF NEW.notes = 'audit-reject-log' THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Test log failure'; END IF; END`);
      try {
        for (const action of ['restock', 'reduce']) {
          const raw = await material(10, 10);
          await raw.reload(); // Compare the DB timestamp precision, not the create instance's milliseconds.
          const before = raw.toJSON();
          const eventCount = events.length;
          const response = await request(`/stocks/${raw.id}/${action}`, 'POST', { quantity: 10, notes: 'audit-reject-log' });
          assert.equal(response.status, 500);
          await verify(raw, 10, 0);
          assert.equal(raw.updated_at.getTime(), before.updated_at.getTime());
          assert.equal(events.length, eventCount);
          expectSuccess([await request(`/stocks/${raw.id}/restock`, 'POST', { quantity: 1 })]);
          await verify(raw, 11, 1);
          assert.equal(events.length, eventCount + 1);
        }
      } finally { await sequelize.query('DROP TRIGGER audit_reject_stock_log'); }
    });

    await t.test('missing materials, invalid amounts and unauthorized writes change nothing and release locks', async () => {
      const raw = await material();
      const eventCount = events.length;
      for (const action of ['restock', 'reduce']) {
        for (const quantity of [0, -1, null]) assert.equal((await request(`/stocks/${raw.id}/${action}`, 'POST', { quantity })).status, 400);
        assert.equal((await request(`/stocks/2147483647/${action}`, 'POST', { quantity: 1 })).status, 404);
        assert.equal((await request(`/stocks/${raw.id}/${action}`, 'POST', { quantity: 1 }, null)).status, 401);
      }
      assert.equal((await request('/stocks/2147483647', 'PUT', { name: 'Missing' })).status, 404);
      await verify(raw, 100, 0);
      assert.equal(events.length, eventCount);
      expectSuccess([await request(`/stocks/${raw.id}/restock`, 'POST', { quantity: 1 })]);
      await verify(raw, 101, 1);
    });
  } finally {
    if (server) await new Promise(resolve => server.close(resolve));
    await sequelize.close();
    await admin.query(`DROP DATABASE \`${database}\``); await admin.end();
  }
});
