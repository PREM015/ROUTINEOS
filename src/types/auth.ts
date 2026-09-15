/**
 * Authentication & Authorization Types
 *
 * Defines all auth-related types for RoutineOS including
 * user roles, sessions, and authentication state.
 */

// ============================================================
// ENUMS
// ============================================================

export enum Role {
  USER = "USER",
  ADMIN = "ADMIN",
  MODERATOR = "MODERATOR",
}

export enum Theme {
  LIGHT = "LIGHT",
  DARK = "DARK",
  AUTO = "AUTO",
  CUSTOM = "CUSTOM",
}

// ============================================================
// USER PROFILE
// ============================================================

export interface UserProfile {
  id: string;
  name: string | null;
  email: string;
  displayName: string | null;
  avatarUrl: string | null;
  bio: string | null;
  timezone: string;
  preferredLanguage: string;
  role: Role;
  isActive: boolean;
  emailVerified: Date | null;
  onboardingCompletedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

// ============================================================
// USER SETTINGS
// ============================================================

export interface UserSettings {
  id: string;
  userId: string;

  // Localization
  timezone: string;
  language: string;
  dateFormat: string;
  timeFormat: "12h" | "24h";
  weekStartsOn: 0 | 1 | 2 | 3 | 4 | 5 | 6;

  // UI
  theme: Theme;
  customThemeColors: Record<string, string> | null;
  soundEnabled: boolean;
  animationsEnabled: boolean;
  compactMode: boolean;
  defaultView: string;
  showCompletedTasks: boolean;

  // Sleep
  targetBedtime: string | null;
  targetWakeTime: string | null;
  minSleepDuration: number | null;
  sleepReminder: boolean;
  sleepReminderTime: string | null;

  // Scoring Weights
  weightNonNeg: number;
  weightGrowth: number;
  weightBonus: number;

  // Notifications
  notificationsEnabled: boolean;
  emailNotifications: boolean;
  pushNotifications: boolean;
  smsNotifications: boolean;
  quietHoursStart: string | null;
  quietHoursEnd: string | null;

  // Reminders
  dailyReminder: boolean;
  dailyReminderTime: string | null;
  habitReminders: boolean;
  goalReminders: boolean;
  weeklyReviewReminder: boolean;
  monthlyResetReminder: boolean;
  focusReminders: boolean;
  breakReminders: boolean;

  // Data
  retroactiveEditDays: number;
  autoArchiveCompletedDays: number;
  dataRetentionDays: number;

  // Privacy
  profilePublic: boolean;
  shareStats: boolean;

  // Advanced
  aiInsightsEnabled: boolean;
  experimentalFeatures: boolean;

  createdAt: Date;
  updatedAt: Date;
}

// ============================================================
// USER SUBSCRIPTION
// ============================================================

export enum SubscriptionPlan {
  FREE = "FREE",
  PRO = "PRO",
  PREMIUM = "PREMIUM",
  ENTERPRISE = "ENTERPRISE",
}

export enum SubscriptionStatus {
  ACTIVE = "ACTIVE",
  PAST_DUE = "PAST_DUE",
  CANCELLED = "CANCELLED",
  UNPAID = "UNPAID",
}

export interface UserSubscription {
  id: string;
  userId: string;
  plan: SubscriptionPlan;
  status: SubscriptionStatus;
  currentPeriodStart: Date;
  currentPeriodEnd: Date;
  cancelAtPeriodEnd: boolean;
  stripeCustomerId: string | null;
  stripeSubscriptionId: string | null;
  createdAt: Date;
  updatedAt: Date;
}

// ============================================================
// SESSION & AUTH STATE
// ============================================================

export interface AuthSession {
  user: {
    id: string;
    name: string | null;
    email: string;
    image: string | null;
    role: Role;
  };
  expires: string;
}

export interface AuthUser {
  id: string;
  name: string | null;
  email: string;
  image: string | null;
  role: Role;
}

// ============================================================
// AUTH RESULTS
// ============================================================

export interface LoginResult {
  success: boolean;
  error?: string;
  redirectTo?: string;
}

export interface RegisterResult {
  success: boolean;
  userId?: string;
  error?: string;
}

// ============================================================
// PERMISSION TYPES
// ============================================================

export type Permission =
  | "habit:create"
  | "habit:read"
  | "habit:update"
  | "habit:delete"
  | "habit:archive"
  | "goal:create"
  | "goal:read"
  | "goal:update"
  | "goal:delete"
  | "routine:create"
  | "routine:read"
  | "routine:update"
  | "routine:delete"
  | "admin:users"
  | "admin:audit"
  | "admin:stats"
  | "admin:ai";

export const ROLE_PERMISSIONS: Record<Role, Permission[]> = {
  [Role.USER]: [
    "habit:create",
    "habit:read",
    "habit:update",
    "habit:delete",
    "habit:archive",
    "goal:create",
    "goal:read",
    "goal:update",
    "goal:delete",
    "routine:create",
    "routine:read",
    "routine:update",
    "routine:delete",
  ],
  [Role.MODERATOR]: [
    "habit:create",
    "habit:read",
    "habit:update",
    "habit:delete",
    "habit:archive",
    "goal:create",
    "goal:read",
    "goal:update",
    "goal:delete",
    "routine:create",
    "routine:read",
    "routine:update",
    "routine:delete",
    "admin:audit",
    "admin:stats",
  ],
  [Role.ADMIN]: [
    "habit:create",
    "habit:read",
    "habit:update",
    "habit:delete",
    "habit:archive",
    "goal:create",
    "goal:read",
    "goal:update",
    "goal:delete",
    "routine:create",
    "routine:read",
    "routine:update",
    "routine:delete",
    "admin:users",
    "admin:audit",
    "admin:stats",
    "admin:ai",
  ],
};
