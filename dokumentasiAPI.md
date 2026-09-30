# Dokumentasi API KuyzPay

Integrasikan pembayaran QRIS, cek status transaksi, dan terima notifikasi webhook menggunakan `merchant_id`, `secret`, serta `ref_id`.

## Base URL

```bash
https://api.kuyzpay.xyz/api/v1
```

Ganti domain contoh dengan domain instalasi KuyzPay Anda. Produksi wajib memakai HTTPS.

## Authentication

Setiap akun KuyzPay memiliki satu merchant/nama toko. Merchant ID dipakai bersama, sedangkan Sandbox dan Live mempunyai `secret`, webhook, whitelist IP, serta riwayat transaksi yang terpisah. Simpan secret hanya di server.

| Field | Keterangan |
| --- | --- |
| `merchant_id` | ID merchant dari dashboard |
| `secret` | Secret API merchant |
| `signature` | Opsional: MD5 dari `merchant_id:secret:ref_id` |

> **Keamanan:** jangan mencatat secret, OTP, token koneksi, atau payload autentikasi ke log aplikasi.

## Sandbox dan Live

Pilih environment melalui switcher Dashboard. Endpoint API tetap sama, tetapi gunakan Secret Key dari environment yang dipilih. Jika memakai signature, kirim `environment` bernilai `sandbox` atau `live`; jika memakai secret, KuyzPay mengenali environment dari secret tersebut.

### Pengujian tanpa uang

Membuat QR simulasi dan otomatis berubah menjadi `Success` sekitar 10 detik. Tidak memakai akun pembayaran nyata.

1. Pilih Sandbox di sidebar.
2. Salin Secret Key Sandbox.
3. Buat order melalui API/Playground.
4. Polling status atau tunggu webhook Sandbox.

### Pembayaran sebenarnya

Membuat QRIS sesuai jumlah final, menerima uang ke pemilik QRIS, lalu mencocokkan transaksi provider berdasarkan nominal, waktu, dan ID provider.

1. Pilih Live di sidebar.
2. Pastikan merchant disetujui dan akun pembayaran siap.
3. Gunakan Secret Key Live.
4. Lakukan pembayaran sesuai `total_bayar`.

> **Penting:** jangan membayar QRIS Sandbox. Sebelum mengaktifkan Live, pastikan akun pembayaran masih Terhubung dan webhook merchant sudah diisi.

### Masa sesi akun pembayaran

Koneksi akun pembayaran menggunakan access token yang disimpan terenkripsi di server, bukan cookie browser pengguna. Masa berlakunya ditentukan provider dan tidak selalu menyertakan tanggal expiry. KuyzPay memvalidasi token berkala, menyimpannya agar tetap tersedia setelah restart, mencoba refresh otomatis jika refresh token tersedia, dan menandai akun **Belum login** jika provider menolak sesi. Selesaikan OTP ulang hanya ketika status tersebut muncul.

> **Jika sesi akun pembayaran terputus:** KuyzPay menolak order Live baru dengan HTTP `503` dan `error_code: PROVIDER_AUTH_REQUIRED`. Permintaan ulang dengan `ref_id` yang sudah pernah dibuat tetap mengembalikan order lama. Order aktif/terlambat tetap dipantau setelah sesi dipulihkan.

## Kompatibilitas dan alias parameter

KuyzPay menyediakan nama parameter utama dan beberapa alias alternatif untuk mempermudah migrasi integrasi. Endpoint utama tersedia pada `/api/v1/*`; integrasi lama dapat memakai alias terbatas `/v1/order`, `/v1/check-order`, `/v1/merchant`, dan `/v1/merchant/balance`. Alias order mengembalikan `status: "Success"`, sedangkan endpoint asli mempertahankan envelope KuyzPay `status: 1`.

| Fungsi | KuyzPay | Alias alternatif |
| --- | --- | --- |
| ID merchant | `merchant_id` | `merchant` |
| Referensi order | `ref_id` | `reff_id` |
| Nominal | `amount` | `nominal` |
| Channel | `channel` | `kode_channel` atau `metode` |

Simple Order dapat memakai `secret`. Advanced Order dapat menggantinya dengan `signature = md5(merchant_id:secret:ref_id)`, sehingga secret tidak dikirim di body. `ref_id` bersifat idempotent: pengulangan request mengembalikan order lama.

> Perbedaan yang disengaja: error memakai HTTP 400/401/403/404/409/503, bukan selalu HTTP 500. Secret di query GET juga dinonaktifkan pada produksi secara default. KuyzPay menambahkan `unique_code`, `payment_reference`, dan informasi environment.

## Metode Pembayaran

### QRIS Platform

Metode bawaan untuk merchant baru. KuyzPay membuat QRIS sesuai nominal dan memverifikasi status pembayarannya.

### QRIS Merchant

Tersedia untuk akun Premium. Merchant dapat menggunakan akun pembayaran miliknya sendiri untuk menerima transaksi.

| Channel request | Keterangan |
| --- | --- |
| `QRIS` | Gunakan untuk semua order QRIS. KuyzPay menentukan sumber pembayaran berdasarkan environment dan konfigurasi merchant. |

### Channel pada response

| Nilai | Keterangan |
| --- | --- |
| `QRIS_SANDBOX` | Order simulasi menggunakan Secret Key Sandbox. |
| `QRIS_ADMIN` | Order Live menggunakan QRIS Platform. |
| `QRIS_MERCHANT` | Order Live Premium menggunakan akun pembayaran merchant sendiri. |

> **Gunakan `QRIS` pada request.** Nilai channel pada response adalah hasil pemilihan otomatis oleh KuyzPay dan tidak perlu ditentukan oleh integrator.

### Biaya transaksi

| Akun dan sumber pembayaran | Pilihan biaya |
| --- | --- |
| Free · QRIS Platform | **1%** + kode unik |
| Premium · QRIS Platform | **0,7%**: saldo menerima nominal pokok. **1%**: saldo menerima nominal pokok + profit 0,3%. |
| Premium · akun pembayaran sendiri | **0%**, **0,7%**, atau **1%**. Dana dan pemotongan provider berlangsung langsung pada akun tersebut. |
| Sandbox | **0%** |

> Biaya dipilih pemilik merchant melalui Dashboard Live dan dihitung oleh server. Parameter biaya dari request order diabaikan. Pada QRIS Platform Premium dengan biaya 1%, `total_diterima` mencakup nominal pokok dan profit member 0,3%.

### Alur pemrosesan KuyzPay

1. **Pembuatan tagihan:** QRIS sumber divalidasi, diubah menjadi QRIS dinamis, diberi nominal final, lalu CRC dihitung ulang.
2. **Rekonsiliasi:** transaksi masuk pada akun pembayaran yang terhubung dicocokkan menggunakan nominal final dan rentang waktu order.
3. **Konfirmasi:** satu transaksi provider hanya dapat diklaim oleh satu order. Status diperbarui secara atomik sebelum webhook dikirim.

> **Aturan nominal:** minimum transaksi Rp100. Biaya mengikuti paket dan sumber pembayaran yang aktif pada merchant. Transaksi Live memakai kode unik kecil Rp0–Rp50 untuk mencegah bentrok nominal aktif pada akun pembayaran yang sama.

> **Batasan QRIS:** pembatalan API tidak dapat mencabut gambar QRIS yang sudah disimpan pelanggan. KuyzPay menghentikan penayangan QR, mempertahankan reservasi nominal, dan tetap memantau pembayaran terlambat selama jendela rekonsiliasi.

> **Masa berlaku transaksi:** expiry dan pembatalan menghentikan invoice di KuyzPay. Pembayaran yang diterima setelah batas waktu tetap direkonsiliasi dan dilaporkan sebagai pembayaran terlambat.

> **Aliran dana:** channel `QRIS_MERCHANT` masuk langsung ke akun merchant. Channel `QRIS_ADMIN` masuk ke akun platform, lalu nominal pokok beserta profit Premium yang berlaku dikreditkan secara idempoten ke saldo member. Member mengajukan pencairan ke bank atau e-wallet, lalu Admin menyelesaikan permintaan setelah transfer terkonfirmasi.

## GET Membuat Order Sederhana

`GET /api/v1/order`

`ref_id` wajib unik per merchant dan environment. Nilai yang sama boleh dipakai sekali di Sandbox dan sekali di Live. Pengulangan pada environment yang sama mengembalikan order lama. Untuk produksi, gunakan signature pada GET agar Secret Key tidak tersimpan di URL/access log; alternatif yang direkomendasikan adalah POST JSON.

```bash
curl -G "https://api.kuyzpay.xyz/api/v1/order" \
  --data-urlencode "merchant=KPXXXXXXXX" \
  --data-urlencode "environment=live" \
  --data-urlencode "signature=MD5_MERCHANT_SECRET_REF" \
  --data-urlencode "ref_id=ORDER-001" \
  --data-urlencode "nominal=25000" \
  --data-urlencode "metode=QRIS"
```

## POST Membuat Order Advanced

`POST /api/v1/order`

| Parameter | Tipe | Wajib | Keterangan |
| --- | --- | --- | --- |
| `merchant_id` | string | Ya | ID merchant |
| `secret` | string | Ya | Secret API |
| `ref_id` | string | Ya | Referensi unik milik aplikasi Anda |
| `amount` | integer | Ya | Nominal dalam Rupiah |
| `channel` | string | Tidak | Default `QRIS` |
| `customer_name` | string | Tidak | Nama pelanggan |
| `customer_email` | string | Tidak | Email pelanggan |
| `customer_phone` | string | Tidak | Nomor pelanggan |
| `redirect_url` | HTTPS URL | Tidak | Tujuan setelah pembayaran |
| `webhook_url` | HTTPS URL | Tidak | Callback khusus order |
| `expire_minutes` | integer | Tidak | 1–1440, default 15 menit |
| `expired_ts` | Unix timestamp | Tidak | Waktu kedaluwarsa absolut; `0` memakai default |
| `items` | array | Tidak | Metadata produk tambahan, maksimal 100 item |

```bash
curl -X POST "https://api.kuyzpay.xyz/api/v1/order" \
  -H "Content-Type: application/json" \
  -d '{
    "merchant_id": "KPXXXXXXXX",
    "reff_id": "ORDER-001",
    "amount": 25000,
    "kode_channel": "QRIS",
    "signature": "MD5_MERCHANT_ID_SECRET_REF_ID",
    "customer_name": "Budi",
    "redirect_url": "https://toko.example/sukses",
    "webhook_url": "https://toko.example/webhook"
  }'
```

### Response sukses

```json
{
  "status": 1,
  "rc": 200,
  "data": {
    "trx_id": "KP260828ABC123",
    "ref_id": "ORDER-001",
    "pay_url": "https://domain-kuyzpay.com/pay/KP260828ABC123",
    "qr_link": "https://domain-kuyzpay.com/pay/KP260828ABC123/qr",
    "qr_string": "000201010212...6304ABCD",
    "total_bayar": 25292,
    "total_diterima": 25075,
    "admin_fee": 250,
    "fee_percent": 1,
    "member_profit": 75,
    "platform_fee": 175,
    "unique_code": 42,
    "channel": "QRIS_ADMIN",
    "payment_source": "platform_qris",
    "environment": "live",
    "auto_paid_after_seconds": null,
    "status": "Unpaid",
    "expired_at": "2026-08-28 10:15:00",
    "expired_ts": 1787886900,
    "late_payment_monitor_until": "2026-08-29 10:15:00"
  }
}
```

> Tampilkan `pay_url` kepada pelanggan atau render `qr_string` sendiri. Nilai `total_bayar` adalah jumlah final yang harus dibayar. Jika `redirect_url` diisi, hosted checkout mengarahkan pelanggan ke URL tersebut sekitar 2,5 detik setelah pembayaran sukses.

> **Alias channel:** `QRIS`, `QRISREALTIME`, dan `QRIS_REALTIME_NOBU` diterima sebagai QRIS. Respons tetap menunjukkan sumber pembayaran KuyzPay melalui `channel` dan `payment_source`.

## POST Cek Status Order

`POST /api/v1/check-order`

Gunakan `trx_id` (direkomendasikan) atau `ref_id`. Hentikan polling setelah status terminal.

```bash
curl -X POST "https://api.kuyzpay.xyz/api/v1/check-order" \
  -H "Content-Type: application/json" \
  -d '{"merchant_id":"KPXXXXXXXX","secret":"YOUR_SECRET","trx_id":"KP260828ABC123"}'
```

```json
{
  "status": 1,
  "rc": 200,
  "message": "Data Found",
  "data": {
    "trx_id": "KP260828ABC123",
    "reff_id": "ORDER-001",
    "merchant_id": "KPXXXXXXXX",
    "nominal": 25000,
    "jumlah_bayar": 25042,
    "jumlah_diterima": 25000,
    "unique_code": 42,
    "environment": "live",
    "status": "Success",
    "payment_method": "QRIS",
    "payment_reference": "PROVIDER-TRANSACTION-ID",
    "created_at": "2026-08-28 10:00:00",
    "paid_at": "2026-08-28 10:03:27",
    "expired_at": "2026-08-28 10:15:00",
    "cancelled_at": "",
    "cancel_reason": "",
    "late_paid_at": "",
    "late_payment_monitor_until": "2026-08-29 10:15:00"
  }
}
```

> Polling halaman pembayaran disarankan setiap 5–10 detik. Webhook tetap menjadi sumber utama untuk memperbarui order internal Anda.

## POST Batalkan Order

`POST /api/v1/cancel-order`

Endpoint ini idempotent. Gunakan ketika timer order pada aplikasi Anda habis atau pelanggan membatalkan checkout. KuyzPay mengubah order `Unpaid` menjadi `Cancelled`, berhenti menampilkan QR, dan mengirim event `payment.cancelled`.

```bash
curl -X POST "https://api.kuyzpay.xyz/api/v1/cancel-order" \
  -H "Content-Type: application/json" \
  -d '{
    "merchant_id": "KPXXXXXXXX",
    "secret": "YOUR_SECRET",
    "trx_id": "KP260828ABC123",
    "reason": "Timer checkout pelanggan habis"
  }'
```

Anda boleh mengganti `trx_id` dengan `ref_id`/`reff_id`. Autentikasi juga dapat memakai `signature = md5(merchant_id:secret:ref_id)`. Request ulang terhadap order yang sudah `Cancelled` tetap menghasilkan HTTP 200. Order yang sudah menerima pembayaran menghasilkan HTTP 409.

### Pembayaran setelah cancel/expired

1. Jangan hapus relasi `trx_id`/`ref_id` dari database aplikasi Anda ketika timer habis.
2. Tandai order internal sebagai expired/cancelled dan panggil endpoint cancel.
3. Jika foto QR lama dibayar, KuyzPay mengubah status menjadi `PaidLate` dan mengirim `payment.late`.
4. Handler Anda harus mencatat dana tersebut lalu memilih kebijakan: aktifkan pesanan, masukkan saldo pelanggan, refund manual, atau minta pemeriksaan admin.

> **Jangan abaikan `payment.late`.** Event ini berarti dana benar-benar terdeteksi pada akun penerima meskipun checkout aplikasi sudah berakhir. Jendela bawaan adalah 24 jam setelah `expired_at` dan dapat diatur server melalui `LATE_PAYMENT_MONITOR_MS`.

### Pembatalan oleh pembayar

Hosted checkout menampilkan tombol **Batalkan pembayaran** jika link memiliki token pembatalan yang sah, pengguna merupakan pemilik invoice Premium yang sedang login, atau pengguna adalah Admin. Token disertakan otomatis pada `pay_url` baru dan tidak memerlukan Secret Key merchant di browser.

## GET Informasi Akun

`GET /api/v1/merchant/balance`

```bash
curl -G "https://api.kuyzpay.xyz/api/v1/merchant/balance" \
  --data-urlencode "merchant_id=KPXXXXXXXX" \
  --data-urlencode "secret=YOUR_SECRET"
```

Sebagai alias alternatif, parameter `merchant` dapat menggantikan `merchant_id` dan `signature=md5(merchant_id:secret)` dapat menggantikan Secret Key mentah.

```json
{
  "status": 1,
  "rc": 200,
  "message": "",
  "data": {
    "nama_toko": "Toko Saya",
    "merchant_id": "KPXXXXXXXX",
    "is_sandbox": false,
    "saldo_tersedia": 125000,
    "saldo_tertahan": 50000,
    "total_dicairkan": 300000,
    "balance_authoritative": true,
    "settlement_mode": "platform_wallet_manual_payout"
  }
}
```

> `platform_wallet_manual_payout` berarti saldo berasal dari transaksi Live `QRIS_ADMIN` dan dapat diajukan melalui menu **Saldo & Withdraw**. Saat diajukan, nominal berpindah dari saldo tersedia ke saldo tertahan hingga Admin membayar atau menolak. Untuk `direct_to_qris_owner`, dana masuk langsung ke akun QRIS member sehingga saldo KuyzPay tetap 0 dan `balance_authoritative` bernilai `false`. Sandbox tidak pernah menambah saldo riil.

## POST Status Provider

`POST /api/v1/provider/status`

Gunakan endpoint ini sebelum membuat invoice Live atau ketika menerima `PROVIDER_AUTH_REQUIRED`. Respons tidak membocorkan ID akun pembayaran, token, email provider, maupun detail internal. Autentikasi, pemisahan environment, dan whitelist IP sama dengan endpoint merchant.

```bash
curl -X POST "https://api.kuyzpay.xyz/api/v1/provider/status" \
  -H "Content-Type: application/json" \
  -d '{"merchant_id":"KPXXXXXXXX","secret":"YOUR_LIVE_SECRET"}'
```

```json
{
  "status": 1,
  "rc": 200,
  "data": {
    "environment": "live",
    "payment_source": "platform_qris",
    "live_available": false,
    "provider_status": "unavailable",
    "requires_reauthentication": true,
    "error_code": "PROVIDER_AUTH_REQUIRED",
    "checked_at": "2026-09-10T12:00:00.000Z",
    "recheck_after_seconds": 60
  }
}
```

> **Integrasi yang disarankan:** hentikan pembuatan invoice baru ketika `live_available=false`. Jangan melakukan retry cepat; tunggu nilai `recheck_after_seconds`. Endpoint mengembalikan HTTP 200 jika pemeriksaan berhasil, sedangkan kondisi provider berada di dalam `data`.

## Callback / Webhook

KuyzPay mengirim `POST application/json` untuk perubahan status penting. Signature terdapat di header `X-KuyzPay-Signature` dan menggunakan HMAC-SHA256 dengan secret merchant terhadap raw JSON body.

```json
{
  "event": "payment.success",
  "data": {
    "merchant_id": "KPXXXXXXXX",
    "environment": "live",
    "payment_channel": "QRIS_ADMIN",
    "fee_percent": 1,
    "fee_amount": 250,
    "member_profit": 75,
    "platform_fee": 175,
    "total_dibayar": 25292,
    "total_diterima": 25075,
    "customer_name": "Budi"
  },
  "reference": "KP260828ABC123",
  "reff_id": "ORDER-001",
  "signature": "md5_merchant_id_secret_ref_id",
  "status": "Success"
}
```

```javascript
const crypto = require('crypto');

function validWebhook(rawBody, signature, secret) {
  const expected = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
  return crypto.timingSafeEqual(Buffer.from(signature, 'hex'), Buffer.from(expected, 'hex'));
}
```

### Header webhook

| Header | Nilai |
| --- | --- |
| `X-KuyzPay-Event` | `payment.success`, `payment.cancelled`, `payment.expired`, `payment.late`, `provider.unavailable`, atau `provider.restored` |
| `X-KuyzPay-Signature` | HMAC-SHA256 dari raw JSON body |
| `X-KuyzPay-Timestamp` | Unix time milidetik saat pengiriman |

> **Webhook operasional:** ketika monitor mengonfirmasi sesi terputus, KuyzPay mengirim `provider.unavailable`; setelah sesi pulih dikirim `provider.restored`. Payload hanya berisi `merchant_id`, environment, sumber pembayaran, status kesiapan, kode error aman, dan waktu pemeriksaan. Verifikasi HMAC raw body seperti webhook pembayaran dan gunakan `event_id` untuk deduplikasi.

Balas HTTP `2xx`; body `{"status":true}` direkomendasikan sebagai format respons ringkas. Jika pengiriman gagal, KuyzPay mencoba hingga tiga kali dengan jeda dua menit, menyimpan setiap hasil, dan menyediakan resubmit pada detail transaksi.

## Status dan Error

| Status | Keterangan | Terminal |
| --- | --- | --- |
| `Unpaid` | Menunggu pembayaran | Tidak |
| `Success` | Pembayaran berhasil | Ya |
| `Completed` | Pembayaran selesai diproses | Ya |
| `Cancelled` | Dibatalkan merchant; QR tidak lagi ditampilkan | Ya untuk checkout; tetap dipantau |
| `Expired` | Melewati batas waktu | Ya untuk checkout; tetap dipantau |
| `PaidLate` | Dana diterima setelah cancel/expired | Ya, wajib ditindaklanjuti |
| `Failed` | Gagal | Ya |

| HTTP | Keterangan |
| --- | --- |
| 200 | Berhasil |
| 400 | Parameter tidak valid |
| 401 | Autentikasi gagal |
| 402 | Premium diperlukan |
| 403 | Akses ditolak/merchant belum disetujui |
| 404 | Data tidak ditemukan |
| 409 | Konfigurasi atau nominal bentrok |
| 503 | Akun pembayaran belum siap. Jika `error_code` bernilai `PROVIDER_AUTH_REQUIRED`, hentikan pembuatan invoice baru dan minta Admin memulihkan login akun pembayaran. |
