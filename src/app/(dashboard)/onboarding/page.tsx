'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { Button } from '@/components/ui';

const defaultTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Kolkata';

export default function OnboardingPage() {
  const router = useRouter();
  const { data: session, status } = useSession();
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({
    name: session?.user?.name || '',
    timezone: defaultTimezone,
    weekStartsOn: '1',
    targetBedtime: '22:30',
    targetWakeTime: '06:30',
    minSleepDuration: '7.5',
  });

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.replace('/login');
    }
    if (session?.user?.name) {
      setForm((prev) => ({ ...prev, name: session.user.name || prev.name }));
    }
  }, [session, status, router]);

  const handleChange = (key: keyof typeof form, value: string) => {
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
        throw new Error(data?.error || 'Unable to save onboarding details');
      }

      router.push('/');
      router.refresh();
    } catch (error) {
      console.error('Onboarding save failed:', error);
      alert(error instanceof Error ? error.message : 'Unable to save onboarding details');
    } finally {
      setLoading(false);
    }
  };

  if (status === 'loading') {
    return <main className="flex min-h-screen items-center justify-center bg-[#050816] text-slate-200">Loading…</main>;
  }

  return (
    <main className="mx-auto max-w-4xl p-6 text-slate-100">
      <div className="rounded-3xl border border-slate-800 bg-slate-900/60 p-8">
        <p className="text-sm uppercase tracking-[0.22em] text-emerald-400">Welcome</p>
        <h1 className="mt-2 text-3xl font-semibold">Set up your daily workflow</h1>
        <p className="mt-3 max-w-2xl text-slate-300">
          Configure your baseline rhythm so your habits and routines feel natural from day one.
        </p>

        <form onSubmit={handleSubmit} className="mt-8 space-y-6">
          <div className="grid gap-4 md:grid-cols-2">
            <label className="block text-sm text-slate-300">
              Name
              <input
                value={form.name}
                onChange={(e) => handleChange('name', e.target.value)}
                className="mt-2 w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-2.5 text-slate-100 outline-none focus:border-emerald-500"
              />
            </label>

            <label className="block text-sm text-slate-300">
              Timezone
              <input
                value={form.timezone}
                onChange={(e) => handleChange('timezone', e.target.value)}
                className="mt-2 w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-2.5 text-slate-100 outline-none focus:border-emerald-500"
              />
            </label>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <label className="block text-sm text-slate-300">
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

            <label className="block text-sm text-slate-300">
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

          <div className="grid gap-4 md:grid-cols-2">
            <label className="block text-sm text-slate-300">
              Target bedtime
              <input
                type="time"
                value={form.targetBedtime}
                onChange={(e) => handleChange('targetBedtime', e.target.value)}
                className="mt-2 w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-2.5 text-slate-100 outline-none focus:border-emerald-500"
              />
            </label>

            <label className="block text-sm text-slate-300">
              Target wake time
              <input
                type="time"
                value={form.targetWakeTime}
                onChange={(e) => handleChange('targetWakeTime', e.target.value)}
                className="mt-2 w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-2.5 text-slate-100 outline-none focus:border-emerald-500"
              />
            </label>
          </div>

          <div className="mt-8 grid gap-4 md:grid-cols-2">
            <div className="rounded-2xl border border-slate-800 bg-slate-950/50 p-5">
              <h2 className="text-lg font-semibold">1. Basic details</h2>
              <p className="mt-2 text-sm text-slate-400">Name, timezone, and your preferred change windows.</p>
            </div>
            <div className="rounded-2xl border border-slate-800 bg-slate-950/50 p-5">
              <h2 className="text-lg font-semibold">2. Minimum day</h2>
              <p className="mt-2 text-sm text-slate-400">Set the few habits that still count when energy is low.</p>
            </div>
            <div className="rounded-2xl border border-slate-800 bg-slate-950/50 p-5">
              <h2 className="text-lg font-semibold">3. Sleep target</h2>
              <p className="mt-2 text-sm text-slate-400">Define bedtime, wake time, and minimum sleep duration.</p>
            </div>
            <div className="rounded-2xl border border-slate-800 bg-slate-950/50 p-5">
              <h2 className="text-lg font-semibold">4. Starter habits</h2>
              <p className="mt-2 text-sm text-slate-400">Choose your first core habits and routine categories.</p>
            </div>
          </div>

          <div className="mt-8 flex gap-4">
            <Button type="submit" variant="primary" loading={loading}>
              Continue to dashboard
            </Button>
          </div>
        </form>
      </div>
    </main>
  );
}
