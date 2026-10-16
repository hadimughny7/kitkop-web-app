# Pembatalan pesanan dan pengembalian stok

Pembatalan melalui `PATCH /api/orders/:id/status` menggunakan aturan berikut:

| Kondisi | Stok |
| --- | --- |
| Belum dibayar | Tidak dikembalikan karena belum dikurangi |
| Sudah dibayar, item `pending` | Dikembalikan jika ada bukti pengurangan stok |
| Item `preparing` atau `completed` | Tetap terpakai; tidak dikembalikan otomatis |
| Item sudah ditolak dan stok sudah dikembalikan | Tidak dikembalikan lagi |
| Pesanan sudah `cancelled` | Request pembatalan ulang berhasil tanpa perubahan tambahan |
| Pesanan sudah `completed` | Pembatalan ditolak |

Penentuan dilakukan per item. Pesanan campuran tetap dapat mengembalikan bahan item yang belum mulai, sementara bahan item yang sudah diproses tetap tercatat terpakai. Penolakan satu item mengikuti aturan yang sama: item yang sudah mulai tidak otomatis mengembalikan bahan.

Pengembalian menggunakan `stock_usage` yang disalin saat order dibuat, dikalikan jumlah item. Perubahan resep menu atau add-on setelah pemesanan tidak mengubah jumlah yang dikembalikan. Item dengan salinan resep yang belum pernah dikurangi stoknya tidak boleh menambah stok saat dibatalkan. Penanda `stock_refunded` mencegah pengembalian berulang.

Untuk item lama tanpa salinan resep, pengembalian memakai angka pengurangan stok historis yang secara spesifik mencatat item tersebut. Jika tidak ada bukti pengurangan per item, stok tidak ditambah otomatis; jumlah perlu direkonsiliasi oleh pengelola. Resep menu saat ini tidak digunakan untuk menebak pemakaian lama. Pesanan yang sudah dibatalkan sebelum perbaikan ini tidak diubah secara retroaktif.

## Pembayaran dan konkurensi

Pembatalan tidak mengubah transaksi menjadi belum dibayar dan tidak menjalankan refund uang. Status pembayaran serta jumlah yang telah dibayar tetap tersimpan. Pengembalian uang diproses terpisah sesuai kebijakan kafe/penyedia pembayaran.

Penguncian dimulai dari baris order, lalu item dan stok. Pengembalian stok, log stok, status pembatalan, dan riwayat status berada dalam satu transaksi database. Jika salah satu gagal, seluruh perubahan dibatalkan; notifikasi dikirim setelah commit berhasil.

Perubahan status produksi melalui endpoint staf umum menyelaraskan status item dengan status order agar tindakan tersebut tidak meninggalkan item sebagai `pending` padahal sudah diproses. Item yang sudah ditolak tetap ditolak.

Job batas waktu memeriksa ulang status terbaru di dalam transaksi dan tidak membatalkan pesanan yang sudah dibayar. Callback pembayaran berhasil atau terlambat tetap boleh mencatat penerimaan pembayaran untuk pesanan batal, tetapi tidak menghidupkan kembali pesanan atau memulai produksi otomatis. Kasus tersebut memerlukan tindak lanjut pembayaran oleh staf.

Tidak ada migrasi database baru untuk perbaikan ini; penanda stok yang sudah digunakan sistem dipakai kembali.

## Pengujian

Dari direktori `backend`:

```powershell
$env:KITKOP_OPTIONS_DB_TEST='true'
node --test tests/*.test.js
```

Tes integrasi memakai schema MySQL sementara dan menghapusnya setelah selesai. Cakupan meliputi pembatalan belum bayar/lunas, pecahan bahan dan add-on, perubahan resep setelah pembayaran, produksi campuran, penolakan item, pembatalan berulang/serentak, benturan dengan produksi/pembayaran/webhook, rollback saat resep rusak, data lama, dan job batas waktu. Pengujian tidak menggunakan pembayaran uang sungguhan.
