import { createHash } from 'node:crypto';
import { BaseRepository } from './base.repository';

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
}

export const authTokenRepository = new AuthTokenRepository();
