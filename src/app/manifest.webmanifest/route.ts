
import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase-admin';

// Ensure this route is always dynamic and not statically cached
export const dynamic = 'force-dynamic';

export async function GET() {
  // Default values
  let appName = 'E-SPENLI';
  let appShortName = 'E-SPENLI';
  let appDescription = 'Sistem Presensi Online SMPN 5 Langke Rembong';
  let logoUrl = '/logo.png'; // Start with a default logo

  // Only attempt to access Firestore if the admin SDK is initialized
  if (adminDb) {
    try {
      // Fetch both school config and logo in parallel for efficiency
      const [configDoc, logoDoc] = await Promise.all([
        adminDb.collection('schoolConfig').doc('default').get(),
        adminDb.collection('settings').doc('logo').get()
      ]);

      // Process school config for app name and description
      if (configDoc.exists) {
        const configData = configDoc.data();
        appName = configData?.appName || appName;
        appShortName = configData?.appShortName || appShortName;
        appDescription = configData?.appDescription || appDescription;
      }
      
      // Process logo settings
      if (logoDoc.exists) {
          const logoData = logoDoc.data();
          if (logoData?.url) {
            logoUrl = logoData.url;
          }
      }

    } catch (error) {
      // If there's an error fetching from Firestore, log it
      // but continue with the default values, don't break the request.
      console.error('Error fetching dynamic manifest data from Firestore, using defaults:', error);
    }
  } else {
    // This case occurs during `next build` when environment variables might not be available.
    // This is expected behavior, so we just log a note and use the default values.
    console.log('Firebase Admin not initialized (expected during build), using defaults for manifest.');
  }

  const manifest = {
    name: appName,
    short_name: appShortName,
    description: appDescription,
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

  // Always return a successful response with a valid manifest
  // Important: Set the Content-Type header to 'application/manifest+json'
  return new NextResponse(JSON.stringify(manifest), {
    headers: { 'Content-Type': 'application/manifest+json' },
  });
}
