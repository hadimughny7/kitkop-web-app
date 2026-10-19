# Kitkop Self Order & POS

Aplikasi pemesanan tamu melalui QR meja dan POS staf. Frontend memakai React/Vite; backend Express, Socket.IO, dan MySQL.

## Persiapan lokal

Gunakan Node.js **20.19+ pada seri 20, atau 22.12+**, npm, dan MySQL. Install dependency sesuai lockfile:

```powershell
cd backend
npm ci
if (-not (Test-Path .env)) { Copy-Item .env.example .env }
```

Salin `.env.example` hanya jika `.env` belum ada. Isi konfigurasi database lokal, `JWT_SECRET` acak, dan `CLIENT_URL`. Konfigurasi KuyzPay diperlukan untuk QRIS gateway; jangan memakai kredensial production untuk percobaan. Rahasia berada di backend, bukan variabel `VITE_`.

Jika database belum ada, lihat [setup database baru](docs/database-operations.md#database-lokal-baru). `database/schema.sql` dan seed lama merupakan referensi historis, bukan bootstrap lengkap versi sekarang. Untuk database yang sudah berjalan, backup dahulu dan ikuti migrasi pada dokumen fitur; jangan menjalankan `sync({ force: true })` atau `sync({ alter: true })` pada data operasional.

Dari folder `backend`, jalankan migrasi opsi menu sebelum menjalankan backend versi sekarang:

```powershell
npm run migrate:menu-options
npm run dev
```

Backend tersedia di `http://localhost:5000`; health check: `/api/health`. Startup menjalankan migrasi role staf, versi sesi, counter order, percobaan QRIS, validasi resep/harga, dan settings. Migrasi yang gagal menghentikan startup. Batas CHECK pada harga/resep bergantung dukungan database; periksa peringatan migrasi.

Di terminal kedua:

```powershell
cd frontend
npm ci
npm run dev
```

Frontend tersedia di `http://localhost:5173`. Bila backend berbeda, atur `VITE_BACKEND_URL` sebelum menjalankan/build frontend, sesuai [README frontend](frontend/README.md). Buat menu dan meja melalui akun Owner; QR pelanggan memakai `/order/welcome?table=<nomor_meja>`. Telepon dan email pelanggan opsional.

## Pengujian

```powershell
cd frontend
npm test
npm run lint -- --max-warnings=0
npm run build
```

Tes backend biasa: `cd backend` lalu `npm test`. Tes integrasi MySQL hanya aktif dengan flag berikut. Gunakan **MySQL localhost** dan akun yang boleh membuat/menghapus schema sementara; tes tidak memakai data operasional:

Tes handshake TLS backend memerlukan OpenSSL pada PATH, melalui `OPENSSL_BIN`, atau bawaan Git for Windows standar. Sertifikat/private key uji dibuat sementara dan dihapus; panduan konfigurasi ada di [TLS database](docs/database-operations.md#tls-database-dan-ca-b04).

```powershell
cd backend
$env:KITKOP_OPTIONS_DB_TEST='true'
node --test --test-concurrency=1 tests/*.test.js
Remove-Item Env:KITKOP_OPTIONS_DB_TEST
```

## Deployment dan dokumentasi

Jalankan `npm ci` di backend dan pada mesin build frontend, jalankan migrasi yang sesuai, build frontend dengan environment target, deploy `dist/`, lalu restart backend. Hosting frontend perlu fallback SPA dan strategi mempertahankan chunk lama saat transisi deployment. Simpan upload pada storage persisten. Detail: [README frontend](frontend/README.md) dan [operasi database](docs/database-operations.md).

Commit/push GitHub dapat memicu deployment otomatis bila hosting/CI dikonfigurasi demikian. Periksa workflow target sebelum push.

Panduan perilaku dan perubahan fitur:

- [Pilihan menu](docs/menu-options.md), [harga](docs/menu-prices.md), [kategori](docs/category-types.md), dan [gambar menu](docs/menu-image-uploads.md).
- [Validasi input pesanan](docs/order-input-validation.md), termasuk respons 400 untuk elemen item yang salah bentuk.
- [Konsistensi stok](docs/stock-consistency.md), [produksi](docs/kitchen-production.md), dan [pembatalan](docs/order-cancellation.md).
- [Webhook pembayaran](docs/payment-webhook.md), [percobaan QRIS](docs/qris-retries.md), dan [akses tracking/realtime](docs/realtime-access.md).
- [Sesi staf](docs/staff-sessions.md), [pembatasan login](docs/login-rate-limiting.md), dan [izin Owner/Manajer](docs/user-management-permissions.md).
- [Catatan maintenance](docs/repository-cleanup-2026-10-18.md). [kitkop.md](kitkop.md) adalah rancangan historis.

Endpoint simulasi pembayaran masih terbuka sesuai keputusan pengembangan sebelumnya. Jangan menganggap checkout ini siap dibuka untuk production hanya karena tes lulus atau audit dependency bersih. Rotasi kredensial hosting lama juga masih merupakan pekerjaan administratif yang belum dilakukan.
