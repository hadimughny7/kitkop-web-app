# Halaman daftar pesanan

Daftar Pesanan menampilkan 50 pesanan per halaman. Tombol Sebelumnya dan Berikutnya dilengkapi nomor halaman serta rentang hasil, misalnya `Menampilkan 201–250 dari 250 pesanan`.

## Perilaku

- Seluruh halaman API dimuat menggunakan fungsi `fetchAllOrders` yang juga dipakai dashboard staf. Batas tetap 200 pesanan pada daftar dihapus.
- Pencarian nomor pesanan, nama pelanggan, dan telepon bekerja pada seluruh hasil, termasuk pesanan di halaman berikutnya.
- Pergantian pencarian, status, tipe, dan tanggal mengembalikan daftar ke halaman pertama. Filter tanggal awal tetap hari ini.
- Ringkasan status dihitung dari seluruh pesanan sesuai filter API, bukan hanya 50 baris yang terlihat. Seperti sebelumnya, pencarian teks hanya menyaring tabel.
- Tombol navigasi dinonaktifkan pada batas halaman. Hasil kosong menampilkan 0 hasil dan kedua tombol dinonaktifkan.
- Saat berpindah halaman, tampilan kembali ke bagian daftar pesanan.
- Jika halaman API berikutnya gagal diambil, daftar dan ringkasan parsial tidak ditampilkan. Pesan gagal memuat serta tombol Coba lagi tetap tersedia.
- Penyegaran realtime tetap mengambil ulang data. Nomor halaman yang ditampilkan dibatasi agar tetap valid jika jumlah hasil berkurang.

Pengambilan API berlangsung bertahap, 100 pesanan per permintaan. Seluruh hasil disimpan di browser agar pencarian dan ringkasan tetap lengkap. Rentang Semua tanggal dengan riwayat sangat besar membutuhkan lebih banyak permintaan dan waktu muat dibanding satu tanggal.

Tidak ada perubahan endpoint, database, pembayaran, status pesanan, atau pencetakan struk. Modal pembayaran/detail tetap mengikuti perilaku sebelumnya.

## Verifikasi 29 Oktober 2026

- Build, lint, dan 13 tes frontend lulus.
- Browser dengan 250 pesanan fixture: semua halaman API diambil, tabel menampilkan 50 baris, halaman kelima memuat pesanan setelah batas lama 200.
- Pencarian nomor/nama/telepon menemukan pesanan ke-250. Navigasi sebelumnya/berikutnya, data kosong, dan reset filter lulus.
- Kegagalan halaman API kedua menyembunyikan hasil parsial; Coba lagi memulihkan seluruh 250 pesanan.
- Layout navigasi pada viewport 320 px tidak menyebabkan overflow halaman.
- Pengujian browser memakai respons API terisolasi dan tidak menulis ke database operasional.
