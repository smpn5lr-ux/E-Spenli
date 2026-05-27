'use client';

import { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import Link from 'next/link';
import {
  Users,  UserCheck,  UserX,  BookUser,  Loader2,  School, LogIn, LogOut, TrendingUp, AlertCircle, Info, MailWarning, Clock4, CheckCircle2
} from 'lucide-react';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { useFirestore, useUser, useCollection, useDoc, useMemoFirebase } from '@/firebase';
import {
  collection,  query,  where,  Timestamp,  getDocs, getCountFromServer, collectionGroup, orderBy, limit, doc
} from 'firebase/firestore';
import { startOfMonth, endOfMonth, startOfDay, endOfDay, format, isWithinInterval, addDays, subDays, setHours, setMinutes, eachDayOfInterval, isAfter } from 'date-fns';
import { id } from 'date-fns/locale';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, Cell } from 'recharts';
import { useRouter } from 'next/navigation';
import { getFromCache, setInCache } from '@/lib/cache';
import { calculateAttendanceStats, getDailyStaffAttendanceStats } from '@/lib/attendance';
import { useAttendanceWindow } from '@/hooks/use-attendance-window';

import TodaysActivityTable from '@/components/dashboard/RecentAttendanceTable';
import AbsentUsersTable from '@/components/dashboard/AbsentUsersTable';

const roleDescriptions: { [key: string]: string } = {
  admin: 'Anda dapat mengelola pengguna, konfigurasi, dan memantau semua aktivitas.',
  kepala_sekolah: 'Anda dapat memantau aktivitas guru & pegawai, serta memproses pengajuan izin.',
  guru: 'Lakukan absensi, ajukan izin, dan lihat riwayat kehadiran Anda di sini.',
  pegawai: 'Lakukan absensi, ajukan izin, dan lihat riwayat kehadiran Anda di sini.',
};

const WelcomeCard = ({ user }: { user: any }) => (
    <div>
        <p className="text-base text-muted-foreground leading-none mb-0">Selamat Datang</p>
        <h1 className="text-xl font-bold">{user.name}</h1>
        <p className="text-sm text-muted-foreground mt-1">{roleDescriptions[user.role] || 'Selamat datang di dasbor Anda.'}</p>
    </div>
);

const StatCard = ({ title, value, icon: Icon, description, isLoading, className, onClick }: any) => (
    <Card className={`h-full flex flex-col ${className || ''}`} onClick={onClick}>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{title}</CardTitle>
            {Icon && <Icon className="h-4 w-4 opacity-80" />}
        </CardHeader>
        <CardContent className="flex-grow">
            {isLoading ? (
                 <Skeleton className="h-8 w-1/2" />
            ) : (
                <>
                    <div className="text-2xl font-bold">{value}</div>
                    {description && !isLoading && <p className="text-xs opacity-80">{description}</p>}
                </>
            )}
        </CardContent>
    </Card>
);

const PersonalAttendanceCardUI = ({ attendanceData, isLoading, lateSubmissionData }: { attendanceData: any, isLoading: boolean, lateSubmissionData: any }) => {
    const router = useRouter();
    const [currentTime, setCurrentTime] = useState(new Date());
    const { status: attendanceWindowStatus, config: schoolConfigData, checkInEnd, checkOutStart } = useAttendanceWindow();

    useEffect(() => { 
        const timerId = setInterval(() => setCurrentTime(new Date()), 1000);
        return () => clearInterval(timerId); 
    }, []);

    const attendanceRecord = attendanceData?.[0];
    const checkInTime = attendanceRecord?.checkInTime ? format(attendanceRecord.checkInTime.toDate(), 'HH:mm') : '--:--';
    const checkOutTime = attendanceRecord?.checkOutTime ? format(attendanceRecord.checkOutTime.toDate(), 'HH:mm') : '--:--';

    const lateSubmission = useMemo(() => lateSubmissionData?.[0] ?? null, [lateSubmissionData]);
    const hasPendingLateSubmission = lateSubmission?.status === 'pending';
    const hasApprovedLateSubmission = lateSubmission?.status === 'approved';
    const hasRejectedLateSubmission = lateSubmission?.status === 'rejected';

    const reminder = useMemo(() => {
        const hasCheckedIn = !!attendanceRecord?.checkInTime;
        const hasCheckedOut = !!attendanceRecord?.checkOutTime;
        const now = currentTime;

        if (isLoading || hasCheckedOut || attendanceWindowStatus === 'HOLIDAY' || hasPendingLateSubmission || hasApprovedLateSubmission) {
            return null; 
        }

        if (!hasCheckedIn) {
            const isLatePeriod = checkInEnd && now > checkInEnd && (!checkOutStart || now < checkOutStart);
            if (isLatePeriod) {
                 return {
                    variant: 'destructive',
                    title: 'Anda Telah Melewatkan Sesi Absen Masuk',
                    description: 'Segera ajukan keterangan terlambat agar tidak dianggap alpa oleh Kepala Sekolah.'
                };
            }
            if (attendanceWindowStatus === 'CHECK_IN_OPEN') {
                return {
                    variant: 'default',
                    title: 'Saatnya Absen Masuk',
                    description: 'Sesi absensi masuk sedang berlangsung. Segera lakukan absensi Anda.'
                };
            }
        }

        if (hasCheckedIn) {
            if (attendanceWindowStatus === 'CHECK_OUT_OPEN') {
                return {
                    variant: 'default',
                    title: 'Saatnya Absen Pulang',
                    description: 'Waktu kerja akan berakhir. Jangan lupa untuk melakukan absensi pulang.'
                };
            }
            
            const checkOutEndStr = schoolConfigData?.checkOutEndTime;
            if (checkOutEndStr && attendanceWindowStatus === 'CLOSED') {
                const [endH, endM] = checkOutEndStr.split(':').map(Number);
                let checkOutEnd = setHours(startOfDay(now), endH);
                checkOutEnd = setMinutes(checkOutEnd, endM);

                 if (now > checkOutEnd) {
                     return {
                        variant: 'destructive',
                        title: 'Anda Melewatkan Sesi Absen Pulang',
                        description: 'Anda tidak melakukan absensi pulang. Kehadiran Anda hari ini tercatat tidak lengkap.'
                    };
                 }
            }
        }
        return null;
    }, [attendanceRecord, isLoading, attendanceWindowStatus, schoolConfigData, currentTime, checkInEnd, checkOutStart, hasPendingLateSubmission, hasApprovedLateSubmission]);

    const buttonStatus = useMemo(() => {
        if (isLoading || !schoolConfigData) {
            return { text: 'Memuat...', disabled: true, page: '#' };
        }

        const hasCheckedIn = !!attendanceRecord?.checkInTime;
        const hasCheckedOut = !!attendanceRecord?.checkOutTime;

        if (hasCheckedOut) {
            return { text: 'Absensi Selesai', disabled: true, page: '#' };
        }

        if (hasPendingLateSubmission) {
            return { text: 'Menunggu Persetujuan', disabled: true, page: '#' };
        }

        if (hasApprovedLateSubmission) {
            if (attendanceWindowStatus === 'CHECK_OUT_OPEN') {
                return { text: 'Absen Pulang', disabled: false, page: '/dashboard/absen' };
            }
            return { text: 'Terlambat Disetujui', disabled: true, page: '#' };
        }

        if (hasRejectedLateSubmission) {
             return { text: 'Ajukan Kembali Keterlambatan', disabled: false, page: '/dashboard/terlambat/ajukan' };
        }

        switch (attendanceWindowStatus) {
            case 'HOLIDAY':
                return { text: 'Hari Libur', disabled: true, page: '#' };

            case 'CHECK_IN_OPEN':
                return hasCheckedIn ? { text: 'Sudah Absen Masuk', disabled: true, page: '#' } : { text: 'Absen Masuk', disabled: false, page: '/dashboard/absen' };

            case 'CHECK_OUT_OPEN':
                return { text: 'Absen Pulang', disabled: false, page: '/dashboard/absen' };

            case 'CLOSED':
                const now = currentTime;
                const isAfterCheckInEnd = checkInEnd && now > checkInEnd;
                const isBeforeCheckOutStart = checkOutStart && now < checkOutStart;

                if (!hasCheckedIn && isAfterCheckInEnd && isBeforeCheckOutStart) {
                    return { text: 'Ajukan Keterlambatan', disabled: false, page: '/dashboard/terlambat/ajukan' };
                }

                if (hasCheckedIn && !hasCheckedOut) {
                    return { text: 'Belum Waktunya Pulang', disabled: true, page: '#' };
                }
                
                return { text: 'Sesi Absensi Ditutup', disabled: true, page: '#' };

            case 'UPCOMING':
                return { text: 'Belum Waktunya Absen', disabled: true, page: '#' };

            case 'SESSION_INACTIVE':
                return { text: 'Sesi Absensi Nonaktif', disabled: true, page: '#' };

            default:
                return { text: 'Memuat Status...', disabled: true, page: '#' };
        }

    }, [isLoading, attendanceRecord, schoolConfigData, currentTime, attendanceWindowStatus, checkInEnd, checkOutStart, hasPendingLateSubmission, hasApprovedLateSubmission, hasRejectedLateSubmission]);

    return (
        <Card className="h-full flex flex-col">
            <CardHeader><CardTitle>Kehadiran Anda Hari Ini</CardTitle><CardDescription>Status kehadiran dan jam absensi Anda.</CardDescription></CardHeader>
            <CardContent className="flex flex-col flex-grow items-center justify-center space-y-6 pb-8">
                 {hasPendingLateSubmission && (
                     <Alert variant="default" className="mb-4">
                        <MailWarning className="h-4 w-4" />
                        <AlertTitle>Pengajuan Terlambat Terkirim</AlertTitle>
                        <AlertDescription>Pengajuan keterangan terlambat Anda sedang menunggu persetujuan dari Kepala Sekolah.</AlertDescription>
                    </Alert>
                )}
                {hasApprovedLateSubmission && (
                     <Alert variant="default" className="mb-4">
                        <CheckCircle2 className="h-4 w-4" />
                        <AlertTitle>Pengajuan Terlambat Disetujui</AlertTitle>
                        <AlertDescription>Keterangan terlambat Anda hari ini telah disetujui. Periksa laporan jika perlu.</AlertDescription>
                    </Alert>
                )}
                {hasRejectedLateSubmission && (
                     <Alert variant="destructive" className="mb-4">
                        <AlertCircle className="h-4 w-4" />
                        <AlertTitle>Pengajuan Terlambat Ditolak</AlertTitle>
                        <AlertDescription>Pengajuan Anda ditolak. Silakan ajukan kembali atau hubungi Kepala Sekolah jika perlu.</AlertDescription>
                    </Alert>
                )}
                {reminder && (
                    <Alert variant={reminder.variant as "default" | "destructive" | null | undefined} className="mb-4">
                        {reminder.variant === 'destructive' ? <AlertCircle className="h-4 w-4" /> : <Info className="h-4 w-4" />}
                        <AlertTitle>{reminder.title}</AlertTitle>
                        <AlertDescription>{reminder.description}</AlertDescription>
                    </Alert>
                )}
                {attendanceWindowStatus === 'HOLIDAY' && (
                     <Alert variant="default" className="mb-4">
                        <Info className="h-4 w-4" />
                        <AlertTitle>Hari Libur</AlertTitle>
                        <AlertDescription>Sistem absensi tidak aktif selama hari libur. Nikmati waktu istirahat Anda.</AlertDescription>
                    </Alert>
                )}
                <div className="text-center">
                    <p className="text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-bold tracking-tight">{format(currentTime, 'HH:mm:ss')}</p>
                    <p className="text-lg text-muted-foreground">{format(currentTime, 'eeee, d MMMM yyyy', { locale: id })}</p>
                </div>
                <div className="grid grid-cols-2 gap-4 w-full">
                    <div className="text-center bg-muted p-3 rounded-lg"><h3 className="font-semibold text-sm flex items-center justify-center gap-2"><LogIn size={14}/> Absen Masuk</h3><p className="text-3xl font-bold">{checkInTime}</p></div>
                    <div className="text-center bg-muted p-3 rounded-lg"><h3 className="font-semibold text-sm flex items-center justify-center gap-2"><LogOut size={14}/> Absen Pulang</h3><p className="text-3xl font-bold">{checkOutTime}</p></div>
                </div>
                <div className="w-full flex flex-col items-center space-y-2 pt-4">
                    <Button size="lg" className="w-full h-12 text-lg font-bold" onClick={() => router.push(buttonStatus.page)} disabled={buttonStatus.disabled}>{isLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}{buttonStatus.text}</Button>
                    <Button variant="link" asChild><Link href="/dashboard/laporan">Lihat Riwayat Lengkap</Link></Button>
                </div>
            </CardContent>
        </Card>
    );
};


const MonthlyAttendanceChartUI = ({ summaryData, isLoading }: { summaryData: any, isLoading: boolean }) => {
    const now = new Date();
    const chartData = [
        { name: 'Hadir', jumlah: summaryData.attendanceCount, fill: 'hsl(var(--card-green-bg))' },
        { name: 'Sakit', jumlah: summaryData.sakitCount, fill: 'hsl(var(--card-orange-bg))' },
        { name: 'Izin', jumlah: summaryData.izinCount, fill: '#facc15' },
        { name: 'Alpa', jumlah: summaryData.alpaCount, fill: 'hsl(var(--card-red-bg))' },
    ];

    const CustomTooltip = ({ active, payload, label }: any) => {
        if (active && payload && payload.length) {
            return <div className="rounded-lg border bg-popover p-2 shadow-sm"><p className="font-medium text-popover-foreground">{label}</p><p className="text-sm text-muted-foreground">{`${payload[0].value} hari`}</p></div>;
        }
        return null;
    };

    return (
        <Card>
            <CardHeader><CardTitle className="flex items-center gap-2"><TrendingUp size={20} /> Riwayat Bulan {format(now, 'MMMM', { locale: id })}</CardTitle><CardDescription>Persentase kehadiran: {isLoading ? '...' : `${summaryData.percentage}%`}</CardDescription></CardHeader>
            <CardContent>
                {isLoading ? 
                    <div className="flex items-center justify-center h-[250px]"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div> : 
                    <ResponsiveContainer width="100%" height={250}>
                        <BarChart data={chartData} margin={{ top: 5, right: 20, bottom: 5, left: -10 }}>
                            <CartesianGrid strokeDasharray="3 3" vertical={false} />
                            <XAxis dataKey="name" stroke="hsl(var(--muted-foreground))" fontSize={12} tickLine={false} axisLine={true} />
                            <YAxis stroke="hsl(var(--muted-foreground))" fontSize={12} tickLine={false} axisLine={true} allowDecimals={false} width={30} />
                            <Tooltip content={<CustomTooltip />} cursor={{ fill: 'hsl(var(--accent))' }} />
                            <Bar dataKey="jumlah" radius={[4, 4, 0, 0]}>{chartData.map((entry) => (<Cell key={entry.name} fill={entry.fill} />))}</Bar>
                        </BarChart>
                    </ResponsiveContainer>
                }
            </CardContent>
        </Card>
    );
};

function useMonthlyAttendanceSummary(user: any) {
    const firestore = useFirestore();
    const cacheKey = useMemo(() => user ? `monthlySummary_v4_${user.uid}` : null, [user]);
    const [summary, setSummary] = useState<any>(() => cacheKey ? getFromCache(cacheKey) || null : null);
    const [isLoading, setIsLoading] = useState(summary === null);

    const defaultSummary = useMemo(() => ({
        attendanceCount: 0, izinCount: 0, sakitCount: 0, alpaCount: 0, percentage: '0.0'
    }), []);

    useEffect(() => {
        if (!user || !firestore || !cacheKey) return;
        const fetchStats = async () => {
            setIsLoading(true);
            try {
                const now = new Date();
                const stats = await calculateAttendanceStats(firestore, user.uid, now);
                const newSummary = {
                    attendanceCount: stats.totalHadir,
                    izinCount: stats.totalIzin,
                    sakitCount: stats.totalSakit,
                    alpaCount: stats.totalAlpa,
                    percentage: (stats.percentage || 0).toFixed(1),
                };
                setSummary(newSummary);
                setInCache(cacheKey, newSummary);
            } catch (error) {
                console.error("Failed to calculate monthly summary:", error);
                setSummary(defaultSummary);
            } finally {
                setIsLoading(false);
            }
        };
        if (summary === null) { fetchStats(); }
    }, [user, firestore, cacheKey, defaultSummary]);

    return { summary: summary || defaultSummary, isLoading };
}

function useStaffDashboardStats(firestore: any, user: any) {
  const todayStr = format(new Date(), 'yyyy-MM-dd');
  const cacheKey = `staffDashboardStats_v7_${todayStr}`;
  const [stats, setStats] = useState<any>(() => getFromCache(cacheKey) || null);
  const defaultStats = useMemo(() => ({ totalStaff: 0, hadir: 0, izin: 0, sakit: 0, alpa: 0, pendingLeave: 0, pendingLate: 0, totalLate: 0 }), []);
  
  const { status: attendanceWindowStatus, isLoading: isWindowLoading } = useAttendanceWindow();
  const [isSettled, setIsSettled] = useState(false);
  const [finalStatus, setFinalStatus] = useState(attendanceWindowStatus);

  useEffect(() => {
    if (isWindowLoading) {
      setIsSettled(false);
      return;
    }

    const timer = setTimeout(() => {
      setFinalStatus(attendanceWindowStatus);
      setIsSettled(true);
    }, 400); // Stabilization delay

    return () => clearTimeout(timer);
  }, [isWindowLoading, attendanceWindowStatus]);

  useEffect(() => {
    if (!isSettled || !firestore || !user) {
      return;
    }

    const processStats = async () => {
      if (finalStatus === 'HOLIDAY') {
        setStats(defaultStats);
        setInCache(cacheKey, defaultStats);
      } else {
        try {
          const cachedStats = getFromCache(cacheKey);
          if (cachedStats) {
            setStats(cachedStats);
          } else {
            const dailyStats = await getDailyStaffAttendanceStats(firestore);
            setStats(dailyStats);
            setInCache(cacheKey, dailyStats);
          }
        } catch (error) {
          console.error("Error fetching dashboard stats:", error);
          setStats(defaultStats);
        }
      }
    };

    processStats();

  }, [isSettled, finalStatus, firestore, user, cacheKey, defaultStats]);

  return { stats: stats || defaultStats, isLoading: !isSettled || (finalStatus !== 'HOLIDAY' && !stats) };
}

const HeadmasterDashboard = ({ user, router }: any) => {
    const firestore = useFirestore();
    const { stats, isLoading: isStatsLoading } = useStaffDashboardStats(firestore, user);
    const { summary: personalSummary, isLoading: isPersonalSummaryLoading } = useMonthlyAttendanceSummary(user);
    const todaysAttendanceQuery = useMemoFirebase(() => user ? query(collection(firestore, 'users', user.uid, 'attendanceRecords'), where('date', '==', format(new Date(), 'yyyy-MM-dd')), limit(1)) : null, [firestore, user]);
    const { data: todaysAttendance, isLoading: isAttendanceLoading } = useCollection(user, todaysAttendanceQuery);
    const todaysLateSubmissionQuery = useMemoFirebase(() => user ? query(collection(firestore, 'users', user.uid, 'lateSubmissions'), where('date', '==', format(new Date(), 'yyyy-MM-dd')), limit(1)) : null, [firestore, user]);
    const { data: lateSubmissionData, isLoading: isLateSubmissionLoading } = useCollection(user, todaysLateSubmissionQuery);

    return (
        <>
            <PersonalAttendanceCardUI attendanceData={todaysAttendance} isLoading={isAttendanceLoading || isLateSubmissionLoading} lateSubmissionData={lateSubmissionData} />
            <MonthlyAttendanceChartUI summaryData={personalSummary} isLoading={isPersonalSummaryLoading} />
            <StatCard title="Total Hadir Hari Ini" value={stats.hadir} icon={UserCheck} isLoading={isStatsLoading} className="bg-[hsl(var(--card-green-bg))] text-[hsl(var(--card-green-fg))]" />
            <StatCard title="Total Izin/Sakit Hari Ini" value={stats.izin + stats.sakit} icon={BookUser} description={`${stats.izin} Izin, ${stats.sakit} Sakit`} isLoading={isStatsLoading} className="bg-[hsl(var(--card-orange-bg))] text-[hsl(var(--card-orange-fg))]" />
            <StatCard 
                title="Menunggu Persetujuan Izin" 
                value={stats.pendingLeave}
                icon={MailWarning} 
                description="Pengajuan izin/sakit"
                isLoading={isStatsLoading} 
                className="cursor-pointer transition-colors bg-[hsl(var(--card-blue-bg))] text-[hsl(var(--card-blue-fg))] hover:bg-opacity-90"
                onClick={() => router.push('/dashboard/izin-kepala-sekolah')}
            />
            <StatCard 
                title="Persetujuan Terlambat"
                value={`${stats.pendingLate} / ${stats.totalLate}`}
                icon={Clock4}
                description="Pengajuan menunggu dari total"
                isLoading={isStatsLoading} 
                className="cursor-pointer transition-colors bg-[hsl(var(--card-purple-bg))] text-[hsl(var(--card-purple-fg))] hover:bg-opacity-90"
                onClick={() => router.push('/dashboard/terlambat/persetujuan')}
            />
            <StatCard title="Total Alpa Hari Ini" value={stats.alpa} icon={UserX} isLoading={isStatsLoading} className="bg-[hsl(var(--card-red-bg))] text-[hsl(var(--card-red-fg))]" />
            <div className="col-span-1 md:col-span-2 lg:col-span-4 xl:col-span-4"><TodaysActivityTable /></div>
            <div className="col-span-1 md:col-span-2 lg:col-span-4 xl:col-span-4"><AbsentUsersTable /></div>
        </> 
    );
};

const AdminDashboard = ({ user, router }: any) => {
    const firestore = useFirestore();
    const { stats, isLoading: isStatsLoading } = useStaffDashboardStats(firestore, user);
    return (
        <>
            <StatCard title="Total Hadir Hari Ini" value={stats.hadir} icon={UserCheck} isLoading={isStatsLoading} className="bg-[hsl(var(--card-green-bg))] text-[hsl(var(--card-green-fg))]" />
            <StatCard title="Total Izin/Sakit Hari Ini" value={stats.izin + stats.sakit} icon={BookUser} description={`${stats.izin} Izin, ${stats.sakit} Sakit`} isLoading={isStatsLoading} className="bg-[hsl(var(--card-orange-bg))] text-[hsl(var(--card-orange-fg))]" />
            <StatCard title="Menunggu Persetujuan" value={stats.pendingLeave} icon={MailWarning} isLoading={isStatsLoading} className="bg-[hsl(var(--card-blue-bg))] text-[hsl(var(--card-blue-fg))]" />
            <StatCard 
                title="Persetujuan Terlambat" 
                value={`${stats.pendingLate} / ${stats.totalLate}`}
                description="Pengajuan menunggu dari total"
                icon={Clock4} 
                isLoading={isStatsLoading} 
                className="bg-[hsl(var(--card-purple-bg))] text-[hsl(var(--card-purple-fg))]" 
            />
            <StatCard title="Total Alpa Hari Ini" value={stats.alpa} icon={UserX} isLoading={isStatsLoading} className="bg-[hsl(var(--card-red-bg))] text-[hsl(var(--card-red-fg))]" />
            <div className="col-span-1 md:col-span-2 lg:col-span-3 xl:col-span-4"><TodaysActivityTable /></div>
            <div className="col-span-1 md:col-span-2 lg:col-span-3 xl:col-span-4"><AbsentUsersTable /></div>
        </> 
    );
};

const StaffDashboard = ({ user }: any) => {
    const firestore = useFirestore();
    const { summary, isLoading: isSummaryLoading } = useMonthlyAttendanceSummary(user);
    const todaysAttendanceQuery = useMemoFirebase(() => user ? query(collection(firestore, 'users', user.uid, 'attendanceRecords'), where('date', '==', format(new Date(), 'yyyy-MM-dd')), limit(1)) : null, [firestore, user]);
    const { data: todaysAttendance, isLoading: isAttendanceLoading } = useCollection(user, todaysAttendanceQuery);
    const todaysLateSubmissionQuery = useMemoFirebase(() => user ? query(collection(firestore, 'users', user.uid, 'lateSubmissions'), where('date', '==', format(new Date(), 'yyyy-MM-dd')), limit(1)) : null, [firestore, user]);
    const { data: lateSubmissionData, isLoading: isLateSubmissionLoading } = useCollection(user, todaysLateSubmissionQuery);

    return (
        <>
            <div className="md:col-span-2 lg:col-span-2 xl:col-span-2"><PersonalAttendanceCardUI attendanceData={todaysAttendance} isLoading={isAttendanceLoading || isLateSubmissionLoading} lateSubmissionData={lateSubmissionData} /></div>
            <div className="md:col-span-2 lg:col-span-1 xl:col-span-2"><MonthlyAttendanceChartUI summaryData={summary} isLoading={isSummaryLoading} /></div>
        </> 
    );
};

export default function DashboardPage() {
  const { user, isUserLoading } = useUser();
  const router = useRouter();
  useEffect(() => { if (!isUserLoading && !user) { router.replace('/'); } }, [user, isUserLoading, router]);
  if (isUserLoading || !user) { return <div className="flex h-screen items-center justify-center"><Loader2 className="h-12 w-12 animate-spin" /></div>; }

  const renderDashboardContent = () => {
    const role = user.role;
    if (role === 'kepala_sekolah') { return <HeadmasterDashboard user={user} router={router} />; }
    if (role === 'admin') { return <AdminDashboard user={user} router={router} />; }
    if (['guru', 'pegawai'].includes(role)) { return <StaffDashboard user={user} />; }
    return null;
  };

  return (
    <div className="flex-1 pt-4 pb-24 md:p-8">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3 xl:col-span-4 md:gap-6">
            <div className="col-span-1 md:col-span-2 lg:col-span-3 xl:col-span-4"><WelcomeCard user={user} /></div>
            {renderDashboardContent()}
        </div>
    </div>
  );
}
