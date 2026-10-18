# Pemeriksaan keamanan lanjutan — 18 Oktober 2026

Acuan pemeriksaan awal: HEAD `d2a30b2` dengan perubahan maintenance/cleanup saat itu belum di-commit. Maintenance kemudian disimpan pada commit `4117a60`. Status tindak lanjut B02 diperbarui pada bagian terkait. Ini pemeriksaan terarah dan regresi lokal, bukan sertifikasi keamanan production atau audit seluruh deployment.

## Hasil validasi

- Seluruh **177 tes backend** lulus, tanpa gagal/skipped: autentikasi, sesi, izin Owner/Manajer, socket/tracking, signature webhook, pembayaran tunai, upload, transaksi settings/stok, pemesanan serentak, pembatalan, dan kompatibilitas dependency.
- **13 tes frontend** lulus; lint `--max-warnings=0` bersih; build production berhasil. `npm ls --all` valid pada kedua bagian.
- `npm audit` backend/frontend masing-masing **0 advisory** pada waktu pemeriksaan, termasuk dependency dev. Audit npm memeriksa advisory dependency, bukan seluruh logika aplikasi. [Dokumentasi npm audit](https://docs.npmjs.com/cli/v11/commands/npm-audit/).
- Browser hasil build pada 375/1440 px: 11 route staf, chart/chunk laporan saat diperlukan, alur tamu/keranjang, polling/countdown QRIS, dan pergantian order lulus dengan API fixture lokal. Tidak ditemukan uncaught JavaScript error pada skenario ini.
- Panduan bootstrap database lokal diuji dari contoh kode dokumentasi: schema kosong berhasil, password Owner tersimpan sebagai hash bcrypt yang cocok, percobaan ulang pada schema berisi tabel ditolak tanpa menggandakan akun.
- Semua mutasi memakai schema MySQL localhost sementara yang dihapus. Build/skrip fixture berada di TEMP. Gateway QRIS diganti mock localhost; tidak ada pembayaran nyata, perubahan database operasional, deployment, atau pengujian terhadap hosting.

## Temuan dan status tindak lanjut

### B01 — Sedang: detail menu publik mengungkap resep dasar dan stok bahan

Tanpa Authorization, `GET /api/menus/:id` mengembalikan HTTP 200 dengan `recipes[].quantity_used` dan `recipes[].rawMaterial.stock`. Fixture stok `123.45` terlihat pada respons anonim.

Lokasi: [menuController.js](../backend/controllers/menuController.js), `getMenuById` sekitar baris 76–96; [menuRoutes.js](../backend/routes/menuRoutes.js). `publicMenu()` membuang resep tambahan pada pilihan, tetapi belum menghapus `recipes` dasar yang di-include pada detail.

Dampaknya adalah keterbukaan informasi resep/inventori internal; ini bukan bukti kebocoran data pelanggan atau kemampuan mengubah stok. Pisahkan respons menu pelanggan dari detail resep staf, atau hapus resep dasar dari serialisasi publik dan pertahankan endpoint resep terautentikasi untuk pengelola. Tinjau pemakai frontend sebelum mengubah kontrak detail.

### B02 — Sedang: pembuatan dan pembacaan QRIS belum dibatasi ke pemilik pesanan

**Status: sudah diperbaiki pada tindak lanjut B02.** Bukti berikut merekam kondisi sebelum perbaikan. Endpoint QRIS/status sekarang memakai capability yang terikat ID dan nomor order, atau sesi staf aktif dengan role kasir/manajer/owner. Frontend checkout/retry/polling mengirim token per order. Rincian dan verifikasi: [otorisasi pembayaran](qris-retries.md#otorisasi-per-pesanan-b02).

Regresi setelah perbaikan: **184 tes backend dan 13 tes frontend lulus**, lint 0 error/warning dan build berhasil. Browser production 375/1440 px memeriksa checkout tanpa login, invoice gagal lalu retry, polling, refresh/reuse invoice, Pesan Lagi ke order baru dengan capability baru, dan penolakan token silang. Setiap request pembayaran browser menggunakan capability pesanan yang tepat. Gateway tetap mock lokal; tidak ada pembayaran nyata atau perubahan data operasional.

Pada fixture yang sama, HTTP tracking tanpa token sudah ditolak 403. Namun request anonim `POST /api/payments/create-qris` dengan `order_id` tetap menghasilkan 200, membuat satu panggilan ke mock gateway dan menyimpan invoice. `GET /api/payments/:orderId/status` anonim juga menghasilkan 200, berisi nominal, referensi transaksi dan QRIS invoice tersebut.

Lokasi: [paymentRoutes.js](../backend/routes/paymentRoutes.js) baris 7–9, [paymentController.js](../backend/controllers/paymentController.js), dan [qrisPayments.js](../backend/services/qrisPayments.js).

Orang yang mengetahui/menebak ID order dapat mengakses informasi pembayaran atau memicu pembuatan invoice untuk pesanan tersebut. Pengujian ini **tidak** membuktikan pembayaran bisa menjadi `paid` melalui kedua endpoint tersebut; webhook dan pembayaran tunai tetap memiliki pengamanan tersendiri. Tidak dilakukan charge nyata.

Perluas capability token pesanan ke HTTP pembayaran, dengan kecocokan ID order serta jalur staf yang berizin. Pelanggan tetap dapat memakai token tanpa akun. Selaraskan frontend self-order/POS dan pengujian pembayaran agar retry/status tetap berjalan. Pemeriksaan otorisasi per endpoint mengikuti [panduan REST OWASP](https://cheatsheetseries.owasp.org/cheatsheets/REST_Security_Cheat_Sheet.html#access-control).

### B03 — Rendah: elemen item pesanan yang salah bentuk menghasilkan HTTP 500

`POST /api/orders` dengan nama fixture valid dan `items: [null]` menghasilkan 500. Controller memeriksa array tidak kosong, lalu membaca `item.menu_id` tanpa memeriksa apakah elemen merupakan object yang valid.

Lokasi: [orderController.js](../backend/controllers/orderController.js) sekitar baris 60–62. Dalam uji, jumlah order/customer tidak berubah: transaksi tetap di-rollback. Ini masalah validasi dan kualitas respons API, bukan bukti kerusakan stok. Tolak elemen null/array/primitive dengan 400 sebelum menulis customer atau memulai pemrosesan item.

### B04 — Sedang, bersyarat dan inspeksi kode: TLS database tidak memverifikasi sertifikat

Saat `DB_SSL=true`, [config/database.js](../backend/config/database.js) baris 22–24 mengatur `rejectUnauthorized: false`. Koneksi yang terenkripsi dengan konfigurasi ini belum memverifikasi sertifikat server sebagaimana verifikasi TLS biasa.

Risiko relevan untuk koneksi database melalui jaringan yang memerlukan verifikasi identitas server. Tidak dilakukan serangan jaringan, koneksi hosting, atau pengujian sertifikat provider. Tinjau CA/konfigurasi provider dan aktifkan verifikasi yang sesuai sebelum mengubah deployment; mengganti flag tanpa menyiapkan trust chain dapat memutus koneksi. Rujukan: [panduan TLS OWASP](https://cheatsheetseries.owasp.org/cheatsheets/Transport_Layer_Security_Cheat_Sheet.html).

Temuan B01, B03, dan B04 masih terbuka. B02 diperbaiki setelah pengguna menyetujui tindak lanjut; tidak memerlukan migrasi database.

## Keputusan lama dan batas cakupan

- **F04 tetap sengaja ditunda:** endpoint `simulate-pay` masih publik dan tidak dibatasi production, sesuai keputusan pengguna untuk pengembangan. Ini tetap menjadi penghalang membuka deployment umum dengan aman; audit dependency bersih tidak menghilangkannya.
- Rotasi kredensial hosting yang pernah berada dalam Git belum dilakukan. Riwayat Git tidak ditulis ulang. Backup yang dikeluarkan dari tracking dinyatakan dummy oleh pengguna; salinan lokal tetap disimpan.
- Rate limiter memakai memory store per proses; perlindungan lintas worker/proxy memerlukan konfigurasi deployment yang tepat sebagaimana [panduan login](login-rate-limiting.md).
- SQL bootstrap lama belum selaras seluruhnya dengan model. Kali ini berkas tetap dipertahankan sebagai referensi historis dan setup baru diarahkan ke model terkini; ini bukan migrasi otomatis untuk semua kemungkinan instalasi lama.
- Tidak menguji settlement KuyzPay nyata, printer, semua kombinasi perangkat/UI, WAF/reverse proxy, TLS hosting, izin database hosting, pemindaian seluruh history Git, DoS atau brute-force massal. Lulusnya suite regresi tidak meniadakan temuan baru di luar cakupannya.

Prioritas berikutnya: keputusan production F04, pembatasan resep publik (B01), verifikasi TLS sesuai provider (B04), lalu validasi item malformed (B03).
