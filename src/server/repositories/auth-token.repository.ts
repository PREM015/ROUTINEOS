import { createHash } from 'node:crypto';
import { BaseRepository } from './base.repository';
import type { UserId } from '@/types/ids';

/**
 * Auth Token Repository
 * Validate password-reset and email-verification tokens stored by hash.
 */

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export class AuthTokenRepository extends BaseRepository {
  /**
   * Check whether a raw password-reset token is valid (exists, not expired, not used).
   */
  async isResetTokenValid(token: string): Promise<boolean> {
    try {
      const row = await this.prisma.passwordResetToken.findUnique({
        where: { tokenHash: hashToken(token) },
      });
      if (!row) return false;
      return row.expiresAt > new Date() && row.usedAt === null;
    } catch (error) {
      this.handleError(error, 'isResetTokenValid');
    }
  }

  /**
   * Check whether a raw email-verification token is valid.
   */
  async isVerificationTokenValid(token: string): Promise<boolean> {
    try {
      const row = await this.prisma.emailVerificationToken.findUnique({
        where: { tokenHash: hashToken(token) },
      });
      if (!row) return false;
      return row.expiresAt > new Date() && row.usedAt === null;
    } catch (error) {
      this.handleError(error, 'isVerificationTokenValid');
    }
  }

  // ============================================================================
  // Password reset tokens
  // ============================================================================

  /**
   * Look up a password-reset token row by its raw (unhashed) value.
   * Returns null when absent; the caller decides whether it is still usable.
   */
  async findResetToken(token: string) {
    try {
      return await this.prisma.passwordResetToken.findUnique({
        where: { tokenHash: hashToken(token) },
      });
    } catch (error) {
      this.handleError(error, 'findResetToken');
    }
  }

  /**
   * Issue a password-reset token, storing only its hash.
   */
  async createResetToken(userId: UserId, token: string, expiresAt: Date) {
    try {
      return await this.prisma.passwordResetToken.create({
        data: { userId, tokenHash: hashToken(token), expiresAt },
      });
    } catch (error) {
      this.handleError(error, 'createResetToken');
    }
  }

  /**
   * Mark a one-time token as consumed.
   */
  async markResetTokenUsed(id: string): Promise<void> {
    try {
      await this.prisma.passwordResetToken.update({
        where: { id },
        data: { usedAt: new Date() },
      });
    } catch (error) {
      this.handleError(error, 'markResetTokenUsed');
    }
  }

  // ============================================================================
  // Email verification tokens
  // ============================================================================

  /**
   * Look up an email-verification token row by its raw (unhashed) value.
   */
  async findVerificationToken(token: string) {
    try {
      return await this.prisma.emailVerificationToken.findUnique({
        where: { tokenHash: hashToken(token) },
      });
    } catch (error) {
      this.handleError(error, 'findVerificationToken');
    }
  }

  /**
   * Issue an email-verification token, storing only its hash.
   */
  async createVerificationToken(userId: UserId, token: string, expiresAt: Date) {
    try {
      return await this.prisma.emailVerificationToken.create({
        data: { userId, tokenHash: hashToken(token), expiresAt },
      });
    } catch (error) {
      this.handleError(error, 'createVerificationToken');
    }
  }

  /**
   * Mark a verification token as consumed.
   */
  async markVerificationTokenUsed(id: string): Promise<void> {
    try {
      await this.prisma.emailVerificationToken.update({
        where: { id },
        data: { usedAt: new Date() },
      });
    } catch (error) {
      this.handleError(error, 'markVerificationTokenUsed');
    }
  }

  /**
   * Most recent unused verification token for a user, used for resend throttling.
   */
  async findLatestUnusedVerificationToken(userId: UserId) {
    try {
      return await this.prisma.emailVerificationToken.findFirst({
        where: { userId, usedAt: null },
        orderBy: { createdAt: 'desc' },
      });
    } catch (error) {
      this.handleError(error, 'findLatestUnusedVerificationToken');
    }
  }
}

export const authTokenRepository = new AuthTokenRepository();
