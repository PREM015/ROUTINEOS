/**
 * Settings zustand store — the single source of truth for `UserSettings`.
 *
 * Before this store each settings page hand-rolled its own `useState` +
 * `useEffect` fetch, which caused three concrete bugs:
 *   1. Four sibling pages (`/settings/habits`, `/settings/sleep`,
 *      `/settings/notifications`, `/settings/privacy`) each issued their own
 *      `GET /api/users/[id]/settings`, so two pages open at once could render
 *      different values for the same column.
 *   2. `/settings/habits` and `/settings/notifications` both owned
 *      `dailyReminderTime` with conflicting `'09:00'` vs `'20:00'` fallbacks.
 *   3. Nothing re-read the saved row, so a "Saved" badge was the only signal
 *      that a write had landed.
 *
 * Now every settings page reads and writes through this store. Writes are
 * optimistic-then-confirmed: the patch is applied locally immediately so the
 * UI never lags behind the toggle, then reconciled against the server row that
 * `PUT /api/settings` returns.
 *
 * Appearance preferences (theme, animations, compact mode) are additionally
 * projected onto `document.documentElement` so they take effect app-wide
 * without a reload.
 */

'use client';

import { create } from 'zustand';
import { apiRequest, ApiError } from '@/lib/api-client';
import type { UserSettings } from '@/generated/prisma';

export type SettingsStatus = 'idle' | 'loading' | 'ready' | 'error';

/** Fields a client is allowed to PATCH. Mirrors `updateSettingsSchema`. */
export type SettingsPatch = Partial<Omit<UserSettings, 'id' | 'userId' | 'createdAt' | 'updatedAt'>>;

interface SettingsState {
  settings: UserSettings | null;
  status: SettingsStatus;
  error: string | null;
  saving: boolean;
  /** Number of in-flight `PUT` requests. Used to show a subtle saving hint. */
  pending: number;
  load: (options?: { force?: boolean }) => Promise<UserSettings | null>;
  save: (patch: SettingsPatch) => Promise<UserSettings | null>;
  /** Optimistic local-only update. Use for text fields while typing. */
  patchLocal: (patch: SettingsPatch) => void;
  reset: () => void;
}

function errorMessage(err: unknown, fallback: string): string {
  if (err instanceof ApiError) return err.message;
  return err instanceof Error ? err.message : fallback;
}

/**
 * Project appearance preferences onto the document root.
 *
 * The `dark` class is owned exclusively by `next-themes` (see
 * `components/providers/ThemeProvider.tsx`) and must not be touched here or the
 * two will fight. These flags are read by `globals.css`:
 *   `.reduce-motion` — from `animationsEnabled`
 *   `.compact-mode`  — from `compactMode`
 */
export function applyAppearance(
  settings: Pick<UserSettings, 'animationsEnabled' | 'compactMode'> | null
): void {
  if (typeof document === 'undefined' || !settings) return;

  const root = document.documentElement;
  root.classList.toggle('reduce-motion', settings.animationsEnabled === false);
  root.classList.toggle('compact-mode', settings.compactMode === true);
}

// Never run concurrent loads; a burst of mounts shares one request.
let loadInflight: Promise<UserSettings | null> | null = null;

export const useSettingsStore = create<SettingsState>()((set, get) => ({
  settings: null,
  status: 'idle',
  error: null,
  saving: false,
  pending: 0,

  /**
   * Fetch the settings row. Safe to call from every settings page: an
   * in-flight request is shared, and a loaded store short-circuits unless
   * `force` is set.
   */
  load: async (options) => {
    const force = options?.force ?? false;
    const current = get();

    if (loadInflight) {
      return loadInflight;
    }
    if (current.status === 'ready' && current.settings && !force) {
      return current.settings;
    }

    set({ status: 'loading', error: null });

    loadInflight = (async () => {
      try {
        const settings = await apiRequest<UserSettings>('/api/settings');
        set({ settings, status: 'ready', error: null });
        applyAppearance(settings);
        return settings;
      } catch (err) {
        set({ status: 'error', error: errorMessage(err, 'Failed to load settings') });
        return null;
      } finally {
        loadInflight = null;
      }
    })();

    return loadInflight;
  },

  /**
   * Persist a patch and reconcile local state with the returned row.
   *
   * The optimistic write is rolled back on failure so the UI never shows a
   * value the server rejected.
   */
  save: async (patch) => {
    const before = get().settings;
    if (before) {
      set({
        settings: { ...before, ...patch } as UserSettings,
        saving: true,
        pending: get().pending + 1,
        error: null,
      });
    }

    try {
      const updated = await apiRequest<UserSettings>('/api/settings', {
        method: 'PUT',
        body: patch,
      });
      set({ settings: updated, saving: false });
      applyAppearance(updated);
      return updated;
    } catch (err) {
      set({
        settings: before,
        saving: false,
        error: errorMessage(err, 'Failed to save settings'),
      });
      return null;
    } finally {
      set((state) => ({ pending: Math.max(0, state.pending - 1) }));
    }
  },

  patchLocal: (patch) => {
    const before = get().settings;
    if (!before) return;
    const next = { ...before, ...patch } as UserSettings;
    set({ settings: next });
    applyAppearance(next);
  },

  reset: () => {
    set({ settings: null, status: 'idle', error: null, saving: false, pending: 0 });
    // Drop the appearance classes too. Without this, signing out and into a
    // different account leaves the previous user's compact-mode /
    // reduced-motion preference applied to `<html>`.
    applyAppearance(null);
    if (typeof document !== 'undefined') {
      document.documentElement.classList.remove('reduce-motion', 'compact-mode');
    }
  },
}));
