'use client';

import { Timer } from 'lucide-react';
import StatTile from '@/components/recap/stat-tile';
import type { AnalyticsFocusSummary } from '@/types/analytics';

interface FocusSummaryCardProps {
  focus: AnalyticsFocusSummary;
  /** Human label for the selected period (e.g. "This week"). */
  periodLabel?: string;
}

/**
 * Focus summary: sessions and minutes for the selected period, the per-day
 * average, and the peak hours. Source: FocusSession rows (real counts, zero
 * superseded by a placeholder).
 */
export default function FocusSummaryCard({ focus, periodLabel = 'Period' }: FocusSummaryCardProps) {
  const hasData = focus.period.sessions > 0 || focus.dailyAverage.sessions > 0;
  const ratioLabel =
    focus.breaks.ratio === null
      ? '\u2014'
      : focus.breaks.ratio >= 1
        ? `${focus.breaks.ratio.toFixed(1)} : 1`
        : `1 : ${focus.breaks.ratio > 0 ? (1 / focus.breaks.ratio).toFixed(1) : '\u221e'}`;

  return (
    <section className="glass-panel spotlight-hover rounded-2xl p-6 shadow-soft">
      <header className="mb-4 flex items-center gap-2">
        <span className="inline-flex rounded-lg bg-violet-500/10 p-2 text-violet-500">
          <Timer className="h-4 w-4" aria-hidden="true" />
        </span>
        <h2 className="text-sm font-semibold text-foreground">Focus</h2>
      </header>

      {hasData ? (
        <>
          <div className="grid grid-cols-2 gap-3">
            <StatTile
              accent="sky"
              icon={<Timer className="h-5 w-5" />}
              label={periodLabel.toLowerCase()}
              value={String(focus.period.sessions)}
              detail={`${focus.period.minutes} min focused`}
            />
            <StatTile
              accent="emerald"
              icon={<Timer className="h-5 w-5" />}
              label="Daily avg"
              value={String(focus.dailyAverage.sessions)}
              detail={`${focus.dailyAverage.minutes} min / day`}
            />
          </div>
          {focus.peakHours.length > 0 && (
            <p className="mt-4 text-xs text-muted-foreground">
              Peak hours:{' '}
              <span className="font-semibold text-foreground">{focus.peakHours.join(', ')}</span>
            </p>
          )}
          {focus.breaks.count > 0 && (
            <div className="mt-4 rounded-xl border border-border/60 bg-card/60 px-3 py-2">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                Breaks
              </p>
              <dl className="mt-1 flex flex-wrap gap-x-5 gap-y-1 text-xs">
                <div className="flex items-center gap-1.5">
                  <span className="text-muted-foreground">Taken</span>
                  <span className="font-semibold tabular-nums text-foreground">
                    {focus.breaks.count}
                  </span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="text-muted-foreground">Avg length</span>
                  <span className="font-semibold tabular-nums text-foreground">
                    {focus.breaks.averageMinutes !== null
                      ? `${focus.breaks.averageMinutes}m`
                      : '\u2014'}
                  </span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="text-muted-foreground">Break : focus</span>
                  <span className="font-semibold tabular-nums text-foreground">{ratioLabel}</span>
                </div>
              </dl>
            </div>
          )}
        </>
      ) : (
        <p className="py-6 text-center text-sm text-muted-foreground">
          Run focus sessions and they will be summarized here.
        </p>
      )}
    </section>
  );
}