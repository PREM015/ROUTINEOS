'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * LocalStorage hook: reads `key` from localStorage (SSR-safe, with a raw
 * fallback when the stored JSON fails to parse) and writes back on every
 * set. Other tabs are kept in sync through the `storage` event.
 */
export function useLocalStorage<T>(
  key: string,
  initialValue: T | (() => T)
): [T, (value: T | ((prev: T) => T)) => void] {
  const readValue = useCallback((): T => {
    if (typeof window === 'undefined') {
      return typeof initialValue === 'function'
        ? (initialValue as () => T)()
        : initialValue;
    }

    try {
      const raw = window.localStorage.getItem(key);
      if (raw === null) {
        return typeof initialValue === 'function'
          ? (initialValue as () => T)()
          : initialValue;
      }
      return JSON.parse(raw) as T;
    } catch {
      return typeof initialValue === 'function'
        ? (initialValue as () => T)()
        : initialValue;
    }
  }, [key, initialValue]);

  const [stored, setStored] = useState<T>(readValue);
  const keyRef = useRef(key);
  keyRef.current = key;

  const handleStorage = useCallback(
    (event: StorageEvent) => {
      if (event.key !== keyRef.current || typeof window === 'undefined') return;
      try {
        const next = event.newValue ? (JSON.parse(event.newValue) as T) : null;
        if (next !== null) setStored(next);
      } catch {
        // Ignore malformed payloads from other tabs.
      }
    },
    []
  );

  useEffect(() => {
    window.addEventListener('storage', handleStorage);
    return () => window.removeEventListener('storage', handleStorage);
  }, [handleStorage]);

  const setValue = useCallback(
    (value: T | ((prev: T) => T)) => {
      setStored((prev) => {
        const next = typeof value === 'function' ? (value as (p: T) => T)(prev) : value;

        if (typeof window !== 'undefined') {
          try {
            window.localStorage.setItem(keyRef.current, JSON.stringify(next));
          } catch {
            // Storage may be unavailable (private mode / quota); keep state.
          }
        }

        return next;
      });
    },
    []
  );

  return [stored, setValue];
}