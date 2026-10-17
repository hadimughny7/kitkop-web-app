# Kewenangan pengelolaan pengguna

Kebijakan A11: **Owner** mengelola seluruh role. **Manajer** mengelola akun Kasir, Kitchen, dan Barista, serta profilnya sendiri. Pemesanan pelanggan dan kewenangan operasional lain tidak berubah.

| Tindakan | Owner | Manajer |
|---|---|---|
| Melihat daftar/detail staf | Ya | Ya |
| Membuat akun Owner atau Manajer | Ya | Tidak |
| Membuat akun Kasir, Kitchen, Barista | Ya | Ya |
| Mengedit akun Owner atau Manajer lain, termasuk password/status | Ya | Tidak |
| Mengedit akun Kasir, Kitchen, Barista, termasuk password/status | Ya | Ya |
| Menetapkan role Owner atau Manajer | Ya | Tidak |
| Mengganti role staf antara Kasir, Kitchen, Barista | Ya | Ya |
| Mengedit nama/email/username/password sendiri | Ya | Ya |
| Mengubah role atau status akun Manajer sendiri | Ya, jika dilakukan oleh Owner | Tidak |
| Menghapus akun Owner atau Manajer lain | Ya | Tidak |
| Menghapus akun Kasir, Kitchen, Barista | Ya | Ya |
| Menghapus akun sendiri | Tidak | Tidak |

Kasir, Kitchen, dan Barista tetap tidak memiliki akses ke API pengelolaan pengguna. Daftar pengguna tetap dapat dilihat Manajer, tetapi akun Owner dan Manajer lain ditandai **Dikelola Owner**, tanpa tombol edit/hapus. Pada profil Manajer sendiri, pilihan role tidak dapat diubah dan disertai keterangan. Form tambah/edit staf milik Manajer hanya menawarkan role operasional yang diizinkan.

## Backend

Pemeriksaan wajib berada di `userController` melalui `services/userManagementPolicy.js`; menyembunyikan tombol hanya menyesuaikan antarmuka. Role JWT atau field tambahan pada body tidak memberikan hak Owner. Middleware mengambil pengguna aktif dari database, lalu operasi tulis memeriksa kembali pelaku dan target di dalam transaksi dengan row lock. Jika pelaku diturunkan rolenya atau target dipromosikan ke Owner/Manajer ketika request berjalan, aturan memakai data terkini setelah mendapatkan lock.

Permintaan yang tidak diizinkan menghasilkan **HTTP 403** sebelum menyimpan profil, password, role, status, atau mengirim notifikasi pemutusan socket. Pembuatan/pembaruan/penghapusan akun berada dalam transaksi. Jika penyimpanan gagal, perubahan dibatalkan. Pemutusan socket dan pencabutan sesi setelah reset password tetap dilakukan setelah commit, sesuai [kebijakan sesi staf](staff-sessions.md).

Penghapusan akun sendiri tetap ditolak dengan HTTP 400 seperti sebelumnya. Role tidak dikenal ditolak dengan HTTP 400. Record tidak ditemukan menghasilkan HTTP 404. Akun yang berubah menjadi tidak aktif atau sesi yang sudah dicabut saat menunggu lock ditolak dengan HTTP 401.

## Deploy dan verifikasi

Tidak ada perubahan skema, migrasi, atau data akun operasional. Deploy backend dan frontend hasil build, lalu restart backend agar kebijakan aktif. Role yang sudah tersimpan tidak dikoreksi secara otomatis; jika ada akun yang dahulu memperoleh Owner tanpa semestinya, Owner perlu meninjaunya secara manual.

Tes integrasi menggunakan schema MySQL localhost sementara yang dihapus setelah selesai:

```powershell
cd backend
$env:KITKOP_OPTIONS_DB_TEST='true'
node --test --test-concurrency=1 tests/userManagementPolicy.integration.test.js
```

Cakupan: penolakan promosi diri dan akun lain, reset password/penonaktifan/penghapusan akun terlindungi, operasi staf yang diizinkan, profil Manajer sendiri, seluruh role oleh Owner, klaim JWT yang tidak sesuai database, perubahan role bersamaan, rollback kegagalan SQL, serta tidak adanya perubahan parsial atau notifikasi pada penolakan.
