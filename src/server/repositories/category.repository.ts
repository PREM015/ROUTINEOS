import type { Category, Prisma } from '@prisma/client';
import { BaseRepository } from './base.repository';

/**
 * Category Repository
 * Database operations for categories
 */

export class CategoryRepository extends BaseRepository {
  /**
   * Find category by ID
   */
  async findById(categoryId: string, userId: string): Promise<Category | null> {
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
  async findAll(userId: string, includeArchived = false): Promise<Category[]> {
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
  async findByName(userId: string, name: string): Promise<Category | null> {
    try {
      return await this.prisma.category.findFirst({
        where: {
          userId,
          nameNormalized: name.toLowerCase().replace(/\s+/g, '-'),
        },
      });
    } catch (error) {
      this.handleError(error, 'findByName');
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
    userId: string,
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
  async delete(categoryId: string, userId: string): Promise<void> {
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
  async archive(categoryId: string, userId: string): Promise<Category> {
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
    userId: string,
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
  async count(userId: string): Promise<number> {
    try {
      return await this.prisma.category.count({
        where: { userId, isArchived: false },
      });
    } catch (error) {
      this.handleError(error, 'count');
    }
  }
}