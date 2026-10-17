# Klasifikasi item dari nama kategori (A07)

Pengelola cukup mengisi nama kategori seperti biasa. Tidak ada pilihan jenis tambahan pada form atau kolom jenis pada daftar kategori. API create/update kategori juga tidak memerlukan `item_type`.

Saat pesanan QR/POS dibuat, server menentukan `OrderItem.item_type` dari nama kategori, bukan ID atau field yang dikirim klien. Nama dinormalisasi untuk kapitalisasi, spasi, dan tanda baca.

| Nama kategori | Klasifikasi internal |
| --- | --- |
| Coffee (Espresso Based), Manual Brew, Non-Coffee, Kopi | minuman |
| Nama berawalan Minuman, Drink, Beverage, Coffee, Non Coffee, Kopi, Non Kopi, Tea, Teh, Jus, Juice, Matcha | minuman |
| Nama berawalan Snack, Snacks, Camilan, Cemilan | snack |
| Makanan, Pastry & Bakery, Main Course, nama lainnya | makanan |

Awalan dikenali sebagai kata utuh, sehingga `Coffeehouse` tidak dianggap `Coffee`. Nama baru yang belum dikenali tetap bisa dipakai memesan dan masuk Makanan sesuai fallback lama. Ini aturan berbasis nama, bukan pemahaman semua nama menu: gunakan nama kategori yang jelas seperti `Minuman Dingin` atau `Snack` jika membutuhkan pengelompokan tersebut. Kategori campuran mengikuti aturan pada tabel.

Perubahan nama memengaruhi klasifikasi pesanan baru. Snapshot item pada pesanan lama tetap dipertahankan dan tidak dihitung ulang ketika kategori berubah.

## Kompatibilitas

Tidak diperlukan migrasi kategori baru. Migrasi penambahan `menu_categories.item_type` dari versi sebelumnya tidak lagi dijalankan. Jika kolom tersebut sudah dibuat pada suatu instalasi, kolom dibiarkan utuh dan tidak dipakai aplikasi; tidak ada penghapusan data database otomatis. Kedua bentuk database sudah diuji.

Deploy backend dan frontend bersama lalu restart backend untuk memakai aturan baru. Tidak ada kategori yang perlu dikonfigurasi atau diblokir karena field jenis kosong.

## Pengujian

Tes mencakup variasi nama dan ID, pembuatan kategori hanya dengan nama, QR/POS, pengubahan nama, snapshot lama, pembayaran/produksi, spoofing jenis dari klien, serta kompatibilitas dengan/tanpa kolom jenis kategori lama. Mutasi memakai schema MySQL lokal sementara yang dihapus setelah pengujian.
