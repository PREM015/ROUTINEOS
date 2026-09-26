'use client';

/**
 * TodayDayType — set and visibly display today's DayType.
 *
 * Loads the current day type from GET /api/day-mode (an explicit
 * RoutineException takes precedence, otherwise the natural weekday/weekend),
 * lets the user switch to any of the six DayType values (persisted as a
 * RoutineException so routine resolution actually changes), and offers a
 * "reset" back to the natural schedule.
 */

import { useCallback, useEffect, useState } from 'react';
import { CalendarDays, RefreshCw } from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Skeleton } from '@/components/ui/Skeleton';
import { Collapsible } from '@/components/ui/Collapsible';
import DayContextSelector, { type DayContext } from '@/components/context/DayContextSelector';
import { DAY_TYPE_CONFIG } from '@/constants/routine';
import { cn } from '@/lib/utils';
import type { DayType } from '@prisma/client';

interface TodayDayTypeProps {
  date: string;
  className?: string;
}

interface DayModeResponse {
  dayType: DayType;
  naturalDayType: DayType;
  templateId: string | null;
  hasException: boolean;
  exception: {
    id: string;
    dayType: DayType;
    templateId: string | null;
    reason: string | null;
  } | null;
  isMinimumDay: boolean;
  isRestDay: boolean;
}

export function TodayDayType({ date, className }: TodayDayTypeProps) {
  const [mode, setMode] = useState<DayModeResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchMode = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await fetch(`/api/day-mode?date=${date}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'Failed to load day mode');
      if (data.success) setMode(data.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load day mode');
    } finally {
      setLoading(false);
    }
  }, [date]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- mount data fetch
    fetchMode();
  }, [fetchMode]);

  async function selectDayType(next: DayContext) {
    if (!mode || saving) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch('/api/day-mode', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date, mode: 'DAY_TYPE', dayType: next }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'Failed to set day type');
      setMode(data.data);
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

  if (loading) {
    return (
      <Card className={cn('p-5', className)} aria-busy="true" aria-label="Loading day type">
        <Skeleton className="h-5 w-40" />
      </Card>
    );
  }

  const current = mode?.dayType ? DAY_TYPE_CONFIG[mode.dayType] : null;
  const isNatural = mode ? !mode.hasException : true;

  return (
    <Card className={cn('p-5', className)}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <CalendarDays className="h-5 w-5 text-primary" aria-hidden="true" />
          <h2 className="text-sm font-semibold text-muted-foreground">Day Type</h2>
        </div>
        {mode && current && (
          <Badge
            variant="primary"
            className="flex items-center gap-1.5 border border-primary/30 text-foreground"
          >
            <span aria-hidden="true">{current.icon}</span>
            <span className="capitalize">{current.label}</span>
            {!isNatural && <span className="text-xs font-normal text-muted-foreground">(override)</span>}
          </Badge>
        )}
      </div>

      {error && <p role="alert" className="mt-3 text-sm text-destructive">{error}</p>}

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
          onChange={(next) => selectDayType(next)}
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
    </Card>
  );
}

export default TodayDayType;