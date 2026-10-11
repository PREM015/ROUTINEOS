'use client';

import { useEffect, useId, useState } from 'react';
import { Loader2, AlertCircle } from 'lucide-react';
import { Button, Input, Modal, Select } from '@/components/ui';
import { fetchWithAuth } from '@/lib/api-client';
import type { HabitDefinitionCard } from '@/types/habit';
import type {
  HabitDirection,
  HabitTier,
  HabitTrackingType,
  TimeOfDay,
} from '@/constants/prisma-enums';

/**
 * Confirm adding a catalogue habit, with every value editable.
 *
 * ## The point of this screen
 *
 * The catalogue entry is a *suggestion*. This dialog is where it becomes the
 * user's own habit, and it is deliberately the last chance to change anything:
 * name, tier, tracking type, direction, target, unit, frequency and interval.
 *
 * That is what makes "the same habit with different targets" a normal flow
 * rather than a special case. Three people can each open this dialog for "Daily
 * Steps" and save 15,000, 12,000 and 30. The saved row is a personal copy that
 * the catalogue has no further say over.
 *
 * Note what is *not* editable here: nothing about the definition id, and no
 * lock-in. Once saved the habit is the user's, and the catalogue entry can be
 * deactivated without touching it.
 */

interface AddFromCatalogDialogProps {
  definition: HabitDefinitionCard | null;
  onClose: () => void;
  onAdded: (habit: { id: string; name: string }) => void;
}

const TIER_OPTIONS: Array<{ value: HabitTier; label: string }> = [
  { value: 'NON_NEGOTIABLE', label: 'Non-negotiable' },
  { value: 'GROWTH', label: 'Growth' },
  { value: 'BONUS', label: 'Bonus' },
  { value: 'LIFESTYLE', label: 'Lifestyle' },
  { value: 'OPTIONAL', label: 'Optional' },
  { value: 'FLEXIBLE', label: 'Flexible' },
  { value: 'JUST_FOR_FUN', label: 'Just for fun' },
  { value: 'EXPERIMENTAL', label: 'Experimental' },
];

const FREQUENCY_OPTIONS: Array<{
  value: string;
  label: string;
  needsInterval?: boolean;
}> = [
  { value: 'DAILY', label: 'Every day' },
  { value: 'SPECIFIC_WEEKDAYS', label: 'Specific weekdays' },
  { value: 'WEEKLY_TARGET', label: 'Times per week' },
  { value: 'MONTHLY_TARGET', label: 'Times per month' },
  { value: 'EVERY_N_DAYS', label: 'Every N days', needsInterval: true },
];

const TRACKING_OPTIONS: Array<{ value: HabitTrackingType; label: string }> = [
  { value: 'BOOLEAN', label: 'Just tick it' },
  { value: 'COUNT', label: 'Count (8 glasses, 3 problems)' },
  { value: 'DURATION', label: 'Duration (45 min, 7.5 h)' },
];

const DIRECTION_OPTIONS: Array<{ value: HabitDirection; label: string }> = [
  { value: 'BUILD', label: 'Build up to the target' },
  { value: 'LIMIT', label: 'Stay at or under the limit' },
  { value: 'AVOID', label: 'Avoid it (success = not doing it)' },
];

const TIME_OPTIONS: Array<{ value: TimeOfDay; label: string }> = [
  { value: 'MORNING', label: 'Morning' },
  { value: 'AFTERNOON', label: 'Afternoon' },
  { value: 'EVENING', label: 'Evening' },
  { value: 'NIGHT', label: 'Night' },
  { value: 'ANYTIME', label: 'Anytime' },
];

/** Suggested units per tracking type. Free text is still allowed. */
const UNIT_SUGGESTIONS: Record<HabitTrackingType, string[]> = {
  BOOLEAN: [],
  COUNT: ['steps', 'glasses', 'pages', 'problems', 'times', 'servings', 'meals'],
  DURATION: ['min', 'h'],
};

export function AddFromCatalogDialog({
  definition,
  onClose,
  onAdded,
}: AddFromCatalogDialogProps) {
  const formId = useId();

  const [name, setName] = useState('');
  const [tier, setTier] = useState<HabitTier>('GROWTH');
  const [trackingType, setTrackingType] = useState<HabitTrackingType>('BOOLEAN');
  const [direction, setDirection] = useState<HabitDirection>('BUILD');
  const [targetValue, setTargetValue] = useState('');
  const [unit, setUnit] = useState('');
  const [frequencyType, setFrequencyType] = useState('DAILY');
  const [intervalDays, setIntervalDays] = useState('');
  const [timeOfDay, setTimeOfDay] = useState<TimeOfDay | ''>('');

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  /*
   * Re-seed the form each time a different definition is opened.
   *
   * Keyed on `definition?.id` rather than mounted-once, so switching from one
   * catalogue entry straight to another does not leave the previous entry's
   * target sitting in the field. That stale-value bug is exactly what makes an
   * "add another" flow produce a duplicate habit with the wrong number.
   */
  useEffect(() => {
    if (!definition) return;

    setName(definition.name);
    setTier(definition.tier);
    setTrackingType(definition.trackingType);
    setDirection(definition.direction);
    setTargetValue(
      definition.targetValue !== null ? String(definition.targetValue) : ''
    );
    setUnit(definition.unit ?? '');
    setFrequencyType(definition.frequencyType);
    setIntervalDays(
      definition.intervalDays !== null ? String(definition.intervalDays) : ''
    );
    setTimeOfDay(definition.timeOfDay ?? '');
    setError(null);
    setFieldErrors({});
  }, [definition]);

  if (!definition) return null;

  const needsTarget =
    trackingType !== 'BOOLEAN' && direction !== 'AVOID';
  const needsInterval = frequencyType === 'EVERY_N_DAYS';

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    setFieldErrors({});

    /*
     * Same floor as the server and as `lib/habits/completion.ts`: positive and
     * finite, with small values like 30 accepted. Checked here so the button
     * does not produce a confusing 400 round trip.
     */
    if (needsTarget) {
      const parsed = Number(targetValue);
      if (targetValue.trim() === '' || !Number.isFinite(parsed) || parsed <= 0) {
        setFieldErrors({ targetValue: 'Enter a positive number' });
        setSubmitting(false);
        return;
      }
    }

    if (needsInterval) {
      const parsed = Number(intervalDays);
      if (intervalDays.trim() === '' || !Number.isInteger(parsed) || parsed < 1) {
        setFieldErrors({ intervalDays: 'Enter a whole number of days (1 or more)' });
        setSubmitting(false);
        return;
      }
    }

    try {
      const response = await fetchWithAuth('/api/habits/from-definition', {
        method: 'POST',
        body: JSON.stringify({
          definitionId: definition.id,
          overrides: {
            name: name.trim(),
            tier,
            trackingType,
            direction,
            targetValue: needsTarget ? Number(targetValue) : null,
            unit: unit.trim() || null,
            frequencyType,
            intervalDays: needsInterval ? Number(intervalDays) : null,
            timeOfDay: timeOfDay || null,
          },
        }),
      });

      const json = await response.json().catch(() => ({}));

      if (!response.ok) {
        setError(json?.error ?? 'Could not add this habit');
        if (json?.details?.fieldErrors) {
          setFieldErrors(json.details.fieldErrors as Record<string, string>);
        }
        return;
      }

      onAdded({ id: json?.data?.id, name: json?.data?.name ?? name });
    } catch {
      setError('Could not add this habit. Check your connection and try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      isOpen={definition !== null}
      onClose={submitting ? () => undefined : onClose}
      title="Add to my habits"
      footer={
        <>
          <Button
            type="button"
            variant="outline"
            onClick={onClose}
            disabled={submitting}
          >
            Cancel
          </Button>
          <Button type="submit" form={formId} disabled={submitting}>
            {submitting && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
            Add habit
          </Button>
        </>
      }
    >
      <form id={formId} onSubmit={submit} className="space-y-4">
        <p className="rounded-md bg-muted/50 p-3 text-sm text-muted-foreground">
          This is a <strong className="text-foreground">suggestion</strong>. Change
          anything below before saving — it becomes your habit, and the catalogue
          will not change it later.
        </p>

        {error && (
          <div
            role="alert"
            className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive"
          >
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <Input
          label="Name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
          maxLength={100}
        />

        <div className="grid gap-4 sm:grid-cols-2">
          <Select
            label="Tier"
            value={tier}
            onChange={(e) => setTier(e.target.value as HabitTier)}
            options={TIER_OPTIONS}
          />
          <Select
            label="Time of day"
            value={timeOfDay}
            onChange={(e) => setTimeOfDay(e.target.value as TimeOfDay | '')}
            options={TIME_OPTIONS}
            placeholder="Not set"
          />
        </div>

        <Select
          label="How is it tracked?"
          value={trackingType}
          onChange={(e) => {
            const next = e.target.value as HabitTrackingType;
            setTrackingType(next);
            // Switching to a numeric type with no unit leaves "45" meaning
            // nothing, so seed the obvious one rather than leaving it blank.
            if (next === 'DURATION' && !unit) setUnit('min');
          }}
          options={TRACKING_OPTIONS}
        />

        {trackingType !== 'BOOLEAN' && (
          <>
            <Select
              label="Direction"
              value={direction}
              onChange={(e) => setDirection(e.target.value as HabitDirection)}
              options={DIRECTION_OPTIONS}
              helperText={
                direction === 'AVOID'
                  ? 'You complete this by not doing it. No target needed.'
                  : undefined
              }
            />

            {!needsTarget && (
              <p className="rounded-md border border-emerald-500/30 bg-emerald-500/5 p-3 text-sm text-emerald-700 dark:text-emerald-400">
                This is an <strong>avoid</strong> habit: a day counts as complete
                when nothing is recorded, and a recorded number counts against you.
              </p>
            )}

            {needsTarget && (
              <div className="grid gap-4 sm:grid-cols-2">
                <Input
                  label={direction === 'LIMIT' ? 'Limit' : 'Target'}
                  type="number"
                  inputMode="decimal"
                  step="any"
                  min="0"
                  value={targetValue}
                  onChange={(e) => setTargetValue(e.target.value)}
                  error={fieldErrors.targetValue}
                  helperText={
                    direction === 'LIMIT'
                      ? 'Counts as complete at or below this.'
                      : 'Counts as complete at or above this.'
                  }
                  required
                />
                <Input
                  label="Unit"
                  value={unit}
                  onChange={(e) => setUnit(e.target.value)}
                  placeholder="steps"
                  maxLength={16}
                  list={`${formId}-units`}
                />
                <datalist id={`${formId}-units`}>
                  {UNIT_SUGGESTIONS[trackingType].map((u) => (
                    <option key={u} value={u} />
                  ))}
                </datalist>
              </div>
            )}
          </>
        )}

        <div className="grid gap-4 sm:grid-cols-2">
          <Select
            label="How often?"
            value={frequencyType}
            onChange={(e) => setFrequencyType(e.target.value)}
            options={FREQUENCY_OPTIONS.map((o) => ({
              value: o.value,
              label: o.label,
            }))}
          />
          {needsInterval && (
            <Input
              label="Every how many days?"
              type="number"
              inputMode="numeric"
              min="1"
              value={intervalDays}
              onChange={(e) => setIntervalDays(e.target.value)}
              error={fieldErrors.intervalDays}
              helperText="Dentist ~180, toothbrush ~90, haircut ~21."
              required
            />
          )}
        </div>

        <p className="text-xs text-muted-foreground">
          Days this habit is not scheduled for are never counted as missed.
        </p>
      </form>
    </Modal>
  );
}