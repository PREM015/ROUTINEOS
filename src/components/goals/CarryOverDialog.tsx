'use client';

import { useCallback, useState } from 'react';
import { CalendarPlus } from 'lucide-react';
import { apiRequest } from '@/lib/api-client';
import { addDays } from '@/lib/goals/goal-metrics';
import { Button, Input } from '@/components/ui';
import { useUserTimezone } from '@/hooks/useUserTimezone';
import type { Goal } from '@/context/AppContext';

/**
 * ## Carry over
 *
 * A goal whose deadline has passed without finishing is not a failure, and the
 * app's only answer to it used to be `status: 'CANCELLED'`. That is a lie in the
 * useful direction: it marks the work abandoned when what actually happened is
 * that the plan was longer than the runway. This is the difference between the
 * two.
 *
 * `POST /api/goals/[id]/carry-over` has existed all along and had no caller. It
 * archives the old goal and clones it into a new period with the milestones
 * copied over as open steps, so the plan survives instead of being retyped.
 *
 * ### Why the progress choice is a real choice
 *
 * Carrying the number forward is right when the unit is cumulative — 40 of 100
 * pages written, 300 of 500 km run. It is wrong when the unit resets — a weekly
 * target, a per-session rep count, this week's sessions. Defaulting to "start
 * over" is the safer default for the common case and is not hidden: the labels
 * say exactly which one is selected.
 *
 * ### Why it needs confirming
 *
 * It writes two goals where there was one, and the old one leaves the ACTIVE
 * list. That is not obvious from a single button, so it asks first — including
 * naming the goal being archived, which is the part a user would otherwise have
 * to guess at afterwards.
 */

interface CarryOverDialogProps {
  goal: Goal;
  onClose: () => void;
  /** Closes the drawer too — the old goal is no longer active to draw. */
  onCarried: (newGoalId: string) => void;
}

/** Default new window: one month from today, matching the usual "next period". */
const DEFAULT_WINDOW_DAYS = 30;

export function CarryOverDialog({ goal, onClose, onCarried }: CarryOverDialogProps) {
  // The user's timezone, not the host's: the carry-over starts "today", and a
  // host-date default would put the new deadline a day off for anyone east or
  // west of UTC.
  const { today } = useUserTimezone();
  const [endDate, setEndDate] = useState(
    () => addDays(today, DEFAULT_WINDOW_DAYS)
  );
  const [keepProgress, setKeepProgress] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = useCallback(
    async (event: React.FormEvent) => {
      event.preventDefault();
      if (busy) return;

      setBusy(true);
      setError(null);
      try {
        const created = await apiRequest<{ id: string }>(
          `/api/goals/${goal.id}/carry-over`,
          { method: 'POST', body: { newEndDate: endDate, adjustProgress: keepProgress } }
        );
        onCarried(created.id);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Could not carry that goal over');
        setBusy(false);
      }
    },
    [busy, endDate, goal.id, keepProgress, onCarried]
  );

  return (
    <form
      onSubmit={submit}
      className="space-y-3"
      role="dialog"
      aria-labelledby="carry-over-title"
    >
      <h4 id="carry-over-title" className="text-sm font-medium text-foreground">
        Carry over to a new period
      </h4>

      <p className="text-xs leading-relaxed text-muted-foreground">
        <span className="text-foreground">{goal.title}</span> is archived and copied
        to a new goal starting today
        {goal.milestoneCount > 0 && (
          <>
            {' '}
            with all {goal.milestoneCount} milestones reopened
          </>
        )}
        . Its history stays readable on the archived goal.
      </p>

      <div>
        <label htmlFor="carry-over-end" className="mb-1 block text-[11px] uppercase tracking-[0.08em] text-muted-foreground">
          New deadline
        </label>
        <Input
          id="carry-over-end"
          type="date"
          value={endDate}
          min={today}
          onChange={(e) => setEndDate(e.target.value)}
        />
      </div>

      <fieldset className="space-y-1.5">
        <legend className="mb-1 text-[11px] uppercase tracking-[0.08em] text-muted-foreground">
          Starting value
        </legend>
        <label className="flex cursor-pointer items-start gap-2 text-xs text-foreground">
          <input
            type="radio"
            name="carry-progress"
            checked={!keepProgress}
            onChange={() => setKeepProgress(false)}
            className="mt-0.5 accent-[var(--pace-ahead)]"
          />
          <span>
            Start fresh at 0
            <span className="block text-muted-foreground">
              Right for anything that counts per period.
            </span>
          </span>
        </label>
        <label className="flex cursor-pointer items-start gap-2 text-xs text-foreground">
          <input
            type="radio"
            name="carry-progress"
            checked={keepProgress}
            onChange={() => setKeepProgress(true)}
            className="mt-0.5 accent-[var(--pace-ahead)]"
          />
          <span>
            Keep {goal.currentValue}
            {goal.unit ? ` ${goal.unit}` : ''} of {goal.targetValue}
            <span className="block text-muted-foreground">
              Right when the unit accumulates across periods.
            </span>
          </span>
        </label>
      </fieldset>

      {error && (
        <p role="alert" className="text-xs text-destructive">
          {error}
        </p>
      )}

      <div className="flex justify-end gap-2 pt-1">
        <Button type="button" variant="ghost" size="sm" onClick={onClose}>
          Cancel
        </Button>
        <Button type="submit" variant="primary" size="sm" isLoading={busy}>
          <CalendarPlus className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
          Carry over
        </Button>
      </div>
    </form>
  );
}

export default CarryOverDialog;