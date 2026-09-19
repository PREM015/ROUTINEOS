'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { Tag } from '@prisma/client';
import { BookOpen, Plus, X } from 'lucide-react';
import { apiRequest } from '@/lib/api-client';
import type { JournalEntryWithRelations } from '@/types/journal';
import { Button, Card, Spinner } from '@/components/ui';
import JournalCalendar from '@/components/journal/JournalCalendar';
import JournalList from '@/components/journal/JournalList';
import JournalEditor from '@/components/journal/JournalEditor';

function toDateKey(date: Date | string): string {
  return new Date(date).toISOString().slice(0, 10);
}

/**
 * Journal Page
 * Calendar of journal activity, recent entries, and an inline editor.
 */
export default function JournalPage() {
  const router = useRouter();
  const [entries, setEntries] = useState<JournalEntryWithRelations[] | null>(null);
  const [tags, setTags] = useState<Tag[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  const load = useCallback(async () => {
    try {
      const [entryData, tagData] = await Promise.all([
        apiRequest<JournalEntryWithRelations[]>('/api/journal'),
        apiRequest<Tag[]>('/api/tags'),
      ]);
      setEntries(entryData);
      setTags(tagData);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load journal');
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const moodByDate = useMemo(() => {
    const map: Record<string, number | null> = {};
    for (const entry of entries ?? []) {
      map[toDateKey(entry.date)] = entry.mood;
    }
    return map;
  }, [entries]);

  const editing = useMemo(
    () => (entries ?? []).find((entry) => entry.id === editingId) ?? null,
    [entries, editingId],
  );

  const closeEditor = () => {
    setEditingId(null);
    setCreating(false);
  };

  const handleSaved = () => {
    closeEditor();
    void load();
  };

  return (
    <div className="container mx-auto max-w-6xl px-4 py-8">
      <div className="mb-8 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-2 text-3xl font-bold">
            <BookOpen className="h-7 w-7 text-blue-600" />
            Journal
          </h1>
          <p className="mt-2 text-gray-600">
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
        <p role="alert" className="mb-6 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-600">
          {error}
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
          <Card className="h-fit p-5">
            <JournalCalendar
              moodByDate={moodByDate}
              onSelectDate={(date) => router.push(`/journal/${date}`)}
            />
          </Card>
          <div>
            <h2 className="mb-4 text-lg font-semibold text-gray-900">Recent entries</h2>
            <JournalList entries={entries} onSelect={(id) => setEditingId(id)} />
          </div>
        </div>
      )}
    </div>
  );
}
