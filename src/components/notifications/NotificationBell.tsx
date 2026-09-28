'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { Bell, Check, CheckCheck, X } from 'lucide-react';
import { apiRequest } from '@/lib/api-client';
import {
  CATEGORY_META,
  CATEGORY_ORDER,
  PERIOD_FILTERS,
  tagsFor,
  type NotificationCategory,
  type PeriodFilter,
} from '@/lib/notifications/categories';
import { cn } from '@/lib/utils';

interface NotificationRow {
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
}

interface HistoryResponse {
  notifications: NotificationRow[];
  unreadCount: number;
  total: number;
  hasMore: boolean;
  counts: Record<NotificationCategory, number>;
  timezone: string;
}

const PAGE_SIZE = 20;

/**
 * Navbar notification bell + history panel.
 *
 * ERROR.md L:
 *   "there is a notification button. When the user clicks it, it directs them to
 *    settings/notifications, but it should show notifications related to
 *    notification history. It should also categorize notifications by what type
 *    of notification it is and what it relates to. The UI should show tags of
 *    the notification and have a filter option for category selection and day,
 *    month, week, year notification selection."
 *
 * Previously the bell was a plain `Link` to /settings/notifications, and nothing
 * in the app consumed `GET /api/notifications` at all â€” the endpoint existed
 * with no reader.
 */
export function NotificationBell() {
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<NotificationRow[]>([]);
  const [counts, setCounts] = useState<Record<NotificationCategory, number>>(
    () => Object.fromEntries(CATEGORY_ORDER.map((c) => [c, 0])) as Record<
      NotificationCategory,
      number
    >
  );
  const [unread, setUnread] = useState(0);
  const [total, setTotal] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [category, setCategory] = useState<NotificationCategory | undefined>(undefined);
  const [period, setPeriod] = useState<PeriodFilter>('all');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const panelRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  /** Carries the active filters across to the full history page. */
  const allHref = useMemo(() => {
    const params = new URLSearchParams();
    if (category) params.set('category', category);
    if (period !== 'all') params.set('period', period);
    const qs = params.toString();
    return qs ? `/notifications?${qs}` : '/notifications';
  }, [category, period]);

  const load = useCallback(
    async (opts: { append?: boolean; category?: NotificationCategory; period?: PeriodFilter } = {}) => {
      setLoading(true);
      setError(null);
      const cat = opts.category !== undefined ? opts.category : category;
      const per = opts.period ?? period;
      const offset = opts.append ? rows.length : 0;

      const params = new URLSearchParams({
        limit: String(PAGE_SIZE),
        offset: String(offset),
        period: per,
      });
      if (cat) params.set('category', cat);

      try {
        const data = await apiRequest<HistoryResponse>(`/api/notifications?${params}`);
        setRows((prev) => (opts.append ? [...prev, ...data.notifications] : data.notifications));
        setCounts(data.counts);
        setUnread(data.unreadCount);
        setTotal(data.total);
        setHasMore(data.hasMore);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Could not load notifications');
      } finally {
        setLoading(false);
      }
    },
    [category, period, rows.length]
  );

  // Unread badge on mount, and a light poll so a reminder delivered by the
  // scheduler shows up without a manual refresh.
  useEffect(() => {
    void load();
    const timer = setInterval(() => void load(), 60_000);
    return () => clearInterval(timer);
    // Intentionally mount-only: filter changes call `load` explicitly.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Close on outside click and on Escape.
  useEffect(() => {
    if (!open) return;
    function onPointerDown(e: MouseEvent) {
      if (
        !panelRef.current?.contains(e.target as Node) &&
        !buttonRef.current?.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const markRead = useCallback(async (id: string) => {
    // Optimistic: the dot disappears immediately, and is restored if the call fails.
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, readAt: new Date().toISOString() } : r)));
    setUnread((n) => Math.max(0, n - 1));
    try {
      await apiRequest(`/api/notifications/${id}`, { method: 'PATCH', body: { action: 'read' } });
    } catch {
      void load();
    }
  }, [load]);

  const markAllRead = useCallback(async () => {
    /**
     * Previously this looped over the **loaded page** only.
     *
     * With 70 notifications and a 20-row page, "Mark all as read" marked 20 of
     * them and then the next poll re-read the real unread count â€” so the badge
     * immediately reappeared and it looked like the button did nothing. The
     * repository already has a single-query `markAllRead`, which is both correct
     * and far cheaper than N requests.
     */
    setUnread(0);
    setRows((prev) => prev.map((r) => ({ ...r, readAt: r.readAt ?? new Date().toISOString() })));
    try {
      await apiRequest<{ updated: number }>('/api/notifications', {
        method: 'POST',
        body: { action: 'markAllRead' },
      });
      await load();
    } catch {
      await load();
    }
  }, [load]);

  return (
    <div className="relative">
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label={unread > 0 ? `Notifications, ${unread} unread` : 'Notifications'}
        aria-expanded={open}
        aria-haspopup="dialog"
        className="relative flex h-10 w-10 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <Bell className="h-4 w-4" />
        {unread > 0 && (
          <span
            className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-semibold text-destructive-foreground"
            aria-hidden="true"
          >
            {unread > 99 ? '99+' : unread}
          </span>
        )}
      </button>

      {open && (
        <div
          ref={panelRef}
          role="dialog"
          aria-label="Notification history"
          className="absolute right-0 z-50 mt-2 flex max-h-[70vh] w-[min(24rem,calc(100vw-2rem))] flex-col overflow-hidden rounded-xl border border-border bg-card text-card-foreground shadow-floating"
        >
          {/* Header */}
          <div className="flex items-center justify-between gap-2 border-b border-border px-4 py-3">
            <div>
              <h2 className="text-sm font-semibold">Notifications</h2>
              <p className="text-xs text-muted-foreground">
                {total === 0 ? 'Nothing here' : `${total} in this view`}
                {unread > 0 ? ` Â· ${unread} unread` : ''}
              </p>
            </div>
            <div className="flex items-center gap-1">
              {unread > 0 && (
                <button
                  type="button"
                  onClick={() => void markAllRead()}
                  className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                  title="Mark all as read"
                  aria-label="Mark all as read"
                >
                  <CheckCheck className="h-4 w-4" />
                </button>
              )}
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                aria-label="Close notifications"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>

          {/* Period filter â€” ERROR.md L asks for day / week / month / year. */}
          <div className="flex flex-wrap gap-1.5 border-b border-border px-4 py-2">
            {PERIOD_FILTERS.map((p) => (
              <button
                key={p.value}
                type="button"
                onClick={() => {
                  setPeriod(p.value);
                  void load({ category, period: p.value });
                }}
                aria-pressed={period === p.value}
                className={cn(
                  'rounded-full px-2.5 py-1 text-xs font-medium transition-colors',
                  period === p.value
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-muted text-muted-foreground hover:text-foreground'
                )}
              >
                {p.label}
              </button>
            ))}
          </div>

          {/* Category filter */}
          <div className="flex flex-wrap gap-1.5 border-b border-border px-4 py-2">
            <button
              type="button"
              onClick={() => {
                setCategory(undefined);
                void load({ category: undefined, period });
              }}
              aria-pressed={category === undefined}
              className={cn(
                'rounded-full px-2.5 py-1 text-xs font-medium transition-colors',
                category === undefined
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-muted text-muted-foreground hover:text-foreground'
              )}
            >
              All
            </button>
            {CATEGORY_ORDER.map((c) => {
              const meta = CATEGORY_META[c];
              const n = counts[c] ?? 0;
              if (n === 0 && category !== c) return null;
              return (
                <button
                  key={c}
                  type="button"
                  onClick={() => {
                    setCategory(c);
                    void load({ category: c, period });
                  }}
                  aria-pressed={category === c}
                  className={cn(
                    'rounded-full px-2.5 py-1 text-xs font-medium transition-colors',
                    category === c
                      ? 'bg-primary text-primary-foreground'
                      : meta.chipClass
                  )}
                >
                  {meta.label}
                  {n > 0 && <span className="ml-1 tabular-nums opacity-70">{n}</span>}
                </button>
              );
            })}
          </div>

          {/* List */}
          <div className="min-h-0 flex-1 overflow-y-auto">
            {error && (
              <div className="px-4 py-3">
                <p role="alert" className="text-sm text-destructive">
                  {error}
                </p>
                <button
                  type="button"
                  onClick={() => void load()}
                  className="mt-2 text-xs font-semibold text-primary hover:underline"
                >
                  Try again
                </button>
              </div>
            )}

            {!error && rows.length === 0 && !loading && (
              <div className="flex flex-col items-center gap-2 px-4 py-10 text-center">
                <Bell className="h-8 w-8 text-muted-foreground/50" aria-hidden="true" />
                <p className="text-sm text-muted-foreground">
                  No notifications for this filter.
                </p>
              </div>
            )}

            <ul className="divide-y divide-border">
              {rows.map((n) => {
                const meta = CATEGORY_META[n.category];
                const tags = tagsFor(n.type as never, null);
                const isUnread = !n.readAt;
                return (
                  <li key={n.id}>
                    <div className="flex items-start gap-2 px-4 py-3">
                      <button
                        type="button"
                        onClick={() => void markRead(n.id)}
                        aria-label={isUnread ? 'Mark as read' : 'Read'}
                        className={cn(
                          'mt-1 h-2 w-2 shrink-0 rounded-full transition-colors',
                          isUnread
                            ? 'bg-primary'
                            : 'bg-transparent hover:bg-muted-foreground/40'
                        )}
                      />
                      <div className="min-w-0 flex-1">
                        <p
                          className={cn(
                            'truncate text-sm',
                            isUnread ? 'font-semibold text-foreground' : 'text-muted-foreground'
                          )}
                        >
                          {n.title}
                        </p>
                        {n.body && (
                          <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">
                            {n.body}
                          </p>
                        )}
                        <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                          {tags.map((t) => (
                            <span
                              key={t}
                              className={cn(
                                'rounded-full px-1.5 py-0.5 text-[10px] font-medium',
                                meta.chipClass
                              )}
                            >
                              {t}
                            </span>
                          ))}
                          {n.status === 'FAILED' && (
                            <span className="rounded-full bg-destructive/15 px-1.5 py-0.5 text-[10px] font-medium text-destructive">
                              Not delivered
                            </span>
                          )}
                          <time
                            className="text-[10px] text-muted-foreground/80"
                            dateTime={n.scheduledFor}
                          >
                            {relativeTime(n.scheduledFor)}
                          </time>
                        </div>
                      </div>
                      {n.actionUrl && (
                        <Link
                          href={n.actionUrl}
                          onClick={() => void markRead(n.id)}
                          className="shrink-0 self-center rounded-md px-2 py-1 text-xs font-medium text-primary hover:bg-primary/10"
                        >
                          Open
                        </Link>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>

            {hasMore && (
              <div className="px-4 py-3 text-center">
                {/*
                  "Load more" used to append to the panel's list. With a large
                  history that grows the panel's DOM without bound, which is what
                  the user is asked to avoid for frontend performance, so the
                  panel now stays a short, cheap summary and the full history
                  lives on its own page where it can be paginated server-side.
                */}
                <Link
                  href={allHref}
                  onClick={() => setOpen(false)}
                  className="inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium text-primary hover:bg-primary/10"
                >
                  View all {total} notifications
                </Link>
              </div>
            )}
          </div>

          <div className="border-t border-border px-4 py-2">
            <Link
              href="/settings/notifications"
              onClick={() => setOpen(false)}
              className="flex items-center justify-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground"
            >
              <Check className="h-3 w-3" />
              Notification settings
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}

/** Short relative label. Avoids a date library for a four-case string. */
function relativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return '';
  const diffMin = Math.round((Date.now() - then) / 60000);
  if (diffMin < 1) return 'now';
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.round(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.round(diffHr / 24);
  if (diffDay < 7) return `${diffDay}d ago`;
  return new Date(iso).toLocaleDateString();
}
