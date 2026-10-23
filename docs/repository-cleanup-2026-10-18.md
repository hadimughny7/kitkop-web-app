# Pemeriksaan kebersihan repository Kitkop

Tanggal: 18 Oktober 2026, Asia/Jakarta. Acuan source: `d2a30b2`. Cakupan: pelacakan Git, duplikasi berkas, referensi import/require, aset, dependency, konfigurasi, dan dokumentasi lokal. Laporan ini tidak melakukan audit keamanan menyeluruh baru.

Dokumen ini mencatat beberapa putaran pekerjaan. Status terbaru ada di bagian **Audit ulang 23 Oktober 2026**; daftar kandidat awal di bawah dipertahankan sebagai bukti pemeriksaan.

## Pembersihan yang diterapkan

Sesuai konfirmasi pengguna, dua `local_backup.sql` berisi data demo/dummy. Keduanya identik berdasarkan SHA-256, masing-masing 186.869 byte:

- `backend/local_backup.sql`
- `database/local_backup.sql`

Kedua file dikeluarkan dari index Git menggunakan `git rm --cached`. Salinan lokal tetap ada dengan isi yang sama. `.gitignore` sekarang mengabaikan nama `local_backup*.sql` beserta versi gzip/zip dan direktori backup lokal yang ditentukan. Untuk backup dengan nama lain, gunakan `backups/`, `backend/backups/`, atau `database/backups/` yang sudah diabaikan.

Schema, seed, dan migrasi SQL tetap dilacak. Perubahan pengeluaran backup, `.gitignore`, dan laporan ini disiapkan di index untuk commit berikutnya. Belum ada commit/push atau penulisan ulang history pada pekerjaan ini. Commit lama masih menyimpan backup. File pada branch GitHub baru berhenti muncul setelah perubahan ini di-commit dan di-push.

## Kandidat pembersihan berikutnya — belum dihapus

### 1. Aset starter, CSS lama, dan berkas referensi

| Kandidat | Bukti lokal | Saran |
|---|---|---|
| `frontend/src/App.css` | Tidak di-import; entry frontend memakai `src/index.css`. Isi merupakan styling starter. | Hapus CSS yang tidak terhubung. |
| `frontend/src/assets/react.svg`, `vite.svg`, `hero.png` | Tidak ada referensi filename/path pada source, HTML atau konfigurasi. Folder `src/assets` hanya berisi tiga file ini. | Hapus jika tidak disimpan untuk bahan desain. |
| `frontend/public/icons.svg`, `favicon.svg` | Tidak direferensikan aplikasi; favicon aktif di `index.html` memakai `/logo-kitkop.png`. | Hapus setelah memastikan URL publik lama tidak diperlukan. |
| `frontend/public/logo-kitkop.jpg` | Source memakai PNG, tidak ditemukan referensi versi JPG. | Pertahankan PNG aktif; evaluasi penghapusan JPG. |
| `frontend/public/sounds/order-chime-preview.wav` | Suara aktif dibuat melalui Web Audio dalam `notificationSound.js`, tanpa membaca WAV. | Hapus jika preview manual tidak lagi diperlukan. |
| `frontend/sandbox.txt` | Salinan referensi sandbox Midtrans, tidak direferensikan runtime. | Arsipkan sebagai referensi lama atau hapus jika sudah tidak dipakai. |

Total sembilan kandidat: **219.361 byte**, sekitar 214 KiB. Aset dalam `public` tetap disalin saat build meskipun tidak di-import. Pemakaian lewat bookmark/URL eksternal atau secara manual tidak bisa dipastikan dari pencarian source.

### 2. Dependency tanpa import/require pada source

| Dependency | Bukti lokal | Saran |
|---|---|---|
| Backend `midtrans-client` | Tidak ada import/require paket; pembayaran saat ini memakai layanan KuyzPay melalui Axios. | Evaluasi uninstall bersama sisa integrasi Midtrans. |
| Backend `md5` | Tidak ada import/require paket. String algoritma `md5` pada tes memakai `node:crypto`, sehingga tidak memerlukan paket npm ini. | Evaluasi uninstall. |
| Frontend `xlsx` | Tidak ada import paket. Ekspor Excel aktif berasal dari backend ExcelJS; frontend mengunduh respons blob. | Evaluasi uninstall. |

Pemeriksaan dependency memakai parser JavaScript/JSX dan mengenali subpath package. `mysql2`, `react-dom/client`, dan `react-icons/hi` memiliki penggunaan yang relevan dan bukan kandidat penghapusan. Penghapusan dependency berikutnya perlu memperbarui manifest/lockfile, kemudian menguji fitur dan build terkait.

### 3. Sisa integrasi pembayaran lama yang masih dimuat

`frontend/index.html` masih memuat script Snap sandbox Midtrans. Tidak ditemukan pemanggilan Snap pada source aplikasi yang diperiksa. Script ini **masih aktif dimuat browser** sehingga layak dievaluasi penghapusannya bersama dependency dan dokumentasi Midtrans lama. Jangan menganggap menghapus paket npm saja otomatis menghilangkan pemuatan script eksternal ini.

`backend/.env.example` masih berisi `MIDTRANS_*`, sedangkan source backend membaca `KUYZPAY_MERCHANT_ID`, `KUYZPAY_SECRET`, dan `KUYZPAY_BASE_URL`. Contoh konfigurasi perlu disesuaikan agar setup baru mengikuti layanan pembayaran yang digunakan. Pemeriksaan hanya membaca nama variabel pada source/contoh; isi `.env` aktif tidak ditampilkan atau disalin.

### 4. Dokumentasi yang sudah tertinggal

- `frontend/README.md` masih berupa README template React/Vite. Lebih berguna jika diganti dengan cara menjalankan frontend Kitkop, environment, build, tes dan rujukan dokumentasi proyek.
- `kitkop.md` memuat rancangan lama: telepon pelanggan wajib, URL `/order?table=...`, pembayaran QRIS-only TokoPay/signature MD5, dan izin Manajer yang lebih luas. Implementasi kini berbeda. Dokumen ini sebaiknya diberi status rancangan historis atau diselaraskan; jangan menjadi satu-satunya panduan implementasi.
- Repository belum memiliki README utama. Panduan root dapat menyatukan startup backend/frontend, setup database, migrasi, tes integrasi terisolasi, deployment dan tautan `docs/`.

### 5. SQL ad hoc dan duplikasi alur administrasi

- `database/query.sql` berisi pemeriksaan transaksi untuk satu ID order tertentu. Ini tampak sebagai query troubleshooting manual, bukan setup aplikasi.
- `database/fix.sql` mengubah jenis item menggunakan asumsi ID kategori 1/2/3. Asumsi tersebut sudah diganti pada perbaikan A07; menjalankannya lagi berpotensi tidak sesuai klasifikasi saat ini. Layak diarsipkan dengan penjelasan atau dihapus setelah riwayat penggunaannya dipastikan.
- `database/alter_orders.sql`, `backfill.sql` dan skrip migrasi lainnya dapat menjadi sarana upgrade instalasi lama. Belum cukup bukti untuk menghapusnya hanya karena tidak di-import runtime.
- `backend/migrations/add-settings-and-service-charge.js` dan blok startup `server.js` menangani penambahan settings/service charge yang tumpang tindih. Ini peluang menyatukan jalur migrasi; perubahan memerlukan pengujian startup dan kompatibilitas skema.
- `server.js` memasang `reportRoutes` pada `/api/reports` dan alias `/api/report`. Frontend lokal memakai `/reports`. Alias lama dapat ditinjau setelah memastikan tidak ada konsumen eksternal yang masih memakainya.

SQL administratif tidak dijalankan pada pemeriksaan ini.

### 6. Tool lokal dan batas penghapusan folder

- `backend/ngrok.exe` sekitar **33,3 MB**, masih untracked. Ini alat tunnel pengujian, bukan source runtime. Jika tetap dipakai, tambahkan ignore khusus atau simpan sebagai tool di luar repo; penghapusannya belum dilakukan.
- `node_modules` dan `frontend/dist` sudah diabaikan Git. Keduanya dapat dibuat ulang, tetapi menghapusnya memerlukan install/build lagi dan tidak membersihkan source yang ada di GitHub.
- Folder upload tetap diperlukan oleh sistem. Tidak ada penghapusan folder upload atau file operasional.
- `.gitignore`, schema, seed, migrations, test dan dokumen operasional tidak dianggap sampah hanya karena tidak di-import aplikasi.

## Verifikasi dan batas hasil

Pencarian referensi memakai daftar berkas tracked, pencarian teks source/HTML/config, serta parsing import/require JavaScript/JSX. Pemeriksaan ini tidak membuktikan seluruh fungsi di dalam modul dipakai atau mengetahui workflow manual/deployment di luar repository.

Validasi pembersihan backup memeriksa: salinan lokal masih ada dan SHA-256 tidak berubah; kedua path tidak lagi ada di index; aturan ignore berlaku untuk backup biasa/terkompresi/direktori backup; schema, seed dan migration tetap dilacak; `git diff --check` tidak menemukan kesalahan whitespace. Perubahan runtime, package, data database, history Git dan deployment tidak dilakukan, sehingga tes aplikasi/build tidak diulang pada putaran ini.

Urutan yang disarankan: selesaikan commit pengeluaran backup, konfirmasi penghapusan aset yang tidak digunakan, lalu selaraskan dokumentasi dan tinjau arsip SQL/migrasi. Status tindak lanjut dependency, lint dan bundle diperbarui pada bagian berikut.

## Tindak lanjut dependency, lint dan bundle

Pengguna kemudian menyetujui perbaikan dependency/lint/bundle. Source awal pekerjaan masih `d2a30b2`; perubahan berikut belum di-commit atau di-push.

| Pemeriksaan | Sebelum | Setelah |
|---|---|---|
| npm audit backend | 1 critical, 9 high, 8 moderate | 0 advisory terdeteksi |
| npm audit frontend | 12 high, 3 moderate | 0 advisory terdeteksi |
| Lint frontend | 50 error, 15 warning pada 17 file | 0 error, 0 warning; aturan tetap aktif |
| Bundle JS utama | 884,52 KB / sekitar 261,43 KB gzip | 381,34 KB / 122,33 KB gzip |
| Chart laporan | Termasuk bundle awal | Chunk tersendiri 346,61 KB, dimuat saat halaman laporan dibuka |

Ukuran menggunakan KB desimal. Bundle utama berkurang sekitar 57%; ini pemisahan pemuatan, bukan klaim bahwa seluruh JavaScript semua halaman berkurang sebesar itu. Chunk terbesar di bawah 500 KB tanpa menaikkan batas warning Vite.

### Paket dan kompatibilitas

- Dihapus: backend `md5`, `midtrans-client`, frontend `xlsx`, dan script Snap Midtrans pada HTML. Algoritma MD5 pada tes penolakan signature tetap memakai `node:crypto` dan tidak memerlukan paket npm `md5`.
- Backend memakai Axios 1.20.0, Express 4.22.3, Multer 2.4.0, mysql2 3.24.6 dan Socket.IO 4.8.4, beserta patch transitif. Express tetap seri 4; upgrade Multer seri 2 diverifikasi dengan tes multipart asli, batas upload, rollback foto dan autentikasi.
- Backend dev menggunakan `node --watch server.js`; `nodemon` beserta rantai dependency dev yang rentan dihapus. Script production tetap `node server.js`.
- Override **khusus ExcelJS dan Sequelize** menetapkan UUID **11.1.1**, yang menyediakan perbaikan advisory sekaligus ekspor CommonJS. Source kedua induk menggunakan API `v1()`/`v4()` yang tetap tersedia. Jangan mengganti ke UUID 12+ tanpa meninjau kompatibilitas CommonJS. Override perlu ditinjau ulang jika dependency induk sudah menyediakan versi aman sendiri. Referensi: [README UUID](https://github.com/uuidjs/uuid), [rilis UUID 11.1.1](https://github.com/uuidjs/uuid/releases/tag/v11.1.1).
- Frontend memakai Axios 1.20.0, Socket.IO Client 4.8.4, React Router DOM 7.18.4, Vite 7.3.7 dan plugin React 5.2.0, beserta patch transitif. Vite/plugin ditempatkan dalam `devDependencies`. Manifest/lockfile memakai nomor versi biasa dan tarball registry npm resmi; metadata registry sempat timeout selama pemasangan dan diatasi dengan pengambilan tarball versi resmi yang telah diverifikasi.
- Frontend build/dev memerlukan Node.js seri 20 mulai 20.19, atau 22.12 ke atas. Batas minimum backend tetap seperti sebelumnya. Lihat [migrasi resmi Vite 7](https://v7.vite.dev/guide/migration) dan [README frontend](../frontend/README.md).
- `.env.example` backend kini memuat nama konfigurasi KuyzPay yang digunakan source. `.env` aktif dan kredensial operasional tidak diubah.

### Perilaku frontend yang diperbaiki

Listener pesanan memakai filter terkini. Respons request lama di daftar pesanan, pengguna, menu, dan riwayat stok tidak menimpa hasil request yang lebih baru. Timer refresh dibersihkan saat listener dilepas. Registry socket juga melepaskan socket yang ditutup sebelum sempat terhubung.

Hook context dipisahkan dari komponen provider agar hot reload tetap sesuai aturan, dengan object context yang sama untuk seluruh pemakai. Fetch awal, callback, timer countdown dan polling tracking dirapikan; polling status QRIS, deduplikasi request pembayaran dan reset state saat nomor order berganti tetap dipertahankan. Tooltip chart didefinisikan di luar render. Import, catch binding, fungsi dan pengambilan log stok yang hasilnya tidak dipakai oleh halaman dibersihkan; halaman riwayat stok tetap menggunakan endpoint log.

Setiap halaman memakai lazy loading dengan fallback lokal, sehingga layout dashboard dan notifikasi staf tetap terpasang ketika chunk halaman dimuat. Referensi pola React: [useEffect](https://react.dev/reference/react/useEffect).

### Pengujian dan deployment

- 172 tes backend lulus, termasuk dua tes kompatibilitas baru untuk UUID/Sequelize/ExcelJS serta tiga endpoint ekspor laporan yang menghasilkan XLSX terbaca.
- 13 tes frontend lulus. Lint dengan `--max-warnings=0` lulus. Build production berhasil.
- Regresi browser memakai API mock lokal dan viewport 375/1440: seluruh halaman staf, filter realtime, respons terlambat, lifecycle socket, keranjang tamu, QRIS/polling/countdown, pergantian order, hak akses Owner/Manajer, reset password, respons 401 terlambat dan logout lintas tab.
- Build dan fixture ditempatkan di TEMP; tes database memakai schema localhost sementara yang dihapus. Tidak ada pembayaran sungguhan atau perubahan data operasional.

Saat deploy, jalankan `npm ci` pada backend dan frontend, lakukan build frontend dengan environment yang sesuai, lalu deploy hasil `dist` dan restart backend. Tidak ada migrasi database untuk perubahan maintenance ini. Karena halaman memakai chunk terpisah, kelola transisi cache/aset deployment sesuai panduan README frontend.

Hasil audit dependency adalah snapshot advisory pada saat pemeriksaan, bukan sertifikasi bahwa seluruh aplikasi/deployment aman. Endpoint simulasi pembayaran yang sebelumnya sengaja ditunda tetap mengikuti keputusan pengembangan tersebut. Status sembilan kandidat aset, SQL administratif, dan tool ngrok diperbarui berikut ini.

## Penyelesaian cleanup, dokumentasi, dan struktur

Setelah pengguna menyetujui tahap lanjutan, sembilan kandidat aset/referensi pada tabel pertama dihapus: CSS starter, tiga aset `src/assets`, dua SVG publik, JPG logo duplikat, WAV preview, dan `sandbox.txt`. Total 219.361 byte. Logo PNG aktif dan suara Web Audio tetap tersedia. Folder lokal kosong tidak berpengaruh pada Git/build.

`backend/ngrok.exe` tetap ada untuk penggunaan tunnel lokal dan kini diabaikan Git; tidak ikut source aplikasi. Dua backup dummy juga tetap ada lokal dan pengeluaran dari index sebelumnya dipertahankan. Test, upload, schema, seed, serta migrasi tidak dihapus.

[README utama](../README.md) kini menjelaskan startup, environment, migrasi, tes dan deployment. [README frontend](../frontend/README.md) terhubung ke panduan root; `kitkop.md` diberi penanda rancangan historis. [README SQL](../database/README.md) membedakan seed/upgrade/troubleshooting lama. `fix.sql` tidak dihapus, tetapi jelas ditandai dalam panduan sebagai koreksi historis berdasarkan ID kategori yang tidak cocok dengan aturan sekarang. Tidak ada SQL administratif dijalankan.

Startup dan CLI settings kini memakai satu fungsi migrasi. Default yang hilang dilengkapi per key tanpa menimpa tarif yang sudah dikonfigurasi. Seed default berada dalam transaksi; migrasi DDL tetap mengikuti batas MySQL. Backend berhenti sebelum menerima traffic bila migrasi gagal. Alias `/api/report` dipertahankan bersama `/api/reports`, menggunakan satu pemasangan router dan pengamanan yang sama.

Validasi akhir putaran ini: **177 tes backend, 13 tes frontend, lint 0 error/warning, build production berhasil, audit dependency 0/0 advisory**, serta dependency tree backend/frontend valid. Tambahan tes memeriksa upgrade schema lama, startup bersamaan, tarif yang sudah tersimpan, rollback seed, penghentian startup pada error, dan kedua URL laporan pada akses anonim/kasir/Owner. Panduan bootstrap schema lokal baru juga dijalankan pada schema sementara dan diverifikasi passwordnya tersimpan sebagai hash; pengulangan pada schema berisi tabel ditolak.

Browser hasil build pada 375/1440 px mengulang 11 route staf, chart laporan, keranjang tamu, polling/countdown QRIS dan pergantian order dengan API fixture. Bundle utama tetap 381,34 KB / 122,33 KB gzip; tidak ada peningkatan batas warning. Semua schema fixture dihapus dan server preview milik pengujian dihentikan. Data operasional dan `.env` aktif tetap tidak diubah.

Pemeriksaan keamanan terarah menemukan pekerjaan baru pada resep publik, scope token pembayaran, validasi elemen item, dan konfigurasi TLS database. Bukti, tingkat risiko dan batas pengujian ada pada [laporan keamanan lanjutan](security-review-2026-10-18.md). Saat putaran cleanup selesai, perubahan masih belum di-commit pada HEAD `d2a30b2`. Maintenance/cleanup kemudian disimpan pada commit `4117a60`; tindak lanjut B02, B01, dan B03 memakai commit terpisah. Konfigurasi aplikasi untuk B04 diperbaiki pada tindak lanjut 19 Oktober; pengujian provider masih menunggu layanan hosting aktif.

## Pembersihan lanjutan 21 Oktober 2026

Sesuai persetujuan pengguna, proyek lokal `video-motion/` dan `PANDUAN-VIDEO-MOTION.md` dihapus. Keduanya tidak dilacak Git dan tidak dirujuk aplikasi.

Rancangan historis `kitkop.md`, query troubleshooting `database/query.sql`, dan koreksi kategori lama `database/fix.sql` dihapus. README utama dan README SQL diperbarui agar tidak mengarahkan pembaca ke berkas tersebut.

Tool lokal `backend/ngrok.exe` juga dihapus. Backup duplikat `backend/local_backup.sql` dihapus setelah SHA-256 diverifikasi sama dengan `database/local_backup.sql`; salinan di folder database tetap dipertahankan. Tool dan backup tersebut sudah diabaikan Git.

Source runtime, dependency, upload, environment, schema, seed, dan migrasi aplikasi tidak diubah dalam pembersihan ini. Perubahan script Vite pada `frontend/package.json` yang sudah ada sebelum pekerjaan ini tidak disertakan dalam commit cleanup.

## Audit ulang 23 Oktober 2026

Pengguna sudah menyalin hasil video dan meminta penghapusan proyek video yang dibuat kembali setelah cleanup sebelumnya. Folder lokal `video-motion/`, termasuk source, screenshot, dependency, dan hasil render, dihapus: 10.687 file dengan total 696.438.974 byte. Folder tersebut tidak dilacak Git.

Audit statis menggunakan parser JavaScript/JSX terhadap import, export, dynamic import, dan require; entry aplikasi, tes, serta CLI pada package scripts ikut diperhitungkan. Semua modul frontend terhubung. Kandidat backend tunggal adalah `migrations/update-order-item-status.js`, tetapi file ini memiliki fungsi migrasi manual instalasi lama sehingga dipertahankan. Semua dependency runtime memiliki referensi statis dalam aplikasi atau tes; temuan ini tidak membuktikan setiap ekspor/fungsi selalu dipakai.

Tidak ditemukan duplikasi isi persis pada file tracked yang diperiksa (lockfile dikecualikan), artefak build/dependency/log/backup yang ikut tracked, file sementara atau arsip video tersisa di source, maupun tautan relatif Markdown yang rusak. Aset publik frontend hanya logo PNG aktif. `dokumentasiAPI.md` masih menjadi referensi kontrak webhook.

`PANDUAN-VIDEO-MOTION.md` tetap ada karena permintaan penghapusan menyebut folder video; panduan ini bukan kebutuhan aplikasi dan dapat dipindahkan ke koleksi panduan pribadi. `frontend/dist` sekitar 1,04 MB dapat dibuat ulang, tetapi masih dapat dipakai untuk preview/deployment lokal. `database/local_backup.sql` adalah satu salinan backup lokal yang tersisa, sehingga tidak dihapus. Build, backup, dan dependency lokal tersebut sudah diabaikan Git. Schema, seed, migrasi, tes, upload, environment, dan dokumentasi operasional tetap dipertahankan berdasarkan fungsinya.

Verifikasi: ESLint langsung melalui `node ./node_modules/eslint/bin/eslint.js . --max-warnings=0` lulus; 13 tes frontend lulus. `npm.cmd run lint` gagal pada launcher Windows di path proyek yang mengandung `&`, sebelum ESLint berjalan; pemeriksaan diulang melalui entry Node langsung. Ini masalah perintah lokal, bukan kandidat penghapusan dependency. Perubahan `frontend/package.json` yang sudah ada sebelumnya dipertahankan. Tidak ada commit atau push pada audit ini.
