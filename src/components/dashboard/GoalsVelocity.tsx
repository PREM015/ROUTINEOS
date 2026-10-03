'use client';

/**
 * Goals velocity - aggregate goal health, one line, plus the arrow.
 *
 * ## What it replaces
 *
 * `GoalsMetric`, a per-goal card with a done/nothing interaction. Per the split in
 * section 0 of the brief, ticking a goal belongs to `/today` and `/goals`; the
 * dashboard's job is the aggregate. So this shows "4 of 6 on pace" and names the
 * furthest behind, and every route out of it navigates. There is no check-off
 * button here.
 *
 * ## What "on pace" means now
 *
 * The old card compared progress against a flat 40%-or-15% threshold picked from
 * days remaining. That number moved as the deadline approached without any
 * progress being logged, so a goal could flip from "on track" to "not on track"
 * purely because time passed, and two goals with identical progress could land on
 * opposite sides of it purely because their deadlines differed. The service now
 * compares progress against the elapsed fraction of the goal's own period, which
 * is what the label "on pace" actually claims.
 *
 * ## The arrow is a delta, not a badge of celebration
 *
 * It compares this week's on-pace count against the same count computed as if
 * today were 7 days earlier - i.e. did the set get healthier or not. It is
 * suppressed at zero change for the same reason the Momentum delta is: an arrow
 * that fires on noise stops being read.
 */

import Link from 'next/link';
import { useMemo } from 'react';
import { ArrowDownRight, ArrowRight, ArrowUpRight, Minus, Target } from 'lucide-react';
import { Panel, PanelEmpty } from '@/components/dashboard-ui';
import { useDashboardOverview } from '@/components/dashboard/useDashboardOverview';
import { cn } from '@/lib/utils';

export function GoalsVelocity() {
  const { data, loading, error, reload } = useDashboardOverview();
  const goals = data?.goals ?? null;

  const delta = useMemo(() => {
    if (goals === null || goals.active === 0) return null;
    return goals.onPace - goals.previousOnPace;
  }, [goals]);

  const Icon = delta === null || delta === 0 ? Minus : delta > 0 ? ArrowUpRight : ArrowDownRight;

  return (
    <Panel
      title="Goals"
      subtitle="On pace this week"
      domain="goals"
      loading={loading}
      loadingRows={2}
      minHeightClass="min-h-[9rem]"
      error={error}
      onRetry={() => void reload()}
      isEmpty={!loading && goals !== null && goals.active === 0}
      empty={
        <PanelEmpty
          title="No active goals"
          description="Set a goal with a start and end date and this tracks how well you are keeping to it."
        />
      }
    >
      {goals === null ? null : (
        <div className="flex flex-1 flex-col justify-center gap-2 px-5 pb-5">
          <Link
            href="/goals"
            className="flex items-center gap-2 text-foreground transition-colors hover:text-primary"
          >
            <Target className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
            <span className="text-sm">
              <span className="font-display text-xl font-bold tabular-nums">
                {goals.onPace}
              </span>
              <span className="text-muted-foreground"> of {goals.active} goals on pace</span>
            </span>
            {delta !== null && (
              <span
                className={cn(
                  'ml-auto inline-flex items-center gap-0.5 text-xs font-semibold tabular-nums',
                  delta === 0
                    ? 'text-muted-foreground'
                    : delta > 0
                      ? 'text-emerald-600 dark:text-emerald-400'
                      : 'text-amber-600 dark:text-amber-400'
                )}
                title="Change in on-pace goals over the last 7 days"
              >
                <Icon className="h-3.5 w-3.5" aria-hidden="true" />
                {delta === 0 ? 'steady' : Math.abs(delta)}
                {delta === 0 ? '' : delta > 0 ? ' more' : ' fewer'}
              </span>
            )}
          </Link>

          {goals.furthestBehind && (
            <p className="text-xs leading-relaxed text-muted-foreground">
              Furthest behind:{' '}
              <span className="font-medium text-foreground">{goals.furthestBehind.title}</span>,{' '}
              {goals.furthestBehind.behindPctPoints} percentage points behind pace.
            </p>
          )}

          <Link
            href="/goals"
            className="mt-1 inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
          >
            All goals
            <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
          </Link>
        </div>
      )}
    </Panel>
  );
}
