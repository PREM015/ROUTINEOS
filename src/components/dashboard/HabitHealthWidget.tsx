'use client';

/**
 * Habit Health - the dashboard's ONLY habits surface, and a 28-day pattern view.
 *
 * ## Why the checkbox is gone
 *
 * This card used to render a live tick button per habit. On a page whose entire
 * premise is "no card here is a checkbox", that was a control with no owner: it
 * wrote `HabitLog` rows from a page that is supposed to be read-only, and it was
 * a second surface for the same action as `/today`'s checklist. Tapping a row now
 * navigates to `/habits/[id]`. Logging lives on `/today` and `/habits`, full stop.
 *
 * ## Why "due today" is gone too
 *
 * Audit F6 / 17.3: this card counted `useApp().habits` filtered to `ACTIVE` -
 * every active habit, with no day-type or frequency filtering - while the
 * `HabitsMetric` beside it counted `GET /api/habits/today`, which applies
 * eligibility. A habit restricted to another day type was in this card's
 * denominator and neither of the others', so the same screen showed two
 * different numbers both labelled "done today" and neither said which set it
 * used. The `HabitsMetric` is deleted, and with it the second definition. There is
 * no competing "due today" left to disagree with.
 *
 * ## Tabs
 *
 * Bucketed Healthy / At risk / Unhealthy with counts, so the card answers "which
 * habits need me" rather than dumping every habit at every height. The 28-day
 * window is stated in the header so it can never be mistaken for a same-day
 * checklist.
 */

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { HEALTH_META } from '@/components/dashboard-ui/tokens';
import { DOMAIN_ACCENT, accentRing } from '@/components/dashboard-ui/accent';
import { Panel, PanelEmpty } from '@/components/dashboard-ui';
import { cn } from '@/lib/utils';

interface HealthHabit {
  habitId: string;
  name: string;
  tier: string;
  completionRate: number | null;
  dueCount: number;
  health: 'HEALTHY' | 'AT_RISK' | 'UNHEALTHY' | 'NO_DATA';
}

interface HealthSummary {
  totalActive: number;
  withDataCount: number;
  healthyCount: number;
  atRiskCount: number;
  unhealthyCount: number;
  overallCompletionRate: number | null;
}

type Bucket = 'HEALTHY' | 'AT_RISK' | 'UNHEALTHY';

const BUCKETS: { key: Bucket; label: string }[] = [
  { key: 'HEALTHY', label: 'Healthy' },
  { key: 'AT_RISK', label: 'At risk' },
  { key: 'UNHEALTHY', label: 'Unhealthy' },
];

const BAR: Record<HealthHabit['health'], string> = {
  HEALTHY: 'rgb(16 185 129)',
  AT_RISK: 'rgb(245 158 11)',
  UNHEALTHY: 'var(--destructive)',
  NO_DATA: 'var(--muted)',
};

export function HabitHealthWidget() {
  const [rows, setRows] = useState<HealthHabit[]>([]);
  const [summary, setSummary] = useState<HealthSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [bucket, setBucket] = useState<Bucket | null>(null);
  /** `GET /api/habits/health` returns its own `window`; the chip must not lie. */
  const [windowDays, setWindowDays] = useState<number | null>(null);
  /** Bumped to re-run the fetch from the error state's retry. */
  const [nonce, setNonce] = useState(0);

  const retry = useCallback(() => {
    setLoading(true);
    setNonce((n) => n + 1);
  }, []);

  useEffect(() => {
    let cancelled = false;

    /*
      The one place a fetch can fail is the one that has to say so: a bare `catch`
      left the bars and percentages silently missing, indistinguishable from a
      habit that simply has no history. State is written inside the promise
      callbacks, and every write is guarded by `cancelled` so a slow response
      arriving after unmount cannot update a component that is gone.
    */
    fetch('/api/habits/health?days=28')
      .then(async (res) => {
        if (!res.ok) {
          throw new Error(`Could not load habit health (status ${res.status})`);
        }
        return (await res.json()) as {
          success: boolean;
          error?: string;
          data?: { habits: HealthHabit[]; summary: HealthSummary; window?: { days: number } };
        };
      })
      .then((result) => {
        if (cancelled) return;
        if (result.success && result.data) {
          setRows(result.data.habits);
          setSummary(result.data.summary);
          setWindowDays(result.data.window?.days ?? null);
          setError(null);
        } else {
          setError(result.error ?? 'Could not load habit health');
        }
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : 'Could not load habit health');
      })
      .finally(() => {
        if (cancelled) return;
        setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [nonce]);

  /**
   * Which bucket each habit falls in, from the health endpoint's own
   * classification.
   *
   * A habit with no history is `NO_DATA`, which is not one of the three tabs. It
   * is shown under whichever tab is active and greyed, so it never silently
   * disappears - a habit missing from a "28-day pattern" list reads as "this
   * habit does not exist", which is a different and much worse claim than "this
   * habit has no history yet".
   */
  const grouped = useMemo(() => {
    const map: Record<Bucket, HealthHabit[]> = { HEALTHY: [], AT_RISK: [], UNHEALTHY: [] };
    for (const row of rows) {
      if (row.health in map) map[row.health as Bucket].push(row);
    }
    for (const key of Object.keys(map) as Bucket[]) {
      map[key].sort((a, b) => (a.completionRate ?? -1) - (b.completionRate ?? -1));
    }
    return map;
  }, [rows]);

  const counts = useMemo(() => {
    const byHealth = (h: Bucket) =>
      rows.filter((r) => r.health === h).length;
    return {
      HEALTHY: byHealth('HEALTHY'),
      AT_RISK: byHealth('AT_RISK'),
      UNHEALTHY: byHealth('UNHEALTHY'),
    } as Record<Bucket, number>;
  }, [rows]);

  /** `null` bucket means "show everything", which is the default tab state. */
  const visible = useMemo(() => {
    if (bucket === null) return rows;
    const exact = grouped[bucket];
    const noData = rows.filter((r) => r.health === 'NO_DATA');
    return [...exact, ...(bucket === 'HEALTHY' ? [] : noData)];
  }, [bucket, grouped, rows]);

  const action = (
    <Link href="/habits" className="shrink-0 text-xs font-semibold text-primary hover:underline">
      Manage
    </Link>
  );

  if (error && rows.length === 0) {
    return (
      <Panel
        title="Habit health"
        subtitle="28-day pattern"
        domain="habits"
        error={error}
        onRetry={retry}
      />
    );
  }

  if (loading) {
    return (
      <Panel
        title="Habit health"
        subtitle="28-day pattern"
        domain="habits"
        loading
        loadingRows={4}
        minHeightClass="min-h-[15rem]"
      />
    );
  }

  const overall = summary?.overallCompletionRate ?? null;

  return (
    <Panel
      title="Habit health"
      // Stated in the header so it is never mistaken for a same-day checklist.
      subtitle={`${windowDays ?? 28}-day pattern`}
      domain="habits"
      action={action}
      minHeightClass="min-h-[15rem]"
      isEmpty={rows.length === 0}
      empty={
        <PanelEmpty
          title="No active habits yet"
          description="Add a habit and this fills in with a 28-day view of how it is holding up."
        />
      }
    >
      <div className="flex flex-1 flex-col gap-3 px-5 pb-5">
        {/* A failed refetch degrades to a banner; the bars below stay valid. */}
        {error && (
          <p role="alert" className="rounded-md bg-destructive/10 px-3 py-2 text-xs text-destructive">
            {error} — showing the last successful load.
          </p>
        )}

        {overall !== null && (
          <p className="text-xs text-muted-foreground">
            <span className="font-display text-base font-bold tabular-nums text-foreground">
              {overall}%
            </span>{' '}
            average completion across {summary?.totalActive ?? rows.length} active habits
          </p>
        )}

        {/* The three tabs, with counts. */}
        <div role="tablist" aria-label="Habit health buckets" className="flex flex-wrap gap-1.5">
          <button
            role="tab"
            type="button"
            aria-selected={bucket === null}
            onClick={() => setBucket(null)}
            className={cn(
              'rounded-full px-2.5 py-1 text-[11px] font-medium tabular-nums transition-colors motion-reduce:transition-none',
              bucket === null
                ? 'bg-foreground text-background'
                : 'bg-muted text-muted-foreground hover:text-foreground'
            )}
          >
            All {rows.length}
          </button>
          {BUCKETS.map((b) => (
            <button
              key={b.key}
              role="tab"
              type="button"
              aria-selected={bucket === b.key}
              onClick={() => setBucket(b.key)}
              disabled={counts[b.key] === 0}
              className={cn(
                'rounded-full px-2.5 py-1 text-[11px] font-medium tabular-nums transition-colors motion-reduce:transition-none',
                bucket === b.key ? 'text-foreground' : 'text-muted-foreground hover:text-foreground',
                counts[b.key] === 0 && 'opacity-40'
              )}
              style={
                bucket === b.key
                  ? {
                      background: accentRing(HEALTH_META[b.key].tone ? statusHue(b.key) : 'var(--muted)', 16),
                      boxShadow: `inset 0 0 0 1px ${accentRing(statusHue(b.key), 45)}`,
                    }
                  : undefined
              }
            >
              {b.label} {counts[b.key]}
            </button>
          ))}
        </div>

        <ul className="flex-1 space-y-1.5">
          {visible.map((habit) => {
            const meta = HEALTH_META[habit.health];
            return (
              <li key={habit.habitId}>
                {/*
                  A link, not a button. Navigating to the habit is the dashboard's
                  whole relationship with it: the page shows the pattern and the
                  destination page handles the action.
                */}
                <Link
                  href={`/habits/${habit.habitId}`}
                  className="flex items-center gap-3 rounded-[14px] border border-border/60 px-3 py-2 transition-colors hover:border-primary/40 hover:bg-muted/40 motion-reduce:transition-none"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p
                        className={cn(
                          'truncate text-[13px] font-medium',
                          habit.health === 'NO_DATA' ? 'text-muted-foreground' : 'text-foreground'
                        )}
                      >
                        {habit.name}
                      </p>
                      <span className={cn('shrink-0 text-[11px] font-medium', meta.text)}>
                        {habit.completionRate !== null
                          ? `${habit.completionRate}%`
                          : meta.label}
                      </span>
                    </div>
                    <div className="mt-1 h-1 w-full overflow-hidden rounded-full bg-muted">
                      <div
                        className="h-full rounded-full transition-[width] duration-500 ease-out-expo motion-reduce:transition-none"
                        style={{
                          width: `${Math.max(0, Math.min(100, habit.completionRate ?? 0))}%`,
                          background: BAR[habit.health],
                        }}
                      />
                    </div>
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      </div>
    </Panel>
  );
}

/** The hue behind a health tab's selected state. */
function statusHue(bucket: Bucket): string {
  const tone = HEALTH_META[bucket].tone;
  if (tone === 'success') return DOMAIN_ACCENT.habits.hue;
  if (tone === 'warning') return 'rgb(245 158 11)';
  if (tone === 'danger') return 'var(--destructive)';
  return 'var(--muted-foreground)';
}

export default HabitHealthWidget;
