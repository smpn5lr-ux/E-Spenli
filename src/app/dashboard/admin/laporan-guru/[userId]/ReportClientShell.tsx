'use client';

import { useState, useMemo, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { format, startOfMonth, endOfMonth, parseISO, isValid, eachDayOfInterval, isWithinInterval, isBefore, startOfDay } from 'date-fns';
import { id } from 'date-fns/locale';

// Firebase and custom hooks for real-time data
import { useFirestore, useCollection, useDoc, useMemoFirebase } from '@/firebase';
import { collection, query, where, Timestamp, doc } from 'firebase/firestore';

import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Download, ChevronLeft, ChevronRight, Loader2 } from 'lucide-react';
import ReportView from './ReportView';

// --- Type Definitions ---
interface AttendanceRecordServer {
  id: string;
  checkInTime: Timestamp;
  checkOutTime?: Timestamp;
  manualEntry?: boolean;
}

interface LeaveRequestServer {
    id: string;
    startDate: Timestamp;
    endDate: Timestamp;
    status: string;
    type: string;
    reason: string;
}

interface ClientShellProps {
  userId: string;
  initialUserData: any;
  initialMonth: string; // ISO string from server
}

const mapLeaveTypeToStatusKey = (leaveType: string): string => {
    switch(leaveType) {
        case 'Sakit':
        case 'Izin': return 'permission';
        case 'Dinas': return 'official_duty';
        default: return leaveType.toLowerCase();
    }
};

export default function ReportClientShell({ 
    userId, 
    initialUserData,
    initialMonth,
}: ClientShellProps) {
    const router = useRouter();
    const firestore = useFirestore();

    const [userData] = useState(initialUserData);
    const parsedInitialMonth = parseISO(initialMonth);
    const [currentMonth, setCurrentMonth] = useState(isValid(parsedInitialMonth) ? parsedInitialMonth : new Date());

    // --- Real-time Data Fetching ---
    const schoolConfigRef = useMemoFirebase(() => firestore ? doc(firestore, 'schoolConfig', 'default') : null, [firestore]);
    const { data: schoolConfig, isLoading: isConfigLoading } = useDoc(null, schoolConfigRef);
    
    const monthStart = useMemo(() => startOfMonth(currentMonth), [currentMonth]);
    const monthEnd = useMemo(() => endOfMonth(currentMonth), [currentMonth]);

    const attendanceQuery = useMemoFirebase(() => 
        firestore ? query(
            collection(firestore, 'users', userId, 'attendanceRecords'),
            where('date', '>=', format(monthStart, 'yyyy-MM-dd')),
            where('date', '<=', format(monthEnd, 'yyyy-MM-dd'))
        ) : null, 
    [firestore, userId, monthStart, monthEnd]);

    const leaveQuery = useMemoFirebase(() => 
        firestore ? query(
            collection(firestore, 'users', userId, 'leaveRequests'),
            where('status', '==', 'approved'),
            where('startDate', '<=', Timestamp.fromDate(monthEnd))
        ) : null, 
    [firestore, userId, monthEnd]);

    const { data: attendanceHistory, isLoading: isAttendanceLoading } = useCollection<AttendanceRecordServer>(null, attendanceQuery);
    const { data: leaveHistory, isLoading: isLeaveLoading } = useCollection<LeaveRequestServer>(null, leaveQuery);

    const reportDetails = useMemo(() => {
        if (!attendanceHistory || !leaveHistory || !schoolConfig) return [];
        
        const today = startOfDay(new Date());
        const offDays: number[] = Array.isArray(schoolConfig.offDays) ? schoolConfig.offDays : [0, 6];

        const attendanceMap = new Map(attendanceHistory.map(rec => [rec.id, rec]));
        const leaveMap = new Map<string, any>();
        leaveHistory.forEach(leave => {
            if(leave.endDate) {
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
            const isRecurringOff = offDays.includes(day.getDay());
            if (isRecurringOff || isBefore(day, today)) return null;

            const attendanceRecord = attendanceMap.get(dayStr);
            if (attendanceRecord) {
                const checkInTime = attendanceRecord.checkInTime.toDate();
                const checkOutTime = attendanceRecord.checkOutTime?.toDate();
                let statusKey = 'present'; // Default to present

                if (schoolConfig.useTimeValidation && schoolConfig.checkInEndTime) {
                    const [endH, endM] = schoolConfig.checkInEndTime.split(':').map(Number);
                    const checkInDeadline = new Date(checkInTime); checkInDeadline.setHours(endH, endM, 0, 0);
                    if (isBefore(checkInDeadline, checkInTime)) {
                        statusKey = 'late';
                    }
                }

                if (!checkOutTime && isBefore(day, today)) {
                    statusKey = 'no_check_out';
                }

                return { id: dayStr, date: day, checkInTime, checkOutTime, statusKey, raw: attendanceRecord };
            }
            
            const leaveRecord = leaveMap.get(dayStr);
            if (leaveRecord && leaveRecord.type !== 'Pulang Cepat') {
                 return { id: dayStr, date: day, checkInTime: null, checkOutTime: null, statusKey: mapLeaveTypeToStatusKey(leaveRecord.type), raw: leaveRecord };
            }

            return { id: dayStr, date: day, checkInTime: null, checkOutTime: null, statusKey: 'absent', raw: null };
        });

        const validReport = report.filter(Boolean) as any[];
        validReport.sort((a, b) => b.date.getTime() - a.date.getTime());
        return validReport;

    }, [attendanceHistory, leaveHistory, schoolConfig, currentMonth]);

    const summaryStats = useMemo(() => {
        const stats = {
            present: 0, late: 0, no_check_out: 0, permission: 0, official_duty: 0, absent: 0
        };
        reportDetails.forEach(d => {
            if (d.statusKey in stats) {
                stats[d.statusKey as keyof typeof stats]++;
            }
        });
        return stats;
    }, [reportDetails]);

    const scoreCalculation = useMemo(() => {
        if (!reportDetails.length || !schoolConfig?.attendanceWeights) {
            return { totalScore: 0, maxScore: 0, percentage: 0 };
        }

        const weights = schoolConfig.attendanceWeights;
        const presentWeight = weights.present ?? 1;

        let totalScore = 0;
        let maxScore = 0;

        reportDetails.forEach(detail => {
            totalScore += weights[detail.statusKey] ?? 0;
            maxScore += presentWeight; // Max score is based on full attendance
        });

        const percentage = maxScore > 0 ? (totalScore / maxScore) * 100 : 0;

        return { totalScore: totalScore.toFixed(2), maxScore: maxScore.toFixed(2), percentage: percentage.toFixed(2) };
    }, [reportDetails, schoolConfig]);

    const chartData = [
        { name: 'Hadir', Jumlah: summaryStats.present, fill: '#22c55e' },
        { name: 'Terlambat', Jumlah: summaryStats.late, fill: '#facc15' },
        { name: 'Izin/Sakit', Jumlah: summaryStats.permission, fill: '#3b82f6' },
        { name: 'Dinas', Jumlah: summaryStats.official_duty, fill: '#818cf8' },
        { name: 'Alpa', Jumlah: summaryStats.absent, fill: '#ef4444' },
        { name: 'Tdk Pulang', Jumlah: summaryStats.no_check_out, fill: '#eab308' },
    ];

    const handleMonthChange = (amount: number) => {
        const newMonthDate = new Date(currentMonth.getFullYear(), currentMonth.getMonth() + amount, 15);
        setCurrentMonth(newMonthDate);
    };

    const handleDownloadPdf = () => {
        // PDF generation logic needs update
    };
    
    const isLoading = isAttendanceLoading || isLeaveLoading || isConfigLoading;

    return (
        <div className="p-4 md:p-6 space-y-6">
             <Card>
                <CardHeader>
                    <CardTitle>Ringkasan Laporan Bulan {format(currentMonth, 'MMMM yyyy', { locale: id })}</CardTitle>
                    <CardDescription>Grafik dan skor ringkasan kehadiran untuk {userData?.name || 'Pengguna'}.</CardDescription>
                </CardHeader>
                <CardContent className="grid grid-cols-1 md:grid-cols-3 gap-6 items-center">
                    <div className="md:col-span-2 h-64 w-full">
                        {isLoading ? <Loader2 className="h-8 w-8 animate-spin mx-auto text-primary"/> : 
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={chartData} margin={{ top: 5, right: 20, left: -10, bottom: 5 }}>
                                <CartesianGrid strokeDasharray="3 3" />
                                <XAxis dataKey="name" fontSize={12} />
                                <YAxis allowDecimals={false} />
                                <Tooltip />
                                <Bar dataKey="Jumlah" />
                            </BarChart>
                        </ResponsiveContainer>}
                    </div>
                    <div className="md:col-span-1 flex flex-col items-center justify-center p-6 bg-muted rounded-lg">
                        <p className="text-sm font-medium text-muted-foreground">SKOR AKHIR</p>
                        {isLoading ? <Loader2 className="h-12 w-12 animate-spin my-4 text-primary"/> : 
                        <p className="text-5xl font-bold tracking-tighter text-primary">{scoreCalculation.percentage}<span className="text-2xl text-muted-foreground">%</span></p>}
                        <p className="text-xs text-center text-muted-foreground mt-2">Total Poin: {scoreCalculation.totalScore} / {scoreCalculation.maxScore}</p>
                    </div>
                </CardContent>
            </Card>

            <Card>
                <CardHeader>
                    <CardTitle>Detail Laporan Harian</CardTitle>
                    <CardDescription>Rincian data kehadiran harian yang terekam oleh sistem. Data diperbarui secara real-time.</CardDescription>
                </CardHeader>
                <CardContent>
                    <div className="flex flex-col sm:flex-row justify-between items-center gap-4 mb-4">
                       <div className="flex items-center gap-2">
                            <Button variant="outline" size="icon" onClick={() => handleMonthChange(-1)}><ChevronLeft className="h-4 w-4" /></Button>
                            <span className="w-36 text-center font-semibold">{format(currentMonth, 'MMMM yyyy', { locale: id })}</span>
                            <Button variant="outline" size="icon" onClick={() => handleMonthChange(1)} disabled={currentMonth >= endOfMonth(new Date())}><ChevronRight className="h-4 w-4" /></Button>
                        </div>
                        <Button onClick={handleDownloadPdf} disabled={isLoading}>
                            <Download className="mr-2 h-4 w-4" />
                            Unduh Laporan PDF
                        </Button>
                    </div>
                    <div className="overflow-x-auto border rounded-md">
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Tanggal</TableHead>
                                    <TableHead>Jam Masuk</TableHead>
                                    <TableHead>Jam Pulang</TableHead>
                                    <TableHead>Status</TableHead>
                                    <TableHead>Keterangan</TableHead>
                                    <TableHead className="text-right">Aksi</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {isLoading ? (
                                    <TableRow>
                                        <TableCell colSpan={6} className="h-36 text-center">
                                            <Loader2 className="h-8 w-8 animate-spin mx-auto text-primary" />
                                            <p className="mt-2 text-muted-foreground">Memuat data real-time...</p>
                                        </TableCell>
                                    </TableRow>
                                ) : reportDetails.length > 0 ? (
                                    reportDetails.map((item) => (
                                        <ReportView key={item.id} item={item} userId={userId} schoolConfig={schoolConfig} />
                                    ))
                                ) : (
                                    <TableRow>
                                        <TableCell colSpan={6} className="h-24 text-center">
                                            Tidak ada data untuk ditampilkan pada periode ini.
                                        </TableCell>
                                    </TableRow>
                                )}
                            </TableBody>
                        </Table>
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}
