# Validasi webhook pembayaran

Perbaikan F05/F06 mengikuti kontrak pada `dokumentasiAPI.md`, bagian Callback / Webhook: header `X-KuyzPay-Signature` adalah HMAC-SHA256 terhadap **raw JSON body**, menggunakan `KUYZPAY_SECRET` environment merchant yang sesuai (Sandbox/Live).

- Parser JSON menyimpan byte asli hanya untuk `/api/payments/callback`, sebelum JSON diparsing.
- Signature wajib berupa 64 karakter hexadecimal. Perbandingan memakai `timingSafeEqual` setelah format dan panjang diperiksa.
- Tidak ada fallback autentikasi ke MD5 pada body. Signature MD5 untuk request order bukan pengganti HMAC webhook.
- Event pembayaran diambil dari body yang ditandatangani; header event yang bertentangan dengan body ditolak.
- Signature tidak ada/rusak/tidak cocok: HTTP 401. Raw JSON body tidak tersedia atau event header bertentangan: HTTP 400. Secret belum dikonfigurasi: HTTP 503. Kegagalan pemrosesan: HTTP 500.
- Request yang gagal verifikasi berhenti sebelum lookup transaksi, perubahan status, pemotongan stok, atau broadcast notifikasi.

F04 (simulasi pembayaran untuk pengembangan) tetap dipertahankan sesuai keputusan pengguna; perbaikan ini hanya mengamankan jalur webhook. F03 (cash) tetap memakai login dan role kasir/manajer/owner.

Tes integrasi memakai database sementara dan webhook yang ditandatangani dengan secret pengujian. Kasus yang dicakup: signature hilang, malformed, salah panjang, salah secret, perubahan payload, raw JSON berformat spasi/newline dan UTF-8, konflik event header, serta callback sah berulang tanpa potong stok dua kali. Pengiriman webhook dari KuyzPay sungguhan belum diuji.

Tidak ada migrasi database untuk perbaikan ini. Restart backend untuk memuat parser dan validasi baru. Pastikan instalasi yang memasang router pembayaran lewat entrypoint lain juga memakai `express.json({ verify: capturePaymentWebhookBody })` dari `backend/services/paymentWebhookSignature.js`.
