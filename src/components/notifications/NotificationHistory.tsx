'use client';

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  Archive,
  ArrowLeft,
  ArrowUpRight,
  Bell,
  CheckCheck,
  Loader2,
  Settings,
  X,
} from 'lucide-react';
import { apiRequest } from '@/lib/api-client';
import { submitOrQueue } from '@/lib/offline/outbox';
import {
  CATEGORY_META,
  CATEGORY_ORDER,
  PERIOD_FILTERS,
  normaliseTag,
  type NotificationCategory,
  type PeriodFilter,
} from '@/lib/notifications/categories';
import {
  bumpUnread,
  getServerUnreadSnapshot,
  getUnreadSnapshot,
  refreshUnread,
  setUnread as setSharedUnread,
  subscribeUnread,
} from '@/lib/notifications/unread-store';
import { cn } from '@/lib/utils';

interface Row {
  id: string;
  type: string;
  category: NotificationCategory;
  title: string;
  body: string | null;
  actionUrl: string | null;
  scheduledFor: string;
  sentAt: string | null;
  readAt: string | null;
  status: string;
  errorMessage: string | null;
  /** Category tag + the user's own block label (DSA, Personal, …) + entity. */
  tags: string[];
  userCategory: string | null;
  /** The scheduler's own buttons, so a question can be answered right here. */
  actions: Array<{ action: string; title: string }>;
  /** Set once answered; the buttons then stop being offered. */
  respondedAt: string | null;
}

interface Response {
  notifications: Row[];
  unreadCount: number;
  total: number;
  hasMore: boolean;
  counts: Record<NotificationCategory, number>;
  /** Every tag present in the current window, lowercased, with counts. */
  tagCounts: Record<string, number>;
  timezone: string;
}

/**
 * Every field below is optional on purpose.
 *
 * `getHistory` guarantees all of them, but this page must not be able to
 * white-screen on a payload it did not expect - a missing `counts` used to
 * throw on the very first render (`counts[c]`) and take the whole route down.
 * Each one degrades to the empty value rather than to `undefined`.
 */
type PartialResponse = Partial<Response>;

const PAGE_SIZE = 25;

const CATEGORIES = new Set<string>(CATEGORY_ORDER);

function zeroCounts(): Record<NotificationCategory, number> {
  return Object.fromEntries(CATEGORY_ORDER.map((c) => [c, 0])) as Record<
    NotificationCategory,
    number
  >;
}

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/**
 * "4h ago" / "in 2d", falling back to a clock time past a week.
 *
 * `18/10/2026, 20:00:00` is the machine's answer to "when", not a reader's -
 * it forces a date-parse on every row and tells a scanning eye nothing. The
 * exact timestamp stays on the `title` and in `dateTime`, so it is still
 * reachable and still copyable.
 */
function relativeTime(iso: string): string {
  const then = new Date(iso);
  const delta = then.getTime() - Date.now();
  const past = delta < 0;
  const abs = Math.abs(delta);

  if (abs < MINUTE) return 'just now';
  if (abs < HOUR) {
    const n = Math.round(abs / MINUTE);
    return past ? `${n}m ago` : `in ${n}m`;
  }
  if (abs < DAY) {
    const n = Math.round(abs / HOUR);
    return past ? `${n}h ago` : `in ${n}h`;
  }
  if (abs < 7 * DAY) {
    const n = Math.round(abs / DAY);
    return past ? `${n}d ago` : `in ${n}d`;
  }
  return then.toLocaleString(undefined, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: 'numeric',
    minute: '2-digit',
  });
}

/**
 * Heading for the day a notification falls on: "Today", "Yesterday", otherwise
 * the weekday and date. Everything older already collapsed into the relative
 * time on the row, so the heading only has to separate the pile it sits in.
 */
function dayLabel(date: Date): string {
  const startOf = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const days = Math.round((startOf(new Date()) - startOf(date)) / DAY);
  if (days === 0) return 'Today';
  if (days === 1) return 'Yesterday';
  return date.toLocaleDateString(undefined, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: date.getFullYear() === new Date().getFullYear() ? undefined : 'numeric',
  });
}

/**
 * Contiguous runs of rows sharing a calendar day.
 *
 * The rows arrive newest-first and already sorted, so grouping is a linear pass
 * rather than a sort - and a day heading inside one list is what stops 140 rows
 * reading as one undifferentiated wall.
 */
function groupByDay(rows: Row[]): Array<{ key: string; label: string; rows: Row[] }> {
  const groups: Array<{ key: string; label: string; rows: Row[] }> = [];
  for (const row of rows) {
    const date = new Date(row.scheduledFor);
    const key = `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
    const last = groups[groups.length - 1];
    if (last && last.key === key) last.rows.push(row);
    else groups.push({ key, label: dayLabel(date), rows: [row] });
  }
  return groups;
}

/**
 * Full notification history at `/notifications`.
 *
 * ERROR.md L asked for the navbar bell to show notification history with
 * category and period filters. The bell now navigates here directly, so this
 * page owns the whole experience:
 *
 *   * a **settings** icon at the top, because the bell no longer doubles as the
 *     route to /settings/notifications and that link would otherwise be
 *     unreachable;
 *   * period filters (All / Day / Week / Month / Year) computed in the user's
 *     own timezone;
 *   * category filters with live counts;
 *   * server-side paging, so the DOM stays bounded regardless of history size.
 *
 * It also owns the badge. Opening the page is itself an acknowledgement of
 * everything in it, so the first load marks the lot read and publishes 0 to the
 * shared unread store — the bell in the header clears in the same tick rather
 * than on its next 60-second poll.
 */
export function NotificationHistory({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const router = useRouter();

  const [rows, setRows] = useState<Row[]>([]);
  const [counts, setCounts] = useState<Record<NotificationCategory, number>>(zeroCounts);
  /**
   * Unread count for **this view** — the number that belongs beside the filter
   * chips the user is looking at. It is separate from the account-wide count on
   * purpose: filtering to "Sleep" must not shrink the badge to Sleep's share.
   */
  const [viewUnread, setViewUnread] = useState(0);
  const [total, setTotal] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [category, setCategory] = useState<NotificationCategory | undefined>(undefined);
  const [tag, setTag] = useState<string | undefined>(undefined);
  const [tagCounts, setTagCounts] = useState<Record<string, number>>({});
  const [period, setPeriod] = useState<PeriodFilter>('all');
  const [offset, setOffset] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  /** The id of the row whose action button is in flight, for a spinner + disable. */
  const [pendingId, setPendingId] = useState<string | null>(null);
  /** "Clear all" is destructive and has no undo, so it takes two clicks. */
  const [clearArmed, setClearArmed] = useState(false);
  /** Opening the page clears the badge exactly once per visit. */
  const autoCleared = useRef(false);

  // Read the initial filters from the URL once, so the bell can deep-link into a
  // pre-filtered view.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const sp = await searchParams;
      if (cancelled) return;
      const c = typeof sp.category === 'string' ? sp.category : undefined;
      if (c && CATEGORIES.has(c)) setCategory(c as NotificationCategory);
      const p = typeof sp.period === 'string' ? sp.period : 'all';
      if (PERIOD_FILTERS.some((f) => f.value === p)) setPeriod(p as PeriodFilter);
      const t = typeof sp.tag === 'string' ? sp.tag : undefined;
      if (t) setTag(t);
      setReady(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [searchParams]);

  /**
   * The account-wide unread count, owned by the shared store.
   *
   * Read rather than mirrored: the bell in the layout writes to the same store,
   * so a reminder delivered while this page is open raises the badge *and* the
   * line above the list in one render. Two `useState`s could only ever agree by
   * coincidence.
   */
  const unread = useSyncExternalStore(
    subscribeUnread,
    getUnreadSnapshot,
    getServerUnreadSnapshot
  );

  /**
   * Mark everything read — locally for instant feedback, on the server for the
   * next reader, and in the shared store so the bell clears with it.
   *
   * Deliberately no `load()` at the end. The list is already correct: every row
   * just gained a `readAt`, and refetching would only throw away the pages the
   * user had pulled in with "Load more".
   */
  const clearUnread = useCallback(async () => {
    const now = new Date().toISOString();
    setRows((prev) => prev.map((r) => (r.readAt ? r : { ...r, readAt: now })));
    setViewUnread(0);
    setSharedUnread(0);
    try {
      await apiRequest('/api/notifications', {
        method: 'POST',
        body: { action: 'markAllRead' },
      });
    } catch (err) {
      // The dots return on the next load, which is the honest outcome: the
      // server did not agree, so the page should not keep claiming otherwise.
      setError(err instanceof Error ? err.message : 'Could not mark notifications as read');
    }
  }, []);

  const load = useCallback(
    async (nextOffset: number, append: boolean) => {
      if (append) setLoadingMore(true);
      else setLoading(true);
      setError(null);

      const params = new URLSearchParams({
        limit: String(PAGE_SIZE),
        offset: String(nextOffset),
        period,
      });
      if (category) params.set('category', category);
      if (tag) params.set('tag', tag);

      const unfiltered = category === undefined && tag === undefined && period === 'all';

      try {
        const data = await apiRequest<PartialResponse>(`/api/notifications?${params}`);
        const next = data.notifications ?? [];
        const serverUnread = data.unreadCount ?? 0;
        setRows((prev) => (append ? [...prev, ...next] : next));
        setCounts((prev) => ({ ...prev, ...(data.counts ?? {}) }));
        setTagCounts(data.tagCounts ?? {});
        setTotal(data.total ?? next.length);
        setHasMore(data.hasMore ?? false);
        setOffset(nextOffset);
        setViewUnread(serverUnread);
        // An unfiltered read already carries the account-wide number, so it can
        // publish it directly. A filtered one only knows its own slice and must
        // leave the badge alone rather than shrink it to Sleep's share.
        if (unfiltered) setSharedUnread(serverUnread);

        // Opening the page *is* an acknowledgement of everything in it, so the
        // badge is cleared once per visit rather than left for the user to press
        // a button they should not have to know exists.
        //
        // This waits for the first load to settle (hence the placement after the
        // `await`) and takes the global count, not this view's: arriving on
        // `?category=sleep` must still clear a badge that says 23.
        if (!autoCleared.current) {
          autoCleared.current = true;
          const globalUnread = unfiltered ? serverUnread : await refreshUnread();
          if (globalUnread > 0) void clearUnread();
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Could not load notifications');
      } finally {
        setLoading(false);
        setLoadingMore(false);
      }
    },
    [category, tag, period, clearUnread]
  );

  useEffect(() => {
    if (!ready) return;
    void load(0, false);
  }, [ready, load]);

  const applyFilter = useCallback(
    (next: {
      category?: NotificationCategory | undefined;
      period?: PeriodFilter;
      tag?: string | undefined;
    }) => {
      const c = 'category' in next ? next.category : category;
      const p = next.period ?? period;
      const t = 'tag' in next ? next.tag : tag;
      setCategory(c);
      setPeriod(p);
      setTag(t);
      const params = new URLSearchParams();
      if (c) params.set('category', c);
      if (p !== 'all') params.set('period', p);
      if (t) params.set('tag', t);
      const qs = params.toString();
      router.replace(qs ? `/notifications?${qs}` : '/notifications');
    },
    [category, period, tag, router]
  );

  /** Display label for a tag key, preferring the row's own capitalisation. */
  const tagLabel = useCallback(
    (key: string) => {
      for (const r of rows) {
        const match = r.tags.find((t) => normaliseTag(t) === key);
        if (match) return match;
      }
      return key.charAt(0).toUpperCase() + key.slice(1);
    },
    [rows]
  );

  /** Fixed domain tags first, then the user's own labels, then the rest. */
  const orderedTags = useMemo(() => {
    const fixed = new Set(CATEGORY_ORDER.map((c) => CATEGORY_META[c].tag.toLowerCase()));
    return Object.keys(tagCounts).sort((a, b) => {
      const fa = fixed.has(a) ? 0 : 1;
      const fb = fixed.has(b) ? 0 : 1;
      if (fa !== fb) return fa - fb;
      return (tagCounts[b] ?? 0) - (tagCounts[a] ?? 0) || a.localeCompare(b);
    });
  }, [tagCounts]);

  /**
   * Take a row out of the local view after the server accepted a dismiss.
   *
   * `total` and the category chip counts move with it, otherwise the chips keep
   * claiming a row that is no longer in the list.
   */
  const dropRow = useCallback(
    (id: string, row: Row) => {
      setRows((prev) => prev.filter((r) => r.id !== id));
      setTotal((prev) => Math.max(0, prev - 1));
      setCounts((prev) => ({
        ...prev,
        [row.category]: Math.max(0, (prev[row.category] ?? 0) - 1),
      }));
      const wasUnread = !row.readAt;
      if (wasUnread) {
        setViewUnread((prev) => Math.max(0, prev - 1));
        bumpUnread(-1);
      }
    },
    []
  );

  /** Per-row "take this away". */
  const dismissRow = useCallback(
    async (row: Row) => {
      setPendingId(row.id);
      setError(null);
      try {
        await apiRequest(`/api/notifications/${row.id}`, {
          method: 'PATCH',
          body: { action: 'dismiss' },
        });
        dropRow(row.id, row);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Could not dismiss that notification');
      } finally {
        setPendingId(null);
      }
    },
    [dropRow]
  );

  /**
   * Bulk "take all of it away".
   *
   * The list is emptied locally rather than reloaded: `dismissAll` is one
   * statement server-side, so there is nothing to re-read and nothing to page
   * through — the view is simply over.
   */
  const dismissAllRows = useCallback(async () => {
    setError(null);
    try {
      await apiRequest('/api/notifications', {
        method: 'POST',
        body: { action: 'dismissAll' },
      });
      setRows([]);
      setCounts(zeroCounts());
      setTagCounts({});
      setTotal(0);
      setHasMore(false);
      setOffset(0);
      setViewUnread(0);
      setSharedUnread(0);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not clear notifications');
    } finally {
      setClearArmed(false);
    }
  }, []);

  /**
   * Answer a button the scheduler attached to a row.
   *
   * Three shapes come back, and each one changes the list differently:
   *   * a snooze (`SNOOZE` / `NOT_YET` / `EXTEND`) moves the row in time, so only
   *     `scheduledFor` changes and it stays where it is;
   *   * `SKIP` dismisses it, so it leaves;
   *   * everything else answers the question, so the row gains a `readAt` and a
   *     `respondedAt` and stops offering buttons.
   */
  const runAction = useCallback(
    async (row: Row, action: string) => {
      setPendingId(row.id);
      setError(null);
      const now = new Date().toISOString();
      try {
        /*
         * Sent through the outbox, not `apiRequest`, so a button pressed on a
         * flaky connection is queued and replayed instead of showing the user an
         * error for something that will land later. `answeredAt` is the absolute
         * instant *now* — the server derives the displayed `HH:mm` from it in the
         * user's zone, which is what makes a 00:30 press for an evening block
         * land on the right day.
         *
         * The result body is unavailable on this path (the queue owns retries),
         * so the row is updated optimistically from `now` — which is exactly what
         * the server would have echoed back.
         */
        const { delivered, queued } = await submitOrQueue({
          url: '/api/notifications/action',
          method: 'POST',
          body: { notificationId: row.id, action, answeredAt: now },
          label: 'Notification action',
        });

        if (!delivered && !queued) {
          // A 4xx is the user's problem to fix, not something to retry.
          setError('That action could not be sent');
          return;
        }

        // A snooze answers nothing, so the row keeps its unread dot and its
        // buttons — only its next appearance moves. The exact new time is
        // server-side (10 minutes); reflect it approximately offline.
        if (action === 'SNOOZE' || action === 'NOT_YET' || action === 'EXTEND') {
          const snoozedAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();
          setRows((prev) =>
            prev.map((r) => (r.id === row.id ? { ...r, scheduledFor: snoozedAt } : r))
          );
          return;
        }

        if (action === 'SKIP') {
          dropRow(row.id, row);
          return;
        }

        const wasUnread = !row.readAt;
        setRows((prev) =>
          prev.map((r) =>
            r.id === row.id
              ? {
                  ...r,
                  readAt: r.readAt ?? now,
                  respondedAt: now,
                }
              : r
          )
        );
        if (wasUnread) {
          setViewUnread((prev) => Math.max(0, prev - 1));
          bumpUnread(-1);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'That action could not be sent');
      } finally {
        setPendingId(null);
      }
    },
    [dropRow]
  );

  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-6 sm:px-6 sm:py-8">
      <header className="mb-6">
        <Link
          href="/today"
          className="mb-3 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          Back to today
        </Link>

        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
              <Bell className="h-6 w-6 text-primary" aria-hidden="true" />
              Notifications
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {loading ? 'Loading…' : `${total} in this view`}
              {/* `viewUnread` = how many of *these* rows are still unanswered. */}
              {viewUnread > 0 ? ` · ${viewUnread} not yet answered` : ''}
            </p>
          </div>

          <div className="flex items-center gap-2">
            {unread > 0 && (
              <button
                type="button"
                onClick={() => void clearUnread()}
                className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-sm font-medium text-foreground transition-colors hover:bg-muted"
              >
                <CheckCheck className="h-4 w-4" aria-hidden="true" />
                Mark all as read
              </button>
            )}

            {/*
              Bulk management, in two steps: there is no undo for a dismiss and
              no endpoint that can reverse one, so the second click is the
              confirmation rather than a dialog the eye skips over.
            */}
            {total > 0 &&
              (clearArmed ? (
                <>
                  <button
                    type="button"
                    onClick={() => void dismissAllRows()}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-destructive px-3 py-2 text-sm font-medium text-destructive-foreground transition-colors hover:opacity-90"
                  >
                    <Archive className="h-4 w-4" aria-hidden="true" />
                    Confirm clear
                  </button>
                  <button
                    type="button"
                    onClick={() => setClearArmed(false)}
                    className="inline-flex items-center rounded-lg border border-border px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted"
                  >
                    Cancel
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  onClick={() => setClearArmed(true)}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-sm font-medium text-foreground transition-colors hover:bg-muted"
                >
                  <Archive className="h-4 w-4" aria-hidden="true" />
                  Clear all
                </button>
              ))}

            {/*
              The bell now navigates here, so it no longer doubles as the route
              to notification settings. This gear keeps that reachable.
            */}
            <Link
              href="/settings/notifications"
              title="Notification settings"
              aria-label="Notification settings"
              className="flex h-10 w-10 items-center justify-center rounded-lg border border-border text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <Settings className="h-4 w-4" aria-hidden="true" />
            </Link>
          </div>
        </div>
      </header>

      {/* Period filter */}
      <div className="mb-3 flex flex-wrap gap-1.5">
        {PERIOD_FILTERS.map((f) => (
          <button
            key={f.value}
            type="button"
            onClick={() => applyFilter({ period: f.value })}
            aria-pressed={period === f.value}
            className={cn(
              'rounded-full px-3 py-1.5 text-sm font-medium transition-colors',
              period === f.value
                ? 'bg-primary text-primary-foreground'
                : 'bg-muted text-muted-foreground hover:text-foreground'
            )}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* Category filter */}
      <div className="mb-6 flex flex-wrap gap-1.5">
        <button
          type="button"
          onClick={() => applyFilter({ category: undefined })}
          aria-pressed={category === undefined}
          className={cn(
            'rounded-full px-3 py-1.5 text-sm font-medium transition-colors',
            category === undefined
              ? 'bg-primary text-primary-foreground'
              : 'bg-muted text-muted-foreground hover:text-foreground'
          )}
        >
          All categories
        </button>
        {CATEGORY_ORDER.map((c) => {
          const meta = CATEGORY_META[c];
          const n = counts[c] ?? 0;
          if (n === 0 && category !== c) return null;
          return (
            <button
              key={c}
              type="button"
              onClick={() => applyFilter({ category: c })}
              aria-pressed={category === c}
              className={cn(
                'rounded-full px-3 py-1.5 text-sm font-medium transition-colors',
                category === c ? 'bg-primary text-primary-foreground' : meta.chipClass
              )}
            >
              {meta.label}
              {n > 0 && <span className="ml-1.5 tabular-nums opacity-70">{n}</span>}
            </button>
          );
        })}
      </div>

      {/*
        Tag filter — the labels the user set on their routine blocks (DSA,
        Personal, GATE, College, Health, …) plus the fixed domain tags, all
        filterable together. This sits below the category filter so both can be
        combined: e.g. category=Routine + tag=DSA.
      */}
      {orderedTags.length > 0 && (
        <div className="mb-6 flex flex-wrap items-center gap-1.5">
          <span className="mr-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Tags
          </span>
          <button
            type="button"
            onClick={() => applyFilter({ tag: undefined })}
            aria-pressed={tag === undefined}
            className={cn(
              'rounded-full px-2.5 py-1 text-xs font-medium transition-colors',
              tag === undefined
                ? 'bg-primary text-primary-foreground'
                : 'bg-muted text-muted-foreground hover:text-foreground'
            )}
          >
            All tags
          </button>
          {orderedTags.map((key) => {
            const n = tagCounts[key] ?? 0;
            const active = tag !== undefined && normaliseTag(tag) === key;
            return (
              <button
                key={key}
                type="button"
                onClick={() => applyFilter({ tag: active ? undefined : key })}
                aria-pressed={active}
                className={cn(
                  'rounded-full px-2.5 py-1 text-xs font-medium transition-colors',
                  active
                    ? 'bg-primary text-primary-foreground'
                    : CATEGORY_META[
                        (CATEGORY_ORDER.find(
                          (c) => CATEGORY_META[c].tag.toLowerCase() === key
                        ) ?? 'system') as NotificationCategory
                      ].chipClass
                )}
              >
                {tagLabel(key)}
                {n > 0 && <span className="ml-1 tabular-nums opacity-70">{n}</span>}
              </button>
            );
          })}
        </div>
      )}

      {error && (
        <div className="mb-4 rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3">
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
          <button
            type="button"
            onClick={() => void load(0, false)}
            className="mt-2 text-sm font-semibold text-primary hover:underline"
          >
            Try again
          </button>
        </div>
      )}

      {loading ? (
        <ul className="space-y-2" aria-busy="true" aria-label="Loading notifications">
          {Array.from({ length: 6 }).map((_, i) => (
            <li key={i} className="h-20 animate-pulse rounded-xl bg-muted/60" />
          ))}
        </ul>
      ) : rows.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-xl border-2 border-dashed border-border bg-muted/30 px-6 py-16 text-center">
          <Bell className="h-10 w-10 text-muted-foreground/50" aria-hidden="true" />
          <p className="text-base font-medium text-foreground">No notifications here</p>
          <p className="max-w-sm text-sm text-muted-foreground">
            Nothing matches this category and period. Try a wider filter.
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          {groupByDay(rows).map((group) => (
            <section key={group.key} aria-label={group.label}>
              <h2 className="sticky top-0 z-10 -mx-1 mb-2 bg-background/90 px-1 py-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground backdrop-blur">
                {group.label}
              </h2>
              <ul className="space-y-2">
                {group.rows.map((n) => {
                  const meta = CATEGORY_META[n.category] ?? CATEGORY_META.system;
                  const isUnread = !n.readAt;
                  const when = new Date(n.scheduledFor);
                  return (
                    <li key={n.id}>
                      <div
                        className={cn(
                          'flex items-start gap-3 rounded-xl border px-4 py-3 transition-colors',
                          isUnread ? 'border-primary/30 bg-primary/5' : 'border-border bg-card'
                        )}
                      >
                        <span
                          className={cn(
                            'mt-1.5 h-2 w-2 shrink-0 rounded-full',
                            isUnread ? 'bg-primary' : 'bg-muted-foreground/30'
                          )}
                          aria-hidden="true"
                        />
                        <div className="min-w-0 flex-1">
                          <p
                            className={cn(
                              'text-sm',
                              isUnread ? 'font-semibold text-foreground' : 'text-foreground'
                            )}
                          >
                            {n.title}
                          </p>
                          {n.body && (
                            <p className="mt-0.5 text-sm text-muted-foreground">{n.body}</p>
                          )}
                          <div className="mt-2 flex flex-wrap items-center gap-1.5">
                            {/*
                              Tags come from the API, not recomputed here, so the
                              user's own block label (DSA, Personal, …) is shown. It is
                              highlighted so it is visually distinct from the fixed
                              category tag.
                            */}
                            {n.tags.map((t) => {
                              const isUserTag = n.userCategory !== null && t === n.userCategory;
                              return (
                                <span
                                  key={t}
                                  className={cn(
                                    'rounded-full px-2 py-0.5 text-[11px] font-medium',
                                    isUserTag
                                      ? 'bg-primary/15 text-primary'
                                      : meta.chipClass
                                  )}
                                >
                                  {t}
                                </span>
                              );
                            })}
                            {n.status === 'FAILED' && (
                              <span className="rounded-full bg-destructive/15 px-2 py-0.5 text-[11px] font-medium text-destructive">
                                Not delivered
                              </span>
                            )}
                            <time
                              className="text-[11px] text-muted-foreground/80"
                              dateTime={n.scheduledFor}
                              title={when.toLocaleString()}
                            >
                              {relativeTime(n.scheduledFor)}
                              <span className="sr-only"> ({when.toLocaleString()})</span>
                            </time>
                          </div>

                          {/*
                            The question the reminder was asking, answered right
                            here. These are the scheduler's own buttons — "Yes, at
                            05:00", "Finished earlier", "Don't want to do it" — the
                            same ones the push notification carries, which the page
                            previously threw away: the only way to respond was to
                            open /today and find the block yourself.

                            Hidden once `respondedAt` is set, so a "Did you start
                            Nap?" from yesterday cannot be answered twice and write
                            a second RoutineLog over the first.
                          */}
                          {!n.respondedAt && n.actions.length > 0 && (
                            <div className="mt-2.5 flex flex-wrap gap-1.5">
                              {n.actions.map((a) => {
                                const busy = pendingId === n.id;
                                return (
                                  <button
                                    key={a.action}
                                    type="button"
                                    disabled={busy}
                                    onClick={() => void runAction(n, a.action)}
                                    className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-background px-2.5 py-1.5 text-xs font-medium text-foreground transition-colors hover:border-primary/40 hover:bg-primary/10 disabled:opacity-60"
                                  >
                                    {busy && (
                                      <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" />
                                    )}
                                    {a.title}
                                  </button>
                                );
                              })}
                            </div>
                          )}
                        </div>

                        {/*
                          Icon-only rather than a word on every row: with an "Open"
                          on all 140 cards the affordance carried no information -
                          it was a column of identical red ink. Hidden entirely when
                          there is nowhere to go.
                        */}
                        {n.actionUrl && (
                          <Link
                            href={n.actionUrl}
                            title="Open"
                            aria-label={`Open: ${n.title}`}
                            className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center self-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                          >
                            <ArrowUpRight className="h-4 w-4" aria-hidden="true" />
                          </Link>
                        )}

                        {/*
                          Per-row dismiss, icon-only for the same reason. Before
                          this the only bulk option was "mark as read", which left
                          every row on screen and let a 140-row backlog grow
                          forever.
                        */}
                        <button
                          type="button"
                          onClick={() => void dismissRow(n)}
                          disabled={pendingId === n.id}
                          title="Dismiss"
                          aria-label={`Dismiss: ${n.title}`}
                          className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center self-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-destructive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60"
                        >
                          {pendingId === n.id ? (
                            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                          ) : (
                            <X className="h-4 w-4" aria-hidden="true" />
                          )}
                        </button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
        </div>
      )}

      {hasMore && (
        <div className="mt-6 text-center">
          <button
            type="button"
            onClick={() => void load(offset + PAGE_SIZE, true)}
            disabled={loadingMore}
            className="inline-flex items-center gap-2 rounded-lg border border-border px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-muted disabled:opacity-60"
          >
            {loadingMore && <Loader2 className="h-4 w-4 animate-spin" />}
            Load {Math.min(PAGE_SIZE, total - rows.length)} more
          </button>
        </div>
      )}

      {ready && !loading && rows.length > 0 && !hasMore && (
        <p className="mt-6 text-center text-sm text-muted-foreground">
          That&rsquo;s everything in this view.
        </p>
      )}
    </div>
  );
}
