'use client';

import { useId, useState } from 'react';
import Link from 'next/link';
import { Table2, BarChart3, ArrowUpRight } from 'lucide-react';
import { BarChart } from '@/components/charts/BarChart';
import type { AnalyticsChartData } from '@/types/analytics';

/**
 * A chart that can say "no data here", that a screen reader can read, and whose bars can
 * be followed.
 *
 * ## Why not just a `BarChart`
 *
 * Three problems with handing these series straight to `BarChart`:
 *
 * 1. **A gap became a zero.** `AnalyticsChartData.value` is `number | null`, and `null`
 *    means "we have no measurement". Recharts already draws `null` as a gap, and passing
 *    the value through untouched is what lets it.
 * 2. **The SVG had no text equivalent.** `ariaLabel` gave a chart a name, not its
 *    contents, so the trend was unreachable without sight. A real data table is not a
 *    fallback — for anyone using a screen reader it *is* the chart.
 * 3. **Bars were not reachable.** A `<rect>` emitted by a charting library cannot be a
 *    link, cannot take focus, and is invisible to a screen-reader user. There is no
 *    honest way to bolt `href` onto it, so the drill-down is a **parallel list of real
 *    links** rendered next to the picture.
 *
 * ## The accessibility structure
 *
 * Three layers, each doing one job:
 *
 * - The SVG is `aria-hidden`. It is decoration; the two layers below carry the meaning.
 * - `ChartPointLinks` is the **primary** interface: one focusable `<a>` per point, always
 *   present, never behind a disclosure. This is what makes every bar keyboard-reachable
 *   — a chart whose links only exist after clicking "Show figures" has none.
 * - The figure table is the full-figures view, still a disclosure, now with its entry
 *   names linked when a destination exists.
 *
 * ## Destinations are the server's decision
 *
 * `AnalyticsChartData.href` arrives already resolved. A bar's meaning differs per chart —
 * one series point is a habit, another is a month, a third is a tier with nowhere to go —
 * and the client cannot tell which without re-deriving all five chart configurations.
 * Re-deriving them is exactly how two surfaces end up linking to different things, so
 * this component follows `href` and invents nothing. A point without one renders as
 * inert text, which is honest: not every bar leads anywhere.
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
 * Built from the data rather than hand-written per period, so it cannot fall out of
 * step with what is plotted — a stale "habits are improving" caption under a falling
 * chart is worse than no caption at all. It also names how many points can be followed,
 * so the link layer is announced rather than discovered by accident.
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
  parts.push(
    `${data.filter((point) => point.href).length} ${data.filter((point) => point.href).length === 1 ? 'entry can' : 'entries can'} be opened directly.`
  );
  return parts.join(' ');
}

/**
 * The drill-down layer.
 *
 * One link per point that has a destination. Rendered visibly rather than hidden,
 * because a link a keyboard user cannot find is not a keyboard path — and because a
 * "Show figures" disclosure that is the only route to a link means the links do not
 * exist for anyone who never presses it.
 *
 * Points with no `href` are rendered as inert text. Omitting them would leave gaps in the
 * row with no explanation; showing them as non-links says "this one does not lead
 * anywhere", which is true and is what a tier bar is.
 */
function ChartPointLinks({
  data,
  unit,
  labelId,
}: {
  data: AnalyticsChartData[];
  unit: 'percent' | 'score';
  labelId: string;
}) {
  if (data.every((point) => !point.href)) return null;

  return (
    <nav aria-labelledby={labelId} className="mt-4">
      <p id={labelId} className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        Open a point
      </p>
      <ul className="mt-2 flex flex-wrap gap-1.5">
        {data.map((point, index) => {
          const value =
            point.value === null ? 'No data' : format(point.value, unit);
          const key = `${point.name}-${index}`;

          if (!point.href) {
            return (
              <li key={key}>
                <span className="inline-flex items-center gap-1 rounded-lg border border-border/50 px-2 py-1 text-[11px] text-muted-foreground">
                  {point.name}
                  <span className="tabular-nums">{value}</span>
                </span>
              </li>
            );
          }

          return (
            <li key={key}>
              {/*
                The accessible name carries the label, the value and the destination
                context. The visible text is shortened for space, so the screen-reader
                text is added separately rather than relying on the truncated label being
                enough — "Read" tells the user nothing about what they would be opening.
              */}
              <Link
                href={point.href}
                className="inline-flex items-center gap-1 rounded-lg border border-border/60 px-2 py-1 text-[11px] text-foreground transition-colors hover:border-primary/50 hover:bg-primary/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background"
              >
                <span className="max-w-[10rem] truncate">{point.name}</span>
                <span className="tabular-nums text-muted-foreground">{value}</span>
                <ArrowUpRight className="h-3 w-3 text-muted-foreground" aria-hidden="true" />
                <span className="sr-only">
                  , {point.value === null ? 'no data' : format(point.value, unit)}
                  {point.date ? `, covering ${point.date}` : ''}
                  , link
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
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
  const linksId = useId();

  const measured = data.filter((point) => point.value !== null);

  if (data.length === 0 || measured.length === 0) {
    return (
      <section
        className={`glass-panel spotlight-hover rounded-2xl p-6 shadow-soft ${className ?? ''}`}
      >
        <h2 className="text-lg font-semibold text-foreground">{title}</h2>
        <p className="mt-1 text-sm text-muted-foreground">{description}</p>
        <p className="py-10 text-center text-sm text-muted-foreground">{emptyMessage}</p>
        {/*
          Links survive the empty state. Every point being unmeasured does not make the
          entities behind them unreachable — a year with no scores still has twelve months
          a user can open, and hiding them would make an empty chart a dead end.
        */}
        <ChartPointLinks data={data} unit={unit} labelId={linksId} />
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
          className="inline-flex items-center gap-1.5 rounded-lg border border-border/60 px-2.5 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background"
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
        Always in the accessibility tree rather than revealed on focus: a screen-reader
        user should not have to guess that a summary exists.
      */}
      <p className="sr-only">{summarise(data, unit)}</p>

      {/*
        `aria-hidden` on a wrapper rather than on `BarChart` itself.

        `BarChart` is shared with `/recap`, which has its own accessibility structure and
        its own `ariaLabel` handling. Editing it to suit this page is exactly the failure
        `AGENTS.md` warns about, so the decision to treat the SVG as decoration is made
        here, locally, and leaves the shared component's behaviour untouched for everyone
        else. The meaning is carried by the summary above and the two layers below.
      */}
      <div aria-hidden="true" className="mt-4 h-72">
        <BarChart
          data={data.map((point) => ({ ...point }))}
          xKey="name"
          dataKey="value"
          height={288}
          gradient={gradient}
        />
      </div>

      <ChartPointLinks data={data} unit={unit} labelId={linksId} />

      {/*
        Entries with no measurement are listed as "no data" rather than 0%, so the
        table cannot quietly reintroduce the confusion the chart avoids. Where a
        destination exists the entry name is the link, so the table is a second route to
        the same place rather than a dead summary of it.
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
              {data.map((point, index) => (
                <tr key={`${point.name}-${index}`} className="border-t border-border/40">
                  <th scope="row" className="px-3 py-2 text-left font-normal text-foreground">
                    {point.href ? (
                      <Link
                        href={point.href}
                        className="underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                      >
                        {point.name}
                        <span className="sr-only">
                          {point.date ? `, covering ${point.date}` : ''}, link
                        </span>
                      </Link>
                    ) : (
                      point.name
                    )}
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
