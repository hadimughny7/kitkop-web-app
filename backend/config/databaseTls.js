const fs = require('node:fs');
const path = require('node:path');
const { isIP } = require('node:net');
const { X509Certificate } = require('node:crypto');

const databaseTls = (env = process.env) => {
  const enabled = (env.DB_SSL || '').trim().toLowerCase();
  if (!['', 'false', 'true'].includes(enabled)) throw new Error('DB_SSL harus true atau false.');
  const inline = (env.DB_SSL_CA || '').trim();
  const file = (env.DB_SSL_CA_FILE || '').trim();
  if (enabled !== 'true') {
    if (inline || file) throw new Error('CA database dikonfigurasi tetapi DB_SSL belum true.');
    return undefined;
  }
  // mysql2 uses the configured DNS host for SNI and certificate identity checks.
  // Require that host explicitly; do not silently verify an IP as "localhost".
  if (!env.DB_HOST?.trim() || isIP(env.DB_HOST.trim())) {
    throw new Error('DB_SSL memerlukan DB_HOST berupa hostname DNS yang cocok dengan sertifikat, bukan alamat IP.');
  }
  if (inline && file) throw new Error('Gunakan hanya DB_SSL_CA atau DB_SSL_CA_FILE.');
  const ssl = { rejectUnauthorized: true, verifyIdentity: true, minVersion: 'TLSv1.2' };
  let pem = inline.replace(/\\n/g, '\n');
  if (file) {
    try {
      pem = fs.readFileSync(path.resolve(__dirname, '..', file), 'utf8');
    } catch {
      throw new Error('DB_SSL_CA_FILE tidak dapat dibaca. Pastikan file CA tersedia.');
    }
  }
  if (inline || file) {
    const certificates = pem.match(/-----BEGIN CERTIFICATE-----[\s\S]*?-----END CERTIFICATE-----/g);
    try {
      if (!certificates?.length || pem.replace(/-----BEGIN CERTIFICATE-----[\s\S]*?-----END CERTIFICATE-----/g, '').trim()) {
        throw new Error('Invalid PEM');
      }
      for (const certificate of certificates) new X509Certificate(certificate);
    } catch {
      throw new Error('CA database harus berisi sertifikat PEM valid tanpa private key atau data tambahan.');
    }
    ssl.ca = certificates;
  }
  return ssl;
};

module.exports = databaseTls;
