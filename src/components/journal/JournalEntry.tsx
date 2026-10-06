"use client";

/**
 * JournalEntry — a card summarizing a single journal entry: title, date,
 * favorite marker, mood/energy chips, a stripped content preview and the
 * attached tags. Whole card is clickable when `onSelect` is provided.
 *
 * Usage:
 *   <JournalEntry entry={entry} onSelect={(id) => openEntry(id)} />
 */
import { CalendarDays, Heart, Zap } from 'lucide-react';
import type { JournalEntryWithRelations } from '@/types/journal';
import { formatDateKeyShort } from '@/lib/journal/date';
import { richTextToPlainText } from '@/lib/security/html-sanitizer';
import { energyLabel, moodColor, moodLabel } from '@/constants/journal';
import { Badge, Card } from '@/components/ui';
import TagBadge from '../tags/TagBadge';
import { cn } from '@/lib/utils';

export interface JournalEntryProps {
  entry: JournalEntryWithRelations;
  /** Called with the entry id when the card is clicked. */
  onSelect?: (id: string) => void;
  className?: string;
}

export default function JournalEntry({ entry, onSelect, className }: JournalEntryProps) {
  // Sanitized before previewing: the stored HTML may predate the sanitizer, and
  // the preview should show exactly the text that will be rendered when opened.
  const preview = richTextToPlainText(entry.content);
  const label = moodLabel(entry.mood);
  const color = moodColor(entry.mood);
  const energy = energyLabel(entry.energy);

  const inner = (
    <>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="truncate text-base font-semibold text-gray-900">
            {entry.title && entry.title.length > 0 ? entry.title : 'Untitled entry'}
          </h3>
          <p className="mt-0.5 flex items-center gap-1 text-xs text-gray-500">
            <CalendarDays className="h-3.5 w-3.5" />
            {formatDateKeyShort(entry.date)}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          {entry.isArchived && (
            <Badge className="gap-1 border border-border bg-transparent text-[10px] uppercase tracking-wide text-muted-foreground">
              Archived
            </Badge>
          )}
          {entry.isFavorite && (
            <Heart
              className="h-5 w-5 fill-red-500 text-red-500"
              role="img"
              aria-label="Favorite"
            />
          )}
        </div>
      </div>

      <p className="mt-3 line-clamp-3 text-sm leading-relaxed text-gray-600">
        {preview.length > 0 ? preview : 'No content…'}
      </p>

      {(label || energy || entry.tags.length > 0) && (
        <div className="mt-4 flex flex-wrap items-center gap-1.5">
          {label && (
            <Badge
              variant="default"
              className="gap-1"
              style={{ backgroundColor: `${color ?? '#6b7280'}1f`, color: color ?? '#6b7280' }}
            >
              {label}
            </Badge>
          )}
          {energy && (
            <Badge variant="warning" className="gap-1">
              <Zap className="h-3 w-3" />
              {energy}
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
          aria-label={`Open journal entry for ${formatDateKeyShort(entry.date)}`}
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