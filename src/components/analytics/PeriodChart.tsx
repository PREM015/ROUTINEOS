'use client';

import { useId, useState } from 'react';
import { Table2, BarChart3 } from 'lucide-react';
import { BarChart } from '@/components/charts/BarChart';
import type { AnalyticsChartData } from '@/types/analytics';

/**
 * A chart that can say "no data here", and that a screen reader can read.
 *
 * ## Why not just a `BarChart`
 *
 * Two problems with handing these series straight to `BarChart`:
 *
 * 1. **A gap became a zero.** `AnalyticsChartData.value` is `number | null`, and
 *    `null` means "we have no measurement" — a habit that was never due, a month
 *    the user has not reached. Coercing that to `0` draws a bar at the floor,
 *    which reads as "you scored zero". It drew a full year of zeroes for anyone
 *    whose year had barely started.
 * 2. **The SVG had no text equivalent.** `ariaLabel` gave a chart a name, not its
 *    contents, so the trend was unreachable without sight. A real data table is
 *    not a fallback — for anyone using a screen reader it *is* the chart.
 *
 * The table is a disclosure rather than a permanent second panel: visually the
 * page should read as a chart-first surface, and the exact figures stay one click
 * (or one screen-reader gesture) away rather than duplicated as visual noise.
 */

interface PeriodChartProps {
  title: string;
  /** What the series measures, for the table caption and the summary sentence. */
  description: string;
  data: AnalyticsChartData[];
  /** Rendered on the y-axis and in the table; appends `%` when the unit is percent. */
  unit?: 'percent' | 'score';
  gradient?: { id: string; from: string; to: string };
  /** Shown instead of the chart when there is nothing to plot. */
  emptyMessage: string;
  className?: string;
}

function format(value: number, unit: 'percent' | 'score'): string {
  return unit === 'percent' ? `${Math.round(value)}%` : String(Math.round(value));
}

/**
 * A sentence a screen reader can read instead of the picture.
 *
 * Built from the data rather than hand-written per period, so it cannot fall out
 * of step with what is plotted — a stale "habits are improving" caption under a
 * falling chart is worse than no caption at all.
 */
function summarise(data: AnalyticsChartData[], unit: 'percent' | 'score'): string {
  const measured = data.filter((point): point is AnalyticsChartData & { value: number } =>
    point.value !== null
  );
  const gaps = data.length - measured.length;

  if (measured.length === 0) return 'No data in this period.';

  const best = measured.reduce((a, b) => (b.value > a.value ? b : a));
  const worst = measured.reduce((a, b) => (b.value < a.value ? b : a));

  const parts = [
    `${measured.length} of ${data.length} entries have data.`,
    `Highest: ${best.name} at ${format(best.value, unit)}.`,
    `Lowest: ${worst.name} at ${format(worst.value, unit)}.`,
  ];
  if (gaps > 0) parts.push(`${gaps} ${gaps === 1 ? 'entry has' : 'entries have'} no data.`);
  return parts.join(' ');
}

export function PeriodChart({
  title,
  description,
  data,
  unit = 'percent',
  gradient,
  emptyMessage,
  className,
}: PeriodChartProps) {
  const [showTable, setShowTable] = useState(false);
  const tableId = useId();

  const measured = data.filter((point) => point.value !== null);

  if (data.length === 0 || measured.length === 0) {
    return (
      <section
        className={`glass-panel spotlight-hover rounded-2xl p-6 shadow-soft ${className ?? ''}`}
      >
        <h2 className="text-lg font-semibold text-foreground">{title}</h2>
        <p className="mt-1 text-sm text-muted-foreground">{description}</p>
        <p className="py-10 text-center text-sm text-muted-foreground">{emptyMessage}</p>
      </section>
    );
  }

  return (
    <section className={`glass-panel spotlight-hover rounded-2xl p-6 shadow-soft ${className ?? ''}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-foreground">{title}</h2>
          <p className="mt-1 text-sm text-muted-foreground">{description}</p>
        </div>
        <button
          type="button"
          onClick={() => setShowTable((open) => !open)}
          aria-expanded={showTable}
          aria-controls={tableId}
          className="inline-flex items-center gap-1.5 rounded-lg border border-border/60 px-2.5 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          {showTable ? (
            <BarChart3 className="h-3.5 w-3.5" aria-hidden="true" />
          ) : (
            <Table2 className="h-3.5 w-3.5" aria-hidden="true" />
          )}
          {showTable ? 'Hide figures' : 'Show figures'}
        </button>
      </div>

      {/*
        The summary is the chart's text alternative, and it is always present in the
        accessibility tree rather than revealed on focus — a screen-reader user
        should not have to guess that a figure exists.
      */}
      <p className="sr-only">{summarise(data, unit)}</p>

      <div className="mt-4 h-72">
        <BarChart
          data={data.map((point) => ({ ...point, value: point.value ?? 0 }))}
          xKey="name"
          dataKey="value"
          height={288}
          ariaLabel={title}
          ariaDescribedBy={tableId}
          gradient={gradient}
        />
      </div>

      {/*
        Entries with no measurement are listed as "no data" rather than 0%, so the
        table cannot quietly reintroduce the confusion the chart avoids.
      */}
      {showTable && (
        <div id={tableId} className="mt-4 max-h-64 overflow-auto rounded-xl border border-border/60">
          <table className="w-full text-sm">
            <caption className="sr-only">{title}: {description}</caption>
            <thead className="bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th scope="col" className="px-3 py-2 font-medium">
                  Entry
                </th>
                <th scope="col" className="px-3 py-2 text-right font-medium">
                  Value
                </th>
              </tr>
            </thead>
            <tbody>
              {data.map((point) => (
                <tr key={point.name} className="border-t border-border/40">
                  <th scope="row" className="px-3 py-2 text-left font-normal text-foreground">
                    {point.name}
                  </th>
                  <td
                    className={`px-3 py-2 text-right tabular-nums ${
                      point.value === null ? 'text-muted-foreground' : 'text-foreground'
                    }`}
                  >
                    {point.value === null ? 'No data' : format(point.value, unit)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

export default PeriodChart;