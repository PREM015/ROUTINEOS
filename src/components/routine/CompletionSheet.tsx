'use client';

import { useCallback, useEffect, useState } from 'react';
import { Drawer } from '@/components/ui/Drawer';
import { Button, Input, Select, Textarea } from '@/components/ui';
import { apiRequest, ApiError, apiErrorMessage } from '@/lib/api-client';
import { cn } from '@/lib/utils';
import type { RoutineLogStatus } from '@/generated/prisma';
import { displayTitle } from '@/lib/routine/display-text';
import type { BlockInsight, ResolvedRoutineBlock } from '@/types/routine';

/**
 * How a block actually went.
 *
 * Every `RoutineLog` column, exposed. The endpoint accepted `status` and nothing
 * else, so `actualStartTime`, `actualEndTime`, `focusRating`,
 * `productivityRating`, `energyLevel` and `note` were all writeable by the server
 * and unreachable from the UI — the columns existed, the schema existed, and
 * there was no form.
 *
 * ## Untick is a delete, not a MISSED
 *
 * `clear: true` removes the row. Writing `MISSED` instead would be a claim the
 * user never made, and it would permanently depress the daily score's
 * `routineCompletionRate`, which divides by the number of log rows that exist.
 */
const STATUS_OPTIONS: Array<{ value: RoutineLogStatus; label: string }> = [
  { value: 'COMPLETED', label: 'Completed' },
  { value: 'PARTIAL', label: 'Partial' },
  { value: 'IN_PROGRESS', label: 'In progress' },
  { value: 'MISSED', label: 'Missed' },
];

const RATING_OPTIONS = [
  { value: '', label: 'Not rated' },
  { value: '1', label: '1' },
  { value: '2', label: '2' },
  { value: '3', label: '3' },
  { value: '4', label: '4' },
  { value: '5', label: '5' },
];

interface FormState {
  status: RoutineLogStatus;
  note: string;
  actualStartTime: string;
  actualEndTime: string;
  focusRating: string;
  productivityRating: string;
  energyLevel: string;
}

const EMPTY: FormState = {
  status: 'COMPLETED',
  note: '',
  actualStartTime: '',
  actualEndTime: '',
  focusRating: '',
  productivityRating: '',
  energyLevel: '',
};

export function CompletionSheet({
  open,
  block,
  date,
  onClose,
  onSaved,
}: {
  open: boolean;
  block: ResolvedRoutineBlock | null;
  date: string;
  onClose: () => void;
  onSaved: (message: string) => void;
}) {
  const [form, setForm] = useState<FormState>(EMPTY);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !block) return;
    const log = block.log;
    setError(null);
    setForm({
      status: log?.status ?? 'COMPLETED',
      note: log?.note ?? '',
      actualStartTime: log?.actualStartTime ?? '',
      actualEndTime: log?.actualEndTime ?? '',
      focusRating: log?.focusRating != null ? String(log.focusRating) : '',
      productivityRating: log?.productivityRating != null ? String(log.productivityRating) : '',
      energyLevel: log?.energyLevel != null ? String(log.energyLevel) : '',
    });
  }, [open, block]);

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((current) => ({ ...current, [key]: value }));

  const submit = useCallback(async () => {
    if (!block || saving) return;
    setSaving(true);
    setError(null);

    const rating = (value: string) => (value === '' ? null : Number(value));

    try {
      await apiRequest('/api/routine/today', {
        method: 'POST',
        body: {
          blockId: block.id,
          date,
          status: form.status,
          note: form.note.trim() || null,
          actualStartTime: form.actualStartTime || null,
          actualEndTime: form.actualEndTime || null,
          focusRating: rating(form.focusRating),
          productivityRating: rating(form.productivityRating),
          energyLevel: rating(form.energyLevel),
        },
      });
      onSaved('Saved');
      onClose();
    } catch (caught) {
      setError(
        caught instanceof ApiError
          ? apiErrorMessage({ error: caught.message }, 'Could not save')
          : 'Could not save'
      );
    } finally {
      setSaving(false);
    }
  }, [block, saving, date, form, onSaved, onClose]);

  const untick = useCallback(async () => {
    if (!block || saving) return;
    setSaving(true);
    setError(null);
    try {
      await apiRequest('/api/routine/today', {
        method: 'POST',
        body: { blockId: block.id, date, clear: true },
      });
      onSaved('Entry removed');
      onClose();
    } catch (caught) {
      setError(
        caught instanceof ApiError
          ? apiErrorMessage({ error: caught.message }, 'Could not remove')
          : 'Could not remove'
      );
    } finally {
      setSaving(false);
    }
  }, [block, saving, date, onSaved, onClose]);

  if (!block) return null;

  return (
    <Drawer
      open={open}
      onOpenChange={(next) => !next && onClose()}
      side="bottom"
      className="sm:inset-y-0 sm:left-auto sm:right-0 sm:top-0 sm:h-full sm:max-w-md sm:rounded-none sm:rounded-l-xl"
      title={displayTitle(block.title)}
      description={`${block.startTime} to ${block.endTime}`}
    >
      <div className="space-y-4 pb-6">
        <Select
          label="How did it go?"
          value={form.status}
          onChange={(event) => set('status', event.target.value as RoutineLogStatus)}
          options={STATUS_OPTIONS}
        />

        <div className="grid grid-cols-2 gap-3">
          <Input
            label="Actual start"
            type="time"
            value={form.actualStartTime}
            onChange={(event) => set('actualStartTime', event.target.value)}
            helperText="Optional"
          />
          <Input
            label="Actual end"
            type="time"
            value={form.actualEndTime}
            onChange={(event) => set('actualEndTime', event.target.value)}
            helperText="Optional"
          />
        </div>

        <div className="grid grid-cols-3 gap-2">
          <Select
            label="Focus"
            value={form.focusRating}
            onChange={(event) => set('focusRating', event.target.value)}
            options={RATING_OPTIONS}
          />
          <Select
            label="Productivity"
            value={form.productivityRating}
            onChange={(event) => set('productivityRating', event.target.value)}
            options={RATING_OPTIONS}
          />
          <Select
            label="Energy"
            value={form.energyLevel}
            onChange={(event) => set('energyLevel', event.target.value)}
            options={RATING_OPTIONS}
          />
        </div>

        {/*
          A3.4 — how this block has been going lately, from the ratings already
          in `RoutineLog`.

          Placed directly under the inputs so it reads as context for the number
          about to be chosen ("the last ten times you rated this, 3.8") rather
          than as a separate feature competing for attention in a sheet whose
          whole job is logging one block.

          Renders nothing at all when there is no history. The alternative — a
          row of "—" or "0.0" — would tell the user they had rated this block
          before and scored zero, which is the exact opposite of "you have never
          rated it". The sample count is printed because an average of one is
          not a trend, and an average presented without its denominator is the
          mistake this page has been undoing all along.
        */}
        <RatingHistory insight={block.insight} />

        <Textarea
          label="Note"
          value={form.note}
          onChange={(event) => set('note', event.target.value)}
          placeholder="What happened?"
          rows={3}
        />

        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}

        <div
          className={cn(
            'sticky bottom-0 -mx-5 flex items-center justify-between gap-2 border-t border-border bg-card px-5 pt-3',
            'pb-[max(0.75rem,env(safe-area-inset-bottom))]'
          )}
        >
          {block.log ? (
            <Button variant="ghost" onClick={untick} disabled={saving} className="text-destructive">
              Remove entry
            </Button>
          ) : (
            <span />
          )}
          <div className="flex items-center gap-2">
            <Button variant="ghost" onClick={onClose} disabled={saving}>
              Cancel
            </Button>
            <Button variant="primary" onClick={submit} isLoading={saving}>
              Save
            </Button>
          </div>
        </div>
      </div>
    </Drawer>
  );
}

/**
 * The block's recent rating averages, or nothing at all.
 *
 * A separate component so the "no history" case is a single `return null` rather
 * than three conditionals threaded through the sheet's body — the empty state is
 * the common case for a block the user has never rated, and it should cost
 * nothing to render.
 *
 * Only dimensions that were actually measured appear. A user who rates focus and
 * productivity but never energy sees two averages, not three with a gap.
 */
function RatingHistory({ insight }: { insight: BlockInsight | null | undefined }) {
  const dimensions = [
    { key: 'focus', label: 'focus', value: insight?.averageFocus ?? null },
    { key: 'productivity', label: 'productivity', value: insight?.averageProductivity ?? null },
    { key: 'energy', label: 'energy', value: insight?.averageEnergy ?? null },
  ].filter((dimension) => dimension.value !== null);

  // Never rated this block. Say nothing rather than showing zeros.
  if (!insight || dimensions.length === 0) return null;

  return (
    <p className="text-[11px] leading-relaxed text-muted-foreground">
      Lately:{' '}
      {dimensions.map((dimension, index) => (
        <span key={dimension.key}>
          {index > 0 && ', '}
          <span className="font-mono tabular-nums font-medium text-foreground">
            {dimension.value?.toFixed(1)}
          </span>{' '}
          {dimension.label}
        </span>
      ))}
      {' — '}
      {/*
        The denominator, always. "avg 3.8" with no sample count is the same
        omission that made three different completion rates look like one.
      */}
      <span className="tabular-nums">
        {insight.samples === 1 ? 'your 1 logged rating' : `your last ${insight.samples} ratings`}
      </span>
      {insight.lastRatedDate && (
        <>, most recent {insight.lastRatedDate}.</>
      )}
    </p>
  );
}