import type { Category, Prisma } from '@/generated/prisma';
import { BaseRepository } from './base.repository';
import type { UserId } from '@/types/ids';
import { DEFAULT_CATEGORIES, normalizeCategoryName } from '@/constants/categories';

/**
 * Category Repository
 * Database operations for categories
 */

export class CategoryRepository extends BaseRepository {
  /**
   * Find category by ID
   */
  async findById(categoryId: string, userId: UserId): Promise<Category | null> {
    try {
      return await this.prisma.category.findFirst({
        where: { id: categoryId, userId },
      });
    } catch (error) {
      this.handleError(error, 'findById');
    }
  }

  /**
   * Find all categories for user
   */
  async findAll(userId: UserId, includeArchived = false): Promise<Category[]> {
    try {
      return await this.prisma.category.findMany({
        where: {
          userId,
          ...(includeArchived ? {} : { isArchived: false }),
        },
        orderBy: { sortOrder: 'asc' },
      });
    } catch (error) {
      this.handleError(error, 'findAll');
    }
  }

  /**
   * Find by name
   */
  async findByName(userId: UserId, name: string): Promise<Category | null> {
    try {
      return await this.prisma.category.findFirst({
        where: {
          userId,
          nameNormalized: normalizeCategoryName(name),
        },
      });
    } catch (error) {
      this.handleError(error, 'findByName');
    }
  }

  /**
   * Seed the platform default categories the first time a user's categories are
   * listed.
   *
   * This is what makes the defaults available to *every* account without
   * touching the registration flow (and it covers accounts created by any path,
   * including OAuth). The guard counts all rows, archived included, so a user
   * who archives the set keeps it archived instead of being re-seeded on their
   * next visit; only an account with no rows at all — a fresh one, or one whose
   * categories were all deleted — receives the defaults. `skipDuplicates` makes
   * concurrent first loads safe.
   */
  async seedDefaultsIfEmpty(userId: UserId, includeArchived = false): Promise<Category[]> {
    try {
      const count = await this.prisma.category.count({ where: { userId } });
      if (count === 0) {
        await this.prisma.category.createMany({
          data: DEFAULT_CATEGORIES.map((category) => ({
            userId,
            name: category.name,
            nameNormalized: normalizeCategoryName(category.name),
            description: category.description,
            color: category.color,
            icon: category.icon,
            sortOrder: category.sortOrder,
          })),
          skipDuplicates: true,
        });
      }
      return this.findAll(userId, includeArchived);
    } catch (error) {
      this.handleError(error, 'seedDefaultsIfEmpty');
    }
  }

  /**
   * Create category
   */
  async create(data: Prisma.CategoryCreateInput): Promise<Category> {
    try {
      return await this.prisma.category.create({ data });
    } catch (error) {
      this.handleError(error, 'create');
    }
  }

  /**
   * Update category
   */
  async update(
    categoryId: string,
    userId: UserId,
    data: Prisma.CategoryUpdateInput
  ): Promise<Category> {
    try {
      return await this.prisma.category.update({
        where: { id: categoryId, userId },
        data,
      });
    } catch (error) {
      this.handleError(error, 'update');
    }
  }

  /**
   * Delete category
   */
  async delete(categoryId: string, userId: UserId): Promise<void> {
    try {
      await this.prisma.category.delete({
        where: { id: categoryId, userId },
      });
    } catch (error) {
      this.handleError(error, 'delete');
    }
  }

  /**
   * Archive category
   */
  async archive(categoryId: string, userId: UserId): Promise<Category> {
    try {
      return await this.prisma.category.update({
        where: { id: categoryId, userId },
        data: { isArchived: true },
      });
    } catch (error) {
      this.handleError(error, 'archive');
    }
  }

  /**
   * Reorder categories
   */
  async reorder(
    userId: UserId,
    ordering: Array<{ id: string; sortOrder: number }>
  ): Promise<void> {
    try {
      await this.transaction(async (tx) => {
        for (const { id, sortOrder } of ordering) {
          await tx.category.update({
            where: { id, userId },
            data: { sortOrder },
          });
        }
      });
    } catch (error) {
      this.handleError(error, 'reorder');
    }
  }

  /**
   * Count categories
   */
  async count(userId: UserId): Promise<number> {
    try {
      return await this.prisma.category.count({
        where: { userId, isArchived: false },
      });
    } catch (error) {
      this.handleError(error, 'count');
    }
  }
}
