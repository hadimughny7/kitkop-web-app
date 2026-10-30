apa# Pembaruan keamanan dependency

Tanggal: 30 Oktober 2026. Lingkup: temuan dependency nomor 2 dari audit backend, tanpa perubahan tampilan atau aturan bisnis.

## Versi yang diperbarui

| Paket | Sebelum | Sesudah | Bagian |
| --- | --- | --- | --- |
| body-parser | 1.20.8 | 1.20.9 | Backend, melalui Express |
| multer | 2.4.0 | 2.5.0 | Backend, upload gambar |
| follow-redirects | 1.16.0 | 1.16.2 | Backend dan frontend, melalui Axios |
| zod | 4.4.3 | 4.6.7 | Frontend, dependency alat lint |

Pembaruan tetap berada dalam major version yang sama. Batas minimum Multer pada `backend/package.json` dinaikkan ke `^2.5.0`. Versi resolusi dan integrity paket diperbarui dalam lockfile backend/frontend. Tidak ada override tambahan atau skrip instalasi yang dijalankan.

Kode fitur, endpoint, komponen UI, SQL, serta rumus harga/pajak/stok/pembayaran tidak diubah. Perubahan script pada `frontend/package.json` sudah ada sebelum pekerjaan ini dan tetap dipertahankan sebagai perubahan lokal terpisah.

## Hasil verifikasi

- Audit npm setelah pembaruan melaporkan **0 vulnerability** untuk backend dan frontend, termasuk dependency pengembangan.
- `npm ls --all`: kedua dependency tree valid, tanpa problem dependency.
- Lint frontend bersih dan build production berhasil.
- **13 tes frontend lulus.**
- **216 tes backend lulus, 0 gagal, 0 skipped**, termasuk login/rate limit, sesi/izin staf, upload dan normalisasi gambar, pemesanan, QRIS/retry/webhook, pembayaran tunai, stok, pembatalan, realtime, dan ekspor laporan.
- Probe HTTP loopback: JSON gzip valid tetap diproses; gzip dengan trailing bytes yang tidak valid menghasilkan HTTP 400 dan server tetap dapat menjawab health check.
- Probe redirect Axios: redirect tetap bekerja dan header Authorization tidak diteruskan ke host yang berbeda.
- Pemeriksaan diff tidak menemukan whitespace error.

MySQL operasional lokal tidak aktif saat pengujian awal. Verifikasi integrasi kemudian memakai instance MySQL terpisah pada loopback port 3307, dengan data sementara di direktori `logs/`. Tes membuat schema disposable sendiri; setelah tes selesai tidak ada schema uji Kitkop yang tersisa. Instance MySQL uji sudah dihentikan. File `.env` dan database operasional tidak diubah.

Gateway pembayaran diganti mock localhost oleh tes. Tidak ada pembayaran nyata atau transaksi ke database operasional. Log hasil tes berada di `logs/dependency-backend-tests.log`, yang diabaikan Git.

## Batas hasil

Audit npm yang bersih hanya menyatakan tidak ada advisory dependency yang terdeteksi pada saat pemeriksaan. Ini tidak menghapus temuan lain, termasuk endpoint simulasi pembayaran yang masih mengikuti keputusan pengembangan sebelumnya. Transaksi pada hosting production tidak diuji.

Laporan ini menyertai commit pembaruan keamanan dependency. Perubahan script lokal sebelumnya pada `frontend/package.json` tidak disertakan dalam commit tersebut.
