import { NutritionRepository } from '@/server/repositories/nutrition.repository';
import { NotFoundError } from '@/lib/errors/app-error';
import type {
  CreateNutritionInput,
  UpdateNutritionInput,
} from '@/schemas/nutrition.schema';
import type { NutritionEntry } from '@/generated/prisma';
import type { UserId } from '@/types/ids';

/** Summed macros for a page of entries. All four are non-nullable in practice. */
export interface NutritionTotals {
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
}

/**
 * Nutrition Service
 *
 * Owns the nutrition list/create/update/delete orchestration that was inline in
 * the two `/api/nutrition` routes (ERROR.md §1).
 *
 * The part worth moving is the macro rollup. `GET /api/nutrition` reduced the
 * returned page to `totals`, and because that code *was* the route handler there
 * was nowhere else to put it — so any second consumer of nutrition data (a
 * dashboard tile, a daily report) would have had to reimplement the same four
 * `?? 0` accumulations, and `null` vs `0` handling is exactly the kind of thing
 * two copies disagree on.
 */
export class NutritionService {
  private readonly nutritionRepository: NutritionRepository;

  constructor(nutritionRepository: NutritionRepository = new NutritionRepository()) {
    this.nutritionRepository = nutritionRepository;
  }

  /**
   * List entries with their summed macros.
   *
   * NOTE `meta.total` stays the length of the returned page, as it has always
   * been — the repository has no count method and inventing one here would change
   * the pagination contract the client already codes against. It is named
   * `total` in the response but means "entries in this page"; if a real total is
   * ever needed, add a `countAll` to the repository and change both at once.
   */
  async listForUser(userId: UserId, query: Parameters<NutritionRepository['findAll']>[1]) {
    const entries = await this.nutritionRepository.findAll(userId, query);

    const totals = entries.reduce<NutritionTotals>(
      (acc, entry) => {
        acc.calories += entry.calories ?? 0;
        acc.protein += entry.protein ?? 0;
        acc.carbs += entry.carbs ?? 0;
        acc.fat += entry.fat ?? 0;
        return acc;
      },
      { calories: 0, protein: 0, carbs: 0, fat: 0 }
    );

    return { entries, totals };
  }

  /** Create every item of a meal. */
  async createMany(userId: UserId, input: CreateNutritionInput) {
    return this.nutritionRepository.createMany(
      userId,
      input.date,
      input.mealType,
      input.items
    );
  }

  /** One entry, or `NotFoundError`. */
  async getForUser(userId: UserId, entryId: string): Promise<NutritionEntry> {
    const entry = await this.nutritionRepository.findById(userId, entryId);
    if (!entry) {
      throw new NotFoundError('Nutrition entry');
    }
    return entry;
  }

  /**
   * Update an entry.
   *
   * An empty patch returns the existing row untouched rather than issuing a
   * no-op UPDATE. That behaviour is preserved deliberately: a client that PATCHes
   * `{}` on a save button is not making a mistake worth a write.
   */
  async update(
    userId: UserId,
    entryId: string,
    input: UpdateNutritionInput
  ): Promise<NutritionEntry> {
    const existing = await this.getForUser(userId, entryId);

    if (Object.keys(input).length === 0) {
      return existing;
    }

    return this.nutritionRepository.update(userId, entryId, input);
  }

  /** Delete an entry. */
  async delete(userId: UserId, entryId: string): Promise<void> {
    await this.getForUser(userId, entryId);
    await this.nutritionRepository.delete(userId, entryId);
  }
}

export const nutritionService = new NutritionService();
