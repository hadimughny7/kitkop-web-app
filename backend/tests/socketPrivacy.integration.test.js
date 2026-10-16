const test = require('node:test');
const assert = require('node:assert/strict');

test('real sockets authenticate staff, isolate customer orders and minimize payloads', { skip: process.env.KITKOP_OPTIONS_DB_TEST !== 'true' }, async t => {
  require('dotenv').config(); process.env.JWT_SECRET = 'socket-privacy-test';
  const mysql = require('mysql2/promise');
  const database = `kitkop_socket_test_${process.pid}`;
  const admin = await mysql.createConnection({ host: process.env.DB_HOST, port: process.env.DB_PORT || 3306, user: process.env.DB_USER, password: process.env.DB_PASSWORD });
  await admin.query(`CREATE DATABASE \`${database}\``); process.env.DB_NAME = database;
  const { sequelize } = require('../config/database');
  const { User, MenuCategory, Menu } = require('../models');
  const { STAFF_ROLES, emitRealtime, roleRoom, orderRoom } = require('../socket/realtimeEvents');
  const { io: clientIO } = require('../../frontend/node_modules/socket.io-client');
  const jwt = require('jsonwebtoken');
  const sockets = []; let server, io;
  try {
    await sequelize.sync();
    // Existing hosting supports barista; avoid silently changing the unrelated role-model finding.
    await sequelize.query("ALTER TABLE users MODIFY role ENUM('owner','manajer','kasir','kitchen','barista') NOT NULL");
    const users = {};
    for (const role of STAFF_ROLES) users[role] = await User.create({ name: role, username: role, email: `${role}@example.test`, role, password_hash: 'test' }, { validate: false });
    const inactive = await User.create({ name: 'Inactive', username: 'inactive', email: 'inactive@example.test', role: 'kasir', password_hash: 'test', is_active: 0 });
    const category = await MenuCategory.create({ name: 'Test' });
    const menu = await Menu.create({ category_id: category.id, name: 'Kopi', price: 10000 });
    const express = require('express'); const app = express(); app.use(express.json());
    server = require('node:http').createServer(app); io = new (require('socket.io').Server)(server);
    require('../socket/orderSocket')(io); app.set('io', io);
    app.use('/api/orders', require('../routes/orderRoutes')); app.use('/api/payments', require('../routes/paymentRoutes')); app.use('/api/users', require('../routes/userRoutes'));
    app.use((err, req, res, next) => res.status(err.statusCode || 500).json({ message: err.message }));
    server.listen(0, '127.0.0.1'); await new Promise(resolve => server.once('listening', resolve));
    const base = `http://127.0.0.1:${server.address().port}`;
    const token = (user, options = {}, claims = {}) => jwt.sign({ id: user.id, role: user.role, ...claims }, process.env.JWT_SECRET, { expiresIn: '1h', ...options });
    const connect = auth => new Promise((resolve, reject) => {
      const socket = clientIO(base, { auth, transports: ['websocket'], reconnection: false, autoConnect: false });
      sockets.push(socket); socket.received = []; socket.onAny((...args) => socket.received.push(args));
      socket.once('connect', () => resolve(socket));
      socket.once('connect_error', error => { socket.disconnect(); reject(error); }); socket.connect();
    });
    const request = async (path, method = 'POST', body, expected = 200) => {
      const response = await fetch(base + '/api' + path, { method, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token(users.owner)}` }, body: body === undefined ? undefined : JSON.stringify(body) });
      const result = await response.json(); assert.equal(response.status, expected, JSON.stringify(result)); return result.data;
    };
    const createOrder = name => request('/orders', 'POST', { customer_name: `Private ${name}`, customer_phone: `081-${name}`, customer_email: `${name}@example.test`, items: [{ menu_id: menu.id, qty: 1 }] }, 201);
    const count = (socket, event) => socket.received.filter(([name]) => name === event).length;
    // Acknowledgements share the transport ordering with emitted events; no sleeps needed.
    const flush = () => Promise.all(sockets.filter(socket => socket.connected).map(socket => socket.timeout(3000).emitWithAck('track-order', 'not-an-order')));
    const staff = {};
    for (const role of STAFF_ROLES) staff[role] = await connect({ token: token(users[role], {}, { role: 'owner' }) });
    const a = await createOrder('A'), b = await createOrder('B');
    const guestA = await connect({ orderNumber: a.order_number, trackingToken: a.tracking_token });
    const guestB = await connect({ orderNumber: b.order_number, trackingToken: b.tracking_token });

    await t.test('anonymous, invalid, expired, inactive and cross-order credentials are rejected', async () => {
      for (const auth of [
        {}, { token: 'bad' }, { token: token(users.owner, { expiresIn: -1 }) }, { token: token(inactive) },
        { token: token({ id: 2147483647, role: 'owner' }) }, { token: a.tracking_token },
        { orderNumber: b.order_number, trackingToken: a.tracking_token },
        { orderNumber: a.order_number, trackingToken: 'bad' },
        { orderNumber: a.order_number, trackingToken: jwt.sign({ orderNumber: a.order_number }, process.env.JWT_SECRET, { subject: String(a.id), audience: 'wrong', expiresIn: '1h' }) },
      ]) await assert.rejects(connect(auth), error => error.data?.code === 'UNAUTHORIZED');
      assert.equal((await request(`/orders/track/${a.order_number}`, 'GET')).tracking_token, undefined, 'public tracking must never issue a realtime capability');
    });

    await t.test('client-selected role/room names never grant membership', async () => {
      for (const room of ['staff', roleRoom('owner'), orderRoom(b.id), `order-${b.order_number}`]) {
        assert.equal((await guestA.timeout(2000).emitWithAck('join-room', room)).success, false);
        assert.equal((await staff.kasir.timeout(2000).emitWithAck('join-room', room)).success, false);
      }
      assert.equal((await guestA.timeout(2000).emitWithAck('join-role', 'owner')).success, false);
      assert.equal((await guestA.timeout(2000).emitWithAck('track-order', b.order_number)).success, false);
      assert.deepEqual([...io.sockets.sockets.get(guestA.id).rooms].sort(), [guestA.id, orderRoom(a.id)].sort());
      assert.ok(io.sockets.sockets.get(staff.kasir.id).rooms.has(roleRoom('kasir')));
      assert.equal(io.sockets.sockets.get(staff.kasir.id).rooms.has(roleRoom('owner')), false, 'JWT role claims do not override the database');
    });

    await t.test('new orders notify every staff role without broadcasting customer fields or tracking tokens', async () => {
      const before = Object.fromEntries(STAFF_ROLES.map(role => [role, count(staff[role], 'new-order')]));
      const c = await createOrder('C'); await flush();
      for (const role of STAFF_ROLES) {
        assert.equal(count(staff[role], 'new-order'), before[role] + 1);
        assert.deepEqual(staff[role].received.filter(([event]) => event === 'new-order').at(-1)[1], { orderId: c.id, orderNumber: c.order_number, status: 'pending' });
      }
      assert.equal(count(guestA, 'new-order'), 0); assert.equal(count(guestB, 'new-order'), 0);
      for (const socket of [...Object.values(staff), guestA, guestB]) {
        const serialized = JSON.stringify(socket.received);
        for (const privateValue of ['Private A', 'Private B', 'Private C', '081-A', 'A@example.test', a.tracking_token, c.tracking_token]) assert.equal(serialized.includes(privateValue), false);
      }
    });

    await t.test('payment and production reach the matching customer and all staff; stock uses authorized roles', async () => {
      const starts = Object.fromEntries(STAFF_ROLES.map(role => [role, count(staff[role], 'payment-success')]));
      await request(`/payments/${a.id}/cash`, 'POST', {}); await flush();
      for (const role of STAFF_ROLES) assert.equal(count(staff[role], 'payment-success'), starts[role] + 1);
      assert.equal(count(guestA, 'payment-success'), 1); assert.equal(count(guestB, 'payment-success'), 0);
      assert.deepEqual(guestA.received.find(([event]) => event === 'payment-success')[1], { orderId: a.id });
      for (const role of ['owner', 'manajer', 'kitchen', 'barista']) assert.equal(count(staff[role], 'stock-updated'), 1);
      assert.equal(count(staff.kasir, 'stock-updated'), 0); assert.equal(count(guestA, 'stock-updated'), 0);
      await request(`/orders/${a.id}/items/process-all`, 'PATCH', {}); await flush();
      await request(`/orders/${a.id}/items/complete-all`, 'PATCH', {}); await flush();
      assert.equal(guestA.received.filter(([event]) => event === 'order-status-update').at(-1)[1].status, 'completed');
      assert.equal(count(guestB, 'order-status-update'), 0); assert.equal(count(guestB, 'order-item-update'), 0);
      const aCount = count(guestA, 'order-status-update');
      await request(`/orders/${b.id}/status`, 'PATCH', { status: 'cancelled' }); await flush();
      assert.equal(count(guestA, 'order-status-update'), aCount);
      assert.equal(guestB.received.filter(([event]) => event === 'order-status-update').at(-1)[1].status, 'cancelled');
    });

    await t.test('an attempted payload leak is removed by the common event whitelist', async () => {
      emitRealtime(io, 'order-status-update', { orderId: a.id, status: 'completed', customer: { name: 'LEAK' }, email: 'LEAK', phone: 'LEAK', items: [{ notes: 'LEAK' }], tracking_token: 'LEAK' }); await flush();
      assert.deepEqual(guestA.received.at(-1)[1], { orderId: a.id, status: 'completed' });
      assert.equal(JSON.stringify(guestA.received).includes('LEAK'), false);
    });

    await t.test('deactivation, role changes and deletion disconnect existing staff sockets', async () => {
      await request(`/users/${users.kasir.id}`, 'PUT', { is_active: 0 });
      await new Promise(resolve => staff.kasir.connected ? staff.kasir.once('disconnect', resolve) : resolve());
      await assert.rejects(connect({ token: token(users.kasir) }));
      await request(`/users/${users.kitchen.id}`, 'PUT', { role: 'kasir' });
      await new Promise(resolve => staff.kitchen.connected ? staff.kitchen.once('disconnect', resolve) : resolve());
      const changed = await connect({ token: token(users.kitchen) });
      assert.ok(io.sockets.sockets.get(changed.id).rooms.has(roleRoom('kasir')));
      const removable = await User.create({ name: 'Delete test', username: 'delete-test', email: 'delete@example.test', role: 'owner', password_hash: 'test' });
      const deleted = await connect({ token: token(removable) });
      await request(`/users/${removable.id}`, 'DELETE');
      await new Promise(resolve => deleted.connected ? deleted.once('disconnect', resolve) : resolve());
      await assert.rejects(connect({ token: token(removable) }));
    });

    await t.test('token expiry disconnects sessions and reconnecting customers keep their original scope', async () => {
      const short = await connect({ token: token(users.owner, { expiresIn: 2 }) });
      await new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('Expired socket remained connected')), 4000);
        short.once('disconnect', () => { clearTimeout(timer); resolve(); });
      });
      guestA.disconnect();
      const reconnected = await connect({ orderNumber: a.order_number, trackingToken: a.tracking_token });
      assert.deepEqual([...io.sockets.sockets.get(reconnected.id).rooms].sort(), [reconnected.id, orderRoom(a.id)].sort());
    });
  } finally {
    for (const socket of sockets) socket.disconnect();
    if (io) await new Promise(resolve => io.close(resolve));
    else if (server) await new Promise(resolve => server.close(resolve));
    await sequelize.close();
    if (!/^kitkop_socket_test_\d+$/.test(database)) throw new Error('Unexpected test database');
    await admin.query(`DROP DATABASE \`${database}\``); await admin.end();
  }
});
