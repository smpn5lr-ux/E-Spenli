
'use client';

import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useUser, useDoc, useFirestore, useMemoFirebase, setDocumentNonBlocking } from '@/firebase';
import { doc, updateDoc } from 'firebase/firestore';
import { Loader2, Camera, Eye, EyeOff } from 'lucide-react';
import { useState, useEffect, useRef } from 'react';
import { useToast } from '@/hooks/use-toast';
import { updatePassword, updateProfile } from 'firebase/auth';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import Image from 'next/image';
import { Separator } from '@/components/ui/separator';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';

export default function PengaturanPage() {
  const { user, isUserLoading: isAuthLoading } = useUser();
  const firestore = useFirestore();
  const { toast } = useToast();
  
  // State for password change
  const [isPasswordLoading, setIsPasswordLoading] = useState(false);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showNewPass, setShowNewPass] = useState(false);
  const [showConfirmPass, setShowConfirmPass] = useState(false);

  // State for profile update
  const [isProfileLoading, setIsProfileLoading] = useState(false);
  const [name, setName] = useState('');
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // State for report settings
  const [isReportSaving, setIsReportSaving] = useState(false);
  const [governmentAgency, setGovernmentAgency] = useState('');
  const [educationAgency, setEducationAgency] = useState('');
  const [schoolName, setSchoolName] = useState('');
  const [address, setAddress] = useState('');
  const [headmasterName, setHeadmasterName] = useState('');
  const [headmasterNip, setHeadmasterNip] = useState('');
  const [reportCity, setReportCity] = useState('');

  // State for API Key settings
  const [isApiKeySaving, setIsApiKeySaving] = useState(false);
  const [geminiApiKey, setGeminiApiKey] = useState('');
  
  // State for Admin Notification
  const [isNotificationSaving, setIsNotificationSaving] = useState(false);
  const [notificationTitle, setNotificationTitle] = useState('');
  const [notificationMessage, setNotificationMessage] = useState('');
  const [isNotificationActive, setIsNotificationActive] = useState(false);
  const [notificationDuration, setNotificationDuration] = useState(10);

  // Firestore refs
  const userDocRef = useMemoFirebase(() => {
    if (!user) return null;
    return doc(firestore, 'users', user.uid);
  }, [firestore, user]);

  const schoolConfigRef = useMemoFirebase(() => {
    if (!firestore || !user) return null;
    return doc(firestore, 'schoolConfig', 'default');
  }, [firestore, user]);

  // Data fetching hooks
  const { data: userData, isLoading: isUserDataLoading } = useDoc<{ 
      name: string;
      role: string;
      email: string;
      nip?: string;
      photoURL?: string;
  }>(user, userDocRef);

  const { data: schoolConfigData, isLoading: isConfigLoading } = useDoc<{
      governmentAgency: string;
      educationAgency: string;
      schoolName: string;
      address: string;
      headmasterName: string;
      headmasterNip: string;
      reportCity: string;
      geminiApiKey?: string;
      adminNotification?: {
          title: string;
          message: string;
          isActive: boolean;
          duration: number;
      };
  }>(user, schoolConfigRef);

  // Populate state from fetched data
  useEffect(() => {
    if (userData?.name) {
      setName(userData.name);
    }
  }, [userData?.name]);

  useEffect(() => {
    if (schoolConfigData) {
      setGovernmentAgency(schoolConfigData.governmentAgency ?? 'PEMERINTAH KABUPATEN MANGGARAI');
      setEducationAgency(schoolConfigData.educationAgency ?? 'DINAS PENDIDIKAN, KEPEMUDAAN DAN OLAHRAGA');
      setSchoolName(schoolConfigData.schoolName ?? 'SMP NEGERI 5 LANGKE REMBONG');
      setAddress(schoolConfigData.address ?? 'Jl. Ranaka, Karot, Langke Rembong, Kabupaten Manggarai, Nusa Tenggara Tim.');
      setHeadmasterName(schoolConfigData.headmasterName ?? 'Fransiskus Sales, S.Pd');
      setHeadmasterNip(schoolConfigData.headmasterNip ?? '196805121994121004');
      setReportCity(schoolConfigData.reportCity ?? 'Mando');
      setGeminiApiKey(schoolConfigData.geminiApiKey ?? '');
      if (schoolConfigData.adminNotification) {
        setNotificationTitle(schoolConfigData.adminNotification.title ?? '');
        setNotificationMessage(schoolConfigData.adminNotification.message ?? '');
        setIsNotificationActive(schoolConfigData.adminNotification.isActive ?? false);
        setNotificationDuration(schoolConfigData.adminNotification.duration ?? 10);
      }
    }
  }, [schoolConfigData]);

  const getIdentifier = () => {
    if (!userData) return null;
    switch(userData.role) {
      case 'guru':
        return { label: 'NIP', value: userData.nip };
      default:
        return null;
    }
  }

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      // Tighter file size check to account for base64 encoding overhead.
      // Firestore document limit is 1MiB. Base64 is ~33% larger. 750KB is a safe limit.
      if (file.size > 750 * 1024) {
          toast({
              variant: 'destructive',
              title: 'File Terlalu Besar',
              description: 'Ukuran foto profil tidak boleh melebihi 750KB.',
          });
          return;
      }
      const reader = new FileReader();
      reader.onloadend = () => {
        setPhotoPreview(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleProfileUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !userDocRef) return;
    setIsProfileLoading(true);

    try {
      const authUpdates: { displayName?: string } = {};
      const firestoreUpdates: { name?: string; photoURL?: string } = {};

      if (name && name !== (user.displayName || userData?.name)) {
        authUpdates.displayName = name;
        firestoreUpdates.name = name;
      }
      if (photoPreview) {
        firestoreUpdates.photoURL = photoPreview;
      }

      const updatePromises: Promise<any>[] = [];
      if (Object.keys(authUpdates).length > 0) {
        updatePromises.push(updateProfile(user, authUpdates));
      }
      if (Object.keys(firestoreUpdates).length > 0) {
        // Use awaited updateDoc to catch potential errors (like document size limit)
        updatePromises.push(updateDoc(userDocRef, firestoreUpdates));
      }
      
      if (updatePromises.length > 0) {
          await Promise.all(updatePromises);
          toast({
            title: 'Berhasil',
            description: 'Profil Anda telah berhasil diperbarui.',
          });
      }
      
      setPhotoPreview(null);
    } catch (error: any) {
      console.error("Profile update error", error);
      let description = 'Terjadi kesalahan. Ukuran file foto mungkin terlalu besar atau format tidak didukung.';
      if (error.code === 'auth/requires-recent-login') {
          description = 'Sesi Anda sudah terlalu lama. Untuk keamanan, silakan logout dan login kembali.';
      }
      toast({
        variant: 'destructive',
        title: 'Gagal Memperbarui Profil',
        description: description,
      });
    } finally {
      setIsProfileLoading(false);
    }
  };

  const handlePasswordChange = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword !== confirmPassword) {
      toast({ variant: 'destructive', title: 'Gagal', description: 'Konfirmasi password baru tidak cocok.' });
      return;
    }
    if (newPassword.length < 6) {
        toast({ variant: 'destructive', title: 'Gagal', description: 'Password baru minimal harus 6 karakter.' });
        return;
    }
    setIsPasswordLoading(true);
    if (user) {
      try {
        await updatePassword(user, newPassword);
        toast({ title: 'Berhasil', description: 'Password Anda telah berhasil diubah.' });
        setNewPassword('');
        setConfirmPassword('');
      } catch (error: any) {
        console.error("Password change error", error);
        let description = 'Terjadi kesalahan yang tidak diketahui. Coba lagi nanti.';
        if (error.code === 'auth/requires-recent-login') {
            description = 'Sesi Anda sudah terlalu lama. Untuk keamanan, silakan logout dan login kembali sebelum mencoba mengubah password.';
        }
        toast({ 
            variant: 'destructive', 
            title: 'Gagal Mengubah Password', 
            description: description,
            duration: 9000,
        });
      } finally {
        setIsPasswordLoading(false);
      }
    }
  };

  const handleReportSettingsSave = () => {
    if (!schoolConfigRef) return;
    setIsReportSaving(true);
    setDocumentNonBlocking(schoolConfigRef, {
      governmentAgency,
      educationAgency,
      schoolName,
      address,
      headmasterName,
      headmasterNip,
      reportCity,
    }, { merge: true });
    toast({
      title: 'Pengaturan Disimpan',
      description: 'Informasi laporan PDF telah berhasil diperbarui.',
    });
    setIsReportSaving(false);
  };

  const handleApiKeySave = () => {
    if (!schoolConfigRef) return;
    setIsApiKeySaving(true);
    setDocumentNonBlocking(schoolConfigRef, {
      geminiApiKey,
    }, { merge: true });
    toast({
      title: 'API Key Disimpan',
      description: 'API Key untuk kutipan berhasil diperbarui.',
    });
    setIsApiKeySaving(false);
  };
  
  const handleNotificationSave = () => {
    if (!schoolConfigRef) return;
    setIsNotificationSaving(true);
    
    if (!notificationTitle.trim() || !notificationMessage.trim()) {
        toast({
            variant: 'destructive',
            title: 'Gagal',
            description: 'Judul dan isi pemberitahuan tidak boleh kosong.',
        });
        setIsNotificationSaving(false);
        return;
    }
    if (notificationDuration <= 0) {
        toast({
            variant: 'destructive',
            title: 'Gagal',
            description: 'Durasi harus lebih besar dari 0 detik.',
        });
        setIsNotificationSaving(false);
        return;
    }

    setDocumentNonBlocking(schoolConfigRef, {
      adminNotification: {
        title: notificationTitle,
        message: notificationMessage,
        isActive: isNotificationActive,
        duration: notificationDuration,
      }
    }, { merge: true });
    
    toast({
      title: 'Pemberitahuan Disimpan',
      description: 'Pengaturan pemberitahuan untuk pengguna telah berhasil diperbarui.',
    });
    setIsNotificationSaving(false);
  };

  const getInitials = (name: string | undefined | null) => {
    if (!name) return 'U';
    return name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase();
  }

  const isLoading = isUserDataLoading || isAuthLoading || isConfigLoading;
  const isAdmin = userData?.role === 'admin';
  const currentPhoto = photoPreview || userData?.photoURL || user?.photoURL;
  const identifierInfo = getIdentifier();

  if (isLoading) {
    return (
      <div className="flex h-full w-full items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="grid gap-6">
      <form onSubmit={handleProfileUpdate}>
        <Card>
          <CardHeader>
            <CardTitle>Profil Pengguna</CardTitle>
            <CardDescription>
              Informasi ini akan ditampilkan di seluruh aplikasi.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-6">
            <div className="flex items-center gap-4 sm:gap-6">
                <div className="relative shrink-0">
                  <Avatar className="h-20 w-20 sm:h-24 sm:w-24 border">
                    <AvatarImage src={currentPhoto ?? undefined} alt="User Avatar" />
                    <AvatarFallback>{getInitials(name)}</AvatarFallback>
                  </Avatar>
                  <Button
                    type="button"
                    size="icon"
                    variant="outline"
                    className="absolute -bottom-1 -right-1 rounded-full h-8 w-8 border-2 bg-background hover:bg-muted"
                    onClick={() => fileInputRef.current?.click()}
                  >
                    <Camera className="h-4 w-4" />
                    <span className="sr-only">Ganti Foto</span>
                  </Button>
                  <input
                    type="file"
                    ref={fileInputRef}
                    className="hidden"
                    accept="image/png, image/jpeg, image/gif"
                    onChange={handleFileChange}
                  />
                </div>
                <div className="space-y-1">
                   <Label className="font-semibold">Foto Profil</Label>
                   <p className="text-sm text-muted-foreground">
                      Klik ikon kamera untuk mengganti foto. <br className="hidden sm:block" />
                      (PNG, JPG, GIF, maks 750KB)
                  </p>
                </div>
              </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                    <Label htmlFor="fullName">Nama Lengkap (dengan gelar)</Label>
                    <Input id="fullName" value={name} onChange={(e) => setName(e.target.value)} />
                </div>
                 <div className="space-y-2">
                    <Label htmlFor="role">Peran</Label>
                    <Input id="role" value={userData?.role ? userData.role.charAt(0).toUpperCase() + userData.role.slice(1) : ''} readOnly />
                </div>
            </div>
            <div className={`grid grid-cols-1 ${identifierInfo ? 'sm:grid-cols-2' : ''} gap-4`}>
                <div className={`space-y-2 ${!identifierInfo ? 'sm:col-span-2' : ''}`}>
                    <Label htmlFor="email">Email</Label>
                    <Input id="email" type="email" value={userData?.email || ''} readOnly />
                </div>
                {identifierInfo && (
                  <div className="space-y-2">
                      <Label htmlFor="identifier">{identifierInfo.label}</Label>
                      <Input id="identifier" value={identifierInfo.value || ''} readOnly />
                  </div>
                )}
            </div>
          </CardContent>
          <CardFooter className="border-t px-6 py-4">
            <Button type="submit" disabled={isProfileLoading}>
              <span className="flex items-center justify-center">
                {isProfileLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Simpan Profil
              </span>
            </Button>
          </CardFooter>
        </Card>
      </form>
      
      {isAdmin && (
        <div className="grid gap-6"> {/* Wrapper for admin cards */}
          <Card>
              <CardHeader>
                  <CardTitle>Pengaturan Laporan PDF</CardTitle>
                  <CardDescription>Informasi ini akan digunakan pada kop dan footer laporan PDF.</CardDescription>
              </CardHeader>
              <CardContent className="grid gap-4">
                  <div className="space-y-2">
                      <Label htmlFor="government-agency">Instansi Pemerintah</Label>
                      <Input id="government-agency" value={governmentAgency} onChange={e => setGovernmentAgency(e.target.value)} placeholder="PEMERINTAH KABUPATEN MANGGARAI" />
                  </div>
                  <div className="space-y-2">
                      <Label htmlFor="education-agency">Dinas Pendidikan</Label>
                      <Input id="education-agency" value={educationAgency} onChange={e => setEducationAgency(e.target.value)} placeholder="DINAS PENDIDIKAN, KEPEMUDAAN DAN OLAHRAGA" />
                  </div>
                  <div className="space-y-2">
                      <Label htmlFor="school-name">Nama Sekolah</Label>
                      <Input id="school-name" value={schoolName} onChange={e => setSchoolName(e.target.value)} placeholder="SMP NEGERI 5 LANGKE REMBONG" />
                  </div>
                  <div className="space-y-2">
                      <Label htmlFor="address">Alamat Sekolah</Label>
                      <Input id="address" value={address} onChange={e => setAddress(e.target.value)} placeholder="Jl. Ranaka, Karot, Langke Rembong..." />
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div className="space-y-2">
                          <Label htmlFor="report-city">Kota Laporan</Label>
                          <Input id="report-city" value={reportCity} onChange={e => setReportCity(e.target.value)} placeholder="Contoh: Mando" />
                      </div>
                      <div className="space-y-2">
                          <Label htmlFor="headmaster-name">Nama Kepala Sekolah</Label>
                          <Input id="headmaster-name" value={headmasterName} onChange={e => setHeadmasterName(e.target.value)} placeholder="Fransiskus Sales, S.Pd" />
                      </div>
                  </div>
                  <div className="space-y-2">
                      <Label htmlFor="headmaster-nip">NIP Kepala Sekolah</Label>
                      <Input id="headmaster-nip" value={headmasterNip} onChange={e => setHeadmasterNip(e.target.value)} placeholder="196805121994121004" />
                  </div>
              </CardContent>
              <CardFooter className="border-t px-6 py-4">
                  <Button onClick={handleReportSettingsSave} disabled={isReportSaving}>
                    <span className="flex items-center justify-center">
                      {isReportSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                      Simpan Pengaturan Laporan
                    </span>
                  </Button>
              </CardFooter>
          </Card>

          <Card>
            <CardHeader>
                <CardTitle>Pengaturan API</CardTitle>
                <CardDescription>Kelola API Key untuk layanan eksternal seperti kutipan motivasi.</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4">
                <div className="space-y-2">
                    <Label htmlFor="gemini-api-key">API Key Kutipan (Gemini)</Label>
                    <Input id="gemini-api-key" value={geminiApiKey} onChange={e => setGeminiApiKey(e.target.value)} placeholder="Masukkan API Key Anda" />
                </div>
            </CardContent>
            <CardFooter className="border-t px-6 py-4">
                <Button onClick={handleApiKeySave} disabled={isApiKeySaving}>
                  <span className="flex items-center justify-center">
                    {isApiKeySaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Simpan API Key
                  </span>
                </Button>
            </CardFooter>
          </Card>

          <Card>
            <CardHeader>
                <CardTitle>Pemberitahuan Admin</CardTitle>
                <CardDescription>Kirim pengumuman singkat kepada semua pengguna yang akan muncul di halaman beranda.</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4">
                <div className="flex items-center space-x-4 rounded-md border p-4">
                    <div className="flex-1 space-y-1">
                        <p className="text-sm font-medium leading-none">Status Pemberitahuan</p>
                        <p className="text-sm text-muted-foreground">
                        {isNotificationActive ? "Pengguna akan melihat pesan ini." : "Pesan saat ini disembunyikan dari pengguna."}
                        </p>
                    </div>
                    <Switch
                        checked={isNotificationActive}
                        onCheckedChange={setIsNotificationActive}
                        aria-label="Aktifkan pemberitahuan"
                    />
                </div>
                <div className="space-y-2">
                    <Label htmlFor="notification-title">Judul Pesan</Label>
                    <Input id="notification-title" value={notificationTitle} onChange={e => setNotificationTitle(e.target.value)} placeholder="Contoh: Info Penting" />
                </div>
                <div className="space-y-2">
                    <Label htmlFor="notification-message">Isi Pesan</Label>
                    <Textarea
                        id="notification-message"
                        value={notificationMessage}
                        onChange={e => setNotificationMessage(e.target.value)}
                        placeholder="Contoh: Akan ada pemeliharaan sistem malam ini."
                        className="min-h-[80px]"
                    />
                </div>
                <div className="space-y-2">
                    <Label htmlFor="notification-duration">Durasi Tampil (detik)</Label>
                    <Input
                        id="notification-duration"
                        type="number"
                        value={notificationDuration}
                        onChange={e => setNotificationDuration(Number(e.target.value))}
                        placeholder="Contoh: 15"
                    />
                </div>
            </CardContent>
            <CardFooter className="border-t px-6 py-4">
                <Button onClick={handleNotificationSave} disabled={isNotificationSaving}>
                  <span className="flex items-center justify-center">
                    {isNotificationSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Simpan Pemberitahuan
                  </span>
                </Button>
            </CardFooter>
          </Card>

        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Ganti Password</CardTitle>
          <CardDescription>
            Untuk keamanan, gunakan password yang kuat dan unik.
          </CardDescription>
        </CardHeader>
        <form onSubmit={handlePasswordChange}>
          <CardContent className="grid gap-4">
              <div className="space-y-2">
                <Label htmlFor="new-password">Password Baru</Label>
                <div className="relative">
                  <Input id="new-password" type={showNewPass ? "text" : "password"} value={newPassword} onChange={(e) => setNewPassword(e.target.value)} placeholder="Minimal 6 karakter" />
                  <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="absolute inset-y-0 right-0 h-full px-3 text-muted-foreground"
                      onClick={() => setShowNewPass(!showNewPass)}
                  >
                      {showNewPass ? <EyeOff /> : <Eye />}
                      <span className="sr-only">Tampilkan password</span>
                  </Button>
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="confirm-password">Konfirmasi Password Baru</Label>
                <div className="relative">
                  <Input id="confirm-password" type={showConfirmPass ? "text" : "password"} value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} placeholder="Ulangi password baru" />
                   <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="absolute inset-y-0 right-0 h-full px-3 text-muted-foreground"
                      onClick={() => setShowConfirmPass(!showConfirmPass)}
                  >
                      {showConfirmPass ? <EyeOff /> : <Eye />}
                      <span className="sr-only">Tampilkan password</span>
                  </Button>
                </div>
              </div>
          </CardContent>
          <CardFooter className="border-t px-6 py-4">
            <Button type="submit" disabled={isPasswordLoading}>
              <span className="flex items-center justify-center">
                {isPasswordLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Simpan Password
              </span>
            </Button>
          </CardFooter>
        </form>
      </Card>
    </div>
  )
}
