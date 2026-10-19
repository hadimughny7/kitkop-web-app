# Validasi input pembuatan pesanan (B03)

`POST /api/orders` memvalidasi seluruh body melalui `backend/services/orderInput.js` sebelum membuka transaksi atau menulis data. Validasi berlaku untuk pelanggan tanpa akun dan pesanan POS staf; tidak mengubah aturan autentikasi yang sudah ada.

| Field | Format |
| --- | --- |
| Body | Object JSON, bukan null/array/primitive. |
| `customer_name` | Teks tidak kosong/berisi spasi saja, maksimal 100 karakter. |
| `customer_phone`, `customer_email` | Tetap opsional: boleh tidak dikirim, null, atau string kosong. Bila dikirim harus teks, maksimal 20/100 karakter sesuai kolom database. Ini bukan verifikasi kepemilikan kontak atau kebijakan format email baru. |
| `order_type` | `qr` atau `kasir`; tidak dikirim/null/string kosong mempertahankan default `qr`. |
| `table_id` | Opsional/null, atau ID positif yang valid. Keberadaan/status aktif meja tetap diperiksa pada database. |
| `items` | Array tidak kosong; setiap elemen harus object, termasuk item kedua dan seterusnya. |
| `items[].menu_id` | ID integer positif dalam rentang kolom INT; angka atau string digit tetap didukung. |
| `items[].qty` | Angka integer 1–999; string, boolean dan pecahan ditolak seperti aturan sebelumnya. |
| `items[].option_ids` | Jika dikirim, array ID pilihan string yang valid dan unik, maksimal 1000. Kecocokan pilihan dengan menu tetap diverifikasi server. |
| `items[].notes` | Opsional/null atau teks; batas mengikuti kapasitas kolom TEXT, 65.535 byte UTF-8. |
| `items[].expected_price` | Opsional; bila dikirim mengikuti validasi nominal nonnegatif/finite/dua desimal yang sudah digunakan sistem. Harga aktual tetap dihitung dari menu dan add-on database. |

Input malformed yang terdeteksi mendapat HTTP 400 dengan `success: false` dan pesan field/item yang perlu diperbaiki. Contoh `items: [null]` mendapat pesan item ke-1 harus berupa object valid. Tidak ada customer, order, item, transaksi, counter, log atau event pesanan yang ditulis/dikirim.

Pemeriksaan terkait database—menu ada/tersedia, pilihan wajib, kepemilikan add-on, harga terbaru, serta nominal total—dilakukan sebelum membuat customer. Konflik harga tetap 409; meja tidak ada/nonaktif tetap mengikuti respons sebelumnya. Error SQL/server yang tidak terduga tidak diubah menjadi 400 dan tetap mengikuti penanganan error/rollback.

Nama/kontak tidak dijadikan bukti identitas. Customer tetap dibuat terpisah per order valid. Format nomor pesanan, capability tracking/pembayaran, perhitungan harga/pajak, pembayaran tunai/QRIS dan snapshot resep/pemotongan stok tetap mengikuti alur yang ada. Tidak diperlukan perubahan frontend atau migrasi database.

## Pengujian

`tests/orderInput.test.js` menguji body, item, tipe/ukuran field, serta kompatibilitas input valid tanpa mutasi object input. `tests/orderInput.integration.test.js` menjalankan route dan error handler asli pada schema MySQL localhost sementara. Tes memantau percobaan SQL INSERT/UPDATE/DELETE/REPLACE, memeriksa semua record/counter/stok/event tetap sama pada request gagal, serta memeriksa order tamu/POS, pilihan, harga, tracking, dan pemotongan stok setelah pembayaran. Fixture dihapus setelah selesai; tidak ada transaksi pembayaran nyata.
