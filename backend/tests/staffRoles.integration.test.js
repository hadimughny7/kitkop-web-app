const test = require('node:test');
const assert = require('node:assert/strict');

test('staff roles stay consistent across fresh schemas, migration, API and login', { skip: process.env.KITKOP_OPTIONS_DB_TEST !== 'true' }, async t => {
  require('dotenv').config(); process.env.JWT_SECRET = 'staff-role-test';
  const mysql = require('mysql2/promise');
  const database = `kitkop_staff_roles_test_${process.pid}`;
  const admin = await mysql.createConnection({ host: process.env.DB_HOST, port: process.env.DB_PORT || 3306, user: process.env.DB_USER, password: process.env.DB_PASSWORD });
  await admin.query(`CREATE DATABASE \`${database}\``); process.env.DB_NAME = database;
  const { sequelize } = require('../config/database');
  const { User } = require('../models');
  const { STAFF_ROLES } = require('../constants/roles');
  const migrate = require('../migrations/add-barista-role');
  let server;
  try {
    await sequelize.sync();
    await t.test('a fresh model schema accepts all five official roles and rejects unknown roles', async () => {
      for (const role of STAFF_ROLES) await User.create({ name: role, username: role, email: `${role}@example.test`, role, password_hash: 'test' });
      await assert.rejects(User.create({ name: 'Invalid', username: 'invalid', email: 'invalid@example.test', role: 'admin', password_hash: 'test' }), /Validation/);
      await User.destroy({ where: { role: 'barista' } });
    });
    await t.test('legacy enum migration preserves users and enum order and is idempotent', async () => {
      await sequelize.query("ALTER TABLE users MODIFY role ENUM('kasir','kitchen','manajer','owner') NOT NULL");
      const before = (await User.findAll({ order: [['id', 'ASC']] })).map(user => user.toJSON());
      await migrate(); await migrate();
      assert.deepEqual((await User.findAll({ order: [['id', 'ASC']] })).map(user => user.toJSON()), before);
      const [columns] = await sequelize.query("SHOW COLUMNS FROM users LIKE 'role'");
      assert.equal(columns[0].Type, "enum('kasir','kitchen','manajer','owner','barista')");
    });
    const express = require('express'); const app = express(); app.use(express.json());
    app.use('/api/users', require('../routes/userRoutes'));
    app.use('/api/auth', require('../routes/authRoutes'));
    app.use('/api/stocks', require('../routes/stockRoutes'));
    app.use('/api/payments', require('../routes/paymentRoutes'));
    app.use((err, req, res, next) => res.status(err.statusCode || 500).json({ message: err.message }));
    server = app.listen(0, '127.0.0.1'); await new Promise(resolve => server.once('listening', resolve));
    const jwt = require('jsonwebtoken');
    const owner = await User.findOne({ where: { role: 'owner' } });
    const manager = await User.findOne({ where: { role: 'manajer' } });
    const token = user => jwt.sign({ id: user.id, role: user.role }, process.env.JWT_SECRET);
    const request = async (path, method, body, auth = token(owner)) => {
      const response = await fetch(`http://127.0.0.1:${server.address().port}/api${path}`, {
        method, headers: { 'Content-Type': 'application/json', ...(auth ? { Authorization: `Bearer ${auth}` } : {}) },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      return { status: response.status, body: await response.json() };
    };
    let barista;
    await t.test('owner and manager can create, edit and log in a Barista account', async () => {
      const created = await request('/users', 'POST', { name: 'Barista', username: 'newbarista', email: 'newbarista@example.test', password: 'test-password', role: 'barista' });
      assert.equal(created.status, 201, JSON.stringify(created)); barista = created.body.data;
      assert.equal(barista.role, 'barista');
      assert.equal((await request(`/users/${barista.id}`, 'PUT', { role: 'kitchen' }, token(manager))).status, 200);
      const edited = await request(`/users/${barista.id}`, 'PUT', { role: 'barista' }, token(manager));
      assert.equal(edited.status, 200); assert.equal(edited.body.data.role, 'barista');
      const login = await request('/auth/login', 'POST', { login: 'newbarista', password: 'test-password' }, null);
      assert.equal(login.status, 200); assert.equal(login.body.data.user.role, 'barista');
      const me = await request('/auth/me', 'GET', undefined, login.body.data.token);
      assert.equal(me.status, 200); assert.equal(me.body.data.role, 'barista');
    });
    await t.test('invalid create and update roles return 400 without writing partial changes', async () => {
      const before = (await User.findByPk(barista.id)).toJSON(); const count = await User.count();
      for (const role of ['admin', '', null, [], {}, true]) {
        assert.equal((await request('/users', 'POST', { name: 'Bad', username: 'bad', email: 'bad@example.test', password: 'test', role })).status, 400);
        assert.equal((await request(`/users/${barista.id}`, 'PUT', { name: 'Changed', role })).status, 400);
        assert.deepEqual((await User.findByPk(barista.id)).toJSON(), before);
        assert.equal(await User.count(), count);
      }
    });
    await t.test('Barista retains stock access but cannot manage users or confirm cash', async () => {
      const auth = token(barista);
      assert.equal((await request('/stocks', 'GET', undefined, auth)).status, 200);
      assert.equal((await request('/users', 'GET', undefined, auth)).status, 403);
      assert.equal((await request('/payments/1/cash', 'POST', {}, auth)).status, 403);
      await migrate();
      assert.equal((await User.findByPk(barista.id)).role, 'barista');
    });
  } finally {
    if (server) await new Promise(resolve => server.close(resolve));
    await sequelize.close();
    await admin.query(`DROP DATABASE \`${database}\``); await admin.end();
  }
});
