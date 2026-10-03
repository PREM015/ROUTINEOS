'use client';

/**
 * What the year is actually saying.
 *
 * Every figure here is derived from the same `ContributionCell[]` the grid
 * paints, so nothing here can contradict the grid above it. Where a number
 * cannot be calculated from real data it is **omitted** rather than shown as a
 * zero - the distinction is enforced in `contributions.ts`, which returns `null`
 * for "no data" and never `0` for "nothing happened".
 */

import { useMemo, useState } from 'react';
import {
  BarChart3,
  CalendarDays,
  Flame,
  Minus,
  TrendingDown,
  TrendingUp,
  Trophy,
} from 'lucide-react';
import { HABIT_RAMP, monthCaption } from '@/lib/habits/contribution-visual';
import {
  WEEKDAY_SHORT,
  type ContributionYear,
  type MonthSummary,
} from '@/lib/habits/contributions';
import { Panel } from '@/components/dashboard-ui';
import { cn } from '@/lib/utils';

function Stat({
  label,
  value,
  hint,
  accent,
  icon,
}: {
  label: string;
  value: string;
  /** A string or a node, so a tile can carry a year-over-year delta. */
  hint?: React.ReactNode;
  accent?: string;
  icon?: React.ReactNode;
}) {
  return (
      <div className="flex h-full min-w-0 flex-col rounded-[14px] border border-border/60 bg-background/40 px-3 py-2.5">
        <p className="flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
          {icon}
          {label}
        </p>
        <p
          className="mt-1 font-display text-lg font-bold leading-none tabular-nums"
          style={accent ? { color: accent } : undefined}
        >
          {value}
        </p>
        {/*
          `mt-auto` pushes the hint to the bottom, so with `items-stretch` on the
          grid every tile's hint sits on the same baseline even when one hint
          wraps to two lines and another does not.
        */}
        {hint && (
          <div className="mt-auto pt-1 text-[10px] leading-tight text-muted-foreground">
            {hint}
          </div>
        )}
      </div>
  );
}

/** `+6%` / `-4%` / nothing. Never red: a bad year is amber, a good one is green. */
function Delta({ delta }: { delta: number | null }) {
  if (delta === null) {
    return <span className="text-muted-foreground">no prior year</span>;
  }
  if (delta === 0) {
    return (
      <span className="inline-flex items-center gap-0.5 text-muted-foreground">
        <Minus className="h-3 w-3" aria-hidden="true" />
        level with {new Date().getFullYear() - 1}
      </span>
    );
  }
  const up = delta > 0;
  const Icon = up ? TrendingUp : TrendingDown;
  return (
    <span
      className={cn(
        'inline-flex items-center gap-0.5 font-semibold tabular-nums',
        up ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-600 dark:text-amber-400'
      )}
    >
      <Icon className="h-3 w-3" aria-hidden="true" />
      {up ? '+' : ''}
      {delta}% vs last year
    </span>
  );
}

export function ContributionInsights({ year }: { year: ContributionYear }) {
  const { stats, months, weekdays, habits, previousYear } = year;
  const [expanded, setExpanded] = useState(false);

  const delta = useMemo(() => {
    if (previousYear?.rate == null || stats.rate == null) return null;
    return stats.rate - previousYear.rate;
  }, [previousYear, stats.rate]);

  const bestMonth = useMemo(
    () =>
      months.reduce<MonthSummary | null>((best, m) => {
        if (m.rate === null) return best;
        return best === null || best.rate === null || m.rate > best.rate ? m : best;
      }, null),
    [months]
  );

  const topHabits = habits.filter((h) => h.completed > 0).slice(0, 6);

  return (
    <div className="space-y-4">
      {/* ── the numbers ────────────────────────────────────────────────── */}
      {/*
        `md:` at the middle breakpoint, not `sm:` - between 640px and 768px three
        cards of ~200px each fit fine, so jumping 3 -> 2 there was a reflow with
        no reason. `items-stretch` plus `h-full` on `Stat` is what actually makes
        the cards the same height; grid stretch alone leaves a card that renders
        a two-line hint taller than its neighbours and exposes the gap.
      */}
      <div className="grid grid-cols-2 items-stretch gap-2.5 md:grid-cols-3 lg:grid-cols-6">
        <Stat
          label="Active days"
          value={String(stats.activeDays)}
          hint={`of ${stats.scheduledDays} scheduled`}
          accent="var(--accent-habits)"
          icon={<CalendarDays className="h-3 w-3" aria-hidden="true" />}
        />
        <Stat
          label="Completion"
          value={stats.rate === null ? '—' : `${stats.rate}%`}
          hint={<Delta delta={delta} />}
        />
        <Stat
          label="Perfect days"
          value={String(stats.perfectDays)}
          hint="everything due, done"
          accent="var(--accent-habits)"
          icon={<Trophy className="h-3 w-3" aria-hidden="true" />}
        />
        <Stat
          label="Current streak"
          value={String(stats.currentStreak)}
          hint={`longest ${stats.longestStreak}d`}
          icon={<Flame className="h-3 w-3" aria-hidden="true" />}
        />
        <Stat
          label="Per due day"
          value={stats.averagePerScheduledDay === null ? '—' : String(stats.averagePerScheduledDay)}
          hint="habits completed"
        />
        <Stat
          label="Not recorded"
          value={String(stats.noRecordDays)}
          hint="due, nothing logged"
        />
      </div>

      {/* ── months ─────────────────────────────────────────────────────── */}
      <Panel
        title="Month by month"
        subtitle="Active days and completion rate"
        domain="habits"
        minHeightClass="min-h-[11rem]"
      >
        <div className="px-5 pb-5">
          <ul className="space-y-2">
            {months.map((month) => {
              const isFuture = month.futureDays > 0 && month.days === 0;
              return (
                <li key={month.month} className="flex items-center gap-3">
                  <span className="w-16 shrink-0 text-xs font-medium text-foreground">
                    {month.label.slice(0, 3)}
                  </span>
                  <div className="h-2 min-w-0 flex-1 overflow-hidden rounded-full bg-muted">
                    {!isFuture && month.rate !== null && (
                      <div
                        className="h-full rounded-full transition-[width] duration-700 ease-out-expo motion-reduce:transition-none"
                        style={{
                          width: `${Math.max(2, month.rate)}%`,
                          background: HABIT_RAMP[month.rate >= 100 ? 4 : month.rate >= 70 ? 3 : 2],
                        }}
                      />
                    )}
                  </div>
                  <span className="w-12 shrink-0 text-right text-[11px] font-medium tabular-nums text-foreground">
                    {isFuture ? '—' : `${month.rate ?? 0}%`}
                  </span>
                  <span className="w-[104px] shrink-0 text-right text-[11px] text-muted-foreground">
                    {monthCaption(month)}
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      </Panel>

      {/* ── weekdays + habits ──────────────────────────────────────────── */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Panel
          title="By day of week"
          subtitle="Completion rate on days anything was due"
          domain="habits"
          minHeightClass="min-h-[12rem]"
        >
          <div className="px-5 pb-5">
            <ul className="space-y-2">
              {weekdays.map((day) => (
                <li key={day.weekday} className="flex items-center gap-3">
                  <span className="w-10 shrink-0 text-xs font-medium text-foreground">
                    {WEEKDAY_SHORT[day.weekday]}
                  </span>
                  <div className="h-2 min-w-0 flex-1 overflow-hidden rounded-full bg-muted">
                    {day.rate !== null && (
                      <div
                        className="h-full rounded-full transition-[width] duration-700 ease-out-expo motion-reduce:transition-none"
                        style={{
                          width: `${Math.max(2, day.rate)}%`,
                          background: HABIT_RAMP[day.rate >= 100 ? 4 : day.rate >= 70 ? 3 : 2],
                        }}
                      />
                    )}
                  </div>
                  <span className="w-12 shrink-0 text-right text-[11px] font-medium tabular-nums text-foreground">
                    {day.rate === null ? '—' : `${day.rate}%`}
                  </span>
                  <span className="w-16 shrink-0 text-right text-[11px] text-muted-foreground">
                    {day.scheduledDays}d
                  </span>
                </li>
              ))}
            </ul>
            {stats.bestWeekday && (
              <p className="mt-3 border-t border-border/60 pt-2.5 text-xs text-muted-foreground">
                Strongest day:{' '}
                <span className="font-semibold text-foreground">{stats.bestWeekday}</span>
                {bestMonth && (
                  <>
                    {' '}
                    · strongest month:{' '}
                    <span className="font-semibold text-foreground">{bestMonth.label}</span>
                  </>
                )}
              </p>
            )}
          </div>
        </Panel>

        <Panel
          title="Habit breakdown"
          subtitle={
            expanded ? 'Every habit with history this year' : 'Top habits by completion'
          }
          domain="habits"
          minHeightClass="min-h-[12rem]"
          action={
            habits.length > 6 ? (
              <button
                type="button"
                onClick={() => setExpanded((v) => !v)}
                className="inline-flex items-center gap-1 text-[11px] font-medium text-primary hover:underline"
              >
                {expanded ? 'Show top' : 'Show all'}
              </button>
            ) : undefined
          }
        >
          <div className="px-5 pb-5">
            {topHabits.length === 0 ? (
              <p className="py-4 text-center text-xs text-muted-foreground">
                No habit has been completed in this window yet.
              </p>
            ) : (
              <ul className="space-y-2">
                {(expanded ? habits : topHabits).map((habit) => (
                  <li key={habit.habitId} className="flex items-center gap-2.5">
                    <span
                      className="h-2 w-2 shrink-0 rounded-full"
                      style={{
                        background: habit.color ?? 'var(--accent-habits)',
                      }}
                      aria-hidden="true"
                    />
                    <span className="min-w-0 flex-1 truncate text-xs text-foreground">
                      {habit.icon && <span className="mr-1">{habit.icon}</span>}
                      {habit.name}
                    </span>
                    <span className="shrink-0 text-[11px] tabular-nums text-muted-foreground">
                      {habit.completed}/{habit.scheduled}
                    </span>
                    <span className="w-10 shrink-0 text-right text-[11px] font-semibold tabular-nums text-foreground">
                      {habit.rate === null ? '—' : `${habit.rate}%`}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </Panel>
      </div>

      {/* Only rendered when there is genuinely something to say. */}
      {stats.noRecordDays > 0 && (
        <p className="flex items-start gap-2 text-[11px] leading-relaxed text-muted-foreground">
          <BarChart3 className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          <span>
            {stats.noRecordDays} {stats.noRecordDays === 1 ? 'day was' : 'days were'} due but
            never logged. A habit log only exists once you open the app, so these days are
            shown as unknown rather than as failures — the grid cannot tell &ldquo;did not do
            it&rdquo; from &ldquo;never opened the app&rdquo;.
          </span>
        </p>
      )}
    </div>
  );
}
