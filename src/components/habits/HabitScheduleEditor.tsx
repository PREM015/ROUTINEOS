"use client";

import { useState } from 'react';
import { CheckCircle2, RotateCcw } from 'lucide-react';
import { apiRequest, ApiError } from '@/lib/api-client';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';

/**
 * HabitScheduleEditor — edits a habit's `frequencyType` / `frequencyValue` /
 * `targetCount` and persists them.
 *
 * The previous version was inert: the weekday buttons had no `onClick` at all,
 * the target input was uncontrolled, there was no save button and no fetch, and
 * `initialConfig` was declared but never read. Changing the frequency dropdown
 * mutated local state and nothing else, so the UI accepted an edit that was
 * never saved.
 *
 * `frequencyValue` is a comma-joined weekday list (`"1,3,5"`), NOT JSON — see
 * `AddHabitModal`/`EditHabitModal`, which build it with `.join(',')`. The old
 * caller did `JSON.parse(habit.frequencyValue)`, which threw a SyntaxError for
 * every SPECIFIC_WEEKDAYS habit and took the whole tab down with it.
 */

const FREQUENCY_OPTIONS = [
  { value: 'DAILY', label: 'Every day' },
  { value: 'SPECIFIC_WEEKDAYS', label: 'Specific days of the week' },
  { value: 'WEEKLY_TARGET', label: 'Times per week' },
  { value: 'MONTHLY_TARGET', label: 'Times per month' },
  { value: 'WEEKLY', label: 'Weekly' },
  { value: 'MONTHLY', label: 'Monthly' },
  { value: 'YEARLY', label: 'Yearly' },
] as const;

/** Monday-first index 0..6, matching the `Date#getDay()` convention used elsewhere. */
const WEEKDAYS = [
  { index: 1, short: 'M' },
  { index: 2, short: 'T' },
  { index: 3, short: 'W' },
  { index: 4, short: 'T' },
  { index: 5, short: 'F' },
  { index: 6, short: 'S' },
  { index: 0, short: 'S' },
] as const;

/**
 * Parse the stored `frequencyValue` for a habit.
 *
 * Tolerant by design: the column has been written both as a weekday list
 * (`"1,3,5"`) and as a bare count (`"3"`), and historically as JSON for some
 * rows. Anything unrecognised is ignored rather than thrown on.
 */
export function parseFrequencyValue(
  value: string | null | undefined
): { weekdays: number[]; target: number | null } {
  if (!value) return { weekdays: [], target: null };

  const trimmed = value.trim();
  if (!trimmed) return { weekdays: [], target: null };

  // Historical JSON rows.
  if (trimmed.startsWith('[')) {
    try {
      const parsed: unknown = JSON.parse(trimmed);
      if (Array.isArray(parsed)) {
        return {
          weekdays: parsed.filter((n): n is number => typeof n === 'number'),
          target: null,
        };
      }
    } catch {
      // Fall through to the plain-string formats below.
    }
  }

  const parts = trimmed
    .split(',')
    .map((part) => Number(part.trim()))
    .filter((n) => Number.isInteger(n));

  if (parts.length === 0) return { weekdays: [], target: null };
  if (parts.length === 1) return { weekdays: [], target: parts[0] ?? null };
  return { weekdays: parts, target: null };
}

interface HabitScheduleEditorProps {
  habitId: string;
  initialFrequencyType: string;
  initialFrequencyValue: string | null;
  initialTargetCount: number | null;
  onSaved?: () => void;
}

export default function HabitScheduleEditor({
  habitId,
  initialFrequencyType,
  initialFrequencyValue,
  initialTargetCount,
  onSaved,
}: HabitScheduleEditorProps) {
  const parsedInitial = parseFrequencyValue(initialFrequencyValue);

  const [frequencyType, setFrequencyType] = useState(initialFrequencyType);
  const [weekdays, setWeekdays] = useState<number[]>(parsedInitial.weekdays);
  const [targetCount, setTargetCount] = useState<number>(
    initialTargetCount ?? parsedInitial.target ?? 1
  );
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isDirty =
    frequencyType !== initialFrequencyType ||
    weekdays.join(',') !== parsedInitial.weekdays.join(',') ||
    targetCount !== (initialTargetCount ?? parsedInitial.target ?? 1);

  const toggleDay = (day: number) => {
    setSaved(false);
    setWeekdays((current) =>
      current.includes(day)
        ? current.filter((d) => d !== day)
        : [...current, day].sort((a, b) => a - b)
    );
  };

  const reset = () => {
    setFrequencyType(initialFrequencyType);
    setWeekdays(parsedInitial.weekdays);
    setTargetCount(initialTargetCount ?? parsedInitial.target ?? 1);
    setSaved(false);
    setError(null);
  };

  const save = async () => {
    if (frequencyType === 'SPECIFIC_WEEKDAYS' && weekdays.length === 0) {
      setError('Pick at least one day of the week.');
      return;
    }

    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      // `null` (not `undefined`) for the inapplicable field so the server
      // actually clears it. Sending `undefined` drops the key entirely in
      // `JSON.stringify` and the old value survives.
      await apiRequest(`/api/habits/${habitId}`, {
        method: 'PUT',
        body: {
          frequencyType,
          frequencyValue:
            frequencyType === 'SPECIFIC_WEEKDAYS'
              ? [...weekdays].sort((a, b) => a - b).join(',')
              : null,
          targetCount:
            frequencyType === 'WEEKLY_TARGET' || frequencyType === 'MONTHLY_TARGET'
              ? targetCount
              : null,
        },
      });
      setSaved(true);
      onSaved?.();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to save the schedule.');
    } finally {
      setSaving(false);
    }
  };

  const showWeekdays = frequencyType === 'SPECIFIC_WEEKDAYS';
  const showTarget =
    frequencyType === 'WEEKLY_TARGET' || frequencyType === 'MONTHLY_TARGET';
  const targetMax = frequencyType === 'WEEKLY_TARGET' ? 7 : 31;

  return (
    <Card>
      <div className="space-y-5 p-6">
        <div className="max-w-sm">
          <Select
            label="Frequency"
            value={frequencyType}
            onChange={(event) => {
              setSaved(false);
              setFrequencyType(event.target.value);
            }}
            options={FREQUENCY_OPTIONS.map((o) => ({ value: o.value, label: o.label }))}
            helperText="How often this habit is due."
          />
        </div>

        {showWeekdays && (
          <div>
            <p className="mb-2 text-sm font-medium text-foreground">Days of the week</p>
            <div className="flex flex-wrap gap-2">
              {WEEKDAYS.map(({ index, short }) => {
                const active = weekdays.includes(index);
                return (
                  <button
                    key={index}
                    type="button"
                    aria-pressed={active}
                    onClick={() => toggleDay(index)}
                    className={`h-11 w-11 rounded-full border text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 ${
                      active
                        ? 'border-primary bg-primary text-primary-foreground'
                        : 'border-border bg-card text-muted-foreground hover:border-primary/50 hover:text-foreground'
                    }`}
                  >
                    {short}
                  </button>
                );
              })}
            </div>
            {weekdays.length === 0 && (
              <p className="mt-2 text-xs text-amber-600 dark:text-amber-400">
                No days selected yet.
              </p>
            )}
          </div>
        )}

        {showTarget && (
          <div className="max-w-[12rem]">
            <Input
              label="Target times"
              type="number"
              inputMode="numeric"
              min={1}
              max={targetMax}
              value={targetCount}
              onChange={(event) => {
                setSaved(false);
                const parsed = Number(event.target.value);
                setTargetCount(
                  Number.isFinite(parsed) && parsed > 0
                    ? Math.min(parsed, targetMax)
                    : 1
                );
              }}
              helperText={`1–${targetMax} times per ${
                frequencyType === 'WEEKLY_TARGET' ? 'week' : 'month'
              }.`}
            />
          </div>
        )}

        {error && (
          <div
            className="rounded-md bg-destructive/10 px-4 py-3 text-sm text-destructive"
            role="alert"
          >
            {error}
          </div>
        )}

        <div className="flex flex-wrap items-center gap-3">
          <Button onClick={() => void save()} isLoading={saving} disabled={!isDirty && !error}>
            Save schedule
          </Button>
          <Button
            variant="ghost"
            onClick={reset}
            disabled={!isDirty || saving}
            title="Discard changes"
          >
            <RotateCcw className="mr-1.5 h-4 w-4" aria-hidden="true" />
            Reset
          </Button>
          {saved && (
            <span className="inline-flex items-center gap-1 text-sm text-emerald-600 dark:text-emerald-400">
              <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
              Saved
            </span>
          )}
        </div>
      </div>
    </Card>
  );
}
