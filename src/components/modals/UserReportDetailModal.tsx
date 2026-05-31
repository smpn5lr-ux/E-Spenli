'use client';

import { useState, useEffect } from 'react';
import { useFirestore } from '@/firebase';
import { fetchUserMonthlyReportData } from '@/lib/attendance';
import { useSettings } from '@/contexts/SettingsContext'; // FINAL BUILD FIX: Import useSettings
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Loader2 } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { id } from 'date-fns/locale';

type UserReportDetailModalProps = {
    user: { uid: string; name?: string } | null;
    month: string;
    isOpen: boolean;
    onClose: () => void;
};

type ReportDetail = {
    id: string;
    date: string; // Changed from dateString to date
    status: string;
    checkInTime: string | null; // Changed to match MonthlyReportData
    checkOutTime: string | null; // Changed to match MonthlyReportData
    keterangan: string; // Changed from description to keterangan
};

const statusVariant: Record<string, 'default' | 'destructive' | 'secondary' | 'outline'> = {
    'Hadir': 'default',
    'Sakit': 'destructive',
    'Izin': 'secondary',
    'Alpa': 'destructive',
};

// FINAL BUILD FIX: The entire component is refactored to use useSettings and the correct data structures.
export default function UserReportDetailModal({ user, month, isOpen, onClose }: UserReportDetailModalProps) {
    const firestore = useFirestore();
    const { schoolConfig, holidays, isSettingsLoading } = useSettings(); // Use the central settings context
    const [reportDetails, setReportDetails] = useState<ReportDetail[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (!isOpen || !firestore || !user || isSettingsLoading) return;

        const fetchDetails = async () => {
            setIsLoading(true);
            setError(null);
            try {
                // Ensure schoolConfig is loaded before proceeding
                if (!schoolConfig) {
                    setError("Konfigurasi sekolah tidak dapat dimuat.");
                    setIsLoading(false);
                    return;
                }

                // Parse the month string into a Date object
                let monthDate: Date;
                const ymMatch = month.match(/^(\d{4})-(\d{2})$/);
                if (ymMatch) {
                    monthDate = new Date(Number(ymMatch[1]), Number(ymMatch[2]) - 1, 1);
                } else {
                    monthDate = new Date(month);
                }

                // The function call is now correct, passing the loaded `schoolConfig` and `holidays`.
                const reportData = await fetchUserMonthlyReportData(firestore, user.uid, monthDate, schoolConfig, holidays);
                
                // The data is already in the correct format, so we can set it directly.
                setReportDetails(reportData);
            } catch (err) {
                console.error("Error fetching user report details:", err);
                setError("Gagal memuat rincian laporan. Silakan coba lagi.");
            } finally {
                setIsLoading(false);
            }
        };

        fetchDetails();
    }, [isOpen, firestore, user, month, schoolConfig, holidays, isSettingsLoading]); // Updated dependencies

    return (
        <Dialog open={isOpen} onOpenChange={onClose}>
            <DialogContent className="max-w-3xl">
                <DialogHeader>
                    <DialogTitle>Detail Laporan Kehadiran</DialogTitle>
                    <DialogDescription>
                        Menampilkan rincian untuk {user?.name} pada bulan {month}.
                    </DialogDescription>
                </DialogHeader>
                {error && (
                    <Alert variant="destructive" className="mt-4">
                        <AlertTitle>Terjadi Kesalahan</AlertTitle>
                        <AlertDescription>{error}</AlertDescription>
                    </Alert>
                )}
                <div className="mt-4 max-h-[60vh] overflow-y-auto">
                    {isLoading || isSettingsLoading ? (
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
                                            <TableCell className="font-medium">{format(parseISO(day.date), 'eeee, dd MMMM yyyy', { locale: id })}</TableCell>
                                            <TableCell className="text-center">
                                                <Badge variant={statusVariant[day.status] || 'default'}>{day.status}</Badge>
                                            </TableCell>
                                            <TableCell className="text-center">{day.checkInTime ? format(parseISO(day.checkInTime), 'HH:mm') : '-'}</TableCell>
                                            <TableCell className="text-center">{day.checkOutTime ? format(parseISO(day.checkOutTime), 'HH:mm') : '-'}</TableCell>
                                            <TableCell>{day.keterangan}</TableCell>
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
