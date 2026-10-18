const test = require('node:test');
const assert = require('node:assert/strict');

test('settings migration upgrades old schemas without overwriting configured rates', { skip: process.env.KITKOP_OPTIONS_DB_TEST !== 'true' }, async t => {
  require('dotenv').config();
  assert.ok(['localhost', '127.0.0.1', '::1'].includes(process.env.DB_HOST), 'Use a local test database only');
  const database = `kitkop_settings_migration_test_${process.pid}`;
  const admin = await require('mysql2/promise').createConnection({
    host: process.env.DB_HOST, port: process.env.DB_PORT || 3306,
    user: process.env.DB_USER, password: process.env.DB_PASSWORD,
  });
  await admin.query(`CREATE DATABASE \`${database}\``);
  process.env.DB_NAME = database;
  const { sequelize } = require('../config/database');
  const { Order, Setting } = require('../models');
  const migrate = require('../migrations/add-settings-and-service-charge');
  const query = sequelize.getQueryInterface();
  try {
    await sequelize.sync();
    await t.test('legacy schema gains the missing column and both defaults without changing orders', async () => {
      const order = await Order.create({ order_number: 'MIGRATION-TEST', total: 11000 });
      await query.removeColumn('orders', 'service_charge');
      await Setting.drop();
      await Promise.all([migrate(), migrate(), migrate()]);
      assert.equal(Number((await order.reload()).service_charge), 0);
      assert.equal(Number(order.total), 11000);
      assert.equal((await Setting.findByPk('tax_percentage')).value, '10');
      assert.equal((await Setting.findByPk('service_charge_percentage')).value, '0');
    });
    await t.test('partial settings are completed; existing values and timestamps survive repeated/concurrent runs', async () => {
      await Setting.update({ value: '15', description: 'Configured tax' }, { where: { key: 'tax_percentage' } });
      const taxBefore = (await Setting.findByPk('tax_percentage')).toJSON();
      await Setting.destroy({ where: { key: 'service_charge_percentage' } });
      await migrate();
      assert.deepEqual((await Setting.findByPk('tax_percentage')).toJSON(), taxBefore);
      await Setting.update({ value: '5' }, { where: { key: 'service_charge_percentage' } });
      const before = (await Setting.findAll({ order: [['key', 'ASC']] })).map(row => row.toJSON());
      await Promise.all([migrate(), migrate(), migrate()]);
      assert.deepEqual((await Setting.findAll({ order: [['key', 'ASC']] })).map(row => row.toJSON()), before);
    });
    await t.test('a real SQL seed failure rolls back both defaults and propagates the error', async () => {
      await Setting.destroy({ where: {} });
      await sequelize.query("CREATE TRIGGER settings_migration_failure BEFORE INSERT ON settings FOR EACH ROW BEGIN IF NEW.`key` = 'service_charge_percentage' THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'intentional migration seed failure'; END IF; END");
      try {
        await assert.rejects(migrate(), /intentional migration seed failure/);
        assert.equal(await Setting.count(), 0);
      } finally {
        await sequelize.query('DROP TRIGGER settings_migration_failure');
      }
      await migrate();
      assert.equal(await Setting.count(), 2);
    });
    await t.test('startup exits unsuccessfully before listening when the settings seed fails', async () => {
      await Setting.destroy({ where: {} });
      await sequelize.query("CREATE TRIGGER settings_startup_failure BEFORE INSERT ON settings FOR EACH ROW BEGIN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'intentional startup seed failure'; END");
      const child = require('node:child_process').spawn(process.execPath, ['server.js'], {
        cwd: require('node:path').resolve(__dirname, '..'),
        env: { ...process.env, PORT: '0' }, windowsHide: true,
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      let output = '';
      child.stdout.on('data', chunk => { output += chunk; });
      child.stderr.on('data', chunk => { output += chunk; });
      let timeout;
      try {
        const code = await Promise.race([
          new Promise((resolve, reject) => { child.once('exit', resolve); child.once('error', reject); }),
          new Promise((resolve, reject) => { timeout = setTimeout(() => reject(new Error('Startup did not stop after migration failure')), 10000); }),
        ]);
        assert.equal(code, 1);
        assert.match(output, /Server startup failed: intentional startup seed failure/);
        assert.doesNotMatch(output, /Running on port/);
      } finally {
        clearTimeout(timeout);
        if (child.exitCode === null) {
          const stopped = new Promise(resolve => child.once('exit', resolve));
          child.kill();
          await stopped;
        }
        await sequelize.query('DROP TRIGGER settings_startup_failure');
      }
    });
  } finally {
    await sequelize.close();
    assert.match(database, /^kitkop_settings_migration_test_\d+$/);
    await admin.query(`DROP DATABASE \`${database}\``);
    await admin.end();
  }
});
