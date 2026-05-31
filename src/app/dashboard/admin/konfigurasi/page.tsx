'use client';

import { useState, useEffect, useMemo } from 'react';
import QRCode from 'qrcode';
import Image from 'next/image';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Download, Loader2, RefreshCw, LocateFixed, ChevronLeft, ChevronRight } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useFirestore, useDoc, useMemoFirebase, useUser, setDocumentNonBlocking } from '@/firebase';
import { doc, writeBatch, setDoc, deleteDoc, collection, serverTimestamp } from 'firebase/firestore';
import { useRouter } from 'next/navigation';
import { Checkbox } from '@/components/ui/checkbox';
import { format, eachDayOfInterval, startOfMonth, addMonths, subMonths } from 'date-fns';
import { id } from 'date-fns/locale';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Table, TableBody, TableCell, TableRow } from '@/components/ui/table';
import { TooltipProvider } from "@/components/ui/tooltip";
import { useSettings } from '@/contexts/SettingsContext';
import { DEFAULT_WEIGHTS } from '@/lib/attendance';

// --- Days of Week (Helper) ---
const daysOfWeek = [
    { value: 0, label: 'Minggu' }, { value: 1, label: 'Senin' }, { value: 2, label: 'Selasa' }, 
    { value: 3, label: 'Rabu' }, { value: 4, label: 'Kamis' }, { value: 5, label: 'Jumat' }, { value: 6, label: 'Sabtu' },
];

// =======================================================================================
// FINAL REWRITE: The Calendar now uses the reliable `useSettings` context for its display
// while still writing directly to Firestore. This creates a closed loop.
// 1. Action: User clicks checkbox -> `handleDayToggle` writes to Firestore.
// 2. Reaction: Firestore updates -> `SettingsContext` gets the update in real-time.
// 3. Display: `useSettings` provides the updated holiday Set -> Calendar re-renders instantly.
// =======================================================================================
function SyncedMonthlyCalendar() {
  const { toast } = useToast();
  const firestore = useFirestore();

  // GET DATA FROM THE CONTEXT (Single Source of Truth)
  const { schoolConfig, holidays, isSettingsLoading } = useSettings();

  const [currentMonth, setCurrentMonth] = useState(startOfMonth(new Date()));
  const [isSaving, setIsSaving] = useState(false); // For disabling buttons during an operation

  const allDaysInMonth = useMemo(() => eachDayOfInterval({ 
      start: startOfMonth(currentMonth), 
      end: new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 0) 
  }), [currentMonth]);

  // The core logic for handling a day toggle.
  const handleDayToggle = async (day: Date, checked: boolean) => {
    if (!firestore) return;
    
    setIsSaving(true);
    const dayString = format(day, 'yyyy-MM-dd');
    const holidayDocRef = doc(firestore, 'holidays', dayString);

    try {
      if (checked) {
        // If checked, CREATE a document in the 'holidays' collection.
        await setDoc(holidayDocRef, { createdAt: serverTimestamp() });
        toast({ title: "Hari Libur Ditetapkan", description: `${format(day, 'd MMMM')} telah ditandai sebagai hari libur.` });
      } else {
        // If unchecked, DELETE the document.
        await deleteDoc(holidayDocRef);
        toast({ title: "Hari Kerja Ditetapkan", description: `${format(day, 'd MMMM')} kini menjadi hari kerja.` });
      }
    } catch (error) {
      console.error("Failed to update holiday:", error);
      toast({ variant: "destructive", title: "Gagal Menyimpan", description: "Terjadi kesalahan. Periksa koneksi Anda dan coba lagi." });
    } finally {
      setIsSaving(false);
    }
  };
  
  return (
    <Card>
        <CardHeader>
            <CardTitle>Pengaturan Hari Libur Bulanan</CardTitle>
            <CardDescription>Tandai hari libur spesifik. Perubahan akan disimpan dan disinkronkan ke seluruh sistem secara instan.</CardDescription>
        </CardHeader>
        <CardContent>
            {isSettingsLoading ? (
                <div className="w-full h-64 flex items-center justify-center bg-muted rounded-md"><Loader2 className="h-8 w-8 animate-spin" /></div>
            ) : (
                <div className="space-y-4">
                    <div className="flex items-center justify-center gap-4">
                        <Button variant="outline" size="icon" onClick={() => setCurrentMonth(m => subMonths(m, 1))}><ChevronLeft /></Button>
                        <span className="font-semibold text-center w-32">{format(currentMonth, 'MMMM yyyy', { locale: id })}</span>
                        <Button variant="outline" size="icon" onClick={() => setCurrentMonth(m => addMonths(m, 1))}><ChevronRight /></Button>
                    </div>
                    <ScrollArea className="h-96 rounded-md border">
                        <Table><TableBody>
                            {allDaysInMonth.map((day) => {
                                const dayString = format(day, 'yyyy-MM-dd');
                                // DATA IS FROM CONTEXT
                                const isSpecialHoliday = holidays.has(dayString);
                                const isRecurringOff = (schoolConfig?.offDays ?? []).includes(day.getDay());
                                const isChecked = isSpecialHoliday || isRecurringOff;
                                
                                return (
                                    <TableRow key={dayString} className={`has-[:checked]:bg-primary/10 ${isRecurringOff ? 'bg-muted/50 text-muted-foreground' : ''}`}>
                                        <TableCell className="w-12 text-center py-2">
                                            <Checkbox 
                                                id={dayString} 
                                                checked={isChecked} 
                                                disabled={isRecurringOff || isSaving} 
                                                onCheckedChange={(checked) => handleDayToggle(day, !!checked)} 
                                            />
                                        </TableCell>
                                        <TableCell className="py-2">
                                            <Label htmlFor={dayString} className={`w-full block ${isRecurringOff ? 'cursor-not-allowed' : 'cursor-pointer'}`}>
                                                {format(day, 'eeee, d MMMM yyyy', { locale: id })}
                                            </Label>
                                        </TableCell>
                                    </TableRow>
                                );
                            })}
                        </TableBody></Table>
                    </ScrollArea>
                </div>
            )}
        </CardContent>
    </Card>
  );
}


// =======================================================================================
// Original Configuration Page Component
// =======================================================================================
export default function KonfigurasiAbsenPage() {
  const { toast } = useToast();
  const firestore = useFirestore();
  const { user, isUserLoading: isAuthLoading } = useUser();
  const router = useRouter();
  // Get the main config from the context
  const { schoolConfig, isSettingsLoading } = useSettings(); 
  
  const [isSaving, setIsSaving] = useState(false);
  const [isSavingWeights, setIsSavingWeights] = useState(false);
  const [isLocating, setIsLocating] = useState(false);
  const [qrCodeDataUrl, setQrCodeDataUrl] = useState<string>('');
  const [isQrLoading, setIsQrLoading] = useState(true);

  // State for form fields
  const [isAttendanceActive, setIsAttendanceActive] = useState(true);
  const [offDays, setOffDays] = useState<number[]>([]);
  const [useLocationValidation, setUseLocationValidation] = useState(true);
  const [useTimeValidation, setUseTimeValidation] = useState(true);
  const [latitude, setLatitude] = useState('-8.58333');
  const [longitude, setLongitude] = useState('120.46667');
  const [radius, setRadius] = useState(100);
  const [checkInStart, setCheckInStart] = useState('06:00');
  const [checkInEnd, setCheckInEnd] = useState('08:00');
  const [qrCodeValue, setQrCodeValue] = useState('');
  const [checkOutTimes, setCheckOutTimes] = useState<any>({});
  const [attendanceWeights, setAttendanceWeights] = useState<any>(DEFAULT_WEIGHTS);
  
  const userDocRef = useMemoFirebase(() => user ? doc(firestore, 'users', user.uid) : null, [firestore, user]);
  const { data: userData, isLoading: isUserDataLoading } = useDoc(user, userDocRef);

  const isLoading = isAuthLoading || isSettingsLoading || isUserDataLoading;
  const isAdmin = !isLoading && userData?.role === 'admin';

  useEffect(() => {
    if (!isLoading && !isAdmin) router.replace('/dashboard');
  }, [isLoading, isAdmin, router]);

  // Effect to populate form when schoolConfig from context is loaded
  useEffect(() => {
    if (schoolConfig) {
      setIsAttendanceActive(schoolConfig.isAttendanceActive ?? true);
      setOffDays(schoolConfig.offDays ?? [0, 6]);
      setUseLocationValidation(schoolConfig.useLocationValidation ?? true);
      setUseTimeValidation(schoolConfig.useTimeValidation ?? true);
      setLatitude(schoolConfig.latitude?.toString() ?? '-8.58333');
      setLongitude(schoolConfig.longitude?.toString() ?? '120.46667');
      setRadius(schoolConfig.radius ?? 100);
      setCheckInStart(schoolConfig.checkInStartTime ?? '06:00');
      setCheckInEnd(schoolConfig.checkInEndTime ?? '08:00');
      setCheckOutTimes(schoolConfig.checkOutTimes || {});
      setAttendanceWeights({ ...DEFAULT_WEIGHTS, ...(schoolConfig.attendanceWeights || {}) });
      if (schoolConfig.qrCodeValue) setQrCodeValue(schoolConfig.qrCodeValue);
    }
  }, [schoolConfig]);

  useEffect(() => {
    if (qrCodeValue) {
      setIsQrLoading(true);
      QRCode.toDataURL(qrCodeValue, { width: 300, margin: 2, errorCorrectionLevel: 'H' }, (err, url) => {
        if (err) toast({ variant: 'destructive', title: 'Gagal Membuat QR Code' });
        else setQrCodeDataUrl(url);
        setIsQrLoading(false);
      });
    } else {
        setIsQrLoading(!isSettingsLoading);
    }
  }, [qrCodeValue, toast, isSettingsLoading]);
  
  // --- Handlers ---

  const handleGenerateNewQr = () => {
    if (!firestore) return;
    setIsQrLoading(true);
    const newQrValue = Math.random().toString(36).substring(2, 15);
    const schoolConfigRef = doc(firestore, 'schoolConfig', 'default');
    setDocumentNonBlocking(schoolConfigRef, { qrCodeValue: newQrValue }, { merge: true });
    setQrCodeValue(newQrValue);
    toast({ title: 'QR Code Diperbarui' });
  };
  
  const handleDownloadQr = () => {
    if (!qrCodeDataUrl) return;
    const a = document.createElement("a");
    a.href = qrCodeDataUrl;
    a.download = "absensi-qrcode.png";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    toast({ title: "Berhasil diunduh" });
  };

  const handleGetCurrentLocation = () => {
    if (!navigator.geolocation) return toast({ variant: 'destructive', title: 'Geolocation Tidak Didukung' });
    setIsLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLatitude(pos.coords.latitude.toFixed(6)); 
        setLongitude(pos.coords.longitude.toFixed(6));
        setIsLocating(false); 
        toast({ title: 'Lokasi Ditemukan' });
      },
      () => {
        setIsLocating(false); 
        toast({ variant: 'destructive', title: 'Gagal Mendapatkan Lokasi' });
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    );
  };

  const handleTimeChange = (day: number, type: 'start' | 'end', value: string) => {
    setCheckOutTimes((prev: any) => ({ ...prev, [day]: { ...(prev[day] || {}), [type]: value } }));
  };

  const handleWeightChange = (key: string, value: string) => {
    const val = parseFloat(value);
    setAttendanceWeights((prev: any) => ({ ...prev, [key]: isNaN(val) ? 0 : val }));
  };

  const handleSave = async () => {
    if (!firestore) return;
    setIsSaving(true);
    try {
        const batch = writeBatch(firestore);
        const schoolConfigRef = doc(firestore, 'schoolConfig', 'default');

        const generalSettings = {
            isAttendanceActive,
            offDays,
            useLocationValidation, useTimeValidation,
            latitude: parseFloat(latitude), longitude: parseFloat(longitude), radius: Number(radius),
            checkInStartTime: checkInStart, checkInEndTime: checkInEnd,
            checkOutTimes,
        };

        batch.set(schoolConfigRef, generalSettings, { merge: true });
        
        await batch.commit();
        toast({ title: 'Pengaturan Disimpan', description: 'Konfigurasi umum telah diperbarui.' });

    } catch (err) {
        console.error("Save failed: ", err);
        toast({ variant: 'destructive', title: 'Gagal Menyimpan', description: 'Terjadi kesalahan.' });
    } finally {
        setIsSaving(false);
    }
  };

  const handleSaveWeights = async () => {
    if (!firestore) return;
    setIsSavingWeights(true);
    try {
        const schoolConfigRef = doc(firestore, 'schoolConfig', 'default');
        await setDoc(schoolConfigRef, { attendanceWeights }, { merge: true });
        toast({ title: 'Bobot Disimpan', description: 'Bobot kehadiran telah berhasil diperbarui.' });
    } catch (err) {
        console.error("Save weights failed: ", err);
        toast({ variant: 'destructive', title: 'Gagal Menyimpan Bobot' });
    } finally {
        setIsSavingWeights(false);
    }
  };

  const handleDayToggle = (dayValue: number, checked: boolean) => {
    setOffDays(prev => checked ? [...prev, dayValue].sort() : prev.filter(d => d !== dayValue));
  };
  
  if (isLoading) {
    return <div className="flex items-center justify-center h-full"><Loader2 className="h-8 w-8 animate-spin" /></div>;
  }
  if (!isAdmin) return null;

  return (
    <TooltipProvider>
    <div className="space-y-6 pb-24">
        <div className="space-y-1">
            <h1 className="text-2xl font-semibold tracking-tight">Pengaturan Absensi</h1>
            <p className="text-sm text-muted-foreground">Atur parameter, hari libur rutin, dan hari libur bulanan untuk sistem absensi.</p>
        </div>

      <Card>
        <CardHeader><CardTitle>Pengaturan Umum</CardTitle></CardHeader>
        <CardContent className="p-6 space-y-4">
            <div className="flex items-center justify-between rounded-lg border p-4">
                <div>
                    <Label htmlFor="holiday-mode" className="font-semibold">Sistem Absensi Aktif</Label>
                    <p className="text-sm text-muted-foreground">Jika non-aktif, sistem absensi tidak bisa digunakan.</p>
                </div>
                <Switch id="holiday-mode" checked={isAttendanceActive} onCheckedChange={setIsAttendanceActive} />
            </div>
            <div className="rounded-lg border p-4">
                <Label className='font-medium'>Hari Libur Rutin</Label>
                <p className="text-sm text-muted-foreground pt-1">Pilih hari libur yang berulang setiap minggu.</p>
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4 pt-4">
                    {daysOfWeek.map(day => (
                        <div key={day.value} className="flex items-center space-x-2">
                        <Checkbox id={`day-${day.value}`} checked={offDays.includes(day.value)} onCheckedChange={(checked) => handleDayToggle(day.value, !!checked)} disabled={!isAttendanceActive} />
                        <Label htmlFor={`day-${day.value}`} className="font-normal">{day.label}</Label>
                        </div>
                    ))}
                </div>
            </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Validasi Absensi</CardTitle></CardHeader>
        <CardContent className="p-6 space-y-4">
            <div className="flex items-center justify-between rounded-lg border p-4">
                <div>
                    <Label htmlFor="use-location" className="font-semibold">Gunakan Validasi Lokasi</Label>
                    <p className="text-sm text-muted-foreground">Wajibkan pengguna di area sekolah untuk absen.</p>
                </div>
                <Switch id="use-location" checked={useLocationValidation} onCheckedChange={setUseLocationValidation} disabled={!isAttendanceActive} />
            </div>
            {useLocationValidation && <div className="space-y-4 pt-4 mt-4 rounded-lg border p-4">
                <div className="space-y-2">
                    <div className="flex items-center justify-between gap-4"><Label>Koordinat Lokasi Sekolah</Label><Button type="button" variant="outline" size="sm" onClick={handleGetCurrentLocation} disabled={isLocating || !isAttendanceActive}>{isLocating ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <LocateFixed className="mr-2 h-4 w-4" />}Dapatkan Lokasi</Button></div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div><Label htmlFor="latitude" className="text-xs text-muted-foreground">Latitude</Label><Input id="latitude" type="text" value={latitude} onChange={(e) => setLatitude(e.target.value)} disabled={!isAttendanceActive || isLocating} /></div>
                        <div><Label htmlFor="longitude" className="text-xs text-muted-foreground">Longitude</Label><Input id="longitude" type="text" value={longitude} onChange={(e) => setLongitude(e.target.value)} disabled={!isAttendanceActive || isLocating} /></div>
                    </div>
                </div>
                <div className="space-y-2"><Label htmlFor="radius">Radius Sekolah (meter)</Label><Input id="radius" type="number" value={radius} onChange={(e) => setRadius(Number(e.target.value))} disabled={!isAttendanceActive} /><p className="text-sm text-muted-foreground">Jarak toleransi maksimal dari titik pusat sekolah.</p></div>
                <div className="mt-4 rounded-lg overflow-hidden relative aspect-video border">
                    {latitude && longitude ? (
                        <Image
                            src={`https://staticmap.openstreetmap.de/staticmap.php?center=${latitude},${longitude}&zoom=17&size=600x340&maptype=mapnik&markers=${latitude},${longitude},red-pushpin`}
                            alt="Pratinjau Peta Lokasi"
                            fill
                            style={{ objectFit: "cover" }}
                            unoptimized
                        />
                    ) : (
                        <div className="w-full h-full flex items-center justify-center bg-muted">
                            <p className="text-muted-foreground">Koordinat belum diatur.</p>
                        </div>
                    )}
                </div>
            </div>}
            
            <div className="flex items-center justify-between rounded-lg border p-4">
                <div><Label htmlFor="use-time" className="font-semibold">Gunakan Validasi Jam Kerja</Label><p className="text-sm text-muted-foreground">Wajibkan absensi di dalam jam kerja yang ditentukan.</p></div>
                <Switch id="use-time" checked={useTimeValidation} onCheckedChange={setUseTimeValidation} disabled={!isAttendanceActive} />
            </div>
            {useTimeValidation && <div className="space-y-6 pt-4 mt-4 rounded-lg border p-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-2"><Label htmlFor="checkin-start">Jam Mulai Masuk</Label><Input id="checkin-start" type="time" value={checkInStart} onChange={e => setCheckInStart(e.target.value)} disabled={!isAttendanceActive} /></div>
                    <div className="space-y-2"><Label htmlFor="checkin-end">Jam Selesai Masuk</Label><Input id="checkin-end" type="time" value={checkInEnd} onChange={e => setCheckInEnd(e.target.value)} disabled={!isAttendanceActive} /></div>
                </div>
                <div className="space-y-4">
                    <div><Label>Jam Pulang (Spesifik per Hari)</Label><p className="text-sm text-muted-foreground">Atur rentang waktu absensi pulang untuk tiap hari kerja.</p></div>
                    <div className="space-y-3 rounded-md border p-3">
                        {daysOfWeek.filter(d => ![0,6].includes(d.value)).map(day => (
                            <div key={day.value} className="grid grid-cols-1 sm:grid-cols-5 items-center gap-2">
                                <Label htmlFor={`checkout-start-${day.value}`} className="sm:col-span-2 text-sm font-normal">{day.label}</Label>
                                <div className="sm:col-span-3 grid grid-cols-2 gap-2">
                                    <Input id={`checkout-start-${day.value}`} type="time" value={checkOutTimes[day.value]?.start || ''} onChange={e => handleTimeChange(day.value, 'start', e.target.value)} disabled={!isAttendanceActive} />
                                    <Input id={`checkout-end-${day.value}`} type="time" value={checkOutTimes[day.value]?.end || ''} onChange={e => handleTimeChange(day.value, 'end', e.target.value)} disabled={!isAttendanceActive} />
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </div>}
        </CardContent>
      </Card>

      <Card>
          <CardHeader>
              <CardTitle>Manajemen Bobot Kehadiran</CardTitle>
              <CardDescription>Tentukan bobot poin untuk setiap kategori kehadiran. Nilai ini digunakan untuk menghitung persentase kehadiran.</CardDescription>
          </CardHeader>
          <CardContent className="p-6 grid grid-cols-1 sm:grid-cols-2 gap-6">
              {Object.keys(DEFAULT_WEIGHTS).map(key => (
                  <div className="space-y-2" key={key}>
                      <Label htmlFor={`weight-${key}`}>{key.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}</Label>
                      <Input id={`weight-${key}`} type="number" step="0.05" min="0" max="1" value={attendanceWeights[key]} onChange={e => handleWeightChange(key, e.target.value)} />
                  </div>
              ))}
          </CardContent>
          <CardFooter className="flex justify-end p-6 pt-0">
              <Button onClick={handleSaveWeights} disabled={isSavingWeights || isSaving}>
                  {(isSavingWeights) && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Simpan Bobot
              </Button>
          </CardFooter>
      </Card>

      <SyncedMonthlyCalendar />
      
       <Card>
            <CardHeader className="p-4 sm:p-6"><CardTitle>QR Code Absensi</CardTitle></CardHeader>
            <CardContent className="flex flex-col items-center justify-center gap-4 p-4 sm:p-6">
                <div className="p-4 border rounded-lg bg-white aspect-square w-full max-w-[256px] relative">
                    {isQrLoading || !qrCodeDataUrl ? 
                        <div className="w-full h-full flex items-center justify-center bg-muted rounded-md"><Loader2 className="h-8 w-8 animate-spin" /></div> :
                        <Image src={qrCodeDataUrl} alt="QR Code Absensi" fill style={{ objectFit: "contain" }} />
                    }
                </div>
                <div className="w-full max-w-[256px] grid grid-cols-2 gap-2">
                    <Button onClick={handleGenerateNewQr} variant="outline" disabled={isQrLoading}>
                        {isQrLoading && qrCodeValue ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
                        Buat Baru
                    </Button>
                    <Button onClick={handleDownloadQr} disabled={isQrLoading || !qrCodeDataUrl}>
                        <Download className="mr-2 h-4 w-4" />
                        Unduh
                    </Button>
                </div>
            </CardContent>
        </Card>

      <div className="fixed bottom-20 right-6 z-50 md:bottom-6">
          <Button size="lg" onClick={handleSave} disabled={isSaving || isSavingWeights}>
              {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Simpan Pengaturan Umum
          </Button>
      </div>
    </div>
    </TooltipProvider>
  );
}
