'use client';

/**
 * Settings — Sleep
 *
 * Sleep targets, the bedtime reminder, and sleep-session auto-start.
 *
 * Fixes vs. the previous version:
 *  - "Start sleep automatically" was a dead switch: `sleepAutoStartEnabled` was
 *    only read by this file (to hide the minutes input) and ignored by
 *    `sleep-session.service.ts`, so turning it off changed nothing. The
 *    service now honours it in all three places it previously overrode it.
 *  - The two number inputs advertised `min=0` / `max=1440`, but
 *    `updateSettingsSchema` enforces `minSleepDuration` in 60–720 and the
 *    auto-start minutes in 1–120. Values outside those ranges were accepted by
 *    the UI and rejected with a 400. The bounds now match the server.
 *  - Clearing a numeric field sent `0` (`Number('')`), which failed
 *    validation. Empty fields are now sent as the documented default.
 *  - `ensurePushSubscription()` had no `.catch`, so a throw would leave the
 *    "Setting up device notifications…" line stuck forever.
 */

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { CheckCircle2, Moon, ShieldAlert } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { useSettings } from '@/hooks/useSettings';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Switch } from '@/components/ui/Switch';
import { Skeleton } from '@/components/ui/Skeleton';
import { ensurePushSubscription, registerServiceWorker } from '@/lib/pwa/push-client';

/** Must match `updateSettingsSchema` in `src/lib/validation/settings.schema.ts`. */
const MIN_SLEEP_DURATION = { min: 60, max: 720, step: 15, fallback: 420 };
const AUTO_START_MINUTES = { min: 1, max: 120, step: 1, fallback: 15 };

export default function SleepSettingsPage() {
  const { isAuthenticated, isLoading } = useAuth();
  const { settings, loading, save, patchLocal, saving, error } = useSettings();
  const [saved, setSaved] = useState(false);
  const [pushEnabled, setPushEnabled] = useState<boolean | null>(null);
  const [pushBusy, setPushBusy] = useState(false);

  // Register the service worker so prompt pushes can be delivered.
  useEffect(() => {
    void registerServiceWorker();
  }, []);

  useEffect(() => {
    if (!saved) return;
    const timer = window.setTimeout(() => setSaved(false), 1600);
    return () => window.clearTimeout(timer);
  }, [saved]);

  const handleReminderToggle = (checked: boolean) => {
    if (!settings) return;
    patchLocal({ sleepReminder: checked });
    if (checked) {
      setPushBusy(true);
      // `.catch` was missing: a rejection left `pushBusy` stuck true and the
      // "Setting up device notifications…" message on screen permanently.
      void ensurePushSubscription()
        .then((ok) => setPushEnabled(ok))
        .catch(() => setPushEnabled(false))
        .finally(() => setPushBusy(false));
    }
  };

  if (isLoading) {
    return (
      <main className="container mx-auto max-w-3xl px-4 py-8">
        <Skeleton className="h-8 w-40" />
        <div className="mt-6 space-y-6">
          <Skeleton className="h-56 rounded-xl" />
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
      targetBedtime: settings.targetBedtime?.trim() || null,
      targetWakeTime: settings.targetWakeTime?.trim() || null,
      minSleepDuration: settings.minSleepDuration ?? MIN_SLEEP_DURATION.fallback,
      sleepReminder: settings.sleepReminder,
      sleepAutoStartEnabled: settings.sleepAutoStartEnabled,
      sleepAutoStartAfterMinutes:
        settings.sleepAutoStartAfterMinutes ?? AUTO_START_MINUTES.fallback,
    });
    if (result) setSaved(true);
  };

  return (
    <main className="container mx-auto max-w-3xl px-4 py-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold">Sleep</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Set sleep targets, bedtime reminders and automatic session start.
        </p>
      </div>

      <div className="space-y-6">
        <Card>
          <div className="flex items-center gap-2 border-b border-border px-6 py-4">
            <Moon className="h-5 w-5 text-primary" aria-hidden="true" />
            <h2 className="text-lg font-bold">Targets</h2>
          </div>
          <div className="space-y-5 p-6">
            {loading || !settings ? (
              <>
                <Skeleton className="h-10 w-full max-w-xs" />
                <Skeleton className="h-10 w-full max-w-xs" />
                <Skeleton className="h-10 w-full max-w-xs" />
              </>
            ) : (
              <>
                <div className="max-w-xs">
                  <Input
                    label="Target bedtime"
                    type="time"
                    value={settings.targetBedtime ?? ''}
                    onChange={(event) =>
                      patchLocal({ targetBedtime: event.target.value || null })
                    }
                    helperText="Used to decide when to prompt you."
                  />
                </div>
                <div className="max-w-xs">
                  <Input
                    label="Target wake time"
                    type="time"
                    value={settings.targetWakeTime ?? ''}
                    onChange={(event) =>
                      patchLocal({ targetWakeTime: event.target.value || null })
                    }
                  />
                </div>
                <div className="max-w-xs">
                  <Input
                    label="Minimum sleep duration (minutes)"
                    type="number"
                    inputMode="numeric"
                    min={MIN_SLEEP_DURATION.min}
                    max={MIN_SLEEP_DURATION.max}
                    step={MIN_SLEEP_DURATION.step}
                    value={settings.minSleepDuration ?? MIN_SLEEP_DURATION.fallback}
                    onChange={(event) => {
                      const parsed = Number(event.target.value);
                      patchLocal({
                        minSleepDuration: Number.isFinite(parsed) && parsed > 0
                          ? Math.min(
                              Math.max(MIN_SLEEP_DURATION.min, Math.round(parsed)),
                              MIN_SLEEP_DURATION.max
                            )
                          : MIN_SLEEP_DURATION.fallback,
                      });
                    }}
                    helperText={`${MIN_SLEEP_DURATION.min}–${MIN_SLEEP_DURATION.max} minutes (${MIN_SLEEP_DURATION.min / 60}–${MIN_SLEEP_DURATION.max / 60} hours).`}
                  />
                </div>
              </>
            )}
          </div>
        </Card>

        <Card>
          <div className="border-b border-border px-6 py-4">
            <h2 className="text-lg font-bold">Bedtime reminder</h2>
          </div>
          <div className="space-y-5 p-6">
            {loading || !settings ? (
              <>
                <Skeleton className="h-8 w-full" />
                <Skeleton className="h-16 w-full" />
              </>
            ) : (
              <>
                <Switch
                  label="Sleep reminder"
                  description="Prompt me at my target bedtime."
                  checked={settings.sleepReminder}
                  onChange={handleReminderToggle}
                />

                {pushBusy && (
                  <p className="text-sm text-muted-foreground" role="status">
                    Setting up device notifications…
                  </p>
                )}
                {!pushBusy && pushEnabled === false && (
                  <p className="text-sm text-amber-600 dark:text-amber-400" role="status">
                    Browser notifications are not enabled. The reminder will only
                    appear in-app. You can enable it any time from the
                    Notifications page.
                  </p>
                )}

                <div className="max-w-xs">
                  <Input
                    label="Reminder time"
                    type="time"
                    value={settings.sleepReminderTime ?? settings.targetBedtime ?? ''}
                    disabled={!settings.sleepReminder}
                    onChange={(event) =>
                      patchLocal({ sleepReminderTime: event.target.value || null })
                    }
                    helperText="Defaults to your target bedtime."
                  />
                </div>
              </>
            )}
          </div>
        </Card>

        <Card>
          <div className="border-b border-border px-6 py-4">
            <h2 className="text-lg font-bold">Automatic start</h2>
          </div>
          <div className="space-y-5 p-6">
            {loading || !settings ? (
              <>
                <Skeleton className="h-8 w-full" />
                <Skeleton className="h-10 w-full max-w-xs" />
              </>
            ) : (
              <>
                <Switch
                  label="Start sleep automatically"
                  description="When off, sleep tracking only starts if you tap start. Nothing is started for you."
                  checked={settings.sleepAutoStartEnabled}
                  onChange={(checked) => patchLocal({ sleepAutoStartEnabled: checked })}
                />
                {settings.sleepAutoStartEnabled && (
                  <div className="max-w-xs">
                    <Input
                      label="Auto-start sleep after (minutes)"
                      type="number"
                      inputMode="numeric"
                      min={AUTO_START_MINUTES.min}
                      max={AUTO_START_MINUTES.max}
                      step={AUTO_START_MINUTES.step}
                      value={settings.sleepAutoStartAfterMinutes ?? AUTO_START_MINUTES.fallback}
                      onChange={(event) => {
                        const parsed = Number(event.target.value);
                        patchLocal({
                          sleepAutoStartAfterMinutes:
                            Number.isFinite(parsed) && parsed > 0
                              ? Math.min(
                                  Math.max(
                                    AUTO_START_MINUTES.min,
                                    Math.round(parsed)
                                  ),
                                  AUTO_START_MINUTES.max
                                )
                              : AUTO_START_MINUTES.fallback,
                        });
                      }}
                      helperText="How long after the prompt sleep starts if you do not respond."
                    />
                  </div>
                )}
              </>
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
    </main>
  );
}
