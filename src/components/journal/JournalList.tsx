'use client';

/**
 * JournalList — a responsive grid of JournalEntry cards with an optional
 * action row under each card.
 *
 * Pagination is the page's job, not the list's. The list used to take
 * `page`/`pageCount` and slice the entries it was handed, which meant the page
 * fetched 100 rows and paginated those 100 locally — so entry 101 was
 * unreachable. Paging is now driven by the server's `total`, and this component
 * only renders one page of whatever it is given.
 */
import { BookOpen } from 'lucide-react';
import type { ReactNode } from 'react';
import type { JournalEntryWithRelations } from '@/types/journal';
import { cn } from '@/lib/utils';
import { SCROLL_CARD } from '@/components/dashboard-ui/tokens';
import { EmptyState } from '@/components/ui';
import JournalEntry from './JournalEntry';

export interface JournalListProps {
  entries: JournalEntryWithRelations[];
  onSelect?: (id: string) => void;
  /** Optional action controls rendered under each entry card. */
  renderActions?: (entry: JournalEntryWithRelations) => ReactNode;
  className?: string;
}

export default function JournalList({
  entries,
  onSelect,
  renderActions,
  className,
}: JournalListProps) {
  if (entries.length === 0) {
    return (
      <EmptyState
        icon={<BookOpen className="h-10 w-10 text-gray-300" />}
        title="No journal entries"
        description="Write your first entry to start capturing your reflections."
      />
    );
  }

  return (
    <div className={cn('flex min-h-0 flex-col overflow-hidden', SCROLL_CARD.card, className)}>
      {/*
        Two columns rather than three: an entry's preview needs a measure a
        third of a wide desktop column cannot hold, and a two-line summary is
        more use than a grid density that pushes the calendar off screen.

        The grid scrolls. A journal with a few hundred entries is a page-long
        grid otherwise, and the filters above it stop being reachable.
      */}
      <div
        className={cn(
          'grid grid-cols-1 content-start gap-4 pr-1 md:grid-cols-2',
          SCROLL_CARD.region
        )}
      >
        {entries.map((entry) => (
          <div key={entry.id} className="flex min-w-0 flex-col gap-1">
            <JournalEntry entry={entry} onSelect={onSelect} className="flex-1" />
            {renderActions && (
              <div className="flex flex-wrap items-center gap-1 px-1">{renderActions(entry)}</div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
