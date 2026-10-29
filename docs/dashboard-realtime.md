# Ringkasan dashboard realtime

Dashboard Owner dan Manajer mengambil ulang ringkasan melalui endpoint `GET /api/reports/dashboard` ketika menerima event staf berikut:

- `new-order`
- `payment-success`
- `order-status-update`
- `order-item-update`
- `stock-updated`
- `connect`, termasuk ketika koneksi tersambung kembali

Event hanya memicu pengambilan data. Angka ringkasan tetap berasal dari API, bukan dari penambahan angka berdasarkan payload event. Rumus pendapatan, pembayaran tunai, pesanan aktif, dan status stok mengikuti backend yang sudah ada.

Event berdekatan digabung dengan jeda 250 ms. Permintaan ringkasan berjalan bergantian; event selama permintaan berlangsung mengantrekan pembaruan berikutnya. Hal ini mencegah respons lama menimpa hasil permintaan yang lebih baru.

Ringkasan juga diperbarui saat tab kembali terlihat dan melalui pengecekan cadangan setiap 60 detik. Pembaruan latar belakang tidak mengganti seluruh halaman dengan spinner. Jika API gagal, dashboard menampilkan pesan error serta Coba lagi; keberhasilan berikutnya menghapus pesan error tersebut.

Saat meninggalkan dashboard, socket milik ringkasan diputus, listener visibility dilepas, timer dibersihkan, dan respons permintaan yang masih berjalan diabaikan.

## Verifikasi 29 Oktober 2026

Build, lint, dan 13 tes frontend lulus. Pengujian browser memakai fixture API dan socket terisolasi, tanpa menulis transaksi ke database:

- Event pesanan, pembayaran, status, item, stok, dan reconnect memperbarui ringkasan Owner.
- Pembaruan pada dashboard Manajer juga berhasil.
- Dua belas event serentak menghasilkan satu permintaan ringkasan GET.
- Permintaan lambat diselesaikan sebelum pembaruan yang mengantre; angka akhir mengikuti data terbaru.
- API gagal menampilkan error tanpa statistik nol palsu; Coba lagi memulihkan ringkasan.
- Event visibility dan callback pengecekan 60 detik memicu pembaruan.
- Keluar dari dashboard membersihkan koneksi serta timer dan menghentikan permintaan berikutnya.

Pengujian ini memverifikasi respons frontend terhadap event. Transaksi antarperangkat dengan koneksi Socket.IO backend nyata belum diuji melalui pembuatan pesanan baru.
