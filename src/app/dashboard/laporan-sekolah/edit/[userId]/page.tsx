'use client';

import { useState, useMemo, useEffect } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { useUser, useFirestore } from '@/firebase';
import { doc, collection, query, where, Timestamp, setDoc, getDocs, writeBatch } from 'firebase/firestore';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Loader2, ArrowLeft, Save, XCircle } from 'lucide-react';
import { format, parse, startOfMonth, endOfMonth, eachDayOfInterval, isValid, isBefore, startOfDay, isWithinInterval } from 'date-fns';
import { id } from 'date-fns/locale';
import { useToast } from '@/hooks/use-toast';
import EditAttendanceModal from '@/components/dashboard/EditAttendanceModal';

function createRandomTimestamp(baseDate: Date, startTime: string, endTime: string): Timestamp {
    const [startH, startM] = startTime.split(':').map(Number);
    const [endH, endM] = endTime.split(':').map(Number);

    const startDate = new Date(baseDate);
    startDate.setHours(startH, startM, 0, 0);

    const endDate = new Date(baseDate);
    endDate.setHours(endH, endM, 0, 0);

    const randomTimeValue = startDate.getTime() + Math.random() * (endDate.getTime() - startDate.getTime());
    const randomDate = new Date(randomTimeValue);

    return Timestamp.fromDate(randomDate);
}

function useUserAbsentDays(userId: string, monthString: string) {
    const { user } = useUser();
    const firestore = useFirestore();
    
    const [absentDays, setAbsentDays] = useState<Date[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [userData, setUserData] = useState<any>(null);

    const month = useMemo(() => {
        if (!monthString || !isValid(parse(monthString, 'yyyy-MM', new Date()))) {
            return new Date();
        }
        return parse(monthString, 'yyyy-MM', new Date());
    }, [monthString]);

    const fetchAndProcessData = async () => {
        if (!firestore || !user || !userId || !isValid(month)) {
            setIsLoading(false);
            return;
        }
        
        setIsLoading(true);

        try {
            const userDocRef = doc(firestore, 'users', userId);
            const schoolConfigRef = doc(firestore, 'schoolConfig', 'default');
            const monthlyConfigId = format(month, 'yyyy-MM');
            const monthlyConfigRef = doc(firestore, 'monthlyConfigs', monthlyConfigId);

            const monthStart = startOfMonth(month);
            const monthEnd = endOfMonth(month);

            const attendanceQuery = query(
                collection(firestore, 'attendanceRecords'), 
                where('userId', '==', userId),
                where('recordDate', '>=', monthStart),
                where('recordDate', '<=', monthEnd)
            );
            
            const leaveQuery = query(
                collection(firestore, 'leaveRequests'), 
                where('userId', '==', userId), 
                where('status', '==', 'approved')
            );

            const [userDocSnap, schoolConfigSnap, monthlyConfigSnap, attendanceSnap, leaveSnap] = await Promise.all([
                getDocs(query(collection(firestore, 'users'), where('__name__', '==', userId))),
                getDocs(query(collection(firestore, 'schoolConfig'), where('__name__', '==', 'default'))),
                getDocs(query(collection(firestore, 'monthlyConfigs'), where('__name__', '==', monthlyConfigId))),
                getDocs(attendanceQuery),
                getDocs(leaveQuery)
            ]);
            
            const currentUserData = userDocSnap.docs[0]?.data();
            setUserData(currentUserData);
            const schoolConfig = schoolConfigSnap.docs[0]?.data();
            const monthlyConfig = monthlyConfigSnap.docs[0]?.data();

            const presentDates = new Set(attendanceSnap.docs.map(d => format(d.data().recordDate.toDate(), 'yyyy-MM-dd')));
            
            const leaveDates = new Set<string>();
            leaveSnap.docs.forEach(leaveDoc => {
                const leave = leaveDoc.data();
                if (leave.startDate && leave.endDate) {
                     eachDayOfInterval({ start: leave.startDate.toDate(), end: leave.endDate.toDate() }).forEach(day => {
                        if(isWithinInterval(day, { start: monthStart, end: monthEnd })) {
                            leaveDates.add(format(day, 'yyyy-MM-dd'));
                        }
                    });
                }
            });

            const offDays: number[] = schoolConfig?.offDays ?? [0, 6];
            const holidays: string[] = monthlyConfig?.holidays ?? [];
            const today = startOfDay(new Date());

            const absent = eachDayOfInterval({ start: monthStart, end: monthEnd })
                .filter(day => 
                    isBefore(day, today) &&
                    !offDays.includes(day.getDay()) && 
                    !holidays.includes(format(day, 'yyyy-MM-dd')) &&
                    !presentDates.has(format(day, 'yyyy-MM-dd')) &&
                    !leaveDates.has(format(day, 'yyyy-MM-dd'))
                );
            
            setAbsentDays(absent.sort((a, b) => b.getTime() - a.getTime()));
        } catch (error) {
            console.error("Error fetching absent days:", error);
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        fetchAndProcessData();
    }, [firestore, user, userId, month]);

    return { userData, absentDays, isLoading, month, refetch: fetchAndProcessData };
}

export default function EditAttendancePage() {
    const params = useParams();
    const router = useRouter();
    const searchParams = useSearchParams();
    const { toast } = useToast();
    const firestore = useFirestore();

    const userId = params.userId as string;
    const monthString = useMemo(() => searchParams.get('month') || format(new Date(), 'yyyy-MM'), [searchParams]);

    const { userData, absentDays, isLoading, month, refetch } = useUserAbsentDays(userId, monthString);
    const [isSaving, setIsSaving] = useState(false);
    const [selectedDay, setSelectedDay] = useState<Date | null>(null);

    const handleSave = async (action: 'present' | 'leave' | 'sick', reason?: string) => {
        if (!selectedDay) return;

        setIsSaving(true);
        try {
            const recordDate = startOfDay(selectedDay);
            const recordId = doc(collection(firestore, 'attendanceRecords')).id;
            const recordRef = doc(firestore, 'attendanceRecords', recordId);
            
            let record: any;

            if (action === 'leave' || action === 'sick') {
                record = {
                    id: recordId,
                    userId: userId,
                    userName: userData?.name,
                    userRole: userData?.role,
                    recordDate: Timestamp.fromDate(recordDate),
                    status: action === 'leave' ? 'Izin' : 'Sakit',
                    description: reason,
                };
            } else { // present
                record = {
                    id: recordId,
                    userId: userId,
                    userName: userData?.name,
                    userRole: userData?.role,
                    recordDate: Timestamp.fromDate(recordDate),
                    checkInTime: createRandomTimestamp(recordDate, '07:00', '08:00'),
                    checkOutTime: createRandomTimestamp(recordDate, '15:00', '15:05'),
                    status: 'Hadir'
                };
            }
            
            await setDoc(recordRef, record, { merge: true });

            toast({
                title: "Sukses",
                description: `Kehadiran untuk tanggal ${format(selectedDay, 'd MMMM yyyy', { locale: id })} berhasil disimpan.`,
            });
            refetch();
        } catch (error: any) {
            toast({ title: "Gagal Menyimpan", description: error.message, variant: 'destructive' });
        } finally {
            setIsSaving(false);
            setSelectedDay(null);
        }
    };

    if (isLoading) {
        return <div className="flex h-screen w-full items-center justify-center"><Loader2 className="h-12 w-12 animate-spin" /></div>;
    }

    return (
        <>
            <Card>
                <CardHeader>
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-4">
                            <Button variant="outline" size="icon" onClick={() => router.back()}>
                                <ArrowLeft className="h-4 w-4" />
                            </Button>
                            <div>
                                <CardTitle>Edit Kehadiran (Alpa)</CardTitle>
                                <CardDescription>
                                    Mengisi data absensi untuk hari-hari yang terlewat.
                                    <br />
                                    <span className="font-semibold">{userData?.name} - {isValid(month) ? format(month, 'MMMM yyyy', { locale: id }) : ''}</span>
                                </CardDescription>
                            </div>
                        </div>
                    </div>
                </CardHeader>
                <CardContent>
                    {absentDays.length > 0 ? (
                        <div className="rounded-md border">
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>Tanggal</TableHead>
                                        <TableHead className="text-right">Aksi</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {absentDays.map(day => (
                                        <TableRow key={format(day, 'yyyy-MM-dd')}>
                                            <TableCell className="font-medium">{format(day, 'eeee, d MMMM yyyy', { locale: id })}</TableCell>
                                            <TableCell className="text-right">
                                                <Button onClick={() => setSelectedDay(day)}>
                                                    Isi Kehadiran
                                                </Button>
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        </div>
                    ) : (
                        <div className="text-center py-16">
                            <XCircle className="mx-auto h-12 w-12 text-muted-foreground" />
                            <h3 className="mt-4 text-lg font-semibold">Tidak Ada Data Alpa</h3>
                            <p className="mt-2 text-sm text-muted-foreground">Tidak ada data alpa yang perlu diisi untuk pengguna ini di bulan yang dipilih.</p>
                        </div>
                    )}
                </CardContent>
            </Card>

            <EditAttendanceModal
                isOpen={!!selectedDay}
                onClose={() => setSelectedDay(null)}
                onSave={handleSave}
                date={selectedDay}
                isSaving={isSaving}
            />
        </>
    );
}
