import { JournalRepository } from '@/server/repositories/journal.repository';
import type { JournalEntryWithRelations } from '@/types/journal';
import type { JournalSearchResult } from '@/types/journal';

/**
 * Journal search helpers.
 * Term normalization, repository delegation, and client-side relevance ranking.
 */

const journalRepository = new JournalRepository();

/**
 * Normalize a search term: trimmed, lowercased, whitespace collapsed.
 */
export function normalizeSearchTerm(term: string): string {
  return term.trim().replace(/\s+/g, ' ').toLowerCase();
}

/**
 * Count how many times `term` appears (case-insensitive) in `text`.
 */
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
 * Extract a text snippet centered on the first occurrence of `term`.
 * @example
 * buildSnippet('never give up, never surrender', 'never') // => 'never give up, never sur'
 */
export function buildSnippet(text: string, term: string, radius: number = 60): string {
  const normalized = normalizeSearchTerm(term);
  const index = text.toLowerCase().indexOf(normalized);
  if (index === -1 || normalized.length === 0) {
    return text.length > radius * 2
      ? `${text.slice(0, radius * 2)}…`
      : text;
  }

  const start = Math.max(0, index - radius);
  const end = Math.min(text.length, index + normalized.length + radius);
  const prefix = start > 0 ? '…' : '';
  const suffix = end < text.length ? '…' : '';
  return `${prefix}${text.slice(start, end)}${suffix}`;
}

/**
 * Rank entries by how well they match `term`, producing result objects with
 * snippets and match counts.
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

    let matchField: JournalSearchResult['matchField'] = 'content';
    if (titleMatches > 0 && titleMatches >= contentMatches) {
      matchField = 'title';
    }

    const source = matchField === 'title' ? (entry.title ?? '') : entry.content;
    const snippet = buildSnippet(source, normalized);
    const matchCount = titleMatches + contentMatches;
    if (matchCount === 0) continue;

    const result: JournalSearchResult = {
      entryId: entry.id,
      date: entry.date,
      title: entry.title,
      contentSnippet: snippet,
      matchField,
      matchCount,
    };

    const weight = matchField === 'title' ? 2 : 1;
    scored.push({ score: matchCount * weight, result });
  }

  return scored
    .sort((a, b) => b.score - a.score)
    .map(item => item.result);
}

/**
 * Search the user's journal, delegating the database query to the repository
 * and ranking the results by relevance.
 */
export async function searchJournalEntries(
  userId: string,
  term: string,
  limit: number = 20
): Promise<JournalSearchResult[]> {
  const normalized = normalizeSearchTerm(term);
  if (normalized.length === 0) return [];

  const matches = (await journalRepository.search(
    userId,
    normalized,
    limit * 3
  )) as JournalEntryWithRelations[];

  return rankResults(normalized, matches).slice(0, limit);
}