# Validasi meja saat membuat pesanan

`POST /api/orders` memeriksa meja di backend setiap kali request menyertakan `table_id`:

| Input/kondisi | Respons |
| --- | --- |
| ID bukan bilangan bulat positif yang valid | HTTP 400, ID meja tidak valid |
| ID valid tetapi meja tidak ditemukan | HTTP 404, meja tidak ditemukan |
| Meja ditemukan tetapi tidak aktif | HTTP 409, meja tidak aktif |
| Meja aktif | Lanjut membuat pesanan |

ID dalam string angka seperti `"1"` tetap diterima. Nilai boolean, array, teks, nol, dan pecahan tidak diperlakukan sebagai ID meja. Pesanan tanpa `table_id` atau dengan `table_id: null` tetap didukung sesuai kontrak API sebelumnya, termasuk POS tanpa meja. Validasi berlaku untuk order pelanggan maupun staf yang memilih meja.

Pemeriksaan dilakukan sebelum pelanggan dibuat/diperbarui dan sebelum nomor order dialokasikan. Kegagalan tidak meninggalkan order, item, riwayat status, perubahan pelanggan, stok, counter, atau notifikasi.

Meja dibaca dengan shared row lock dalam transaksi pembuatan order. Beberapa pesanan dapat membaca meja aktif secara bersamaan, sedangkan penonaktifan/penghapusan meja harus menunggu transaksi tersebut selesai. Jika penonaktifan selesai lebih dahulu, order berikutnya ditolak. Mekanisme ini berlaku untuk penonaktifan satu meja maupun semua meja.

Pembatasan berlaku pada pesanan baru. Pesanan lama tetap dapat dilacak, dibayar, diproses, dan diselesaikan setelah meja dinonaktifkan. Tidak ada perubahan UI, migrasi database, atau perubahan data meja operasional yang diperlukan.

## Pengujian

Dari direktori `backend`:

```powershell
$env:KITKOP_OPTIONS_DB_TEST='true'
node --test tests/*.test.js
```

Tes memakai schema MySQL sementara dan menghapusnya setelah selesai. Cakupan meliputi meja aktif/nonaktif/tidak ditemukan, ID tidak valid, pelanggan baru/lama, order QR/POS/tanpa meja, pesanan serentak pada meja yang sama, penonaktifan massal, aktivasi ulang, benturan penonaktifan dengan pembuatan order, serta penyelesaian pesanan lama. Uji rollback nomor order tetap memicu kegagalan SQL setelah alokasi nomor agar tidak bergantung pada penolakan ID meja sebelum transaksi menulis data.
