# Laporan perbaikan aksesibilitas Kitkop

Tanggal: 27 Oktober 2026. Dasar: tujuh temuan audit `antislop-human` yang disetujui untuk diperbaiki.

## Aplikasi untuk pengecekan manual

- Frontend: http://localhost:5173/login
- Backend: http://localhost:5000/api/health
- Masuk memakai akun lokal Anda yang sudah ada. Gunakan Owner/Manajer untuk melihat seluruh halaman pengelolaan.
- Halaman pelanggan: http://localhost:5173/order/menu?table=nomor_meja. Ganti `nomor_meja` dengan nomor meja lokal untuk pengujian pemesanan.

Frontend Vite dan backend Express sudah dijalankan saat pekerjaan ini selesai. Backend berhasil terhubung ke database localhost dan health check mengembalikan `success: true`. Buka frontend dengan hostname `localhost`, sesuai konfigurasi CORS backend.

Jika proses lokal berhenti, jalankan di dua terminal PowerShell dari root proyek:

```powershell
cd frontend
node ./node_modules/vite/bin/vite.js --host 127.0.0.1 --port 5173 --strictPort
```

```powershell
cd backend
node server.js
```

## Perubahan dan hasil yang diharapkan

| Temuan | Perubahan | Berkas utama |
| --- | --- | --- |
| Fokus sidebar kurang terlihat | Selector fokus sidebar diperkuat agar outline putih mengungguli aturan global. Kontras putih pada latar `#111111`: 18,88:1. | `frontend/src/components/DashboardLayout.css` |
| Sidebar mobile tertutup masih menerima Tab | Sidebar tertutup menjadi `inert`. Saat terbuka, fokus masuk sidebar, Tab/Shift+Tab tetap di navigasi, konten utama menjadi inert, Escape menutup, fokus kembali ke tombol pembuka. Scroll halaman dikunci sementara. Mode desktop mengikuti perubahan lebar viewport. | `frontend/src/components/DashboardLayout.jsx` |
| Modal lama belum mengelola fokus | Komponen `Modal` baru memakai `<dialog>` dan `showModal()`: latar halaman tidak interaktif, dialog punya nama aksesibel, Escape menutup, fokus kembali ke pemicu, klik backdrop tetap menutup. Tombol tutup mendapat label. | `frontend/src/components/Modal.jsx`, halaman pengguna, meja, stok, menu |
| Batas input samar | Border global input/select/pencarian berubah dari `#cccccc` menjadi `#747474`. Kontras pada putih meningkat dari 1,61:1 menjadi 4,67:1. | `frontend/src/index.css` |
| Loading/error kurang informatif | Komponen loading bersama menyediakan teks, `role="status"`, dan spinner dekoratif. Halaman menu pelanggan serta pengaturan mempunyai error persisten dan tombol coba lagi; form pengaturan tidak ditampilkan ketika data gagal dimuat. | `LoadingState.jsx`, `MenuPage.jsx`, `SettingsPage.jsx`, halaman pengguna, meja, stok, menu |
| Label input tidak terhubung | Pasangan `htmlFor`/`id` dipasang pada field yang diperbaiki. Petunjuk pajak/service charge dihubungkan dengan `aria-describedby`. Pencarian pengguna/menu, filter kategori, serta unggah foto menu mendapat nama aksesibel. | Halaman pengaturan, pengguna, meja, stok, menu |
| Bahasa dokumen tidak sesuai | Bahasa utama dokumen diubah dari `en` ke `id`. | `frontend/index.html` |

Modal yang memakai komponen baru: tambah/edit pengguna, tambah/edit meja, QR meja, kelola kategori, tambah/edit bahan baku, restock, pengurangan stok, tambah/edit resep. Dialog native editor menu dan pemilih opsi pelanggan yang sudah ada tetap digunakan.

## Checklist pengecekan manual

1. **Fokus desktop:** login, tekan Tab beberapa kali sampai tautan sidebar terpilih. Garis fokus putih harus terlihat di sekitar tautan. Shift+Tab harus bergerak mundur.
2. **Navigasi mobile:** buka DevTools responsive pada lebar 390 px. Ketika sidebar tertutup, tekan Tab dan pastikan fokus tidak masuk ke navigasi tersembunyi. Buka navigasi; fokus harus masuk tombol tutup. Tab/Shift+Tab berputar di sidebar. Tekan Escape: sidebar tertutup dan fokus kembali ke tombol pembuka. Ulangi dengan tombol tutup dan klik backdrop. Lebarkan ke desktop untuk memastikan sidebar normal kembali.
3. **Modal:** buka Tambah Staff, Tambah Meja, QR Code, Kelola Kategori, Tambah bahan, Restock, Kurangi, dan Tambah Bahan resep. Pastikan fokus langsung di dialog; Tab/Shift+Tab tidak mengaktifkan kontrol halaman belakang. Tutup dengan Escape dan pastikan fokus kembali ke tombol pemicu. Ulangi menggunakan tombol tutup, Batal bila tersedia, dan klik di luar dialog. Klik di dalam dialog tidak boleh menutupnya.
4. **Label:** pada formulir pengguna, meja, stok, resep, dan pengaturan, klik teks label. Input terkait harus menerima fokus. Jika memakai pembaca layar, pastikan nama field dan petunjuk pajak/service charge dibacakan.
5. **Kontras:** periksa batas input sebelum fokus. Garis batas harus lebih jelas daripada sebelumnya. Saat Tab masuk ke input, indikator fokus tetap terlihat.
6. **Loading:** gunakan throttling jaringan di DevTools. Buka halaman pengguna, meja, stok, menu, dan pengaturan. Harus ada teks yang menyebut data sedang dimuat, bukan hanya spinner.
7. **Gagal memuat pengaturan:** gunakan DevTools Network request blocking untuk memblokir `http://localhost:5000/api/settings*`, lalu muat ulang halaman Pengaturan. Harus tampil pesan gagal memuat dan Coba lagi; form penyimpanan tidak muncul. Hapus blokir lalu klik Coba lagi. Nilai pengaturan harus kembali tampil.
8. **Gagal memuat menu pelanggan:** blokir `http://localhost:5000/api/menus*`, lalu buka halaman pelanggan. Harus muncul Menu gagal dimuat, bukan Menu tidak ditemukan. Hapus blokir lalu klik Coba lagi. Menu harus kembali tampil. Pencarian yang benar-benar tidak cocok tetap menampilkan keadaan kosong.
9. **Zoom dan ponsel:** uji zoom browser 200% pada halaman yang diperbaiki. Buka dialog dengan banyak field, Tab sampai tombol paling bawah, dan pastikan field/tombol tetap terjangkau lewat scroll. Pada ponsel fisik, fokuskan field terbawah dengan keyboard layar aktif dan periksa apakah masih terlihat.

## Verifikasi yang sudah dijalankan

- **PASS build:** `node ./node_modules/vite/bin/vite.js build` dari `frontend`.
- **PASS lint:** `node ./node_modules/eslint/bin/eslint.js .` dari `frontend`.
- **PASS tes frontend:** 13 tes lulus melalui `node --test`.
- **PASS struktur handler:** AST handler aksi yang sudah ada pada enam halaman dibandingkan dengan HEAD; fungsi simpan/hapus, perubahan stok/resep, pemeriksaan izin pengguna, dan aksi keranjang yang dibandingkan tetap sama.
- **PASS browser desktop:** bahasa dokumen, label pengaturan, warna border input, outline putih sidebar.
- **PASS browser mobile 390 px:** sidebar inert saat tertutup, fokus terkendali saat terbuka, Tab, Escape, dan pengembalian fokus.
- **PASS delapan dialog:** fokus awal, asosiasi label input, navigasi Tab, Escape, dan pengembalian fokus pada delapan alur modal di checklist.
- **PASS error/retry:** kegagalan API pengaturan dan menu pelanggan ditampilkan sebagai error, lalu berhasil dipulihkan dengan Coba lagi. Loading pengaturan memiliki status yang dapat dikenali pembaca layar.
- **PASS pembesaran teks terbatas:** halaman Pengaturan pada viewport 390 px dengan ukuran font root 200% tidak menimbulkan overflow horizontal.
- **PASS browser:** tidak ada uncaught JavaScript exception selama skenario uji.
- **PASS diff:** `git diff --check`.
- **PASS lokal:** halaman login merespons HTTP 200 dan backend health check berhasil.

Pemeriksaan browser memakai Chrome headless dan respons API fixture terisolasi. Tidak ada tindakan simpan/hapus yang dikirim ke database operasional. Skrip pemeriksaan lokal dan tangkapan sidebar mobile ada di `logs/a11y-browser-check.cjs` serta `logs/a11y-sidebar-mobile.png`; direktori `logs/` diabaikan Git.

## Batas verifikasi

Pekerjaan ini memperbaiki tujuh temuan audit, bukan sertifikasi aksesibilitas seluruh aplikasi. Pengujian pembaca layar nyata, keyboard layar pada ponsel fisik, zoom browser 200% di seluruh halaman, dan perubahan data melalui akun lokal masih perlu pengecekan manual. Uji pembesaran font root tidak menggantikan uji zoom browser yang sebenarnya.

Tidak ada berkas backend atau SQL yang diubah. Rumus harga, pajak, stok, pembayaran, dan hak akses tetap mengikuti implementasi yang ada. Perubahan lokal `frontend/package.json` sudah ada sebelum pekerjaan ini dan tidak saya ubah. Laporan ini menyertai commit perbaikan aksesibilitas; perubahan lokal `frontend/package.json` tidak disertakan dalam commit tersebut.
