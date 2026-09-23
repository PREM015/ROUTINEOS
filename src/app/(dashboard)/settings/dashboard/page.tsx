'use client';

/**
 * Settings — Dashboard
 * Dashboard widget preferences persisted to localStorage. Which widgets render
 * on the home page and in which welcome state is a per-device (local) choice;
 * there is no dedicated widget-preference API.
 */

import { useEffect, useState } from 'react';
import { LayoutGrid, ShieldAlert } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { Card } from '@/components/ui/Card';
import { Switch } from '@/components/ui/Switch';
import { Badge } from '@/components/ui/Badge';
import { Skeleton } from '@/components/ui/Skeleton';

const STORAGE_KEY = 'routineos.dashboard.widgets';

interface WidgetPref {
  key: string;
  label: string;
  enabled: boolean;
}

const DEFAULT_WIDGETS: WidgetPref[] = [
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
];

function loadWidgets(): WidgetPref[] {
  if (typeof window === 'undefined') return DEFAULT_WIDGETS;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_WIDGETS;
    const parsed = JSON.parse(raw) as WidgetPref[];
    return DEFAULT_WIDGETS.map(
      (def) => parsed.find((item) => item.key === def.key) ?? def
    );
  } catch {
    return DEFAULT_WIDGETS;
  }
}

export default function DashboardSettingsPage() {
  const { isAuthenticated, isLoading } = useAuth();
  const [widgets, setWidgets] = useState<WidgetPref[]>(DEFAULT_WIDGETS);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- sync widget defaults on mount
    setWidgets(loadWidgets());
  }, []);

  const toggle = (key: string, enabled: boolean) => {
    const next = widgets.map((widget) =>
      widget.key === key ? { ...widget, enabled } : widget
    );
    setWidgets(next);
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
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
            <a
              href="/login"
              className="mt-6 inline-flex h-10 w-full items-center justify-center rounded-lg bg-primary light-sweep glow-neon px-4 text-sm font-semibold text-primary-foreground shadow-sm transition-[background-color,box-shadow,transform] duration-200 ease-out-expo hover:bg-primary/90 active:scale-[0.97]"
            >
              Sign in
            </a>
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
          Choose which widgets appear on your home page.
        </p>
      </div>

      <Card>
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-6 py-4">
          <div className="flex items-center gap-2">
            <LayoutGrid className="h-5 w-5 text-primary" />
            <h2 className="text-lg font-bold">Widgets</h2>
          </div>
          <Badge variant="primary">{enabledCount} / {widgets.length} enabled</Badge>
        </div>
        <ul className="divide-y divide-border">
          {widgets.map((widget) => (
            <li key={widget.key} className="flex items-center justify-between px-6 py-4">
              <span className="text-sm text-foreground">{widget.label}</span>
              <Switch checked={widget.enabled} onChange={(enabled) => toggle(widget.key, enabled)} />
            </li>
          ))}
        </ul>
        <div className="border-t border-border px-6 py-4">
          <p className="text-xs text-muted-foreground">
            Preferences are stored in your browser (localStorage). They follow
            you per device, not per account.
          </p>
        </div>
      </Card>
    </main>
  );
}