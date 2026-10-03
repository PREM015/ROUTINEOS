import type { Achievement, Prisma } from '@/generated/prisma';
import { BaseRepository } from './base.repository';
import type { UserId } from '@/types/ids';

/**
 * Achievement Repository
 * Database operations for Achievement model
 */

export class AchievementRepository extends BaseRepository {
  /**
   * Find all achievements for a user
   */
  async findByUserId(userId: UserId): Promise<Achievement[]> {
    try {
      return await this.prisma.achievement.findMany({
        where: { userId },
        orderBy: { unlockedAt: 'desc' },
      });
    } catch (error) {
      this.handleError(error, 'findByUserId');
    }
  }

  /**
   * Find all unlocked achievements for a user
   */
  async findUnlocked(userId: UserId): Promise<Achievement[]> {
    try {
      return await this.prisma.achievement.findMany({
        where: { userId },
        orderBy: { unlockedAt: 'desc' },
      });
    } catch (error) {
      this.handleError(error, 'findUnlocked');
    }
  }

  /**
   * Find achievement by ID with ownership check
   */
  async findById(
    userId: UserId,
    achievementId: string
  ): Promise<Achievement | null> {
    try {
      return await this.prisma.achievement.findFirst({
        where: { id: achievementId, userId },
      });
    } catch (error) {
      this.handleError(error, 'findById');
    }
  }

  /**
   * Create a single achievement linked to a user
   */
  async create(
    userId: UserId,
    data: Omit<Prisma.AchievementCreateInput, 'user'>
  ): Promise<Achievement> {
    try {
      return await this.prisma.achievement.create({
        data: {
          ...data,
          user: { connect: { id: userId } },
        },
      });
    } catch (error) {
      this.handleError(error, 'create');
    }
  }

  /**
   * Record an unlock, at most once per (user, catalogue definition).
   *
   * `checkForUnlocks` runs on every habit log and every goal completion, and two
   * of those requests can be in flight at once. Both read the owned set, both see
   * the definition as unowned, both insert — and the user ends up with two rows,
   * two notifications, and an XP total counted twice. A read-then-write guard
   * cannot fix that; only the database can, so the write is a single upsert
   * against `@@unique([userId, definitionId])`.
   *
   * `definitionId: null` (a custom achievement) has no unique key to upsert
   * against, so it falls back to a plain create.
   *
   * `created: false` means the row already existed and nothing was written, which
   * the service uses to suppress the duplicate notification and audit entry.
   */
  async createForDefinition(
    userId: UserId,
    definitionId: string | null,
    data: Omit<Prisma.AchievementUncheckedCreateInput, 'userId'>
  ): Promise<{ achievement: Achievement; created: boolean }> {
    try {
      if (definitionId === null) {
        const achievement = await this.prisma.achievement.create({
          data: { ...data, userId },
        });
        return { achievement, created: true };
      }

      const existing = await this.prisma.achievement.findUnique({
        where: { userId_definitionId: { userId, definitionId } },
      });
      if (existing) return { achievement: existing, created: false };

      try {
        const achievement = await this.prisma.achievement.create({
          data: { ...data, userId, definitionId },
        });
        return { achievement, created: true };
      } catch (error) {
        // Lost the race: the other request inserted between our read and write.
        // Its row is the same achievement, so adopt it instead of duplicating.
        if (this.isUniqueConstraintError(error)) {
          const winner = await this.prisma.achievement.findUnique({
            where: { userId_definitionId: { userId, definitionId } },
          });
          if (winner) return { achievement: winner, created: false };
        }
        throw error;
      }
    } catch (error) {
      this.handleError(error, 'createForDefinition');
    }
  }

  /**
   * Mark an achievement as seen, scoped to its owner.
   *
   * The scope is part of the `where` clause rather than a preceding lookup, so
   * there is no window in which another user's id could be used to flip a flag.
   * `updateMany` returns a count instead of a row, so the refreshed record is
   * read back for the response.
   *
   * @returns the updated row, or `null` when the id is not this user's.
   */
  async markCelebrated(
    userId: UserId,
    achievementId: string
  ): Promise<Achievement | null> {
    try {
      const { count } = await this.prisma.achievement.updateMany({
        where: { id: achievementId, userId },
        data: { celebrated: true },
      });
      if (count === 0) return null;
      return this.findById(userId, achievementId);
    } catch (error) {
      this.handleError(error, 'markCelebrated');
    }
  }

  /**
   * Backfill `definitionId` from `metadata` and collapse duplicates.
   *
   * The unique index cannot be created while two rows share a (user, definition)
   * pair, and the index is what stops new duplicates, so the data is reconciled
   * *before* the constraint lands. This method only reports; `prisma/seed.ts`
   * and `scripts/reconcile-achievements.ts` own the destructive half.
   *
   * Returns one entry per duplicate group, oldest unlock first, so a caller can
   * show the user exactly what would be merged.
   */
  async findDuplicateDefinitionGroups(
    userId: UserId
  ): Promise<{ definitionId: string; ids: string[] }[]> {
    try {
      const rows = await this.prisma.achievement.findMany({
        where: { userId, definitionId: { not: null } },
        select: { id: true, definitionId: true },
        orderBy: { unlockedAt: 'asc' },
      });
      const byDefinition = new Map<string, string[]>();
      for (const row of rows) {
        if (!row.definitionId) continue;
        const group = byDefinition.get(row.definitionId);
        if (group) group.push(row.id);
        else byDefinition.set(row.definitionId, [row.id]);
      }
      return Array.from(byDefinition.entries())
        .filter(([, ids]) => ids.length > 1)
        .map(([definitionId, ids]) => ({ definitionId, ids }));
    } catch (error) {
      this.handleError(error, 'findDuplicateDefinitionGroups');
    }
  }

  /**
   * Bulk create achievements for a user
   */
  async createMany(
    userId: UserId,
    achievements: Array<Omit<Prisma.AchievementCreateManyInput, 'userId'>>
  ): Promise<number> {
    try {
      const result = await this.prisma.achievement.createMany({
        data: achievements.map((achievement) => ({
          ...achievement,
          userId,
        })),
        skipDuplicates: true,
      });
      return result.count;
    } catch (error) {
      this.handleError(error, 'createMany');
    }
  }

  /**
   * Check whether a user has unlocked an achievement
   */
  async isUnlocked(
    userId: UserId,
    achievementId: string
  ): Promise<boolean> {
    try {
      const count = await this.prisma.achievement.count({
        where: { id: achievementId, userId },
      });
      return count > 0;
    } catch (error) {
      this.handleError(error, 'isUnlocked');
    }
  }

  /**
   * Get recently unlocked achievements for a user
   */
  async recentUnlocked(
    userId: UserId,
    limit?: number
  ): Promise<Achievement[]> {
    try {
      return await this.prisma.achievement.findMany({
        where: { userId },
        orderBy: { unlockedAt: 'desc' },
        ...this.buildPaginationQuery(limit),
      });
    } catch (error) {
      this.handleError(error, 'recentUnlocked');
    }
  }
}
