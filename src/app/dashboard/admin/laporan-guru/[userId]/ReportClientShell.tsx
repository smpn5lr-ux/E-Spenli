'use client';

import { useState, useMemo, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { format, startOfMonth, endOfMonth, parseISO, isValid, eachDayOfInterval, isWithinInterval, isBefore, startOfDay, endOfDay, isSameMonth } from 'date-fns';
import { id } from 'date-fns/locale';

// Firebase and custom hooks
import { useFirestore, useCollection, useDoc, useMemoFirebase } from '@/firebase';
import { collection, query, where, Timestamp, doc, writeBatch, serverTimestamp, getDocs } from 'firebase/firestore';
import { useToast } from '@/hooks/use-toast';

// UI Components
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogClose } from "@/components/ui/dialog";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Download, ChevronLeft, ChevronRight, Loader2, Edit } from 'lucide-react';

// Child Components
import ReportView from './ReportView';
import { Textarea } from '@/components/ui/textarea';

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
    const [reasons, setReasons] = useState<{ [key: string]: string }>({});
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

    const { reportDetails, summary } = useMemo(() => {
        if (!attendanceHistory || !leaveHistory || !schoolConfig) return { reportDetails: [], summary: {} };

        const today = startOfDay(new Date());
        const offDays: number[] = Array.isArray(schoolConfig.offDays) ? schoolConfig.offDays : [0, 6];
        const attendanceMap = new Map(attendanceHistory.map(rec => [rec.id, rec]));
        const leaveMap = new Map<string, any>();

        const generalLeaves = leaveHistory.filter(l => l.manualEntry !== true);
        const manualAdminLeaves = leaveHistory.filter(l => l.manualEntry === true);

        generalLeaves.forEach(leave => {
            if (leave.startDate?.toDate && leave.endDate?.toDate) {
                try {
                    const interval = { start: leave.startDate.toDate(), end: leave.endDate.toDate() };
                    if (isBefore(interval.end, interval.start)) return;

                    eachDayOfInterval(interval).forEach(day => {
                        if (isWithinInterval(day, { start: monthStart, end: monthEnd })) {
                            leaveMap.set(format(day, 'yyyy-MM-dd'), leave);
                        }
                    });
                } catch (e) {
                    console.error("Error processing general leave interval:", e, leave);
                }
            }
        });

        manualAdminLeaves.forEach(leave => {
            if (leave.startDate?.toDate) {
                const day = leave.startDate.toDate();
                 if (isWithinInterval(day, { start: monthStart, end: monthEnd })) {
                    leaveMap.set(format(day, 'yyyy-MM-dd'), leave);
                }
            }
        });

        const allDaysInMonth = eachDayOfInterval({ start: monthStart, end: monthEnd });
        const report = allDaysInMonth.map(day => {
            const dayStr = format(day, 'yyyy-MM-dd');
            if (isBefore(day, today) || day.getTime() === today.getTime()) {
                const isRecurringOff = offDays.includes(day.getDay());
                if (isRecurringOff) return null;
                
                const leaveRecord = leaveMap.get(dayStr);
                if (leaveRecord && leaveRecord.type !== 'Pulang Cepat') {
                    return { id: dayStr, date: day, checkInTime: null, checkOutTime: null, statusKey: mapLeaveTypeToStatusKey(leaveRecord.type), raw: leaveRecord };
                }

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

                return { id: dayStr, date: day, checkInTime: null, checkOutTime: null, statusKey: 'absent', raw: null };
            }
            return null;
        });

        const validReport = report.filter(Boolean) as ReportDetail[];
        validReport.sort((a, b) => b.date.getTime() - a.date.getTime());

        const summaryCalc = validReport.reduce((acc, item) => {
            const key = item.statusKey;
            acc[key] = (acc[key] || 0) + 1;
            return acc;
        }, {} as { [key: string]: number });

        return { reportDetails: validReport, summary: summaryCalc };
    }, [attendanceHistory, leaveHistory, schoolConfig, monthStart, monthEnd]);

    const absentDays = useMemo(() => reportDetails.filter(d => d.statusKey === 'absent'), [reportDetails]);

    const handleCloseModal = () => {
      setEditingDays(null);
      setChanges({});
      setReasons({});
    };

    const handleRadioChange = (date: string, value: string) => {
        setChanges(prev => ({ ...prev, [date]: value }));
    };
    
    const handleReasonChange = (date: string, reason: string) => {
        setReasons(prev => ({ ...prev, [date]: reason }));
    };

    const handleSave = async () => {
        if (!firestore || Object.keys(changes).length === 0) return;

        for (const dateStr in changes) {
            const action = changes[dateStr];
            if (action !== 'hadir' && (!reasons[dateStr] || !reasons[dateStr].trim())) {
                toast({ title: "Keterangan Wajib Diisi", description: `Harap isi alasan untuk tanggal ${format(parseISO(dateStr), 'dd MMMM')}.`, variant: "destructive" });
                return;
            }
        }

        setIsSaving(true);
        try {
            for (const dateStr in changes) {
                const action = changes[dateStr];
                const date = parseISO(dateStr);
                const batch = writeBatch(firestore);

                const dayStart = startOfDay(date);
                const dayEnd = endOfDay(date);

                const leaveRequestsQuery = query(
                    collection(firestore, `users/${userId}/leaveRequests`),
                    where('startDate', '>=', Timestamp.fromDate(dayStart)),
                    where('startDate', '<=', Timestamp.fromDate(dayEnd))
                );
                const existingLeavesSnapshot = await getDocs(leaveRequestsQuery);
                existingLeavesSnapshot.forEach(leaveDoc => {
                    batch.delete(leaveDoc.ref);
                });

                const attendanceRecordRef = doc(firestore, `users/${userId}/attendanceRecords`, dateStr);
                batch.delete(attendanceRecordRef);

                const typeMap: { [key: string]: string } = {
                    sakit: 'Sakit',
                    izin: 'Izin',
                    dinas: 'Dinas',
                };

                if (action === 'hadir') {
                    batch.set(attendanceRecordRef, {
                        date: dateStr,
                        checkInTime: Timestamp.fromDate(new Date(`${dateStr}T08:00:00`)),
                        checkOutTime: null,
                        status: 'Hadir',
                        manualEntry: true,
                        correctedBy: 'admin',
                        timestamp: serverTimestamp(),
                    });
                } else if (typeMap[action]) {
                    const newLeaveRef = doc(collection(firestore, `users/${userId}/leaveRequests`));
                    batch.set(newLeaveRef, {
                        status: 'approved',
                        type: typeMap[action],
                        reason: reasons[dateStr] || '',
                        startDate: Timestamp.fromDate(date),
                        endDate: Timestamp.fromDate(date),
                        requestedAt: serverTimestamp(),
                        approvedAt: serverTimestamp(),
                        approvedBy: 'admin',
                        manualEntry: true,
                    });
                }
                await batch.commit();
            }

            toast({ title: "Sukses", description: "Perubahan kehadiran berhasil disimpan." });
            refetchAllData();
            handleCloseModal();
        } catch (error) {
            console.error("Error saving changes:", error);
            toast({ title: "Error", description: `Gagal menyimpan perubahan: ${error instanceof Error ? error.message : 'Unknown error'}`, variant: "destructive" });
        } finally {
            setIsSaving(false);
        }
    };

    const handleOpenSingleEdit = (day: ReportDetail) => setEditingDays([day]);
    
    const isLoading = isAttendanceLoading || isLeaveLoading || isConfigLoading;

    const SummaryItem = ({ label, value }: { label: string, value: number | undefined }) => (
        <div className="flex flex-col items-center justify-center p-4 border rounded-lg bg-slate-50">
            <span className="text-2xl font-bold">{value || 0}</span>
            <p className="text-sm text-muted-foreground">{label}</p>
        </div>
    );

    return (
        <>
            <Dialog open={!!editingDays} onOpenChange={(open) => !open && handleCloseModal()}>
              <DialogContent className="sm:max-w-[480px]">
                <DialogHeader>
                  <DialogTitle>Perbaiki Kehadiran</DialogTitle>
                  <DialogDescription>
                    Pilih tindakan perbaikan untuk tanggal yang bermasalah.
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
                            <RadioGroupItem value="sakit" id={`sakit-${day.id}`} />
                            <Label htmlFor={`sakit-${day.id}`}>Jadikan Sakit</Label>
                          </div>
                          <div className="flex items-center space-x-2">
                            <RadioGroupItem value="izin" id={`izin-${day.id}`} />
                            <Label htmlFor={`izin-${day.id}`}>Jadikan Izin</Label>
                          </div>
                          <div className="flex items-center space-x-2">
                            <RadioGroupItem value="dinas" id={`dinas-${day.id}`} />
                            <Label htmlFor={`dinas-${day.id}`}>Jadikan Dinas</Label>
                          </div>
                        </RadioGroup>
                        {(changes[day.id] === 'sakit' || changes[day.id] === 'izin' || changes[day.id] === 'dinas') && (
                            <Textarea
                                placeholder={`Tuliskan keterangan ${changes[day.id]}...`}
                                className="mt-3"
                                value={reasons[day.id] || ''}
                                onChange={(e) => handleReasonChange(day.id, e.target.value)}
                            />
                        )}
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
                    <CardHeader>
                        <CardTitle>Rekap Kehadiran Bulan Ini</CardTitle>
                        <CardDescription>Ringkasan total kehadiran, alpa, izin, dan sakit selama bulan berjalan.</CardDescription>
                    </CardHeader>
                    <CardContent>
                         <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                            <SummaryItem label="Hadir" value={summary.present} />
                            <SummaryItem label="Alpa" value={summary.absent} />
                            <SummaryItem label="Izin" value={summary.permission} />
                            <SummaryItem label="Sakit" value={summary.sick} />
                        </div>
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader>
                        <CardTitle>Detail Laporan Harian</CardTitle>
                        <CardDescription>Rincian data kehadiran harian yang terekam oleh sistem. Klik ikon pensil untuk memperbaiki status yang salah.</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <div className="flex flex-wrap justify-between items-center gap-4 mb-4">
                           <div className="flex items-center gap-2">
                           </div>
                            <div className="flex items-center gap-2">
                                <Button onClick={() => setEditingDays(absentDays)} disabled={absentDays.length === 0 || isLoading}>
                                    <Edit className="mr-2 h-4 w-4" />
                                    Perbaiki Alpa ({absentDays.length})
                                </Button>
                                <Button onClick={() => {}} disabled={true}> 
                                    <Download className="mr-2 h-4 w-4" />
                                    Unduh Laporan PDF
                                </Button>
                            </div>
                        </div>
                        <div className="overflow-x-auto border rounded-md">
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>Tanggal</TableHead>
                                        <TableHead>Masuk</TableHead>
                                        <TableHead>Pulang</TableHead>
                                        <TableHead>Status</TableHead>
                                        <TableHead>Keterangan</TableHead>
                                        <TableHead className="text-right">Aksi</TableHead>
                                    </TableRow>
                                </TableHeader>
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
