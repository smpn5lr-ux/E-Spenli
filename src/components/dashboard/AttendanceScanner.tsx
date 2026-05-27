'use client';

import { useState } from 'react';
import { QrReader } from 'react-qr-reader';
import { useUser, useFirestore } from '@/firebase';
import { doc, getDoc, updateDoc, serverTimestamp, collection, addDoc, query, where, getDocs, limit } from 'firebase/firestore';
import { Loader2, AlertCircle } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

const AttendanceScanner = ({ schoolConfig, onSuccess }: any) => {
    const { user } = useUser();
    const firestore = useFirestore();
    const [error, setError] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);

    const handleScan = async (result: any, error: any) => {
        if (!!result && !loading) {
            setLoading(true);
            setError(null); // Reset error state on new scan

            // Immediately exit if user is not available
            if (!user) {
                setError('Sesi pengguna tidak ditemukan. Silakan muat ulang halaman.');
                setLoading(false);
                return;
            }

            const data = result?.text;

            try {
                if (data === schoolConfig.qrCode) {
                    const today = new Date();
                    const todayStr = today.toISOString().split('T')[0];
                    const attendanceRef = collection(firestore, 'users', user.uid, 'attendanceRecords');
                    const q = query(attendanceRef, where('date', '==', todayStr), limit(1));
                    const querySnapshot = await getDocs(q);

                    let attendanceRecord;
                    if (!querySnapshot.empty) {
                        attendanceRecord = querySnapshot.docs[0];
                    }

                    const now = serverTimestamp();
                    if (attendanceRecord) {
                        // Check if already checked out to prevent duplicate check-outs
                        if (attendanceRecord.data().checkOutTime) {
                            setError('Anda sudah melakukan absensi pulang hari ini.');
                            setLoading(false);
                            return;
                        }
                        await updateDoc(attendanceRecord.ref, { checkOutTime: now });
                        onSuccess({ type: 'check-out', time: new Date() });
                    } else {
                        const newRecord = {
                            date: todayStr,
                            checkInTime: now,
                            checkOutTime: null,
                            status: 'Hadir',
                        };
                        await addDoc(attendanceRef, newRecord);
                        onSuccess({ type: 'check-in', time: new Date() });
                    }
                } else {
                    setError('QR Code tidak valid. Silakan pindai QR Code yang benar.');
                }
            } catch (err) {
                setError('Terjadi kesalahan saat memproses absensi. Silakan coba lagi.');
                console.error(err);
            } finally {
                setLoading(false);
            }
        }

        if (!!error) {
            console.error(error);
            if (error.name === 'NotAllowedError' || error.name === 'PermissionDeniedError') {
                setError('Akses kamera ditolak. Mohon izinkan akses kamera di pengaturan browser Anda untuk melakukan absensi.');
            } else if (error.name === 'NotFoundError' || error.name === 'DevicesNotFoundError') {
                setError('Kamera tidak ditemukan. Pastikan kamera terpasang dan berfungsi dengan benar.');
            }
        }
    };

    return (
        <div className="relative w-full h-full flex flex-col items-center justify-center bg-gray-900 text-white">
            <div className="w-full max-w-md mx-auto aspect-square overflow-hidden rounded-2xl border-4 border-white relative">
                <QrReader
                    onResult={handleScan}
                    constraints={{ facingMode: 'environment' }}
                    className="w-full h-full"
                />
                 <div className="absolute inset-0 border-8 border-blue-500 rounded-lg animate-pulse" style={{ clipPath: 'polygon(0% 0%, 0% 25%, 25% 25%, 25% 0%, 75% 0%, 75% 25%, 100% 25%, 100% 75%, 75% 75%, 75% 100%, 25% 100%, 25% 75%, 0% 75%) '}} />
            </div>

            <div className="mt-6 text-center px-4">
                 <h1 className="text-2xl font-bold">Pindai QR Code Absensi</h1>
                 <p className="opacity-80 mt-2">Arahkan kamera ke QR Code yang ditampilkan untuk melakukan absensi masuk atau pulang.</p>
            </div>

            {loading && (
                <div className="absolute inset-0 bg-black bg-opacity-70 flex flex-col items-center justify-center z-10">
                    <Loader2 className="h-12 w-12 animate-spin text-white" />
                    <p className="mt-4 text-lg">Memproses absensi Anda...</p>
                </div>
            )}

            {error && (
                <div className="absolute inset-0 bg-background/90 backdrop-blur-sm flex items-center justify-center z-20 p-4">
                     <Alert variant="destructive" className="max-w-sm mx-auto">
                        <AlertCircle className="h-4 w-4" />
                        <AlertTitle>Gagal Memuat Kamera atau Absensi</AlertTitle>
                        <AlertDescription>{error}</AlertDescription>
                         <Button onClick={() => { setError(null); if (!/kamera/i.test(error)) window.location.reload(); }} variant="destructive" className="mt-4 w-full">
                             Tutup
                         </Button>
                    </Alert>
                </div>
            )}
        </div>
    );
};

export default AttendanceScanner;
