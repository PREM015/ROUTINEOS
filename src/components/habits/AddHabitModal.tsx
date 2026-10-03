'use client';

import React, { useState, useEffect, useId } from 'react';
import { Modal, Input, Select, Button, Checkbox } from '@/components/ui';
import { useApp, type HabitTier, type FrequencyType } from '@/context/AppContext';
import { useUserTimezone } from '@/hooks/useUserTimezone';
import type { DayTypeDefinition } from '@/types/routine';
import { fetchWithAuth } from '@/lib/api-client';
import { TagPicker } from './TagPicker';


interface AddHabitModalProps {
  open: boolean;
  onClose: () => void;
  /**
   * Called after a habit is successfully persisted, never on cancel or failure.
   *
   * `/habits` uses it to refetch the 28-day health strip: a brand new habit has
   * no logs, so it must appear as `NO_DATA` rather than keep whatever the
   * previous habit's row said until the next full page load.
   */
  onSaved?: () => void;
}

const TIERS: Array<{ label: string; value: HabitTier }> = [
  { label: 'Core (Non-Negotiable)', value: 'NON_NEGOTIABLE' },
  { label: 'Growth', value: 'GROWTH' },
  { label: 'Bonus', value: 'BONUS' },
  { label: 'Lifestyle', value: 'LIFESTYLE' },
  { label: 'Flexible', value: 'FLEXIBLE' },
  { label: 'Experimental', value: 'EXPERIMENTAL' },
];

const FREQUENCIES: Array<{ label: string; value: FrequencyType }> = [
  { label: 'Everyday', value: 'DAILY' },
  { label: 'Specific weekdays', value: 'SPECIFIC_WEEKDAYS' },
  { label: 'Weekly target', value: 'WEEKLY_TARGET' },
  { label: 'Monthly target', value: 'MONTHLY_TARGET' },
];

const WEEKDAYS = [
  { label: 'Sun', value: '0' },
  { label: 'Mon', value: '1' },
  { label: 'Tue', value: '2' },
  { label: 'Wed', value: '3' },
  { label: 'Thu', value: '4' },
  { label: 'Fri', value: '5' },
  { label: 'Sat', value: '6' },
];

const PRESET_COLORS = [
  '#10b981',
  '#3b82f6',
  '#f59e0b',
  '#ef4444',
  '#8b5cf6',
  '#ec4899',
  '#14b8a6',
  '#6366f1',
  '#0ea5e9',
  '#a855f7',
  '#22c55e',
  '#f97316',
];

const HEX_PATTERN = /^#[0-9a-fA-F]{6}$/;

export default function AddHabitModal({ open, onClose, onSaved }: AddHabitModalProps) {
  const { addHabit } = useApp();
  const { today: userToday } = useUserTimezone();
  const formId = useId();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [tier, setTier] = useState<HabitTier>('GROWTH');
  const [frequencyType, setFrequencyType] = useState<FrequencyType>('DAILY');
  const [weekdays, setWeekdays] = useState<string[]>(['1', '2', '3', '4', '5']);
  const [targetCount, setTargetCount] = useState('');
  const [color, setColor] = useState<string>(PRESET_COLORS[0] as string);
  const [colorInput, setColorInput] = useState<string>(PRESET_COLORS[0] as string);
  const [colorError, setColorError] = useState<string | null>(null);
  const [reminderTime, setReminderTime] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [appliesEveryDay, setAppliesEveryDay] = useState(true);
  const [dayTypeIds, setDayTypeIds] = useState<string[]>([]);
  const [tagIds, setTagIds] = useState<string[]>([]);
  const [dayTypes, setDayTypes] = useState<DayTypeDefinition[]>([]);
  const [dayTypesLoading, setDayTypesLoading] = useState(true);
  const [dayTypesError, setDayTypesError] = useState<string | null>(null);

  const loadDayTypes = async () => {
    try {
      setDayTypesLoading(true);
      setDayTypesError(null);
      const res = await fetchWithAuth('/api/day-types?active=true');
      if (!res.ok) {
        throw new Error(`Could not load day types (status ${res.status})`);
      }
      const json = await res.json();
      const data: DayTypeDefinition[] = json.data || [];
      setDayTypes(data.filter((dt: DayTypeDefinition) => !dt.isArchived));
    } catch (error) {
      // Reported rather than swallowed. This previously reached only
      // `console.error`, so a failed request rendered the picker as an empty
      // list reading "No day types available" — indistinguishable from a user
      // who has created none. Selecting "specific day types" then left
      // `dayTypeIds` empty and the save was rejected with no explanation of why.
      setDayTypesError(
        error instanceof Error ? error.message : 'Could not load day types'
      );
    } finally {
      setDayTypesLoading(false);
    }
  };

  // Declared before the effect that calls it: reading a `const` from above its
  // declaration worked, but the reference could not update if it ever changed,
  // and the linter is right to flag it.
  useEffect(() => {
    if (open) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- mount data fetch
      void loadDayTypes();
    }
  }, [open]);

  const reset = () => {
    setName('');
    setDescription('');
    setTier('GROWTH');
    setFrequencyType('DAILY');
    setWeekdays(['1', '2', '3', '4', '5']);
    setTargetCount('');
    setColor(PRESET_COLORS[0] as string);
    setColorInput(PRESET_COLORS[0] as string);
    setColorError(null);
    setReminderTime('');
    setError(null);
    setSubmitting(false);
    setAppliesEveryDay(true);
    setDayTypeIds([]);
    setTagIds([]);
  };

  /**
   * Commit a typed colour only when it is a complete, valid 6-digit hex.
   *
   * Typing `#FF5` is a legitimate intermediate state, so an invalid partial
   * value is reported but never written — otherwise the row would flicker
   * through whatever the browser could parse, and a mistake would be saved
   * instead of surfaced. `createHabitSchema` only accepts `/^#[0-9A-F]{6}$/i`
   * (`src/schemas/habit.schema.ts:26`), so the field is validated against the
   * same rule rather than a looser local approximation.
   */
  const commitColor = (raw: string) => {
    const candidate = raw.trim().startsWith('#') ? raw.trim() : `#${raw.trim()}`;
    if (!HEX_PATTERN.test(candidate)) {
      setColorError('Enter a 6-digit hex colour, for example #FF5733.');
      return;
    }
    setColorError(null);
    const normalised = candidate.toLowerCase();
    setColor(normalised);
    setColorInput(normalised);
  };

  const pickPreset = (value: string) => {
    setColor(value);
    setColorInput(value);
    setColorError(null);
  };

  const toggleWeekday = (value: string) => {
    setWeekdays((prev) =>
      prev.includes(value) ? prev.filter((d) => d !== value) : [...prev, value]
    );
  };

  const toggleDayType = (dayTypeId: string) => {
    setDayTypeIds(prev => 
      prev.includes(dayTypeId) ? prev.filter(d => d !== dayTypeId) : [...prev, dayTypeId]
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || submitting) return;
    setSubmitting(true);
    setError(null);

    try {
      const parsedTarget = targetCount.trim() ? parseInt(targetCount.trim(), 10) : undefined;
      if (targetCount.trim() && (!parsedTarget || parsedTarget < 1)) {
        throw new Error('Target count must be a positive number');
      }
      if (frequencyType === 'SPECIFIC_WEEKDAYS' && weekdays.length === 0) {
        throw new Error('Pick at least one weekday');
      }
      if (reminderTime && !/^([01]\d|2[0-3]):([0-5]\d)$/.test(reminderTime)) {
        throw new Error('Reminder time must be HH:mm');
      }
      if (!HEX_PATTERN.test(color)) {
        throw new Error('Colour must be a 6-digit hex value, for example #FF5733.');
      }
      if (!appliesEveryDay && dayTypeIds.length === 0) {
        // Name the cause: with a failed day-type load the picker is empty, so
        // "Pick at least one day type" is unachievable and unexplained.
        throw new Error(
          dayTypesError
            ? `Could not load day types, so none can be selected. ${dayTypesError}`
            : 'Pick at least one day type'
        );
      }

      await addHabit({
        name: name.trim(),
        description: description.trim() || undefined,
        tier,
        status: 'ACTIVE',
        color,
        frequencyType,
        frequencyValue:
          frequencyType === 'SPECIFIC_WEEKDAYS'
            ? [...weekdays].sort().join(',')
            : frequencyType === 'WEEKLY_TARGET' || frequencyType === 'MONTHLY_TARGET'
              ? String(parsedTarget ?? 1)
              : undefined,
        targetCount: parsedTarget,
        startDate: userToday,
        reminderTime: reminderTime || undefined,
        reminderEnabled: Boolean(reminderTime),
        appliesEveryDay,
        dayTypeIds: appliesEveryDay ? [] : dayTypeIds,
        tagIds,
      });

      reset();
      onSaved?.();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create habit');
      setSubmitting(false);
    }
  };

  const close = () => {
    if (!submitting) {
      reset();
      onClose();
    }
  };

  return (
    <Modal
      isOpen={open}
      onClose={close}
      title="Add New Habit"
      footer={
        <>
          <Button type="button" variant="ghost" onClick={close} disabled={submitting}>
            Cancel
          </Button>
          <Button type="submit" form={formId} variant="primary" disabled={!name.trim() || submitting}>
            {submitting ? 'Adding…' : 'Add Habit'}
          </Button>
        </>
      }
    >
      <form id={formId} onSubmit={handleSubmit} className="space-y-4 sm:space-y-5">
        <Input
          label="Habit Name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Morning Workout"
          required
          autoFocus
        />

        <div>
          <label htmlFor="habit-desc" className="block text-sm font-medium mb-1 text-foreground">Description (optional)</label>
          <textarea
            id="habit-desc"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Why does this habit matter?"
            rows={2}
            maxLength={500}
            className="w-full p-2.5 rounded-lg bg-muted/50 border border-border text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-all"
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Select
            label="Tier"
            value={tier}
            onChange={(e) => setTier(e.target.value as HabitTier)}
            options={TIERS}
          />
          <Select
            label="Frequency"
            value={frequencyType}
            onChange={(e) => setFrequencyType(e.target.value as FrequencyType)}
            options={FREQUENCIES}
          />
        </div>

        {frequencyType === 'SPECIFIC_WEEKDAYS' && (
          <div>
            <span className="block text-sm font-medium mb-2 text-foreground">Weekdays</span>
            <div className="flex flex-wrap gap-2">
              {WEEKDAYS.map((d) => (
                <button
                  key={d.value}
                  type="button"
                  onClick={() => toggleWeekday(d.value)}
                  aria-pressed={weekdays.includes(d.value)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition ${
                    weekdays.includes(d.value)
                      ? 'bg-emerald-500/20 border-emerald-500/40 text-emerald-600 dark:text-emerald-300'
                      : 'bg-muted/50 border-border text-muted-foreground hover:text-foreground'
                  }`}
                >
                  {d.label}
                </button>
              ))}
            </div>
          </div>
        )}

        {(frequencyType === 'WEEKLY_TARGET' || frequencyType === 'MONTHLY_TARGET') && (
          <Input
            label={frequencyType === 'WEEKLY_TARGET' ? 'Times per week' : 'Times per month'}
            type="number"
            min={1}
            value={targetCount}
            onChange={(e) => setTargetCount(e.target.value)}
            placeholder="e.g. 4"
          />
        )}

        {/* Day Type Assignment */}
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <Checkbox
              checked={appliesEveryDay}
              onCheckedChange={setAppliesEveryDay}
              label="Applies every day (global habit)"
            />
          </div>
          {!appliesEveryDay && (
            <div className="space-y-2">
              <label className="block text-sm font-medium text-foreground">
                Assign to day types
              </label>
              {dayTypesLoading ? (
                <div className="flex gap-2">
                  {Array.from({ length: 3 }).map((_, i) => (
                    <div key={i} className="h-10 w-24 animate-pulse bg-muted rounded-lg" />
                  ))}
                </div>
              ) : dayTypesError ? (
                <div>
                  <p role="alert" className="text-xs text-destructive">
                    {dayTypesError}
                  </p>
                  <button
                    type="button"
                    onClick={() => void loadDayTypes()}
                    className="mt-1 text-xs font-semibold text-primary hover:underline"
                  >
                    Try again
                  </button>
                </div>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {dayTypes.map(dt => (
                    <button
                      key={dt.id}
                      type="button"
                      onClick={() => toggleDayType(dt.id)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition ${
                        dayTypeIds.includes(dt.id)
                          ? `bg-emerald-500/20 border-emerald-500/40 text-emerald-600 dark:text-emerald-300`
                          : 'bg-muted/50 border-border text-muted-foreground hover:text-foreground'
                      }`}
                      style={dt.color ? { borderColor: dt.color } : undefined}
                    >
                      {dt.icon && <span style={{ color: dt.color ?? undefined }} className="mr-1">{dt.icon}</span>}
                      {dt.name}
                    </button>
                  ))}
                </div>
              )}
              {!dayTypesLoading && !dayTypesError && dayTypes.length === 0 && (
                <p className="text-xs text-muted-foreground">No day types available. Create one in Routine settings.</p>
              )}
            </div>
          )}
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {/*
            Colour. The six hard-coded swatches were the whole palette, so a user
            who wanted #A020F0 had no way to express it and the stored colour was
            always one of six arbitrary values. Presets stay as the fast path,
            with a free-form hex field and a native picker beside them.
          */}
          <div className="min-w-0">
            <span className="mb-2 block text-sm font-medium text-foreground">Colour</span>

            <div className="flex flex-wrap gap-2">
              {PRESET_COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => pickPreset(c)}
                  aria-label={`Colour ${c}`}
                  aria-pressed={color === c}
                  className="h-7 w-7 shrink-0 rounded-full transition-transform hover:scale-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                  style={{
                    backgroundColor: c,
                    // A ring rather than a border swap, so the selected swatch
                    // stays distinguishable against a dark swatch.
                    boxShadow:
                      color === c
                        ? `0 0 0 2px var(--color-background), 0 0 0 4px ${c}`
                        : undefined,
                  }}
                />
              ))}
            </div>

            <div className="mt-3 flex items-center gap-2">
              <label className="sr-only" htmlFor={`${formId}-color-native`}>
                Pick a custom colour
              </label>
              <input
                id={`${formId}-color-native`}
                type="color"
                value={color}
                onChange={(e) => pickPreset(e.target.value.toLowerCase())}
                className="h-9 w-9 shrink-0 cursor-pointer rounded-lg border border-border bg-background p-1"
              />
              <label className="sr-only" htmlFor={`${formId}-color-hex`}>
                Hex colour value
              </label>
              <input
                id={`${formId}-color-hex`}
                value={colorInput}
                onChange={(e) => {
                  setColorInput(e.target.value);
                  const trimmed = e.target.value.trim();
                  const candidate = trimmed.startsWith('#') ? trimmed : `#${trimmed}`;
                  if (HEX_PATTERN.test(candidate)) {
                    setColorError(null);
                    setColor(candidate.toLowerCase());
                  } else {
                    setColorError('Enter a 6-digit hex colour, for example #FF5733.');
                  }
                }}
                onBlur={() => commitColor(colorInput)}
                placeholder="#FF5733"
                spellCheck={false}
                autoComplete="off"
                inputMode="text"
                aria-invalid={colorError ? true : undefined}
                aria-describedby={colorError ? `${formId}-color-error` : undefined}
                className={`h-9 min-w-0 flex-1 rounded-lg border bg-background px-2.5 font-mono text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary ${
                  colorError ? 'border-destructive' : 'border-border'
                }`}
              />
            </div>

            {colorError && (
              <p
                id={`${formId}-color-error`}
                role="alert"
                className="mt-1.5 text-xs text-destructive"
              >
                {colorError}
              </p>
            )}

            {/* Live preview — the point of a colour picker is seeing the result. */}
            <div className="mt-3 flex items-center gap-2.5 rounded-lg bg-muted/50 px-3 py-2">
              <span
                aria-hidden="true"
                className="h-4 w-4 shrink-0 rounded-full ring-1 ring-black/10 dark:ring-white/20"
                style={{ backgroundColor: color }}
              />
              <span className="min-w-0 truncate text-xs text-muted-foreground">
                <span className="font-medium text-foreground">{name.trim() || 'New habit'}</span>
                {' · '}
                {color}
              </span>
            </div>
          </div>
          <Input
            label="Reminder (optional)"
            type="time"
            value={reminderTime}
            onChange={(e) => setReminderTime(e.target.value)}
          />
        </div>

        <TagPicker value={tagIds} onChange={setTagIds} />

        {error && (
          <p role="alert" className="text-sm text-destructive">{error}</p>
        )}
      </form>

      {/*
        The actions live in `Modal`'s `footer`, not at the bottom of the form.
        The body is the only scrolling region, so buttons placed after a long
        form sit below the fold on a phone — the user scrolls a form to reach
        the button that submits it. `form=` points the submit button back at the
        form across the portal boundary. Every other `Modal` in the app has this
        problem; this one is fixed.
      */}
    </Modal>
  );
}
