'use client';

import React, { useEffect, useState, useMemo } from 'react';
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from '@/components/ui/table';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useFirestore } from '@/firebase';
import { collection, query, where, getDocs, collectionGroup } from 'firebase/firestore';
import { startOfDay, endOfDay, format } from 'date-fns';
import { Loader2, UserCheck, AlertCircle } from 'lucide-react';

interface AbsentUser {
  no: number;
  name: string;
  nip: string;
  position: string;
  status: 'Alpa' | 'Terlambat' | 'Izin' | 'Sakit';
}

interface UserData {
  id: string;
  name: string;
  nip: string;
  role: string;
  position: string;
}

const AbsentUsersTable = () => {
  const [absentUsers, setAbsentUsers] = useState<AbsentUser[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [indexUrl, setIndexUrl] = useState<string | null>(null);
  const firestore = useFirestore();

  useEffect(() => {
    if (!firestore) {
      setIsLoading(false);
      return;
    }

    const findAbsentUsers = async () => {
      setIsLoading(true);
      setError(null);
      try {
        const todayStr = format(new Date(), 'yyyy-MM-dd');

        const usersQuery = query(collection(firestore, 'users'), where('role', 'in', ['guru', 'pegawai', 'kepala_sekolah']));
        const usersSnap = await getDocs(usersQuery);
        const allStaff: UserData[] = usersSnap.docs.map(doc => ({ id: doc.id, ...doc.data() } as UserData));
        const allStaffIds = allStaff.map(user => user.id);

        const presentUserIds = new Set<string>();
        const onLeaveUserIds = new Set<string>();
        const pendingLateUserIds = new Set<string>();

        // 1. Get users with an attendance record today (checked in OR checked out)
        const attendanceQuery = query(collectionGroup(firestore, 'attendanceRecords'), where('date', '==', todayStr));
        const attendanceSnap = await getDocs(attendanceQuery);
        attendanceSnap.forEach(doc => {
            const userId = doc.ref.parent.parent?.id;
            if(userId && allStaffIds.includes(userId)) {
                presentUserIds.add(userId);
            }
        });

        // 2. Get users with an APPROVED late submission (they are considered present)
        const approvedLateQuery = query(collectionGroup(firestore, 'lateSubmissions'), where('date', '==', todayStr), where('status', '==', 'approved'));
        const approvedLateSnap = await getDocs(approvedLateQuery);
        approvedLateSnap.forEach(doc => {
            const userId = doc.ref.parent.parent?.id;
            if (userId && allStaffIds.includes(userId)) {
                presentUserIds.add(userId);
            }
        });

        // 3. Get users on approved leave
        const todayStart = startOfDay(new Date());
        const leaveQuery = query(collectionGroup(firestore, 'leaveRequests'), where('status', '==', 'approved'), where('startDate', '>=', todayStart));
        const leaveSnap = await getDocs(leaveQuery);
        leaveSnap.forEach(doc => {
            const leave = doc.data();
            const userId = doc.ref.parent.parent?.id;
            const startDate = leave.startDate?.toDate();
            if (userId && allStaffIds.includes(userId) && startDate <= endOfDay(new Date())) {
                onLeaveUserIds.add(userId);
            }
        });

        // 4. Get users with a PENDING late submission to mark them as 'Terlambat'
        const pendingLateQuery = query(collectionGroup(firestore, 'lateSubmissions'), where('date', '==', todayStr), where('status', '==', 'pending'));
        const pendingLateSnap = await getDocs(pendingLateQuery);
        pendingLateSnap.forEach(doc => {
             const userId = doc.ref.parent.parent?.id;
             if (userId && allStaffIds.includes(userId)) {
                pendingLateUserIds.add(userId);
             }
        });

        const usersToDisplay = allStaff
          // Filter out users who are present or on leave
          .filter(user => !presentUserIds.has(user.id) && !onLeaveUserIds.has(user.id))
          .map((user, index) => {
            // If user has a pending late submission, mark as 'Terlambat', otherwise 'Alpa'
            let status: AbsentUser['status'] = pendingLateUserIds.has(user.id) ? 'Terlambat' : 'Alpa';
            
            return {
              no: index + 1,
              name: user.name,
              nip: user.nip || '-',
              position: user.position || user.role.charAt(0).toUpperCase() + user.role.slice(1),
              status,
            };
          })
          .sort((a, b) => {
             if (a.status === 'Alpa' && b.status !== 'Alpa') return 1;
             if (a.status !== 'Alpa' && b.status === 'Alpa') return -1;
             return a.name.localeCompare(b.name);
          });

        setAbsentUsers(usersToDisplay);

      } catch (e: any) {
        console.error("Error finding absent users:", e);
        const msg = e?.message || String(e);
        const m = msg.match(/https?:\/\/[^\s)]+/);
        if (m) setIndexUrl(m[0]);
        const baseError = `Gagal memuat daftar staf. Error: ${e.code || e.message}`;
         if (e.code === 'failed-precondition') {
          setError(`${baseError}. Database memerlukan indeks. Klik link di bawah untuk membuatnya.`);
        } else {
          setError(baseError);
        }
      } finally {
        setIsLoading(false);
      }
    };

    findAbsentUsers();

  }, [firestore]);

  const EmptyState = () => {
      if(isLoading) return <div className="flex flex-col items-center justify-center h-40 text-muted-foreground"><Loader2 className="h-8 w-8 animate-spin mb-3" /><span>Mencari data pengguna...</span></div>;
      if(error) return (
        <div className="flex flex-col items-center justify-center h-40 text-destructive text-center px-4">
          <AlertCircle className="h-8 w-8 mb-3" />
          <span className="mb-2">{error}</span>
          {indexUrl && <button onClick={() => window.open(indexUrl, '_blank')} className="text-sm underline text-red-600">Buka Panduan Pembuatan Indeks</button>}
        </div>
      )
      return <div className="flex flex-col items-center justify-center h-40 text-muted-foreground"><UserCheck className="h-8 w-8 mb-3" /><span>Semua staf sudah tercatat hadir atau memiliki izin.</span></div>;
  }

  const badgeVariants = useMemo(() =>({
      Alpa: 'destructive',
      Terlambat: 'secondary',
      Izin: 'default',
      Sakit: 'default'
  }), []);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Staf Belum Tercatat Hadir</CardTitle>
        <CardDescription>Daftar staf yang belum melakukan absensi masuk dan tidak memiliki izin.</CardDescription>
      </CardHeader>
      <CardContent>
        {absentUsers.length > 0 ? (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[50px]">No</TableHead>
                <TableHead>Nama</TableHead>
                <TableHead>Jabatan</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {absentUsers.map((user) => (
                <TableRow key={user.no}>
                  <TableCell className="font-medium">{user.no}</TableCell>
                  <TableCell>
                    <div className="font-medium">{user.name}</div>
                    <div className="text-sm text-muted-foreground">NIP: {user.nip}</div>
                  </TableCell>
                  <TableCell>{user.position}</TableCell>
                  <TableCell>
                    <Badge variant={badgeVariants[user.status] as any || 'secondary'}>
                        {user.status}
                    </Badge>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        ) : (
          <EmptyState />
        )}
      </CardContent>
    </Card>
  );
};

export default AbsentUsersTable;
