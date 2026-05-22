'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
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
import { doc, setDoc } from 'firebase/firestore';
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

// --- CONSTANTS ---

const daysOfWeek = [
    { value: 0, label: 'Minggu' }, { value: 1, label: 'Senin' }, { value: 2, label: 'Selasa' }, 
    { value: 3, label: 'Rabu' }, { value: 4, label: 'Kamis' }, { value: 5, label: 'Jumat' }, { value: 6, label: 'Sabtu' },
];

const defaultCheckOutTimes = {
    1: { start: '14:00', end: '16:00' }, 2: { start: '14:00', end: '16:00' }, 3: { start: '14:00', end: '16:00' },
    4: { start: '14:00', end: '16:00' }, 5: { start: '13:00', end: '15:00' }, 6: { start: '12:00', end: '14:00' },
};

const defaultReportLabels = {
    present: 'Hadir Penuh', late: 'Terlambat', absent: 'Alpa', permission: 'Izin/Sakit', official_duty: 'Dinas',
    full_day: 'Hadir Penuh', no_check_in: 'Tidak Absen Masuk', no_check_out: 'Tidak Absen Pulang',
};

const defaultAttendanceWeights = {
    present: 1, 
    late: 0.5, 
    no_check_out: 0.5,
    no_check_in: 0.5,
    permission: 0.75, 
    official_duty: 1, 
    absent: 0
};

const statusKeyToLabelMap: { [key: string]: string } = {
    present: 'Hadir Penuh (Masuk & Pulang)',
    late: 'Terlambat',
    absent: 'Alpa',
    permission: 'Izin',
    official_duty: 'Izin Dinas',
    full_day: 'Hadir Penuh',
    no_check_in: 'Hanya Absen Pulang (Tanpa Masuk)',
    no_check_out: 'Hanya Absen Masuk (Tanpa Pulang)',
};

// --- CHILD COMPONENTS ---

function MonthlyConfigCalendar({ user, schoolConfig, onHolidaysChange }: { user: any, schoolConfig: any, onHolidaysChange: (holidays: Date[], workDays: number, monthId: string) => void }) {
  const firestore = useFirestore();
  const [currentMonth, setCurrentMonth] = useState(startOfMonth(new Date()));
  const [holidays, setHolidays] = useState<Date[]>([]);
  
  const monthlyConfigId = useMemo(() => format(currentMonth, 'yyyy-MM'), [currentMonth]);
  const monthlyConfigRef = useMemoFirebase(() => firestore ? doc(firestore, 'monthlyConfigs', monthlyConfigId) : null, [firestore, monthlyConfigId]);
  
  const { data: monthlyConfigData, isLoading: isMonthlyConfigLoading } = useDoc(user, monthlyConfigRef);
  
  const allDaysInMonth = useMemo(() => eachDayOfInterval({ start: startOfMonth(currentMonth), end: new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 0) }), [currentMonth]);

  useEffect(() => {
    setHolidays(monthlyConfigData?.holidays?.map((d: string) => new Date(`${d}T00:00:00`)) ?? []);
  }, [monthlyConfigData]);

  const calculatedWorkDays = useMemo(() => {
    if (!schoolConfig) return 0;
    const recurringOffDays: number[] = schoolConfig.offDays ?? [0, 6];
    const specificHolidays = new Set(holidays.map(d => format(d, 'yyyy-MM-dd')));
    return allDaysInMonth.filter(day => !recurringOffDays.includes(day.getDay()) && !specificHolidays.has(format(day, 'yyyy-MM-dd'))).length;
  }, [allDaysInMonth, holidays, schoolConfig]);

  useEffect(() => {
    onHolidaysChange(holidays, calculatedWorkDays, monthlyConfigId);
  }, [holidays, calculatedWorkDays, monthlyConfigId, onHolidaysChange]);

  const handleDayToggle = (day: Date, checked: boolean) => {
    setHolidays(prev => checked ? [...prev, day] : prev.filter(d => format(d, 'yyyy-MM-dd') !== format(day, 'yyyy-MM-dd')));
  };
  
  return (
    <Card>
        <CardHeader>
            <CardTitle>Pengaturan Hari Libur Bulanan</CardTitle>
            <CardDescription>Tandai hari libur spesifik (misalnya: libur nasional). Hari kerja efektif akan dihitung & disimpan per bulan.</CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="md:col-span-2 space-y-4">
                {isMonthlyConfigLoading ? <div className="w-full h-full flex items-center justify-center bg-muted rounded-md p-10"><Loader2 className="h-8 w-8 animate-spin" /></div> : <> 
                    <div className="flex items-center justify-center gap-4">
                        <Button variant="outline" size="icon" onClick={() => setCurrentMonth(prev => new Date(prev.getFullYear(), prev.getMonth() - 1, 1))}><ChevronLeft /></Button>
                        <span className="font-semibold text-center w-32">{format(currentMonth, 'MMMM yyyy', { locale: id })}</span>
                        <Button variant="outline" size="icon" onClick={() => setCurrentMonth(prev => new Date(prev.getFullYear(), prev.getMonth() + 1, 1))}><ChevronRight /></Button>
                    </div>
                    <ScrollArea className="h-96 rounded-md border">
                        <Table><TableBody>
                            {allDaysInMonth.map((day) => {
                                const dayString = format(day, 'yyyy-MM-dd');
                                const isChecked = holidays.some(d => format(d, 'yyyy-MM-dd') === dayString);
                                const isRecurringOff = (schoolConfig?.offDays ?? [0, 6]).includes(day.getDay());
                                return (
                                    <TableRow key={dayString} className={`has-[:checked]:bg-primary/10 ${isRecurringOff ? 'bg-muted/50 text-muted-foreground' : ''}`}>
                                        <TableCell className="w-12 text-center py-2"><Checkbox id={dayString} checked={isChecked || isRecurringOff} disabled={isRecurringOff} onCheckedChange={(checked) => handleDayToggle(day, !!checked)} /></TableCell>
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
                    <div className="flex items-center h-10 w-full rounded-md border border-input bg-muted px-3 py-2 text-sm select-none">{isMonthlyConfigLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : calculatedWorkDays}</div>
                    <p className="text-xs text-muted-foreground">Dihitung otomatis berdasarkan libur rutin & spesifik.</p>
                </div>
            </div>
        </CardContent>
    </Card>
  );
}

// --- MAIN PAGE COMPONENT ---

export default function KonfigurasiAbsenPage() {
  const { toast } = useToast();
  const firestore = useFirestore();
  const { user, isUserLoading: isAuthLoading } = useUser();
  const router = useRouter();
  
  // --- State ---
  const [isSaving, setIsSaving] = useState(false);
  const [isLocating, setIsLocating] = useState(false);
  const [qrCodeDataUrl, setQrCodeDataUrl] = useState<string>('');
  const [isQrLoading, setIsQrLoading] = useState(true);

  // Form State: General Settings
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
  
  // Form State: Report Labels
  const [reportLabels, setReportLabels] = useState(defaultReportLabels);

  // Form State: Attendance Weights
  const [attendanceWeights, setAttendanceWeights] = useState(defaultAttendanceWeights);

  // Form State: Monthly Holidays
  const [monthlyHolidayData, setMonthlyHolidayData] = useState<{holidays: Date[], workDays: number, monthId: string} | null>(null);
  
  // --- Firestore Data ---
  const schoolConfigRef = useMemoFirebase(() => doc(firestore, 'schoolConfig', 'default'), [firestore]);
  const { data: schoolConfigData, isLoading: isConfigLoading } = useDoc(user, schoolConfigRef);
  const userDocRef = useMemoFirebase(() => user ? doc(firestore, 'users', user.uid) : null, [firestore, user]);
  const { data: userData, isLoading: isUserDataLoading } = useDoc(user, userDocRef);

  // --- Derived State & Authorization ---
  const isLoading = isAuthLoading || isConfigLoading || isUserDataLoading;
  const isAdmin = !isLoading && userData?.role === 'admin';

  // --- Effects ---
  useEffect(() => {
    if (!isLoading && !isAdmin) router.replace('/dashboard');
  }, [isLoading, isAdmin, router]);

  useEffect(() => {
    if (schoolConfigData) {
      // General Settings
      setHolidayMode(schoolConfigData.isAttendanceActive === false);
      setOffDays(schoolConfigData.offDays ?? [0, 6]);
      setUseLocationValidation(schoolConfigData.useLocationValidation ?? true);
      setUseTimeValidation(schoolConfigData.useTimeValidation ?? true);
      setLatitude(schoolConfigData.latitude?.toString() ?? '-8.58333');
      setLongitude(schoolConfigData.longitude?.toString() ?? '120.46667');
      setRadius(schoolConfigData.radius ?? 100);
      setCheckInStart(schoolConfigData.checkInStartTime ?? '06:00');
      setCheckInEnd(schoolConfigData.checkInEndTime ?? '08:00');
      setCheckOutTimes(prev => ({ ...defaultCheckOutTimes, ...schoolConfigData.checkOutTimes }));
      if (schoolConfigData.qrCodeValue) setQrCodeValue(schoolConfigData.qrCodeValue);
      
      // Report Labels & Weights
      setReportLabels(prev => ({ ...defaultReportLabels, ...schoolConfigData.reportLabels }));
      setAttendanceWeights(prev => ({ ...defaultAttendanceWeights, ...schoolConfigData.attendanceWeights }));
    }
  }, [schoolConfigData]);

  useEffect(() => {
    if (qrCodeValue) {
      setIsQrLoading(true);
      QRCode.toDataURL(qrCodeValue, { width: 300, margin: 2, errorCorrectionLevel: 'H' }, (err, url) => {
        if (err) {
          console.error('QR Code generation failed:', err);
          toast({ variant: 'destructive', title: 'Gagal Membuat QR Code' });
        } else {
          setQrCodeDataUrl(url);
        }
        setIsQrLoading(false);
      });
    } else {
        setIsQrLoading(!isConfigLoading);
    }
  }, [qrCodeValue, toast, isConfigLoading]);

  // --- Handlers ---

  const handleMonthlyHolidaysChange = useCallback((holidays: Date[], workDays: number, monthId: string) => {
    setMonthlyHolidayData({ holidays, workDays, monthId });
  }, []);

  const handleTimeChange = (day: number, type: 'start' | 'end', value: string) => {
    setCheckOutTimes(prev => ({ ...prev, [day]: { ...(prev[day as keyof typeof prev] || {}), [type]: value } }));
  };
  
  const handleLabelChange = (key: keyof typeof reportLabels, value: string) => {
      setReportLabels(prev => ({ ...prev, [key]: value }));
  }

  const handleWeightChange = (key: keyof typeof attendanceWeights, value: string) => {
      const numValue = parseFloat(value);
      setAttendanceWeights(prev => ({ ...prev, [key]: isNaN(numValue) ? 0 : numValue }));
  }

  const downloadQRCode = async (format: 'png' | 'pdf') => {
    if (!qrCodeDataUrl) return toast({ variant: 'destructive', title: 'Gagal Mengunduh', description: 'QR Code belum siap.' });
    if (format === 'png') {
      const link = document.createElement('a');
      link.href = qrCodeDataUrl;
      link.download = 'absensi-qrcode.png';
      document.body.appendChild(link); link.click(); document.body.removeChild(link);
    } else {
      const { jsPDF } = await import('jspdf');
      const pdf = new jsPDF();
      pdf.setFontSize(20); pdf.text('QR Code Absensi E-SPENLI', 105, 20, { align: 'center' });
      pdf.addImage(qrCodeDataUrl, 'PNG', 65, 30, 80, 80);
      pdf.save('absensi-qrcode.pdf');
    }
    toast({ title: 'Berhasil', description: `QR Code berhasil diunduh sebagai ${format.toUpperCase()}.` });
  };
  
  const handleGenerateNewQr = () => {
    if (!schoolConfigRef) return;
    setIsQrLoading(true);
    const newQrValue = Math.random().toString(36).substring(2, 15);
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
    if (!schoolConfigRef) return;
    setIsSaving(true);

    try {
        const dataToSave = {
            isAttendanceActive: !holidayMode,
            offDays,
            useLocationValidation, useTimeValidation,
            latitude: parseFloat(latitude), longitude: parseFloat(longitude), radius: Number(radius),
            checkInStartTime: checkInStart, checkInEndTime: checkInEnd,
            checkOutTimes,
            reportLabels,
            attendanceWeights,
        };

        await setDoc(schoolConfigRef, dataToSave, { merge: true });

        if (monthlyHolidayData && firestore) {
            const monthlyRef = doc(firestore, 'monthlyConfigs', monthlyHolidayData.monthId);
            const monthlyData = { 
                id: monthlyHolidayData.monthId,
                holidays: monthlyHolidayData.holidays.map(d => format(d, 'yyyy-MM-dd')),
                workDays: monthlyHolidayData.workDays 
            };
            await setDoc(monthlyRef, monthlyData, { merge: true });
        }

        toast({ title: 'Pengaturan Disimpan', description: 'Konfigurasi absensi telah berhasil diperbarui.' });
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
  
  // --- Render ---

  if (isLoading || !isAdmin) {
    return <div className="flex items-center justify-center h-full"><Loader2 className="h-8 w-8 animate-spin" /></div>;
  }

  return (
    <TooltipProvider>
    <div className="space-y-6 pb-24">
      {/* General Settings & QR Code */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="lg:col-span-1">
          <CardHeader className="p-4 sm:p-6"><CardTitle>QR Code Absensi</CardTitle><CardDescription>Gunakan QR Code ini untuk absensi.</CardDescription></CardHeader>
          <CardContent className="flex flex-col items-center justify-center gap-4 p-4 sm:p-6">
            <div className="p-4 border rounded-lg bg-white aspect-square w-full max-w-[256px] relative">
              {isQrLoading || !qrCodeDataUrl ? <div className="w-full h-full flex items-center justify-center bg-muted rounded-md"><Loader2 className="h-8 w-8 animate-spin" /></div> 
              : <Image src={qrCodeDataUrl} alt="QR Code Absensi" width={224} height={224} className="w-full h-full" />}
            </div>
            <Button onClick={handleGenerateNewQr} variant="outline" className="w-full max-w-[256px]" disabled={isQrLoading}>{isQrLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}Buat QR Code Baru</Button>
          </CardContent>
          <CardFooter className="flex flex-col gap-2 border-t p-4 sm:p-6">
            <Button className="w-full" onClick={() => downloadQRCode('pdf')} disabled={isQrLoading}><Download className="mr-2 h-4 w-4" />Unduh PDF</Button>
            <Button variant="outline" className="w-full" onClick={() => downloadQRCode('png')} disabled={isQrLoading}><Download className="mr-2 h-4 w-4" />Unduh PNG</Button>
          </CardFooter>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader className="p-4 sm:p-6"><CardTitle>Pengaturan Absensi Umum</CardTitle><CardDescription>Atur parameter untuk sistem absensi di seluruh sekolah.</CardDescription></CardHeader>
          <CardContent className="space-y-6 p-4 sm:p-6">
            {/* Holiday Mode */}
            <div className="rounded-lg border p-4 space-y-4">
                <div className="flex items-center justify-between">
                    <div><Label htmlFor="holiday-mode" className="font-semibold">Non Aktif Sementara</Label><p className="text-sm text-muted-foreground">Jika aktif, sistem absensi non-aktif untuk semua.</p></div>
                    <Switch id="holiday-mode" checked={holidayMode} onCheckedChange={setHolidayMode} />
                </div>
                <div className="space-y-4 pt-4 border-t">
                    <Label className='font-medium'>Hari Libur Rutin</Label>
                    <p className="text-sm text-muted-foreground">Pilih hari libur rutin. Absensi non-aktif pada hari ini.</p>
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
                      {daysOfWeek.map(day => (
                          <div key={day.value} className="flex items-center space-x-2">
                            <Checkbox id={`day-${day.value}`} checked={offDays.includes(day.value)} onCheckedChange={(checked) => handleDayToggle(day.value, !!checked)} disabled={holidayMode} />
                            <Label htmlFor={`day-${day.value}`} className="font-normal">{day.label}</Label>
                          </div>
                      ))}
                    </div>
                </div>
            </div>

            {/* Location Validation */}
            <div className="rounded-lg border p-4 space-y-4">
              <div className="flex items-center justify-between">
                <div><Label htmlFor="use-location" className="font-semibold">Gunakan Validasi Lokasi</Label><p className="text-sm text-muted-foreground">Wajibkan pengguna di area sekolah untuk absen.</p></div>
                <Switch id="use-location" checked={useLocationValidation} onCheckedChange={setUseLocationValidation} disabled={holidayMode} />
              </div>
              {useLocationValidation && <div className="space-y-4 pt-4 border-t">
                  <div className="space-y-2">
                    <div className="flex items-center justify-between gap-4"><Label>Koordinat Lokasi Sekolah</Label><Button type="button" variant="outline" size="sm" onClick={handleGetCurrentLocation} disabled={isLocating || holidayMode}>{isLocating ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <LocateFixed className="mr-2 h-4 w-4" />}Dapatkan Lokasi</Button></div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div><Label htmlFor="latitude" className="text-xs text-muted-foreground">Latitude</Label><Input id="latitude" type="text" value={latitude} onChange={(e) => setLatitude(e.target.value)} disabled={holidayMode || isLocating} /></div>
                      <div><Label htmlFor="longitude" className="text-xs text-muted-foreground">Longitude</Label><Input id="longitude" type="text" value={longitude} onChange={(e) => setLongitude(e.target.value)} disabled={holidayMode || isLocating} /></div>
                    </div>
                  </div>
                  <div className="space-y-2"><Label htmlFor="radius">Radius Sekolah (meter)</Label><Input id="radius" type="number" value={radius} onChange={(e) => setRadius(Number(e.target.value))} disabled={holidayMode} /><p className="text-sm text-muted-foreground">Jarak toleransi maksimal dari titik pusat sekolah.</p></div>
                  <div className="space-y-2"><Label>Pratinjau Lokasi di Peta</Label><div className="aspect-video w-full overflow-hidden rounded-lg border"><iframe key={`${latitude}-${longitude}`} width="100%" height="100%" loading="lazy" allowFullScreen referrerPolicy="no-referrer-when-downgrade" src={`https://maps.google.com/maps?q=${latitude},${longitude}&hl=id&z=15&output=embed`} title="Pratinjau Peta"></iframe></div></div>
              </div>}
            </div>
            
            {/* Time Validation */}
            <div className="rounded-lg border p-4 space-y-4">
                <div className="flex items-center justify-between">
                    <div><Label htmlFor="use-time" className="font-semibold">Gunakan Validasi Jam Kerja</Label><p className="text-sm text-muted-foreground">Wajibkan absensi di dalam jam kerja yang ditentukan.</p></div>
                    <Switch id="use-time" checked={useTimeValidation} onCheckedChange={setUseTimeValidation} disabled={holidayMode} />
                </div>
                {useTimeValidation && <div className="space-y-6 pt-4 border-t">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div className="space-y-2"><Label htmlFor="checkin-start">Jam Mulai Masuk</Label><Input id="checkin-start" type="time" value={checkInStart} onChange={e => setCheckInStart(e.target.value)} disabled={holidayMode} /></div>
                        <div className="space-y-2"><Label htmlFor="checkin-end">Jam Selesai Masuk</Label><Input id="checkin-end" type="time" value={checkInEnd} onChange={e => setCheckInEnd(e.target.value)} disabled={holidayMode} /></div>
                    </div>
                    <div className="space-y-4">
                        <div><Label>Jam Pulang (Spesifik per Hari)</Label><p className="text-sm text-muted-foreground">Atur rentang waktu absensi pulang untuk tiap hari kerja.</p></div>
                        <div className="space-y-3 rounded-md border p-3">
                            {daysOfWeek.filter(d => d.value !== 0).map(day => (
                                <div key={day.value} className="grid grid-cols-1 sm:grid-cols-5 items-center gap-2">
                                    <Label htmlFor={`checkout-start-${day.value}`} className="sm:col-span-2 text-sm font-normal">{day.label}</Label>
                                    <div className="sm:col-span-3 grid grid-cols-2 gap-2">
                                        <Input id={`checkout-start-${day.value}`} type="time" value={checkOutTimes[day.value as keyof typeof checkOutTimes]?.start || ''} onChange={e => handleTimeChange(day.value, 'start', e.target.value)} disabled={holidayMode} />
                                        <Input id={`checkout-end-${day.value}`} type="time" value={checkOutTimes[day.value as keyof typeof checkOutTimes]?.end || ''} onChange={e => handleTimeChange(day.value, 'end', e.target.value)} disabled={holidayMode} />
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Report Customization */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card>
          <CardHeader><CardTitle>Kustomisasi Label Laporan</CardTitle><CardDescription>Ubah teks yang ditampilkan pada laporan absensi. Ini tidak akan mengubah logika.</CardDescription></CardHeader>
          <CardContent className="space-y-4">
            {Object.keys(reportLabels).map((key) => (
                <div key={key} className="grid grid-cols-3 items-center gap-4">
                    <Label htmlFor={`label-${key}`} className="text-muted-foreground">{statusKeyToLabelMap[key] || key}</Label>
                    <Input id={`label-${key}`} value={reportLabels[key as keyof typeof reportLabels]} onChange={(e) => handleLabelChange(key as keyof typeof reportLabels, e.target.value)} className="col-span-2" />
                </div>
            ))}
          </CardContent>
        </Card>
        <Card>
            <CardHeader>
                <CardTitle>Konfigurasi Bobot Kehadiran</CardTitle>
                <CardDescription>Tentukan nilai (poin) untuk setiap status kehadiran yang akan digunakan untuk menghitung skor akhir.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
                {Object.keys(attendanceWeights).map((key) => (
                    <div key={key} className="grid grid-cols-3 items-center gap-4">
                        <Label htmlFor={`weight-${key}`} className="text-muted-foreground flex items-center">
                            {statusKeyToLabelMap[key] || key}
                            <Tooltip>
                                <TooltipTrigger asChild><HelpCircle className="h-4 w-4 ml-2 text-muted-foreground/50 cursor-help" /></TooltipTrigger>
                                <TooltipContent><p>{`Bobot nilai untuk status ${statusKeyToLabelMap[key] || key}`}</p></TooltipContent>
                            </Tooltip>
                        </Label>
                        <Input id={`weight-${key}`} type="number" step="0.05" value={attendanceWeights[key as keyof typeof attendanceWeights]} onChange={(e) => handleWeightChange(key as keyof typeof attendanceWeights, e.target.value)} className="col-span-2" />
                    </div>
                ))}
            </CardContent>
        </Card>
      </div>

      {/* Monthly Holiday Settings */}
      {schoolConfigData && <MonthlyConfigCalendar user={user} schoolConfig={schoolConfigData} onHolidaysChange={handleMonthlyHolidaysChange} />}

      {/* Save Button Wrapper */}
      <div className="fixed bottom-6 right-6 z-50">
          <Button size="lg" onClick={handleSave} disabled={isSaving}>
              {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Simpan Semua Pengaturan
          </Button>
      </div>
    </div>
    </TooltipProvider>
  );
}
