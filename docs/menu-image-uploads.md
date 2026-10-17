# Validasi upload gambar menu (A09)

Upload tetap tersedia melalui form menu untuk Owner/Manajer. Backend memeriksa byte file, bukan ekstensi atau MIME kiriman. Input hanya JPEG, PNG, atau WebP statis yang benar-benar dapat didekode; HTML, SVG, GIF, file dengan signature palsu, gambar rusak/terpotong dan WebP animasi ditolak HTTP 400. Satu request hanya boleh memuat satu file pada field `image`, maksimal 5 MiB dan 25 megapiksel.

Gambar valid diputar sesuai EXIF orientation, diperkecil secara proporsional agar sisi terpanjang maksimal 2000 px tanpa memperbesar gambar kecil, lalu di-encode ulang menjadi WebP kualitas 85. Metadata dan byte tambahan dari file asli tidak diteruskan. Proses menggunakan [Sharp dengan batas input dan decode ketat](https://sharp.pixelplumbing.com/api-constructor/) serta [output tanpa metadata bawaan](https://sharp.pixelplumbing.com/api-output/).

File baru bernama `menu-<UUID>.webp` dengan URL `/uploads/menus/<nama>`. Nama asli dan MIME tidak menentukan ekstensi hasil. JPEG/PNG asli yang diberi nama/MIME keliru tetap dapat diterima jika isi valid, tetapi hasilnya selalu WebP. HTML yang diberi MIME gambar ditolak dan tidak ditulis ke direktori publik. Gambar yang tersimpan lama tidak dikonversi massal; JPG/PNG/WebP lama tetap dapat ditampilkan. URL gambar menu tidak melayani ekstensi HTML/SVG atau format non-gambar lama.

## Penyimpanan dan kegagalan simpan (A12)

Byte kiriman ditampung sementara dalam memori sesuai batas ukuran. File baru hanya ditulis setelah decode/re-encode berhasil. Jika create/update menu gagal sebelum commit, file baru dibersihkan. Gambar lama baru dibersihkan sesudah commit berhasil dan hanya jika tidak dipakai menu lain. Update membaca menu di bawah row lock agar dua penggantian foto bersamaan tidak meninggalkan gambar pengganti yang tidak dipakai.

Kegagalan saat membersihkan file lama dicatat tanpa mengubah simpan yang sudah berhasil menjadi error API. Penghapusan hanya diperbolehkan untuk pola nama file menu di direktori upload; path lain yang tersimpan pada data lama tidak diikuti. Penghapusan menu juga menghapus gambar setelah menu berhasil dihapus dari database.

## Deployment

Dependency backend baru adalah Sharp 0.35.5, yang memerlukan Node.js **20.9 atau lebih baru**. Local memakai Node 24.21. Jalankan `npm.cmd ci` (atau `npm ci` di Linux), lalu restart backend. Binary Sharp untuk platform server dipasang lewat optional dependencies npm; jangan memakai instalasi `--omit=optional` atau menyalin `node_modules` Windows ke server Linux.

Direktori default tetap `backend/uploads/menus`. Opsional: set environment `MENU_UPLOAD_DIR` ke direktori absolut lain yang writable dan persisten; URL publik tetap sama. Tidak ada migrasi database atau penghapusan upload lama secara massal.

## Pengujian

Tes memakai gambar yang dibuat lokal, HTTP multipart asli, schema MySQL sementara, dan folder gambar di TEMP. Cakupannya meliputi gambar valid, MIME/nama menyesatkan, HTML/SVG, file rusak, pembatasan ukuran/piksel/frame, EXIF, metadata/trailing bytes, serving Content-Type/nosniff, batas role, JSON tanpa gambar, rollback SQL/opsi, penggantian bersamaan, gambar bersama, dan perlindungan path cleanup. Data dan gambar operasional tidak diubah.

Pemeriksaan npm audit pada pengerjaan ini tidak menandai Sharp, @img/colour, detect-libc atau semver yang dipakai. Backend masih memiliki 18 temuan dependency lama (1 critical, 9 high, 8 moderate); hasil ini tidak menyatakan seluruh aplikasi bebas advisory. Tidak dijalankan audit fix. Semver berubah dari 7.8.4 ke 7.8.5 untuk memenuhi dependensi Sharp; paket lain yang sudah ada tetap pada versi lock sebelumnya.
