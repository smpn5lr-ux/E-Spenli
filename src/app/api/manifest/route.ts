import { adminDb } from '@/lib/firebase-admin';
import { NextResponse } from 'next/server';

// The admin app is initialized when the module above is imported.

// IMPORTANT: Revalidate every time to ensure the latest icon is fetched.
export const revalidate = 0;

export async function GET() {
  // At runtime, adminDb should be available.
  // A check is added for safety to prevent runtime errors if initialization fails.
  if (!adminDb) {
    console.error("Firebase Admin DB is not initialized. Serving default manifest.");
    const defaultManifest = {
      "name": "E-Spenli",
      "short_name": "E-Spenli",
      "description": "Aplikasi Absensi dan Pelaporan E-Spenli",
      "start_url": "/",
      "display": "standalone",
      "background_color": "#ffffff",
      "theme_color": "#09090b",
      "icons": [
        {
          "src": "/logofix.png",
          "sizes": "192x192",
          "type": "image/png",
          "purpose": "any maskable"
        },
        {
          "src": "/logofix.png",
          "sizes": "512x512",
          "type": "image/png",
          "purpose": "any maskable"
        }
      ]
    };
    return NextResponse.json(defaultManifest, {
      headers: {
        'Content-Type': 'application/manifest+json',
        'Cache-Control': 'no-cache, no-store, max-age=0, must-revalidate',
      }
    });
  }

  const db = adminDb;
  let iconUrl = '/logofix.png'; // Default icon
  let appName = 'E-Spenli'; // Default name

  try {
    const schoolConfigRef = db.collection('schoolConfig').doc('default');
    const doc = await schoolConfigRef.get();

    if (doc.exists) {
      const data = doc.data();
      // Use the custom icon if it exists and is a valid data URL
      if (data && data.customAppIcon && data.customAppIcon.startsWith('data:image/png')) {
        iconUrl = data.customAppIcon;
      }
      // Use the custom school name if it exists
      if (data && data.schoolName) {
        appName = data.schoolName;
      }
    }
  } catch (error) {
    console.error("Error fetching school config for manifest:", error);
    // On error, we'll proceed with the default values
  }

  const manifest = {
    "name": appName,
    "short_name": appName,
    "description": `Aplikasi Absensi dan Pelaporan ${appName}`,
    "start_url": "/",
    "display": "standalone",
    "background_color": "#ffffff",
    "theme_color": "#09090b",
    "icons": [
      {
        "src": iconUrl,
        "sizes": "192x192",
        "type": "image/png",
        "purpose": "any maskable"
      },
      {
        "src": iconUrl,
        "sizes": "512x512",
        "type": "image/png",
        "purpose": "any maskable"
      }
    ]
  };

  return NextResponse.json(manifest, {
    headers: {
      'Content-Type': 'application/manifest+json',
      'Cache-Control': 'no-cache, no-store, max-age=0, must-revalidate',
    }
  });
}
