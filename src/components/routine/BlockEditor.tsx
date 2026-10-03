'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import { Drawer } from '@/components/ui/Drawer';
import { Button, Input, Select, Switch, Textarea, ColorPicker } from '@/components/ui';
import { apiRequest, ApiError, apiErrorMessage } from '@/lib/api-client';
import { calculateBlockDuration, isOvernightBlock } from '@/lib/routine/duration';
import { conflictsAgainst, overlapMinutes } from '@/lib/routine/conflicts';
import { minutesToTime, timeToMinutesExact } from '@/lib/routine/conflicts';
import { cn } from '@/lib/utils';
import type { Category } from '@/generated/prisma';
import type { ResolvedRoutineBlock, DayTypeDefinition } from '@/types/routine';

/**
 * One editor for create and edit.
 *
 * ## Why they are the same component
 *
 * They were two modals that had already drifted: the create path accepted a
 * category and dropped it, the edit path had no category field at all, and only
 * the edit path could clear the energy level. One component means a field added
 * here appears in both modes.
 *
 * ## Frame, not modal
 *
 * `Drawer side="right"` on desktop and `side="bottom"` below `sm`. The shared
 * `Drawer` is a Radix `Dialog`, so focus trapping, Escape-to-close and focus
 * restoration on the trigger are all handled rather than reimplemented. The form
 * is a real `<form>` so Enter submits and the pinned footer button submits by
 * `form=` attribute.
 */
const FORM_ID = 'routine-block-form';

const ENERGY_OPTIONS = [
  { value: '', label: 'Not set' },
  { value: 'HIGH', label: 'High energy' },
  { value: 'MEDIUM', label: 'Medium energy' },
  { value: 'LOW', label: 'Low energy' },
];

export interface BlockEditorProps {
  open: boolean;
  mode: 'create' | 'edit';
  block: ResolvedRoutineBlock | null;
  /** Sibling blocks in the target template, for live conflict feedback. */
  siblings: ResolvedRoutineBlock[];
  /**
   * Which day type `siblings` belongs to — a `DayTypeDefinition` id, or `null`
   * when they came from a schedule with no definition row (the natural weekday
   * rule).
   *
   * Required, not optional, and that is the point: the overlap preview is only
   * valid when the form targets *this* schedule. Making it required means a new
   * call site cannot silently reintroduce the bug where a `Placement` block was
   * compared against `College`'s blocks.
   */
  siblingsDayTypeId: string | null;
  dayTypes: DayTypeDefinition[];
  defaultDayTypeId: string | null;
  defaultDayTypeValue: string | null;
  /** Pre-filled times, from a gap row or a `?` deep link. */
  initialStart?: string;
  initialEnd?: string;
  /**
   * The date the editor is being opened against, `YYYY-MM-DD`.
   *
   * Sent on every write so the service can enforce the retroactive edit window
   * (F6) — the page already disables this drawer for a closed date, and this is
   * what makes the server agree. Omitted by any caller that has no date in play.
   */
  date?: string;
  onClose: () => void;
  onSaved: (message: string) => void;
}

interface FormState {
  title: string;
  startTime: string;
  endTime: string;
  description: string;
  notes: string;
  categoryId: string;
  energyLevel: '' | 'HIGH' | 'MEDIUM' | 'LOW';
  color: string;
  icon: string;
  trackCompletion: boolean;
  dayTypeId: string;
}

const EMPTY: FormState = {
  title: '',
  startTime: '09:00',
  endTime: '10:00',
  description: '',
  notes: '',
  categoryId: '',
  energyLevel: '',
  color: '#64748b',
  icon: '',
  trackCompletion: true,
  dayTypeId: '',
};

export function BlockEditor(props: BlockEditorProps) {
  const {
    open,
    mode,
    block,
    siblings,
  siblingsDayTypeId,
    dayTypes,
    defaultDayTypeId,
    defaultDayTypeValue,
    initialStart,
    initialEnd,
    date,
    onClose,
    onSaved,
  } = props;

  const [form, setForm] = useState<FormState>(EMPTY);
  const [categories, setCategories] = useState<Category[]>([]);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  /**
   * Seed the form whenever the editor opens, so create never inherits the last
   * edited block's times.
   */
  useEffect(() => {
    if (!open) return;
    setErrors({});
    setSubmitError(null);

    if (mode === 'edit' && block) {
      setForm({
        title: block.title,
        startTime: block.startTime,
        endTime: block.endTime,
        description: block.description ?? '',
        notes: block.notes ?? '',
        categoryId: block.categoryId ?? '',
        energyLevel:
          block.energyLevel === 'HIGH' || block.energyLevel === 'MEDIUM' || block.energyLevel === 'LOW'
            ? block.energyLevel
            : '',
        color: block.color ?? '#64748b',
        icon: block.icon ?? '',
        trackCompletion: block.trackCompletion,
        dayTypeId: '',
      });
      return;
    }

    setForm({
      ...EMPTY,
      startTime: initialStart ?? EMPTY.startTime,
      endTime: initialEnd ?? EMPTY.endTime,
      dayTypeId: defaultDayTypeId ?? '',
      color: '',
    });
  }, [open, mode, block, initialStart, initialEnd, defaultDayTypeId]);

  // Real categories, fetched once per open. The previous modal had a hard-coded
  // list of nine category *names* typed into the component, so a category the
  // user had renamed or deleted silently stopped being selectable and one they
  // had created was not offered at all.
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    void (async () => {
      try {
        const result = await apiRequest<Category[]>('/api/categories');
        if (!cancelled) setCategories(Array.isArray(result) ? result : []);
      } catch (error) {
        if (!cancelled) console.error('Failed to load categories:', error);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open]);

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((current) => ({ ...current, [key]: value }));

  const overnight = useMemo(
    () => isOvernightBlock(form.startTime, form.endTime),
    [form.startTime, form.endTime]
  );

  const duration = useMemo(() => {
    try {
      return calculateBlockDuration(form.startTime, form.endTime);
    } catch {
      return 0;
    }
  }, [form.startTime, form.endTime]);

  /**
   * Live conflict feedback.
   *
   * Uses the same `conflictsAgainst` the server does, so the warning a user
   * sees while typing is the warning the server would return — not a second
   * client-side implementation that can disagree. The block itself is excluded
   * by id, so editing a block within its own window is silent.
   */
  /*
   * The live overlap preview.
   *
   * ## Why this is scoped to the day type the siblings actually belong to
   *
   * `siblings` is the block list of **one** schedule — the one resolved for the
   * date being viewed. The editor's day-type dropdown can point somewhere else
   * entirely, and before this guard it compared a new `Placement` block against
   * `College`'s blocks and reported a clash that did not exist. Worse than no
   * preview: the user was told their change was wrong, for a schedule it had
   * nothing to do with.
   *
   * So the check only runs when the form's target *is* the schedule the siblings
   * came from. Otherwise the preview stands down and says so, rather than
   * inventing an answer from the wrong data. The server still performs the real
   * check against the correct template on save and returns accurate warnings —
   * the preview is a convenience, not the enforcement point.
   *
   * Uses the same `conflictsAgainst` the server does, so when it *is* in scope
   * the warning matches what the server would return — not a second client-side
   * implementation that can disagree. The block itself is excluded by id, so
   * editing a block within its own window is silent.
   */
  const targetDayTypeId = form.dayTypeId || defaultDayTypeId || null;
  const siblingsAreInScope = targetDayTypeId !== null && targetDayTypeId === siblingsDayTypeId;

  const conflicts = useMemo(() => {
    if (!siblingsAreInScope) return [];
    try {
      timeToMinutesExact(form.startTime);
      timeToMinutesExact(form.endTime);
    } catch {
      return [];
    }
    if (!form.startTime || !form.endTime) return [];

    return conflictsAgainst(
      {
        id: block?.id,
        title: form.title || 'this block',
        startTime: form.startTime,
        endTime: form.endTime,
      },
      siblings
    );
  }, [form.startTime, form.endTime, form.title, siblings, block?.id, siblingsAreInScope]);

  /** The first clashing block's end, for "shift to start after it". */
  const shiftSuggestion = useMemo(() => {
    const first = conflicts[0];
    if (!first) return null;
    try {
      return minutesToTime(timeToMinutesExact(first.endTime));
    } catch {
      return null;
    }
  }, [conflicts]);

  const validate = useCallback((): boolean => {
    const next: Record<string, string> = {};
    if (!form.title.trim()) next.title = 'Give the block a title';
    try {
      timeToMinutesExact(form.startTime);
    } catch {
      next.startTime = 'Start must be HH:mm';
    }
    try {
      timeToMinutesExact(form.endTime);
    } catch {
      next.endTime = 'End must be HH:mm';
    }
    if (duration <= 0) next.endTime = 'End must be after the start (or the next day)';
    setErrors(next);
    return Object.keys(next).length === 0;
  }, [form.title, form.startTime, form.endTime, duration]);

  const submit = useCallback(
    async (event: React.FormEvent) => {
      event.preventDefault();
      if (submitting) return;
      if (!validate()) return;

      setSubmitting(true);
      setSubmitError(null);

      const payload: Record<string, unknown> = {
        title: form.title.trim(),
        startTime: form.startTime,
        endTime: form.endTime,
        description: form.description.trim() || null,
        notes: form.notes.trim() || null,
        color: form.color || null,
        icon: form.icon || null,
        trackCompletion: form.trackCompletion,
        // `null` clears the column. Sending `undefined` would be dropped by
        // `JSON.stringify` and leave the old level in place.
        energyLevel: form.energyLevel === '' ? null : form.energyLevel,
        categoryId: form.categoryId || null,
        // F6: not a column. Carried so the service can assert the retroactive
        // edit window against the date this edit is happening in.
        date: date ?? null,
      };

      try {
        if (mode === 'edit' && block) {
          const result = await apiRequest<{ warnings?: Array<{ message: string }> }>(
            '/api/routine',
            { method: 'PUT', body: { id: block.id, ...payload } }
          );
          const warnings = result?.warnings ?? [];
          onSaved(
            warnings.length > 0
              ? `Saved. ${warnings[0]?.message ?? 'It overlaps another block.'}`
              : 'Block saved'
          );
        } else {
          const result = await apiRequest<{ warnings?: Array<{ message: string }> }>(
            '/api/routine',
            {
              method: 'POST',
              body: {
                ...payload,
                dayTypeId: form.dayTypeId || defaultDayTypeId || undefined,
                dayType: form.dayTypeId || defaultDayTypeId ? undefined : defaultDayTypeValue ?? undefined,
              },
            }
          );
          const warnings = result?.warnings ?? [];
          onSaved(
            warnings.length > 0
              ? `Block added. ${warnings[0]?.message ?? 'It overlaps another block.'}`
              : 'Block added'
          );
        }
        onClose();
      } catch (error) {
        setSubmitError(
          error instanceof ApiError
            ? apiErrorMessage({ error: error.message }, 'Could not save this block')
            : 'Could not save this block'
        );
      } finally {
        setSubmitting(false);
      }
    },
    [
      submitting,
      validate,
      form,
      mode,
      block,
      defaultDayTypeId,
      defaultDayTypeValue,
      onSaved,
      onClose,
      /*
        `date` is sent in the payload as the F6 retroactive edit window anchor
        (line 310) but was missing here. The callback therefore captured the date
        the editor was built with, so navigating to another day and saving would
        have the server validate the window against the OLD date.
      */
      date,
    ]
  );

  const shiftAfter = () => {
    if (!shiftSuggestion) return;
    set('startTime', shiftSuggestion);
    set('endTime', shiftSuggestion);
    if (duration > 0) {
      const end = timeToMinutesExact(shiftSuggestion) + duration;
      set('endTime', minutesToTime(end) ?? form.endTime);
    }
  };

  return (
    <Drawer
      open={open}
      onOpenChange={(next) => !next && onClose()}
      side="bottom"
      className="sm:inset-y-0 sm:left-auto sm:right-0 sm:top-0 sm:h-full sm:max-w-md sm:rounded-none sm:rounded-l-xl"
      title={mode === 'edit' ? 'Edit block' : 'New block'}
      description={
        mode === 'edit'
          ? undefined
          : 'Times are stored in your own timezone, 24 hours a day.'
      }
    >
      <form id={FORM_ID} onSubmit={submit} className="space-y-4 pb-6">
        <Input
          label="Title"
          value={form.title}
          onChange={(event) => set('title', event.target.value)}
          placeholder="e.g. Deep work"
          error={errors.title}
          required
          autoFocus
        />

        <div className="grid grid-cols-2 gap-3">
          <Input
            label="Start"
            type="time"
            value={form.startTime}
            onChange={(event) => set('startTime', event.target.value)}
            error={errors.startTime}
            required
          />
          <Input
            label="End"
            type="time"
            value={form.endTime}
            onChange={(event) => set('endTime', event.target.value)}
            error={errors.endTime}
            required
          />
        </div>

        {/* Live duration and overnight state, so the effect of the times above
            is visible before saving rather than after. */}
        <p
          className={cn(
            'flex items-center gap-1.5 text-xs',
            overnight ? 'text-primary' : 'text-muted-foreground'
          )}
        >
          <span className="font-mono tabular-nums">{formatDurationSafe(duration)}</span>
          {overnight && <span>· runs past midnight, ends next day</span>}
        </p>

        {/*
          Overlaps are allowed — the write succeeds either way — so this is a
          warning with an offer, not a validation error. Blocking here would be
          worse than useless for someone deliberately stacking two activities.
        */}
        {conflicts.length > 0 && firstConflictMessage(conflicts, form.startTime, form.endTime) && (
          <div
            role="status"
            className="flex items-start gap-2 rounded-lg border border-warning/30 bg-warning/10 p-3 text-xs"
          >
            <AlertTriangle size={14} className="mt-0.5 shrink-0 text-warning" aria-hidden="true" />
            <div className="min-w-0">
              <p className="font-medium text-foreground">
                {firstConflictMessage(conflicts, form.startTime, form.endTime)}
              </p>
              {shiftSuggestion && shiftSuggestion !== form.startTime && (
                <button
                  type="button"
                  onClick={shiftAfter}
                  className="mt-1 underline underline-offset-2 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  Shift to start after it
                </button>
              )}
            </div>
          </div>
        )}

        {/*
          When the target is a *different* schedule from the one loaded, say so.

          Silence here would be its own lie: the user has been told nothing is
          wrong, and the absence of a warning reads as "this is fine" rather than
          as "I have not checked". One muted line states that the check will
          happen against the right schedule on save, which is the truth — the
          service resolves the template from the submitted day type and returns
          accurate warnings.
        */}
        {mode !== 'edit' && !siblingsAreInScope && targetDayTypeId !== null && (
          <p className="text-[11px] leading-relaxed text-muted-foreground/80">
            Overlaps will be checked against this day type when you save. The live
            preview is only available for the schedule currently loaded.
          </p>
        )}

        {mode === 'create' && dayTypes.length > 0 && (
          <Select
            label="Day type"
            value={form.dayTypeId}
            onChange={(event) => set('dayTypeId', event.target.value)}
            options={[
              { value: '', label: 'Current day type' },
              ...dayTypes.map((dayType) => ({
                value: dayType.id,
                label: dayType.name,
              })),
            ]}
          />
        )}

        <Select
          label="Category"
          value={form.categoryId}
          onChange={(event) => set('categoryId', event.target.value)}
          options={[
            { value: '', label: 'No category' },
            ...categories.map((category) => ({ value: category.id, label: category.name })),
          ]}
          helperText={
            categories.length === 0 ? 'No categories yet — create one from the Categories page.' : undefined
          }
        />

        <div className="grid grid-cols-2 gap-3">
          <Select
            label="Energy"
            value={form.energyLevel}
            onChange={(event) =>
              set('energyLevel', event.target.value as FormState['energyLevel'])
            }
            options={ENERGY_OPTIONS}
          />
          <div className="flex items-end pb-1.5">
            <Switch
              checked={form.trackCompletion}
              onChange={(checked) => set('trackCompletion', checked)}
              label="Track completion"
            />
          </div>
        </div>

        <ColorPicker label="Colour" value={form.color || '#64748b'} onChange={(color) => set('color', color)} />

        <Input
          label="Icon"
          value={form.icon}
          onChange={(event) => set('icon', event.target.value)}
          placeholder="🌚 or any emoji"
          helperText="An emoji. Shown before the block title."
        />

        <Textarea
          label="Description"
          value={form.description}
          onChange={(event) => set('description', event.target.value)}
          placeholder="What is this block for?"
          rows={2}
        />

        <Textarea
          label="Notes"
          value={form.notes}
          onChange={(event) => set('notes', event.target.value)}
          placeholder="Anything you want to remember about this block"
          rows={2}
        />

        {/* One error region, rendered once. The old modal attached the same
            message to the title field's `error` prop *and* printed it below the
            form, so a failed save announced the failure twice. */}
        {submitError && (
          <p role="alert" className="text-sm text-destructive">
            {submitError}
          </p>
        )}

        {/* Safe-area padding so the pinned footer clears the iOS home indicator
            when the keyboard is open. */}
        <div
          className="sticky bottom-0 -mx-5 mt-2 flex items-center justify-end gap-2 border-t border-border bg-card px-5 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3"
        >
          <Button type="button" variant="ghost" onClick={onClose} disabled={submitting}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" isLoading={submitting}>
            {mode === 'edit' ? 'Save block' : 'Add block'}
          </Button>
        </div>
      </form>
    </Drawer>
  );
}

function formatDurationSafe(minutes: number): string {
  if (!Number.isFinite(minutes) || minutes <= 0) return '—';
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  if (hours === 0) return `${mins}m`;
  if (mins === 0) return `${hours}h`;
  return `${hours}h ${mins}m`;
}

function firstConflictMessage(
  conflicts: ResolvedRoutineBlock[],
  startTime: string,
  endTime: string
): string | null {
  const first = conflicts[0];
  if (!first) return null;
  let shared = 0;
  try {
    shared = overlapMinutes(
      { startTime, endTime },
      { startTime: first.startTime, endTime: first.endTime }
    );
  } catch {
    shared = 0;
  }
  return `Overlaps "${first.title}" (${first.startTime}-${first.endTime}) by ${shared} min.`;
}