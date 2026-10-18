const test = require('node:test');
const assert = require('node:assert/strict');

test('customer menus exclude recipes and stock while staff workflows and server stock calculations remain intact', { skip: process.env.KITKOP_OPTIONS_DB_TEST !== 'true' }, async t => {
  require('dotenv').config();
  assert.ok(['localhost', '127.0.0.1', '::1'].includes(process.env.DB_HOST), 'Use a local test database only');
  process.env.JWT_SECRET = 'public-menu-test-only';
  const database = `kitkop_public_menu_test_${process.pid}`;
  const admin = await require('mysql2/promise').createConnection({
    host: process.env.DB_HOST, port: process.env.DB_PORT || 3306, user: process.env.DB_USER, password: process.env.DB_PASSWORD,
  });
  await admin.query(`CREATE DATABASE \`${database}\``);
  process.env.DB_NAME = database;
  const { sequelize } = require('../config/database');
  const { User, MenuCategory, Menu, MenuRecipe, RawMaterial, OptionGroup, OrderItem } = require('../models');
  let server;
  try {
    await sequelize.sync();
    const users = {};
    const jwt = require('jsonwebtoken');
    for (const role of ['owner', 'manajer', 'kasir', 'kitchen', 'barista']) {
      users[role] = await User.create({ name: role, username: role, email: `${role}@example.test`, password_hash: 'unused', role });
    }
    const auth = user => ({ Authorization: `Bearer ${jwt.sign({ id: user.id, sessionVersion: user.session_version }, process.env.JWT_SECRET, { expiresIn: '1h' })}` });
    const category = await MenuCategory.create({ name: 'Kopi', description: 'PRIVATE_CATEGORY' });
    const menu = await Menu.create({ name: 'Kopi fixture', category_id: category.id, description: 'Public description', price: 10000 });
    const plain = await Menu.create({ name: 'Plain fixture', category_id: category.id, price: 5000 });
    const material = await RawMaterial.create({ name: 'PRIVATE_INGREDIENT', stock: 100, unit: 'gram', min_stock: 10 });
    await MenuRecipe.create({ menu_id: menu.id, raw_material_id: material.id, quantity_used: 5 });
    const group = await OptionGroup.create({ name: 'Tambahan', min_choices: 1, max_choices: 1, is_active: true, choices: [
      { id: 'extra', name: 'Extra shot', price: 500, is_available: true, is_default: true,
        ingredients: [{ raw_material_id: material.id, quantity_used: 2 }],
        internal_metadata: { recipe: { rawMaterial: { name: 'PRIVATE_INGREDIENT', stock: 100 } } } },
    ] });
    const optional = await OptionGroup.create({ name: 'Opsional', min_choices: 0, max_choices: 0, is_active: true, choices: [
      { id: 'hot', name: 'Hot', price: 0, is_available: false, is_default: false, ingredients: [] },
    ] });
    await menu.addOptionGroup(optional, { through: { sort_order: 2 } });
    await menu.addOptionGroup(group, { through: { sort_order: 0 } });
    const app = require('express')(); app.use(require('express').json());
    app.use('/api/menus', require('../routes/menuRoutes'));
    app.use('/api/recipes', require('../routes/recipeRoutes'));
    app.use('/api/orders', require('../routes/orderRoutes'));
    app.use('/api/payments', require('../routes/paymentRoutes'));
    app.use((error, req, res, next) => res.status(error.statusCode || 500).json({ message: error.message }));
    server = app.listen(0, '127.0.0.1'); await new Promise(resolve => server.once('listening', resolve));
    const base = `http://127.0.0.1:${server.address().port}/api`;
    const request = async (path, headers = {}, method = 'GET', body) => {
      const response = await fetch(base + path, { method, headers: { 'Content-Type': 'application/json', ...headers }, body: body === undefined ? undefined : JSON.stringify(body) });
      return { status: response.status, body: await response.json() };
    };
    const forbidden = new Set(['recipes', 'recipe', 'rawMaterial', 'rawMaterials', 'ingredients', 'raw_material_id', 'quantity_used', 'stock', 'min_stock', 'stock_usage', 'MenuOptionGroup', 'internal_metadata']);
    const assertPublic = value => {
      if (!value || typeof value !== 'object') return;
      for (const [key, child] of Object.entries(value)) {
        assert.equal(forbidden.has(key), false, `Internal property ${key} must not be public`);
        assertPublic(child);
      }
      assert.equal(JSON.stringify(value).includes('PRIVATE_'), false);
    };

    await t.test('anonymous list/detail omit all internal properties through nested relations and preserve selectable options', async () => {
      for (const path of ['/menus', `/menus?search=Kopi&category_id=${category.id}&available_only=true`, `/menus/${menu.id}`]) {
        const response = await request(path); assert.equal(response.status, 200); assertPublic(response.body);
      }
      const detail = (await request(`/menus/${menu.id}`)).body.data;
      assert.equal(detail.name, menu.name); assert.equal(Number(detail.price), 10000);
      assert.deepEqual(detail.category, { id: category.id, name: 'Kopi' });
      assert.deepEqual(detail.optionGroups.map(row => row.id), [group.id, optional.id]);
      assert.deepEqual(detail.optionGroups[0].choices, [{ id: 'extra', name: 'Extra shot', price: 500, is_available: true, is_default: true }]);
      assert.equal(detail.optionGroups[1].max_choices, 0);
      assert.equal(detail.optionGroups[1].choices[0].is_available, false);
    });

    await t.test('login headers and client include/staff flags cannot turn a public endpoint into a private representation', async () => {
      const baseline = await request(`/menus/${menu.id}`);
      for (const headers of [auth(users.owner), auth(users.manajer), auth(users.kasir), auth(users.kitchen), auth(users.barista), { Authorization: 'Bearer invalid' }]) {
        const response = await request(`/menus/${menu.id}?include=recipes,rawMaterial&staff=true`, headers);
        assert.deepEqual(response, baseline); assertPublic(response.body);
        assertPublic((await request('/menus?include=recipes', headers)).body);
      }
    });

    await t.test('staff retain authenticated recipes and permitted option editing; guests and invalid sessions get no internal data', async () => {
      for (const headers of [{}, { Authorization: 'Bearer invalid' }]) {
        assert.equal((await request(`/recipes?menu_id=${menu.id}`, headers)).status, 401);
        assert.equal((await request(`/menus/${menu.id}/options`, headers)).status, 401);
      }
      for (const role of Object.keys(users)) {
        const response = await request(`/recipes?menu_id=${menu.id}`, auth(users[role]));
        assert.equal(response.status, 200);
        assert.equal(Number(response.body.data[0].quantity_used), 5);
        assert.equal(response.body.data[0].rawMaterial.name, 'PRIVATE_INGREDIENT');
        assert.equal(Number(response.body.data[0].rawMaterial.stock), 100);
      }
      for (const role of ['owner', 'manajer', 'kasir']) {
        const response = await request(`/menus/${menu.id}/options`, auth(users[role]));
        assert.equal(response.status, 200);
        assert.equal(response.body.data[0].choices[0].ingredients[0].quantity_used, 2);
      }
      assert.equal((await request(`/menus/${menu.id}/options`, auth(users.kitchen))).status, 403);
      const old = auth(users.barista);
      await users.barista.update({ session_version: 1 });
      assert.equal((await request('/recipes', old)).status, 401);
      await users.barista.update({ is_active: false });
      assert.equal((await request('/recipes', auth(users.barista))).status, 401);
    });

    await t.test('guest ordering from public choice IDs still snapshots recipes and deducts the exact base/add-on stock on payment', async () => {
      const detail = (await request(`/menus/${menu.id}`)).body.data;
      const created = await request('/orders', {}, 'POST', { customer_name: 'Guest', items: [
        { menu_id: detail.id, qty: 2, option_ids: [detail.optionGroups[0].choices[0].id], expected_price: 10500 },
      ] });
      assert.equal(created.status, 201); assert.equal(Number(created.body.data.total), 23100);
      const order = created.body.data;
      const item = await OrderItem.findOne({ where: { order_id: order.id } });
      assert.equal(item.stock_usage[0].quantity_used, 7);
      const paid = await request(`/payments/${order.id}/cash`, auth(users.kasir), 'POST', {});
      assert.equal(paid.status, 200); assert.equal(Number((await material.reload()).stock), 86);
      const tracked = await request(`/orders/track/${order.order_number}`, { 'X-Order-Tracking-Token': order.tracking_token });
      assert.equal(tracked.status, 200); assert.equal(tracked.body.data.status, 'confirmed');
      assertPublic(tracked.body.data.items[0].menu);
    });

    await t.test('staff can reload and save full option recipes while mutation responses stay public', async () => {
      const groups = (await request(`/menus/${menu.id}/options`, auth(users.owner))).body.data;
      groups[0].choices[0].ingredients[0].quantity_used = 3;
      groups[0].choices[0].price = 750;
      const updated = await request(`/menus/${menu.id}`, auth(users.owner), 'PUT', { option_groups: groups });
      assert.equal(updated.status, 200); assertPublic(updated.body);
      assert.equal(updated.body.data.optionGroups[0].choices[0].price, 750);
      const stored = (await request(`/menus/${menu.id}/options`, auth(users.owner))).body.data;
      assert.equal(stored[0].choices[0].ingredients[0].quantity_used, 3);
      assert.equal(Number((await material.reload()).stock), 86);
      assert.equal(Number((await MenuRecipe.findOne({ where: { menu_id: menu.id } })).quantity_used), 5);
    });

    await t.test('plain menus and missing menus preserve the customer API contract', async () => {
      const detail = await request(`/menus/${plain.id}`);
      assert.equal(detail.status, 200); assert.deepEqual(detail.body.data.optionGroups, []); assertPublic(detail.body);
      assert.equal((await request('/menus/2147483647')).status, 404);
      const created = await request('/menus', auth(users.manajer), 'POST', { name: 'New menu', category_id: category.id, price: 5000 });
      assert.equal(created.status, 201); assertPublic(created.body);
    });
  } finally {
    if (server) await new Promise(resolve => server.close(resolve));
    await sequelize.close();
    assert.match(database, /^kitkop_public_menu_test_\d+$/);
    await admin.query(`DROP DATABASE \`${database}\``); await admin.end();
  }
});
