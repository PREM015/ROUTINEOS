/**
 * Journal rating vocabulary.
 *
 * These lived in `components/journal/JournalEntry.tsx`, which inverted the
 * dependency direction: `components/wellness/MoodCalendar.tsx` and
 * `app/(dashboard)/wellness/mood/page.tsx` both imported them from the journal
 * card, so a wellness screen depended on a journal component that also
 * imported `Card`, `TagBadge` and `lucide-react`. Plain data belongs here,
 * where both sides can reach it without dragging a component in.
 *
 * `constants/` is client-safe: no Prisma, no repository, no server import.
 */

export type JournalRatingKey = 1 | 2 | 3 | 4 | 5;

/** The 1–5 scale offered by both rating pickers. */
export const JOURNAL_RATINGS: readonly JournalRatingKey[] = [1, 2, 3, 4, 5];

export const MIN_JOURNAL_RATING = 1;
export const MAX_JOURNAL_RATING = 5;

export const MOOD_FALLBACK_COLOR = '#6b7280';

/**
 * Mood word for each rating.
 *
 * Deliberately absolute words: the calendar legend and the list badge read
 * these without any surrounding context, so "Good" needs to mean "good" on
 * its own.
 */
export const MOOD_LABELS: Record<number, string> = {
  1: 'Bad',
  2: 'Low',
  3: 'Okay',
  4: 'Good',
  5: 'Great',
};

/**
 * Mood is the one colour-carrying value in Journal: it is a record of what the
 * user wrote, never an inferred score. The scale runs red → green so the
 * calendar reads left-to-right as "worse → better".
 */
export const MOOD_COLORS: Record<number, string> = {
  1: '#ef4444',
  2: '#f97316',
  3: '#eab308',
  4: '#84cc16',
  5: '#22c55e',
};

/**
 * Energy words.
 *
 * These were the mood words, verbatim: the energy picker's tooltip said "Bad"
 * through "Great" for a different question. Asking about energy means
 * drained → wired, which is a different axis than mood's bad → great, and the
 * two now read differently at the same rating.
 */
export const ENERGY_LABELS: Record<number, string> = {
  1: 'Drained',
  2: 'Tired',
  3: 'Steady',
  4: 'Energised',
  5: 'Wired',
};

/** Fall back predictably rather than rendering `undefined`. */
export function moodLabel(mood: number | null | undefined): string | null {
  if (mood === null || mood === undefined) return null;
  return MOOD_LABELS[mood] ?? `Mood ${mood}`;
}

export function moodColor(mood: number | null | undefined): string | null {
  if (mood === null || mood === undefined) return null;
  return MOOD_COLORS[mood] ?? MOOD_FALLBACK_COLOR;
}

export function energyLabel(energy: number | null | undefined): string | null {
  if (energy === null || energy === undefined) return null;
  return ENERGY_LABELS[energy] ?? `Energy ${energy}`;
}
