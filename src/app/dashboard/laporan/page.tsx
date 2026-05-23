'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { Badge } from '@/components/ui/badge';
import { Loader2, ChevronLeft, ChevronRight, RefreshCw } from 'lucide-react';
import { useUser, useFirestore, useDoc, useMemoFirebase } from '@/firebase';
import { doc } from 'firebase/firestore';
import { format, isSameMonth, addMonths, subMonths, parseISO } from 'date-fns';
import { id } from 'date-fns/locale';
import { fetchUserMonthlyReportData, MonthlyReportData, CoreStatus } from '@/lib/attendance';
import { PageWrapper } from '@/components/layout/page-wrapper';
import { Skeleton } from '@/components/ui/skeleton';

const coreStatusToVariant: { [key in CoreStatus]: 'default' | 'secondary' | 'destructive' } = {
    'Hadir': 'default',
    'Izin': 'secondary',
    'Alpa': 'destructive',
};

interface ReportItem extends MonthlyReportData {
  dateString: string;
}

export default function LaporanPage() {
  const { user, isUserLoading: isAuthLoading } = useUser();
  const firestore = useFirestore();
  const { toast } = useToast();
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [monthlyReportData, setMonthlyReportData] = useState<ReportItem[]>([]);
  const [isReportLoading, setIsReportLoading] = useState(true);

  const schoolConfigRef = useMemo(() => firestore ? doc(firestore, 'schoolConfig', 'default') : null, [firestore]);
  const userDocRef = useMemoFirebase(() => user ? doc(firestore, 'users', user.uid) : null, [firestore, user]);

  const { data: schoolConfig, isLoading: isConfigLoading } = useDoc(user, schoolConfigRef);
  const { data: userData, isLoading: isUserDataLoading } = useDoc<{ role: string }>(user, userDocRef);

  const fetchReport = useCallback(async () => {
    if (!firestore || !user || !schoolConfig || !userData) {
        if (!isAuthLoading && !isConfigLoading && !isUserDataLoading) setIsReportLoading(false);
        return;
    }
    setIsReportLoading(true);
    try {
        const rawReport = await fetchUserMonthlyReportData(firestore, user.uid, currentMonth, schoolConfig);
        const formattedReport: ReportItem[] = rawReport.map((record) => ({
            ...record,
            dateString: format(parseISO(record.date), 'EEEE, dd MMMM yyyy', { locale: id }),
            checkInTime: record.checkInTime ? format(parseISO(record.checkInTime), 'HH:mm') : '-',
            checkOutTime: record.checkOutTime ? format(parseISO(record.checkOutTime), 'HH:mm') : '-',
        }));
        setMonthlyReportData(formattedReport);
    } catch (error) {
        console.error("Failed to fetch monthly report:", error);
        toast({ title: "Gagal Memuat Laporan", description: "Terjadi kesalahan saat mengambil data.", variant: "destructive" });
    } finally {
        setIsReportLoading(false);
    }
  }, [firestore, user, schoolConfig, userData, currentMonth, isAuthLoading, isConfigLoading, isUserDataLoading, toast]);

  useEffect(() => {
    fetchReport();
  }, [fetchReport]);

  const handleRefresh = useCallback(() => {
      toast({ title: 'Sinkronisasi Data', description: 'Memuat data terbaru dari server.' });
      fetchReport();
  }, [fetchReport, toast]);

  const canViewPreviousMonths = useMemo(() => {
    if (!userData) return false;
    return userData.role === 'admin' || userData.role === 'kepala_sekolah';
  }, [userData]);

  const handlePrevMonth = () => {
    if (canViewPreviousMonths) {
      setCurrentMonth(prev => subMonths(prev, 1));
    } else {
      toast({
        title: "Akses Terbatas",
        description: "Silakan hubungi admin atau kepala sekolah untuk melihat laporan sebelumnya.",
      });
    }
  };
  
  const handleNextMonth = () => setCurrentMonth(prev => addMonths(prev, 1));

  const isLoading = isAuthLoading || isConfigLoading || isUserDataLoading;

  if (isLoading) {
    return (
        <PageWrapper>
            <div className="space-y-6">
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center">
                    <div>
                        <Skeleton className="h-8 w-64 mb-2" />
                        <Skeleton className="h-4 w-96" />
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    <Skeleton className="h-10 w-10" />
                    <Skeleton className="h-6 w-40" />
                    <Skeleton className="h-10 w-10" />
                    <Skeleton className="h-10 w-10 ml-auto" />
                </div>
                <Card>
                    <CardContent className="p-0">
                         <Table><TableHeader><TableRow>{Array.from({ length: 6 }).map((_, i) => <TableHead key={i}><Skeleton className="h-5 w-full" /></TableHead>)}</TableRow></TableHeader><TableBody><TableRow><TableCell colSpan={6} className="h-96"><div className="flex items-center justify-center h-full"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div></TableCell></TableRow></TableBody></Table>
                    </CardContent>
                </Card>
            </div>
        </PageWrapper>
    );
  }

  return (
    <PageWrapper>
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6">
          <div>
              <h1 className="text-2xl font-bold tracking-tight">Riwayat Absensi & Izin</h1>
              <p className="text-muted-foreground">Catatan kehadiran dan pengajuan izin Anda. Klik Sinkron untuk data terbaru.</p>
          </div>
      </div>

      <div className="flex items-center gap-2 mb-4">
          <Button variant="outline" size="icon" onClick={handlePrevMonth} disabled={isReportLoading}><ChevronLeft className="h-4 w-4" /></Button>
          <span className="font-semibold text-center w-40 capitalize">{format(currentMonth, 'MMMM yyyy', { locale: id })}</span>
          <Button variant="outline" size="icon" onClick={handleNextMonth} disabled={isSameMonth(currentMonth, new Date()) || isReportLoading}><ChevronRight className="h-4 w-4" /></Button>
          <Button variant="outline" size="icon" onClick={handleRefresh} className="ml-auto" disabled={isReportLoading}>
            {isReportLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          </Button>
      </div>

      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            {isReportLoading && monthlyReportData.length === 0 ? (
                <div className="p-4 min-h-96 flex items-center justify-center">
                    <Loader2 className="h-8 w-8 animate-spin text-primary" />
                </div>
            ) : (
              <Table className="min-w-[700px]">
                <TableHeader>
                    <TableRow>
                        <TableHead className="w-[50px] text-center">No.</TableHead>
                        <TableHead className="w-[200px]">Tanggal</TableHead>
                        <TableHead className="w-[100px] text-center">Jam Masuk</TableHead>
                        <TableHead className="w-[100px] text-center">Jam Pulang</TableHead>
                        <TableHead className="w-[120px]">Status</TableHead>
                        <TableHead>Keterangan</TableHead>
                    </TableRow>
                </TableHeader>
                <TableBody>
                    {monthlyReportData.length > 0 ? (
                        monthlyReportData.map((record, index) => (
                            <TableRow key={`${record.id}-${index}`}>
                                <TableCell className="text-center">{index + 1}</TableCell>
                                <TableCell className="font-medium whitespace-nowrap">{record.dateString}</TableCell>
                                <TableCell className="text-center">{record.checkInTime}</TableCell>
                                <TableCell className="text-center">{record.checkOutTime}</TableCell>
                                <TableCell>
                                  <Badge variant={coreStatusToVariant[record.status] || 'default'}>
                                    {record.status}
                                  </Badge>
                                </TableCell>
                                <TableCell title={record.keterangan}>{record.keterangan}</TableCell>
                            </TableRow>
                        ))
                    ) : (
                        <TableRow><TableCell colSpan={6} className="h-24 text-center">Tidak ada riwayat untuk bulan ini.</TableCell></TableRow>
                    )}
                </TableBody>
              </Table>
            )}
          </div>
        </CardContent>
      </Card>
    </PageWrapper>
  );
}
