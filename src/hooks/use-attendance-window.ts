'use client';

import { useEffect, useState, useMemo } from "react";
import { useDoc } from "../firebase/firestore/use-doc";
import { useUser, useFirestore } from "@/firebase";
import { doc } from "firebase/firestore";
import { setHours, setMinutes, format } from "date-fns";

export interface SchoolConfig {
  isAttendanceActive?: boolean;
  useTimeValidation?: boolean;
  checkInStartTime?: string;
  checkInEndTime?: string;
  checkOutStartTime?: string; // Legacy/fallback
  checkOutEndTime?: string;   // Legacy/fallback
  checkOutTimes?: { [key: number]: { start: string; end: string; }; };
  offDays?: number[];
}

// Note: MonthlyConfig is no longer used for holidays in this hook.
export interface MonthlyConfig {
    holidays?: string[]; // e.g. ["2024-05-01", "2024-05-09"]
}

export type AttendanceWindowStatus =
  | "LOADING"
  | "SESSION_INACTIVE"
  | "HOLIDAY"
  | "UPCOMING"
  | "CHECK_IN_OPEN"
  | "CHECK_OUT_OPEN"
  | "CLOSED";

const parseTime = (timeStr: string): Date => {
  const now = new Date();
  const [hours, minutes] = timeStr.split(":").map(Number);
  return setHours(setMinutes(now, minutes), hours);
};

export const useAttendanceWindow = () => {
  const [status, setStatus] = useState<AttendanceWindowStatus>("LOADING");
  const { user } = useUser();
  const firestore = useFirestore();

  const configRef = useMemo(() =>
    firestore ? doc(firestore, "schoolConfig/default") : null,
    [firestore]
  );
  const { data: schoolConfig, isLoading: schoolConfigLoading } = useDoc<SchoolConfig>(
    user,
    configRef
  );

  const holidayId = useMemo(() => format(new Date(), 'yyyy-MM-dd'), []);
  const holidayRef = useMemo(() => 
    firestore ? doc(firestore, 'holidays', holidayId) : null, 
    [firestore, holidayId]
  );
  const { data: todayHoliday, isLoading: holidayLoading } = useDoc(user, holidayRef);

  useEffect(() => {
    const isLoading = schoolConfigLoading || holidayLoading;
    if (isLoading) {
      setStatus("LOADING");
      return;
    }

    if (!schoolConfig || schoolConfig.isAttendanceActive === false) {
      setStatus("SESSION_INACTIVE");
      return;
    }

    const checkStatus = () => {
      const now = new Date();
      const today = now.getDay();

      const isRegularOffDay = schoolConfig.offDays?.includes(today);
      const isSpecialHoliday = !!todayHoliday;

      if (isRegularOffDay || isSpecialHoliday) {
          setStatus("HOLIDAY");
          return;
      }

      if (schoolConfig.useTimeValidation === false) {
        setStatus("CHECK_IN_OPEN");
        return;
      }
      
      let todaysCheckoutStartStr: string | undefined;
      let todaysCheckoutEndStr: string | undefined;

      if (schoolConfig.checkOutTimes && schoolConfig.checkOutTimes[today]) {
        todaysCheckoutStartStr = schoolConfig.checkOutTimes[today].start;
        todaysCheckoutEndStr = schoolConfig.checkOutTimes[today].end;
      } else {
        todaysCheckoutStartStr = schoolConfig.checkOutStartTime;
        todaysCheckoutEndStr = schoolConfig.checkOutEndTime;
      }

      if (!schoolConfig.checkInStartTime || !schoolConfig.checkInEndTime || !todaysCheckoutStartStr || !todaysCheckoutEndStr) {
        setStatus("CLOSED");
        return;
      }

      const checkinStart = parseTime(schoolConfig.checkInStartTime);
      const checkinEnd = parseTime(schoolConfig.checkInEndTime);
      const checkoutStart = parseTime(todaysCheckoutStartStr);
      const checkoutEnd = parseTime(todaysCheckoutEndStr);

      if (now < checkinStart) {
        setStatus("UPCOMING");
      } else if (now >= checkinStart && now <= checkinEnd) {
        setStatus("CHECK_IN_OPEN");
      } else if (now >= checkoutStart && now <= checkoutEnd) {
        setStatus("CHECK_OUT_OPEN");
      } else {
        setStatus("CLOSED");
      }
    };

    checkStatus();
    const intervalId = setInterval(checkStatus, 30000);

    return () => clearInterval(intervalId);
  }, [schoolConfig, todayHoliday, schoolConfigLoading, holidayLoading]);

  const memoizedValues = useMemo(() => {
    const isLoading = schoolConfigLoading || holidayLoading;

    if (!schoolConfig) {
      return { status, isLoading, config: null, checkInEnd: null, checkOutStart: null };
    }
    
    const today = new Date().getDay();
    let checkoutStartStr = schoolConfig.checkOutStartTime;

    if (schoolConfig.checkOutTimes && schoolConfig.checkOutTimes[today]) {
      checkoutStartStr = schoolConfig.checkOutTimes[today].start;
    }

    return {
      status,
      isLoading,
      config: schoolConfig,
      checkInEnd: schoolConfig.checkInEndTime ? parseTime(schoolConfig.checkInEndTime) : null,
      checkOutStart: checkoutStartStr ? parseTime(checkoutStartStr) : null,
    };
  }, [status, schoolConfig, schoolConfigLoading, holidayLoading]);

  return memoizedValues;
};
