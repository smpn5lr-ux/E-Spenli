'use client';

import { createContext, useContext, useState, useEffect, ReactNode, useMemo, useCallback } from 'react';
import { useFirestore } from '@/firebase';
import { doc, onSnapshot, collection, getDoc, getDocs } from 'firebase/firestore';

// --- TYPE DEFINITIONS ---
export interface SchoolConfig {
  offDays?: number[];
  [key: string]: any; // Keep it flexible
}

interface SettingsContextType {
  schoolConfig: SchoolConfig | null;
  holidays: Set<string>; // Using a Set for efficient lookups (O(1))
  isSettingsLoading: boolean; // A single flag indicating if essential settings are loading
  refreshSettings: () => void; // Function to force a refresh
}

const SettingsContext = createContext<SettingsContextType | undefined>(undefined);

// --- THE REFACTORED PROVIDER ---
export function SettingsProvider({ children }: { children: ReactNode }) {
  const firestore = useFirestore();

  const [schoolConfig, setSchoolConfig] = useState<SchoolConfig | null>(null);
  const [holidays, setHolidays] = useState<Set<string>>(new Set());
  
  const [isSchoolConfigLoading, setIsSchoolConfigLoading] = useState(true);
  const [isHolidaysLoading, setIsHolidaysLoading] = useState(true);

  // Function to fetch all settings data manually
  const fetchAllSettings = useCallback(async () => {
    if (!firestore) {
      setIsSchoolConfigLoading(false);
      setIsHolidaysLoading(false);
      return;
    }

    setIsSchoolConfigLoading(true);
    setIsHolidaysLoading(true);

    try {
      // Fetch school config
      const configDoc = await getDoc(doc(firestore, 'schoolConfig', 'default'));
      setSchoolConfig(configDoc.exists() ? (configDoc.data() as SchoolConfig) : {});

      // Fetch holidays
      const holidaysSnapshot = await getDocs(collection(firestore, 'holidays'));
      const holidayIds = new Set<string>();
      holidaysSnapshot.forEach(doc => holidayIds.add(doc.id));
      setHolidays(holidayIds);

    } catch (error) {
      console.error("Failed to fetch settings:", error);
    } finally {
      setIsSchoolConfigLoading(false);
      setIsHolidaysLoading(false);
    }
  }, [firestore]);

  // Fetch data on initial mount
  useEffect(() => {
    fetchAllSettings();
  }, [fetchAllSettings]);

  const refreshSettings = useCallback(() => {
    fetchAllSettings();
  }, [fetchAllSettings]);

  const value = useMemo(() => ({
    schoolConfig,
    holidays,
    isSettingsLoading: isSchoolConfigLoading || isHolidaysLoading,
    refreshSettings,
  }), [schoolConfig, holidays, isSchoolConfigLoading, isHolidaysLoading, refreshSettings]);

  return (
    <SettingsContext.Provider value={value}>
      {children}
    </SettingsContext.Provider>
  );
}

// --- CUSTOM HOOK to access the context easily ---
export function useSettings() {
  const context = useContext(SettingsContext);
  if (context === undefined) {
    throw new Error('useSettings must be used within a SettingsProvider');
  }
  return context;
}
