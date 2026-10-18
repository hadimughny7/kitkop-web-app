# Percobaan ulang QRIS

Backend tidak lagi membuat QRIS mock ketika gateway gagal. Kegagalan menghasilkan HTTP 502 dan pelanggan dapat mencoba kembali selama pesanan masih pending dalam batas waktu 10 menit yang sudah berlaku.

- Invoice gateway yang valid, belum dibayar, dan belum kedaluwarsa dipakai kembali.
- Referensi mock lama, invoice gagal, atau invoice kedaluwarsa diganti dengan referensi baru.
- Jika koneksi putus sehingga hasil gateway belum diketahui, retry menggunakan referensi yang sama mengikuti idempotensi gateway.
- Reservasi disimpan sebelum request gateway. Request bersamaan menerima HTTP 202 selama reservasi masih berjalan, tanpa membuat panggilan gateway tambahan.
- Referensi sebelumnya disimpan di `qris_attempts` agar callback terlambat tetap dikenali. Callback lama tidak boleh mengakhiri invoice baru atau menggandakan pemakaian stok. Pembayaran terlambat tidak otomatis membuka kembali pesanan yang dibatalkan.
- Halaman pelanggan menampilkan pesan kegagalan dan tombol Coba Lagi. QR hanya ditampilkan dari invoice gateway yang lolos validasi. Nominal mengikuti total gateway, termasuk biaya bila ada.

Simulasi pembayaran development tetap tersedia sesuai keputusan pengembangan sebelumnya. Simulasi ini terpisah dari fallback mock yang sudah dihapus.

## Otorisasi per pesanan (B02)

`POST /api/payments/create-qris` (`order_id` di body) dan `GET /api/payments/:orderId/status` kini memerlukan salah satu jalur berikut:

- Pelanggan: header `X-Order-Tracking-Token` berisi capability yang diterima saat checkout. Backend memeriksa signature HS256, audience tracking, masa berlaku, ID pada `sub`, serta kecocokan nomor dan ID order di database. Token A tidak berlaku untuk order B. Pelanggan tetap tanpa akun/login.
- Staf: jika header capability tidak dikirim, wajib JWT login yang valid, akun aktif, versi sesi yang cocok, dan role database `kasir`, `manajer`, atau `owner`. Kitchen/barista tidak mendapat akses pembayaran lewat JWT staf meskipun klaim role token diubah menjadi Owner.

Jika header capability dikirim, server memakai jalur pelanggan; capability salah/kosong tidak dialihkan ke izin staf. Sesi staf yang kebetulan ada pada browser tidak menggantikan capability pelanggan. Staf yang memegang capability sah suatu pesanan dapat memakai jalur tamu untuk pesanan itu, seperti pelanggan lain.

Tanpa kredensial/sesi staf valid, respons 401; capability salah/lintas order atau role staf tidak berizin mendapat 403. ID malformed ditolak 400. Request tanpa izin tidak membaca/membuat invoice dan tidak memanggil gateway. Seluruh respons kedua endpoint memakai `Cache-Control: no-store`. Endpoint webhook tetap memakai signature penyedia; pembayaran tunai tetap khusus staf berwenang.

Frontend menyimpan token per nomor order dalam sessionStorage dengan fallback memori. Halaman status mengirim token yang sesuai untuk pembuatan awal, retry, dan polling. Refresh pada tab yang sama tetap dapat mengakses pembayaran. Pesan Lagi menyimpan capability baru tanpa mengganti token pesanan sebelumnya. Browser/tab tanpa token perlu menggunakan tab checkout atau menghubungi kasir; token tidak diterbitkan ulang hanya dari ID/nomor order.

Deploy backend dan frontend bersama agar klien lama tidak terus meminta invoice tanpa token. Tidak diperlukan migrasi database baru. Pembatasan endpoint simulasi development tidak diubah dalam perbaikan B02.

## Migrasi

Server otomatis menjalankan migrasi idempotent untuk membuat tabel `qris_attempts` saat startup. Migrasi juga dapat dijalankan dari direktori backend:

```sh
npm run migrate:qris-attempts
```

## Verifikasi

`tests/qrisRetry.integration.test.js` memakai schema MySQL sementara dan gateway HTTP lokal, mencakup retry, konkurensi, kegagalan jaringan, validasi invoice, callback referensi lama, serta pembayaran/pembatalan ketika request gateway masih berjalan. Schema sementara dibersihkan setelah tes.

Tes ini tidak memverifikasi settlement KuyzPay sungguhan. Verifikasi browser memakai respons API tiruan dan tidak melakukan pembayaran nyata.

`tests/paymentAccess.integration.test.js` menguji request anonim, signature/audience/expiry salah, ID dan nomor silang, invoice/retry/polling tamu, seluruh role staf, versi sesi dicabut, akun nonaktif/dihapus, serta malformed ID tanpa perubahan invoice atau panggilan gateway. Regresi browser mencakup checkout tanpa akun, retry, polling, refresh, dan Pesan Lagi dengan token per order.
