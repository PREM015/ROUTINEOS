import type { Tag } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { ConflictError, NotFoundError } from '@/lib/errors/app-error';
import {
  colorForTagName,
  isValidTagColor,
  isValidTagName,
  normalizeTagName,
} from './helpers';

/**
 * Tag management.
 * CRUD and assignment of user-scoped tags. Names are unique per user.
 */

export interface TagInput {
  name: string;
  color?: string;
  icon?: string;
}

/**
 * List all tags for a user in the order they were created.
 */
export async function listTags(userId: string): Promise<Tag[]> {
  return prisma.tag.findMany({
    where: { userId },
    orderBy: { createdAt: 'asc' },
  });
}

/**
 * Fetch a tag owned by the user, or `null` when it does not exist.
 */
export async function getTag(userId: string, tagId: string): Promise<Tag | null> {
  return prisma.tag.findFirst({ where: { id: tagId, userId } });
}

/**
 * Create a tag, throwing `ConflictError` when the user already has one with
 * the same name. The color defaults to a deterministic palette color.
 */
export async function createTag(userId: string, input: TagInput): Promise<Tag> {
  const name = normalizeTagName(input.name);
  if (!isValidTagName(name)) {
    throw new RangeError(`Tag name must be 1-${50} characters after trimming`);
  }
  const color =
    input.color && isValidTagColor(input.color) ? input.color : colorForTagName(name);

  const existing = await prisma.tag.findFirst({
    where: { userId, name },
  });
  if (existing) {
    throw new ConflictError(`A tag named "${name}" already exists`);
  }

  return prisma.tag.create({
    data: { userId, name, color, icon: input.icon ?? null },
  });
}

/**
 * Update a tag owned by the user, guarding the per-user name uniqueness.
 */
export async function updateTag(
  userId: string,
  tagId: string,
  input: Partial<TagInput>
): Promise<Tag> {
  const tag = await prisma.tag.findFirst({ where: { id: tagId, userId } });
  if (!tag) throw new NotFoundError('Tag');

  const name = input.name !== undefined ? normalizeTagName(input.name) : tag.name;
  if (input.name !== undefined && !isValidTagName(name)) {
    throw new RangeError(`Tag name must be 1-${50} characters after trimming`);
  }

  const duplicate = await prisma.tag.findFirst({
    where: { userId, name, NOT: { id: tagId } },
  });
  if (duplicate) {
    throw new ConflictError(`A tag named "${name}" already exists`);
  }

  return prisma.tag.update({
    where: { id: tagId },
    data: {
      name,
      color:
        input.color !== undefined
          ? isValidTagColor(input.color)
            ? input.color
            : tag.color
          : tag.color,
      icon: input.icon !== undefined ? input.icon : tag.icon,
    },
  });
}

/**
 * Delete a tag (join rows are removed by cascade).
 */
export async function deleteTag(userId: string, tagId: string): Promise<void> {
  const tag = await prisma.tag.findFirst({ where: { id: tagId, userId } });
  if (!tag) throw new NotFoundError('Tag');
  await prisma.tag.delete({ where: { id: tagId } });
}

/**
 * How many entities reference a tag (across all join models).
 */
export async function countTagUsage(userId: string, tagId: string): Promise<number> {
  const tag = await prisma.tag.findFirst({ where: { id: tagId, userId } });
  if (!tag) throw new NotFoundError('Tag');

  const [habits, goals, tasks, journal] = await Promise.all([
    prisma.habitTag.count({ where: { tagId } }),
    prisma.goalTag.count({ where: { tagId } }),
    prisma.taskTag.count({ where: { tagId } }),
    prisma.journalEntryTag.count({ where: { tagId } }),
  ]);
  return habits + goals + tasks + journal;
}

export type TagEntity = 'habit' | 'goal' | 'task' | 'journal';

/**
 * Replace the tags on an entity (e.g. a habit or journal entry). Only tags the
 * user owns are applied. Returns the number of tags attached.
 */
export async function setEntityTags(
  userId: string,
  entity: TagEntity,
  entityId: string,
  tagIds: readonly string[]
): Promise<number> {
  const owned = await prisma.tag.findMany({
    where: { id: { in: [...tagIds] }, userId },
    select: { id: true },
  });
  const validIds = owned.map(tag => tag.id);

  switch (entity) {
    case 'habit':
      await prisma.$transaction([
        prisma.habitTag.deleteMany({ where: { habitId: entityId } }),
        prisma.habitTag.createMany({
          data: validIds.map(tagId => ({ habitId: entityId, tagId })),
        }),
      ]);
      return validIds.length;
    case 'goal':
      await prisma.$transaction([
        prisma.goalTag.deleteMany({ where: { goalId: entityId } }),
        prisma.goalTag.createMany({
          data: validIds.map(tagId => ({ goalId: entityId, tagId })),
        }),
      ]);
      return validIds.length;
    case 'task':
      await prisma.$transaction([
        prisma.taskTag.deleteMany({ where: { taskId: entityId } }),
        prisma.taskTag.createMany({
          data: validIds.map(tagId => ({ taskId: entityId, tagId })),
        }),
      ]);
      return validIds.length;
    case 'journal':
      await prisma.$transaction([
        prisma.journalEntryTag.deleteMany({ where: { entryId: entityId } }),
        prisma.journalEntryTag.createMany({
          data: validIds.map(tagId => ({ entryId: entityId, tagId })),
        }),
      ]);
      return validIds.length;
  }
}

/**
 * Look up tag ids by name for a user, creating missing tags on the fly.
 * Returns the ids in the order the names were provided.
 */
export async function getOrCreateTagIds(
  userId: string,
  names: readonly string[]
): Promise<string[]> {
  const ids: string[] = [];
  for (const raw of names) {
    const name = normalizeTagName(raw);
    if (!isValidTagName(name)) continue;
    const existing = await prisma.tag.findFirst({ where: { userId, name } });
    if (existing) {
      ids.push(existing.id);
      continue;
    }
    const created = await createTag(userId, { name });
    ids.push(created.id);
  }
  return ids;
}