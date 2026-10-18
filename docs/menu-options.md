# Pilihan & Tambahan menu

Owner/manajer membuka **Manajemen Menu / Tambah/Edit Menu / Pilihan & Add-on**. Semua pilihan dibuat langsung di form menu dan disimpan bersama menu, tanpa membuat kelompok terpisah.

Klik **+ Tambah opsi / add-on**, beri nama (misalnya Penyajian, Level pedas atau Tambahan), lalu isi pilihan dan harga. Atur pilih satu/beberapa, wajib/opsional, batas maksimal dan status aktif. Saat memilih beberapa, aktifkan **gaada maksimalnya** agar semua pilihan yang tersedia bisa dipilih. Matikan jika ingin menentukan maksimal; aturan wajib tetap berlaku. Pengaturan ini juga tersimpan pada template dan digunakan di self-order maupun POS. Daftar **Add-on tersimpan** menyediakan pintasan untuk memakai ulang pilihan yang sudah pernah dibuat (termasuk Penyajian Ice/Hot). Opsi tersimpan tampil terlipat; klik judul untuk membuka atau menutup detail. Urutan opsi dapat diubah dengan menyeret handle atau tombol atas/bawah, dan urutan pilihan di dalamnya melalui tombol atas/bawah. Urutan disimpan bersama menu dan digunakan saat pemesanan. Default dan resep bahan tersedia di bagian **Default & bahan tambahan**. Hapus seluruh opsi untuk menjadikan menu tanpa pilihan.

Perubahan baru disimpan saat menekan Simpan/Tambah pada form menu; Batal atau Escape membuang perubahan. Pilihan lama tetap muncul saat edit. Jika sebelumnya dipakai bersama, perubahan dari satu menu otomatis membuat salinan khusus menu itu, sehingga menu lain tetap memiliki pengaturan semula. ID pilihan yang tidak berubah pada opsi khusus menu tetap dipertahankan.

Add-on baru atau konfigurasi yang diubah otomatis disalin ke daftar tersimpan setelah menu berhasil disimpan. Pemakaian ulang membuat opsi menu dengan ID baru; perubahan pada menu tidak menyinkronkan salinan lain. Konfigurasi identik tidak menggandakan pintasan. Tombol tempat sampah di pintasan hanya menghapusnya dari daftar tersimpan, bukan dari menu atau riwayat pesanan. Menghapus opsi di panel menu tetap hanya melepasnya dari menu yang sedang diedit. Penghapusan pintasan langsung disimpan, termasuk bila form menu kemudian dibatalkan.

Kasir membuka tombol **Pilihan** di baris menu untuk mengubah ketersediaan secara langsung, tanpa akses mengubah nama, harga atau aturan. Perubahan ketersediaan ini langsung disimpan. Menu lama tetap tanpa opsi sampai pihak kafe menambahkannya.

Self-order dan POS menggunakan panel pilihan yang sama. Kombinasi dan catatan berbeda dipisahkan menjadi baris keranjang. Edit pilihan mengambil definisi terbaru. Harga saat checkout diverifikasi server; jika berubah, edit pilihan dan tinjau harga sebelum mengirim ulang.

Pilihan, label kelompok, harga tambahan, harga dasar dan resep disalin saat pemesanan. Pilihan tampil pada produksi, detail, pelacakan dan struk. Perubahan berikutnya tidak mengubah pesanan lama.

## Bahan dan stok

Setiap pilihan boleh memiliki resep **tambahan per satu menu** menggunakan bahan dan satuan stok yang sudah ada. Contoh: extra shot menambah 18 gram kopi; pesanan dua kopi dengan extra shot menambah 36 gram. Stok dipotong setelah pembayaran sesuai alur yang ada. Penolakan item mengembalikan resep yang disimpan pada pesanan, termasuk tambahan. Penanda per item dan transaksi dengan row lock mencegah pemotongan/pengembalian berulang.

Pilihan tanpa resep hanya instruksi produksi. Belum mendukung pengurangan/penggantian resep dasar (misalnya oat milk menggantikan susu atau less sugar mengurangi gula), pilihan bertingkat, dan kuantitas add-on. Gunakan pilihan bernama berbeda untuk single/double extra shot. Ketersediaan manual tetap menjadi kontrol operasional; sistem tidak melakukan reservasi stok saat masuk keranjang.

Pesanan lama tanpa snapshot mempertahankan perilaku resep lama. Bahan yang dipakai pilihan atau snapshot pesanan tidak dapat dihapus. Nonaktifkan pilihan yang habis; jangan menghapus riwayat.

## Migrasi dan deployment

1. Backup database target dengan prosedur deployment yang biasa digunakan.
2. Sebelum menjalankan backend baru, dari folder `backend` jalankan `npm run migrate:menu-options` dengan environment database target.
3. Migrasi menambah `option_groups`, `menu_option_groups`, `option_templates`, serta kolom `base_price`, `selected_options`, `stock_usage`, `stock_deducted`, `stock_refunded` pada `order_items`. Dapat dijalankan ulang. Tidak memasang opsi otomatis pada menu lama.
4. Restart backend lalu deploy frontend. Jangan aktifkan kelompok wajib sampai frontend baru tersedia di semua perangkat pemesanan.
5. Verifikasi menu biasa, menu beropsi, transaksi dan stok. Jika aplikasi perlu dikembalikan ke versi lama, nonaktifkan kelompok dahulu dan pertahankan tabel/kolom tambahan serta snapshot; jangan menghapus data opsi pesanan.

Migrasi ini dijalankan eksplisit, bukan `sync({ alter: true })` pada startup. Migrasi juga menyalin opsi yang sudah ada menjadi template tersimpan, serta menyediakan template awal Penyajian Ice/Hot. Template yang dihapus tidak dimunculkan lagi untuk konfigurasi identik. Database lokal telah dimigrasikan saat pengembangan; database hosting belum diubah.

## Pengujian

- `cd frontend` lalu `npm test` dan `npm run build`.
- `cd backend` lalu `npm test` untuk validasi aturan pilihan.
- Integrasi MySQL (PowerShell): `$env:KITKOP_OPTIONS_DB_TEST='true'; node --test tests/menuOptions.integration.test.js`.
- Integrasi membuat schema sementara `kitkop_options_test_<pid>`, menguji API/transaksi/stock, lalu menghapus schema tersebut. Akun MySQL memerlukan izin create/drop schema. Data operasional tidak dipakai.

Form menu menerima `option_groups` berupa array definisi opsi (atau JSON string pada multipart form). Backend menyimpan menu, opsi dan urutannya dalam satu transaksi. `GET /api/menus/:id/options` mengembalikan konfigurasi lengkap untuk owner/manajer/kasir; public API menu tetap menyembunyikan resep tambahan. `PATCH /api/menus/:id/options/:groupId/choices/:choiceId/availability` mengatur ketersediaan khusus menu. API kelompok dan `option_group_ids` lama dipertahankan untuk kompatibilitas, tanpa UI pengelolaan terpisah.

Item pesanan menerima `option_ids` dan `expected_price`; harga kiriman klien tidak menjadi sumber harga transaksi.

## Data menu publik dan staf (B01)

Daftar `GET /api/menus` dan detail `GET /api/menus/:id` selalu memakai representasi pelanggan, termasuk ketika request membawa JWT staf atau parameter `include`/`staff`. Representasi dibangun melalui whitelist di `backend/services/publicMenu.js`, tanpa menyebarkan object ORM atau metadata JSON pilihan:

- Menu: `id`, `category_id`, `name`, `description`, `price`, `image`, `is_available`.
- Kategori: `id`, `name`.
- Kelompok pilihan: `id`, `name`, `min_choices`, `max_choices`, `is_active`, dan `choices`, sesuai urutan menu.
- Pilihan: `id`, `name`, `price`, `is_available`, `is_default`.

Resep dasar/tambahan, stok bahan, relasi bahan baku, metadata/junction internal, dan field tambahan yang tidak diizinkan tidak dikirim. Field yang seharusnya scalar juga tidak meneruskan object/array bersarang. Endpoint detail tidak lagi melakukan join resep dasar. Menu tanpa opsi tetap memiliki `optionGroups: []`. Respons create/update menu memakai bentuk publik yang sama; pengelola memuat ulang data internal melalui endpoint staf.

Pemeriksaan seluruh pemakai frontend menemukan bahwa pelanggan mengedit pilihan keranjang melalui `menuAPI.getById`; POS memakai detail yang sama untuk mengedit pilihan. Keduanya hanya membutuhkan field publik di atas. Editor Manajemen Menu memakai `GET /api/menus/:id/options` untuk konfigurasi lengkap, sedangkan StockManagement memakai `GET /api/recipes` untuk resep dan stok bahan. Jalur staf tetap memerlukan JWT/sesi aktif dan mempertahankan izin yang sudah ada; endpoint opsi hanya untuk owner/manajer/kasir. Tidak ada endpoint staf baru atau perubahan izin resep pada perbaikan ini.

Perhitungan harga dan pemakaian stok pada server tetap mengambil resep lengkap dari database dan membuat snapshot pesanan seperti sebelumnya. Tidak ada migrasi database atau perubahan frontend yang diperlukan untuk B01.

Tes `publicMenu.test.js` dan `publicMenus.integration.test.js` memeriksa field internal secara rekursif, metadata JSON bersarang, daftar/detail anonim maupun ber-JWT, batas akses endpoint staf, edit opsi, serta pemotongan stok resep dasar + add-on setelah pembayaran. Regresi browser memakai API asli pada schema localhost sementara untuk edit pilihan pelanggan/POS serta pemuatan dan penyimpanan resep staf.

Daftar template: `GET /api/option-templates` dan `DELETE /api/option-templates/:id` (owner/manajer). Template adalah salinan independen, tanpa foreign key ke menu. Penghapusan menggunakan penanda agar penyimpanan menu berikutnya tidak memunculkan pintasan yang sama lagi.

`max_choices: 0` berarti tanpa batas jumlah pilihan yang tersedia; nilai 1 berarti pilih satu dan nilai positif lain adalah batas maksimal. Tidak memerlukan perubahan skema database.

Saat mengedit **Maksimal dipilih**, kolom boleh kosong sementara tanpa mengaktifkan **gaada maksimalnya** atau mengunci input. Kolom wajib diisi angka bulat 2–30 ketika batas maksimal aktif. Nilai kosong, 0, atau 1 yang diketik tidak mengubah mode dan harus diperbaiki sebelum menu disimpan; gunakan checkbox untuk tanpa batas atau **Cara memilih** untuk pilih satu.
