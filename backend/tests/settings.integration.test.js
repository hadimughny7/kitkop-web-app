const test = require('node:test');
const assert = require('node:assert/strict');

test('settings validate before writing and commit or roll back as a unit', { skip: process.env.KITKOP_OPTIONS_DB_TEST !== 'true' }, async t => {
  require('dotenv').config();
  process.env.JWT_SECRET = 'settings-integration-test';
  const mysql = require('mysql2/promise');
  const database = `kitkop_settings_test_${process.pid}`;
  const admin = await mysql.createConnection({ host: process.env.DB_HOST, port: process.env.DB_PORT || 3306, user: process.env.DB_USER, password: process.env.DB_PASSWORD });
  await admin.query(`CREATE DATABASE \`${database}\``);
  process.env.DB_NAME = database;
  const { sequelize } = require('../config/database');
  const { Setting, User } = require('../models');
  let server;
  try {
    await sequelize.sync();
    const owner = await User.create({ name: 'Owner', username: 'owner', email: 'owner@example.test', password_hash: 'test', role: 'owner' });
    const manager = await User.create({ name: 'Manager', username: 'manager', email: 'manager@example.test', password_hash: 'test', role: 'manajer' });
    const cashier = await User.create({ name: 'Cashier', username: 'cashier', email: 'cashier@example.test', password_hash: 'test', role: 'kasir' });
    const reset = async () => {
      await Setting.destroy({ where: {} });
      await Setting.bulkCreate([
        { key: 'tax_percentage', value: '10', description: 'Original tax' },
        { key: 'service_charge_percentage', value: '0', description: 'Original service' },
        { key: 'unrelated', value: 'keep', description: 'Unrelated setting' },
      ]);
    };
    const snapshot = async () => (await Setting.findAll({ order: [['key', 'ASC']] })).map(row => row.toJSON());
    const express = require('express');
    const app = express(); app.use(express.json()); app.use('/api/settings', require('../routes/settingRoutes'));
    server = app.listen(0, '127.0.0.1'); await new Promise(resolve => server.once('listening', resolve));
    const jwt = require('jsonwebtoken');
    const request = async (body, user = owner, method = 'PUT', expected = 200) => {
      const headers = { 'Content-Type': 'application/json' };
      if (user) headers.Authorization = `Bearer ${jwt.sign({ id: user.id }, process.env.JWT_SECRET)}`;
      const response = await fetch(`http://127.0.0.1:${server.address().port}/api/settings`, {
        method, headers, body: method === 'GET' ? undefined : JSON.stringify(body),
      });
      const result = await response.json();
      assert.equal(response.status, expected, JSON.stringify(result));
      return result;
    };

    await t.test('invalid second value leaves both stored values and timestamps unchanged', async () => {
      await reset(); const before = await snapshot();
      await request({ tax_percentage: 15, service_charge_percentage: 101 }, owner, 'PUT', 400);
      assert.deepEqual(await snapshot(), before);
      await request({ service_charge_percentage: 5, tax_percentage: -1 }, owner, 'PUT', 400);
      assert.deepEqual(await snapshot(), before);
      const result = await request(undefined, null, 'GET');
      assert.deepEqual(result.data, { tax_percentage: '10', service_charge_percentage: '0', unrelated: 'keep' });
    });

    await t.test('malformed percentages are rejected without partially saving the other field', async () => {
      await reset(); const before = await snapshot();
      for (const value of [null, '', ' ', true, false, [], [5], {}, '10abc', '5%', '0x10', 'NaN', 'Infinity', 101, -0.1]) {
        await request({ tax_percentage: 15, service_charge_percentage: value }, owner, 'PUT', 400);
        assert.deepEqual(await snapshot(), before);
        await request({ tax_percentage: value, service_charge_percentage: 5 }, owner, 'PUT', 400);
        assert.deepEqual(await snapshot(), before);
      }
    });

    await t.test('valid numbers, fractions, boundaries, partial updates and no-ops keep the API contract', async () => {
      await reset();
      let result = await request({ tax_percentage: '15.5', service_charge_percentage: 2.5 });
      assert.deepEqual(result.data, { tax_percentage: '15.5', service_charge_percentage: '2.5', unrelated: 'keep' });
      result = await request({ tax_percentage: 0, service_charge_percentage: 100 }, manager);
      assert.equal(result.data.tax_percentage, '0'); assert.equal(result.data.service_charge_percentage, '100');
      result = await request({ tax_percentage: '10' });
      assert.equal(result.data.tax_percentage, '10'); assert.equal(result.data.service_charge_percentage, '100');
      const before = await snapshot();
      await request({}); await request({ unknown_setting: 'ignored' });
      assert.deepEqual(await snapshot(), before);
      await Setting.destroy({ where: { key: 'service_charge_percentage' } });
      await request({ tax_percentage: 20, service_charge_percentage: 101 }, owner, 'PUT', 400);
      assert.equal(await Setting.findByPk('service_charge_percentage'), null);
      assert.equal((await Setting.findByPk('tax_percentage')).value, '10');
      result = await request({ service_charge_percentage: 5 });
      assert.equal(result.data.service_charge_percentage, '5');
      assert.equal(result.data.tax_percentage, '10');
    });

    await t.test('a real SQL failure on the second upsert rolls back updates and new rows', async sqlTest => {
      await reset();
      const before = await snapshot();
      // BEFORE INSERT runs for INSERT ... ON DUPLICATE KEY UPDATE too.
      await sequelize.query("CREATE TRIGGER settings_test_failure BEFORE INSERT ON settings FOR EACH ROW BEGIN IF NEW.`key` = 'service_charge_percentage' AND NEW.`value` = '13' THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'intentional settings write failure'; END IF; END");
      const errors = [];
      sqlTest.mock.method(console, 'error', (...args) => errors.push(args));
      try {
        const failure = await request({ tax_percentage: 15, service_charge_percentage: 13 }, owner, 'PUT', 500);
        assert.equal(failure.success, false);
        assert.deepEqual(await snapshot(), before);
        await Setting.destroy({ where: { key: ['tax_percentage', 'service_charge_percentage'] } });
        const absent = await snapshot();
        await request({ tax_percentage: 15, service_charge_percentage: 13 }, owner, 'PUT', 500);
        assert.deepEqual(await snapshot(), absent, 'the first inserted key must be rolled back as well');
        assert.equal(errors.length, 2);
        assert.ok(errors.every(([, error]) => error.original?.message.includes('intentional settings write failure')));
      } finally {
        await sequelize.query('DROP TRIGGER settings_test_failure');
      }
    });

    await t.test('concurrent complete saves and public reads never expose half of a saved pair', async () => {
      await reset();
      const inputs = Array.from({ length: 12 }, (_, index) => ({ tax_percentage: index + 10, service_charge_percentage: index + 40 }));
      const pairs = new Set(['10:0', ...inputs.map(input => `${input.tax_percentage}:${input.service_charge_percentage}`)]);
      const writing = inputs.map(input => request(input));
      const reading = Array.from({ length: 12 }, () => request(undefined, null, 'GET'));
      const results = await Promise.all(writing);
      for (let index = 0; index < results.length; index++) {
        assert.equal(results[index].data.tax_percentage, String(inputs[index].tax_percentage));
        assert.equal(results[index].data.service_charge_percentage, String(inputs[index].service_charge_percentage));
        assert.equal(results[index].data.unrelated, 'keep');
      }
      for (const result of [...await Promise.all(reading), await request(undefined, null, 'GET')]) {
        assert.ok(pairs.has(`${result.data.tax_percentage}:${result.data.service_charge_percentage}`));
      }
    });

    await t.test('public reads stay available while unauthorized writes cannot change settings', async () => {
      await reset(); const before = await snapshot();
      await request(undefined, null, 'GET');
      await request({ tax_percentage: 15 }, null, 'PUT', 401);
      await request({ tax_percentage: 15 }, cashier, 'PUT', 403);
      assert.deepEqual(await snapshot(), before);
    });
  } finally {
    if (server) await new Promise(resolve => server.close(resolve));
    await sequelize.close();
    if (!/^kitkop_settings_test_\d+$/.test(database)) throw new Error('Unexpected test database');
    await admin.query(`DROP DATABASE \`${database}\``); await admin.end();
  }
});
