import { AuditAction } from '@/generated/prisma/client';

// Map of common audit events with descriptions
export const AUDIT_EVENTS: Record<AuditAction, string> = {
  // Habits
  HABIT_CREATED: 'Habit created',
  HABIT_UPDATED: 'Habit updated',
  HABIT_ARCHIVED: 'Habit archived',
  HABIT_DELETED: 'Habit deleted',
  HABIT_PAUSED: 'Habit paused',
  HABIT_RESUMED: 'Habit resumed',
  
  // Goals
  GOAL_CREATED: 'Goal created',
  GOAL_UPDATED: 'Goal updated',
  GOAL_DELETED: 'Goal deleted',
  GOAL_COMPLETED: 'Goal completed',
  
  // Routine
  ROUTINE_CREATED: 'Routine created',
  ROUTINE_CHANGED: 'Routine changed',
  ROUTINE_DELETED: 'Routine deleted',
  
  // Settings & System
  SCORING_SETTINGS_CHANGED: 'Scoring settings changed',
  MINIMUM_DAY_ACTIVATED: 'Minimum day activated',
  REST_DAY_ACTIVATED: 'Rest day activated',
  SETTINGS_UPDATED: 'Settings updated',
  
  // Data
  DATA_EXPORTED: 'Data exported',
  DATA_IMPORTED: 'Data imported',
  DATA_RESET: 'Data reset',
  
  // Auth & Security
  LOGIN_FAILED: 'Login failed',
  LOGIN_SUCCESS: 'Login successful',
  ACCOUNT_LOCKED: 'Account locked',
  PASSWORD_RESET_REQUESTED: 'Password reset requested',
  PASSWORD_RESET_COMPLETED: 'Password reset completed',
  LOGOUT_ALL_SESSIONS: 'All sessions logged out',
  EMAIL_VERIFIED: 'Email verified',
  ACCOUNT_DELETED: 'Account deleted',
};