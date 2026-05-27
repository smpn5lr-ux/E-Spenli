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
import { doc, updateDoc, setDoc } from 'firebase/firestore';
import { Loader2, Camera, Eye, EyeOff, Upload } from 'lucide-react';
import { useState, useEffect, useRef } from 'react';
import { useToast } from '@/hooks/use-toast';
import { updatePassword, updateProfile } from 'firebase/auth';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { Separator } from '@/components/ui/separator';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { PageWrapper } from '@/components/layout/page-wrapper';
import { useSettings } from '@/contexts/SettingsContext';
import { uploadFile } from '@/lib/storage';
import Image from 'next/image';

export default function PengaturanPage() {
  const { user, isUserLoading: isAuthLoading } = useUser();
  const firestore = useFirestore();
  const { toast } = useToast();
  const { setSchoolConfig } = useSettings();
  
  // --- STATE MANAGEMENT ---
  // Profile
  const [isProfileLoading, setIsProfileLoading] = useState(false);
  const [name, setName] = useState('');
  const [nip, setNip] = useState('');
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Password
  const [isPasswordLoading, setIsPasswordLoading] = useState(false);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showNewPass, setShowNewPass] = useState(false);
  const [showConfirmPass, setShowConfirmPass] = useState(false);

  // Admin Settings States
  const [isReportSaving, setIsReportSaving] = useState(false);
  const [isApiKeySaving, setIsApiKeySaving] = useState(false);
  const [isNotificationSaving, setIsNotificationSaving] = useState(false);
  const [isAppIconSaving, setIsAppIconSaving] = useState(false);
  const [isLoginSettingsSaving, setIsLoginSettingsSaving] = useState(false);
  
  // Report PDF
  const [governmentAgency, setGovernmentAgency] = useState('');
  const [educationAgency, setEducationAgency] = useState('');
  const [schoolName, setSchoolName] = useState('');
  const [address, setAddress] = useState('');
  const [headmasterName, setHeadmasterName] = useState('');
  const [headmasterNip, setHeadmasterNip] = useState('');
  const [reportCity, setReportCity] = useState('');
  
  // API Key
  const [geminiApiKey, setGeminiApiKey] = useState('');
  
  // Notification
  const [notificationTitle, setNotificationTitle] = useState('');
  const [notificationMessage, setNotificationMessage] = useState('');
  const [isNotificationActive, setIsNotificationActive] = useState(false);
  const [notificationDuration, setNotificationDuration] = useState(10);

  // App Icon
  const [appIconFile, setAppIconFile] = useState<File | null>(null);
  const [appIconPreview, setAppIconPreview] = useState<string | null>(null);
  const appIconInputRef = useRef<HTMLInputElement>(null);
  
  // Login Page
  const [loginTitle, setLoginTitle] = useState('');
  const [loginSubtitle, setLoginSubtitle] = useState('');
  const [loginLogoFile, setLoginLogoFile] = useState<File | null>(null);
  const [loginLogoPreview, setLoginLogoPreview] = useState<string | null>(null);
  const loginLogoInputRef = useRef<HTMLInputElement>(null);

  // --- DATA FETCHING ---
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
      // Report PDF
      setGovernmentAgency(schoolConfigData.governmentAgency ?? '');
      setEducationAgency(schoolConfigData.educationAgency ?? '');
      setSchoolName(schoolConfigData.schoolName ?? '');
      setAddress(schoolConfigData.address ?? '');
      setHeadmasterName(schoolConfigData.headmasterName ?? '');
      setHeadmasterNip(schoolConfigData.headmasterNip ?? '');
      setReportCity(schoolConfigData.reportCity ?? '');
      // API Key
      setGeminiApiKey(schoolConfigData.geminiApiKey ?? '');
      // App Icon
      setAppIconPreview(schoolConfigData.customAppIcon ?? null);
      // Login Page
      setLoginTitle(schoolConfigData.loginTitle ?? 'E-SPENLI');
      setLoginSubtitle(schoolConfigData.loginSubtitle ?? 'Absensi Online SMPN 5 Langke Rembong');
      setLoginLogoPreview(schoolConfigData.loginLogoUrl ?? null);
      // Admin Notification
      if (schoolConfigData.adminNotification) {
        setNotificationTitle(schoolConfigData.adminNotification.title ?? '');
        setNotificationMessage(schoolConfigData.adminNotification.message ?? '');
        setIsNotificationActive(schoolConfigData.adminNotification.isActive ?? false);
        setNotificationDuration(schoolConfigData.adminNotification.duration ?? 10);
      }
    }
  }, [schoolConfigData]);

  // --- HELPERS ---
  const getIdentifier = () => {
    if (!userData) return null;
    return userData.role === 'guru' ? { label: 'NIP', value: userData.nip } : null;
  }

  const getInitials = (name: string | undefined | null) => name ? name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase() : 'U';

  // --- FILE HANDLERS ---
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

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>, setFile: (file: File) => void, setPreview: (preview: string) => void, config: { maxSize: number, format?: string, formatErrorMsg?: string }) => {
    const file = e.target.files?.[0];
    if (file) {
        if (config.format && file.type !== config.format) {
            toast({ variant: 'destructive', title: 'Format Salah', description: config.formatErrorMsg || `Hanya format ${config.format} yang diperbolehkan.` });
            return;
        }
        if (file.size > config.maxSize) {
            toast({ variant: 'destructive', title: 'File Terlalu Besar', description: `Ukuran file tidak boleh melebihi ${config.maxSize / 1024 / 1024}MB.` });
            return;
        }
        setFile(file);
        const reader = new FileReader();
        reader.onloadend = () => {
            setPreview(reader.result as string);
        };
        reader.readAsDataURL(file);
    }
  }

  // --- ACTION HANDLERS ---
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
        // This is a base64 string, might need to upload it first if storing URLs
        firestoreUpdates.photoURL = photoPreview;
      }
      if (nip !== userData.nip) {
          firestoreUpdates.nip = nip;
      }
      
      const updatePromises: Promise<any>[] = [];
      if (Object.keys(authUpdates).length > 0 && user) {
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
        }
        toast({ variant: 'destructive', title: 'Gagal Mengubah Password', description, duration: 9000 });
      } finally {
        setIsPasswordLoading(false);
      }
    }
  };

  const handleSettingsSave = async (type: 'report' | 'apiKey' | 'notification' | 'appIcon' | 'loginPage') => {
    if (!schoolConfigRef) return;
    
    let dataToSave: any = {};
    let toastTitle = '';
    let toastDescription = '';
    const setLoading = (loading: boolean) => {
        if (type === 'report') setIsReportSaving(loading);
        if (type === 'apiKey') setIsApiKeySaving(loading);
        if (type === 'notification') setIsNotificationSaving(loading);
        if (type === 'appIcon') setIsAppIconSaving(loading);
        if (type === 'loginPage') setIsLoginSettingsSaving(loading);
    };

    setLoading(true);

    try {
        switch (type) {
            case 'report':
                dataToSave = { governmentAgency, educationAgency, schoolName, address, headmasterName, headmasterNip, reportCity };
                toastTitle = 'Pengaturan Laporan Disimpan';
                toastDescription = 'Informasi laporan PDF telah diperbarui.';
                break;
            case 'apiKey':
                dataToSave = { geminiApiKey };
                toastTitle = 'API Key Disimpan';
                toastDescription = 'API Key untuk kutipan berhasil diperbarui.';
                break;
            case 'notification':
                if (!notificationTitle.trim() || !notificationMessage.trim() || notificationDuration <= 0) {
                    toast({ variant: 'destructive', title: 'Gagal', description: 'Judul, pesan, dan durasi harus diisi dengan benar.' });
                    setLoading(false); return;
                }
                dataToSave = { adminNotification: { title: notificationTitle, message: notificationMessage, isActive: isNotificationActive, duration: notificationDuration } };
                toastTitle = 'Pemberitahuan Disimpan';
                toastDescription = 'Pengaturan pemberitahuan telah diperbarui.';
                break;
            case 'appIcon':
                dataToSave = { ...schoolConfigData }; // Start with existing data
                if (appIconFile) {
                    const result = await uploadFile(appIconFile, `settings/app-icon.png`);
                    dataToSave.customAppIcon = result.downloadURL;
                    setAppIconFile(null);
                }
                toastTitle = 'Logo Aplikasi Disimpan';
                toastDescription = 'Logo aplikasi telah berhasil diperbarui.';
                break;
            case 'loginPage':
                dataToSave = { ...schoolConfigData }; // Start with existing data
                if (loginLogoFile) {
                    const result = await uploadFile(loginLogoFile, `settings/login-logo.png`);
                    dataToSave.loginLogoUrl = result.downloadURL;
                    setLoginLogoFile(null);
                }
                dataToSave.loginTitle = loginTitle;
                dataToSave.loginSubtitle = loginSubtitle;
                toastTitle = 'Pengaturan Login Disimpan';
                toastDescription = 'Tampilan halaman login telah diperbarui.';
                break;
        }

        await setDoc(schoolConfigRef, dataToSave, { merge: true });
        setSchoolConfig(prev => ({ ...(prev || {}), ...dataToSave }));
        toast({ title: toastTitle, description: toastDescription });

    } catch (error) {
        console.error(`Error saving ${type} settings:`, error);
        toast({ variant: 'destructive', title: 'Gagal Menyimpan', description: 'Terjadi kesalahan saat menyimpan data.' });
    } finally {
        setLoading(false);
    }
  };

  // --- RENDER LOGIC ---
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
          {/* ... User Profile Form ... */}
        </section>

        <section>
         {/* ... Change Password Form ... */}
        </section>
        
        {isAdmin && (
          <div className="space-y-12">
            <Separator />

            <section>
              <div className="mb-6">
                <h2 className="text-2xl font-bold tracking-tight">Personalisasi Aplikasi</h2>
                <p className="text-muted-foreground">Atur tampilan dan nuansa aplikasi Anda di sini.</p>
              </div>
              <Card>
                <CardContent className="grid gap-8 pt-6">
                    {/* Login Page Settings */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6 items-start">
                        <div className="md:col-span-2 space-y-4">
                            <div className="space-y-2">
                                <Label htmlFor="login-title">Judul Halaman Login</Label>
                                <Input id="login-title" value={loginTitle} onChange={e => setLoginTitle(e.target.value)} />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="login-subtitle">Subjudul Halaman Login</Label>
                                <Input id="login-subtitle" value={loginSubtitle} onChange={e => setLoginSubtitle(e.target.value)} />
                            </div>
                        </div>
                        <div className="space-y-2">
                            <Label>Logo Halaman Login</Label>
                            <div className="flex flex-col items-center justify-center space-y-2">
                                <div className="relative w-24 h-24 rounded-full border bg-muted flex items-center justify-center overflow-hidden">
                                {loginLogoPreview ? (
                                    <Image src={loginLogoPreview} alt="Login Logo Preview" layout="fill" objectFit="cover" />
                                ) : (
                                    <p className="text-xs text-muted-foreground text-center p-2">Belum ada logo</p>
                                )}
                                </div>
                                <Button asChild variant="outline" size="sm">
                                    <label htmlFor="login-logo-upload" className="cursor-pointer">
                                        <Upload className="mr-2 h-4 w-4" />
                                        <span>Unggah Logo</span>
                                        <input id="login-logo-upload" type="file" accept="image/*" className="sr-only" ref={loginLogoInputRef} onChange={(e) => handleImageUpload(e, setLoginLogoFile, setLoginLogoPreview, { maxSize: 1 * 1024 * 1024 })} />
                                    </label>
                                </Button>
                            </div>
                        </div>
                    </div>
                    <Separator />
                    {/* App Icon Settings */}
                    <div className="flex items-center gap-4 sm:gap-6">
                        <div className="space-y-2">
                           <Label className="font-semibold">Logo Aplikasi (PWA)</Label>
                           <p className="text-sm text-muted-foreground">Ikon yang akan tampil saat aplikasi diinstal di perangkat. Format harus PNG.</p>
                        </div>
                        <div className="flex flex-col items-center justify-center space-y-2 ml-auto shrink-0">
                          <Avatar className="h-20 w-20 border rounded-lg">
                            <AvatarImage src={appIconPreview ?? '/logofix.png'} alt="App Icon Preview" />
                            <AvatarFallback>APP</AvatarFallback>
                          </Avatar>
                          <Button asChild variant="outline" size="sm">
                             <label htmlFor="app-icon-upload" className="cursor-pointer">
                                <Upload className="mr-2 h-4 w-4" />
                                <span>Unggah Ikon</span>
                                <input id="app-icon-upload" type="file" accept="image/png" className="sr-only" ref={appIconInputRef} onChange={(e) => handleImageUpload(e, setAppIconFile, setAppIconPreview, { maxSize: 1 * 1024 * 1024, format: 'image/png', formatErrorMsg: 'Logo harus berupa file PNG.' })} />
                            </label>
                          </Button>
                        </div>
                      </div>
                </CardContent>
                <CardFooter className="border-t px-6 py-4 flex-wrap gap-2">
                  <Button onClick={() => handleSettingsSave('loginPage')} disabled={isLoginSettingsSaving}>
                    {isLoginSettingsSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Simpan Pengaturan Login
                  </Button>
                  <Button onClick={() => handleSettingsSave('appIcon')} disabled={isAppIconSaving} variant="secondary">
                    {isAppIconSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Simpan Logo Aplikasi
                  </Button>
                </CardFooter>
              </Card>
            </section>

            <section>
             {/* ... PDF Report Settings Form ... */}
            </section>

            <section>
             {/* ... API Settings Form ... */}
            </section>

            <section>
             {/* ... Admin Notification Form ... */}
            </section>
          </div>
        )}
      </div>
    </PageWrapper>
  )
}
