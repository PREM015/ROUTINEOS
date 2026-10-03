'use client';

import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { CalendarRange, Check, TriangleAlert } from 'lucide-react';
import { Button, Input, Modal, Switch } from '@/components/ui';
import { apiRequest, ApiError } from '@/lib/api-client';
import { nextCalendarDay } from '@/lib/dates';
import type { DayType } from '@/types/routine';

/**
 * A3.6 — apply the selected day type's schedule to a range of dates.
 *
 * ## What it writes
 *
 * One `RoutineException` per date, pointing at the template the day type already
 * has. It does not copy blocks: there is one schedule per day type, and a range
 * of dates all set to `College` all resolve to that same template. Copying blocks
 * per date would fork one template into N of them and leave the user editing
 * seven identical schedules the moment anything changed.
 *
 * ## Partial success is reported, never smoothed over
 *
 * The endpoint answers 207 when some dates were refused — an existing override
 * that was not overwritten, or a date outside the retroactive edit window. That
 * result is shown as a list of which dates and why, because "applied to 5 of 7"
 * is the truth and a green toast saying "Done" would be the lie this page has
 * spent a phase removing.
 *
 * ## Overwrite is off by default
 *
 * The destructive option must not be the one a mis-click lands on. It is a
 * labelled checkbox with its consequence spelled out, not a default-true switch.
 */

interface ApplyResult {
  applied: string[];
  skipped: Array<{ date: string; reason: string }>;
}

export function ApplyToRangeDialog({
  open,
  onClose,
  dayTypeName,
  dayTypeId,
  dayTypeValue,
  today,
  blockCount,
  onApplied,
}: {
  open: boolean;
  onClose: () => void;
  /** For copy only. `null` when the resolved day type has no definition row. */
  dayTypeName: string | null;
  dayTypeId: string | null;
  dayTypeValue: DayType | null;
  today: string;
  /** How many blocks the target schedule has — 0 means there is nothing to apply. */
  blockCount: number;
  onApplied: () => void;
}) {
  const [start, setStart] = useState(today);
  const [end, setEnd] = useState(() => nextCalendarDay(today));
  const [overwrite, setOverwrite] = useState(false);
  const [note, setNote] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ApplyResult | null>(null);

  // Re-seed on open so a previous attempt's dates do not greet the user.
  useEffect(() => {
    if (!open) return;
    setStart(today);
    setEnd(nextCalendarDay(today));
    setOverwrite(false);
    setNote('');
    setError(null);
    setResult(null);
  }, [open, today]);

  const dayCount = useMemo(() => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(start) || !/^\d{4}-\d{2}-\d{2}$/.test(end)) return null;
    if (start > end) return 0;
    let count = 0;
    for (let cursor = start; cursor <= end && count <= 400; cursor = nextCalendarDay(cursor)) {
      count += 1;
    }
    return count;
  }, [start, end]);

  const reversed = Boolean(
    /^\d{4}-\d{2}-\d{2}$/.test(start) && /^\d{4}-\d{2}-\d{2}$/.test(end) && start > end
  );

  const submit = async () => {
    if (submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const response = await apiRequest<ApplyResult>('/api/routine', {
        method: 'POST',
        body: {
          startDate: start,
          endDate: end,
          dayTypeId: dayTypeId ?? undefined,
          dayType: dayTypeId ? undefined : (dayTypeValue ?? undefined),
          overwrite,
          note: note.trim() || null,
        },
      });

      setResult(response);
      if (response.skipped.length === 0) {
        toast.success(
          `${dayTypeName ?? 'Day type'} applied to ${response.applied.length} ${
            response.applied.length === 1 ? 'date' : 'dates'
          }`
        );
        onApplied();
        onClose();
        return;
      }
      // Partial: stay open so the skipped list is actually read.
      toast.warning(
        `Applied to ${response.applied.length} of ${response.applied.length + response.skipped.length} dates`
      );
      onApplied();
    } catch (caught) {
      if (caught instanceof ApiError && caught.status === 409) {
        setError('None of those dates could be changed — see the reasons below.');
        onApplied();
      } else {
        setError(caught instanceof ApiError ? caught.message : 'Could not apply that range');
      }
    } finally {
      setSubmitting(false);
    }
  };

  const nothingToApply = blockCount === 0;

  return (
    <Modal
      isOpen={open}
      onClose={onClose}
      title={`Apply ${dayTypeName ?? 'this day type'} to a date range`}
      footer={
        <div className="flex items-center gap-2">
          <Button variant="ghost" onClick={onClose} disabled={submitting}>
            Close
          </Button>
          <Button
            variant="primary"
            onClick={submit}
            isLoading={submitting}
            disabled={reversed || dayCount === null || dayCount === 0 || nothingToApply}
          >
            Apply to {dayCount ?? 0} {dayCount === 1 ? 'date' : 'dates'}
          </Button>
        </div>
      }
    >
      <p className="text-sm text-muted-foreground">
        {nothingToApply ? (
          <>
            <span className="font-medium text-foreground">
              This day type has no blocks yet.
            </span>{' '}
            Add a block to it first — a range points at the existing schedule rather than
            copying it.
          </>
        ) : (
          <>
            Every date in the range will resolve to the <span className="font-medium text-foreground">
            {dayTypeName ?? 'current'}
            </span> schedule ({blockCount} block{blockCount === 1 ? '' : 's'}). Days that
            already have a different day type set are skipped unless you overwrite them.
          </>
        )}
      </p>

      <div className="mt-4 grid grid-cols-2 gap-3">
        <Input
          label="From"
          type="date"
          value={start}
          onChange={(event) => setStart(event.target.value)}
        />
        <Input
          label="To"
          type="date"
          value={end}
          onChange={(event) => setEnd(event.target.value)}
          error={reversed ? 'The end date must be on or after the start date' : undefined}
        />
      </div>

      <div className="mt-1">
        <Input
          label="Note (optional)"
          value={note}
          onChange={(event) => setNote(event.target.value)}
          placeholder="e.g. exam season"
        />
      </div>

      <div className="mt-3">
        <Switch
          checked={overwrite}
          onChange={setOverwrite}
          label="Overwrite dates that already have a day type set"
          description="Off by default. Turn this on only if you mean to replace overrides you set by hand."
        />
      </div>

      {reversed && (
        <p role="alert" className="mt-3 text-sm text-destructive">
          Fix the dates before applying.
        </p>
      )}
      {error && (
        <p role="alert" className="mt-3 text-sm text-destructive">
          {error}
        </p>
      )}

      {result && result.skipped.length > 0 && (
        <div className="mt-4 rounded-lg border border-warning/40 bg-warning/5 p-3">
          <p className="flex items-center gap-1.5 text-sm font-medium text-foreground">
            <TriangleAlert size={14} aria-hidden="true" />
            {result.applied.length} applied, {result.skipped.length} skipped
          </p>
          <ul className="mt-2 space-y-1">
            {result.skipped.map((row) => (
              <li key={row.date} className="flex items-baseline gap-2 text-xs">
                <span className="font-mono tabular-nums text-muted-foreground">{row.date}</span>
                <span className="text-muted-foreground">{row.reason}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {result && result.skipped.length === 0 && (
        <p className="mt-3 flex items-center gap-1.5 text-sm text-primary">
          <Check size={14} aria-hidden="true" />
          Applied to {result.applied.length}{' '}
          {result.applied.length === 1 ? 'date' : 'dates'}.
        </p>
      )}
    </Modal>
  );
}

/**
 * The trigger.
 *
 * A quiet ghost button rather than a filled one: the day-type strip already has
 * a filled "+ Day type" beside it, and two filled buttons of equal weight would
 * make creating a *new* preset look like the same kind of act as applying an
 * existing one to a few dates.
 *
 * Disabled outright — not just inert on click — when there is nothing to apply,
 * because a control that looks available and does nothing is worse than one that
 * visibly cannot be used.
 */
export function ApplyToRangeTrigger({
  disabled,
  onClick,
}: {
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={onClick}
      disabled={disabled}
      className="shrink-0"
      title={
        disabled
          ? 'Add a block to this day type before applying it to a range'
          : 'Apply this day type’s schedule to a range of dates'
      }
    >
      <CalendarRange size={14} />
      <span className="hidden sm:inline">Apply to dates</span>
    </Button>
  );
}

export default ApplyToRangeDialog;
