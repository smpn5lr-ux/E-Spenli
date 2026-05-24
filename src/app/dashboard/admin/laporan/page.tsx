'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { format, startOfMonth, addMonths, subMonths, isSameMonth } from 'date-fns';
import { id } from 'date-fns/locale';
import { useFirestore, useUser } from '@/firebase';
import { collection, getDocs, query, doc, onSnapshot } from 'firebase/firestore';
import { calculateMultipleUserStats } from '@/lib/attendance/calculateStats';
import { useSettings } from '@/contexts/SettingsContext'; // IMPORT THE CENTRAL CONTEXT

// UI Components
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Tooltip, TooltipProvider, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { ChevronLeft, ChevronRight, RefreshCw, Edit, Search } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

interface UserStat {
  userId: string;
  name: string;
  nip: string;
  role: string;
  totalHadir: number;
  totalIzin: number;
  totalSakit: number;
  totalDinas: number;
  totalAlpa: number;
  totalScore: number;
  maxScore: number;
  percentage: number;
}

// The Final, Architecturally Sound Solution
export default function AdminLaporanPage() {
  const { user } = useUser();
  const firestore = useFirestore();
  const router = useRouter();
  const { toast } = useToast();
  const { isSettingsLoading } = useSettings(); // Use the context to know when settings are ready

  const [currentMonth, setCurrentMonth] = useState(() => startOfMonth(new Date()));
  const [stats, setStats] = useState<UserStat[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [roleFilter, setRoleFilter] = useState('all');

  const fetchStats = useCallback(async () => {
    if (!firestore || !user) return;
    setIsLoading(true);
    try {
      const usersSnapshot = await getDocs(query(collection(firestore, 'users')));
      const users = usersSnapshot.docs
        .map(doc => ({ id: doc.id, ...doc.data() }))
        .filter(u => (u as any).role !== 'admin');
      // This function now relies on the accurate data propagated by the SettingsContext
      const userStats = await calculateMultipleUserStats(firestore, users, currentMonth);
      setStats(userStats as UserStat[]);
    } catch (error) {
      console.error("Error fetching summary report:", error);
      toast({ title: "Gagal Memuat Laporan", description: `Terjadi kesalahan: ${error instanceof Error ? error.message : 'Unknown error'}`, variant: "destructive" });
    } finally {
       setIsLoading(false);
    }
  }, [firestore, user, currentMonth, toast]);

  // This is now the single source of truth for reactivity.
  // It listens for month changes and for the settings to be loaded.
  useEffect(() => {
    // Don't fetch until both Firebase and global settings are ready.
    if (isSettingsLoading || !firestore || !user) return;

    fetchStats();

    // Real-time listener for the specific month's config. This is the core of the solution.
    const monthId = format(currentMonth, 'yyyy-MM');
    const monthlyConfigRef = doc(firestore, 'monthlyConfigs', monthId);

    const unsubscribe = onSnapshot(monthlyConfigRef, (doc) => {
        console.log("Report Page: Detected a change in monthly config. Refetching stats.");
        toast({ title: 'Data Konfigurasi Berubah', description: 'Laporan sedang diperbarui secara otomatis...'});
        fetchStats();
    }, (error) => {
        console.error("Report page listener failed:", error);
    });

    // Clean up the listener when the component unmounts or the month changes.
    return () => unsubscribe();

  }, [currentMonth, user, firestore, isSettingsLoading, fetchStats, toast]);


  const filteredStats = useMemo(() => {
    return stats.filter(stat => 
      (stat.name?.toLowerCase().includes(searchTerm.toLowerCase()) ?? true) &&
      (roleFilter === 'all' || stat.role === roleFilter)
    );
  }, [stats, searchTerm, roleFilter]);

  const handleMonthChange = (direction: 'next' | 'prev') => {
    setCurrentMonth(current => direction === 'next' ? addMonths(current, 1) : subMonths(current, 1));
  };

  const handleEdit = (userId: string) => {
    const url = `/dashboard/admin/laporan-guru/${userId}?month=${format(currentMonth, 'yyyy-MM')}`;
    router.push(url);
  };

  // The combined loading state is now simpler and more reliable
  const isPageLoading = isLoading || isSettingsLoading;

  return (
    <div className="flex-1 pt-4 pb-24 md:p-8">
      <Card>
        <CardHeader className="px-4 md:px-6 pt-4 md:pt-6">
          <CardTitle>Laporan Ringkasan Kehadiran</CardTitle>
          <CardDescription>Ringkasan kehadiran bulanan untuk seluruh personil sekolah. Data diperbarui secara real-time.</CardDescription>
        </CardHeader>
        <CardContent className="p-4 md:p-6 space-y-4">
          
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
              <div className="flex items-center gap-2 w-full sm:w-auto">
                  <Button variant="outline" size="icon" onClick={() => handleMonthChange('prev')}><ChevronLeft className="h-4 w-4" /></Button>
                  <span className="w-full text-center font-semibold capitalize">{format(currentMonth, 'MMMM yyyy', { locale: id })}</span>
                  <Button variant="outline" size="icon" onClick={() => handleMonthChange('next')} disabled={isSameMonth(currentMonth, new Date())}><ChevronRight className="h-4 w-4" /></Button>
              </div>
              <Button onClick={() => fetchStats()} disabled={isPageLoading} className="w-full sm:w-auto">
                  <RefreshCw className={`mr-2 h-4 w-4 ${isPageLoading ? 'animate-spin' : ''}`} />
                  Segarkan
              </Button>
          </div>

          <div className="flex flex-col sm:flex-row gap-4">
              <Select value={roleFilter} onValueChange={setRoleFilter}>
                  <SelectTrigger className="w-full sm:w-[200px]">
                      <SelectValue placeholder="Semua Peran" />
                  </SelectTrigger>
                  <SelectContent>
                      <SelectItem value="all">Semua Peran</SelectItem>
                      <SelectItem value="kepala_sekolah">Kepala Sekolah</SelectItem>
                      <SelectItem value="guru">Guru</SelectItem>
                      <SelectItem value="pegawai">Pegawai</SelectItem>
                  </SelectContent>
              </Select>
              <div className="relative flex-grow">
                  <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input placeholder="Cari berdasarkan nama..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="w-full pl-8" />
              </div>
          </div>

          <div className="border rounded-md overflow-x-auto">
            <TooltipProvider>
              <Table>
                <TableHeader><TableRow><TableHead>Nama</TableHead><TableHead className="text-center">Hadir</TableHead><TableHead className="text-center">Sakit</TableHead><TableHead className="text-center">Izin</TableHead><TableHead className="text-center">Dinas</TableHead><TableHead className="text-center">Alpa</TableHead><TableHead className="text-center">Persentase</TableHead><TableHead className="text-right">Aksi</TableHead></TableRow></TableHeader>
                <TableBody>
                  {isPageLoading ? (
                    Array.from({ length: 5 }).map((_, i) => (
                      <TableRow key={i}>
                        <TableCell><Skeleton className="h-5 w-3/4" /></TableCell>
                        <TableCell><Skeleton className="h-5 w-1/2 mx-auto" /></TableCell>
                        <TableCell><Skeleton className="h-5 w-1/2 mx-auto" /></TableCell>
                        <TableCell><Skeleton className="h-5 w-1/2 mx-auto" /></TableCell>
                        <TableCell><Skeleton className="h-5 w-1/2 mx-auto" /></TableCell>
                        <TableCell><Skeleton className="h-5 w-1/2 mx-auto" /></TableCell>
                        <TableCell><Skeleton className="h-5 w-1/2 mx-auto" /></TableCell>
                         <TableCell className="w-[120px] text-right"><Skeleton className="h-8 w-24 ml-auto" /></TableCell>
                      </TableRow>
                    ))
                  ) : filteredStats.length > 0 ? (
                    filteredStats.map(stat => (
                      <TableRow key={stat.userId}>
                        <TableCell><div className="font-medium">{stat.name}</div><div className="text-sm text-muted-foreground">NIP: {stat.nip || '-'} | <span className='capitalize'>{stat.role}</span></div></TableCell>
                        <TableCell className="text-center">{stat.totalHadir}</TableCell>
                        <TableCell className="text-center">{stat.totalSakit}</TableCell>
                        <TableCell className="text-center">{stat.totalIzin}</TableCell>
                        <TableCell className="text-center">{stat.totalDinas}</TableCell>
                        <TableCell className="text-center text-destructive font-semibold">{stat.totalAlpa}</TableCell>
                        <TableCell className="text-center font-bold">
                           <Tooltip>
                              <TooltipTrigger asChild>
                                <span className="cursor-help">{stat.percentage.toFixed(1)}%</span>
                              </TooltipTrigger>
                              <TooltipContent>
                                <p className='text-sm'>Perhitungan: <br/> (Total Poin / Hari Efektif) * 100 <br/>{`(${stat.totalScore.toFixed(2)} / ${stat.maxScore}) * 100`}</p>
                              </TooltipContent>
                            </Tooltip>
                        </TableCell>
                        <TableCell className="text-right"><Button variant="outline" size="sm" onClick={() => handleEdit(stat.userId)}><Edit className="h-4 w-4 mr-2"/>Detail</Button></TableCell>
                      </TableRow>
                    ))
                  ) : (
                    <TableRow><TableCell colSpan={8} className="h-32 text-center">Tidak ada data untuk ditampilkan.</TableCell></TableRow>
                  )}
                </TableBody>
              </Table>
            </TooltipProvider>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
