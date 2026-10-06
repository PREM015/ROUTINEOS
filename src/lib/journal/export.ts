import type { JournalEntryWithRelations, JournalGratitudeItem } from '@/types/journal';

/**
 * Journal export helpers.
 * Pure serializers for the user's entries in JSON or Markdown form.
 */

export type JournalExportFormat = 'json' | 'markdown';

/**
 * Coerce the stored gratitude JSON string back into its item array.
 *
 * Two shapes are accepted because both exist in the `gratitude` column:
 *
 *   - `["coffee", "a quiet morning"]` — what the journal editor writes today;
 *   - `[{"text": "coffee", "emoji": "☕"}]` — what `/today`'s reflection wrote,
 *     which shares the column convention but carries objects.
 *
 * Rejecting the object form would silently drop gratitude from an export of a
 * journal that had it, which is exactly the failure an export exists to prevent.
 * Entries with neither shape, or unparsable JSON, yield an empty list.
 */
export function parseGratitude(raw: string | null): JournalGratitudeItem[] {
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];

    return parsed
      .map((item): JournalGratitudeItem | null => {
        if (typeof item === 'string') {
          return item.trim().length > 0 ? { text: item } : null;
        }
        if (typeof item === 'object' && item !== null) {
          const text = (item as { text?: unknown }).text;
          if (typeof text !== 'string' || text.trim().length === 0) return null;
          const emoji = (item as { emoji?: unknown }).emoji;
          return typeof emoji === 'string' ? { text, emoji } : { text };
        }
        return null;
      })
      .filter((item): item is JournalGratitudeItem => item !== null);
  } catch {
    // fallthrough to empty
  }
  return [];
}

/**
 * Serialize a single entry to Markdown.
 */
export function entryToMarkdown(entry: JournalEntryWithRelations): string {
  const title = entry.title ?? entry.date;
  const lines: string[] = [
    `## ${title}`,
    '',
    `*Date: ${entry.date}*`,
  ];

  if (entry.mood !== null && entry.mood !== undefined) {
    lines.push(`*Mood: ${'●'.repeat(entry.mood)}${'○'.repeat(5 - entry.mood)}*`);
  }
  if (entry.energy !== null && entry.energy !== undefined) {
    lines.push(`*Energy: ${'●'.repeat(entry.energy)}${'○'.repeat(5 - entry.energy)}*`);
  }

  const tags = entry.tags ?? [];
  if (tags.length > 0) {
    lines.push(`*Tags: ${tags.map(tag => tag.tag.name).join(', ')}*`);
  }

  lines.push('', entry.content, '');

  const gratitude = parseGratitude(entry.gratitude ?? null);
  if (gratitude.length > 0) {
    lines.push('**Gratitude**', '');
    for (const item of gratitude) {
      lines.push(`- ${item.text}`);
    }
    lines.push('');
  }

  return lines.join('\n');
}

/**
 * Serialize a set of entries to a single Markdown document.
 */
export function journalEntriesToMarkdown(entries: readonly JournalEntryWithRelations[]): string {
  return entries
    .map(entryToMarkdown)
    .join('\n---\n\n')
    .trim();
}

/**
 * Serialize entries to a JSON string. `gratitude` is expanded back into its
 * item array so a JSON export round-trips through `parseGratitude` and stays
 * readable rather than leaking the column's storage shape.
 */
export function journalEntriesToJson(entries: readonly JournalEntryWithRelations[]): string {
  return JSON.stringify(
    entries.map(entry => ({
      id: entry.id,
      date: entry.date,
      title: entry.title,
      content: entry.content,
      mood: entry.mood,
      energy: entry.energy,
      gratitude: parseGratitude(entry.gratitude ?? null),
      isFavorite: entry.isFavorite,
      isArchived: entry.isArchived,
      createdAt: entry.createdAt,
      updatedAt: entry.updatedAt,
    })),
    null,
    2
  );
}

/**
 * Export entries in the requested format.
 * @example
 * exportJournalEntries(entries, 'markdown') // => '## 2026-09-18\n\n*Date: 2026-09-18*...'
 */
export function exportJournalEntries(
  entries: readonly JournalEntryWithRelations[],
  format: JournalExportFormat = 'json'
): string {
  if (format === 'markdown') return journalEntriesToMarkdown(entries);
  return journalEntriesToJson(entries);
}

/**
 * Suggest a filename for an exported journal, e.g. `journal-2026-09-18.md`.
 */
export function journalExportFilename(
  format: JournalExportFormat,
  date: string = new Date().toISOString().slice(0, 10)
): string {
  const extension = format === 'markdown' ? 'md' : 'json';
  return `journal-${date}.${extension}`;
}