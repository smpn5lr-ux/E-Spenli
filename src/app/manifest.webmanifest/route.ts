import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase-admin';

// Ensure this route is always dynamic and not statically cached
export const dynamic = 'force-dynamic';

export async function GET() {
  // Default values that will be used as fallbacks
  let appName = 'E-SPENLI Absensi';
  let shortName = 'E-SPENLI';
  let appDescription = 'Sistem Presensi Online SMPN 5 Langke Rembong';
  let logoUrl = '/logofix.png'; // Default local logo

  if (adminDb) {
    try {
      const settingsDoc = await adminDb.collection('settings').doc('school').get();

      if (settingsDoc.exists) {
        const config = settingsDoc.data();
        
        // Use PWA-specific settings if they exist, otherwise use general school settings or defaults
        appName = config?.pwa?.name || `${config?.school?.name || 'E-SPENLI'} Absensi`;
        shortName = config?.pwa?.shortName || config?.school?.shortName || 'E-SPENLI';
        appDescription = config?.pwa?.description || `Aplikasi Absensi Digital untuk ${config?.school?.name || 'sekolah'}`;
        logoUrl = config?.pwa?.logo || config?.reportHeader?.logo || '/logofix.png';
      }
    } catch (error) {
      console.error('Error fetching dynamic manifest data from Firestore, using defaults:', error);
    }
  } else {
    console.log('Firebase Admin not initialized, using defaults for manifest.');
  }

  const manifest = {
    name: appName,
    short_name: shortName,
    description: appDescription,
    start_url: '/dashboard',
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

  return new NextResponse(JSON.stringify(manifest), {
    headers: {
      'Content-Type': 'application/manifest+json',
      'Cache-Control': 'no-cache, no-store, max-age=0, must-revalidate',
    },
  });
}
