const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('real server does not expose import or environment debug endpoints', { skip: process.env.KITKOP_OPTIONS_DB_TEST !== 'true' }, async () => {
  const backend = path.resolve(__dirname, '..');
  const source = fs.readFileSync(path.join(backend, 'server.js'), 'utf8');
  // Never request an import URL if its unsafe handler has been reintroduced.
  for (const endpoint of ['/api/run-import', '/api/env-debug']) {
    assert.equal(source.includes(endpoint), false, `Unsafe route ${endpoint} is present; HTTP probing aborted.`);
  }
  require('dotenv').config();
  const mysql = require('mysql2/promise');
  const admin = await mysql.createConnection({ host: process.env.DB_HOST, port: process.env.DB_PORT || 3306, user: process.env.DB_USER, password: process.env.DB_PASSWORD });
  const database = `kitkop_server_security_test_${process.pid}`;
  await admin.query(`CREATE DATABASE \`${database}\``);
  process.env.DB_NAME = database;
  const { sequelize } = require('../config/database');
  require('../models');
  let child;
  let exit;
  try {
    await sequelize.sync();
    const reserve = require('node:net').createServer();
    await new Promise((resolve) => reserve.listen(0, '127.0.0.1', resolve));
    const port = reserve.address().port;
    await new Promise((resolve) => reserve.close(resolve));
    child = require('node:child_process').spawn(process.execPath, ['server.js'], {
      cwd: backend, env: { ...process.env, PORT: String(port) }, windowsHide: true, stdio: 'ignore',
    });
    exit = new Promise((resolve) => child.once('exit', resolve));
    const base = `http://127.0.0.1:${port}`;
    let ready = false;
    for (let attempt = 0; attempt < 60; attempt += 1) {
      if (child.exitCode !== null) break;
      try { ready = (await fetch(`${base}/api/health`)).ok; } catch { /* Wait for startup. */ }
      if (ready) break;
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    assert.equal(ready, true, 'Isolated server must start successfully.');
    for (const endpoint of ['/api/run-import', '/api/env-debug']) {
      const response = await fetch(base + endpoint);
      assert.equal(response.status, 404, `${endpoint} must not be exposed.`);
      assert.equal((await response.text()).includes('Database imported'), false);
    }
    assert.equal((await fetch(`${base}/api/auth/me`)).status, 401);
    assert.equal((await fetch(`${base}/api/menus`)).status, 200);
  } finally {
    if (child) {
      if (child.exitCode === null) child.kill();
      await exit;
    }
    await sequelize.close();
    if (!/^kitkop_server_security_test_\d+$/.test(database)) throw new Error('Unexpected test database');
    await admin.query(`DROP DATABASE \`${database}\``);
    await admin.end();
  }
});
