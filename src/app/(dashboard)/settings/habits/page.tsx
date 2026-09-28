'use client';

/**
 * Settings — Habits
 *
 * Habit/goal reminder defaults. These four columns (`dailyReminder`,
 * `dailyReminderTime`, `habitReminders`, `goalReminders`) were previously also
 * owned by `/settings/notifications`, which defaulted the time to `'20:00'`
 * while this page defaulted it to `'09:00'` — two owners, one column, two
 * different fallbacks.
 *
 * This page now:
 *   - reads and writes through the shared settings store, so it cannot disagree
 *     with the notifications page about the same row;
 *   - uses the same `'20:00'` default as the producer in
 *     `notifications/scheduler.ts`;
 *   - sends `null` for a cleared time field instead of `''`, which the
 *     `HH:mm` validation regex used to reject with a 400.
 */

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { BellRing, CheckCircle2, ShieldAlert, Target } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { useSettings } from '@/hooks/useSettings';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Switch } from '@/components/ui/Switch';
import { Skeleton } from '@/components/ui/Skeleton';

/** Matches `scheduleDailyReminder` in `src/server/notifications/scheduler.ts`. */
const DEFAULT_DAILY_REMINDER_TIME = '20:00';

export default function HabitsSettingsPage() {
  const { isAuthenticated, isLoading } = useAuth();
  const { settings, loading, save, patchLocal, saving, error } = useSettings();
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (!saved) return;
    const timer = window.setTimeout(() => setSaved(false), 1600);
    return () => window.clearTimeout(timer);
  }, [saved]);

  if (isLoading) {
    return (
      <main className="container mx-auto max-w-3xl px-4 py-8">
        <Skeleton className="h-8 w-40" />
        <div className="mt-6 space-y-6">
          <Skeleton className="h-72 rounded-xl" />
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
      habitReminders: settings.habitReminders,
      goalReminders: settings.goalReminders,
      dailyReminder: settings.dailyReminder,
      // `null` clears the column. Sending '' failed the HH:mm regex and
      // returned a 400, so the time could never be cleared.
      dailyReminderTime:
        settings.dailyReminderTime?.trim() || DEFAULT_DAILY_REMINDER_TIME,
    });
    if (result) setSaved(true);
  };

  return (
    <main className="container mx-auto max-w-3xl px-4 py-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold">Habits</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Reminder defaults applied to all habit tracking.
        </p>
      </div>

      <div className="space-y-6">
        <Card>
          <div className="flex items-center gap-2 border-b border-border px-6 py-4">
            <BellRing className="h-5 w-5 text-primary" aria-hidden="true" />
            <h2 className="text-lg font-bold">Reminders</h2>
          </div>
          <div className="space-y-5 p-6">
            {loading || !settings ? (
              <>
                <Skeleton className="h-8 w-full" />
                <Skeleton className="h-8 w-full" />
                <Skeleton className="h-8 w-1/2" />
              </>
            ) : (
              <>
                <Switch
                  label="Habit reminders"
                  description="Deliver a reminder for habits that are due today."
                  checked={settings.habitReminders}
                  onChange={(checked) => patchLocal({ habitReminders: checked })}
                />
                <Switch
                  label="Goal check-ins"
                  description="Nudge you when a goal check-in is overdue."
                  checked={settings.goalReminders}
                  onChange={(checked) => patchLocal({ goalReminders: checked })}
                />
                <Switch
                  label="Daily summary reminder"
                  description="A single nudge each day to log your habits."
                  checked={settings.dailyReminder}
                  onChange={(checked) => patchLocal({ dailyReminder: checked })}
                />
                <div className="max-w-xs">
                  <Input
                    label="Daily reminder time"
                    type="time"
                    value={settings.dailyReminderTime ?? ''}
                    disabled={!settings.dailyReminder}
                    onChange={(event) =>
                      patchLocal({ dailyReminderTime: event.target.value || null })
                    }
                    helperText={`Defaults to ${DEFAULT_DAILY_REMINDER_TIME} in your local timezone.`}
                  />
                </div>
              </>
            )}

            {error && (
              <div className="rounded-md bg-destructive/10 px-4 py-3 text-sm text-destructive" role="alert">
                {error}
              </div>
            )}

            <div className="flex flex-wrap items-center gap-3">
              <Button onClick={() => void persist()} isLoading={saving} disabled={loading || !settings}>
                Save changes
              </Button>
              {saved && (
                <span className="inline-flex items-center gap-1 text-sm text-emerald-600 dark:text-emerald-400">
                  <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
                  Saved
                </span>
              )}
            </div>
          </div>
        </Card>

        <Card>
          <div className="p-6">
            <div className="flex items-center gap-2">
              <Target className="h-5 w-5 text-primary" aria-hidden="true" />
              <h2 className="text-lg font-bold">Delivery channels</h2>
            </div>
            <p className="mt-2 text-sm text-muted-foreground">
              Choose which channels these reminders are sent through (email,
              push, quiet hours) on the Notifications page.
            </p>
            <Link
              href="/settings/notifications"
              className="mt-3 inline-block text-sm font-medium text-primary hover:underline"
            >
              Notification settings
            </Link>
          </div>
        </Card>
      </div>
    </main>
  );
}
