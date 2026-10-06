'use client';

import { useMemo, useState } from 'react';
import { useSession } from 'next-auth/react';
import { Target, TrendingUp } from 'lucide-react';
import type { AnalyticsDashboard } from '@/types/analytics';
import {
  MIN_DAYS_FOR_PACE,
  paceSentence,
  projectPace,
} from '@/lib/analytics/pace';
import {
  readStored,
  writeStored,
} from '@/lib/analytics/device-storage';
import { cn } from '@/lib/utils';

/**
 * A target for this period, and whether the period is on track for it.
 *
 * ## Targets are device-local, and the UI says so
 *
 * They are not server state. Nothing else in the app reads them, nothing they feed is
 * scored, and they are namespaced per user id so a shared browser does not hand one
 * person's targets to the next. The heading says "stored on this device" because a target
 * the user cannot find again after a cache clear should not look like a setting that
 * persisted.
 *
 * ## Why the projection is often absent
 *
 * `projectPace` refuses for a completed period, for a period with no measurement, and
 * below three elapsed days. Those are the common cases — a default view of *today* has one
 * elapsed day — so this panel is frequently just a target and a current value. That is the
 * honest rendering. A pace bar that always had an estimate on it would be a decoration.
 */
export function TargetsPanel({
  payload,
}: {
  payload: AnalyticsDashboard;
}) {
  const { data: session } = useSession();
  const userId = session?.user?.id;

  const stored = useMemo(
    () =>
      readStored<StoredTargets>(
        'targets',
        userId,
        { habitRate: null, sleepMinutes: null },
        isStoredTargets
      ),
    [userId]
  );

  const [draft, setDraft] = useState<StoredTargets>(stored);

  /*
    The period's real length, and whether it is still running.

    Two different questions, and conflating them was this component's first draft: a
    ternary chain reading `elapsedDays > 0 ? (range.end >= today ? elapsedDays : …)` mixes
    "how much has happened" with "how long the period is". Projection needs both, because
    it extrapolates from the first onto the second.
  */
  const { elapsedDays } = payload.freshness;
  const totalDays = daysBetween(payload.range.start, payload.range.end);
  const isIncomplete = payload.range.start <= payload.today && payload.today < payload.range.end;

  const pace = useMemo(
    () =>
      projectPace({
        current: payload.hero.habitReliability,
        elapsedDays,
        totalDays,
        isCurrentIncompletePeriod: isIncomplete,
      }),
    [elapsedDays, isIncomplete, payload.hero.habitReliability, totalDays]
  );

  const save = (next: StoredTargets) => {
    setDraft(next);
    writeStored('targets', userId, next);
  };

  const sentence =
    pace && draft.habitRate != null
      ? paceSentence(pace, draft.habitRate, elapsedDays, totalDays, 'percent')
      : null;

  return (
    <section aria-labelledby="targets" className="glass-panel rounded-2xl p-5 shadow-soft">
      <h2 id="targets" className="flex items-center gap-2 text-sm font-semibold text-foreground">
        <Target className="h-4 w-4 text-primary" aria-hidden="true" />
        Targets for this period
      </h2>
      <p className="mt-0.5 text-[11px] text-muted-foreground">
        Stored on this device. Nothing here changes your score.
      </p>

      <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
        <TargetInput
          id="target-habit-rate"
          label="Habit rate"
          suffix="%"
          value={draft.habitRate}
          min={0}
          max={100}
          onChange={(habitRate) => save({ ...draft, habitRate })}
        />
        <TargetInput
          id="target-sleep"
          label="Sleep per night"
          suffix=" min"
          value={draft.sleepMinutes}
          min={0}
          max={1440}
          onChange={(sleepMinutes) => save({ ...draft, sleepMinutes })}
        />
      </div>

      {draft.habitRate == null ? (
        <p className="mt-4 text-xs text-muted-foreground">
          Set a habit-rate target and this shows whether the period is on pace for it.
        </p>
      ) : (
        <div className="mt-4 space-y-2">
          <div className="flex items-baseline justify-between gap-3">
            <span className="text-sm text-muted-foreground">Habit rate</span>
            <span className="text-sm font-semibold tabular-nums text-foreground">
              {payload.hero.habitReliability != null
                ? `${Math.round(payload.hero.habitReliability)}%`
                : '—'}
              {' of '}
              {draft.habitRate}%
            </span>
          </div>

          <PaceBar current={payload.hero.habitReliability} target={draft.habitRate} />

          {sentence ? (
            <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
              <TrendingUp className="mt-0.5 h-3 w-3 shrink-0" aria-hidden="true" />
              {sentence}
            </p>
          ) : (
            <p className="text-xs text-muted-foreground">
              {isIncomplete && elapsedDays < MIN_DAYS_FOR_PACE
                ? `A projection needs at least ${MIN_DAYS_FOR_PACE} elapsed days.`
                : 'A projection is only shown for a period that has not finished.'}
            </p>
          )}
        </div>
      )}

      {draft.sleepMinutes != null && payload.tiles.sleepMinutes != null && (
        <p className="mt-3 text-xs text-muted-foreground">
          Sleep: {Math.round(payload.tiles.sleepMinutes)} min average per night against a{' '}
          {draft.sleepMinutes} min target.{' '}
          <AppDefaultNote />
        </p>
      )}
    </section>
  );
}

/**
 * The target bar.
 *
 * A plain two-segment bar rather than a gauge: it has to be readable at a glance, and it
 * must not imply a verdict. The word "behind" belongs in the sentence beneath it, where it
 * can be qualified, rather than in a colour choice the user has to interpret.
 */
function PaceBar({ current, target }: { current: number | null; target: number }) {
  const value = current ?? 0;
  const filled = Math.max(0, Math.min(100, value));
  const mark = Math.max(0, Math.min(100, target));
  const reached = current != null && current >= target;

  return (
    <div
      className="relative h-2 w-full overflow-hidden rounded-full bg-muted"
      role="img"
      aria-label={
        current == null
          ? 'No habit rate recorded for this period'
          : `Habit rate ${Math.round(current)} percent against a target of ${target} percent`
      }
    >
      <span
        aria-hidden="true"
        className={cn(
          'block h-full rounded-full transition-[width] duration-300 ease-out motion-reduce:transition-none',
          reached ? 'bg-emerald-500' : 'bg-primary'
        )}
        style={{ width: `${filled}%` }}
      />
      {/* The target marker, drawn over the fill so it stays visible when passed. */}
      <span
        aria-hidden="true"
        className="absolute inset-y-0 w-0.5 bg-foreground/70"
        style={{ left: `${mark}%` }}
      />
    </div>
  );
}

function TargetInput({
  id,
  label,
  suffix,
  value,
  min,
  max,
  onChange,
}: {
  id: string;
  label: string;
  suffix: string;
  value: number | null;
  min: number;
  max: number;
  onChange: (value: number | null) => void;
}) {
  return (
    <label htmlFor={id} className="block">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="mt-1 flex items-center gap-1">
        <input
          id={id}
          type="number"
          inputMode="numeric"
          min={min}
          max={max}
          value={value ?? ''}
          placeholder="Not set"
          onChange={(event) => {
            const raw = event.target.value;
            if (raw === '') {
              onChange(null);
              return;
            }
            const parsed = Number(raw);
            // Out-of-range and NaN both mean "no usable target", not a clamped one —
            // silently clamping 480 to 100 would be a number the user did not ask for.
            if (!Number.isFinite(parsed) || parsed < min || parsed > max) {
              onChange(null);
              return;
            }
            onChange(parsed);
          }}
          className="w-full rounded-lg border border-border/60 bg-background/60 px-2.5 py-1.5 text-sm tabular-nums text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        />
        <span aria-hidden="true" className="text-xs text-muted-foreground">
          {suffix.trim()}
        </span>
      </span>
    </label>
  );
}

/**
 * Keeps the app-default sleep target honest.
 *
 * The sleep card compares against `APP_CONFIG.defaults.sleep.targetDuration`, not against
 * anything the user set. Saying "against your 450 minute target" next to a card measuring
 * against 480 would be two different numbers wearing one label.
 */
function AppDefaultNote() {
  return <span>The sleep card compares against the app default of 8h, not this target.</span>;
}

interface StoredTargets {
  habitRate: number | null;
  sleepMinutes: number | null;
}

function isStoredTargets(value: unknown): value is StoredTargets {
  if (typeof value !== 'object' || value === null) return false;
  const record = value as Record<string, unknown>;
  const valid = (entry: unknown): entry is number | null =>
    entry === null || (typeof entry === 'number' && Number.isFinite(entry));
  return valid(record.habitRate) && valid(record.sleepMinutes);
}

function daysBetween(start: string, end: string): number {
  const ms = Date.parse(`${end}T00:00:00.000Z`) - Date.parse(`${start}T00:00:00.000Z`);
  return Math.round(ms / 86_400_000) + 1;
}
