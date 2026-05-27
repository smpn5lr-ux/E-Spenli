'use server';

import { NextResponse } from 'next/server';
import { adminDb } from '../../../lib/firebase-admin';

export async function GET() {
  // Pastikan adminDb sudah diinisialisasi
  if (!adminDb) {
    const defaultManifest = {
        name: 'E-SPENLI Absensi',
        short_name: 'E-SPENLI',
        description: 'Aplikasi Absensi Digital untuk SMPN 5 Langke Rembong',
        start_url: '/dashboard',
        display: 'standalone',
        background_color: '#ffffff',
        theme_color: '#3F51B5',
        icons: [
            { src: '/logofix.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
            { src: '/logofix.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
            { src: '/logofix.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
    };
    return new NextResponse(JSON.stringify(defaultManifest), {
        status: 500,
        headers: { 'Content-Type': 'application/manifest+json' },
    });
  }

  try {
    const schoolConfigRef = adminDb.doc('schoolConfig/default');
    const schoolConfigSnap = await schoolConfigRef.get();

    let customAppIcon = null;
    if (schoolConfigSnap.exists) {
      const schoolConfigData = schoolConfigSnap.data();
      if (schoolConfigData) {
          customAppIcon = schoolConfigData.customAppIcon;
      }
    }

    const manifest = {
      name: 'E-SPENLI Absensi',
      short_name: 'E-SPENLI',
      description: 'Aplikasi Absensi Digital untuk SMPN 5 Langke Rembong',
      start_url: '/dashboard',
      display: 'standalone',
      background_color: '#ffffff',
      theme_color: '#3F51B5',
      icons: [
        {
          src: customAppIcon || '/logofix.png',
          sizes: '192x192',
          type: 'image/png',
          purpose: 'any',
        },
        {
          src: customAppIcon || '/logofix.png',
          sizes: '512x512',
          type: 'image/png',
          purpose: 'any',
        },
        {
          src: customAppIcon || '/logofix.png',
          sizes: '512x512',
          type: 'image/png',
          purpose: 'maskable',
        },
      ],
    };

    return new NextResponse(JSON.stringify(manifest), {
      headers: {
        'Content-Type': 'application/manifest+json',
      },
    });
  } catch (error) {
    console.error('Error generating manifest:', error);
    // Return a default manifest in case of an error
    const defaultManifest = {
        name: 'E-SPENLI Absensi',
        short_name: 'E-SPENLI',
        description: 'Aplikasi Absensi Digital untuk SMPN 5 Langke Rembong',
        start_url: '/dashboard',
        display: 'standalone',
        background_color: '#ffffff',
        theme_color: '#3F51B5',
        icons: [
            { src: '/logofix.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
            { src: '/logofix.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
            { src: '/logofix.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
    };
    return new NextResponse(JSON.stringify(defaultManifest), {
        status: 500,
        headers: { 'Content-Type': 'application/manifest+json' },
    });
  }
}
