'use client';

import { useState, useEffect, useMemo } from 'react';
import { useUser, useFirestore, useCollection, useMemoFirebase } from '@/firebase';
import { useDoc } from '@/firebase/firestore/use-doc';
import { collection, query, where, doc, updateDoc, serverTimestamp, Timestamp } from 'firebase/firestore';
import { PageWrapper } from '@/components/layout/page-wrapper';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { format, isToday, startOfDay } from 'date-fns';
import { id } from 'date-fns/locale';
import { Check, X, Loader2, Info, ExternalLink } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Skeleton } from '@/components/ui/skeleton';

interface LeaveRequest {
  id: string;
  userId: string;
  userName: string;
  type: string;
  startDate: Timestamp;
  reason: string;
  status: 'pending' | 'approved' | 'rejected';
  proofUrl?: string;
  processedAt?: Timestamp;
  processedBy?: string;
}

const ApprovalPageSkeleton = () => (
    <PageWrapper title="Persetujuan Izin">
        <Tabs defaultValue="pending">
            <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="pending"><Skeleton className="h-6 w-48" /></TabsTrigger>
                <TabsTrigger value="history"><Skeleton className="h-6 w-32" /></TabsTrigger>
            </TabsList>
            <TabsContent value="pending">
                <Card>
                    <CardHeader>
                        <CardTitle><Skeleton className="h-7 w-64" /></CardTitle>
                        <CardDescription><Skeleton className="h-4 w-full max-w-lg" /></CardDescription>
                    </CardHeader>
                    <CardContent>
                        <Table>
                            <TableHeader>
                                <TableRow>{[...Array(5)].map((_, i) => <TableHead key={i}><Skeleton className="h-5 w-full" /></TableHead>)}</TableRow>
                            </TableHeader>
                            <TableBody>
                                {[...Array(3)].map((_, i) => (
                                    <TableRow key={i}>{[...Array(5)].map((_, j) => <TableCell key={j}><Skeleton className="h-5 w-full" /></TableCell>)}</TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    </CardContent>
                </Card>
            </TabsContent>
        </Tabs>
    </PageWrapper>
);

export default function PersetujuanPage() {
  const { user, isUserLoading: isAuthLoading } = useUser();
  const firestore = useFirestore();
  const router = useRouter();
  const { toast } = useToast();
  const [processingId, setProcessingId] = useState<string | null>(null);

  const userDocRef = useMemoFirebase(() => user ? doc(firestore, 'users', user.uid) : null, [firestore, user]);
  const { data: userData, isLoading: isUserDataLoading } = useDoc(user, userDocRef);

  const leaveRequestsQuery = useMemoFirebase(() => {
      if (!firestore) return null;
      return query(collection(firestore, 'leaveRequests'));
  }, [firestore]);

  const { data: leaveRequests, isLoading: isLeaveRequestsLoading } = useCollection<LeaveRequest>(user, leaveRequestsQuery);

  const isLoading = isAuthLoading || isUserDataLoading;
  const isAdmin = !isLoading && userData?.role === 'admin';

  useEffect(() => {
    if (!isLoading && !isAdmin) {
      router.replace('/dashboard');
    }
  }, [isLoading, isAdmin, router]);

  const pendingRequests = useMemo(() => 
    leaveRequests?.filter(req => req.status === 'pending').sort((a, b) => a.startDate.toMillis() - b.startDate.toMillis()) || [],
    [leaveRequests]
  );

  const historyToday = useMemo(() => 
    leaveRequests?.filter(req => req.status !== 'pending' && req.processedAt && isToday(req.processedAt.toDate()))
                 .sort((a, b) => b.processedAt!.toMillis() - a.processedAt!.toMillis()) || [],
    [leaveRequests]
  );

  const handleProcessRequest = async (requestId: string, newStatus: 'approved' | 'rejected') => {
    if (!user || !firestore) return;
    setProcessingId(requestId);
    try {
      const requestRef = doc(firestore, 'leaveRequests', requestId);
      await updateDoc(requestRef, {
        status: newStatus,
        processedAt: serverTimestamp(),
        processedBy: user.displayName || user.email,
      });
      toast({
        title: `Pengajuan ${newStatus === 'approved' ? 'Disetujui' : 'Ditolak'}`,
        description: `Status pengajuan telah berhasil diperbarui.`,
      });
    } catch (error) {
      console.error('Error processing leave request:', error);
      toast({ variant: 'destructive', title: 'Gagal Memproses', description: 'Terjadi kesalahan saat memperbarui status.' });
    } finally {
      setProcessingId(null);
    }
  };
  
  if (isLoading || !isAdmin) {
    return <ApprovalPageSkeleton />;
  }

  return (
    <PageWrapper title="Persetujuan Izin">
        <Tabs defaultValue="pending">
            <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="pending">Menunggu Persetujuan <Badge className="ml-2">{pendingRequests.length}</Badge></TabsTrigger>
                <TabsTrigger value="history">Riwayat Hari Ini</TabsTrigger>
            </TabsList>
            <TabsContent value="pending">
                <Card>
                    <CardHeader>
                        <CardTitle>Daftar Pengajuan Izin</CardTitle>
                        <CardDescription>Tinjau dan proses pengajuan izin yang masuk dari guru dan pegawai.</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Nama</TableHead>
                                    <TableHead>Jenis Izin</TableHead>
                                    <TableHead>Tanggal</TableHead>
                                    <TableHead>Alasan</TableHead>
                                    <TableHead className="text-center">Aksi</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {isLeaveRequestsLoading ? (
                                     [...Array(3)].map((_, i) => (
                                        <TableRow key={i}>
                                            <TableCell><Skeleton className="h-5 w-32" /></TableCell>
                                            <TableCell><Skeleton className="h-5 w-24" /></TableCell>
                                            <TableCell><Skeleton className="h-5 w-32" /></TableCell>
                                            <TableCell><Skeleton className="h-5 w-48" /></TableCell>
                                            <TableCell className="text-center space-x-2"><Skeleton className="h-9 w-24 mx-auto" /></TableCell>
                                        </TableRow>
                                    ))
                                ) : pendingRequests.length > 0 ? (
                                    pendingRequests.map(req => (
                                        <TableRow key={req.id}>
                                            <TableCell>{req.userName}</TableCell>
                                            <TableCell><Badge variant="secondary">{req.type}</Badge></TableCell>
                                            <TableCell>{format(req.startDate.toDate(), 'd MMM yyyy', { locale: id })}</TableCell>
                                            <TableCell className="max-w-xs truncate">{req.reason}</TableCell>
                                            <TableCell className="text-center space-x-2">
                                                <Button size="sm" variant="default" onClick={() => handleProcessRequest(req.id, 'approved')} disabled={!!processingId}>
                                                    {processingId === req.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                                                </Button>
                                                <Button size="sm" variant="destructive" onClick={() => handleProcessRequest(req.id, 'rejected')} disabled={!!processingId}>
                                                     {processingId === req.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <X className="h-4 w-4" />}
                                                </Button>
                                            </TableCell>
                                        </TableRow>
                                    ))
                                ) : (
                                    <TableRow><TableCell colSpan={5} className="text-center h-24">Tidak ada pengajuan yang menunggu persetujuan.</TableCell></TableRow>
                                )}
                            </TableBody>
                        </Table>
                    </CardContent>
                </Card>
            </TabsContent>
            <TabsContent value="history">
                 <Card>
                    <CardHeader>
                        <CardTitle>Riwayat Persetujuan Hari Ini</CardTitle>
                        <CardDescription>Daftar pengajuan yang telah Anda proses pada hari ini.</CardDescription>
                    </CardHeader>
                    <CardContent>
                         <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Nama</TableHead>
                                    <TableHead>Jenis Izin</TableHead>
                                    <TableHead>Waktu Keputusan</TableHead>
                                    <TableHead>Status</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {isLeaveRequestsLoading ? (
                                    [...Array(2)].map((_, i) => (
                                        <TableRow key={i}>
                                            <TableCell><Skeleton className="h-5 w-32" /></TableCell>
                                            <TableCell><Skeleton className="h-5 w-24" /></TableCell>
                                            <TableCell><Skeleton className="h-5 w-20" /></TableCell>
                                            <TableCell><Skeleton className="h-7 w-24" /></TableCell>
                                        </TableRow>
                                    ))
                                ) : historyToday.length > 0 ? (
                                    historyToday.map(req => (
                                        <TableRow key={req.id}>
                                            <TableCell>{req.userName}</TableCell>
                                            <TableCell>{req.type}</TableCell>
                                            <TableCell>{format(req.processedAt!.toDate(), 'HH:mm', { locale: id })} WIB</TableCell>
                                            <TableCell>
                                                <Badge variant={req.status === 'approved' ? 'default' : 'destructive'}>
                                                    {req.status === 'approved' ? 'Disetujui' : 'Ditolak'}
                                                </Badge>
                                            </TableCell>
                                        </TableRow>
                                    ))
                                ) : (
                                    <TableRow><TableCell colSpan={4} className="text-center h-24">Belum ada pengajuan yang diproses hari ini.</TableCell></TableRow>
                                )}
                            </TableBody>
                        </Table>
                    </CardContent>
                </Card>
            </TabsContent>
        </Tabs>
    </PageWrapper>
  );
}