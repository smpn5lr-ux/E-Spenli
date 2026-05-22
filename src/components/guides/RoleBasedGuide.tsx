'use client';

import React from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { BookOpen, AlertTriangle } from 'lucide-react';

interface RoleBasedGuideProps {
  role: string;
  children: React.ReactNode;
}

const CommonGuide = () => (
    <div className="space-y-4">
        <div>
            <h4 className="font-bold text-base">Cara Melakukan Absensi Harian</h4>
            <ol className="list-decimal pl-5 mt-2 space-y-2 text-muted-foreground">
                <li>Di halaman <b>Beranda</b>, temukan dan klik tombol <b>"Pindai QR Code"</b>.</li>
                <li>Pastikan Anda berada di area sekolah, lalu arahkan kamera ponsel Anda ke QR Code yang telah disediakan.</li>
                <li>Tunggu sesaat hingga muncul notifikasi <b>"Berhasil"</b>. Jika gagal, periksa kembali koneksi internet dan pastikan Anda berada di dalam radius yang benar.</li>
                <li>Ulangi langkah yang sama untuk absensi pulang sesuai jadwal.</li>
            </ol>
             <div className="mt-3 flex items-start gap-2 rounded-md border border-amber-500/30 bg-amber-50/50 p-3 text-amber-900 ">
                <AlertTriangle className="h-5 w-5 mt-0.5 text-amber-600 flex-shrink-0" />
                <p className="text-xs">
                    <b>Penting:</b> Absensi hanya bisa dilakukan jika Anda berada di <b>dalam lokasi sekolah</b> dan selama <b>jam absensi</b> yang telah ditentukan oleh Admin.
                </p>
            </div>
        </div>
    </div>
);

const AdminGuide = () => (
  <div className="space-y-6">
    <CommonGuide />
    <div>
        <h4 className="font-bold text-base">Cara Mengelola Pengguna</h4>
        <ol className="list-decimal pl-5 mt-2 space-y-2 text-muted-foreground">
            <li>Masuk ke menu <b>Manajemen Pengguna</b>.</li>
            <li>Untuk menambah pengguna baru, klik tombol <b>"+ Tambah Pengguna"</b>. Isi semua detail yang diperlukan, terutama Nama, Email, dan Peran.</li>
            <li>Untuk mengubah data atau menghapus pengguna, cari pengguna dari daftar dan klik tombol titik tiga (opsi) di sebelah kanan.</li>
        </ol>
    </div>
    <div>
        <h4 className="font-bold text-base">Cara Mengatur Absensi (Paling Penting)</h4>
        <ol className="list-decimal pl-5 mt-2 space-y-2 text-muted-foreground">
            <li>Masuk ke menu <b>Pengaturan</b>.</li>
            <li>Cari kartu <b>"Pengaturan QR Code Absensi"</b>.</li>
            <li>Di sini Anda dapat mengaktifkan/menonaktifkan sistem, mengatur jam masuk/pulang, menentukan radius lokasi, dan mengubah nilai QR Code jika diperlukan.</li>
            <li>Klik <b>"Simpan"</b> setelah melakukan perubahan.</li>
        </ol>
    </div>
     <div>
        <h4 className="font-bold text-base">Cara Mengirim Pengumuman</h4>
        <ol className="list-decimal pl-5 mt-2 space-y-2 text-muted-foreground">
            <li>Masuk ke menu <b>Pengaturan</b>.</li>
            <li>Cari kartu <b>"Pemberitahuan Admin"</b>.</li>
            <li>Tulis judul dan isi pesan, lalu aktifkan dengan tombol <b>"Status Pemberitahuan"</b>.</li>
            <li>Klik <b>"Simpan Pemberitahuan"</b>. Pesan akan langsung muncul di beranda semua pengguna.</li>
        </ol>
    </div>
  </div>
);

const KepalaSekolahGuide = () => (
    <div className="space-y-6">
        <CommonGuide />
        <div>
            <h4 className="font-bold text-base">Cara Memvalidasi Izin Staf</h4>
            <ol className="list-decimal pl-5 mt-2 space-y-2 text-muted-foreground">
                <li>Masuk ke menu <b>Validasi Izin</b>. Anda akan melihat daftar pengajuan yang masih "Menunggu Persetujuan".</li>
                <li>Klik tombol <b>"Tinjau"</b> pada salah satu pengajuan untuk melihat detailnya, termasuk surat bukti jika ada.</li>
                <li>Klik tombol <b>"Setujui"</b> atau <b>"Tolak"</b> berdasarkan pertimbangan Anda. Status akan otomatis terupdate.</li>
            </ol>
        </div>
        <div>
            <h4 className="font-bold text-base">Cara Membuat Laporan Staf</h4>
            <ol className="list-decimal pl-5 mt-2 space-y-2 text-muted-foreground">
                <li>Masuk ke menu <b>Laporan</b>.</li>
                <li>Anda bisa memilih untuk melihat laporan semua pengguna atau memilih pengguna spesifik.</li>
                <li>Pilih rentang tanggal yang diinginkan, lalu klik <b>"Buat Laporan"</b> untuk melihat hasilnya. Anda juga bisa mengunduhnya dalam format PDF.</li>
            </ol>
        </div>
    </div>
);

const GuruPegawaiGuide = () => (
    <div className="space-y-6">
      <CommonGuide />
       <div>
            <h4 className="font-bold text-base">Cara Mengajukan Izin atau Sakit</h4>
            <ol className="list-decimal pl-5 mt-2 space-y-2 text-muted-foreground">
                <li>Masuk ke menu <b>Pengajuan Izin</b>.</li>
                <li>Klik tombol <b>"+ Buat Pengajuan"</b>.</li>
                <li>Pilih jenis izin (Sakit/Izin), tanggal, dan tuliskan keterangan. Jika perlu, unggah file bukti (misal: surat dokter).</li>
                <li>Klik <b>"Kirim Pengajuan"</b>. Status pengajuan Anda akan menjadi "Menunggu Persetujuan" hingga divalidasi oleh Kepala Sekolah/Admin.</li>
            </ol>
        </div>
        <div>
            <h4 className="font-bold text-base">Melihat Laporan Kehadiran Pribadi</h4>
            <ol className="list-decimal pl-5 mt-2 space-y-2 text-muted-foreground">
                <li>Buka menu <b>Laporan</b>.</li>
                <li>Sistem akan secara otomatis menampilkan riwayat kehadiran Anda untuk <b>bulan berjalan</b>.</li>
                <li>Anda dapat langsung meninjau riwayat pada halaman ini, jika ada kehadiran yang belum lengkap karena lupa absen segera hubungi admin/kepala sekolah untuk segera diperbaiki.</li>
            </ol>
            <div className="mt-3 flex items-start gap-2 rounded-md border border-sky-500/30 bg-sky-50/50 p-3 text-sky-900 ">
                <AlertTriangle className="h-5 w-5 mt-0.5 text-sky-600 flex-shrink-0" />
                <p className="text-xs">
                    <b>Butuh Laporan Bulan Sebelumnya?</b> Untuk mendapatkan riwayat kehadiran dari bulan-bulan yang lalu, silakan ajukan permintaan kepada <b>Admin</b> atau <b>Kepala Sekolah</b>.
                </p>
            </div>
        </div>
        <div>
            <h4 className="font-bold text-base">Memahami Perhitungan Persentase</h4>
             <p className="text-muted-foreground mt-2 text-sm">Persentase kehadiran pada dasbor Anda dihitung dengan rumus berikut untuk mengukur kedisiplinan:</p>
             <div className="my-2 p-3 bg-muted rounded-md text-center font-mono text-xs">
                (% Kehadiran) = (Jumlah Hadir) / (Total Hari Kerja) * 100%
             </div>
             <ul className="list-disc pl-5 mt-2 space-y-1 text-muted-foreground text-sm">
                <li><b>Jumlah Hadir</b>: Total hari Anda melakukan absensi (status "Masuk" dan "Terlambat").</li>
                <li><b>Total Hari Kerja</b>: Jumlah hari kerja dalam sebulan, <b>tidak termasuk</b> hari libur (seperti hari Minggu) dan hari dimana pengajuan Izin/Sakit Anda telah disetujui.</li>
                <li>Status <b>Alpha</b> dianggap sebagai hari kerja dimana Anda tidak hadir, sehingga akan mengurangi persentase kehadiran Anda.</li>
             </ul>
        </div>
    </div>
);


const GuideContent = ({ role }: { role: string }) => {
  switch (role.toLowerCase()) {
    case 'admin':
      return <AdminGuide />;
    case 'kepala_sekolah':
      return <KepalaSekolahGuide />;
    case 'guru':
    case 'pegawai':
      return <GuruPegawaiGuide />;
    default:
      return <p>Panduan tidak tersedia untuk peran ini.</p>;
  }
};

export const RoleBasedGuide = ({ role, children }: RoleBasedGuideProps) => {
  if (!role) return null;

  return (
    <Dialog>
      <DialogTrigger asChild>
        {children}
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <BookOpen className="h-6 w-6 text-primary" />
            <span>Panduan Pengguna</span>
          </DialogTitle>
          <DialogDescription>
            Berikut adalah tutorial singkat penggunaan aplikasi berdasarkan peran Anda: <strong>{role.replace('_',' ').toUpperCase()}</strong>.
          </DialogDescription>
        </DialogHeader>
        <div className="text-sm max-h-[70vh] overflow-y-auto pr-4 -mx-4 px-4 py-2">
          <GuideContent role={role} />
        </div>
      </DialogContent>
    </Dialog>
  );
};
