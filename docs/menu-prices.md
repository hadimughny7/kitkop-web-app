# Validasi harga menu

Harga menu boleh Rp0 untuk menu gratis atau promo. Harga harus berupa angka finite, tidak negatif, maksimal dua angka desimal, dan berada dalam rentang `DECIMAL(12,2)` (0 sampai 9999999999.99). Angka JSON maupun string angka dari multipart form didukung. Input kosong, `null`, boolean, array, objek, teks campuran, dan harga yang perlu pembulatan tambahan ditolak HTTP 400.

API tambah/edit memvalidasi harga sebelum menyimpan perubahan. Update tanpa field `price` mempertahankan harga lama; update dengan angka `0` benar-benar mengganti harga menjadi nol. Model `Menu` menerapkan validasi yang sama untuk penulisan melalui ORM.

Pembuatan pesanan QR/kasir memeriksa kembali harga dasar dari database dan setiap add-on yang dipilih. Harga negatif lama tetap ditolak meskipun tambahan positif membuat jumlah akhirnya positif. Harga dari klien tidak dipakai menghitung pesanan. `expected_price`, jika dikirim, harus valid dan cocok dengan harga server.

Subtotal dijumlahkan dalam sen; harga item, subtotal, pajak, biaya layanan dan total diverifikasi sebelum order disimpan. Rumus pembulatan pajak/biaya layanan tetap sama. Harga tersimpan yang tidak valid atau total yang melebihi kapasitas database menghasilkan HTTP 409 dan membatalkan seluruh transaksi pembuatan order, termasuk record pemesan. Snapshot harga pesanan lama tidak diperbarui ketika harga menu diubah.

## Perlindungan database dan data lama

Startup backend menjalankan migrasi idempotent `validate-menu-prices.js` untuk memasang CHECK `price IS NOT NULL AND price >= 0` pada tabel `menus`. Migrasi tidak mengubah atau menghapus harga lama.

Jika ada menu berharga negatif, migrasi melaporkan ID menu dan menunda pemasangan CHECK sampai harga diperbaiki pengelola melalui API/UI. Validasi API, model, dan checkout tetap berjalan selama itu. Database lama yang belum mendukung CHECK mendapat peringatan; validasi aplikasi tetap aktif.

Untuk pemeriksaan manual dari folder `backend`:

```powershell
node migrations/validate-menu-prices.js --audit
npm.cmd run migrate:menu-prices
```

Perintah pertama hanya membaca daftar harga tidak valid. Perintah kedua memasang constraint jika data sudah valid; proses startup juga menjalankannya. Tidak ada koreksi otomatis atas data bisnis yang sudah ada.

## Pengujian

```powershell
$env:KITKOP_OPTIONS_DB_TEST='true'
node --test --test-concurrency=1 tests/*.test.js
```

Tes harga mencakup create/update JSON dan multipart, harga nol/pecahan, model ORM, raw SQL CHECK, migrasi berulang dan data negatif lama, rollback order QR/POS, harga klien palsu, snapshot pesanan, add-on rusak, serta batas nominal dan total. Mutasi memakai schema MySQL lokal sementara yang dihapus setelah tes. Tidak ada pembayaran gateway nyata.
