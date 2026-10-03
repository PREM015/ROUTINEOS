'use client';

import { useCallback, useEffect, useState } from 'react';
import { Drawer } from '@/components/ui/Drawer';
import { Button, Input, Textarea } from '@/components/ui';
import { GoalSparkline } from './GoalSparkline';
import { PaceTrack } from './PaceTrack';
import { ConsistencyStrip } from './ConsistencyStrip';
import { MilestonesPanel } from './MilestonesPanel';
import { CarryOverDialog } from './CarryOverDialog';
import { SubGoalsSection } from './SubGoalsSection';
import {
  PACE_TEXT,
  GOAL_PRIORITY_LABEL,
  GOAL_TYPE_LABEL,
  GOAL_STATUS_LABEL,
  type GoalPriorityValue,
  type GoalStatusValue,
  type GoalTypeValue,
} from '@/constants/goals';
import {
  dueLabel,
  formatValuePair,
  paceLabel,
  paceSummary,
  type ConsistencySummary,
  type GoalPace,
  type ProgressPoint,
} from '@/lib/goals/goal-metrics';
import type { Goal } from '@/context/AppContext';

/**
 * ## The goal drawer
 *
 * Everything that does not fit in a card, moved out of a hover row and into a
 * space that does not have to compress itself into 44 pixels.
 *
 * It is also the destination for the **fixed deep link**. Two systems — the
 * notification service and the email service — used to build `/goals/{id}`, and
 * there has never been a `/goals/[id]` route, so every goal-deadline notification
 * produced a link to a 404. Both now point at `/goals?goal=<id>`, which this
 * drawer answers. That turned a bug into the page's first proper detail surface.
 *
 * ## The projection sentence
 *
 * "At this pace you'll finish 2 Nov — 4 days before the deadline."
 *
 * It is omitted entirely when there is not enough signal to say it. Velocity
 * needs at least two distinct logged days; below that `observedVelocityPerDay`
 * returns `null` and the drawer says nothing rather than quoting a rate derived
 * from a single data point.
 */

export interface GoalDrawerProps {
  open: boolean;
  goal: Goal | null;
  pace: GoalPace | null;
  consistency: ConsistencySummary | null;
  points: ProgressPoint[];
  today: string;
  onClose: () => void;
  onEdit: (goal: Goal) => void;
  onArchive: (goal: Goal) => void;
  onDelete: (goal: Goal) => void;
  /** Applies an absolute progress value; the caller owns the optimistic write. */
  onLogProgress?: (goal: Goal, value: number, note: string | null) => Promise<void>;
  /**
   * Called after a write that changes something the list already fetched, so the
   * parent can refetch. Milestone ticks change the count the list carries, which
   * is why this exists as a separate concern from {@link onLogProgress} - that one
   * is an optimistic write the parent already owns.
   */
  onChanged?: () => void;
  /**
   * Commits the carry-over and hands back the new goal's id.
   *
   * Optional because the drawer is also rendered without it in tests and in the
   * archived/completed tabs, where carrying a finished goal forward is not a
   * meaningful offer.
   */
  onCarryOver?: (newGoalId: string) => void;
}

type LogMode = 'set' | 'delta';

export function GoalDrawer({
  open,
  goal,
  pace,
  consistency,
  points,
  today,
  onClose,
  onEdit,
  onArchive,
  onDelete,
  onLogProgress,
  onChanged,
  onCarryOver,
}: GoalDrawerProps) {
  const [carryingOver, setCarryingOver] = useState(false);
  const [mode, setMode] = useState<LogMode>('set');
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [logging, setLogging] = useState(false);
  const [logError, setLogError] = useState<string | null>(null);

  // Reset per goal, so a half-typed note never follows the drawer to another goal.
  useEffect(() => {
    if (open) {
      setAmount('');
      setNote('');
      setLogError(null);
      setMode('set');
      // Reset with everything else. Left open, switching to another goal would
      // show that goal's deadline and progress total inside the previous goal's
      // confirm form - the exact confusion the dialog exists to prevent.
      setCarryingOver(false);
    }
  }, [open, goal?.id]);

  /*
    Carry-over is only offered on a goal that is actually in flight.

    `CARRIED_OVER` is excluded because that goal has already been carried and
    carrying it again would archive a goal nothing is looking at any more and
    clone a clone. Finished statuses are excluded because "I want another month
    of this" is not a sensible reading of a completed goal - a person who wants
    to run a race again creates a new one.
  */
  const showCarryOver =
    goal?.status === 'ACTIVE' && (goal.targetValue > 0 || goal.milestoneCount > 0);

  const submitLog = useCallback(
    async (event: React.FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      if (!goal || !onLogProgress || logging) return;

      const parsed = Number(amount);
      if (!Number.isFinite(parsed) || parsed <= 0) {
        setLogError('Enter a number greater than zero');
        return;
      }

      setLogging(true);
      setLogError(null);
      try {
        await onLogProgress(
          goal,
          mode === 'set' ? parsed : goal.currentValue + parsed,
          note.trim() || null
        );
        setAmount('');
        setNote('');
      } catch (error) {
        setLogError(
          error instanceof Error ? error.message : 'Could not log progress'
        );
      } finally {
        setLogging(false);
      }
    },
    [goal, amount, note, mode, logging, onLogProgress]
  );

  if (!goal) return null;

  const priority = goal.priority as GoalPriorityValue;
  const projection = pace?.projectedFinish ?? null;

  return (
    <Drawer
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
      side="right"
      title={goal.title}
      className="max-w-md bg-card"
    >
      <div className="space-y-6">
        {/* ── State header ────────────────────────────────────────────────── */}
        <div className="flex flex-wrap items-center gap-2">
          {pace && (
            <span
              className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium ${
                PACE_TEXT[pace.state]
              }`}
              style={{ background: 'var(--pace-rail)' }}
            >
              {/* Pace colour is never alone: the word is always present. */}
              {paceLabel(pace.state)}
            </span>
          )}
          <Chip>{GOAL_TYPE_LABEL[goal.type as GoalTypeValue] ?? goal.type}</Chip>
          <Chip>{GOAL_PRIORITY_LABEL[priority] ?? goal.priority}</Chip>
          {goal.status !== 'ACTIVE' && (
            <Chip>{GOAL_STATUS_LABEL[goal.status as GoalStatusValue] ?? goal.status}</Chip>
          )}
        </div>

        {goal.description && (
          <p className="text-sm leading-relaxed text-muted-foreground">{goal.description}</p>
        )}

        {/* ── Hero numerals + big track ──────────────────────────────────── */}
        <div className="rounded-xl border border-border p-4">
          <p className="font-display text-2xl tabular-nums text-foreground">
            {formatValuePair(goal.currentValue, goal.targetValue, goal.unit)}
          </p>
          {pace && (
            <>
              <div className="mt-3">
                <PaceTrack pace={pace} title={goal.title} />
              </div>
              <div className="mt-2 flex items-baseline justify-between gap-3">
                <span className="text-[11px] uppercase tracking-[0.08em] text-muted-foreground">
                  {dueLabel(goal, pace, today)}
                </span>
                <span className="font-display text-sm tabular-nums text-muted-foreground">
                  {pace.daysRemaining}d left
                </span>
              </div>
            </>
          )}
        </div>

        {/* ── Trajectory sparkline ───────────────────────────────────────── */}
        <section aria-labelledby="drawer-trajectory">
          <h4
            id="drawer-trajectory"
            className="mb-2 text-[11px] uppercase tracking-[0.08em] text-muted-foreground"
          >
            Trajectory
          </h4>
          <div className="rounded-xl border border-border p-3">
            <GoalSparkline
              goal={{
                startDate: goal.startDate,
                endDate: goal.endDate,
                currentValue: goal.currentValue,
                targetValue: goal.targetValue,
                status: goal.status,
              }}
              points={points}
              today={today}
              pace={pace ?? fallbackPace(goal)}
            />
          </div>

          {/*
            The projection, or nothing. Below two distinct logged days the
            velocity is unknowable, and a confident date built on one data point
            would be worse than silence.
          */}
          {projection && pace && (
            <p className="mt-2 text-xs text-muted-foreground">
              At this pace you finish{' '}
              <span className="font-display tabular-nums text-foreground">{projection}</span>
              {pace.projectedLateByDays > 0 ? (
                <>
                  {' '}
                  — {pace.projectedLateByDays}{' '}
                  {pace.projectedLateByDays === 1 ? 'day' : 'days'} past the deadline.
                </>
              ) : pace.projectedLateByDays === 0 ? (
                <> — inside the deadline.</>
              ) : null}
            </p>
          )}
          {!projection && pace && paceSummary(pace) && (
            <p className="mt-2 text-xs text-muted-foreground">{paceSummary(pace)}</p>
          )}
        </section>

        {/* ── Consistency ────────────────────────────────────────────────── */}
        {consistency && (
          <section aria-labelledby="drawer-consistency">
            <h4
              id="drawer-consistency"
              className="mb-2 text-[11px] uppercase tracking-[0.08em] text-muted-foreground"
            >
              Last 30 days
            </h4>
            <ConsistencyStrip summary={consistency} showStreak={false} />
            <p className="mt-2 text-xs text-muted-foreground">
              {consistency.doneDays} of {consistency.applicableDays} days
              {consistency.completionRate !== null &&
                ` · ${Math.round(consistency.completionRate * 100)}%`}
              {consistency.longestStreak > 0 &&
                ` · best run ${consistency.longestStreak}d`}
            </p>
          </section>
        )}

        {/* ── Sub-goals ──────────────────────────────────────────────────── */}
        <SubGoalsSection goal={goal} currentGoalId={goal.id} />

        {/* ── Milestones ─────────────────────────────────────────────────── */}
        <MilestonesPanel
          goalId={goal.id}
          totalCount={goal.milestoneCount}
          onChanged={onChanged}
        />

        {/* ── Log progress ───────────────────────────────────────────────── */}
        {onLogProgress && (
          <section aria-labelledby="drawer-log">
            <h4
              id="drawer-log"
              className="mb-2 text-[11px] uppercase tracking-[0.08em] text-muted-foreground"
            >
              Log progress
            </h4>
            <form onSubmit={submitLog} className="space-y-3">
              <div className="flex items-end gap-2">
                <Input
                  label={mode === 'set' ? 'New total' : 'Add'}
                  type="number"
                  inputMode="decimal"
                  min="0"
                  step="any"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder={mode === 'set' ? String(goal.targetValue) : '5'}
                  className="flex-1"
                />
                {/*
                  `set` vs `delta` is the ambiguity that silently turned "I have
                  done 42" into 147. The control is explicit rather than inferred
                  from the shape of the number.
                */}
                <div
                  role="radiogroup"
                  aria-label="How to read the number"
                  className="flex rounded-lg border border-border p-0.5"
                >
                  {(['set', 'delta'] as const).map((value) => (
                    <button
                      key={value}
                      type="button"
                      role="radio"
                      aria-checked={mode === value}
                      onClick={() => setMode(value)}
                      className={`rounded-md px-2.5 py-2 text-xs font-medium transition-colors ${
                        mode === value
                          ? 'bg-muted text-foreground'
                          : 'text-muted-foreground hover:text-foreground'
                      }`}
                    >
                      {value === 'set' ? 'Set' : '+'}
                    </button>
                  ))}
                </div>
              </div>
              <Textarea
                label="Note (optional)"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Trail run, felt easy."
                rows={2}
              />
              {logError && (
                <p role="alert" className="text-xs text-destructive">
                  {logError}
                </p>
              )}
              <Button type="submit" variant="primary" isLoading={logging} className="w-full">
                {mode === 'set' ? 'Set progress' : 'Add progress'}
              </Button>
            </form>
          </section>
        )}

        {/* ── Details ────────────────────────────────────────────────────── */}
        <section aria-labelledby="drawer-details">
          <h4
            id="drawer-details"
            className="mb-2 text-[11px] uppercase tracking-[0.08em] text-muted-foreground"
          >
            Details
          </h4>
          <dl className="space-y-1.5 text-xs">
            <Row label="Starts" value={goal.startDate} />
            <Row label="Deadline" value={goal.endDate} />
            {goal.project && <Row label="Project" value={goal.project.name} />}
            {!goal.appliesEveryDay && goal.dayTypeNames.length > 0 && (
              <Row label="Applies on" value={goal.dayTypeNames.join(', ')} />
            )}
            {goal.carriedOverFrom && <Row label="Carried over from" value="an earlier goal" />}
          </dl>
        </section>

        {/*
          Replaces the whole action list rather than opening over it: the
          carry-over form is the confirmation step for a write that creates one
          goal and archives another, so it should own the space it asks for.
        */}
        {carryingOver && onCarryOver ? (
          <section
            aria-labelledby="drawer-actions"
            className="space-y-2 border-t border-border pt-4"
          >
            <h4 id="drawer-actions" className="sr-only">
              Carry over
            </h4>
            <CarryOverDialog
              goal={goal}
              onClose={() => setCarryingOver(false)}
              onCarried={onCarryOver}
            />
          </section>
        ) : (
        /* ── Actions ────────────────────────────────────────────────────── */
        <section aria-labelledby="drawer-actions" className="space-y-2 border-t border-border pt-4">
          <h4 id="drawer-actions" className="sr-only">
            Actions
          </h4>
          <Button variant="outline" className="w-full" onClick={() => onEdit(goal)}>
            Edit
          </Button>
          {/*
            Carry-over replaces Archive as the primary answer to "the deadline
            passed and I'm not done". Archive is still one click below it, because
            some goals genuinely are finished with — but the button above now
            distinguishes the two, and it carries the milestone plan over instead
            of asking the user to rebuild it.
          */}
          {showCarryOver && !carryingOver && (
            <Button
              variant="secondary"
              className="w-full"
              onClick={() => setCarryingOver(true)}
            >
              Carry over to a new period…
            </Button>
          )}
          <Button variant="secondary" className="w-full" onClick={() => onArchive(goal)}>
            Archive
          </Button>
          {/*
            Delete is last and quiet. The confirmation dialog names exactly what
            is lost, which is the only thing that makes a destructive action
            informed — a quiet button plus a clear summary beats a loud button
            plus a vague warning.
          */}
          <Button
            variant="ghost"
            className="w-full text-muted-foreground hover:text-destructive"
            onClick={() => onDelete(goal)}
          >
            Delete…
          </Button>
        </section>
        )}
      </div>
    </Drawer>
  );
}

function Chip({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center rounded-full border border-border px-2 py-0.5 text-[10px] uppercase tracking-[0.08em] text-muted-foreground">
      {children}
    </span>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="truncate text-right text-foreground">{value}</dd>
    </div>
  );
}

/**
 * A neutral pace used only for the sparkline's glide path when the real one has
 * not arrived yet, so the chart still has a reference line to sit against.
 */
function fallbackPace(goal: Goal): GoalPace {
  const span = Math.max(
    1,
    (Date.parse(`${goal.endDate}T00:00:00.000Z`) -
      Date.parse(`${goal.startDate}T00:00:00.000Z`)) /
      86_400_000
  );
  return {
    state: 'on_pace',
    progressShare: goal.targetValue > 0 ? Math.min(1, goal.currentValue / goal.targetValue) : 0,
    elapsedShare: 0,
    gapPoints: 0,
    daysTotal: span,
    daysElapsed: 0,
    daysRemaining: span,
    startsInDays: 0,
    scheduleSlackDays: 0,
    velocityPerDay: null,
    projectedFinish: null,
    projectedLateByDays: 0,
    hasNoTarget: goal.targetValue <= 0,
    isOverdue: false,
    isNotStarted: false,
  };
}