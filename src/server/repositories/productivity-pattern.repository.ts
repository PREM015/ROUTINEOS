import type { ProductivityPattern } from '@/generated/prisma';
import { BaseRepository } from './base.repository';
import type { UserId } from '@/types/ids';

/**
 * ProductivityPattern Repository
 * Access to AI-discovered productivity patterns
 * (PEAK_HOURS / LOW_ENERGY / CONTEXT_SWITCH) for the focused-user surface.
 */
export class ProductivityPatternRepository extends BaseRepository {
  /**
   * Insert or refresh a discovered pattern.
   *
   * Upserts on the model's `@@unique([userId, patternType, timeOfDay])` so
   * re-running detection updates `confidence`/`lastSeenAt` instead of
   * accumulating duplicates for the same window.
   */
  async upsert(
    userId: UserId,
    pattern: {
      patternType: string;
      timeOfDay: string;
      dayOfWeek: number[];
      confidence: number;
      metrics: Record<string, unknown>;
    },
  ): Promise<ProductivityPattern> {
    try {
      return await this.prisma.productivityPattern.upsert({
        where: {
          userId_patternType_timeOfDay: {
            userId,
            patternType: pattern.patternType,
            timeOfDay: pattern.timeOfDay,
          },
        },
        create: {
          user: { connect: { id: userId } },
          patternType: pattern.patternType,
          timeOfDay: pattern.timeOfDay,
          dayOfWeek: JSON.stringify(pattern.dayOfWeek),
          confidence: pattern.confidence,
          metrics: JSON.stringify(pattern.metrics),
          lastSeenAt: new Date(),
        },
        update: {
          dayOfWeek: JSON.stringify(pattern.dayOfWeek),
          confidence: pattern.confidence,
          metrics: JSON.stringify(pattern.metrics),
          lastSeenAt: new Date(),
        },
      });
    } catch (error) {
      this.handleError(error, 'upsert');
    }
  }

  /**
   * Peak-hours patterns for a user, highest-confidence first.
   * `timeOfDay` carries the window (e.g. "09:00-11:00").
   */
  async findPeakHours(userId: UserId, limit = 3): Promise<ProductivityPattern[]> {
    try {
      return await this.prisma.productivityPattern.findMany({
        where: {
          userId,
          patternType: 'PEAK_HOURS',
        },
        orderBy: { confidence: 'desc' },
        take: limit,
      });
    } catch (error) {
      this.handleError(error, 'findPeakHours');
    }
  }
}
