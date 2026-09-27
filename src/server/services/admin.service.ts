import { AdminRepository } from '@/server/repositories/admin.repository';
import { UserRepository } from '@/server/repositories/user.repository';
import { AuditService } from '@/server/audit/audit.service';
import type { AuditAction, Role } from '@/generated/prisma';

/**
 * Admin Service
 *
 * Business logic for the admin dashboard: the admin authorisation check and
 * the system-wide aggregates.
 *
 * Previously each of the four admin routes repeated the same "load the session
 * user, verify `role === 'ADMIN'`" guard inline and then ran its own Prisma
 * aggregates. The guard now exists once, here.
 */

export class ForbiddenError extends Error {
  constructor() {
    super('Forbidden');
    this.name = 'ForbiddenError';
  }
}

/** Window used for the "active users" figure. */
const ACTIVE_WINDOW_DAYS = 30;

export interface AdminAnalyticsRange {
  gte?: Date;
  lte?: Date;
}

export class AdminService {
  private adminRepository: AdminRepository;
  private userRepository: UserRepository;

  constructor() {
    this.adminRepository = new AdminRepository();
    this.userRepository = new UserRepository();
  }

  /**
   * Ensure the given user is an administrator.
   *
   * @throws {ForbiddenError} when the user is not an admin.
   */
  async requireAdmin(userId: string): Promise<void> {
    const user = await this.userRepository.findById(userId);
    if (user?.role !== 'ADMIN') {
      throw new ForbiddenError();
    }
  }

  /**
   * Paginated user list for the admin table.
   */
  async listUsers(opts: {
    limit?: number;
    offset?: number;
    search?: string;
    role?: Role;
  }) {
    const [users, total] = await Promise.all([
      this.adminRepository.listUsersWithCounts(opts),
      this.adminRepository.countUsersWithFilters(opts),
    ]);

    const limit = opts.limit ?? 50;
    const offset = opts.offset ?? 0;

    return {
      users,
      meta: { total, limit, offset, hasMore: offset + limit < total },
    };
  }

  /**
   * Headline system statistics for the admin dashboard.
   */
  async getStats() {
    const activeSince = new Date(
      Date.now() - ACTIVE_WINDOW_DAYS * 24 * 60 * 60 * 1000
    );

    const [
      totalUsers,
      activeUsers,
      totalHabits,
      totalGoals,
      totalScores,
      totalInsights,
      usersByRole,
      recentUsers,
    ] = await Promise.all([
      this.adminRepository.countAllUsers(),
      this.adminRepository.countActiveUsers(activeSince),
      this.adminRepository.countAllHabits(),
      this.adminRepository.countAllGoals(),
      this.adminRepository.countAllScores(),
      this.adminRepository.countAllInsights(),
      this.adminRepository.countUsersByRole(),
      this.adminRepository.findRecentUsers(10),
    ]);

    const round2 = (n: number) => Math.round(n * 100) / 100;

    return {
      users: { total: totalUsers, active: activeUsers, byRole: usersByRole, recent: recentUsers },
      content: {
        habits: {
          total: totalHabits,
          averagePerUser: totalUsers > 0 ? round2(totalHabits / totalUsers) : 0,
        },
        goals: {
          total: totalGoals,
          averagePerUser: totalUsers > 0 ? round2(totalGoals / totalUsers) : 0,
        },
        scores: { total: totalScores },
      },
      ai: { totalInsights },
    };
  }

  /**
   * System-wide analytics over an optional date range.
   */
  async getAnalytics(range: AdminAnalyticsRange = {}) {
    const activeSince = new Date(
      Date.now() - ACTIVE_WINDOW_DAYS * 24 * 60 * 60 * 1000
    );
    const hasRange = Boolean(range.gte || range.lte);
    const createdAtRange = hasRange ? range : undefined;

    const [
      totalUsers,
      activeUsers,
      newUsers,
      usersByRole,
      totalHabits,
      totalGoals,
      completedGoals,
      totalFeedback,
      resolvedFeedback,
      totalChallenges,
      activeChallenges,
      totalScores,
    ] = await Promise.all([
      this.adminRepository.countAllUsers(),
      this.adminRepository.countActiveUsers(activeSince),
      this.adminRepository.countNewUsers(createdAtRange),
      this.adminRepository.countUsersByRole(),
      this.adminRepository.countAllHabits(),
      this.adminRepository.countAllGoals(),
      this.adminRepository.countCompletedGoals(createdAtRange),
      this.adminRepository.countAllFeedback(),
      this.adminRepository.countResolvedFeedback(),
      this.adminRepository.countAllChallenges(),
      this.adminRepository.countActiveChallenges(),
      this.adminRepository.countAllScores(),
    ]);

    return {
      users: { total: totalUsers, active30d: activeUsers, newInPeriod: newUsers, byRole: usersByRole },
      content: {
        habits: totalHabits,
        goals: { total: totalGoals, completed: completedGoals },
        challenges: { total: totalChallenges, active: activeChallenges },
      },
      feedback: { total: totalFeedback, resolved: resolvedFeedback },
      scores: { total: totalScores },
    };
  }

  /**
   * Audit-log entries for one user.
   */
  async getAuditLogs(
    userId: string,
    opts: {
      action?: AuditAction | AuditAction[];
      limit?: number;
      offset?: number;
    }
  ) {
    return new AuditService().getUserLogs(userId, opts);
  }
}

export const adminService = new AdminService();
