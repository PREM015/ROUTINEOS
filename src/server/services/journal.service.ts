import type { JournalRevision, Prisma } from '@/generated/prisma';
import {
  ConflictError,
  NotFoundError,
  ValidationError,
} from '@/lib/errors/app-error';
import {
  exportJournalEntries,
  journalExportFilename,
  type JournalExportFormat,
} from '@/lib/journal/export';
import { isValidDateKey, monthRange } from '@/lib/journal/date';
import { EXPORT_MAX_ENTRIES, ForeignTagError } from '@/lib/journal/policy';
import { normalizeSearchTerm, rankResults } from '@/lib/journal/search-ranking';
import { sanitizeRichText } from '@/lib/security/html-sanitizer';
import {
  createJournalEntrySchema,
  updateJournalEntrySchema,
  type CreateJournalEntryInput,
  type UpdateJournalEntryInput,
} from '@/schemas/journal.schema';
import {
  JournalRepository,
  type JournalQueryParams,
  type JournalSortField,
  type JournalSortOrder,
} from '@/server/repositories/journal.repository';
import type { JournalEntryWithRelations, JournalSearchResult } from '@/types/journal';
import type { UserId } from '@/types/ids';

/**
 * How many candidates ranking may consider per requested result.
 *
 * Ranking reorders a candidate set rather than filtering it, so the repository
 * is asked for more than the caller wants: a page of 20 drawn from the top 20
 * by database order would rank no better than no ranking at all.
 */
const SEARCH_CANDIDATE_MULTIPLIER = 3;

/**
 * Journal Service
 * Business logic for journal entries.
 *
 * Journal was the one domain whose logic lived in `src/lib/journal/crud.ts`,
 * which reached `JournalRepository` directly from a `lib/` file. That put three
 * decisions in the wrong place: what a PATCH `null` means, whether a tag belongs
 * to the caller, and what a `null` from a repository means to an HTTP response.
 * They live here now; the repository is data access and routes are transport.
 *
 * Identity always arrives as an argument and is never read from the request, so
 * there is no path by which a caller can act on another user's entry.
 */

export interface JournalListFilters {
  search?: string;
  mood?: number;
  isFavorite?: boolean;
  isArchived?: boolean;
  /** Inclusive lower bound, `YYYY-MM-DD`. */
  startDate?: string;
  /** Inclusive upper bound, `YYYY-MM-DD`. */
  endDate?: string;
  /**
   * A single day, `YYYY-MM-DD`.
   *
   * Expanded into a one-day range here rather than in each caller. The list
   * route, the export route and the `/journal/[date]` page all pass it through,
   * and when only the first two honoured it the date page received the whole
   * journal and opened `entries[0]` — the newest entry, not the one for the day
   * in the URL. A filter that looks applied but is not is worse than a missing
   * one, because the result set claims to be filtered.
   */
  date?: string;
  /** A calendar month, `YYYY-MM`. */
  month?: string;
  tagId?: string;
  sortBy?: JournalSortField;
  sortOrder?: JournalSortOrder;
  limit?: number;
  offset?: number;
}

export interface JournalPageResult {
  entries: JournalEntryWithRelations[];
  /** Size of the whole matching set, not of this page. */
  total: number;
  limit: number;
  offset: number;
  hasMore: boolean;
}

export interface JournalExportResult {
  filename: string;
  contentType: string;
  body: string;
  /** Entries in the file. */
  count: number;
  /** True when the match set hit the repository's export ceiling. */
  truncated: boolean;
}

/** Raised when a create targets a day that already has an entry. */
export class JournalDateConflictError extends ConflictError {
  readonly existingEntry: JournalEntryWithRelations;

  constructor(date: string, existingEntry: JournalEntryWithRelations) {
    super(`An entry already exists for ${date}`, { date, entryId: existingEntry.id });
    this.name = 'JournalDateConflictError';
    this.existingEntry = existingEntry;
  }
}

function toEntry(
  entry: Awaited<ReturnType<JournalRepository['findById']>>
): JournalEntryWithRelations {
  return entry as JournalEntryWithRelations;
}

/**
 * `null` for "leave alone" vs `null` for "clear" are different instructions, so
 * every optional field is built by presence check rather than by `??`. The
 * previous update used `mood: fields.mood ?? undefined`, which made clearing a
 * rating indistinguishable from not sending one.
 */
function buildUpdateData(input: UpdateJournalEntryInput): Prisma.JournalEntryUpdateInput {
  const data: Prisma.JournalEntryUpdateInput = {};

  if (input.title !== undefined) {
    // An empty title is a cleared title, not a validation error: the field is
    // optional on the entry, and refusing to save meant the user could not
    // un-title an entry at all.
    const trimmed = input.title?.trim() ?? '';
    data.title = trimmed.length > 0 ? trimmed : null;
  }
  if (input.content !== undefined) {
    data.content = sanitizeRichText(input.content);
  }
  if (input.mood !== undefined) data.mood = input.mood;
  if (input.energy !== undefined) data.energy = input.energy;
  if (input.isFavorite !== undefined) data.isFavorite = input.isFavorite;
  if (input.isArchived !== undefined) data.isArchived = input.isArchived;
  if (input.gratitude !== undefined) {
    data.gratitude = serializeGratitude(input.gratitude);
  }

  return data;
}

function serializeGratitude(items: readonly string[] | null): string | null {
  if (items === null) return null;
  const cleaned = items.map((item) => item.trim()).filter((item) => item.length > 0);
  return cleaned.length > 0 ? JSON.stringify(cleaned) : null;
}

/** UTC date, for naming an unfiltered export file. Filename only. */
function todayStamp(): string {
  return new Date().toISOString().slice(0, 10);
}

export function parseStoredGratitude(raw: string | null | undefined): string[] {
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item): item is string => typeof item === 'string');
  } catch {
    // A corrupt column should not stop an entry from being read; the export
    // serializers treat unparsable gratitude the same way.
    return [];
  }
}

export class JournalService {
  private journalRepository: JournalRepository;

  constructor() {
    this.journalRepository = new JournalRepository();
  }

  /**
   * Create an entry, or report the entry that already occupies that date.
   *
   * `JournalEntry` is `@@unique([userId, date])`, so one day is one entry and
   * two writes for the same day are a conflict at the database level. This
   * resolves it deliberately instead of letting Prisma's P2002 reach the client
   * as a generic failure, and it checks before writing so a rejected create
   * leaves nothing behind.
   *
   * Soft-deleted entries count as occupying their date: `@@unique` ignores
   * `deletedAt`, so a create for a trashed day would fail on the constraint
   * even though no active entry exists. The caller is told to restore first.
   */
  async create(userId: UserId, input: CreateJournalEntryInput): Promise<JournalEntryWithRelations> {
    const data = createJournalEntrySchema.parse(input);

    if (!isValidDateKey(data.date)) {
      throw new ValidationError(`Invalid journal date: ${data.date}`);
    }

    const existing = await this.journalRepository.findByDateIncludingDeleted(userId, data.date);
    if (existing) {
      throw new JournalDateConflictError(data.date, toEntry(existing));
    }

    // Checked before the insert so a foreign tag cannot leave a half-created
    // entry behind. `setTags` re-checks on the write path; this one exists to
    // fail early enough to be clean.
    await this.assertTagsOwned(userId, data.tagIds ?? []);

    const created = await this.journalRepository.create(userId, {
      date: data.date,
      // `null` and "absent" mean the same thing on create — there is no previous
      // value to preserve — so both collapse to an unset column here rather than
      // being handed to Prisma as a literal null.
      title: data.title?.trim() || undefined,
      content: sanitizeRichText(data.content),
      mood: data.mood ?? undefined,
      energy: data.energy ?? undefined,
      gratitude: data.gratitude ? serializeGratitude(data.gratitude) ?? undefined : undefined,
      isFavorite: data.isFavorite,
    });

    if (data.tagIds && data.tagIds.length > 0) {
      await this.journalRepository.setTags(userId, created.id, data.tagIds);
    }

    return toEntry(await this.journalRepository.findById(userId, created.id));
  }

  /**
   * Apply a partial update.
   *
   * The previous title and content are snapshotted into a revision *before* the
   * overwrite, so history survives every save. Only title and content are
   * versioned, because that is all `JournalRevision` stores — mood and tag
   * changes are deliberately not recorded as revisions rather than being
   * recorded incompletely.
   */
  async update(
    userId: UserId,
    entryId: string,
    input: UpdateJournalEntryInput
  ): Promise<JournalEntryWithRelations> {
    const data = updateJournalEntrySchema.parse(input);
    const { tagIds, ...fields } = data;

    const existing = await this.journalRepository.findById(userId, entryId);
    if (!existing) throw new NotFoundError('Journal entry');

    const updateData = buildUpdateData(fields);

    const titleChanged = fields.title !== undefined && (fields.title?.trim() || null) !== existing.title;
    const contentChanged = fields.content !== undefined && sanitizeRichText(fields.content) !== existing.content;

    if (titleChanged || contentChanged) {
      await this.journalRepository.createRevision(
        userId,
        entryId,
        existing.title,
        existing.content
      );
    }

    if (tagIds !== undefined) {
      await this.assertTagsOwned(userId, tagIds);
    }

    if (Object.keys(updateData).length > 0) {
      await this.journalRepository.update(userId, entryId, updateData);
    }
    if (tagIds !== undefined) {
      await this.journalRepository.setTags(userId, entryId, tagIds);
    }

    return toEntry(await this.journalRepository.findById(userId, entryId));
  }

  /** One entry, or null. Does not throw on a miss. */
  async get(userId: UserId, entryId: string): Promise<JournalEntryWithRelations | null> {
    const entry = await this.journalRepository.findById(userId, entryId);
    return entry ? toEntry(entry) : null;
  }

  /** One entry by its `findById` result, throwing when it is absent. */
  async getOrThrow(userId: UserId, entryId: string): Promise<JournalEntryWithRelations> {
    const entry = await this.get(userId, entryId);
    if (!entry) throw new NotFoundError('Journal entry');
    return entry;
  }

  /**
   * The entry for a date, including one in the trash.
   *
   * Used by the create flow, which has to distinguish "no entry for this day"
   * from "the entry for this day is in the trash and must be restored first".
   */
  async getByDateIncludingDeleted(
    userId: UserId,
    date: string
  ): Promise<JournalEntryWithRelations | null> {
    if (!isValidDateKey(date)) {
      throw new ValidationError(`Invalid journal date: ${date}`);
    }
    const entry = await this.journalRepository.findByDateIncludingDeleted(userId, date);
    return entry ? toEntry(entry) : null;
  }

  /**
   * A page of entries plus a total that counts the whole matching set.
   *
   * The total is a separate query rather than `entries.length`, which every
   * route used to report. That made the paginator believe the last page was
   * always the only page, so page 2 was unreachable no matter how many entries
   * existed.
   */
  async list(userId: UserId, filters: JournalListFilters = {}): Promise<JournalPageResult> {
    const query = this.toRepositoryQuery(filters);

    const [entries, total] = await Promise.all([
      this.journalRepository.findAll(userId, query),
      this.journalRepository.countAll(userId, query),
    ]);

    const limit = query.limit ?? 0;
    const offset = query.offset ?? 0;

    return {
      entries: entries as JournalEntryWithRelations[],
      total,
      limit,
      offset,
      // `limit > 0` guards the unbounded case: without it every request claims
      // to have more.
      hasMore: limit > 0 ? offset + entries.length < total : false,
    };
  }

  /**
   * Everything matching a filter set, for export.
   *
   * Bounded by the repository. A user with a decade of daily entries would
   * otherwise produce a Markdown document too large to serialise in one
   * request; the response says so rather than truncating silently.
   */
  async exportEntries(
    userId: UserId,
    format: JournalExportFormat,
    filters: JournalListFilters = {}
  ): Promise<JournalExportResult> {
    // No `limit` here on purpose: `findAllForExport` applies the ceiling and
    // reports what it actually read, so the file and the count cannot disagree.
    const query = this.toRepositoryQuery({ ...filters, limit: undefined, offset: undefined });
    const entries = (await this.journalRepository.findAllForExport(
      userId,
      query
    )) as JournalEntryWithRelations[];

    // Named for the range the user asked for, not for today, so a filtered
    // export is recognisable in a downloads folder.
    const stamp = filters.month ?? filters.startDate ?? filters.endDate ?? todayStamp();

    return {
      filename: journalExportFilename(format, stamp),
      contentType:
        format === 'markdown' ? 'text/markdown; charset=utf-8' : 'application/json; charset=utf-8',
      body: exportJournalEntries(entries, format),
      count: entries.length,
      truncated: entries.length >= EXPORT_MAX_ENTRIES,
    };
  }

  /**
   * Ranked search over the user's entries.
   *
   * The repository returns a wider candidate set than requested because
   * ranking reorders it; taking exactly `limit` candidates would make the limit
   * a cap on what is *considered*, not on what is returned.
   */
  async search(userId: UserId, term: string, limit: number = 20): Promise<JournalSearchResult[]> {
    const normalized = normalizeSearchTerm(term);
    if (normalized.length === 0) return [];

    const candidates = (await this.journalRepository.search(
      userId,
      normalized,
      limit * SEARCH_CANDIDATE_MULTIPLIER
    )) as JournalEntryWithRelations[];

    return rankResults(normalized, candidates).slice(0, limit);
  }

  /** Soft delete. The row and its revisions are kept so it can be restored. */
  async softDelete(userId: UserId, entryId: string): Promise<JournalEntryWithRelations> {
    await this.requireEntry(userId, entryId);
    await this.journalRepository.softDelete(userId, entryId);
    return toEntry(await this.journalRepository.findById(userId, entryId, true));
  }

  /** Restore a soft-deleted entry. */
  async restore(userId: UserId, entryId: string): Promise<JournalEntryWithRelations> {
    await this.requireEntry(userId, entryId);
    await this.journalRepository.restore(userId, entryId);
    return toEntry(await this.journalRepository.findById(userId, entryId));
  }

  /** Permanently delete an entry and, by cascade, its revisions. */
  async permanentlyDelete(userId: UserId, entryId: string): Promise<void> {
    await this.requireEntry(userId, entryId);
    await this.journalRepository.permanentDelete(userId, entryId);
  }

  /** The trash, newest deletion first. */
  async listDeleted(
    userId: UserId,
    options: { limit?: number; offset?: number } = {}
  ): Promise<{ entries: JournalEntryWithRelations[]; total: number }> {
    const [entries, total] = await Promise.all([
      this.journalRepository.findDeleted(userId, options),
      this.journalRepository.countDeleted(userId),
    ]);
    return { entries: entries as JournalEntryWithRelations[], total };
  }

  async countDeleted(userId: UserId): Promise<number> {
    return this.journalRepository.countDeleted(userId);
  }

  /** Revision history, newest first. */
  async listRevisions(userId: UserId, entryId: string): Promise<JournalRevision[]> {
    await this.requireEntry(userId, entryId);
    return this.journalRepository.listRevisions(userId, entryId);
  }

  /** Restore a revision's title and content onto its entry. */
  async restoreRevision(
    userId: UserId,
    entryId: string,
    revisionId: string
  ): Promise<JournalEntryWithRelations> {
    await this.requireEntry(userId, entryId);
    await this.journalRepository.restoreRevision(userId, entryId, revisionId);
    return toEntry(await this.journalRepository.findById(userId, entryId));
  }

  /** Toggle the favorite flag. Returns the value now stored. */
  async setFavorite(userId: UserId, entryId: string, isFavorite: boolean): Promise<boolean> {
    await this.requireEntry(userId, entryId);
    await this.journalRepository.update(userId, entryId, { isFavorite });
    return isFavorite;
  }

  /** Set the archived flag. Returns the value now stored. */
  async setArchived(userId: UserId, entryId: string, isArchived: boolean): Promise<boolean> {
    await this.requireEntry(userId, entryId);
    await this.journalRepository.update(userId, entryId, { isArchived });
    return isArchived;
  }

  /** Replace the tag set, rejecting any tag the caller does not own. */
  async setTags(userId: UserId, entryId: string, tagIds: string[]): Promise<number> {
    await this.requireEntry(userId, entryId);
    await this.assertTagsOwned(userId, tagIds);
    return this.journalRepository.setTags(userId, entryId, tagIds);
  }

  /**
   * Mood/energy for one month, for the calendar.
   *
   * Sourced from the month range rather than from whatever list page happens to
   * be loaded, so a day in the middle of a long month still has a colour.
   */
  async getMonthData(
    userId: UserId,
    startDate: string,
    endDate: string
  ): Promise<{ startDate: string; endDate: string; cells: Array<{ date: string; mood: number | null; entryId: string; isFavorite: boolean }> }> {
    if (!isValidDateKey(startDate) || !isValidDateKey(endDate)) {
      throw new ValidationError('Invalid journal month range');
    }
    const cells = await this.journalRepository.findMonthCells(userId, startDate, endDate);
    return { startDate, endDate, cells };
  }

  /**
   * Reject a tag batch containing ids the user does not own.
   *
   * `JournalEntryTag` carries no `userId`, so the database cannot enforce this —
   * a caller who guessed another user's `Tag.id` could attach it to their own
   * entry and read that user's tag name back through their own journal. The
   * ids are reported back so the caller can say which ones failed.
   */
  private async assertTagsOwned(userId: UserId, tagIds: string[]): Promise<void> {
    const unique = [...new Set(tagIds)];
    if (unique.length === 0) return;

    const owned = await this.journalRepository.findOwnedTagIds(userId, unique);
    if (owned.length === unique.length) return;

    const ownedSet = new Set(owned);
    const foreign = unique.filter((tagId) => !ownedSet.has(tagId));
    throw new ForeignTagError(foreign);
  }

  private async requireEntry(userId: UserId, entryId: string): Promise<void> {
    const entry = await this.journalRepository.findById(userId, entryId, true);
    if (!entry) throw new NotFoundError('Journal entry');
  }

  /**
   * Map browse filters onto a repository query.
   *
   * The date-shaped filters are collapsed into one inclusive range here so that
   * the list, the count, the export and the by-date page cannot narrow
   * differently. Precedence, narrowest first:
   *
   *   1. an explicit `startDate`/`endDate` — the caller already knows the range;
   *   2. a single `date` — one day;
   *   3. a `month` — the whole month.
   *
   * A wider request must never silently win over a narrower one, so the order is
   * fixed rather than "whichever key happens to be set".
   */
  private toRepositoryQuery(filters: JournalListFilters): JournalQueryParams {
    const day = filters.date;
    const month = filters.month ? monthRange(filters.month) : null;

    const from = filters.startDate ?? day ?? month?.startDate;
    const to = filters.endDate ?? day ?? month?.endDate;

    return {
      from,
      to,
      search: filters.search?.trim() || undefined,
      mood: filters.mood,
      tagIds: filters.tagId ? [filters.tagId] : undefined,
      isFavorite: filters.isFavorite,
      isArchived: filters.isArchived,
      sortBy: filters.sortBy,
      sortOrder: filters.sortOrder,
      limit: filters.limit,
      offset: filters.offset,
    };
  }
}

export const journalService = new JournalService();
