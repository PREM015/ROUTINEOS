'use client';

import Link from 'next/link';
import { ChevronRight, GitBranch } from 'lucide-react';
import { formatValue } from '@/lib/goals/goal-metrics';
import { cn } from '@/lib/utils';
import type { Goal } from '@/context/AppContext';

/**
 * ## Sub-goal hierarchy
 *
 * `Goal.parentGoalId` is a self-relation that has always been in the schema, and
 * `updateGoalSchema` has always accepted `parentGoalId` — but nothing rendered it
 * and `updateGoal` never read it. A goal could be *made* a sub-goal in the data
 * and there was no way to see that it was.
 *
 * ### Progress here is measured, not inherited
 *
 * Each child's own bar shows its own `currentValue / targetValue`. It does not
 * show a share of the parent's, and the parent's bar does not aggregate its
 * children — because the two measure different things and averaging them is
 * meaningless: a "run a marathon" parent whose three sub-goals are training,
 * nutrition and race-day gear has no sensible combined percentage. The
 * hierarchy tells you what the goal is made *of*; it does not invent a roll-up.
 */

interface SubGoalsSectionProps {
  goal: Goal;
  /** Highlights the row that is currently open in the drawer. */
  currentGoalId: string;
}

export function SubGoalsSection({ goal, currentGoalId }: SubGoalsSectionProps) {
  const children = goal.subGoals;

  return (
    <section aria-labelledby="drawer-hierarchy">
      <h4
        id="drawer-hierarchy"
        className="mb-2 text-[11px] uppercase tracking-[0.08em] text-muted-foreground"
      >
        {goal.parentGoalId ? 'Sub-goal' : 'Structure'}
      </h4>

      {/* Parent first. Rendered above the section title's content because the
          link out of a sub-goal is the more useful direction — you usually open
          a leaf to check a number, then want the whole. */}
      {goal.parentGoalId && goal.parentGoalTitle && (
        <Link
          href={`/goals?goal=${goal.parentGoalId}`}
          className="mb-2 flex items-center gap-1.5 rounded px-1 py-1 text-xs text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60"
        >
          <GitBranch className="h-3 w-3 shrink-0" aria-hidden="true" />
          <span className="truncate">Part of</span>
          <span className="truncate text-foreground">{goal.parentGoalTitle}</span>
          <ChevronRight className="ml-auto h-3 w-3 shrink-0" aria-hidden="true" />
        </Link>
      )}

      {children.length === 0 ? (
        goal.parentGoalId ? null : (
          <p className="text-[11px] text-muted-foreground">
            No sub-goals. A parent goal with two or three named parts is usually
            easier to finish than one that has to be held in your head whole.
          </p>
        )
      ) : (
        <>
          <ul className="space-y-0.5">
            {children.map((child) => {
              const complete = child.status === 'COMPLETED';
              const current = child.id === currentGoalId;
              return (
                <li key={child.id}>
                  <Link
                    href={`/goals?goal=${child.id}`}
                    aria-current={current ? 'true' : undefined}
                    className={cn(
                      'group flex items-center gap-2 rounded px-1 py-1 text-xs',
                      'transition-colors hover:bg-muted/60',
                      'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60',
                      current && 'bg-muted/60'
                    )}
                  >
                    <span
                      className={cn(
                        'h-1.5 w-1.5 shrink-0 rounded-full',
                        complete ? 'bg-pace-ahead' : 'bg-foreground/25'
                      )}
                      aria-hidden="true"
                    />
                    <span
                      className={cn(
                        'min-w-0 flex-1 truncate',
                        complete ? 'text-muted-foreground' : 'text-foreground'
                      )}
                    >
                      {child.title}
                    </span>
                    <span className="shrink-0 tabular-nums text-muted-foreground">
                      {formatValue(child.currentValue)}/{formatValue(child.targetValue)}
                    </span>
                    <ChevronRight
                      className="h-3 w-3 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100"
                      aria-hidden="true"
                    />
                  </Link>
                </li>
              );
            })}
          </ul>

          {/* Only when the server capped the array — otherwise this would claim
              there are more sub-goals on every goal that has any. */}
          {goal.subGoalCount > children.length && (
            <p className="mt-1 px-1 text-[11px] text-muted-foreground">
              Showing {children.length} of {goal.subGoalCount}.
            </p>
          )}
        </>
      )}
    </section>
  );
}

export default SubGoalsSection;