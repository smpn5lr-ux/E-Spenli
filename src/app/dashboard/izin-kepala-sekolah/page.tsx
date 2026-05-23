'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Card,
  CardContent,
} from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { Badge } from '@/components/ui/badge';
import { Loader2, Check, X, RefreshCw, Eye } from 'lucide-react';
import { useUser, useFirestore, useCollection, FirestorePermissionError, errorEmitter } from '@/firebase';
import { collection, collectionGroup, query, where, getDocs, doc, updateDoc } from 'firebase/firestore';
import { format } from 'date-fns';
import { id } from 'date-fns/locale';
import { getFromCache, setInCache, invalidateCache } from '@/lib/cache';
import { PageWrapper } from '@/components/layout/page-wrapper';

// --- Types and Constants ---
interface LeaveRequest {
  id: string; // leaveRequest document ID
  userId: string;
  userName: string; 
  userRole: string;
  type: string;
  startDate: string; 
  reason: string;
  status: string;
  proofUrl?: string | null;
}

// --- Main Component ---
export default function IzinKepsekPage() {
  const { user, isUserLoading } = useUser();
  const firestore = useFirestore();
  const { toast } = useToast();
  const [leaveRequests, setLeaveRequests] = useState<LeaveRequest[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isProcessing, setIsProcessing] = useState<{[key: string]: boolean}>({});

  const cacheKey = 'pending_leave_requests';

  const usersCollectionRef = useMemo(() => firestore ? collection(firestore, 'users') : null, [firestore]);
  const { data: users, isLoading: isUsersLoading } = useCollection(user, usersCollectionRef);

  const userMap = useMemo(() => {
    if (!users) return new Map();
    return new Map(users.map(u => [u.uid, { name: u.displayName, role: u.role }]));
  }, [users]);

  const fetchPendingRequests = useCallback(async (forceRefresh = false) => {
    if (!firestore || !user || user.role !== 'kepala_sekolah') {
      setIsLoading(false);
      return;
    }
    setIsLoading(true);

    if (!forceRefresh) {
        const cachedData = getFromCache(cacheKey);
        if (cachedData) {
            setLeaveRequests(cachedData);
            setIsLoading(false);
            return;
        }
    }

    try {
      const leaveRequestsQuery = query(
        collectionGroup(firestore, 'leaveRequests'),
        where('status', '==', 'pending')
      );
      const querySnapshot = await getDocs(leaveRequestsQuery);
      const requests: LeaveRequest[] = [];
      
      querySnapshot.forEach(doc => {
        const data = doc.data();
        const userInfo = userMap.get(data.userId) || { name: 'Nama Tidak Ditemukan', role: 'Tidak Diketahui' };
        requests.push({
            id: doc.id,
            userId: data.userId,
            userName: userInfo.name,
            userRole: userInfo.role,
            type: data.type,
            startDate: format(data.startDate.toDate(), 'eeee, d MMMM yyyy', { locale: id }),
            reason: data.reason,
            status: data.status,
            proofUrl: data.proofUrl,
        });
      });

      setLeaveRequests(requests.sort((a, b) => a.startDate.localeCompare(b.startDate)));
      setInCache(cacheKey, requests);

    } catch (error) {
      console.error("Error fetching pending leave requests: ", error);
      toast({ title: "Gagal Memuat Data", description: "Tidak dapat mengambil data pengajuan izin.", variant: "destructive" });
    } finally {
      setIsLoading(false);
    }
  }, [firestore, user, userMap, toast]);

  useEffect(() => {
    if (!isUserLoading && !isUsersLoading) {
        fetchPendingRequests();
    }
  }, [isUserLoading, isUsersLoading, fetchPendingRequests]);

  const handleRefresh = () => {
      invalidateCache(cacheKey);
      fetchPendingRequests(true);
  }

  const handleRequestUpdate = async (userId: string, leaveId: string, newStatus: 'Disetujui' | 'Ditolak') => {
    if (!firestore) return;

    setIsProcessing(prev => ({ ...prev, [leaveId]: true }));
    const leaveRequestRef = doc(firestore, 'users', userId, 'leaveRequests', leaveId);

    try {
      await updateDoc(leaveRequestRef, { status: newStatus });
      toast({ title: 'Status Berhasil Diperbarui', description: `Pengajuan telah di-${newStatus.toLowerCase()}.` });
      
      setLeaveRequests(prev => prev.filter(req => req.id !== leaveId));
      invalidateCache(cacheKey);

    } catch (error) {
        console.error(`Failed to ${newStatus} request:`, error);
        const contextualError = new FirestorePermissionError({ operation: 'update', path: leaveRequestRef.path, requestResourceData: { status: newStatus } });
        errorEmitter.emit('permission-error', contextualError);
        toast({ title: 'Gagal Memperbarui Status', description: 'Terjadi kesalahan saat memproses permintaan.', variant: 'destructive' });
    } finally {
        setIsProcessing(prev => ({ ...prev, [leaveId]: false }));
    }
  };
  
  if (isUserLoading) {
      return (
          <PageWrapper>
              <div className="flex h-full items-center justify-center pt-32">
                  <Loader2 className="h-12 w-12 animate-spin text-primary" />
              </div>
          </PageWrapper>
      );
  }

  if (user?.role !== 'kepala_sekolah') {
      return (
          <PageWrapper>
              <div className="text-center py-10">Halaman ini hanya dapat diakses oleh Kepala Sekolah.</div>
          </PageWrapper>
      );
  }

  return (
    <PageWrapper>
        <div className="flex items-center justify-between mb-6">
            <div>
                <h1 className="text-2xl font-bold tracking-tight">Persetujuan Izin</h1>
                <p className="text-muted-foreground">Tinjau dan proses pengajuan izin dari guru dan pegawai.</p>
            </div>
            <Button variant="outline" size="icon" onClick={handleRefresh} disabled={isLoading}>
                <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
            </Button>
        </div>

        <Card className="w-full">
            <CardContent className="p-0">
            <div className="overflow-x-auto">
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead className="w-[200px]">Nama</TableHead>
                            <TableHead className="w-[150px]">Jabatan</TableHead>
                            <TableHead className="w-[150px]">Jenis Izin</TableHead>
                            <TableHead className="w-[250px]">Tanggal</TableHead>
                            <TableHead>Alasan</TableHead>
                            <TableHead className="text-center w-[250px]">Aksi</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {isLoading ? (
                            <TableRow><TableCell colSpan={6} className="h-24 text-center">Memuat Data...</TableCell></TableRow>
                        ) : leaveRequests.length > 0 ? (
                            leaveRequests.map((req) => (
                                <TableRow key={req.id}>
                                    <TableCell className="font-medium whitespace-nowrap">{req.userName}</TableCell>
                                    <TableCell className="capitalize">{req.userRole}</TableCell>
                                    <TableCell><Badge variant="secondary">{req.type}</Badge></TableCell>
                                    <TableCell>{req.startDate}</TableCell>
                                    <TableCell className="max-w-xs truncate" title={req.reason}>{req.reason}</TableCell>
                                    <TableCell className="text-center space-x-2 whitespace-nowrap">
                                    <Button 
                                        size="sm" 
                                        variant="default"
                                        onClick={() => handleRequestUpdate(req.userId, req.id, 'Disetujui')}
                                        disabled={isProcessing[req.id]}
                                    >
                                        {isProcessing[req.id] ? <Loader2 className="h-4 w-4 animate-spin"/> : <Check className="h-4 w-4" />}
                                        <span className="ml-2">Setujui</span>
                                    </Button>
                                    <Button 
                                        size="sm" 
                                        variant="destructive"
                                        onClick={() => handleRequestUpdate(req.userId, req.id, 'Ditolak')}
                                        disabled={isProcessing[req.id]}
                                    >
                                        {isProcessing[req.id] ? <Loader2 className="h-4 w-4 animate-spin"/> : <X className="h-4 w-4" />}
                                         <span className="ml-2">Tolak</span>
                                    </Button>
                                    {req.proofUrl && 
                                        <Button asChild size="sm" variant="outline">
                                            <a href={req.proofUrl} target="_blank" rel="noopener noreferrer">
                                                <Eye className="h-4 w-4 mr-2" /> Lihat Bukti
                                            </a>
                                        </Button>
                                    }
                                  </TableCell>
                                </TableRow>
                            ))
                        ) : (
                            <TableRow><TableCell colSpan={6} className="h-24 text-center">Tidak ada pengajuan izin yang menunggu persetujuan.</TableCell></TableRow>
                        )}
                    </TableBody>
                </Table>
            </div>
            </CardContent>
      </Card>
    </PageWrapper>
  );
}