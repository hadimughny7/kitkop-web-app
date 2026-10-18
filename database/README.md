# Berkas SQL administratif

Berkas di sini disimpan untuk riwayat setup, seed demo, dan pemeliharaan instalasi lama. Tidak ada SQL dalam folder ini yang dijalankan otomatis oleh aplikasi.

| Berkas | Status dan penggunaan |
| --- | --- |
| `schema.sql` | Schema/seed historis. Belum memuat seluruh kolom model sekarang; tidak menjadi bootstrap lengkap instalasi baru. Memuat akun demo dengan password yang diketahui. |
| `realistic_seed.sql`, `dummy_orders.sql`, `insert_users.sql` | Seed demo/manual. Tinjau target, relasi ID, dan isi sebelum dipakai; jangan impor ke data operasional secara otomatis. |
| `query.sql` | Troubleshooting untuk ID pesanan tertentu, bukan migrasi/setup. |
| `fix.sql` | Koreksi historis berdasarkan ID kategori lama. Jangan dipakai pada klasifikasi sekarang yang mengikuti nama kategori. |
| `alter_orders.sql`, `backfill.sql`, `migration_*.sql` | Skrip upgrade/manual instalasi lama. Periksa struktur dan kebutuhan database target sebelum menjalankan. |

Migrasi aplikasi aktif berada di `backend/migrations/`. Panduan [operasi database](../docs/database-operations.md) menjelaskan setup lokal baru, startup, dan batas kompatibilitas. Seed lama tidak diperlukan agar aplikasi berjalan; menu/meja dapat dibuat melalui UI setelah akun Owner tersedia.

`local_backup*.sql` dan direktori backup lokal diabaikan Git. Salinan lokal tetap menjadi tanggung jawab pengelola; gunakan storage backup dengan akses terbatas untuk data operasional. Jangan menyimpan kredensial baru dalam SQL atau source.
