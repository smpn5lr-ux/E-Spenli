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
  dinas_pagi: 0.5, dinas_siang: 0.5,
  early_leave: 0.5,
};

interface RawAttendanceData {
    id: string; date: string; description: string;
    checkInTime?: Timestamp; checkOutTime?: Timestamp;
    isLate?: boolean; adminEdited?: boolean; updatedAt?: Timestamp;
    status?: string;
}

interface RawLeaveData {
    id: string; startDate: Timestamp; endDate: Timestamp;
    status: 'approved' | 'pending' | 'rejected';
    type: string; reason: string;
}

export interface MonthlyReportData {
    id: string; date: string; status: CoreStatus; keterangan: string;
    checkInTime: string | null; checkOutTime: string | null; 
    leaveType?: string;
    isCancellable?: boolean;
}

export async function fetchUserMonthlyReportData(
    firestore: Firestore,
    userId: string,
    currentMonth: Date,
    schoolConfig: any,
    holidays: Set<string> 
): Promise<MonthlyReportData[]> {
    const monthStart = startOfMonth(currentMonth);
    const monthEnd = endOfMonth(currentMonth);
    const today = new Date();
    const labels = { ...DEFAULT_LABELS, ...schoolConfig?.reportLabels };
    const offDays: number[] = schoolConfig?.offDays ?? [0, 6];

    const attendanceQuery = query(collection(firestore, 'users', userId, 'attendanceRecords'), where('checkInTime', '>=', monthStart), where('checkInTime', '<', monthEnd));
    const leaveQuery = query(collection(firestore, 'users', userId, 'leaveRequests'));
    const [attendanceHistorySnap, leaveHistorySnap] = await Promise.all([getDocs(attendanceQuery), getDocs(leaveQuery)]);

    const attendanceMap = new Map(attendanceHistorySnap.docs.map(d => [format(d.data().checkInTime.toDate(), 'yyyy-MM-dd'), { id: d.id, ...d.data() } as RawAttendanceData]));
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
        if (isAfter(day, endOfDay(today)) || offDays.includes(day.getDay()) || holidays.has(dayStr)) {
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
            recordForDay = { 
                id: leaveRecord.id, 
                date: day, 
                status: 'Izin', 
                keterangan: leaveRecord.reason || keteranganLabel, 
                leaveType: leaveType,
                isCancellable: isAfter(leaveRecord.startDate.toDate(), today) 
            };
        } else if (attendanceRecord) {
            let keterangan = labels[LABEL_KEYS.PRESENT];
            if (attendanceRecord.status === 'late') keterangan = labels[LABEL_KEYS.LATE];
            else if (attendanceRecord.status === 'no_check_out') keterangan = labels[LABEL_KEYS.NO_CHECK_OUT];
            else if (attendanceRecord.status === 'no_check_in') keterangan = labels[LABEL_KEYS.NO_CHECK_IN];
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
    return report.map(item => ({ ...item, date: item.date.toISOString(), checkInTime: item.checkInTime?.toDate().toISOString() || null, checkOutTime: item.checkOutTime?.toDate().toISOString() || null, isCancellable: item.isCancellable || false, leaveType: item.leaveType || undefined }));
}

// FINAL FIX: Re-adding the deleted function with necessary adjustments.
export async function getDailyStaffAttendanceStats(firestore: Firestore) {
    const today = new Date();
    const todayStart = startOfDay(today);
    const todayEnd = endOfDay(today);

    const usersQuery = query(collection(firestore, 'users'), where('role', 'in', ['guru', 'pegawai', 'kepala_sekolah', 'teacher', 'staff']));
    const usersSnap = await getDocs(usersQuery);
    const allStaff = usersSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    const totalStaff = allStaff.length;

    if (totalStaff === 0) {
        return { totalStaff: 0, hadir: 0, izin: 0, sakit: 0, alpa: 0, pendingLeave: 0 };
    }

    // Query for attendance records for today
    const attendanceQuery = query(
        collectionGroup(firestore, 'attendanceRecords'), 
        where('checkInTime', '>=', todayStart),
        where('checkInTime', '<', todayEnd)
    );
    const attendanceSnap = await getDocs(attendanceQuery);
    const presentUserIds = new Set(attendanceSnap.docs.map(d => d.ref.parent.parent?.id).filter(id => id));

    // Query for leave requests covering today
    const leaveQuery = query(
        collectionGroup(firestore, 'leaveRequests'),
        where('startDate', '<=', Timestamp.fromDate(todayEnd)),
        where('endDate', '>=', Timestamp.fromDate(todayStart))
    );
    const leaveSnap = await getDocs(leaveQuery);

    let izinCount = 0;
    let sakitCount = 0;
    let pendingLeaveCount = 0;
    const onLeaveUserIds = new Set<string>();

    leaveSnap.forEach(doc => {
        const leave = doc.data() as RawLeaveData;
        const userId = doc.ref.parent.parent?.id;
        if (userId) {
            if (leave.status === 'approved') {
                onLeaveUserIds.add(userId);
                if (leave.type.toLowerCase() === 'sakit') {
                    sakitCount++;
                } else {
                    izinCount++; // Count all non-sick approved leaves as 'izin'
                }
            } else if (leave.status === 'pending') {
                pendingLeaveCount++;
            }
        }
    });
    
    // Calculate absentees: total staff minus those present and those on approved leave.
    const alpaCount = totalStaff - presentUserIds.size - onLeaveUserIds.size;

    return {
        totalStaff: totalStaff,
        hadir: presentUserIds.size,
        izin: izinCount,
        sakit: sakitCount,
        alpa: alpaCount > 0 ? alpaCount : 0, // Ensure it doesn't go negative
        pendingLeave: pendingLeaveCount,
    };
}

export async function calculateAttendanceStats(
    firestore: Firestore, 
    userId: string, 
    currentMonth: Date,
    schoolConfig: any, 
    holidays: Set<string>
) {
    const allDaysInMonth = eachDayOfInterval({ start: startOfMonth(currentMonth), end: endOfMonth(currentMonth) });
    const offDays = schoolConfig?.offDays ?? [0, 6];
    
    const totalEffectiveWorkDays = allDaysInMonth.filter(day => {
        const dayStr = format(day, 'yyyy-MM-dd');
        return !offDays.includes(day.getDay()) && !holidays.has(dayStr);
    }).length;

    const dailyStatuses = await fetchUserMonthlyReportData(firestore, userId, currentMonth, schoolConfig, holidays);
    
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
                const leaveType = record.leaveType || '';
                if (leaveType.includes('dinas full') || leaveType === 'official_duty') {
                  points = weights.official_duty;
                } else if (leaveType.includes('dinas pagi')) {
                  points = weights.dinas_pagi;
                } else if (leaveType.includes('dinas siang')) {
                  points = weights.dinas_siang;
                } else if (leaveType === 'sakit') {
                    points = weights.sick;
                } else { 
                    points = weights.permission;
                }
            }
            totalScore += points;
        }
    });

    const percentage = totalEffectiveWorkDays > 0 ? (totalScore / totalEffectiveWorkDays) * 100 : 0;

    let totalHadir = 0, totalIzin = 0, totalSakit = 0, totalAlpa = 0;
    dailyStatuses.forEach(report => {
        if (report.status === 'Hadir') {
            totalHadir++;
        } else if (report.status === 'Izin') {
            const leaveType = report.leaveType || '';
            if (leaveType === 'sakit') {
                totalSakit++;
            } else { 
                totalIzin++;
            }
        }
        else if (report.status === 'Alpa') {
            totalAlpa++;
        }
    });

    return {
        totalHadir, 
        totalIzin, 
        totalSakit, 
        totalAlpa, 
        percentage: Math.min(100, Math.max(0, percentage)),
        dailyStatuses
    };
}
