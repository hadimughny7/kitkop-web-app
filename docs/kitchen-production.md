# Validasi produksi pesanan

Backend mewajibkan transaksi pesanan berstatus `paid` sebelum tindakan berikut:

- `PATCH /api/orders/:orderId/items/process-all`
- `PATCH /api/orders/:orderId/items/complete-all`
- `PATCH /api/orders/:orderId/items/:itemId/status`
- Perubahan status pesanan ke `confirmed`, `preparing`, atau `completed` melalui `PATCH /api/orders/:id/status`.

Tindakan produksi untuk pesanan tanpa transaksi, atau transaksi `pending`, `expired`, dan `failed`, ditolak dengan HTTP 409. Status pesanan `confirmed` saja tidak menjadi bukti pembayaran.

Proses per item dan proses semua menerima pesanan `confirmed` atau `preparing`. Selesaikan semua menerima pesanan `preparing`. Pesanan `pending`, `cancelled`, atau `completed` tidak dapat diproses kembali. Perubahan status umum juga tidak mengizinkan lompatan langsung dari `pending` ke `preparing`.

Validasi dan perubahan item, pesanan, serta riwayat status menggunakan satu transaksi database dengan penguncian baris pesanan. Notifikasi dikirim setelah commit berhasil. Pembatalan mengikuti [aturan pengembalian stok untuk item yang belum diproses](order-cancellation.md).

Alur kasir tetap: pembayaran tunai yang berhasil mengubah transaksi menjadi `paid` dan pesanan menjadi `confirmed`, lalu kitchen/barista memproses pesanan.

## Pengujian

Di direktori `backend`, jalankan PowerShell:

```powershell
$env:KITKOP_OPTIONS_DB_TEST='true'
node --test tests/*.test.js
```

Tes integrasi produksi menggunakan schema MySQL sementara yang dibuat dan dihapus sendiri. Cakupan meliputi penolakan pembayaran belum lunas, tidak adanya perubahan data/notifikasi saat ditolak, pembayaran tunai asli melalui endpoint kasir, produksi massal/per item, pesanan terminal, request bersamaan, dan pembatalan pesanan belum dibayar.
