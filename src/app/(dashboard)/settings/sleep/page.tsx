'use client';

/**
 * Settings — Sleep
 * Sleep target and reminder preferences. Reads values from
 * GET /api/users/[id]/settings and writes them via PUT /api/settings.
 */

import { useCallback, useEffect, useState } from 'react';
import { CheckCircle2, Moon, ShieldAlert } from 'lucide-react';
import { apiRequest, ApiError } from '@/lib/api-client';
import { useAuth } from '@/hooks/useAuth';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Switch } from '@/components/ui/Switch';
import { Skeleton } from '@/components/ui/Skeleton';

interface SleepSettingsRow {
  targetBedtime: string | null;
  targetWakeTime: string | null;
  minSleepDuration: number | null;
  sleepReminder: boolean;
  sleepReminderTime: string | null;
}

export default function SleepSettingsPage() {
  const { user, isAuthenticated, isLoading } = useAuth();

  const [settings, setSettings] = useState<SleepSettingsRow>({
    targetBedtime: '23:00',
    targetWakeTime: '07:00',
    minSleepDuration: 420,
    sleepReminder: false,
    sleepReminderTime: '22:30',
  });
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const load = useCallback(async () => {
    if (!user?.id) return;
    setLoading(true);
    setLoadError(null);
    try {
      const data = await apiRequest<SleepSettingsRow>(`/api/users/${user.id}/settings`);
      setSettings({
        targetBedtime: data.targetBedtime ?? '23:00',
        targetWakeTime: data.targetWakeTime ?? '07:00',
        minSleepDuration: data.minSleepDuration ?? 420,
        sleepReminder: data.sleepReminder ?? false,
        sleepReminderTime: data.sleepReminderTime ?? '22:30',
      });
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'Failed to load sleep settings.');
    } finally {
      setLoading(false);
    }
  }, [user?.id]);

  useEffect(() => {
    void load();
  }, [load]);

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      await apiRequest('/api/settings', {
        method: 'PUT',
        body: {
          targetBedtime: settings.targetBedtime,
          targetWakeTime: settings.targetWakeTime,
          minSleepDuration: settings.minSleepDuration,
          sleepReminder: settings.sleepReminder,
          sleepReminderTime: settings.sleepReminderTime,
        },
      });
      setSaved(true);
      window.setTimeout(() => setSaved(false), 1600);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to save sleep settings.');
    } finally {
      setSaving(false);
    }
  };

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

  if (!isAuthenticated || !user) {
    return (
      <main className="container mx-auto max-w-2xl px-4 py-16">
        <Card>
          <div className="p-8 text-center">
            <ShieldAlert className="mx-auto h-12 w-12 text-amber-500" />
            <h1 className="mt-4 text-xl font-bold">Sign in required</h1>
            <a
              href="/login"
              className="mt-6 inline-block rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700"
            >
              Sign in
            </a>
          </div>
        </Card>
      </main>
    );
  }

  return (
    <main className="container mx-auto max-w-3xl px-4 py-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold">Sleep</h1>
        <p className="mt-1 text-sm text-gray-600">
          Set targets the wellness tracker compares against.
        </p>
      </div>

      {loadError && (
        <div className="mb-6 rounded-md bg-red-50 px-4 py-3 text-sm text-red-700" role="alert">
          {loadError}
        </div>
      )}

      <Card>
        <div className="p-6">
          {loading ? (
            <div className="space-y-4">
              <Skeleton className="h-8 w-full" />
              <Skeleton className="h-8 w-full" />
              <Skeleton className="h-8 w-1/2" />
            </div>
          ) : (
            <div className="space-y-5">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Input
                  label="Target bedtime"
                  type="time"
                  value={settings.targetBedtime ?? ''}
                  onChange={(event) => setSettings({ ...settings, targetBedtime: event.target.value })}
                />
                <Input
                  label="Target wake time"
                  type="time"
                  value={settings.targetWakeTime ?? ''}
                  onChange={(event) => setSettings({ ...settings, targetWakeTime: event.target.value })}
                />
              </div>
              <div>
                <Input
                  label="Minimum sleep duration (minutes)"
                  type="number"
                  min={0}
                  max={1440}
                  value={settings.minSleepDuration ?? 0}
                  onChange={(event) =>
                    setSettings({ ...settings, minSleepDuration: Number(event.target.value) })
                  }
                  helperText="Used as the healthy threshold in the sleep summary."
                />
              </div>
              <Switch
                checked={settings.sleepReminder}
                onChange={(checked) => setSettings({ ...settings, sleepReminder: checked })}
                label="Sleep reminder"
              />
              {settings.sleepReminder && (
                <Input
                  label="Sleep reminder time"
                  type="time"
                  value={settings.sleepReminderTime ?? ''}
                  onChange={(event) => setSettings({ ...settings, sleepReminderTime: event.target.value })}
                />
              )}
            </div>
          )}

          {error && (
            <div className="mt-4 rounded-md bg-red-50 px-4 py-3 text-sm text-red-700" role="alert">
              {error}
            </div>
          )}

          <div className="mt-6 flex items-center gap-3">
            <Button onClick={() => void save()} isLoading={saving} disabled={loading}>
              Save changes
            </Button>
            {saved && (
              <span className="inline-flex items-center gap-1 text-sm text-green-600">
                <CheckCircle2 className="h-4 w-4" />
                Saved
              </span>
            )}
          </div>
        </div>
      </Card>

      <p className="mt-4 flex items-center gap-1.5 text-xs text-gray-500">
        <Moon className="h-3.5 w-3.5" />
        Sleep logs are recorded from the wellness page; these targets set your goals.
      </p>
    </main>
  );
}