'use client';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { useUser, useFirestore, FirestorePermissionError, errorEmitter, useCollection, useDoc, useMemoFirebase } from '@/firebase';
import { addDoc, collection, serverTimestamp, query, where, Timestamp, doc } from 'firebase/firestore';
import { useToast } from '@/hooks/use-toast';
import { Info, Loader2 } from 'lucide-react';
import { format, startOfDay, endOfDay, addDays, setHours, setMinutes } from 'date-fns';
import { id } from 'date-fns/locale';
import { useRouter } from 'next/navigation';
import { useState, useEffect, useMemo } from 'react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { PageWrapper } from '@/components/layout/page-wrapper';
import { useSettings } from '@/contexts/SettingsContext'; // FINAL FIX: Import useSettings

// --- Centralized Leave Type Definitions ---
const LEAVE_TYPES = {
  sick: 'Sakit',
  permission: 'Izin (Pribadi)',
  official_duty: 'Dinas Full (1 Hari)',
  dinas_pagi: 'Dinas Pagi',
  dinas_siang: 'Dinas Siang',
  early_leave: 'Izin Pulang Cepat',
} as const; 

const leaveTypeKeys = [
  'sick',
  'permission',
  'official_duty',
  'dinas_pagi',
  'dinas_siang',
  'early_leave',
] as [keyof typeof LEAVE_TYPES, ...(keyof typeof LEAVE_TYPES)[]];


const leaveRequestSchema = z.object({
  leaveDate: z.string().nonempty('Tanggal pengajuan wajib dipilih.'),
  type: z.enum(leaveTypeKeys, {
    required_error: 'Jenis pengajuan wajib dipilih.',
  }),
  reason: z.string().min(10, { message: 'Alasan harus diisi minimal 10 karakter.' }),
  proofUrl: z.string().url({ message: 'URL bukti tidak valid.' }).optional().or(z.literal('')),
});

export default function IzinPage() {
    const form = useForm<z.infer<typeof leaveRequestSchema>>({
        resolver: zodResolver(leaveRequestSchema),
        defaultValues: {
            leaveDate: 'today',
            type: '' as any, 
            reason: '',
            proofUrl: '',
        }
    });
    const { user } = useUser();
    const firestore = useFirestore();
    const { toast } = useToast();
    const router = useRouter();
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [currentTime, setCurrentTime] = useState(new Date());

    // FINAL FIX: Get settings from the reliable context
    const { schoolConfig, holidays, isSettingsLoading } = useSettings();

    useEffect(() => {
        const timerId = setInterval(() => setCurrentTime(new Date()), 60000);
        return () => clearInterval(timerId);
    }, []);

    // FINAL FIX: Date options are now derived from the SettingsContext, ensuring synchronization.
    const dateOptions = useMemo(() => {
        const now = new Date();
        
        const isHoliday = (date: Date) => {
            // 1. Check for recurring off-days (e.g., Sunday) from schoolConfig
            const offDays = schoolConfig?.offDays ?? [];
            if (offDays.includes(date.getDay())) return true;

            // 2. Check for special holidays from the global 'holidays' Set
            const dateString = format(date, 'yyyy-MM-dd');
            return holidays.has(dateString);
        };

        const todayDate = now;
        const tomorrowDate = addDays(now, 1);

        return {
            today: {
                date: todayDate,
                formatted: format(todayDate, 'eeee, d MMMM yyyy', { locale: id }),
                isHoliday: isHoliday(todayDate),
            },
            tomorrow: {
                date: tomorrowDate,
                formatted: format(tomorrowDate, 'eeee, d MMMM yyyy', { locale: id }),
                isHoliday: isHoliday(tomorrowDate),
            },
        };
    }, [holidays, schoolConfig]);

    const selectedDateValue = form.watch('leaveDate');
    const selectedLeaveType = form.watch('type');

    const targetDate = useMemo(() => {
      return selectedDateValue === 'tomorrow' ? dateOptions.tomorrow.date : dateOptions.today.date;
    }, [selectedDateValue, dateOptions]);

    const targetDateStart = useMemo(() => startOfDay(targetDate), [targetDate]);
    const targetDateEnd = useMemo(() => endOfDay(targetDate), [targetDate]);

    const attendanceQuery = useMemoFirebase(() => {
        if (!user || !firestore) return null;
        return query(
            collection(firestore, 'users', user.uid, 'attendanceRecords'),
            where('checkInTime', '>=', Timestamp.fromDate(targetDateStart)),
            where('checkInTime', '<', Timestamp.fromDate(targetDateEnd))
        );
    }, [user, firestore, targetDateStart, targetDateEnd]);
    const { data: targetDateAttendance, isLoading: isAttendanceLoading } = useCollection(user, attendanceQuery);
    
    const hasCheckedIn = useMemo(() => !!(targetDateAttendance && targetDateAttendance[0]?.checkInTime), [targetDateAttendance]);
    const hasCheckedOut = useMemo(() => !!(targetDateAttendance && targetDateAttendance[0]?.checkOutTime), [targetDateAttendance]);

    const leaveQuery = useMemoFirebase(() => {
        if (!user || !firestore) return null;
        return query(
            collection(firestore, 'users', user.uid, 'leaveRequests'),
            where('startDate', '>=', Timestamp.fromDate(targetDateStart)),
            where('startDate', '<=', Timestamp.fromDate(targetDateEnd))
        );
    }, [user, firestore, targetDateStart, targetDateEnd]);
    const { data: targetDateLeave, isLoading: isLeaveLoading } = useCollection(user, leaveQuery);

    const isPastCheckoutTime = useMemo(() => {
        if (!schoolConfig?.checkOutStartTime) return false;
        const [hours, minutes] = schoolConfig.checkOutStartTime.split(':').map(Number);
        const checkOutStart = setMinutes(setHours(startOfDay(currentTime), hours), minutes);
        return currentTime > checkOutStart;
    }, [currentTime, schoolConfig]);
    
    const availableLeaveTypes = useMemo(() => {
        const isToday = selectedDateValue === 'today';
        const fullDayLeaveDisabled = hasCheckedIn || (isToday && isPastCheckoutTime);
        const partialLeaveDisabled = !isToday || !hasCheckedIn || hasCheckedOut;

        return leaveTypeKeys.map(key => ({
            value: key,
            label: LEAVE_TYPES[key],
            disabled: (['early_leave', 'dinas_siang'].includes(key)) ? partialLeaveDisabled : fullDayLeaveDisabled,
        }));
    }, [selectedDateValue, hasCheckedIn, hasCheckedOut, isPastCheckoutTime]);

    useEffect(() => {
        if (dateOptions.today.isHoliday && form.getValues('leaveDate') === 'today') {
            form.resetField('leaveDate');
        }
    }, [dateOptions, form]);

    useEffect(() => {
        const selectedType = form.getValues('type');
        if (selectedType) {
            const typeIsDisabled = availableLeaveTypes.find(t => t.value === selectedType)?.disabled;
            if (typeIsDisabled) {
                form.resetField('type', { keepError: false });
            }
        }
    }, [availableLeaveTypes, form]);

    async function onSubmit(values: z.infer<typeof leaveRequestSchema>) {
        if (!user || !firestore) return;
        
        const partialLeaveTypes: (keyof typeof LEAVE_TYPES)[] = ['early_leave', 'dinas_siang'];

        if (partialLeaveTypes.includes(values.type)) {
            if (!hasCheckedIn) {
                toast({ variant: 'destructive', title: 'Gagal Mengirim Pengajuan', description: 'Anda harus absen masuk terlebih dahulu untuk mengajukan izin ini.' });
                return;
            }
            if (hasCheckedOut) {
                toast({ variant: 'destructive', title: 'Gagal Mengirim Pengajuan', description: 'Anda sudah absen pulang, tidak dapat mengajukan izin ini.' });
                return;
            }
        } else {
            if (hasCheckedIn) {
                toast({ variant: 'destructive', title: 'Gagal Mengirim Pengajuan', description: `Anda sudah melakukan absensi hari ini, tidak dapat mengajukan izin satu hari penuh.` });
                return;
            }
        }

        if (values.leaveDate === 'today' && isPastCheckoutTime && !partialLeaveTypes.includes(values.type)) {
            toast({ variant: 'destructive', title: 'Waktu Pengajuan Habis', description: 'Anda tidak dapat mengajukan izin untuk hari ini setelah jam kerja berakhir.' });
            return;
        }

        if (targetDateLeave && targetDateLeave.length > 0) {
            const existingLeaveType = targetDateLeave[0].type as keyof typeof LEAVE_TYPES;
            const existingLeaveLabel = LEAVE_TYPES[existingLeaveType] || existingLeaveType;
            toast({ variant: 'destructive', title: 'Gagal Mengirim Pengajuan', description: `Anda sudah pernah mengajukan '${existingLeaveLabel}' untuk ${format(targetDate, 'd MMMM yyyy', { locale: id })}.` });
            return;
        }

        setIsSubmitting(true);

        const dataToSave = {
            userId: user.uid,
            type: values.type,
            startDate: Timestamp.fromDate(startOfDay(targetDate)),
            endDate: Timestamp.fromDate(endOfDay(targetDate)),
            reason: values.reason,
            proofUrl: values.proofUrl || null,
            status: 'pending',
            createdAt: serverTimestamp(),
        };

        const leaveCollectionRef = collection(firestore, 'users', user.uid, 'leaveRequests');
        
        addDoc(leaveCollectionRef, dataToSave)
            .then(() => {
                toast({ title: 'Pengajuan Terkirim', description: 'Menunggu persetujuan dari Kepala Sekolah.' });
                router.push('/dashboard/laporan');
            })
            .catch((error) => {
                console.error('Failed to submit leave request:', error);
                const contextualError = new FirestorePermissionError({ operation: 'create', path: leaveCollectionRef.path, requestResourceData: dataToSave });
                errorEmitter.emit('permission-error', contextualError);
                toast({ title: 'Gagal Mengirim Pengajuan', description: error.message || 'Terjadi kesalahan. Periksa koneksi Anda dan coba lagi.', variant: 'destructive' });
            })
            .finally(() => setIsSubmitting(false));
    }

    const isChecking = isAttendanceLoading || isLeaveLoading || isSettingsLoading;
    const isTodayAndPastCheckout = selectedDateValue === 'today' && isPastCheckoutTime;

    const getSubmitButtonText = () => {
      if (isChecking) return 'Memeriksa data...';
      if (selectedLeaveType === 'early_leave' || selectedLeaveType === 'dinas_siang') return 'Ajukan Izin Meninggalkan Sekolah';
      return 'Kirim Pengajuan Ketidakhadiran';
    }

    return (
        <PageWrapper>
            <Card className="w-full">
                <Form {...form}>
                    <form onSubmit={form.handleSubmit(onSubmit)}>
                        <CardHeader>
                            <CardTitle>Formulir Pengajuan Izin</CardTitle>
                            <CardDescription>Isi formulir untuk mengajukan ketidakhadiran atau izin meninggalkan sekolah. Pengajuan akan ditinjau oleh Kepala Sekolah.</CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-6">
                            {isChecking ? (
                                <div className="w-full flex items-center justify-center p-8 bg-muted rounded-md"><Loader2 className="h-6 w-6 animate-spin" /></div>
                            ) : (
                                <>
                                    {dateOptions.today.isHoliday && selectedDateValue === 'today' && (
                                        <Alert variant="default"> 
                                            <Info className="h-4 w-4" />
                                            <AlertTitle>Hari Ini Adalah Hari Libur</AlertTitle>
                                            <AlertDescription>
                                                Anda tidak dapat mengajukan izin karena hari ini adalah hari libur sesuai pengaturan.
                                            </AlertDescription>
                                        </Alert>
                                    )}
                                    {isTodayAndPastCheckout && !hasCheckedIn && (
                                        <Alert variant="destructive">
                                            <Info className="h-4 w-4" />
                                            <AlertTitle>Waktu Pengajuan Izin Hari Ini Telah Berakhir</AlertTitle>
                                            <AlertDescription>
                                                Anda tidak dapat lagi mengajukan izin penuh waktu untuk hari ini karena telah melewati jam kerja. Silakan pilih "Besok".
                                            </AlertDescription>
                                        </Alert>
                                    )}
                                    
                                    {selectedDateValue === 'today' && !dateOptions.today.isHoliday && (
                                        <Alert variant="default">
                                            <Info className="h-4 w-4" />
                                            <AlertTitle>Info Izin</AlertTitle>
                                            <AlertDescription>
                                                {hasCheckedIn 
                                                ? 'Anda sudah absen masuk. Anda bisa mengajukan izin parsial (Dinas Siang/Pulang Cepat).' 
                                                : 'Opsi izin parsial (Dinas Siang/Pulang Cepat) akan aktif setelah Anda absen masuk.'} 
                                            </AlertDescription>
                                        </Alert>
                                    )}

                                    <FormField
                                        control={form.control}
                                        name="leaveDate"
                                        render={({ field }) => (
                                            <FormItem>
                                                <FormLabel>Pilih Tanggal Pengajuan</FormLabel>
                                                <Select 
                                                    onValueChange={field.onChange} 
                                                    value={field.value}
                                                    disabled={isSettingsLoading || (dateOptions.today.isHoliday && dateOptions.tomorrow.isHoliday)}
                                                >
                                                    <FormControl>
                                                        <SelectTrigger>
                                                            <SelectValue placeholder="Pilih tanggal pengajuan" />
                                                        </SelectTrigger>
                                                    </FormControl>
                                                    <SelectContent>
                                                        <SelectItem value="today" disabled={dateOptions.today.isHoliday}>
                                                            Hari Ini ({dateOptions.today.formatted}) {dateOptions.today.isHoliday && "(Hari Libur)"}
                                                        </SelectItem>
                                                        <SelectItem value="tomorrow" disabled={dateOptions.tomorrow.isHoliday}>
                                                            Besok ({dateOptions.tomorrow.formatted}) {dateOptions.tomorrow.isHoliday && "(Hari Libur)"}
                                                        </SelectItem>
                                                    </SelectContent>
                                                </Select>
                                                 {(dateOptions.today.isHoliday && dateOptions.tomorrow.isHoliday) && (
                                                    <p className="text-sm text-destructive mt-2">
                                                        Tidak ada tanggal yang dapat dipilih karena hari ini dan besok adalah hari libur.
                                                    </p>
                                                )}
                                                <FormMessage />
                                            </FormItem>
                                        )}
                                    />
                                    <FormField
                                        control={form.control}
                                        name="type"
                                        render={({ field }) => (
                                            <FormItem>
                                                <FormLabel>Jenis Pengajuan</FormLabel>
                                                <Select onValueChange={field.onChange} value={field.value}>
                                                    <FormControl>
                                                        <SelectTrigger>
                                                            <SelectValue placeholder="Pilih jenis pengajuan" />
                                                        </SelectTrigger>
                                                    </FormControl>
                                                    <SelectContent>
                                                        {availableLeaveTypes.map(type => (
                                                            <SelectItem key={type.value} value={type.value} disabled={type.disabled}>
                                                                {type.label}
                                                            </SelectItem>
                                                        ))}
                                                    </SelectContent>
                                                </Select>
                                                <FormMessage />
                                            </FormItem>
                                        )}
                                    />
                                    <FormField
                                        control={form.control}
                                        name="reason"
                                        render={({ field }) => (
                                            <FormItem>
                                                <FormLabel>Alasan</FormLabel>
                                                <FormControl>
                                                    <Textarea placeholder="Jelaskan alasan Anda..." {...field} />
                                                </FormControl>
                                                <FormMessage />
                                            </FormItem>
                                        )}
                                    />
                                    <FormField
                                        control={form.control}
                                        name="proofUrl"
                                        render={({ field }) => (
                                            <FormItem>
                                                <FormLabel>Link Bukti (Opsional)</FormLabel>
                                                <FormControl>
                                                    <Input placeholder="https://... (contoh: link surat dokter)" {...field} />
                                                </FormControl>
                                                <FormMessage />
                                            </FormItem>
                                        )}
                                    />
                                </>
                            )}
                        </CardContent>
                        <CardFooter className="border-t pt-6">
                            <Button type="submit" disabled={isSubmitting || isChecking || (selectedDateValue === 'today' && dateOptions.today.isHoliday) || (selectedDateValue === 'tomorrow' && dateOptions.tomorrow.isHoliday)}>
                               {(isSubmitting || isChecking) && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                               {getSubmitButtonText()}
                            </Button>
                        </CardFooter>
                    </form>
                </Form>
            </Card>
        </PageWrapper>
    );
}
