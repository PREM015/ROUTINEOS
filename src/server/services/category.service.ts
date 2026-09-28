import { z } from 'zod';
import { CategoryRepository } from '@/server/repositories/category.repository';
import { ConflictError, NotFoundError } from '@/lib/errors/app-error';
import type { Category, Prisma } from '@/generated/prisma';

/**
 * Category Service
 * Business logic for habit/task categories.
 *
 * `create` takes a plain field object and builds the Prisma input here, so the
 * route no longer has to know that `Category` connects to a user by id.
 */

/**
 * Category names are compared case- and whitespace-insensitively via
 * `nameNormalized`, which is what `findByName` and the per-user unique
 * constraint rely on.
 */
function normalizeCategoryName(name: string): string {
  return name.toLowerCase().replace(/\s+/g, '-');
}

const createCategorySchema = z.object({
  name: z.string().min(1, 'Name is required').max(50),
  description: z.string().optional(),
  // A hex colour is what the UI renders; anything else produces broken styles,
  // so it is rejected here rather than stored and discovered later.
  color: z
    .string()
    .regex(/^#[0-9A-F]{6}$/i, 'Color must be a 6-digit hex value')
    .optional(),
  icon: z.string().optional(),
  sortOrder: z.number().int().optional(),
});

const updateCategorySchema = createCategorySchema.partial();

export type CreateCategoryInput = z.infer<typeof createCategorySchema>;
export type UpdateCategoryInput = z.infer<typeof updateCategorySchema>;

export class CategoryService {
  private categoryRepository: CategoryRepository;

  constructor() {
    this.categoryRepository = new CategoryRepository();
  }

  async list(userId: string, includeArchived = false): Promise<Category[]> {
    return this.categoryRepository.findAll(userId, includeArchived);
  }

  async get(userId: string, categoryId: string): Promise<Category | null> {
    return this.categoryRepository.findById(categoryId, userId);
  }

  async create(userId: string, input: unknown): Promise<Category> {
    const parsed = createCategorySchema.safeParse(input);
    if (!parsed.success) {
      throw new RangeError(parsed.error.errors[0]?.message ?? 'Invalid category data');
    }

    // Names are unique per user; reuse rather than fail the request.
    const existing = await this.categoryRepository.findByName(userId, parsed.data.name);
    if (existing) {
      throw new ConflictError('A category with that name already exists');
    }

    const data: Prisma.CategoryCreateInput = {
      user: { connect: { id: userId } },
      name: parsed.data.name,
      // The route used to hand-compute this; it is a domain rule, so it lives
      // here now. `findByName` depends on the same normalisation.
      nameNormalized: normalizeCategoryName(parsed.data.name),
      color: parsed.data.color,
      icon: parsed.data.icon,
      description: parsed.data.description,
      sortOrder: parsed.data.sortOrder,
    };
    return this.categoryRepository.create(data);
  }

  async update(userId: string, categoryId: string, input: unknown): Promise<Category> {
    const parsed = updateCategorySchema.safeParse(input);
    if (!parsed.success) {
      throw new RangeError(parsed.error.errors[0]?.message ?? 'Invalid category data');
    }
    const existing = await this.categoryRepository.findById(categoryId, userId);
    if (!existing) {
      throw new NotFoundError('Category not found');
    }

    if (parsed.data.name && parsed.data.name !== existing.name) {
      const clash = await this.categoryRepository.findByName(userId, parsed.data.name);
      if (clash) {
        throw new ConflictError('A category with that name already exists');
      }
    }

    const data: Prisma.CategoryUpdateInput = {
      name: parsed.data.name,
      ...(parsed.data.name ? { nameNormalized: normalizeCategoryName(parsed.data.name) } : {}),
      color: parsed.data.color,
      icon: parsed.data.icon,
      description: parsed.data.description,
      sortOrder: parsed.data.sortOrder,
    };
    return this.categoryRepository.update(categoryId, userId, data);
  }

  async delete(userId: string, categoryId: string): Promise<void> {
    const existing = await this.categoryRepository.findById(categoryId, userId);
    if (!existing) {
      throw new NotFoundError('Category not found');
    }
    await this.categoryRepository.delete(categoryId, userId);
  }

  async archive(userId: string, categoryId: string): Promise<Category> {
    const existing = await this.categoryRepository.findById(categoryId, userId);
    if (!existing) {
      throw new NotFoundError('Category not found');
    }
    return this.categoryRepository.archive(categoryId, userId);
  }

  async reorder(userId: string, ordering: Array<{ id: string; sortOrder: number }>): Promise<void> {
    return this.categoryRepository.reorder(userId, ordering);
  }
}

export const categoryService = new CategoryService();
