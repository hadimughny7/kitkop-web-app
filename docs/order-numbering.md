# Nomor order aman untuk request bersamaan

Nomor tetap menggunakan format `ORD-YYYYMMDD-XXXX`. Tanggal UTC dipertahankan sesuai perilaku sebelumnya; urutan dapat bertambah melewati empat digit. Constraint `UNIQUE` pada `orders.order_number` tetap aktif.

Tabel tambahan `order_counters` menyimpan urutan terakhir per tanggal. Backend mengunci baris tanggal tersebut dalam transaksi yang sama dengan penyimpanan pelanggan, order, item, dan riwayat status. Penguncian berlaku antar koneksi dan antar proses backend, termasuk saat baris counter pertama kali dibuat. Counter ikut rollback jika penyimpanan pesanan gagal.

Saat counter pertama kali dipakai, urutan dilanjutkan dari nomor terbesar pada pesanan yang sudah ada, menggunakan perbandingan angka. Jika terjadi duplicate key pada `order_number`, backend mengulang seluruh transaksi dan menyelaraskan counter dengan nomor yang tersimpan. Deadlock dan lock timeout juga dapat dicoba ulang; maksimal empat percobaan total. Error lain tidak otomatis dicoba ulang. Notifikasi pesanan baru hanya dikirim setelah commit.

Seluruh query sebelum commit memakai koneksi transaksi yang sama agar request serentak tidak menghabiskan pool sambil menunggu query di luar transaksi.

## Penerapan

Restart backend akan membuat tabel counter otomatis sebelum menerima request. Tidak ada pesanan lama yang diubah atau dihapus. Alternatifnya, dari direktori `backend`:

```powershell
node migrations/add-order-counters.js
```

Migrasi aman dijalankan ulang. Saat deploy, semua proses pembuat pesanan harus menggunakan versi baru agar semuanya mengikuti mekanisme counter.

## Pengujian

```powershell
$env:KITKOP_OPTIONS_DB_TEST='true'
node --test tests/*.test.js
```

Tes memakai schema MySQL sementara yang dihapus setelah selesai. Cakupan mencakup lima request serentak, 30 request serentak melalui dua proses backend, kesesuaian pelanggan/item/harga, migrasi berulang, nomor lama, counter tertinggal yang memicu duplicate key sungguhan, rollback, pergantian hari, urutan di atas 9999, dan batas panjang nomor.
