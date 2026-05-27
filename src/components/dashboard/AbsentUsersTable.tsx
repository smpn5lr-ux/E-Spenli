'use client';

import React, { useEffect, useState, useMemo, useCallback } from 'react';
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
import { useAttendanceWindow } from '@/hooks/use-attendance-window';

interface AbsentUser {
  no: number;
  name: string;
  nip: string;
  position: string;
  status: 'Alpa';
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
  const [viewState, setViewState] = useState<'loading' | 'holiday' | 'error' | 'show_table' | 'empty_table'>('loading');
  const [error, setError] = useState<string | null>(null);
  const firestore = useFirestore();
  const { status: attendanceWindowStatus, isLoading: isWindowLoading } = useAttendanceWindow();

  const findAbsentUsers = useCallback(async () => {
    if (!firestore) {
      setError('Layanan database tidak tersedia.');
      setViewState('error');
      return;
    }
    
    setViewState('loading');

    try {
      const todayStr = format(new Date(), 'yyyy-MM-dd');
      const usersQuery = query(collection(firestore, 'users'), where('role', 'in', ['guru', 'pegawai', 'kepala_sekolah']));
      const attendanceQuery = query(collectionGroup(firestore, 'attendanceRecords'), where('date', '==', todayStr));
      const approvedLateQuery = query(collectionGroup(firestore, 'lateSubmissions'), where('date', '==', todayStr), where('status', '==', 'approved'));
      const leaveQuery = query(collectionGroup(firestore, 'leaveRequests'), where('status', '==', 'approved'));

      const [usersSnap, attendanceSnap, approvedLateSnap, leaveSnap] = await Promise.all([
        getDocs(usersQuery),
        getDocs(attendanceQuery),
        getDocs(approvedLateQuery),
        getDocs(leaveQuery)
      ]);

      const allStaff: UserData[] = usersSnap.docs.map(doc => ({ id: doc.id, ...doc.data() } as UserData));
      
      const presentUserIds = new Set<string>();
      attendanceSnap.forEach(doc => presentUserIds.add(doc.ref.parent.parent!.id));
      approvedLateSnap.forEach(doc => presentUserIds.add(doc.ref.parent.parent!.id));

      const onLeaveUserIds = new Set<string>();
      const today = new Date();
      leaveSnap.forEach(doc => {
        const leave = doc.data();
        const startDate = leave.startDate?.toDate();
        const endDate = leave.endDate?.toDate();
        if (startDate && endDate && today >= startOfDay(startDate) && today <= endOfDay(endDate)) {
            onLeaveUserIds.add(doc.ref.parent.parent!.id);
        }
      });
      
      const usersToDisplay = allStaff
        .filter(user => !presentUserIds.has(user.id) && !onLeaveUserIds.has(user.id))
        .map((user, index) => ({
          no: index + 1,
          name: user.name,
          nip: user.nip || '-',
          position: user.position || user.role.charAt(0).toUpperCase() + user.role.slice(1),
          status: 'Alpa',
        }))
        .sort((a, b) => a.name.localeCompare(b.name));

      setAbsentUsers(usersToDisplay);
      setViewState(usersToDisplay.length > 0 ? 'show_table' : 'empty_table');

    } catch (e: any) {
      console.error("Error finding absent users:", e);
      setError(`Gagal memuat daftar staf. Error: ${e.code || e.message}`);
      setViewState('error');
    }
  }, [firestore]);

  useEffect(() => {
    // The master controller: waits for the hook to finish loading, then waits for a stabilization delay.
    if (isWindowLoading) {
      setViewState('loading');
      return;
    }

    const stabilizationTimer = setTimeout(() => {
      if (attendanceWindowStatus === 'HOLIDAY') {
        setViewState('holiday');
      } else {
        findAbsentUsers();
      }
    }, 400); // 400ms stabilization delay

    return () => clearTimeout(stabilizationTimer);
    
  }, [isWindowLoading, attendanceWindowStatus, findAbsentUsers]);

  const RenderContent = () => {
    switch (viewState) {
      case 'loading':
        return <div className="flex flex-col items-center justify-center h-40 text-muted-foreground"><Loader2 className="h-8 w-8 animate-spin mb-3" /><span>Memverifikasi jadwal...</span></div>;
      case 'holiday':
        return <div className="flex flex-col items-center justify-center h-40 text-muted-foreground"><UserCheck className="h-8 w-8 mb-3" /><span>Hari ini adalah hari libur. Tidak ada data absensi.</span></div>;
      case 'error':
        return <div className="flex flex-col items-center justify-center h-40 text-destructive text-center px-4"><AlertCircle className="h-8 w-8 mb-3" /><span>{error}</span></div>;
      case 'empty_table':
        return <div className="flex flex-col items-center justify-center h-40 text-muted-foreground"><UserCheck className="h-8 w-8 mb-3" /><span>Semua staf sudah tercatat hadir atau memiliki izin.</span></div>;
      case 'show_table':
        return (
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
                  <TableCell><Badge variant='destructive'>{user.status}</Badge></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        );
      default:
        return null;
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Staf Belum Tercatat Hadir</CardTitle>
        <CardDescription>Daftar staf yang belum melakukan absensi masuk dan tidak memiliki izin.</CardDescription>
      </CardHeader>
      <CardContent><RenderContent /></CardContent>
    </Card>
  );
};

export default AbsentUsersTable;
