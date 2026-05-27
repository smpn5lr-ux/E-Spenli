'use client';

import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardFooter,
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
import { Separator } from '@/components/ui/separator';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { PageWrapper } from '@/components/layout/page-wrapper';

export default function PengaturanPage() {
  const { user, isUserLoading: isAuthLoading } = useUser();
  const firestore = useFirestore();
  const { toast } = useToast();
  
  const [isPasswordLoading, setIsPasswordLoading] = useState(false);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showNewPass, setShowNewPass] = useState(false);
  const [showConfirmPass, setShowConfirmPass] = useState(false);

  const [isProfileLoading, setIsProfileLoading] = useState(false);
  const [name, setName] = useState('');
  const [nip, setNip] = useState(''); // State for NIP
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [isReportSaving, setIsReportSaving] = useState(false);
  const [governmentAgency, setGovernmentAgency] = useState('');
  const [educationAgency, setEducationAgency] = useState('');
  const [schoolName, setSchoolName] = useState('');
  const [address, setAddress] = useState('');
  const [headmasterName, setHeadmasterName] = useState('');
  const [headmasterNip, setHeadmasterNip] = useState('');
  const [reportCity, setReportCity] = useState('');

  const [isApiKeySaving, setIsApiKeySaving] = useState(false);
  const [geminiApiKey, setGeminiApiKey] = useState('');
  
  const [isNotificationSaving, setIsNotificationSaving] = useState(false);
  const [notificationTitle, setNotificationTitle] = useState('');
  const [notificationMessage, setNotificationMessage] = useState('');
  const [isNotificationActive, setIsNotificationActive] = useState(false);
  const [notificationDuration, setNotificationDuration] = useState(10);

  const userDocRef = useMemoFirebase(() => user ? doc(firestore, 'users', user.uid) : null, [firestore, user]);
  const schoolConfigRef = useMemoFirebase(() => firestore ? doc(firestore, 'schoolConfig', 'default') : null, [firestore]);

  const { data: userData, isLoading: isUserDataLoading } = useDoc<{ name: string; role: string; email: string; nip?: string; photoURL?: string; }>(user, userDocRef);
  const { data: schoolConfigData, isLoading: isConfigLoading } = useDoc<any>(user, schoolConfigRef);

  useEffect(() => {
    if (userData) {
      setName(userData.name || '');
      setNip(userData.nip || '');
    }
  }, [userData]);

  useEffect(() => {
    if (schoolConfigData) {
      setGovernmentAgency(schoolConfigData.governmentAgency ?? '');
      setEducationAgency(schoolConfigData.educationAgency ?? '');
      setSchoolName(schoolConfigData.schoolName ?? '');
      setAddress(schoolConfigData.address ?? '');
      setHeadmasterName(schoolConfigData.headmasterName ?? '');
      setHeadmasterNip(schoolConfigData.headmasterNip ?? '');
      setReportCity(schoolConfigData.reportCity ?? '');
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
    return userData.role === 'guru' ? { label: 'NIP', value: userData.nip } : null;
  }

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      if (file.size > 750 * 1024) {
          toast({ variant: 'destructive', title: 'File Terlalu Besar', description: 'Ukuran foto profil tidak boleh melebihi 750KB.' });
          return;
      }
      const reader = new FileReader();
      reader.onloadend = () => setPhotoPreview(reader.result as string);
      reader.readAsDataURL(file);
    }
  };

  const handleProfileUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !userDocRef || !userData) return;
    setIsProfileLoading(true);
    try {
      const authUpdates: { displayName?: string } = {};
      const firestoreUpdates: { name?: string; photoURL?: string; nip?: string; } = {};
      if (name !== userData.name) {
        authUpdates.displayName = name;
        firestoreUpdates.name = name;
      }
      if (photoPreview) {
        firestoreUpdates.photoURL = photoPreview;
      }
      if (nip !== userData.nip) {
          firestoreUpdates.nip = nip;
      }
      
      const updatePromises: Promise<any>[] = [];
      if (Object.keys(authUpdates).length > 0) {
        updatePromises.push(updateProfile(user, authUpdates));
      }
      if (Object.keys(firestoreUpdates).length > 0) {
        updatePromises.push(updateDoc(userDocRef, firestoreUpdates));
      }
      
      if (updatePromises.length > 0) {
          await Promise.all(updatePromises);
          toast({ title: 'Berhasil', description: 'Profil Anda telah berhasil diperbarui.' });
      }
      setPhotoPreview(null);
    } catch (error: any) {
      console.error("Profile update error", error);
      let description = 'Terjadi kesalahan. Coba lagi nanti.';
      if (error.code === 'auth/requires-recent-login') {
          description = 'Sesi Anda sudah terlalu lama. Silakan logout dan login kembali untuk memperbarui profil.';
      }
      toast({ variant: 'destructive', title: 'Gagal Memperbarui Profil', description });
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
        let description = 'Terjadi kesalahan. Coba lagi nanti.';
        if (error.code === 'auth/requires-recent-login') {
            description = 'Untuk keamanan, Anda harus login kembali sebelum mengubah password. Silakan logout dan login ulang.';
        } else if (error.message) {
            description = `Terjadi kesalahan: ${error.message}`;
        }
        toast({ variant: 'destructive', title: 'Gagal Mengubah Password', description, duration: 9000 });
      } finally {
        setIsPasswordLoading(false);
      }
    }
  };

  const handleSettingsSave = (type: 'report' | 'apiKey' | 'notification') => {
    if (!schoolConfigRef) return;
    let dataToSave = {};
    let toastTitle = '';
    let toastDescription = '';
    
    switch (type) {
        case 'report':
            setIsReportSaving(true);
            dataToSave = { governmentAgency, educationAgency, schoolName, address, headmasterName, headmasterNip, reportCity };
            toastTitle = 'Pengaturan Laporan Disimpan';
            toastDescription = 'Informasi laporan PDF telah diperbarui.';
            break;
        case 'apiKey':
            setIsApiKeySaving(true);
            dataToSave = { geminiApiKey };
            toastTitle = 'API Key Disimpan';
            toastDescription = 'API Key untuk kutipan berhasil diperbarui.';
            break;
        case 'notification':
            setIsNotificationSaving(true);
             if (!notificationTitle.trim() || !notificationMessage.trim() || notificationDuration <= 0) {
                toast({ variant: 'destructive', title: 'Gagal', description: 'Judul, pesan, dan durasi harus diisi dengan benar.' });
                setIsNotificationSaving(false);
                return;
            }
            dataToSave = { adminNotification: { title: notificationTitle, message: notificationMessage, isActive: isNotificationActive, duration: notificationDuration } };
            toastTitle = 'Pemberitahuan Disimpan';
            toastDescription = 'Pengaturan pemberitahuan telah diperbarui.';
            break;
    }

    setDocumentNonBlocking(schoolConfigRef, dataToSave, { merge: true });
    toast({ title: toastTitle, description: toastDescription });

    if (type === 'report') setIsReportSaving(false);
    if (type === 'apiKey') setIsApiKeySaving(false);
    if (type === 'notification') setIsNotificationSaving(false);
  };

  const getInitials = (name: string | undefined | null) => name ? name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase() : 'U';

  const isLoading = isUserDataLoading || isAuthLoading || isConfigLoading;
  const isAdmin = userData?.role === 'admin';
  const currentPhoto = photoPreview || userData?.photoURL || user?.photoURL;
  const identifierInfo = getIdentifier();

  if (isLoading) {
    return (
      <PageWrapper>
        <div className="flex h-full w-full items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </PageWrapper>
    );
  }

  return (
    <PageWrapper>
      <div className="space-y-12">
        
        <section>
          <div className="mb-6">
            <h2 className="text-2xl font-bold tracking-tight">Profil Pengguna</h2>
            <p className="text-muted-foreground">Informasi ini akan ditampilkan di seluruh aplikasi.</p>
          </div>
          <form onSubmit={handleProfileUpdate}>
            <Card className="w-full">
              <CardContent className="grid gap-6 pt-6">
                <div className="flex items-center gap-4 sm:gap-6">
                    <div className="relative shrink-0">
                      <Avatar className="h-20 w-20 sm:h-24 sm:w-24 border">
                        <AvatarImage src={currentPhoto ?? undefined} alt="User Avatar" />
                        <AvatarFallback>{getInitials(name)}</AvatarFallback>
                      </Avatar>
                      <Button type="button" size="icon" variant="outline" className="absolute -bottom-1 -right-1 rounded-full h-8 w-8 border-2 bg-background hover:bg-muted" onClick={() => fileInputRef.current?.click()}>
                        <Camera className="h-4 w-4" />
                        <span className="sr-only">Ganti Foto</span>
                      </Button>
                      <input type="file" ref={fileInputRef} className="hidden" accept="image/png, image/jpeg, image/gif" onChange={handleFileChange} />
                    </div>
                    <div className="space-y-1">
                       <Label className="font-semibold">Foto Profil</Label>
                       <p className="text-sm text-muted-foreground">Klik ikon kamera untuk mengganti foto.<br className="hidden sm:block" />(PNG, JPG, GIF, maks 750KB)</p>
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
                          <Input id="identifier" value={nip} onChange={(e) => setNip(e.target.value)} />
                      </div>
                    )}
                </div>
              </CardContent>
              <CardFooter className="border-t px-6 py-4">
                <Button type="submit" disabled={isProfileLoading}>{isProfileLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Simpan Profil</Button>
              </CardFooter>
            </Card>
          </form>
        </section>

        <section>
          <div className="mb-6">
            <h2 className="text-2xl font-bold tracking-tight">Ganti Password</h2>
            <p className="text-muted-foreground">Untuk keamanan, gunakan password yang kuat dan unik.</p>
          </div>
          <form onSubmit={handlePasswordChange}>
            <Card>
              <CardContent className="grid gap-4 pt-6">
                  <div className="space-y-2">
                    <Label htmlFor="new-password">Password Baru</Label>
                    <div className="relative"><Input id="new-password" type={showNewPass ? "text" : "password"} value={newPassword} onChange={(e) => setNewPassword(e.target.value)} placeholder="Minimal 6 karakter" /><Button type="button" variant="ghost" size="icon" className="absolute inset-y-0 right-0 h-full px-3 text-muted-foreground" onClick={() => setShowNewPass(!showNewPass)}>{showNewPass ? <EyeOff /> : <Eye />}<span className="sr-only">Tampilkan</span></Button></div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="confirm-password">Konfirmasi Password Baru</Label>
                    <div className="relative"><Input id="confirm-password" type={showConfirmPass ? "text" : "password"} value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} placeholder="Ulangi password baru" /><Button type="button" variant="ghost" size="icon" className="absolute inset-y-0 right-0 h-full px-3 text-muted-foreground" onClick={() => setShowConfirmPass(!showConfirmPass)}>{showConfirmPass ? <EyeOff /> : <Eye />}<span className="sr-only">Tampilkan</span></Button></div>
                  </div>
              </CardContent>
              <CardFooter className="border-t px-6 py-4">
                <Button type="submit" disabled={isPasswordLoading}>{isPasswordLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Simpan Password</Button>
              </CardFooter>
            </Card>
          </form>
        </section>
        
        {isAdmin && (
          <div className="space-y-12">
            <Separator />
            <section>
              <div className="mb-6">
                <h2 className="text-2xl font-bold tracking-tight">Pengaturan Laporan PDF</h2>
                <p className="text-muted-foreground">Informasi ini akan digunakan pada kop dan footer laporan PDF.</p>
              </div>
              <Card>
                  <CardContent className="grid gap-4 pt-6">
                      <div className="space-y-2"><Label htmlFor="government-agency">Instansi Pemerintah</Label><Input id="government-agency" value={governmentAgency} onChange={e => setGovernmentAgency(e.target.value)} /></div>
                      <div className="space-y-2"><Label htmlFor="education-agency">Dinas Pendidikan</Label><Input id="education-agency" value={educationAgency} onChange={e => setEducationAgency(e.target.value)} /></div>
                      <div className="space-y-2"><Label htmlFor="school-name">Nama Sekolah</Label><Input id="school-name" value={schoolName} onChange={e => setSchoolName(e.target.value)} /></div>
                      <div className="space-y-2"><Label htmlFor="address">Alamat Sekolah</Label><Input id="address" value={address} onChange={e => setAddress(e.target.value)} /></div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                          <div className="space-y-2"><Label htmlFor="report-city">Kota Laporan</Label><Input id="report-city" value={reportCity} onChange={e => setReportCity(e.target.value)} /></div>
                          <div className="space-y-2"><Label htmlFor="headmaster-name">Nama Kepala Sekolah</Label><Input id="headmaster-name" value={headmasterName} onChange={e => setHeadmasterName(e.target.value)} /></div>
                      </div>
                      <div className="space-y-2"><Label htmlFor="headmaster-nip">NIP Kepala Sekolah</Label><Input id="headmaster-nip" value={headmasterNip} onChange={e => setHeadmasterNip(e.target.value)} /></div>
                  </CardContent>
                  <CardFooter className="border-t px-6 py-4"><Button onClick={() => handleSettingsSave('report')} disabled={isReportSaving}>{isReportSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Simpan Pengaturan Laporan</Button></CardFooter>
              </Card>
            </section>

            <section>
              <div className="mb-6">
                <h2 className="text-2xl font-bold tracking-tight">Pengaturan API</h2>
                <p className="text-muted-foreground">Kelola API Key untuk layanan eksternal seperti kutipan motivasi.</p>
              </div>
              <Card>
                <CardContent className="grid gap-4 pt-6">
                    <div className="space-y-2"><Label htmlFor="gemini-api-key">API Key Kutipan (Gemini)</Label><Input id="gemini-api-key" value={geminiApiKey} onChange={e => setGeminiApiKey(e.target.value)} placeholder="Masukkan API Key Anda" /></div>
                </CardContent>
                <CardFooter className="border-t px-6 py-4"><Button onClick={() => handleSettingsSave('apiKey')} disabled={isApiKeySaving}>{isApiKeySaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Simpan API Key</Button></CardFooter>
              </Card>
            </section>

            <section>
              <div className="mb-6">
                <h2 className="text-2xl font-bold tracking-tight">Pemberitahuan Admin</h2>
                <p className="text-muted-foreground">Kirim pengumuman singkat kepada semua pengguna di halaman beranda.</p>
              </div>
              <Card>
                <CardContent className="grid gap-4 pt-6">
                    <div className="flex items-center space-x-4 rounded-md border p-4"><div className="flex-1 space-y-1"><p className="text-sm font-medium leading-none">Status Pemberitahuan</p><p className="text-sm text-muted-foreground">{isNotificationActive ? "Pesan ini aktif." : "Pesan ini disembunyikan."}</p></div><Switch checked={isNotificationActive} onCheckedChange={setIsNotificationActive} /></div>
                    <div className="space-y-2"><Label htmlFor="notification-title">Judul Pesan</Label><Input id="notification-title" value={notificationTitle} onChange={e => setNotificationTitle(e.target.value)} /></div>
                    <div className="space-y-2"><Label htmlFor="notification-message">Isi Pesan</Label><Textarea id="notification-message" value={notificationMessage} onChange={e => setNotificationMessage(e.target.value)} className="min-h-[80px]" /></div>
                    <div className="space-y-2"><Label htmlFor="notification-duration">Durasi Tampil (detik)</Label><Input id="notification-duration" type="number" value={notificationDuration} onChange={e => setNotificationDuration(Number(e.target.value))} /></div>
                </CardContent>
                <CardFooter className="border-t px-6 py-4"><Button onClick={() => handleSettingsSave('notification')} disabled={isNotificationSaving}>{isNotificationSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Simpan Pemberitahuan</Button></CardFooter>
              </Card>
            </section>
          </div>
        )}
      </div>
    </PageWrapper>
  )
}
