import { BaseRepository } from './base.repository';
import type { Prisma, Role } from '@/generated/prisma';

/**
 * Admin Repository
 * Read-only helpers for the admin dashboard (user listing, stats).
 *
 * Every method here is system-wide (not scoped to a userId) — that is the
 * defining characteristic of an admin query, and it is why these live apart
 * from the per-user repositories.
 */

export interface AdminUserRow {
  id: string;
  name: string | null;
  email: string;
  displayName: string | null;
  avatarUrl: string | null;
  role: string;
  isActive: boolean;
  isDeleted: boolean;
  emailVerified: Date | null;
  createdAt: Date;
}

/** Shape used by the admin user list, including per-user content counts. */
export type AdminUserListRow = AdminUserRow & {
  lastActivityAt: Date | null;
  _count: { habits: number; goals: number };
};

/** Count of rows matching an optional date range. */
function createdInRange(
  range?: { gte?: Date; lte?: Date }
): Prisma.DateTimeFilter | undefined {
  if (!range) return undefined;
  return { gte: range.gte, lte: range.lte };
}

export class AdminRepository extends BaseRepository {
  /**
   * Paginated user list with optional search by name / email / displayName.
   */
  async listUsers(opts: {
    limit?: number;
    offset?: number;
    search?: string;
  }): Promise<AdminUserRow[]> {
    try {
      const take = Math.min(Math.max(opts.limit ?? 25, 1), 100);
      const skip = Math.max(opts.offset ?? 0, 0);
      const where =
        opts.search && opts.search.trim().length > 0
          ? {
              OR: [
                { name: { contains: opts.search.trim(), mode: 'insensitive' as const } },
                { displayName: { contains: opts.search.trim(), mode: 'insensitive' as const } },
                { email: { contains: opts.search.trim(), mode: 'insensitive' as const } },
              ],
            }
          : {};

      return await this.prisma.user.findMany({
        where,
        select: {
          id: true,
          name: true,
          email: true,
          displayName: true,
          avatarUrl: true,
          role: true,
          isActive: true,
          isDeleted: true,
          emailVerified: true,
          createdAt: true,
        },
        orderBy: { createdAt: 'desc' },
        take,
        skip,
      });
    } catch (error) {
      this.handleError(error, 'listUsers');
    }
  }

  /**
   * Total user count (optionally filtered by the same search term)
   */
  async countUsers(search?: string): Promise<number> {
    try {
      const where =
        search && search.trim().length > 0
          ? {
              OR: [
                { name: { contains: search.trim(), mode: 'insensitive' as const } },
                { displayName: { contains: search.trim(), mode: 'insensitive' as const } },
                { email: { contains: search.trim(), mode: 'insensitive' as const } },
              ],
            }
          : {};
      return await this.prisma.user.count({ where });
    } catch (error) {
      this.handleError(error, 'countUsers');
    }
  }

  // ==========================================================================
  // Admin user list (richer projection)
  // ==========================================================================

  /**
   * Admin user list including content counts, optionally filtered by role.
   */
  async listUsersWithCounts(opts: {
    limit?: number;
    offset?: number;
    search?: string;
    role?: Role;
  }): Promise<AdminUserListRow[]> {
    try {
      const take = Math.min(Math.max(opts.limit ?? 50, 1), 100);
      const skip = Math.max(opts.offset ?? 0, 0);
      const search = opts.search?.trim();

      const where: Prisma.UserWhereInput = {
        ...(search && {
          OR: [
            { email: { contains: search, mode: 'insensitive' } },
            { name: { contains: search, mode: 'insensitive' } },
          ],
        }),
        ...(opts.role && { role: opts.role }),
      };

      return await this.prisma.user.findMany({
        where,
        select: {
          id: true,
          email: true,
          name: true,
          displayName: true,
          avatarUrl: true,
          role: true,
          isActive: true,
          isDeleted: true,
          emailVerified: true,
          createdAt: true,
          lastActivityAt: true,
          _count: { select: { habits: true, goals: true } },
        },
        orderBy: { createdAt: 'desc' },
        take,
        skip,
      });
    } catch (error) {
      this.handleError(error, 'listUsersWithCounts');
    }
  }

  /**
   * Count users matching the admin list filters.
   */
  async countUsersWithFilters(opts: { search?: string; role?: Role }): Promise<number> {
    try {
      const search = opts.search?.trim();
      const where: Prisma.UserWhereInput = {
        ...(search && {
          OR: [
            { email: { contains: search, mode: 'insensitive' } },
            { name: { contains: search, mode: 'insensitive' } },
          ],
        }),
        ...(opts.role && { role: opts.role }),
      };
      return await this.prisma.user.count({ where });
    } catch (error) {
      this.handleError(error, 'countUsersWithFilters');
    }
  }

  /**
   * The N most recently registered users, for the admin dashboard.
   */
  async findRecentUsers(take = 10) {
    try {
      return await this.prisma.user.findMany({
        orderBy: { createdAt: 'desc' },
        take,
        select: {
          id: true,
          email: true,
          name: true,
          createdAt: true,
          lastActivityAt: true,
        },
      });
    } catch (error) {
      this.handleError(error, 'findRecentUsers');
    }
  }

  // ==========================================================================
  // System-wide aggregates
  // ==========================================================================

  /** Total registered users. */
  async countAllUsers(): Promise<number> {
    try {
      return await this.prisma.user.count();
    } catch (error) {
      this.handleError(error, 'countAllUsers');
    }
  }

  /** Users active since a given instant. */
  async countActiveUsers(since: Date): Promise<number> {
    try {
      return await this.prisma.user.count({
        where: { lastActivityAt: { gte: since } },
      });
    } catch (error) {
      this.handleError(error, 'countActiveUsers');
    }
  }

  /** Users created within an optional date range. */
  async countNewUsers(range?: { gte?: Date; lte?: Date }): Promise<number> {
    try {
      const createdAt = createdInRange(range);
      if (!createdAt) return 0;
      return await this.prisma.user.count({ where: { createdAt } });
    } catch (error) {
      this.handleError(error, 'countNewUsers');
    }
  }

  /** User counts grouped by role. */
  async countUsersByRole(): Promise<Array<{ role: Role; count: number }>> {
    try {
      const rows = await this.prisma.user.groupBy({ by: ['role'], _count: true });
      return rows.map((row) => ({ role: row.role, count: row._count }));
    } catch (error) {
      this.handleError(error, 'countUsersByRole');
    }
  }

  /** Total habits across all users. */
  async countAllHabits(): Promise<number> {
    try {
      return await this.prisma.habit.count();
    } catch (error) {
      this.handleError(error, 'countAllHabits');
    }
  }

  /** Total goals across all users. */
  async countAllGoals(): Promise<number> {
    try {
      return await this.prisma.goal.count();
    } catch (error) {
      this.handleError(error, 'countAllGoals');
    }
  }

  /** Completed goals, optionally restricted to a completion date range. */
  async countCompletedGoals(range?: { gte?: Date; lte?: Date }): Promise<number> {
    try {
      const completedAt = createdInRange(range);
      return await this.prisma.goal.count({
        where: {
          status: 'COMPLETED',
          ...(completedAt && { completedAt }),
        },
      });
    } catch (error) {
      this.handleError(error, 'countCompletedGoals');
    }
  }

  /** Total stored daily scores. */
  async countAllScores(): Promise<number> {
    try {
      return await this.prisma.dailyScore.count();
    } catch (error) {
      this.handleError(error, 'countAllScores');
    }
  }

  /** Total generated AI insights. */
  async countAllInsights(): Promise<number> {
    try {
      return await this.prisma.aIInsight.count();
    } catch (error) {
      this.handleError(error, 'countAllInsights');
    }
  }

  /** Total feedback submissions. */
  async countAllFeedback(): Promise<number> {
    try {
      return await this.prisma.feedback.count();
    } catch (error) {
      this.handleError(error, 'countAllFeedback');
    }
  }

  /** Feedback submissions that have been resolved or closed. */
  async countResolvedFeedback(): Promise<number> {
    try {
      return await this.prisma.feedback.count({
        where: { status: { in: ['RESOLVED', 'CLOSED'] } },
      });
    } catch (error) {
      this.handleError(error, 'countResolvedFeedback');
    }
  }

  /** Total challenges. */
  async countAllChallenges(): Promise<number> {
    try {
      return await this.prisma.challenge.count();
    } catch (error) {
      this.handleError(error, 'countAllChallenges');
    }
  }

  /** Challenges whose end date is still in the future. */
  async countActiveChallenges(now: Date = new Date()): Promise<number> {
    try {
      return await this.prisma.challenge.count({
        where: { endDate: { gte: now } },
      });
    } catch (error) {
      this.handleError(error, 'countActiveChallenges');
    }
  }
}

export const adminRepository = new AdminRepository();
