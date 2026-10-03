'use client';

/**
 * Dashboard widget preferences.
 *
 * The Settings > Dashboard page lets the user toggle which widgets appear on the
 * home page and stores the result in `localStorage` under
 * `routineos.dashboard.widgets`. The dashboard itself is a server component, so
 * it could not read that store — the toggles were therefore write-only UI and
 * every widget rendered regardless.
 *
 * `WidgetGate` is the client boundary that makes the choice real. Preferences are
 * per-device (not synced to the account), which is the documented behaviour of
 * that settings page.
 *
 * ## Why `useSyncExternalStore` and not `useState` + `useEffect`
 *
 * The original gate read `localStorage` in an effect and set state from it. That
 * is a synchronous setState inside an effect, which React flags because it causes
 * a cascading render — and the component compensated with a `null` sentinel that
 * rendered *nothing* on the first pass, so every gated widget flashed out and back
 * on load.
 *
 * `useSyncExternalStore` is the primitive built for exactly this: an external
 * mutable store with a server snapshot. There is no effect, no sentinel, and no
 * flash — the server renders the default, and React re-reads the store itself
 * after hydration.
 */

import { useSyncExternalStore, type ReactNode } from 'react';

export const DASHBOARD_WIDGETS_KEY = 'routineos.dashboard.widgets';

/** Cross-component signal, since `storage` only fires in *other* tabs. */
const PREFERENCES_EVENT = 'routineos:dashboard-widgets';

export interface DashboardWidgetPref {
  key: string;
  label: string;
  enabled: boolean;
}

/**
 * The canonical list. The dashboard maps its widgets onto these keys, and
 * `/settings/dashboard` renders one switch per entry, so adding a widget here
 * plus a matching `<WidgetGate>` is all that is required.
 *
 * ## One key per widget, never a shared one (audit F8)
 *
 * The previous list had six keys for fifteen widgets. Several widgets shared
 * `tasks` or `summary`, so the Settings page showed a label like "Routine" that
 * actually toggled the heatmap and the trend chart, and nine widgets had no key at
 * all and could not be toggled at all. Every widget now owns its key, and the
 * label in Settings names exactly what it switches off.
 *
 * ## What is NOT in this list
 *
 * The header strip, the feature hub and the page heading are permanent chrome, not
 * widgets. They are not gated, and deliberately do not appear in Settings - a
 * switch that hides the nav row would be a switch with a discoverability problem,
 * not a preference.
 *
 * Keys `score`, `streaks`, `goals` and `wellness` were removed on 2026-09-29
 * because the four metric cards they used to gate are gone. A user with an old
 * `routineos.dashboard.widgets` entry for one of them is unaffected:
 * `readPreferences` only applies keys that are still in this list.
 */
export const DASHBOARD_WIDGETS: readonly DashboardWidgetPref[] = [
  { key: 'heatmap', label: 'Consistency heatmap', enabled: true },
  { key: 'radar', label: 'Life balance radar', enabled: true },
  { key: 'dayTypes', label: 'Day-type breakdown', enabled: true },
  { key: 'habitHealth', label: 'Habit health', enabled: true },
  { key: 'adherence', label: 'Routine adherence', enabled: true },
  { key: 'recap', label: 'Weekly recap', enabled: true },
  { key: 'goalsVelocity', label: 'Goals velocity', enabled: true },
  { key: 'achievements', label: 'Achievements strip', enabled: true },
  { key: 'insights', label: 'AI insights', enabled: false },
  { key: 'quickActions', label: 'Quick actions', enabled: true },
  { key: 'quotes', label: 'Quote of the day', enabled: true },
] as const;

const DEFAULTS: Readonly<Record<string, boolean>> = Object.freeze(
  Object.fromEntries(DASHBOARD_WIDGETS.map((w) => [w.key, w.enabled]))
);

/**
 * Snapshot cache.
 *
 * `useSyncExternalStore` requires `getSnapshot` to return a *referentially stable*
 * value, and throws "The result of getSnapshot should be cached" if it returns a
 * fresh object each call. Rebuilding this map on every read is not merely wasteful
 * — it makes the store un-subscribeable, so the cache is keyed on the raw storage
 * string and the parsed result is reused until that string actually changes.
 */
let cachedRaw: string | null = null;
let cachedResult: Readonly<Record<string, boolean>> = DEFAULTS;

function readStored(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage.getItem(DASHBOARD_WIDGETS_KEY);
  } catch {
    // Private mode / disabled storage.
    return null;
  }
}

function parse(raw: string | null): Readonly<Record<string, boolean>> {
  if (raw === null) return DEFAULTS;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return DEFAULTS;
    const result: Record<string, boolean> = { ...DEFAULTS };
    for (const item of parsed) {
      if (
        item &&
        typeof item === 'object' &&
        'key' in item &&
        'enabled' in item &&
        typeof (item as DashboardWidgetPref).key === 'string' &&
        typeof (item as DashboardWidgetPref).enabled === 'boolean'
      ) {
        const { key, enabled } = item as DashboardWidgetPref;
        // Only keys still in the list are applied, so removing a widget retires
        // its old preference instead of resurrecting a dead key.
        if (key in result) result[key] = enabled;
      }
    }
    return result;
  } catch {
    // Corrupt or unreadable storage: fall back to the defaults.
    return DEFAULTS;
  }
}

/**
 * Read the per-device widget preferences.
 *
 * Exported so `AdaptiveColumns` can size the grid to match what is actually going
 * to render, and for tests. Cached — see the note above.
 */
export function readPreferences(): Readonly<Record<string, boolean>> {
  const raw = readStored();
  if (raw !== cachedRaw) {
    cachedRaw = raw;
    cachedResult = parse(raw);
  }
  return cachedResult;
}

/**
 * Tell every mounted gate in this tab that preferences changed.
 *
 * The `storage` event only fires in *other* tabs, so without this a Settings
 * toggle did nothing to the dashboard already open behind it — despite the page
 * promising "Changes apply immediately."
 */
export function emitPreferencesChanged(): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new Event(PREFERENCES_EVENT));
}

function subscribe(onChange: () => void): () => void {
  window.addEventListener('storage', onChange);
  window.addEventListener(PREFERENCES_EVENT, onChange);
  return () => {
    window.removeEventListener('storage', onChange);
    window.removeEventListener(PREFERENCES_EVENT, onChange);
  };
}

/** The server has no localStorage, so it renders the declared defaults. */
const serverSnapshot = (): Readonly<Record<string, boolean>> => DEFAULTS;

/**
 * Subscribe to the whole preference map.
 *
 * One subscription is shared by every gate, so a dashboard with eleven widgets
 * attaches one listener rather than eleven.
 */
export function useWidgetPreferences(): Readonly<Record<string, boolean>> {
  return useSyncExternalStore(subscribe, readPreferences, serverSnapshot);
}

/** Is one widget enabled? */
export function useWidgetEnabled(widgetKey: string): boolean {
  const preferences = useWidgetPreferences();
  return preferences[widgetKey] ?? true;
}

/** Is at least one of these widgets enabled? Used to size the adaptive grid. */
export function useAnyWidgetEnabled(widgetKeys: readonly string[]): boolean {
  const preferences = useWidgetPreferences();
  // `join` is the stable identity of the key set, so a fresh array literal at the
  // call site does not re-subscribe on every render.
  const identity = widgetKeys.join('|');
  return identity
    .split('|')
    .some((key) => preferences[key] ?? true);
}

interface WidgetGateProps {
  widgetKey: string;
  children: ReactNode;
}

/**
 * Renders `children` only when the matching dashboard widget is enabled.
 *
 * No loading sentinel: `useSyncExternalStore` resolves the store during hydration,
 * so the server HTML and the first client render agree without a null-then-content
 * flicker.
 */
export function WidgetGate({ widgetKey, children }: WidgetGateProps) {
  if (!useWidgetEnabled(widgetKey)) return null;
  return <>{children}</>;
}

export default WidgetGate;
