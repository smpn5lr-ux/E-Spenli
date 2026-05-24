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
import { Download, Loader2, RefreshCw, LocateFixed, ChevronLeft, ChevronRight, HelpCircle } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useFirestore, useDoc, useMemoFirebase, useUser, setDocumentNonBlocking } from '@/firebase';
import { doc, writeBatch } from 'firebase/firestore';
import { useRouter } from 'next/navigation';
import { Checkbox } from '@/components/ui/checkbox';
import { format, eachDayOfInterval, startOfMonth } from 'date-fns';
import { id } from 'date-fns/locale';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Table, TableBody, TableCell, TableRow } from '@/components/ui/table';
import {
    Tooltip,
    TooltipContent,
    TooltipProvider,
    TooltipTrigger,
} from "@/components/ui/tooltip"
import { useSettings } from '@/contexts/SettingsContext';

// --- Days of Week (Helper) ---
const daysOfWeek = [
    { value: 0, label: 'Minggu' }, { value: 1, label: 'Senin' }, { value: 2, label: 'Selasa' }, 
    { value: 3, label: 'Rabu' }, { value: 4, label: 'Kamis' }, { value: 5, label: 'Jumat' }, { value: 6, label: 'Sabtu' },
];

// =======================================================================================
// REFACTORED: The Monthly Calendar Component (Now a "Dumb" Component)
// It relies entirely on SettingsContext for its data and logic.
// =======================================================================================
function MonthlyConfigCalendar() {
  const { toast } = useToast();
  const {
    schoolConfig,
    monthlyConfigs,
    subscribeToMonth,
    updateHolidaysForMonth,
    isMonthlyConfigLoading
  } = useSettings();

  const [currentMonth, setCurrentMonth] = useState(startOfMonth(new Date()));
  const [isSaving, setIsSaving] = useState(false);

  const monthlyConfigId = useMemo(() => format(currentMonth, 'yyyy-MM'), [currentMonth]);
  const currentMonthData = monthlyConfigs[monthlyConfigId];
  const holidays = useMemo(() => new Set(currentMonthData?.holidays ?? []), [currentMonthData]);

  // EFFECT: Subscribe to the current month's data when the component mounts or month changes.
  useEffect(() => {
    subscribeToMonth(monthlyConfigId);
  }, [monthlyConfigId, subscribeToMonth]);

  const allDaysInMonth = useMemo(() => eachDayOfInterval({ 
      start: startOfMonth(currentMonth), 
      end: new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 0) 
  }), [currentMonth]);

  const calculatedWorkDays = useMemo(() => {
    if (!schoolConfig) return 0;
    const recurringOffDays: number[] = schoolConfig.offDays ?? [0, 6];
    return allDaysInMonth.filter(day => 
        !recurringOffDays.includes(day.getDay()) && !holidays.has(format(day, 'yyyy-MM-dd'))
    ).length;
  }, [allDaysInMonth, holidays, schoolConfig]);

  const handleDayToggle = async (day: Date, checked: boolean) => {
    setIsSaving(true);
    const dayString = format(day, 'yyyy-MM-dd');
    const newHolidays = new Set(holidays);

    if (checked) {
      newHolidays.add(dayString);
    } else {
      newHolidays.delete(dayString);
    }

    const recurringOffDays: number[] = schoolConfig?.offDays ?? [0, 6];
    const newWorkDays = allDaysInMonth.filter(d => 
        !recurringOffDays.includes(d.getDay()) && !newHolidays.has(format(d, 'yyyy-MM-dd'))
    ).length;

    try {
      // Instead of writing to DB directly, we now call the context's update function.
      await updateHolidaysForMonth(monthlyConfigId, Array.from(newHolidays), newWorkDays);
      toast({ title: "Libur Diperbarui", description: `Perubahan untuk ${format(day, 'd MMMM')} disimpan.` });
    } catch (error) { 
      console.error("Failed to update holiday via context:", error);
      toast({ variant: "destructive", title: "Gagal Menyimpan", description: `Gagal memperbarui hari libur. Error: ${error}` });
    } finally {
      setIsSaving(false);
    }
  };
  
  const isLoading = isMonthlyConfigLoading(monthlyConfigId) || !schoolConfig;

  // --- UI RENDER ---
  return (
    <Card>
        <CardHeader>
            <CardTitle>Pengaturan Hari Libur Bulanan</CardTitle>
            <CardDescription>Tandai hari libur spesifik. Perubahan akan disimpan secara otomatis & instan.</CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="md:col-span-2 space-y-4">
                {isLoading && !currentMonthData ? <div className="w-full h-full flex items-center justify-center bg-muted rounded-md p-10"><Loader2 className="h-8 w-8 animate-spin" /></div> : <> 
                    <div className="flex items-center justify-center gap-4">
                        <Button variant="outline" size="icon" onClick={() => setCurrentMonth(prev => new Date(prev.getFullYear(), prev.getMonth() - 1, 1))}><ChevronLeft /></Button>
                        <span className="font-semibold text-center w-32">{format(currentMonth, 'MMMM yyyy', { locale: id })}</span>
                        <Button variant="outline" size="icon" onClick={() => setCurrentMonth(prev => new Date(prev.getFullYear(), prev.getMonth() + 1, 1))}><ChevronRight /></Button>
                    </div>
                    <ScrollArea className="h-96 rounded-md border">
                        <Table><TableBody>
                            {allDaysInMonth.map((day) => {
                                const dayString = format(day, 'yyyy-MM-dd');
                                const isChecked = holidays.has(dayString);
                                const isRecurringOff = (schoolConfig?.offDays ?? [0, 6]).includes(day.getDay());
                                return (
                                    <TableRow key={dayString} className={`has-[:checked]:bg-primary/10 ${isRecurringOff ? 'bg-muted/50 text-muted-foreground' : ''}`}>
                                        <TableCell className="w-12 text-center py-2"><Checkbox id={dayString} checked={isChecked || isRecurringOff} disabled={isRecurringOff || isSaving} onCheckedChange={(checked) => handleDayToggle(day, !!checked)} /></TableCell>
                                        <TableCell className="py-2"><Label htmlFor={dayString} className={`w-full block ${isRecurringOff ? 'cursor-not-allowed' : 'cursor-pointer'}`}>{format(day, 'eeee, d MMMM yyyy', { locale: id })}</Label></TableCell>
                                    </TableRow>
                                );
                            })}
                        </TableBody></Table>
                    </ScrollArea>
                </>}
            </div>
            <div className="md:col-span-1 space-y-4 border-l-0 md:border-l md:pl-6">
                <h3 className="font-semibold">Konfigurasi Bulan Ini</h3>
                <p className="text-sm text-muted-foreground">Jumlah hari kerja efektif di bulan <span className="font-bold">{format(currentMonth, 'MMMM', { locale: id })}</span> akan digunakan untuk menghitung persentase kehadiran.</p>
                <div className="space-y-2">
                    <Label>Jumlah Hari Kerja Efektif</Label>
                    <div className="flex items-center h-10 w-full rounded-md border border-input bg-muted px-3 py-2 text-sm select-none">{isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : (currentMonthData?.workDays ?? calculatedWorkDays)}</div>
                    <p className="text-xs text-muted-foreground">Dihitung otomatis dan disimpan secara real-time.</p>
                </div>
            </div>
        </CardContent>
    </Card>
  );
}

// =======================================================================================
// Original Configuration Page Component (Largely Unchanged)
// =======================================================================================
export default function KonfigurasiAbsenPage() {
  const { toast } = useToast();
  const firestore = useFirestore();
  const { user, isUserLoading: isAuthLoading } = useUser();
  const router = useRouter();
  const { schoolConfig, isSettingsLoading } = useSettings(); 
  
  const [isSaving, setIsSaving] = useState(false);
  const [isLocating, setIsLocating] = useState(false);
  const [qrCodeDataUrl, setQrCodeDataUrl] = useState<string>('');
  const [isQrLoading, setIsQrLoading] = useState(true);

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
  
  const userDocRef = useMemoFirebase(() => user ? doc(firestore, 'users', user.uid) : null, [firestore, user]);
  const { data: userData, isLoading: isUserDataLoading } = useDoc(user, userDocRef);

  const isLoading = isAuthLoading || isSettingsLoading || isUserDataLoading;
  const isAdmin = !isLoading && userData?.role === 'admin';

  useEffect(() => {
    if (!isLoading && !isAdmin) router.replace('/dashboard');
  }, [isLoading, isAdmin, router]);

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
      if (schoolConfig.qrCodeValue) setQrCodeValue(schoolConfig.qrCodeValue);
    }
  }, [schoolConfig]);

  useEffect(() => {
    if (qrCodeValue) {
      setIsQrLoading(true);
      QRCode.toDataURL(qrCodeValue, { width: 300, margin: 2, errorCorrectionLevel: 'H' }, (err, url) => {
        if (err) {
          toast({ variant: 'destructive', title: 'Gagal Membuat QR Code' });
        } else {
          setQrCodeDataUrl(url);
        }
        setIsQrLoading(false);
      });
    } else {
        setIsQrLoading(!isSettingsLoading);
    }
  }, [qrCodeValue, toast, isSettingsLoading]);

  const handleGenerateNewQr = () => {
    if (!firestore) return;
    setIsQrLoading(true);
    const newQrValue = Math.random().toString(36).substring(2, 15);
    const schoolConfigRef = doc(firestore, 'schoolConfig', 'default');
    setDocumentNonBlocking(schoolConfigRef, { qrCodeValue: newQrValue }, { merge: true });
    setQrCodeValue(newQrValue);
    toast({ title: 'QR Code Diperbarui' });
  };

  const handleGetCurrentLocation = () => {
    if (!navigator.geolocation) return toast({ variant: 'destructive', title: 'Geolocation Tidak Didukung' });
    setIsLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLatitude(pos.coords.latitude.toFixed(6)); setLongitude(pos.coords.longitude.toFixed(6));
        setIsLocating(false); toast({ title: 'Lokasi Ditemukan' });
      },
      () => {
        setIsLocating(false); toast({ variant: 'destructive', title: 'Gagal Mendapatkan Lokasi' });
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    );
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
        };

        batch.set(schoolConfigRef, generalSettings, { merge: true });
        
        await batch.commit();
        toast({ title: 'Pengaturan Umum Disimpan', description: 'Konfigurasi umum telah diperbarui.' });

    } catch (err) {
        console.error("Save failed: ", err);
        toast({ variant: 'destructive', title: 'Gagal Menyimpan', description: 'Terjadi kesalahan saat menyimpan data.' });
    } finally {
        setIsSaving(false);
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
            <p className="text-sm text-muted-foreground">Atur parameter fundamental, hari libur rutin, dan hari libur bulanan untuk sistem absensi.</p>
        </div>

      <Card>
        <CardHeader><CardTitle>Pengaturan Umum</CardTitle></CardHeader>
        <CardContent className="p-6 space-y-4">
            <div className="flex items-center justify-between rounded-lg border p-4">
                <div>
                    <Label htmlFor="holiday-mode" className="font-semibold">Non Aktif Sementara</Label>
                    <p className="text-sm text-muted-foreground">Jika aktif, sistem absensi non-aktif untuk semua.</p>
                </div>
                <Switch id="holiday-mode" checked={!isAttendanceActive} onCheckedChange={(checked) => setIsAttendanceActive(!checked)} />
            </div>
            <div className="rounded-lg border p-4">
                <Label className='font-medium'>Hari Libur Rutin</Label>
                <p className="text-sm text-muted-foreground pt-1">Pilih hari libur rutin. Absensi non-aktif pada hari ini.</p>
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
            </div>}
        </CardContent>
      </Card>

      <MonthlyConfigCalendar />
      
       <Card>
          <CardHeader className="p-4 sm:p-6"><CardTitle>QR Code Absensi</CardTitle></CardHeader>
          <CardContent className="flex flex-col items-center justify-center gap-4 p-4 sm:p-6">
            <div className="p-4 border rounded-lg bg-white aspect-square w-full max-w-[256px] relative">
              {isQrLoading || !qrCodeDataUrl ? <div className="w-full h-full flex items-center justify-center bg-muted rounded-md"><Loader2 className="h-8 w-8 animate-spin" /></div> 
              : <Image src={qrCodeDataUrl} alt="QR Code Absensi" width={224} height={224} className="w-full h-full" />}
            </div>
            <Button onClick={handleGenerateNewQr} variant="outline" className="w-full max-w-[256px]" disabled={isQrLoading}>{isQrLoading && qrCodeValue ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}Buat QR Code Baru</Button>
          </CardContent>
        </Card>

      <div className="fixed bottom-20 right-6 z-50 md:bottom-6">
          <Button size="lg" onClick={handleSave} disabled={isSaving}>
              {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Simpan Pengaturan Umum
          </Button>
      </div>
    </div>
    </TooltipProvider>
  );
}
