# Konsistensi perubahan stok

Restock, pengurangan manual, dan pembaruan bahan mengunci baris `RawMaterial` dengan `SELECT ... FOR UPDATE` di dalam transaksi MySQL. Pemeriksaan kecukupan stok untuk pengurangan dilakukan setelah penguncian, menggunakan nilai terbaru. Status aman/menipis/kritis dihitung dari nilai yang disimpan dalam transaksi tersebut.

Pembayaran dan refund sudah memakai penguncian baris bahan yang sama. Perubahan pada bahan yang sama menunggu transaksi sebelumnya selesai, sehingga restock, pengurangan, pemotongan resep, dan refund tidak saling menimpa. Tidak ada perubahan cara staf mengisi form atau kebijakan stok pembayaran.

Restock dan pengurangan menyimpan nilai stok serta `StockLog` dalam satu transaksi. Jika salah satunya gagal, keduanya dibatalkan. Event `stock-updated` dan respons berhasil dikirim setelah commit. Ini juga menutup masalah A04 pada dua endpoint tersebut.

Pembaruan bahan lewat `PUT /api/stocks/:id` tetap memakai nilai stok absolut jika field `stock` dikirim: nilainya menjadi stok baru, bukan jumlah penambahan/pengurangan. Penguncian mengurutkan penyimpanan; tidak mendeteksi form yang sudah lama dibuka pengguna. Perubahan metadata tanpa field stok membaca stok terbaru sebelum menghitung status.

Referensi pembayaran tunai baru memakai `CASH-<order ID>-<timestamp>` agar dua order yang dibayar pada milidetik yang sama tidak berbenturan pada constraint unik. Pengulangan pembayaran order yang sudah lunas tetap tidak memotong stok lagi. Referensi transaksi lama tidak diubah.

Tidak diperlukan migrasi database.

## Validasi kuantitas (A06)

Tambah bahan, edit stok, restock, dan pengurangan manual memvalidasi seluruh nilai angka dengan ketat. Angka JSON dan string desimal dari form diterima; teks campuran seperti `5abc`, string kosong, `null`, boolean, array/objek, angka non-finite, negatif dan lebih dari dua angka desimal ditolak HTTP 400. String notasi eksponen, heksadesimal atau pemisah ribuan juga ditolak; masukkan string desimal biasa seperti `5.25`.

`stock` dan `min_stock` boleh nol. Pada tambah bahan, field yang tidak dikirim tetap menggunakan default nol; nilai kosong yang dikirim secara eksplisit tidak dianggap nol. Update tanpa field angka mempertahankan nilainya. Restock dan pengurangan memerlukan `quantity` minimal 0.01. Batas maksimum mengikuti `DECIMAL(12,2)`, yaitu 9999999999.99 dalam satuan bahan yang dipakai; sistem belum memiliki konfigurasi batas berbeda untuk tiap satuan.

Restock memeriksa batas hasil stok, bukan hanya jumlah yang ditambahkan. Pemeriksaan berlangsung di bawah row lock, termasuk ketika beberapa request bersamaan mendekati batas maksimum. Perubahan manual dihitung dalam perseratus satuan agar stok dan log pecahan konsisten. Input gagal tidak menyimpan field lain dalam request, log, atau notifikasi sukses.

Validasi ini tidak mengubah kebijakan pemotongan stok otomatis saat pembayaran. Saldo negatif yang sudah ada akibat pemotongan otomatis tetap dapat direstock sampai pulih; input stok manual negatif tetap ditolak. Tidak ada perubahan massal atau koreksi data lama.

## Pengujian

Jalankan dari folder `backend`, dengan MySQL lokal:

```powershell
$env:KITKOP_OPTIONS_DB_TEST='true'
node --test --test-concurrency=1 tests/*.test.js
```

`stockConcurrency.integration.test.js` memakai route HTTP asli dan schema MySQL sementara yang dihapus setelah tes. Cakupannya meliputi restock/reduce bersamaan, pengurangan yang melebihi stok terbaru, pecahan, status stok, pembayaran tunai pada timestamp yang sama, pengulangan pembayaran, refund, edit metadata, dan kegagalan log melalui trigger SQL khusus schema uji. Tes kegagalan log memverifikasi rollback dan tidak adanya event sukses.

Hook sementara pada proses tes menahan pembacaan tanpa lock agar urutan race condition dari audit dapat direproduksi bila pola lama muncul kembali. Hook tersebut tidak mengubah file atau data operasional.

`stockQuantities.test.js` dan `stockQuantities.integration.test.js` memeriksa input malformed pada seluruh endpoint manual, rollback update sebagian, log/event, default/angka nol, pecahan, form URL-encoded, overflow serentak dan restock saldo negatif lama. Schema MySQL uji selalu terpisah dari data operasional.
