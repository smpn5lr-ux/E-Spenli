
import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase-admin';

// Ensure this route is always dynamic and not statically cached
export const dynamic = 'force-dynamic';

export async function GET() {
  // Default values
  let schoolName = 'E-SPENLI';
  let shortName = 'E-SPENLI';
  let appDescription = 'Sistem Presensi Online SMPN 5 Langke Rembong';
  let logoUrl = '/logofix.png';

  // Only attempt to access Firestore if the admin SDK is initialized
  if (adminDb) { 
    try {
      const settingsDoc = await adminDb.collection('settings').doc('school').get();

      if (settingsDoc.exists) {
        const config = settingsDoc.data();
        schoolName = config?.school?.name || 'E-SPENLI';
        shortName = config?.school?.shortName || schoolName;
        appDescription = `Aplikasi Absensi Digital untuk ${schoolName}`;
        logoUrl = config?.reportHeader?.logo || '/logofix.png';
      }
    } catch (error) {
      console.error('Error fetching dynamic manifest data from Firestore, using defaults:', error);
    }
  } else {
    console.log('Firebase Admin not initialized, using defaults for manifest.');
  }

  const manifest = {
    name: `${schoolName} Absensi`,
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
    headers: { 'Content-Type': 'application/manifest+json' },
  });
}
