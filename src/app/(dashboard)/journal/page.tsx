'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { Tag } from '@prisma/client';
import {
  ArrowRight,
  BookOpen,
  History,
  Pencil,
  Plus,
  RotateCcw,
  Sparkles,
  Trash2,
  X,
} from 'lucide-react';
import { apiRequest } from '@/lib/api-client';
import type { JournalEntryWithRelations } from '@/types/journal';
import { Button, Card, Dialog, Input, Select, Spinner } from '@/components/ui';
import JournalCalendar from '@/components/journal/JournalCalendar';
import JournalList from '@/components/journal/JournalList';
import JournalEditor from '@/components/journal/JournalEditor';
import JournalVersionHistory from '@/components/journal/JournalVersionHistory';
import { formatDate } from '@/lib/utils';
import { getTodayString } from '@/lib/dates';

function toDateKey(date: Date | string): string {
  return new Date(date).toISOString().slice(0, 10);
}

const PAGE_SIZE = 6;

interface PendingDelete {
  id: string;
  title: string;
  permanent: boolean;
}

/**
 * Journal Page
 * Calendar of journal activity, filterable + paginated entries with inline
 * editing, trash (soft delete / restore / permanent delete) and per-entry
 * version history.
 */
export default function JournalPage() {
  const router = useRouter();
  const [entries, setEntries] = useState<JournalEntryWithRelations[] | null>(null);
  const [deletedEntries, setDeletedEntries] = useState<JournalEntryWithRelations[]>([]);
  const [tags, setTags] = useState<Tag[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<PendingDelete | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [historyId, setHistoryId] = useState<string | null>(null);
  const [showTrash, setShowTrash] = useState(false);
  const [tagFilter, setTagFilter] = useState('');
  const [dateFilter, setDateFilter] = useState('');
  const [page, setPage] = useState(1);
  const [hasTodayReflection, setHasTodayReflection] = useState<boolean | null>(null);

  const load = useCallback(async () => {
    try {
      const [entryData, tagData, trashData] = await Promise.all([
        apiRequest<JournalEntryWithRelations[]>('/api/journal', {
          query: { limit: 100 },
        }),
        apiRequest<Tag[]>('/api/tags'),
        apiRequest<JournalEntryWithRelations[]>('/api/journal/deleted', {
          query: { limit: 50 },
        }),
      ]);
      setEntries(entryData);
      setTags(tagData);
      setDeletedEntries(trashData);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load journal');
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- mount data fetch
    void load();
    void (async () => {
      try {
        const reflection = await apiRequest<unknown | null>('/api/reflections', {
          query: { date: getTodayString() },
        });
        setHasTodayReflection(reflection !== null && reflection !== undefined);
      } catch {
        setHasTodayReflection(false);
      }
    })();
  }, [load]);

  const moodByDate = useMemo(() => {
    const map: Record<string, number | null> = {};
    for (const entry of entries ?? []) {
      map[toDateKey(entry.date)] = entry.mood;
    }
    return map;
  }, [entries]);

  const filtered = useMemo(() => {
    const list = [...(entries ?? [])].sort((a, b) =>
      b.date.localeCompare(a.date),
    );
    return list.filter((entry) => {
      if (tagFilter && !entry.tags.some((relation) => relation.tag.id === tagFilter)) {
        return false;
      }
      if (dateFilter && toDateKey(entry.date) !== dateFilter) {
        return false;
      }
      return true;
    });
  }, [entries, tagFilter, dateFilter]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount);
  const paged = useMemo(
    () => filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE),
    [filtered, safePage],
  );

  const editing = useMemo(
    () => (entries ?? []).find((entry) => entry.id === editingId) ?? null,
    [entries, editingId],
  );

  const historyEntry = useMemo(
    () =>
      (entries ?? []).find((entry) => entry.id === historyId) ??
      deletedEntries.find((entry) => entry.id === historyId) ??
      null,
    [entries, deletedEntries, historyId],
  );

  const closeEditor = () => {
    setEditingId(null);
    setCreating(false);
  };

  const handleSaved = () => {
    closeEditor();
    void load();
  };

  const runDelete = async () => {
    if (!pendingDelete || busyId !== null) return;
    setBusyId(pendingDelete.id);
    setActionError(null);
    try {
      if (pendingDelete.permanent) {
        await apiRequest(`/api/journal/${pendingDelete.id}/permanent`, {
          method: 'DELETE',
        });
      } else {
        await apiRequest(`/api/journal/${pendingDelete.id}`, {
          method: 'DELETE',
        });
      }
      if (editingId === pendingDelete.id) closeEditor();
      setPendingDelete(null);
      await load();
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
      await load();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Failed to restore entry');
    } finally {
      setBusyId(null);
    }
  };

  const entryLabel = (entry: JournalEntryWithRelations): string =>
    entry.title && entry.title.length > 0 ? entry.title : 'Untitled entry';

  return (
    <div className="container mx-auto max-w-6xl px-4 py-8">
      <div className="mb-8 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-2 text-3xl font-bold">
            <BookOpen className="h-7 w-7 text-primary" />
            Journal
          </h1>
          <p className="mt-2 text-muted-foreground">
            Capture reflections, track mood and energy, and look back over time.
          </p>
        </div>
        {!creating && !editing && (
          <Button
            onClick={() => {
              setEditingId(null);
              setCreating(true);
            }}
          >
            <Plus className="mr-1.5 h-4 w-4" />
            New entry
          </Button>
        )}
      </div>

      {error && (
        <p role="alert" className="mb-6 rounded-lg bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {error}
        </p>
      )}

      {actionError && (
        <p role="alert" className="mb-6 rounded-lg bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {actionError}
        </p>
      )}

      {(creating || editing) && (
        <div className="mb-8">
          <div className="mb-2 flex justify-end">
            <Button variant="ghost" size="sm" onClick={closeEditor}>
              <X className="mr-1.5 h-4 w-4" />
              Close editor
            </Button>
          </div>
          <JournalEditor
            key={editing?.id ?? 'new'}
            entry={editing ?? undefined}
            availableTags={tags}
            onSaved={handleSaved}
            onCancel={closeEditor}
          />
        </div>
      )}

      {!entries ? (
        <div className="flex justify-center py-16">
          <Spinner className="h-6 w-6" />
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-8 lg:grid-cols-[320px_1fr]">
          <div className="space-y-6">
            <Card className="h-fit p-5">
              <h2 className="flex items-center gap-2 text-sm font-semibold text-foreground">
                <Sparkles className="h-4 w-4 text-primary" />
                Daily reflection
              </h2>
              <p className="mt-2 text-sm text-muted-foreground">
                {hasTodayReflection === null
                  ? 'Checking today\u2019s reflection\u2026'
                  : hasTodayReflection
                    ? 'You already reflected today. Catch up on tonight\u2019s prompts or add more below.'
                    : 'You haven\u2019t reflected today yet. Three short prompts take under a minute.'}
              </p>
              <Button
                className="mt-3"
                onClick={() => router.push('/today')}
              >
                {hasTodayReflection ? 'Open today\u2019s reflection' : 'Take today\u2019s reflection'}
                <ArrowRight className="ml-1.5 h-4 w-4" />
              </Button>
            </Card>

            <Card className="h-fit p-5">
              <JournalCalendar
                moodByDate={moodByDate}
                onSelectDate={(date) => router.push(`/journal/${date}`)}
              />
            </Card>

            <Card className="h-fit p-5">
              <h2 className="mb-3 text-sm font-semibold text-foreground">Filters</h2>
              <div className="space-y-3">
                <Select
                  label="Tag"
                  value={tagFilter}
                  onChange={(e) => {
                    setTagFilter(e.target.value);
                    setPage(1);
                  }}
                  options={[
                    { value: '', label: 'All tags' },
                    ...tags.map((tag) => ({ value: tag.id, label: tag.name })),
                  ]}
                />
                <Input
                  label="Date"
                  type="date"
                  value={dateFilter}
                  onChange={(e) => {
                    setDateFilter(e.target.value);
                    setPage(1);
                  }}
                />
                {(tagFilter || dateFilter) && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setTagFilter('');
                      setDateFilter('');
                      setPage(1);
                    }}
                  >
                    <X className="mr-1.5 h-4 w-4" />
                    Clear filters
                  </Button>
                )}
              </div>
            </Card>

            <Card className="h-fit p-5">
              <div className="flex items-center justify-between gap-2">
                <h2 className="text-sm font-semibold text-foreground">
                  Recently deleted ({deletedEntries.length})
                </h2>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowTrash((value) => !value)}
                >
                  {showTrash ? 'Hide' : 'Show'}
                </Button>
              </div>
              {showTrash && (
                <div className="mt-3">
                  {deletedEntries.length === 0 ? (
                    <p className="text-sm text-muted-foreground">Trash is empty.</p>
                  ) : (
                    <ul className="space-y-2">
                      {deletedEntries.map((entry) => {
                        const busy = busyId === entry.id;
                        return (
                          <li
                            key={entry.id}
                            className="rounded-lg border border-border bg-muted/50 p-3"
                          >
                            <p className="truncate text-sm font-medium text-foreground">
                              {entryLabel(entry)}
                            </p>
                            <p className="mt-0.5 text-xs text-muted-foreground">
                              {formatDate(entry.date)}
                            </p>
                            <div className="mt-2 flex flex-wrap gap-1.5">
                              <Button
                                size="sm"
                                variant="outline"
                                disabled={busy}
                                onClick={() => void runRestore(entry.id)}
                              >
                                <RotateCcw className="mr-1 h-3.5 w-3.5" />
                                Restore
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                disabled={busy}
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
                        );
                      })}
                    </ul>
                  )}
                </div>
              )}
            </Card>
          </div>

          <div>
            <h2 className="mb-4 text-lg font-semibold text-foreground">
              Recent entries
              {filtered.length !== (entries?.length ?? 0) && (
                <span className="ml-2 text-sm font-normal text-muted-foreground">
                  ({filtered.length} of {entries?.length ?? 0})
                </span>
              )}
            </h2>
            {filtered.length === 0 && (tagFilter || dateFilter) ? (
              <Card className="p-8 text-center text-sm text-muted-foreground">
                No entries match these filters.
              </Card>
            ) : (
              <JournalList
                entries={paged}
                onSelect={(id) => {
                  setCreating(false);
                  setEditingId(id);
                }}
                page={safePage}
                pageCount={pageCount}
                onPageChange={setPage}
                renderActions={(entry) => (
                  <>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => {
                        setCreating(false);
                        setEditingId(entry.id);
                      }}
                    >
                      <Pencil className="mr-1 h-3.5 w-3.5" />
                      Edit
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => setHistoryId(entry.id)}
                    >
                      <History className="mr-1 h-3.5 w-3.5" />
                      History
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() =>
                        setPendingDelete({
                          id: entry.id,
                          title: entryLabel(entry),
                          permanent: false,
                        })
                      }
                    >
                      <Trash2 className="mr-1 h-3.5 w-3.5" />
                      Delete
                    </Button>
                  </>
                )}
              />
            )}
          </div>
        </div>
      )}

      <Dialog
        open={pendingDelete !== null}
        onOpenChange={(open) => {
          if (!open) setPendingDelete(null);
        }}
        title={pendingDelete?.permanent ? 'Delete forever?' : 'Move to trash?'}
        description={
          pendingDelete?.permanent
            ? `"${pendingDelete?.title}" and its entire version history will be permanently deleted. This cannot be undone.`
            : `"${pendingDelete?.title}" will be moved to Recently deleted. You can restore it later — its version history is kept.`
        }
        footer={
          <>
            <Button variant="outline" onClick={() => setPendingDelete(null)}>
              Cancel
            </Button>
            <Button
              onClick={() => void runDelete()}
              isLoading={busyId !== null}
            >
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
        title={
          historyEntry
            ? `History — ${entryLabel(historyEntry)}`
            : 'Version history'
        }
        size="lg"
      >
        {historyId && (
          <JournalVersionHistory
            entryId={historyId}
            onRestored={() => {
              void load();
            }}
          />
        )}
      </Dialog>
    </div>
  );
}
