# Penyimpanan pengaturan pajak dan service charge

`PUT /api/settings` memvalidasi seluruh input sebelum melakukan perubahan database. `tax_percentage` dan `service_charge_percentage` menerima angka atau string angka desimal dengan nilai 0–100, termasuk pecahan. Nilai kosong, `null`, boolean, array, teks seperti `"10abc"`, dan nilai di luar rentang ditolak dengan HTTP 400.

Semua nilai yang valid disimpan dalam satu transaksi database. Jika salah satu penyimpanan gagal, perubahan lainnya ikut dibatalkan, termasuk baris baru yang sempat dibuat. Respons sukses dikirim setelah commit dan memuat pengaturan yang dibaca dalam transaksi tersebut.

Contoh: pajak saat ini 10% dan service charge 0%. Request pajak 15% dan service charge 101% ditolak; keduanya tetap 10% dan 0%.

Update satu pengaturan tetap didukung tanpa mengubah nilai lainnya. Pengaturan lain tetap dipertahankan. `GET /api/settings` tetap publik untuk keranjang pelanggan, sementara perubahan tetap khusus owner/manajer. Tidak ada perubahan UI atau migrasi database yang diperlukan.

## Pengujian

Dari direktori `backend`:

```powershell
$env:KITKOP_OPTIONS_DB_TEST='true'
node --test tests/*.test.js
```

Tes memakai schema MySQL sementara. Cakupan meliputi regresi pajak 15% dengan service charge 101%, tipe input tidak valid, angka pecahan/batas 0–100, update sebagian, kegagalan SQL sungguhan pada penyimpanan kedua, rollback insert/update, penyimpanan bersamaan, pembacaan publik, dan otorisasi. Trigger yang memicu kegagalan hanya dibuat dalam schema pengujian; schema tersebut dihapus setelah tes selesai.
