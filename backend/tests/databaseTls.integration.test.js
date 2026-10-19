const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const tls = require('node:tls');
const net = require('node:net');
const { spawnSync } = require('node:child_process');
const databaseTls = require('../config/databaseTls');

test('mysql2 TLS transport accepts trusted matching certificates and rejects untrusted, wrong-host and expired certificates', { timeout: 20000 }, async t => {
  const candidates = [process.env.OPENSSL_BIN, 'openssl', 'C:/Program Files/Git/usr/bin/openssl.exe'].filter(Boolean);
  const openssl = candidates.find(binary => spawnSync(binary, ['version'], { windowsHide: true }).status === 0);
  assert.ok(openssl, 'OpenSSL is required for TLS certificate tests; set OPENSSL_BIN when it is not on PATH.');
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'kitkop-db-tls-'));
  const run = args => {
    const result = spawnSync(openssl, args, { cwd: root, encoding: 'utf8', windowsHide: true });
    assert.equal(result.status, 0, result.stderr);
  };
  try {
    fs.writeFileSync(path.join(root, 'ca.cnf'), '[req]\ndistinguished_name=dn\nx509_extensions=ca\n[dn]\n[ca]\nbasicConstraints=critical,CA:TRUE\nkeyUsage=critical,keyCertSign,cRLSign\nsubjectKeyIdentifier=hash\nauthorityKeyIdentifier=keyid:always\n');
    for (const name of ['trusted', 'other']) {
      run(['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-keyout', `${name}.key`, '-out', `${name}.pem`, '-subj', `/CN=Kitkop ${name} test CA`, '-days', '2', '-config', 'ca.cnf', '-extensions', 'ca']);
    }
    run(['req', '-new', '-newkey', 'rsa:2048', '-nodes', '-keyout', 'server.key', '-out', 'server.csr', '-subj', '/CN=localhost']);
    fs.writeFileSync(path.join(root, 'server.ext'), 'subjectAltName=DNS:localhost\nbasicConstraints=CA:FALSE\nextendedKeyUsage=serverAuth\n');
    for (const [name, days] of [['server', '2'], ['expired', '0']]) {
      run(['x509', '-req', '-in', 'server.csr', '-CA', 'trusted.pem', '-CAkey', 'trusted.key', '-CAcreateserial', '-out', `${name}.pem`, '-days', days, '-extfile', 'server.ext']);
    }
    const read = name => fs.readFileSync(path.join(root, name), 'utf8');
    assert.equal(new (require('node:crypto').X509Certificate)(read('trusted.pem')).ca, true);
    run(['verify', '-CAfile', 'trusted.pem', 'server.pem']);
    const attempt = async ({ ca = 'trusted.pem', host = 'localhost', cert = 'server.pem' } = {}) => {
      const sockets = new Set();
      const server = tls.createServer({ key: read('server.key'), cert: read(cert) });
      server.on('connection', socket => { sockets.add(socket); socket.on('close', () => sockets.delete(socket)); });
      server.on('tlsClientError', () => {});
      await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
      let connection;
      try {
        const ssl = databaseTls({ DB_SSL: 'true', DB_HOST: host, ...(ca ? { DB_SSL_CA: read(ca) } : {}) });
        // Exercise mysql2's real TLS upgrade on a loopback transport. No SQL,
        // credentials or provider connection is involved in this handshake test.
        connection = require('mysql2').createConnection({
          host, port: server.address().port, ssl, user: 'tls-test', connectTimeout: 2000,
          stream: () => net.connect(server.address().port, '127.0.0.1'),
        });
        connection.on('error', () => {});
        return await new Promise(resolve => connection.startTLS(error => resolve(error || null)));
      } finally {
        if (connection) connection.destroy();
        for (const socket of sockets) socket.destroy();
        await new Promise(resolve => server.close(resolve));
      }
    };
    await t.test('matching DNS certificate signed by the configured CA succeeds', async () => {
      assert.equal(await attempt(), null);
    });
    await t.test('unknown CA is rejected instead of accepting encryption alone', async () => {
      const error = await attempt({ ca: 'other.pem' }); assert.ok(error);
      assert.match(error.code, /CERT|ISSUER|VERIFY/);
    });
    await t.test('a private test CA is not silently trusted when custom CA is omitted', async () => {
      assert.ok(await attempt({ ca: null }));
    });
    await t.test('trusted certificate for a different hostname is rejected', async () => {
      assert.equal((await attempt({ host: 'wrong.example.test' })).code, 'ERR_TLS_CERT_ALTNAME_INVALID');
    });
    await t.test('expired server certificates are rejected', async () => {
      assert.equal((await attempt({ cert: 'expired.pem' })).code, 'CERT_HAS_EXPIRED');
    });
  } finally {
    assert.equal(path.dirname(path.resolve(root)), path.resolve(os.tmpdir()));
    fs.rmSync(root, { recursive: true });
  }
});
