'use client';

import { useState, useRef, useEffect, useMemo } from 'react';
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
import { useFirestore, useDoc, useMemoFirebase, useUser, setDocumentNonBlocking, updateDocumentNonBlocking } from '@/firebase';
import { doc, getDoc, setDoc, updateDoc } from 'firebase/firestore';
import { useRouter } from 'next/navigation';
import { Checkbox } from '@/components/ui/checkbox';
import { format, getDaysInMonth, startOfMonth, eachDayOfInterval } from 'date-fns';
import { id } from 'date-fns/locale';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Table, TableBody, TableCell, TableRow } from '@/components/ui/table';

// New Component for Attendance Weight Settings
function AttendanceWeightSettings() {
  const { toast } = useToast();
  const firestore = useFirestore();
  const weightRef = useMemoFirebase(() => doc(firestore, 'settings', 'attendanceWeight'), [firestore]);

  const defaultWeights = {
    hadir: 1,
    terlambat: 0.75,
    tidakAbsenPulang: 0.5,
    tidakAbsenMasuk: 0.5,
    izin: 0.5,
    izinPulangCepat: 0.6,
    alpa: 0
  };

  const [weights, setWeights] = useState(defaultWeights);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    const fetchWeights = async () => {
      if (!weightRef) return;
      setIsLoading(true);
      try {
        const docSnap = await getDoc(weightRef);
        if (docSnap.exists()) {
          setWeights(docSnap.data() as typeof defaultWeights);
        } else {
          // If the document doesn't exist, we use the default weights already set in the state
          console.log('Dokumen bobot tidak ditemukan, menggunakan nilai default.');
        }
      } catch (error) {
        console.error("Error fetching weight settings: ", error);
        toast({ variant: 'destructive', title: 'Gagal Memuat Bobot', description: 'Gagal mengambil data bobot dari server.' });
      } finally {
        setIsLoading(false);
      }
    };
    fetchWeights();
  }, [weightRef, toast]);

  const handleInputChange = (field: keyof typeof weights, value: string) => {
    const numValue = value === '' ? '' : Number(value); // Allow empty string to clear input
    if (numValue === '' || !isNaN(numValue as number)) {
        setWeights(prev => ({ ...prev, [field]: numValue }));
    }
  };

  const handleSave = async () => {
    if (!weightRef) return;
    setIsSaving(true);
    try {
      const finalWeights = Object.entries(weights).reduce((acc, [key, value]) => {
        const num = Number(value);
        acc[key as keyof typeof weights] = isNaN(num) ? 0 : num;
        return acc;
      }, {} as typeof defaultWeights);

      await setDoc(weightRef, finalWeights);
      toast({ title: 'Berhasil', description: 'Pengaturan bobot kehadiran berhasil disimpan.' });
    } catch (error) {
      console.error("Error saving weight settings: ", error);
      toast({ variant: 'destructive', title: 'Gagal Menyimpan', description: 'Gagal menyimpan pengaturan bobot ke server.' });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Manajemen Bobot Kehadiran</CardTitle>
        <CardDescription>Atur bobot nilai untuk setiap status kehadiran. Nilai ini akan memengaruhi perhitungan persentase akhir.</CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex items-center justify-center p-8"><Loader2 className="h-8 w-8 animate-spin" /></div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 gap-x-4 gap-y-6">
            {Object.keys(weights).map((key) => (
              <div className="space-y-2" key={key}>
                <Label htmlFor={`weight-${key}`} className="capitalize">
                  {key.replace(/([A-Z])/g, ' $1').replace('tidakAbsen', 'Tidak Absen ')}
                </Label>
                <Input
                  id={`weight-${key}`}
                  type="number"
                  step="0.01"
                  value={weights[key as keyof typeof weights]}
                  onChange={(e) => handleInputChange(key as keyof typeof weights, e.target.value)}
                  placeholder="0.0"
                />
              </div>
            ))}
          </div>
        )}
      </CardContent>
      <CardFooter className="border-t p-4 sm:p-6">
        <Button onClick={handleSave} disabled={isSaving || isLoading}>
          {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Simpan Bobot Kehadiran
        </Button>
      </CardFooter>
    </Card>
  );
}

const daysOfWeek = [
    { value: 0, label: 'Minggu' },
    { value: 1, label: 'Senin' },
    { value: 2, label: 'Selasa' },
    { value: 3, label: 'Rabu' },
    { value: 4, label: 'Kamis' },
    { value: 5, label: 'Jumat' },
    { value: 6, label: 'Sabtu' },
];

function MonthlyConfigCalendar({ user, schoolConfig }: { user: any, schoolConfig: any }) {
  const { toast } = useToast();
  const firestore = useFirestore();
  const [currentMonth, setCurrentMonth] = useState(startOfMonth(new Date()));
  const [holidays, setHolidays] = useState<Date[]>([]);
  const [isSaving, setIsSaving] = useState(false);

  const monthlyConfigId = useMemo(() => format(currentMonth, 'yyyy-MM'), [currentMonth]);
  const monthlyConfigRef = useMemoFirebase(() => {
    if (!firestore) return null;
    return doc(firestore, 'monthlyConfigs', monthlyConfigId);
  }, [firestore, monthlyConfigId]);
  
  const { data: monthlyConfigData, isLoading: isMonthlyConfigLoading } = useDoc(user, monthlyConfigRef);
  
  const allDaysInMonth = useMemo(() => {
    return eachDayOfInterval({ start: startOfMonth(currentMonth), end: new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 0) });
  }, [currentMonth]);

  useEffect(() => {
    if (monthlyConfigData) {
      setHolidays((monthlyConfigData.holidays ?? []).map((d: string) => new Date(`${d}T00:00:00`)));
    } else {
      setHolidays([]);
    }
  }, [monthlyConfigData]);

  const calculatedWorkDays = useMemo(() => {
    if (!schoolConfig) return 0;
    const recurringOffDays: number[] = schoolConfig.offDays ?? [0]; // Correct default
    const specificHolidays = new Set(holidays.map(d => format(d, 'yyyy-MM-dd')));
    const workDays = allDaysInMonth.filter(day => {
      const isRecurringOff = recurringOffDays.includes(day.getDay());
      const isSpecificHoliday = specificHolidays.has(format(day, 'yyyy-MM-dd'));
      return !isRecurringOff && !isSpecificHoliday;
    });
    return workDays.length;
  }, [allDaysInMonth, holidays, schoolConfig]);

  const handleSave = async () => {
    if (!monthlyConfigRef) return;
    setIsSaving(true);
    try {
      const dataToSave = { id: monthlyConfigId, holidays: holidays.map(d => format(d, 'yyyy-MM-dd')) };
      await setDoc(monthlyConfigRef, dataToSave, { merge: true });
      toast({ title: 'Berhasil', description: 'Pengaturan hari libur spesifik telah disimpan.' });
    } catch (error) {
      console.error('Error saving monthly config:', error);
      toast({ variant: 'destructive', title: 'Gagal', description: 'Gagal menyimpan pengaturan.' });
    } finally {
      setIsSaving(false);
    }
  };

  const handleDayToggle = (day: Date, checked: boolean) => {
    setHolidays(prev => checked ? [...prev, day] : prev.filter(d => format(d, 'yyyy-MM-dd') !== format(day, 'yyyy-MM-dd')));
  };
  
  return (
    <Card>
        <CardHeader>
            <CardTitle>Pengaturan Hari Libur Bulanan</CardTitle>
            <CardDescription>Tandai hari libur spesifik (misalnya: libur nasional). Hari kerja efektif akan dihitung secara otomatis.</CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="md:col-span-2 space-y-4">
                {isMonthlyConfigLoading ? (
                    <div className="w-full h-full flex items-center justify-center bg-muted rounded-md p-10"><Loader2 className="h-8 w-8 animate-spin" /></div>
                ) : (
                    <>
                        <div className="flex items-center justify-center gap-4">
                            <Button variant="outline" size="icon" onClick={() => setCurrentMonth(prev => new Date(prev.getFullYear(), prev.getMonth() - 1, 1))}><ChevronLeft /></Button>
                            <span className="font-semibold text-center w-32">{format(currentMonth, 'MMMM yyyy', { locale: id })}</span>
                            <Button variant="outline" size="icon" onClick={() => setCurrentMonth(prev => new Date(prev.getFullYear(), prev.getMonth() + 1, 1))}><ChevronRight /></Button>
                        </div>
                        <ScrollArea className="h-96 rounded-md border">
                            <Table>
                                <TableBody>
                                    {allDaysInMonth.map((day) => {
                                        const dayString = format(day, 'yyyy-MM-dd');
                                        const isChecked = holidays.some(d => format(d, 'yyyy-MM-dd') === dayString);
                                        const isRecurringOff = (schoolConfig?.offDays ?? [0]).includes(day.getDay()); // Correct default
                                        return (
                                            <TableRow key={dayString} className={`has-[:checked]:bg-primary/10 ${isRecurringOff ? 'bg-muted/50 text-muted-foreground' : ''}`}>
                                                <TableCell className="w-12 text-center py-2">
                                                    <Checkbox id={dayString} checked={isChecked || isRecurringOff} disabled={isRecurringOff} onCheckedChange={(checked) => handleDayToggle(day, !!checked)} />
                                                </TableCell>
                                                <TableCell className="py-2">
                                                    <Label htmlFor={dayString} className={`w-full block ${isRecurringOff ? 'cursor-not-allowed' : 'cursor-pointer'}`}>{format(day, 'eeee, d MMMM yyyy', { locale: id })}</Label>
                                                </TableCell>
                                            </TableRow>
                                        );
                                    })}
                                </TableBody>
                            </Table>
                        </ScrollArea>
                    </>
                )}
            </div>
            <div className="md:col-span-1 space-y-4 border-l-0 md:border-l md:pl-6">
                <h3 className="font-semibold">Konfigurasi Bulan Ini</h3>
                 <p className="text-sm text-muted-foreground">Jumlah hari kerja efektif di bulan <span className="font-bold">{format(currentMonth, 'MMMM', { locale: id })}</span> akan digunakan untuk menghitung persentase kehadiran.</p>
                <div className="space-y-2">
                    <Label>Jumlah Hari Kerja Efektif</Label>
                    <div className="flex items-center h-10 w-full rounded-md border border-input bg-muted px-3 py-2 text-sm select-none">{isMonthlyConfigLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : calculatedWorkDays}</div>
                     <p className="text-xs text-muted-foreground">Dihitung otomatis berdasarkan hari libur rutin & spesifik.</p>
                </div>
            </div>
        </CardContent>
         <CardFooter className="border-t p-4 sm:p-6">
            <Button onClick={handleSave} disabled={isSaving}>{isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Simpan Pengaturan Bulan Ini</Button>
        </CardFooter>
    </Card>
  );
}

const defaultCheckOutTimes = {
    1: { start: '14:00', end: '16:00' }, // Monday
    2: { start: '14:00', end: '16:00' }, // Tuesday
    3: { start: '14:00', end: '16:00' }, // Wednesday
    4: { start: '14:00', end: '16:00' }, // Thursday
    5: { start: '13:00', end: '15:00' }, // Friday
    6: { start: '12:00', end: '14:00' }, // Saturday
};

export default function KonfigurasiAbsenPage() {
  const { toast } = useToast();
  const firestore = useFirestore();
  const { user, isUserLoading: isAuthLoading } = useUser();
  const router = useRouter();
  
  const [isSaving, setIsSaving] = useState(false);
  const [isLocating, setIsLocating] = useState(false);
  const [qrCodeDataUrl, setQrCodeDataUrl] = useState<string>('');
  const [isQrLoading, setIsQrLoading] = useState(true);

  // Form State
  const [holidayMode, setHolidayMode] = useState(false);
  const [offDays, setOffDays] = useState<number[]>([]);
  const [useLocationValidation, setUseLocationValidation] = useState(true);
  const [useTimeValidation, setUseTimeValidation] = useState(true);
  const [latitude, setLatitude] = useState('-8.58333');
  const [longitude, setLongitude] = useState('120.46667');
  const [radius, setRadius] = useState(100);
  const [checkInStart, setCheckInStart] = useState('06:00');
  const [checkInEnd, setCheckInEnd] = useState('08:00');
  const [qrCodeValue, setQrCodeValue] = useState('');
  const [checkOutTimes, setCheckOutTimes] = useState(defaultCheckOutTimes);
  
  const schoolConfigRef = useMemoFirebase(() => doc(firestore, 'schoolConfig', 'default'), [firestore]);
  const legacyConfigRef = useMemoFirebase(() => doc(firestore, 'konfigurasi', 'absensi'), [firestore]);

  const { data: schoolConfigData, isLoading: isConfigLoading } = useDoc(user, schoolConfigRef);

  const userDocRef = useMemoFirebase(() => user ? doc(firestore, 'users', user.uid) : null, [firestore, user]);
  const { data: userData, isLoading: isUserDataLoading } = useDoc(user, userDocRef);

  const isLoading = isAuthLoading || isConfigLoading || isUserDataLoading;
  const isAdmin = !isLoading && userData?.role === 'admin';

  useEffect(() => {
    if (!isLoading && !isAdmin) {
      router.replace('/dashboard');
    }
  }, [isLoading, isAdmin, router]);

  useEffect(() => {
    if (schoolConfigData && schoolConfigRef && !isConfigLoading) {
        setHolidayMode(schoolConfigData.isAttendanceActive === false);

        const dbOffDays = schoolConfigData.offDays;
        let needsCorrection = false;

        // Definitive check for corrupted or old configuration data for offDays
        if (!Array.isArray(dbOffDays) || dbOffDays.includes(6)) {
            needsCorrection = true;
        }

        if (needsCorrection) {
            // If the data is bad, force-set a correct default and update the database.
            const correctedOffDays = [0]; // Sunday only
            setOffDays(correctedOffDays);
            updateDocumentNonBlocking(schoolConfigRef, { offDays: correctedOffDays });
            toast({
                title: "Konfigurasi Diperbaiki",
                description: "Pengaturan hari libur telah direset. Hari Sabtu kini aktif.",
            });
        } else {
            // If data is valid, use it.
            setOffDays(dbOffDays);
        }

        // Set all other states from the school config data
        setUseLocationValidation(schoolConfigData.useLocationValidation ?? true);
        setUseTimeValidation(schoolConfigData.useTimeValidation ?? true);
        setLatitude(schoolConfigData.latitude?.toString() ?? '-8.58333');
        setLongitude(schoolConfigData.longitude?.toString() ?? '120.46667');
        setRadius(schoolConfigData.radius ?? 100);
        setCheckInStart(schoolConfigData.checkInStartTime ?? '06:00');
        setCheckInEnd(schoolConfigData.checkInEndTime ?? '08:00');

        if (schoolConfigData.checkOutTimes) {
            setCheckOutTimes(prev => ({ ...defaultCheckOutTimes, ...schoolConfigData.checkOutTimes }));
        } else if (schoolConfigData.checkOutStartTime && schoolConfigData.checkOutEndTime) {
            const oldStart = schoolConfigData.checkOutStartTime;
            const oldEnd = schoolConfigData.checkOutEndTime;
            setCheckOutTimes({
                1: { start: oldStart, end: oldEnd },
                2: { start: oldStart, end: oldEnd },
                3: { start: oldStart, end: oldEnd },
                4: { start: oldStart, end: oldEnd },
                5: { start: oldStart, end: oldEnd },
                6: { start: oldStart, end: oldEnd },
            });
        }

        if (schoolConfigData.qrCodeValue) {
            setQrCodeValue(schoolConfigData.qrCodeValue);
        } else if (schoolConfigRef && !isConfigLoading) {
            const newQrValue = Math.random().toString(36).substring(2, 15);
            setQrCodeValue(newQrValue);
            updateDocumentNonBlocking(schoolConfigRef, { qrCodeValue: newQrValue });
        }
    }
}, [schoolConfigData, isConfigLoading, schoolConfigRef, toast]);


  useEffect(() => {
    if (qrCodeValue) {
      setIsQrLoading(true);
      QRCode.toDataURL(qrCodeValue, { width: 300, margin: 2, errorCorrectionLevel: 'H' }, (err, url) => {
          if (err) {
              console.error('QR Code generation failed:', err);
              toast({ variant: 'destructive', title: 'Gagal Membuat QR Code', description: 'Terjadi kesalahan saat menyiapkan QR Code.' });
              setIsQrLoading(false);
              return;
          }
          setQrCodeDataUrl(url);
          setIsQrLoading(false);
      });
    } else {
        setIsQrLoading(!isConfigLoading);
    }
  }, [qrCodeValue, toast, isConfigLoading]);

  const handleTimeChange = (day: number, type: 'start' | 'end', value: string) => {
    setCheckOutTimes(prev => ({
        ...prev,
        [day]: {
            ...(prev[day as keyof typeof prev] || {}),
            [type]: value
        }
    }));
  };

  const downloadQRCode = async (format: 'png' | 'pdf') => {
    if (!qrCodeDataUrl) {
      toast({ variant: 'destructive', title: 'Gagal Mengunduh', description: 'QR Code belum siap. Mohon tunggu sejenak dan coba lagi.' });
      return;
    }
    if (format === 'png') {
      const link = document.createElement('a');
      link.href = qrCodeDataUrl;
      link.download = 'absensi-qrcode.png';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } else {
      const { jsPDF } = await import('jspdf');
      const pdf = new jsPDF();
      pdf.setFontSize(20);
      pdf.text('QR Code Absensi E-SPENLI', 105, 20, { align: 'center' });
      pdf.addImage(qrCodeDataUrl, 'PNG', 65, 30, 80, 80);
      pdf.save('absensi-qrcode.pdf');
    }
    toast({ title: 'Berhasil', description: `QR Code berhasil diunduh sebagai ${format.toUpperCase()}.` });
  };
  
  const handleGenerateNewQr = () => {
    if (!schoolConfigRef) return;
    setIsQrLoading(true);
    const newQrValue = Math.random().toString(36).substring(2, 15);
    updateDocumentNonBlocking(schoolConfigRef, { qrCodeValue: newQrValue });
    setQrCodeValue(newQrValue);
    toast({ title: 'QR Code Diperbarui', description: 'QR Code absensi baru telah berhasil dibuat.' });
  };

  const handleGetCurrentLocation = () => {
    if (!navigator.geolocation) {
      toast({ variant: 'destructive', title: 'Geolocation Tidak Didukung', description: 'Browser Anda tidak mendukung pengambilan lokasi.' });
      return;
    }
    setIsLocating(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setLatitude(position.coords.latitude.toFixed(6));
        setLongitude(position.coords.longitude.toFixed(6));
        setIsLocating(false);
        toast({ title: 'Lokasi Ditemukan', description: 'Koordinat Latitude dan Longitude telah diperbarui.' });
      },
      (error) => {
        setIsLocating(false);
        toast({ variant: 'destructive', title: 'Gagal Mendapatkan Lokasi', description: 'Terjadi kesalahan. Pastikan izin lokasi telah diberikan.' });
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    );
  };

  const handleSave = () => {
    if (!schoolConfigRef || !legacyConfigRef) return;
    setIsSaving(true);

    const mondayCheckout = checkOutTimes[1] || { start: '14:00', end: '16:00' };

    setDocumentNonBlocking(schoolConfigRef, {
      isAttendanceActive: !holidayMode,
      offDays: offDays,
      useLocationValidation,
      useTimeValidation,
      latitude: parseFloat(latitude),
      longitude: parseFloat(longitude),
      radius: Number(radius),
      checkInStartTime: checkInStart,
      checkInEndTime: checkInEnd,
      checkOutTimes: checkOutTimes, // New structure
      // Legacy fields for backward compatibility
      checkOutStartTime: mondayCheckout.start,
      checkOutEndTime: mondayCheckout.end,
    }, { merge: true });

    setDocumentNonBlocking(legacyConfigRef, {
        jamMasukMulai: checkInStart,
        jamMasukSelesai: checkInEnd,
        jamPulangMulai: mondayCheckout.start,
        jamPulangSelesai: mondayCheckout.end,
    }, { merge: true });

    toast({ title: 'Pengaturan Disimpan', description: 'Konfigurasi absensi telah berhasil diperbarui.' });
    setIsSaving(false);
  };

  const handleDayToggle = (dayValue: number, checked: boolean | 'indeterminate') => {
    if (checked) {
        setOffDays(prev => [...prev, dayValue].sort());
    } else {
        setOffDays(prev => prev.filter(d => d !== dayValue));
    }
  };
  
  if (isLoading || !isAdmin) {
    return <div className="flex items-center justify-center h-full"><Loader2 className="h-8 w-8 animate-spin" /></div>;
  }

  return (
    <div className="space-y-6">
        {/* SECTION 1: Page Header */}
        <div>
            <h1 className="text-2xl font-bold tracking-tight">Pengaturan Absen</h1>
            <p className="text-muted-foreground">
                Konfigurasi sistem absensi, termasuk QR code, lokasi, jam kerja, dan hari libur.
            </p>
        </div>

        {/* SECTION 2: QR Code and General Settings */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-1">
                <Card>
                  <CardHeader className="p-4 sm:p-6">
                    <CardTitle>QR Code Absensi</CardTitle>
                    <CardDescription>Gunakan QR Code ini untuk absensi.</CardDescription>
                  </CardHeader>
                  <CardContent className="flex flex-col items-center justify-center gap-4 p-4 sm:p-6">
                    <div className="p-4 border rounded-lg bg-white aspect-square w-full max-w-[256px] relative">
                      {isQrLoading || !qrCodeDataUrl ? (
                        <div className="w-full h-full flex items-center justify-center bg-muted rounded-md"><Loader2 className="h-8 w-8 animate-spin" /></div>
                      ) : (
                        <Image src={qrCodeDataUrl} alt="QR Code Absensi" width={224} height={224} className="w-full h-full" />
                      )}
                    </div>
                    <Button onClick={handleGenerateNewQr} variant="outline" className="w-full max-w-[256px]" disabled={isQrLoading}>{isQrLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}Buat QR Code Baru</Button>
                  </CardContent>
                  <CardFooter className="flex flex-col gap-2 border-t p-4 sm:p-6">
                    <Button className="w-full" onClick={() => downloadQRCode('pdf')} disabled={isQrLoading}><Download className="mr-2 h-4 w-4" />Unduh PDF</Button>
                    <Button variant="outline" className="w-full" onClick={() => downloadQRCode('png')} disabled={isQrLoading}><Download className="mr-2 h-4 w-4" />Unduh PNG</Button>
                  </CardFooter>
                </Card>
            </div>
            <div className="lg:col-span-2">
                <Card>
                  <CardHeader className="p-4 sm:p-6">
                    <CardTitle>Pengaturan Absensi Umum</CardTitle>
                    <CardDescription>Atur parameter untuk sistem absensi di seluruh sekolah.</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-6 p-4 sm:p-6">
                    <div className="rounded-lg border p-4 space-y-4">
                        <div className="flex items-start sm:items-center justify-between">
                            <div>
                                <Label htmlFor="attendance-active" className="font-semibold">Sistem Absensi Aktif</Label>
                                <p className="text-sm text-muted-foreground">Jika non-aktif, sistem absensi tidak bisa digunakan.</p>
                            </div>
                            <Switch id="attendance-active" checked={!holidayMode} onCheckedChange={(checked) => setHolidayMode(!checked)} className="mt-1 sm:mt-0" />
                        </div>
                        <div className="space-y-3 pt-4 border-t">
                             <div>
                               <Label className='font-medium'>Hari Libur Rutin</Label>
                               <p className="text-sm text-muted-foreground">Pilih hari libur yang berulang setiap minggu.</p>
                             </div>
                            <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
                              {daysOfWeek.map(day => (
                                  <div key={day.value} className="flex items-center space-x-2">
                                    <Checkbox id={`day-${day.value}`} checked={offDays.includes(day.value)} onCheckedChange={(checked) => handleDayToggle(day.value, checked)} disabled={holidayMode} />
                                    <Label htmlFor={`day-${day.value}`} className="font-normal cursor-pointer">{day.label}</Label>
                                  </div>
                              ))}
                            </div>
                        </div>
                    </div>

                    <div className="rounded-lg border p-4 space-y-4">
                      <div className="flex items-center justify-between">
                        <div><Label htmlFor="use-location" className="font-semibold">Gunakan Validasi Lokasi</Label><p className="text-sm text-muted-foreground">Wajibkan pengguna berada di area sekolah untuk absen.</p></div>
                        <Switch id="use-location" checked={useLocationValidation} onCheckedChange={setUseLocationValidation} disabled={holidayMode} />
                      </div>
                      {useLocationValidation && (
                        <div className="space-y-4 pt-4 border-t">
                          <div className="space-y-2">
                            <div className="flex items-center justify-between gap-4"><Label>Koordinat Lokasi Sekolah</Label><Button type="button" variant="outline" size="sm" onClick={handleGetCurrentLocation} disabled={isLocating || holidayMode}>{isLocating ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <LocateFixed className="mr-2 h-4 w-4" />}Dapatkan Lokasi</Button></div>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                              <div><Label htmlFor="latitude" className="text-xs text-muted-foreground">Latitude</Label><Input id="latitude" type="text" value={latitude} onChange={(e) => setLatitude(e.target.value)} placeholder="Contoh: -8.58333" disabled={holidayMode || isLocating} /></div>
                              <div><Label htmlFor="longitude" className="text-xs text-muted-foreground">Longitude</Label><Input id="longitude" type="text" value={longitude} onChange={(e) => setLongitude(e.target.value)} placeholder="Contoh: 120.46667" disabled={holidayMode || isLocating} /></div>
                            </div>
                          </div>
                          <div className="space-y-2"><Label htmlFor="radius">Radius Sekolah (meter)</Label><Input id="radius" type="number" value={radius} onChange={(e) => setRadius(Number(e.target.value))} placeholder="Contoh: 100" disabled={holidayMode} /><p className="text-sm text-muted-foreground">Jarak maksimal dari titik pusat sekolah yang dianggap valid.</p></div>
                          <div className="space-y-2"><Label>Pratinjau Lokasi di Peta</Label><div className="aspect-video w-full overflow-hidden rounded-lg border"><iframe key={`${latitude}-${longitude}`} width="100%" height="100%" loading="lazy" allowFullScreen referrerPolicy="no-referrer-when-downgrade" src={`https://maps.google.com/maps?q=${latitude},${longitude}&hl=id&z=15&output=embed`} title="Pratinjau Lokasi Peta"></iframe></div></div>
                        </div>
                      )}
                    </div>
                    
                    <div className="rounded-lg border p-4 space-y-4">
                        <div className="flex items-center justify-between">
                            <div><Label htmlFor="use-time" className="font-semibold">Gunakan Validasi Jam Kerja</Label><p className="text-sm text-muted-foreground">Wajibkan pengguna absen di dalam jam kerja yang ditentukan.</p></div>
                            <Switch id="use-time" checked={useTimeValidation} onCheckedChange={setUseTimeValidation} disabled={holidayMode} />
                        </div>
                        {useTimeValidation && (
                            <div className="space-y-6 pt-4 border-t">
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                    <div className="space-y-2"><Label htmlFor="checkin-start">Jam Mulai Masuk</Label><Input id="checkin-start" type="time" value={checkInStart} onChange={e => setCheckInStart(e.target.value)} disabled={holidayMode} /></div>
                                    <div className="space-y-2"><Label htmlFor="checkin-end">Jam Selesai Masuk</Label><Input id="checkin-end" type="time" value={checkInEnd} onChange={e => setCheckInEnd(e.target.value)} disabled={holidayMode} /></div>
                                </div>
                                
                                <div className="space-y-4">
                                    <div>
                                        <Label>Jam Pulang (Spesifik per Hari)</Label>
                                        <p className="text-sm text-muted-foreground">Atur rentang waktu absensi pulang untuk setiap hari kerja.</p>
                                    </div>
                                    <div className="space-y-3 rounded-md border p-3">
                                        {daysOfWeek.filter(d => !offDays.includes(d.value)).map(day => (
                                            <div key={day.value} className="grid grid-cols-1 sm:grid-cols-5 items-center gap-2">
                                                <Label htmlFor={`checkout-start-${day.value}`} className="sm:col-span-2 text-sm font-normal">{day.label}</Label>
                                                <div className="sm:col-span-3 grid grid-cols-2 gap-2">
                                                    <Input id={`checkout-start-${day.value}`} type="time" value={checkOutTimes[day.value as keyof typeof checkOutTimes]?.start || ''} onChange={e => handleTimeChange(day.value, 'start', e.target.value)} disabled={holidayMode} aria-label={`Jam mulai pulang ${day.label}`} />
                                                    <Input id={`checkout-end-${day.value}`} type="time" value={checkOutTimes[day.value as keyof typeof checkOutTimes]?.end || ''} onChange={e => handleTimeChange(day.value, 'end', e.target.value)} disabled={holidayMode} aria-label={`Jam selesai pulang ${day.label}`} />
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
                  </CardContent>
                   <CardFooter className="border-t p-4 sm:p-6">
                     <Button onClick={handleSave} disabled={isSaving}>{isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}<span>Simpan Pengaturan Umum</span></Button>
                  </CardFooter>
                </Card>
            </div>
        </div>

        {/* SECTION 3: Monthly and Weight Settings */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2">
                {schoolConfigData && <MonthlyConfigCalendar user={user} schoolConfig={schoolConfigData} />}
            </div>
            <div className="lg:col-span-1">
                <AttendanceWeightSettings />
            </div>
        </div>
    </div>
  );
}
