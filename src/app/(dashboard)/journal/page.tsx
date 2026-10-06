'use client';

/**
 * Journal — a writing and reflection workspace.
 *
 * Shape: a narrow rail (calendar, reflection link, trash) beside the main
 * column, which is the writing area or the entry list and never both. The rail
 * is `xl` rather than `lg` because at `lg` a fixed sidebar competes with the
 * editor for width, and the editor's measure matters more than seeing the
 * calendar while typing.
 *
 * Two independent data loads, deliberately:
 *
 *   - the **list** follows the URL query (search/filter/sort/page) and is
 *     server-paged, so a reload returns to the same view and a long journal is
 *     fully reachable;
 *   - the **calendar month** is fetched for the displayed month only, so its
 *     colours are complete regardless of what the list is showing.
 *
 * The trash is loaded only when opened. It used to be fetched on every load of
 * this page — including while its panel was collapsed — and the count in the
 * collapsed header came from the never-rendered response.
 */
import { Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import type { Tag } from '@/generated/prisma';
import {
  ArrowRight,
  BookOpen,
  CalendarDays,
  Download,
  Pencil,
  Plus,
  RotateCcw,
  Sparkles,
  Trash2,
} from 'lucide-react';
import { apiRequest } from '@/lib/api-client';
import type { JournalEntryWithRelations } from '@/types/journal';
import { Button, Dialog, Spinner } from '@/components/ui';
import JournalCalendar, { type JournalCalendarCell } from '@/components/journal/JournalCalendar';
import JournalEditor from '@/components/journal/JournalEditor';
import JournalEntryActions from '@/components/journal/JournalEntryActions';
import JournalFilters from '@/components/journal/JournalFilters';
import JournalList from '@/components/journal/JournalList';
import JournalVersionHistory from '@/components/journal/JournalVersionHistory';
import { formatDateKeyShort, monthKeyFromDateKey } from '@/lib/journal/date';
import {
  DEFAULT_JOURNAL_BROWSE,
  clampJournalPage,
  describeJournalFilters,
  hasJournalFilters,
  journalBrowseStateAfterChange,
  journalBrowseStateFromQuery,
  journalBrowseStateToApiQuery,
  journalBrowseStateToQuery,
  journalPageCount,
  journalViewFilter,
  type JournalBrowseState,
} from '@/lib/journal/query';
import { useUserTimezone } from '@/hooks/useUserTimezone';

interface JournalListMeta {
  total: number;
  limit: number;
  offset: number;
  hasMore: boolean;
}

interface PendingDelete {
  id: string;
  title: string;
  permanent: boolean;
}

/**
 * `apiRequest` unwraps `.data` and discards `meta`, so the two are fetched
 * together here and the pagination metadata — which is the whole reason for
 * server-side paging — is not thrown away.
 */
async function fetchPage(
  query: JournalBrowseState
): Promise<{ entries: JournalEntryWithRelations[]; meta: JournalListMeta }> {
  const params = journalBrowseStateToApiQuery(query);
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined) search.set(key, String(value));
  }

  const response = await fetch(`/api/journal?${search.toString()}`, {
    credentials: 'include',
    cache: 'no-store',
  });

  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as { error?: string } | null;
    throw new Error(body?.error ?? `Request failed with status ${response.status}`);
  }

  const body = (await response.json()) as {
    data: JournalEntryWithRelations[];
    meta?: Partial<JournalListMeta>;
  };

  return {
    entries: body.data,
    meta: {
      total: body.meta?.total ?? body.data.length,
      limit: body.meta?.limit ?? query.pageSize,
      offset: body.meta?.offset ?? 0,
      hasMore: body.meta?.hasMore ?? false,
    },
  };
}

export default function JournalPage() {
  return (
    <Suspense fallback={<JournalPageSkeleton />}>
      <JournalWorkspace />
    </Suspense>
  );
}

/**
 * `useSearchParams` opts this route into client rendering and Next requires a
 * Suspense boundary above it or the build fails — same shape as
 * `/achievements`. The fallback is a skeleton rather than a spinner so crossing
 * the boundary is not a visible downgrade.
 */
function JournalPageSkeleton() {
  return (
    <div className="container mx-auto max-w-7xl px-4 py-6 sm:py-8">
      <div className="mb-6 flex flex-col gap-4 border-b border-border pb-6 sm:flex-row sm:items-end sm:justify-between">
        <div className="space-y-2">
          <div className="h-8 w-40 rounded-lg bg-muted" />
          <div className="h-4 w-72 rounded bg-muted/70" />
        </div>
        <div className="h-10 w-32 rounded-lg bg-muted" />
      </div>
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(260px,300px)_1fr] xl:gap-8">
        <div className="hidden space-y-4 xl:block">
          <div className="h-64 rounded-xl bg-muted/60" />
          <div className="h-32 rounded-xl bg-muted/40" />
        </div>
        <div className="space-y-4">
          <div className="h-10 rounded-lg bg-muted/70" />
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div className="h-44 rounded-xl bg-muted/50" />
            <div className="h-44 rounded-xl bg-muted/50" />
          </div>
        </div>
      </div>
      <span className="sr-only" role="status">
        Loading journal
      </span>
    </div>
  );
}

function JournalWorkspace() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { today: userToday } = useUserTimezone();

  /** All browse state lives here, derived from the URL on every render. */
  const browse: JournalBrowseState = useMemo(
    () => journalBrowseStateFromQuery(searchParams),
    [searchParams]
  );

  const [entries, setEntries] = useState<JournalEntryWithRelations[] | null>(null);
  const [meta, setMeta] = useState<JournalListMeta | null>(null);
  const [tags, setTags] = useState<Tag[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [reloading, setReloading] = useState(false);

  /** Day shown by the calendar; follows the URL so a shared link opens it. */
  const [calendarMonth, setCalendarMonth] = useState(
    () => browse.month || monthKeyFromDateKey(userToday) || userToday.slice(0, 7)
  );
  const [monthCells, setMonthCells] = useState<JournalCalendarCell[]>([]);
  const [monthLoading, setMonthLoading] = useState(true);

  const [editingId, setEditingId] = useState<string | null>(null);
  /**
   * The entry being edited when it is *not* on the current page.
   *
   * Opening an entry from the calendar, from the "Showing …" summary or from a
   * back-navigation can target an entry the current filters exclude. Without
   * this the editor fell back to create mode for that date and the save came
   * back 409 — the user typed into a form that could not be saved.
   */
  const [offPageEditing, setOffPageEditing] = useState<JournalEntryWithRelations | null>(null);
  /** Date a new entry is filed under; set by "New entry" or a calendar day. */
  const [creatingDate, setCreatingDate] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<PendingDelete | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [historyId, setHistoryId] = useState<string | null>(null);
  const [showTrash, setShowTrash] = useState(false);
  const [trash, setTrash] = useState<JournalEntryWithRelations[] | null>(null);
  const [trashError, setTrashError] = useState<string | null>(null);
  const [hasTodayReflection, setHasTodayReflection] = useState<boolean | null>(null);
  const [reflectionError, setReflectionError] = useState<string | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const [showRail, setShowRail] = useState(false);

  /**
   * Write browse state back to the URL, replacing rather than stacking.
   *
   * Reads `browse` directly instead of through a ref: it is memoized from
   * `searchParams`, so it is already the current state, and assigning a ref
   * during render is an impure render that `react-hooks` flags.
   */
  const updateBrowse = useCallback(
    (change: Partial<JournalBrowseState> | null) => {
      const next = change
        ? journalBrowseStateAfterChange(browse, change)
        : { ...DEFAULT_JOURNAL_BROWSE, pageSize: browse.pageSize };
      const query = journalBrowseStateToQuery(next);
      router.replace(query ? `${pathname}${query}` : pathname, { scroll: false });
    },
    [browse, pathname, router]
  );

  const load = useCallback(async (target: JournalBrowseState) => {
    setLoadError(null);
    setReloading(true);
    try {
      const [{ entries: pageEntries, meta: pageMeta }, tagData] = await Promise.all([
        fetchPage(target),
        apiRequest<Tag[]>('/api/tags'),
      ]);
      setEntries(pageEntries);
      setMeta(pageMeta);
      setTags(tagData);
    } catch (err) {
      // Previously the error was set but `entries` stayed `null`, and the
      // loading spinner is gated on `entries === null` — so a failed load left a
      // spinner on screen underneath the error, with no way to retry.
      setEntries([]);
      setMeta(null);
      setLoadError(err instanceof Error ? err.message : 'Failed to load journal');
    } finally {
      setReloading(false);
    }
  }, []);

  // Refetch when the browse state changes. `browse` is derived from the URL, so
  // this covers filter changes, sort changes and paging in one place.
  useEffect(() => {
    void load(browse);
  }, [browse, load]);

  /** Reload the current page — after a save, a toggle or a manual retry. */
  const reload = useCallback(() => {
    void load(browse);
  }, [browse, load]);

  // The calendar's month is fetched separately from the list, so a filter or a
  // page change never repaints it and a long month is never half-coloured by
  // whichever slice of the list happens to be loaded.
  useEffect(() => {
    if (!userToday) return;
    let cancelled = false;
    setMonthLoading(true);

    void (async () => {
      try {
        const monthEntries = await apiRequest<JournalEntryWithRelations[]>(
          '/api/journal',
          { query: { month: calendarMonth, limit: 31 } }
        );
        if (cancelled) return;
        setMonthCells(
          monthEntries.map((entry) => ({
            date: entry.date,
            mood: entry.mood,
            entryId: entry.id,
            isFavorite: entry.isFavorite,
          }))
        );
      } catch {
        // The calendar is supporting context; a failure leaves it uncoloured
        // rather than replacing the journal the user came to read.
        if (!cancelled) setMonthCells([]);
      } finally {
        if (!cancelled) setMonthLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [calendarMonth, userToday]);

  useEffect(() => {
    if (!userToday) return;
    void (async () => {
      try {
        const reflection = await apiRequest<unknown | null>('/api/reflections', {
          query: { date: userToday },
        });
        setHasTodayReflection(reflection !== null && reflection !== undefined);
      } catch (err) {
        // Reported rather than assumed: a failed request must not tell the user
        // they have no reflection today — a fact stated confidently, derived
        // from a 500.
        setReflectionError(
          err instanceof Error ? err.message : 'Could not check today’s reflection'
        );
      }
    })();
  }, [userToday]);

  const loadTrash = useCallback(async () => {
    setTrashError(null);
    try {
      const data = await apiRequest<JournalEntryWithRelations[]>('/api/journal/deleted', {
        query: { limit: 50 },
      });
      setTrash(data);
    } catch (err) {
      setTrash([]);
      setTrashError(err instanceof Error ? err.message : 'Failed to load trash');
    }
  }, []);

  const closeEditor = useCallback(() => {
    setEditingId(null);
    setOffPageEditing(null);
    setCreatingDate(null);
  }, []);

  /**
   * Open an entry by id, fetching it when the current page does not hold it.
   *
   * The calendar knows the id of every day in the displayed month but the list
   * holds only one page of it, so the two disagree whenever a filter or a page
   * boundary is involved.
   */
  const openEntry = useCallback(
    (id: string) => {
      const onPage = (entries ?? []).find((entry) => entry.id === id);
      setCreatingDate(null);

      if (onPage) {
        setOffPageEditing(null);
        setEditingId(id);
        return;
      }

      void (async () => {
        try {
          const found = await apiRequest<JournalEntryWithRelations>(`/api/journal/${id}`);
          setOffPageEditing(found);
          setEditingId(id);
        } catch (err) {
          setActionError(err instanceof Error ? err.message : 'Could not open that entry');
        }
      })();
    },
    [entries]
  );

  const loadTrashIfOpen = useCallback(() => {
    if (showTrash) void loadTrash();
  }, [showTrash, loadTrash]);

  const handleSaved = useCallback(
    (saved: JournalEntryWithRelations) => {
      /*
       * A day or month filter that excludes the entry just written would make the
       * save look like it did nothing — the editor closes and the entry is not
       * in the list. Only those two are dropped: clearing the lot also threw away
       * the search and tag the user had set up, which they did not ask to lose.
       */
      const excludedByDate =
        (browse.date.length > 0 && browse.date !== saved.date) ||
        (browse.month.length > 0 && !saved.date.startsWith(browse.month));

      if (excludedByDate) {
        updateBrowse({ date: '', month: '' });
      } else {
        reload();
      }
      closeEditor();
      loadTrashIfOpen();
    },
    [browse, reload, closeEditor, loadTrashIfOpen, updateBrowse]
  );

  const runDelete = async () => {
    if (!pendingDelete || busyId !== null) return;
    setBusyId(pendingDelete.id);
    setActionError(null);
    try {
      await apiRequest(
        pendingDelete.permanent
          ? `/api/journal/${pendingDelete.id}/permanent`
          : `/api/journal/${pendingDelete.id}`,
        { method: 'DELETE' }
      );
      if (editingId === pendingDelete.id) closeEditor();
      setPendingDelete(null);
      reload();
      loadTrashIfOpen();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Failed to delete entry');
    } finally {
      setBusyId(null);
    }
  };

  const runRestore = async (id: string) => {
    if (busyId !== null) return;
    setBusyId(id);
    setActionError(null);
    try {
      await apiRequest(`/api/journal/${id}/restore`, { method: 'POST' });
      reload();
      await loadTrash();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Failed to restore entry');
    } finally {
      setBusyId(null);
    }
  };

  /** Download whatever the current filters select, in one file. */
  const runExport = async (format: 'markdown' | 'json') => {
    if (exporting) return;
    setExporting(true);
    setExportError(null);
    try {
      const params = new URLSearchParams({ format });
      const { search, tagId, mood, date, month, sortBy, sortOrder } = browse;
      if (search.trim()) params.set('search', search.trim());
      if (tagId) params.set('tagId', tagId);
      if (mood !== null) params.set('mood', String(mood));
      if (date) params.set('date', date);
      if (month) params.set('month', month);
      // Shared with the list request so the download and the screen cannot
      // disagree about which entries are in view.
      for (const [key, value] of Object.entries(journalViewFilter(browse))) {
        if (value !== undefined) params.set(key, String(value));
      }
      params.set('sortBy', sortBy);
      params.set('sortOrder', sortOrder);

      const response = await fetch(`/api/journal/export?${params.toString()}`, {
        credentials: 'include',
        cache: 'no-store',
      });
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(body?.error ?? 'Export failed');
      }

      // A server-side file would need a download route and a token; the
      // response is the document, so it is handed to the browser directly.
      const blob = await response.blob();
      const disposition = response.headers.get('content-disposition') ?? '';
      const filename = /filename="([^"]+)"/.exec(disposition)?.[1] ?? `journal.${format}`;
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      setExportError(err instanceof Error ? err.message : 'Export failed');
    } finally {
      setExporting(false);
    }
  };

  const editing = useMemo(
    () =>
      (entries ?? []).find((entry) => entry.id === editingId) ??
      // The page wins when it holds the entry, so a reload after a save shows
      // the refreshed row rather than a stale fetch.
      (offPageEditing?.id === editingId ? offPageEditing : null),
    [entries, editingId, offPageEditing]
  );

  const historyEntry = useMemo(
    () =>
      (entries ?? []).find((entry) => entry.id === historyId) ??
      (trash ?? []).find((entry) => entry.id === historyId) ??
      null,
    [entries, trash, historyId]
  );

  const entryLabel = (entry: JournalEntryWithRelations): string =>
    entry.title && entry.title.trim().length > 0 ? entry.title : 'Untitled entry';

  const filtersActive = hasJournalFilters(browse);
  const filterChips = describeJournalFilters(browse);
  const total = meta?.total ?? 0;
  const pageCount = journalPageCount(total, browse.pageSize);
  const page = browse.page;

  /**
   * True when the fetched page is past the end of the result set.
   *
   * A filter change can leave the page number behind: on a three-page result set,
   * page 5 fetches `offset: 80`, which returns nothing while `total` says 45.
   * Clamping only the *label* would show "41–45 of 45" above an empty list — and
   * with no filters active, the "Your journal starts here" empty state, for a
   * journal with 45 entries in it.
   *
   * The correction is written to the URL rather than applied locally, so the
   * refetch that follows requests the offset that actually has entries.
   */
  const pageIsPastEnd =
    entries !== null && entries.length === 0 && total > 0 && page > pageCount;

  useEffect(() => {
    if (entries === null || meta === null) return;
    const target = clampJournalPage(browse.page, meta.total, browse.pageSize);
    if (target !== browse.page) updateBrowse({ page: target });
  }, [entries, meta, browse.page, browse.pageSize, updateBrowse]);
  const rangeStart = total === 0 ? 0 : (page - 1) * browse.pageSize + 1;
  const rangeEnd = total === 0 ? 0 : Math.min(page * browse.pageSize, total);
  const isFirstRun = entries === null && !loadError;

  /** Today, or a past day: the date a new entry is filed under. */
  const startNewEntry = (date?: string) => {
    setEditingId(null);
    setOffPageEditing(null);
    /*
     * Parenthesised deliberately. `a ?? b || c` is a syntax error because `??` cannot be
     * mixed with `||` without them - and the grouping is not arbitrary here: `browse.date`
     * is a string and `userToday` is always defined, so `||` (falsy, not nullish) is the
     * right operator for "empty selection". With parentheses that reads as written.
     */
    setCreatingDate(date ?? (browse.date || userToday));
  };

  const calendarRail = (
    <div className="space-y-4">
      <div className="rounded-xl border border-border bg-card p-4">
        <JournalCalendar
          month={calendarMonth}
          cells={monthCells}
          loading={monthLoading}
          today={userToday}
          selectedDate={browse.date || editing?.date || creatingDate || undefined}
          onMonthChange={(month) => {
            setCalendarMonth(month);
            // Choosing a month is a filter, not just a view change.
            if (browse.month !== month) updateBrowse({ month, date: '' });
          }}
          onSelectDate={(date) => {
            // An occupied day opens the existing entry rather than starting a
            // second one for the same date: the schema allows only one, and the
            // user's intent is to write about that day either way.
            //
            // The id comes from the month cells, not from the current list page.
            // Searching the page would miss an entry that exists but is filtered
            // out or on another page, and the day would then look empty — leading
            // to a create that comes back 409.
            const known =
              monthCells.find((cell) => cell.date === date)?.entryId ??
              (entries ?? []).find((entry) => entry.date === date)?.id;

            if (known) {
              openEntry(known);
              return;
            }
            startNewEntry(date);
          }}
        />
      </div>

      <div className="rounded-xl border border-border bg-card p-4">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-foreground">
          <Sparkles className="h-4 w-4 text-primary" />
          Daily reflection
        </h2>
        <p className="mt-2 text-sm text-muted-foreground">
          {reflectionError
            ? 'Could not check whether you have already reflected today.'
            : hasTodayReflection === null
              ? 'Checking today’s reflection…'
              : hasTodayReflection
                ? 'You already reflected today.'
                : 'You haven’t reflected today yet. Three short prompts take under a minute.'}
        </p>
        {reflectionError && (
          <p role="alert" className="mt-1 text-sm text-destructive">
            {reflectionError}
          </p>
        )}
        <Button className="mt-3" onClick={() => router.push('/today')}>
          {hasTodayReflection ? 'Open today’s reflection' : 'Take today’s reflection'}
          <ArrowRight className="ml-1.5 h-4 w-4" />
        </Button>
      </div>

      <div className="rounded-xl border border-border bg-card p-4">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-foreground">
          <Download className="h-4 w-4 text-primary" />
          Export
        </h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Download the {filtersActive ? 'filtered entries' : 'whole journal'}.
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={exporting}
            onClick={() => void runExport('markdown')}
          >
            Markdown
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={exporting}
            onClick={() => void runExport('json')}
          >
            JSON
          </Button>
        </div>
        {exportError && (
          <p role="alert" className="mt-2 text-sm text-destructive">
            {exportError}
          </p>
        )}
      </div>

      <div className="rounded-xl border border-border bg-card p-4">
        <button
          type="button"
          onClick={() => {
            const next = !showTrash;
            setShowTrash(next);
            // Fetch on open, not on every page load.
            if (next && trash === null) void loadTrash();
          }}
          aria-expanded={showTrash}
          className="flex w-full items-center justify-between gap-2 text-left text-sm font-semibold text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        >
          <span className="flex items-center gap-2">
            <Trash2 className="h-4 w-4 text-muted-foreground" />
            Recently deleted
          </span>
          <span className="text-xs font-normal text-muted-foreground">
            {/* No count until the panel has been opened: fetching the trash on
                every page load is what this change removed, so the count is not
                known yet and is not invented. */}
            {showTrash ? (trash === null ? 'Hide' : `Hide (${trash.length})`) : 'Show'}
          </span>
        </button>

        {showTrash && (
          <div className="mt-3">
            {trashError ? (
              <div role="alert" className="text-sm text-destructive">
                <p>{trashError}</p>
                <Button variant="outline" size="sm" className="mt-2" onClick={() => void loadTrash()}>
                  Try again
                </Button>
              </div>
            ) : trash === null ? (
              <div className="flex justify-center py-4">
                <Spinner className="h-4 w-4" />
              </div>
            ) : trash.length === 0 ? (
              <p className="text-sm text-muted-foreground">Trash is empty.</p>
            ) : (
              <ul className="space-y-2">
                {trash.map((entry) => (
                  <li key={entry.id} className="rounded-lg border border-border bg-muted/40 p-3">
                    <p className="truncate text-sm font-medium text-foreground">
                      {entryLabel(entry)}
                    </p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {formatDateKeyShort(entry.date)}
                    </p>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={busyId === entry.id}
                        onClick={() => void runRestore(entry.id)}
                      >
                        <RotateCcw className="mr-1 h-3.5 w-3.5" />
                        Restore
                      </Button>
                      {/* Permanent delete lives only here, behind a confirmation,
                          so it is never adjacent to soft delete. */}
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={busyId === entry.id}
                        onClick={() =>
                          setPendingDelete({
                            id: entry.id,
                            title: entryLabel(entry),
                            permanent: true,
                          })
                        }
                      >
                        <Trash2 className="mr-1 h-3.5 w-3.5" />
                        Delete forever
                      </Button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>
    </div>
  );

  return (
    <div className="container relative mx-auto max-w-7xl px-4 py-6 sm:py-8">
      <div
        className="gradient-mesh-animated pointer-events-none absolute inset-0 -z-10 opacity-60"
        aria-hidden="true"
      />

      <header className="mb-6 flex flex-col gap-4 border-b border-border pb-6 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <h1 className="flex items-center gap-2 font-display text-2xl font-bold tracking-tight sm:text-3xl">
            <BookOpen className="h-7 w-7 text-primary" aria-hidden="true" />
            Journal
          </h1>
          <p className="mt-2 max-w-prose text-muted-foreground">
            A dated record of what you noticed. Pick a day, or start today.
          </p>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          {/* Mobile only: the rail is a sheet so the writing area keeps the
              full width, which matters more than seeing the calendar. */}
          <Button
            variant="outline"
            className="xl:hidden"
            aria-expanded={showRail}
            aria-controls="journal-rail"
            onClick={() => setShowRail((open) => !open)}
          >
            <CalendarDays className="mr-1.5 h-4 w-4" />
            Calendar
          </Button>

          {!creatingDate && !editing && (
            <Button onClick={() => startNewEntry()}>
              <Plus className="mr-1.5 h-4 w-4" />
              New entry
            </Button>
          )}
        </div>
      </header>

      {loadError && (
        <div
          role="alert"
          className="mb-6 flex flex-wrap items-center gap-3 rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive"
        >
          <span className="flex-1">{loadError}</span>
          <Button variant="outline" size="sm" onClick={reload}>
            Try again
          </Button>
        </div>
      )}

      {actionError && (
        <p role="alert" className="mb-6 rounded-lg bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {actionError}
        </p>
      )}

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(260px,300px)_1fr] xl:gap-8">
        {/* The rail is supporting context, so it collapses below `xl` and is
            not sticky on short viewports. */}
        <aside
          id="journal-rail"
          className={`${showRail ? 'block' : 'hidden'} xl:block xl:space-y-4`}
        >
          {calendarRail}
        </aside>

        <main className="min-w-0">
          {creatingDate || editing ? (
            <JournalEditor
              key={editing?.id ?? `new-${creatingDate}`}
              entry={editing ?? undefined}
              date={creatingDate ?? undefined}
              availableTags={tags}
              onSaved={handleSaved}
              onCancel={closeEditor}
            />
          ) : (
            <div className="space-y-4">
              <JournalFilters
                state={browse}
                tags={tags}
                onChange={updateBrowse}
                onClear={() => updateBrowse(null)}
              />

              {filterChips.length > 0 && (
                <p className="text-sm text-muted-foreground">
                  Showing {filterChips.join(' · ')}
                </p>
              )}

              {isFirstRun ? (
                <div className="flex justify-center py-16">
                  <Spinner className="h-6 w-6" />
                  <span className="sr-only">Loading journal entries</span>
                </div>
              ) : loadError ? (
                // The retry affordance is in the banner above; the body is empty
                // rather than a second error, so one failure reads as one thing.
                <div className="rounded-xl border border-dashed border-border py-16 text-center">
                  <p className="text-sm text-muted-foreground">
                    Your entries could not be loaded.
                  </p>
                </div>
              ) : pageIsPastEnd ? (
                /*
                 * A frame of loading rather than an empty state: the entries are
                 * real, the requested page simply has none, and the URL is about
                 * to be corrected. Showing "Your journal starts here" here would
                 * tell a user with 45 entries that they have none.
                 */
                <div className="flex justify-center py-16">
                  <Spinner className="h-6 w-6" />
                  <span className="sr-only">Correcting page</span>
                </div>
              ) : entries !== null && entries.length === 0 ? (
                filtersActive ? (
                  <div className="rounded-xl border border-dashed border-border py-16 text-center">
                    <p className="font-display text-base font-semibold text-foreground">
                      Nothing matches
                    </p>
                    <p className="mx-auto mt-2 max-w-sm text-sm text-muted-foreground">
                      No entries match these filters. Try a broader search, or clear them to
                      see everything.
                    </p>
                    <Button variant="outline" className="mt-4" onClick={() => updateBrowse(null)}>
                      Clear filters
                    </Button>
                  </div>
                ) : (
                  <div className="rounded-xl border border-dashed border-border py-16 text-center">
                    <p className="font-display text-lg font-semibold text-foreground">
                      Your journal starts here
                    </p>
                    <p className="mx-auto mt-2 max-w-sm text-sm text-muted-foreground">
                      Write about today, or pick any day on the calendar to look back.
                    </p>
                    <Button className="mt-4" onClick={() => startNewEntry()}>
                      <Pencil className="mr-1.5 h-4 w-4" />
                      Write your first entry
                    </Button>
                  </div>
                )
              ) : entries !== null ? (
                <>
                  <div className="flex items-baseline justify-between gap-2 text-sm text-muted-foreground">
                    <span>
                      {rangeStart}–{rangeEnd} of {total}
                    </span>
                    {reloading && <Spinner className="h-3.5 w-3.5" aria-hidden="true" />}
                  </div>

                  <JournalList
                    entries={entries}
                    onSelect={openEntry}
                    renderActions={(entry) => (
                      <JournalEntryActions
                        entryId={entry.id}
                        date={formatDateKeyShort(entry.date)}
                        isFavorite={entry.isFavorite}
                        isArchived={entry.isArchived}
                        onEdit={openEntry}
                        onOpenHistory={setHistoryId}
                        onDelete={(id) =>
                          setPendingDelete({ id, title: entryLabel(entry), permanent: false })
                        }
                        onChanged={reload}
                      />
                    )}
                  />

                  {pageCount > 1 && (
                    <nav
                      aria-label="Journal pages"
                      className="flex items-center justify-between gap-2 pt-2"
                    >
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={page <= 1}
                        onClick={() => updateBrowse({ page: page - 1 })}
                      >
                        Previous
                      </Button>
                      <span className="text-sm text-muted-foreground">
                        Page {page} of {pageCount}
                      </span>
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={page >= pageCount}
                        onClick={() => updateBrowse({ page: page + 1 })}
                      >
                        Next
                      </Button>
                    </nav>
                  )}
                </>
              ) : null}
            </div>
          )}
        </main>
      </div>

      <Dialog
        open={pendingDelete !== null}
        onOpenChange={(open) => {
          if (!open) setPendingDelete(null);
        }}
        title={pendingDelete?.permanent ? 'Delete forever?' : 'Move to trash?'}
        description={
          pendingDelete?.permanent
            ? `“${pendingDelete?.title}” and its entire version history will be permanently deleted. This cannot be undone.`
            : `“${pendingDelete?.title}” will be moved to Recently deleted. You can restore it later — its version history is kept.`
        }
        footer={
          <>
            <Button variant="outline" onClick={() => setPendingDelete(null)}>
              Cancel
            </Button>
            <Button onClick={() => void runDelete()} isLoading={busyId !== null}>
              {pendingDelete?.permanent ? 'Delete forever' : 'Move to trash'}
            </Button>
          </>
        }
      >
        <p className="text-sm text-muted-foreground">
          {pendingDelete?.permanent
            ? 'Use permanent delete only when you are sure the entry is no longer needed.'
            : 'Deleted entries stay in the trash until you restore or permanently delete them.'}
        </p>
      </Dialog>

      <Dialog
        open={historyId !== null}
        onOpenChange={(open) => {
          if (!open) setHistoryId(null);
        }}
        title={historyEntry ? `History — ${entryLabel(historyEntry)}` : 'Version history'}
        size="lg"
      >
        {historyId && (
          <JournalVersionHistory
            entryId={historyId}
            onRestored={() => {
              reload();
            }}
          />
        )}
      </Dialog>
    </div>
  );
}
