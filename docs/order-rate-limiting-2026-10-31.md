# Pembatasan pengiriman pesanan

Perubahan hanya membatasi frekuensi `POST /api/orders`. Perhitungan harga, pembayaran, antrean produksi, stok, pelacakan pesanan, dan struktur database tetap memakai implementasi sebelumnya.

## Batas awal

| Pengirim | Batas dalam jendela 60 detik |
| --- | --- |
| Pelanggan tanpa login | 5 percobaan per sesi browser |
| Gabungan pelanggan dari satu IP/jaringan IPv6 /56 | 300 percobaan |
| Staf dengan akun dan token yang terverifikasi | 60 percobaan per akun |

Percobaan dengan input tidak valid ikut dihitung. Batas pulih ketika jendela waktunya berakhir. Batas ini merupakan nilai awal yang perlu disesuaikan dengan trafik nyata.

Sesi pelanggan berbeda tetap punya batas masing-masing meskipun memakai Wi-Fi yang sama. Akun staf berbeda punya batas terpisah dan tidak menggunakan batas gabungan IP pelanggan. Dua perangkat yang login dengan akun staf yang sama berbagi batas akun tersebut.

## Cara kerja

- Backend menerbitkan token sesi bertanda tangan dengan masa berlaku satu hari melalui header `X-Order-Session`. Token sesi tidak memberi hak login staf, membaca pesanan, atau melakukan pembayaran.
- Frontend menyimpan token di `localStorage` dan mengirimkannya pada pembuatan pesanan berikutnya. Respons gagal yang membawa token juga disimpan. Jika penyimpanan browser diblokir, token disimpan dalam memori halaman.
- Token hilang, kedaluwarsa, atau tidak valid diganti dengan sesi baru. Mengganti token tidak menghindari batas gabungan IP. Klien lama tanpa header masih dapat mengirim pesanan, dengan perlindungan batas IP.
- Identitas staf berasal dari autentikasi yang memeriksa akun aktif dan versi sesi di database. Header buatan pelanggan tidak dapat menentukan identitas staf.
- Jika batas terlampaui, backend mengembalikan HTTP 429 dengan kode `ORDER_RATE_LIMITED`, pesan waktu tunggu, `retry_after_seconds`, dan header `Retry-After`. Penolakan terjadi sebelum controller menulis data pesanan. Pesan tersebut menggunakan penanganan error checkout/POS yang sudah ada.
- CORS mengekspos header sesi dan waktu tunggu agar frontend pada origin terpisah dapat membacanya. Respons pembuatan pesanan menggunakan `Cache-Control: no-store`.

## Batas perlindungan

Sesi browser bukan identitas orang yang tidak dapat diganti. Menghapus penyimpanan atau membuka browser baru menghasilkan sesi baru; batas gabungan IP membatasi penyalahgunaan tersebut. Jika satu jaringan mencapai 300 percobaan, pelanggan lain pada jaringan yang sama juga dapat terkena penolakan sementara. Staf yang terverifikasi tetap memakai batas akunnya.

Penghitung saat ini berada dalam memori satu proses backend. Restart menghapus hitungan. Jika deployment menggunakan beberapa proses atau instance, gunakan store bersama agar batas berlaku gabungan. IP klien mengikuti konfigurasi `trust proxy` yang sudah ada; deployment di balik proxy perlu mengatur proxy tepercaya dengan benar.

## Berkas yang berubah

- `backend/middleware/orderRateLimit.js`: sesi pelanggan bertanda tangan, batas IP, batas sesi/akun, dan respons 429.
- `backend/routes/orderRoutes.js`: memasang limiter setelah autentikasi opsional pada pembuatan pesanan.
- `backend/server.js`: mengekspos header sesi dan waktu tunggu melalui CORS.
- `frontend/src/services/orderSession.js`: menyimpan sesi pelanggan.
- `frontend/src/services/api.js`: mengirim dan menyimpan sesi pada respons sukses maupun gagal, sambil mempertahankan penyimpanan token pelacakan.
- Tes backend dan frontend untuk batas sesi, Wi-Fi bersama, akun staf, pemulihan batas, dan penyimpanan browser.
- `backend/tests/orderInput.integration.test.js`: menaikkan batas hanya di fixture matriks validasi yang mengirim puluhan input salah dari akun yang sama. Batas aplikasi tetap 5/300/60 dan diuji menggunakan konfigurasi asli dalam tes limiter.

Tidak ada migrasi database atau dependency baru. Perubahan lokal pada skrip `frontend/package.json` tidak termasuk perubahan ini.

## Hasil verifikasi

- Seluruh 226 tes backend lulus tanpa skip, menggunakan instance MySQL sementara di localhost dan database uji terpisah.
- Seluruh 15 tes frontend, lint, dan build produksi lulus. Lint dijalankan langsung melalui Node karena wrapper npm pada Windows bermasalah dengan tanda `&` pada lokasi proyek.
- Pemeriksaan Chrome memakai modul API frontend asli dan respons simulasi membuktikan header sesi dapat dibaca lintas origin, sesi disimpan setelah HTTP 400, digunakan kembali setelah reload, dan tidak terhapus pada HTTP 429 tanpa header sesi. Token pelacakan dan pesan waktu tunggu tetap tersedia. Pemeriksaan ini tidak membuat pesanan operasional.
- Tes integrasi memakai router dan database asli membuktikan HTTP 429 tidak menambah Customer, Order, OrderItem, atau OrderStatusLog; akun staf terverifikasi tetap terpisah dari pelanggan dan akun staf lainnya.

## Pemeriksaan manual

1. Buat pesanan biasa; periksa isi, total, label Takeaway/meja, dan pelacakannya.
2. Kirim lebih dari 5 kali dari browser pelanggan yang sama dalam satu menit. Percobaan berikutnya harus menampilkan waktu tunggu dan tidak membuat pesanan tambahan.
3. Saat sesi pertama terkena batas, coba browser/perangkat lain pada Wi-Fi yang sama. Pesanan masih diterima selama batas gabungan IP belum tercapai.
4. Tunggu sampai waktu pada pesan habis, lalu kirim kembali dari sesi pertama.
5. Login memakai akun kasir berbeda dan periksa bahwa masing-masing tetap dapat membuat pesanan. Akun kasir tidak mengikuti batas sesi pelanggan sebelumnya.

Gunakan lingkungan uji untuk langkah yang membuat banyak pesanan.
