'use client';

/**
 * Settings — Habits
 * Habit reminder preferences. Reads the current values from
 * GET /api/users/[id]/settings (owner-only) and writes changes via
 * PUT /api/settings; the write route returns a plain envelope so failures
 * (e.g. maintenance) surface as an error banner.
 */

import { useCallback, useEffect, useState } from 'react';
import { CheckCircle2, ShieldAlert } from 'lucide-react';
import { apiRequest, ApiError } from '@/lib/api-client';
import { useAuth } from '@/hooks/useAuth';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Switch } from '@/components/ui/Switch';
import { Skeleton } from '@/components/ui/Skeleton';

interface HabitsSettingsRow {
  dailyReminder: boolean;
  dailyReminderTime: string | null;
  habitReminders: boolean;
  goalReminders: boolean;
}

export default function HabitsSettingsPage() {
  const { user, isAuthenticated, isLoading } = useAuth();

  const [settings, setSettings] = useState<HabitsSettingsRow>({
    dailyReminder: true,
    dailyReminderTime: '09:00',
    habitReminders: true,
    goalReminders: true,
  });
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
      const data = await apiRequest<HabitsSettingsRow>(`/api/users/${user.id}/settings`);
      setSettings({
        dailyReminder: data.dailyReminder ?? true,
        dailyReminderTime: data.dailyReminderTime ?? '09:00',
        habitReminders: data.habitReminders ?? true,
        goalReminders: data.goalReminders ?? true,
      });
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'Failed to load habit settings.');
    } finally {
      setLoading(false);
    }
  }, [user?.id]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- mount data fetch
    void load();
  }, [load]);

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      await apiRequest('/api/settings', {
        method: 'PUT',
        body: {
          dailyReminder: settings.dailyReminder,
          dailyReminderTime: settings.dailyReminderTime,
          habitReminders: settings.habitReminders,
          goalReminders: settings.goalReminders,
        },
      });
      setSaved(true);
      window.setTimeout(() => setSaved(false), 1600);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to save habit settings.');
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
              className="mt-6 inline-flex h-10 w-full items-center justify-center rounded-lg bg-primary light-sweep glow-neon px-4 text-sm font-semibold text-primary-foreground shadow-sm transition-[background-color,box-shadow,transform] duration-200 ease-out-expo hover:bg-primary/90 active:scale-[0.97]"
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
        <h1 className="text-2xl font-bold">Habits</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Reminder defaults applied to all habit tracking.
        </p>
      </div>

      {loadError && (
        <div className="mb-6 rounded-md bg-destructive/10 px-4 py-3 text-sm text-destructive" role="alert">
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
              <Switch
                checked={settings.habitReminders}
                onChange={(checked) => setSettings({ ...settings, habitReminders: checked })}
                label="Habit reminders"
              />
              <Switch
                checked={settings.goalReminders}
                onChange={(checked) => setSettings({ ...settings, goalReminders: checked })}
                label="Goal reminders"
              />
              <Switch
                checked={settings.dailyReminder}
                onChange={(checked) => setSettings({ ...settings, dailyReminder: checked })}
                label="Daily summary reminder"
              />
              <div>
                <Input
                  label="Daily reminder time"
                  type="time"
                  value={settings.dailyReminderTime ?? ''}
                  onChange={(event) => setSettings({ ...settings, dailyReminderTime: event.target.value })}
                />
              </div>
            </div>
          )}

          {error && (
            <div className="mt-4 rounded-md bg-destructive/10 px-4 py-3 text-sm text-destructive" role="alert">
              {error}
            </div>
          )}

          <div className="mt-6 flex items-center gap-3">
            <Button onClick={() => void save()} isLoading={saving} disabled={loading}>
              Save changes
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