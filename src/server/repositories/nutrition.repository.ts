import type { NutritionEntry, Prisma } from '@prisma/client';
import { BaseRepository } from './base.repository';

/**
 * Nutrition Repository
 * Database operations for the NutritionEntry model
 */

export interface CreateNutritionItemData {
  foodName: string;
  quantity: number;
  unit: string;
  calories?: number;
  protein?: number;
  carbs?: number;
  fat?: number;
  fiber?: number;
  sugar?: number;
  sodium?: number;
}

export interface NutritionQueryParams {
  startDate?: string;
  endDate?: string;
  mealType?: string;
  limit?: number;
  offset?: number;
}

function itemToCreateData(
  userId: string,
  date: string,
  mealType: string,
  item: CreateNutritionItemData
): Prisma.NutritionEntryCreateInput {
  return {
    user: { connect: { id: userId } },
    date,
    mealType,
    foodName: item.foodName,
    quantity: item.quantity,
    unit: item.unit,
    calories: item.calories,
    protein: item.protein,
    carbs: item.carbs,
    fat: item.fat,
    fiber: item.fiber,
    sugar: item.sugar,
    sodium: item.sodium,
  };
}

export class NutritionRepository extends BaseRepository {
  /**
   * Create a single nutrition entry
   */
  async create(userId: string, date: string, mealType: string, item: CreateNutritionItemData): Promise<NutritionEntry> {
    try {
      return await this.prisma.nutritionEntry.create({
        data: itemToCreateData(userId, date, mealType, item),
      });
    } catch (error) {
      this.handleError(error, 'create');
    }
  }

  /**
   * Create multiple nutrition entries for a meal in a single transaction
   */
  async createMany(
    userId: string,
    date: string,
    mealType: string,
    items: CreateNutritionItemData[]
  ): Promise<NutritionEntry[]> {
    try {
      return await this.transaction(async (tx) => {
        const entries: NutritionEntry[] = [];
        for (const item of items) {
          const entry = await tx.nutritionEntry.create({
            data: itemToCreateData(userId, date, mealType, item),
          });
          entries.push(entry);
        }
        return entries;
      });
    } catch (error) {
      this.handleError(error, 'createMany');
    }
  }

  /**
   * Find nutrition entries for a user with optional filters
   */
  async findAll(userId: string, query: NutritionQueryParams = {}): Promise<NutritionEntry[]> {
    try {
      const where: Prisma.NutritionEntryWhereInput = { userId };

      if (query.startDate || query.endDate) {
        where.date = {};
        if (query.startDate) where.date.gte = query.startDate;
        if (query.endDate) where.date.lte = query.endDate;
      }

      if (query.mealType) where.mealType = query.mealType;

      return await this.prisma.nutritionEntry.findMany({
        where,
        orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
        ...this.buildPaginationQuery(query.limit, query.offset),
      });
    } catch (error) {
      this.handleError(error, 'findAll');
    }
  }

  /**
   * Find a single nutrition entry owned by the user
   */
  async findById(userId: string, entryId: string): Promise<NutritionEntry | null> {
    try {
      return await this.prisma.nutritionEntry.findFirst({
        where: { id: entryId, userId },
      });
    } catch (error) {
      this.handleError(error, 'findById');
    }
  }

  /**
   * Update a nutrition entry owned by the user
   */
  async update(
    userId: string,
    entryId: string,
    data: Partial<CreateNutritionItemData> & { date?: string; mealType?: string }
  ): Promise<NutritionEntry> {
    try {
      return await this.prisma.nutritionEntry.update({
        where: { id: entryId, userId },
        data: {
          date: data.date,
          mealType: data.mealType,
          foodName: data.foodName,
          quantity: data.quantity,
          unit: data.unit,
          calories: data.calories,
          protein: data.protein,
          carbs: data.carbs,
          fat: data.fat,
          fiber: data.fiber,
          sugar: data.sugar,
          sodium: data.sodium,
        },
      });
    } catch (error) {
      this.handleError(error, 'update');
    }
  }

  /**
   * Delete a nutrition entry owned by the user
   */
  async delete(userId: string, entryId: string): Promise<NutritionEntry> {
    try {
      return await this.prisma.nutritionEntry.delete({
        where: { id: entryId, userId },
      });
    } catch (error) {
      this.handleError(error, 'delete');
    }
  }
}