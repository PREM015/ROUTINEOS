'use client';

import { useEffect, useState } from 'react';
import { apiRequest } from '@/lib/api-client';
import { FocusWeekStrip, summariseFocusWeek, type FocusWeekDay } from './FocusWeekStrip';
import { Skeleton } from '@/components/ui/Skeleton';

/**
 * The stats panel's week view.
 *
 * One request for the whole panel rather than one per widget. The endpoint defaults
 * to the last seven days ending today, so no range is sent - passing one would be a
 * second place where "the week" is defined, and the two would drift.
 */

interface StatsResponse {
  days: FocusWeekDay[];
}

export function FocusWeekPanel() {
  const [days, setDays] = useState<FocusWeekDay[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void apiRequest<StatsResponse>('/api/focus/stats')
      .then((data) => {
        if (!cancelled) setDays(data.days ?? []);
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Could not load the week.');
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (error) {
    return (
      <p className="rounded-md bg-destructive/10 p-3 text-sm text-destructive" role="alert">
        {error}
      </p>
    );
  }

  if (!days) {
    return <Skeleton className="h-16 w-full" />;
  }

  const summary = summariseFocusWeek(days);

  return (
    <section aria-label="Focus this week">
      <div className="mb-2 flex items-baseline justify-between gap-2">
        <h3 className="text-sm font-semibold text-foreground">This week</h3>
        {/* The spoken summary. `polite` because it is a completion notice, not an
            alert, and it must not interrupt the strip's own labels. */}
        <p className="text-xs text-muted-foreground" role="status" aria-live="polite">
          {summary}
        </p>
      </div>
      <FocusWeekStrip days={days} />
    </section>
  );
}

export default FocusWeekPanel;