import type { JournalEntryWithRelations, JournalGratitudeItem } from '@/types/journal';

/**
 * Journal export helpers.
 * Pure serializers for the user's entries in JSON or Markdown form.
 */

export type JournalExportFormat = 'json' | 'markdown';

/**
 * Coerce the stored gratitude JSON string back into its item array. Falls back
 * to an empty list when the field is missing or unparsable.
 */
export function parseGratitude(raw: string | null): JournalGratitudeItem[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (Array.isArray(parsed)) {
      return parsed.filter(
        (item): item is JournalGratitudeItem =>
          typeof item === 'object' &&
          item !== null &&
          typeof (item as { text?: unknown }).text === 'string'
      );
    }
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
 * array form.
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