'use client';

import { useEffect, useMemo, useState } from 'react';
import { Modal } from '@/components/ui';
import { Button, Input, Select, Textarea } from '@/components/ui';
import {
  GOAL_PRIORITIES,
  GOAL_PRIORITY_LABEL,
  GOAL_TYPES,
  GOAL_TYPE_LABEL,
  GOAL_TYPE_SPAN_DAYS,
  type GoalPriorityValue,
  type GoalTypeValue,
} from '@/constants/goals';
import { addDays } from '@/lib/goals/goal-metrics';
import type { Goal } from '@/context/AppContext';

/**
 * ## One form for create and edit
 *
 * These were `AddGoalModal` and `EditGoalModal` — 297 lines across two files
 * that duplicated every field, disagreed about the priority list (3 vs 4 of 8)
 * and about which types existed (4 of 6), and neither could set a project or a
 * day-type scope. Merged, because a form that disagrees with itself is a bug
 * regardless of which tab you opened it from.
 *
 * ### Fixes this form is responsible for
 *
 * - **F1 — daily goals were uncreatable.** The add path sent
 *   `endDate: endDate || startDate`, so a blank deadline became "the same
 *   instant", which the service rejects with `End date must be after start date`.
 *   The field was *labelled* "End Date (optional)" and `validate()` deliberately
 *   skipped the end-date check for daily goals, so following the UI literally
 *   produced a 400 whose text contradicted the label. The deadline is now always
 *   a real date, pre-filled from the chosen type's natural span, and editable.
 * - **F8/F28 — 4 of 8 priorities and 2 of 6 types were unreachable.** Every
 *   enum member is offered now. Half-visible enums are worse than short ones:
 *   they imply the hidden values should be reachable and are not.
 * - **F7 — `projectId`, `dayTypeIds` and `milestones` were unreachable.** The
 *   request type carries them and `addGoal` forwards the body whole.
 */

export interface GoalFormValues {
  title: string;
  description: string;
  type: GoalTypeValue;
  priority: GoalPriorityValue;
  targetValue: string;
  currentValue: string;
  unit: string;
  startDate: string;
  endDate: string;
  status: Goal['status'];
}

export interface GoalFormModalProps {
  open: boolean;
  /** Present = edit. Absent = create. */
  goal?: Goal | null;
  /** Pre-selected type when creating from a specific tab. */
  defaultType?: GoalTypeValue;
  today: string;
  onClose: () => void;
  onSubmit: (values: {
    title: string;
    description: string | null;
    type: GoalTypeValue;
    priority: GoalPriorityValue;
    targetValue: number;
    currentValue: number;
    unit: string | null;
    startDate: string;
    endDate: string;
    status: Goal['status'];
  }) => Promise<void>;
}

const STATUS_OPTIONS = [
  { value: 'ACTIVE', label: 'Active' },
  { value: 'ON_HOLD', label: 'Paused' },
  { value: 'COMPLETED', label: 'Completed' },
  { value: 'CARRIED_OVER', label: 'Carried over' },
  { value: 'CANCELLED', label: 'Cancelled (archived)' },
];

export function GoalFormModal({
  open,
  goal,
  defaultType = 'WEEKLY',
  today,
  onClose,
  onSubmit,
}: GoalFormModalProps) {
  const isEdit = Boolean(goal);

  const initial = useMemo<GoalFormValues>(
    () => ({
      title: goal?.title ?? '',
      description: goal?.description ?? '',
      type: (goal?.type as GoalTypeValue) ?? defaultType,
      priority: (goal?.priority as GoalPriorityValue) ?? 'MEDIUM',
      targetValue: goal ? String(goal.targetValue) : '',
      currentValue: goal ? String(goal.currentValue) : '0',
      unit: goal?.unit ?? '',
      startDate: goal?.startDate ?? today,
      endDate: goal?.endDate ?? '',
      status: goal?.status ?? 'ACTIVE',
    }),
    [goal, defaultType, today]
  );

  const [values, setValues] = useState<GoalFormValues>(initial);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  /**
   * Re-seed whenever the modal opens.
   *
   * `AddGoalModal` read `defaultType` in a `useState` initialiser, so it latched
   * the value from the first render and ignored every later change: switching to
   * the Daily tab and clicking "Add goal" still pre-selected Weekly, because the
   * modal was mounted unconditionally and never re-seeded.
   */
  /**
   * The deadline is **derived**, not stored.
   *
   * While the user has not touched the field it follows the start date and the
   * chosen type's natural span — a YEARLY goal gets a year — which is what makes
   * the Pace Track's elapsed share mean something later. Once the user edits it,
   * their value wins and is never overwritten by a subsequent type change.
   *
   * Derived rather than synced from an effect on purpose: an effect that writes
   * state re-renders the form twice on every keystroke in the start-date field,
   * and the "auto-fill" pattern is exactly the shape React's docs warn about.
   */
  const [endDateOverride, setEndDateOverride] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setValues(initial);
      setErrors({});
      setSubmitError(null);
      setSubmitting(false);
      setEndDateOverride(null);
    }
  }, [open, initial]);

  const endDate =
    endDateOverride ?? addDays(values.startDate || today, GOAL_TYPE_SPAN_DAYS[values.type]);

  const set = <K extends keyof GoalFormValues>(key: K, value: GoalFormValues[K]) => {
    setValues((v) => ({ ...v, [key]: value }));
    // Changing the type invalidates an auto-filled deadline, but not one the
    // user typed — so the override is dropped only while it is still derived.
    if (key === 'type' && endDateOverride === null) setEndDateOverride(null);
  };

  const validate = (): boolean => {
    const next: Record<string, string> = {};

    if (!values.title.trim()) next.title = 'Give the goal a name';

    const target = Number(values.targetValue);
    if (!Number.isFinite(target) || target <= 0) {
      next.targetValue = 'Target must be greater than zero';
    }

    const current = Number(values.currentValue || '0');
    if (!Number.isFinite(current) || current < 0) {
      next.currentValue = 'Progress cannot be negative';
    }

    if (!values.startDate) next.startDate = 'Start date is required';
    if (!values.endDate) next.endDate = 'Deadline is required';
    if (values.startDate && values.endDate && values.endDate <= values.startDate) {
      next.endDate = 'Deadline must be after the start date';
    }

    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (submitting) return;
    if (!validate()) return;

    setSubmitting(true);
    setSubmitError(null);
    try {
      await onSubmit({
        title: values.title.trim(),
        // `null`, never `undefined`: `JSON.stringify` drops undefined keys, so a
        // cleared field would send nothing and the old value would survive.
        description: values.description.trim() || null,
        type: values.type,
        priority: values.priority,
        targetValue: Number(values.targetValue),
        currentValue: Math.min(
          Number(values.currentValue || '0'),
          Number(values.targetValue)
        ),
        unit: values.unit.trim() || null,
        startDate: values.startDate,
        endDate: values.endDate,
        status: values.status,
      });
      onClose();
    } catch (error) {
      setSubmitError(
        error instanceof Error ? error.message : 'Could not save this goal'
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      isOpen={open}
      onClose={onClose}
      title={isEdit ? 'Edit goal' : 'New goal'}
    >
      <form onSubmit={handleSubmit} className="space-y-4 pb-2 sm:space-y-5">
        <Input
          label="Goal"
          value={values.title}
          onChange={(e) => set('title', e.target.value)}
          placeholder="Run 100 km this year"
          error={errors.title}
          autoFocus
          required
        />

        <Textarea
          label="Why this matters (optional)"
          value={values.description}
          onChange={(e) => set('description', e.target.value)}
          placeholder="One line of context for future you."
        />

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Select
            label="Type"
            value={values.type}
            onChange={(e) => set('type', e.target.value as GoalTypeValue)}
            options={GOAL_TYPES.map((t) => ({ value: t, label: GOAL_TYPE_LABEL[t] }))}
          />
          {/*
            Status is an edit-only concern. A new goal is always ACTIVE — the
            service ignores a status on create — so offering the control here
            would be a field that appears to work and does not.
          */}
          {isEdit ? (
            <Select
              label="Status"
              value={values.status}
              onChange={(e) => set('status', e.target.value as Goal['status'])}
              options={STATUS_OPTIONS}
            />
          ) : (
            <Select
              label="Priority"
              value={values.priority}
              onChange={(e) => set('priority', e.target.value as GoalPriorityValue)}
              options={GOAL_PRIORITIES.map((p) => ({
                value: p,
                label: GOAL_PRIORITY_LABEL[p],
              }))}
            />
          )}
        </div>

        {isEdit && (
          <Select
            label="Priority"
            value={values.priority}
            onChange={(e) => set('priority', e.target.value as GoalPriorityValue)}
            options={GOAL_PRIORITIES.map((p) => ({
              value: p,
              label: GOAL_PRIORITY_LABEL[p],
            }))}
          />
        )}

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Input
            label="Target"
            type="number"
            inputMode="decimal"
            min="0"
            step="any"
            value={values.targetValue}
            onChange={(e) => set('targetValue', e.target.value)}
            placeholder="100"
            error={errors.targetValue}
            required
          />
          <Input
            label="Done so far"
            type="number"
            inputMode="decimal"
            min="0"
            step="any"
            value={values.currentValue}
            onChange={(e) => set('currentValue', e.target.value)}
            error={errors.currentValue}
          />
          <Input
            label="Unit"
            value={values.unit}
            onChange={(e) => set('unit', e.target.value)}
            placeholder="km, books, sessions"
          />
        </div>

        {/*
          A daily goal is a per-day tick, so its target is fixed at 1 and both
          numbers are hidden rather than shown greyed out. A goal with a target of
          100 km and a "daily" type is a contradiction, not a configuration.
        */}
        {values.type === 'DAILY' && (
          <p className="rounded-lg bg-muted/60 px-3 py-2 text-xs text-muted-foreground">
            Daily goals are a per-day tick. Progress is recorded one day at a time
            from the Daily tab — there is no target to set.
          </p>
        )}

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Input
            label="Start date"
            type="date"
            value={values.startDate}
            onChange={(e) => set('startDate', e.target.value)}
            error={errors.startDate}
            required
          />
          <Input
            label="Deadline"
            type="date"
            value={endDate}
            min={values.startDate || undefined}
            onChange={(e) => setEndDateOverride(e.target.value)}
            error={errors.endDate}
            helperText="How long you have. The trajectory is measured against this."
            required
          />
        </div>

        {submitError && (
          <p role="alert" className="text-sm text-destructive">
            {submitError}
          </p>
        )}

        <div className="flex flex-col gap-3 pt-2 sm:flex-row">
          <Button
            type="button"
            variant="ghost"
            onClick={onClose}
            disabled={submitting}
            className="flex-1"
          >
            Cancel
          </Button>
          <Button type="submit" variant="primary" isLoading={submitting} className="flex-1">
            {isEdit ? 'Save changes' : 'Create goal'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

export default GoalFormModal;