import type { User, UserSettings, Prisma } from '@prisma/client';
import { BaseRepository } from './base.repository';

/**
 * User Repository
 * Database operations for User model
 */

export class UserRepository extends BaseRepository {
  /**
   * Find user by ID
   */
  async findById(userId: string): Promise<User | null> {
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
    userId: string
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
  async update(userId: string, data: Prisma.UserUpdateInput): Promise<User> {
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
  async updatePassword(userId: string, passwordHash: string): Promise<User> {
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
  async updateLastLogin(userId: string): Promise<void> {
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
  async incrementFailedLogin(userId: string): Promise<number> {
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
  async verifyEmail(userId: string): Promise<User> {
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
  async completeOnboarding(userId: string): Promise<User> {
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
  async softDelete(userId: string, reason?: string): Promise<User> {
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
  async getSettings(userId: string): Promise<UserSettings | null> {
    try {
      return await this.prisma.userSettings.findUnique({
        where: { userId },
      });
    } catch (error) {
      this.handleError(error, 'getSettings');
    }
  }

  /**
   * Create user settings
   */
  async createSettings(
    userId: string,
    data?: Partial<Prisma.UserSettingsCreateInput>
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
    userId: string,
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
  async updateLastActivity(userId: string): Promise<void> {
    try {
      await this.prisma.user.update({
        where: { id: userId },
        data: { lastActivityAt: new Date() },
      });
    } catch (error) {
      // Don't throw on activity update failure
      console.error('Failed to update last activity:', error);
    }
  }
}