# Operasi database

Server web tidak menyediakan endpoint impor database atau endpoint debug environment. Impor SQL harus dilakukan secara manual oleh administrator yang memiliki akses database, melalui klien MySQL atau sarana administrasi hosting. Jangan membuat proses impor dapat dipanggil melalui HTTP.

Koneksi aplikasi membaca konfigurasi dari environment melalui `backend/config/database.js`: `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, `DB_PASSWORD`, dan `DB_SSL` jika digunakan. File `.env` sudah diabaikan Git. Jangan menaruh password atau URL koneksi berisi password dalam source code maupun log/respons API.

## Kredensial yang pernah terekspos

Password database yang dulu tercantum di route debug harus dianggap terekspos, termasuk di riwayat commit. Menghapus kode dan melakukan push tidak mencabut password tersebut.

Administrator hosting perlu mengganti password database target, memperbarui environment aplikasi yang menggunakan kredensial tersebut, lalu restart/deploy dan memverifikasi koneksi aplikasi. Gunakan prosedur rotasi dari penyedia database agar perubahan password dan konfigurasi aplikasi terkoordinasi. Jangan mengganti password MySQL lokal jika yang terekspos adalah database hosting yang berbeda.

Rotasi kredensial hosting belum dilakukan dari workspace ini karena tidak tersedia koneksi administratif ke pengaturan hosting. Riwayat Git juga belum ditulis ulang; rotasi tetap diperlukan meskipun riwayat nantinya dibersihkan.

## Pengujian F17

Jalankan `KITKOP_OPTIONS_DB_TEST=true` bersama tes backend sesuai shell yang digunakan. `tests/serverSecurity.integration.test.js` menjalankan server asli dengan database sementara dan memastikan health/menu tetap tersedia, akses auth tetap dilindungi, serta `/api/run-import` dan `/api/env-debug` menghasilkan 404.

Tes memeriksa bahwa route impor tidak ada sebelum mengirim request ke alamatnya. Jika route lama muncul lagi, tes berhenti sebelum request agar tidak berisiko mengeksekusi impor. Tidak ada SQL backup yang diimpor saat tes.
