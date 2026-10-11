'use client';

import { useEffect, useRef, useState } from 'react';
import { Check, Loader2, Minus, Plus } from 'lucide-react';
import { cn } from '@/lib/utils';
import { quantityMeetsTarget } from '@/lib/habits/completion';
import type { HabitDirection, HabitTrackingType } from '@/constants/prisma-enums';

/**
 * Quick numeric entry for a COUNT or DURATION habit on `/today`.
 *
 * ## Why a checkbox is not enough
 *
 * The old checklist could only record *that* a numeric habit happened. "Read 10
 * pages" became a tick with no number attached, so there was nothing to compare
 * against the target, nothing to show as a fraction, and no way for a LIMIT habit
 * ("stay under 200 min of scrolling") to record that it was respected.
 *
 * This records the actual reading. The server then derives the status from it
 * against **that habit's own** direction and target — see
 * `lib/habits/completion.ts`.
 *
 * ## The local preview is the same rule, not a copy of it
 *
 * The bar turns green *before* the request goes out, using
 * `quantityMeetsTarget` imported from the same module the server uses. A
 * hand-written `value >= target` here would be a second definition of
 * completion, and would be wrong for every LIMIT habit the moment somebody
 * noticed.
 */

interface HabitNumericEntryProps {
  habitId: string;
  habitName: string;
  trackingType: HabitTrackingType;
  direction: HabitDirection;
  targetValue: number | null;
  unit: string | null;
  /** The reading already recorded today, if any. */
  initialValue: number | null;
  /** Persists the reading. Receives `null` to clear it. */
  onSave: (quantity: number | null) => Promise<void>;
  disabled?: boolean;
}

/** Step size for the +/- buttons, by tracking type. */
const STEP: Record<HabitTrackingType, number> = {
  BOOLEAN: 1,
  COUNT: 1,
  // Minutes: a 1-minute step is unusable with buttons, but a free-text number
  // entry still allows any value including 7.5 hours in hours.
  DURATION: 5,
};

export function HabitNumericEntry({
  habitName,
  trackingType,
  direction,
  targetValue,
  unit,
  initialValue,
  onSave,
  disabled,
}: HabitNumericEntryProps) {
  const [value, setValue] = useState<string>(
    initialValue !== null ? String(initialValue) : ''
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Re-seed when the parent's value changes underneath us (e.g. the checklist
  // refetched after a broadcast from another tab).
  useEffect(() => {
    setValue(initialValue !== null ? String(initialValue) : '');
  }, [initialValue]);

  const parsed = value.trim() === '' ? null : Number(value);
  const invalid = parsed !== null && !Number.isFinite(parsed);

  // Local preview only. Never persisted, never authoritative.
  const meets =
    parsed !== null &&
    !invalid &&
    (direction === 'AVOID'
      ? false
      : quantityMeetsTarget(direction, targetValue, parsed));

  const commit = async (next: number | null) => {
    setSaving(true);
    setError(null);
    try {
      await onSave(next);
    } catch {
      setError('Could not save');
    } finally {
      setSaving(false);
    }
  };

  const step = (delta: number) => {
    const base = parsed ?? 0;
    const next = Math.max(0, base + delta * STEP[trackingType]);
    // Two decimal places is enough for 7.5 h / 2.5 L without inviting float
    // noise from repeated addition.
    setValue(String(Math.round(next * 100) / 100));
  };

  const label = unit ? `${habitName} in ${unit}` : habitName;

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => step(-1)}
          disabled={disabled || saving}
          aria-label={`Decrease ${label}`}
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-input text-muted-foreground transition-colors hover:bg-accent disabled:opacity-50"
        >
          <Minus className="h-4 w-4" />
        </button>

        <input
          ref={inputRef}
          type="number"
          inputMode="decimal"
          step="any"
          min="0"
          value={value}
          disabled={disabled || saving}
          onChange={(e) => setValue(e.target.value)}
          onBlur={() => {
            if (parsed !== null && !invalid && parsed !== initialValue) {
              void commit(parsed);
            }
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && parsed !== null && !invalid) {
              e.preventDefault();
              void commit(parsed);
            }
          }}
          aria-label={label}
          placeholder={targetValue !== null ? `0 / ${targetValue}` : '0'}
          className={cn(
            'h-8 w-full min-w-0 rounded-md border bg-background px-2 text-sm tabular-nums text-foreground',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40',
            invalid ? 'border-destructive' : 'border-input',
            meets && 'border-emerald-500'
          )}
        />

        <button
          type="button"
          onClick={() => step(1)}
          disabled={disabled || saving}
          aria-label={`Increase ${label}`}
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-input text-muted-foreground transition-colors hover:bg-accent disabled:opacity-50"
        >
          <Plus className="h-4 w-4" />
        </button>

        {saving ? (
          <Loader2 className="h-4 w-4 shrink-0 animate-spin text-muted-foreground" />
        ) : (
          <button
            type="button"
            onClick={() => void commit(parsed)}
            disabled={disabled || invalid || (parsed === null && initialValue === null)}
            aria-label={`Save ${label}`}
            className={cn(
              'flex h-8 w-8 shrink-0 items-center justify-center rounded-md border transition-colors',
              meets
                ? 'border-emerald-500 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                : 'border-input text-muted-foreground hover:bg-accent',
              'disabled:opacity-50'
            )}
          >
            <Check className="h-4 w-4" />
          </button>
        )}
      </div>

      <p className="text-xs text-muted-foreground">
        {error ?? formatHint(parsed, targetValue, unit, direction, meets)}
      </p>
    </div>
  );
}

/**
 * The hint line.
 *
 * For a LIMIT habit the wording flips deliberately: "12,400 / 15,000" is
 * encouraging and "180 / 200 min" is fine, but "340 / 200 min" must not read
 * as progress. `unit` is shown on the number that has one rather than on both,
 * because "180 min / 200 min" is noise.
 */
function formatHint(
  value: number | null,
  target: number | null,
  unit: string | null,
  direction: HabitDirection,
  meets: boolean
): string {
  if (value === null) {
    if (direction === 'AVOID') {
      return 'Leave empty to count as avoided.';
    }
    return target !== null
      ? `Target ${target.toLocaleString()}${unit ? ` ${unit}` : ''}.`
      : 'No target set.';
  }

  const reading = `${value.toLocaleString()}${unit ? ` ${unit}` : ''}`;

  if (direction === 'AVOID') {
    return 'Recorded — this counts against you.';
  }

  if (target === null) return `Recorded ${reading}.`;

  if (direction === 'LIMIT') {
    return meets
      ? `${reading} of ${target.toLocaleString()}${unit ? ` ${unit}` : ''} — under the limit.`
      : `Over by ${(value - target).toLocaleString()}${unit ? ` ${unit}` : ''}.`;
  }

  return `${reading} of ${target.toLocaleString()}${unit ? ` ${unit}` : ''}`;
}