const test = require('node:test');
const assert = require('node:assert/strict');

test('new orders require an existing active table when a table is supplied', { skip: process.env.KITKOP_OPTIONS_DB_TEST !== 'true' }, async t => {
  require('dotenv').config();
  process.env.JWT_SECRET = 'order-table-integration-test';
  const mysql = require('mysql2/promise');
  const database = `kitkop_order_tables_test_${process.pid}`;
  const admin = await mysql.createConnection({ host: process.env.DB_HOST, port: process.env.DB_PORT || 3306, user: process.env.DB_USER, password: process.env.DB_PASSWORD });
  await admin.query(`CREATE DATABASE \`${database}\``);
  process.env.DB_NAME = database;
  const { sequelize } = require('../config/database');
  const { User, Table, MenuCategory, Menu, MenuRecipe, RawMaterial, Customer, Order, OrderCounter, OrderItem, OrderStatusLog, Transaction, StockLog } = require('../models');
  let server;
  try {
    await sequelize.sync();
    const owner = await User.create({ name: 'Owner', username: 'owner', email: 'owner@example.test', password_hash: 'test', role: 'owner' });
    const active = await Table.create({ table_number: 'A1', is_active: 1 });
    const inactive = await Table.create({ table_number: 'B1', is_active: 0 });
    const category = await MenuCategory.create({ name: 'Test' });
    const menu = await Menu.create({ category_id: category.id, name: 'Kopi test', price: 10000 });
    const material = await RawMaterial.create({ name: 'Test material', stock: 1000, unit: 'gram' });
    await MenuRecipe.create({ menu_id: menu.id, raw_material_id: material.id, quantity_used: 0.5 });
    await Customer.create({ name: 'Original customer', phone: '081234', email: 'original@example.test' });
    const express = require('express');
    const app = express(); app.use(express.json());
    const events = [];
    app.set('io', { emit: (...args) => events.push(args) });
    app.use('/api/orders', require('../routes/orderRoutes'));
    app.use('/api/tables', require('../routes/tableRoutes'));
    app.use('/api/payments', require('../routes/paymentRoutes'));
    app.use((err, req, res, next) => res.status(err.statusCode || 500).json({ message: err.message }));
    server = app.listen(0, '127.0.0.1'); await new Promise(resolve => server.once('listening', resolve));
    const jwt = require('jsonwebtoken');
    const request = async (path, method = 'POST', body, staff = false) => {
      const headers = { 'Content-Type': 'application/json' };
      if (staff) headers.Authorization = `Bearer ${jwt.sign({ id: owner.id }, process.env.JWT_SECRET)}`;
      const response = await fetch(`http://127.0.0.1:${server.address().port}/api${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
      return { status: response.status, body: await response.json() };
    };
    const payload = table_id => ({ table_id, customer_name: 'New customer', order_type: 'qr', items: [{ menu_id: menu.id, qty: 2 }] });
    const snapshot = async () => ({
      customers: (await Customer.findAll({ order: [['id', 'ASC']] })).map(row => row.toJSON()),
      orders: await Order.count(), items: await OrderItem.count(), statusLogs: await OrderStatusLog.count(),
      payments: await Transaction.count(), stockLogs: await StockLog.count(), stock: Number((await material.reload()).stock),
      counters: (await OrderCounter.findAll({ order: [['date_key', 'ASC']] })).map(row => row.toJSON()), events: events.length,
    });

    await t.test('inactive and nonexistent tables reject QR and POS requests without side effects', async () => {
      const before = await snapshot();
      for (const staff of [false, true]) {
        for (const [id, expected] of [[inactive.id, 409], [2147483647, 404]]) {
          const data = { ...payload(id), order_type: staff ? 'kasir' : 'qr' };
          const result = await request('/orders', 'POST', data, staff);
          assert.equal(result.status, expected, JSON.stringify(result));
          assert.deepEqual(await snapshot(), before);
          // Rejected orders must not alter an existing customer's name/email either.
          const existing = await request('/orders', 'POST', { ...data, customer_phone: '081234', customer_email: 'changed@example.test' }, staff);
          assert.equal(existing.status, expected, JSON.stringify(existing));
          assert.deepEqual(await snapshot(), before);
        }
      }
    });

    await t.test('malformed IDs cannot be coerced into an active table or silently treated as no table', async () => {
      const before = await snapshot();
      for (const id of [0, -1, 1.5, true, false, '', ' ', 'A1', '1abc', '0x1', '1.5', [], [active.id], {}, 2147483648]) {
        const result = await request('/orders', 'POST', payload(id));
        assert.equal(result.status, 400, JSON.stringify(result));
        assert.deepEqual(await snapshot(), before);
      }
    });

    await t.test('active tables, numeric string IDs and tableless orders retain existing behavior', async () => {
      for (const staff of [false, true]) {
        for (const id of [active.id, String(active.id), null, undefined]) {
          const result = await request('/orders', 'POST', { ...payload(id), order_type: staff ? 'kasir' : 'qr' }, staff);
          assert.equal(result.status, 201, JSON.stringify(result));
          assert.equal(result.body.data.table_id, id == null ? null : active.id);
          assert.equal(result.body.data.items[0].qty, 2);
        }
      }
      const results = await Promise.all(Array.from({ length: 5 }, () => request('/orders', 'POST', payload(active.id))));
      assert.ok(results.every(result => result.status === 201), JSON.stringify(results));
      assert.equal(new Set(results.map(result => result.body.data.order_number)).size, 5);
    });

    await t.test('deactivation blocks new orders but existing orders can be paid and completed', async () => {
      const table = await Table.create({ table_number: 'C1', is_active: 1 });
      const created = await request('/orders', 'POST', payload(table.id));
      assert.equal(created.status, 201);
      const old = created.body.data;
      assert.equal((await request(`/tables/${table.id}`, 'PUT', { is_active: 0 }, true)).status, 200);
      const before = await snapshot();
      assert.equal((await request('/orders', 'POST', payload(table.id))).status, 409);
      assert.deepEqual(await snapshot(), before);
      assert.equal((await request(`/orders/track/${old.order_number}`, 'GET')).status, 200);
      assert.equal((await request(`/payments/${old.id}/cash`, 'POST', {}, true)).status, 200);
      assert.equal((await request(`/orders/${old.id}/items/process-all`, 'PATCH', {}, true)).status, 200);
      assert.equal((await request(`/orders/${old.id}/items/complete-all`, 'PATCH', {}, true)).status, 200);
      assert.equal((await Order.findByPk(old.id)).status, 'completed');
    });

    await t.test('bulk deactivation and later reactivation use the current database state', async () => {
      assert.equal((await request('/tables/bulk-toggle', 'PATCH', { is_active: 0 }, true)).status, 200);
      const before = await snapshot();
      assert.equal((await request('/orders', 'POST', payload(active.id))).status, 409);
      assert.deepEqual(await snapshot(), before);
      assert.equal((await request(`/tables/${active.id}`, 'PUT', { is_active: 1 }, true)).status, 200);
      assert.equal((await request('/orders', 'POST', payload(active.id))).status, 201);
    });

    await t.test('committed deactivation wins over an order waiting for the table row', async () => {
      const table = await Table.create({ table_number: 'R1', is_active: 1 });
      const transaction = await sequelize.transaction();
      let pending;
      try {
        await Table.findByPk(table.id, { transaction, lock: transaction.LOCK.UPDATE });
        await table.update({ is_active: 0 }, { transaction });
        pending = request('/orders', 'POST', payload(table.id));
        await transaction.commit();
        const result = await pending;
        assert.equal(result.status, 409, JSON.stringify(result));
        assert.equal(await Order.count({ where: { table_id: table.id } }), 0);
      } finally {
        if (!transaction.finished) await transaction.rollback();
        if (pending) await pending;
      }
    });

    await t.test('creation holds the active table lock until its order transaction commits', async () => {
      const table = await Table.create({ table_number: 'R2', is_active: 1 });
      let entered, resume, updating;
      const atInsert = new Promise(resolve => { entered = resolve; });
      const paused = new Promise(resolve => { resume = resolve; });
      const atUpdate = new Promise(resolve => { updating = resolve; });
      const timeout = () => new Promise((resolve, reject) => { const timer = setTimeout(() => reject(new Error('Test barrier timed out')), 10000); timer.unref(); });
      Order.addHook('beforeCreate', 'pause-table-order', async order => {
        if (order.table_id === table.id) { entered(); await paused; }
      });
      Table.addHook('beforeUpdate', 'signal-table-update', row => { if (row.id === table.id) updating(); });
      let creating, disabling;
      try {
        creating = request('/orders', 'POST', payload(table.id));
        await Promise.race([atInsert, timeout()]);
        disabling = request(`/tables/${table.id}`, 'PUT', { is_active: 0 }, true);
        await Promise.race([atUpdate, timeout()]);
        await new Promise(resolve => setTimeout(resolve, 50));
        assert.equal(Number((await Table.findByPk(table.id)).is_active), 1, 'deactivation cannot commit while creation holds the table lock');
        resume();
        const [created, disabled] = await Promise.all([creating, disabling]);
        assert.equal(created.status, 201, JSON.stringify(created));
        assert.equal(disabled.status, 200, JSON.stringify(disabled));
        assert.equal(Number((await Table.findByPk(table.id)).is_active), 0);
        assert.equal((await request('/orders', 'POST', payload(table.id))).status, 409);
      } finally {
        resume();
        Order.removeHook('beforeCreate', 'pause-table-order'); Table.removeHook('beforeUpdate', 'signal-table-update');
        await Promise.allSettled([creating, disabling].filter(Boolean));
      }
    });
  } finally {
    if (server) await new Promise(resolve => server.close(resolve));
    await sequelize.close();
    if (!/^kitkop_order_tables_test_\d+$/.test(database)) throw new Error('Unexpected test database');
    await admin.query(`DROP DATABASE \`${database}\``); await admin.end();
  }
});
