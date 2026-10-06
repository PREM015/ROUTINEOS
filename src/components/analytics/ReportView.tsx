'use client';

import { useEffect, type ReactNode } from 'react';
import Link from 'next/link';
import { Minimize2, X } from 'lucide-react';
import styles from './report.module.css';

/**
 * Report view — the printable, shareable arrangement of the standard data.
 *
 * ## What belongs in a report
 *
 * Everything you would want to read in a weekly review with someone else: the period, the
 * headline score and its change, the comparison basis, the habit table, and the findings.
 * Everything you would *do* while reading it is removed — period arrows, load-more, export,
 * review, room toggles — because none of it means anything on paper and an inert button
 * prints as a defect.
 *
 * ## Why this is a real arrangement rather than a print stylesheet alone
 *
 * Hiding chrome at print time leaves the page in *reading* order, which interleaves detail
 * with controls. This composes a document: title block, figures, then the table, then the
 * findings. The stylesheet then only has to remove what is genuinely unprintable.
 */

export interface ReportModel {
  rangeLabel: string;
  rangeStart: string;
  rangeEnd: string;
  isCurrent: boolean;
  heroTotal: number | null;
  heroGrade: string | null;
  heroDaysScored: number;
  habitRate: number | null;
  habitCompleted: number;
  habitScheduled: number;
  comparisonBasis: string;
  comparisonDelta: number | null;
  sleepAverageMinutes: number | null;
  moodAverage: number | null;
  routineCompletion: number | null;
  rows: Array<{ name: string; tier: string; completed: number; scheduled: number; rate: number | null }>;
  /**
   * The chart, as print-ready bars.
   *
   * `value: null` is preserved all the way to the markup: a bar that was never measured has
   * to render differently from a bar that measured zero, and collapsing the two here would
   * destroy the only evidence that the difference existed.
   */
  bars: Array<{ label: string; value: number | null; percent: number; text: string }>;
  barTitle: string;
  barCaption: string;
  findings: Array<{ headline: string; evidence: string }>;
}

/**
 * Pick the chart the report should carry, and name it honestly.
 *
 * On the year tab `chart1` is a tier mix rather than a time series, so the report uses the
 * monthly trend from `chart2` instead. A report that labelled the tier mix as a daily score
 * chart would be describing a different thing from the one the dashboard shows.
 */
function buildBars(payload: import('@/types/analytics').AnalyticsDashboard): {
  bars: ReportModel['bars'];
  barTitle: string;
  barCaption: string;
} {
  const isYear = payload.period === 'year';
  const source = isYear ? payload.chart2 : payload.chart1;
  const unit = isYear ? '' : '%';

  const measured = source
    .map((point) => point.value)
    .filter((value): value is number => value != null && Number.isFinite(value));

  /*
    Scaled to the largest measured value, not to 100. A habit rate peaking at 62% would draw
    a chart whose bars all stop two-thirds along the track, which reads as "everything is
    about to fail" for a period that was actually steady. The value is printed beside every
    bar, so relative scale costs no precision.
  */
  const scale = Math.max(...measured, 1);

  const bars = source.map((point) => ({
    label: point.name,
    value: point.value,
    percent: point.value == null ? 0 : Math.max(1, Math.round((point.value / scale) * 100)),
    text: point.value == null ? 'No data' : `${Math.round(point.value)}${unit}`,
  }));

  return {
    bars,
    barTitle: isYear ? 'Monthly average score' : 'Daily score',
    barCaption: isYear
      ? 'One average per month across the selected year.'
      : 'One average per day across the selected period.',
  };
}

export function buildReportModel(payload: import('@/types/analytics').AnalyticsDashboard): ReportModel {
  const { bars, barTitle, barCaption } = buildBars(payload);

  return {
    rangeLabel: payload.range.label,
    rangeStart: payload.range.start,
    rangeEnd: payload.range.end,
    isCurrent: payload.range.isCurrent,
    heroTotal: payload.hero.total,
    heroGrade: payload.hero.grade,
    heroDaysScored: payload.hero.daysScored,
    habitRate: payload.hero.habitReliability,
    habitCompleted: payload.habits.completed,
    habitScheduled: payload.habits.scheduled,
    comparisonBasis: payload.comparison.basis,
    comparisonDelta: payload.comparison.delta,
    sleepAverageMinutes: payload.tiles.sleepMinutes,
    moodAverage: payload.tiles.mood,
    routineCompletion: payload.tiles.routine?.completionRate ?? null,
    rows: payload.habits.perHabit.map((habit) => ({
      name: habit.name,
      tier: habit.tier,
      completed: habit.completed,
      scheduled: habit.scheduled,
      rate: habit.rate,
    })),
    bars,
    barTitle,
    barCaption,
    findings: payload.insights.map((insight) => ({
      headline: insight.headline,
      evidence: insight.evidence,
    })),
  };
}

/**
 * The report.
 *
 * Takes the derived model rather than the raw payload, and renders **no** copy of the
 * standard dashboard. An earlier version kept the standard page mounted behind the report to
 * "keep the data", which was a mistake on two counts: the data lives in the page component,
 * so the report and the dashboard were never at risk of disagreeing in the first place, and
 * the hidden duplicate meant a screen reader announced the entire dashboard a second time
 * after the report it had just finished reading.
 *
 * Both views are entered from a URL parameter, so each needs a real keyboard exit as well as
 * a visible one.
 */
export function ReportView({ model, onExit }: { model: ReportModel; onExit: () => void }) {
  // Escape exits. A mode with no keyboard exit is a trap for anyone who cannot find the
  // button, and this one can be entered by a URL parameter.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onExit();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [onExit]);

  return (
    <div data-print-root className={`${styles.printRoot} mx-auto max-w-4xl px-6 py-10`}>
      <div data-print-hide className="mb-6 flex items-center justify-between gap-3">
        <p className="text-xs text-muted-foreground">
          Report view. Interactive controls are hidden; press Escape to return.
        </p>
        <button
          type="button"
          onClick={onExit}
          className="inline-flex items-center gap-1.5 rounded-lg border border-border/60 px-3 py-1.5 text-sm font-medium text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        >
          <X className="h-4 w-4" aria-hidden="true" />
          Back to Analytics
        </button>
      </div>

      <header data-print-block className="border-b border-border/60 pb-6">
        <h1 className="text-3xl font-bold tracking-tight text-foreground">
          Analytics report
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {model.rangeLabel}
          {model.isCurrent ? ' (so far)' : ''} · {model.rangeStart} to {model.rangeEnd}
        </p>
      </header>

      <section data-print-block className="mt-6">
        <h2 className="text-lg font-semibold text-foreground">Summary</h2>
        <dl className="mt-3 grid grid-cols-2 gap-4 sm:grid-cols-4">
          <Figure
            label="Average score"
            value={model.heroTotal != null ? `${Math.round(model.heroTotal)}/100` : '—'}
            detail={
              model.heroGrade
                ? `Grade ${model.heroGrade}, over ${model.heroDaysScored} scored days`
                : 'No score recorded'
            }
          />
          <Figure
            label="Habit rate"
            value={model.habitRate != null ? `${Math.round(model.habitRate)}%` : '—'}
            detail={`${model.habitCompleted} of ${model.habitScheduled} due`}
          />
          <Figure
            label="Sleep per night"
            value={
              model.sleepAverageMinutes != null
                ? `${Math.round(model.sleepAverageMinutes / 60)}h`
                : '—'
            }
            detail={model.sleepAverageMinutes != null ? 'Average of logged nights' : 'Not logged'}
          />
          <Figure
            label="Mood"
            value={model.moodAverage != null ? `${model.moodAverage}/5` : '—'}
            detail="Average of logged days"
          />
        </dl>

        {model.comparisonDelta != null && (
          <p className="mt-4 text-sm text-muted-foreground">
            {model.comparisonDelta > 0 ? 'Up' : 'Down'} {Math.abs(model.comparisonDelta)} points
            versus the previous period. {model.comparisonBasis}
          </p>
        )}
        {model.routineCompletion != null && (
          <p className="mt-2 text-sm text-muted-foreground">
            Routine completion {model.routineCompletion}%.
          </p>
        )}
      </section>

      <section data-print-block className="mt-8">
        <h2 className="text-lg font-semibold text-foreground">Habits</h2>
        {model.rows.length === 0 ? (
          <p className="mt-2 text-sm text-muted-foreground">No habits in this period.</p>
        ) : (
          <table className="mt-3 w-full text-sm">
            <thead className="border-b border-border/60 text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th scope="col" className="py-2 font-medium">
                  Habit
                </th>
                <th scope="col" className="py-2 font-medium">
                  Tier
                </th>
                <th scope="col" className="py-2 text-right font-medium">
                  Completed
                </th>
                <th scope="col" className="py-2 text-right font-medium">
                  Due
                </th>
                <th scope="col" className="py-2 text-right font-medium">
                  Rate
                </th>
              </tr>
            </thead>
            <tbody>
              {model.rows.map((row) => (
                <tr key={row.name} className="border-b border-border/30">
                  <td className="py-1.5 text-foreground">{row.name}</td>
                  <td className="py-1.5 text-muted-foreground">{row.tier}</td>
                  <td className="py-1.5 text-right tabular-nums text-foreground">
                    {row.completed}
                  </td>
                  <td className="py-1.5 text-right tabular-nums text-foreground">
                    {row.scheduled}
                  </td>
                  <td className="py-1.5 text-right tabular-nums text-foreground">
                    {/* A dash, not 0%: never due is not never completed. */}
                    {row.rate != null ? `${Math.round(row.rate)}%` : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      {/*
        The chart, drawn in the report rather than borrowed from the dashboard.

        `data-print-bar` is what the stylesheet restates as a border on paper: most printers
        drop background graphics by default, so a bar drawn as a filled div prints as an
        empty box. A bar with no value is drawn as a hatched "not measured" cell, never as
        zero — the same distinction the rest of this page insists on, and the one a chart is
        most able to get wrong, because a missing bar and a zero-height bar look identical
        until you know which is which.
      */}
      {model.bars.length > 0 && (
        <section data-print-block className="mt-8">
          <h2 className="text-lg font-semibold text-foreground">{model.barTitle}</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">{model.barCaption}</p>
          <ul className="mt-4 space-y-2">
            {model.bars.map((bar) => (
              <li key={bar.label} className="flex items-center gap-3">
                <span className="w-28 shrink-0 truncate text-xs text-muted-foreground">
                  {bar.label}
                </span>
                <span className="flex h-4 flex-1 items-center">
                  {bar.value == null ? (
                    <span
                      aria-hidden="true"
                      className="h-full w-full rounded-sm border border-dashed border-border bg-[repeating-linear-gradient(45deg,transparent,transparent_3px,currentColor_3px,currentColor_4px)] opacity-20"
                    />
                  ) : (
                    <span
                      data-print-bar
                      className="h-full rounded-sm bg-primary/70"
                      style={{ width: `${bar.percent}%` }}
                    />
                  )}
                </span>
                <span className="w-14 shrink-0 text-right text-xs tabular-nums text-foreground">
                  {bar.text}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {model.findings.length > 0 && (
        <section data-print-block className="mt-8">
          <h2 className="text-lg font-semibold text-foreground">Findings</h2>
          <ul className="mt-3 space-y-2">
            {model.findings.map((finding) => (
              <li key={finding.headline} className="text-sm">
                <span className="font-medium text-foreground">{finding.headline}.</span>{' '}
                <span className="text-muted-foreground">{finding.evidence}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <footer className="mt-10 border-t border-border/60 pt-4 text-[11px] text-muted-foreground">
        Generated from your own records. Habit rates are completed over due days, clipped to
        today. Figures marked &ldquo;No data&rdquo; were never measured, which is not the
        same as zero.
      </footer>
    </div>
  );
}

function Figure({
  label,
  value,
  detail,
}: {
  label: string;
  value: string;
  detail: string;
}) {
  return (
    <div>
      <dt className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</dt>
      <dd className="mt-1 text-2xl font-bold tabular-nums text-foreground">{value}</dd>
      <dd className="mt-0.5 text-[11px] text-muted-foreground">{detail}</dd>
    </div>
  );
}

/**
 * Zen view — the report's figures with nothing else on the page.
 *
 * Defined by what is *removed*, deliberately: the period control, the charts, the rooms,
 * the toolbar, compare, targets, the habit table's controls. What is left is the score,
 * the change, the habit rate, the findings and a way out. A "distraction-free" mode that
 * keeps a filter panel and a sparkline has not removed anything the reader can see.
 *
 * Unlike the report, zen keeps its interactive controls — the period arrows are the one
 * thing worth keeping, because moving through time *is* the activity here.
 */
export function ZenView({
  model,
  periodControl,
  onExit,
}: {
  model: ReportModel;
  periodControl: ReactNode;
  onExit: () => void;
}) {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onExit();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [onExit]);

  return (
    <div className="mx-auto flex min-h-[70vh] max-w-3xl flex-col justify-center px-6 py-16">
      <div className="mb-8 flex items-center justify-between gap-3">
        <p className="text-xs uppercase tracking-widest text-muted-foreground">
          {model.rangeLabel}
          {model.isCurrent ? ' so far' : ''}
        </p>
        <Link
          href="."
          onClick={(event) => {
            event.preventDefault();
            onExit();
          }}
          className="inline-flex items-center gap-1.5 rounded-lg border border-border/60 px-2.5 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        >
          <Minimize2 className="h-3.5 w-3.5" aria-hidden="true" />
          Exit Zen
        </Link>
      </div>

      <div className="text-center">
        <p className="text-7xl font-black tabular-nums tracking-tight text-foreground sm:text-8xl">
          {model.heroTotal != null ? Math.round(model.heroTotal) : '—'}
        </p>
        <p className="mt-2 text-sm text-muted-foreground">
          {model.heroGrade != null
            ? `Grade ${model.heroGrade} · average over ${model.heroDaysScored} scored ${
                model.heroDaysScored === 1 ? 'day' : 'days'
              }`
            : 'No score recorded for this period'}
        </p>
      </div>

      <div className="mt-8 flex flex-wrap items-center justify-center gap-x-8 gap-y-3 text-sm">
        <span className="text-muted-foreground">
          Habits{' '}
          <span className="font-semibold tabular-nums text-foreground">
            {model.habitRate != null ? `${Math.round(model.habitRate)}%` : '—'}
          </span>
        </span>
        {model.comparisonDelta != null && (
          <span className="text-muted-foreground">
            {model.comparisonDelta > 0 ? 'Up' : 'Down'}{' '}
            <span className="font-semibold tabular-nums text-foreground">
              {Math.abs(model.comparisonDelta)}
            </span>{' '}
            points
          </span>
        )}
      </div>

      {model.findings.length > 0 && (
        <ul className="mx-auto mt-10 max-w-xl space-y-3">
          {model.findings.slice(0, 3).map((finding) => (
            <li key={finding.headline} className="text-center">
              <p className="text-sm font-medium text-foreground">{finding.headline}</p>
              <p className="mt-0.5 text-xs text-muted-foreground">{finding.evidence}</p>
            </li>
          ))}
        </ul>
      )}

      <div className="mt-10 flex justify-center">{periodControl}</div>
    </div>
  );
}
