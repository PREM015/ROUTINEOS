'use client';

import { useId, useState } from 'react';
import { Activity, BatteryFull, Table2 } from 'lucide-react';
import { LineChart } from '@/components/charts/LineChart';
import type { AnalyticsMoodPulsePoint } from '@/types/analytics';

interface MoodPulseCardProps {
  moodPulse: AnalyticsMoodPulsePoint[];
  /**
   * The range the series covers, e.g. "1 – 31 January".
   *
   * The card used to say "Mood and energy today" unconditionally, which was simply
   * false on three of the four tabs: the series is built from every mood and
   * energy row in the *selected period*, so on the month tab a month of points was
   * announced as today.
   */
  periodLabel: string;
}

/**
 * Intraday mood + energy lines. Both series are nullable and are skipped when
 * absent, so a null is never rendered as a fake dip to zero.
 *
 * The figure table and the summary sentence are not decoration. `PeriodChart` has
 * both for the same reason: a chart's contents are otherwise unreachable without
 * sight, and on a year tab there are up to 300 points behind a 140px line.
 */
export default function MoodPulseCard({ moodPulse, periodLabel }: MoodPulseCardProps) {
  const [showTable, setShowTable] = useState(false);
  const tableId = useId();

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
        <button
          type="button"
          onClick={() => setShowTable((open) => !open)}
          aria-expanded={showTable}
          aria-controls={tableId}
          className="ml-auto inline-flex items-center gap-1.5 rounded-lg border border-border/60 px-2.5 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        >
          <Table2 className="h-3.5 w-3.5" aria-hidden="true" />
          {showTable ? 'Hide figures' : 'Show figures'}
        </button>
      </header>

      {/*
        Always in the accessibility tree rather than revealed on focus: a
        screen-reader user should not have to guess that a summary exists.
      */}
      <p className="sr-only">{summarise(rows, periodLabel, { hasMood, hasEnergy })}</p>

      <LineChart
        data={rows}
        xKey="label"
        dataKey={dataKeys}
        height={140}
        colors={['#10b981', '#8b5cf6']}
        ariaLabel={`Mood and energy, ${periodLabel}`}
      />

      {showTable && (
        <div id={tableId} className="mt-4 max-h-64 overflow-auto rounded-xl border border-border/60">
          <table className="w-full text-sm">
            <caption className="sr-only">Mood and energy readings, {periodLabel}</caption>
            <thead className="bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th scope="col" className="px-3 py-2 font-medium">
                  Time
                </th>
                {hasMood && (
                  <th scope="col" className="px-3 py-2 text-right font-medium">
                    Mood
                  </th>
                )}
                {hasEnergy && (
                  <th scope="col" className="px-3 py-2 text-right font-medium">
                    Energy
                  </th>
                )}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, index) => (
                <tr key={`${row.label}-${index}`} className="border-t border-border/40">
                  <th scope="row" className="px-3 py-2 text-left font-normal text-foreground">
                    {row.label}
                  </th>
                  {hasMood && (
                    <td
                      className={`px-3 py-2 text-right tabular-nums ${
                        row.mood == null ? 'text-muted-foreground' : 'text-foreground'
                      }`}
                    >
                      {row.mood ?? 'Not logged'}
                    </td>
                  )}
                  {hasEnergy && (
                    <td
                      className={`px-3 py-2 text-right tabular-nums ${
                        row.energy == null ? 'text-muted-foreground' : 'text-foreground'
                      }`}
                    >
                      {row.energy ?? 'Not logged'}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

interface PulseRow {
  label: string;
  mood: number | null;
  energy: number | null;
}

/**
 * A sentence describing the series, built from the data rather than written by
 * hand, so it cannot fall out of step with what is plotted.
 */
function summarise(
  rows: PulseRow[],
  periodLabel: string,
  series: { hasMood: boolean; hasEnergy: boolean }
): string {
  const parts: string[] = [];

  if (series.hasMood) {
    const values = rows.map((r) => r.mood).filter((v): v is number => v != null);
    if (values.length > 0) {
      const avg = values.reduce((sum, v) => sum + v, 0) / values.length;
      parts.push(
        `Mood: ${values.length} ${values.length === 1 ? 'reading' : 'readings'}, average ${avg.toFixed(1)} out of 5.`
      );
    }
  }
  if (series.hasEnergy) {
    const values = rows.map((r) => r.energy).filter((v): v is number => v != null);
    if (values.length > 0) {
      const avg = values.reduce((sum, v) => sum + v, 0) / values.length;
      parts.push(
        `Energy: ${values.length} ${values.length === 1 ? 'reading' : 'readings'}, average ${avg.toFixed(1)} out of 5.`
      );
    }
  }

  return `${parts.join(' ')} Range: ${periodLabel}.`;
}

function formatTime(timestamp: string): string {
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return timestamp;
  return new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit' }).format(date);
}
