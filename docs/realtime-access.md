# Akses dan payload Socket.IO

Koneksi realtime memerlukan salah satu kredensial berikut pada handshake `auth`:

- Staf: `{ token }`, menggunakan JWT login. Server memeriksa tanda tangan, masa berlaku, akun aktif, dan role dari database; klaim role klien tidak menentukan hak akses.
- Pelanggan: `{ orderNumber, trackingToken }`. Token bertanda tangan diterbitkan hanya dalam respons pembuatan order, terikat pada ID dan nomor order, memiliki audience khusus, dan berlaku tujuh hari. Token tersebut bukan token login staf.

Koneksi anonim, token rusak/kedaluwarsa, akun nonaktif/tidak ditemukan, serta token pelacakan untuk order lain ditolak. Server menentukan seluruh room; `join-room`, `join-role`, atau `track-order` dari klien tidak dapat memberikan akses tambahan.

| Event | Penerima | Payload |
| --- | --- | --- |
| `new-order` | Semua role staf aktif | ID, nomor, dan status order |
| `payment-success` | Semua staf dan pelanggan dengan token order terkait | ID/nomor order yang tersedia |
| `order-status-update` | Semua staf dan pelanggan dengan token order terkait | ID/nomor order, status, waktu pembaruan |
| `order-item-update` | Semua staf dan pelanggan dengan token order terkait | ID order/item dan status produksi |
| `stock-updated` | Owner, manajer, kitchen, barista | Tanpa detail pelanggan |
| `menu-updated` | Staf | Tanpa detail pelanggan |

Pengiriman memakai satu helper dengan whitelist field. Tidak ada broadcast global untuk event aplikasi. Model ORM, nama, telepon, email, catatan pelanggan, detail item, referensi pembayaran, dan token pelacakan tidak disertakan dalam event tersebut. Room union mencegah pengiriman ganda kepada socket yang cocok dengan beberapa room.

Koneksi diputus saat token kedaluwarsa. Perubahan role/status aktif/password atau penghapusan akun melalui API pengguna memutus socket akun tersebut. Logout frontend memutus seluruh socket staf yang dibuat aplikasi, termasuk logout melalui tab lain. Notifikasi pembayaran global tetap dipasang pada layout dashboard sehingga perpindahan halaman tidak menghilangkan notifikasi.

## Pelanggan dan kompatibilitas

Frontend menyimpan token pelacakan per order dalam `sessionStorage`, tidak memasukkannya ke URL atau broadcast. Token bertahan ketika halaman di-refresh dalam sesi tab yang sama. Pelanggan tidak perlu login. Token tidak diterbitkan ulang melalui endpoint HTTP pelacakan publik.

HTTP tracking juga memerlukan token checkout melalui header `X-Order-Tracking-Token` pada `GET /api/orders/track/:orderNumber`. Backend memverifikasi signature HS256, audience, masa berlaku, nomor order, dan ID order. Token kosong/rusak/kedaluwarsa/milik pesanan lain ditolak HTTP 403; token yang valid tetapi pasangan ID/nomor tidak ditemukan mendapat 404. Semua respons tracking memakai `Cache-Control: no-store`. Token tidak diterbitkan ulang dari nomor pesanan dan JWT login staf tidak menggantikan token tracking; staf menggunakan endpoint detail pesanan di dashboard.

Polling lima detik untuk event terlewat mengirim token yang sama. Respons tracking hanya berisi status, waktu, nominal, item, meja, serta nama/telepon untuk mengisi kembali Pesan Lagi. Email, ID pelanggan/kasir, identitas staf, log internal, resep/stok, dan referensi transaksi tidak dikirim. Pesan Lagi dan refresh dalam tab pemesanan tetap didukung.

Tautan lama atau tab/perangkat tanpa token tidak dapat membuka detail hanya dengan nomor pesanan. Halaman menampilkan petunjuk menggunakan tab asal atau menghubungi kasir. Jika sessionStorage diblokir, token disimpan dalam memori agar checkout saat ini tetap berjalan; refresh dalam kondisi tersebut memerlukan bantuan kasir. Token berlaku tujuh hari dan tidak diperpanjang melalui endpoint tracking.

Backend dan frontend perlu dideploy bersama agar klien mengirim kredensial yang diperlukan. Tidak ada migrasi database tambahan untuk pengamanan tracking. Role Barista sudah disamakan pada model, API, dan UI melalui perbaikan F02.

## Identitas pemesan tamu

`POST /api/orders` membuat record `Customer` terpisah untuk setiap pesanan QR maupun kasir dalam transaksi database yang sama dengan order. Nama wajib; telepon dan email tetap opsional. Telepon/email yang diketik belum diverifikasi dan tidak dipakai untuk mencari, memakai ulang, atau memperbarui profil lama, termasuk saat kontak sama persis atau memakai Pesan Lagi.

Respons pembuatan pesanan hanya mengembalikan nama, telepon, dan email yang dikirim untuk pesanan tersebut pada objek `customer`; kontak kosong disimpan sebagai `null`. Respons tracking tetap mengikuti batas field dan token di atas. Detail pelanggan untuk staf tetap tersedia melalui endpoint dashboard yang memerlukan login.

Tidak ada migrasi atau perubahan data historis: pesanan lama tetap menunjuk record sebelumnya dan tidak dapat ditimpa oleh pemesanan baru dengan nomor telepon yang sama. Perubahan identitas yang sudah terjadi sebelum perbaikan tidak dipulihkan otomatis. Tabel `customers` merupakan penyimpanan identitas pemesan, bukan direktori akun terverifikasi atau hitungan pelanggan unik berdasarkan nomor telepon.

## Pengujian

Setelah dependency backend dan frontend tersedia, jalankan dari `backend`:

```powershell
$env:KITKOP_OPTIONS_DB_TEST='true'
node --test tests/*.test.js
```

Tes memakai server Socket.IO dan klien sungguhan (`socket.io-client` dari frontend) dalam schema MySQL sementara. Cakupan meliputi seluruh role staf, kredensial tidak valid, koneksi anonim, room escalation, pelanggan A/B, payload sensitif, pembayaran/produksi, perubahan akun, token kedaluwarsa, serta koneksi ulang. Schema uji dihapus setelah selesai.

Regresi browser memeriksa checkout tanpa login, penyimpanan token, pembaruan realtime pembayaran/produksi, refresh dan Pesan Lagi, notifikasi lintas halaman staf, penghentian notifikasi, dan logout. QRIS dimock pada pengujian browser; tidak ada charge uang sungguhan.
