'use client';
import { useState, useEffect, useMemo } from 'react';
import { useFirestore, useUser } from '@/firebase';
import { collection, query, getDocs, where } from 'firebase/firestore';
import { format, startOfMonth, endOfMonth } from 'date-fns';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Loader2, UserPlus, Download } from 'lucide-react';
import Link from 'next/link';
import { useSettings } from '@/contexts/SettingsContext';
import { useDebounce } from '@/hooks/use-debounce';

// --- TYPE DEFINITIONS ---
interface UserData {
  uid: string;
  displayName: string;
  nip?: string;
  status?: string; // e.g., 'PNS', 'Honorer'
  role: string;
}

interface AttendanceStats {
  present: number;
  sick: number;
  permission: number;
  absent: number;
}

// =======================================================================================
// Staf (Staff List) Page Component
// =======================================================================================
export default function StafPage() {
  const firestore = useFirestore();
  const { isUserLoading: isAuthLoading } = useUser();
  const [users, setUsers] = useState<UserData[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [roleFilter, setRoleFilter] = useState('all');
  const [selectedMonth, setSelectedMonth] = useState(format(new Date(), 'yyyy-MM'));

  const debouncedSearchTerm = useDebounce(searchTerm, 300);

  // Get settings and configs from the centralized context
  const {
    schoolConfig, 
    monthlyConfigs, 
    subscribeToMonth, 
    isMonthlyConfigLoading 
  } = useSettings();

  const monthId = selectedMonth;
  const currentMonthlyConfig = monthlyConfigs[monthId];

  // State to hold the calculated attendance stats for each user
  const [attendanceStats, setAttendanceStats] = useState<Map<string, AttendanceStats>>(new Map());

  // Subscribe to the selected month's config
  useEffect(() => {
    subscribeToMonth(monthId);
  }, [monthId, subscribeToMonth]);

  // Fetch all users (teachers and staff)
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

  // Logic to calculate attendance for all users on this page
  useEffect(() => {
    if (users.length === 0 || !firestore || !currentMonthlyConfig || !schoolConfig) return;

    const calculateAllStats = async () => {
      setIsLoading(true);
      const [year, month] = selectedMonth.split('-').map(Number);
      const startDate = startOfMonth(new Date(year, month - 1));
      const endDate = endOfMonth(startDate);

      const recurringOffDays = new Set(schoolConfig.offDays ?? []);
      const holidays = new Set(currentMonthlyConfig.holidays ?? []);

      const newStats = new Map<string, AttendanceStats>();

      await Promise.all(users.map(async (user) => {
        const attendanceRef = collection(firestore, `users/${user.uid}/attendance`);
        const q = query(attendanceRef, where('date', '>=', format(startDate, 'yyyy-MM-dd')), where('date', '<=', format(endDate, 'yyyy-MM-dd')));
        const attendanceSnapshot = await getDocs(q);
        const recordsMap = new Map(attendanceSnapshot.docs.map(doc => [doc.id, doc.data()]));

        const stats: AttendanceStats = { present: 0, sick: 0, permission: 0, absent: 0 };

        let currentDay = new Date(startDate);
        while (currentDay <= endDate) {
          const dayString = format(currentDay, 'yyyy-MM-dd');
          const dayOfWeek = currentDay.getDay();

          if (recurringOffDays.has(dayOfWeek) || holidays.has(dayString)) {
            currentDay.setDate(currentDay.getDate() + 1);
            continue; // Skip non-workdays
          }

          const record = recordsMap.get(dayString);
          switch (record?.status) {
            case 'present':
            case 'late':
              stats.present += 1;
              break;
            case 'sick':
              stats.sick += 1;
              break;
            case 'permission':
              stats.permission += 1;
              break;
            case 'absent':
              stats.absent += 1;
              break;
            default:
              stats.absent += 1; // Count as absent if no record on a workday
              break;
          }
          currentDay.setDate(currentDay.getDate() + 1);
        }
        newStats.set(user.uid, stats);
      }));

      setAttendanceStats(newStats);
      setIsLoading(false);
    };

    calculateAllStats();
  }, [users, selectedMonth, firestore, currentMonthlyConfig, schoolConfig]);

  const filteredUsers = useMemo(() => {
    return users
      .filter(user => 
        (roleFilter === 'all' || user.role === roleFilter) &&
        (user.displayName.toLowerCase().includes(debouncedSearchTerm.toLowerCase()) ||
         (user.nip && user.nip.includes(debouncedSearchTerm)))
      )
      .sort((a, b) => a.displayName.localeCompare(b.displayName));
  }, [users, roleFilter, debouncedSearchTerm]);

  const effectiveWorkDays = currentMonthlyConfig?.workDays ?? 0;
  
  const isPageLoading = isLoading || isAuthLoading || isMonthlyConfigLoading(monthId);

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
            <SelectTrigger className="w-full md:w-[180px]"><SelectValue /></SelectTrigger>
            <SelectContent>
                {Array.from({ length: 12 }, (_, i) => {
                    const d = new Date();
                    d.setMonth(d.getMonth() - i);
                    return format(d, 'yyyy-MM');
                }).map(month => (
                    <SelectItem key={month} value={month}>{format(new Date(`${month}-02`), 'MMMM yyyy')}</SelectItem>
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
              <TableHead>Status</TableHead>
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
                    <TableCell>{user.status || '-'}</TableCell>
                    <TableCell className="text-center">{stats.present}</TableCell>
                    {/* THE FIX: Ensure the correct data is in the correct column */}
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
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
