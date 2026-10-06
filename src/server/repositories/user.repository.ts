import type { User, UserSettings, Prisma, DeviceType } from '@/generated/prisma';
import { createLogger } from '@/lib/monitoring/logger';
import { BaseRepository } from './base.repository';
import type { UserId } from '@/types/ids';

/**
 * User Repository
 * Database operations for User model
 */

const log = createLogger('repository');

/**
 * The only user fields that may be returned to another user.
 *
 * Deliberately excludes `email` (PII — and it is one of the searchable columns,
 * so exposing it turns search into an account-enumeration oracle),
 * `passwordHash`, `sessionVersion`, `lockedUntil` / `failedLoginAttempts`
 * (account-lockout state, useful for griefing a target), `role`,
 * `socialSettings` / `preferences`, `emailVerified` and the soft-delete fields.
 */
export interface PublicUserSummary {
  id: string;
  name: string | null;
  displayName: string | null;
  avatarUrl: string | null;
  isActive: boolean;
  createdAt: Date;
}

export class UserRepository extends BaseRepository {
  /**
   * Find user by ID
   */
  async findById(userId: UserId): Promise<User | null> {
    try {
      return await this.prisma.user.findUnique({
        where: { id: userId },
      });
    } catch (error) {
      this.handleError(error, 'findById');
    }
  }

  /**
   * Find user by email
   */
  async findByEmail(email: string): Promise<User | null> {
    try {
      return await this.prisma.user.findUnique({
        where: { email: email.toLowerCase() },
      });
    } catch (error) {
      this.handleError(error, 'findByEmail');
    }
  }

  /**
   * Find user with settings
   */
  async findWithSettings(
    userId: UserId
  ): Promise<(User & { settings: UserSettings | null }) | null> {
    try {
      return await this.prisma.user.findUnique({
        where: { id: userId },
        include: { settings: true },
      });
    } catch (error) {
      this.handleError(error, 'findWithSettings');
    }
  }

  /**
   * Create new user
   */
  async create(data: Prisma.UserCreateInput): Promise<User> {
    try {
      return await this.prisma.user.create({
        data: {
          ...data,
          email: data.email.toLowerCase(),
        },
      });
    } catch (error) {
      this.handleError(error, 'create');
    }
  }

  /**
   * Update user
   */
  async update(userId: UserId, data: Prisma.UserUpdateInput): Promise<User> {
    try {
      return await this.prisma.user.update({
        where: { id: userId },
        data,
      });
    } catch (error) {
      this.handleError(error, 'update');
    }
  }

  /**
   * Update password
   */
  async updatePassword(userId: UserId, passwordHash: string): Promise<User> {
    try {
      return await this.prisma.user.update({
        where: { id: userId },
        data: { passwordHash },
      });
    } catch (error) {
      this.handleError(error, 'updatePassword');
    }
  }

  /**
   * Update last login
   */
  async updateLastLogin(userId: UserId): Promise<void> {
    try {
      await this.prisma.user.update({
        where: { id: userId },
        data: {
          lastLoginAt: new Date(),
          lastActivityAt: new Date(),
          failedLoginAttempts: 0,
          lockedUntil: null,
        },
      });
    } catch (error) {
      this.handleError(error, 'updateLastLogin');
    }
  }

  /**
   * Increment failed login attempts
   */
  async incrementFailedLogin(userId: UserId): Promise<number> {
    try {
      const user = await this.prisma.user.update({
        where: { id: userId },
        data: {
          failedLoginAttempts: { increment: 1 },
        },
      });

      // Lock account after 5 failed attempts
      if (user.failedLoginAttempts >= 5) {
        const lockUntil = new Date();
        lockUntil.setMinutes(lockUntil.getMinutes() + 30); // Lock for 30 minutes

        await this.prisma.user.update({
          where: { id: userId },
          data: { lockedUntil: lockUntil },
        });
      }

      return user.failedLoginAttempts;
    } catch (error) {
      this.handleError(error, 'incrementFailedLogin');
    }
  }

  /**
   * Mark email as verified
   */
  async verifyEmail(userId: UserId): Promise<User> {
    try {
      return await this.prisma.user.update({
        where: { id: userId },
        data: { emailVerified: new Date() },
      });
    } catch (error) {
      this.handleError(error, 'verifyEmail');
    }
  }

  /**
   * Mark onboarding as completed
   */
  async completeOnboarding(userId: UserId): Promise<User> {
    try {
      return await this.prisma.user.update({
        where: { id: userId },
        data: { onboardingCompletedAt: new Date() },
      });
    } catch (error) {
      this.handleError(error, 'completeOnboarding');
    }
  }

  /**
   * Soft delete user
   */
  async softDelete(userId: UserId, reason?: string): Promise<User> {
    try {
      return await this.prisma.user.update({
        where: { id: userId },
        data: {
          isDeleted: true,
          deletedAt: new Date(),
          deleteReason: reason,
          isActive: false,
        },
      });
    } catch (error) {
      this.handleError(error, 'softDelete');
    }
  }

  /**
   * Check if email exists
   */
  async emailExists(email: string): Promise<boolean> {
    try {
      const count = await this.prisma.user.count({
        where: { email: email.toLowerCase() },
      });
      return count > 0;
    } catch (error) {
      this.handleError(error, 'emailExists');
    }
  }

  /**
   * Get user settings
   */
  async getSettings(userId: UserId): Promise<UserSettings | null> {
    try {
      return await this.prisma.userSettings.findUnique({
        where: { userId },
      });
    } catch (error) {
      this.handleError(error, 'getSettings');
    }
  }

  /**
   * Find settings for all users with sleep prompts enabled and a bedtime set.
   * Used by the sleep-notifications cron to create/auto-start prompts.
   *
   * `sleepReminderNotifications: { not: false }` respects the per-category
   * "Sleep reminder" switch on the Settings > Notifications page, which is
   * separate from the `sleepReminder` master switch configured on Settings > Sleep.
   */
  async findUsersWithSleepPromptsEnabled() {
    try {
      return await this.prisma.userSettings.findMany({
        where: {
          sleepReminder: true,
          targetBedtime: { not: null },
          sleepReminderNotifications: { not: false },
        },
        include: { user: true },
      });
    } catch (error) {
      this.handleError(error, 'findUsersWithSleepPromptsEnabled');
    }
  }

  /**
   * Create user settings
   */
  async createSettings(
    userId: UserId,
    data?: Partial<Prisma.UserSettingsUncheckedCreateInput>
  ): Promise<UserSettings> {
    try {
      return await this.prisma.userSettings.create({
        data: {
          userId,
          ...data,
        },
      });
    } catch (error) {
      this.handleError(error, 'createSettings');
    }
  }

  /**
   * Update user settings
   */
  async updateSettings(
    userId: UserId,
    data: Prisma.UserSettingsUpdateInput
  ): Promise<UserSettings> {
    try {
      return await this.prisma.userSettings.update({
        where: { userId },
        data,
      });
    } catch (error) {
      this.handleError(error, 'updateSettings');
    }
  }

  /**
   * Update last activity
   */
  async updateLastActivity(userId: UserId): Promise<void> {
    try {
      await this.prisma.user.update({
        where: { id: userId },
        data: { lastActivityAt: new Date() },
      });
    } catch (error) {
      // Best-effort: a failed activity ping must never fail the request that
      // triggered it. Logged rather than swallowed.
      log.warn('Failed to update last activity', { userId });
    }
  }

  // ============================================================================
  // User search
  // ============================================================================

  /**
   * Case-insensitive search over name, displayName and email.
   * Soft-deleted accounts are excluded.
   */
  async search(term: string, limit: number): Promise<PublicUserSummary[]> {
    try {
      return await this.prisma.user.findMany({
        // Explicit `select`, never a whole row.
        //
        // This selected every column and relied on the caller to strip
        // `passwordHash` — which is the only field it stripped. The response
        // therefore carried every other user's `email`, `preferences`,
        // `socialSettings` (privacy config), `role`, `sessionVersion`,
        // `lockedUntil`, `failedLoginAttempts`, `emailVerified` and `deletedAt`.
        // Because `email` was also one of the searchable columns with a
        // `contains` match, `?q=a` matched the entire user table, so any
        // registered account could harvest PII and account-lockout state for
        // everyone.
        //
        // Searchability is preserved by matching `email` server-side while
        // returning a display-safe projection.
        where: {
          isDeleted: false,
          OR: [
            { name: { contains: term, mode: 'insensitive' } },
            { displayName: { contains: term, mode: 'insensitive' } },
            { email: { contains: term, mode: 'insensitive' } },
          ],
        },
        select: {
          id: true,
          name: true,
          displayName: true,
          avatarUrl: true,
          isActive: true,
          createdAt: true,
        },
        take: limit,
      });
    } catch (error) {
      this.handleError(error, 'search');
    }
  }

  /**
   * Public leaderboard candidates: active, non-deleted users with identity
   * fields only.
   *
   * The leaderboard previously called `/api/users/search?q=` once and then
   * fetched each user's profile individually — 26 requests to draw one table,
   * and it always returned nothing because `searchUsers` rejects an empty
   * query. Worse, 25 of those were `/api/users/[id]/profile` calls, which are
   * rate limited to 30/min, so simply reloading the page twice could 429.
   *
   * No opt-in visibility flag is applied because the schema has none, and
   * `/api/users/[id]/profile` already serves any signed-in caller the same
   * identity fields for every active user. This widens nothing.
   */
  async getLeaderboardCandidates(limit: number) {
    try {
      return await this.prisma.user.findMany({
        where: {
          isDeleted: false,
          isActive: true,
        },
        select: {
          id: true,
          name: true,
          displayName: true,
          avatarUrl: true,
          streak: {
            select: {
              currentStreak: true,
              longestStreak: true,
              totalCompletedDays: true,
            },
          },
        },
        take: limit,
      });
    } catch (error) {
      this.handleError(error, 'getLeaderboardCandidates');
    }
  }

  /**
   * Average total score per user over a date window.
   *
   * Returns one row per user who has at least one scored day in the window;
   * users with no data are absent rather than present with a zero average,
   * because a zero would look like a real score rather than "no data".
   */
  async getAverageScores(sinceDate: string, limit: number) {
    try {
      const rows = await this.prisma.dailyScore.groupBy({
        by: ['userId'],
        where: {
          date: { gte: sinceDate },
          totalScore: { not: null },
        },
        _avg: { totalScore: true },
        _count: { _all: true },
        orderBy: { _avg: { totalScore: 'desc' } },
        take: limit,
      });

      return rows.map((row) => ({
        userId: row.userId,
        averageScore: row._avg.totalScore ?? 0,
        scoredDays: row._count._all,
      }));
    } catch (error) {
      this.handleError(error, 'getAverageScores');
    }
  }

  // ============================================================================
  // Device sessions
  // ============================================================================

  /**
   * A user's device sessions, most recently active first.
   */
  async listDeviceSessions(userId: UserId) {
    try {
      return await this.prisma.deviceSession.findMany({
        where: { userId },
        orderBy: { lastActiveAt: 'desc' },
      });
    } catch (error) {
      this.handleError(error, 'listDeviceSessions');
    }
  }

  /**
   * Find a device session by id, unscoped — callers must verify `userId`.
   */
  async findDeviceSessionById(sessionId: string) {
    try {
      return await this.prisma.deviceSession.findUnique({
        where: { id: sessionId },
      });
    } catch (error) {
      this.handleError(error, 'findDeviceSessionById');
    }
  }

  /**
   * Create or refresh the device session for a user.
   *
   * NextAuth runs the `jwt` strategy, so no session row is ever written for the
   * user by the framework — the `DeviceSession` table was orphaned and
   * `/settings/sessions` was permanently empty. The client registers its device
   * explicitly (see `POST /api/auth/device-session`) and this upsert is keyed on
   * `(userId, deviceId)` so a returning device refreshes rather than duplicates.
   */
  async upsertDeviceSession(
    userId: UserId,
    data: {
      deviceId: string;
      deviceName?: string | null;
      deviceType?: DeviceType | null;
      userAgent?: string | null;
      ipAddress?: string | null;
      location?: string | null;
      expiresAt: Date;
    }
  ) {
    try {
      return await this.prisma.deviceSession.upsert({
        where: { userId_deviceId: { userId, deviceId: data.deviceId } },
        create: { userId, ...data, isActive: true, lastActiveAt: new Date() },
        update: {
          deviceName: data.deviceName ?? undefined,
          deviceType: data.deviceType ?? undefined,
          userAgent: data.userAgent ?? undefined,
          ipAddress: data.ipAddress ?? undefined,
          location: data.location ?? undefined,
          expiresAt: data.expiresAt,
          isActive: true,
          lastActiveAt: new Date(),
        },
      });
    } catch (error) {
      this.handleError(error, 'upsertDeviceSession');
    }
  }

  /**
   * Find a device session by its per-user device id.
   */
  async findDeviceSessionByDeviceId(userId: UserId, deviceId: string) {
    try {
      return await this.prisma.deviceSession.findUnique({
        where: { userId_deviceId: { userId, deviceId } },
      });
    } catch (error) {
      this.handleError(error, 'findDeviceSessionByDeviceId');
    }
  }

  /**
   * Delete a single device session.
   */
  async deleteDeviceSession(sessionId: string): Promise<void> {
    try {
      await this.prisma.deviceSession.delete({ where: { id: sessionId } });
    } catch (error) {
      this.handleError(error, 'deleteDeviceSession');
    }
  }

  /**
   * Revoke every device session for a user. Returns how many were removed.
   */
  async deleteAllDeviceSessions(userId: UserId): Promise<number> {
    try {
      const result = await this.prisma.deviceSession.deleteMany({ where: { userId } });
      return result.count;
    } catch (error) {
      this.handleError(error, 'deleteAllDeviceSessions');
    }
  }

  /**
   * Increment `sessionVersion`, which invalidates every issued JWT at once.
   *
   * `session.sessionVersion` (see `lib/auth.ts`) snapshots this value at
   * sign-in and rejects any token whose snapshot no longer matches. Without
   * this bump, "sign out all devices" and "change password" could only delete
   * `DeviceSession` rows — the stateless JWTs those devices were holding stayed
   * valid until their 6-hour absolute expiry.
   */
  async bumpSessionVersion(userId: UserId): Promise<number> {
    try {
      const user = await this.prisma.user.update({
        where: { id: userId },
        data: { sessionVersion: { increment: 1 } },
        select: { sessionVersion: true },
      });
      return user.sessionVersion;
    } catch (error) {
      this.handleError(error, 'bumpSessionVersion');
    }
  }

  /**
   * Find all active user IDs.
   * Used by cron jobs that need to process all users.
   */
  async findActiveUserIds(): Promise<string[]> {
    try {
      const users = await this.prisma.user.findMany({
        where: { isActive: true, isDeleted: false },
        select: { id: true },
      });
      return users.map(u => u.id);
    } catch (error) {
      this.handleError(error, 'findActiveUserIds');
      return [];
    }
  }
}
