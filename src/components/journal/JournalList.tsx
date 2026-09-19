"use client";

/**
 * JournalList — a responsive grid of JournalEntry cards with optional
 * pagination and an empty state.
 *
 * Usage:
 *   <JournalList entries={entries} onSelect={open} page={p} pageCount={n} onPageChange={setP} />
 */
import { BookOpen } from 'lucide-react';
import type { JournalEntryWithRelations } from '@/types/journal';
import { EmptyState } from '@/components/ui';
import Pagination from '@/components/ui/Pagination';
import JournalEntry from './JournalEntry';

export interface JournalListProps {
  entries: JournalEntryWithRelations[];
  onSelect?: (id: string) => void;
  /** One-based current page; omit to hide pagination. */
  page?: number;
  pageCount?: number;
  onPageChange?: (page: number) => void;
  className?: string;
}

export default function JournalList({
  entries,
  onSelect,
  page,
  pageCount,
  onPageChange,
  className,
}: JournalListProps) {
  if (entries.length === 0) {
    return (
      <EmptyState
        icon={<BookOpen className="h-10 w-10 text-gray-300" />}
        title="No journal entries"
        description="Write your first entry to start tracking your mood, energy, and reflections."
      />
    );
  }

  const showPagination =
    typeof page === 'number' && typeof pageCount === 'number' && onPageChange !== undefined;

  return (
    <div className={className}>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {entries.map((entry) => (
          <JournalEntry key={entry.id} entry={entry} onSelect={onSelect} />
        ))}
      </div>
      {showPagination && page !== undefined && pageCount !== undefined && onPageChange && (
        <div className="mt-6 flex justify-center">
          <Pagination page={page} pageCount={pageCount} onPageChange={onPageChange} />
        </div>
      )}
    </div>
  );
}