'use client';
import { useState, useEffect, useMemo, useCallback } from 'react';
import { useFirestore, useUser } from '@/firebase';
import { collection, query, getDocs, where } from 'firebase/firestore';
import { format, startOfMonth, endOfMonth, eachDayOfInterval } from 'date-fns';
import { id } from 'date-fns/locale'; // FINAL FIX: Added missing import for Indonesian locale
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Loader2, UserPlus } from 'lucide-react';
import Link from 'next/link';
import { useSettings } from '@/contexts/SettingsContext';
import { useDebounce } from '@/hooks/use-debounce';

// --- TYPE DEFINITIONS ---
interface UserData {
  uid: string;
  displayName: string;
  nip?: string;
  status?: string;
  role: string;
}

interface AttendanceStats {
  present: number;
  sick: number;
  permission: number;
  absent: number;
}

// =======================================================================================
// Staf (Staff List) Page Component - REWRITTEN for new SettingsContext
// =======================================================================================
export default function StafPage() {
  const firestore = useFirestore();
  const { isUserLoading: isAuthLoading } = useUser();
  const [users, setUsers] = useState<UserData[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isCalculatingStats, setIsCalculatingStats] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [roleFilter, setRoleFilter] = useState('all');
  const [selectedMonth, setSelectedMonth] = useState(format(new Date(), 'yyyy-MM'));

  const debouncedSearchTerm = useDebounce(searchTerm, 300);

  const { schoolConfig, holidays, isSettingsLoading } = useSettings();

  const [attendanceStats, setAttendanceStats] = useState<Map<string, AttendanceStats>>(new Map());

  useEffect(() => {
    if (!firestore) return;
    const fetchUsers = async () => {
      setIsLoading(true);
      const usersRef = collection(firestore, 'users');
      const q = query(usersRef, where('role', 'in', ['teacher', 'staff']));
      const querySnapshot = await getDocs(q);
      const userList = querySnapshot.docs.map(doc => ({ ...doc.data(), uid: doc.id })) as UserData[];
      setUsers(userList);
      setIsLoading(false);
    };
    fetchUsers();
  }, [firestore]);

  const effectiveWorkDays = useMemo(() => {
    if (!schoolConfig) return 0;

    const [year, month] = selectedMonth.split('-').map(Number);
    const monthStartDate = startOfMonth(new Date(year, month - 1));
    const monthEndDate = endOfMonth(monthStartDate);
    const allDays = eachDayOfInterval({ start: monthStartDate, end: monthEndDate });

    const recurringOffDays = new Set(schoolConfig.offDays ?? []);
    
    const workDays = allDays.filter(day => {
        const dayString = format(day, 'yyyy-MM-dd');
        const dayOfWeek = day.getDay();
        return !recurringOffDays.has(dayOfWeek) && !holidays.has(dayString);
    });

    return workDays.length;
  }, [selectedMonth, schoolConfig, holidays]);

  const calculateAllStats = useCallback(async () => {
    if (users.length === 0 || !firestore || !schoolConfig) return;

    setIsCalculatingStats(true);
    const [year, month] = selectedMonth.split('-').map(Number);
    const startDate = startOfMonth(new Date(year, month - 1));
    const endDate = endOfMonth(startDate);

    const recurringOffDays = new Set(schoolConfig.offDays ?? []);
    const newStats = new Map<string, AttendanceStats>();

    const workDaysInMonth = new Set<string>();
    let tempDate = new Date(startDate);
    while(tempDate <= endDate) {
        const dayString = format(tempDate, 'yyyy-MM-dd');
        if(!recurringOffDays.has(tempDate.getDay()) && !holidays.has(dayString)) {
            workDaysInMonth.add(dayString);
        }
        tempDate.setDate(tempDate.getDate() + 1);
    }

    await Promise.all(users.map(async (user) => {
      const attendanceRef = collection(firestore, `users/${user.uid}/attendanceRecords`);
      const q = query(attendanceRef, where('checkInTime', '>=', startDate), where('checkInTime', '<', endDate));
      const attendanceSnapshot = await getDocs(q);

      const userRecords = new Map(attendanceSnapshot.docs.map(doc => [format(doc.data().checkInTime.toDate(), 'yyyy-MM-dd'), doc.data()]));
      
      const stats: AttendanceStats = { present: 0, sick: 0, permission: 0, absent: 0 };
      
      workDaysInMonth.forEach(dayString => {
        const record = userRecords.get(dayString);
        switch (record?.status) {
          case 'present':
          case 'late':
            stats.present++;
            break;
          case 'sick':
            stats.sick++;
            break;
          case 'permission':
            stats.permission++;
            break;
          default:
            stats.absent++;
            break;
        }
      });

      newStats.set(user.uid, stats);
    }));

    setAttendanceStats(newStats);
    setIsCalculatingStats(false);
  }, [users, selectedMonth, firestore, schoolConfig, holidays]);

  useEffect(() => {
      calculateAllStats();
  }, [calculateAllStats]);


  const filteredUsers = useMemo(() => {
    return users
      .filter(user => 
        (roleFilter === 'all' || user.role === roleFilter) &&
        (user.displayName.toLowerCase().includes(debouncedSearchTerm.toLowerCase()) ||
         (user.nip && user.nip.includes(debouncedSearchTerm)))
      )
      .sort((a, b) => a.displayName.localeCompare(b.displayName));
  }, [users, roleFilter, debouncedSearchTerm]);
  
  const isPageLoading = isLoading || isAuthLoading || isSettingsLoading;

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Manajemen Guru & Staf</h1>
          <p className="text-sm text-muted-foreground">Kelola data, peran, dan lihat rekap absensi singkat.</p>
        </div>
        <Link href="/dashboard/admin/staf/tambah">
          <Button><UserPlus className="mr-2 h-4 w-4" /> Tambah Pengguna</Button>
        </Link>
      </div>

      <div className="flex flex-col md:flex-row gap-2">
        <Input 
          placeholder="Cari nama atau NIP..." 
          className="w-full md:max-w-sm"
          value={searchTerm}
          onChange={e => setSearchTerm(e.target.value)} 
        />
        <Select value={roleFilter} onValueChange={setRoleFilter}>
          <SelectTrigger className="w-full md:w-[180px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Semua Peran</SelectItem>
            <SelectItem value="teacher">Guru</SelectItem>
            <SelectItem value="staff">Staf</SelectItem>
          </SelectContent>
        </Select>
        <Select value={selectedMonth} onValueChange={setSelectedMonth}>
            <SelectTrigger className="w-full md:w-[200px]"><SelectValue /></SelectTrigger>
            <SelectContent>
                {Array.from({ length: 12 }, (_, i) => {
                    const d = new Date();
                    d.setMonth(d.getMonth() - i);
                    return format(d, 'yyyy-MM');
                }).map(month => (
                    <SelectItem key={month} value={month}>{format(new Date(`${month}-02`), 'MMMM yyyy', { locale: id })}</SelectItem>
                ))}
            </SelectContent>
        </Select>
      </div>

      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>No</TableHead>
              <TableHead>Nama</TableHead>
              <TableHead>NIP</TableHead>
              <TableHead>Peran</TableHead>
              <TableHead className="text-center">Hadir</TableHead>
              <TableHead className="text-center">Izin</TableHead>
              <TableHead className="text-center">Sakit</TableHead>
              <TableHead className="text-center">Alpa</TableHead>
              <TableHead className="text-center">Persentase</TableHead>
              <TableHead className="text-right">Aksi</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isPageLoading ? (
              <TableRow><TableCell colSpan={10} className="h-24 text-center"><Loader2 className="mx-auto h-8 w-8 animate-spin" /></TableCell></TableRow>
            ) : filteredUsers.length > 0 ? (
              filteredUsers.map((user, index) => {
                const stats = attendanceStats.get(user.uid) ?? { present: 0, sick: 0, permission: 0, absent: 0 };
                const percentage = effectiveWorkDays > 0 ? ((stats.present / effectiveWorkDays) * 100).toFixed(1) : '0.0';
                return (
                  <TableRow key={user.uid}>
                    <TableCell>{index + 1}</TableCell>
                    <TableCell className="font-medium">{user.displayName}</TableCell>
                    <TableCell>{user.nip || '-'}</TableCell>
                    <TableCell>{user.role}</TableCell>
                    <TableCell className="text-center">{stats.present}</TableCell>
                    <TableCell className="text-center">{stats.permission}</TableCell>
                    <TableCell className="text-center">{stats.sick}</TableCell>
                    <TableCell className="text-center">{stats.absent}</TableCell>
                    <TableCell className="text-center font-semibold">{percentage}%</TableCell>
                    <TableCell className="text-right">
                        <Button variant="outline" size="sm" asChild>
                            <Link href={`/dashboard/admin/staf/${user.uid}`}>Detail</Link>
                        </Button>
                    </TableCell>
                  </TableRow>
                );
              })
            ) : (
              <TableRow><TableCell colSpan={10} className="h-24 text-center">Tidak ada data untuk ditampilkan.</TableCell></TableRow>
            )}
            {isCalculatingStats && !isPageLoading && (
                 <TableRow><TableCell colSpan={10} className="h-24 text-center"><Loader2 className="mx-auto h-8 w-8 animate-spin" /> <span className='mt-2'>Menghitung rekapitulasi...</span></TableCell></TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
