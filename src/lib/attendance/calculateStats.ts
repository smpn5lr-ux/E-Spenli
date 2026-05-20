'use client';

import { collection, getDocs, query, where, doc, getDoc, Timestamp } from 'firebase/firestore';
import { format, startOfMonth, endOfMonth, eachDayOfInterval, isWithinInterval } from 'date-fns';
import { id as localeId } from 'date-fns/locale';

const mapLeaveTypeToStatusKey = (leaveType: string): string => {
    switch(leaveType) {
        case 'Sakit': return 'permission'; // Assuming 'Sakit' and 'Izin' use the same weight key
        case 'Izin': return 'permission';
        case 'Dinas': return 'official_duty';
        default: return 'absent'; // Default to absent if type is unknown
    }
};

export async function calculateMultipleUserStats(firestore: any, users: any[], month: Date) {
    if (!firestore) {
        console.error("Firestore instance is not available.");
        return [];
    }

    const schoolConfigRef = doc(firestore, 'schoolConfig', 'default');
    const schoolConfigSnap = await getDoc(schoolConfigRef);
    const schoolConfig = schoolConfigSnap.exists() ? schoolConfigSnap.data() : {};
    const weights = schoolConfig.attendanceWeights || {};
    const presentWeight = weights.present ?? 1;

    const monthStart = startOfMonth(month);
    const monthEnd = endOfMonth(month);

    const activeDaysInMonth = eachDayOfInterval({ start: monthStart, end: monthEnd }).filter(day => {
        const offDays = schoolConfig.offDays ?? [0, 6]; // Default Saturday, Sunday
        return !offDays.includes(day.getDay());
    }).length;

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
        const leaveRecords = new Map();
        leaveSnapshot.docs.forEach(docSnap => {
            const leave = docSnap.data();
            const startDate = (leave.startDate as Timestamp).toDate();
            const endDate = (leave.endDate as Timestamp).toDate();
            eachDayOfInterval({ start: startDate, end: endDate }).forEach(day => {
                if (isWithinInterval(day, { start: monthStart, end: monthEnd })) {
                    leaveRecords.set(format(day, 'yyyy-MM-dd'), leave.type); // e.g., 'Izin', 'Sakit'
                }
            });
        });

        let totalScore = 0;
        let totalHadir = 0, totalIzin = 0, totalSakit = 0, totalAlpa = 0, totalDinas = 0;

        eachDayOfInterval({ start: monthStart, end: monthEnd }).forEach(day => {
            const dayStr = format(day, 'yyyy-MM-dd');
            const dayOfWeek = day.getDay();

            if ((schoolConfig.offDays ?? [0, 6]).includes(dayOfWeek)) {
                return; // Skip off-days
            }

            let statusKey = 'absent'; // Default to absent
            let leaveType = null;

            if (attendanceRecords.has(dayStr)) {
                const record = attendanceRecords.get(dayStr);
                statusKey = record.statusKey || 'present'; // Use pre-calculated status if available
                if (statusKey === 'present') totalHadir++;
            } else if (leaveRecords.has(dayStr)) {
                leaveType = leaveRecords.get(dayStr);
                statusKey = mapLeaveTypeToStatusKey(leaveType);
                if (leaveType === 'Izin') totalIzin++;
                else if (leaveType === 'Sakit') totalSakit++;
                else if (leaveType === 'Dinas') totalDinas++;
            } else {
                totalAlpa++;
            }
            
            totalScore += weights[statusKey] ?? 0;
        });
        
        const maxScore = activeDaysInMonth * presentWeight;
        const percentage = maxScore > 0 ? (totalScore / maxScore) * 100 : 0;

        return {
            userId: user.id,
            name: user.name,
            nip: user.nip,
            role: user.role,
            totalHadir,
            totalIzin: totalIzin + totalDinas, // Combine Izin and Dinas for display as requested previously
            totalSakit,
            totalAlpa,
            percentage: Math.min(100, percentage), // Cap at 100%
        };
    });

    return Promise.all(userPromises);
}