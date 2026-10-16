# Percobaan ulang QRIS

Backend tidak lagi membuat QRIS mock ketika gateway gagal. Kegagalan menghasilkan HTTP 502 dan pelanggan dapat mencoba kembali selama pesanan masih pending dalam batas waktu 10 menit yang sudah berlaku.

- Invoice gateway yang valid, belum dibayar, dan belum kedaluwarsa dipakai kembali.
- Referensi mock lama, invoice gagal, atau invoice kedaluwarsa diganti dengan referensi baru.
- Jika koneksi putus sehingga hasil gateway belum diketahui, retry menggunakan referensi yang sama mengikuti idempotensi gateway.
- Reservasi disimpan sebelum request gateway. Request bersamaan menerima HTTP 202 selama reservasi masih berjalan, tanpa membuat panggilan gateway tambahan.
- Referensi sebelumnya disimpan di `qris_attempts` agar callback terlambat tetap dikenali. Callback lama tidak boleh mengakhiri invoice baru atau menggandakan pemakaian stok. Pembayaran terlambat tidak otomatis membuka kembali pesanan yang dibatalkan.
- Halaman pelanggan menampilkan pesan kegagalan dan tombol Coba Lagi. QR hanya ditampilkan dari invoice gateway yang lolos validasi. Nominal mengikuti total gateway, termasuk biaya bila ada.

Simulasi pembayaran development tetap tersedia sesuai keputusan pengembangan sebelumnya. Simulasi ini terpisah dari fallback mock yang sudah dihapus.

## Migrasi

Server otomatis menjalankan migrasi idempotent untuk membuat tabel `qris_attempts` saat startup. Migrasi juga dapat dijalankan dari direktori backend:

```sh
npm run migrate:qris-attempts
```

## Verifikasi

`tests/qrisRetry.integration.test.js` memakai schema MySQL sementara dan gateway HTTP lokal, mencakup retry, konkurensi, kegagalan jaringan, validasi invoice, callback referensi lama, serta pembayaran/pembatalan ketika request gateway masih berjalan. Schema sementara dibersihkan setelah tes.

Tes ini tidak memverifikasi settlement KuyzPay sungguhan. Verifikasi browser memakai respons API tiruan dan tidak melakukan pembayaran nyata.
