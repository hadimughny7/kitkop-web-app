# Konsistensi perubahan stok

Restock, pengurangan manual, dan pembaruan bahan mengunci baris `RawMaterial` dengan `SELECT ... FOR UPDATE` di dalam transaksi MySQL. Pemeriksaan kecukupan stok untuk pengurangan dilakukan setelah penguncian, menggunakan nilai terbaru. Status aman/menipis/kritis dihitung dari nilai yang disimpan dalam transaksi tersebut.

Pembayaran dan refund sudah memakai penguncian baris bahan yang sama. Perubahan pada bahan yang sama menunggu transaksi sebelumnya selesai, sehingga restock, pengurangan, pemotongan resep, dan refund tidak saling menimpa. Tidak ada perubahan cara staf mengisi form atau kebijakan stok pembayaran.

Restock dan pengurangan menyimpan nilai stok serta `StockLog` dalam satu transaksi. Jika salah satunya gagal, keduanya dibatalkan. Event `stock-updated` dan respons berhasil dikirim setelah commit. Ini juga menutup masalah A04 pada dua endpoint tersebut.

Pembaruan bahan lewat `PUT /api/stocks/:id` tetap memakai nilai stok absolut jika field `stock` dikirim: nilainya menjadi stok baru, bukan jumlah penambahan/pengurangan. Penguncian mengurutkan penyimpanan; tidak mendeteksi form yang sudah lama dibuka pengguna. Perubahan metadata tanpa field stok membaca stok terbaru sebelum menghitung status.

Referensi pembayaran tunai baru memakai `CASH-<order ID>-<timestamp>` agar dua order yang dibayar pada milidetik yang sama tidak berbenturan pada constraint unik. Pengulangan pembayaran order yang sudah lunas tetap tidak memotong stok lagi. Referensi transaksi lama tidak diubah.

Tidak diperlukan migrasi database. Validasi format angka yang lebih ketat (A06) merupakan pekerjaan terpisah; perbaikan ini mempertahankan validasi input yang sudah ada.

## Pengujian

Jalankan dari folder `backend`, dengan MySQL lokal:

```powershell
$env:KITKOP_OPTIONS_DB_TEST='true'
node --test --test-concurrency=1 tests/*.test.js
```

`stockConcurrency.integration.test.js` memakai route HTTP asli dan schema MySQL sementara yang dihapus setelah tes. Cakupannya meliputi restock/reduce bersamaan, pengurangan yang melebihi stok terbaru, pecahan, status stok, pembayaran tunai pada timestamp yang sama, pengulangan pembayaran, refund, edit metadata, dan kegagalan log melalui trigger SQL khusus schema uji. Tes kegagalan log memverifikasi rollback dan tidak adanya event sukses.

Hook sementara pada proses tes menahan pembacaan tanpa lock agar urutan race condition dari audit dapat direproduksi bila pola lama muncul kembali. Hook tersebut tidak mengubah file atau data operasional.
