import type { Metadata, Viewport } from 'next';

export const dynamic = 'force-dynamic';
import './globals.css';
import { Toaster } from '@/components/ui/toaster';
import { FirebaseClientProvider } from '@/firebase';
import PwaInstaller from '@/components/pwa-installer';
import { ThemeProvider } from "@/components/theme-provider";
import { ClientOnly } from "@/components/utilities/ClientOnly";
import { SettingsProvider } from '@/contexts/SettingsContext';

export const metadata: Metadata = {
  title: 'E-SPENLI',
  description: 'Sistem Presensi Online SMPN 5 Langke Rembong',
  applicationName: 'E-SPENLI',
  appleWebApp: {
    capable: true,
    title: 'E-SPENLI',
    statusBarStyle: 'default',
  },
};

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
            {/* CORRECTED PROVIDER ORDER */}
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
