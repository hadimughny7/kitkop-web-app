# PROJECT CONTEXT — Sistem Informasi Pemesanan Menu Terintegrasi POS, Cafe Kitkop

## Latar Belakang
Implementasi skripsi: "Perancangan Sistem Informasi Pemesanan Menu yang Terintegrasi Point of Sale (POS) pada Cafe Kitkop". Pendekatan: Object Oriented (UML), metode pengembangan: Prototype.

Stack: React.js (frontend) + Node.js/Express.js (backend, RESTful API) + MySQL (database).

## Aktor & Hak Akses

### Customer (tanpa login)
- Akses via scan QR meja, tanpa autentikasi
- Sebelum mulai pesan, wajib isi: **Nama** (wajib), **No. Telepon** (wajib), **Email** (opsional)
- Data ini disimpan sebagai identitas pemesan pada order (untuk riwayat & laporan), bukan akun

### Staff (login wajib, role-based)
- **Kasir** — input pesanan manual (walk-in), kelola transaksi
- **Barista** — terima & proses pesanan minuman
- **Kitchen** — terima & proses pesanan makanan
- **Manajer** — monitoring, kelola laporan (import/export), kelola akun staff (CRUD user & role)
- **Owner** — monitoring keseluruhan + kelola akun staff (CRUD user & role), akses penuh seperti manajer

Autentikasi: JWT-based login (email/username + password). Setelah login, akses menu sesuai role (role-based access control / middleware per endpoint).

## Modul Inti

### 1. Autentikasi & Manajemen Akun
- Login khusus staff (kasir, barista, kitchen, manajer, owner) — email/username + password
- Customer tidak memiliki akun/login
- **Owner & Manajer** dapat:
  - Membuat akun staff baru (nama, email, password, role)
  - Mengedit/menghapus akun staff
  - Mengatur/mengubah role staff (kasir/barista/kitchen/manajer)
  - Melihat daftar seluruh akun staff
- Halaman "Manajemen Pengguna" hanya muncul untuk role owner & manajer

### 2. Pemesanan via QR Code (Customer)
- Setiap meja punya QR unik (encode nomor meja, mis. `/order?table=A12`)
- Scan QR → landing "Selamat datang" → form identitas pelanggan: **Nama** (wajib), **No. Telepon** (wajib), **Email** (opsional) → tampilkan nomor meja → tombol "Lihat Daftar Menu"
- Halaman menu: kategori (Semua/Makanan/Minuman/Snack), search, kartu menu dengan harga & tombol tambah (+)
- Keranjang per meja: list item, qty +/-, catatan opsional, subtotal, pajak (10%), total
- Checkout → halaman Pembayaran: ringkasan pesanan (nama pelanggan, meja, jumlah item, subtotal, pajak, total), QRIS only via TokoPay, tombol "Saya Sudah Bayar"

### 3. Manajemen Stok Bahan Baku
- Dashboard ringkasan: total bahan baku, stok kritis, jumlah resep aktif, status auto deduction
- Tabel bahan baku: nama, kategori, stok saat ini, satuan, minimum stok, status (Aman/Menipis/Kritis)
- Relasi Menu ↔ Bahan Baku (resep): setiap menu memiliki komposisi bahan baku + takaran
- **Auto deduction**: saat order dibuat, stok bahan baku otomatis terpotong sesuai resep
- Riwayat perubahan stok (log: pengurangan otomatis, restock manual)
- Filter & search bahan baku

### 4. Penerimaan Pesanan (Kitchen/Barista) — login required
- Dashboard real-time: jumlah pesanan masuk, diproses, siap diantar
- Tab status: Masuk → Diproses → Selesai
- Setiap pesanan: nomor order, nomor meja, nama pelanggan, daftar item + catatan, waktu masuk
- Aksi: Tolak / Terima / Diproses → update status realtime ke pelanggan
- Indikator koneksi & waktu sinkronisasi terakhir

### 5. Pembayaran (QRIS via TokoPay)
- TokoPay (https://tokopay.id, docs: https://docs.tokopay.id) — payment gateway agregator Indonesia, QRIS dynamic, callback/webhook realtime
- Generate order QRIS via `GET https://api.tokopay.id/v1/order` dengan parameter: `merchant`, `secret`, `ref_id`, `nominal`, `metode=QRIS`
- Signature = MD5(merchant_id + ref_id + secret) — sesuaikan dengan dokumentasi resmi saat implementasi
- Response berisi qris_content (untuk render QR) dan invoice/trx_id (untuk tracking)
- Status pembayaran via callback/webhook (validasi signature) atau polling: Pending → Paid → Expired/Failed
- Simpan merchant_id, secret_key, base_url di .env

### 6. Kasir (POS) — login required
- Input pesanan manual untuk pelanggan walk-in
- Kelola transaksi, terhubung ke stok & laporan

### 7. Laporan (Manajer & Owner) — login required, dengan filter periode
- **Laporan Pesanan**: filter per hari, per minggu, per bulan, per tahun (atau rentang tanggal custom)
  - Jumlah order, total penjualan, item terlaris, breakdown status
- **Laporan Stok**: filter per hari, per minggu, per bulan, per tahun
  - Pergerakan stok (masuk/keluar), auto deduction vs restock manual, item kritis
- Export laporan ke Excel/CSV
- Import data (restock stok / data pesanan historis) via Excel/CSV
- Dashboard monitoring terpusat dengan grafik tren per periode

## Entitas Data Utama (acuan ERD, MySQL)
- `users` (id, name, email, password_hash, role: kasir/barista/kitchen/manajer/owner, created_by, created_at)
- `customers` (id, name, phone, email[nullable]) — identitas pemesan, terikat ke order, tanpa akun/password
- `tables` (id, table_number, qr_code_url)
- `menu_categories` (id, name)
- `menus` (id, category_id, name, description, price, image, is_available)
- `raw_materials` (id, name, category, stock, unit, min_stock, status)
- `menu_recipes` (id, menu_id, raw_material_id, quantity_used)
- `orders` (id, table_id, customer_id[nullable utk kasir], order_number, status, subtotal, tax, total, order_type[qr/kasir], created_at)
- `order_items` (id, order_id, menu_id, qty, price, notes)
- `order_status_logs` (id, order_id, status, changed_by[user_id], changed_at)
- `transactions` (id, order_id, ref_id, amount, payment_method, status, paid_at)
- `stock_logs` (id, raw_material_id, change_qty, type[auto_deduction/restock/manual], reference_order_id, created_by, created_at)

## Catatan Implementasi
- Customer: tanpa autentikasi, identitas via form (nama wajib, no. telp wajib, email opsional) disimpan tiap kali order
- Staff: login JWT, RBAC middleware per endpoint sesuai role
- Owner & Manajer: akses penuh ke modul "Manajemen Pengguna" (CRUD user, assign role)
- Update status pesanan & stok realtime via Socket.io
- Pajak 10% pada subtotal
- Pembayaran QRIS-only via TokoPay, dynamic QR per transaksi
- Endpoint laporan mendukung parameter `period=daily|weekly|monthly|yearly` atau `start_date`/`end_date`
- Index pada kolom tanggal (`created_at`/`order_date`) untuk performa filter laporan