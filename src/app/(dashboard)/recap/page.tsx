'use client';

import DashboardLayout from '@/components/dashboard/DashboardLayout';
import { Activity, Flame, Sparkles, TrendingUp } from 'lucide-react';

const cards = [
  { label: 'Completion rate', value: '82%', detail: 'Across this week', icon: TrendingUp, tone: 'emerald' },
  { label: 'Current streak', value: '12 days', detail: 'Healthy momentum', icon: Flame, tone: 'amber' },
  { label: 'Focus hours', value: '18.5h', detail: 'Deep work this week', icon: Activity, tone: 'teal' },
  { label: 'Highlights', value: '3 wins', detail: 'Strong consistency', icon: Sparkles, tone: 'purple' },
] as const;

export default function RecapPage() {
  return (
    <DashboardLayout>
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-zinc-100">Weekly recap</h1>
        <p className="mt-1 text-sm text-zinc-500">Review patterns, energy, and progress across the last 7 days.</p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {cards.map(({ label, value, detail, icon: Icon, tone }) => (
          <div key={label} className="rounded-2xl border border-zinc-800 bg-zinc-900/50 p-5">
            <div className={`mb-4 inline-flex rounded-xl p-2 ${
              tone === 'emerald' ? 'bg-emerald-500/10 text-emerald-400' :
              tone === 'amber' ? 'bg-amber-500/10 text-amber-400' :
              tone === 'teal' ? 'bg-teal-500/10 text-teal-400' : 'bg-purple-500/10 text-purple-400'
            }`}>
              <Icon size={18} />
            </div>
            <p className="text-sm text-zinc-400">{label}</p>
            <p className="mt-2 text-3xl font-semibold text-zinc-100">{value}</p>
            <p className="mt-2 text-xs text-zinc-500">{detail}</p>
          </div>
        ))}
      </div>

      <div className="mt-6 rounded-2xl border border-zinc-800 bg-zinc-900/50 p-5">
        <h2 className="text-lg font-semibold text-zinc-100">This week at a glance</h2>
        <div className="mt-4 space-y-4 text-sm text-zinc-300">
          <div className="rounded-xl border border-zinc-800 bg-zinc-950/40 p-4">
            <p className="font-medium text-zinc-100">Biggest win</p>
            <p className="mt-1 text-zinc-400">You maintained your non-negotiables for 5 out of 7 days and showed strong consistency on your morning routine.</p>
          </div>
          <div className="rounded-xl border border-zinc-800 bg-zinc-950/40 p-4">
            <p className="font-medium text-zinc-100">What to improve</p>
            <p className="mt-1 text-zinc-400">Protect your evening wind-down and reduce screen time before bed to improve recovery quality.</p>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
