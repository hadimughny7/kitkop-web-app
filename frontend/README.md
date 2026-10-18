# Kitkop frontend

Antarmuka pemesanan pelanggan dan dashboard staf Kitkop, menggunakan React dan Vite.

Panduan backend/database dan gambaran proyek tersedia pada [README utama](../README.md).

## Menjalankan lokal

Gunakan Node.js **20.19+ pada seri 20, atau 22.12+** sesuai `engines` di `package.json`. Jalankan backend secara terpisah.

```powershell
cd frontend
npm ci
npm run dev
```

Alamat default frontend: `http://localhost:5173`. Jika alamat backend berbeda dari `http://localhost:5000`, buat `frontend/.env.local`:

```dotenv
VITE_BACKEND_URL=http://localhost:5000
```

Isi URL dasar backend tanpa `/api` atau slash akhir. Variabel berawalan `VITE_` masuk ke hasil build dan dapat dibaca browser; konfigurasi merchant/database tetap berada di backend.

## Validasi

```powershell
npm test
npm run lint
npm run build
```

`npm test` menjalankan tes logika frontend. Tes integrasi database berada di backend dan memakai schema localhost sementara ketika `KITKOP_OPTIONS_DB_TEST=true`; lihat dokumentasi fitur di `../docs/`.

## Production

Build menghasilkan folder `dist/`. Atur `VITE_BACKEND_URL` sebelum build, lalu deploy isi `dist` ke hosting statis. Hosting perlu mengarahkan route aplikasi seperti `/dashboard/orders` dan `/order/status/...` ke `index.html`; konfigurasi Vercel tersedia di `vercel.json`.

Halaman dimuat melalui lazy loading. Chart laporan baru diunduh saat halaman laporan dibuka. Pertahankan aset chunk versi sebelumnya selama masa transisi cache deployment agar tab yang sudah terbuka tetap bisa mengunduh chunk yang dirujuknya.

Vite dan plugin React merupakan dependency pengembangan. Gunakan `npm ci` lengkap pada mesin build; hosting statis hanya memerlukan hasil build.

Panduan terkait: [pilihan menu](../docs/menu-options.md), [akses realtime](../docs/realtime-access.md), [sesi staf](../docs/staff-sessions.md), [pembatasan login](../docs/login-rate-limiting.md), dan [izin pengelolaan pengguna](../docs/user-management-permissions.md).
