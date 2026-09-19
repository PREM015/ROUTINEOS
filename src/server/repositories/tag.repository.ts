import type { Tag } from '@prisma/client';
import { BaseRepository } from './base.repository';
import {
  colorForTagName,
  isValidTagColor,
  isValidTagName,
  normalizeTagName,
} from '@/lib/tags/helpers';
import { ConflictError, NotFoundError } from '@/lib/errors/app-error';

/**
 * Tag Repository
 * Database operations for Tag model, always scoped by userId
 */

export interface TagCreateInput {
  name: string;
  color?: string;
  icon?: string;
}

export interface TagUpdateInput {
  name?: string;
  color?: string;
  icon?: string;
}

export class TagRepository extends BaseRepository {
  /**
   * List all tags for a user, oldest first
   */
  async listForUser(userId: string): Promise<Tag[]> {
    try {
      return await this.prisma.tag.findMany({
        where: { userId },
        orderBy: { createdAt: 'asc' },
      });
    } catch (error) {
      this.handleError(error, 'listForUser');
    }
  }

  /**
   * Find a tag owned by the user, or `null` when it does not exist
   */
  async findById(userId: string, tagId: string): Promise<Tag | null> {
    try {
      return await this.prisma.tag.findFirst({
        where: { id: tagId, userId },
      });
    } catch (error) {
      this.handleError(error, 'findById');
    }
  }

  /**
   * Create a tag for the user. Rejects duplicate names with `ConflictError`
   * and rejects invalid names/colors with a `RangeError`.
   */
  async create(userId: string, input: TagCreateInput): Promise<Tag> {
    try {
      const name = normalizeTagName(input.name);
      if (!isValidTagName(name)) {
        throw new RangeError('Tag name must be 1-50 characters after trimming');
      }
      if (input.color !== undefined && input.color !== null && !isValidTagColor(input.color)) {
        throw new RangeError('Tag color must be a hex color like #FF00AA');
      }

      const existing = await this.prisma.tag.findFirst({
        where: { userId, name },
      });
      if (existing) {
        throw new ConflictError(`A tag named "${name}" already exists`);
      }

      const color =
        input.color && isValidTagColor(input.color)
          ? input.color
          : colorForTagName(name);

      return await this.prisma.tag.create({
        data: { userId, name, color, icon: input.icon ?? null },
      });
    } catch (error) {
      this.handleError(error, 'create');
    }
  }

  /**
   * Update a tag owned by the user, guarding the per-user name uniqueness.
   */
  async update(userId: string, tagId: string, input: TagUpdateInput): Promise<Tag> {
    try {
      const tag = await this.findById(userId, tagId);
      if (!tag) {
        throw new NotFoundError('Tag');
      }

      const name = input.name !== undefined ? normalizeTagName(input.name) : tag.name;
      if (input.name !== undefined && !isValidTagName(name)) {
        throw new RangeError('Tag name must be 1-50 characters after trimming');
      }
      if (input.color !== undefined && input.color !== null && !isValidTagColor(input.color)) {
        throw new RangeError('Tag color must be a hex color like #FF00AA');
      }

      const duplicate = await this.prisma.tag.findFirst({
        where: { userId, name, NOT: { id: tagId } },
      });
      if (duplicate) {
        throw new ConflictError(`A tag named "${name}" already exists`);
      }

      return await this.prisma.tag.update({
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
    } catch (error) {
      this.handleError(error, 'update');
    }
  }

  /**
   * Delete a tag owned by the user (join rows are removed by cascade)
   */
  async delete(userId: string, tagId: string): Promise<void> {
    try {
      const tag = await this.findById(userId, tagId);
      if (!tag) {
        throw new NotFoundError('Tag');
      }
      await this.prisma.tag.delete({ where: { id: tagId } });
    } catch (error) {
      this.handleError(error, 'delete');
    }
  }

  /**
   * Find a tag by normalized name, creating it (with a palette color) when it
   * does not yet exist for the user.
   */
  async getOrCreate(userId: string, name: string): Promise<Tag> {
    try {
      const normalized = normalizeTagName(name);
      if (!isValidTagName(normalized)) {
        throw new RangeError('Tag name must be 1-50 characters after trimming');
      }

      const existing = await this.prisma.tag.findFirst({
        where: { userId, name: normalized },
      });
      if (existing) return existing;

      return await this.prisma.tag.create({
        data: {
          userId,
          name: normalized,
          color: colorForTagName(normalized),
        },
      });
    } catch (error) {
      this.handleError(error, 'getOrCreate');
    }
  }
}