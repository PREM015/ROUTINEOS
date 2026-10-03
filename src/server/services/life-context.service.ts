import { ReflectionRepository } from '@/server/repositories/reflection.repository';
import {
  buildLifeContextSnapshot,
  getContextLabel,
  type LifeContext,
  type LifeContextSnapshot,
} from '@/lib/context';
import type { z } from 'zod';
import type { reflectionSchema } from '@/schemas/reflection.schema';
import type { UserId } from '@/types/ids';

type ReflectionInput = z.infer<typeof reflectionSchema>;

/**
 * Life Context Service
 *
 * Database-backed entry point for the (pure) life-context logic in
 * `lib/context`. The reflection lookup lives here so that `lib/` stays free of
 * database access, per the project's file-writing standard.
 *
 * It also owns daily-reflection persistence, including the serialisation the
 * `DailyReflection` JSON text columns require.
 */
export class LifeContextService {
  private reflectionRepository: ReflectionRepository;

  constructor() {
    this.reflectionRepository = new ReflectionRepository();
  }

  /**
   * Read and normalize the day context for a user and date (YYYY-MM-DD).
   *
   * Transient database errors degrade to an empty (but valid) snapshot rather
   * than throwing, matching the previous behaviour of this endpoint.
   */
  async getLifeContext(
    userId: UserId,
    date: string
  ): Promise<LifeContextSnapshot> {
    let reflection = null;
    try {
      reflection = await this.reflectionRepository.findByDate(userId, date);
    } catch {
      reflection = null;
    }
    return buildLifeContextSnapshot(date, reflection);
  }

  /**
   * Human-readable label for a life context.
   */
  getLabel(context: LifeContext): string {
    return getContextLabel(context);
  }

  /**
   * The stored reflection for a date, or null.
   */
  async getReflection(userId: UserId, date: string) {
    return this.reflectionRepository.findByDate(userId, date);
  }

  /**
   * Create or update a daily reflection.
   *
   * `gratitude` and `tomorrowPriorities` arrive as arrays but are stored in
   * String columns, so they are serialised here — never written as raw arrays.
   */
  async saveReflection(userId: UserId, input: ReflectionInput) {
    const { date, gratitude, tomorrowPriorities, ...rest } = input;

    return this.reflectionRepository.upsertReflection(userId, date, {
      ...rest,
      gratitude: Array.isArray(gratitude)
        ? JSON.stringify(gratitude)
        : (gratitude ?? undefined),
      tomorrowPriorities: Array.isArray(tomorrowPriorities)
        ? JSON.stringify(tomorrowPriorities)
        : undefined,
    });
  }
}

export const lifeContextService = new LifeContextService();
