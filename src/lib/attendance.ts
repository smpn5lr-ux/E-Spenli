'use client';

import { doc, getDoc, collection, getDocs, query, where, collectionGroup, DocumentData, Timestamp, writeBatch, serverTimestamp } from 'firebase/firestore';
import { eachDayOfInterval, isWithinInterval, startOfMonth, endOfMonth, startOfDay, format, isAfter, endOfDay, parseISO } from 'date-fns';
import type { Firestore } from 'firebase/firestore';

export type CoreStatus = 'Hadir' | 'Izin' | 'Alpa';

const LABEL_KEYS = {
  PRESENT: 'present',
  LATE: 'late',
  NO_CHECK_OUT: 'no_check_out',
  NO_CHECK_IN: 'no_check_in',
  SICK: 'sick',
  PERMISSION: 'permission',
  OFFICIAL_DUTY: 'official_duty',
  ABSENT: 'absent',
  PENDING_APPROVAL: 'pending_approval',
  ADMIN_CORRECTION: 'admin_correction',
};

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

export const DEFAULT_WEIGHTS: { [key: string]: number } = {
  present: 1.0, late: 0.75, no_check_out: 0.5, no_check_in: 0.5, 
  sick: 0.75, permission: 0.5, official_duty: 1.0, absent: 0.0,
};

interface RawAttendanceData {
    id: string; date: string; description: string;
    checkInTime?: Timestamp; checkOutTime?: Timestamp;
    isLate?: boolean; adminEdited?: boolean; updatedAt?: Timestamp;
}

interface RawLeaveData {
    id: string; startDate: Timestamp; endDate: Timestamp;
    status: 'approved' | 'pending' | 'rejected';
    type: string; reason: string;
}

export interface MonthlyReportData {
    id: string; date: string; status: CoreStatus; keterangan: string;
    checkInTime: string | null; checkOutTime: string | null; isCancellable?: boolean;
}

// The faulty calculateAttendancePercentage function has been removed.

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
    if (typeof effectiveMonthlyConfig === 'undefined') {
        const monthlyConfigSnap = await getDoc(doc(firestore, 'monthlyConfigs', format(monthStart, 'yyyy-MM')));
        effectiveMonthlyConfig = monthlyConfigSnap.data(); // Will be undefined if not found, that's OK
    }

    const offDays: number[] = schoolConfig?.offDays ?? [0, 6];
    const holidays: string[] = Array.isArray(effectiveMonthlyConfig?.holidays) ? effectiveMonthlyConfig.holidays : [];

    const attendanceQuery = query(collection(firestore, 'users', userId, 'attendanceRecords'), where('date', '>=', format(monthStart, 'yyyy-MM-dd')), where('date', '<=', format(monthEnd, 'yyyy-MM-dd')));
    const leaveQuery = query(collection(firestore, 'users', userId, 'leaveRequests'));
    const [attendanceHistorySnap, leaveHistorySnap] = await Promise.all([getDocs(attendanceQuery), getDocs(leaveQuery)]);

    const attendanceMap = new Map(attendanceHistorySnap.docs.map(d => [d.data().date, { id: d.id, ...d.data() } as RawAttendanceData]));
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

    const allDaysInMonth = eachDayOfInterval({ start: monthStart, end: monthEnd });
    const report: any[] = [];

    for (const day of allDaysInMonth) {
        const dayStr = format(day, 'yyyy-MM-dd');
        if (isAfter(day, endOfDay(today)) || offDays.includes(day.getDay()) || holidays.includes(dayStr)) {
            continue;
        }

        const attendanceRecord = attendanceMap.get(dayStr);
        const leaveRecord = leaveMap.get(dayStr);
        let recordForDay;

        if (leaveRecord?.status === 'approved') {
            const leaveType = leaveRecord.type.toLowerCase();
            let keteranganLabel = labels[LABEL_KEYS.PERMISSION];
            if (leaveType === 'sakit') keteranganLabel = labels[LABEL_KEYS.SICK];
            else if (leaveType.includes('dinas')) keteranganLabel = labels[LABEL_KEYS.OFFICIAL_DUTY];
            recordForDay = { id: leaveRecord.id, date: day, status: 'Izin', keterangan: leaveRecord.reason || keteranganLabel, isCancellable: isAfter(leaveRecord.startDate.toDate(), today) };
        } else if (attendanceRecord?.adminEdited) {
            const desc = (attendanceRecord.description || '').toLowerCase();
            const isIzin = ['izin', 'sakit', 'dinas'].some(k => desc.includes(k));
            recordForDay = { id: attendanceRecord.id, date: day, status: isIzin ? 'Izin' : 'Hadir', keterangan: attendanceRecord.description || labels[LABEL_KEYS.ADMIN_CORRECTION], checkInTime: isIzin ? undefined : attendanceRecord.checkInTime, checkOutTime: isIzin ? undefined : attendanceRecord.checkOutTime };
        } else if (attendanceRecord) {
            let keterangan = labels[LABEL_KEYS.PRESENT];
            if (attendanceRecord.isLate) keterangan = labels[LABEL_KEYS.LATE];
            else if (!!attendanceRecord.checkInTime && !attendanceRecord.checkOutTime) keterangan = labels[LABEL_KEYS.NO_CHECK_OUT];
            else if (!attendanceRecord.checkInTime && !!attendanceRecord.checkOutTime) keterangan = labels[LABEL_KEYS.NO_CHECK_IN];
            recordForDay = { id: attendanceRecord.id, date: day, status: 'Hadir', keterangan, checkInTime: attendanceRecord.checkInTime, checkOutTime: attendanceRecord.checkOutTime };
        } else {
            if (leaveRecord?.status === 'pending') {
                recordForDay = { id: leaveRecord.id, date: day, status: 'Alpa', keterangan: `${labels[LABEL_KEYS.PENDING_APPROVAL]}: ${leaveRecord.type || 'Izin'}`, isCancellable: true };
            } else {
                recordForDay = { id: dayStr, date: day, status: 'Alpa', keterangan: labels[LABEL_KEYS.ABSENT] };
            }
        }
        report.push(recordForDay);
    }

    report.sort((a, b) => b.date.getTime() - a.date.getTime());
    return report.map(item => ({ ...item, date: item.date.toISOString(), checkInTime: item.checkInTime?.toDate().toISOString() || null, checkOutTime: item.checkOutTime?.toDate().toISOString() || null, isCancellable: item.isCancellable || false }));
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

    const [attendanceSnap, leaveSnap, lateSubmissionSnap] = await Promise.all([getDocs(attendanceQuery), getDocs(leaveQuery), getDocs(lateSubmissionQuery)]);

    const presentUserIds = new Set(attendanceSnap.docs.map(d => d.ref.parent.parent?.id).filter(id => typeof id === 'string' && staffIds.includes(id)));
    let izinCount = 0, sakitCount = 0, pendingLeaveCount = 0;
    const onLeaveUserIds = new Set<string>();

    leaveSnap.forEach(doc => {
        const leave = doc.data() as RawLeaveData;
        const userId = doc.ref.parent.parent?.id;
        if (userId && staffIds.includes(userId) && isWithinInterval(today, { start: startOfDay(leave.startDate.toDate()), end: endOfDay(leave.endDate.toDate()) })) {
            if (leave.status === 'approved') {
                onLeaveUserIds.add(userId);
                if (leave.type.toLowerCase() === 'sakit') sakitCount++; else izinCount++;
            } else if (leave.status === 'pending') {
                pendingLeaveCount++;
            }
        }
    });

    const alpaCount = allStaff.filter(user => !presentUserIds.has(user.id) && !onLeaveUserIds.has(user.id)).length;
    return {
        totalStaff: allStaff.length, hadir: presentUserIds.size, izin: izinCount, sakit: sakitCount, alpa: alpaCount,
        pendingLeave: pendingLeaveCount, totalLate: lateSubmissionSnap.size, pendingLate: lateSubmissionSnap.docs.filter(d => d.data().status === 'pending').length,
    };
}

export async function calculateAttendanceStats(firestore: Firestore, userId: string, currentMonth: Date) {
    const monthStart = startOfMonth(currentMonth);
    const [schoolConfigSnap, monthlyConfigSnap] = await Promise.all([
        getDoc(doc(firestore, 'schoolConfig', 'default')),
        getDoc(doc(firestore, 'monthlyConfigs', format(monthStart, 'yyyy-MM'))),
    ]);
    const schoolConfig = schoolConfigSnap.data() || {};
    const monthlyConfig = monthlyConfigSnap.data();

    // 1. Calculate total effective work days for the entire month
    const allDaysInMonth = eachDayOfInterval({ start: startOfMonth(currentMonth), end: endOfMonth(currentMonth) });
    const offDays = schoolConfig?.offDays ?? [0, 6];
    const holidays = monthlyConfig?.holidays ?? [];
    const totalEffectiveWorkDays = allDaysInMonth.filter(day => {
        const dayStr = format(day, 'yyyy-MM-dd');
        return !offDays.includes(day.getDay()) && !holidays.includes(dayStr);
    }).length;

    // 2. Fetch the attendance records for days that have passed
    const dailyStatuses = await fetchUserMonthlyReportData(firestore, userId, currentMonth, schoolConfig, monthlyConfig);
    
    // 3. Calculate score based on the records
    const weights = { ...DEFAULT_WEIGHTS, ...schoolConfig.attendanceWeights };
    const labels = { ...DEFAULT_LABELS, ...schoolConfig?.reportLabels };
    let totalScore = 0;

    dailyStatuses.forEach((record) => {
        if (record.status !== 'Alpa') {
            let points = 0;
            if (record.status === 'Hadir') {
                if (record.keterangan === labels[LABEL_KEYS.LATE]) points = weights.late;
                else if (record.keterangan === labels[LABEL_KEYS.NO_CHECK_OUT]) points = weights.no_check_out;
                else if (record.keterangan === labels[LABEL_KEYS.NO_CHECK_IN]) points = weights.no_check_in;
                else points = weights.present;
            } else if (record.status === 'Izin') {
                if (record.keterangan.toLowerCase().includes('dinas')) {
                    points = weights.official_duty;
                } else {
                    // This now correctly covers both 'Sakit' and regular 'Izin'
                    points = weights.permission;
                }
            }
            totalScore += points;
        }
    });

    // 4. Calculate the CORRECT percentage using total effective days as the denominator
    const percentage = totalEffectiveWorkDays > 0 ? (totalScore / totalEffectiveWorkDays) * 100 : 0;

    // 5. Count totals for the report table (Hadir, Izin, Sakit, Alpa)
    let totalHadir = 0, totalIzin = 0, totalSakit = 0, totalAlpa = 0;
    dailyStatuses.forEach(report => {
        if (report.status === 'Hadir') totalHadir++;
        else if (report.status === 'Izin') {
            if (report.keterangan.toLowerCase().includes('sakit')) totalSakit++;
            else totalIzin++;
        }
        else if (report.status === 'Alpa') totalAlpa++;
    });

    return {
        totalHadir, 
        totalIzin, 
        totalSakit, 
        totalAlpa, 
        percentage: Math.min(100, Math.max(0, percentage)), // Clamp percentage between 0 and 100
        dailyStatuses
    };
}
