'use client';

import { useState, useEffect, useMemo } from 'react';
import { useFirestore } from '@/firebase';
import { doc, writeBatch, Timestamp, collection } from 'firebase/firestore';
import { fetchUserMonthlyReportData, MonthlyReportData } from '@/lib/attendance';
import { 
    Dialog, 
    DialogContent, 
    DialogHeader, 
    DialogFooter, 
    DialogTitle, 
    DialogDescription,
    DialogClose
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { format, parse, parseISO, isValid, addMinutes } from 'date-fns';
import { id } from 'date-fns/locale';

// --- TYPE DEFINITIONS ---
interface ProblematicDay {
    id: string;
    date: string;
    status: string;
    description: string;
    checkInTime?: Timestamp | Date | null;
    checkOutTime?: Timestamp | Date | null;
}

interface EditAttendanceModalProps {
    user: { uid: string; [key: string]: any } | null;
    month: Date;
    isOpen: boolean;
    onClose: () => void;
    currentUser: { uid: string; [key: string]: any } | null;
    schoolConfig: any; // DEFINITIVE FIX: Receive schoolConfig as a prop
    monthlyConfig: any; // DEFINITIVE FIX: Receive monthlyConfig as a prop
}

// --- CONSTANTS ---
const FIX_AS_PRESENT = 'FIX_AS_PRESENT';
const FIX_AS_LEAVE = 'FIX_AS_LEAVE';
const FIX_AS_SICK = 'FIX_AS_SICK';
const FIX_AS_OFFICIAL_DUTY = 'FIX_AS_OFFICIAL_DUTY';
const FIX_CHECK_OUT = 'FIX_CHECK_OUT';
const FIX_CHECK_IN_ON_TIME = 'FIX_CHECK_IN_ON_TIME';
const FIX_CHECK_IN_LATE = 'FIX_CHECK_IN_LATE';

// --- HELPER FUNCTIONS ---
const parseTime = (timeStr: string, baseDate: Date): Date => {
    return parse(timeStr, 'HH:mm', baseDate);
};

const getRandomTimeInRange = (baseDate: Date, startTimeStr: string, endTimeStr: string): Date => {
    const startDate = parseTime(startTimeStr, baseDate);
    const endDate = parseTime(endTimeStr, baseDate);
    const randomTime = new Date(startDate.getTime() + Math.random() * (endDate.getTime() - startDate.getTime()));
    return randomTime;
};

export default function EditAttendanceModal({ user, month, isOpen, onClose, currentUser, schoolConfig, monthlyConfig }: EditAttendanceModalProps) {
    const firestore = useFirestore();
    const [problematicDays, setProblematicDays] = useState<ProblematicDay[]>([]);
    const [selectedActions, setSelectedActions] = useState<{ [key: string]: string | undefined }>({});
    const [leaveReasons, setLeaveReasons] = useState<{ [key: string]: string }>({});
    const [isLoading, setIsLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        // DEFINITIVE FIX: Guard against missing props, not just isOpen.
        if (!isOpen || !firestore || !user || !schoolConfig) {
            setIsLoading(false);
            return;
        }

        const getProblematicDays = async () => {
            setIsLoading(true);
            setError(null);
            try {
                // DEFINITIVE FIX: Use the schoolConfig and monthlyConfig from props.
                // No more manual fetching. monthlyConfig can be undefined, which is correct.
                const reportData: MonthlyReportData[] = await fetchUserMonthlyReportData(firestore, user.uid, month, schoolConfig, monthlyConfig);
                
                const problems: ProblematicDay[] = reportData
                    .filter(d => 
                        d.status === 'Alpa' || 
                        d.keterangan === 'Tidak Absen Pulang' ||
                        d.keterangan === 'Tidak Absen Masuk'
                    )
                    .map(d => ({
                        id: d.id,
                        date: d.date,
                        status: d.status,
                        description: d.keterangan, // Map keterangan to description
                        checkInTime: d.checkInTime ? parseISO(d.checkInTime) : null,
                        checkOutTime: d.checkOutTime ? parseISO(d.checkOutTime) : null,
                    }));

                setProblematicDays(problems);
                const initialActions = problems.reduce((acc, day) => {
                    acc[day.id] = '';
                    return acc;
                }, {} as { [key: string]: string });
                setSelectedActions(initialActions);
                setLeaveReasons({});
            } catch (err) {
                console.error("Error fetching problematic days:", err);
                setError('Gagal memuat data kehadiran. Silakan coba lagi.');
            } finally {
                setIsLoading(false);
            }
        };
        getProblematicDays();
    // DEFINITIVE FIX: Add schoolConfig and monthlyConfig to the dependency array.
    }, [isOpen, firestore, user, month, schoolConfig, monthlyConfig]);

    const handleActionChange = (dayId: string, action: string) => {
        setSelectedActions(prev => ({ ...prev, [dayId]: action }));
    };

    const handleCheckboxChange = (dayId: string, checked: boolean | undefined, action: string) => {
        setSelectedActions(prev => ({ ...prev, [dayId]: checked ? action : undefined }));
    };
    
    const handleReasonChange = (dayId: string, reason: string) => {
        setLeaveReasons(prev => ({ ...prev, [dayId]: reason }));
    };

    const handleSaveChanges = async () => {
        if (!currentUser?.uid || !schoolConfig || !user) {
            setError("Konfigurasi tidak lengkap atau pengguna tidak ditemukan. Gagal menyimpan.");
            return;
        }

        const actionsToPerform = Object.entries(selectedActions).filter(([_, action]) => action);
        if (actionsToPerform.length === 0) {
            setError("Tidak ada tindakan perbaikan yang dipilih.");
            return;
        }
        
        for (const [dayId, action] of actionsToPerform) {
            if ((action === FIX_AS_LEAVE || action === FIX_AS_OFFICIAL_DUTY || action === FIX_AS_SICK) && (!leaveReasons[dayId] || !leaveReasons[dayId].trim())) {
                const day = problematicDays.find(d => d.id === dayId);
                const dateString = day ? format(parseISO(day.date), 'dd MMMM', { locale: id }) : '';
                let type = 'Izin';
                if (action === FIX_AS_OFFICIAL_DUTY) type = 'Dinas';
                if (action === FIX_AS_SICK) type = 'Sakit';
                setError(`Keterangan ${type.toLowerCase()} untuk tanggal ${dateString} tidak boleh kosong.`);
                return;
            }
        }

        const { checkInStartTime = '07:00', checkInEndTime = '08:00', checkOutStartTime = '14:00', checkOutEndTime = '16:00' } = schoolConfig;

        setIsSaving(true);
        setError(null);

        try {
            const batch = writeBatch(firestore);
            
            for (const [dayId, action] of actionsToPerform) {
                const day = problematicDays.find(d => d.id === dayId);
                if (!day) continue;

                const recordDate = parseISO(day.date);
                const attendanceRecordRef = doc(firestore, 'users', user.uid, 'attendanceRecords', day.id);

                switch (action) {
                    case FIX_AS_PRESENT:
                        const randomCheckIn = getRandomTimeInRange(recordDate, checkInStartTime, checkInEndTime);
                        const randomCheckOut = getRandomTimeInRange(recordDate, checkOutStartTime, checkOutEndTime);
                        batch.set(attendanceRecordRef, {
                            userId: user.uid, date: day.id, 
                            checkInTime: Timestamp.fromDate(randomCheckIn), 
                            checkOutTime: Timestamp.fromDate(randomCheckOut), 
                            status: 'Hadir', description: 'Kehadiran Penuh',
                            manualEntry: true, updatedBy: currentUser.uid, updatedAt: Timestamp.now()
                        });
                        break;

                    case FIX_AS_LEAVE:
                    case FIX_AS_OFFICIAL_DUTY:
                    case FIX_AS_SICK:
                        let leaveType = 'Izin';
                        if (action === FIX_AS_OFFICIAL_DUTY) leaveType = 'Dinas';
                        if (action === FIX_AS_SICK) leaveType = 'Sakit';

                        const leaveRecordRef = doc(collection(firestore, 'users', user.uid, 'leaveRequests'));
                        
                        batch.set(leaveRecordRef, {
                            userId: user.uid,
                            status: 'approved',
                            type: leaveType,
                            reason: leaveReasons[dayId],
                            startDate: Timestamp.fromDate(recordDate),
                            endDate: Timestamp.fromDate(recordDate),
                            requestedAt: Timestamp.now(),
                            approvedAt: Timestamp.now(),
                            approvedBy: currentUser.uid,
                            manualEntry: true,
                            updatedBy: currentUser.uid,
                            updatedAt: Timestamp.now()
                        });
                        batch.delete(attendanceRecordRef);
                        break;

                    case FIX_CHECK_OUT:
                        const randomFixCheckOut = getRandomTimeInRange(recordDate, checkOutStartTime, checkOutEndTime);
                        batch.update(attendanceRecordRef, { 
                            checkOutTime: Timestamp.fromDate(randomFixCheckOut),
                            status: 'Hadir', description: 'Kehadiran Penuh',
                            updatedBy: currentUser.uid, updatedAt: Timestamp.now()
                        });
                        break;
                    
                    case FIX_CHECK_IN_ON_TIME:
                        const randomFixCheckIn = getRandomTimeInRange(recordDate, checkInStartTime, checkInEndTime);
                        batch.update(attendanceRecordRef, {
                            checkInTime: Timestamp.fromDate(randomFixCheckIn),
                            status: 'Hadir', description: 'Kehadiran Penuh',
                            updatedBy: currentUser.uid, updatedAt: Timestamp.now()
                        });
                        break;

                    case FIX_CHECK_IN_LATE:
                        const lateCheckInStart = addMinutes(parseTime(checkInEndTime, recordDate), 1);
                        const lateCheckInEnd = addMinutes(lateCheckInStart, 59);
                        const randomLateTime = new Date(lateCheckInStart.getTime() + Math.random() * (lateCheckInEnd.getTime() - lateCheckInStart.getTime()));
                        batch.update(attendanceRecordRef, {
                            checkInTime: Timestamp.fromDate(randomLateTime),
                            status: 'Hadir', description: 'Terlambat',
                            updatedBy: currentUser.uid, updatedAt: Timestamp.now()
                        });
                        break;
                }
            }

            await batch.commit();
            onClose();

        } catch (err) {
            console.error("Error saving attendance:", err);
            setError("Gagal menyimpan perubahan. Silakan coba lagi.");
        } finally {
            setIsSaving(false);
        }
    };

    const hasSelection = useMemo(() => Object.values(selectedActions).some(Boolean), [selectedActions]);

    const renderProblemOptions = (day: ProblematicDay) => {
        const actionForDay = selectedActions[day.id];
        
        if (day.status === 'Alpa') {
            return (
                <RadioGroup 
                    className="mt-2 flex flex-col gap-3"
                    value={actionForDay || ''} 
                    onValueChange={(value) => handleActionChange(day.id, value)}
                >
                    <div className="flex items-center space-x-2">
                        <RadioGroupItem value={FIX_AS_PRESENT} id={`${day.id}-present`} />
                        <Label htmlFor={`${day.id}-present`} className="font-normal cursor-pointer">Jadikan Hadir</Label>
                    </div>

                    <div className="flex flex-col space-y-2">
                         <div className="flex items-center space-x-2">
                            <RadioGroupItem value={FIX_AS_SICK} id={`${day.id}-sick`} />
                            <Label htmlFor={`${day.id}-sick`} className="font-normal cursor-pointer">Jadikan Sakit</Label>
                        </div>
                        {actionForDay === FIX_AS_SICK && (
                            <Textarea placeholder="Tuliskan keterangan sakit di sini..." className="ml-6 bg-background" value={leaveReasons[day.id] || ''} onChange={(e) => handleReasonChange(day.id, e.target.value)} />
                        )}
                    </div>

                    <div className="flex flex-col space-y-2">
                         <div className="flex items-center space-x-2">
                            <RadioGroupItem value={FIX_AS_LEAVE} id={`${day.id}-leave`} />
                            <Label htmlFor={`${day.id}-leave`} className="font-normal cursor-pointer">Jadikan Izin</Label>
                        </div>
                        {actionForDay === FIX_AS_LEAVE && (
                            <Textarea placeholder="Tuliskan keterangan izin di sini..." className="ml-6 bg-background" value={leaveReasons[day.id] || ''} onChange={(e) => handleReasonChange(day.id, e.target.value)} />
                        )}
                    </div>

                     <div className="flex flex-col space-y-2">
                         <div className="flex items-center space-x-2">
                            <RadioGroupItem value={FIX_AS_OFFICIAL_DUTY} id={`${day.id}-duty`} />
                            <Label htmlFor={`${day.id}-duty`} className="font-normal cursor-pointer">Jadikan Dinas</Label>
                        </div>
                        {actionForDay === FIX_AS_OFFICIAL_DUTY && (
                            <Textarea placeholder="Tuliskan keterangan tugas dinas..." className="ml-6 bg-background" value={leaveReasons[day.id] || ''} onChange={(e) => handleReasonChange(day.id, e.target.value)} />
                        )}
                    </div>
                </RadioGroup>
            );
        }
        if (day.description === 'Tidak Absen Pulang') {
            return (
                <div className="flex items-center space-x-2 mt-2">
                    <Checkbox 
                        id={`${day.id}-checkout`} 
                        checked={actionForDay === FIX_CHECK_OUT} 
                        onCheckedChange={(checked) => handleCheckboxChange(day.id, !!checked, FIX_CHECK_OUT)} 
                    />
                    <Label htmlFor={`${day.id}-checkout`} className="font-normal cursor-pointer">Lengkapi Absen Pulang</Label>
                </div>
            );
        }
         if (day.description === 'Tidak Absen Masuk') {
            return (
                <RadioGroup 
                    className="mt-2 flex flex-col gap-3"
                    value={actionForDay || ''} 
                    onValueChange={(value) => handleActionChange(day.id, value)}
                >
                    <div className="flex items-center space-x-2">
                        <RadioGroupItem value={FIX_CHECK_IN_ON_TIME} id={`${day.id}-checkin-ontime`} />
                        <Label htmlFor={`${day.id}-checkin-ontime`} className="font-normal cursor-pointer">Jadikan Hadir</Label>
                    </div>
                    <div className="flex items-center space-x-2">
                        <RadioGroupItem value={FIX_CHECK_IN_LATE} id={`${day.id}-checkin-late`} />
                        <Label htmlFor={`${day.id}-checkin-late`} className="font-normal cursor-pointer">Jadikan Terlambat</Label>
                    </div>
                </RadioGroup>
            )
        }
        return null;
    };

    return (
        <Dialog open={isOpen} onOpenChange={onClose}>
            <DialogContent className="max-w-lg">
                <DialogHeader>
                    <DialogTitle>Perbaiki Kehadiran</DialogTitle>
                    <DialogDescription>
                        Pilih tindakan perbaikan untuk setiap tanggal yang bermasalah.
                    </DialogDescription>
                </DialogHeader>
                
                {error && (
                    <Alert variant="destructive" className="mt-4">
                        <AlertTitle>Terjadi Kesalahan</AlertTitle>
                        <AlertDescription>{error}</AlertDescription>
                    </Alert>
                )}

                <div className="py-4">
                    {isLoading ? (
                        <div className="space-y-2"><Skeleton className="h-12 w-full" /><Skeleton className="h-12 w-full" /><Skeleton className="h-12 w-3/4" /></div>
                    ) : problematicDays.length > 0 ? (
                        <div className="max-h-[400px] overflow-y-auto -mr-3 pr-3 space-y-3">
                            {problematicDays.map(day => (
                                <div key={day.id} className="p-3 rounded-lg border bg-muted/20">
                                    <div className="flex items-center justify-between">
                                        <span className="text-sm font-medium">{format(parseISO(day.date), 'eeee, dd MMMM yyyy', { locale: id })}</span>
                                        <Badge variant={day.status === 'Alpa' ? "destructive" : "secondary"} className="whitespace-nowrap">{day.status === 'Alpa' ? 'Alpa' : day.description}</Badge>
                                    </div>
                                    {renderProblemOptions(day)}
                                </div>
                            ))}
                        </div>
                    ) : (
                        <p className="py-8 text-center text-sm text-muted-foreground">Tidak ada data yang perlu diperbaiki pada periode ini.</p>
                    )}
                </div>
                
                <DialogFooter className="pt-4">
                    <DialogClose asChild><Button variant="ghost" disabled={isSaving}>Batal</Button></DialogClose>
                    <Button onClick={handleSaveChanges} disabled={isLoading || isSaving || problematicDays.length === 0 || !hasSelection}>{isSaving ? 'Menyimpan...' : 'Simpan Perubahan'}</Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
