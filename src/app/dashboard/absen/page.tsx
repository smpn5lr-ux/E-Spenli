'use client';

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { Html5Qrcode, Html5QrcodeCameraScanConfig } from 'html5-qrcode';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { MapPin, CheckCircle, Clock, X, Loader2, AlertTriangle, CameraOff, CalendarOff } from 'lucide-react';
import { useUser, useFirestore, useDoc, useCollection, useMemoFirebase } from '@/firebase';
import { doc, collection, query, where, Timestamp, addDoc, updateDoc } from 'firebase/firestore';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { format, isBefore } from 'date-fns';
import QuoteOfTheDay from '@/components/layout/quote-of-the-day';
import { PageWrapper } from '@/components/layout/page-wrapper';

// --- Helper Functions ---
function getDistance(lat1: number, lon1: number, lat2: number, lon2: number) {
    const R = 6371e3; // metres
    const φ1 = lat1 * Math.PI/180, φ2 = lat2 * Math.PI/180;
    const Δφ = (lat2-lat1) * Math.PI/180, Δλ = (lon2-lon1) * Math.PI/180;
    const a = Math.sin(Δφ/2) * Math.sin(Δφ/2) + Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ/2) * Math.sin(Δλ/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return R * c; // in metres
}

const getCurrentPosition = (options?: PositionOptions): Promise<GeolocationPosition> =>
  new Promise((resolve, reject) => navigator.geolocation.getCurrentPosition(resolve, reject, options));

// --- Types ---
type FeedbackStatus = 'idle' | 'processing' | 'locating' | 'success_in' | 'success_out' | 'error_radius' | 'error_time' | 'error_already_in' | 'error_already_out' | 'error_generic' | 'error_location' | 'info_holiday' | 'info_checked_out' | 'info_no_camera' | 'info_system_disabled';

// --- Main Component ---
export default function AbsenPage() {
  const [status, setStatus] = useState<FeedbackStatus>('idle');
  const [locationError, setLocationError] = useState<string | null>(null);
  const { user, isUserLoading } = useUser();
  const firestore = useFirestore();
  const { toast } = useToast();
  const router = useRouter();
  
  const [hasCameraPermission, setHasCameraPermission] = useState<boolean | null>(null);
  const [isScannerReady, setIsScannerReady] = useState(false);
  const [scanSuccess, setScanSuccess] = useState(false);
  const html5QrCodeRef = useRef<Html5Qrcode | null>(null);
  const readerId = "qr-reader";

  // --- Firestore Data Hooks ---
  const userDocRef = useMemoFirebase(() => user ? doc(firestore, 'users', user.uid) : null, [firestore, user]);
  const { data: userData, isLoading: isUserDataLoading } = useDoc(user, userDocRef);
  const schoolConfigRef = useMemoFirebase(() => firestore ? doc(firestore, 'schoolConfig', 'default') : null, [firestore]);
  const { data: schoolConfig, isLoading: isConfigLoading } = useDoc(user, schoolConfigRef);
  const monthlyConfigId = useMemo(() => format(new Date(), 'yyyy-MM'), []);
  const monthlyConfigRef = useMemoFirebase(() => firestore ? doc(firestore, 'monthlyConfigs', monthlyConfigId) : null, [firestore, monthlyConfigId]);
  const { data: monthlyConfig, isLoading: isMonthlyConfigLoading } = useDoc(user, monthlyConfigRef);
  
  const todaysAttendanceQuery = useMemoFirebase(() => {
    if (!user || !firestore) return null;
    const todayStr = format(new Date(), 'yyyy-MM-dd');
    return query(collection(firestore, 'users', user.uid, 'attendanceRecords'), where('date', '==', todayStr));
  }, [user, firestore]);
  const { data: todaysAttendance, isLoading: isAttendanceLoading } = useCollection(user, todaysAttendanceQuery);
  const todaysRecord = useMemo(() => todaysAttendance?.[0], [todaysAttendance]);

  // --- Derived State ---
  const isDataLoading = isUserLoading || isUserDataLoading || isConfigLoading || isAttendanceLoading || isMonthlyConfigLoading;
  const isCameraInitializing = hasCameraPermission === null;
  
  const isSystemDisabled = useMemo(() => schoolConfig?.isAttendanceActive === false, [schoolConfig]);
  const isHoliday = useMemo(() => {
    if (!schoolConfig) return false;
    const today = new Date(), todayStr = format(today, 'yyyy-MM-dd');
    if (monthlyConfig?.holidays?.includes(todayStr)) return true;
    const offDays: number[] = schoolConfig.offDays ?? [0, 6];
    return offDays.includes(today.getDay());
  }, [schoolConfig, monthlyConfig]);
  const hasCompletedAttendance = useMemo(() => !!(todaysRecord?.checkInTime && todaysRecord?.checkOutTime), [todaysRecord]);

  const effectiveStatus: FeedbackStatus = useMemo(() => {
      if (status !== 'idle') return status;
      if (isDataLoading) return 'idle';
      if (isSystemDisabled) return 'info_system_disabled';
      if (hasCompletedAttendance) return 'info_checked_out';
      if (isHoliday) return 'info_holiday';
      if (hasCameraPermission === false) return 'info_no_camera';
      return 'idle';
  }, [status, isDataLoading, isSystemDisabled, hasCompletedAttendance, isHoliday, hasCameraPermission]);

  const showScanner = !isDataLoading && hasCameraPermission && !isSystemDisabled && !isHoliday && !hasCompletedAttendance;
  const showLoader = isDataLoading || isCameraInitializing || (showScanner && !isScannerReady);

  const handleAttendance = useCallback(async () => {
    setLocationError(null);
    if (!user || !firestore || !schoolConfig || !userData) {
        setStatus('error_generic');
        return toast({ title: 'Gagal', description: 'Data pengguna atau konfigurasi tidak siap.', variant: 'destructive' });
    }
    setStatus('processing');
    
    let isCheckInTime = false, isCheckOutTime = false;
    if (schoolConfig.useTimeValidation) {
        const now = new Date();
        const dayOfWeek = now.getDay();
        const currentTime = now.getHours() * 60 + now.getMinutes();

        const [inStartH, inStartM] = schoolConfig.checkInStartTime.split(':').map(Number);
        const checkInStartTime = inStartH * 60 + inStartM;
        const [inEndH, inEndM] = schoolConfig.checkInEndTime.split(':').map(Number);
        const checkInEndTime = inEndH * 60 + inEndM;
        isCheckInTime = currentTime >= checkInStartTime && currentTime <= checkInEndTime;

        const dailyCheckoutConfig = schoolConfig.checkOutTimes?.[dayOfWeek];
        if (dailyCheckoutConfig && dailyCheckoutConfig.start && dailyCheckoutConfig.end) {
            const [outStartH, outStartM] = dailyCheckoutConfig.start.split(':').map(Number);
            const checkOutStartTime = outStartH * 60 + outStartM;
            const [outEndH, outEndM] = dailyCheckoutConfig.end.split(':').map(Number);
            const checkOutEndTime = outEndH * 60 + outEndM;
            isCheckOutTime = currentTime >= checkOutStartTime && currentTime <= checkOutEndTime;
        } else {
            if (schoolConfig.checkOutStartTime && schoolConfig.checkOutEndTime) {
                const [outStartH, outStartM] = schoolConfig.checkOutStartTime.split(':').map(Number);
                const checkOutStartTime = outStartH * 60 + outStartM;
                const [outEndH, outEndM] = schoolConfig.checkOutEndTime.split(':').map(Number);
                const checkOutEndTime = outEndH * 60 + outEndM;
                isCheckOutTime = currentTime >= checkOutStartTime && currentTime <= checkOutEndTime;
            }
        }
        
        if (!isCheckInTime && !isCheckOutTime) return setStatus('error_time');
    } else {
        if (todaysRecord && !todaysRecord.checkOutTime) {
            isCheckOutTime = true;
        } else {
            isCheckInTime = true;
        }
    }

    try {
        let latitude: number | null = null, longitude: number | null = null;
        if (schoolConfig.useLocationValidation) {
            setStatus('locating');
            try {
                const pos = await getCurrentPosition({ enableHighAccuracy: true, timeout: 20000, maximumAge: 0 });
                latitude = pos.coords.latitude; longitude = pos.coords.longitude;
                if (schoolConfig.radius && schoolConfig.latitude && schoolConfig.longitude) {
                    if (getDistance(latitude, longitude, schoolConfig.latitude, schoolConfig.longitude) > schoolConfig.radius) return setStatus('error_radius');
                }
            } catch (error: any) {
                let specificError = 'Gagal mendapatkan lokasi. Pastikan GPS dan izin lokasi aktif.';
                if (error.code === 1) specificError = 'Akses lokasi ditolak. Izinkan di pengaturan perangkat.';
                setLocationError(specificError); return setStatus('error_location');
            }
        }

        setStatus('processing');
        const now = new Date();
        const todayStr = format(now, 'yyyy-MM-dd');
        
        const denormalizedUserData = {
            userName: userData.name || null,
            userNip: userData.nip || null,
        };

        if (isCheckInTime) {
            if (todaysRecord?.checkInTime) return setStatus('error_already_in');

            const [endH, endM] = schoolConfig.checkInEndTime.split(':').map(Number);
            const checkInDeadline = new Date(now); checkInDeadline.setHours(endH, endM, 0, 0);
            const description = isBefore(now, checkInDeadline) ? 'Hadir' : 'Terlambat';

            if (todaysRecord) {
                const recordRef = doc(firestore, 'users', user.uid, 'attendanceRecords', todaysRecord.id);
                await updateDoc(recordRef, { checkInTime: now, checkInLatitude: latitude, checkInLongitude: longitude, status: 'Hadir', description: description, ...denormalizedUserData });
            } else {
                await addDoc(collection(firestore, 'users', user.uid, 'attendanceRecords'), { userId: user.uid, date: todayStr, checkInTime: now, checkInLatitude: latitude, checkInLongitude: longitude, checkOutTime: null, status: 'Hadir', description: 'Belum Absen Pulang', ...denormalizedUserData });
            }
            setStatus('success_in');

        } else if (isCheckOutTime) {
            if (todaysRecord?.checkOutTime) return setStatus('error_already_out');

            if (todaysRecord) {
                const recordRef = doc(firestore, 'users', user.uid, 'attendanceRecords', todaysRecord.id);
                
                let finalDescription = 'Kehadiran Penuh';
                if (todaysRecord.checkInTime) {
                    const checkInTime = todaysRecord.checkInTime.toDate();
                    const [endH, endM] = schoolConfig.checkInEndTime.split(':').map(Number);
                    const checkInDeadline = new Date(checkInTime); checkInDeadline.setHours(endH, endM, 0, 0);
                    if (isBefore(checkInDeadline, checkInTime)) {
                        finalDescription = 'Terlambat';
                    }
                }
                await updateDoc(recordRef, { checkOutTime: now, checkOutLatitude: latitude, checkOutLongitude: longitude, description: finalDescription });
                setStatus('success_out');
            } else {
                await addDoc(collection(firestore, 'users', user.uid, 'attendanceRecords'), {
                    userId: user.uid,
                    date: todayStr,
                    checkInTime: null,
                    checkOutTime: now,
                    checkOutLatitude: latitude,
                    checkOutLongitude: longitude,
                    status: 'Hadir', 
                    description: 'Tidak Absen Masuk', 
                    ...denormalizedUserData
                });
                setStatus('success_out');
            }
        }
    } catch (error) {
        console.error("Error during attendance handling:", error);
        setStatus('error_generic');
    }
  }, [user, firestore, schoolConfig, todaysRecord, toast, userData]);
  
  const statusRef = useRef(status); statusRef.current = status;
  const handleAttendanceRef = useRef(handleAttendance); handleAttendanceRef.current = handleAttendance;

  const handleCloseRedirect = useCallback(() => {
    router.push('/dashboard'); 
  }, [router]);

  useEffect(() => {
    let isMounted = true;
    Html5Qrcode.getCameras().then(devices => isMounted && setHasCameraPermission(!!(devices && devices.length))).catch(() => isMounted && setHasCameraPermission(false));
    return () => { isMounted = false; };
  }, []);

  const onScanSuccess = useCallback((decodedText: string) => {
    if (statusRef.current === 'idle' && schoolConfig?.qrCodeValue) {
        if (decodedText === schoolConfig.qrCodeValue) {
            setScanSuccess(true);
            toast({ title: 'QR Code Terdeteksi' });
            handleAttendanceRef.current();
        } else {
            toast({ variant: 'destructive', title: 'QR Code Tidak Valid' });
        }
    }
  }, [schoolConfig, toast]);

  useEffect(() => {
    if (showScanner && status === 'idle') {
        const qrCode = html5QrCodeRef.current || new Html5Qrcode(readerId, { verbose: false });
        html5QrCodeRef.current = qrCode;

        if (qrCode.getState() !== 2) { // 2: SCANNING
            setIsScannerReady(false);
            const config: Html5QrcodeCameraScanConfig = { fps: 10 };
            qrCode.start({ facingMode: 'environment' }, config, onScanSuccess, undefined)
            .then(() => { if (html5QrCodeRef.current) setIsScannerReady(true); })
            .catch(err => console.error('Gagal memulai QR scanner', err));
        }
    } 
    return () => {
        if (html5QrCodeRef.current?.isScanning) {
            html5QrCodeRef.current.stop().then(() => setIsScannerReady(false)).catch(err => console.warn("Gagal menghentikan QR scanner.", err));
            html5QrCodeRef.current = null;
        }
    };
  }, [showScanner, status, onScanSuccess]);

  const handleOnClose = useMemo(() => {
    const isSuccessOrFinished = ['success_in', 'success_out', 'info_checked_out', 'info_holiday', 'info_system_disabled'].includes(effectiveStatus);
    return isSuccessOrFinished ? handleCloseRedirect : () => setStatus('idle');
  }, [effectiveStatus, handleCloseRedirect]);

  const borderColor = scanSuccess ? 'border-green-500' : (isScannerReady ? 'border-white' : 'border-foreground');

  return (
    <PageWrapper>
      <div className="relative w-full bg-background" style={{ height: 'calc(100vh - 68px)' }}>
        {(showScanner || isCameraInitializing) && (
          <div className="absolute inset-0 z-0">
            <div id={readerId} className="w-full h-full" />
            <style>{`
                #${readerId} > video { width: 100% !important; height: 100% !important; object-fit: cover !important; opacity: ${isScannerReady ? 1 : 0}; transition: opacity 0.5s ease-in-out; }
                #${readerId}__scan_region, #${readerId}__dashboard_section_csr { display: none !important; }
            `}</style>
          </div>
        )}

        <div className="relative z-10 flex flex-col items-center justify-between p-4 py-8 text-center w-full h-full pointer-events-none">
          <div className="w-full pointer-events-auto">
            <h1 className={cn("text-3xl font-bold tracking-tight", isScannerReady ? 'text-white' : 'text-foreground', 'dark:text-white')} style={{ textShadow: '0 2px 4px rgba(0,0,0,0.5)' }}>Pindai QR Code</h1>
            <p className={cn("mt-2", isScannerReady ? 'text-white/80' : 'text-muted-foreground', 'dark:text-white/80')} style={{ textShadow: '0 1px 3px rgba(0,0,0,0.5)' }}>Arahkan kamera ke QR Code yang ditampilkan.</p>
          </div>

          <div className="relative w-full max-w-[280px] sm:max-w-xs aspect-square">
            {(!isHoliday && !hasCompletedAttendance && !isSystemDisabled) && (
              <>
                <div className={cn("absolute top-0 left-0 w-1/4 h-1/4 border-t-4 border-l-4 rounded-tl-xl transition-colors duration-300", borderColor)} />
                <div className={cn("absolute top-0 right-0 w-1/4 h-1/4 border-t-4 border-r-4 rounded-tr-xl transition-colors duration-300", borderColor)} />
                <div className={cn("absolute bottom-0 left-0 w-1/4 h-1/4 border-b-4 border-l-4 rounded-bl-xl transition-colors duration-300", borderColor)} />
                <div className={cn("absolute bottom-0 right-0 w-1/4 h-1/4 border-b-4 border-r-4 rounded-br-xl transition-colors duration-300", borderColor)} />
                {showLoader ? (
                  <div className="absolute inset-0 flex flex-col items-center justify-center text-muted-foreground dark:text-white/80">
                    <Loader2 className="h-10 w-10 animate-spin text-foreground dark:text-white" />
                    <p className="mt-4 text-sm font-medium">{isDataLoading ? 'Memuat data...' : 'Menyiapkan kamera...'}</p>
                  </div>
                ) : ( isScannerReady && <div className={cn("absolute top-1/2 -translate-y-1/2 left-0 w-full h-1 bg-red-500/70 shadow-[0_0_15px_3px_theme(colors.red.500)] animate-scan-line", { 'bg-green-400 shadow-[0_0_15px_3px_theme(colors.green.400)]': scanSuccess })} /> )}
              </>
            )}
          </div>
          <div className="w-full max-w-md h-10 pointer-events-auto" />
        </div>

        {effectiveStatus !== 'idle' && <StatusFeedbackOverlay status={effectiveStatus} locationError={locationError} onClose={handleOnClose} userData={userData} />}
      </div>
    </PageWrapper>
  );
}

// --- UI Sub-Components ---
const StatusFeedbackOverlay = ({ status, locationError, onClose, userData }: { status: FeedbackStatus, locationError: string | null, onClose: () => void, userData: any }) => {
    const feedback = useMemo(() => {
        switch (status) {
            case 'processing': return { icon: <Loader2 className="h-16 w-16 animate-spin text-primary" />, title: 'Memproses...', desc: 'Sedang memvalidasi absensi Anda.', cardClass: 'bg-background/90' };
            case 'locating': return { icon: <Loader2 className="h-16 w-16 animate-spin text-primary" />, title: 'Mencari Lokasi...', desc: 'Mohon tunggu, sedang mendapatkan data lokasi.', cardClass: 'bg-background/90' };
            case 'success_in': return { icon: <CheckCircle className="h-16 w-16 text-green-500" />, title: 'Absen Masuk Berhasil', desc: 'Kehadiran Anda telah terekam. Selamat beraktivitas!', cardClass: 'bg-green-50 dark:bg-green-950/50 border-green-800' };
            case 'success_out': return { icon: <CheckCircle className="h-16 w-16 text-blue-500" />, title: 'Absen Pulang Berhasil', desc: 'Absen pulang terekam. Hati-hati di jalan!', cardClass: 'bg-blue-50 dark:bg-blue-950/50 border-blue-800' };
            case 'error_radius': return { icon: <MapPin className="h-16 w-16 text-destructive" />, title: 'Gagal: Di Luar Radius', desc: 'Anda harus berada di dalam area sekolah untuk absensi.', cardClass: 'bg-destructive/10 border-destructive' };
            case 'error_time': return { icon: <Clock className="h-16 w-16 text-destructive" />, title: 'Gagal: Di Luar Jam Absen', desc: 'Waktu absensi belum dibuka atau sudah ditutup.', cardClass: 'bg-destructive/10 border-destructive' };
            case 'error_already_in': return { icon: <X className="h-16 w-16 text-destructive" />, title: 'Gagal: Sudah Absen Masuk', desc: 'Anda sudah melakukan absensi masuk hari ini.', cardClass: 'bg-destructive/10 border-destructive' };
            case 'error_already_out': return { icon: <X className="h-16 w-16 text-destructive" />, title: 'Gagal: Sudah Absen Pulang', desc: 'Anda sudah melakukan absensi pulang hari ini.', cardClass: 'bg-destructive/10 border-destructive' };
            case 'error_location': return { icon: <MapPin className="h-16 w-16 text-destructive" />, title: 'Gagal: Lokasi Error', desc: locationError || 'Pastikan GPS aktif dan berikan izin akses.', cardClass: 'bg-destructive/10 border-destructive' };
            case 'info_system_disabled': return { icon: <AlertTriangle className="h-16 w-16 text-destructive" />, title: 'Sistem Dinonaktifkan', desc: 'Sistem absensi telah dinonaktifkan sementara oleh Administrator.', cardClass: 'bg-destructive/10 border-destructive' };
            case 'info_holiday': return { icon: <CalendarOff className="h-16 w-16 text-blue-500" />, title: 'Hari Libur', desc: 'Absensi tidak aktif pada hari libur rutin atau yang telah ditentukan.', cardClass: 'bg-blue-50 dark:bg-blue-950/50 border-blue-800' };
            case 'info_checked_out': return { icon: <CheckCircle className="h-16 w-16 text-green-500" />, title: 'Absensi Selesai', desc: 'Anda telah menyelesaikan absensi untuk hari ini.', cardClass: 'bg-green-50 dark:bg-green-950/50 border-green-800' };
            case 'info_no_camera': return { icon: <CameraOff className="h-16 w-16 text-destructive" />, title: 'Kamera Tidak Tersedia', desc: 'Izinkan akses kamera di pengaturan browser, lalu segarkan halaman ini.', cardClass: 'bg-destructive/10 border-destructive' };
            default: return { icon: <AlertTriangle className="h-16 w-16 text-destructive" />, title: 'Gagal: Terjadi Kesalahan', desc: 'Silakan coba lagi beberapa saat.', cardClass: 'bg-destructive/10 border-destructive' };
        }
    }, [status, locationError]);

    const showQuote = useMemo(() => (status === 'success_in' || status === 'success_out') && userData?.role !== 'admin', [status, userData]);
    const attendanceType = useMemo(() => {
        if (status === 'success_in') return 'in';
        if (status === 'success_out') return 'out';
        return null;
    }, [status]);

    if (status === 'idle') return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm" onClick={onClose}>
            <Card className={cn("w-full max-w-xs text-center shadow-2xl m-4", feedback.cardClass)} onClick={(e) => e.stopPropagation()}>
                <Button variant="ghost" size="icon" className="absolute top-2 right-2 text-current/60 hover:text-current/90" onClick={onClose}><X className="h-5 w-5" /><span className="sr-only">Tutup</span></Button>
                <CardHeader className="items-center pt-8"><div className="mb-4">{feedback.icon}</div><CardTitle className="text-2xl font-bold">{feedback.title}</CardTitle></CardHeader>
                <CardContent className="pb-8">
                    <p className="text-muted-foreground ">{feedback.desc}</p>
                    {showQuote && attendanceType && <QuoteOfTheDay category={userData?.role} attendanceType={attendanceType} />}
                </CardContent>
            </Card>
        </div>
    );
};
