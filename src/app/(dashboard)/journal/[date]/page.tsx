'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import type { Tag } from '@prisma/client';
import { ArrowLeft, BookOpen, PenLine } from 'lucide-react';
import { apiRequest } from '@/lib/api-client';
import type { JournalEntryWithRelations } from '@/types/journal';
import { EmptyState, Spinner } from '@/components/ui';
import JournalEditor from '@/components/journal/JournalEditor';

function formatHeading(date: string): string {
  const parsed = new Date(`${date}T12:00:00`);
  if (Number.isNaN(parsed.getTime())) return date;
  return parsed.toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });
}

/**
 * Journal Entry by Date Page
 * Shows and edits the journal entry (or entries) for a specific day.
 */
export default function JournalDatePage() {
  const params = useParams<{ date: string }>();
  const router = useRouter();
  const date = params.date;

  const [entries, setEntries] = useState<JournalEntryWithRelations[] | null>(null);
  const [tags, setTags] = useState<Tag[]>([]);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [entryData, tagData] = await Promise.all([
        apiRequest<JournalEntryWithRelations[]>(`/api/journal?date=${encodeURIComponent(date)}`),
        apiRequest<Tag[]>('/api/tags'),
      ]);
      setEntries(entryData);
      setTags(tagData);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load journal entry');
    }
  }, [date]);

  useEffect(() => {
    void load();
  }, [load]);

  const entry = entries?.[0] ?? null;

  return (
    <div className="container mx-auto max-w-3xl px-4 py-8">
      <Link
        href="/journal"
        className="mb-6 inline-flex items-center gap-1.5 text-sm text-gray-600 hover:text-gray-900"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to journal
      </Link>

      <div className="mb-8">
        <h1 className="flex items-center gap-2 text-3xl font-bold">
          <BookOpen className="h-7 w-7 text-blue-600" />
          {formatHeading(date)}
        </h1>
      </div>

      {error && (
        <p role="alert" className="mb-6 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-600">
          {error}
        </p>
      )}

      {!entries ? (
        <div className="flex justify-center py-16">
          <Spinner className="h-6 w-6" />
        </div>
      ) : entry ? (
        <JournalEditor
          entry={entry}
          availableTags={tags}
          onSaved={() => {
            void load();
          }}
        />
      ) : (
        <EmptyState
          icon={<PenLine className="h-10 w-10 text-gray-300" />}
          title="No entry for this day"
          description="You did not record a journal entry on this date."
          action={{ label: 'Write in journal', onClick: () => router.push('/journal') }}
        />
      )}
    </div>
  );
}
