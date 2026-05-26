'use client';

import { collection, getDocs, query, where, doc, getDoc, Timestamp } from 'firebase/firestore';
import { format, startOfMonth, endOfMonth, eachDayOfInterval, isWithinInterval } from 'date-fns';
import { DEFAULT_WEIGHTS } from '@/lib/attendance';

const mapLeaveTypeToStatusKey = (leaveType: string): string => {
    switch(leaveType) {
        case 'Sakit': return 'sick';
        case 'Izin': return 'permission';
        case 'Dinas': return 'official_duty';
        default: return 'absent';
    }
};

export async function calculateMultipleUserStats(firestore: any, users: any[], month: Date) {
    if (!firestore) {
        console.error("Firestore instance is not available.");
        return [];
    }

    const monthStart = startOfMonth(month);
    const monthEnd = endOfMonth(month);
    const monthId = format(monthStart, 'yyyy-MM');

    // Mengambil konfigurasi sekolah dan hari libur
    const schoolConfigRef = doc(firestore, 'schoolConfig', 'default');
    const monthlyConfigRef = doc(firestore, 'monthlyConfigs', monthId);

    const [schoolConfigSnap, monthlyConfigSnap] = await Promise.all([
        getDoc(schoolConfigRef),
        getDoc(monthlyConfigRef)
    ]);

    const schoolConfig = schoolConfigSnap.exists() ? schoolConfigSnap.data() : {};
    const monthlyConfig = monthlyConfigSnap.exists() ? monthlyConfigSnap.data() : {};
    
    // Ambil bobot dinamis dari admin, fallback ke default jika kosong
    const weights = schoolConfig.attendanceWeights || DEFAULT_WEIGHTS;
    
    // Menghitung hari kerja efektif
    const recurringOffDays: number[] = schoolConfig.offDays ?? [0, 6];
    const specificHolidays = new Set(monthlyConfig.holidays ?? []);

    const workDaysInMonth = eachDayOfInterval({ start: monthStart, end: monthEnd }).filter(day => {
        const dayStr = format(day, 'yyyy-MM-dd');
        const dayOfWeek = day.getDay();
        return !recurringOffDays.includes(dayOfWeek) && !specificHolidays.has(dayStr);
    });
    
    const activeDaysInMonth = workDaysInMonth.length;
    
    if (activeDaysInMonth === 0) {
        return users.map(user => ({
            userId: user.id, name: user.name, nip: user.nip, role: user.role,
            totalHadir: 0, totalIzin: 0, totalSakit: 0, totalDinas: 0, totalAlpa: 0,
            totalScore: 0, maxScore: 0, percentage: 0,
        }));
    }

    // Skor maksimal dihitung dari jumlah hari efektif * bobot tertinggi (biasanya 'present')
    const maxWeight = weights.present || 1;
    const maxScore = activeDaysInMonth * maxWeight;

    const userPromises = users.map(async (user) => {
        const attendanceQuery = query(
            collection(firestore, 'users', user.id, 'attendanceRecords'),
            where('date', '>=', format(monthStart, 'yyyy-MM-dd')),
            where('date', '<=', format(monthEnd, 'yyyy-MM-dd'))
        );
        const leaveQuery = query(
            collection(firestore, 'users', user.id, 'leaveRequests'),
            where('status', '==', 'approved')
        );

        const [attendanceSnapshot, leaveSnapshot] = await Promise.all([
            getDocs(attendanceQuery),
            getDocs(leaveQuery)
        ]);

        const attendanceRecords = new Map(attendanceSnapshot.docs.map(doc => [doc.id, doc.data()]));
        const leaveRecords = new Map<string, string>();
        leaveSnapshot.docs.forEach(docSnap => {
            const leave = docSnap.data();
            const startDate = (leave.startDate as Timestamp).toDate();
            const endDate = (leave.endDate as Timestamp).toDate();
            eachDayOfInterval({ start: startDate, end: endDate }).forEach(day => {
                if (isWithinInterval(day, { start: monthStart, end: monthEnd })) {
                    leaveRecords.set(format(day, 'yyyy-MM-dd'), leave.type);
                }
            });
        });

        let totalPoin = 0;
        let totalHadir = 0, totalIzin = 0, totalSakit = 0, totalAlpa = 0, totalDinas = 0;

        workDaysInMonth.forEach(day => {
            const dayStr = format(day, 'yyyy-MM-dd');
            const record = attendanceRecords.get(dayStr);
            const leaveType = leaveRecords.get(dayStr);

            let statusKey: string;

            if (record) {
                if (record.statusKey) {
                    statusKey = record.statusKey;
                } else {
                    switch ((record.status || '').toLowerCase()) {
                        case 'hadir': statusKey = 'present'; break;
                        case 'terlambat': statusKey = 'late'; break;
                        case 'sakit': statusKey = 'sick'; break;
                        case 'izin': statusKey = 'permission'; break;
                        case 'dinas': statusKey = 'official_duty'; break;
                        case 'alpa': statusKey = 'absent'; break;
                        default: statusKey = 'present';
                    }
                }

                if (statusKey === 'present' || statusKey === 'late') {
                    totalHadir++;
                } else if (statusKey === 'permission') {
                    totalIzin++;
                } else if (statusKey === 'sick') {
                    totalSakit++;
                } else if (statusKey === 'official_duty') {
                    totalDinas++;
                } else if (statusKey === 'absent') {
                    totalAlpa++;
                }
            } else if (leaveType) {
                statusKey = mapLeaveTypeToStatusKey(leaveType);
                if (statusKey === 'permission') totalIzin++;
                else if (statusKey === 'sick') totalSakit++;
                else if (statusKey === 'official_duty') totalDinas++;
                else totalAlpa++;
            } else {
                statusKey = 'absent';
                totalAlpa++;
            }
            
            // Gunakan bobot dinamis dari konfigurasi admin
            totalPoin += (weights as any)[statusKey] ?? 0;
        });
        
        const percentage = maxScore > 0 ? (totalPoin / maxScore) * 100 : 0;

        return {
            userId: user.id,
            name: user.name,
            nip: user.nip,
            role: user.role,
            totalHadir,
            totalIzin,
            totalSakit,
            totalDinas,
            totalAlpa,
            totalScore: totalPoin,
            maxScore: maxScore,
            percentage: Math.min(100, percentage),
        };
    });

    return Promise.all(userPromises);
}