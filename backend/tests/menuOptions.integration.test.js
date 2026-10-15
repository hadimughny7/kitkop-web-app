const test = require('node:test');
const assert = require('node:assert/strict');

test('options APIs, immutable order snapshots, payments and stock refunds', { skip: process.env.KITKOP_OPTIONS_DB_TEST !== 'true' }, async () => {
  require('dotenv').config();
  process.env.KUYZPAY_SECRET = 'integration-webhook-secret';
  const mysql = require('mysql2/promise');
  const database = `kitkop_options_test_${process.pid}`;
  const connection = await mysql.createConnection({ host: process.env.DB_HOST, port: process.env.DB_PORT || 3306, user: process.env.DB_USER, password: process.env.DB_PASSWORD });
  await connection.query(`CREATE DATABASE \`${database}\``);
  process.env.DB_NAME = database;
  const { sequelize } = require('../config/database');
  const { User, MenuCategory, Menu, RawMaterial, MenuRecipe, Order, OrderItem, Transaction, StockLog, OptionTemplate } = require('../models');
  let server;
  try {
    await sequelize.sync();
    // Exercise upgrading an old order_items schema, then running the migration again.
    for (const column of ['base_price', 'selected_options', 'stock_usage', 'stock_deducted', 'stock_refunded']) {
      await sequelize.getQueryInterface().removeColumn('order_items', column);
    }
    const migrate = require('../migrations/add-menu-options');
    await migrate(); await migrate();
    const owner = await User.create({ name: 'Owner test', email: 'owner@example.test', username: 'owner', password_hash: 'test', role: 'owner' });
    const cashier = await User.create({ name: 'Cashier test', email: 'cashier@example.test', username: 'cashier', password_hash: 'test', role: 'kasir' });
    const kitchen = await User.create({ name: 'Kitchen test', email: 'kitchen@example.test', username: 'kitchen', password_hash: 'test', role: 'kitchen' });
    const manager = await User.create({ name: 'Manager test', email: 'manager@example.test', username: 'manager', password_hash: 'test', role: 'manajer' });
    const inactiveCashier = await User.create({ name: 'Inactive test', email: 'inactive@example.test', username: 'inactive', password_hash: 'test', role: 'kasir', is_active: 0 });
    const category = await MenuCategory.create({ name: 'Kopi' });
    const material = await RawMaterial.create({ name: 'Biji kopi', stock: 1000, unit: 'gram' });
    const menu = await Menu.create({ category_id: category.id, name: 'Kopi susu', price: 20000 });
    await MenuRecipe.create({ menu_id: menu.id, raw_material_id: material.id, quantity_used: 18 });
    const plain = await Menu.create({ category_id: category.id, name: 'Air mineral', price: 5000 });
    const express = require('express');
    const { capturePaymentWebhookBody } = require('../services/paymentWebhookSignature');
    const app = express(); app.use(express.json({ verify: capturePaymentWebhookBody }));
    const emittedEvents = [];
    app.set('io', { emit: (...args) => emittedEvents.push(args) });
    app.use('/api/option-groups', require('../routes/optionGroupRoutes'));
    app.use('/api/option-templates', require('../routes/optionTemplateRoutes'));
    app.use('/api/menus', require('../routes/menuRoutes'));
    app.use('/api/orders', require('../routes/orderRoutes'));
    app.use('/api/payments', require('../routes/paymentRoutes'));
    app.use('/api/stocks', require('../routes/stockRoutes'));
    app.use((err, req, res, next) => res.status(err.statusCode || 500).json({ message: err.message }));
    server = app.listen(0, '127.0.0.1'); await new Promise((resolve) => server.once('listening', resolve));
    const base = `http://127.0.0.1:${server.address().port}/api`;
    const jwt = require('jsonwebtoken');
    const call = async (path, method = 'GET', body, user = owner, expected = 200, extraHeaders = {}) => {
      const headers = { 'Content-Type': 'application/json', ...extraHeaders };
      if (user) headers.Authorization = `Bearer ${jwt.sign({ id: user.id }, process.env.JWT_SECRET || 'test')}`;
      const response = await fetch(base + path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
      const data = await response.json();
      assert.equal(response.status, expected, `${method} ${path}: ${JSON.stringify(data)}`);
      return data.data;
    };
    const definition = { name: 'Penyajian', min_choices: 1, max_choices: 1, is_active: true, choices: [
      { id: 'ice', name: 'Ice', price: 2000, is_available: true, ingredients: [{ raw_material_id: material.id, quantity_used: 2 }] },
      { id: 'hot', name: 'Hot', price: 0, is_available: true },
    ] };
    await call('/option-groups', 'GET', undefined, null, 401);
    await call('/option-groups', 'POST', definition, cashier, 403);
    await call('/option-groups', 'POST', definition, kitchen, 403);
    const group = await call('/option-groups', 'POST', definition);
    await call(`/stocks/${material.id}`, 'DELETE', undefined, owner, 400);
    await call(`/menus/${menu.id}`, 'PUT', { option_group_ids: [group.id] });
    const publicMenu = await call(`/menus/${menu.id}`, 'GET', undefined, null);
    assert.equal(publicMenu.optionGroups[0].name, 'Penyajian');
    assert.equal('ingredients' in publicMenu.optionGroups[0].choices[0], false);
    assert.deepEqual((await call(`/menus/${plain.id}`)).optionGroups, []);
    const orderPayload = (id, options, qty = 2) => ({ customer_name: 'Test pelanggan', order_type: 'qr', items: [{ menu_id: id, qty, option_ids: options }] });
    // F03: rejected cash requests must not change the order, transaction or stock.
    const guarded = await call('/orders', 'POST', orderPayload(plain.id, []), null, 201);
    const pendingPayment = await Transaction.create({ order_id: guarded.id, ref_id: 'F03-GUARDED', amount: guarded.total, payment_method: 'QRIS', status: 'pending' });
    const stockBeforeAuthChecks = Number((await material.reload()).stock);
    const logsBeforeAuthChecks = await StockLog.count();
    await call(`/payments/${guarded.id}/cash`, 'POST', {}, null, 401);
    await call(`/payments/${guarded.id}/cash`, 'POST', {}, kitchen, 403);
    await call(`/payments/${guarded.id}/cash`, 'POST', {}, inactiveCashier, 401);
    for (const token of ['invalid-token', jwt.sign({ id: cashier.id }, process.env.JWT_SECRET || 'test', { expiresIn: -1 })]) {
      const response = await fetch(`${base}/payments/${guarded.id}/cash`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: '{}' });
      assert.equal(response.status, 401);
    }
    assert.equal((await Order.findByPk(guarded.id)).status, 'pending');
    assert.equal((await pendingPayment.reload()).status, 'pending');
    assert.equal(pendingPayment.payment_method, 'QRIS');
    assert.equal(Number((await material.reload()).stock), stockBeforeAuthChecks);
    assert.equal(await StockLog.count(), logsBeforeAuthChecks);
    // The normal POS workflow still creates an order, then pays it in one action.
    for (const staff of [cashier, manager, owner]) {
      const posOrder = await call('/orders', 'POST', { ...orderPayload(plain.id, []), order_type: 'kasir' }, staff, 201);
      await call(`/payments/${posOrder.id}/cash`, 'POST', {}, staff);
      assert.equal((await Order.findByPk(posOrder.id)).status, 'confirmed');
      const paid = await Transaction.findOne({ where: { order_id: posOrder.id } });
      assert.equal(paid.status, 'paid');
      assert.equal(paid.payment_method, 'CASH');
    }
    await call('/orders', 'POST', orderPayload(menu.id, []), null, 400);
    await call('/orders', 'POST', orderPayload(menu.id, ['ice', 'ice']), null, 400);
    await call('/orders', 'POST', orderPayload(menu.id, ['foreign']), null, 400);
    await call('/orders', 'POST', orderPayload(menu.id, ['ice'], -1), null, 400);
    const stale = orderPayload(menu.id, ['ice']); stale.items[0].expected_price = 1;
    await call('/orders', 'POST', stale, null, 409);
    const plainOrder = await call('/orders', 'POST', orderPayload(plain.id, []), null, 201);
    assert.equal(Number(plainOrder.subtotal), 10000);
    const order = await call('/orders', 'POST', orderPayload(menu.id, ['ice']), null, 201);
    assert.equal(Number(order.subtotal), 44000);
    assert.equal(Number(order.items[0].base_price), 20000);
    assert.equal(Number(order.total), 48400);
    assert.equal(Number((await material.reload()).stock), 1000);
    await call(`/option-groups/${group.id}`, 'PUT', { ...definition, choices: [{ ...definition.choices[0], name: 'Ice baru', price: 9000, ingredients: [{ raw_material_id: material.id, quantity_used: 90 }] }, definition.choices[1]] });
    const tracked = await call(`/orders/track/${order.order_number}`, 'GET', undefined, null);
    assert.equal(tracked.items[0].selected_options[0].name, 'Ice');
    assert.equal('stock_usage' in tracked.items[0], false);
    assert.equal(Number(tracked.items[0].price), 22000);
    await Promise.all([call(`/payments/${order.id}/cash`, 'POST', {}), call(`/payments/${order.id}/cash`, 'POST', {})]);
    assert.equal(Number((await material.reload()).stock), 960);
    await call(`/payments/${order.id}/cash`, 'POST', {});
    assert.equal(Number((await material.reload()).stock), 960);
    await call(`/orders/${order.id}/items/${order.items[0].id}/reject`, 'PATCH', {}, kitchen);
    assert.equal(Number((await material.reload()).stock), 1000);
    await call(`/orders/${order.id}/items/${order.items[0].id}/reject`, 'PATCH', {}, kitchen, 400);
    assert.equal(Number((await material.reload()).stock), 1000);
    // Availability may exhaust a required group: clients must then block submission.
    await call(`/option-groups/${group.id}/choices/ice/availability`, 'PATCH', { is_available: false }, cashier);
    await call('/orders', 'POST', orderPayload(menu.id, ['ice']), null, 400);
    // Simulated QRIS and repeated payment notifications share stock idempotency.
    const qr = await call('/orders', 'POST', orderPayload(menu.id, ['hot']), null, 201);
    await Transaction.create({ order_id: qr.id, ref_id: 'QR-TEST', amount: qr.total, payment_method: 'QRIS', status: 'pending' });
    // Exercise the actual callback handler locally; no payment gateway request is made.
    const signWebhook = (body) => require('node:crypto').createHmac('sha256', process.env.KUYZPAY_SECRET).update(body).digest('hex');
    const webhookBody = { ref_id: 'QR-TEST', event: 'payment.success', status: 'Success' };
    const webhookJson = JSON.stringify(webhookBody);
    const eventsBeforeBadWebhooks = emittedEvents.length;
    const logsBeforeBadWebhooks = await StockLog.count();
    for (const signature of [undefined, '', 'broken', 'a'.repeat(63), 'z'.repeat(64), '0'.repeat(64)]) {
      await call('/payments/callback', 'POST', webhookBody, null, 401, signature === undefined ? {} : { 'x-kuyzpay-signature': signature });
    }
    // A body MD5 signature is not a substitute for a valid HMAC header.
    await call('/payments/callback', 'POST', { ...webhookBody, signature: require('node:crypto').createHash('md5').update(`${process.env.KUYZPAY_MERCHANT_ID}:${process.env.KUYZPAY_SECRET}:QR-TEST`).digest('hex') }, null, 401);
    await call('/payments/callback', 'POST', { ...webhookBody, status: 'Expired' }, null, 401, { 'x-kuyzpay-signature': signWebhook(webhookJson) });
    await call('/payments/callback', 'POST', webhookBody, null, 400, { 'x-kuyzpay-signature': signWebhook(webhookJson), 'x-kuyzpay-event': 'payment.expired' });
    assert.equal((await Transaction.findOne({ where: { order_id: qr.id } })).status, 'pending');
    assert.equal((await Order.findByPk(qr.id)).status, 'pending');
    assert.equal(Number((await material.reload()).stock), 1000);
    assert.equal(await StockLog.count(), logsBeforeBadWebhooks);
    assert.equal(emittedEvents.length, eventsBeforeBadWebhooks);
    const rawWebhook = '{\n  "status": "Success",\n  "event": "payment.success",\n  "ref_id": "QR-TEST",\n  "customer_name": "Pelanggan café"\n}\n';
    const validResponse = await fetch(`${base}/payments/callback`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-kuyzpay-signature': signWebhook(rawWebhook), 'x-kuyzpay-event': 'payment.success' }, body: rawWebhook });
    assert.equal(validResponse.status, 200);
    assert.equal((await validResponse.json()).status, true);
    await call('/payments/callback', 'POST', webhookBody, null, 200, { 'x-kuyzpay-signature': signWebhook(webhookJson) });
    assert.equal(Number((await material.reload()).stock), 964);
    await call(`/payments/${qr.id}/simulate-pay`, 'POST', {}, null);
    await call(`/payments/${qr.id}/simulate-pay`, 'POST', {}, null);
    assert.equal(Number((await material.reload()).stock), 964);
    assert.equal((await OrderItem.findByPk(qr.items[0].id)).stock_deducted, true);
    assert.equal(await StockLog.count({ where: { reference_order_id: qr.id, type: 'auto_deduction' } }), 1);

    // Create and edit options in the menu request itself, without a library step.
    const directDefinition = { ...definition, choices: definition.choices.map((c) => ({ ...c, id: `direct-${c.id}` })) };
    const direct = await call('/menus', 'POST', { category_id: category.id, name: 'Kopi langsung', price: 18000, option_groups: [directDefinition] }, owner, 201);
    assert.equal(direct.optionGroups.length, 1);
    const directGroups = await call(`/menus/${direct.id}/options`);
    const { templateFingerprint } = require('../services/optionTemplates');
    const savedTemplate = await OptionTemplate.findOne({ where: { fingerprint: templateFingerprint(directDefinition) } });
    assert.ok(savedTemplate, 'saving a new menu also saves a reusable shortcut');
    assert.equal(savedTemplate.choices[0].ingredients[0].quantity_used, 2);
    await call('/option-templates', 'GET', undefined, null, 401);
    await call('/option-templates', 'GET', undefined, cashier, 403);
    await call(`/option-templates/${savedTemplate.id}`, 'DELETE', undefined, cashier, 403);
    assert.ok((await call('/option-templates')).some((t) => t.id === savedTemplate.id));
    await call(`/option-templates/${savedTemplate.id}`, 'DELETE');
    assert.equal((await call('/option-templates')).some((t) => t.id === savedTemplate.id), false);
    assert.equal((await call(`/menus/${direct.id}`)).optionGroups[0].choices[0].id, 'direct-ice');
    const reused = await call('/menus', 'POST', { category_id: category.id, name: 'Kopi template copy', price: 18000, option_groups: [{ ...directDefinition, choices: directDefinition.choices.map((c) => ({ ...c, id: `copy-${c.id}` })) }] }, owner, 201);
    assert.notEqual(reused.optionGroups[0].id, directGroups[0].id);
    assert.equal(await OptionTemplate.count({ where: { fingerprint: savedTemplate.fingerprint } }), 1);
    assert.equal((await savedTemplate.reload()).is_deleted, true, 'saving the same configuration does not resurrect a deleted shortcut');
    const reusedOrder = await call('/orders', 'POST', orderPayload(reused.id, ['copy-direct-ice']), null, 201);
    assert.equal(Number(reusedOrder.items[0].price), 20000);
    assert.equal(reusedOrder.items[0].selected_options[0].name, 'Ice');
    const unlimitedDefinition = { name: 'Tambahan bebas', min_choices: 1, max_choices: 0, is_active: true,
      choices: Array.from({ length: 4 }, (_, i) => ({ id: `unlimited-${i}`, name: `Extra ${i}`, price: 100, is_available: true, is_default: true })) };
    const unlimitedMenu = await call('/menus', 'POST', { category_id: category.id, name: 'Menu tanpa batas pilihan', price: 18000, option_groups: [unlimitedDefinition] }, owner, 201);
    assert.equal(unlimitedMenu.optionGroups[0].max_choices, 0);
    const unlimitedOrder = await call('/orders', 'POST', orderPayload(unlimitedMenu.id, unlimitedDefinition.choices.map((c) => c.id)), null, 201);
    assert.equal(unlimitedOrder.items[0].selected_options.length, 4);
    assert.equal(Number(unlimitedOrder.subtotal), 36800);
    assert.ok((await call('/option-templates')).some((t) => t.name === 'Tambahan bebas' && t.max_choices === 0));
    const multipart = new FormData();
    multipart.append('name', 'Kopi multipart');
    multipart.append('price', '19000');
    multipart.append('category_id', String(category.id));
    multipart.append('option_groups', JSON.stringify([{ ...directDefinition, choices: directDefinition.choices.map((c) => ({ ...c, id: `multipart-${c.id}` })) }]));
    const multipartResponse = await fetch(`${base}/menus`, { method: 'POST', headers: { Authorization: `Bearer ${jwt.sign({ id: owner.id }, process.env.JWT_SECRET || 'test')}` }, body: multipart });
    assert.equal(multipartResponse.status, 201);
    assert.equal((await multipartResponse.json()).data.optionGroups[0].choices.length, 2);
    assert.equal(directGroups[0].choices[0].ingredients[0].quantity_used, 2);
    const edited = await call(`/menus/${direct.id}`, 'PUT', { name: 'Kopi langsung baru', option_groups: [{ ...directGroups[0], choices: directGroups[0].choices.map((c) => ({ ...c, price: 1000 })) }] });
    assert.equal(edited.optionGroups[0].id, directGroups[0].id);
    assert.equal(edited.optionGroups[0].choices[0].id, 'direct-ice');
    assert.equal(edited.optionGroups[0].choices[0].price, 1000);
    await call(`/menus/${direct.id}`, 'PUT', { name: 'Invalid change', option_groups: [{ ...directGroups[0], min_choices: 5 }] }, owner, 400);
    assert.equal((await menu.reload()).name, 'Kopi susu');
    assert.equal((await call(`/menus/${direct.id}`)).name, 'Kopi langsung baru');
    const { OptionGroup } = require('../models');
    const beforeFailure = await OptionGroup.count();
    await call('/menus', 'POST', { category_id: category.id, name: 'Invalid recipe', price: 18000, option_groups: [{ ...directDefinition, choices: [{ ...directDefinition.choices[0], id: 'bad-material', ingredients: [{ raw_material_id: 999999, quantity_used: 1 }] }] }] }, owner, 400);
    assert.equal(await Menu.count({ where: { name: 'Invalid recipe' } }), 0);
    assert.equal(await OptionGroup.count(), beforeFailure);
    await call(`/menus/${direct.id}/options`, 'GET', undefined, null, 401);
    await call(`/menus/${direct.id}/options`, 'GET', undefined, kitchen, 403);
    await call(`/menus/${direct.id}`, 'PUT', { option_groups: [] }, cashier, 403);

    // An old shared group is preserved until a menu-specific edit makes a copy.
    const shared = await call('/menus', 'POST', { category_id: category.id, name: 'Menu shared lama', price: 10000, option_group_ids: [group.id] }, owner, 201);
    const sharedGroups = await call(`/menus/${shared.id}/options`);
    const isolated = await call(`/menus/${shared.id}`, 'PUT', { option_groups: [{ ...sharedGroups[0], name: 'Penyajian khusus' }] });
    assert.notEqual(isolated.optionGroups[0].id, group.id);
    assert.notEqual(isolated.optionGroups[0].choices[0].id, sharedGroups[0].choices[0].id);
    assert.equal((await call(`/menus/${menu.id}`)).optionGroups[0].name, 'Penyajian');
    await call(`/menus/${direct.id}`, 'PUT', { option_groups: [{ ...sharedGroups[0] }] }, owner, 400);
    const scoped = isolated.optionGroups[0];
    await call(`/menus/${shared.id}/options/${scoped.id}/choices/${scoped.choices[1].id}/availability`, 'PATCH', { is_available: false }, cashier);
    assert.equal((await call(`/menus/${shared.id}`)).optionGroups[0].choices[1].is_available, false);
    assert.equal((await call(`/menus/${menu.id}`)).optionGroups[0].choices[1].is_available, true);
    await call(`/menus/${direct.id}`, 'PUT', { option_groups: [] });
    assert.deepEqual((await call(`/menus/${direct.id}`)).optionGroups, []);
    assert.equal(await OptionGroup.count({ where: { id: directGroups[0].id } }), 0);
    // Existing order snapshots survive option removal.
    assert.equal((await call(`/orders/track/${order.order_number}`, 'GET', undefined, null)).items[0].selected_options[0].name, 'Ice');
    await migrate();
    assert.equal((await call('/option-templates')).some((t) => t.id === savedTemplate.id), false, 'rerunning the migration preserves deletion');
  } finally {
    if (server) await new Promise((resolve) => server.close(resolve));
    await sequelize.close();
    // Only the unique disposable test schema created above can be removed.
    if (!/^kitkop_options_test_\d+$/.test(database)) throw new Error('Unexpected test database');
    await connection.query(`DROP DATABASE \`${database}\``);
    await connection.end();
  }
});
