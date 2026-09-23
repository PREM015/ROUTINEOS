'use client';

/**
 * Settings — Timezone
 * Picks a timezone from an Intl.supportedValuesOf list (with a curated
 * fallback) and saves it via PUT /api/settings, updating the local auth store
 * so formatting reflects the change immediately.
 */

import { useCallback, useEffect, useState } from 'react';
import { CheckCircle2, Globe, ShieldAlert } from 'lucide-react';
import { apiRequest, ApiError } from '@/lib/api-client';
import { useAuth } from '@/hooks/useAuth';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Select } from '@/components/ui/Select';
import { Skeleton } from '@/components/ui/Skeleton';

interface TimezoneSettingsRow {
  timezone: string;
}

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
  const { user, isAuthenticated, isLoading: authLoading, updateUser } = useAuth();

  const [timezone, setTimezone] = useState<string>('UTC');
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  // eslint-disable-next-line react-hooks/preserve-manual-memoization -- inferred deps differ from source deps
  const load = useCallback(async () => {
    if (!user?.id) return;
    setLoading(true);
    setLoadError(null);
    try {
      const data = await apiRequest<TimezoneSettingsRow>(`/api/users/${user.id}/settings`);
      setTimezone(data.timezone || user.timezone || 'UTC');
    } catch {
      setTimezone(user.timezone || 'UTC');
    } finally {
      setLoading(false);
    }
  }, [user?.id, user?.timezone]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- mount data fetch
    void load();
  }, [load]);

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      await apiRequest('/api/settings', { method: 'PUT', body: { timezone } });
      updateUser({ timezone });
      setSaved(true);
      window.setTimeout(() => setSaved(false), 1600);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to save timezone.');
    } finally {
      setSaving(false);
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

  if (!isAuthenticated || !user) {
    return (
      <main className="container mx-auto max-w-2xl px-4 py-16">
        <Card>
          <div className="p-8 text-center">
            <ShieldAlert className="mx-auto h-12 w-12 text-amber-500" />
            <h1 className="mt-4 text-xl font-bold">Sign in required</h1>
            <a
              href="/login"
              className="mt-6 inline-flex h-10 w-full items-center justify-center rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground shadow-sm transition-[background-color,box-shadow,transform] duration-200 ease-out-expo hover:bg-primary/90 active:scale-[0.97]"
            >
              Sign in
            </a>
          </div>
        </Card>
      </main>
    );
  }

  const options = getTimeZoneOptions().map((zone) => ({ value: zone, label: zone }));

  return (
    <main className="container mx-auto max-w-3xl px-4 py-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold">Timezone</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Used to interpret your local day for scores and reviews.
        </p>
      </div>

      {loadError && (
        <div className="mb-6 rounded-md bg-destructive/10 px-4 py-3 text-sm text-destructive" role="alert">
          {loadError}
        </div>
      )}

      <Card>
        <div className="p-6">
          <div className="flex items-center gap-2">
            <Globe className="h-5 w-5 text-primary" />
            <h2 className="text-lg font-bold">Preferred timezone</h2>
          </div>

          {loading ? (
            <Skeleton className="mt-5 h-10 w-full max-w-sm" />
          ) : (
            <div className="mt-5 max-w-sm">
              <Select
                label="Timezone"
                value={timezone}
                onChange={(event) => setTimezone(event.target.value)}
                options={options}
              />
            </div>
          )}

          {error && (
            <div className="mt-4 rounded-md bg-destructive/10 px-4 py-3 text-sm text-destructive" role="alert">
              {error}
            </div>
          )}

          <div className="mt-6 flex items-center gap-3">
            <Button onClick={() => void save()} isLoading={saving} disabled={loading}>
              Save timezone
            </Button>
            {saved && (
              <span className="inline-flex items-center gap-1 text-sm text-emerald-600 dark:text-emerald-400">
                <CheckCircle2 className="h-4 w-4" />
                Saved
              </span>
            )}
          </div>
        </div>
      </Card>
    </main>
  );
}