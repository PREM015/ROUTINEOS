'use client';

import { useEffect, useState } from 'react';
import { apiRequest, ApiError } from '@/lib/api-client';

/**
 * The user's focus configuration.
 *
 * ## Why this is a separate store from `UserSettings`
 *
 * `UserSettings` is the single row every `/settings` page reads through
 * `useSettings()`. Focus settings are deliberately *not* folded into it: they change
 * on a different cadence (a user tweaks their timebox occasionally, not daily) and
 * the focus runtime needs them synchronously on every page, including ones that never
 * mount a settings screen. Keeping them separate means the timer can load its
 * configuration without pulling the entire settings row into every dashboard bundle.
 *
 * ## Why the defaults live here *and* on the server
 *
 * `FOCUS_SETTINGS_FALLBACK` mirrors the Prisma column defaults so the first paint
 * before the request resolves is not a 25-minute block that then jumps to the user's
 * real value. The server is authoritative - `getSettings` creates the row with the
 * schema defaults - so the two are guaranteed to agree only if `FocusSettings` and this
 * object are kept in step. That duplication is the price of not blocking the timer on
 * a network round trip, and it is the first place to look if a timebox ever comes back
 * as the wrong length.
 */

export interface FocusSettings {
  id: string;
  userId: string;
  focusMinutes: number;
  shortBreakMinutes: number;
  longBreakMinutes: number;
  cyclesBeforeLongBreak: number;
  autoStartBreak: boolean;
  autoStartFocus: boolean;
  keepScreenAwake: boolean;
  reflectionMode: 'ALWAYS' | 'FOCUS_ONLY' | 'MIN_LENGTH' | 'NEVER';
  reflectionMinimumMinutes: number;
  dailyTargetMinutes: number;
  streakDayMinutes: number;
  weeklyTargetMinutes: number | null;
  soundEnabled: boolean;
  soundVolume: number;
  ambientSound: string | null;
  showWallClock: boolean;
  breakSuggestions: boolean;
  adaptiveSuggestions: boolean;
}

export type FocusSettingsPatch = Partial<Omit<FocusSettings, 'id' | 'userId'>>;

export interface FocusPreset {
  id: string;
  name: string;
  focusMinutes: number;
  shortBreakMinutes: number;
  longBreakMinutes: number;
  cyclesBeforeLongBreak: number;
  categoryId: string | null;
  color: string | null;
  icon: string | null;
  sortOrder: number;
  isArchived: boolean;
}

/** Mirrors the `FocusSettings` column defaults. See the note above. */
export const FOCUS_SETTINGS_FALLBACK: FocusSettings = {
  id: '',
  userId: '',
  focusMinutes: 25,
  shortBreakMinutes: 5,
  longBreakMinutes: 15,
  cyclesBeforeLongBreak: 4,
  autoStartBreak: true,
  autoStartFocus: false,
  keepScreenAwake: false,
  reflectionMode: 'MIN_LENGTH',
  reflectionMinimumMinutes: 10,
  dailyTargetMinutes: 120,
  streakDayMinutes: 25,
  weeklyTargetMinutes: null,
  soundEnabled: false,
  soundVolume: 50,
  ambientSound: null,
  showWallClock: true,
  breakSuggestions: true,
  adaptiveSuggestions: false,
};

interface FocusSettingsState {
  settings: FocusSettings;
  presets: FocusPreset[];
  loading: boolean;
  error: string | null;
  saving: boolean;
  save: (patch: FocusSettingsPatch) => Promise<void>;
  reload: () => Promise<void>;
}

/**
 * Process-wide singleton.
 *
 * Deliberately module-scoped rather than a React context: the runtime, the floating
 * bar, the mode switch and the settings page all need these values, and they are
 * mounted in different trees (the runtime lives in the dashboard layout, the settings
 * page under `/settings`). A context would need a provider above both for no benefit -
 * there is exactly one focus configuration per signed-in user.
 */
let current: FocusSettingsState | null = null;
const listeners = new Set<(state: FocusSettingsState) => void>();

const state: FocusSettingsState = {
  settings: FOCUS_SETTINGS_FALLBACK,
  presets: [],
  loading: false,
  error: null,
  saving: false,

  save: async (patch) => {
    set({ saving: true, error: null });
    try {
      const updated = await apiRequest<FocusSettings>('/api/focus/settings', {
        method: 'PUT',
        body: patch,
      });
      // The response is the reconciled row, not the patch. Replacing rather than
      // merging means a field the server clamped comes back corrected instead of
      // being re-sent on the next save.
      set({ settings: { ...current!.settings, ...updated }, saving: false });
    } catch (err) {
      set({
        saving: false,
        error: err instanceof ApiError ? err.message : 'Could not save focus settings.',
      });
      throw err;
    }
  },

  reload: async () => {
    set({ loading: true, error: null });
    try {
      const [settings, presets] = await Promise.all([
        apiRequest<FocusSettings>('/api/focus/settings'),
        apiRequest<FocusPreset[]>('/api/focus/presets'),
      ]);
      set({ settings, presets: presets ?? [], loading: false });
    } catch (err) {
      set({
        loading: false,
        error: err instanceof ApiError ? err.message : 'Could not load focus settings.',
      });
    }
  },
};

function set(patch: Partial<FocusSettingsState>) {
  if (!current) return;
  current = { ...current, ...patch };
  for (const listener of listeners) listener(current);
}

/**
 * Load-once. A second caller joins the in-flight request rather than issuing another,
 * because the runtime, the bar and the settings page all ask on mount and three
 * identical GETs for one row is the pattern the dashboard overview was rebuilt to kill.
 */
let inflight: Promise<void> | null = null;

export function useFocusSettings(): FocusSettingsState {
  const [snapshot, setSnapshot] = useState<FocusSettingsState>(current ?? state);

  useEffect(() => {
    current = current ?? state;
    setSnapshot(current);
    listeners.add(setSnapshot);

    if (!inflight) {
      inflight = current.reload().finally(() => {
        inflight = null;
      });
    }

    return () => {
      listeners.delete(setSnapshot);
    };
  }, []);

  return snapshot;
}

/** The current settings without subscribing - for the runtime's start path. */
export function getFocusSettingsSnapshot(): FocusSettings {
  return current?.settings ?? FOCUS_SETTINGS_FALLBACK;
}

export function useFocusPresets() {
  return useFocusSettings().presets;
}

/** Drop the cached row. Used on sign-out so the next user never sees the last one's. */
export function resetFocusSettings() {
  current = { ...state, settings: FOCUS_SETTINGS_FALLBACK, presets: [] };
  for (const listener of listeners) listener(current);
}