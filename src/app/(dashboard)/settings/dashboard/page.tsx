'use client';

/**
 * Settings — Dashboard
 *
 * Dashboard widget preferences, stored per-device in `localStorage` under
 * `routineos.dashboard.widgets`. The canonical widget list lives in
 * `components/dashboard/DashboardWidgets.tsx`, which the dashboard page renders
 * through `<WidgetGate>` — so a toggle set here actually removes the widget
 * from the home page (previously the switches were write-only).
 */

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { LayoutGrid, RotateCcw, ShieldAlert } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Switch } from '@/components/ui/Switch';
import { Badge } from '@/components/ui/Badge';
import { Skeleton } from '@/components/ui/Skeleton';
import {
  DASHBOARD_WIDGETS,
  DASHBOARD_WIDGETS_KEY,
  type DashboardWidgetPref,
} from '@/components/dashboard/DashboardWidgets';

function readWidgets(): DashboardWidgetPref[] {
  if (typeof window === 'undefined') return [...DASHBOARD_WIDGETS];

  const defaults = DASHBOARD_WIDGETS.map((widget) => ({ ...widget }));
  try {
    const raw = window.localStorage.getItem(DASHBOARD_WIDGETS_KEY);
    if (!raw) return defaults;
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return defaults;

    const stored = new Map<string, boolean>();
    for (const item of parsed) {
      if (
        item &&
        typeof item === 'object' &&
        'key' in item &&
        'enabled' in item &&
        typeof (item as DashboardWidgetPref).key === 'string' &&
        typeof (item as DashboardWidgetPref).enabled === 'boolean'
      ) {
        stored.set(
          (item as DashboardWidgetPref).key,
          (item as DashboardWidgetPref).enabled
        );
      }
    }
    return defaults.map((widget) => ({
      ...widget,
      enabled: stored.get(widget.key) ?? widget.enabled,
    }));
  } catch {
    return defaults;
  }
}

function persist(widgets: DashboardWidgetPref[]): void {
  try {
    window.localStorage.setItem(DASHBOARD_WIDGETS_KEY, JSON.stringify(widgets));
  } catch {
    // Storage unavailable (private mode); the in-memory state still applies for
    // this page view.
  }
}

export default function DashboardSettingsPage() {
  const { isAuthenticated, isLoading } = useAuth();
  const [widgets, setWidgets] = useState<DashboardWidgetPref[]>(
    () => DASHBOARD_WIDGETS.map((widget) => ({ ...widget }))
  );

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- sync widget defaults on mount
    setWidgets(readWidgets());
  }, []);

  const commit = (next: DashboardWidgetPref[]) => {
    setWidgets(next);
    persist(next);
  };

  const toggle = (key: string, enabled: boolean) => {
    commit(widgets.map((widget) => (widget.key === key ? { ...widget, enabled } : widget)));
  };

  const reset = () => {
    commit(DASHBOARD_WIDGETS.map((widget) => ({ ...widget })));
  };

  if (isLoading) {
    return (
      <main className="container mx-auto max-w-3xl px-4 py-8">
        <Skeleton className="h-8 w-40" />
        <div className="mt-6 space-y-6">
          <Skeleton className="h-64 rounded-xl" />
        </div>
      </main>
    );
  }

  if (!isAuthenticated) {
    return (
      <main className="container mx-auto max-w-2xl px-4 py-16">
        <Card>
          <div className="p-8 text-center">
            <ShieldAlert className="mx-auto h-12 w-12 text-amber-500" />
            <h1 className="mt-4 text-xl font-bold">Sign in required</h1>
            <Link
              href="/login"
              className="mt-6 inline-flex h-10 w-full items-center justify-center rounded-lg bg-primary light-sweep glow-neon px-4 text-sm font-semibold text-primary-foreground shadow-sm transition-[background-color,box-shadow,transform] duration-200 ease-out-expo hover:bg-primary/90 active:scale-[0.97]"
            >
              Sign in
            </Link>
          </div>
        </Card>
      </main>
    );
  }

  const enabledCount = widgets.filter((widget) => widget.enabled).length;

  return (
    <main className="container mx-auto max-w-3xl px-4 py-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold">Dashboard</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Choose which widgets appear on your home page. Changes apply
          immediately.
        </p>
      </div>

      <Card>
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-6 py-4">
          <div className="flex items-center gap-2">
            <LayoutGrid className="h-5 w-5 text-primary" aria-hidden="true" />
            <h2 className="text-lg font-bold">Widgets</h2>
          </div>
          <div className="flex items-center gap-3">
            <Badge variant="primary">
              {enabledCount} / {widgets.length} enabled
            </Badge>
            <Button
              size="sm"
              variant="ghost"
              onClick={reset}
              disabled={widgets.every((widget, i) => widget.enabled === DASHBOARD_WIDGETS[i]?.enabled)}
            >
              <RotateCcw className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
              Reset
            </Button>
          </div>
        </div>
        <ul className="divide-y divide-border">
          {widgets.map((widget) => (
            <li key={widget.key} className="px-6 py-4">
              <Switch
                label={widget.label}
                checked={widget.enabled}
                onChange={(enabled) => toggle(widget.key, enabled)}
              />
            </li>
          ))}
        </ul>
        <div className="border-t border-border px-6 py-4">
          <p className="text-xs text-muted-foreground">
            Preferences are stored in your browser (localStorage) and follow you
            per device, not per account. They apply to the widgets on your{' '}
            <Link href="/dashboard" className="text-primary hover:underline">
              dashboard
            </Link>
            .
          </p>
        </div>
      </Card>
    </main>
  );
}
