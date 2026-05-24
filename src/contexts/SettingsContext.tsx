'use client';

import { createContext, useContext, useState, useEffect, ReactNode, useMemo } from 'react';
import { useFirestore } from '@/firebase';
import { doc, onSnapshot } from 'firebase/firestore';

interface SchoolConfig {
  offDays?: number[];
  useTimeValidation?: boolean;
  checkInEndTime?: string;
  [key: string]: any;
}

interface MonthlyConfig {
  holidays?: string[];
  effectiveWorkDays?: number;
  [key: string]: any;
}

interface SettingsContextType {
  schoolConfig: SchoolConfig | null;
  monthlyConfigs: { [key: string]: MonthlyConfig };
  isSettingsLoading: boolean;
}

const SettingsContext = createContext<SettingsContextType | undefined>(undefined);

export function SettingsProvider({ children }: { children: ReactNode }) {
  const firestore = useFirestore();
  const [schoolConfig, setSchoolConfig] = useState<SchoolConfig | null>(null);
  const [monthlyConfigs, setMonthlyConfigs] = useState<{ [key: string]: MonthlyConfig }>({});
  const [isSettingsLoading, setIsSettingsLoading] = useState(true);

  useEffect(() => {
    if (!firestore) return;

    // The redundant setIsSettingsLoading(true) call has been removed.
    // The state is already true from useState, so we don't need to set it again.

    // Listener for general school configuration
    const schoolConfigRef = doc(firestore, 'schoolConfig', 'default');
    const unsubSchoolConfig = onSnapshot(schoolConfigRef, (doc) => {
      console.log("Global school config updated.");
      setSchoolConfig(doc.data() as SchoolConfig);
      setIsSettingsLoading(false); // Set to false only after data is fetched.
    }, (error) => {
        console.error("Error fetching school config:", error);
        setIsSettingsLoading(false);
    });

    // We will dynamically create listeners for monthly configs as needed elsewhere
    // For now, this centralized provider ensures the global config is available.

    return () => {
      unsubSchoolConfig();
    };
  }, [firestore]);

  const value = useMemo(() => ({
    schoolConfig,
    monthlyConfigs, // This will be populated by components that need it
    isSettingsLoading,
  }), [schoolConfig, monthlyConfigs, isSettingsLoading]);

  return (
    <SettingsContext.Provider value={value}>
      {children}
    </SettingsContext.Provider>
  );
}

export function useSettings() {
  const context = useContext(SettingsContext);
  if (context === undefined) {
    throw new Error('useSettings must be used within a SettingsProvider');
  }
  return context;
}
