import bcrypt from 'bcryptjs';
import {
  createHmac,
  randomBytes,
  timingSafeEqual,
} from 'node:crypto';
import { z } from 'zod';
import type { Role, User } from '@/generated/prisma';
import type { Session } from 'next-auth';
import { auth } from '@/lib/auth';
import { UserRepository } from '@/server/repositories/user.repository';
import { AuthTokenRepository } from '@/server/repositories/auth-token.repository';
import { AuditRepository } from '@/server/repositories/audit.repository';
import { StreakRepository } from '@/server/repositories/streak.repository';
import { RoutineRepository } from '@/server/repositories/routine.repository';
import { EmailService } from '@/server/services/email.service';
import {
  changePasswordSchema,
  forgotPasswordSchema,
  loginSchema,
  registerSchema,
  resendVerificationSchema,
  resetPasswordSchema,
  verifyEmailSchema,
} from '@/lib/validation/auth';

/**
 * Auth Service
 * Business logic for registration, login, verification and account security
 */

export interface SafeUser {
  id: string;
  email: string;
  name: string | null;
  role: Role;
  avatarUrl: string | null;
  timezone: string;
  emailVerified: Date | null;
  onboardingCompletedAt: Date | null;
  twoFactorEnabled: boolean;
}

export interface RegisterInput {
  email: string;
  password: string;
  name?: string;
  username?: string;
  timezone?: string;
}

interface TwoFactorState {
  enabled: boolean;
  secret: string | null;
  verifiedAt: string | null;
}

const VERIFICATION_TOKEN_TTL_MS = 24 * 60 * 60 * 1000;
const RESET_TOKEN_TTL_MS = 60 * 60 * 1000;
const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

/**
 * Extract first zod issue message, if any
 */
function firstZodIssue(error: z.ZodError): string {
  return error.errors[0]?.message ?? 'Validation failed';
}

/**
 * Parse the preferences JSON without throwing
 */
function parsePreferences(raw: string | null): Record<string, unknown> {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
    return {};
  } catch {
    return {};
  }
}

/**
 * Read stored 2FA state for a user (persisted in preferences JSON)
 */
function readTwoFactorState(user: User): TwoFactorState {
  const prefs = parsePreferences(user.preferences);
  const authPrefs =
    typeof prefs.auth === 'object' && prefs.auth !== null
      ? (prefs.auth as Record<string, unknown>)
      : {};
  const twoFactor =
    typeof authPrefs.twoFactor === 'object' && authPrefs.twoFactor !== null
      ? (authPrefs.twoFactor as Record<string, unknown>)
      : {};
  return {
    enabled: twoFactor.enabled === true,
    secret: typeof twoFactor.secret === 'string' ? twoFactor.secret : null,
    verifiedAt:
      typeof twoFactor.verifiedAt === 'string' ? twoFactor.verifiedAt : null,
  };
}

/**
 * Persist updated 2FA state into the preferences JSON
 */
function writeTwoFactorState(
  user: User,
  state: TwoFactorState
): string {
  const prefs = parsePreferences(user.preferences);
  const authPrefs =
    typeof prefs.auth === 'object' && prefs.auth !== null
      ? (prefs.auth as Record<string, unknown>)
      : {};
  return JSON.stringify({
    ...prefs,
    auth: {
      ...authPrefs,
      twoFactor: state,
    },
  });
}

/**
 * Project a user row into the safe (password-free) shape
 */
function toSafeUser(user: User): SafeUser {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    avatarUrl: user.avatarUrl,
    timezone: user.timezone,
    emailVerified: user.emailVerified,
    onboardingCompletedAt: user.onboardingCompletedAt,
    twoFactorEnabled: readTwoFactorState(user).enabled,
  };
}

function encodeBase32(input: Uint8Array): string {
  let bits = 0;
  let value = 0;
  let output = '';
  for (const byte of Buffer.from(input)) {
    value = ((value << 8) | byte) & 0xffffffff;
    bits += 8;
    while (bits >= 5) {
      output += BASE32_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) {
    output += BASE32_ALPHABET[(value << (5 - bits)) & 31];
  }
  return output;
}

function decodeBase32(input: string): Buffer {
  const clean = input.replace(/=+$/, '').toUpperCase();
  const bytes: number[] = [];
  let bits = 0;
  let value = 0;
  for (const char of clean) {
    const index = BASE32_ALPHABET.indexOf(char);
    if (index === -1) throw new Error('Invalid base32 secret');
    value = ((value << 5) | index) & 0xffffffff;
    bits += 5;
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return Buffer.from(bytes);
}

/**
 * Generate a 6-digit TOTP code for a secret at a time window
 */
function generateTotpCode(
  secret: string,
  timestamp: number = Date.now(),
  windowDrift: number = 0
): string {
  const key = decodeBase32(secret);
  const counter = Math.floor(timestamp / 30000) + windowDrift;
  const counterBuffer = Buffer.alloc(8);
  counterBuffer.writeBigUInt64BE(BigInt(counter));
  const digest = createHmac('sha1', key).update(counterBuffer).digest();
  const offset = (digest[digest.length - 1] ?? 0) & 0x0f;
  const binary =
    ((digest[offset] ?? 0) & 0x7f) * 0x01000000 +
    ((digest[offset + 1] ?? 0) & 0xff) * 0x010000 +
    ((digest[offset + 2] ?? 0) & 0xff) * 0x0100 +
    ((digest[offset + 3] ?? 0) & 0xff);
  return String(binary % 1000000).padStart(6, '0');
}

/**
 * Verify a TOTP code against the current and adjacent time windows
 */
function verifyTotpCode(secret: string, code: string): boolean {
  if (!/^\d{6}$/.test(code)) return false;
  const now = Date.now();
  const expected = Buffer.from(code, 'utf8');
  for (const drift of [-1, 0, 1]) {
    const candidate = Buffer.from(generateTotpCode(secret, now, drift), 'utf8');
    if (
      candidate.length === expected.length &&
      timingSafeEqual(candidate, expected)
    ) {
      return true;
    }
  }
  return false;
}

/**
 * Build the otpauth:// provisioning URI for authenticator apps
 */
function buildOtpauthUrl(secret: string, email: string): string {
  const issuer = 'RoutineOS';
  const account = encodeURIComponent(`${issuer}:${email}`);
  const params = new URLSearchParams({
    secret,
    issuer,
    algorithm: 'SHA1',
    digits: '6',
    period: '30',
  });
  return `otpauth://totp/${account}?${params.toString()}`;
}

export class AuthService {
  private userRepository: UserRepository;
  private authTokenRepository: AuthTokenRepository;
  private auditRepository: AuditRepository;
  private streakRepository: StreakRepository;
  private routineRepository: RoutineRepository;
  private emailService: EmailService;

  constructor() {
    this.userRepository = new UserRepository();
    this.authTokenRepository = new AuthTokenRepository();
    this.auditRepository = new AuditRepository();
    this.streakRepository = new StreakRepository();
    this.routineRepository = new RoutineRepository();
    this.emailService = new EmailService();
  }

  /**
   * Register a new user: create the user, settings, verification token
   * and send the verification email
   */
  async registerUser(input: RegisterInput): Promise<SafeUser> {
    const emailCheck = registerSchema.shape.email.safeParse(input.email);
    if (!emailCheck.success) {
      throw new Error(firstZodIssue(emailCheck.error));
    }
    const passwordCheck = registerSchema.shape.password.safeParse(
      input.password
    );
    if (!passwordCheck.success) {
      throw new Error(firstZodIssue(passwordCheck.error));
    }
    if (input.name !== undefined) {
      const nameCheck = registerSchema.shape.name.safeParse(input.name);
      if (!nameCheck.success) {
        throw new Error(firstZodIssue(nameCheck.error));
      }
    }

    if (await this.userRepository.emailExists(input.email)) {
      throw new Error('Email is already registered');
    }

    const passwordHash = await bcrypt.hash(input.password, 10);
    const user = await this.userRepository.create({
      email: input.email,
      passwordHash,
      name:
        input.name && input.name.trim().length > 0
          ? input.name.trim()
          : null,
      timezone: input.timezone || undefined,
    });

  await this.userRepository.createSettings(user.id, {
    timezone: input.timezone || undefined,
  });

  // Seed the user's default day types.
  //
  // These were only ever created by `scripts/seed-day-types.ts`, a manual
  // one-off over accounts that already existed. A newly registered user had no
  // `DayTypeDefinition` rows at all, so `/today` and `/routine` both fell back to
  // *different* hardcoded lists and the two screens disagreed about which day
  // types exist. Best-effort: a failure here must not block sign-up, the user
  // can still create day types by hand.
  try {
    await this.routineRepository.createDefaultDayTypes(user.id);
  } catch (err) {
    console.error(
      '[auth.register] failed to seed default day types; user can create them manually:',
      err
    );
  }


    try {
      await this.streakRepository.create(user.id);
    } catch {
      // Streak initialization is best-effort; do not fail registration
    }

    const token = await this.createEmailVerificationToken(user.id);
    await this.emailService.sendVerificationEmail(user.email, token);

    return toSafeUser(user);
  }

  /**
   * Sign in with email/password
   */
  async login(
    email: string,
    password: string
  ): Promise<{ user: SafeUser } | null> {
    return this.verifyCredentials(email, password);
  }

  /**
   * Verify email/password credentials and return a safe user on success
   */
  async verifyCredentials(
    email: string,
    password: string
  ): Promise<{ user: SafeUser } | null> {
    const parsed = loginSchema.safeParse({ email, password });
    if (!parsed.success) {
      throw new Error('Invalid credentials');
    }

    const user = await this.userRepository.findByEmail(parsed.data.email);
    if (!user) {
      return null;
    }
    if (user.isDeleted) {
      throw new Error('Account has been deleted');
    }
    if (user.lockedUntil && user.lockedUntil > new Date()) {
      throw new Error('Account is locked. Try again later.');
    }

    const passwordMatch = await bcrypt.compare(
      parsed.data.password,
      user.passwordHash ?? ''
    );
    if (!passwordMatch) {
      await this.userRepository.incrementFailedLogin(user.id);
      return null;
    }
    if (!user.emailVerified) {
      throw new Error('Please verify your email first');
    }

    await this.userRepository.updateLastLogin(user.id);
    await this.auditRepository.create({
      userId: user.id,
      action: 'LOGIN_SUCCESS',
    });

    return { user: toSafeUser(user) };
  }

  /**
   * Get the current session user, or null when unauthenticated
   */
  async getSessionUser(): Promise<Session['user'] | null> {
    const session = await auth();
    return session?.user ?? null;
  }

  /**
   * Get the full current user row plus settings (no passwordHash)
   */
  async getCurrentUser(userId: string) {
    const user = await this.userRepository.findWithSettings(userId);
    if (!user) {
      throw new Error('User not found');
    }
    const { passwordHash: _passwordHash, ...safeUser } = user;
    return {
      ...safeUser,
      twoFactorEnabled: readTwoFactorState(user).enabled,
    };
  }

  /**
   * Change the password after verifying the current one and
   * invalidate all existing device sessions
   */
  async changePassword(
    userId: string,
    currentPassword: string,
    newPassword: string
  ): Promise<void> {
    const user = await this.userRepository.findById(userId);
    if (!user) {
      throw new Error('User not found');
    }

    const parsed = changePasswordSchema.safeParse({
      currentPassword,
      newPassword,
      confirmPassword: newPassword,
    });
    if (!parsed.success) {
      throw new Error(firstZodIssue(parsed.error));
    }

    const passwordMatch = await bcrypt.compare(
      parsed.data.currentPassword,
      user.passwordHash ?? ''
    );
    if (!passwordMatch) {
      throw new Error('Current password is incorrect');
    }

    const passwordHash = await bcrypt.hash(parsed.data.newPassword, 10);
    await this.userRepository.updatePassword(userId, passwordHash);
    // Deleting the DeviceSession rows is not enough on its own: NextAuth issues
    // stateless JWTs, so other devices keep their cookie until the 6-hour
    // absolute expiry. Bumping `sessionVersion` invalidates every issued token
    // immediately (see the check in `lib/auth.ts`).
    await this.userRepository.deleteAllDeviceSessions(userId);
    await this.userRepository.bumpSessionVersion(userId);

    await this.auditRepository.create({
      userId,
      action: 'PASSWORD_RESET_COMPLETED',
      entityType: 'USER',
      entityId: userId,
      metadata: { method: 'change-password' },
    });
  }

  /**
   * Reset the password using a one-time reset token
   */
  async resetPassword(
    resetToken: string,
    newPassword: string
  ): Promise<void> {
    const parsed = resetPasswordSchema.safeParse({
      token: resetToken,
      password: newPassword,
      confirmPassword: newPassword,
    });
    if (!parsed.success) {
      throw new Error(firstZodIssue(parsed.error));
    }

    const tokenRow = await this.authTokenRepository.findResetToken(
      parsed.data.token
    );
    if (
      !tokenRow ||
      tokenRow.expiresAt <= new Date() ||
      tokenRow.usedAt
    ) {
      throw new Error('Invalid or expired reset token');
    }

    const passwordHash = await bcrypt.hash(parsed.data.password, 10);
    await this.userRepository.updatePassword(tokenRow.userId, passwordHash);
    await this.authTokenRepository.markResetTokenUsed(tokenRow.id);

    await this.auditRepository.create({
      userId: tokenRow.userId,
      action: 'PASSWORD_RESET_COMPLETED',
      entityType: 'USER',
      entityId: tokenRow.userId,
      metadata: { method: 'reset-token' },
    });
  }

  /**
   * Request a password reset email. Does not reveal whether
   * the email address is registered.
   */
  async forgotPassword(
    email: string
  ): Promise<{ success: boolean; message: string }> {
    const parsed = forgotPasswordSchema.safeParse({ email });
    if (!parsed.success) {
      throw new Error(firstZodIssue(parsed.error));
    }

    const user = await this.userRepository.findByEmail(parsed.data.email);
    if (!user || user.isDeleted) {
      return {
        success: true,
        message:
          'If an account exists for that email, a password reset link has been sent.',
      };
    }

    const token = randomBytes(32).toString('hex');
    await this.authTokenRepository.createResetToken(
      user.id,
      token,
      new Date(Date.now() + RESET_TOKEN_TTL_MS)
    );
    await this.auditRepository.create({
      userId: user.id,
      action: 'PASSWORD_RESET_REQUESTED',
    });
    await this.emailService.sendPasswordReset(user.email, token);

    return {
      success: true,
      message:
        'If an account exists for that email, a password reset link has been sent.',
    };
  }

  /**
   * Verify an email using its one-time token
   */
  async verifyEmail(
    token: string
  ): Promise<{ success: boolean; message: string }> {
    const parsed = verifyEmailSchema.safeParse({ token });
    if (!parsed.success) {
      throw new Error(firstZodIssue(parsed.error));
    }

    const tokenRow = await this.authTokenRepository.findVerificationToken(
      parsed.data.token
    );
    if (
      !tokenRow ||
      tokenRow.expiresAt <= new Date() ||
      tokenRow.usedAt
    ) {
      throw new Error('Invalid or expired verification token');
    }

    await this.userRepository.verifyEmail(tokenRow.userId);
    await this.authTokenRepository.markVerificationTokenUsed(tokenRow.id);
    await this.auditRepository.create({
      userId: tokenRow.userId,
      action: 'EMAIL_VERIFIED',
    });

    return { success: true, message: 'Email verified successfully' };
  }

  /**
   * Resend the verification email, throttled to one per minute
   */
  async resendVerification(
    email: string
  ): Promise<{ success: boolean; message: string }> {
    const parsed = resendVerificationSchema.safeParse({ email });
    if (!parsed.success) {
      throw new Error(firstZodIssue(parsed.error));
    }

    const user = await this.userRepository.findByEmail(parsed.data.email);
    if (!user || user.isDeleted) {
      return {
        success: true,
        message:
          'If an account exists for that email, a verification link has been sent.',
      };
    }
    if (user.emailVerified) {
      throw new Error('Email is already verified');
    }

    const previous =
      await this.authTokenRepository.findLatestUnusedVerificationToken(user.id);
    if (previous && previous.createdAt.getTime() > Date.now() - 60_000) {
      throw new Error(
        'Please wait a moment before requesting another verification email'
      );
    }

    const token = await this.createEmailVerificationToken(user.id);
    await this.emailService.sendVerificationEmail(user.email, token);

    return { success: true, message: 'Verification email sent' };
  }

  /**
   * Generate a fresh verification token and issue a TOTP provisioning URI
   */
  async setupTwoFactor(
    userId: string,
    secret?: string
  ): Promise<{ otpauthUrl: string; secret: string }> {
    const user = await this.userRepository.findById(userId);
    if (!user) {
      throw new Error('User not found');
    }

    const current = readTwoFactorState(user);
    if (current.enabled && current.secret) {
      return {
        otpauthUrl: buildOtpauthUrl(current.secret, user.email),
        secret: current.secret,
      };
    }

    const twoFactorSecret =
      secret && secret.length > 0 ? secret : encodeBase32(randomBytes(20));
    const otpauthUrl = buildOtpauthUrl(twoFactorSecret, user.email);

    await this.userRepository.update(userId, {
      preferences: writeTwoFactorState(user, {
        enabled: false,
        secret: twoFactorSecret,
        verifiedAt: null,
      }),
    });

    return { otpauthUrl, secret: twoFactorSecret };
  }

  /**
   * Verify a TOTP code and enable two-factor authentication
   */
  async verifyTwoFactor(
    userId: string,
    code: string
  ): Promise<{ success: boolean; message: string }> {
    const user = await this.userRepository.findById(userId);
    if (!user) {
      throw new Error('User not found');
    }

    const state = readTwoFactorState(user);
    if (!state.secret) {
      throw new Error('Two-factor authentication is not available');
    }
    if (!verifyTotpCode(state.secret, code)) {
      throw new Error('Invalid two-factor code');
    }

    await this.userRepository.update(userId, {
      preferences: writeTwoFactorState(user, {
        enabled: true,
        secret: state.secret,
        verifiedAt: new Date().toISOString(),
      }),
    });

    return { success: true, message: 'Two-factor authentication enabled' };
  }

  /**
   * Disable two-factor authentication.
   *
   * Requires a valid TOTP code from the user's authenticator. This previously
   * took only `userId`: the route validated the submitted code and then threw
   * it away, so any six digits turned 2FA off.
   */
  async disableTwoFactor(
    userId: string,
    code: string
  ): Promise<{ success: boolean; message: string }> {
    const user = await this.userRepository.findById(userId);
    if (!user) {
      throw new Error('User not found');
    }

    const state = readTwoFactorState(user);
    if (!state.secret || !state.enabled) {
      throw new Error('Two-factor authentication is not enabled');
    }
    if (!verifyTotpCode(state.secret, code)) {
      throw new Error('Invalid two-factor code');
    }

    await this.userRepository.update(userId, {
      preferences: writeTwoFactorState(user, {
        enabled: false,
        secret: null,
        verifiedAt: null,
      }),
    });

    await this.auditRepository.create({
      userId,
      action: 'TWO_FACTOR_DISABLED',
      entityType: 'USER',
      entityId: userId,
    });

    return { success: true, message: 'Two-factor authentication disabled' };
  }

  /**
   * Soft-delete the account and revoke all sessions
   */
  async deleteAccount(
    userId: string,
    reason?: string
  ): Promise<{ success: boolean }> {
    const user = await this.userRepository.findById(userId);
    if (!user) {
      throw new Error('User not found');
    }

    await this.userRepository.softDelete(userId, reason);
    await this.userRepository.deleteAllDeviceSessions(userId);
    // Kill any JWT still in circulation for the deleted account.
    await this.userRepository.bumpSessionVersion(userId);
    await this.auditRepository.create({
      userId,
      action: 'ACCOUNT_DELETED',
      entityType: 'USER',
      entityId: userId,
      metadata: reason ? { reason } : undefined,
    });

    return { success: true };
  }

  /**
   * Revoke every device session for the user.
   *
   * Also bumps `sessionVersion` so the stateless JWTs other devices are still
   * holding are rejected on their next request. Without it, "sign out all" only
   * cleared the database rows and left the sessions themselves alive.
   */
  async logoutAll(
    userId: string
  ): Promise<{ success: boolean; revoked: number }> {
    const revoked = await this.userRepository.deleteAllDeviceSessions(userId);
    await this.userRepository.bumpSessionVersion(userId);
    await this.auditRepository.create({
      userId,
      action: 'LOGOUT_ALL_SESSIONS',
    });

    return { success: true, revoked };
  }

  private async createEmailVerificationToken(userId: string): Promise<string> {
    const token = randomBytes(32).toString('hex');
    await this.authTokenRepository.createVerificationToken(
      userId,
      token,
      new Date(Date.now() + VERIFICATION_TOKEN_TTL_MS)
    );
    return token;
  }
}

export const authService = new AuthService();
