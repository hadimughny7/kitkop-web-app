const test = require('node:test');
const assert = require('node:assert/strict');

test('all manual stock endpoints reject malformed quantities without partial writes or logs', { skip: process.env.KITKOP_OPTIONS_DB_TEST !== 'true' }, async t => {
  require('dotenv').config();
  assert.ok(['localhost', '127.0.0.1', '::1'].includes(process.env.DB_HOST), 'Use a local test database only');
  process.env.JWT_SECRET = 'stock-quantities-test';
  const mysql = require('mysql2/promise');
  const database = `kitkop_stock_quantities_test_${process.pid}`;
  const admin = await mysql.createConnection({ host: process.env.DB_HOST, port: process.env.DB_PORT || 3306, user: process.env.DB_USER, password: process.env.DB_PASSWORD });
  await admin.query(`CREATE DATABASE \`${database}\``); process.env.DB_NAME = database;
  const { sequelize } = require('../config/database');
  const { User, RawMaterial, StockLog } = require('../models');
  const { MAX_STOCK } = require('../services/stockQuantities');
  let server;
  try {
    await sequelize.sync();
    const user = await User.create({ name: 'Owner', username: 'owner', email: 'owner@example.test', role: 'owner', password_hash: 'test' });
    const token = require('jsonwebtoken').sign({ id: user.id }, process.env.JWT_SECRET, { expiresIn: '1h' });
    const express = require('express'); const app = express(); app.use(express.json()); app.use(express.urlencoded({ extended: true }));
    const events = [];
    app.set('io', { to: () => ({ emit: event => events.push(event) }) });
    app.use('/api/stocks', require('../routes/stockRoutes'));
    app.use((err, req, res, next) => res.status(err.statusCode || 500).json({ message: err.message }));
    server = app.listen(0, '127.0.0.1'); await new Promise(resolve => server.once('listening', resolve));
    const base = `http://127.0.0.1:${server.address().port}/api/stocks`;
    const request = async (path, method, body, expected = 200, form = false) => {
      const response = await fetch(base + path, { method, headers: { Authorization: `Bearer ${token}`, 'Content-Type': form ? 'application/x-www-form-urlencoded' : 'application/json' }, body: form ? new URLSearchParams(body).toString() : JSON.stringify(body) });
      const data = await response.json();
      assert.equal(response.status, expected, `${method} ${path}: ${JSON.stringify(data)}`);
      return data.data;
    };
    const raw = await RawMaterial.create({ name: 'Unchanged', unit: 'gram', stock: 100, min_stock: 10, status: 'aman' });
    await raw.reload();
    const original = raw.toJSON();
    const invalid = ['5abc', '5 gram', '', ' ', null, true, false, [], [5], {}, '-1', -1, 'Infinity', 'NaN', '0x10', '1,000', '1e3', '1e-999', 10000000000, 0.001, 1.234, 1e-17];
    const unchanged = async () => {
      assert.deepEqual((await raw.reload()).toJSON(), original);
      assert.equal(await StockLog.count(), 0);
      assert.equal(events.length, 0);
    };

    await t.test('create rejects invalid stock and min_stock instead of silently replacing them with zero', async () => {
      for (const field of ['stock', 'min_stock']) {
        for (const value of invalid) {
          await request('', 'POST', { name: 'Invalid', unit: 'gram', stock: 0, min_stock: 0, [field]: value }, 400);
          assert.equal(await RawMaterial.count(), 1);
        }
      }
      await unchanged();
    });

    await t.test('update validates both quantities without saving other submitted fields on failure', async () => {
      for (const field of ['stock', 'min_stock']) {
        for (const value of invalid) {
          await request(`/${raw.id}`, 'PUT', { name: 'Must not save', stock: 50, min_stock: 5, [field]: value }, 400);
          await unchanged();
        }
      }
    });

    await t.test('restock and reduce reject invalid, omitted and zero quantities and release transaction locks', async () => {
      for (const action of ['restock', 'reduce']) {
        for (const quantity of [...invalid, undefined, 0, '0', '0.00']) {
          await request(`/${raw.id}/${action}`, 'POST', { quantity }, 400);
          await unchanged();
        }
      }
    });

    await t.test('valid zero, numeric strings, decimal fractions, omitted defaults and partial edits remain supported', async () => {
      const defaults = await request('', 'POST', { name: 'Default zeros', unit: 'gram' }, 201);
      assert.equal(Number(defaults.stock), 0); assert.equal(Number(defaults.min_stock), 0);
      assert.equal(defaults.status, 'kritis');
      const created = await request('', 'POST', { name: 'Fraction', unit: 'ml', stock: '5.25', min_stock: '2.50' }, 201, true);
      assert.equal(Number(created.stock), 5.25);
      const metadata = await request(`/${created.id}`, 'PUT', { name: 'Renamed' });
      assert.equal(Number(metadata.stock), 5.25); assert.equal(Number(metadata.min_stock), 2.5);
      const zeroed = await request(`/${created.id}`, 'PUT', { stock: 0, min_stock: '0' });
      assert.equal(Number(zeroed.stock), 0); assert.equal(zeroed.status, 'kritis');
      const restocked = await request(`/${created.id}/restock`, 'POST', { quantity: '0.30' }, 200, true);
      assert.equal(Number(restocked.stock), 0.3);
      const reduced = await request(`/${created.id}/reduce`, 'POST', { quantity: '0.20' });
      assert.equal(Number(reduced.stock), 0.1);
      const empty = await request(`/${created.id}/reduce`, 'POST', { quantity: '0.10' });
      assert.equal(Number(empty.stock), 0); assert.equal(empty.status, 'kritis');
      const logs = await StockLog.findAll({ where: { raw_material_id: created.id }, order: [['id', 'ASC']] });
      assert.deepEqual(logs.map(log => Number(log.change_qty)), [0.3, -0.2, -0.1]);
      assert.equal(events.length, 3);
    });

    await t.test('restock checks the resulting balance under lock, including concurrent overflow at the maximum', async () => {
      const created = await request('', 'POST', { name: 'Max stock', unit: 'gram', stock: MAX_STOCK - 0.01, min_stock: MAX_STOCK }, 201);
      assert.equal(Number(created.min_stock), MAX_STOCK);
      const results = await Promise.all(Array.from({ length: 5 }, async () => {
        const response = await fetch(`${base}/${created.id}/restock`, { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ quantity: 0.01 }) });
        await response.json(); return response.status;
      }));
      assert.equal(results.filter(status => status === 200).length, 1);
      assert.equal(results.filter(status => status === 400).length, 4);
      assert.equal(Number((await RawMaterial.findByPk(created.id)).stock), MAX_STOCK);
      assert.equal(await StockLog.count({ where: { raw_material_id: created.id } }), 1);
      await request(`/${created.id}/reduce`, 'POST', { quantity: MAX_STOCK });
      assert.equal(Number((await RawMaterial.findByPk(created.id)).stock), 0);
    });

    await t.test('previous automatic negative stock can still be restocked, and manual edits cannot introduce negatives', async () => {
      const negative = await RawMaterial.create({ name: 'Previously consumed', unit: 'gram', stock: -5, min_stock: 0, status: 'kritis' });
      const partial = await request(`/${negative.id}/restock`, 'POST', { quantity: 2 });
      assert.equal(Number(partial.stock), -3);
      const full = await request(`/${negative.id}/restock`, 'POST', { quantity: 5 });
      assert.equal(Number(full.stock), 2); assert.equal(full.status, 'aman');
      await request(`/${negative.id}`, 'PUT', { stock: -1 }, 400);
      assert.equal(Number((await negative.reload()).stock), 2);
    });
  } finally {
    if (server) await new Promise(resolve => server.close(resolve));
    await sequelize.close(); await admin.query(`DROP DATABASE \`${database}\``); await admin.end();
  }
});
