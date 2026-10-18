const test = require('node:test');
const assert = require('node:assert/strict');
const { createRequire } = require('node:module');

test('Sequelize UUID defaults and ExcelJS conditional formats retain their CommonJS behavior', async () => {
  const requireSequelize = createRequire(require.resolve('sequelize/package.json'));
  const requireExcel = createRequire(require.resolve('exceljs/package.json'));
  for (const dependency of [requireSequelize, requireExcel]) {
    const uuid = dependency('uuid');
    assert.equal(uuid.version(uuid.v1()), 1);
    assert.equal(uuid.version(uuid.v4()), 4);
  }
  const { Sequelize, DataTypes } = require('sequelize');
  const db = new Sequelize('mysql://unused:unused@127.0.0.1/unused', { logging: false });
  try {
    for (const version of [1, 4]) {
      const Model = db.define(`UuidV${version}`, { id: { type: DataTypes.UUID, primaryKey: true, defaultValue: version === 1 ? DataTypes.UUIDV1 : DataTypes.UUIDV4 } });
      const ids = Array.from({ length: 100 }, () => Model.build().id);
      assert.equal(new Set(ids).size, ids.length);
      assert.ok(ids.every(id => requireSequelize('uuid').version(id) === version));
    }
  } finally { await db.close(); }
  const ExcelJS = require('exceljs');
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Stok');
  sheet.addRows([['Bahan', 'Stok'], ['Kopi', 100]]);
  sheet.addConditionalFormatting({ ref: 'B2:B2', rules: [{ type: 'dataBar', cfvo: [{ type: 'min' }, { type: 'max' }], color: { argb: 'FF000000' } }] });
  const copy = new ExcelJS.Workbook();
  await copy.xlsx.load(await workbook.xlsx.writeBuffer());
  assert.equal(copy.getWorksheet('Stok').getCell('A2').value, 'Kopi');
  assert.equal(copy.getWorksheet('Stok').getCell('B2').value, 100);
});

test('report export routes still return readable XLSX after dependency upgrades', { skip: process.env.KITKOP_OPTIONS_DB_TEST !== 'true' }, async () => {
  require('dotenv').config();
  assert.ok(['localhost', '127.0.0.1', '::1'].includes(process.env.DB_HOST), 'Use a local test database only');
  process.env.JWT_SECRET = 'dependency-compatibility-test';
  const mysql = require('mysql2/promise');
  const database = `kitkop_dependencies_test_${process.pid}`;
  const admin = await mysql.createConnection({ host: process.env.DB_HOST, port: process.env.DB_PORT || 3306, user: process.env.DB_USER, password: process.env.DB_PASSWORD });
  await admin.query(`CREATE DATABASE \`${database}\``);
  process.env.DB_NAME = database;
  const { sequelize } = require('../config/database');
  const { User, MenuCategory, Menu, Order, OrderItem, Transaction, RawMaterial } = require('../models');
  let server;
  try {
    await sequelize.sync();
    const owner = await User.create({ name: 'Owner', username: 'owner', email: 'owner@example.test', password_hash: 'not-used', role: 'owner' });
    const category = await MenuCategory.create({ name: 'Kopi' });
    const menu = await Menu.create({ name: 'Compatibility Coffee', category_id: category.id, price: 10000 });
    await RawMaterial.create({ name: 'Compatibility Beans', unit: 'gram', stock: 100, min_stock: 10 });
    const order = await Order.create({ order_number: 'DEP-TEST', order_type: 'kasir', status: 'completed', subtotal: 10000, tax: 1000, total: 11000 });
    await OrderItem.create({ order_id: order.id, menu_id: menu.id, qty: 1, price: 10000, item_type: 'minuman', status: 'completed' });
    await Transaction.create({ order_id: order.id, ref_id: 'DEP-CASH', amount: 11000, status: 'paid', payment_method: 'CASH', paid_at: new Date() });
    const app = require('express')();
    app.use('/api/reports', require('../routes/reportRoutes'));
    app.use((err, req, res, next) => res.status(500).json({ message: err.message }));
    server = app.listen(0, '127.0.0.1');
    await new Promise(resolve => server.once('listening', resolve));
    const token = require('jsonwebtoken').sign({ id: owner.id, sessionVersion: 0 }, process.env.JWT_SECRET);
    for (const endpoint of ['orders/export', 'stocks/export', 'report-dashboard/export']) {
      const response = await fetch(`http://127.0.0.1:${server.address().port}/api/reports/${endpoint}`, { headers: { Authorization: `Bearer ${token}` } });
      assert.equal(response.status, 200, endpoint);
      assert.match(response.headers.get('content-disposition'), /\.xlsx/);
      const workbook = new (require('exceljs').Workbook)();
      await workbook.xlsx.load(Buffer.from(await response.arrayBuffer()));
      assert.ok(workbook.worksheets.length > 0);
      assert.ok(workbook.worksheets.some(sheet => sheet.rowCount > 1));
    }
  } finally {
    if (server) await new Promise(resolve => server.close(resolve));
    await sequelize.close();
    assert.match(database, /^kitkop_dependencies_test_\d+$/);
    await admin.query(`DROP DATABASE \`${database}\``);
    await admin.end();
  }
});
