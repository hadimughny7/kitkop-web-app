const test = require('node:test');
const assert = require('node:assert/strict');

test('user management enforces the Owner/Manager policy at the HTTP and transaction boundaries', { skip: process.env.KITKOP_OPTIONS_DB_TEST !== 'true' }, async t => {
  require('dotenv').config();
  assert.ok(['localhost', '127.0.0.1', '::1'].includes(process.env.DB_HOST), 'Use a local test database only');
  process.env.JWT_SECRET = 'isolated-user-permissions-test';
  const mysql = require('mysql2/promise');
  const database = `kitkop_user_permissions_test_${process.pid}`;
  const admin = await mysql.createConnection({ host: process.env.DB_HOST, port: process.env.DB_PORT || 3306, user: process.env.DB_USER, password: process.env.DB_PASSWORD });
  await admin.query(`CREATE DATABASE \`${database}\``);
  process.env.DB_NAME = database;
  const { sequelize } = require('../config/database');
  const { User } = require('../models');
  const bcrypt = require('bcryptjs');
  const jwt = require('jsonwebtoken');
  let server, owner, manager, peer, cashier;
  const notices = [];
  const password = 'original-password';
  const token = user => jwt.sign({ id: user.id, role: user.role, sessionVersion: user.session_version }, process.env.JWT_SECRET, { algorithm: 'HS256' });
  let serial = 0;
  const payload = role => ({ name: `Staff ${++serial}`, username: `staff-${serial}`, email: `staff-${serial}@example.test`, password, role });
  const snapshot = async id => (await User.findByPk(id)).toJSON();
  let request;

  // Pause a management query after authentication, then change the locked row
  // on another connection. The real handler must check the committed role.
  async function whileRoleChanges({ actor, target, changeId, change, method = 'PUT', body }) {
    const holding = await sequelize.transaction();
    let started;
    const entered = new Promise(resolve => { started = resolve; });
    let pending;
    const hook = `policy-race-${++serial}`;
    try {
      await User.findByPk(changeId, { transaction: holding, lock: holding.LOCK.UPDATE });
      User.addHook('beforeFind', hook, options => {
        if (options.transaction && options.lock === 'UPDATE' && options.transaction.id !== holding.id) started();
      });
      pending = request(`/users${target ? `/${target.id}` : ''}`, method, body, token(actor));
      await Promise.race([
        entered,
        pending.then(() => { throw new Error('Request completed without the management lock'); }),
        new Promise((resolve, reject) => { const timer = setTimeout(() => reject(new Error('Management query did not start')), 4000); timer.unref(); entered.then(() => clearTimeout(timer)); }),
      ]);
      await User.update(change, { where: { id: changeId }, transaction: holding });
      await holding.commit();
      return await pending;
    } finally {
      User.removeHook('beforeFind', hook);
      if (!holding.finished) await holding.rollback();
      if (pending) await pending;
    }
  }

  try {
    await sequelize.sync();
    const hash = await bcrypt.hash(password, 4);
    async function fixture(username, role) {
      return User.create({ name: username, username, email: `${username}@example.test`, password_hash: hash, role });
    }
    owner = await fixture('owner', 'owner');
    manager = await fixture('manager', 'manajer');
    peer = await fixture('peer-manager', 'manajer');
    cashier = await fixture('cashier', 'kasir');
    const app = require('express')();
    app.use(require('express').json());
    app.set('io', { in(room) { return { disconnectSockets() { notices.push(room); }, async fetchSockets() { notices.push(room); return []; } }; } });
    app.use('/api/users', require('../routes/userRoutes'));
    app.use('/api/auth', require('../routes/authRoutes'));
    app.use((err, req, res, next) => res.status(err.statusCode || 500).json({ success: false, message: err.message }));
    server = app.listen(0, '127.0.0.1');
    await new Promise(resolve => server.once('listening', resolve));
    request = async (path, method = 'GET', body, auth = token(manager)) => {
      const response = await fetch(`http://127.0.0.1:${server.address().port}/api${path}`, {
        method, headers: { 'Content-Type': 'application/json', ...(auth ? { Authorization: `Bearer ${auth}` } : {}) },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      return { status: response.status, body: await response.json() };
    };

    await t.test('manager cannot create an Owner or Manager, or partially rewrite their own account', async () => {
      const count = await User.count(), before = await snapshot(manager.id), notified = notices.length;
      for (const role of ['owner', 'manajer']) {
        assert.equal((await request('/users', 'POST', payload(role))).status, 403);
      }
      for (const role of ['owner', 'kasir', 'kitchen', 'barista']) {
        assert.equal((await request(`/users/${manager.id}`, 'PUT', { name: 'Changed', password: 'stolen', role })).status, 403);
      }
      assert.equal((await request(`/users/${manager.id}`, 'PUT', { is_active: 0 })).status, 403);
      assert.equal((await request(`/users/${manager.id}`, 'DELETE')).status, 400);
      assert.deepEqual(await snapshot(manager.id), before);
      assert.equal(await User.count(), count);
      assert.equal(notices.length, notified);
    });

    await t.test('manager cannot edit/reset/disable/delete an Owner or another Manager', async () => {
      for (const target of [owner, peer]) {
        const before = await snapshot(target.id), notified = notices.length;
        for (const change of [{ name: 'Changed' }, { password: 'stolen' }, { is_active: 0 }, { role: 'kasir' }, { role: target.role, email: 'taken@example.test' }]) {
          assert.equal((await request(`/users/${target.id}`, 'PUT', change)).status, 403);
        }
        assert.equal((await request(`/users/${target.id}`, 'DELETE')).status, 403);
        assert.deepEqual(await snapshot(target.id), before);
        assert.equal(notices.length, notified);
      }
      const before = await snapshot(cashier.id);
      for (const role of ['owner', 'manajer']) assert.equal((await request(`/users/${cashier.id}`, 'PUT', { role, name: 'Changed' })).status, 403);
      assert.deepEqual(await snapshot(cashier.id), before);
    });

    await t.test('manager can create/edit/change lower roles, reset passwords, change status and delete operational staff', async () => {
      for (const role of ['kasir', 'kitchen', 'barista']) {
        const created = await request('/users', 'POST', { ...payload(role), created_by: owner.id, session_version: 999 });
        assert.equal(created.status, 201, JSON.stringify(created));
        const id = created.body.data.id;
        const row = await User.findByPk(id);
        assert.equal(row.created_by, manager.id); assert.equal(row.session_version, 0);
        for (const nextRole of ['barista', 'kitchen', 'kasir']) assert.equal((await request(`/users/${id}`, 'PUT', { role: nextRole })).status, 200);
        assert.equal((await request(`/users/${id}`, 'PUT', { name: 'Renamed', password: 'reset-password', is_active: 0 })).status, 200);
        await row.reload(); assert.equal(row.is_active, 0); assert.equal(row.session_version, 1);
        assert.equal(await bcrypt.compare('reset-password', row.password_hash), true);
        assert.equal((await request(`/users/${id}`, 'PUT', { is_active: 1 })).status, 200);
        assert.equal((await request(`/users/${id}`, 'DELETE')).status, 200);
        assert.equal(await User.findByPk(id), null);
      }
    });

    await t.test('own Manager profile and password remain editable without role changes; password reset revokes the old session', async () => {
      const old = token(manager);
      assert.equal((await request(`/users/${manager.id}`, 'PUT', { name: 'Manager Updated', role: 'manajer', is_active: 1 })).status, 200);
      assert.equal((await request(`/users/${manager.id}`, 'PUT', { password: 'manager-new-password' })).status, 200);
      await manager.reload(); assert.equal(manager.role, 'manajer'); assert.equal(manager.session_version, 1);
      assert.equal((await request('/auth/me', 'GET', undefined, old)).status, 401);
      const login = await request('/auth/login', 'POST', { login: manager.username, password: 'manager-new-password' }, null);
      assert.equal(login.status, 200);
      assert.equal((await request('/auth/me', 'GET', undefined, login.body.data.token)).status, 200);
    });

    await t.test('Owner retains management of all roles, including other Owners and Managers', async () => {
      for (const role of ['kasir', 'barista', 'kitchen', 'manajer', 'owner']) {
        const created = await request('/users', 'POST', payload(role), token(owner));
        assert.equal(created.status, 201, JSON.stringify(created));
        const id = created.body.data.id;
        for (const nextRole of ['owner', 'manajer', 'kasir']) {
          assert.equal((await request(`/users/${id}`, 'PUT', { role: nextRole }, token(owner))).status, 200);
        }
        assert.equal((await request(`/users/${id}`, 'PUT', { role: 'owner', password: 'owner-reset', is_active: 0 }, token(owner))).status, 200);
        assert.equal((await request(`/users/${id}`, 'DELETE', undefined, token(owner))).status, 200);
      }
      assert.equal((await request(`/users/${owner.id}`, 'DELETE', undefined, token(owner))).status, 400);
    });

    await t.test('anonymous and operational roles cannot manage accounts; JWT role claims never grant Owner privileges', async () => {
      const before = await snapshot(manager.id), count = await User.count();
      for (const role of ['kasir', 'kitchen', 'barista']) {
        const staff = await fixture(`test-${role}`, role);
        for (const [path, method, body] of [['/users', 'GET'], ['/users', 'POST', payload('owner')], [`/users/${manager.id}`, 'PUT', { role: 'owner' }], [`/users/${manager.id}`, 'DELETE']]) {
          assert.equal((await request(path, method, body, token(staff))).status, 403);
        }
        await staff.destroy();
      }
      assert.equal((await request('/users', 'POST', payload('owner'), null)).status, 401);
      const staleOwnerClaim = jwt.sign({ id: manager.id, role: 'owner', sessionVersion: manager.session_version }, process.env.JWT_SECRET);
      assert.equal((await request(`/users/${manager.id}`, 'PUT', { role: 'owner' }, staleOwnerClaim)).status, 403);
      assert.deepEqual(await snapshot(manager.id), before); assert.equal(await User.count(), count);
    });

    await t.test('a target promoted to Owner while a Manager edit/delete waits stays protected', async () => {
      for (const method of ['PUT', 'DELETE']) {
        const target = await fixture(`promoted-${method.toLowerCase()}`, 'kasir');
        const before = await snapshot(target.id), notified = notices.length;
        const response = await whileRoleChanges({ actor: manager, target, changeId: target.id, change: { role: 'owner' }, method, body: method === 'PUT' ? { name: 'Compromised', password: 'stolen' } : undefined });
        assert.equal(response.status, 403, JSON.stringify(response));
        const after = await snapshot(target.id);
        assert.equal(after.role, 'owner'); assert.equal(after.name, before.name);
        assert.equal(after.password_hash, before.password_hash); assert.equal(after.session_version, before.session_version);
        assert.equal(notices.length, notified);
      }
    });

    await t.test('a caller demoted after authentication cannot use earlier Owner permissions', async () => {
      const caller = await fixture('demoted-owner', 'owner');
      const count = await User.count();
      const response = await whileRoleChanges({ actor: caller, changeId: caller.id, change: { role: 'manajer' }, method: 'POST', body: payload('owner') });
      assert.equal(response.status, 403, JSON.stringify(response));
      assert.equal(await User.count(), count);
      const lowerCaller = await fixture('demoted-manager', 'manajer');
      const before = await snapshot(cashier.id);
      const denied = await whileRoleChanges({ actor: lowerCaller, target: cashier, changeId: lowerCaller.id, change: { role: 'barista' }, body: { password: 'stolen' } });
      assert.equal(denied.status, 403, JSON.stringify(denied));
      assert.deepEqual(await snapshot(cashier.id), before);
    });

    await t.test('failed SQL updates roll back profile/password/session changes and emit no notices', async () => {
      const before = await snapshot(cashier.id), notified = notices.length;
      await sequelize.query("CREATE TRIGGER fail_policy_update BEFORE UPDATE ON users FOR EACH ROW BEGIN IF NEW.username = 'fail-policy-save' THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Injected policy save failure'; END IF; END");
      try {
        assert.equal((await request(`/users/${cashier.id}`, 'PUT', { username: 'fail-policy-save', password: 'not-saved', role: 'barista' })).status, 500);
      } finally { await sequelize.query('DROP TRIGGER fail_policy_update'); }
      assert.deepEqual(await snapshot(cashier.id), before); assert.equal(notices.length, notified);
      assert.equal((await request(`/users/${cashier.id}`, 'PUT', { name: 'Still Editable' })).status, 200);
    });

    await t.test('read access remains available and never reveals password/session internals', async () => {
      const listed = await request('/users');
      assert.equal(listed.status, 200);
      assert.ok(listed.body.data.some(row => row.role === 'owner'));
      assert.ok(listed.body.data.every(row => !('password_hash' in row) && !('session_version' in row)));
      assert.equal((await request(`/users/${owner.id}`)).status, 200);
      assert.equal((await request('/users/999999', 'PUT', { name: 'Missing' })).status, 404);
      assert.equal((await request('/users/invalid', 'DELETE')).status, 404);
    });
  } finally {
    if (server) await new Promise(resolve => server.close(resolve));
    await sequelize.close();
    assert.match(database, /^kitkop_user_permissions_test_\d+$/);
    await admin.query(`DROP DATABASE \`${database}\``);
    await admin.end();
  }
});
