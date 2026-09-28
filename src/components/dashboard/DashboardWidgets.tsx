'use client';

/**
 * Dashboard widget preferences.
 *
 * The Settings > Dashboard page lets the user toggle which widgets appear on
 * the home page and stores the result in `localStorage` under
 * `routineos.dashboard.widgets`. The dashboard itself is a server component, so
 * it could not read that store — the toggles were therefore write-only UI and
 * every widget rendered regardless.
 *
 * `WidgetGate` is the client boundary that makes the choice real. It reads the
 * same storage key, so the two stay in sync by construction. Preferences are
 * per-device (not synced to the account), which is the documented behaviour of
 * that settings page.
 */

import { useEffect, useState, type ReactNode } from 'react';

export const DASHBOARD_WIDGETS_KEY = 'routineos.dashboard.widgets';

export interface DashboardWidgetPref {
  key: string;
  label: string;
  enabled: boolean;
}

/**
 * The canonical list. The dashboard maps its widgets onto these keys, and
 * `/settings/dashboard` renders one switch per entry, so adding a widget here
 * plus a matching `<WidgetGate>` is all that is required.
 */
export const DASHBOARD_WIDGETS: readonly DashboardWidgetPref[] = [
  { key: 'summary', label: 'Daily summary', enabled: true },
  { key: 'habits', label: 'Habit tracker', enabled: true },
  { key: 'tasks', label: 'Today tasks', enabled: true },
  { key: 'routine', label: 'Routine', enabled: true },
  { key: 'wellness', label: 'Wellness snapshot', enabled: true },
  { key: 'score', label: 'Daily score', enabled: true },
  { key: 'insights', label: 'AI insights', enabled: false },
  { key: 'quotes', label: 'Quote of the day', enabled: true },
  { key: 'streaks', label: 'Streaks & achievements', enabled: true },
  { key: 'goals', label: 'Active goals', enabled: true },
] as const;

function readPreferences(): Record<string, boolean> {
  const result: Record<string, boolean> = {};
  for (const widget of DASHBOARD_WIDGETS) {
    result[widget.key] = widget.enabled;
  }

  if (typeof window === 'undefined') return result;

  try {
    const raw = window.localStorage.getItem(DASHBOARD_WIDGETS_KEY);
    if (!raw) return result;
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return result;
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
        if (key in result) result[key] = enabled;
      }
    }
  } catch {
    // Corrupt or unreadable storage: fall back to the defaults above.
  }

  return result;
}

interface WidgetGateProps {
  widgetKey: string;
  children: ReactNode;
}

/**
 * Renders `children` only when the matching dashboard widget is enabled.
 *
 * Renders nothing until mounted so the server HTML and the first client render
 * agree; the dashboard's widgets are client components that fetch their own
 * data, so deferring them by one tick is not user-visible.
 */
export function WidgetGate({ widgetKey, children }: WidgetGateProps) {
  const [enabled, setEnabled] = useState<boolean | null>(null);

  useEffect(() => {
    const preferences = readPreferences();
    setEnabled(preferences[widgetKey] ?? true);
  }, [widgetKey]);

  if (enabled === false) return null;
  if (enabled === null) return null;
  return <>{children}</>;
}

export default WidgetGate;
