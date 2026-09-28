'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { CalendarDays, RefreshCw } from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Skeleton } from '@/components/ui/Skeleton';
import { Collapsible } from '@/components/ui/Collapsible';
import DayContextSelector, {
  type CustomDayType,
} from '@/components/context/DayContextSelector';
import { DAY_TYPE_CONFIG } from '@/constants/routine';
import { cn } from '@/lib/utils';
import type { DayType } from '@/generated/prisma';

interface TodayDayTypeProps {
  date: string;
  className?: string;
  resolvedDayType?: string;
}

interface DayModeResponse {
  dayType: DayType;
  /** The user's own day type, when the active one is custom. */
  dayTypeId: string | null;
  dayTypeName: string | null;
  naturalDayType: DayType;
  templateId: string | null;
  hasException: boolean;
  exception: {
    id: string;
    dayType: DayType;
    dayTypeId: string | null;
    dayTypeName: string | null;
    templateId: string | null;
    reason: string | null;
  } | null;
  isMinimumDay: boolean;
  isRestDay: boolean;
}

export function TodayDayType({ date, className, resolvedDayType }: TodayDayTypeProps) {
  const [mode, setMode] = useState<DayModeResponse | null>(null);
  const [dayTypes, setDayTypes] = useState<CustomDayType[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** Day-type *list* failed, distinct from the day-mode error above. */
  const [dayTypeError, setDayTypeError] = useState<string | null>(null);

  /**
   * The user's own day types.
   *
   * Without these the picker can only offer the six built-in enum values, and
   * every custom day type collapses to a single `CUSTOM` entry — so a custom
   * type could be set but never shown, which is what made the control look
   * broken. `?active=true` keeps archived definitions out of the picker.
   */
  const fetchDayTypes = useCallback(async () => {
    try {
      setDayTypeError(null);
      const res = await fetch('/api/day-types?active=true');
      if (!res.ok) {
        throw new Error(`Could not load your day types (status ${res.status})`);
      }
      const data = await res.json();
      if (!data.success) {
        throw new Error(data.error || 'Could not load your day types');
      }
      setDayTypes(data.data ?? []);
    } catch (err) {
      // A failure must not be mistaken for "you have no day types" — that
      // would render the "create one in Routine settings" empty state and hide
      // types the user actually has. Tracked separately from `error` so the
      // day-mode error and the day-type-list error do not overwrite each other.
      setDayTypeError(
        err instanceof Error ? err.message : 'Could not load your day types'
      );
    }
  }, []);

  const fetchMode = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const [res] = await Promise.all([
        fetch(`/api/day-mode?date=${date}`),
        fetchDayTypes(),
      ]);
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'Failed to load day mode');
      if (data.success) setMode(data.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load day mode');
    } finally {
      setLoading(false);
    }
  }, [date, fetchDayTypes]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- mount data fetch
    fetchMode();
  }, [fetchMode]);

  /**
   * A custom day type is persisted as `dayType: 'CUSTOM'` **plus** its
   * `dayTypeId`; the enum alone cannot say which one. Sending only `dayType`
   * wrote an exception that resolved back to a generic custom day, so the
   * selection was lost the moment the page reloaded.
   */
  async function selectDayType(next: { dayType: DayType; dayTypeId?: string }) {
    if (!mode || saving) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch('/api/day-mode', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          date,
          mode: 'DAY_TYPE',
          dayType: next.dayType,
          dayTypeId: next.dayTypeId,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'Failed to set day type');
      // The POST returns the mutation result, not the full snapshot, so re-read
      // to pick up the derived fields (`dayTypeName`, `isRestDay`, …).
      await fetchMode();
      window.dispatchEvent(new Event('day-mode-changed'));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to set day type');
    } finally {
      setSaving(false);
    }
  }

  async function resetDayType() {
    if (!mode || saving) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch('/api/day-mode', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date, mode: 'CLEAR' }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'Failed to reset day type');
      await fetchMode();
      window.dispatchEvent(new Event('day-mode-changed'));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to reset day type');
    } finally {
      setSaving(false);
    }
  }

  // Use resolved day type from parent if available, otherwise fall back to fetched mode
  const effectiveDayType = resolvedDayType ?? mode?.dayType ?? null;
  const current = effectiveDayType ? DAY_TYPE_CONFIG[effectiveDayType as keyof typeof DAY_TYPE_CONFIG] : null;
  const isNatural = mode ? !mode.hasException : true;

  /**
   * The user's own name for the active day type.
   *
   * Resolution order matters for B3 ("the dashboard doesn't say what today's day
   * type is"):
   *   1. `dayTypeName` from `/api/day-mode` — the server's resolved name.
   *   2. The name of the fetched definition matching `dayTypeId` — covers the
   *      window before `/api/day-mode` resolves, and a `dayTypeName` that is null
   *      for a definition-backed day type.
   *   3. The generic enum label — last resort.
   *
   * Previously it went straight to (3), so the dashboard showed "Workday" rather
   * than the user's "Work Day", which read as "no day type is set".
   */
  const activeDefinition = dayTypes.find((d) => d.id === mode?.dayTypeId);
  const activeDayTypeName =
    mode?.dayTypeName ?? activeDefinition?.name ?? (current ? current.label : null);

  if (loading) {
    // The card still renders (with a placeholder name) rather than collapsing
    // to a bare skeleton line, so the day-type block does not jump or vanish
    // while the day-mode request is in flight.
    return (
      <Card className={cn('p-5', className)} aria-busy="true" aria-label="Loading day type">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <CalendarDays className="h-5 w-5 text-primary" aria-hidden="true" />
            <h2 className="text-sm font-semibold text-muted-foreground">Day Type</h2>
          </div>
          <Skeleton className="h-6 w-40" />
        </div>
      </Card>
    );
  }

  // A user with no day types of their own has nothing to choose from, so the
  // picker is replaced with a route to where they are created. Without this the
  // grid rendered the five built-in enum labels as if they were real, editable
  // day types the user owned.
  const hasDayTypes = dayTypes.length > 0;

  return (
    <Card className={cn('p-5', className)}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <CalendarDays className="h-5 w-5 text-primary" aria-hidden="true" />
          <h2 className="text-sm font-semibold text-muted-foreground">Day Type</h2>
        </div>
        {activeDayTypeName && (
          <span className="flex flex-wrap items-center gap-2">
            <Badge
              variant="primary"
              className="flex items-center gap-1.5 border border-primary/30 text-foreground"
            >
              {current?.icon && (
                <span aria-hidden="true">{current.icon}</span>
              )}
              <span className="font-semibold">{activeDayTypeName}</span>
            </Badge>
            {/* Say *which* day type is active and whether it is the natural one or
                a manual override, rather than leaving the reader to infer it. */}
            <span className="text-xs text-muted-foreground">
              {mode
                ? isNatural
                  ? 'Natural schedule for today'
                  : 'Manually overridden for today'
                : 'Checking today’s day type…'}
            </span>
          </span>
        )}
      </div>

      {error && <p role="alert" className="mt-3 text-sm text-destructive">{error}</p>}

      {dayTypeError && (
        <p role="alert" className="mt-3 text-sm text-destructive">
          {dayTypeError}.{' '}
          <button
            type="button"
            onClick={() => void fetchDayTypes()}
            className="font-semibold text-primary hover:underline"
          >
            Try again
          </button>
        </p>
      )}

      {!hasDayTypes && !dayTypeError ? (
        <p className="mt-3 text-sm text-muted-foreground">
          You have not created any day types yet.{' '}
          <Link
            href="/routine"
            className="font-semibold text-primary hover:underline"
          >
            Create one in Routine settings
          </Link>{' '}
          to give each kind of day its own schedule.
        </p>
      ) : (
        <Collapsible
        className="mt-3"
        trigger={
          <span className="inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-primary transition-colors hover:bg-primary/10">
            Change day type
          </span>
        }
      >
        <DayContextSelector
          value={mode?.dayType ?? undefined}
          dayTypeId={mode?.dayTypeId ?? null}
          onChange={selectDayType}
          customDayTypes={dayTypes}
          loading={loading || saving}
          className="mt-2"
        />
        <div className="mt-2 flex items-center justify-end">
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={resetDayType}
            disabled={saving || isNatural}
            className="text-muted-foreground hover:text-foreground"
          >
            <RefreshCw className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
            {isNatural ? 'Using natural schedule' : 'Reset to schedule'}
          </Button>
        </div>
      </Collapsible>
      )}
    </Card>
  );
}

export default TodayDayType;