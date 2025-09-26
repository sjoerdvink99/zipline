import { useState, useCallback, useEffect } from 'react';

export const usePersistedState = <T>(
  key: string,
  defaultValue: T
): [T, (value: T | ((prev: T) => T)) => void] => {
  const [state, setState] = useState<T>(() => {
    try {
      const item = localStorage.getItem(key);
      return item ? JSON.parse(item) : defaultValue;
    } catch (error) {
      console.warn(`Failed to load persisted state for key "${key}":`, error);
      return defaultValue;
    }
  });

  const setValue = useCallback(
    (value: T | ((prev: T) => T)) => {
      setState((prevState) => {
        const newValue = typeof value === 'function' ? (value as (prev: T) => T)(prevState) : value;
        try {
          localStorage.setItem(key, JSON.stringify(newValue));
        } catch (error) {
          console.warn(`Failed to persist state for key "${key}":`, error);
        }
        return newValue;
      });
    },
    [key]
  );

  useEffect(() => {
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === key && e.newValue !== null) {
        try {
          const newValue = JSON.parse(e.newValue);
          setState(newValue);
        } catch (error) {
          console.warn(`Failed to parse storage change for key "${key}":`, error);
        }
      }
    };

    window.addEventListener('storage', handleStorageChange);
    return () => window.removeEventListener('storage', handleStorageChange);
  }, [key]);

  return [state, setValue];
};