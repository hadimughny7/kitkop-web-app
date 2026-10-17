# Pencabutan sesi setelah perubahan password (A08)

Setiap akun staf menyimpan `session_version`. Token login baru memuat klaim `sessionVersion` dengan versi akun saat login. Middleware HTTP dan handshake Socket.IO memeriksa signature HS256, identitas staf, status akun, dan kesamaan versi dengan database. JWT tracking pelanggan memakai audience terpisah dan tidak menjadi token staf.

Saat password diubah melalui API pengguna, satu perintah UPDATE menyimpan hash password baru sekaligus menaikkan versi menggunakan `session_version + 1` dari nilai database. Dua reset serentak menaikkan versi dua kali. Jika penyimpanan akun gagal, hash dan versi tetap seperti sebelumnya dan tidak ada pemberitahuan pencabutan sesi.

Sesudah penyimpanan berhasil, token versi lama mendapat HTTP 401 `SESSION_REVOKED`, termasuk pada route dengan optional auth; token yang dicabut tidak diperlakukan sebagai staf atau diam-diam menurunkan request menjadi tamu. Request tanpa token tetap dapat memesan sebagai tamu. Akun lain dan token pelacakan pesanan tidak terpengaruh.

Socket aktif milik akun dengan versi lebih lama menerima event privat `session-revoked` tanpa payload, lalu diputus. Login baru yang sudah memakai versi terbaru tidak diputus oleh pemberitahuan reset lama yang terlambat. Versi juga diperiksa kembali setelah socket memasuki room untuk menutup benturan reset dengan handshake. Koneksi ulang memakai token lama ditolak dengan kode `SESSION_REVOKED`.

Frontend menghapus sesi yang sesuai dan kembali ke login saat menerima pencabutan tersebut. Logout tersinkron ke tab lain melalui storage event. Pengguna yang mengganti password sendiri juga langsung diminta login ulang; tidak perlu menunggu API berikutnya gagal. Bila koneksi realtime tidak tersedia, request HTTP berikutnya tetap ditolak dan mengarahkan pengguna ke login. Event atau HTTP 401 dari token lama tidak boleh menghapus login baru yang sudah menggantikannya.

Perubahan profil biasa tanpa password, termasuk password kosong pada form edit, tidak menaikkan versi sesi. Pengubahan role/status aktif yang benar-benar berubah tetap memutus socket seperti sebelumnya; otorisasi HTTP selalu mengambil role akun terbaru dari database. Kebijakan pemberian role Owner (A11) tidak diubah oleh perbaikan ini.

## Migrasi dan kompatibilitas

Startup backend menjalankan `add-session-versions.js` sebelum menerima request. Migrasi menambah kolom unsigned dengan default nol dan tidak mengganti hash, data akun, atau versi yang sudah ada. Schema baru juga mencantumkan kolom ini. Manual dari folder backend: `npm.cmd run migrate:staff-sessions`.

Token lama tanpa klaim versi hanya diterima untuk akun yang masih versi nol. Setelah password diubah dengan backend baru, versi menjadi positif dan token lama tersebut ditolak permanen. Token baru tetap berlaku 24 jam sesuai aturan sebelumnya. Perubahan password di luar API harus disertai peningkatan versi sesi juga; jangan memperbarui hash langsung melalui SQL tanpa mencabut versi.

Deploy backend dan frontend bersama, lalu restart backend agar migrasi dan pemeriksaan sesi aktif. Tidak ada pencabutan massal bagi akun yang tidak mengganti password hanya karena deploy.

## Pengujian

Tes memakai HTTP dan Socket.IO asli pada schema MySQL lokal sementara: upgrade schema lama, token legacy/baru, reset dalam detik yang sama, multi-socket, reconnect, concurrent reset, login baru saat notifikasi lama tertunda, kegagalan SQL, update profil, self reset, malformed claim, serta tracking pelanggan. Schema uji dihapus sesudah selesai. Tidak ada akun operasional yang diubah.
