'use client';

/**
 * Settings — Appearance
 *
 * The previous version rendered only `<ThemeToggle>`, which persists to
 * localStorage via `next-themes` and never touched the database. The theme was
 * therefore per-browser, not per-account, and `UserSettings.theme`,
 * `animationsEnabled`, `compactMode`, `soundEnabled` and `defaultView` had no
 * UI at all.
 *
 * This page writes through the shared settings store, so the choice follows the
 * account across devices. `applyAppearance()` in the store projects
 * `animationsEnabled` / `compactMode` onto `<html>` for the rest of the app.
 *
 * Theme application stays with `next-themes` (it owns the `dark` class and
 * avoids a flash on load); the store mirrors the DB value into it.
 */

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useTheme } from 'next-themes';
import {
  CheckCircle2,
  Monitor,
  Moon,
  Palette,
  ShieldAlert,
  Sun,
  Volume2,
} from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { useSettings } from '@/hooks/useSettings';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Switch } from '@/components/ui/Switch';
import { Select } from '@/components/ui/Select';
import { Skeleton } from '@/components/ui/Skeleton';
import { Theme } from '@/constants/prisma-enums';

const THEME_OPTIONS = [
  { value: 'light', label: 'Light', icon: Sun },
  { value: 'dark', label: 'Dark', icon: Moon },
  { value: 'system', label: 'System', icon: Monitor },
] as const;

/** `UserSettings.theme` enum -> next-themes value. */
const DB_TO_NEXT_THEMES: Record<Theme, 'light' | 'dark' | 'system'> = {
  LIGHT: 'light',
  DARK: 'dark',
  AUTO: 'system',
  CUSTOM: 'light',
};

const NEXT_THEMES_TO_DB = {
  light: 'LIGHT',
  dark: 'DARK',
  system: 'AUTO',
} as const;

const DEFAULT_VIEW_OPTIONS = [
  { value: 'dashboard', label: 'Dashboard' },
  { value: 'today', label: 'Today' },
  { value: 'habits', label: 'Habits' },
  { value: 'goals', label: 'Goals' },
  { value: 'tasks', label: 'Tasks' },
  { value: 'routine', label: 'Routine' },
];

const DATE_FORMAT_OPTIONS = [
  { value: 'YYYY-MM-DD', label: '2026-01-31' },
  { value: 'DD/MM/YYYY', label: '31/01/2026' },
  { value: 'MM/DD/YYYY', label: '01/31/2026' },
  { value: 'DD.MM.YYYY', label: '31.01.2026' },
];

const TIME_FORMAT_OPTIONS = [
  { value: '24h', label: '24-hour (18:30)' },
  { value: '12h', label: '12-hour (6:30 PM)' },
];

const WEEK_START_OPTIONS = [
  { value: '1', label: 'Monday' },
  { value: '0', label: 'Sunday' },
  { value: '6', label: 'Saturday' },
];

export default function AppearanceSettingsPage() {
  const { isAuthenticated, isLoading: authLoading } = useAuth();
  const { settings, loading, save, patchLocal, saving, error } = useSettings();
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  const [saved, setSaved] = useState(false);
  // Guards the one-shot "apply the account's stored theme" step, so a later
  // re-fetch of the settings row does not stomp a choice the user just made in
  // this session.
  const syncedFromAccount = useRef(false);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- next-themes resolves client-side only
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!settings || syncedFromAccount.current) return;
    syncedFromAccount.current = true;
    const stored = DB_TO_NEXT_THEMES[settings.theme];
    if (stored && stored !== theme) {
      setTheme(stored);
    }
    // `theme` is intentionally omitted: this must run exactly once, when the
    // account's stored theme first becomes available.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings]);

  useEffect(() => {
    if (!saved) return;
    const timer = window.setTimeout(() => setSaved(false), 1600);
    return () => window.clearTimeout(timer);
  }, [saved]);

  if (authLoading) {
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

  const persist = async () => {
    if (!settings) return;
    const result = await save({
      theme: settings.theme,
      animationsEnabled: settings.animationsEnabled,
      compactMode: settings.compactMode,
      soundEnabled: settings.soundEnabled,
      dateFormat: settings.dateFormat,
      timeFormat: settings.timeFormat,
      weekStartsOn: settings.weekStartsOn,
    });
    if (result) setSaved(true);
  };

  // Applies instantly to `next-themes`, and is persisted with the rest on Save.
  const chooseTheme = (next: 'light' | 'dark' | 'system') => {
    setTheme(next);
    patchLocal({ theme: NEXT_THEMES_TO_DB[next] as Theme });
  };

  return (
    <main className="container mx-auto max-w-3xl px-4 py-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold">Appearance</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Customize how RoutineOS looks. Your choice is saved to your account, so
          it follows you across devices.
        </p>
      </div>

      <div className="space-y-6">
        <Card>
          <div className="flex items-center gap-2 border-b border-border px-6 py-4">
            <Palette className="h-5 w-5 text-primary" aria-hidden="true" />
            <h2 className="text-lg font-bold">Theme</h2>
          </div>
          <div className="p-6">
            {loading || !settings ? (
              <Skeleton className="h-10 w-52" />
            ) : (
              <>
                {/* Rendered only after mount so the server and client HTML match. */}
                {mounted ? (
                  <div
                    role="radiogroup"
                    aria-label="Color theme"
                    className="inline-flex gap-1 rounded-xl border border-border bg-muted/50 p-1"
                  >
                    {THEME_OPTIONS.map(({ value, label, icon: Icon }) => {
                      const selected = theme === value;
                      return (
                        <button
                          key={value}
                          type="button"
                          role="radio"
                          aria-checked={selected}
                          onClick={() => chooseTheme(value)}
                          className={`inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 ${
                            selected
                              ? 'bg-card text-foreground shadow-soft'
                              : 'text-muted-foreground hover:text-foreground'
                          }`}
                        >
                          <Icon className="h-4 w-4" aria-hidden="true" />
                          {label}
                        </button>
                      );
                    })}
                  </div>
                ) : (
                  <Skeleton className="h-10 w-52" />
                )}
                <p className="mt-3 text-sm text-muted-foreground">
                  System follows your device setting and updates automatically.
                </p>
              </>
            )}
          </div>
        </Card>

        <Card>
          <div className="border-b border-border px-6 py-4">
            <h2 className="text-lg font-bold">Motion &amp; density</h2>
          </div>
          <div className="space-y-5 p-6">
            {loading || !settings ? (
              <>
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
              </>
            ) : (
              <>
                <Switch
                  label="Animations"
                  description="Decorative motion and transitions across the app."
                  checked={settings.animationsEnabled}
                  onChange={(checked) => patchLocal({ animationsEnabled: checked })}
                />
                <Switch
                  label="Compact mode"
                  description="Tighter spacing and padding for list-dense screens."
                  checked={settings.compactMode}
                  onChange={(checked) => patchLocal({ compactMode: checked })}
                />
                <Switch
                  label="Sound effects"
                  description="Play a sound when you complete a habit or finish a timer."
                  checked={settings.soundEnabled}
                  onChange={(checked) => patchLocal({ soundEnabled: checked })}
                />
              </>
            )}
          </div>
        </Card>

        <Card>
          <div className="border-b border-border px-6 py-4">
            <h2 className="text-lg font-bold">Formats</h2>
          </div>
          <div className="grid grid-cols-1 gap-5 p-6 sm:grid-cols-3">
            {loading || !settings ? (
              <>
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
              </>
            ) : (
              <>
                <Select
                  label="Date format"
                  value={settings.dateFormat}
                  onChange={(event) => patchLocal({ dateFormat: event.target.value })}
                  options={DATE_FORMAT_OPTIONS}
                />
                <Select
                  label="Time format"
                  value={settings.timeFormat}
                  onChange={(event) =>
                    patchLocal({ timeFormat: event.target.value as '12h' | '24h' })
                  }
                  options={TIME_FORMAT_OPTIONS}
                />
                <Select
                  label="Week starts on"
                  value={String(settings.weekStartsOn)}
                  onChange={(event) =>
                    patchLocal({ weekStartsOn: Number(event.target.value) })
                  }
                  options={WEEK_START_OPTIONS}
                />
              </>
            )}
          </div>
        </Card>

        <Card>
          <div className="flex items-center gap-2 border-b border-border px-6 py-4">
            <Volume2 className="h-5 w-5 text-primary" aria-hidden="true" />
            <h2 className="text-lg font-bold">Defaults</h2>
          </div>
          <div className="p-6">
            {loading || !settings ? (
              <Skeleton className="h-10 w-full max-w-xs" />
            ) : (
              <div className="max-w-xs">
                <Select
                  label="Default view"
                  helperText="Where the app opens after signing in."
                  value={settings.defaultView}
                  onChange={(event) => patchLocal({ defaultView: event.target.value })}
                  options={DEFAULT_VIEW_OPTIONS}
                />
              </div>
            )}
          </div>
        </Card>

        {error && (
          <div className="rounded-md bg-destructive/10 px-4 py-3 text-sm text-destructive" role="alert">
            {error}
          </div>
        )}

        <div className="flex flex-wrap items-center gap-3">
          <Button onClick={() => void persist()} isLoading={saving} disabled={loading || !settings}>
            Save appearance
          </Button>
          {saved && (
            <span className="inline-flex items-center gap-1 text-sm text-emerald-600 dark:text-emerald-400">
              <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
              Saved
            </span>
          )}
        </div>
      </div>
    </main>
  );
}
