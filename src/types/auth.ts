import type { User, Role, DeviceType } from '@prisma/client';

/**
 * Authentication and Authorization Types
 * Comprehensive type definitions for auth system
 */

// ============================================================================
// Session Types
// ============================================================================

export interface SessionUser {
  id: string;
  email: string;
  name: string | null;
  role: Role;
  avatarUrl: string | null;
  timezone: string;
  emailVerified: Date | null;
  onboardingCompletedAt: Date | null;
}

export interface SessionData {
  user: SessionUser;
  expires: string;
  sessionToken?: string;
}

// ============================================================================
// Authentication Request/Response Types
// ============================================================================

export interface RegisterInput {
  name: string;
  email: string;
  password: string;
  timezone?: string;
}

export interface RegisterResponse {
  success: boolean;
  user?: {
    id: string;
    email: string;
    name: string;
  };
  message?: string;
  requiresEmailVerification?: boolean;
}

export interface LoginInput {
  email: string;
  password: string;
  remember?: boolean;
}

export interface LoginResponse {
  success: boolean;
  user?: SessionUser;
  requiresTwoFactor?: boolean;
  requiresEmailVerification?: boolean;
  message?: string;
}

export interface ForgotPasswordInput {
  email: string;
}

export interface ForgotPasswordResponse {
  success: boolean;
  message: string;
}

export interface ResetPasswordInput {
  token: string;
  password: string;
  confirmPassword: string;
}

export interface ResetPasswordResponse {
  success: boolean;
  message: string;
}

export interface ChangePasswordInput {
  currentPassword: string;
  newPassword: string;
  confirmPassword: string;
}

export interface ChangePasswordResponse {
  success: boolean;
  message: string;
}

// ============================================================================
// Two-Factor Authentication
// ============================================================================

export interface TwoFactorSetupResponse {
  success: boolean;
  secret?: string;
  qrCode?: string;
  backupCodes?: string[];
}

export interface TwoFactorVerifyInput {
  code: string;
  trustDevice?: boolean;
}

export interface TwoFactorVerifyResponse {
  success: boolean;
  message: string;
}

// ============================================================================
// Email Verification
// ============================================================================

export interface EmailVerificationInput {
  token: string;
}

export interface EmailVerificationResponse {
  success: boolean;
  message: string;
}

export interface ResendVerificationInput {
  email: string;
}

export interface ResendVerificationResponse {
  success: boolean;
  message: string;
}

// ============================================================================
// User Profile Types
// ============================================================================

export interface UserProfile extends Omit<User, 'passwordHash'> {
  stats?: UserStats;
  subscription?: UserSubscriptionInfo;
}

export interface UserStats {
  totalHabits: number;
  activeHabits: number;
  totalGoals: number;
  completedGoals: number;
  currentStreak: number;
  longestStreak: number;
  totalDays: number;
  averageScore: number;
}

export interface UserSubscriptionInfo {
  plan: string;
  status: string;
  currentPeriodEnd: Date;
  cancelAtPeriodEnd: boolean;
}

export interface UpdateProfileInput {
  name?: string;
  displayName?: string;
  bio?: string;
  avatarUrl?: string;
  timezone?: string;
  preferredLanguage?: string;
}

export interface UpdateProfileResponse {
  success: boolean;
  user?: UserProfile;
  message?: string;
}

// ============================================================================
// Session Management
// ============================================================================

export interface DeviceSessionInfo {
  id: string;
  deviceName: string | null;
  deviceType: DeviceType | null;
  ipAddress: string | null;
  location: string | null;
  lastActiveAt: Date;
  isCurrent: boolean;
}

export interface ActiveSessionsResponse {
  sessions: DeviceSessionInfo[];
}

export interface RevokeSessionInput {
  sessionId: string;
}

export interface RevokeSessionResponse {
  success: boolean;
  message: string;
}

// ============================================================================
// Authorization & Permissions
// ============================================================================

export interface Permission {
  resource: string;
  action: 'create' | 'read' | 'update' | 'delete' | 'manage';
}

export interface PermissionCheck {
  userId: string;
  resourceType: string;
  resourceId?: string;
  action: string;
}

export interface PermissionResult {
  allowed: boolean;
  reason?: string;
}

// ============================================================================
// OAuth Provider Types
// ============================================================================

export interface OAuthProvider {
  id: string;
  name: string;
  enabled: boolean;
}

export interface OAuthAccount {
  provider: string;
  providerAccountId: string;
  email: string;
  connectedAt: Date;
}

// ============================================================================
// Account Security
// ============================================================================

export interface AccountSecurityInfo {
  emailVerified: boolean;
  twoFactorEnabled: boolean;
  passwordLastChanged: Date | null;
  failedLoginAttempts: number;
  isLocked: boolean;
  lockedUntil: Date | null;
  activeSessions: number;
}

export interface AccountDeletionInput {
  password: string;
  reason?: string;
  confirmation: boolean;
}

export interface AccountDeletionResponse {
  success: boolean;
  message: string;
  scheduledFor?: Date;
}

// ============================================================================
// Authentication Errors
// ============================================================================

export enum AuthErrorCode {
  INVALID_CREDENTIALS = 'INVALID_CREDENTIALS',
  EMAIL_NOT_VERIFIED = 'EMAIL_NOT_VERIFIED',
  ACCOUNT_LOCKED = 'ACCOUNT_LOCKED',
  ACCOUNT_DISABLED = 'ACCOUNT_DISABLED',
  ACCOUNT_DELETED = 'ACCOUNT_DELETED',
  TWO_FACTOR_REQUIRED = 'TWO_FACTOR_REQUIRED',
  INVALID_TWO_FACTOR_CODE = 'INVALID_TWO_FACTOR_CODE',
  INVALID_TOKEN = 'INVALID_TOKEN',
  EXPIRED_TOKEN = 'EXPIRED_TOKEN',
  TOKEN_ALREADY_USED = 'TOKEN_ALREADY_USED',
  USER_NOT_FOUND = 'USER_NOT_FOUND',
  USER_ALREADY_EXISTS = 'USER_ALREADY_EXISTS',
  WEAK_PASSWORD = 'WEAK_PASSWORD',
  RATE_LIMIT_EXCEEDED = 'RATE_LIMIT_EXCEEDED',
  SESSION_EXPIRED = 'SESSION_EXPIRED',
  INVALID_SESSION = 'INVALID_SESSION',
  UNAUTHORIZED = 'UNAUTHORIZED',
  FORBIDDEN = 'FORBIDDEN',
}

export interface AuthError {
  code: AuthErrorCode;
  message: string;
  details?: Record<string, unknown>;
}

// ============================================================================
// Type Guards
// ============================================================================

export function isSessionUser(user: unknown): user is SessionUser {
  return (
    typeof user === 'object' &&
    user !== null &&
    'id' in user &&
    'email' in user &&
    'role' in user
  );
}

export function isAuthError(error: unknown): error is AuthError {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    'message' in error &&
    Object.values(AuthErrorCode).includes((error as AuthError).code)
  );
}

// ============================================================================
// Utility Types
// ============================================================================

export type AuthenticatedHandler<T = void> = (
  userId: string,
  session: SessionData
) => Promise<T>;

export type PublicHandler<T = void> = () => Promise<T>;

export type OptionalAuthHandler<T = void> = (
  userId: string | null,
  session: SessionData | null
) => Promise<T>;