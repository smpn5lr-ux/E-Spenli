'use client';

import { useState, useEffect } from 'react';
import { useUser, useFirestore } from '@/firebase';
import { format, parseISO } from 'date-fns';
import { id } from 'date-fns/locale';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from '@/components/ui/badge';
import { fetchUserMonthlyReportData, MonthlyReportData, CoreStatus } from '@/lib/attendance';
import { ChevronLeft, ChevronRight, Loader2 } from 'lucide-react';
import { useSettings } from '@/contexts/SettingsContext';
import { useToast } from '@/hooks/use-toast';

const coreStatusToVariant: { [key in CoreStatus]: 'default' | 'destructive' | 'secondary' } = {
    'Hadir': 'default',
    'Alpa': 'destructive',
    'Izin': 'secondary',
};

// REFACTORED: The main component for the user report page.
export default function UserPersonalReportPage() {
    const { user, isUserLoading } = useUser();
    const firestore = useFirestore();
    const { toast } = useToast();

    // REFACTORED: Get all settings from the single source of truth.
    const { schoolConfig, holidays, isSettingsLoading } = useSettings();

    const [currentMonth, setCurrentMonth] = useState(new Date()); 
    const [monthlyReportData, setMonthlyReportData] = useState<MonthlyReportData[]>([]);
    const [isReportLoading, setIsReportLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    // REFACTORED: This effect now has all the data it needs from the start.
    useEffect(() => {
        // Only run if the essential data is ready.
        if (user && firestore && schoolConfig) {
            const fetchReport = async () => {
                setIsReportLoading(true);
                setError(null);
                try {
                    // Call the refactored function with the correct arguments.
                    const reportData = await fetchUserMonthlyReportData(firestore, user.uid, currentMonth, schoolConfig, holidays);
                    setMonthlyReportData(reportData);
                } catch (err: any) {
                    console.error("Error fetching user report detail:", err);
                    setError(err.message || 'Gagal memuat data laporan Anda.');
                } finally {
                    setIsReportLoading(false);
                }
            };
            fetchReport();
        }
    }, [user, firestore, currentMonth, schoolConfig, holidays]); // Dependencies are clear and correct.

    const handlePrevMonthClick = () => {
         const newMonth = new Date(currentMonth.setMonth(currentMonth.getMonth() - 1));
         setCurrentMonth(newMonth);
    };
     const handleNextMonthClick = () => {
        const newMonth = new Date(currentMonth.setMonth(currentMonth.getMonth() + 1));
        setCurrentMonth(newMonth);
    };
    
    // Combined loading state for a cleaner check.
    const isPageLoading = isUserLoading || isSettingsLoading;
    
    if (isPageLoading) {
        return <div className="flex h-screen items-center justify-center"><Loader2 className="h-10 w-10 animate-spin" /></div>;
    }

    return (
        <div className="space-y-4">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-semibold tracking-tight">Laporan Kehadiran Anda</h1>
                    <p className="text-sm text-muted-foreground">
                        Laporan kehadiran pribadi Anda per bulan.
                    </p>
                </div>
                
                <div className="flex items-center gap-2">
                    <Button variant="outline" size="icon" onClick={handlePrevMonthClick}>
                        <ChevronLeft className="h-4 w-4" />
                    </Button>
                    <span className="w-36 text-center font-semibold capitalize">{format(currentMonth, 'MMMM yyyy', { locale: id })}</span>
                    <Button variant="outline" size="icon" onClick={handleNextMonthClick}>
                        <ChevronRight className="h-4 w-4" />
                    </Button>
                </div>
            </div>

            <Card>
                <CardContent className="p-0">
                    <div className="overflow-x-auto">
                        <Table>
                            <TableHeader>
                                <TableRow className="bg-primary text-primary-foreground hover:bg-primary/90">
                                    <TableHead className="w-[5%] text-center text-white">No</TableHead>
                                    <TableHead className="w-[25%] text-white">Tanggal</TableHead>
                                    <TableHead className="w-[15%] text-center text-white">Jam Masuk</TableHead>
                                    <TableHead className="w-[15%] text-center text-white">Jam Pulang</TableHead>
                                    <TableHead className="w-[15%] text-white">Status</TableHead>
                                    <TableHead className="text-white">Keterangan</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {isReportLoading ? (
                                     <TableRow><TableCell colSpan={6} className="h-64 text-center"><Loader2 className="mx-auto h-8 w-8 animate-spin" /><p className="mt-2">Memuat data laporan...</p></TableCell></TableRow>
                                ) : error ? (
                                    <TableRow><TableCell colSpan={6} className="h-24 text-center text-red-600">{error}</TableCell></TableRow>
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
                                        </TableRow>
                                    ))
                                ) : (
                                    <TableRow><TableCell colSpan={6} className="h-24 text-center">Tidak ada data untuk bulan ini.</TableCell></TableRow>
                                )}
                            </TableBody>
                        </Table>
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}
