'use client';

/**
 * Journal entry for one date — `/journal/2026-03-04`.
 *
 * Opens the entry for that day, or the editor in create mode filed under it.
 *
 * This used to be a dead end: an empty calendar date rendered "No entry for this
 * day" whose only action navigated back to `/journal`, and "New entry" always
 * filed under today. So a past day could be looked at but not written, and the
 * only way to journal yesterday was to change the system date.
 *
 * When the day already has an entry, the existing entry is edited — the schema
 * allows one entry per user per date, so a second would be a conflict rather
 * than a second thought.
 */
import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import type { Tag } from '@/generated/prisma';
import { ArrowLeft, BookOpen, PenLine } from 'lucide-react';
import { apiRequest } from '@/lib/api-client';
import type { JournalEntryWithRelations } from '@/types/journal';
import { Button, Spinner } from '@/components/ui';
import JournalEditor from '@/components/journal/JournalEditor';
import { formatDateKey, isFutureDateKey, isValidDateKey } from '@/lib/journal/date';
import { useUserTimezone } from '@/hooks/useUserTimezone';

export default function JournalDatePage() {
  const params = useParams<{ date: string }>();
  const router = useRouter();
  const date = params.date;
  const { today } = useUserTimezone();

  const [entry, setEntry] = useState<JournalEntryWithRelations | null>(null);
  /** `null` while loading; an invalid route date never reaches `true`. */
  const [canCreate, setCanCreate] = useState<boolean | null>(null);
  const [tags, setTags] = useState<Tag[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const validDate = isValidDateKey(date);

  const load = useCallback(async () => {
    setError(null);
    setLoading(true);
    try {
      const [entryData, tagData] = await Promise.all([
        validDate
          ? apiRequest<JournalEntryWithRelations[]>('/api/journal', {
              query: { date },
            })
          : Promise.resolve([] as JournalEntryWithRelations[]),
        apiRequest<Tag[]>('/api/tags'),
      ]);

      setEntry(entryData[0] ?? null);
      // A future day cannot be journalled: it has not happened, and the schema
      // would happily store an entry dated tomorrow, which would then be
      // "today" the moment the clock moved.
      setCanCreate(validDate && !isFutureDateKey(date, today));
      setTags(tagData);
    } catch (err) {
      // Previously the error was set but the state stayed `null`, and the
      // spinner was gated on it — so a failed load showed a spinner and an
      // error at the same time, with no retry.
      setEntry(null);
      setCanCreate(false);
      setError(err instanceof Error ? err.message : 'Failed to load journal entry');
    } finally {
      setLoading(false);
    }
  }, [date, validDate, today]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- mount data fetch
    void load();
  }, [load]);

  if (!validDate) {
    return (
      <div className="container mx-auto max-w-3xl px-4 py-8">
        <Link
          href="/journal"
          className="mb-6 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to journal
        </Link>
        <div className="rounded-xl border border-dashed border-border py-16 text-center">
          <p className="font-display text-lg font-semibold text-foreground">
            That is not a date
          </p>
          <p className="mx-auto mt-2 max-w-sm text-sm text-muted-foreground">
            “{date}” is not a day on the calendar. Journal days are written as
            YYYY-MM-DD.
          </p>
        </div>
      </div>
    );
  }

  const isFuture = isFutureDateKey(date, today);

  return (
    <div className="container mx-auto max-w-3xl px-4 py-8">
      <Link
        href="/journal"
        className="mb-6 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to journal
      </Link>

      <div className="mb-8">
        <h1 className="flex items-center gap-2 font-display text-2xl font-bold tracking-tight sm:text-3xl">
          <BookOpen className="h-7 w-7 shrink-0 text-primary" aria-hidden="true" />
          {formatDateKey(date)}
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {entry
            ? 'Your entry for this day.'
            : isFuture
              ? 'This day has not happened yet.'
              : 'Nothing written for this day yet.'}
        </p>
      </div>

      {error && (
        <div
          role="alert"
          className="mb-6 flex flex-wrap items-center gap-3 rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive"
        >
          <span className="flex-1">{error}</span>
          <Button variant="outline" size="sm" onClick={() => void load()}>
            Try again
          </Button>
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-16">
          <Spinner className="h-6 w-6" />
          <span className="sr-only">Loading entry</span>
        </div>
      ) : entry ? (
        <JournalEditor
          key={entry.id}
          entry={entry}
          availableTags={tags}
          onSaved={(saved) => {
            setEntry(saved);
            void router.refresh();
          }}
          // Present, and it matters: without it the editor had no Cancel button
          // and `beforeunload` does not fire on SPA navigation, so leaving this
          // page mid-edit discarded the draft silently.
          onCancel={() => router.push('/journal')}
        />
      ) : isFuture ? (
        <div className="rounded-xl border border-dashed border-border py-16 text-center">
          <PenLine className="mx-auto h-10 w-10 text-muted-foreground/60" aria-hidden="true" />
          <p className="mt-3 font-display text-lg font-semibold text-foreground">
            Not yet
          </p>
          <p className="mx-auto mt-2 max-w-sm text-sm text-muted-foreground">
            You can write about {formatDateKey(date)} once the day has happened.
          </p>
        </div>
      ) : canCreate ? (
        <JournalEditor
          key={`new-${date}`}
          date={date}
          availableTags={tags}
          onSaved={(saved) => {
            setEntry(saved);
            void router.refresh();
          }}
          onCancel={() => router.push('/journal')}
        />
      ) : null}
    </div>
  );
}
