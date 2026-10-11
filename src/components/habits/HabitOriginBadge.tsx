'use client';

import { Sparkles, Pencil } from 'lucide-react';
import { Badge } from '@/components/ui';
import { cn } from '@/lib/utils';

/**
 * Provenance badge: was this habit copied from the catalogue, or made by hand?
 *
 * `Habit.definitionId` is the whole signal. A non-null value means the habit
 * began life as a copy of a catalogue suggestion; `null` means it is entirely
 * the user's own.
 *
 * The copy is made **once**, at creation. Nothing reads the definition again, so
 * this badge describes where a habit *came from*, never what it currently
 * matches. A user who has edited every field of a catalogue habit still shows
 * "From catalogue", which is accurate — it is provenance, not a claim that the
 * habit still matches the suggestion.
 *
 * Editing the badge to say "custom" would be a lie about where the habit came
 * from, and hiding it entirely would lose the one useful piece of information
 * on the row, so it is shown as-is.
 */
export function HabitOriginBadge({
  definitionId,
  className,
}: {
  definitionId?: string | null;
  className?: string;
}) {
  const fromCatalog = definitionId !== null && definitionId !== undefined;

  return (
    <Badge
      variant={fromCatalog ? 'primary' : 'default'}
      className={cn('gap-1', className)}
      title={
        fromCatalog
          ? 'Started as a copy of a catalogue suggestion. It is yours now — the catalogue no longer affects it.'
          : 'A habit you created yourself, with no catalogue entry behind it.'
      }
    >
      {fromCatalog ? (
        <>
          <Sparkles className="h-3 w-3" aria-hidden />
          From catalogue
        </>
      ) : (
        <>
          <Pencil className="h-3 w-3" aria-hidden />
          Custom
        </>
      )}
    </Badge>
  );
}