# Aplikasi Absensi SMPN 5 Langke Rembong (E-SPENLI)

Selamat datang di dokumentasi resmi E-SPENLI, sebuah aplikasi absensi digital modern yang dirancang khusus untuk **Admin, Kepala Sekolah, Guru, dan Pegawai** di SMPN 5 Langke Rembong. Aplikasi ini dibangun untuk mengotomatiskan, memantau, dan meningkatkan akurasi proses absensi serta pelaporan di lingkungan sekolah.

## Latar Belakang

Di era digital, proses manual pencatatan kehadiran rentan terhadap kesalahan, memakan waktu, dan sulit untuk dianalisis. E-SPENLI hadir sebagai solusi untuk mengatasi tantangan ini dengan menyediakan platform yang efisien, transparan, dan mudah diakses.

## Peran Pengguna & Fitur Utama

Sistem ini memiliki empat peran utama, masing-masing dengan hak akses dan fitur yang disesuaikan.

### 1. Admin (Super User)

Peran dengan kontrol penuh terhadap sistem. Bertugas mengelola data master dan memantau aktivitas secara keseluruhan.

- **Manajemen Pengguna**: Membuat, mengedit, dan mengelola akun untuk semua peran (Kepala Sekolah, Guru, Pegawai).
- **Dasbor Global**: Mengakses dasbor utama dengan statistik agregat seluruh pengguna, termasuk aktivitas kehadiran terbaru.
- **Manajemen Izin**: Melihat dan memproses *semua* permintaan izin/sakit dari seluruh staf.
- **Konfigurasi Laporan**: Mengatur informasi kop dan *footer* (nama instansi, sekolah, kepala sekolah, NIP) yang akan digunakan pada laporan PDF.
- **Akses Laporan Penuh**: Membuat dan mengunduh laporan kehadiran untuk semua pengguna.

### 2. Kepala Sekolah

Peran pimpinan yang berfokus pada pemantauan dan persetujuan.

- **Dasbor Pemantauan**: Melihat ringkasan kehadiran seluruh staf dan riwayat absensi terbaru.
- **Persetujuan Izin**: Menyetujui atau menolak pengajuan izin/sakit yang diajukan oleh guru dan pegawai.
- **Akses Laporan Staf**: Memiliki akses untuk melihat dan meninjau data laporan kehadiran seluruh staf.
- **Absensi Pribadi**: Melakukan absensi masuk dan pulang seperti pengguna lainnya.

### 3. Guru & Pegawai

Peran pengguna utama yang menjadi fokus dari sistem absensi harian.

- **Login & Registrasi**: Mendaftar dan login ke sistem dengan verifikasi email.
- **Dasbor Pribadi**: Melihat ringkasan kehadiran pribadi, jam masuk/pulang, dan kutipan motivasi.
- **Absensi via QR Code**: Melakukan absensi secara cepat dan aman dengan memindai QR Code yang disediakan admin.
- **Pengajuan Izin/Sakit**: Mengajukan ketidakhadiran secara online melalui formulir digital.
- **Laporan Pribadi**: Melihat dan mengunduh riwayat lengkap absensi pribadi.

## Fitur Inovatif & Teknologi

- **Kutipan Motivasi AI**: Setiap kali melakukan absensi, pengguna akan disambut dengan kutipan unik—lucu, penyemangat, atau reflektif—yang dibuat oleh AI (ditenagai oleh Google Gemini) untuk memberikan semangat.
- **Perhitungan Kehadiran Akurat**: 
    - **Persentase Kehadiran**: Dihitung secara real-time berdasarkan jumlah hari kerja efektif (misalnya 23 hari dalam sebulan) yang disesuaikan dengan waktu berjalan.
    - **Sistem Poin**: Perhitungan poin kehadiran disesuaikan dengan nilai bobot yang diinput secara manual oleh Admin, memberikan fleksibilitas dalam penilaian kedisiplinan.
- **Tur Orientasi (Onboarding)**: Saat pertama kali login, pengguna baru akan dipandu melalui fitur-fitur utama yang relevan dengan perannya untuk memastikan adopsi yang cepat dan mudah.
- **Antarmuka Modern**: Dibangun dengan Next.js, TypeScript, dan Tailwind CSS untuk performa tinggi dan pengalaman pengguna yang responsif.
- **Backend Realtime**: Menggunakan Firebase (Firestore & Authentication) untuk sinkronisasi data yang cepat dan andal.

## Konfigurasi Kunci API (Penting untuk Admin)

Fitur "Kutipan Motivasi AI" ditenagai oleh Google Gemini. Agar fitur ini berfungsi, sistem memerlukan Kunci API (API Key) yang valid.

**PENTING:** Kunci API adalah **rahasia** dan harus ditangani dengan sangat hati-hati untuk mencegah penyalahgunaan. **JANGAN PERNAH** menempatkan kunci API langsung di dalam kode sumber (`.ts`, `.tsx`, `.js`).

Metode yang benar dan aman untuk mengonfigurasi kunci ini adalah melalui **Environment Variables** di platform hosting Anda (Vercel).

### Panduan untuk Admin (di Vercel):

1.  **Dapatkan Kunci API Anda**: Buat dan salin Kunci API Anda dari [Google AI Studio](https://aistudio.google.com/app/apikey).
2.  **Buka Proyek di Vercel**: Login ke akun Vercel Anda dan buka dasbor proyek E-SPENLI.
3.  **Masuk ke Pengaturan**: Arahkan ke tab **Settings**.
4.  **Pilih Environment Variables**: Di menu sebelah kiri, klik **Environment Variables**.
5.  **Tambahkan Kunci Baru**:
    *   **Name**: Masukkan nama variabel persis seperti ini: `GEMINI_API_KEY`
    *   **Value**: Tempel (paste) Kunci API yang telah Anda salin.
    *   Pastikan semua *environment* (Production, Preview, Development) terpilih.
6.  **Simpan**: Klik tombol **Save**.
7.  **Redeploy**: Untuk memastikan aplikasi menggunakan variabel yang baru, picu *redeploy* baru dari tab **Deployments**.

## Deploy Otomatis dengan GitHub dan Vercel

Agar aplikasi ini tersimpan di GitHub dan terdeploy otomatis ke Vercel saat kode didorong ke cabang `main`, tambahkan file workflow GitHub Actions.

### Secret yang harus disiapkan di GitHub:
- `VERCEL_TOKEN`
- `VERCEL_ORG_ID`
- `VERCEL_PROJECT_ID`
- `FIREBASE_TOKEN`
- `FIREBASE_PROJECT_ID`

### Cara kerjanya:
- `VERCEL_*` digunakan untuk build dan deploy aplikasi ke Vercel.
- `FIREBASE_TOKEN` dan `FIREBASE_PROJECT_ID` digunakan untuk otomatis menerapkan index Firestore dari `firestore.indexes.json`.

### Langkah yang perlu dilakukan:
1.  Pastikan repo ini sudah terhubung ke GitHub.
2.  Tambahkan secret GitHub di repositori Anda.
3.  Push perubahan ke cabang `main`.

GitHub Actions akan otomatis:
- menginstall dependensi,
- melakukan build Next.js,
- menerapkan index Firestore,
- dan mendeploy ke Vercel.

Setelah langkah-langkah ini selesai, aplikasi akan dapat mengakses kunci API dengan aman di sisi server, dan fitur kutipan AI akan berfungsi tanpa mengekspos rahasia Anda.

## Pengembangan Lokal

1. Salin `.env.example` ke `.env.local` dan isi kredensial Firebase (lihat daftar variabel di file tersebut).
2. Jalankan:
   ```bash
   npm install
   npm run dev
   ```
3. Buka `http://localhost:3000`.

**Catatan**: Tanpa `GEMINI_API_KEY`, kutipan absensi tetap berfungsi memakai daftar kutipan manual yang ada di dalam server.

## Instal sebagai PWA

- **Android (Chrome):** Menu ⋮ → *Install app* / *Add to Home screen*.
- **iOS (Safari):** *Share* → *Add to Home Screen*.
- **Desktop:** Gunakan tombol install di bilah alamat Chrome/Edge, atau banner *Instal E-SPENLI* di aplikasi.

PWA diaktifkan pada build produksi (`@ducanh2912/next-pwa`). Manifest: `src/app/manifest.ts`.

## Dokumentasi Tambahan

- [Panduan deploy & secret](docs/DEPLOY.md)
- [Checklist verifikasi per peran](docs/ROLE_AUDIT.md)
