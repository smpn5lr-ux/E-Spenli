'use client';

import { createContext, useContext, useState, useEffect, ReactNode, useMemo } from 'react';
import { useFirestore } from '@/firebase';
import { doc, onSnapshot, collection } from 'firebase/firestore';

// --- TYPE DEFINITIONS ---
export interface SchoolConfig {
  offDays?: number[];
  [key: string]: any; // Keep it flexible
}

interface SettingsContextType {
  schoolConfig: SchoolConfig | null;
  holidays: Set<string>; // Using a Set for efficient lookups (O(1))
  isSettingsLoading: boolean; // A single flag indicating if essential settings are loading
}

const SettingsContext = createContext<SettingsContextType | undefined>(undefined);

// --- THE REFACTORED PROVIDER ---
export function SettingsProvider({ children }: { children: ReactNode }) {
  const firestore = useFirestore();

  const [schoolConfig, setSchoolConfig] = useState<SchoolConfig | null>(null);
  const [holidays, setHolidays] = useState<Set<string>>(new Set());
  
  const [isSchoolConfigLoading, setIsSchoolConfigLoading] = useState(true);
  const [isHolidaysLoading, setIsHolidaysLoading] = useState(true);

  // Effect for the global school config (e.g., offDays, location, etc.)
  useEffect(() => {
    if (!firestore) {
        setIsSchoolConfigLoading(false);
        return;
    };
    
    const unsub = onSnapshot(doc(firestore, 'schoolConfig', 'default'), (doc) => {
      setSchoolConfig(doc.exists() ? (doc.data() as SchoolConfig) : {});
      setIsSchoolConfigLoading(false);
    }, (error) => {
      console.error("Failed to load school config:", error);
      setIsSchoolConfigLoading(false);
    });
    return () => unsub();
  }, [firestore]);

  // Effect for the top-level 'holidays' collection (real-time)
  useEffect(() => {
    if (!firestore) {
        setIsHolidaysLoading(false);
        return;
    }

    const unsub = onSnapshot(collection(firestore, 'holidays'), (snapshot) => {
      const holidayIds = new Set<string>();
      snapshot.forEach(doc => {
        holidayIds.add(doc.id); // The document ID is the date string, e.g., '2024-05-30'
      });
      setHolidays(holidayIds);
      setIsHolidaysLoading(false);
    }, (error) => {
      console.error("Failed to load holidays:", error);
      setIsHolidaysLoading(false);
    });

    return () => unsub();
  }, [firestore]);

  // The context value is memoized for performance
  const value = useMemo(() => ({
    schoolConfig,
    holidays,
    isSettingsLoading: isSchoolConfigLoading || isHolidaysLoading,
  }), [schoolConfig, holidays, isSchoolConfigLoading, isHolidaysLoading]);

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
