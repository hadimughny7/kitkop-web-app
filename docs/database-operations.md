# Operasi database

Server web tidak menyediakan endpoint impor database atau endpoint debug environment. Impor SQL harus dilakukan secara manual oleh administrator yang memiliki akses database, melalui klien MySQL atau sarana administrasi hosting. Jangan membuat proses impor dapat dipanggil melalui HTTP.

Koneksi aplikasi membaca konfigurasi dari environment melalui `backend/config/database.js`: `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, `DB_PASSWORD`, dan `DB_SSL` jika digunakan. File `.env` sudah diabaikan Git. Jangan menaruh password atau URL koneksi berisi password dalam source code maupun log/respons API.

## Database lokal baru

Untuk development, buat schema **kosong** melalui klien MySQL, misalnya `kitkop_local` dengan charset `utf8mb4`, lalu arahkan `.env` backend ke schema tersebut pada localhost. Gunakan model sekarang untuk membuat tabel; `database/schema.sql` berisi schema/seed historis yang belum mengikuti seluruh perubahan aplikasi. Jangan mengimpor seed lama ke database operasional.

Contoh berikut dijalankan sekali dari `backend` pada **schema lokal kosong**. Password diminta melalui prompt PowerShell yang tersembunyi, diteruskan hanya ke proses setup, dan di-hash menggunakan bcrypt sebelum disimpan. Sesuaikan identitas Owner di contoh sebelum menjalankan. Script menolak database yang sudah mempunyai tabel; tidak memakai `force`/`alter` dan tidak menghapus data.

```powershell
$env:KITKOP_SETUP_OWNER_PASSWORD = [System.Net.NetworkCredential]::new('', (Read-Host 'Password Owner baru (minimal 12 karakter)' -AsSecureString)).Password
try {
@'
require('dotenv').config();
const assert = require('node:assert/strict');
const bcrypt = require('bcryptjs');
const { sequelize } = require('./config/database');
const { User } = require('./models');
(async () => {
  assert.ok(['localhost', '127.0.0.1', '::1'].includes(process.env.DB_HOST), 'Setup ini hanya untuk localhost.');
  assert.ok(process.env.KITKOP_SETUP_OWNER_PASSWORD?.length >= 12, 'Gunakan password minimal 12 karakter.');
  assert.equal((await sequelize.getQueryInterface().showAllTables()).length, 0, 'Schema harus kosong.');
  await sequelize.sync();
  const password_hash = await bcrypt.hash(process.env.KITKOP_SETUP_OWNER_PASSWORD, 12);
  await User.create({ name: 'Owner', username: 'owner', email: 'owner@example.test', role: 'owner', password_hash });
  console.log('Tabel dan akun Owner lokal dibuat.');
})().catch(error => { console.error(error.message); process.exitCode = 1; }).finally(() => sequelize.close());
'@ | node
} finally {
  Remove-Item Env:KITKOP_SETUP_OWNER_PASSWORD
}
```

Jika setup terhenti setelah membuat sebagian tabel, periksa schema development tersebut sebelum mencoba lagi; jangan menghapus/mengubah schema lain. Jalankan `npm run migrate:menu-options` untuk template opsi awal, lalu startup backend untuk migrasi/seed settings. Menu dan meja dapat dibuat di UI. Tidak ada akun/password demo yang dibuat otomatis oleh server.

## Migrasi settings dan alias laporan

Startup dan `npm run migrate:settings` memakai fungsi yang sama: `backend/migrations/add-settings-and-service-charge.js`. Fungsi membuat tabel settings jika belum ada, menambah kolom `orders.service_charge` jika belum ada, serta melengkapi masing-masing nilai default yang hilang tanpa menimpa pajak/service charge yang sudah diatur. Penyisipan default memakai satu transaksi. DDL MySQL bukan transaksi bersama keseluruhan migrasi; jika gagal, periksa penyebab lalu jalankan ulang.

Kesalahan migrasi tidak lagi diabaikan pada startup; backend belum menerima traffic dan keluar gagal. Tabel dasar `orders` harus sudah ada. Tidak ada impor SQL atau `sync({ alter: true })` otomatis pada startup.

API laporan memakai `/api/reports`. Alias `/api/report` tetap didukung melalui router dan middleware autentikasi/otorisasi yang sama, untuk kompatibilitas konsumen lama. Konsumen baru sebaiknya memakai URL plural.

## TLS database dan CA (B04)

Saat `DB_SSL=true`, aplikasi selalu mengaktifkan `rejectUnauthorized: true` **dan** `verifyIdentity: true` untuk mysql2, dengan minimum TLS 1.2. Mengaktifkan verifikasi CA saja belum cukup untuk driver ini karena pemeriksaan nama server merupakan opsi terpisah. `DB_HOST` wajib hostname DNS yang sesuai sertifikat; alamat IP ditolak pada mode TLS untuk menghindari perilaku pemeriksaan identitas/SNI yang berbeda pada driver. MySQL lokal tanpa TLS tetap didukung saat `DB_SSL` kosong atau `false`.

Pilih konfigurasi sesuai sertifikat server yang benar-benar tersedia:

```dotenv
# Sertifikat dari CA publik yang dipercaya Node:
DB_HOST=db.example.com
DB_SSL=true
DB_SSL_CA=
DB_SSL_CA_FILE=
```

```dotenv
# CA khusus yang disediakan administrator/provider:
DB_HOST=db.example.com
DB_SSL=true
DB_SSL_CA_FILE=certs/provider-ca.pem
DB_SSL_CA=
```

Path relatif CA dihitung dari folder `backend`, bukan direktori saat menjalankan command. File dapat pula memakai path absolut untuk secret/config mount deployment. Alternatifnya isi `DB_SSL_CA` dengan PEM, memakai newline asli atau `\n` yang di-escape, dan kosongkan `DB_SSL_CA_FILE`. Bundle beberapa sertifikat PEM didukung. Ketika CA khusus diberikan, trust mengikuti bundle tersebut; jangan menganggap seluruh CA publik otomatis ikut ditambahkan. Dukungan custom CA mengikuti [dokumentasi mysql2](https://sidorares.github.io/node-mysql2/docs/examples/connections/create-connection#ssl-custom-certificate) dan [konfigurasi TLS Node](https://nodejs.org/api/tls.html#tlscreatesecurecontextoptions).

Gunakan hanya satu sumber CA. File hilang/kosong/rusak, isi selain sertifikat, dua sumber CA sekaligus, salah eja nilai `DB_SSL`, atau CA yang dikonfigurasi tanpa mengaktifkan TLS akan menghentikan startup. Tidak ada fallback ke koneksi yang menonaktifkan verifikasi. Sertifikat kedaluwarsa, CA tidak dipercaya dan hostname tidak cocok ditolak saat handshake. Folder `backend/certs/` diabaikan Git; simpan material provider di konfigurasi lokal/mount yang sesuai, bukan source atau frontend.

Pengguna menyatakan layanan Railway lama sudah tidak aktif. Konfigurasi lokal yang diperiksa hanya memakai MySQL localhost tanpa flag TLS. Karena itu, CA, sertifikat, SAN/hostname dan dukungan TLS pada deployment Railway tersebut **belum dapat diverifikasi**. Panduan resmi Railway menyediakan [koneksi MySQL](https://docs.railway.com/databases/mysql) dan [TCP proxy](https://docs.railway.com/networking/tcp-proxy), tetapi alamat proxy/koneksi yang tersedia tidak boleh diasumsikan otomatis cocok dengan identitas sertifikat MySQL. Saat hosting baru diaktifkan, periksa konfigurasi server/sertifikat/CA dan hostname yang benar sebelum restart backend dengan `DB_SSL=true`. Jika server belum mendukung TLS terverifikasi, konfigurasi server/provider perlu diselesaikan; jangan mengatasinya dengan `rejectUnauthorized: false`.

Tes `databaseTls.test.js` memeriksa parsing konfigurasi, CA inline/file/bundle dan penerusan opsi Sequelize. `databaseTls.integration.test.js` membuat CA dan sertifikat sementara menggunakan **OpenSSL**, lalu menjalankan handshake TLS mysql2 melalui loopback: sertifikat valid/nama cocok diterima; CA salah/tidak dikonfigurasi, nama salah dan sertifikat kedaluwarsa ditolak. Tes ini tidak melakukan autentikasi SQL atau koneksi provider. OpenSSL diperlukan pada PATH, melalui `OPENSSL_BIN`, atau instalasi Git for Windows standar. Private key fixture dibuat di TEMP dan dihapus; tidak disimpan di Git.

## Kredensial yang pernah terekspos

Password database yang dulu tercantum di route debug harus dianggap terekspos, termasuk di riwayat commit. Menghapus kode dan melakukan push tidak mencabut password tersebut.

Administrator hosting perlu mengganti password database target, memperbarui environment aplikasi yang menggunakan kredensial tersebut, lalu restart/deploy dan memverifikasi koneksi aplikasi. Gunakan prosedur rotasi dari penyedia database agar perubahan password dan konfigurasi aplikasi terkoordinasi. Jangan mengganti password MySQL lokal jika yang terekspos adalah database hosting yang berbeda.

Rotasi kredensial hosting belum dilakukan dari workspace ini karena tidak tersedia koneksi administratif ke pengaturan hosting. Riwayat Git juga belum ditulis ulang; rotasi tetap diperlukan meskipun riwayat nantinya dibersihkan.

## Pengujian F17

Jalankan `KITKOP_OPTIONS_DB_TEST=true` bersama tes backend sesuai shell yang digunakan. `tests/serverSecurity.integration.test.js` menjalankan server asli dengan database sementara dan memastikan health/menu tetap tersedia, akses auth tetap dilindungi, serta `/api/run-import` dan `/api/env-debug` menghasilkan 404.

Tes memeriksa bahwa route impor tidak ada sebelum mengirim request ke alamatnya. Jika route lama muncul lagi, tes berhenti sebelum request agar tidak berisiko mengeksekusi impor. Tidak ada SQL backup yang diimpor saat tes.
