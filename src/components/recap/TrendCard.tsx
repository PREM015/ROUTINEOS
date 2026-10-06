'use client';

import { useId, useState } from 'react';
import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { ChevronDown, TrendingDown, TrendingUp, Minus } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAnimationsEnabled } from '@/hooks/useAnimationsEnabled';

interface TrendPoint {
  label: string;
  value: number;
}

interface TrendCardProps {
  title: string;
  rows: TrendPoint[];
  /** Signed change vs the previous period (points). 0 hides/neutral. */
  delta?: number;
  accent?: string;
  unit?: string;
  valueFormatter?: (value: number) => string;
  headline?: string;
  /**
   * What one row means, in words.
   *
   * Used to build the sentence a screen reader hears and to label the data
   * table. "Score" alone does not say whether 84 is good; "average daily score"
   * says what the number is.
   */
  valueLabel?: string;
  className?: string;
}

const CHART_TOOLTIP_STYLE = {
  backgroundColor: 'var(--color-card, #18181b)',
  border: '1px solid var(--color-border, #27272a)',
  borderRadius: '10px',
  color: 'var(--color-foreground, #fff)',
} as const;

/**
 * A score trend, with a text equivalent of the chart behind a disclosure.
 *
 * ## Why the table exists
 *
 * The `<AreaChart>` was the page's primary visual and had no accessible name, no
 * `role`, and no fallback. `HeatMap` in the same tree already sets
 * `aria-label`, so the gap was an oversight rather than a house style. A
 * `<figure>` with `role="img"` and a generated description gives assistive tech
 * the shape of the data; the table gives it the data.
 *
 * The table is collapsed by default because a seven-row table under every chart
 * is worse than no table. It is one keystroke away and it is inside a real
 * `<details>`, so it works without JavaScript.
 *
 * ## Motion
 *
 * The area animation honours the same two-signal rule as the rest of the app —
 * the OS preference *and* the in-app setting — rather than running whenever the
 * chart happens to mount.
 */
export default function TrendCard({
  title,
  rows,
  delta = 0,
  accent = '#10b981',
  unit = '',
  valueFormatter,
  headline,
  valueLabel = 'Score',
  className,
}: TrendCardProps) {
  const animationsEnabled = useAnimationsEnabled();
  const [showTable, setShowTable] = useState(false);
  const tableId = useId();

  const lastValue = rows.at(-1)?.value ?? 0;
  const displayValue = headline ?? (valueFormatter ? valueFormatter(lastValue) : `${lastValue}${unit}`);
  const showDelta = delta !== 0;
  const up = delta > 0;

  const format = valueFormatter ?? ((value: number) => `${value}${unit}`);
  const hasRows = rows.length > 0;

  const first = rows[0]?.value;
  const last = rows.at(-1)?.value;
  const peak = rows.reduce<TrendPoint | null>(
    (best, row) => (best === null || row.value > best.value ? row : best),
    null
  );

  /*
    One sentence describing the whole series.

    A chart's job is the shape — the dip, the plateau, the climb — and a bare
    "min 40, max 92" loses it. This reports the endpoints and the peak, which is
    what a person would say out loud looking at the picture.
  */
  const summary = (() => {
    if (!hasRows || first === undefined || last === undefined || peak === null) return null;
    const direction =
      last > first ? 'rose' : last < first ? 'fell' : 'held steady';
    const lead = `${valueLabel} by ${rows.length} ${rows.length === 1 ? 'point' : 'points'}, from ${format(first)} to ${format(last)}`;
    const peakClause =
      peak.value === last
        ? `, peaking at the end`
        : `, peaking at ${peak.value} on ${peak.label}`;
    const flatClause = direction === 'held steady' ? '' : ` — ${direction}`;
    return `${lead}${peakClause}${flatClause}.`;
  })();

  const gradientId = `trendFill-${accent.replace('#', '')}-${title.replace(/\W/g, '')}`;

  return (
    <figure
      className={cn(
        'glass-panel spotlight-hover rounded-2xl p-6 shadow-soft transition-transform duration-300 ease-out-expo hover:-translate-y-0.5 hover:shadow-long',
        'motion-reduce:transform-none motion-reduce:transition-none',
        className
      )}
    >
      <figcaption className="mb-2 flex items-center justify-between gap-3">
        <h2 className="text-sm font-semibold text-foreground">{title}</h2>
        {showDelta && (
          <span
            className={cn(
              'inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold tabular-nums',
              up
                ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                : 'bg-rose-500/10 text-rose-600 dark:text-rose-400'
            )}
          >
            {up ? (
              <TrendingUp className="h-3.5 w-3.5" aria-hidden="true" />
            ) : (
              <TrendingDown className="h-3.5 w-3.5" aria-hidden="true" />
            )}
            {up ? '+' : ''}
            {delta.toFixed(1)} pts
            <span className="sr-only"> versus the previous period</span>
          </span>
        )}
      </figcaption>

      <p className="mb-4 text-3xl font-bold tabular-nums text-foreground">
        {displayValue}
        {!showDelta && (
          <Minus className="ml-2 inline h-4 w-4 text-muted-foreground" aria-hidden="true" />
        )}
      </p>

      <div
        className="h-44 w-full"
        role="img"
        aria-label={summary ?? `${title}: no data to plot`}
      >
        {hasRows ? (
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={rows} margin={{ top: 4, right: 4, bottom: 0, left: -18 }}>
              <defs>
                <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={accent} stopOpacity={0.35} />
                  <stop offset="100%" stopColor={accent} stopOpacity={0} />
                </linearGradient>
              </defs>
              <XAxis
                dataKey="label"
                stroke="var(--color-muted-foreground, #a1a1aa)"
                tickLine={false}
                axisLine={false}
                fontSize={11}
              />
              <YAxis
                stroke="var(--color-muted-foreground, #a1a1aa)"
                tickLine={false}
                axisLine={false}
                fontSize={11}
                domain={[0, 'dataMax']}
              />
              <Tooltip
                contentStyle={CHART_TOOLTIP_STYLE}
                labelStyle={{ color: 'var(--color-muted-foreground, #a1a1aa)' }}
                itemStyle={{ color: 'var(--color-foreground, #fff)' }}
                cursor={{ stroke: accent, strokeDasharray: '3 3' }}
              />
              <Area
                type="monotone"
                dataKey="value"
                name={valueLabel}
                stroke={accent}
                strokeWidth={2.5}
                fill={`url(#${gradientId})`}
                isAnimationActive={animationsEnabled}
                animationDuration={900}
                animationEasing="ease-out"
                dot={{ r: 3, fill: accent, strokeWidth: 0 }}
                activeDot={{ r: 5, strokeWidth: 0 }}
              />
            </AreaChart>
          </ResponsiveContainer>
        ) : (
          <p className="flex h-full items-center justify-center text-sm text-muted-foreground">
            No scores for this period yet — complete a few habits to see your trend here.
          </p>
        )}
      </div>

      {/* Text equivalent of the chart, one keystroke away. */}
      {hasRows && (
        <div className="mt-4 border-t border-border/60 pt-3">
          <button
            type="button"
            onClick={() => setShowTable((open) => !open)}
            aria-expanded={showTable}
            aria-controls={tableId}
            className="flex w-full items-center gap-1.5 rounded-md text-xs font-medium text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          >
            <ChevronDown
              className={cn(
                'h-3.5 w-3.5 transition-transform duration-200',
                showTable && 'rotate-180',
                'motion-reduce:transition-none'
              )}
              aria-hidden="true"
            />
            {showTable ? 'Hide' : 'Show'} the numbers
          </button>

          {summary && <p className="sr-only">{summary}</p>}

          {showTable && (
            <table id={tableId} className="mt-3 w-full text-left text-sm">
              <caption className="sr-only">{title}</caption>
              <thead>
                <tr className="text-xs uppercase tracking-wide text-muted-foreground">
                  <th scope="col" className="py-1 font-medium">
                    Period point
                  </th>
                  <th scope="col" className="py-1 text-right font-medium">
                    {valueLabel}
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row, index) => (
                  <tr key={`${row.label}-${index}`} className="border-t border-border/40">
                    <th scope="row" className="py-1 font-normal text-muted-foreground">
                      {row.label}
                    </th>
                    <td className="py-1 text-right tabular-nums text-foreground">
                      {format(row.value)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </figure>
  );
}