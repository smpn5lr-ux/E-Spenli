'use client';

import { useState, useEffect, useMemo } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useUser, useFirestore, useDoc, useMemoFirebase } from '@/firebase';
import { doc, getDoc, writeBatch, serverTimestamp } from 'firebase/firestore';
import { format, isSameMonth, addMonths, subMonths, parseISO } from 'date-fns';
import { id } from 'date-fns/locale';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from '@/components/ui/badge';
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { fetchUserMonthlyReportData, MonthlyReportData, CoreStatus } from '@/lib/attendance';
import { Download, ChevronLeft, ChevronRight, AlertCircle, ArrowLeft, Loader2, Edit } from 'lucide-react';
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

// --- COMPONENT: AdminCorrectionDialog (Unchanged) ---

interface AdminCorrectionDialogProps {
  record: MonthlyReportData;
  userId: string;
  onCorrectionComplete: () => void;
}

function AdminCorrectionDialog({ record, userId, onCorrectionComplete }: AdminCorrectionDialogProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [keterangan, setKeterangan] = useState(record.keterangan || '');
  const [isSaving, setIsSaving] = useState(false);
  const firestore = useFirestore();
  const { toast } = useToast();

  useEffect(() => {
    setKeterangan(record.keterangan || '');
  }, [record]);

  const handleSaveCorrection = async () => {
    if (!firestore || !keterangan.trim()) {
        toast({ variant: "destructive", title: "Keterangan tidak boleh kosong." });
        return;
    }
    setIsSaving(true);

    try {
        const batch = writeBatch(firestore);
        const dateStr = format(parseISO(record.date), 'yyyy-MM-dd');
        const attendanceRef = doc(firestore, 'users', userId, 'attendanceRecords', dateStr);

        const correctionData = {
            date: dateStr,
            description: keterangan,
            adminEdited: true,
            updatedAt: serverTimestamp(),
        };

        batch.set(attendanceRef, correctionData, { merge: true });

        if (record.isCancellable) {
            const leaveRef = doc(firestore, 'users', userId, 'leaveRequests', record.id);
            batch.delete(leaveRef);
        }

        await batch.commit();
        toast({ title: "Koreksi Berhasil", description: `Keterangan telah diperbarui menjadi: "${keterangan}"` });
        onCorrectionComplete();
        setIsOpen(false);
    } catch (error: any) {
        console.error("Correction failed:", error);
        toast({ variant: "destructive", title: "Gagal Menyimpan Koreksi", description: error.message });
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
          <DialogTitle>Perbaiki Keterangan</DialogTitle>
          <DialogDescription>
            Ubah keterangan untuk tanggal {format(parseISO(record.date), 'd MMMM yyyy', { locale: id })}. Teks ini akan ditampilkan apa adanya di laporan.
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

// --- COMPONENT: UserReportDetailPage (FIXED) ---

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

    const schoolConfigRef = useMemoFirebase(() => firestore ? doc(firestore, 'schoolConfig', 'default') : null, [firestore]);
    const { data: schoolConfigData, isLoading: isConfigLoading } = useDoc(currentUser, schoolConfigRef);

    const fetchReport = async () => {
        if (!firestore || !userId || !schoolConfigData || !currentUser) return;
        
        setIsLoading(true);
        setError(null);
        try {
            if (currentUser.role !== 'admin' && currentUser.role !== 'kepala_sekolah') {
                 throw new Error('Anda tidak memiliki izin untuk melihat laporan ini.');
            }

            const userRef = doc(firestore, 'users', userId);
            const userSnap = await getDoc(userRef);
            if (!userSnap.exists()) throw new Error('Pengguna tidak ditemukan.');
            setUserData(userSnap.data());

            // **THE FIX**: Removed the empty object {} to allow the function to fetch holiday config itself.
            const reportData = await fetchUserMonthlyReportData(firestore, userId, currentMonth, schoolConfigData);
            setMonthlyReportData(reportData);

        } catch (err: any) {
            console.error("Error fetching user report detail:", err);
            setError(err.message || 'Gagal memuat data laporan pengguna.');
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        fetchReport();
    }, [firestore, userId, currentMonth, schoolConfigData, currentUser]);


    const handleDownloadPdf = async () => {
        if (!userData || monthlyReportData.length === 0) return;

        const { default: jsPDF } = await import('jspdf');
        const { default: autoTable } = await import('jspdf-autotable');

        const docPDF = new jsPDF();
        const monthName = format(currentMonth, 'MMMM yyyy', { locale: id });

        docPDF.setFontSize(18);
        docPDF.text(`Laporan Kehadiran`, 14, 22);
        docPDF.setFontSize(11);
        docPDF.text(`Nama: ${userData.name}`, 14, 30);
        docPDF.text(`Periode: ${monthName}`, 14, 36);

        autoTable(docPDF, {
            startY: 40,
            head: [['No', 'Tanggal', 'Jam Masuk', 'Jam Pulang', 'Status', 'Keterangan']],
            body: monthlyReportData.map((item, index) => [
                index + 1,
                format(parseISO(item.date), 'eeee, dd/MM/yy', { locale: id }),
                item.checkInTime ? format(parseISO(item.checkInTime), 'HH:mm:ss') : '-',
                item.checkOutTime ? format(parseISO(item.checkOutTime), 'HH:mm:ss') : '-',
                item.status,
                item.keterangan
            ]),
            theme: 'grid',
            styles: { fontSize: 8 },
            headStyles: { fillColor: [41, 128, 185], textColor: 255 },
        });

        docPDF.save(`laporan_${userData.name.replace(/\s/g, '_')}_${monthName.replace(/\s/g, '_')}.pdf`);
    };

    const pageIsLoading = isLoading || isUserLoading || isConfigLoading;
    const isAdmin = currentUser?.role === 'admin';

    if (!isUserLoading && currentUser?.role === 'guru' || currentUser?.role === 'pegawai') {
         router.replace('/dashboard/laporan');
         return null;
    }

    return (
        <PageWrapper>
            <div className="mb-4">
                <Button variant="ghost" onClick={() => router.back()}>
                    <ArrowLeft className="mr-2 h-4 w-4" />
                    Kembali
                </Button>
            </div>
            <Card>
                <CardHeader>
                    {userData ? (
                        <><CardTitle>Detail Laporan Kehadiran</CardTitle><CardDescription>Laporan kehadiran untuk <span className='font-semibold'>{userData.name}</span>.</CardDescription></>
                    ) : (
                        <><Skeleton className="h-7 w-3/5 rounded-md" /><Skeleton className="h-4 w-4/5 rounded-md mt-1" /></>
                    )}
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
                                            {isAdmin && (
                                                <TableCell className="text-center">
                                                   <AdminCorrectionDialog record={item} userId={userId} onCorrectionComplete={fetchReport} />
                                                </TableCell>
                                            )}
                                        </TableRow>
                                    ))
                                ) : (
                                    <TableRow><TableCell colSpan={isAdmin ? 7 : 6} className="h-24 text-center">Tidak ada data untuk ditampilkan.</TableCell></TableRow>
                                )}
                            </TableBody>
                        </Table>
                    </div>
                </CardContent>
            </Card>
        </PageWrapper>
    );
}
