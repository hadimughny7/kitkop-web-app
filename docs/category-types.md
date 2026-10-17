# Jenis kategori menu (A07)

Setiap kategori menyimpan `item_type`: `makanan`, `minuman`, atau `snack`. Pengelola memilih jenis pada **Manajemen Menu & Kategori → Kelola Kategori** saat menambah atau mengedit kategori. API kategori mewajibkan jenis valid saat create; update tanpa field tersebut mempertahankan nilai lama. Perubahan nama tidak mengubah jenis secara otomatis.

Saat pesanan QR/POS dibuat, server menyalin jenis kategori ke `OrderItem.item_type`. ID kategori, nama kategori dan jenis yang dikirim klien tidak menentukan jenis item. Perubahan jenis kategori hanya berlaku bagi order baru; seluruh snapshot item pesanan lama tetap sama, termasuk yang mungkin salah sebelum perbaikan.

## Migrasi

Startup backend menjalankan `add-category-item-types.js` sebelum menerima request. Skrip menambah kolom nullable pada database lama dan memetakan nama bawaan yang dikenal secara persis (abaikan kapitalisasi/spasi luar):

| Nama kategori lama | Jenis |
| --- | --- |
| Coffee (Espresso Based), Manual Brew, Non-Coffee, Minuman | minuman |
| Pastry & Bakery, Main Course, Makanan | makanan |
| Snack | snack |

Tidak ada pemetaan berdasarkan ID. Nilai yang sudah ditentukan pengelola tidak ditimpa ketika migrasi diulang. Nama lama yang belum dikenal dibiarkan `NULL` dan ID-nya dilaporkan agar pengelola memilih jenis melalui UI. Daftar kategori menampilkan **Belum ditentukan**; order yang memakai kategori tersebut ditolak HTTP 409 tanpa meninggalkan data sebagian. Kolom nullable sengaja dipakai agar migrasi tidak mengarang klasifikasi kategori yang ambigu.

Pemeriksaan baca-saja sebelum deploy, dari folder `backend`:

```powershell
node migrations/add-category-item-types.js --audit
```

Audit mengembalikan `item_type` saat ini dan `proposed_type`, bahkan sebelum kolom baru dibuat. Untuk migrasi manual:

```powershell
npm.cmd run migrate:category-types
```

Deploy backend dan frontend bersama lalu restart backend agar migrasi berjalan. Periksa kategori yang belum diatur sebelum menggunakannya untuk pemesanan. Schema dan seed SQL baru sudah mencantumkan jenis eksplisit; pada database lama, jalankan migrasi sebelum memakai seed baru. Jangan menjalankan ulang seed pada database operasional untuk melakukan migrasi.

## Validasi

Tes integrasi mencakup Makanan dengan ID 1, Snack dengan ID 73, kategori baru dari Owner/Manajer, role tanpa izin, API dengan jenis tidak valid, skema lama, migrasi berulang, perubahan nama/jenis, order QR/POS, alur pembayaran/produksi, rollback kategori belum diatur, serta snapshot pesanan lama yang tidak berubah. Mutasi memakai schema MySQL lokal sementara yang dihapus setelah tes.
