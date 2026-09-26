import type { ProductivityPattern } from '@prisma/client';
import { BaseRepository } from './base.repository';

/**
 * ProductivityPattern Repository
 * Read-only access to AI-discovered productivity patterns
 * (PEAK_HOURS / LOW_ENERGY / CONTEXT_SWITCH) for the focused-user surface.
 */

export class ProductivityPatternRepository extends BaseRepository {
  /**
   * Peak-hours patterns for a user, highest-confidence first.
   * `timeOfDay` carries the window (e.g. "09:00-11:00").
   */
  async findPeakHours(userId: string, limit = 3): Promise<ProductivityPattern[]> {
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