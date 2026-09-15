/**
 * App Configuration
 *
 * Central place for all application-level configuration constants.
 * Environment-specific values are read from process.env at runtime.
 */

// ============================================================
// APP METADATA
// ============================================================

export const APP_CONFIG = {
  name: "RoutineOS",
  tagline: "Your personal productivity operating system",
  description:
    "Build habits, track goals, and optimize your daily routine with data-driven insights.",
  version: process.env.NEXT_PUBLIC_APP_VERSION ?? "0.1.0",
  url: process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000",

  // Support
  supportEmail: "support@routineos.app",
  docsUrl: "https://docs.routineos.app",

  // Social
  twitterHandle: "@RoutineOS",
} as const;

// ============================================================
// FEATURE FLAGS
// ============================================================

export const FEATURES = {
  /** Enable AI-powered insights generation */
  aiInsights: process.env.NEXT_PUBLIC_AI_ENABLED === "true",
  /** Enable push notifications */
  pushNotifications: process.env.NEXT_PUBLIC_PUSH_ENABLED === "true",
  /** Enable social/challenge features */
  social: process.env.NEXT_PUBLIC_SOCIAL_ENABLED === "true",
  /** Enable Stripe billing */
  billing: process.env.NEXT_PUBLIC_BILLING_ENABLED === "true",
  /** Enable offline/PWA mode */
  offline: process.env.NEXT_PUBLIC_OFFLINE_ENABLED === "true",
  /** Enable experimental features for opted-in users */
  experimental: process.env.NEXT_PUBLIC_EXPERIMENTAL === "true",
} as const;

// ============================================================
// PAGINATION DEFAULTS
// ============================================================

export const PAGINATION = {
  defaultPageSize: 20,
  maxPageSize: 100,
  habitsPerPage: 30,
  goalsPerPage: 20,
  logsPerPage: 50,
  analyticsMaxDays: 365,
} as const;

// ============================================================
// DATE & TIME
// ============================================================

export const DATE_CONFIG = {
  /** Default timezone when user hasn't set one */
  defaultTimezone: "UTC",
  /** ISO date format */
  dateFormat: "yyyy-MM-dd",
  /** Time format (24h) */
  timeFormat: "HH:mm",
  /** Display date format */
  displayDateFormat: "MMM d, yyyy",
  /** Display time format */
  displayTimeFormat: "h:mm a",
  /** Days in a week */
  daysInWeek: 7,
} as const;

// ============================================================
// HABIT LIMITS
// ============================================================

export const HABIT_LIMITS = {
  /** Max habits per user (free tier) */
  maxHabitsFreeTier: 10,
  /** Max habits per user (pro tier) */
  maxHabitsPro: 50,
  /** Max habits per user (premium tier) */
  maxHabitsPremium: 200,
  /** Max name length */
  maxNameLength: 100,
  /** Max description length */
  maxDescriptionLength: 500,
  /** Max notes length */
  maxNotesLength: 1000,
  /** Max days to allow retroactive edits */
  defaultRetroactiveDays: 3,
} as const;

// ============================================================
// GOAL LIMITS
// ============================================================

export const GOAL_LIMITS = {
  /** Max active goals per period per user (free tier) */
  maxActiveGoalsFreeTier: 5,
  /** Max active goals (pro) */
  maxActiveGoalsPro: 25,
  /** Max carry-over count before auto-cancellation warning */
  maxCarryOverCount: 3,
  /** Max title length */
  maxTitleLength: 150,
  /** Max description length */
  maxDescriptionLength: 1000,
} as const;

// ============================================================
// ROUTINE LIMITS
// ============================================================

export const ROUTINE_LIMITS = {
  /** Max routine templates per user (free tier) */
  maxTemplatesFreeTier: 3,
  /** Max routine templates (pro) */
  maxTemplatesPro: 15,
  /** Max blocks per template */
  maxBlocksPerTemplate: 30,
  /** Minimum block duration in minutes */
  minBlockDurationMinutes: 5,
  /** Maximum block duration in minutes */
  maxBlockDurationMinutes: 480, // 8 hours
} as const;

// ============================================================
// RATE LIMITS (requests per window)
// ============================================================

export const RATE_LIMITS = {
  /** Default API rate limit window in seconds */
  windowSeconds: 60,
  /** Default max requests per window */
  maxRequests: 60,
  /** Auth endpoints */
  authMaxRequests: 10,
  /** AI generation endpoint (expensive) */
  aiMaxRequests: 5,
  /** Webhook endpoint */
  webhookMaxRequests: 100,
} as const;

// ============================================================
// SECURITY
// ============================================================

export const SECURITY_CONFIG = {
  /** Max failed login attempts before account lockout */
  maxFailedLogins: 5,
  /** Account lockout duration in minutes */
  lockoutDurationMinutes: 30,
  /** Password reset token expiry in hours */
  passwordResetExpiryHours: 1,
  /** Email verification token expiry in hours */
  emailVerificationExpiryHours: 24,
  /** Session max age in seconds (30 days) */
  sessionMaxAge: 30 * 24 * 60 * 60,
  /** Bcrypt salt rounds */
  bcryptSaltRounds: 12,
} as const;

// ============================================================
// UI DEFAULTS
// ============================================================

export const UI_CONFIG = {
  /** Default theme */
  defaultTheme: "LIGHT" as const,
  /** Default animation duration in ms */
  animationDuration: 200,
  /** Toast notification duration in ms */
  toastDuration: 4000,
  /** Debounce delay for search inputs in ms */
  searchDebounce: 300,
  /** Auto-save interval in ms */
  autoSaveInterval: 2000,
} as const;
