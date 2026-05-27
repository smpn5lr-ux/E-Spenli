'use client';
import React, { useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useRouter } from 'next/navigation'; // Import useRouter
import { Avatar, AvatarImage, AvatarFallback } from '../ui/avatar';
import { useUser, useFirestore, useMemoFirebase, useAuth } from '@/firebase';
import { useDoc } from '@/firebase/firestore/use-doc';
import { doc } from 'firebase/firestore';
import { PlaceHolderImages } from '@/lib/placeholder-images';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { LogOut, Settings, ShieldAlert, BookOpen } from 'lucide-react';
import { signOut } from 'firebase/auth';
import { ModeToggle } from '@/components/theme-toggle';
import NetworkStatus from '@/components/utilities/NetworkStatus';
import { ClientOnly } from '@/components/utilities/ClientOnly';
import { RoleBasedGuide } from '@/components/guides/RoleBasedGuide';
import { FullscreenLoader } from '@/components/utilities/fullscreen-loader';

export function Header({ isTransparent }: { isTransparent?: boolean }) {
  const firestore = useFirestore();
  const { user } = useUser();
  const auth = useAuth();
  const router = useRouter(); // Initialize the router
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  const appLogo = PlaceHolderImages.find(p => p.id === 'app-logo');

  const userDocRef = useMemoFirebase(() => {
    if (!user || !firestore) return null;
    return doc(firestore, 'users', user.uid);
  }, [firestore, user]);

  const { data: userData } = useDoc<{ name: string, role: string, photoURL?: string }>(user, userDocRef);

  const handleLogout = async () => {
    if (!auth) return;
    setIsLoggingOut(true);
    try {
      await signOut(auth);
      // Use Next.js router for a smooth, client-side navigation
      router.push('/');
    } catch (error) {
      console.error("Logout failed", error);
      // If logout fails, hide the loader to prevent getting stuck
      setIsLoggingOut(false);
    }
  };

  const getInitials = (name: string | undefined | null) => {
    if (!name) return 'U';
    return name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase();
  }

  const displayName = user?.displayName || userData?.name;
  const userRole = userData?.role || '';

  const getDisplayRole = () => {
    if (userRole) {
      return userRole.replace('_', ' ').split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
    }
    return "User";
  }
  const displayRole = getDisplayRole();
  const currentPhoto = userData?.photoURL || user?.photoURL;

  const headerClasses = `
    fixed top-0 z-30 flex h-16 w-full items-center justify-between border-b bg-background px-4 sm:px-6
    transition-opacity duration-300
    sm:left-[16rem] sm:w-[calc(100%-16rem)]
    ${isTransparent ? 'opacity-0 pointer-events-none' : 'opacity-100'}
  `;

  return (
    <>
      {isLoggingOut && <FullscreenLoader text="Keluar..." />} 
      <header className={headerClasses}>
        <div className="flex items-center gap-3">
          <DropdownMenu>
              <DropdownMenuTrigger asChild>
                  <button className="flex items-center gap-3 focus:outline-none rounded-full p-1 -ml-1 sm:p-0 sm:ml-0">
                      <Avatar className="h-9 w-9">
                          <AvatarImage src={currentPhoto ?? undefined} alt="Avatar" />
                          <AvatarFallback>{getInitials(displayName)}</AvatarFallback>
                      </Avatar>
                      <div className="hidden sm:flex flex-col justify-center text-left">
                          <p className="text-sm font-medium leading-none">{displayName || 'Loading...'}</p>
                          <p className="text-xs leading-none text-muted-foreground capitalize">{displayRole}</p>
                      </div>
                  </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-56">
                  <DropdownMenuLabel className="font-normal">
                      <div className="flex flex-col space-y-1">
                      <p className="text-sm font-medium leading-none">{displayName || 'Pengguna'}</p>
                      <p className="text-xs leading-none text-muted-foreground">
                          {displayRole}
                      </p>
                      </div>
                  </DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <RoleBasedGuide role={userRole}>
                      <DropdownMenuItem onSelect={(e) => e.preventDefault()}>
                          <BookOpen className="mr-2 h-4 w-4" />
                          <span>Panduan</span>
                      </DropdownMenuItem>
                  </RoleBasedGuide>
                  <DropdownMenuItem asChild>
                      <Link href="/dashboard/pengaturan">
                      <Settings className="mr-2 h-4 w-4" />
                      <span>Pengaturan</span>
                      </Link>
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={handleLogout} className="text-destructive focus:text-destructive">
                      <LogOut className="mr-2 h-4 w-4" />
                      <span>Keluar</span>
                  </DropdownMenuItem>
              </DropdownMenuContent>
          </DropdownMenu>
          <ClientOnly>
            <ModeToggle />
          </ClientOnly>
          <NetworkStatus />
        </div>

        <Dialog>
          <DialogTrigger asChild>
            <button className="focus:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-full">
              <Image
                src={appLogo?.imageUrl || '/logofix.png'}
                alt="App Logo"
                width={36}
                height={36}
                priority
                data-ai-hint="app logo"
              />
            </button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                  <ShieldAlert className="h-6 w-6 text-destructive" />
                  <span>Aturan & Penegasan Absensi</span>
              </DialogTitle>
              <DialogDescription className="pt-4 text-left">
                Aplikasi ini adalah alat resmi untuk mencatat kehadiran. Pelanggaran terhadap aturan berikut akan dikenakan sanksi sesuai kebijakan sekolah.
              </DialogDescription>
            </DialogHeader>
            <div className="text-sm space-y-3 py-2 max-h-[60vh] overflow-y-auto pr-4">
              <div className="font-semibold">1. Kejujuran adalah Segalanya</div>
              <p className="text-muted-foreground pl-4">
                Setiap pengguna bertanggung jawab penuh atas kebenaran data absensinya. Tindakan manipulasi, "titip absen", atau pemalsuan data dalam bentuk apapun adalah pelanggaran berat.
              </p>
              <div className="font-semibold">2. Tepat Waktu</div>
              <p className="text-muted-foreground pl-4">
                Lakukan absensi masuk dan pulang sesuai dengan rentang waktu yang telah ditetapkan oleh admin sekolah. Keterlambatan akan tercatat oleh sistem.
              </p>
              <div className="font-semibold">3. QR Code Bersifat Rahasia</div>
              <p className="text-muted-foreground pl-4">
                Dilarang keras menyebarluaskan, membagikan, atau mengambil gambar QR Code absensi untuk digunakan oleh orang lain. QR Code hanya valid untuk digunakan di lokasi dan waktu yang telah ditentukan.
              </p>
              <div className="font-semibold">4. Gunakan Fitur Izin dengan Benar</div>
              <p className="text-muted-foreground pl-4">
                Fitur pengajuan izin/sakit hanya boleh digunakan untuk alasan yang sah dan dapat dipertanggungjawabkan. Pengajuan yang tidak sesuai akan ditolak.
              </p>
               <div className="font-semibold">5. Sanksi Pelanggaran</div>
              <p className="text-muted-foreground pl-4">
                Setiap pelanggaran yang terbukti, seperti titip absen atau manipulasi data lokasi, akan dianggap sebagai tindakan indisipliner dan akan ditindaklanjuti oleh pimpinan sekolah.
              </p>
            </div>
          </DialogContent>
        </Dialog>
      </header>
    </>
  );
}
