
import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase-admin';

// Memastikan route ini selalu dinamis dan tidak di-cache secara statis
export const dynamic = 'force-dynamic';

export async function GET() {
  let logoUrl = '/logo.png'; // Mulai dengan logo default

  // Hanya coba akses Firestore jika admin SDK berhasil diinisialisasi
  if (adminDb) {
    try {
      const logoDoc = await adminDb.collection('settings').doc('logo').get();
      const logoData = logoDoc.data();
      // Jika URL logo ada di database, gunakan itu
      if (logoData?.url) {
        logoUrl = logoData.url;
      }
    } catch (error) {
      // Jika ada error saat mengambil dari Firestore, log error tersebut
      // tapi tetap lanjutkan dengan logo default, jangan hentikan request.
      console.error('Error fetching logo from Firestore, using default:', error);
    }
  } else {
    // Kasus ini terjadi saat `next build` ketika environment variables tidak tersedia.
    // Ini adalah perilaku yang diharapkan, jadi kita hanya log catatan dan pakai logo default.
    console.log('Firebase Admin not initialized (expected during build), using default logo for manifest.');
  }

  const manifest = {
    name: 'E-SPENLI',
    short_name: 'E-SPENLI',
    description: 'Sistem Presensi Online SMPN 5 Langke Rembong',
    start_url: '/',
    display: 'standalone',
    background_color: '#ffffff',
    theme_color: '#101828',
    icons: [
      {
        src: logoUrl,
        sizes: '192x192',
        type: 'image/png',
        purpose: 'any maskable',
      },
      {
        src: logoUrl,
        sizes: '512x512',
        type: 'image/png',
        purpose: 'any maskable',
      },
    ],
  };

  // Selalu kembalikan respons sukses dengan manifest yang valid
  // Penting: Set header Content-Type ke 'application/manifest+json'
  return new NextResponse(JSON.stringify(manifest), {
    headers: { 'Content-Type': 'application/manifest+json' },
  });
}
