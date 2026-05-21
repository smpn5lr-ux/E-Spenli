'use client';

import { useState, useMemo, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { format, startOfMonth, endOfMonth, parseISO, isValid, eachDayOfInterval, isWithinInterval, isBefore, startOfDay, isSameMonth } from 'date-fns';
import { id } from 'date-fns/locale';

// Firebase and custom hooks
import { useFirestore, useCollection, useDoc, useMemoFirebase } from '@/firebase';
import { collection, query, where, Timestamp, doc, writeBatch, serverTimestamp } from 'firebase/firestore';
import { useToast } from '@/hooks/use-toast';

// UI Components
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogClose } from "@/components/ui/dialog";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHeader, TableRow } from "@/components/ui/table";
import { Download, ChevronLeft, ChevronRight, Loader2, Edit } from 'lucide-react';

// Child Components
import ReportView from './ReportView';

// --- Type Definitions ---
interface ReportDetail {
  id: string; // yyyy-MM-dd
  date: Date;
  checkInTime: Date | null;
  checkOutTime: Date | null;
  statusKey: string;
  raw: any;
}
interface ClientShellProps { userId: string; initialUserData: any; initialMonth: string; }

const mapLeaveTypeToStatusKey = (leaveType: string): string => {
    switch(leaveType) {
        case 'Sakit': return 'sick';
        case 'Izin': return 'permission';
        case 'Dinas': return 'official_duty';
        default: return leaveType.toLowerCase();
    }
};

export default function ReportClientShell({ userId, initialUserData, initialMonth }: ClientShellProps) {
    const firestore = useFirestore();
    const { toast } = useToast();
    const [userData] = useState(initialUserData);
    const parsedInitialMonth = parseISO(initialMonth);
    const [currentMonth, setCurrentMonth] = useState(isValid(parsedInitialMonth) ? parsedInitialMonth : new Date());

    const [editingDays, setEditingDays] = useState<any[] | null>(null);
    const [changes, setChanges] = useState<{ [key: string]: string }>({});
    const [isSaving, setIsSaving] = useState(false);
    const [refetchTrigger, setRefetchTrigger] = useState(0);

    const monthStart = useMemo(() => startOfMonth(currentMonth), [currentMonth]);
    const monthEnd = useMemo(() => endOfMonth(currentMonth), [currentMonth]);

    const schoolConfigRef = useMemoFirebase(() => firestore ? doc(firestore, 'schoolConfig', 'default') : null, [firestore, refetchTrigger]);
    const { data: schoolConfig, isLoading: isConfigLoading } = useDoc(null, schoolConfigRef);

    const attendanceQuery = useMemoFirebase(() => firestore ? query(collection(firestore, 'users', userId, 'attendanceRecords'), where('date', '>=', format(monthStart, 'yyyy-MM-dd')), where('date', '<=', format(monthEnd, 'yyyy-MM-dd'))) : null, [firestore, userId, monthStart, monthEnd, refetchTrigger]);
    const leaveQuery = useMemoFirebase(() => firestore ? query(collection(firestore, 'users', userId, 'leaveRequests'), where('status', '==', 'approved'), where('startDate', '<=', Timestamp.fromDate(monthEnd))) : null, [firestore, userId, monthEnd, refetchTrigger]);

    const { data: attendanceHistory, isLoading: isAttendanceLoading } = useCollection(null, attendanceQuery);
    const { data: leaveHistory, isLoading: isLeaveLoading } = useCollection(null, leaveQuery);

    const refetchAllData = useCallback(() => {
        setRefetchTrigger(trigger => trigger + 1);
    }, []);

    const reportDetails: ReportDetail[] = useMemo(() => {
        if (!attendanceHistory || !leaveHistory || !schoolConfig) return [];
        const today = startOfDay(new Date());
        const offDays: number[] = Array.isArray(schoolConfig.offDays) ? schoolConfig.offDays : [0, 6];
        const attendanceMap = new Map(attendanceHistory.map(rec => [rec.id, rec]));
        const leaveMap = new Map<string, any>();
        leaveHistory.forEach(leave => {
            if (leave.endDate) {
                eachDayOfInterval({ start: leave.startDate.toDate(), end: leave.endDate.toDate() }).forEach(day => {
                    if (isWithinInterval(day, { start: monthStart, end: monthEnd })) {
                        leaveMap.set(format(day, 'yyyy-MM-dd'), leave);
                    }
                });
            }
        });
        const allDaysInMonth = eachDayOfInterval({ start: monthStart, end: monthEnd });
        const report = allDaysInMonth.map(day => {
            const dayStr = format(day, 'yyyy-MM-dd');
            if (isBefore(day, today) || day.getTime() === today.getTime()) {
                const isRecurringOff = offDays.includes(day.getDay());
                if (isRecurringOff) return null;

                const attendanceRecord = attendanceMap.get(dayStr);
                if (attendanceRecord) {
                    const checkInTime = attendanceRecord.checkInTime.toDate();
                    const checkOutTime = attendanceRecord.checkOutTime?.toDate();
                    let statusKey = 'present';
                    if (schoolConfig.useTimeValidation && schoolConfig.checkInEndTime) {
                        const [endH, endM] = schoolConfig.checkInEndTime.split(':').map(Number);
                        const checkInDeadline = new Date(checkInTime); checkInDeadline.setHours(endH, endM, 0, 0);
                        if (isBefore(checkInDeadline, checkInTime)) statusKey = 'late';
                    }
                    if (!checkOutTime && isBefore(day, today)) statusKey = 'no_check_out';
                    return { id: dayStr, date: day, checkInTime, checkOutTime, statusKey, raw: attendanceRecord };
                }
                const leaveRecord = leaveMap.get(dayStr);
                if (leaveRecord && leaveRecord.type !== 'Pulang Cepat') {
                    return { id: dayStr, date: day, checkInTime: null, checkOutTime: null, statusKey: mapLeaveTypeToStatusKey(leaveRecord.type), raw: leaveRecord };
                }
                return { id: dayStr, date: day, checkInTime: null, checkOutTime: null, statusKey: 'absent', raw: null };
            }
            return null;
        });
        const validReport = report.filter(Boolean) as any[];
        validReport.sort((a, b) => b.date.getTime() - a.date.getTime());
        return validReport;
    }, [attendanceHistory, leaveHistory, schoolConfig, monthStart, monthEnd]);

    const absentDays = useMemo(() => reportDetails.filter(d => d.statusKey === 'absent'), [reportDetails]);

    const handleCloseModal = () => {
      setEditingDays(null);
      setChanges({});
    };

    const handleRadioChange = (date: string, value: string) => {
        setChanges(prev => ({ ...prev, [date]: value }));
    };

    const handleSave = async () => {
        if (!firestore || Object.keys(changes).length === 0) return;
        setIsSaving(true);
        const batch = writeBatch(firestore);
        try {
            for (const dateStr in changes) {
                const action = changes[dateStr];
                const date = parseISO(dateStr);
                if (action === 'hadir') {
                  const attendanceRecordRef = doc(collection(firestore, `users/${userId}/attendanceRecords`), dateStr);
                  batch.set(attendanceRecordRef, {
                    date: dateStr,
                    checkInTime: Timestamp.fromDate(new Date(`${dateStr}T08:00:00`)),
                    checkOutTime: null,
                    statusKey: 'present',
                    status: 'Hadir',
                    manualEntry: true,
                    correctedBy: 'admin',
                    timestamp: serverTimestamp(),
                  });
                } else if (action === 'izin' || action === 'dinas' || action === 'sakit') { 
                  const newLeaveRef = doc(collection(firestore, `users/${userId}/leaveRequests`));
                  batch.set(newLeaveRef, {
                    status: 'approved',
                    type: action.charAt(0).toUpperCase() + action.slice(1),
                    reason: `Disetujui oleh admin pada ${format(new Date(), 'PPpp')}`,
                    startDate: Timestamp.fromDate(date),
                    endDate: Timestamp.fromDate(date),
                    requestedAt: serverTimestamp(),
                    approvedAt: serverTimestamp(),
                    approvedBy: 'admin',
                  });
                }
            }
            await batch.commit();
            toast({ title: "Sukses", description: "Perubahan kehadiran berhasil disimpan." });
            refetchAllData();
            handleCloseModal();
        } catch (error) {
            console.error("Error saving changes:", error);
            toast({ title: "Error", description: "Gagal menyimpan perubahan.", variant: "destructive" });
        } finally {
            setIsSaving(false);
        }
    };

    const handleOpenBulkEdit = () => setEditingDays(absentDays);
    const handleOpenSingleEdit = (day: ReportDetail) => setEditingDays([day]);
    
    const isLoading = isAttendanceLoading || isLeaveLoading || isConfigLoading;

    return (
        <>
            <h1 style={{ color: 'red', fontSize: '36px', fontWeight: 'bold' }}>
                INI ADALAH FILE ReportClientShell.tsx
            </h1>
            <Dialog open={!!editingDays} onOpenChange={handleCloseModal}>
              <DialogContent className="sm:max-w-[480px]" aria-describedby="edit-attendance-description">
                <DialogHeader>
                  <DialogTitle>Perbaiki Kehadiran</DialogTitle>
                  <DialogDescription id="edit-attendance-description">
                    Pilih tindakan perbaikan untuk setiap tanggal yang berstatus Alpa.
                  </DialogDescription>
                </DialogHeader>
                <ScrollArea className="h-[400px] p-4">
                  <div className="space-y-4">
                    {(editingDays || []).map((day) => (
                      <div key={day.id} className="p-4 border rounded-md">
                        <p className="font-semibold mb-3">{format(day.date, 'EEEE, dd MMMM yyyy', { locale: id })}</p>
                        <RadioGroup value={changes[day.id] || ''} onValueChange={(value) => handleRadioChange(day.id, value)}>
                          <div className="flex items-center space-x-2">
                            <RadioGroupItem value="hadir" id={`hadir-${day.id}`} />
                            <Label htmlFor={`hadir-${day.id}`}>Jadikan Hadir</Label>
                          </div>
                          <div className="flex items-center space-x-2">
                            <RadioGroupItem value="izin" id={`izin-${day.id}`} />
                            <Label htmlFor={`izin-${day.id}`}>Jadikan Izin</Label>
                          </div>
                          <div className="flex items-center space-x-2">
                            <RadioGroupItem value="sakit" id={`sakit-${day.id}`} />
                            <Label htmlFor={`sakit-${day.id}`}>Jadikan Sakit</Label>
                          </div>
                          <div className="flex items-center space-x-2">
                            <RadioGroupItem value="dinas" id={`dinas-${day.id}`} />
                            <Label htmlFor={`dinas-${day.id}`}>Jadikan Dinas</Label>
                          </div>
                        </RadioGroup>
                      </div>
                    ))}
                  </div>
                </ScrollArea>
                <DialogFooter>
                  <DialogClose asChild>
                    <Button type="button" variant="secondary" disabled={isSaving}>Batal</Button>
                  </DialogClose>
                  <Button onClick={handleSave} disabled={isSaving || Object.keys(changes).length === 0}>
                    {isSaving ? 'Menyimpan...' : 'Simpan Perubahan'}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>

            <div className="p-4 md:p-6 space-y-6">
                <Card>
                    <CardHeader></CardHeader>
                    <CardContent></CardContent>
                </Card>
                <Card>
                    <CardHeader>
                        <CardTitle>Detail Laporan Harian</CardTitle>
                        <CardDescription>Rincian data kehadiran harian yang terekam oleh sistem. Klik ikon pensil untuk memperbaiki status alpa.</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <div className="flex flex-wrap justify-between items-center gap-4 mb-4">
                           <div className="flex items-center gap-2">
                           </div>
                            <div className="flex items-center gap-2">
                                <Button onClick={handleOpenBulkEdit} disabled={absentDays.length === 0 || isLoading}>
                                    <Edit className="mr-2 h-4 w-4" />
                                    Perbaiki Semua Alpa ({absentDays.length})
                                </Button>
                                <Button onClick={() => {}} disabled={true}> 
                                    <Download className="mr-2 h-4 w-4" />
                                    Unduh Laporan PDF
                                </Button>
                            </div>
                        </div>
                        <div className="overflow-x-auto border rounded-md">
                            <Table>
                                <TableHeader></TableHeader>
                                <TableBody>
                                    {isLoading ? (
                                        <TableRow><TableCell colSpan={6} className="h-36 text-center"><Loader2 className="h-8 w-8 animate-spin mx-auto text-primary" /><p className="mt-2 text-muted-foreground">Memuat data...</p></TableCell></TableRow>
                                    ) : reportDetails.length > 0 ? (
                                        reportDetails.map((item) => (
                                            <ReportView 
                                                key={item.id} 
                                                item={item} 
                                                onEdit={handleOpenSingleEdit}
                                            />
                                        ))
                                    ) : (
                                        <TableRow><TableCell colSpan={6} className="h-24 text-center">Tidak ada data untuk periode ini.</TableCell></TableRow>
                                    )}
                                </TableBody>
                            </Table>
                        </div>
                    </CardContent>
                </Card>
            </div>
        </>
    );
}
