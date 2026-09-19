import type { GoalStatus, GoalPriority, GoalType } from '@prisma/client';

/**
 * Goal Status and Priority Constants
 * Configuration for goal states and classifications
 */

// ============================================================================
// Goal Status Configuration
// ============================================================================

export interface GoalStatusConfig {
  status: GoalStatus;
  label: string;
  description: string;
  color: string;
  icon: string;
  isFinal: boolean; // Cannot change after reaching this status
}

export const GOAL_STATUS_CONFIG: Record<GoalStatus, GoalStatusConfig> = {
  ACTIVE: {
    status: 'ACTIVE',
    label: 'Active',
    description: 'Currently working on this goal',
    color: '#3b82f6',
    icon: '🎯',
    isFinal: false,
  },
  COMPLETED: {
    status: 'COMPLETED',
    label: 'Completed',
    description: 'Goal successfully achieved',
    color: '#22c55e',
    icon: '✅',
    isFinal: true,
  },
  MISSED: {
    status: 'MISSED',
    label: 'Missed',
    description: 'Deadline passed without completion',
    color: '#ef4444',
    icon: '❌',
    isFinal: true,
  },
  CARRIED_OVER: {
    status: 'CARRIED_OVER',
    label: 'Carried Over',
    description: 'Extended to next period',
    color: '#f59e0b',
    icon: '➡️',
    isFinal: true,
  },
  ON_HOLD: {
    status: 'ON_HOLD',
    label: 'On Hold',
    description: 'Temporarily paused',
    color: '#8b5cf6',
    icon: '⏸️',
    isFinal: false,
  },
  CANCELLED: {
    status: 'CANCELLED',
    label: 'Cancelled',
    description: 'No longer pursuing this goal',
    color: '#6b7280',
    icon: '🚫',
    isFinal: true,
  },
} as const;

// ============================================================================
// Goal Priority Configuration
// ============================================================================

export interface GoalPriorityConfig {
  priority: GoalPriority;
  label: string;
  description: string;
  color: string;
  weight: number; // For sorting and importance calculations
  urgencyLevel: number; // 1-5
}

export const GOAL_PRIORITY_CONFIG: Record<GoalPriority, GoalPriorityConfig> = {
  CRITICAL: {
    priority: 'CRITICAL',
    label: 'Critical',
    description: 'Highest priority, urgent and important',
    color: '#dc2626',
    weight: 5,
    urgencyLevel: 5,
  },
  HIGH: {
    priority: 'HIGH',
    label: 'High',
    description: 'Important, should be prioritized',
    color: '#ea580c',
    weight: 4,
    urgencyLevel: 4,
  },
  MEDIUM: {
    priority: 'MEDIUM',
    label: 'Medium',
    description: 'Standard priority',
    color: '#f59e0b',
    weight: 3,
    urgencyLevel: 3,
  },
  LOW: {
    priority: 'LOW',
    label: 'Low',
    description: 'Work on when time permits',
    color: '#84cc16',
    weight: 2,
    urgencyLevel: 2,
  },
  PERSONAL: {
    priority: 'PERSONAL',
    label: 'Personal',
    description: 'Personal development goal',
    color: '#8b5cf6',
    weight: 3,
    urgencyLevel: 2,
  },
  ACADEMIC: {
    priority: 'ACADEMIC',
    label: 'Academic',
    description: 'Education and learning goal',
    color: '#3b82f6',
    weight: 4,
    urgencyLevel: 4,
  },
  NON_PROFIT: {
    priority: 'NON_PROFIT',
    label: 'Non-Profit',
    description: 'Volunteer or community goal',
    color: '#10b981',
    weight: 2,
    urgencyLevel: 2,
  },
  PROFESSIONAL: {
    priority: 'PROFESSIONAL',
    label: 'Professional',
    description: 'Career and work goal',
    color: '#06b6d4',
    weight: 4,
    urgencyLevel: 4,
  },
} as const;

// ============================================================================
// Goal Type Configuration
// ============================================================================

export interface GoalTypeConfig {
  type: GoalType;
  label: string;
  description: string;
  durationDays: number;
  icon: string;
  color: string;
}

export const GOAL_TYPE_CONFIG: Record<GoalType, GoalTypeConfig> = {
  DAILY: {
    type: 'DAILY',
    label: 'Daily',
    description: 'Complete within today',
    durationDays: 1,
    icon: '📅',
    color: '#3b82f6',
  },
  WEEKLY: {
    type: 'WEEKLY',
    label: 'Weekly',
    description: 'Complete within this week',
    durationDays: 7,
    icon: '📆',
    color: '#8b5cf6',
  },
  MONTHLY: {
    type: 'MONTHLY',
    label: 'Monthly',
    description: 'Complete within this month',
    durationDays: 30,
    icon: '🗓️',
    color: '#10b981',
  },
  QUARTERLY: {
    type: 'QUARTERLY',
    label: 'Quarterly',
    description: 'Complete within 3 months',
    durationDays: 90,
    icon: '📊',
    color: '#f59e0b',
  },
  YEARLY: {
    type: 'YEARLY',
    label: 'Yearly',
    description: 'Complete within this year',
    durationDays: 365,
    icon: '🎯',
    color: '#ef4444',
  },
  CUSTOM: {
    type: 'CUSTOM',
    label: 'Custom',
    description: 'Custom timeframe',
    durationDays: 0,
    icon: '⚙️',
    color: '#6b7280',
  },
} as const;

// ============================================================================
// Helper Functions
// ============================================================================

export function getGoalStatusConfig(status: GoalStatus): GoalStatusConfig {
  return GOAL_STATUS_CONFIG[status];
}

export function getGoalPriorityConfig(priority: GoalPriority): GoalPriorityConfig {
  return GOAL_PRIORITY_CONFIG[priority];
}

export function getGoalTypeConfig(type: GoalType): GoalTypeConfig {
  return GOAL_TYPE_CONFIG[type];
}

export function isGoalStatusFinal(status: GoalStatus): boolean {
  return GOAL_STATUS_CONFIG[status].isFinal;
}

export function canTransitionStatus(
  from: GoalStatus,
  to: GoalStatus
): boolean {
  // Cannot change from final states
  if (GOAL_STATUS_CONFIG[from].isFinal && from !== to) {
    return false;
  }
  
  // Can always activate from ON_HOLD
  if (from === 'ON_HOLD' && to === 'ACTIVE') {
    return true;
  }
  
  // Can put ACTIVE goals ON_HOLD
  if (from === 'ACTIVE' && to === 'ON_HOLD') {
    return true;
  }
  
  // Can complete or cancel ACTIVE goals
  if (from === 'ACTIVE' && (to === 'COMPLETED' || to === 'CANCELLED' || to === 'MISSED' || to === 'CARRIED_OVER')) {
    return true;
  }
  
  return from === to;
}

export const GOAL_STATUSES_ORDERED: GoalStatus[] = [
  'ACTIVE',
  'ON_HOLD',
  'COMPLETED',
  'CARRIED_OVER',
  'MISSED',
  'CANCELLED',
];

export const GOAL_PRIORITIES_ORDERED: GoalPriority[] = [
  'CRITICAL',
  'HIGH',
  'MEDIUM',
  'LOW',
  'PROFESSIONAL',
  'ACADEMIC',
  'PERSONAL',
  'NON_PROFIT',
];

export const GOAL_TYPES_ORDERED: GoalType[] = [
  'DAILY',
  'WEEKLY',
  'MONTHLY',
  'QUARTERLY',
  'YEARLY',
  'CUSTOM',
];