'use client';

import { useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';
import { Button } from '@/components/ui';

type SettingsState = {
  name: string;
  timezone: string;
  weekStartsOn: string;
  targetBedtime: string;
  targetWakeTime: string;
  minSleepDuration: string;
};

const defaultTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Kolkata';

export default function SettingsPage() {
  const { data: session, status } = useSession();
  const [loading, setLoading] = useState(false);
  const [fetching, setFetching] = useState(true);
  const [form, setForm] = useState<SettingsState>({
    name: session?.user?.name || '',
    timezone: defaultTimezone,
    weekStartsOn: '1',
    targetBedtime: '22:30',
    targetWakeTime: '06:30',
    minSleepDuration: '7.5',
  });

  useEffect(() => {
    if (status === 'unauthenticated') return;

    const loadSettings = async () => {
      try {
        const response = await fetch('/api/settings');
        const data = await response.json();
        if (!response.ok) throw new Error(data?.error || 'Could not load settings');

        setForm({
          name: data.user?.name || session?.user?.name || '',
          timezone: data.settings?.timezone || defaultTimezone,
          weekStartsOn: String(data.settings?.weekStartsOn ?? 1),
          targetBedtime: data.settings?.targetBedtime || '22:30',
          targetWakeTime: data.settings?.targetWakeTime || '06:30',
          minSleepDuration: data.settings?.minSleepDuration ? String(data.settings.minSleepDuration / 60) : '7.5',
        });
      } catch (error) {
        console.error('Load settings failed:', error);
      } finally {
        setFetching(false);
      }
    };

    loadSettings();
  }, [session, status]);

  const handleChange = (key: keyof SettingsState, value: string) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const response = await fetch('/api/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: form.name.trim(),
          timezone: form.timezone,
          weekStartsOn: Number(form.weekStartsOn),
          targetBedtime: form.targetBedtime,
          targetWakeTime: form.targetWakeTime,
          minSleepDuration: Number(form.minSleepDuration) * 60,
        }),
      });

      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(data?.error || 'Unable to save settings');
      }

      alert('Settings saved successfully');
    } catch (error) {
      console.error('Save settings failed:', error);
      alert(error instanceof Error ? error.message : 'Unable to save settings');
    } finally {
      setLoading(false);
    }
  };

  if (status === 'loading' || fetching) {
    return <main className="mx-auto max-w-4xl p-6 text-slate-100">Loading settings…</main>;
  }

  return (
    <main className="mx-auto max-w-4xl space-y-6 p-6 text-slate-100">
      <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6">
        <p className="text-sm uppercase tracking-[0.2em] text-emerald-400">Profile</p>
        <h1 className="mt-2 text-3xl font-semibold">Settings</h1>
      </div>

      <form onSubmit={handleSubmit} className="grid gap-6 md:grid-cols-2">
        <section className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6">
          <h2 className="text-lg font-semibold">Account</h2>
          <div className="mt-4 space-y-4">
            <label className="block text-sm text-slate-300">
              Name
              <input
                value={form.name}
                onChange={(e) => handleChange('name', e.target.value)}
                className="mt-2 w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-2.5 text-slate-100 outline-none focus:border-emerald-500"
              />
            </label>

            <div className="rounded-xl border border-slate-800 bg-slate-950/50 p-3 text-sm text-slate-300">
              <p><span className="text-slate-500">Email:</span> {session?.user?.email || 'Not available'}</p>
              <p className="mt-2"><span className="text-slate-500">Role:</span> {session?.user?.role || 'USER'}</p>
            </div>
          </div>
        </section>

        <section className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6">
          <h2 className="text-lg font-semibold">Daily settings</h2>
          <div className="mt-4 space-y-4 text-sm text-slate-300">
            <label className="block">
              Timezone
              <input
                value={form.timezone}
                onChange={(e) => handleChange('timezone', e.target.value)}
                className="mt-2 w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-2.5 text-slate-100 outline-none focus:border-emerald-500"
              />
            </label>

            <label className="block">
              Week starts on
              <select
                value={form.weekStartsOn}
                onChange={(e) => handleChange('weekStartsOn', e.target.value)}
                className="mt-2 w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-2.5 text-slate-100 outline-none focus:border-emerald-500"
              >
                <option value="1">Monday</option>
                <option value="0">Sunday</option>
              </select>
            </label>

            <div className="grid gap-4 sm:grid-cols-2">
              <label className="block">
                Bedtime
                <input
                  type="time"
                  value={form.targetBedtime}
                  onChange={(e) => handleChange('targetBedtime', e.target.value)}
                  className="mt-2 w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-2.5 text-slate-100 outline-none focus:border-emerald-500"
                />
              </label>

              <label className="block">
                Wake time
                <input
                  type="time"
                  value={form.targetWakeTime}
                  onChange={(e) => handleChange('targetWakeTime', e.target.value)}
                  className="mt-2 w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-2.5 text-slate-100 outline-none focus:border-emerald-500"
                />
              </label>
            </div>

            <label className="block">
              Min sleep hours
              <input
                type="number"
                min="4"
                max="12"
                step="0.5"
                value={form.minSleepDuration}
                onChange={(e) => handleChange('minSleepDuration', e.target.value)}
                className="mt-2 w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-2.5 text-slate-100 outline-none focus:border-emerald-500"
              />
            </label>
          </div>
        </section>

        <div className="md:col-span-2 flex justify-end">
          <Button type="submit" variant="primary" loading={loading}>
            Save settings
          </Button>
        </div>
      </form>
    </main>
  );
}
