"use client";

/**
 * JournalEntry — a card summarizing a single journal entry: title, date,
 * favorite marker, mood/energy chips, a stripped content preview and the
 * attached tags. Whole card is clickable when `onSelect` is provided.
 *
 * Usage:
 *   <JournalEntry entry={entry} onSelect={(id) => openEntry(id)} />
 */
import { CalendarDays, Heart, Smile, Zap } from 'lucide-react';
import type { JournalEntryWithRelations } from '@/types/journal';
import { formatDate } from '@/lib/utils';
import { Badge, Card } from '@/components/ui';
import TagBadge from '../tags/TagBadge';
import { cn } from '@/lib/utils';

export const MOOD_LABELS: Record<number, string> = {
  1: 'Bad',
  2: 'Low',
  3: 'Okay',
  4: 'Good',
  5: 'Great',
};

export const MOOD_COLORS: Record<number, string> = {
  1: '#ef4444',
  2: '#f97316',
  3: '#eab308',
  4: '#84cc16',
  5: '#22c55e',
};

export interface JournalEntryProps {
  entry: JournalEntryWithRelations;
  /** Called with the entry id when the card is clicked. */
  onSelect?: (id: string) => void;
  className?: string;
}

/** Strip HTML tags from stored content for a plain-text preview. */
function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
}

export default function JournalEntry({ entry, onSelect, className }: JournalEntryProps) {
  const preview = stripHtml(entry.content);
  const mood = entry.mood;
  const energy = entry.energy;
  const moodLabel = mood !== null && mood !== undefined ? (MOOD_LABELS[mood] ?? `Mood ${mood}`) : null;
  const moodColor =
    mood !== null && mood !== undefined ? (MOOD_COLORS[mood] ?? '#6b7280') : null;

  const inner = (
    <>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="truncate text-base font-semibold text-gray-900">
            {entry.title && entry.title.length > 0 ? entry.title : 'Untitled entry'}
          </h3>
          <p className="mt-0.5 flex items-center gap-1 text-xs text-gray-500">
            <CalendarDays className="h-3.5 w-3.5" />
            {formatDate(entry.date)}
          </p>
        </div>
        {entry.isFavorite && (
          <Heart className="h-5 w-5 shrink-0 fill-red-500 text-red-500" aria-label="Favorite" />
        )}
      </div>

      <p className="mt-3 line-clamp-3 text-sm leading-relaxed text-gray-600">
        {preview.length > 0 ? preview : 'No content…'}
      </p>

      {(moodLabel || energy !== null || entry.tags.length > 0) && (
        <div className="mt-4 flex flex-wrap items-center gap-1.5">
          {moodLabel && (
            <Badge
              variant="default"
              className="gap-1"
              style={{ backgroundColor: `${moodColor ?? '#6b7280'}1f`, color: moodColor ?? '#6b7280' }}
            >
              <Smile className="h-3 w-3" />
              {moodLabel}
            </Badge>
          )}
          {energy !== null && energy !== undefined && (
            <Badge variant="warning" className="gap-1">
              <Zap className="h-3 w-3" />
              Energy {energy}/5
            </Badge>
          )}
          {entry.tags.map((relation) => (
            <TagBadge key={relation.tag.id} label={relation.tag.name} color={relation.tag.color} />
          ))}
        </div>
      )}
    </>
  );

  return (
    <Card
      className={cn(
        'p-5 transition-shadow',
        onSelect && 'cursor-pointer hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600',
        className,
      )}
    >
      {onSelect ? (
        <button
          type="button"
          onClick={() => onSelect(entry.id)}
          aria-label={`Open journal entry for ${formatDate(entry.date)}`}
          className="block w-full text-left focus-visible:outline-none"
        >
          {inner}
        </button>
      ) : (
        inner
      )}
    </Card>
  );
}