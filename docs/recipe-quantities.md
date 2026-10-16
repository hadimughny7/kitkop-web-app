# Validasi jumlah bahan resep

`POST /api/recipes` dan `PUT /api/recipes/:id` mewajibkan `quantity_used` berupa angka positif, minimal `0.01`, maksimal `99999999.99`, dengan maksimal dua angka desimal sesuai kolom `DECIMAL(10,2)`. Angka dalam string seperti `"0.50"` tetap diterima. Nilai negatif, nol, kosong, teks, boolean, array, nilai nonfinite, dan nilai yang akan dibulatkan menjadi nol ditolak dengan HTTP 400.

Validasi juga berlaku pada model dan bahan tambahan opsi menu. Batas jumlah bahan tambahan sebelumnya tetap `1000000`. Menu tanpa resep tetap dapat dipesan.

Saat order dibuat, tiap bahan diperiksa sebelum digabungkan ke salinan resep pada item. Saat pembayaran atau refund stok, jumlah bahan diperiksa lagi. Pembayaran item lama tanpa salinan menggunakan resep menu; refund item lama menggunakan bukti pengurangan stok per item, sesuai [aturan pembatalan](order-cancellation.md). Data tidak valid menghasilkan HTTP 409 pada alur API kasir dan tidak boleh menambah atau mengurangi stok. Transaksi database pembayaran yang sama melakukan rollback atas perubahan stok, log, penanda item, pembayaran, dan status order. Callback penyedia yang gagal diproses tetap mendapat respons gagal agar dapat dicoba ulang setelah data diperbaiki; uang yang sudah dibayar ke penyedia tidak otomatis dikembalikan oleh validasi ini.

## Database dan data lama

Migrasi dijalankan otomatis saat backend dimulai dan bisa dijalankan ulang. Pada database yang mendukungnya, migrasi menambahkan `chk_menu_recipes_quantity_positive`: `quantity_used IS NOT NULL AND quantity_used > 0`.

Migrasi memeriksa resep lama terlebih dahulu. Jika ada nilai nol atau negatif, migrasi melaporkan ID-nya dan tidak mengubah atau menghapus resep tersebut. Koreksi jumlah sesuai resep kafe melalui API/UI, lalu jalankan migrasi lagi. Backend tetap menolak penggunaan resep tidak valid selama perbaikan data. Pada versi database yang mengabaikan atau tidak mendukung `CHECK`, migrasi mencatat keterbatasan tersebut; validasi API, model, dan stok tetap aktif.

Dari direktori `backend`:

```powershell
# Audit saja, tanpa mengubah database
node migrations/validate-recipe-quantities.js --audit

# Pasang/verifikasi batasan database
node migrations/validate-recipe-quantities.js

# Uji unit dan integrasi MySQL dalam schema sementara
$env:KITKOP_OPTIONS_DB_TEST='true'
node --test tests/*.test.js
```

Tes mencakup tambah/edit resep tidak valid, pecahan positif, menu tanpa resep, data lama, migrasi berulang, penolakan SQL langsung, rollback pembayaran saat item berikutnya tidak valid, pembayaran ulang, dan refund stok untuk pecahan positif. Seluruh schema pengujian dihapus setelah selesai.
