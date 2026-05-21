'use client';

import { useState, useEffect } from 'react';
import { useFirestore } from '@/firebase';
import { doc, getDoc } from 'firebase/firestore';
import { fetchUserMonthlyReportData } from '@/lib/attendance';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Loader2 } from 'lucide-react';

type UserReportDetailModalProps = {
    user: { uid: string; name?: string } | null;
    month: string;
    isOpen: boolean;
    onClose: () => void;
};

type ReportDetail = {
    id: string;
    dateString: string;
    status: string;
    checkIn?: string;
    checkOut?: string;
    description?: string;
};

const statusVariant: Record<string, 'default' | 'destructive' | 'secondary' | 'outline'> = {
    'Hadir': 'default',
    'Sakit': 'destructive',
    'Izin': 'secondary',
    'Alpa': 'destructive',
    'Terlambat': 'outline',
};

export default function UserReportDetailModal({ user, month, isOpen, onClose }: UserReportDetailModalProps) {
    const firestore = useFirestore();
    const [reportDetails, setReportDetails] = useState<ReportDetail[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (!isOpen || !firestore || !user) return;

        const fetchDetails = async () => {
            setIsLoading(true);
            setError(null);
            try {
                const schoolConfigRef = doc(firestore, 'schoolConfig', 'default');
                const schoolConfigSnap = await getDoc(schoolConfigRef);
                const schoolConfig = schoolConfigSnap.data() || {};

                let monthDate: Date;
                const ymMatch = month.match(/^(\d{4})-(\d{2})$/);
                if (ymMatch) {
                    const y = Number(ymMatch[1]);
                    const m = Number(ymMatch[2]) - 1;
                    monthDate = new Date(y, m, 1);
                } else {
                    monthDate = new Date(month);
                }

                const reportData = await fetchUserMonthlyReportData(firestore, user.uid, monthDate, schoolConfig, {});
                const normalized: ReportDetail[] = (reportData as any[]).map(item => ({
                    id: item.id,
                    dateString: item.dateString || item.date || item.date_formatted || '',
                    status: item.status || String(item.status || ''),
                    checkIn: item.checkIn || item.checkInTime || item.check_in || undefined,
                    checkOut: item.checkOut || item.checkOutTime || item.check_out || undefined,
                    description: item.description || item.keterangan || undefined,
                }));
                setReportDetails(normalized);
            } catch (err) {
                console.error("Error fetching user report details:", err);
                setError("Gagal memuat rincian laporan. Silakan coba lagi.");
            } finally {
                setIsLoading(false);
            }
        };

        fetchDetails();
    }, [isOpen, firestore, user, month]);

    return (
        <Dialog open={isOpen} onOpenChange={onClose}>
            <DialogContent className="max-w-3xl">
                <DialogHeader>
                    <DialogTitle>Detail Laporan Kehadiran</DialogTitle>
                    <DialogDescription>
                        Menampilkan rincian kehadiran untuk {user?.name} pada bulan {month}.
                    </DialogDescription>
                </DialogHeader>
                {error && (
                    <Alert variant="destructive" className="mt-4">
                        <AlertTitle>Terjadi Kesalahan</AlertTitle>
                        <AlertDescription>{error}</AlertDescription>
                    </Alert>
                )}
                <div className="mt-4 max-h-[60vh] overflow-y-auto">
                    {isLoading ? (
                        <div className="flex items-center justify-center h-48">
                            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                        </div>
                    ) : (
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Tanggal</TableHead>
                                    <TableHead className="text-center">Status</TableHead>
                                    <TableHead className="text-center">Jam Masuk</TableHead>
                                    <TableHead className="text-center">Jam Pulang</TableHead>
                                    <TableHead>Keterangan</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {reportDetails.length > 0 ? (
                                    reportDetails.map(day => (
                                        <TableRow key={day.id}>
                                            <TableCell className="font-medium">{day.dateString}</TableCell>
                                            <TableCell className="text-center">
                                                <Badge variant={statusVariant[day.status] || 'default'}>{day.status}</Badge>
                                            </TableCell>
                                            <TableCell className="text-center">{day.checkIn || '-'}</TableCell>
                                            <TableCell className="text-center">{day.checkOut || '-'}</TableCell>
                                            <TableCell>{day.description}</TableCell>
                                        </TableRow>
                                    ))
                                ) : (
                                    <TableRow>
                                        <TableCell colSpan={5} className="h-24 text-center">
                                            Tidak ada data untuk ditampilkan pada periode ini.
                                        </TableCell>
                                    </TableRow>
                                )}
                            </TableBody>
                        </Table>
                    )}
                </div>
            </DialogContent>
        </Dialog>
    );
}
