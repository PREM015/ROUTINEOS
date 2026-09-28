import { z } from 'zod';
import { createTagSchema } from '@/schemas/tag.schema';
import { NotFoundError } from '@/lib/errors/app-error';
import { TagRepository } from '@/server/repositories/tag.repository';
import type { Tag } from '@/generated/prisma';

/**
 * Tag Service
 * Business logic for user-owned tags.
 *
 * The routes previously called `TagRepository` directly, which left validation
 * and the "does this tag belong to you" decision in the HTTP layer. Both now
 * live here; the repository is only the data access.
 */

// Reuse the shared schema so the route and the service cannot disagree about
// what a valid tag is.
const updateTagSchema = createTagSchema.partial();

export type CreateTagInput = z.infer<typeof createTagSchema>;
export type UpdateTagInput = z.infer<typeof updateTagSchema>;

export class TagService {
  private tagRepository: TagRepository;

  constructor() {
    this.tagRepository = new TagRepository();
  }

  async list(userId: string): Promise<Tag[]> {
    return this.tagRepository.listForUser(userId);
  }

  async create(userId: string, input: unknown): Promise<Tag> {
    const parsed = createTagSchema.safeParse(input);
    if (!parsed.success) {
      throw new RangeError(parsed.error.errors[0]?.message ?? 'Invalid tag data');
    }
    return this.tagRepository.create(userId, parsed.data);
  }

  /** Ownership-checked read. Returns null rather than throwing on a miss. */
  async get(userId: string, tagId: string): Promise<Tag | null> {
    return this.tagRepository.findById(userId, tagId);
  }

  async update(userId: string, tagId: string, input: unknown): Promise<Tag> {
    const parsed = updateTagSchema.safeParse(input);
    if (!parsed.success) {
      throw new RangeError(parsed.error.errors[0]?.message ?? 'Invalid tag data');
    }
    if (!(await this.tagRepository.findById(userId, tagId))) {
      throw new NotFoundError('Tag not found');
    }
    return this.tagRepository.update(userId, tagId, parsed.data);
  }

  async delete(userId: string, tagId: string): Promise<void> {
    if (!(await this.tagRepository.findById(userId, tagId))) {
      throw new NotFoundError('Tag not found');
    }
    await this.tagRepository.delete(userId, tagId);
  }

  /** Idempotent helper used by importers and bulk tooling. */
  getOrCreate(userId: string, name: string): Promise<Tag> {
    return this.tagRepository.getOrCreate(userId, name);
  }
}

export const tagService = new TagService();
