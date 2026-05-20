'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { Badge } from '@/components/ui/badge';
import { Loader2, ChevronLeft, ChevronRight, RefreshCw, XCircle } from 'lucide-react';
import { useUser, useFirestore, useDoc, errorEmitter, FirestorePermissionError } from '@/firebase';
import { doc, deleteDoc } from 'firebase/firestore';
import { format, isSameMonth, addMonths, subMonths, parseISO } from 'date-fns';
import { id } from 'date-fns/locale';
import { fetchUserMonthlyReportData } from '@/lib/attendance';
import { getFromCache, setInCache, invalidateCache } from '@/lib/cache';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"

// --- Types and Constants ---
const statusVariant: { [key: string]: 'default' | 'secondary' | 'destructive' | 'outline' } = {
    'Hadir': 'default',
    'Sakit': 'destructive',
    'Izin': 'secondary',
    'Izin (pribadi)': 'secondary',
    'Dinas Pagi': 'secondary',
    'Dinas Siang': 'secondary',
    'Izin Pulang Cepat': 'secondary',
    'Dinas': 'secondary', // Generic fallback
    'Menunggu': 'outline', // Status for pending requests
    'Terlambat': 'outline',
    'Alpa': 'destructive',
};

interface ReportItem {
  id: string;
  date: string;
  dateString: string;
  checkIn: string;
  checkOut: string;
  status: string;
  description: string;
  // This field will indicate if the item is a leave request that can be cancelled.
  isCancellable?: boolean;
}

// --- Main Component ---
export default function LaporanPage() {
  const { user, isUserLoading: isAuthLoading } = useUser();
  const firestore = useFirestore();
  const { toast } = useToast();
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [monthlyReportData, setMonthlyReportData] = useState<ReportItem[]>([]);
  const [isReportLoading, setIsReportLoading] = useState(true);
  
  // State for cancellation dialog
  const [isCancelDialogOpen, setIsCancelDialogOpen] = useState(false);
  const [selectedLeaveId, setSelectedLeaveId] = useState<string | null>(null);
  const [isCancelling, setIsCancelling] = useState(false);

  const isStaff = user?.role === 'guru' || user?.role === 'pegawai';

  const schoolConfigRef = useMemo(() => firestore ? doc(firestore, 'schoolConfig', 'default') : null, [firestore]);
  const { data: schoolConfig, isLoading: isConfigLoading } = useDoc(user, schoolConfigRef);

  const cacheKey = useMemo(() => 
    user ? `report_${format(currentMonth, 'yyyy-MM')}_${user.uid}` : null, 
  [user, currentMonth]);

  const fetchReport = useCallback(async (forceRefresh = false) => {
    if (!firestore || !user || !schoolConfig || !cacheKey) {
        if (!isAuthLoading && !isConfigLoading) setIsReportLoading(false);
        return;
    }

    setIsReportLoading(true);

    if (!forceRefresh) {
        const cachedData = getFromCache(cacheKey);
        if (cachedData) {
            setMonthlyReportData(cachedData);
            setIsReportLoading(false);
            return;
        }
    }

    try {
        const rawReport = await fetchUserMonthlyReportData(firestore, user.uid, currentMonth, schoolConfig, {});
        
        const formattedReport: ReportItem[] = rawReport.map((record: any) => ({
            id: record.id,
            date: record.date,
            dateString: format(parseISO(record.date), 'eee, dd/MM/yy', { locale: id }),
            checkIn: record.checkInTime ? format(parseISO(record.checkInTime), 'HH:mm') : '-',
            checkOut: record.checkOutTime ? format(parseISO(record.checkOutTime), 'HH:mm') : '-',
            status: record.status, // Expecting 'Menunggu' for pending requests
            description: record.description,
            // Assume fetchUserMonthlyReportData adds this flag for pending leave requests
            isCancellable: record.isCancellable || record.status === 'Menunggu', 
        }));

        setMonthlyReportData(formattedReport);
        setInCache(cacheKey, formattedReport);
    } catch (error) {
        console.error("Failed to fetch monthly report:", error);
        toast({ title: "Gagal Memuat Laporan", description: "Terjadi kesalahan saat mengambil data.", variant: "destructive" });
    } finally {
        setIsReportLoading(false);
    }
  }, [firestore, user, schoolConfig, cacheKey, currentMonth, isAuthLoading, isConfigLoading, toast]);

  useEffect(() => {
    fetchReport(false);
  }, [fetchReport]);

  const handleRefresh = useCallback(() => {
      if (cacheKey) invalidateCache(cacheKey);
      toast({ title: 'Sinkronisasi Data', description: 'Memaksa pembaruan data dari server.' });
      fetchReport(true);
  }, [cacheKey, fetchReport, toast]);

  // --- Cancellation Logic ---
  const openCancelDialog = (leaveId: string) => {
      setSelectedLeaveId(leaveId);
      setIsCancelDialogOpen(true);
  };

  const confirmCancelRequest = async () => {
    if (!user || !firestore || !selectedLeaveId) return;

    setIsCancelling(true);
    const leaveRequestRef = doc(firestore, 'users', user.uid, 'leaveRequests', selectedLeaveId);

    try {
      await deleteDoc(leaveRequestRef);
      toast({ title: 'Pengajuan Dibatalkan', description: 'Pengajuan izin Anda telah berhasil dibatalkan.' });
      handleRefresh(); // Refresh the report data
    } catch (error: any) {
      console.error("Failed to cancel leave request:", error);
      const contextualError = new FirestorePermissionError({ operation: 'delete', path: leaveRequestRef.path });
      errorEmitter.emit('permission-error', contextualError);
      toast({ title: "Gagal Membatalkan", description: error.message || "Terjadi kesalahan.", variant: "destructive" });
    } finally {
      setIsCancelling(false);
      setIsCancelDialogOpen(false);
      setSelectedLeaveId(null);
    }
  };

  // --- Month Navigation ---
  const handlePrevMonth = () => {
    if (isStaff) {
        toast({ title: 'Akses Terbatas', description: 'Hubungi admin untuk melihat laporan sebelumnya.' });
        return;
    }
    setCurrentMonth(prev => subMonths(prev, 1));
  };

  const handleNextMonth = () => {
      setCurrentMonth(prev => addMonths(prev, 1));
  };

  const isLoading = isAuthLoading || isConfigLoading || isReportLoading;

  if (isLoading && monthlyReportData.length === 0) {
    return (
        <Card>
            <CardHeader className="p-4 md:p-6"><CardTitle>Riwayat Absensi & Izin</CardTitle><CardDescription>Berikut adalah catatan kehadiran dan pengajuan izin Anda.</CardDescription></CardHeader>
            <CardContent className="p-4 pt-0 md:p-6 md:pt-0 flex h-96 items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-primary" /></CardContent>
        </Card>
    );
  }
  
  return (
    <>
      <Card>
        <CardHeader className="p-4 md:p-6">
          <CardTitle>Riwayat Absensi & Izin</CardTitle>
          <CardDescription>Catatan kehadiran dan pengajuan izin Anda. Klik Sinkron untuk data terbaru.</CardDescription>
        </CardHeader>
        <CardContent className="p-4 pt-0 md:p-6 md:pt-0 min-h-96">
          <div className="flex items-center gap-2 mb-4">
              <Button variant="outline" size="icon" onClick={handlePrevMonth}><ChevronLeft className="h-4 w-4" /></Button>
              <span className="font-semibold text-center w-32 capitalize">{format(currentMonth, 'MMMM yyyy', { locale: id })}</span>
              <Button variant="outline" size="icon" onClick={handleNextMonth} disabled={isSameMonth(currentMonth, new Date())}><ChevronRight className="h-4 w-4" /></Button>
              <Button variant="outline" size="icon" onClick={handleRefresh} className="ml-auto"><RefreshCw className={`h-4 w-4 ${isReportLoading ? 'animate-spin' : ''}`} /></Button>
          </div>
          <div className="border rounded-md overflow-x-auto">
              <Table className="min-w-[800px]">
                  <TableHeader>
                      <TableRow>
                          <TableHead className="w-[50px] text-center">No.</TableHead>
                          <TableHead className="w-[140px]">Tanggal</TableHead>
                          <TableHead className="w-[100px] text-center">Jam Masuk</TableHead>
                          <TableHead className="w-[100px] text-center">Jam Pulang</TableHead>
                          <TableHead className="w-[120px] text-center">Status</TableHead>
                          <TableHead>Keterangan</TableHead>
                          <TableHead className="w-[120px] text-center">Aksi</TableHead> 
                      </TableRow>
                  </TableHeader>
                  <TableBody>
                      {isReportLoading && monthlyReportData.length === 0 ? (
                          <TableRow><TableCell colSpan={7} className="h-64 text-center"><Loader2 className="h-6 w-6 animate-spin mx-auto" /><p className="mt-2">Memuat Laporan...</p></TableCell></TableRow>
                      ) : monthlyReportData.length > 0 ? (
                          monthlyReportData.map((record, index) => (
                              <TableRow key={`${record.id}-${index}`}>
                                  <TableCell className="text-center">{index + 1}</TableCell>
                                  <TableCell className="font-medium whitespace-nowrap">{record.dateString}</TableCell>
                                  <TableCell className="text-center">{record.checkIn}</TableCell>
                                  <TableCell className="text-center">{record.checkOut}</TableCell>
                                  <TableCell className="text-center whitespace-nowrap"><Badge variant={statusVariant[record.status] || 'default'}>{record.status}</Badge></TableCell>
                                  <TableCell title={record.description}>{record.description}</TableCell>
                                  <TableCell className="text-center">
                                    {record.isCancellable && (
                                      <Button variant="destructive" size="sm" onClick={() => openCancelDialog(record.id)} disabled={isCancelling}>
                                        <XCircle className="h-4 w-4 mr-2" />
                                        Batalkan
                                      </Button>
                                    )}
                                  </TableCell>
                              </TableRow>
                          ))
                      ) : (
                          <TableRow><TableCell colSpan={7} className="h-24 text-center">Tidak ada riwayat untuk bulan ini.</TableCell></TableRow>
                      )}
                  </TableBody>
              </Table>
          </div>
        </CardContent>
      </Card>

      <AlertDialog open={isCancelDialogOpen} onOpenChange={setIsCancelDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Konfirmasi Pembatalan</AlertDialogTitle>
            <AlertDialogDescription>
              Apakah Anda yakin ingin membatalkan pengajuan izin ini? Tindakan ini tidak dapat diurungkan.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isCancelling}>Tidak</AlertDialogCancel>
            <AlertDialogAction onClick={confirmCancelRequest} disabled={isCancelling}>
              {isCancelling && <Loader2 className="h-4 w-4 mr-2 animate-spin" />} 
              Ya, Batalkan
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}