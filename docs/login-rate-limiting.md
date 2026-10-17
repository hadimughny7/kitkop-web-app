# Pembatasan login staf

`POST /api/auth/login` dilindungi di backend pada seluruh environment, sebelum verifikasi password. Pelanggan tetap dapat memesan tanpa akun; endpoint pemesanan dan sesi staf yang sudah login tidak ikut dibatasi.

## Kebijakan

- **IP:** maksimal 100 request login selama 15 menit, termasuk login berhasil, input tidak valid dan request yang ditolak limiter akun. Ini membatasi percobaan ke banyak username/email.
- **Akun + IP:** maksimal 10 kegagalan autentikasi (HTTP 401) selama 15 menit. Request yang sedang diproses ikut dihitung sementara agar request serentak tidak melewati batas. Respons selain 401/429 dikurangi kembali dari penghitung ini.
- Login lewat username atau email untuk record pengguna yang sama memakai hitungan akun yang sama. Identitas yang tidak ditemukan juga dibatasi; variasi kapital/spasi/Unicode NFKC dinormalisasi untuk hitungan tersebut. Kunci identitas di store di-hash, bukan username/email mentah. Password tidak disimpan oleh limiter.
- IPv6 digabung per subnet `/56`, termasuk normalisasi alamat IPv4-mapped. Ini membatasi pergantian alamat dalam jaringan yang sama.
- Tidak ada penguncian akun global atau perubahan `is_active`. Kegagalan dari satu IP tidak mengunci akun dari IP lain. Perangkat dengan IP publik yang sama berbagi batas IP.
- Window dimulai pada request pertama dan tidak diperpanjang oleh request yang ditolak. Setelah habis, pengguna dapat mencoba kembali. Login berhasil tidak menghapus riwayat kegagalan lain dalam window dan tidak menghapus hitungan IP.

Jika dibatasi, API mengembalikan **HTTP 429**, header `Retry-After` dalam detik, dan JSON:

```json
{
  "success": false,
  "code": "LOGIN_RATE_LIMITED",
  "message": "Terlalu banyak percobaan login. Coba lagi dalam 15 menit.",
  "retry_after_seconds": 900
}
```

Angka menyesuaikan waktu yang tersisa. Respons login memakai `Cache-Control: no-store` dan header `RateLimit`/`RateLimit-Policy`. Halaman login yang ada menampilkan `message` dari server melalui toast; tidak ada perubahan UI atau alur login. Kredensial salah sebelum batas tercapai tetap HTTP 401. Input dengan tipe tidak valid atau ukuran berlebihan menghasilkan HTTP 400.

## Deploy dan reverse proxy

Jalankan `npm ci` di `backend`, kemudian restart backend. Tidak ada migrasi database atau perubahan data operasional.

Default `TRUSTED_PROXY_CIDRS` kosong: header `X-Forwarded-For` dari koneksi langsung **tidak dipercaya**. Jika hosting meneruskan request lewat reverse proxy, administrator perlu mengisi IP/CIDR proxy yang benar-benar digunakan, misalnya `127.0.0.1` hanya jika proxy lokal tersebut memang jalur masuk deployment. Jangan menyalin contoh tanpa memeriksa topologi hosting.

Daftar dipisahkan koma, hanya menerima IP/CIDR yang valid. Wildcard, `true`, jumlah hop dan subnet `/0` ditolak pada startup. Implementasi trust menggunakan `node:net.BlockList`; header IP tidak dibaca secara manual oleh limiter. Express berhenti pada alamat pertama yang tidak dipercaya dalam rantai proxy. Proxy harus menambah/menimpa `X-Forwarded-For` dengan alamat peer yang sebenarnya; akses backend langsung dan rentang proxy harus diatur sesuai jaringan deployment.

Jika proxy belum dikonfigurasi, aplikasi melihat IP proxy sehingga pengguna di belakangnya berbagi batas. Jangan mengaktifkan `trust proxy: true` untuk mengatasi hal ini. Header `Forwarded` tidak dipakai untuk menentukan IP. Alamat forwarded yang tidak valid tidak menjadi kunci limiter baru, melainkan menggunakan alamat koneksi sebagai fallback.

## Penyimpanan dan batas perlindungan

Limiter memakai **MemoryStore per proses**, sesuai backend tunggal saat ini. Entri lama dibersihkan otomatis. Hitungan reset ketika proses restart dan tidak dibagi antar-worker/instance. Jika hosting menjalankan beberapa worker atau beberapa instance, gunakan shared store (misalnya Redis) untuk kedua limiter atau perlindungan setara di ingress sebelum menganggap kuota ini berlaku lintas instance. Factory middleware menerima store terpisah untuk integrasi itu; jangan memakai satu store tanpa namespace untuk kedua limiter.

Kegagalan store menghentikan login melalui error handler, bukan melewati limiter. Pembatasan aplikasi ini tidak menggantikan perlindungan jaringan terhadap serangan terdistribusi/DoS dan belum membuktikan konfigurasi hosting sudah benar. Tidak ada lockout global berdasarkan nama akun, untuk menghindari pihak lain sengaja mengunci akun korban dari IP berbeda.

Implementasi menggunakan `express-rate-limit` 8.7.1. Referensi resmi: [konfigurasi](https://express-rate-limit.mintlify.app/reference/configuration), [proxy](https://express-rate-limit.mintlify.app/guides/troubleshooting-proxy-issues).

## Validasi lokal

Jalankan dari `backend` di PowerShell:

```powershell
$env:KITKOP_OPTIONS_DB_TEST='true'
node --test --test-concurrency=1 tests/loginRateLimit.integration.test.js
```

Tes memakai schema MySQL localhost sementara, lalu menghapusnya. Pengujian mencakup route asli, alias username/email, akun tidak ditemukan, IP berbeda, pemalsuan header/rantai proxy, IPv6, percobaan ke banyak akun, login berhasil, request serentak, pemulihan setelah window, input malformed dan kegagalan store. Waktu expiry disimulasikan dalam proses tes; tidak perlu menunggu 15 menit atau mencoba akun operasional. Pengujian ini tidak menguji reverse proxy hosting atau brute-force massal.
