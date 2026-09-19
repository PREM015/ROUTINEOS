import type { Prisma } from '@prisma/client';
import { JournalRepository } from '@/server/repositories/journal.repository';
import {
  createJournalEntrySchema,
  updateJournalEntrySchema,
  type CreateJournalEntryInput,
  type UpdateJournalEntryInput,
} from '@/schemas/journal.schema';
import type { JournalEntryWithRelations } from '@/types/journal';

/**
 * Journal CRUD operations.
 * Validates input with Zod and delegates persistence to the repository.
 */

const journalRepository = new JournalRepository();

export interface JournalListFilters {
  search?: string;
  mood?: number;
  isFavorite?: boolean;
  isArchived?: boolean;
  startDate?: string;
  endDate?: string;
  tagId?: string;
  limit?: number;
  offset?: number;
}

/**
 * Create a journal entry. `gratitude` items are stored as a JSON string.
 */
export async function createJournalEntry(
  userId: string,
  input: CreateJournalEntryInput
): Promise<JournalEntryWithRelations> {
  const data = createJournalEntrySchema.parse(input);
  const created = await journalRepository.create(userId, {
    date: data.date,
    title: data.title,
    content: data.content,
    mood: data.mood,
    energy: data.energy,
    gratitude: data.gratitude ? JSON.stringify(data.gratitude) : undefined,
    isFavorite: data.isFavorite,
    tagIds: data.tagIds,
  });
  return (await journalRepository.findById(userId, created.id)) as JournalEntryWithRelations;
}

export interface UpdateJournalEntryResult {
  entry: JournalEntryWithRelations;
}

/**
 * Update a journal entry. Tag changes are applied as a full replacement via the
 * join table.
 */
export async function updateJournalEntry(
  userId: string,
  entryId: string,
  input: UpdateJournalEntryInput
): Promise<UpdateJournalEntryResult> {
  const data = updateJournalEntrySchema.parse(input);
  const { tagIds, ...fields } = data;

  const updateData: Prisma.JournalEntryUpdateInput = {
    title: fields.title ?? undefined,
    content: fields.content ?? undefined,
    mood: fields.mood ?? undefined,
    energy: fields.energy ?? undefined,
    isFavorite: fields.isFavorite ?? undefined,
    isArchived: fields.isArchived ?? undefined,
  };
  if (fields.gratitude !== undefined) {
    updateData.gratitude = JSON.stringify(fields.gratitude);
  }

  await journalRepository.update(userId, entryId, updateData);
  if (tagIds !== undefined) {
    await journalRepository.setTags(userId, entryId, tagIds);
  }

  return {
    entry: (await journalRepository.findById(userId, entryId)) as JournalEntryWithRelations,
  };
}

/**
 * Fetch a single entry owned by the user, or `null` when not found.
 */
export async function getJournalEntry(
  userId: string,
  entryId: string
): Promise<JournalEntryWithRelations | null> {
  return (await journalRepository.findById(userId, entryId)) as JournalEntryWithRelations | null;
}

/**
 * Fetch the entry for a specific date (at most one per user/date).
 */
export async function getJournalEntryByDate(
  userId: string,
  date: string
): Promise<JournalEntryWithRelations | null> {
  const entry = await journalRepository.findByDate(userId, date);
  if (!entry) return null;
  return (await journalRepository.findById(userId, entry.id)) as JournalEntryWithRelations;
}

/**
 * Delete an entry owned by the user.
 */
export async function deleteJournalEntry(
  userId: string,
  entryId: string
): Promise<void> {
  await journalRepository.delete(userId, entryId);
}

/**
 * List entries with supported filters. Favorite/archived filtering happens in
 * memory after the repository query.
 */
export async function listJournalEntries(
  userId: string,
  filters: JournalListFilters = {}
): Promise<JournalEntryWithRelations[]> {
  const entries = (await journalRepository.findAll(userId, {
    from: filters.startDate,
    to: filters.endDate,
    search: filters.search,
    mood: filters.mood,
    tagIds: filters.tagId ? [filters.tagId] : undefined,
    limit: filters.limit,
    offset: filters.offset,
  })) as JournalEntryWithRelations[];

  return entries.filter(
    entry =>
      (filters.isFavorite === undefined || entry.isFavorite === filters.isFavorite) &&
      (filters.isArchived === undefined || entry.isArchived === filters.isArchived)
  );
}

/**
 * Toggle the favorite flag on an entry.
 */
export async function toggleJournalFavorite(
  userId: string,
  entryId: string,
  isFavorite: boolean
): Promise<boolean> {
  await journalRepository.update(userId, entryId, { isFavorite });
  return isFavorite;
}

/**
 * Set the archived flag on an entry.
 */
export async function setJournalArchived(
  userId: string,
  entryId: string,
  isArchived: boolean
): Promise<boolean> {
  await journalRepository.update(userId, entryId, { isArchived });
  return isArchived;
}

/**
 * Replace the tags on an entry.
 */
export async function setJournalTags(
  userId: string,
  entryId: string,
  tagIds: string[]
): Promise<number> {
  return journalRepository.setTags(userId, entryId, tagIds);
}