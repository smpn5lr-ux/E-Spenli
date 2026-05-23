'use client';

import { useState, useEffect, useMemo } from 'react';
import { useFirestore } from '@/firebase';
import { doc, getDoc, writeBatch, Timestamp } from 'firebase/firestore';
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
}

// --- CONSTANTS ---
const FIX_AS_PRESENT = 'FIX_AS_PRESENT';
const FIX_AS_LEAVE = 'FIX_AS_LEAVE';
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

export default function EditAttendanceModal({ user, month, isOpen, onClose, currentUser }: EditAttendanceModalProps) {
    const firestore = useFirestore();
    const [problematicDays, setProblematicDays] = useState<ProblematicDay[]>([]);
    const [selectedActions, setSelectedActions] = useState<{ [key: string]: string | undefined }>({});
    const [leaveReasons, setLeaveReasons] = useState<{ [key: string]: string }>({});
    const [isLoading, setIsLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [schoolConfig, setSchoolConfig] = useState<any>(null);

    useEffect(() => {
        if (!isOpen || !firestore || !user) return;
        const getProblematicDays = async () => {
            setIsLoading(true);
            setError(null);
            try {
                const schoolConfigRef = doc(firestore, 'schoolConfig', 'default');
                const schoolConfigSnap = await getDoc(schoolConfigRef);
                const config = schoolConfigSnap.data() || {};
                setSchoolConfig(config);
                const reportData: MonthlyReportData[] = await fetchUserMonthlyReportData(firestore, user.uid, month, config, {});
                
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
                setSelectedActions({});
                setLeaveReasons({});
            } catch (err) {
                console.error("Error fetching problematic days:", err);
                setError('Gagal memuat data kehadiran. Silakan coba lagi.');
            } finally {
                setIsLoading(false);
            }
        };
        getProblematicDays();
    }, [isOpen, firestore, user, month]);

    const handleActionChange = (dayId: string, action: string | undefined) => {
        setSelectedActions(prev => ({ ...prev, [dayId]: prev[dayId] === action ? undefined : action }));
    };
    
    const handleReasonChange = (dayId: string, reason: string) => {
        setLeaveReasons(prev => ({ ...prev, [dayId]: reason }));
    };

    const handleSaveChanges = async () => {
        if (!currentUser?.uid || !schoolConfig) {
            setError("Konfigurasi tidak lengkap. Gagal menyimpan.");
            return;
        }

        const actionsToPerform = Object.entries(selectedActions).filter(([_, action]) => action);
        if (actionsToPerform.length === 0) {
            setError("Tidak ada tindakan perbaikan yang dipilih.");
            return;
        }
        
        for (const [dayId, action] of actionsToPerform) {
            if ((action === FIX_AS_LEAVE || action === FIX_AS_OFFICIAL_DUTY) && (!leaveReasons[dayId] || !leaveReasons[dayId].trim())) {
                const day = problematicDays.find(d => d.id === dayId);
                const dateString = day ? format(parseISO(day.date), 'dd MMMM', { locale: id }) : '';
                const type = action === FIX_AS_LEAVE ? 'izin' : 'dinas';
                setError(`Keterangan ${type} untuk tanggal ${dateString} tidak boleh kosong.`);
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
                const recordRef = doc(firestore, 'users', user!.uid, 'attendanceRecords', day.id);

                switch (action) {
                    case FIX_AS_PRESENT:
                        const randomCheckIn = getRandomTimeInRange(recordDate, checkInStartTime, checkInEndTime);
                        const randomCheckOut = getRandomTimeInRange(recordDate, checkOutStartTime, checkOutEndTime);
                        batch.set(recordRef, {
                            userId: user!.uid, date: day.id, 
                            checkInTime: Timestamp.fromDate(randomCheckIn), 
                            checkOutTime: Timestamp.fromDate(randomCheckOut), 
                            status: 'Hadir', description: 'Kehadiran Penuh',
                            manualEntry: true, updatedBy: currentUser.uid, updatedAt: Timestamp.now()
                        });
                        break;

                    case FIX_AS_LEAVE:
                        batch.set(recordRef, {
                            userId: user!.uid, date: day.id, 
                            checkInTime: null, checkOutTime: null, 
                            status: 'Izin', 
                            description: leaveReasons[dayId],
                            manualEntry: true, updatedBy: currentUser.uid, updatedAt: Timestamp.now()
                        });
                        break;
                    
                    case FIX_AS_OFFICIAL_DUTY:
                         batch.set(recordRef, {
                            userId: user!.uid, date: day.id, 
                            checkInTime: null, checkOutTime: null, 
                            status: 'Dinas', 
                            description: leaveReasons[dayId],
                            manualEntry: true, updatedBy: currentUser.uid, updatedAt: Timestamp.now()
                        });
                        break;

                    case FIX_CHECK_OUT:
                        const randomFixCheckOut = getRandomTimeInRange(recordDate, checkOutStartTime, checkOutEndTime);
                        batch.update(recordRef, { 
                            checkOutTime: Timestamp.fromDate(randomFixCheckOut),
                            status: 'Hadir', description: 'Kehadiran Penuh',
                            updatedBy: currentUser.uid, updatedAt: Timestamp.now()
                        });
                        break;
                    
                    case FIX_CHECK_IN_ON_TIME:
                        const randomFixCheckIn = getRandomTimeInRange(recordDate, checkInStartTime, checkInEndTime);
                        batch.update(recordRef, {
                            checkInTime: Timestamp.fromDate(randomFixCheckIn),
                            status: 'Hadir', description: 'Kehadiran Penuh',
                            updatedBy: currentUser.uid, updatedAt: Timestamp.now()
                        });
                        break;

                    case FIX_CHECK_IN_LATE:
                        const lateCheckInStart = addMinutes(parseTime(checkInEndTime, recordDate), 1);
                        const lateCheckInEnd = addMinutes(lateCheckInStart, 59); // Acak dalam 60 menit setelahnya
                        const randomLateTime = new Date(lateCheckInStart.getTime() + Math.random() * (lateCheckInEnd.getTime() - lateCheckInStart.getTime()));
                        batch.update(recordRef, {
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
        const commonRadioProps = { className: "mt-2 flex flex-col gap-3", value: actionForDay, onValueChange: (value: string) => handleActionChange(day.id, value) };
        
        if (day.status === 'Alpa') {
            return (
                <RadioGroup {...commonRadioProps}>
                    <div className="flex items-center space-x-2">
                        <RadioGroupItem value={FIX_AS_PRESENT} id={`${day.id}-present`} />
                        <Label htmlFor={`${day.id}-present`} className="font-normal cursor-pointer">Jadikan Hadir</Label>
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
                    <Checkbox id={`${day.id}-checkout`} checked={actionForDay === FIX_CHECK_OUT} onCheckedChange={(checked) => handleActionChange(day.id, checked ? FIX_CHECK_OUT : undefined)} />
                    <Label htmlFor={`${day.id}-checkout`} className="font-normal cursor-pointer">Lengkapi Absen Pulang</Label>
                </div>
            );
        }
         if (day.description === 'Tidak Absen Masuk') {
            return (
                <RadioGroup {...commonRadioProps}>
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
                    {error && (
                        <Alert variant="destructive" className="mt-4">
                            <AlertTitle>Terjadi Kesalahan</AlertTitle>
                            <AlertDescription>{error}</AlertDescription>
                        </Alert>
                    )}
                </DialogHeader>

                {isLoading ? (
                    <div className="py-4 space-y-2"><Skeleton className="h-12 w-full" /><Skeleton className="h-12 w-full" /><Skeleton className="h-12 w-3/4" /></div>
                ) : problematicDays.length > 0 ? (
                    <div className="py-4">
                        <DialogDescription className="mb-4">Pilih tindakan perbaikan untuk setiap tanggal.</DialogDescription>
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
                    </div>
                ) : (
                    <p className="py-8 text-center text-sm text-muted-foreground">Tidak ada data yang perlu diperbaiki pada periode ini.</p>
                )}
                
                <DialogFooter className="pt-4">
                    <DialogClose asChild><Button variant="ghost" disabled={isSaving}>Batal</Button></DialogClose>
                    <Button onClick={handleSaveChanges} disabled={isLoading || isSaving || problematicDays.length === 0 || !hasSelection}>{isSaving ? 'Menyimpan...' : 'Simpan Perubahan'}</Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
