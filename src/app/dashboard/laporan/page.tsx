'use client';
import { useState, useEffect, useMemo, useCallback } from 'react';
import { useFirestore, useUser } from '@/firebase';
import { collection, query, where, getDocs, doc, onSnapshot } from 'firebase/firestore';
import { format, startOfMonth, endOfMonth, eachDayOfInterval, parseISO } from 'date-fns';
import { id } from 'date-fns/locale';
import { useReactToPrint } from 'react-to-print';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Loader2, Printer } from 'lucide-react';
import { useSettings } from '@/contexts/SettingsContext'; // Import the centralized settings hook

interface AttendanceRecord {
  id: string;
  checkInTime?: { toDate: () => Date };
  checkOutTime?: { toDate: () => Date };
  status: string;
}

interface ReportData {
  name: string;
  checkIn: string;
  checkOut: string;
  status: string;
  notes: string;
}

interface UserData {
  uid: string;
  displayName: string;
  role: string;
}

const statusLabels: { [key: string]: string } = {
  present: 'Hadir',
  late: 'Terlambat',
  absent: 'Alpa',
  sick: 'Sakit',
  permission: 'Izin',
  official_duty: 'Tugas Dinas',
  no_check_in: 'Tidak ada Check-in',
  no_check_out: 'Tidak ada Check-out',
};

export default function LaporanPage() {
  const firestore = useFirestore();
  const { user, isUserLoading: isAuthLoading } = useUser();
  const [selectedMonth, setSelectedMonth] = useState(format(new Date(), 'yyyy-MM'));
  const [users, setUsers] = useState<UserData[]>([]);
  const [reportData, setReportData] = useState<Map<string, ReportData[]>>(new Map());
  const [isReportLoading, setIsReportLoading] = useState(false);
  const [isUsersLoading, setIsUsersLoading] = useState(true);
  const printRef = useState<HTMLDivElement>(null)[0];

  // REFACTORED: Use the centralized SettingsContext to get configurations
  const {
    schoolConfig, 
    monthlyConfigs, 
    subscribeToMonth, 
    isMonthlyConfigLoading
  } = useSettings();

  const monthId = selectedMonth;
  const currentMonthlyConfig = monthlyConfigs[monthId];

  // Effect to subscribe to the selected month's configuration
  useEffect(() => {
    subscribeToMonth(monthId);
  }, [monthId, subscribeToMonth]);

  // Effect to fetch all users (teachers and staff)
  useEffect(() => {
    if (!firestore) return;
    const fetchUsers = async () => {
      setIsUsersLoading(true);
      const usersRef = collection(firestore, 'users');
      const q = query(usersRef, where('role', 'in', ['teacher', 'staff']));
      const querySnapshot = await getDocs(q);
      const userList = querySnapshot.docs.map(doc => ({ ...doc.data(), uid: doc.id })) as UserData[];
      setUsers(userList.sort((a,b) => a.displayName.localeCompare(b.displayName)));
      setIsUsersLoading(false);
    };
    fetchUsers();
  }, [firestore]);

  // Main effect to generate the report when users or month changes
  useEffect(() => {
    if (users.length === 0 || !firestore) return;

    const generateReport = async () => {
      setIsReportLoading(true);

      const [year, month] = selectedMonth.split('-').map(Number);
      const startDate = startOfMonth(new Date(year, month - 1));
      const endDate = endOfMonth(startDate);
      const allDays = eachDayOfInterval({ start: startDate, end: endDate });

      const newReportData = new Map<string, ReportData[]>();

      for (const user of users) {
        const userRecords: ReportData[] = [];
        const attendanceRef = collection(firestore, `users/${user.uid}/attendance`);
        
        // This part can be further optimized, but for now we fetch all records for the month.
        const q = query(attendanceRef, where('date', '>=', format(startDate, 'yyyy-MM-dd')), where('date', '<=', format(endDate, 'yyyy-MM-dd')));
        const attendanceSnapshot = await getDocs(q);
        const recordsMap = new Map(attendanceSnapshot.docs.map(doc => [doc.id, doc.data() as AttendanceRecord]));

        for (const day of allDays) {
          const dayString = format(day, 'yyyy-MM-dd');
          const record = recordsMap.get(dayString);

          userRecords.push({
            name: user.displayName,
            checkIn: record?.checkInTime ? format(record.checkInTime.toDate(), 'HH:mm:ss') : '-',
            checkOut: record?.checkOutTime ? format(record.checkOutTime.toDate(), 'HH:mm:ss') : '-',
            status: record?.status ? statusLabels[record.status] || record.status : '-',
            notes: '-', // Placeholder for notes
          });
        }
        newReportData.set(user.uid, userRecords);
      }
      setReportData(newReportData);
      setIsReportLoading(false);
    };

    generateReport();
  }, [users, selectedMonth, firestore]);

  const handlePrint = useReactToPrint({ content: () => printRef });

  const attendanceSummary = useMemo(() => {
    const summary = new Map<string, { present: number; total: number }>();
    if (!currentMonthlyConfig || reportData.size === 0) return summary;

    const effectiveWorkDays = currentMonthlyConfig.workDays ?? 0;

    users.forEach(user => {
      const userData = reportData.get(user.uid);
      if (!userData) {
        summary.set(user.uid, { present: 0, total: effectiveWorkDays });
        return;
      }
      const presentCount = userData.filter(rec => rec.status === statusLabels.present || rec.status === statusLabels.late).length;
      summary.set(user.uid, { present: presentCount, total: effectiveWorkDays });
    });
    return summary;
  }, [reportData, users, currentMonthlyConfig]);

  const isLoading = isAuthLoading || isUsersLoading || isReportLoading || isMonthlyConfigLoading(monthId);

  const monthOptions = Array.from({ length: 12 }, (_, i) => {
    const d = new Date();
    d.setMonth(d.getMonth() - i);
    return format(d, 'yyyy-MM');
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Laporan Kehadiran</h1>
          <p className="text-sm text-muted-foreground">Lihat dan cetak rekapitulasi kehadiran bulanan guru dan staf.</p>
        </div>
        <div className="flex gap-2">
          <Select value={selectedMonth} onValueChange={setSelectedMonth}>
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="Pilih Bulan" />
            </SelectTrigger>
            <SelectContent>
              {monthOptions.map(month => (
                <SelectItem key={month} value={month}>{format(parseISO(`${month}-01`), 'MMMM yyyy', { locale: id })}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button onClick={handlePrint} disabled={isLoading}><Printer className="mr-2 h-4 w-4" />Cetak</Button>
        </div>
      </div>

      {isLoading ? (
        <div className="flex justify-center items-center h-64"><Loader2 className="h-8 w-8 animate-spin" /></div>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>Rekapitulasi Bulan: {format(parseISO(`${selectedMonth}-01`), 'MMMM yyyy', { locale: id })}</CardTitle>
          </CardHeader>
          <CardContent ref={printRef} className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nama</TableHead>
                  <TableHead className="text-center">Hadir</TableHead>
                  <TableHead className="text-center">Hari Efektif</TableHead>
                  <TableHead className="text-center">Persentase</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {users.map(user => {
                  const summary = attendanceSummary.get(user.uid);
                  const present = summary?.present ?? 0;
                  const total = summary?.total ?? 0;
                  const percentage = total > 0 ? ((present / total) * 100).toFixed(1) : '0.0';
                  return (
                    <TableRow key={user.uid}>
                      <TableCell className="font-medium">{user.displayName}</TableCell>
                      <TableCell className="text-center">{present}</TableCell>
                      <TableCell className="text-center">{total}</TableCell>
                      <TableCell className="text-center">{percentage}%</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
