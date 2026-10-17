const test = require('node:test');
const assert = require('node:assert/strict');

test('password changes revoke HTTP and realtime staff sessions atomically without affecting guest tracking', { skip: process.env.KITKOP_OPTIONS_DB_TEST !== 'true' }, async t => {
  require('dotenv').config();
  assert.ok(['localhost', '127.0.0.1', '::1'].includes(process.env.DB_HOST), 'Use a local test database only');
  process.env.JWT_SECRET = 'staff-session-test';
  const mysql = require('mysql2/promise');
  const database = `kitkop_staff_sessions_test_${process.pid}`;
  const admin = await mysql.createConnection({ host: process.env.DB_HOST, port: process.env.DB_PORT || 3306, user: process.env.DB_USER, password: process.env.DB_PASSWORD });
  await admin.query(`CREATE DATABASE \`${database}\``); process.env.DB_NAME = database;
  const { sequelize } = require('../config/database');
  const { User, MenuCategory, Menu, Order } = require('../models');
  const migrate = require('../migrations/add-session-versions');
  const bcrypt = require('bcryptjs'); const jwt = require('jsonwebtoken');
  const { io: clientIO } = require('../../frontend/node_modules/socket.io-client');
  const sockets = []; let server, io;
  try {
    await sequelize.sync();
    const hash = await bcrypt.hash('original-password', 4);
    const owner = await User.create({ name: 'Owner', username: 'owner', email: 'owner@example.test', role: 'owner', password_hash: hash });
    const staff = await User.create({ name: 'Cashier', username: 'cashier', email: 'cashier@example.test', role: 'kasir', password_hash: hash });
    const other = await User.create({ name: 'Other', username: 'other', email: 'other@example.test', role: 'barista', password_hash: hash });
    await t.test('migration upgrades old schemas without changing accounts and never resets an existing version', async () => {
      const before = (await User.findAll({ order: [['id', 'ASC']] })).map(row => row.toJSON());
      await sequelize.getQueryInterface().removeColumn('users', 'session_version');
      await migrate(); await migrate();
      assert.deepEqual((await User.findAll({ order: [['id', 'ASC']] })).map(row => row.toJSON()), before);
      await User.update({ session_version: 2 }, { where: { id: other.id } });
      await migrate(); assert.equal((await other.reload()).session_version, 2);
    });
    const category = await MenuCategory.create({ name: 'Coffee' });
    const menu = await Menu.create({ category_id: category.id, name: 'Kopi', price: 10000 });
    const express = require('express'); const app = express(); app.use(express.json());
    server = require('node:http').createServer(app); io = new (require('socket.io').Server)(server);
    require('../socket/orderSocket')(io); app.set('io', io);
    app.use('/api/auth', require('../routes/authRoutes')); app.use('/api/users', require('../routes/userRoutes')); app.use('/api/orders', require('../routes/orderRoutes'));
    app.use((err, req, res, next) => res.status(err.statusCode || 500).json({ message: err.message }));
    server.listen(0, '127.0.0.1'); await new Promise(resolve => server.once('listening', resolve));
    const base = `http://127.0.0.1:${server.address().port}`;
    let ownerToken;
    const request = async (path, method = 'GET', body, auth = ownerToken, expected = 200) => {
      const response = await fetch(base + '/api' + path, { method, headers: { 'Content-Type': 'application/json', ...(auth ? { Authorization: `Bearer ${auth}` } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
      const data = await response.json(); assert.equal(response.status, expected, `${method} ${path}: ${JSON.stringify(data)}`); return data;
    };
    const login = async (username, password, expected = 200) => (await request('/auth/login', 'POST', { login: username, password }, null, expected)).data?.token;
    const connect = auth => new Promise((resolve, reject) => {
      const socket = clientIO(base, { auth, transports: ['websocket'], reconnection: false, autoConnect: false });
      sockets.push(socket); socket.notices = 0; socket.on('session-revoked', () => socket.notices++);
      const timer = setTimeout(() => { socket.disconnect(); reject(new Error('Socket connection timeout')); }, 4000);
      socket.once('connect', () => { clearTimeout(timer); resolve(socket); });
      socket.once('connect_error', error => { clearTimeout(timer); socket.disconnect(); reject(error); }); socket.connect();
    });
    const disconnected = socket => new Promise((resolve, reject) => {
      if (!socket.connected) return resolve();
      const timer = setTimeout(() => reject(new Error('Revoked socket remained connected')), 4000);
      socket.once('disconnect', () => { clearTimeout(timer); resolve(); });
    });
    ownerToken = await login('owner', 'original-password');
    const old = await login('cashier', 'original-password');
    const legacy = jwt.sign({ id: staff.id, role: staff.role }, process.env.JWT_SECRET, { expiresIn: '1h' });
    const otherToken = await login('other', 'original-password');
    let currentPassword = 'new-password', currentToken;
    const oldSockets = await Promise.all([connect({ token: old }), connect({ token: old }), connect({ token: legacy })]);
    const otherSocket = await connect({ token: otherToken });
    const ownerSocket = await connect({ token: ownerToken });
    const guestOrder = (await request('/orders', 'POST', { customer_name: 'Guest', items: [{ menu_id: menu.id, qty: 1 }] }, null, 201)).data;
    const guestSocket = await connect({ orderNumber: guestOrder.order_number, trackingToken: guestOrder.tracking_token });

    await t.test('same-second password change revokes both versioned and legacy tokens on HTTP, optional auth and socket reconnects', async () => {
      assert.equal(jwt.decode(old).sessionVersion, 0);
      await request('/auth/me', 'GET', undefined, legacy);
      const waiting = oldSockets.map(disconnected);
      const originalNow = Date.now, now = Date.now(); Date.now = () => now;
      try { await request(`/users/${staff.id}`, 'PUT', { password: currentPassword }); } finally { Date.now = originalNow; }
      await Promise.all(waiting);
      assert.ok(oldSockets.every(socket => socket.notices === 1));
      assert.equal((await staff.reload()).session_version, 1);
      for (const token of [old, legacy]) {
        assert.equal((await request('/auth/me', 'GET', undefined, token, 401)).code, 'SESSION_REVOKED');
        const count = await Order.count();
        await request('/orders', 'POST', { customer_name: 'Revoked staff', items: [{ menu_id: menu.id, qty: 1 }] }, token, 401);
        assert.equal(await Order.count(), count);
        await assert.rejects(connect({ token }), error => error.data?.code === 'SESSION_REVOKED');
      }
      await login('cashier', 'original-password', 401);
      currentToken = await login('cashier', currentPassword);
      assert.equal(jwt.decode(currentToken).sessionVersion, 1);
      await request('/auth/me', 'GET', undefined, currentToken); await connect({ token: currentToken });
      assert.equal(otherSocket.connected, true); assert.equal(ownerSocket.connected, true); assert.equal(guestSocket.connected, true);
      await request('/auth/me', 'GET', undefined, otherToken);
    });

    await t.test('concurrent resets increment the persisted version twice and never keep an intermediate token valid', async () => {
      const previousToken = currentToken;
      const before = (await staff.reload()).session_version;
      await Promise.all(['concurrent-A', 'concurrent-B'].map(password => request(`/users/${staff.id}`, 'PUT', { password })));
      await staff.reload(); assert.equal(staff.session_version, before + 2);
      await request('/auth/me', 'GET', undefined, previousToken, 401);
      await request('/auth/me', 'GET', undefined, legacy, 401);
      const matchesA = await bcrypt.compare('concurrent-A', staff.password_hash);
      currentPassword = matchesA ? 'concurrent-A' : 'concurrent-B';
      currentToken = await login('cashier', currentPassword);
      assert.equal(jwt.decode(currentToken).sessionVersion, staff.session_version);
      await login('cashier', matchesA ? 'concurrent-B' : 'concurrent-A', 401);
      await migrate(); assert.equal((await staff.reload()).session_version, before + 2);
    });

    await t.test('profile edits and failed password updates do not revoke a valid session or partially change the account', async () => {
      const socket = await connect({ token: currentToken });
      const before = (await staff.reload()).session_version;
      await request(`/users/${staff.id}`, 'PUT', { name: 'Renamed cashier', password: '' });
      assert.equal((await staff.reload()).session_version, before);
      await request('/auth/me', 'GET', undefined, currentToken); assert.equal(socket.connected, true);
      await request(`/users/${staff.id}`, 'PUT', { password: 'rejected-password', role: 'admin' }, ownerToken, 400);
      await sequelize.query(`CREATE TRIGGER audit_fail_user_update BEFORE UPDATE ON users FOR EACH ROW BEGIN IF NEW.username = 'audit-fail' THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Test account update failure'; END IF; END`);
      try { await request(`/users/${staff.id}`, 'PUT', { username: 'audit-fail', password: 'rejected-password' }, ownerToken, 500); }
      finally { await sequelize.query('DROP TRIGGER audit_fail_user_update'); }
      await staff.reload(); assert.equal(staff.session_version, before); assert.equal(staff.username, 'cashier');
      assert.equal(await bcrypt.compare(currentPassword, staff.password_hash), true);
      await request('/auth/me', 'GET', undefined, currentToken); assert.equal(socket.notices, 0);
      const listed = (await request('/users')).data;
      assert.ok(listed.every(user => !('session_version' in user) && !('password_hash' in user)));
    });

    await t.test('self password reset revokes the changing account too while guest HTTP tracking remains authorized', async () => {
      const waiting = disconnected(ownerSocket);
      await request(`/users/${owner.id}`, 'PUT', { password: 'owner-new-password' }); await waiting;
      await request('/auth/me', 'GET', undefined, ownerToken, 401);
      const legacyOwner = jwt.sign({ id: owner.id }, process.env.JWT_SECRET, { expiresIn: '1h' });
      await request('/auth/me', 'GET', undefined, legacyOwner, 401);
      ownerToken = await login('owner', 'owner-new-password');
      await request('/auth/me'); await connect({ token: ownerToken });
      const response = await fetch(`${base}/api/orders/track/${guestOrder.order_number}`, { headers: { 'X-Order-Tracking-Token': guestOrder.tracking_token } });
      assert.equal(response.status, 200); assert.equal(guestSocket.connected, true);
    });

    await t.test('a fresh login survives delayed revocation of an older session', async () => {
      const { userRoom } = require('../socket/realtimeEvents');
      const originalIn = io.in;
      let entered, release;
      const started = new Promise(resolve => { entered = resolve; });
      const gate = new Promise(resolve => { release = resolve; });
      io.in = function(room) {
        const operator = originalIn.call(this, room);
        if (room === userRoom(staff.id)) {
          const fetchSockets = operator.fetchSockets.bind(operator);
          operator.fetchSockets = async () => { entered(); await gate; return fetchSockets(); };
        }
        return operator;
      };
      let reset;
      try {
        reset = request(`/users/${staff.id}`, 'PUT', { password: 'latest-password' });
        await Promise.race([started, reset.then(() => { throw new Error('Expected revocation after password commit'); })]);
        currentToken = await login('cashier', 'latest-password');
        const fresh = await connect({ token: currentToken });
        release(); await reset;
        assert.equal(fresh.connected, true); assert.equal(fresh.notices, 0);
        await request('/auth/me', 'GET', undefined, currentToken);
      } finally {
        release(); io.in = originalIn;
        if (reset) await reset;
      }
    });

    await t.test('malformed session claims fail closed and cannot reset accounts or connect to staff rooms', async () => {
      const version = (await staff.reload()).session_version;
      for (const sessionVersion of [null, '0', true, [], {}, -1, 0.5, version - 1, version + 1]) {
        const token = jwt.sign({ id: staff.id, sessionVersion }, process.env.JWT_SECRET, { expiresIn: '1h' });
        await request('/auth/me', 'GET', undefined, token, 401);
        await assert.rejects(connect({ token }), error => error.data?.code === 'SESSION_REVOKED');
      }
      const token = jwt.sign({ id: owner.id, sessionVersion: 0 }, process.env.JWT_SECRET, { algorithm: 'HS384', expiresIn: '1h' });
      await request('/auth/me', 'GET', undefined, token, 401);
      await assert.rejects(connect({ token }), error => error.data?.code === 'UNAUTHORIZED');
    });
  } finally {
    for (const socket of sockets) socket.disconnect();
    if (io) await new Promise(resolve => io.close(resolve));
    else if (server) await new Promise(resolve => server.close(resolve));
    await sequelize.close(); await admin.query(`DROP DATABASE \`${database}\``); await admin.end();
  }
});
