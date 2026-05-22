import React from 'react';
import { usePathname } from 'next/navigation';
import { BottomNavigation } from './bottom-navigation';
import { Header } from './header';

export function MobileLayout({ children }: { children: React.ReactNode }) {
    const pathname = usePathname();
    const isAbsenPage = pathname === '/dashboard/absen';

  return (
    <div className="overflow-x-hidden">
      {!isAbsenPage && <Header />}
      {/* 
        The main content area.
        - The `pt-16` is to offset for the fixed Header.
        - The `pb-20` is to offset for the fixed BottomNavigation.
      */}
      <main className={!isAbsenPage ? `pt-16 pb-20` : `pb-20`}>
        <div className={!isAbsenPage ? `p-4` : ''}>
            {children}
        </div>
      </main>
      <BottomNavigation />
    </div>
  );
}
