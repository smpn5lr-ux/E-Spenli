'use client';

import { doc, getDoc, collection, getDocs, query, where, collectionGroup, DocumentData, Timestamp, writeBatch, serverTimestamp } from 'firebase/firestore';
import { eachDayOfInterval, isWithinInterval, startOfMonth, endOfMonth, startOfDay, format, isAfter, endOfDay, parseISO } from 'date-fns';
import type { Firestore } from 'firebase/firestore';

// --- STATUS LOGIC & LABELS REFINED ---

export type CoreStatus = 'Hadir' | 'Izin' | 'Alpa';

// --- FINAL KEY CORRECTION ---
// Based on user feedback, the key for full attendance is likely simpler.
const LABEL_KEYS = {
  PRESENT: 'present', // Changed from 'present_full' to 'present'
  LATE: 'late',
  NO_CHECK_OUT: 'no_check_out',
  NO_CHECK_IN: 'no_check_in', // Added for completeness
  SICK: 'sick',
  PERMISSION: 'permission',
  OFFICIAL_DUTY: 'official_duty',
  ABSENT: 'absent',
  PENDING_APPROVAL: 'pending_approval',
  ADMIN_CORRECTION: 'admin_correction',
};

// Default labels, used as a fallback if not configured by the admin.
const DEFAULT_LABELS: { [key: string]: string } = {
  [LABEL_KEYS.PRESENT]: 'Kehadiran Penuh',
  [LABEL_KEYS.LATE]: 'Terlambat',
  [LABEL_KEYS.NO_CHECK_OUT]: 'Tidak Absen Pulang',
  [LABEL_KEYS.NO_CHECK_IN]: 'Tidak Absen Masuk',
  [LABEL_KEYS.SICK]: 'Sakit',
  [LABEL_KEYS.PERMISSION]: 'Izin',
  [LABEL_KEYS.OFFICIAL_DUTY]: 'Dinas',
  [LABEL_KEYS.ABSENT]: 'Alpa',
  [LABEL_KEYS.PENDING_APPROVAL]: 'Menunggu Persetujuan',
  [LABEL_KEYS.ADMIN_CORRECTION]: 'Perbaikan Admin',
};

// --- INTERFACES ---

interface RawAttendanceData {
    id: string;
    date: string; 
    description: string;
    checkInTime?: Timestamp;
    checkOutTime?: Timestamp;
    isLate?: boolean;
    adminEdited?: boolean;
    updatedAt?: Timestamp;
}

interface RawLeaveData {
    id: string;
    startDate: Timestamp;
    endDate: Timestamp;
    status: 'approved' | 'pending' | 'rejected';
    type: string; // e.g., Sakit, Izin, Dinas
    reason: string;
}

export interface MonthlyReportData {
    id: string;
    date: string;
    status: CoreStatus;
    keterangan: string;
    checkInTime: string | null;
    checkOutTime: string | null;
    isCancellable?: boolean;
}

// *** FINAL REFACTOR #4: FIX ADMIN EDITED STATUS INFERENCE ***
export async function fetchUserMonthlyReportData(
    firestore: Firestore,
    userId: string,
    currentMonth: Date,
    schoolConfig: any,
    monthlyConfig?: any
): Promise<MonthlyReportData[]> {
    const monthStart = startOfMonth(currentMonth);
    const monthEnd = endOfMonth(currentMonth);
    const today = new Date();

    const labels = { ...DEFAULT_LABELS, ...schoolConfig?.reportLabels };

    let effectiveMonthlyConfig = monthlyConfig;
    if (!effectiveMonthlyConfig) {
        const monthlyConfigSnap = await getDoc(doc(firestore, 'monthlyConfigs', format(monthStart, 'yyyy-MM')));
        effectiveMonthlyConfig = monthlyConfigSnap.data() || {};
    }

    const attendanceQuery = query(collection(firestore, 'users', userId, 'attendanceRecords'), where('date', '>=', format(monthStart, 'yyyy-MM-dd')), where('date', '<=', format(monthEnd, 'yyyy-MM-dd')));
    const leaveQuery = query(collection(firestore, 'users', userId, 'leaveRequests'));
    
    const [attendanceHistorySnap, leaveHistorySnap] = await Promise.all([ getDocs(attendanceQuery), getDocs(leaveQuery) ]);

    const attendanceMap = new Map<string, RawAttendanceData>(attendanceHistorySnap.docs.map(d => [d.data().date, { id: d.id, ...d.data() } as RawAttendanceData]));
    const leaveMap = new Map<string, RawLeaveData>();
    leaveHistorySnap.docs.forEach(leaveDoc => {
        const leave = { id: leaveDoc.id, ...leaveDoc.data() } as RawLeaveData;
        if (!leave.startDate || !leave.endDate) return;
        eachDayOfInterval({ start: leave.startDate.toDate(), end: leave.endDate.toDate() }).forEach(day => {
            if (isWithinInterval(day, { start: monthStart, end: monthEnd })) {
                leaveMap.set(format(day, 'yyyy-MM-dd'), leave);
            }
        });
    });

    const offDays: number[] = Array.isArray(schoolConfig?.offDays) ? schoolConfig.offDays : [0, 6];
    const holidays: string[] = Array.isArray(effectiveMonthlyConfig?.holidays) ? effectiveMonthlyConfig.holidays : [];

    const allDaysInMonth = eachDayOfInterval({ start: monthStart, end: monthEnd });
    const report: any[] = [];

    for (const day of allDaysInMonth) {
        const dayStr = format(day, 'yyyy-MM-dd');

        if (isAfter(day, endOfDay(today)) || offDays.includes(day.getDay()) || holidays.includes(dayStr)) {
            continue;
        }

        let recordForDay: {id: string, date: Date, status: CoreStatus, keterangan: string, checkInTime?: Timestamp, checkOutTime?: Timestamp, isCancellable?: boolean};
        const attendanceRecord = attendanceMap.get(dayStr);
        const leaveRecord = leaveMap.get(dayStr);

        // --- LOGIC REORDER & FIX ---
        // 1. Prioritize approved leave requests.
        if (leaveRecord && leaveRecord.status === 'approved') {
            let keteranganLabel = labels[LABEL_KEYS.PERMISSION]; 
            const leaveType = leaveRecord.type.toLowerCase();
            if (leaveType === 'sakit') { keteranganLabel = labels[LABEL_KEYS.SICK]; }
            else if (leaveType === 'dinas') { keteranganLabel = labels[LABEL_KEYS.OFFICIAL_DUTY]; }
            
            recordForDay = {
                id: leaveRecord.id, date: day, status: 'Izin',
                keterangan: leaveRecord.reason || keteranganLabel,
                isCancellable: isAfter(leaveRecord.startDate.toDate(), today)
            };
        }
        // 2. Handle admin-edited records, inferring status from description.
        else if (attendanceRecord && attendanceRecord.adminEdited) {
            const description = (attendanceRecord.description || '').toLowerCase();
            // Infer status from admin's text. Default to 'Hadir'.
            const isIzin = ['izin', 'sakit', 'dinas'].some(keyword => description.includes(keyword));
            const status: CoreStatus = isIzin ? 'Izin' : 'Hadir';

            recordForDay = {
                id: attendanceRecord.id, 
                date: day, 
                status: status, 
                keterangan: attendanceRecord.description || labels[LABEL_KEYS.ADMIN_CORRECTION],
                // Only show times if status is 'Hadir'
                checkInTime: status === 'Hadir' ? attendanceRecord.checkInTime : undefined,
                checkOutTime: status === 'Hadir' ? attendanceRecord.checkOutTime : undefined,
            };
        } 
        // 3. Handle standard attendance records.
        else if (attendanceRecord) {
            const hasCheckIn = !!attendanceRecord.checkInTime;
            const hasCheckOut = !!attendanceRecord.checkOutTime;
            let keterangan;

            if (attendanceRecord.isLate) {
                keterangan = labels[LABEL_KEYS.LATE];
            } else if (hasCheckIn && !hasCheckOut) {
                keterangan = labels[LABEL_KEYS.NO_CHECK_OUT];
            } else if (!hasCheckIn && hasCheckOut) {
                keterangan = labels[LABEL_KEYS.NO_CHECK_IN];
            } else {
                keterangan = labels[LABEL_KEYS.PRESENT];
            }

            recordForDay = {
                id: attendanceRecord.id, date: day, status: 'Hadir',
                keterangan: keterangan, checkInTime: attendanceRecord.checkInTime, checkOutTime: attendanceRecord.checkOutTime,
            };
        } 
        // 4. Handle absences (Alpa).
        else {
             if (leaveRecord && leaveRecord.status === 'pending') {
                 recordForDay = {
                    id: leaveRecord.id, date: day, status: 'Alpa',
                    keterangan: `${labels[LABEL_KEYS.PENDING_APPROVAL]}: ${leaveRecord.type || 'Izin'}`,
                    isCancellable: true
                 };
             } else {
                recordForDay = {
                    id: dayStr, date: day, status: 'Alpa',
                    keterangan: labels[LABEL_KEYS.ABSENT],
                };
             }
        }

        if (recordForDay) {
            report.push(recordForDay);
        }
    }

    report.sort((a, b) => b.date.getTime() - a.date.getTime());

    return report.map((item): MonthlyReportData => ({
        id: item.id,
        date: item.date.toISOString(),
        status: item.status,
        keterangan: item.keterangan,
        checkInTime: item.checkInTime?.toDate().toISOString() || null,
        checkOutTime: item.checkOutTime?.toDate().toISOString() || null,
        isCancellable: item.isCancellable || false,
    }));
}


export async function getDailyStaffAttendanceStats(firestore: Firestore) {
    const today = new Date();
    const todayStr = format(today, 'yyyy-MM-dd');

    const usersQuery = query(collection(firestore, 'users'), where('role', 'in', ['guru', 'pegawai', 'kepala_sekolah']));
    const usersSnap = await getDocs(usersQuery);
    const allStaff = usersSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    const staffIds = allStaff.map(s => s.id);

    if (staffIds.length === 0) {
        return { totalStaff: 0, hadir: 0, izin: 0, sakit: 0, alpa: 0, pendingLeave: 0, pendingLate: 0, totalLate: 0 };
    }

    const attendanceQuery = query(collectionGroup(firestore, 'attendanceRecords'), where('date', '==', todayStr));
    const leaveQuery = query(collectionGroup(firestore, 'leaveRequests'));
    const lateSubmissionQuery = query(collectionGroup(firestore, 'lateSubmissions'), where('date', '==', todayStr));

    const [attendanceSnap, leaveSnap, lateSubmissionSnap] = await Promise.all([
        getDocs(attendanceQuery),
        getDocs(leaveQuery),
        getDocs(lateSubmissionQuery)
    ]);

    const presentUserIds = new Set<string>();
    attendanceSnap.forEach(doc => {
        const userId = doc.ref.parent.parent?.id;
        if (userId && staffIds.includes(userId)) {
            presentUserIds.add(userId);
        }
    });

    let izinCount = 0, sakitCount = 0, pendingLeaveCount = 0;
    const onLeaveUserIds = new Set<string>();
    leaveSnap.forEach(doc => {
        const leave = doc.data() as RawLeaveData;
        const userId = doc.ref.parent.parent?.id;

        if (userId && staffIds.includes(userId)) {
            const isTodayInLeaveInterval = isWithinInterval(today, {
                start: startOfDay(leave.startDate.toDate()),
                end: endOfDay(leave.endDate.toDate())
            });

            if (isTodayInLeaveInterval) {
                 if (leave.status === 'approved') {
                    onLeaveUserIds.add(userId);
                    if (leave.type.toLowerCase() === 'sakit') {
                        sakitCount++;
                    } else {
                        izinCount++;
                    }
                } else if (leave.status === 'pending') {
                    pendingLeaveCount++;
                }
            }
        }
    });

    let pendingLateCount = 0;
    let totalLateCount = 0;
    lateSubmissionSnap.forEach(doc => {
        const submission = doc.data();
        const userId = doc.ref.parent.parent?.id;
        if (userId && staffIds.includes(userId)) {
            totalLateCount++;
            if (submission.status === 'pending') {
                pendingLateCount++;
            }
        }
    });

    const hadirCount = presentUserIds.size;
    const alpaCount = allStaff.filter(user => !presentUserIds.has(user.id) && !onLeaveUserIds.has(user.id)).length;

    return {
        totalStaff: allStaff.length,
        hadir: hadirCount,
        izin: izinCount,
        sakit: sakitCount,
        alpa: alpaCount,
        pendingLeave: pendingLeaveCount,
        pendingLate: pendingLateCount,
        totalLate: totalLateCount
    };
}

export async function calculateAttendanceStats(firestore: Firestore, userId: string, currentMonth: Date) {
    const monthStart = startOfMonth(currentMonth);
    const [schoolConfigSnap, monthlyConfigSnap] = await Promise.all([
        getDoc(doc(firestore, 'schoolConfig', 'default')),
        getDoc(doc(firestore, 'monthlyConfigs', format(monthStart, 'yyyy-MM'))),
    ]);
    const schoolConfig = schoolConfigSnap.data() || {};
    const monthlyConfig = monthlyConfigSnap.data() || {};
    const offDays: number[] = schoolConfig?.offDays ?? [0, 6];
    const holidays: string[] = Array.isArray(monthlyConfig?.holidays) ? monthlyConfig.holidays : [];
    const allDaysInMonth = eachDayOfInterval({ start: startOfMonth(currentMonth), end: endOfMonth(currentMonth) });
    const effectiveWorkingDays = allDaysInMonth.filter(day => !offDays.includes(day.getDay()) && !holidays.includes(format(day, 'yyyy-MM-dd')) && !isAfter(day, new Date()));
    const totalWorkingDays = effectiveWorkingDays.length;
    const dailyStatuses = await fetchUserMonthlyReportData(firestore, userId, currentMonth, schoolConfig, monthlyConfig);
    if (totalWorkingDays === 0) return { totalHadir: 0, totalIzin: 0, totalSakit: 0, totalAlpa: 0, percentage: 100.0, dailyStatuses: [] };
    let totalHadir = 0, totalIzin = 0, totalAlpa = 0;
    dailyStatuses.forEach(report => {
        if (report.status === 'Hadir') totalHadir++;
        else if (report.status === 'Izin') totalIzin++;
        else if (report.status === 'Alpa') totalAlpa++;
    });
    const percentage = totalWorkingDays > 0 ? ((totalHadir + totalIzin) / totalWorkingDays) * 100 : 100;
    return { totalHadir, totalIzin, totalSakit: 0, totalAlpa, percentage: Math.min(percentage, 100), dailyStatuses };
}
