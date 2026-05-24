'use client';

import { createContext, useContext, useState, useEffect, ReactNode, useMemo, useCallback } from 'react';
import { useFirestore } from '@/firebase';
import { doc, onSnapshot, setDoc } from 'firebase/firestore';

// --- TYPE DEFINITIONS ---
interface SchoolConfig {
  offDays?: number[];
  useTimeValidation?: boolean;
  checkInEndTime?: string;
  [key: string]: any;
}

interface MonthlyConfig {
  holidays?: string[];
  workDays?: number;
  [key: string]: any;
}

interface SettingsContextType {
  schoolConfig: SchoolConfig | null;
  monthlyConfigs: { [key: string]: MonthlyConfig };
  isSettingsLoading: boolean; // For the main school config
  isMonthlyConfigLoading: (monthId: string) => boolean;
  subscribeToMonth: (monthId: string) => void;
  updateHolidaysForMonth: (monthId: string, holidays: string[], workDays: number) => Promise<void>;
}

const SettingsContext = createContext<SettingsContextType | undefined>(undefined);

// --- THE UPGRADED PROVIDER ---
export function SettingsProvider({ children }: { children: ReactNode }) {
  const firestore = useFirestore();
  const [schoolConfig, setSchoolConfig] = useState<SchoolConfig | null>(null);
  const [monthlyConfigs, setMonthlyConfigs] = useState<{ [key: string]: MonthlyConfig }>({});
  const [isSettingsLoading, setIsSettingsLoading] = useState(true);

  // State to manage monthly listeners and loading states
  const [loadingMonths, setLoadingMonths] = useState<Set<string>>(new Set());
  const [activeListeners, setActiveListeners] = useState<{ [key: string]: () => void }>({});

  // Effect for the global school config (unchanged)
  useEffect(() => {
    if (!firestore) return;
    const unsub = onSnapshot(doc(firestore, 'schoolConfig', 'default'), (doc) => {
      setSchoolConfig(doc.data() as SchoolConfig);
      setIsSettingsLoading(false);
    }, () => {
      setIsSettingsLoading(false);
    });
    return () => unsub();
  }, [firestore]);

  // 1. SUBSCRIBE: Function for components to request data for a specific month
  const subscribeToMonth = useCallback((monthId: string) => {
    if (!firestore || activeListeners[monthId] || loadingMonths.has(monthId)) {
      return; // Already listening or currently loading
    }

    setLoadingMonths(prev => new Set(prev).add(monthId));
    const monthlyConfigRef = doc(firestore, 'monthlyConfigs', monthId);

    const unsubscribe = onSnapshot(monthlyConfigRef, (doc) => {
      setMonthlyConfigs(prev => ({
        ...prev,
        [monthId]: (doc.data() as MonthlyConfig) ?? { holidays: [], workDays: 0 }
      }));
      setLoadingMonths(prev => {
        const newSet = new Set(prev);
        newSet.delete(monthId);
        return newSet;
      });
    }, (error) => {
      console.error(`Error fetching config for month ${monthId}:`, error);
      setLoadingMonths(prev => {
        const newSet = new Set(prev);
        newSet.delete(monthId);
        return newSet;
      });
    });

    setActiveListeners(prev => ({ ...prev, [monthId]: unsubscribe }));
  }, [firestore, activeListeners, loadingMonths]);

  // 2. UPDATE: Function for components to save changes for a specific month
  const updateHolidaysForMonth = useCallback(async (monthId: string, holidays: string[], workDays: number) => {
    if (!firestore) throw new Error("Penyimpanan Gagal: Koneksi database tidak ditemukan.");
    const monthlyRef = doc(firestore, 'monthlyConfigs', monthId);
    await setDoc(monthlyRef, {
      id: monthId,
      holidays: holidays,
      workDays: workDays
    }, { merge: true });
  }, [firestore]);

  // 3. CHECK LOADING STATUS: Function for components to know if a month's data is loading
  const isMonthlyConfigLoading = useCallback((monthId: string) => {
    return loadingMonths.has(monthId) || monthlyConfigs[monthId] === undefined;
  }, [loadingMonths, monthlyConfigs]);

  // Cleanup all active listeners when the provider unmounts
  useEffect(() => {
    return () => {
      Object.values(activeListeners).forEach(unsubscribe => unsubscribe());
    };
  }, [activeListeners]);

  // Memoize the context value
  const value = useMemo(() => ({
    schoolConfig,
    monthlyConfigs,
    isSettingsLoading,
    isMonthlyConfigLoading,
    subscribeToMonth,
    updateHolidaysForMonth,
  }), [schoolConfig, monthlyConfigs, isSettingsLoading, isMonthlyConfigLoading, subscribeToMonth, updateHolidaysForMonth]);

  return (
    <SettingsContext.Provider value={value}>
      {children}
    </SettingsContext.Provider>
  );
}

// --- HOOK to access the context ---
export function useSettings() {
  const context = useContext(SettingsContext);
  if (context === undefined) {
    throw new Error('useSettings must be used within a SettingsProvider');
  }
  return context;
}
