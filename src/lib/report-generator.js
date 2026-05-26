import { collection, getDocs, doc, getDoc } from 'firebase/firestore';
import { format, startOfMonth, endOfMonth, eachDayOfInterval, isWithinInterval, startOfDay, endOfDay, isAfter } from 'date-fns';

/**
 * Retrieves the working days for a given month, excluding weekends and national holidays.
 * THIS FUNCTION CONTAINS THE DEFINITIVE FIX.
 * @param {import('firebase/firestore').Firestore} firestore - The Firestore instance.
 * @param {string} month - The month in 'yyyy-MM' format.
 * @returns {Promise<{allWorkingDays: Date[], pastWorkingDays: Date[]}>} An object containing all working days and past working days.
 */
async function getWorkingDaysInfo(firestore, month) {
    const monthDate = new Date(month + '-01T12:00:00'); // Timezone-safe date parsing
    const monthStart = startOfMonth(monthDate);
    const monthEnd = endOfMonth(monthDate);
    const today = startOfDay(new Date());

    // Fetch school-wide and month-specific configurations simultaneously.
    const [schoolConfigSnap, monthlyConfigSnap] = await Promise.all([
        getDoc(doc(firestore, 'schoolConfig', 'default')),
        getDoc(doc(firestore, 'monthlyConfigs', month))
    ]);

    // --- DEFINITIVE FIX FOR HOLIDAY LOGIC ---
    // Use data() directly. If a document doesn't exist, it returns undefined.
    const schoolConfig = schoolConfigSnap.data() || {};
    const monthlyConfig = monthlyConfigSnap.data(); // This can be undefined.

    // Use optional chaining (`?.`) to safely access `holidays`.
    // If `monthlyConfig` is undefined, `holidays` will correctly default to an empty array.
    const holidays = monthlyConfig?.holidays || [];
    const offDays = schoolConfig.offDays || [0, 6]; // Default to Sunday (0) and Saturday (6).
    // --- END FIX ---

    const allDaysInMonth = eachDayOfInterval({ start: monthStart, end: monthEnd });
    
    // Filter all days in the month to get only the actual working days.
    const allWorkingDays = allDaysInMonth.filter(day => {
        const dayStr = format(day, 'yyyy-MM-dd');
        // A day is a working day if it's NOT an off-day AND NOT a holiday.
        return !offDays.includes(day.getDay()) && !holidays.includes(dayStr);
    });
    
    // From the working days, get the ones that have already passed (or are today).
    const pastWorkingDays = allWorkingDays.filter(day => !isAfter(day, today));

    return {
        allWorkingDays: allWorkingDays,
        pastWorkingDays: pastWorkingDays,
    };
}

/**
 * Generates a comprehensive monthly attendance report for all users.
 * @param {import('firebase/firestore').Firestore} firestore - The Firestore instance.
 * @param {string} month - The month in 'yyyy-MM' format.
 * @returns {Promise<any[]>} A promise that resolves to an array of user report objects.
 */
export async function generateMonthlyReport(firestore, month) {
    const usersSnapshot = await getDocs(collection(firestore, 'users'));
    const allUsers = usersSnapshot.docs.map(d => ({ uid: d.id, ...d.data() }));

    // Get the correctly filtered list of working days. Holidays are already excluded here.
    const { allWorkingDays, pastWorkingDays } = await getWorkingDaysInfo(firestore, month);
    const totalReportableDays = pastWorkingDays.length;

    const reportPromises = allUsers.map(async (user) => {
        const [attendanceSnapshot, leaveSnapshot] = await Promise.all([
             getDocs(collection(firestore, 'users', user.uid, 'attendanceRecords')),
             getDocs(collection(firestore, 'users', user.uid, 'leaveRequests'))
        ]);
        const userAttendance = attendanceSnapshot.docs.map(d => ({ id: d.id, ...d.data() }));
        const userLeaves = leaveSnapshot.docs.map(d => d.data());

        let hadirCount = 0;
        let izinCount = 0;
        let sakitCount = 0;
        let alpaCount = 0;

        // Loop ONLY through the days that are confirmed to be past working days.
        // Holidays will NOT be in this loop, so they can't be marked as 'Alpa'.
        for (const day of pastWorkingDays) {
            const dayStr = format(day, 'yyyy-MM-dd');

            // 1. Check for approved leave on this day.
            const approvedLeave = userLeaves.find(l => 
                l.status === 'approved' && isWithinInterval(day, { start: startOfDay(l.startDate.toDate()), end: endOfDay(l.endDate.toDate()) })
            );

            if (approvedLeave) {
                if (approvedLeave.type === 'Sakit') {
                    sakitCount++;
                } else { // All other leave types (Izin, Dinas) are grouped.
                    izinCount++;
                }
                continue; // Day is categorized, move to the next.
            }

            // 2. If no leave, check for an attendance record.
            const attendanceRecord = userAttendance.find(a => a.date === dayStr);
            
            if (attendanceRecord) {
                // To be 'Hadir', both check-in and check-out must exist.
                if (attendanceRecord.checkInTime && attendanceRecord.checkOutTime) {
                    hadirCount++;
                } else {
                    alpaCount++; // Incomplete attendance is considered 'Alpa' in this report.
                }
            } else {
                // If no leave and no attendance record, it's 'Alpa'.
                alpaCount++;
            }
        }

        // Calculate percentage based on reportable days so far.
        const attendancePercentage = totalReportableDays > 0 ? (hadirCount / totalReportableDays) * 100 : 0;
        
        return {
            uid: user.uid,
            name: user.name,
            nip: user.nip || '-',
            role: user.role,
            employmentStatus: user.employmentStatus || '-',
            hadirCount,
            izinCount,
            sakitCount,
            alpaCount,
            attendancePercentage,
            totalWorkingDays: allWorkingDays.length, // Total working days in the full month.
        };
    });

    return Promise.all(reportPromises);
}
