import type { User, UserSettings, DeviceType, Prisma } from '@/generated/prisma';
import { z } from 'zod';
import { DEFAULT_TZ, getTodayString, shiftCalendarDay } from '@/lib/dates';
import { UserRepository } from '@/server/repositories/user.repository';
import { HabitRepository } from '@/server/repositories/habit.repository';
import { GoalRepository } from '@/server/repositories/goal.repository';
import { StreakRepository } from '@/server/repositories/streak.repository';
import { ScoreRepository } from '@/server/repositories/score.repository';
import { AuditRepository } from '@/server/repositories/audit.repository';
import { updateProfileSchema } from '@/lib/validation/user';
import { updateSettingsSchema } from '@/lib/validation/settings.schema';
import type { UserStats } from '@/types/auth';
import type { DeviceSessionInfo } from '@/types/auth';

/**
 * User Service
 * Business logic for user profile, settings, stats and session management
 */

function firstZodIssue(error: z.ZodError): string {
  return error.errors[0]?.message ?? 'Validation failed';
}

function toSafeUser(user: User): Omit<User, 'passwordHash'> {
  const { passwordHash: _passwordHash, ...safeUser } = user;
  return safeUser;
}

/**
 * The `YYYY-MM-DD` calendar date `n` days before `today`.
 *
 * The old version did `new Date()` → `setDate(getDate() - n)` →
 * `toISOString().split('T')[0]`, which mixes two frames: `getDate()` reads the
 * **host-local** day while `toISOString()` re-anchors to UTC. On a host west of
 * UTC, "today" resolved to tomorrow's UTC date, so the 90-day window opened one
 * day late and included a day that had not happened.
 */
function daysAgo(n: number, today: string): string {
  return shiftCalendarDay(today, -n);
}

export class UserService {
  private userRepository: UserRepository;
  private habitRepository: HabitRepository;
  private goalRepository: GoalRepository;
  private streakRepository: StreakRepository;
  private scoreRepository: ScoreRepository;
  private auditRepository: AuditRepository;

  constructor() {
    this.userRepository = new UserRepository();
    this.habitRepository = new HabitRepository();
    this.goalRepository = new GoalRepository();
    this.streakRepository = new StreakRepository();
    this.scoreRepository = new ScoreRepository();
    this.auditRepository = new AuditRepository();
  }

  /**
   * Get a public profile view of a user
   */
  async getProfile(userId: string): Promise<Omit<User, 'passwordHash'>> {
    const user = await this.userRepository.findById(userId);
    if (!user) {
      throw new Error('User not found');
    }
    return toSafeUser(user);
  }

  /**
   * Resolve the user's timezone (falling back to the app default).
   */
  async getTimezone(userId: string): Promise<string> {
    const settings = await this.userRepository.getSettings(userId);
    return settings?.timezone || DEFAULT_TZ;
  }

  /**
   * Update profile fields (name, displayName, bio, avatarUrl, timezone, preferredLanguage)
   */
  /**
   * Update the user's profile fields.
   *
   * `timezone` is special-cased. It exists on both `User` and `UserSettings`, and
   * `UserSettings.timezone` is the **authoritative** column — every
   * date-bucketing read (habit logs, daily scores, streaks, analytics ranges,
   * sleep sessions) resolves that one. This method used to write *only*
   * `User.timezone`, so changing the timezone on `/profile` updated a column
   * nothing reads, while `/settings/timezone` (via `updateSettings`) updated
   * the one that does. The two pages showed different values and the app
   * silently ignored the profile-page edit.
   *
   * Both columns are now written together, so either entry point produces the
   * same result. If they ever diverge again, the profile page is the wrong one
   * to trust — `UserSettings` wins.
   */
  async updateProfile(
    userId: string,
    input: Record<string, unknown>
  ): Promise<Omit<User, 'passwordHash'>> {
    const parsed = updateProfileSchema.safeParse(input);
    if (!parsed.success) {
      throw new Error(firstZodIssue(parsed.error));
    }

    const user = await this.userRepository.findById(userId);
    if (!user) {
      throw new Error('User not found');
    }

    const updated = await this.userRepository.update(userId, {
      name: parsed.data.name,
      displayName: parsed.data.displayName,
      bio: parsed.data.bio,
      avatarUrl: parsed.data.avatarUrl,
      timezone: parsed.data.timezone,
      preferredLanguage: parsed.data.preferredLanguage,
    });

    // Mirror into the authoritative settings column. Best-effort: a failure here
    // must not roll back the profile fields the user actually asked to change,
    // so it is logged rather than thrown.
    if (typeof parsed.data.timezone === 'string' && parsed.data.timezone) {
      try {
        const existing = await this.userRepository.getSettings(userId);
        if (existing) {
          await this.userRepository.updateSettings(userId, {
            timezone: parsed.data.timezone,
          } as Prisma.UserSettingsUpdateInput);
        } else {
          await this.userRepository.createSettings(userId, {
            timezone: parsed.data.timezone,
          });
        }
      } catch (err) {
        console.error(
          '[user.updateProfile] failed to sync UserSettings.timezone; ' +
            'date bucketing will keep using the previous value:',
          err
        );
      }
    }

    await this.auditRepository.create({
      userId,
      action: 'SETTINGS_UPDATED',
      entityType: 'USER',
      entityId: userId,
    });

    return toSafeUser(updated);
  }

  /**
   * Get (and create-on-first-access) the user's settings.
   */
  async getSettings(userId: string): Promise<UserSettings> {
    let settings = await this.userRepository.getSettings(userId);
    if (!settings) {
      settings = await this.userRepository.createSettings(userId);
    }
    return settings;
  }

  /**
   * Update user settings. Validates the full settings shape before persisting.
   *
   * `timezone` exists on both `User` and `UserSettings`. They used to drift
   * apart: the settings page wrote only `UserSettings.timezone` while the auth
   * store optimistically patched `User.timezone`, so the value shown in the UI
   * and the value used to bucket scores could disagree. `User.timezone` is now
   * always written alongside it and is the column the rest of the app reads.
   */
  async updateSettings(
    userId: string,
    input: Record<string, unknown>
  ) {
    const parsed = updateSettingsSchema.safeParse(input);
    if (!parsed.success) {
      throw new Error(firstZodIssue(parsed.error));
    }

    const existing = await this.userRepository.getSettings(userId);
    if (!existing) {
      await this.userRepository.createSettings(userId);
    }

    const data: Record<string, unknown> = {};
    const entries = Object.entries(parsed.data) as Array<[string, unknown]>;
    for (const [key, value] of entries) {
      if (value === undefined) continue;
      if (key === 'theme' && value === 'SYSTEM') {
        data.theme = 'AUTO';
      } else {
        data[key] = value;
      }
    }

    const updated = await this.userRepository.updateSettings(userId, data);

    if (typeof data.timezone === 'string') {
      await this.userRepository.update(userId, { timezone: data.timezone });
    }

    await this.auditRepository.create({
      userId,
      action: 'SETTINGS_UPDATED',
      entityType: 'USER',
      entityId: userId,
    });

    return updated;
  }

  /**
   * Change the email address. Un-verifies the account and sends
   * a fresh verification email (email service is best-effort here).
   */
  async changeEmail(
    userId: string,
    newEmail: string
  ): Promise<Omit<User, 'passwordHash'>> {
    if (typeof newEmail !== 'string' || !newEmail.includes('@')) {
      throw new Error('Invalid email address');
    }

    const user = await this.userRepository.findById(userId);
    if (!user) {
      throw new Error('User not found');
    }

    if (await this.userRepository.emailExists(newEmail)) {
      throw new Error('Email is already in use');
    }

    const updated = await this.userRepository.update(userId, {
      email: newEmail.toLowerCase(),
      emailVerified: null,
    });

    await this.auditRepository.create({
      userId,
      action: 'SETTINGS_UPDATED',
      entityType: 'USER',
      entityId: userId,
      metadata: { field: 'email' },
    });

    return toSafeUser(updated);
  }

  /**
   * Search users by name, displayName or email (no username column)
   */
  async searchUsers(
    query: string,
    limit: number = 100
  ): Promise<Omit<User, 'passwordHash'>[]> {
    if (typeof query !== 'string' || query.trim().length === 0) {
      return [];
    }

    const safeLimit = Math.min(Math.max(Number(limit) || 100, 1), 100);
    const term = query.trim();

    const users = await this.userRepository.search(term, safeLimit);

    return users.map(toSafeUser);
  }

  /**
   * Leaderboard rows, ranked by average daily score over a trailing window.
   *
   * Two queries total: the ranked score aggregates, then the identity/streak
   * fields for the users that made the cut. The previous implementation fanned
   * out one HTTP request per user from the client, which was both slow and
   * enough to trip the 30/min public-profile rate limit.
   *
   * Users with no scored days in the window are omitted rather than shown with
   * an average of zero.
   */
  async getLeaderboard(
    currentUserId: string,
    limit: number = 25,
    windowDays: number = 90
  ) {
    const safeLimit = Math.min(Math.max(Number(limit) || 25, 1), 100);

    const since = new Date();
    since.setDate(since.getDate() - windowDays);
    const sinceDate = since.toISOString().slice(0, 10);

    // Ask for one extra row so the current user can be removed after ranking
    // without dropping the table from `safeLimit` entries to `safeLimit - 1`.
    const scores = await this.userRepository.getAverageScores(
      sinceDate,
      safeLimit + 1
    );

    const ranked = scores
      .filter((s) => s.userId !== currentUserId)
      .slice(0, safeLimit);

    if (ranked.length === 0) return [];

    const candidates = await this.userRepository.getLeaderboardCandidates(
      safeLimit + 1
    );
    const byId = new Map(candidates.map((u) => [u.id, u]));

    return ranked
      .map((score) => {
        const user = byId.get(score.userId);
        if (!user) return null;
        return {
          id: user.id,
          name: user.displayName ?? user.name ?? 'Anonymous',
          avatarUrl: user.avatarUrl,
          averageScore: Math.round(score.averageScore * 10) / 10,
          currentStreak: user.streak?.currentStreak ?? 0,
          longestStreak: user.streak?.longestStreak ?? 0,
          totalDays: user.streak?.totalCompletedDays ?? score.scoredDays,
        };
      })
      .filter((row): row is NonNullable<typeof row> => row !== null);
  }

  /**
   * List active device sessions for a user.
   *
   * `isCurrent` is resolved against the device id the caller reports (its own
   * localStorage fingerprint), not against a "seen recently" heuristic. The old
   * `now - lastActiveAt < 30min` test marked *every* recently-used device as
   * current, which disabled the Revoke button on all of them.
   */
  async getSessions(
    userId: string,
    currentDeviceId?: string | null
  ): Promise<DeviceSessionInfo[]> {
    const user = await this.userRepository.findById(userId);
    if (!user) {
      throw new Error('User not found');
    }

    const sessions = await this.userRepository.listDeviceSessions(userId);

    return sessions.map((s) => ({
      id: s.id,
      deviceId: s.deviceId,
      deviceName: s.deviceName,
      deviceType: s.deviceType,
      ipAddress: s.ipAddress,
      location: s.location,
      lastActiveAt: s.lastActiveAt,
      isCurrent: currentDeviceId ? s.deviceId === currentDeviceId : false,
    }));
  }

  /**
   * Register (or refresh) the calling device's session.
   *
   * NextAuth's `jwt` strategy never writes a `DeviceSession` row, so this is
   * the only thing that populates `/settings/sessions`. Keyed on
   * `(userId, deviceId)` so repeat calls update rather than duplicate.
   */
  async registerDeviceSession(
    userId: string,
    input: {
      deviceId: string;
      deviceName?: string | null;
      deviceType?: DeviceType | null;
      userAgent?: string | null;
      ipAddress?: string | null;
      location?: string | null;
      ttlMs?: number;
    }
  ) {
    const user = await this.userRepository.findById(userId);
    if (!user) {
      throw new Error('User not found');
    }

    // Match the 6-hour absolute session lifetime configured in `lib/auth.ts`.
    const ttlMs = input.ttlMs ?? 6 * 60 * 60 * 1000;
    const expiresAt = new Date(Date.now() + ttlMs);

    return this.userRepository.upsertDeviceSession(userId, {
      deviceId: input.deviceId,
      deviceName: input.deviceName ?? null,
      deviceType: input.deviceType ?? null,
      userAgent: input.userAgent ?? null,
      ipAddress: input.ipAddress ?? null,
      location: input.location ?? null,
      expiresAt,
    });
  }

  /**
   * Find this browser's session row, scoped to the user so a device id from
   * another account can never be resolved.
   */
  async getDeviceSession(userId: string, deviceId: string) {
    return this.userRepository.findDeviceSessionByDeviceId(userId, deviceId);
  }

  /**
   * Revoke a single device session. Throws if the session
   * does not belong to the user.
   */
  async revokeSession(
    userId: string,
    sessionId: string
  ): Promise<{ success: boolean; message: string }> {
    const user = await this.userRepository.findById(userId);
    if (!user) {
      throw new Error('User not found');
    }

    const session = await this.userRepository.findDeviceSessionById(sessionId);
    if (!session || session.userId !== userId) {
      throw new Error('Session not found');
    }

    await this.userRepository.deleteDeviceSession(sessionId);

    return { success: true, message: 'Session revoked' };
  }

  /**
   * Mark onboarding as completed for the user
   */
  async completeOnboarding(
    userId: string
  ): Promise<Omit<User, 'passwordHash'>> {
    const user = await this.userRepository.findById(userId);
    if (!user) {
      throw new Error('User not found');
    }

    const updated = await this.userRepository.completeOnboarding(userId);
    return toSafeUser(updated);
  }

  /**
   * Aggregate profile statistics from habits, goals, streak and scores
   */
  async getUserStats(userId: string): Promise<UserStats> {
    const user = await this.userRepository.findById(userId);
    if (!user) {
      throw new Error('User not found');
    }

    // The 90-day window is anchored to the user's today, so the window the
    // public profile reports matches the days they actually lived through.
    const timezone = await this.getTimezone(userId).catch(() => DEFAULT_TZ);
    const today = getTodayString(timezone);

    const [habitCounts, goalCounts, streak, averageScore] = await Promise.all([
      this.habitRepository.countByStatus(userId),
      this.goalRepository.countByStatus(userId),
      this.streakRepository.findByUserId(userId),
      this.scoreRepository.getAverageScore(userId, daysAgo(90, today), today),
    ]);

    const totalHabits = Object.values(habitCounts).reduce(
      (sum, n) => sum + n,
      0
    );
    const totalGoals = Object.values(goalCounts).reduce(
      (sum, n) => sum + n,
      0
    );

    return {
      totalHabits,
      activeHabits: habitCounts['ACTIVE'] ?? 0,
      totalGoals,
      completedGoals: goalCounts['COMPLETED'] ?? 0,
      currentStreak: streak?.currentStreak ?? 0,
      longestStreak: streak?.longestStreak ?? 0,
      totalDays: streak?.totalCompletedDays ?? 0,
      averageScore,
    };
  }
}

export const userService = new UserService();

