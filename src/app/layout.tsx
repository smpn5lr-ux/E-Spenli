import type { Metadata, Viewport } from 'next';
import { adminDb } from '@/lib/firebase-admin'; // Server-side firebase

export const dynamic = 'force-dynamic';
import './globals.css';
import { Toaster } from '@/components/ui/toaster';
import { FirebaseClientProvider } from '@/firebase';
import PwaInstaller from '@/components/pwa-installer';
import { ThemeProvider } from "@/components/theme-provider";
import { ClientOnly } from "@/components/utilities/ClientOnly";
import { SettingsProvider } from '@/contexts/SettingsContext';

// Function to fetch school config from Firestore
async function getSchoolConfig() {
  // Make sure adminDb is initialized before using it
  if (!adminDb) {
    console.error("Firebase Admin not initialized, cannot fetch school config.");
    return null;
  }
  try {
    const settingsDoc = await adminDb.collection('settings').doc('school').get();
    if (settingsDoc.exists) {
      return settingsDoc.data();
    }
    return null;
  } catch (error) {
    console.error("Error fetching school config for metadata:", error);
    return null;
  }
}

// Dynamically generate metadata
export async function generateMetadata(): Promise<Metadata> {
  const config = await getSchoolConfig();

  const schoolName = config?.school?.name || 'E-SPENLI';
  const logoUrl = config?.reportHeader?.logo;

  const defaultMetadata: Metadata = {
    title: schoolName,
    description: `Sistem Presensi Online ${schoolName}`,
    applicationName: schoolName,
    appleWebApp: {
      capable: true,
      title: schoolName,
      statusBarStyle: 'default',
    },
    manifest: "/manifest.webmanifest"
  };

  if (logoUrl) {
    defaultMetadata.icons = {
      icon: logoUrl,
      apple: logoUrl,
    };
  } else {
     defaultMetadata.icons = {
      icon: '/logofix.png',
      apple: '/logofix.png',
    };
  }

  return defaultMetadata;
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: 'white' },
    { media: '(prefers-color-scheme: dark)', color: '#101828' },
  ],
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="id" suppressHydrationWarning>
      <body>
        <ClientOnly>
          <ThemeProvider
            attribute="class"
            defaultTheme="light"
            enableSystem
            disableTransitionOnChange
          >
            <FirebaseClientProvider>
              <SettingsProvider>
                {children}
              </SettingsProvider>
            </FirebaseClientProvider>
            <PwaInstaller />
            <Toaster />
          </ThemeProvider>
        </ClientOnly>
      </body>
    </html>
  );
}
