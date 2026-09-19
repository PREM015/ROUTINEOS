import type { User } from '@prisma/client';
import { z } from 'zod';
import prisma from '@/lib/prisma';
import { UserRepository } from '@/server/repositories/user.repository';
import { HabitRepository } from '@/server/repositories/habit.repository';
import { GoalRepository } from '@/server/repositories/goal.repository';
import { StreakRepository } from '@/server/repositories/streak.repository';
import { ScoreRepository } from '@/server/repositories/score.repository';
import { AuditRepository } from '@/server/repositories/audit.repository';
import { updateProfileSchema } from '@/lib/validation/user';
import { UpdateSettingsSchema } from '@/schemas/settings.schema';
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
 * Calculate an ISO date string for N days ago
 */
function daysAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().split('T')[0] ?? '';
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
   * Update profile fields (name, displayName, bio, avatarUrl, timezone, preferredLanguage)
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

    await this.auditRepository.create({
      userId,
      action: 'SETTINGS_UPDATED',
      entityType: 'USER',
      entityId: userId,
    });

    return toSafeUser(updated);
  }

  /**
   * Update user settings. Maps the 'SYSTEM' theme option to Prisma's
   * 'AUTO' value because the DB enum has no SYSTEM variant.
   */
  async updateSettings(
    userId: string,
    input: Record<string, unknown>
  ) {
    const parsed = UpdateSettingsSchema.safeParse(input);
    if (!parsed.success) {
      throw new Error(firstZodIssue(parsed.error));
    }

    const settings = await this.userRepository.getSettings(userId);
    if (!settings) {
      await this.userRepository.createSettings(userId);
    }

    const data: Record<string, unknown> = {};
    const d = parsed.data;
    if (d.theme !== undefined) {
      data.theme = d.theme === 'SYSTEM' ? 'AUTO' : d.theme;
    }
    if (d.timezone !== undefined) data.timezone = d.timezone;
    if (d.weekStartsOn !== undefined) data.weekStartsOn = d.weekStartsOn;
    if (d.dailyReminderTime !== undefined) {
      data.dailyReminderTime = d.dailyReminderTime;
    }

    const updated = await this.userRepository.updateSettings(userId, data);

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

    const users = await prisma.user.findMany({
      where: {
        isDeleted: false,
        OR: [
          { name: { contains: term, mode: 'insensitive' } },
          { displayName: { contains: term, mode: 'insensitive' } },
          { email: { contains: term, mode: 'insensitive' } },
        ],
      },
      take: safeLimit,
    });

    return users.map(toSafeUser);
  }

  /**
   * List active device sessions for a user
   */
  async getSessions(userId: string): Promise<DeviceSessionInfo[]> {
    const user = await this.userRepository.findById(userId);
    if (!user) {
      throw new Error('User not found');
    }

    const sessions = await prisma.deviceSession.findMany({
      where: { userId },
      orderBy: { lastActiveAt: 'desc' },
    });

    const now = Date.now();
    return sessions.map((s) => ({
      id: s.id,
      deviceName: s.deviceName,
      deviceType: s.deviceType,
      ipAddress: s.ipAddress,
      location: s.location,
      lastActiveAt: s.lastActiveAt,
      isCurrent: now - s.lastActiveAt.getTime() < 30 * 60 * 1000,
    }));
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

    const session = await prisma.deviceSession.findUnique({
        where: { id: sessionId },
      });
    if (!session || session.userId !== userId) {
      throw new Error('Session not found');
    }

    await prisma.deviceSession.delete({
      where: { id: sessionId },
    });

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

    const [habitCounts, goalCounts, streak, averageScore] = await Promise.all([
      this.habitRepository.countByStatus(userId),
      this.goalRepository.countByStatus(userId),
      this.streakRepository.findByUserId(userId),
      this.scoreRepository.getAverageScore(userId, daysAgo(90), daysAgo(0)),
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
