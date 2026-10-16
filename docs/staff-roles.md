# Role staf

Role resmi: `kasir`, `barista`, `kitchen`, `manajer`, dan `owner`. Model User, validasi tambah/edit akun, serta autentikasi socket memakai daftar backend di `backend/constants/roles.js`. Form tambah/edit pengguna menyediakan kelima pilihan tersebut, termasuk Barista.

Perbaikan konsistensi role ini mempertahankan izin operasional yang sudah ada. Barista tetap dapat mengakses produksi dan stok sesuai route yang diizinkan; tidak memperoleh izin mengelola pengguna atau mengesahkan pembayaran tunai.

## Database lama

Startup backend menjalankan `add-barista-role` sebelum menerima request. Migrasi menambahkan nilai role yang belum ada pada ENUM `users.role`, mempertahankan urutan nilai lama serta akun yang tersimpan, dan aman dijalankan berulang kali. Jika ENUM sudah lengkap, tidak ada perubahan skema.

Migrasi manual dari direktori `backend`:

```sh
npm run migrate:staff-roles
```

Tes `tests/staffRoles.integration.test.js` memverifikasi skema baru, migrasi skema lama, pembuatan/edit akun, login, input role tidak valid, dan batas izin Barista menggunakan schema MySQL sementara.
