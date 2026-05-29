'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  Home,
  QrCode,
  FileText,
  Settings,
  Users,
  MailCheck,
  ClipboardCheck,
  BookCheck,
} from 'lucide-react';
import {
  Sidebar,
  SidebarContent,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
} from '@/components/ui/sidebar';
import { useUser, useFirestore, useMemoFirebase } from '@/firebase';
import { useDoc } from '@/firebase/firestore/use-doc';
import { doc } from 'firebase/firestore';
import { useSettings } from '@/contexts/SettingsContext';

const defaultNavItems = [
  { id: 'nav-beranda', href: '/dashboard', icon: Home, label: 'Beranda' },
  { id: 'nav-absen', href: '/dashboard/absen', icon: QrCode, label: 'Absen' },
  { id: 'nav-izin', href: '/dashboard/izin', icon: MailCheck, label: 'Izin' },
  { id: 'nav-laporan', href: '/dashboard/laporan', icon: FileText, label: 'Laporan' },
  { id: 'nav-pengaturan', href: '/dashboard/pengaturan', icon: Settings, label: 'Pengaturan' },
];

const adminNavItems = [
  { id: 'nav-beranda', href: '/dashboard', icon: Home, label: 'Beranda' },
  { id: 'nav-admin-users', href: '/dashboard/admin/users', icon: Users, label: 'Pengguna' },
  { id: 'nav-admin-konfigurasi', href: '/dashboard/admin/konfigurasi', icon: QrCode, label: 'Pengaturan Absen' },
  { id: 'nav-laporan-sekolah', href: '/dashboard/laporan-sekolah', icon: BookCheck, label: 'Laporan Sekolah' },
  { id: 'nav-pengaturan', href: '/dashboard/pengaturan', icon: Settings, label: 'Pengaturan' },
];

const headmasterNavItems = [
    { id: 'nav-beranda', href: '/dashboard', icon: Home, label: 'Beranda' },
    { id: 'nav-absen', href: '/dashboard/absen', icon: QrCode, label: 'Absen' },
    { id: 'nav-izin-kepsek', href: '/dashboard/izin-kepala-sekolah', icon: ClipboardCheck, label: 'Persetujuan Izin' },
    { id: 'nav-laporan-sekolah', href: '/dashboard/laporan-sekolah', icon: BookCheck, label: 'Laporan Sekolah' },
    { id: 'nav-pengaturan', href: '/dashboard/pengaturan', icon: Settings, label: 'Pengaturan' },
];


export function AppSidebar() {
  const pathname = usePathname();
  const { user } = useUser();
  const firestore = useFirestore();
  const { schoolConfig } = useSettings();

  const userDocRef = useMemoFirebase(() => {
    if (!user) return null;
    return doc(firestore, 'users', user.uid);
  }, [firestore, user]);

  const { data: userData } = useDoc<{ role: string }>(user, userDocRef);

  const isAdmin = userData?.role === 'admin';
  const isHeadmaster = userData?.role === 'kepala_sekolah';

  let navItems = defaultNavItems;
  if (isAdmin) {
    navItems = adminNavItems;
  } else if (isHeadmaster) {
    navItems = headmasterNavItems;
  }

  return (
    <Sidebar
      className="hidden sm:flex border-r"
      style={{
        '--sidebar-width': '16rem',
      } as React.CSSProperties}
    >
      <SidebarContent className="p-2 pt-4 flex flex-col">
        <SidebarMenu>
          {navItems.map((item) => {
            const isActive = item.href === '/dashboard' 
                ? pathname === item.href 
                : pathname.startsWith(item.href);
            
            return (
              <SidebarMenuItem key={item.label}>
                <SidebarMenuButton
                  asChild
                  isActive={isActive}
                  className="justify-start"
                >
                  <Link href={item.href} id={item.id}>
                    <item.icon className="h-5 w-5" />
                    <span>{item.label}</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            );
          })}
        </SidebarMenu>
         <div className="mt-auto p-2 text-center text-xs text-muted-foreground">
            <span dangerouslySetInnerHTML={{ 
              __html: `${schoolConfig?.loginCopyright || '©2026 SMPN5LR'}${schoolConfig?.loginCopyrightSubtitle ? `<br />${schoolConfig.loginCopyrightSubtitle}` : (schoolConfig?.loginCopyrightSubtitle === undefined ? '<br />created by team operator' : '')}`
            }} />
        </div>
      </SidebarContent>
    </Sidebar>
  );
}
