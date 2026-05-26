
'use client';

import { useMemo, useEffect, useState } from 'react';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Loader2, Check, X, Inbox } from 'lucide-react';
import { useFirestore, useMemoFirebase, useUser, useDoc, useCollection } from '@/firebase';
import { collection, doc, query, where, Timestamp, getDocs, updateDoc, type DocumentData } from 'firebase/firestore';
import { format } from 'date-fns';
import { id } from 'date-fns/locale';
import { useToast } from '@/hooks/use-toast';
import { useRouter } from 'next/navigation';
import { Skeleton } from '@/components/ui/skeleton';
import type { LeaveRequest } from '@/types';

const approvalStatusVariant: { [key: string]: 'default' | 'secondary' | 'destructive' | 'outline' } = {
    'approved': 'default',
    'pending': 'outline',
    'rejected': 'destructive',
};

const ApprovalTableSkeleton = ({ cols, rows = 3 }: { cols: number, rows?: number }) => (
    <div className="rounded-md border">
        <Table>
            <TableHeader>
                <TableRow>
                    {[...Array(cols)].map((_, i) => (
                        <TableHead key={i}>
                            <Skeleton className="h-5 w-full" />
                        </TableHead>
                    ))}
                </TableRow>
            </TableHeader>
            <TableBody>
                {[...Array(rows)].map((_, i) => (
                    <TableRow key={i}>
                        {[...Array(cols)].map((_, j) => (
                            <TableCell key={j}>
                                <Skeleton className="h-5 w-full" />
                            </TableCell>
                        ))}
                    </TableRow>
                ))}
            </TableBody>
        </Table>
    </div>
);


export default function PersetujuanIzinPage() {
  const { user, isUserLoading: isAuthLoading } = useUser();
  const firestore = useFirestore();
  const router = useRouter();
  const { toast } = useToast();
  
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  const userDocRef = useMemoFirebase(() => {
    if (!user) return null;
    return doc(firestore, 'users', user.uid);
  }, [firestore, user]);
  const { data: userData, isLoading: isUserDataLoading } = useDoc(user, userDocRef);

  const isRoleCheckLoading = isAuthLoading || isUserDataLoading;
  const isPrivileged = !isRoleCheckLoading && (userData?.role === 'kepala_sekolah' || userData?.role === 'admin');

  const allUsersQuery = useMemoFirebase(() => firestore ? query(collection(firestore, 'users'), where('role', '!=', 'siswa')) : null, [firestore]);
  const { data: usersData, isLoading: isUsersLoading } = useCollection(user, allUsersQuery);
  const userMap = useMemo(() => {
    if (!usersData) return new Map();
    return new Map(usersData.map(u => [u.id, u.name]));
  }, [usersData]);

  const [allRequests, setAllRequests] = useState<LeaveRequest[]>([]);
  const [isLeaveRequestsLoading, setIsLeaveRequestsLoading] = useState(true);

  useEffect(() => {
    if (!isPrivileged || !firestore || !usersData) {
        if (!isUsersLoading) {
            setIsLeaveRequestsLoading(false);
        }
        return;
    }

    const fetchLeaveRequests = async () => {
        setIsLeaveRequestsLoading(true);
        setAllRequests([]); // Clear previous results
        try {
            const usersToQuery = usersData.filter(u => u.role !== 'admin' && u.role !== 'siswa');

            const requestPromises = usersToQuery.map(u => {
                const q = query(collection(firestore, 'users', u.id, 'leaveRequests'));
                return getDocs(q).then(snapshot => 
                    snapshot.docs.map(d => ({ ...d.data(), id: d.id, userId: u.id }) as LeaveRequest)
                );
            });
            
            const results = await Promise.all(requestPromises);
            const allFetchedRequests = results.flat();


            const sixDaysAgo = new Date();
            sixDaysAgo.setDate(sixDaysAgo.getDate() - 6);
            sixDaysAgo.setHours(0, 0, 0, 0);

            const recentRequests = allFetchedRequests.filter(req => {
                const startDate = req.startDate?.toDate();
                return startDate && startDate >= sixDaysAgo;
            });
            
            setAllRequests(recentRequests);

        } catch (error) {
            console.error("Failed to fetch leave requests:", error);
            if ((error as any).code !== 'permission-denied') {
                toast({
                    variant: 'destructive',
                    title: 'Gagal Memuat Permintaan Izin',
                    description: 'Terjadi kesalahan saat mengambil data dari database.',
                });
            } else {
                 toast({
                    variant: 'destructive',
                    title: 'Gagal: Izin Ditolak',
                    description: 'Gagal memuat data karena masalah izin. Ini bisa terjadi jika terlalu banyak data dimuat sekaligus.',
                });
            }
        } finally {
            setIsLeaveRequestsLoading(false);
        }
    };

    fetchLeaveRequests();
  }, [isPrivileged, firestore, usersData, isUsersLoading, toast]);


  const { pendingRequests, recentHistory } = useMemo(() => {
    if (!allRequests) return { pendingRequests: [], recentHistory: [] };
    const enrichedRequests = allRequests.map(req => ({
      ...req,
      userName: userMap.get(req.userId) || 'Nama tidak ditemukan'
    }));
    const pending = enrichedRequests.filter(req => req.status === 'pending').sort((a, b) => (a.startDate?.toDate()?.getTime() || 0) - (b.startDate?.toDate()?.getTime() || 0));
    const history = enrichedRequests.filter(req => req.status !== 'pending').sort((a, b) => (b.startDate?.toDate()?.getTime() || 0) - (a.startDate?.toDate()?.getTime() || 0));
    return { pendingRequests: pending, recentHistory: history };
  }, [allRequests, userMap]);

  const isDataLoading = isUsersLoading || isLeaveRequestsLoading;

  useEffect(() => {
    if (!isRoleCheckLoading) {
      if (!user) {
        router.replace('/');
      } else if (!isPrivileged) {
        router.replace('/dashboard');
      }
    }
  }, [isRoleCheckLoading, user, isPrivileged, router]);

  const handleUpdateRequestStatus = async (request: LeaveRequest, newStatus: 'approved' | 'rejected') => {
    if (!firestore || updatingId) return;
    setUpdatingId(request.id);

    const { userId, id: leaveRequestId } = request;
    const leaveRequestRef = doc(firestore, 'users', userId, 'leaveRequests', leaveRequestId);
    
    try {
        await updateDoc(leaveRequestRef, { status: newStatus });
        
        setAllRequests(prevRequests =>
            prevRequests.map(req =>
                req.id === request.id ? { ...req, status: newStatus } : req
            )
        );

        toast({
            title: `Pengajuan Berhasil Diperbarui`,
            description: `Permintaan dari ${request.userName} telah di-${newStatus === 'approved' ? 'setujui' : 'tolak'}.`,
        });
    } catch (error) {
        console.error("Gagal memperbarui status izin:", error);
        toast({
            variant: 'destructive',
            title: 'Gagal Memperbarui',
            description: 'Terjadi kesalahan. Pastikan Anda memiliki hak akses dan koneksi internet stabil.',
        });
    } finally {
        setUpdatingId(null);
    }
  };
  
  if (isRoleCheckLoading || !isPrivileged) {
    return (
        <div className="flex h-screen w-full items-center justify-center">
            <Loader2 className="h-12 w-12 animate-spin text-primary" />
        </div>
    );
  }

  return (
    <div className="space-y-8">
      <Card>
        <CardHeader>
          <CardTitle>Permintaan Izin Tertunda</CardTitle>
          <CardDescription>Tinjau dan proses permintaan izin atau sakit yang menunggu persetujuan.</CardDescription>
        </CardHeader>
        <CardContent>
          {isDataLoading ? (
            <ApprovalTableSkeleton cols={5} />
          ) : pendingRequests.length === 0 ? (
            <div className="flex flex-col items-center justify-center text-center text-muted-foreground py-10">
                <Inbox className="h-12 w-12 mb-4" />
                <p className="font-medium">Tidak Ada Permintaan Tertunda</p>
                <p className="text-sm">Semua permintaan izin dan sakit telah diproses.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Nama Pengguna</TableHead>
                    <TableHead>Jenis</TableHead>
                    <TableHead>Tanggal</TableHead>
                    <TableHead>Alasan</TableHead>
                    <TableHead className="text-right">Aksi</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pendingRequests.map(req => {
                    const isCurrentUpdating = updatingId === req.id;
                    return (
                      <TableRow key={req.id}>
                        <TableCell className="font-medium">{req.userName}</TableCell>
                        <TableCell>
                          <Badge variant={req.type === 'Sakit' ? 'destructive' : req.type.includes('Dinas') ? 'default' : 'secondary'}>
                            {req.type}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          {req.startDate?.toDate ? format(req.startDate.toDate(), 'd MMM yyyy', { locale: id }) : ''} - {req.endDate?.toDate ? format(req.endDate.toDate(), 'd MMM yyyy', { locale: id }) : ''}
                        </TableCell>
                        <TableCell className="max-w-xs truncate" title={req.reason}>{req.reason}</TableCell>
                        <TableCell className="text-right space-x-2">
                          <Button size="sm" variant="outline" onClick={() => handleUpdateRequestStatus(req, 'approved')} disabled={isCurrentUpdating}>
                            {isCurrentUpdating && updatingId === req.id ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Check className="mr-1 h-4 w-4" />}
                            Setujui
                          </Button>
                          <Button size="sm" variant="destructive" onClick={() => handleUpdateRequestStatus(req, 'rejected')} disabled={isCurrentUpdating}>
                            {isCurrentUpdating && updatingId === req.id ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <X className="mr-1 h-4 w-4" />}
                            Tolak
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Riwayat Persetujuan</CardTitle>
          <CardDescription>Riwayat permintaan izin atau sakit yang telah diproses dalam 6 hari terakhir.</CardDescription>
        </CardHeader>
        <CardContent>
          {isDataLoading ? (
            <ApprovalTableSkeleton cols={4} />
          ) : recentHistory.length === 0 ? (
            <div className="flex flex-col items-center justify-center text-center text-muted-foreground py-10">
              <p>Tidak ada riwayat untuk ditampilkan.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Nama Pengguna</TableHead>
                    <TableHead>Jenis</TableHead>
                    <TableHead>Tanggal</TableHead>
                    <TableHead className="text-center">Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {recentHistory.map(req => (
                    <TableRow key={req.id}>
                      <TableCell className="font-medium">{req.userName}</TableCell>
                      <TableCell>
                        <Badge variant={req.type === 'Sakit' ? 'destructive' : req.type.includes('Dinas') ? 'default' : 'secondary'}>
                          {req.type}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {req.startDate?.toDate ? format(req.startDate.toDate(), 'd MMM yyyy', { locale: id }) : ''} - {req.endDate?.toDate ? format(req.endDate.toDate(), 'd MMM yyyy', { locale: id }) : ''}
                      </TableCell>
                      <TableCell className="text-center">
                        <Badge variant={approvalStatusVariant[req.status] || 'secondary'} className="capitalize">
                            {req.status}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
