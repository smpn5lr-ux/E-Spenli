'use client';

import { useState, useMemo, useEffect } from 'react';
import Link from 'next/link';
import { useUser, useFirestore, useDoc, useMemoFirebase } from '@/firebase';
import { collection, getDocs, query, where, doc } from 'firebase/firestore';
import { format, isValid, parseISO, startOfMonth, endOfMonth, addMonths, subMonths, isSameMonth } from 'date-fns';
import { id } from 'date-fns/locale';
import { ChevronLeft, ChevronRight, Download, AlertCircle, FileText, FileSpreadsheet, RefreshCw, Loader2, Edit, Eye } from 'lucide-react';
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import EditAttendanceModal from '@/components/modals/EditAttendanceModal';
import * as XLSX from 'xlsx';
import type { jsPDF } from "jspdf";
import { calculateAttendanceStats, fetchUserMonthlyReportData } from '@/lib/attendance';
import { PageWrapper } from '@/components/layout/page-wrapper';

interface ReportRowData {
    no: number;
    uid: string;
    name: string;
    nip: string;
    position: string;
    role: string;
    totalHadir: number;
    totalIzin: number;
    totalSakit: number;
    totalAlpa: number;
    persentase: string;
    sequenceNumber: number | null;
}

const safeFormat = (dateInput: string | Date | null | undefined, formatString: string, options: any = {}) => {
    if (!dateInput) return '-';
    const date = typeof dateInput === 'string' ? parseISO(dateInput) : dateInput;
    return isValid(date) ? format(date, formatString, options) : '-';
};

const addReportHeader = (doc: jsPDF) => {
    const pageWidth = doc.internal.pageSize.getWidth();
    const center = pageWidth / 2;
    doc.setFont('times', 'bold');
    doc.setFontSize(14);
    doc.text('PEMERINTAH KABUPATEN MANGGARAI', center, 15, { align: 'center' });
    doc.text('DINAS PENDIDIKAN PEMUDA DAN OLAHRAGA', center, 21, { align: 'center' });
    doc.text('SMP NEGERI 5 LANGKE REMBONG', center, 27, { align: 'center' });
    doc.setFont('times', 'normal');
    doc.setFontSize(9);
    doc.text('Alamat: Mando, Kelurahan compang carep, Kecamatan Langke Rembong', center, 33, { align: 'center' });
    doc.setLineWidth(0.5);
    doc.line(14, 37, pageWidth - 14, 37);
    return 45;
};

const addSignatureBlock = (doc: jsPDF, startY: number, principal: ReportRowData | undefined) => {
    const pageHeight = doc.internal.pageSize.getHeight();
    const pageWidth = doc.internal.pageSize.getWidth();
    const signatureHeight = 45; 
    let effectiveY = startY;

    if (startY + signatureHeight > pageHeight - 25) {
        doc.addPage();
        effectiveY = 20; 
    }

    const signatureX = pageWidth - 84;
    doc.setFontSize(10);
    doc.text(`Mando, ${format(new Date(), 'd MMMM yyyy', { locale: id })}`, signatureX, effectiveY + 5);
    doc.text('Mengetahui,', signatureX, effectiveY + 11);
    doc.text('Kepala Sekolah', signatureX, effectiveY + 17);
    doc.text(principal ? principal.name : '(...................................)', signatureX, effectiveY + 37);
    if (principal?.nip) {
        doc.text(`NIP. ${principal.nip}`, signatureX, effectiveY + 43);
    }
};

const addFooter = (doc: jsPDF) => {
    const pageCount = (doc as any).internal.getNumberOfPages();
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();

    for (let i = 1; i <= pageCount; i++) {
        doc.setPage(i);
        doc.setFontSize(8);
        doc.setFont('times', 'italic');
        doc.text("Dokumen absensi ini adalah dokumen resmi yang dibuat secara otomatis oleh aplikasi.", 14, pageHeight - 10, { align: 'left' });
        doc.setFont('times', 'normal');
        doc.text(`Halaman ${i} dari ${pageCount}`, pageWidth - 14, pageHeight - 10, { align: 'right' });
    }
};

export default function SchoolReportPage() {
    const { user, isUserLoading } = useUser();
    const firestore = useFirestore();
    const [currentMonth, setCurrentMonth] = useState(new Date());
    const [reportData, setReportData] = useState<ReportRowData[]>([]);
    const [isReportLoading, setIsReportLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [searchTerm, setSearchTerm] = useState("");
    const [roleFilter, setRoleFilter] = useState("all");
    const [isEditModalOpen, setIsEditModalOpen] = useState(false);
    const [editingUser, setEditingUser] = useState<ReportRowData | null>(null);
    const [refetchIndex, setRefetchIndex] = useState(0);

    const schoolConfigRef = useMemoFirebase(() => firestore ? doc(firestore, 'schoolConfig', 'default') : null, [firestore]);
    const { data: schoolConfigData, isLoading: isConfigLoading } = useDoc(user, schoolConfigRef);

    const monthlyConfigRef = useMemoFirebase(() => firestore ? doc(firestore, 'monthlyConfigs', format(currentMonth, 'yyyy-MM')) : null, [firestore, currentMonth]);
    const { data: monthlyConfigData, isLoading: isMonthlyConfigLoading } = useDoc(user, monthlyConfigRef);

    useEffect(() => {
        if (isUserLoading || !user || !firestore || isConfigLoading || isMonthlyConfigLoading) return;
        
        let isMounted = true;
        const loadData = async () => {
            setIsReportLoading(true);
            setError(null);
            try {
                const usersQuery = query(collection(firestore, 'users'), where('role', 'in', ['guru', 'pegawai', 'kepala_sekolah']));
                const usersSnapshot = await getDocs(usersQuery);
                
                if (usersSnapshot.empty) {
                    if (isMounted) setReportData([]);
                    return;
                }

                const reportPromises = usersSnapshot.docs.map(async (userDoc) => {
                    const userData = userDoc.data();
                    // *** FINAL VERCEL BUILD FIX ***
                    // The function now fetches its own config, so we must not pass it.
                    const stats = await calculateAttendanceStats(firestore, userDoc.id, currentMonth);
                    
                    return {
                        uid: userDoc.id,
                        name: userData.name || '',
                        nip: userData.nip || '-',
                        position: userData.position || '-',
                        role: userData.role || '',
                        sequenceNumber: userData.sequenceNumber || null,
                        totalHadir: stats.totalHadir,
                        totalIzin: stats.totalIzin,
                        totalSakit: stats.totalSakit,
                        totalAlpa: stats.totalAlpa,
                        persentase: `${(stats.percentage || 0).toFixed(1)}%`,
                    };
                });

                const results = await Promise.allSettled(reportPromises);
                const successfulResults = results
                    .filter((res): res is PromiseFulfilledResult<any> => res.status === 'fulfilled')
                    .map(res => res.value);
                
                successfulResults.sort((a, b) => {
                    const seqA = a.sequenceNumber;
                    const seqB = b.sequenceNumber;
                    if (seqA != null && seqB != null) return seqA < seqB ? -1 : 1;
                    if (seqA != null) return -1;
                    if (seqB != null) return 1;
                    return a.name.localeCompare(b.name);
                });

                if (isMounted) {
                    setReportData(successfulResults.map((report, index) => ({ ...report, no: index + 1 })));
                }
            } catch (err) {
                console.error("Gagal memuat data laporan sekolah:", err);
                if (isMounted) setError("Gagal mengambil data laporan.");
            } finally {
                if (isMounted) setIsReportLoading(false);
            }
        };
        
        loadData();
        
        return () => { isMounted = false; };
    }, [user, isUserLoading, firestore, currentMonth, refetchIndex, schoolConfigData, isConfigLoading, monthlyConfigData, isMonthlyConfigLoading]);
    
    const monthName = format(currentMonth, 'MMMM yyyy', { locale: id });
    const principal = useMemo(() => reportData.find(u => u.role === 'kepala_sekolah'), [reportData]);
    const filteredReports = useMemo(() => reportData.filter(report => (roleFilter === 'all' || report.role === roleFilter) && report.name.toLowerCase().includes(searchTerm.toLowerCase())), [reportData, roleFilter, searchTerm]);

    const handleDownloadExcel = () => {
        if (!filteredReports.length) return;
        const kopSurat = [
            ['PEMERINTAH KABUPATEN MANGGARAI'],
            ['DINAS PENDIDIKAN PEMUDA DAN OLAHRAGA'],
            ['SMP NEGERI 5 LANGKE REMBONG'],
            ['Alamat: Mando, Kelurahan compang carep, Kecamatan Langke Rembong'],
            [],
            ['LAPORAN KEHADIRAN'],
            [`Periode: ${monthName}`],
            []
        ];
        const tableHeaders = ['No', 'Nama', 'NIP', 'Status', 'Hadir', 'Izin', 'Sakit', 'Alpa', 'Persen'];
        const tableBody = filteredReports.map(item => [
            item.no,
            item.name,
            item.nip,
            item.position,
            item.totalHadir,
            item.totalIzin,
            item.totalSakit,
            item.totalAlpa,
            item.persentase
        ]);

        const signature = [
            [], [],
            [null, null, null, null, null, null, null, `Mando, ${format(new Date(), 'd MMMM yyyy', { locale: id })}`],
            [null, null, null, null, null, null, null, 'Mengetahui,'],
            [null, null, null, null, null, null, null, 'Kepala Sekolah'],
            [], [],
            [null, null, null, null, null, null, null, principal ? principal.name : '(...................................)'],
            [null, null, null, null, null, null, null, principal?.nip ? `NIP. ${principal.nip}` : '']
        ];
        
        const finalData = [...kopSurat, tableHeaders, ...tableBody, ...signature];
        const worksheet = XLSX.utils.aoa_to_sheet(finalData);
        
        worksheet['!cols'] = [
            { wch: 4 }, { wch: 35 }, { wch: 22 }, { wch: 12 }, 
            { wch: 8 }, { wch: 8 }, { wch: 8 }, { wch: 8 }, { wch: 10 }
        ];

        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, "Ringkasan Kehadiran");
        XLSX.writeFile(workbook, `Laporan Kehadiran Bulan ${monthName}.xlsx`);
    };

    const handleDownloadPdf = async () => {
        if (!filteredReports.length) return;
        const { jsPDF } = await import('jspdf');
        const autoTable = (await import('jspdf-autotable')).default;
        const doc = new jsPDF();
        
        let startY = addReportHeader(doc);
        const pageWidth = doc.internal.pageSize.getWidth();
        doc.setFont('times', 'bold');
        doc.setFontSize(12);
        doc.text('LAPORAN KEHADIRAN', pageWidth / 2, startY, { align: 'center' });
        startY += 6;
        doc.setFont('times', 'normal');
        doc.text(`Periode: ${monthName}`, pageWidth / 2, startY, { align: 'center' });
        startY += 12;

        autoTable(doc, {
            startY,
            head: [['No', 'Nama', 'NIP', 'Status', 'Hadir', 'Izin', 'Sakit', 'Alpa', 'Persen']],
            body: filteredReports.map(item => [
                item.no, item.name, item.nip, item.position,
                item.totalHadir,
                item.totalIzin,
                item.totalSakit,
                item.totalAlpa, 
                item.persentase,
            ]),
            theme: 'grid',
            styles: { fontSize: 9.3, font: 'times', cellPadding: 2 }, 
            headStyles: { fillColor: [41, 128, 185], textColor: 255, fontStyle: 'bold', fontSize: 9.3 },
            columnStyles: { 
                0: { cellWidth: 8, halign: 'center' }, 1: { cellWidth: 52 }, 2: { cellWidth: 37 },
                3: { cellWidth: 18 }, 4: { cellWidth: 13, halign: 'center' }, 5: { cellWidth: 13, halign: 'center' },
                6: { cellWidth: 13, halign: 'center' }, 7: { cellWidth: 13, halign: 'center' }, 8: { cellWidth: 15, halign: 'center' },
            },
        });

        const finalY = (doc as any).lastAutoTable.finalY;
        addSignatureBlock(doc, finalY + 10, principal);
        
        addFooter(doc);
        
        doc.save(`Laporan Kehadiran Bulan ${monthName}.pdf`);
    };

    const handleDownloadUserPdf = async (targetUser: ReportRowData) => {
        if (!firestore || !schoolConfigData) return;
        const { jsPDF } = await import('jspdf');
        const autoTable = (await import('jspdf-autotable')).default;
        const doc = new jsPDF();
        
        try {
            const reportDetails = await fetchUserMonthlyReportData(firestore, targetUser.uid, currentMonth, schoolConfigData, monthlyConfigData);
            
            let startY = addReportHeader(doc);
            const pageWidth = doc.internal.pageSize.getWidth();
            doc.setFont('times', 'bold');
            doc.setFontSize(12);
            doc.text('LAPORAN KEHADIRAN', pageWidth / 2, startY, { align: 'center' });
            startY += 6;
            doc.setFont('times', 'normal');
            doc.text(`Periode: ${monthName}`, pageWidth / 2, startY, { align: 'center' });
            startY += 12;
            doc.setFontSize(10);
            doc.text('Nama', 14, startY); doc.text(`: ${targetUser.name}`, 55, startY);
            doc.text('NIP', 14, startY + 6); doc.text(`: ${targetUser.nip || '-'}`, 55, startY + 6);
            doc.text('Status Kepegawaian', 14, startY + 12); doc.text(`: ${targetUser.position || '-'}`, 55, startY + 12);
            startY += 20;

            autoTable(doc, {
                startY,
                head: [['No', 'Tanggal', 'Jam Masuk', 'Jam Pulang', 'Status', 'Keterangan']],
                body: reportDetails.map((d, i) => [
                    i + 1, safeFormat(d.date, 'E, dd/MM/yy', { locale: id }),
                    safeFormat(d.checkInTime, 'HH:mm'), safeFormat(d.checkOutTime, 'HH:mm'),
                    d.status, d.keterangan || '-'
                ]),
                theme: 'grid',
                styles: { fontSize: 9.5, font: 'times', cellPadding: 2 },
                headStyles: { fillColor: [41, 128, 185], textColor: 255, fontStyle: 'bold', fontSize: 9.5, font: 'times' },
            });

            const finalY = (doc as any).lastAutoTable.finalY;
            addSignatureBlock(doc, finalY + 10, principal);

            addFooter(doc);
            
            doc.save(`Laporan Kehadiran ${targetUser.name} - ${monthName}.pdf`);
        } catch (e) { console.error("Failed to generate user PDF:", e); }
    };
    
    const handleDownloadUserExcel = async (targetUser: ReportRowData) => {
        if (!firestore || !schoolConfigData) return;
        try {
            const reportDetails = await fetchUserMonthlyReportData(firestore, targetUser.uid, currentMonth, schoolConfigData, monthlyConfigData);
            const kopSurat = [['PEMERINTAH KABUPATEN MANGGARAI'], ['DINAS PENDIDIKAN PEMUDA DAN OLAHRAGA'], ['SMP NEGERI 5 LANGKE REMBONG'], ['Alamat: Mando, Kelurahan compang carep, Kecamatan Langke Rembong'], [], ['LAPORAN KEHADIRAN'], [`Periode: ${monthName}`], []];
            const userInfo = [['Nama', `: ${targetUser.name}`], ['NIP', `: ${targetUser.nip || '-'}`], ['Status Kepegawaian', `: ${targetUser.position || '-'}`], []];
            const tableHeaders = ['No', 'Tanggal', 'Jam Masuk', 'Jam Pulang', 'Status', 'Keterangan'];
            
            const tableBody = reportDetails.map((d, i) => [
                i + 1,
                safeFormat(d.date, 'E, dd/MM/yy', { locale: id }),
                safeFormat(d.checkInTime, 'HH:mm'),
                safeFormat(d.checkOutTime, 'HH:mm'),
                d.status,
                d.keterangan || '-'
            ]);

            const signature = [[], [], [null, null, null, null, `Mando, ${format(new Date(), 'd MMMM yyyy', { locale: id })}`], [null, null, null, null, 'Mengetahui,'], [null, null, null, null, 'Kepala Sekolah'], [], [], [null, null, null, null, principal ? principal.name : '(...................................)'], [null, null, null, null, principal?.nip ? `NIP. ${principal.nip}` : '']];
            const finalData = [...kopSurat, ...userInfo, tableHeaders, ...tableBody, ...signature];
            const worksheet = XLSX.utils.aoa_to_sheet(finalData);
            const workbook = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(workbook, worksheet, "Detail Kehadiran");
            XLSX.writeFile(workbook, `Laporan Kehadiran ${targetUser.name} - ${monthName}.xlsx`);
        } catch (e) { console.error("Failed to generate user Excel:", e); }
    };

    const changeMonth = (amount: number) => setCurrentMonth(prev => new Date(prev.getFullYear(), prev.getMonth() + amount, 1));
    
    const handleEditClick = (userToEdit: ReportRowData) => { 
        setEditingUser(userToEdit); 
        setIsEditModalOpen(true); 
    };
    const handleCloseModal = () => { 
        setIsEditModalOpen(false); 
        setEditingUser(null); 
        setRefetchIndex(prev => prev + 1);
    };
    
    const isLoading = isReportLoading || isUserLoading || isConfigLoading || isMonthlyConfigLoading;

    if (isUserLoading) return <PageWrapper><div className="p-6"><Skeleton className="h-40 w-full" /></div></PageWrapper>;
    if (!user) return null;
    if (!['admin', 'kepala_sekolah'].includes(user.role)) return <PageWrapper><div className="p-4"><Alert variant="destructive"><AlertCircle className="h-4 w-4" /><AlertTitle>Akses Ditolak</AlertTitle><AlertDescription>Anda tidak memiliki izin untuk mengakses halaman ini.</AlertDescription></Alert></div></PageWrapper>;

    return (
        <PageWrapper>
            {isEditModalOpen && editingUser && (
                <EditAttendanceModal 
                    user={editingUser} 
                    month={currentMonth} 
                    isOpen={isEditModalOpen} 
                    onClose={handleCloseModal} 
                    currentUser={user}
                    schoolConfig={schoolConfigData}
                    monthlyConfig={monthlyConfigData}
                />
            )}
            
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6">
                <div>
                    <h1 className="text-2xl font-bold tracking-tight">Laporan Ringkasan Kehadiran</h1>
                    <p className="text-muted-foreground">Ringkasan kehadiran bulanan untuk seluruh personil sekolah.</p>
                </div>
                {user.role === 'admin' && (
                    <DropdownMenu>
                        <DropdownMenuTrigger asChild><Button><Download className="mr-2 h-4 w-4" />Unduh Laporan</Button></DropdownMenuTrigger>
                        <DropdownMenuContent>
                            <DropdownMenuItem onClick={handleDownloadExcel} disabled={isLoading}><FileSpreadsheet className="mr-2 h-4 w-4"/>Unduh Excel</DropdownMenuItem>
                            <DropdownMenuItem onClick={handleDownloadPdf} disabled={isLoading}><FileText className="mr-2 h-4 w-4"/>Unduh PDF</DropdownMenuItem>
                        </DropdownMenuContent>
                    </DropdownMenu>
                )}
            </div>

            <div className="flex flex-col sm:flex-row justify-between items-center gap-4 mb-4">
                <div className="flex items-center gap-2">
                     <Button variant="outline" size="icon" onClick={() => setCurrentMonth(prev => subMonths(prev, 1))} disabled={isLoading}>
                        <ChevronLeft className="h-4 w-4" />
                    </Button>
                    <span className="w-36 text-center font-semibold">{monthName}</span>
                    <Button variant="outline" size="icon" onClick={() => setCurrentMonth(prev => addMonths(prev, 1))} disabled={isSameMonth(currentMonth, new Date()) || isLoading}>
                        <ChevronRight className="h-4 w-4" />
                    </Button>
                    <Button variant="outline" size="icon" onClick={() => setRefetchIndex(prev => prev + 1)} disabled={isLoading} aria-label="Muat Ulang Data">
                        {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                    </Button>
                </div>
                <div className="flex flex-col sm:flex-row items-center gap-2 w-full sm:w-auto">
                    <Select value={roleFilter} onValueChange={setRoleFilter}><SelectTrigger className="w-full sm:w-[180px]"><SelectValue placeholder="Filter berdasarkan peran" /></SelectTrigger><SelectContent><SelectItem value="all">Semua Peran</SelectItem><SelectItem value="guru">Guru</SelectItem><SelectItem value="pegawai">Pegawai</SelectItem><SelectItem value="kepala_sekolah">Kepala Sekolah</SelectItem></SelectContent></Select>
                    <Input type="search" placeholder="Cari berdasarkan nama..." className="w-full sm:w-[250px]" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
                </div>
            </div>

            <Card className="w-full">
                <CardContent className="p-0">
                    <div className="overflow-x-auto">
                         {isLoading ? (
                            <div className="p-4 space-y-3">{[...Array(15)].map((_, i) => <Skeleton key={i} className="h-8 w-full" />)}</div>
                        ) : (
                            <Table>
                                <TableHeader>
                                    <TableRow className="bg-primary text-primary-foreground hover:bg-primary/90">
                                        <TableHead className="w-[50px] text-white">No</TableHead>
                                        <TableHead className="text-white">Nama</TableHead>
                                        <TableHead className="text-white">NIP</TableHead>
                                        <TableHead className="text-white">Status Kepegawaian</TableHead>
                                        <TableHead className="text-center text-white">Hadir</TableHead>
                                        <TableHead className="text-center text-white">Izin</TableHead>
                                        <TableHead className="text-center text-white">Sakit</TableHead>
                                        <TableHead className="text-center text-white">Alpa</TableHead>
                                        <TableHead className="text-center text-white">Persentase</TableHead>
                                        {user.role === 'admin' && (
                                            <>
                                                <TableHead className="w-[50px] text-center text-white">Opsi</TableHead>
                                                <TableHead className="w-[50px] text-center text-white">Aksi</TableHead>
                                            </>
                                        )}
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {filteredReports.length > 0 ? filteredReports.map((item) => (
                                        <TableRow key={item.uid}>
                                            <TableCell>{item.no}</TableCell>
                                            <TableCell className="font-medium">{item.name}</TableCell>
                                            <TableCell>{item.nip}</TableCell>
                                            <TableCell>{item.position}</TableCell>
                                            <TableCell className="text-center">{item.totalHadir}</TableCell>
                                            <TableCell className="text-center">{item.totalIzin}</TableCell>
                                            <TableCell className="text-center">{item.totalSakit}</TableCell>
                                            <TableCell className="text-center">{item.totalAlpa}</TableCell>
                                            <TableCell className="text-center font-semibold">{item.persentase}</TableCell>
                                            {user.role === 'admin' && (
                                                <>
                                                    <TableCell className="text-center">
                                                        <DropdownMenu>
                                                            <DropdownMenuTrigger asChild><Button variant="ghost" size="icon" disabled={isLoading}><Download className="h-4 w-4" /></Button></DropdownMenuTrigger>
                                                            <DropdownMenuContent>
                                                                <DropdownMenuItem onClick={() => handleDownloadUserPdf(item)}><FileText className="mr-2 h-4 w-4"/>Unduh PDF</DropdownMenuItem>
                                                                <DropdownMenuItem onClick={() => handleDownloadUserExcel(item)}><FileSpreadsheet className="mr-2 h-4 w-4"/>Unduh Excel</DropdownMenuItem>
                                                            </DropdownMenuContent>
                                                        </DropdownMenu>
                                                    </TableCell>
                                                    <TableCell className="text-center">
                                                        <DropdownMenu>
                                                            <DropdownMenuTrigger asChild><Button variant="ghost" size="icon" disabled={isLoading}><Edit className="h-4 w-4" /></Button></DropdownMenuTrigger>
                                                            <DropdownMenuContent>
                                                                <DropdownMenuItem onClick={() => handleEditClick(item)}><Edit className="mr-2 h-4 w-4"/>Edit Kehadiran</DropdownMenuItem>
                                                                <DropdownMenuItem asChild><Link href={`/dashboard/laporan/${item.uid}`}><Eye className="mr-2 h-4 w-4" />Lihat Detail</Link></DropdownMenuItem>
                                                            </DropdownMenuContent>
                                                        </DropdownMenu>
                                                    </TableCell>
                                                </>
                                            )}
                                        </TableRow>
                                    )) : (
                                        <TableRow><TableCell colSpan={user.role === 'admin' ? 11 : 9} className="h-24 text-center">{error ? 'Gagal memuat data.' : 'Tidak ada data untuk ditampilkan.'}</TableCell></TableRow>
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
