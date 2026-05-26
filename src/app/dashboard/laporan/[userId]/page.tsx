'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useUser, useFirestore, useDoc, useMemoFirebase } from '@/firebase';
import { doc, getDoc, writeBatch, serverTimestamp, Timestamp } from 'firebase/firestore';
import { format, isSameMonth, addMonths, subMonths, parseISO, setHours, setMinutes, setSeconds } from 'date-fns';
import { id } from 'date-fns/locale';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from '@/components/ui/badge';
import { Skeleton } from "@/components/ui/skeleton";
import { fetchUserMonthlyReportData, MonthlyReportData, CoreStatus } from '@/lib/attendance';
import { Download, ChevronLeft, ChevronRight, ArrowLeft, Loader2, Edit } from 'lucide-react';
import { PageWrapper } from '@/components/layout/page-wrapper';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';

function generateRandomTime(baseDate: Date, start: string, end: string): Date {
    const [startHours, startMinutes] = start.split(':').map(Number);
    const [endHours, endMinutes] = end.split(':').map(Number);
    const startDate = setSeconds(setMinutes(setHours(baseDate, startHours), startMinutes), 0);
    const endDate = setSeconds(setMinutes(setHours(baseDate, endHours), endMinutes), 0);
    const randomTimestamp = startDate.getTime() + Math.random() * (endDate.getTime() - startDate.getTime());
    return new Date(randomTimestamp);
}

interface AdminCorrectionDialogProps {
  record: MonthlyReportData;
  userId: string;
  schoolConfig: any;
  onCorrectionComplete: () => void;
}

function AdminCorrectionDialog({ record, userId, schoolConfig, onCorrectionComplete }: AdminCorrectionDialogProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [keterangan, setKeterangan] = useState(record.keterangan || '');
  const [isSaving, setIsSaving] = useState(false);
  const firestore = useFirestore();
  const { toast } = useToast();

  useEffect(() => {
    if(isOpen) {
      setKeterangan(record.keterangan || '');
    }
  }, [isOpen, record]);

  const handleSaveCorrection = async () => {
    if (!firestore || !keterangan.trim()) {
        toast({ variant: "destructive", title: "Keterangan tidak boleh kosong." });
        return;
    }
    setIsSaving(true);

    try {
        const batch = writeBatch(firestore);
        const recordDate = parseISO(record.date);
        const dateStr = format(recordDate, 'yyyy-MM-dd');
        const attendanceRef = doc(firestore, 'users', userId, 'attendanceRecords', dateStr);

        const docSnap = await getDoc(attendanceRef);
        const existingData = docSnap.data() || {};

        const finalData: any = {
          ...existingData,
          date: dateStr,
          description: keterangan,
          adminEdited: true,
          updatedAt: serverTimestamp(),
        };

        if (!finalData.checkInTime) {
            const checkInStart = schoolConfig?.checkInTime?.start || '06:00';
            const checkInEnd = schoolConfig?.checkInTime?.end || '07:30';
            finalData.checkInTime = Timestamp.fromDate(generateRandomTime(recordDate, checkInStart, checkInEnd));
        }

        if (!finalData.checkOutTime) {
            const checkOutStart = schoolConfig?.checkOutTime?.start || '14:00';
            const checkOutEnd = schoolConfig?.checkOutTime?.end || '17:00';
            finalData.checkOutTime = Timestamp.fromDate(generateRandomTime(recordDate, checkOutStart, checkOutEnd));
        }

        batch.set(attendanceRef, finalData);

        if (record.isCancellable) {
            const leaveRef = doc(firestore, 'users', userId, 'leaveRequests', record.id);
            batch.delete(leaveRef);
        }

        await batch.commit();
        toast({ title: "Koreksi Berhasil Disimpan", description: `Kehadiran untuk tanggal ${format(recordDate, 'dd/MM/yyyy')} telah diperbaiki.` });
        onCorrectionComplete();
        setIsOpen(false);
    } catch (error: any) {
        console.error("Definitive correction failed:", error);
        toast({ variant: "destructive", title: "Gagal Total Menyimpan Koreksi", description: error.message });
    } finally {
        setIsSaving(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm"><Edit className="h-4 w-4" /></Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Perbaiki Status Kehadiran</DialogTitle>
          <DialogDescription>
            Anda akan memperbaiki status untuk tanggal {format(parseISO(record.date), 'd MMMM yyyy', { locale: id })}. 
            Jika jam masuk atau pulang kosong, sistem akan mengisinya secara otomatis.
          </DialogDescription>
        </DialogHeader>
        <div className="py-4 grid gap-4">
            <div className="grid gap-2">
                <Label htmlFor="keterangan">Tulis Keterangan Baru</Label>
                <Input 
                    id="keterangan"
                    value={keterangan}
                    onChange={(e) => setKeterangan(e.target.value)}
                    placeholder="Contoh: Hadir (Lupa Absen Pulang)"
                />
            </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => setIsOpen(false)} disabled={isSaving}>Batal</Button>
          <Button onClick={handleSaveCorrection} disabled={!keterangan.trim() || isSaving}>
            {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Simpan Perubahan
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

const coreStatusToVariant: { [key in CoreStatus]: 'default' | 'destructive' | 'secondary' } = {
    'Hadir': 'default',
    'Alpa': 'destructive',
    'Izin': 'secondary',
};

export default function UserReportDetailPage() {
    const params = useParams();
    const router = useRouter();
    const { user: currentUser, isUserLoading } = useUser();
    const firestore = useFirestore();
    const userId = params.userId as string;

    const [currentMonth, setCurrentMonth] = useState(new Date());
    const [monthlyReportData, setMonthlyReportData] = useState<MonthlyReportData[]>([]);
    const [userData, setUserData] = useState<any>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    // --- DEFINITIVE FIX: Fetch all required configs explicitly ---
    const schoolConfigRef = useMemoFirebase(() => firestore ? doc(firestore, 'schoolConfig', 'default') : null, [firestore]);
    const { data: schoolConfigData, isLoading: isConfigLoading } = useDoc(currentUser, schoolConfigRef);

    const monthlyConfigRef = useMemoFirebase(() => firestore ? doc(firestore, 'monthlyConfigs', format(currentMonth, 'yyyy-MM')) : null, [firestore, currentMonth]);
    const { data: monthlyConfigData, isLoading: isMonthlyConfigLoading } = useDoc(currentUser, monthlyConfigRef);
    // --- END FIX ---

    const fetchReport = useCallback(async () => {
        // --- DEFINITIVE FIX: Add guard clauses for all dependencies ---
        if (!firestore || !userId || !currentUser || !schoolConfigData || !monthlyConfigData) {
            return; 
        }
        
        setIsLoading(true);
        setError(null);
        try {
            if (currentUser.role !== 'admin' && currentUser.role !== 'kepala_sekolah') {
                 throw new Error('Anda tidak memiliki izin untuk melihat laporan ini.');
            }

            if (!userData) {
              const userRef = doc(firestore, 'users', userId);
              const userSnap = await getDoc(userRef);
              if (!userSnap.exists()) throw new Error('Pengguna tidak ditemukan.');
              setUserData(userSnap.data());
            }

            // --- DEFINITIVE FIX: Pass all configs to the data fetching function ---
            const reportData = await fetchUserMonthlyReportData(firestore, userId, currentMonth, schoolConfigData, monthlyConfigData);
            setMonthlyReportData(reportData);

        } catch (err: any) {
            console.error("Error fetching user report detail:", err);
            setError(err.message || 'Gagal memuat data laporan pengguna.');
        } finally {
            setIsLoading(false);
        }
    }, [firestore, userId, currentMonth, currentUser, schoolConfigData, monthlyConfigData, userData]);

    useEffect(() => {
        fetchReport();
    }, [fetchReport]);

    const handleDownloadPdf = async () => { /* PDF generation logic */ };

    // --- DEFINITIVE FIX: Include all loading states ---
    const pageIsLoading = isLoading || isUserLoading || isConfigLoading || isMonthlyConfigLoading;
    const isAdmin = currentUser?.role === 'admin';

    if (!isUserLoading && currentUser?.role !== 'admin' && currentUser?.role !== 'kepala_sekolah') {
         router.replace('/dashboard');
         return null;
    }

    return (
        <PageWrapper>
            <div className="mb-4">
                <Button variant="ghost" onClick={() => router.back()}>
                    <ArrowLeft className="mr-2 h-4 w-4" />
                    Kembali ke Laporan Sekolah
                </Button>
            </div>
            <Card>
                <CardHeader>
                    {userData ? (
                        <><CardTitle>Detail Laporan Kehadiran</CardTitle><CardDescription>Laporan kehadiran untuk <span className='font-semibold'>{userData.name}</span>.</CardDescription></>
                    ) : pageIsLoading ? (
                        <><Skeleton className="h-7 w-3/5 rounded-md" /><Skeleton className="h-4 w-4/5 rounded-md mt-1" /></>
                    ) : null}
                </CardHeader>
                <CardContent>
                    <div className="flex flex-col sm:flex-row justify-between items-center gap-4 mb-4">
                       <div className="flex items-center gap-2">
                            <Button variant="outline" size="icon" onClick={() => setCurrentMonth(prev => subMonths(prev, 1))}><ChevronLeft className="h-4 w-4" /></Button>
                            <span className="w-36 text-center font-semibold capitalize">{format(currentMonth, 'MMMM yyyy', { locale: id })}</span>
                            <Button variant="outline" size="icon" onClick={() => setCurrentMonth(prev => addMonths(prev, 1))} disabled={isSameMonth(currentMonth, new Date())}><ChevronRight className="h-4 w-4" /></Button>
                        </div>
                         <Button onClick={handleDownloadPdf} disabled={monthlyReportData.length === 0 || pageIsLoading}>
                            <Download className="mr-2 h-4 w-4" />
                            Unduh Laporan PDF
                        </Button>
                    </div>
                    <div className="overflow-x-auto border rounded-md">
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead className="w-[5%]">No</TableHead>
                                    <TableHead className="w-[25%]">Tanggal</TableHead>
                                    <TableHead className="w-[15%]">Jam Masuk</TableHead>
                                    <TableHead className="w-[15%]">Jam Pulang</TableHead>
                                    <TableHead className="w-[15%]">Status</TableHead>
                                    <TableHead>Keterangan</TableHead>
                                    {isAdmin && <TableHead className="w-[10%] text-center">Aksi</TableHead>}
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {pageIsLoading ? (
                                     <TableRow><TableCell colSpan={isAdmin ? 7 : 6} className="h-64 text-center"><Loader2 className="mx-auto h-8 w-8 animate-spin" /><p className="mt-2">Memuat data laporan...</p></TableCell></TableRow>
                                ) : error ? (
                                    <TableRow><TableCell colSpan={isAdmin ? 7 : 6} className="h-24 text-center text-red-600">{error}</TableCell></TableRow>
                                ) : monthlyReportData.length > 0 ? (
                                    monthlyReportData.map((item, index) => (
                                        <TableRow key={item.id}>
                                            <TableCell className='text-center'>{index + 1}</TableCell>
                                            <TableCell>{format(parseISO(item.date), 'eeee, dd MMMM yyyy', { locale: id })}</TableCell>
                                            <TableCell className='text-center'>{item.checkInTime ? format(parseISO(item.checkInTime), 'HH:mm') : '-'}</TableCell>
                                            <TableCell className='text-center'>{item.checkOutTime ? format(parseISO(item.checkOutTime), 'HH:mm') : '-'}</TableCell>
                                            <TableCell>
                                                <Badge variant={coreStatusToVariant[item.status] || 'default'}>
                                                    {item.status}
                                                </Badge>
                                            </TableCell>
                                            <TableCell>{item.keterangan}</TableCell>
                                            {isAdmin && schoolConfigData && (
                                                <TableCell className="text-center">
                                                   <AdminCorrectionDialog record={item} userId={userId} schoolConfig={schoolConfigData} onCorrectionComplete={fetchReport} />
                                                </TableCell>
                                            )}
                                        </TableRow>
                                    ))
                                ) : (
                                    <TableRow><TableCell colSpan={isAdmin ? 7 : 6} className="h-24 text-center">Tidak ada data untuk bulan ini.</TableCell></TableRow>
                                )}
                            </TableBody>
                        </Table>
                    </div>
                </CardContent>
            </Card>
        </PageWrapper>
    );
}
