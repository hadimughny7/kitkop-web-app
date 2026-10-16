const test = require('node:test');
const assert = require('node:assert/strict');

test('cancellation restores only unprocessed stock exactly once', { skip: process.env.KITKOP_OPTIONS_DB_TEST !== 'true' }, async t => {
  require('dotenv').config();
  process.env.JWT_SECRET = 'cancellation-test-secret';
  process.env.KUYZPAY_SECRET = 'cancellation-webhook-secret';
  const mysql = require('mysql2/promise');
  const database = `kitkop_cancellation_test_${process.pid}`;
  const admin = await mysql.createConnection({ host: process.env.DB_HOST, port: process.env.DB_PORT || 3306, user: process.env.DB_USER, password: process.env.DB_PASSWORD });
  await admin.query(`CREATE DATABASE \`${database}\``);
  process.env.DB_NAME = database;
  const { sequelize } = require('../config/database');
  const { User, MenuCategory, Menu, MenuRecipe, RawMaterial, Order, OrderItem, OrderStatusLog, Transaction, StockLog } = require('../models');
  const { expirePendingOrder } = require('../services/orderCancellation');
  let server;
  try {
    await sequelize.sync();
    const owner = await User.create({ name: 'Owner test', email: 'owner@example.test', username: 'owner', password_hash: 'test', role: 'owner' });
    const category = await MenuCategory.create({ name: 'Test' });
    const menu = await Menu.create({ category_id: category.id, name: 'Kopi', price: 10000 });
    const base = await RawMaterial.create({ name: 'Base material', stock: 1000, unit: 'gram' });
    const extra = await RawMaterial.create({ name: 'Extra material', stock: 1000, unit: 'gram' });
    const recipe = await MenuRecipe.create({ menu_id: menu.id, raw_material_id: base.id, quantity_used: 0.5 });
    const express = require('express');
    const { capturePaymentWebhookBody } = require('../services/paymentWebhookSignature');
    const app = express(); app.use(express.json({ verify: capturePaymentWebhookBody }));
    const events = [];
    app.set('io', { emit: (...args) => events.push(args) });
    app.use('/api/orders', require('../routes/orderRoutes'));
    app.use('/api/payments', require('../routes/paymentRoutes'));
    app.use((err, req, res, next) => res.status(err.statusCode || 500).json({ message: err.message }));
    server = app.listen(0, '127.0.0.1'); await new Promise(resolve => server.once('listening', resolve));
    const jwt = require('jsonwebtoken');
    const request = async (path, method = 'PATCH', body = {}) => {
      const raw = JSON.stringify(body);
      const headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${jwt.sign({ id: owner.id }, process.env.JWT_SECRET)}` };
      if (path === '/payments/callback') headers['x-kuyzpay-signature'] = require('node:crypto').createHmac('sha256', process.env.KUYZPAY_SECRET).update(raw).digest('hex');
      const response = await fetch(`http://127.0.0.1:${server.address().port}/api${path}`, { method, headers, body: raw });
      return { status: response.status, body: await response.json() };
    };
    const ok = async promise => {
      const result = await promise;
      assert.equal(result.status, 200, JSON.stringify(result));
      return result.body;
    };
    const stock = async () => [Number((await base.reload()).stock), Number((await extra.reload()).stock)];
    let serial = 0;
    const fixture = async (count = 2, usage = undefined) => {
      const order = await Order.create({ order_number: `CANCEL-${++serial}`, status: 'pending', subtotal: count * 10000, tax: count * 1000, total: count * 11000 });
      const items = await OrderItem.bulkCreate(Array.from({ length: count }, (_, index) => ({
        order_id: order.id, menu_id: menu.id, qty: index + 1, price: 10000,
        stock_usage: usage === undefined ? [{ raw_material_id: base.id, quantity_used: 0.5 }, { raw_material_id: extra.id, quantity_used: 0.25 }] : usage,
      })));
      const payment = await Transaction.create({ order_id: order.id, ref_id: `CANCEL-${serial}`, amount: order.total, status: 'pending', payment_method: 'QRIS' });
      return { order, items, payment };
    };
    const pay = fixture => ok(request(`/payments/${fixture.order.id}/cash`, 'POST'));
    const cancel = fixture => request(`/orders/${fixture.order.id}/status`, 'PATCH', { status: 'cancelled', notes: 'Test cancellation' });
    const itemAction = (fixture, index, action) => request(`/orders/${fixture.order.id}/items/${fixture.items[index].id}/${action}`);
    const snapshot = async fixture => ({
      stock: await stock(), order: (await fixture.order.reload()).toJSON(), payment: (await fixture.payment.reload()).toJSON(),
      items: (await OrderItem.findAll({ where: { order_id: fixture.order.id }, order: [['id', 'ASC']] })).map(item => item.toJSON()),
      logs: await StockLog.count(), statusLogs: await OrderStatusLog.count(), events: events.length,
    });

    await t.test('unpaid cancellation changes no stock; duplicate cancellation is a no-op', async () => {
      const fixtureOrder = await fixture(); const initial = await stock();
      const paymentBefore = (await fixtureOrder.payment.reload()).toJSON();
      await ok(cancel(fixtureOrder));
      assert.deepEqual(await stock(), initial);
      assert.deepEqual((await fixtureOrder.payment.reload()).toJSON(), paymentBefore);
      for (const item of fixtureOrder.items) assert.equal(Boolean((await item.reload()).stock_refunded), false);
      const after = await snapshot(fixtureOrder);
      await ok(cancel(fixtureOrder));
      assert.deepEqual(await snapshot(fixtureOrder), after);
    });

    await t.test('paid unstarted cancellation restores exact snapshots and add-ons, not edited recipes', async () => {
      const fixtureOrder = await fixture(); const initial = await stock();
      await pay(fixtureOrder);
      assert.deepEqual(await stock(), [initial[0] - 1.5, initial[1] - 0.75]);
      const paymentBefore = (await fixtureOrder.payment.reload()).toJSON();
      await recipe.update({ quantity_used: 99 });
      const responses = await Promise.all([cancel(fixtureOrder), cancel(fixtureOrder), cancel(fixtureOrder)]);
      assert.deepEqual(responses.map(result => result.status), [200, 200, 200]);
      assert.deepEqual(await stock(), initial);
      for (const item of fixtureOrder.items) assert.equal(Boolean((await item.reload()).stock_refunded), true);
      assert.equal(await OrderStatusLog.count({ where: { order_id: fixtureOrder.order.id, status: 'cancelled' } }), 1);
      assert.deepEqual((await fixtureOrder.payment.reload()).toJSON(), paymentBefore, 'cancellation does not refund money or change paid status');
      const after = await snapshot(fixtureOrder);
      await ok(cancel(fixtureOrder));
      assert.deepEqual(await snapshot(fixtureOrder), after);
      await recipe.update({ quantity_used: 0.5 });
    });

    await t.test('mixed production restores only pending items; rejected items are not refunded twice', async () => {
      const fixtureOrder = await fixture(4); const initial = await stock();
      await pay(fixtureOrder);
      await ok(itemAction(fixtureOrder, 3, 'reject'));
      await ok(request(`/orders/${fixtureOrder.order.id}/items/${fixtureOrder.items[1].id}/status`, 'PATCH', { status: 'preparing' }));
      await ok(request(`/orders/${fixtureOrder.order.id}/items/${fixtureOrder.items[2].id}/status`, 'PATCH', { status: 'preparing' }));
      await ok(request(`/orders/${fixtureOrder.order.id}/items/${fixtureOrder.items[2].id}/status`, 'PATCH', { status: 'completed' }));
      await ok(cancel(fixtureOrder));
      // Only qty 2 (preparing) and qty 3 (completed) remain consumed.
      assert.deepEqual(await stock(), [initial[0] - 2.5, initial[1] - 1.25]);
      assert.deepEqual(await Promise.all(fixtureOrder.items.map(async item => Boolean((await item.reload()).stock_refunded))), [true, false, false, true]);
      assert.equal((await itemAction(fixtureOrder, 0, 'reject')).status, 409);
    });

    await t.test('staff production status synchronizes items; processed stock stays consumed', async () => {
      const fixtureOrder = await fixture(); await pay(fixtureOrder);
      await ok(request(`/orders/${fixtureOrder.order.id}/status`, 'PATCH', { status: 'preparing' }));
      for (const item of fixtureOrder.items) assert.equal((await item.reload()).status, 'preparing');
      const consumed = await stock();
      await ok(cancel(fixtureOrder));
      assert.deepEqual(await stock(), consumed);
      for (const item of fixtureOrder.items) assert.equal(Boolean((await item.reload()).stock_refunded), false);
      const finished = await fixture(); await pay(finished);
      await ok(request(`/orders/${finished.order.id}/status`, 'PATCH', { status: 'preparing' }));
      await ok(request(`/orders/${finished.order.id}/status`, 'PATCH', { status: 'completed' }));
      for (const item of finished.items) assert.equal((await item.reload()).status, 'completed');
      const before = await snapshot(finished);
      assert.equal((await cancel(finished)).status, 400);
      assert.equal((await itemAction(finished, 0, 'reject')).status, 409);
      assert.deepEqual(await snapshot(finished), before);
    });

    await t.test('rejecting a started item consumes stock and does not restore used ingredients', async () => {
      const fixtureOrder = await fixture(1); await pay(fixtureOrder);
      await ok(request(`/orders/${fixtureOrder.order.id}/items/process-all`));
      const consumed = await stock();
      await ok(itemAction(fixtureOrder, 0, 'reject'));
      assert.deepEqual(await stock(), consumed);
      assert.equal((await fixtureOrder.order.reload()).status, 'cancelled');
      assert.equal(Boolean((await fixtureOrder.items[0].reload()).stock_refunded), false);
    });

    await t.test('cancel versus production or rejection remains consistent under concurrent requests', async () => {
      const production = await fixture(); const initial = await stock(); await pay(production);
      const consumed = await stock();
      const [processResult, cancellation] = await Promise.all([request(`/orders/${production.order.id}/items/process-all`), cancel(production)]);
      assert.equal(cancellation.status, 200, JSON.stringify(cancellation));
      assert.ok([200, 409].includes(processResult.status), JSON.stringify(processResult));
      assert.deepEqual(await stock(), processResult.status === 200 ? consumed : initial);
      assert.equal((await production.order.reload()).status, 'cancelled');
      const rejection = await fixture(); const before = await stock(); await pay(rejection);
      const [rejected, cancelled] = await Promise.all([itemAction(rejection, 0, 'reject'), cancel(rejection)]);
      assert.ok([200, 409].includes(rejected.status), JSON.stringify(rejected));
      assert.equal(cancelled.status, 200, JSON.stringify(cancelled));
      assert.deepEqual(await stock(), before);
      const cash = await fixture(); const cashInitial = await stock();
      const [payment, cashCancelled] = await Promise.all([request(`/payments/${cash.order.id}/cash`, 'POST'), cancel(cash)]);
      assert.ok([200, 400].includes(payment.status), JSON.stringify(payment));
      assert.equal(cashCancelled.status, 200);
      assert.deepEqual(await stock(), cashInitial);
      assert.equal((await cash.order.reload()).status, 'cancelled');
      const callback = await fixture(); const callbackInitial = await stock();
      const [notification, callbackCancelled] = await Promise.all([
        request('/payments/callback', 'POST', { event: 'payment.success', status: 'Success', ref_id: callback.payment.ref_id }), cancel(callback),
      ]);
      assert.equal(notification.status, 200, JSON.stringify(notification));
      assert.equal(callbackCancelled.status, 200, JSON.stringify(callbackCancelled));
      assert.deepEqual(await stock(), callbackInitial);
      assert.equal((await callback.order.reload()).status, 'cancelled');
      assert.equal((await callback.payment.reload()).status, 'paid');
      const simulated = await fixture(); const simulatedInitial = await stock();
      const [simulation, simulatedCancelled] = await Promise.all([
        request(`/payments/${simulated.order.id}/simulate-pay`, 'POST'), cancel(simulated),
      ]);
      assert.equal(simulation.status, 200, JSON.stringify(simulation));
      assert.equal(simulatedCancelled.status, 200, JSON.stringify(simulatedCancelled));
      assert.deepEqual(await stock(), simulatedInitial);
      assert.equal((await simulated.order.reload()).status, 'cancelled');
    });

    await t.test('invalid later snapshot rolls back cancellation, prior refunds, logs and notifications', async () => {
      const fixtureOrder = await fixture(); await pay(fixtureOrder);
      await fixtureOrder.items[1].update({ stock_usage: [{ raw_material_id: base.id, quantity_used: -5 }] });
      const before = await snapshot(fixtureOrder);
      assert.equal((await cancel(fixtureOrder)).status, 409);
      assert.deepEqual(await snapshot(fixtureOrder), before);
    });

    await t.test('legacy paid recipes and menus without recipes retain safe cancellation behavior', async () => {
      const legacy = await fixture(1, null); const initial = await stock(); await pay(legacy);
      // Old rows can predate flags/snapshots; exact item deduction logs are evidence.
      await legacy.items[0].update({ stock_deducted: false });
      await recipe.update({ quantity_used: 99 });
      await ok(cancel(legacy));
      assert.deepEqual(await stock(), initial);
      await ok(cancel(legacy)); assert.deepEqual(await stock(), initial);
      await recipe.update({ quantity_used: 0.5 });
      const plain = await fixture(1, []); await pay(plain); await ok(cancel(plain));
      assert.deepEqual(await stock(), initial);
      const undeducted = await fixture(1, [{ raw_material_id: base.id, quantity_used: 0.5 }]);
      await undeducted.payment.update({ status: 'paid' }); await undeducted.order.update({ status: 'confirmed' });
      await ok(cancel(undeducted));
      assert.deepEqual(await stock(), initial, 'a snapshot never deducted must not create stock');
      const undocumented = await fixture(1, null);
      await undocumented.payment.update({ status: 'paid' }); await undocumented.order.update({ status: 'confirmed' });
      await ok(cancel(undocumented));
      assert.deepEqual(await stock(), initial, 'legacy items without item-level deduction evidence must not invent stock');
    });

    await t.test('signed late and repeated success callbacks keep cancelled orders cancelled', async () => {
      const fixtureOrder = await fixture(); const initial = await stock(); await pay(fixtureOrder); await ok(cancel(fixtureOrder));
      for (const [event, status] of [['payment.late', 'PaidLate'], ['payment.success', 'Success']]) {
        const from = events.length;
        await ok(request('/payments/callback', 'POST', { event, status, ref_id: fixtureOrder.payment.ref_id }));
        assert.equal((await fixtureOrder.order.reload()).status, 'cancelled');
        assert.equal((await fixtureOrder.payment.reload()).status, 'paid');
        assert.deepEqual(await stock(), initial);
        const statuses = events.slice(from).filter(([name]) => name === 'order-status-update');
        assert.ok(statuses.every(([, payload]) => payload.status === 'cancelled'));
      }
    });

    await t.test('expiry rechecks locked state and never cancels a newly paid order', async () => {
      const cutoff = new Date(Date.now() - 10 * 60000);
      const old = new Date(Date.now() - 11 * 60000);
      const unpaid = await fixture();
      await sequelize.query('UPDATE orders SET created_at = :old WHERE id = :id', { replacements: { old, id: unpaid.order.id } });
      assert.ok(await expirePendingOrder(unpaid.order.id, cutoff));
      assert.equal((await unpaid.payment.reload()).status, 'expired');
      assert.equal(await expirePendingOrder(unpaid.order.id, cutoff), null);
      assert.equal(await OrderStatusLog.count({ where: { order_id: unpaid.order.id, status: 'cancelled' } }), 1);
      const paid = await fixture();
      await sequelize.query('UPDATE orders SET created_at = :old WHERE id = :id', { replacements: { old, id: paid.order.id } });
      await pay(paid);
      const before = await snapshot(paid);
      assert.equal(await expirePendingOrder(paid.order.id, cutoff), null);
      assert.deepEqual(await snapshot(paid), before);
      // Payment is authoritative even for an inconsistent pending order.
      await paid.order.update({ status: 'pending' });
      assert.equal(await expirePendingOrder(paid.order.id, cutoff), null);
      const fresh = await fixture();
      assert.equal(await expirePendingOrder(fresh.order.id, cutoff), null);
      const racing = await fixture(); const initial = await stock();
      await sequelize.query('UPDATE orders SET created_at = :old WHERE id = :id', { replacements: { old, id: racing.order.id } });
      const [callback] = await Promise.all([
        request('/payments/callback', 'POST', { event: 'payment.late', status: 'PaidLate', ref_id: racing.payment.ref_id }),
        expirePendingOrder(racing.order.id, cutoff),
      ]);
      assert.equal(callback.status, 200, JSON.stringify(callback));
      const finalStatus = (await racing.order.reload()).status;
      assert.ok(['cancelled', 'confirmed'].includes(finalStatus));
      assert.equal((await racing.payment.reload()).status, 'paid');
      assert.deepEqual(await stock(), finalStatus === 'cancelled' ? initial : [initial[0] - 1.5, initial[1] - 0.75]);
    });
  } finally {
    if (server) await new Promise(resolve => server.close(resolve));
    await sequelize.close();
    if (!/^kitkop_cancellation_test_\d+$/.test(database)) throw new Error('Unexpected test database');
    await admin.query(`DROP DATABASE \`${database}\``); await admin.end();
  }
});
