'use client';

/**
 * Settings — Notifications
 * Reads the user's notification preferences from GET /api/settings and
 * persists changes via PUT /api/settings. Sleep reminders are managed on
 * the Sleep settings page; this page covers general delivery and reminders.
 */

import { useCallback, useEffect, useState } from 'react';
import { Bell, CheckCircle2, Clock, ShieldAlert } from 'lucide-react';
import { apiRequest, ApiError } from '@/lib/api-client';
import { useAuth } from '@/hooks/useAuth';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Switch } from '@/components/ui/Switch';
import { Skeleton } from '@/components/ui/Skeleton';

interface NotificationsRow {
  notificationsEnabled: boolean;
  emailNotifications: boolean;
  pushNotifications: boolean;
  smsNotifications: boolean;
  dailyReminder: boolean;
  dailyReminderTime: string | null;
  habitReminders: boolean;
  goalReminders: boolean;
  weeklyReviewReminder: boolean;
  monthlyResetReminder: boolean;
  focusReminders: boolean;
  breakReminders: boolean;
  quietHoursStart: string | null;
  quietHoursEnd: string | null;
}

const FALLBACK: NotificationsRow = {
  notificationsEnabled: true,
  emailNotifications: true,
  pushNotifications: true,
  smsNotifications: false,
  dailyReminder: true,
  dailyReminderTime: '20:00',
  habitReminders: true,
  goalReminders: true,
  weeklyReviewReminder: true,
  monthlyResetReminder: true,
  focusReminders: true,
  breakReminders: true,
  quietHoursStart: null,
  quietHoursEnd: null,
};

interface ToggleRow {
  key: keyof NotificationsRow;
  label: string;
  description: string;
}

export default function NotificationsSettingsPage() {
  const { user, isAuthenticated, isLoading } = useAuth();

  const [settings, setSettings] = useState<NotificationsRow>(FALLBACK);
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
      const data = await apiRequest<Partial<NotificationsRow>>(`/api/users/${user.id}/settings`);
      setSettings({
        notificationsEnabled: data.notificationsEnabled ?? FALLBACK.notificationsEnabled,
        emailNotifications: data.emailNotifications ?? FALLBACK.emailNotifications,
        pushNotifications: data.pushNotifications ?? FALLBACK.pushNotifications,
        smsNotifications: data.smsNotifications ?? FALLBACK.smsNotifications,
        dailyReminder: data.dailyReminder ?? FALLBACK.dailyReminder,
        dailyReminderTime: data.dailyReminderTime ?? FALLBACK.dailyReminderTime,
        habitReminders: data.habitReminders ?? FALLBACK.habitReminders,
        goalReminders: data.goalReminders ?? FALLBACK.goalReminders,
        weeklyReviewReminder: data.weeklyReviewReminder ?? FALLBACK.weeklyReviewReminder,
        monthlyResetReminder: data.monthlyResetReminder ?? FALLBACK.monthlyResetReminder,
        focusReminders: data.focusReminders ?? FALLBACK.focusReminders,
        breakReminders: data.breakReminders ?? FALLBACK.breakReminders,
        quietHoursStart: data.quietHoursStart ?? FALLBACK.quietHoursStart,
        quietHoursEnd: data.quietHoursEnd ?? FALLBACK.quietHoursEnd,
      });
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'Failed to load notification preferences.');
    } finally {
      setLoading(false);
    }
  }, [user?.id]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- mount data fetch
    void load();
  }, [load]);

  const toggle = (key: keyof NotificationsRow) => (checked: boolean) => {
    setSettings((current) => ({ ...current, [key]: checked }));
    setSaved(false);
  };

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      await apiRequest('/api/settings', {
        method: 'PUT',
        body: {
          notificationsEnabled: settings.notificationsEnabled,
          emailNotifications: settings.emailNotifications,
          pushNotifications: settings.pushNotifications,
          smsNotifications: settings.smsNotifications,
          dailyReminder: settings.dailyReminder,
          dailyReminderTime: settings.dailyReminderTime,
          habitReminders: settings.habitReminders,
          goalReminders: settings.goalReminders,
          weeklyReviewReminder: settings.weeklyReviewReminder,
          monthlyResetReminder: settings.monthlyResetReminder,
          focusReminders: settings.focusReminders,
          breakReminders: settings.breakReminders,
          quietHoursStart: settings.quietHoursStart,
          quietHoursEnd: settings.quietHoursEnd,
        },
      });
      setSaved(true);
      window.setTimeout(() => setSaved(false), 1600);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to save notification preferences.');
    } finally {
      setSaving(false);
    }
  };

  if (isLoading) {
    return (
      <main className="container mx-auto max-w-3xl px-4 py-8">
        <Skeleton className="h-8 w-44" />
        <div className="mt-6 space-y-6">
          <Skeleton className="h-80 rounded-xl" />
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
          </div>
        </Card>
      </main>
    );
  }

  const general: ToggleRow[] = [
    {
      key: 'dailyReminder',
      label: 'Daily reminder',
      description: 'Get reminded to log your habits each day.',
    },
    {
      key: 'habitReminders',
      label: 'Habit reminders',
      description: 'Prompt before scheduled habits are due.',
    },
    {
      key: 'goalReminders',
      label: 'Goal check-ins',
      description: 'Nudge when a goal check-in is overdue.',
    },
    {
      key: 'weeklyReviewReminder',
      label: 'Weekly review',
      description: 'Receive a summary of your week.',
    },
    {
      key: 'monthlyResetReminder',
      label: 'Monthly reset',
      description: 'Remind you before the monthly reset.',
    },
    {
      key: 'focusReminders',
      label: 'Focus session reminders',
      description: 'Notify about scheduled or paused focus sessions.',
    },
    {
      key: 'breakReminders',
      label: 'Break reminders',
      description: 'Tell you when it\u2019s time for a break.',
    },
  ];

  const channels: ToggleRow[] = [
    {
      key: 'emailNotifications',
      label: 'Email',
      description: 'Deliver notifications by email.',
    },
    {
      key: 'pushNotifications',
      label: 'Push notifications',
      description: 'Deliver real-time notifications to this device.',
    },
    {
      key: 'smsNotifications',
      label: 'SMS',
      description: 'Deliver notifications by text message.',
    },
  ];

  return (
    <main className="container mx-auto max-w-3xl px-4 py-8">
      <div className="mb-6">
        <h1 className="flex items-center gap-2 text-2xl font-bold">
          <Bell className="h-6 w-6 text-primary" />
          Notifications
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Choose what reminders you receive and how they\u2019re delivered.
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
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-1/2" />
            </div>
          ) : (
            <div className="space-y-7">
              <Switch
                checked={settings.notificationsEnabled}
                onChange={toggle('notificationsEnabled')}
                label="Notification master switch"
                description="Turns all reminders on or off at once."
              />

              <div>
                <h2 className="mb-3 text-sm font-semibold text-foreground">Delivery channels</h2>
                <div className="space-y-3">
                  {channels.map((row) => (
                    <Switch
                      key={row.key}
                      checked={settings[row.key] as boolean}
                      onChange={toggle(row.key)}
                      label={row.label}
                      description={row.description}
                      disabled={!settings.notificationsEnabled}
                    />
                  ))}
                </div>
              </div>

              <div>
                <h2 className="mb-3 text-sm font-semibold text-foreground">Reminders</h2>
                <div className="space-y-3">
                  {general.map((row) => (
                    <Switch
                      key={row.key}
                      checked={settings[row.key] as boolean}
                      onChange={toggle(row.key)}
                      label={row.label}
                      description={row.description}
                      disabled={!settings.notificationsEnabled}
                    />
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                <Input
                  label="Daily reminder time"
                  type="time"
                  value={settings.dailyReminderTime ?? ''}
                  onChange={(event) => {
                    setSettings({ ...settings, dailyReminderTime: event.target.value });
                    setSaved(false);
                  }}
                  disabled={!settings.dailyReminder}
                  helperText="When the daily nudge is sent."
                />
                <Input
                  label="Quiet hours start"
                  type="time"
                  value={settings.quietHoursStart ?? ''}
                  onChange={(event) => {
                    setSettings({ ...settings, quietHoursStart: event.target.value || null });
                    setSaved(false);
                  }}
                  helperText="Leave empty for none."
                />
                <Input
                  label="Quiet hours end"
                  type="time"
                  value={settings.quietHoursEnd ?? ''}
                  onChange={(event) => {
                    setSettings({ ...settings, quietHoursEnd: event.target.value || null });
                    setSaved(false);
                  }}
                  helperText="Don\u2019t send reminders inside this window."
                />
              </div>

              <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Clock className="h-3.5 w-3.5" />
                Sleep reminders are configured on the Sleep settings page.
              </p>

              {error && (
                <div className="rounded-md bg-destructive/10 px-4 py-3 text-sm text-destructive" role="alert">
                  {error}
                </div>
              )}

              <div className="flex items-center gap-3">
                <Button onClick={() => void save()} isLoading={saving} disabled={loading}>
                  Save preferences
                </Button>
                {saved && (
                  <span className="inline-flex items-center gap-1 text-sm text-emerald-600 dark:text-emerald-400">
                    <CheckCircle2 className="h-4 w-4" />
                    Saved
                  </span>
                )}
              </div>
            </div>
          )}
        </div>
      </Card>
    </main>
  );
}