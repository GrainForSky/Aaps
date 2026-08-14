import { useState, useCallback, useEffect } from 'react';
import { SafetyLock, SAFETY_RULES } from '@/lib/types';

const STORAGE_KEY = 'aaps-safety-lock';

function loadSafetyLock(): SafetyLock {
  if (typeof window === 'undefined') {
    return {
      insulinLockedUntil: null,
      carbsLockedUntil: null,
      lastBolusTime: null,
      lastCarbsTime: null,
    };
  }
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      return JSON.parse(stored);
    }
  } catch {
    // ignore
  }
  return {
    insulinLockedUntil: null,
    carbsLockedUntil: null,
    lastBolusTime: null,
    lastCarbsTime: null,
  };
}

function saveSafetyLock(lock: SafetyLock) {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(lock));
  } catch {
    // ignore
  }
}

export function useSafetyLock() {
  const [lock, setLock] = useState<SafetyLock>(() => loadSafetyLock());
  const [insulinCountdown, setInsulinCountdown] = useState(0);
  const [carbsCountdown, setCarbsCountdown] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      const now = Date.now();
      setLock((prev) => {
        const updated = { ...prev };
        if (prev.insulinLockedUntil && now >= prev.insulinLockedUntil) {
          updated.insulinLockedUntil = null;
        }
        if (prev.carbsLockedUntil && now >= prev.carbsLockedUntil) {
          updated.carbsLockedUntil = null;
        }
        if (updated !== prev) {
          saveSafetyLock(updated);
        }
        return updated;
      });

      setInsulinCountdown((prev) => {
        if (prev > 0) return prev - 1;
        return 0;
      });
      setCarbsCountdown((prev) => {
        if (prev > 0) return prev - 1;
        return 0;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const now = Date.now();
    if (lock.insulinLockedUntil && lock.insulinLockedUntil > now) {
      setInsulinCountdown(
        Math.ceil((lock.insulinLockedUntil - now) / 1000)
      );
    } else {
      setInsulinCountdown(0);
    }
    if (lock.carbsLockedUntil && lock.carbsLockedUntil > now) {
      setCarbsCountdown(
        Math.ceil((lock.carbsLockedUntil - now) / 1000)
      );
    } else {
      setCarbsCountdown(0);
    }
  }, [lock]);

  const recordBolus = useCallback(() => {
    const now = Date.now();
    const lockedUntil =
      now + SAFETY_RULES.INSULIN_LOCK_MINUTES * 60 * 1000;
    const newLock: SafetyLock = {
      insulinLockedUntil: lockedUntil,
      carbsLockedUntil: lock.carbsLockedUntil,
      lastBolusTime: now,
      lastCarbsTime: lock.lastCarbsTime,
    };
    setLock(newLock);
    saveSafetyLock(newLock);
    setInsulinCountdown(SAFETY_RULES.INSULIN_LOCK_MINUTES * 60);
  }, [lock]);

  const recordCarbs = useCallback(() => {
    const now = Date.now();
    const lockedUntil =
      now + SAFETY_RULES.CARBS_LOCK_MINUTES * 60 * 1000;
    const newLock: SafetyLock = {
      insulinLockedUntil: lock.insulinLockedUntil,
      carbsLockedUntil: lockedUntil,
      lastBolusTime: lock.lastBolusTime,
      lastCarbsTime: now,
    };
    setLock(newLock);
    saveSafetyLock(newLock);
    setCarbsCountdown(SAFETY_RULES.CARBS_LOCK_MINUTES * 60);
  }, [lock]);

  const [isInsulinLocked, setIsInsulinLocked] = useState(false);
  const [isCarbsLocked, setIsCarbsLocked] = useState(false);

  useEffect(() => {
    const now = Date.now();
    const insulinLocked = lock.insulinLockedUntil !== null && lock.insulinLockedUntil > now;
    const carbsLocked = lock.carbsLockedUntil !== null && lock.carbsLockedUntil > now;
    setIsInsulinLocked(insulinLocked);
    setIsCarbsLocked(carbsLocked);
    if (lock.insulinLockedUntil && lock.insulinLockedUntil > now) {
      setInsulinCountdown(Math.ceil((lock.insulinLockedUntil - now) / 1000));
    } else {
      setInsulinCountdown(0);
    }
    if (lock.carbsLockedUntil && lock.carbsLockedUntil > now) {
      setCarbsCountdown(Math.ceil((lock.carbsLockedUntil - now) / 1000));
    } else {
      setCarbsCountdown(0);
    }
  }, [lock]);

  const resetLock = useCallback(() => {
    const newLock: SafetyLock = {
      insulinLockedUntil: null,
      carbsLockedUntil: null,
      lastBolusTime: null,
      lastCarbsTime: null,
    };
    setLock(newLock);
    saveSafetyLock(newLock);
    setInsulinCountdown(0);
    setCarbsCountdown(0);
  }, []);

  return {
    lock,
    isInsulinLocked,
    isCarbsLocked,
    insulinCountdown,
    carbsCountdown,
    recordBolus,
    recordCarbs,
    resetLock,
  };
}

function formatCountdown(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  if (mins > 0) {
    return `${mins}分${secs.toString().padStart(2, '0')}秒`;
  }
  return `${secs}秒`;
}

export { formatCountdown };
