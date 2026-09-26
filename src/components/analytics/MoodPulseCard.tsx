'use client';

import { Activity, BatteryFull } from 'lucide-react';
import { LineChart } from '@/components/charts/LineChart';
import type { AnalyticsMoodPulsePoint } from '@/types/analytics';

interface MoodPulseCardProps {
  moodPulse: AnalyticsMoodPulsePoint[];
}

/**
 * Intraday mood + energy lines. Source: Mood and Energy rows in the current
 * day — both series are nullable and skipped when absent (nulls are not
 * rendered as fake zero dips).
 */
export default function MoodPulseCard({ moodPulse }: MoodPulseCardProps) {
  const rows = moodPulse.map((point) => ({
    label: formatTime(point.timestamp),
    mood: point.mood,
    energy: point.energy,
  }));
  const hasMood = rows.some((r) => r.mood != null);
  const hasEnergy = rows.some((r) => r.energy != null);

  if (!hasMood && !hasEnergy) {
    return (
      <section className="glass-panel spotlight-hover rounded-2xl p-6 shadow-soft">
        <header className="mb-4 flex items-center gap-2">
          <span className="inline-flex rounded-lg bg-emerald-500/10 p-2 text-emerald-500">
            <BatteryFull className="h-4 w-4" aria-hidden="true" />
          </span>
          <h2 className="text-sm font-semibold text-foreground">Mood &amp; energy pulse</h2>
        </header>
        <p className="py-6 text-center text-sm text-muted-foreground">
          Log mood or energy and the pulse will appear here.
        </p>
      </section>
    );
  }

  const dataKeys = [...(hasMood ? ['mood'] : []), ...(hasEnergy ? ['energy'] : [])];

  return (
    <section className="glass-panel spotlight-hover rounded-2xl p-6 shadow-soft">
      <header className="mb-4 flex items-center gap-2">
        <span className="inline-flex rounded-lg bg-emerald-500/10 p-2 text-emerald-500">
          <Activity className="h-4 w-4" aria-hidden="true" />
        </span>
        <h2 className="text-sm font-semibold text-foreground">Mood &amp; energy pulse</h2>
      </header>
      <LineChart
        data={rows}
        xKey="label"
        dataKey={dataKeys}
        height={140}
        colors={['#10b981', '#8b5cf6']}
        ariaLabel="Mood and energy today"
      />
    </section>
  );
}

function formatTime(timestamp: string): string {
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return timestamp;
  return new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit' }).format(date);
}