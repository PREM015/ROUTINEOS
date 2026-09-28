'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Bell, CheckCheck, Loader2 } from 'lucide-react';
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
}

interface Response {
  notifications: Row[];
  unreadCount: number;
  total: number;
  hasMore: boolean;
  counts: Record<NotificationCategory, number>;
  timezone: string;
}

const PAGE_SIZE = 25;

const CATEGORIES = new Set<string>(CATEGORY_ORDER);

/**
 * Full notification history with category + period filters and server-side paging.
 *
 * Filters live in the URL so the view is shareable, survives a refresh, and can
 * be linked to directly from the bell. Paging appends, but only one page at a
 * time, and the request is server-side â€” the bell panel deliberately does not
 * do this so it stays cheap.
 */
export function NotificationHistory({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const router = useRouter();

  const [rows, setRows] = useState<Row[]>([]);
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
  const [offset, setOffset] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  // Read the initial filters from the URL exactly once.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const sp = await searchParams;
      if (cancelled) return;
      const c = typeof sp.category === 'string' ? sp.category : undefined;
      if (c && CATEGORIES.has(c)) setCategory(c as NotificationCategory);
      const p = typeof sp.period === 'string' ? sp.period : 'all';
      if (PERIOD_FILTERS.some((f) => f.value === p)) setPeriod(p as PeriodFilter);
      setReady(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [searchParams]);

  const load = useCallback(
    async (nextOffset: number, append: boolean) => {
      append ? setLoadingMore(true) : setLoading(true);
      setError(null);
      const params = new URLSearchParams({
        limit: String(PAGE_SIZE),
        offset: String(nextOffset),
        period,
      });
      if (category) params.set('category', category);

      try {
        const data = await apiRequest<Response>(`/api/notifications?${params}`);
        setRows((prev) => (append ? [...prev, ...data.notifications] : data.notifications));
        setCounts(data.counts);
        setUnread(data.unreadCount);
        setTotal(data.total);
        setHasMore(data.hasMore);
        setOffset(nextOffset);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Could not load notifications');
      } finally {
        setLoading(false);
        setLoadingMore(false);
      }
    },
    [category, period]
  );

  useEffect(() => {
    if (!ready) return;
    void load(0, false);
  }, [ready, load]);

  const applyFilter = useCallback(
    (next: { category?: NotificationCategory | undefined; period?: PeriodFilter }) => {
      const c = 'category' in next ? next.category : category;
      const p = next.period ?? period;
      setCategory(c);
      setPeriod(p);
      const params = new URLSearchParams();
      if (c) params.set('category', c);
      if (p !== 'all') params.set('period', p);
      const qs = params.toString();
      router.replace(qs ? `/notifications?${qs}` : '/notifications');
    },
    [category, period, router]
  );

  const markAllRead = useCallback(async () => {
    setUnread(0);
    setRows((prev) => prev.map((r) => ({ ...r, readAt: r.readAt ?? new Date().toISOString() })));
    try {
      await apiRequest('/api/notifications', { method: 'POST', body: { action: 'markAllRead' } });
    } finally {
      void load(offset, false);
    }
  }, [load, offset]);

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
              {loading ? 'Loadingâ€¦' : `${total} in this view`}
              {unread > 0 ? ` Â· ${unread} unread` : ''}
            </p>
          </div>
          {unread > 0 && (
            <button
              type="button"
              onClick={() => void markAllRead()}
              className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-sm font-medium text-foreground transition-colors hover:bg-muted"
            >
              <CheckCheck className="h-4 w-4" aria-hidden="true" />
              Mark all as read
            </button>
          )}
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
        <ul className="space-y-2" aria-busy="true">
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
        <ul className="space-y-2">
          {rows.map((n) => {
            const meta = CATEGORY_META[n.category] ?? CATEGORY_META.system;
            const isUnread = !n.readAt;
            return (
              <li key={n.id}>
                <div
                  className={cn(
                    'flex items-start gap-3 rounded-xl border px-4 py-3 transition-colors',
                    isUnread
                      ? 'border-primary/30 bg-primary/5'
                      : 'border-border bg-card'
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
                      {tagsFor(n.type as never, null).map((t) => (
                        <span
                          key={t}
                          className={cn(
                            'rounded-full px-2 py-0.5 text-[11px] font-medium',
                            meta.chipClass
                          )}
                        >
                          {t}
                        </span>
                      ))}
                      {n.status === 'FAILED' && (
                        <span className="rounded-full bg-destructive/15 px-2 py-0.5 text-[11px] font-medium text-destructive">
                          Not delivered
                        </span>
                      )}
                      <time
                        className="text-[11px] text-muted-foreground/80"
                        dateTime={n.scheduledFor}
                      >
                        {new Date(n.scheduledFor).toLocaleString()}
                      </time>
                    </div>
                  </div>
                  {n.actionUrl && (
                    <Link
                      href={n.actionUrl}
                      className="shrink-0 self-center rounded-lg px-3 py-1.5 text-sm font-medium text-primary hover:bg-primary/10"
                    >
                      Open
                    </Link>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
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
