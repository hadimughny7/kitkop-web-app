const test = require('node:test');
const assert = require('node:assert/strict');

test('recipe API, database constraint and payment stock guard reject invalid quantities atomically', { skip: process.env.KITKOP_OPTIONS_DB_TEST !== 'true' }, async () => {
  require('dotenv').config();
  process.env.JWT_SECRET = 'recipe-integration-test';
  const mysql = require('mysql2/promise');
  const database = `kitkop_recipes_test_${process.pid}`;
  const admin = await mysql.createConnection({ host: process.env.DB_HOST, port: process.env.DB_PORT || 3306, user: process.env.DB_USER, password: process.env.DB_PASSWORD });
  await admin.query(`CREATE DATABASE \`${database}\``);
  process.env.DB_NAME = database;
  const { sequelize } = require('../config/database');
  const { User, Menu, MenuCategory, RawMaterial, MenuRecipe, Order, OrderItem, Transaction, StockLog, Customer } = require('../models');
  const migrate = require('../migrations/validate-recipe-quantities');
  let server;
  try {
    await sequelize.sync();
    const owner = await User.create({ name: 'Owner test', email: 'owner@example.test', username: 'owner', password_hash: 'test', role: 'owner' });
    const category = await MenuCategory.create({ name: 'Test' });
    const menu = await Menu.create({ category_id: category.id, name: 'Kopi test', price: 10000 });
    const plain = await Menu.create({ category_id: category.id, name: 'Plain menu', price: 5000 });
    const material = await RawMaterial.create({ name: 'Test material', stock: 100, unit: 'gram' });
    const recipe = await MenuRecipe.create({ menu_id: menu.id, raw_material_id: material.id, quantity_used: 0.5 });
    const express = require('express');
    const app = express(); app.use(express.json());
    const events = [];
    app.set('io', { emit: (...args) => events.push(args) });
    app.use('/api/recipes', require('../routes/recipeRoutes'));
    app.use('/api/orders', require('../routes/orderRoutes'));
    app.use('/api/payments', require('../routes/paymentRoutes'));
    app.use((err, req, res, next) => res.status(err.statusCode || (err.name === 'SequelizeValidationError' ? 400 : 500)).json({ message: err.message }));
    server = app.listen(0, '127.0.0.1');
    await new Promise(resolve => server.once('listening', resolve));
    const jwt = require('jsonwebtoken');
    const request = async (path, method, body, expected = 200) => {
      const response = await fetch(`http://127.0.0.1:${server.address().port}/api${path}`, {
        method, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${jwt.sign({ id: owner.id }, process.env.JWT_SECRET)}` }, body: JSON.stringify(body),
      });
      const data = await response.json();
      assert.equal(response.status, expected, `${method} ${path}: ${JSON.stringify(data)}`);
      return data.data;
    };
    for (const quantity_used of [undefined, -5, '-5', 0, '0', '', ' ', null, 'abc', '5grams', true, false, [], [1], {}, 'Infinity', 0.001, 0.005, 1.234, 100000000]) {
      await request('/recipes', 'POST', { menu_id: menu.id, raw_material_id: material.id, quantity_used }, 400);
      await request(`/recipes/${recipe.id}`, 'PUT', { quantity_used }, 400);
      assert.equal(Number((await recipe.reload()).quantity_used), 0.5);
    }
    await assert.rejects(MenuRecipe.create({ menu_id: plain.id, raw_material_id: material.id, quantity_used: -5 }), { name: 'SequelizeValidationError' });
    assert.equal(await MenuRecipe.count(), 1);

    let serial = 0;
    const fixture = async stock_usage => {
      const order = await Order.create({ order_number: `RECIPE-${++serial}`, total: 10000 });
      // A valid first item exercises rollback if a later item fails stock validation.
      const items = await OrderItem.bulkCreate([
        { order_id: order.id, menu_id: menu.id, qty: 2, price: 10000, stock_usage: [{ raw_material_id: material.id, quantity_used: 0.5 }] },
        { order_id: order.id, menu_id: menu.id, qty: 1, price: 10000, stock_usage },
      ]);
      return { order, items };
    };
    const unchangedAfterFailedCash = async ({ order, items }) => {
      const stock = Number((await material.reload()).stock);
      const logCount = await StockLog.count();
      const eventCount = events.length;
      await request(`/payments/${order.id}/cash`, 'POST', {}, 409);
      assert.equal(Number((await material.reload()).stock), stock);
      assert.equal(await StockLog.count(), logCount);
      assert.equal(await Transaction.count({ where: { order_id: order.id } }), 0);
      assert.equal((await order.reload()).status, 'pending');
      for (const item of items) assert.equal(Boolean((await item.reload()).stock_deducted), false);
      assert.equal(events.length, eventCount);
    };
    // Simulate legacy data predating database constraints, without model validation.
    await sequelize.query('UPDATE menu_recipes SET quantity_used = -5 WHERE id = :id', { replacements: { id: recipe.id } });
    const warnings = [];
    const result = await migrate({ logger: { warn: message => warnings.push(message) } });
    assert.equal(result.enforced, false);
    assert.deepEqual(result.invalidRecipes.map(row => row.id), [recipe.id]);
    assert.equal(warnings.length, 1);
    assert.equal(Number((await recipe.reload()).quantity_used), -5, 'migration must not invent recipe quantities');
    const customersBefore = await Customer.count();
    const ordersBefore = await Order.count();
    await request('/orders', 'POST', { customer_name: 'Invalid recipe test', items: [{ menu_id: menu.id, qty: 1 }] }, 409);
    assert.equal(await Customer.count(), customersBefore);
    assert.equal(await Order.count(), ordersBefore);
    await unchangedAfterFailedCash(await fixture(null));

    // Correct through the actual API, then install and rerun the constraint.
    await request(`/recipes/${recipe.id}`, 'PUT', { quantity_used: '0.50' });
    assert.equal((await migrate()).enforced, true);
    assert.equal((await migrate()).enforced, true);
    for (const quantity of [-5, 0]) {
      await assert.rejects(sequelize.query('UPDATE menu_recipes SET quantity_used = :quantity WHERE id = :id', { replacements: { quantity, id: recipe.id } }));
      await assert.rejects(sequelize.query('INSERT INTO menu_recipes (menu_id, raw_material_id, quantity_used) VALUES (:menu, :material, :quantity)', { replacements: { menu: plain.id, material: material.id, quantity } }));
    }
    assert.equal(Number((await recipe.reload()).quantity_used), 0.5);
    assert.equal(await MenuRecipe.count(), 1);
    for (const quantity_used of [-5, 0, 'abc', true, null]) {
      await unchangedAfterFailedCash(await fixture([{ raw_material_id: material.id, quantity_used }]));
    }

    // Positive fractions deduct correctly; recipes may still be omitted entirely.
    await request(`/recipes/${recipe.id}`, 'PUT', { quantity_used: '0.25' });
    const created = await request('/recipes', 'POST', { menu_id: plain.id, raw_material_id: material.id, quantity_used: '0.01' }, 201);
    await request(`/recipes/${created.id}`, 'DELETE');
    const paid = await request('/orders', 'POST', { customer_name: 'Paid test', items: [{ menu_id: menu.id, qty: 2 }, { menu_id: plain.id, qty: 1 }] }, 201);
    assert.equal(paid.items[0].stock_usage, undefined, 'internal recipes remain excluded from customer data');
    await request(`/payments/${paid.id}/cash`, 'POST', {});
    assert.equal(Number((await material.reload()).stock), 99.5);
    assert.equal((await Order.findByPk(paid.id)).status, 'confirmed');
    await request(`/payments/${paid.id}/cash`, 'POST', {});
    assert.equal(Number((await material.reload()).stock), 99.5, 'replayed payment must not deduct twice');
    await request(`/orders/${paid.id}/items/${paid.items[0].id}/reject`, 'PATCH', {});
    assert.equal(Number((await material.reload()).stock), 100, 'valid rejection refunds exactly the consumed fraction');
  } finally {
    if (server) await new Promise(resolve => server.close(resolve));
    await sequelize.close();
    if (!/^kitkop_recipes_test_\d+$/.test(database)) throw new Error('Unexpected test database');
    await admin.query(`DROP DATABASE \`${database}\``);
    await admin.end();
  }
});
