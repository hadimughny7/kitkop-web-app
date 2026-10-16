const test = require('node:test');
const assert = require('node:assert/strict');

test('concurrent orders have unique numbers, correct contents and atomic retry/rollback', { skip: process.env.KITKOP_OPTIONS_DB_TEST !== 'true' }, async () => {
  require('dotenv').config();
  const mysql = require('mysql2/promise');
  const database = `kitkop_numbers_test_${process.pid}`;
  const admin = await mysql.createConnection({ host: process.env.DB_HOST, port: process.env.DB_PORT || 3306, user: process.env.DB_USER, password: process.env.DB_PASSWORD });
  await admin.query(`CREATE DATABASE \`${database}\``);
  process.env.DB_NAME = database;
  const { sequelize } = require('../config/database');
  const { Order, OrderCounter, OrderItem, Customer, OrderStatusLog, Menu, MenuCategory } = require('../models');
  const { allocateOrderNumber } = require('../services/orderNumbers');
  let server, child, exited;
  try {
    await sequelize.sync();
    // Upgrade an existing database and exercise idempotent startup migration.
    await OrderCounter.drop();
    const prefix = `ORD-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-`;
    await Order.create({ order_number: `${prefix}0042` });
    const migrate = require('../migrations/add-order-counters');
    await migrate(); await migrate();
    const category = await MenuCategory.create({ name: 'Test' });
    const menu = await Menu.create({ category_id: category.id, name: 'Menu A', price: 10000 });
    const second = await Menu.create({ category_id: category.id, name: 'Menu B', price: 7000 });
    const express = require('express');
    const app = express(); app.use(express.json());
    const events = [];
    app.set('io', { emit: (...args) => events.push(args) });
    app.use('/api/orders', require('../routes/orderRoutes'));
    app.use((err, req, res, next) => res.status(err.statusCode || 500).json({ message: err.message }));
    server = app.listen(0, '127.0.0.1');
    await new Promise(resolve => server.once('listening', resolve));
    const base = `http://127.0.0.1:${server.address().port}`;
    let serial = 0;
    const payload = () => {
      const id = ++serial;
      return { customer_name: `Customer ${id}`, items: [{ menu_id: id % 2 ? menu.id : second.id, qty: id % 3 + 1, notes: `Request ${id}` }] };
    };
    const post = async (body, host = base) => {
      const response = await fetch(`${host}/api/orders`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      return { status: response.status, body: await response.json() };
    };
    const batch = async (size, otherBase = base) => {
      const inputs = Array.from({ length: size }, payload);
      const results = await Promise.all(inputs.map((body, index) => post(body, index % 2 ? otherBase : base)));
      const numbers = [];
      for (let index = 0; index < size; index++) {
        const result = results[index];
        assert.equal(result.status, 201, JSON.stringify(result));
        const data = result.body.data;
        numbers.push(data.order_number);
        assert.equal(data.customer.name, inputs[index].customer_name);
        assert.equal(data.items.length, 1);
        assert.equal(data.items[0].menu_id, inputs[index].items[0].menu_id);
        assert.equal(data.items[0].qty, inputs[index].items[0].qty);
        assert.equal(data.items[0].notes, inputs[index].items[0].notes);
        const expectedSubtotal = data.items[0].qty * (data.items[0].menu_id === menu.id ? 10000 : 7000);
        assert.equal(Number(data.subtotal), expectedSubtotal);
        assert.equal(Number(data.total), expectedSubtotal + Math.round(expectedSubtotal * 0.1));
        assert.equal(await OrderStatusLog.count({ where: { order_id: data.id } }), 1);
        const saved = await OrderItem.findOne({ where: { order_id: data.id } });
        assert.equal(saved.notes, inputs[index].items[0].notes);
      }
      assert.equal(new Set(numbers).size, size);
      return numbers;
    };
    const first = await batch(5);
    assert.deepEqual(first.map(number => Number(number.slice(13))).sort((a, b) => a - b), [43, 44, 45, 46, 47]);

    // Use a second real server process to rule out a process-local mutex solution.
    const reserve = require('node:net').createServer();
    await new Promise(resolve => reserve.listen(0, '127.0.0.1', resolve));
    const port = reserve.address().port;
    await new Promise(resolve => reserve.close(resolve));
    child = require('node:child_process').spawn(process.execPath, ['server.js'], {
      cwd: require('node:path').resolve(__dirname, '..'), env: { ...process.env, PORT: String(port) }, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'],
    });
    let startupOutput = '';
    child.stdout.on('data', chunk => { startupOutput += chunk; });
    child.stderr.on('data', chunk => { startupOutput += chunk; });
    exited = new Promise(resolve => child.once('exit', resolve));
    const otherBase = `http://127.0.0.1:${port}`;
    let ready = false;
    for (let attempt = 0; attempt < 150; attempt++) {
      if (child.exitCode !== null) break;
      try { ready = (await fetch(`${otherBase}/api/health`)).ok; } catch { /* Starting. */ }
      if (ready) break;
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    assert.equal(ready, true, `Second server must start: ${startupOutput}`);
    // Both processes compete to allocate the first counter row on an existing day.
    await OrderCounter.destroy({ where: {} });
    const many = await batch(30, otherBase);
    assert.deepEqual(many.map(number => Number(number.slice(13))).sort((a, b) => a - b), Array.from({ length: 30 }, (_, index) => index + 48));
    assert.equal(await Order.count(), 36);
    assert.equal(await Customer.count(), 35);
    assert.equal(await OrderItem.count(), 35);
    assert.equal(await OrderStatusLog.count(), 35);

    // A stale/imported counter really hits the UNIQUE constraint and retries.
    const dateKey = prefix.slice(4, 12);
    await OrderCounter.update({ last_sequence: 76 }, { where: { date_key: dateKey } });
    const retried = await post(payload());
    assert.equal(retried.status, 201, JSON.stringify(retried));
    assert.equal(retried.body.data.order_number, `${prefix}0078`);
    assert.equal(await Customer.count(), 36, 'failed attempt must not leave a customer');
    assert.equal(await OrderItem.count(), 36);
    assert.equal(await OrderStatusLog.count(), 36);

    // Failure after allocation rolls back the counter and all order side effects.
    const beforeEvents = events.length;
    // Unknown tables are rejected before allocation; force a later SQL failure instead.
    await sequelize.query("CREATE TRIGGER order_number_test_failure BEFORE INSERT ON order_items FOR EACH ROW BEGIN IF NEW.notes = 'FAIL-ORDER-NUMBER-TEST' THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'intentional order item failure'; END IF; END");
    const failingPayload = payload(); failingPayload.items[0].notes = 'FAIL-ORDER-NUMBER-TEST';
    let invalid;
    try { invalid = await post(failingPayload); }
    finally { await sequelize.query('DROP TRIGGER order_number_test_failure'); }
    assert.equal(invalid.status, 500);
    assert.equal(Number((await OrderCounter.findByPk(dateKey)).last_sequence), 78);
    assert.equal(await Customer.count(), 36);
    assert.equal(await Order.count(), 37);
    assert.equal(events.length, beforeEvents);
    assert.equal((await post(payload())).body.data.order_number, `${prefix}0079`);

    // Numeric bootstrap past 9999, day rollover, and rollback of a new day.
    await Order.create({ order_number: 'ORD-20990101-9999' });
    await Order.create({ order_number: 'ORD-20990101-10000' });
    const allocate = now => sequelize.transaction(t => allocateOrderNumber(t, { now: new Date(now) }));
    assert.equal(await allocate('2099-01-01T12:00:00Z'), 'ORD-20990101-10001');
    assert.equal(await allocate('2099-01-02T12:00:00Z'), 'ORD-20990102-0001');
    await assert.rejects(sequelize.transaction(async t => {
      await allocateOrderNumber(t, { now: new Date('2099-01-03T12:00:00Z') });
      throw new Error('intentional rollback');
    }), /intentional rollback/);
    assert.equal(await OrderCounter.findByPk('20990103'), null);
    assert.equal(await allocate('2099-01-03T12:00:00Z'), 'ORD-20990103-0001');
    await OrderCounter.create({ date_key: '20990104', last_sequence: 9999999 });
    await assert.rejects(allocate('2099-01-04T12:00:00Z'), error => error.statusCode === 503);
    assert.equal(Number((await OrderCounter.findByPk('20990104')).last_sequence), 9999999);
  } finally {
    if (child) { if (child.exitCode === null) child.kill(); await exited; }
    if (server) await new Promise(resolve => server.close(resolve));
    await sequelize.close();
    if (!/^kitkop_numbers_test_\d+$/.test(database)) throw new Error('Unexpected test database');
    await admin.query(`DROP DATABASE \`${database}\``);
    await admin.end();
  }
});

test('order retries are limited to order-number conflicts and transient database locks', () => {
  const { isRetryableOrderError } = require('../services/orderNumbers');
  assert.equal(isRetryableOrderError({ name: 'SequelizeUniqueConstraintError', fields: { order_number: 'duplicate' } }), true);
  assert.equal(isRetryableOrderError({ name: 'SequelizeUniqueConstraintError', errors: [{ path: 'order_number' }] }), true);
  assert.equal(isRetryableOrderError({ name: 'SequelizeUniqueConstraintError', fields: { email: 'duplicate' } }), false);
  assert.equal(isRetryableOrderError({ original: { code: 'ER_LOCK_DEADLOCK' } }), true);
  assert.equal(isRetryableOrderError({ original: { code: 'ER_LOCK_WAIT_TIMEOUT' } }), true);
  assert.equal(isRetryableOrderError(new Error('unrelated failure')), false);
});
