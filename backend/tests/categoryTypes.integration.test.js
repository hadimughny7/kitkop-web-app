const test = require('node:test');
const assert = require('node:assert/strict');

test('categories require only names and orders derive their type without ID assumptions or extra configuration', { skip: process.env.KITKOP_OPTIONS_DB_TEST !== 'true' }, async t => {
  require('dotenv').config();
  assert.ok(['localhost', '127.0.0.1', '::1'].includes(process.env.DB_HOST), 'Use a local test database only');
  process.env.JWT_SECRET = 'category-names-test';
  const mysql = require('mysql2/promise');
  const database = `kitkop_category_names_test_${process.pid}`;
  const admin = await mysql.createConnection({ host: process.env.DB_HOST, port: process.env.DB_PORT || 3306, user: process.env.DB_USER, password: process.env.DB_PASSWORD });
  await admin.query(`CREATE DATABASE \`${database}\``); process.env.DB_NAME = database;
  const { sequelize } = require('../config/database');
  const { User, MenuCategory, Menu, Order, OrderItem } = require('../models');
  let server;
  try {
    await sequelize.sync();
    const owner = await User.create({ name: 'Owner', username: 'owner', email: 'owner@example.test', role: 'owner', password_hash: 'test' });
    const cashier = await User.create({ name: 'Cashier', username: 'cashier', email: 'cashier@example.test', role: 'kasir', password_hash: 'test' });
    const manager = await User.create({ name: 'Manager', username: 'manager', email: 'manager@example.test', role: 'manajer', password_hash: 'test' });
    const jwt = require('jsonwebtoken');
    const express = require('express'); const app = express(); app.use(express.json());
    app.use('/api/categories', require('../routes/categoryRoutes'));
    app.use('/api/orders', require('../routes/orderRoutes'));
    app.use('/api/payments', require('../routes/paymentRoutes'));
    app.use((err, req, res, next) => res.status(err.statusCode || 500).json({ message: err.message }));
    server = app.listen(0, '127.0.0.1'); await new Promise(resolve => server.once('listening', resolve));
    const base = `http://127.0.0.1:${server.address().port}/api`;
    const request = async (path, method, body, expected = 200, user = owner) => {
      const response = await fetch(base + path, { method, headers: { 'Content-Type': 'application/json', ...(user ? { Authorization: `Bearer ${jwt.sign({ id: user.id }, process.env.JWT_SECRET)}` } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
      const data = await response.json(); assert.equal(response.status, expected, `${method} ${path}: ${JSON.stringify(data)}`); return data.data;
    };
    const order = (menu, user = null) => request('/orders', 'POST', { customer_name: 'Guest', order_type: user ? 'kasir' : 'qr', items: [{ menu_id: menu.id, qty: 1, item_type: 'spoofed' }] }, 201, user);
    await MenuCategory.bulkCreate([
      { id: 1, name: 'Makanan' }, { id: 2, name: 'Manual Brew' }, { id: 3, name: 'Non-Coffee' },
      { id: 4, name: 'Pastry & Bakery' }, { id: 5, name: 'Main Course' }, { id: 6, name: 'Menu Spesial' },
      { id: 73, name: 'Snack' }, { id: 101, name: 'Coffee (Espresso Based)' },
    ]);

    await t.test('existing categories classify independently of IDs for both QR and POS', async () => {
      for (const [id, type] of [[1, 'makanan'], [2, 'minuman'], [3, 'minuman'], [4, 'makanan'], [5, 'makanan'], [6, 'makanan'], [73, 'snack'], [101, 'minuman']]) {
        const menu = await Menu.create({ category_id: id, name: `Item ${id}`, price: 5000 });
        for (const user of [null, cashier]) assert.equal((await order(menu, user)).items[0].item_type, type);
      }
    });

    await t.test('owner and manager create/update categories with name only and no blocked unknown categories', async () => {
      await request('/categories', 'POST', { name: 'Unauthorized' }, 401, null);
      await request('/categories/1', 'PUT', { name: 'Unauthorized' }, 403, cashier);
      for (const [name, type, user] of [['Minuman Dingin', 'minuman', owner], ['Cemilan Goreng', 'snack', manager], ['Menu Baru', 'makanan', owner]]) {
        const category = await request('/categories', 'POST', { name }, 201, user);
        assert.equal('item_type' in category, false);
        const menu = await Menu.create({ category_id: category.id, name, price: 5000 });
        assert.equal((await order(menu)).items[0].item_type, type);
      }
      await request('/categories/6', 'PUT', { description: 'Metadata only' });
      assert.equal((await MenuCategory.findByPk(6)).name, 'Menu Spesial');
    });

    await t.test('rename changes future classification while paid/old order snapshots and production remain intact', async () => {
      const menu = await Menu.create({ category_id: 101, name: 'Rename test', price: 5000 });
      const before = await order(menu);
      await request('/categories/101', 'PUT', { name: 'Snack Kopi', item_type: 'minuman' });
      const after = await order(menu);
      assert.equal(after.items[0].item_type, 'snack');
      assert.equal((await OrderItem.findByPk(before.items[0].id)).item_type, 'minuman');
      await request(`/payments/${before.id}/cash`, 'POST', {});
      for (const action of ['process-all', 'complete-all']) await request(`/orders/${before.id}/items/${action}`, 'PATCH', {});
      assert.equal((await Order.findByPk(before.id)).status, 'completed');
      assert.equal((await OrderItem.findByPk(before.items[0].id)).item_type, 'minuman');
    });

    await t.test('installations that ran the previous migration work without dropping its unused column', async () => {
      await sequelize.getQueryInterface().addColumn('menu_categories', 'item_type', { type: require('sequelize').DataTypes.ENUM('makanan', 'minuman', 'snack'), allowNull: true });
      await sequelize.query("UPDATE menu_categories SET item_type = 'minuman' WHERE id = 1");
      const category = await request('/categories', 'POST', { name: 'Teh Dingin', item_type: 'snack' }, 201);
      const menu = await Menu.create({ category_id: category.id, name: 'Old schema compatible', price: 5000 });
      assert.equal((await order(menu)).items[0].item_type, 'minuman');
      const food = await Menu.create({ category_id: 1, name: 'Food', price: 5000 });
      assert.equal((await order(food)).items[0].item_type, 'makanan');
      const categories = await request('/categories', 'GET');
      assert.ok(categories.every(row => !('item_type' in row)));
    });
  } finally {
    if (server) await new Promise(resolve => server.close(resolve));
    await sequelize.close(); await admin.query(`DROP DATABASE \`${database}\``); await admin.end();
  }
});
