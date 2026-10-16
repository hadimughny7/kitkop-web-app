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

Tautan lama, tab lain tanpa token, storage yang tidak tersedia, serta event yang terlewat memakai polling HTTP setiap lima detik selama order masih aktif. Halaman status dan tombol Pesan Lagi tetap berfungsi. Kontrak serta otorisasi endpoint HTTP lama tidak diubah oleh perbaikan F14 ini: endpoint pelacakan HTTP berdasarkan nomor order tetap publik. Pembatasan Socket.IO tidak menjadi pengganti pengamanan endpoint HTTP tersebut.

Backend dan frontend perlu dideploy bersama agar klien staf mengirim kredensial handshake yang baru. Tidak ada migrasi database tambahan. Ketidaksesuaian role barista pada model database baru merupakan temuan terpisah (F02); pengujian socket barista menyesuaikan enum hanya pada schema uji.

## Pengujian

Setelah dependency backend dan frontend tersedia, jalankan dari `backend`:

```powershell
$env:KITKOP_OPTIONS_DB_TEST='true'
node --test tests/*.test.js
```

Tes memakai server Socket.IO dan klien sungguhan (`socket.io-client` dari frontend) dalam schema MySQL sementara. Cakupan meliputi seluruh role staf, kredensial tidak valid, koneksi anonim, room escalation, pelanggan A/B, payload sensitif, pembayaran/produksi, perubahan akun, token kedaluwarsa, serta koneksi ulang. Schema uji dihapus setelah selesai.

Regresi browser memeriksa checkout tanpa login, penyimpanan token, pembaruan realtime pembayaran/produksi, refresh dan Pesan Lagi, notifikasi lintas halaman staf, penghentian notifikasi, dan logout. QRIS dimock pada pengujian browser; tidak ada charge uang sungguhan.
