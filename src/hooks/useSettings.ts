'use client';

import { useEffect } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useSettingsStore } from '@/store/settings.store';
import type { UserSettings } from '@/generated/prisma';

/**
 * Settings hook: the only supported way for a component to read or write
 * `UserSettings`.
 *
 * Every settings page mounts the same store, so opening two settings tabs no
 * longer produces two independent copies of the row that can disagree. The
 * store deduplicates concurrent loads, so calling `ensureLoaded()` from every
 * page costs at most one `GET /api/settings`.
 */
export function useSettings() {
  const settings = useSettingsStore((state) => state.settings);
  const status = useSettingsStore((state) => state.status);
  const error = useSettingsStore((state) => state.error);
  const saving = useSettingsStore((state) => state.saving);
  const pending = useSettingsStore((state) => state.pending);

  const actions = useSettingsStore(
    useShallow((state) => ({
      load: state.load,
      save: state.save,
      patchLocal: state.patchLocal,
      reset: state.reset,
    }))
  );

  const loading = status === 'idle' || status === 'loading';
  const ready = status === 'ready' && settings !== null;

  /** Fetch once. No-op when the store already holds the row. */
  const ensureLoaded = (options?: { force?: boolean }) =>
    useSettingsStore.getState().load(options);

  return {
    settings,
    status,
    error,
    saving,
    pending,
    loading,
    ready,
    ...actions,
    ensureLoaded,
  };
}

/**
 * Read the settings row once a user is authenticated, and clear it on sign-out
 * so the next account never sees the previous user's preferences.
 */
export function useSettingsLoader(enabled: boolean): void {
  const load = useSettingsStore((state) => state.load);
  const reset = useSettingsStore((state) => state.reset);

  useEffect(() => {
    if (!enabled) {
      reset();
      return;
    }
    void load();
  }, [enabled, load, reset]);
}

export type { UserSettings };
export { useSettingsStore };
