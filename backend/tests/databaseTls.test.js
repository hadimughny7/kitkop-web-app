const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const tls = require('node:tls');
const databaseTls = require('../config/databaseTls');

test('database TLS remains optional locally but rejects ambiguous or misspelled settings', () => {
  assert.equal(databaseTls({}), undefined);
  assert.equal(databaseTls({ DB_SSL: 'false', DB_HOST: '127.0.0.1' }), undefined);
  assert.throws(() => databaseTls({ DB_SSL: 'tru' }), /DB_SSL harus/);
  assert.throws(() => databaseTls({ DB_SSL: 'false', DB_SSL_CA: 'certificate' }), /DB_SSL belum true/);
  assert.throws(() => databaseTls({ DB_SSL_CA_FILE: 'unused.pem' }), /DB_SSL belum true/);
});

test('enabled TLS requires a DNS host and always verifies trust and identity', () => {
  assert.deepEqual(databaseTls({ DB_SSL: 'true', DB_HOST: 'db.example.test' }), {
    rejectUnauthorized: true, verifyIdentity: true, minVersion: 'TLSv1.2',
  });
  for (const DB_HOST of ['', '127.0.0.1', '::1']) {
    assert.throws(() => databaseTls({ DB_SSL: 'true', DB_HOST }), /hostname DNS/);
  }
});

test('custom CAs accept valid PEM bundles or escaped newlines without weakening verification', () => {
  const pem = tls.rootCertificates[0];
  for (const value of [pem, pem.replace(/\n/g, '\\n'), `${pem}\n${tls.rootCertificates[1]}`]) {
    const ssl = databaseTls({ DB_SSL: 'true', DB_HOST: 'db.example.test', DB_SSL_CA: value });
    assert.equal(ssl.rejectUnauthorized, true); assert.equal(ssl.verifyIdentity, true);
    assert.equal(ssl.ca[0], pem.trim());
  }
});

test('missing, empty or invalid CA files fail closed and certificate material is not echoed', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'kitkop-db-ca-'));
  const file = path.join(root, 'ca.pem');
  const env = { DB_SSL: 'true', DB_HOST: 'db.example.test', DB_SSL_CA_FILE: file };
  try {
    assert.throws(() => databaseTls(env), /tidak dapat dibaca/);
    for (const content of ['', 'PRIVATE_TEST_MARKER', '-----BEGIN CERTIFICATE-----\nbroken\n-----END CERTIFICATE-----', `${tls.rootCertificates[0]}\n-----BEGIN PRIVATE KEY-----\nPRIVATE_TEST_MARKER\n-----END PRIVATE KEY-----`]) {
      fs.writeFileSync(file, content);
      assert.throws(() => databaseTls(env), error => error.message.includes('PEM valid') && !error.message.includes('PRIVATE_TEST_MARKER'));
    }
    fs.writeFileSync(file, tls.rootCertificates[0]);
    assert.equal(databaseTls(env).ca.length, 1);
    assert.throws(() => databaseTls({ ...env, DB_SSL_CA: tls.rootCertificates[0] }), /hanya DB_SSL_CA/);
  } finally {
    assert.equal(path.dirname(path.resolve(root)), path.resolve(os.tmpdir()));
    fs.rmSync(root, { recursive: true });
  }
});

test('the Sequelize configuration passes secure TLS options through to mysql2', () => {
  const script = "const {sequelize}=require('./config/database'); const ssl=sequelize.options.dialectOptions.ssl; console.log(JSON.stringify(ssl)); sequelize.close();";
  const result = require('node:child_process').spawnSync(process.execPath, ['-e', script], {
    cwd: path.resolve(__dirname, '..'), encoding: 'utf8', windowsHide: true,
    env: { ...process.env, DB_HOST: 'db.example.test', DB_SSL: 'true', DB_SSL_CA: '', DB_SSL_CA_FILE: '' },
  });
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(JSON.parse(result.stdout.trim()), { rejectUnauthorized: true, verifyIdentity: true, minVersion: 'TLSv1.2' });
});
