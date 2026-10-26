# Catatan maintenance dan cleanup Kitkop

Diperbarui 27 Oktober 2026 (Asia/Jakarta). Dokumen ini merangkum hasil pekerjaan; rincian historis sebelum peringkasan tersedia di riwayat Git. Angka pengujian lama bukan hasil pemeriksaan baru.

## Status repository

- Aset starter, logo duplikat, preview suara, referensi Midtrans, dan dependency yang tidak dipakai sudah dihapus. Logo PNG aktif serta notifikasi Web Audio dipertahankan.
- Proyek video lokal, panduan video, rancangan `kitkop.md`, SQL troubleshooting lama, dan tool ngrok lokal sudah dihapus.
- Backup dikeluarkan dari pelacakan Git dan diabaikan melalui `.gitignore`. Salinan `database/local_backup.sql` tetap dipertahankan; backup lama masih dapat ada di riwayat Git.
- Source aplikasi, tes, upload, environment, lockfile, schema historis, dan migrasi tetap dipertahankan.

## Pembersihan 27 Oktober 2026

- Menghapus `database/dummy_orders.sql`, `database/realistic_seed.sql`, dan `database/insert_users.sql`. Ketiganya seed demo manual, tidak dijalankan otomatis dan tidak dirujuk source aplikasi atau tes.
- Memperbarui [panduan SQL](../database/README.md) agar sesuai dengan berkas yang tersisa.
- Membersihkan hasil build lokal `frontend/dist/` yang diabaikan Git dan dapat dibuat ulang.
- Meringkas catatan cleanup ini. Perubahan script Vite yang sebelumnya sudah ada di `frontend/package.json` tidak disertakan dalam commit cleanup.

Tidak ada SQL dijalankan dan tidak ada data database operasional diubah.

Validasi cleanup: 13 tes frontend lulus, ESLint `--max-warnings=0` lulus, dan build production berhasil dengan output sementara di TEMP. Pemeriksaan referensi tidak menemukan pemakaian ketiga seed di source aplikasi atau tes. Build awal diblokir izin baca esbuild dalam sandbox; pengulangan di luar sandbox berhasil. Tes integrasi database tidak dijalankan ulang karena perubahan hanya menghapus seed manual dan merapikan dokumentasi.

## Maintenance sebelumnya

Dependency yang tidak digunakan dan script Snap Midtrans telah dibuang; lint, lifecycle request/socket, dan pemuatan halaman dirapikan. Halaman memakai lazy loading dan chart laporan memiliki chunk terpisah. Migrasi settings memakai fungsi bersama yang melengkapi default tanpa menimpa konfigurasi tersimpan dan menghentikan startup bila migrasi gagal. Alias `/api/report` dan `/api/reports` dipertahankan.

Audit statis 23 Oktober menemukan seluruh modul frontend terhubung. `backend/migrations/update-order-item-status.js` dipertahankan sebagai migrasi manual instalasi lama. Saat itu tidak ditemukan duplikasi isi persis pada berkas tracked yang diperiksa (lockfile dikecualikan), artefak lokal yang ikut tracked, atau tautan Markdown relatif yang rusak.

## Validasi dan batas pemeriksaan

Validasi historis pada penyelesaian maintenance: 177 tes backend dan 13 tes frontend lulus, lint tanpa error/warning, build production berhasil, dan audit dependency tanpa advisory pada saat pemeriksaan. Perbaikan keamanan berikutnya menambahkan pengujian; lihat [laporan keamanan](security-review-2026-10-18.md) untuk hasil dan status masing-masing temuan.

Pada Windows, launcher npm pernah gagal karena path proyek mengandung `&`. Entry Node langsung dapat dipakai untuk menjalankan Vite dan ESLint.

Konfigurasi TLS aplikasi telah diperbaiki, tetapi verifikasi provider menunggu hosting aktif. Endpoint simulasi pembayaran masih mengikuti keputusan pengembangan sebelumnya; rotasi kredensial hosting lama belum dilakukan. Hasil tes lokal dan audit dependency tidak menyatakan seluruh deployment aman.

## Panduan operasional

- [README utama](../README.md): startup, migrasi, pengujian, dan deployment.
- [README frontend](../frontend/README.md): build dan pengelolaan cache/chunk saat deployment.
- [Operasi database](database-operations.md): setup database baru, migrasi, dan TLS.
- [Panduan SQL administratif](../database/README.md): fungsi schema dan skrip upgrade lama.

Jalankan instalasi sesuai lockfile pada mesin build/deployment. Pertahankan aset chunk versi sebelumnya selama transisi cache dan simpan upload pada storage persisten.
