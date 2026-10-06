'use client';

/**
 * Read a device-local preference as an external store.
 *
 * ## Why not `useState` + `useEffect`
 *
 * The obvious shape is a lazy `useState` initialiser reading `localStorage`. That
 * breaks hydration: the server has no `localStorage`, so it renders the default, the
 * client's first render reads storage and produces a different value, and React
 * reports a mismatch. The usual workaround is to read in an effect, which is what
 * this hook exists to replace - `setState` inside an effect causes a cascading
 * second render on every mount, and eslint's `set-state-in-effect` rule is right
 * about that.
 *
 * `useSyncExternalStore` is the primitive built for exactly this: it takes a
 * `getServerSnapshot` for the server and first client render, and a `getSnapshot`
 * for afterwards, and reconciles them without a mismatch and without an effect.
 *
 * ## Why the snapshot is cached
 *
 * `getSnapshot` must return a **referentially stable** value for as long as the
 * stored value is unchanged, or React re-renders forever. `localStorage.getItem`
 * returns a fresh string every call, so the raw value is cached per key and only
 * re-read when something signals a change.
 *
 * ## Same-tab updates
 *
 * The `storage` event only fires in *other* tabs. A write in this tab has to notify
 * subscribers directly, which `writeDevicePreference` does - otherwise two components
 * sharing one preference would disagree for the rest of the session.
 */

import { useCallback, useSyncExternalStore } from 'react';
import {
  DEVICE_PREF,
  readDeviceValue,
  writeDeviceValue,
  prefKey,
  type DevicePrefName,
} from '@/lib/achievements/device-prefs';

const cache = new Map<string, string | null>();
const listeners = new Set<() => void>();

function notify(): void {
  for (const listener of listeners) listener();
}

/**
 * Write a preference and notify same-tab subscribers.
 *
 * Returns whether it persisted - `false` under SSR, in private mode, or on an
 * exhausted quota. The in-memory value still stands for this session either way,
 * which is why the cache is updated before the write is attempted.
 */
export function writeDevicePreference<T>(
  userId: string,
  name: DevicePrefName,
  value: T
): boolean {
  const key = prefKey(userId, name);
  cache.set(key, JSON.stringify(value));
  const persisted = writeDeviceValue(key, value);
  notify();
  return persisted;
}

export function useDevicePreference<T>(
  userId: string | null | undefined,
  name: DevicePrefName,
  fallback: T
): [T, (value: T) => void] {
  const key = userId ? prefKey(userId, name) : null;

  const subscribe = useCallback(
    (onChange: () => void) => {
      listeners.add(onChange);
      if (typeof window === 'undefined') return () => listeners.delete(onChange);
      window.addEventListener('storage', onChange);
      return () => {
        listeners.delete(onChange);
        window.removeEventListener('storage', onChange);
      };
    },
    []
  );

  const getSnapshot = useCallback((): T => {
    if (!key) return fallback;
    const cached = cache.get(key);
    const raw = cached === undefined ? null : cached;
    if (cached === undefined) {
      // First read of this key: seed the cache from storage, or from the fallback
      // when there is nothing stored, so the next call is referentially stable.
      cache.set(key, JSON.stringify(readDeviceValue<T>(key, fallback)));
    }
    try {
      return JSON.parse(raw ?? 'null') as T;
    } catch {
      return fallback;
    }
    // `raw` is captured above purely to keep the cache read and the parse adjacent.
  }, [key, fallback]);

  const getServerSnapshot = useCallback((): T => fallback, [fallback]);

  const value = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  const setValue = useCallback(
    (next: T) => {
      if (!userId) return;
      writeDevicePreference(userId, name, next);
    },
    [userId, name]
  );

  return [value, setValue];
}

export { DEVICE_PREF };