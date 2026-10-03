'use client';

/**
 * Weekly routine adherence - seven bars, one per day, height = that day's
 * routine completion.
 *
 * ## What it replaces
 *
 * `Timeline`, a 24-hour bar with tap-to-edit. That was a schedule, and a schedule
 * is a `/routine` or `/today` concept: it answers "what does my day look like",
 * which is a single-day question. This answers "how consistently did I keep to my
 * routine across the week", which is the only question a page aggregating
 * everything should be asking.
 *
 * ## Reading a zero here
 *
 * A day with no stored score is drawn as a dashed stub at the baseline, never as a
 * zero-height bar. The distinction matters: "I kept to 0% of my routine on
 * Tuesday" and "Tuesday was never scored" are completely different facts, and
 * averaging them together is what makes a weekly adherence figure lie.
 *
 * B4: no tilt, no glow. Entrance stagger and the standard hover lift only.
 */

import { Panel, PanelEmpty } from '@/components/dashboard-ui';
import { DOMAIN_ACCENT, accentRing } from '@/components/dashboard-ui/accent';
import { useDashboardOverview } from '@/components/dashboard/useDashboardOverview';
import { WEEKDAY_LABELS } from '@/constants/dashboard';

/**
 * Monday-first ordering, matching how the app and the user's week read.
 *
 * Derived from the date string rather than from `new Date()`: the date is a
 * calendar date with an intrinsic weekday, and formatting an instant in some
 * zone to recover its weekday is the bug class documented in
 * `resolveNaturalDayType`.
 */
function weekdayIndex(date: string): number {
  const day = new Date(`${date}T00:00:00.000Z`).getUTCDay();
  return (day + 6) % 7;
}

/** Trailing 7 days, oldest first, so the bars read left-to-right like a week. */
function currentWeek(days: { date: string; routineCompletionRate: number | null }[]) {
  return days.slice(-7);
}

export function RoutineAdherence() {
  const { data, loading, error, reload } = useDashboardOverview();
  const week = data ? currentWeek(data.days) : [];
  const today = data?.today ?? null;

  const scored = week.filter((d) => d.routineCompletionRate !== null);
  const average =
    scored.length === 0
      ? null
      : scored.reduce((sum, d) => sum + (d.routineCompletionRate ?? 0), 0) / scored.length;

  return (
    <Panel
      title="Routine adherence"
      subtitle="This week"
      domain="routine"
      loading={loading}
      loadingRows={2}
      minHeightClass="min-h-[11rem]"
      error={error}
      onRetry={() => void reload()}
      isEmpty={!loading && week.length > 0 && scored.length === 0}
      empty={
        <PanelEmpty
          title="No routine data this week"
          description="Complete a routine block and this fills in from the first day you do."
        />
      }
    >
      <div className="flex flex-1 flex-col justify-end gap-3 px-5 pb-5">
        {average !== null && (
          <p className="text-xs text-muted-foreground">
            <span className="font-display text-lg font-bold tabular-nums text-foreground">
              {Math.round(average)}%
            </span>{' '}
            average across {scored.length} scored {scored.length === 1 ? 'day' : 'days'}
          </p>
        )}

        <div className="flex h-24 items-end gap-2">
          {week.map((day) => {
            const rate = day.routineCompletionRate;
            const isToday = day.date === today;
            return (
              <div key={day.date} className="group flex flex-1 flex-col items-center gap-1.5">
                <div className="flex h-20 w-full items-end justify-center">
                  {rate === null ? (
                    // Not a zero-height bar: a visible dashed stub meaning "no
                    // data here", which is honest in a way an empty column is not.
                    <span
                      className="h-1 w-full rounded-sm border-t border-dashed border-border"
                      aria-hidden="true"
                    />
                  ) : (
                    <span
                      className="w-full rounded-t-[4px] transition-[height,filter] duration-700 ease-out-expo group-hover:brightness-125 motion-reduce:transition-none"
                      style={{
                        height: `${Math.max(3, rate)}%`,
                        background: accentRing(
                          DOMAIN_ACCENT.routine.hue,
                          isToday ? 90 : 55
                        ),
                      }}
                    />
                  )}
                </div>
                <span
                  className={
                    isToday
                      ? 'text-[10px] font-semibold text-foreground'
                      : 'text-[10px] text-muted-foreground/80'
                  }
                >
                  {WEEKDAY_LABELS[weekdayIndex(day.date)]?.slice(0, 3)}
                </span>
                <span className="sr-only">
                  {day.date}:{' '}
                  {rate === null
                    ? 'no routine data'
                    : `${Math.round(rate)} percent of the routine completed`}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </Panel>
  );
}
