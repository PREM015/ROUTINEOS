import type { JournalEntryWithRelations, JournalSearchResult } from '@/types/journal';

/**
 * Journal search ranking — pure.
 *
 * These four functions used to live in `lib/journal/search.ts` beside the
 * repository call, and that file instantiated `new JournalRepository()` at
 * module scope. Importing any of them therefore loaded `@/lib/prisma`, which
 * throws without `DATABASE_URL` — which is why a self-contained domain had no
 * tests at all. Splitting the pure half out makes them testable and leaves the
 * service as the only thing that touches the database.
 */

/** Trimmed, lowercased, whitespace-collapsed. */
export function normalizeSearchTerm(term: string): string {
  return term.trim().replace(/\s+/g, ' ').toLowerCase();
}

/** How many times `term` appears in `text`, case-insensitively. */
export function countOccurrences(text: string, term: string): number {
  if (term.length === 0) return 0;
  const haystack = text.toLowerCase();
  let count = 0;
  let index = 0;
  while (index !== -1) {
    index = haystack.indexOf(term, index);
    if (index === -1) break;
    count += 1;
    index += term.length;
  }
  return count;
}

/**
 * A window of `text` centred on the first match, with `…` where it was cut.
 *
 * The window is `radius` characters either side of the match, so short text is
 * returned whole rather than truncated for no reason.
 *
 * @example
 * buildSnippet('never give up, never surrender', 'never') // => 'never give up, never surrender'
 * buildSnippet(`a ${'x'.repeat(200)} needle`, 'needle', 5) // => '…xxxxx needle…'
 */
export function buildSnippet(text: string, term: string, radius: number = 60): string {
  const normalized = normalizeSearchTerm(term);
  const index = text.toLowerCase().indexOf(normalized);
  if (index === -1 || normalized.length === 0) {
    return text.length > radius * 2 ? `${text.slice(0, radius * 2)}…` : text;
  }

  const start = Math.max(0, index - radius);
  const end = Math.min(text.length, index + normalized.length + radius);
  const prefix = start > 0 ? '…' : '';
  const suffix = end < text.length ? '…' : '';
  return `${prefix}${text.slice(start, end)}${suffix}`;
}

/** A title match counts double: naming something in the heading is a stronger signal. */
const TITLE_MATCH_WEIGHT = 2;

/**
 * Rank entries by how well they match `term`.
 *
 * Entries with no match are dropped rather than returned with a score of zero,
 * so a caller can rank a wide candidate set and take the top slice without
 * filtering afterwards.
 */
export function rankResults(
  term: string,
  entries: readonly JournalEntryWithRelations[]
): JournalSearchResult[] {
  const normalized = normalizeSearchTerm(term);
  if (normalized.length === 0) return [];

  const scored: Array<{ score: number; result: JournalSearchResult }> = [];

  for (const entry of entries) {
    const titleMatches = countOccurrences(entry.title ?? '', normalized);
    const contentMatches = countOccurrences(entry.content, normalized);
    const matchCount = titleMatches + contentMatches;
    if (matchCount === 0) continue;

    const matchField: JournalSearchResult['matchField'] =
      titleMatches > 0 && titleMatches >= contentMatches ? 'title' : 'content';

    scored.push({
      score: matchCount * (matchField === 'title' ? TITLE_MATCH_WEIGHT : 1),
      result: {
        entryId: entry.id,
        date: entry.date,
        title: entry.title,
        contentSnippet: buildSnippet(
          matchField === 'title' ? (entry.title ?? '') : entry.content,
          normalized
        ),
        matchField,
        matchCount,
      },
    });
  }

  return scored
    .sort((a, b) => b.score - a.score)
    .map((item) => item.result);
}
