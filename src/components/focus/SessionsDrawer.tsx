'use client';

/**
 * SessionsDrawer — the history of what actually happened.
 *
 * Replaces a 20-row list and a four-tile stats page that were a second, thinner
 * copy of `/focus`. Two tabs, because "what did I do" and "how am I doing" are
 * different questions and putting them on one page made both harder to answer.
 *
 * ## Why the fetching lives in a hook and not here
 *
 * The old page fetched `GET /api/focus?limit=100` from two components and a third
 * time on retry, with no `AbortController` on two of the three. `useFocusSessions`
 * is the single fetcher; this component only decides what to render. The invalidation
 * contract is the important half: anything that could have ended a session
 * dispatches an event, so an open drawer is never showing a session that has since
 * finished.
 */

import { useEffect, useMemo, useState } from 'react';
import { Check, History, LineChart, Loader2, Search, Square } from 'lucide-react';
import { toast } from 'sonner';

import { cn } from '@/lib/utils';
import { Drawer } from '@/components/ui/Drawer';
import { Button } from '@/components/ui/Button';
import { Skeleton } from '@/components/ui/Skeleton';
import { EmptyState } from '@/components/ui/EmptyState';
import { useFocusSessions } from '@/hooks/useFocusSessions';
import { SessionDetailSheet } from '@/components/focus/SessionDetailSheet';
import { DaySummary } from '@/components/focus/DaySummary';
import { FocusWeekPanel } from '@/components/focus/FocusWeekPanel';
import { FOCUS_END_REASON_LABELS, type FocusSessionRow } from '@/types/focus';

type Tab = 'sessions' | 'stats';

/** Group headings, in the user's own words rather than a weekday index. */
function dayLabel(dateKey: string): string {
  const [y, m, d] = dateKey.split('-').map(Number);
  if (!y || !m || !d) return dateKey;
  const then = new Date(Date.UTC(y, m - 1, d));
  const today = new Date();
  const todayKey = `${today.getUTCFullYear()}-${String(today.getUTCMonth() + 1).padStart(2, '0')}-${String(today.getUTCDate()).padStart(2, '0')}`;
  if (dateKey === todayKey) return 'Today';
  const yesterday = new Date(today.getTime() - 86_400_000);
  const yKey = `${yesterday.getUTCFullYear()}-${String(yesterday.getUTCMonth() + 1).padStart(2, '0')}-${String(yesterday.getUTCDate()).padStart(2, '0')}`;
  if (dateKey === yKey) return 'Yesterday';
  return then.toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  });
}

function minutes(row: FocusSessionRow): number {
  return row.actualDuration ?? row.plannedDuration;
}

export function SessionsDrawer({
  open,
  onOpenChange,
  initialTab = 'sessions',
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Which tab to show on open. Lets `/focus?panel=stats` deep-link from the palette. */
  initialTab?: Tab;
}) {
  const [tab, setTab] = useState<Tab>(initialTab);

  // Follow the prop when the drawer is re-opened from a different deep link. Keyed
  // on `open` rather than `initialTab` so a change to the tab *inside* the drawer is
  // not yanked back the moment the URL happens to disagree.
  useEffect(() => {
    if (open) setTab(initialTab);
  }, [open, initialTab]);
  const [query, setQuery] = useState('');
  const [type, setType] = useState<string>('');
  const [status, setStatus] = useState<string>('');
  const [selected, setSelected] = useState<FocusSessionRow | null>(null);

  const filters = useMemo(
    () => ({ ...(type ? { type } : {}), ...(status ? { status } : {}) }),
    [type, status]
  );
  const { rows, loading, loadingMore, error, hasMore, retry, loadMore } =
    useFocusSessions(filters);

  // Search is client-side over the loaded page only. A server-side search would
  // need its own index and its own debounce, and until the user has more history
  // than fits in a couple of pages the loaded set is the honest answer. The input
  // says so rather than implying a full-text search it is not.
  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return rows;
    return rows.filter((row) => row.title.toLowerCase().includes(needle));
  }, [rows, query]);

  const grouped = useMemo(() => {
    const map = new Map<string, FocusSessionRow[]>();
    for (const row of visible) {
      const started = new Date(row.startedAt);
      const key = Number.isNaN(started.getTime())
        ? 'unknown'
        : `${started.getFullYear()}-${String(started.getMonth() + 1).padStart(2, '0')}-${String(started.getDate()).padStart(2, '0')}`;
      const list = map.get(key);
      if (list) list.push(row);
      else map.set(key, [row]);
    }
    return Array.from(map.entries());
  }, [visible]);

  const hasFilters = Boolean(type || status || query.trim());

  return (
    <>
      <Drawer
        open={open}
        onOpenChange={onOpenChange}
        side="right"
        title="Focus history"
        description="Every session you have run, and what became of it."
      >
        {/* Tabs as real tabs: roving tabindex and arrow keys, not two buttons that
            merely look like tabs. The old page had no tab semantics at all. */}
        <div
          role="tablist"
          aria-label="History view"
          className="mb-4 inline-flex gap-1 rounded-full border border-border bg-muted/40 p-1"
          onKeyDown={(event) => {
            if (event.key !== 'ArrowRight' && event.key !== 'ArrowLeft') return;
            event.preventDefault();
            setTab((prev) => (prev === 'sessions' ? 'stats' : 'sessions'));
          }}
        >
          {(
            [
              { id: 'sessions' as const, label: 'Sessions', icon: History },
              { id: 'stats' as const, label: 'Stats', icon: LineChart },
            ] satisfies Array<{ id: Tab; label: string; icon: typeof History }>
          ).map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={tab === id}
              aria-controls={`focus-history-panel-${id}`}
              tabIndex={tab === id ? 0 : -1}
              onClick={() => setTab(id)}
              className={cn(
                'tap-target inline-flex min-h-9 items-center gap-1.5 rounded-full px-3 text-xs font-medium transition-colors',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2',
                tab === id ? 'bg-background text-foreground shadow-flat' : 'text-muted-foreground'
              )}
            >
              <Icon className="h-3.5 w-3.5" aria-hidden="true" />
              {label}
            </button>
          ))}
        </div>

        <div
          role="tabpanel"
          id={`focus-history-panel-${tab}`}
          aria-labelledby={`focus-history-panel-${tab}`}
        >
          {tab === 'stats' ? (
            <>
              <DaySummary />
              <div className="mt-4">
                <FocusWeekPanel />
              </div>
            </>
          ) : (
            <>
              <div className="mb-4 flex flex-wrap items-center gap-2">
                <label className="relative flex-1 min-w-40">
                  <span className="sr-only">Search loaded sessions</span>
                  <Search
                    className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
                    aria-hidden="true"
                  />
                  <input
                    type="search"
                    value={query}
                    placeholder="Search this page"
                    onChange={(event) => setQuery(event.target.value)}
                    className="h-10 w-full rounded-full border border-border bg-background/60 pl-9 pr-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                  />
                </label>

                <label className="sr-only" htmlFor="focus-filter-type">
                  Filter by type
                </label>
                <select
                  id="focus-filter-type"
                  value={type}
                  onChange={(event) => setType(event.target.value)}
                  className="tap-target h-10 rounded-full border border-border bg-background/60 px-3 text-xs"
                >
                  <option value="">All types</option>
                  <option value="FOCUS">Focus</option>
                  <option value="STOPWATCH">Stopwatch</option>
                  <option value="SHORT_BREAK">Short break</option>
                  <option value="LONG_BREAK">Long break</option>
                </select>

                <label className="sr-only" htmlFor="focus-filter-status">
                  Filter by status
                </label>
                <select
                  id="focus-filter-status"
                  value={status}
                  onChange={(event) => setStatus(event.target.value)}
                  className="tap-target h-10 rounded-full border border-border bg-background/60 px-3 text-xs"
                >
                  <option value="">All outcomes</option>
                  <option value="COMPLETED">Completed</option>
                  <option value="ABORTED">Stopped early</option>
                  <option value="PAUSED">Paused</option>
                  <option value="IN_PROGRESS">Running</option>
                </select>
              </div>

              {error ? (
                <div
                  role="alert"
                  className="rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive"
                >
                  <p>{error}</p>
                  <Button variant="outline" size="sm" className="mt-3" onClick={retry}>
                    Retry
                  </Button>
                </div>
              ) : loading ? (
                // Skeletons that match the row shape, so nothing jumps when the
                // real rows land.
                <div className="space-y-2" aria-busy="true" aria-label="Loading sessions">
                  {[0, 1, 2, 3].map((i) => (
                    <Skeleton key={i} className="h-14 w-full rounded-lg" />
                  ))}
                </div>
              ) : visible.length === 0 ? (
                hasFilters ? (
                  <EmptyState
                    icon={<Search className="h-10 w-10 text-muted-foreground/50" aria-hidden="true" />}
                    title="No sessions match"
                    description="Nothing on this page matches those filters."
                    action={
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          setQuery('');
                          setType('');
                          setStatus('');
                        }}
                      >
                        Clear filters
                      </Button>
                    }
                  />
                ) : (
                  <EmptyState
                    icon={<History className="h-10 w-10 text-muted-foreground/50" aria-hidden="true" />}
                    title="No sessions yet"
                    description="Run your first focus block and it will show up here."
                  />
                )
              ) : (
                <div className="space-y-6">
                  {grouped.map(([dateKey, groupRows]) => (
                    <section key={dateKey} aria-label={dayLabel(dateKey)}>
                      <h3 className="mb-2 flex items-baseline justify-between gap-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                        <span>{dayLabel(dateKey)}</span>
                        <span className="tabular-nums normal-case">
                          {groupRows.reduce((sum, row) => sum + minutes(row), 0)} min
                        </span>
                      </h3>
                      <ul className="divide-y divide-border rounded-xl border border-border">
                        {groupRows.map((row) => (
                          <li key={row.id}>
                            <button
                              type="button"
                              onClick={() => setSelected(row)}
                              className="flex w-full items-center justify-between gap-3 px-3 py-2.5 text-left transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary"
                            >
                              <span className="min-w-0">
                                <span className="block truncate text-sm font-medium text-foreground">
                                  {row.title || 'Focus session'}
                                </span>
                                <span className="block text-xs text-muted-foreground">
                                  {new Date(row.startedAt).toLocaleTimeString(undefined, {
                                    hour: '2-digit',
                                    minute: '2-digit',
                                  })}
                                  {row.category ? ` · ${row.category.name}` : ''}
                                </span>
                              </span>
                              <span className="flex shrink-0 items-center gap-2">
                                <span className="text-sm tabular-nums text-muted-foreground">
                                  {minutes(row)}m
                                </span>
                                <OutcomeBadge row={row} />
                              </span>
                            </button>
                          </li>
                        ))}
                      </ul>
                    </section>
                  ))}

                  {hasMore && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="w-full"
                      onClick={loadMore}
                      disabled={loadingMore}
                    >
                      {loadingMore && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />}
                      Load more
                    </Button>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      </Drawer>

      {/* Keyed on the id so a different row remounts the sheet with a fresh form.
          Without the key the sheet would have to reset itself in an effect, and an
          incoming refetch — the drawer reloads whenever a session ends — would
          wipe out a note someone was in the middle of writing. */}
      {selected && (
        <SessionDetailSheet
          key={selected.id}
          session={selected}
          open
          onClose={() => setSelected(null)}
          onDeleted={() => {
            setSelected(null);
            toast.success('Session deleted');
          }}
        />
      )}
    </>
  );
}

/**
 * Outcome as icon **and** text, never colour alone.
 *
 * The old page used a green/amber badge and nothing else, which is invisible to
 * anyone who cannot distinguish those hues and meaningless to a screen reader.
 */
function OutcomeBadge({ row }: { row: FocusSessionRow }) {
  const label =
    row.endReason !== null
      ? FOCUS_END_REASON_LABELS[row.endReason]
      : row.completedAt
        ? 'Completed'
        : row.abortedAt
          ? 'Stopped'
          : 'Running';

  const tone =
    label === 'Completed'
      ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300'
      : label === 'Running'
        ? 'bg-primary/15 text-primary'
        : 'bg-muted text-muted-foreground';

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium',
        tone
      )}
    >
      {label === 'Completed' ? <Check className="h-3 w-3" aria-hidden="true" /> : null}
      {label === 'Stopped' ? <Square className="h-3 w-3" aria-hidden="true" /> : null}
      {label}
    </span>
  );
}

export default SessionsDrawer;
