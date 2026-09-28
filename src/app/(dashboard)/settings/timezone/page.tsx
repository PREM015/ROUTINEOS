'use client';

/**
 * Settings — Timezone
 *
 * Picks a timezone from an `Intl.supportedValuesOf` list (with a curated
 * fallback) and saves it via `PUT /api/settings`, updating the local auth store
 * so formatting reflects the change immediately.
 *
 * Previously this page read `GET /api/users/[id]/settings` while every other
 * settings page read `GET /api/settings`, so two open tabs could show
 * different timezones. It now uses the shared settings store, like the rest.
 *
 * `timezone` exists on both `User` and `UserSettings`. `UserService` writes
 * both in one call, so the value the UI shows and the value used to bucket
 * daily scores cannot drift apart.
 */

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { CheckCircle2, Globe, ShieldAlert } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { useSettings } from '@/hooks/useSettings';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Select } from '@/components/ui/Select';
import { Skeleton } from '@/components/ui/Skeleton';

const FALLBACK_TIMEZONES = [
  'UTC',
  'Asia/Kolkata',
  'Asia/Tokyo',
  'Asia/Shanghai',
  'Europe/London',
  'Europe/Paris',
  'Europe/Berlin',
  'America/New_York',
  'America/Chicago',
  'America/Los_Angeles',
  'America/Sao_Paulo',
  'Australia/Sydney',
  'Africa/Cairo',
  'Africa/Lagos',
  'Pacific/Auckland',
] as const;

function getTimeZoneOptions(): readonly string[] {
  if (
    typeof Intl !== 'undefined' &&
    typeof Intl.supportedValuesOf === 'function'
  ) {
    try {
      return Intl.supportedValuesOf('timeZone');
    } catch {
      // Fall through to the curated list.
    }
  }
  return FALLBACK_TIMEZONES;
}

export default function TimezoneSettingsPage() {
  const { isAuthenticated, isLoading: authLoading, updateUser } = useAuth();
  const { settings, loading, save, patchLocal, saving, error } = useSettings();
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (!saved) return;
    const timer = window.setTimeout(() => setSaved(false), 1600);
    return () => window.clearTimeout(timer);
  }, [saved]);

  // Resolved lazily and memoised: `Intl.supportedValuesOf` returns ~600 zones
  // and is not cheap enough to call on every render.
  const options = useMemo(
    () => getTimeZoneOptions().map((zone) => ({ value: zone, label: zone })),
    []
  );

  const timezone = settings?.timezone ?? 'UTC';

  const persist = async () => {
    if (!settings) return;
    const result = await save({ timezone });
    if (result) {
      // Mirror onto the auth store so the sidebar / date formatting update
      // without a reload. The server writes `User.timezone` in the same call.
      updateUser({ timezone });
      setSaved(true);
    }
  };

  if (authLoading) {
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

  return (
    <main className="container mx-auto max-w-3xl px-4 py-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold">Timezone</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Used to interpret your local day for scores and reviews.
        </p>
      </div>

      <Card>
        <div className="p-6">
          <div className="flex items-center gap-2">
            <Globe className="h-5 w-5 text-primary" aria-hidden="true" />
            <h2 className="text-lg font-bold">Preferred timezone</h2>
          </div>

          {loading || !settings ? (
            <Skeleton className="mt-5 h-10 w-full max-w-sm" />
          ) : (
            <div className="mt-5 max-w-sm">
              <Select
                label="Timezone"
                value={timezone}
                onChange={(event) => patchLocal({ timezone: event.target.value })}
                options={options}
                helperText="Daily scores, streaks and reviews are bucketed by this timezone."
              />
              <p className="mt-2 text-sm text-muted-foreground">
                Current local time:{' '}
                <span className="font-medium text-foreground">
                  {new Intl.DateTimeFormat(undefined, {
                    timeZone: timezone,
                    dateStyle: 'medium',
                    timeStyle: 'short',
                  }).format(new Date())}
                </span>
              </p>
            </div>
          )}

          {error && (
            <div className="mt-4 rounded-md bg-destructive/10 px-4 py-3 text-sm text-destructive" role="alert">
              {error}
            </div>
          )}

          <div className="mt-6 flex flex-wrap items-center gap-3">
            <Button onClick={() => void persist()} isLoading={saving} disabled={loading || !settings}>
              Save timezone
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
    </main>
  );
}