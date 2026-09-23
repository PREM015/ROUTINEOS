'use client';

import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { TrendingDown, TrendingUp, Minus } from 'lucide-react';
import { cn } from '@/lib/utils';

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
  className?: string;
}

const CHART_TOOLTIP_STYLE = {
  backgroundColor: 'var(--color-card, #18181b)',
  border: '1px solid var(--color-border, #27272a)',
  borderRadius: '10px',
  color: 'var(--color-foreground, #fff)',
} as const;

export default function TrendCard({
  title,
  rows,
  delta = 0,
  accent = '#10b981',
  unit = '',
  valueFormatter,
  headline,
  className,
}: TrendCardProps) {
  const gradientId = `trendFill-${accent.replace('#', '')}`;
  const lastValue = rows.at(-1)?.value ?? 0;
  const displayValue = headline ?? (valueFormatter ? valueFormatter(lastValue) : `${lastValue}${unit}`);
  const showDelta = delta !== 0;
  const up = delta > 0;

  return (
    <section
      className={cn(
        'glass-panel spotlight-hover rounded-2xl p-6 shadow-soft transition-transform duration-300 ease-out-expo hover:-translate-y-0.5 hover:shadow-long',
        className,
      )}
    >
      <header className="mb-2 flex items-center justify-between gap-3">
        <h2 className="text-sm font-semibold text-foreground">{title}</h2>
        {showDelta && (
          <span
            className={cn(
              'inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold tabular-nums',
              up
                ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                : 'bg-rose-500/10 text-rose-600 dark:text-rose-400',
            )}
          >
            {up ? <TrendingUp className="h-3.5 w-3.5" /> : <TrendingDown className="h-3.5 w-3.5" />}
            {up ? '+' : ''}
            {delta.toFixed(1)} pts
          </span>
        )}
      </header>

      <p className="mb-4 text-3xl font-bold tabular-nums text-foreground">
        {displayValue}
        {!showDelta && (
          <Minus className="ml-2 inline h-4 w-4 text-muted-foreground" aria-hidden="true" />
        )}
      </p>

      <div className="h-44 w-full">
        {rows.length > 0 ? (
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
                name="Score"
                stroke={accent}
                strokeWidth={2.5}
                fill={`url(#${gradientId})`}
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
    </section>
  );
}