import type { DayType, RoutineLogStatus } from '@prisma/client';

/**
 * Routine Constants
 * Configuration for routine templates and blocks
 */

// ============================================================================
// Day Type Configuration
// ============================================================================

export interface DayTypeConfig {
  type: DayType;
  label: string;
  description: string;
  color: string;
  icon: string;
  isDefault: boolean;
}

export const DAY_TYPE_CONFIG: Record<DayType, DayTypeConfig> = {
  WORKDAY: {
    type: 'WORKDAY',
    label: 'Workday',
    description: 'Regular weekday routine',
    color: '#3b82f6',
    icon: '💼',
    isDefault: true,
  },
  WEEKEND: {
    type: 'WEEKEND',
    label: 'Weekend',
    description: 'Weekend routine',
    color: '#10b981',
    icon: '🌴',
    isDefault: true,
  },
  HOLIDAY: {
    type: 'HOLIDAY',
    label: 'Holiday',
    description: 'Holiday or day off',
    color: '#f59e0b',
    icon: '🎉',
    isDefault: false,
  },
  EXAM_DAY: {
    type: 'EXAM_DAY',
    label: 'Exam Day',
    description: 'Day with important exam or deadline',
    color: '#ef4444',
    icon: '📝',
    isDefault: false,
  },
  LOW_ENERGY: {
    type: 'LOW_ENERGY',
    label: 'Low Energy',
    description: 'Not feeling well or low energy',
    color: '#8b5cf6',
    icon: '😴',
    isDefault: false,
  },
  CUSTOM: {
    type: 'CUSTOM',
    label: 'Custom',
    description: 'Custom routine for special occasions',
    color: '#6b7280',
    icon: '⚙️',
    isDefault: false,
  },
} as const;

// ============================================================================
// Routine Log Status Configuration
// ============================================================================

export interface RoutineLogStatusConfig {
  status: RoutineLogStatus;
  label: string;
  color: string;
  icon: string;
}

export const ROUTINE_LOG_STATUS_CONFIG: Record<RoutineLogStatus, RoutineLogStatusConfig> = {
  COMPLETED: {
    status: 'COMPLETED',
    label: 'Completed',
    color: '#22c55e',
    icon: '✅',
  },
  MISSED: {
    status: 'MISSED',
    label: 'Missed',
    color: '#ef4444',
    icon: '❌',
  },
  PARTIAL: {
    status: 'PARTIAL',
    label: 'Partial',
    color: '#f59e0b',
    icon: '⚠️',
  },
  IN_PROGRESS: {
    status: 'IN_PROGRESS',
    label: 'In Progress',
    color: '#3b82f6',
    icon: '▶️',
  },
} as const;

// ============================================================================
// Energy Level Configuration
// ============================================================================

export type EnergyLevel = 'HIGH' | 'MEDIUM' | 'LOW';

export interface EnergyLevelConfig {
  level: EnergyLevel;
  label: string;
  description: string;
  color: string;
  icon: string;
}

export const ENERGY_LEVEL_CONFIG: Record<EnergyLevel, EnergyLevelConfig> = {
  HIGH: {
    level: 'HIGH',
    label: 'High Energy',
    description: 'Peak focus and energy',
    color: '#22c55e',
    icon: '⚡',
  },
  MEDIUM: {
    level: 'MEDIUM',
    label: 'Medium Energy',
    description: 'Moderate energy and focus',
    color: '#f59e0b',
    icon: '🔋',
  },
  LOW: {
    level: 'LOW',
    label: 'Low Energy',
    description: 'Lower energy, easier tasks',
    color: '#ef4444',
    icon: '🪫',
  },
} as const;

// ============================================================================
// Default Routine Templates
// ============================================================================

export interface DefaultRoutineBlock {
  startTime: string;
  endTime: string;
  title: string;
  description?: string;
  energyLevel?: EnergyLevel;
  trackCompletion?: boolean;
  color?: string;
  icon?: string;
}

export const DEFAULT_WORKDAY_ROUTINE: DefaultRoutineBlock[] = [
  {
    startTime: '06:00',
    endTime: '07:00',
    title: 'Morning Routine',
    description: 'Wake up, shower, breakfast',
    energyLevel: 'MEDIUM',
    trackCompletion: true,
    icon: '🌅',
  },
  {
    startTime: '07:00',
    endTime: '08:00',
    title: 'Morning Habits',
    description: 'Exercise, meditation, journaling',
    energyLevel: 'HIGH',
    trackCompletion: true,
    icon: '🏃',
  },
  {
    startTime: '08:00',
    endTime: '09:00',
    title: 'Commute / Setup',
    description: 'Travel to work or prepare workspace',
    energyLevel: 'MEDIUM',
    icon: '🚗',
  },
  {
    startTime: '09:00',
    endTime: '12:00',
    title: 'Deep Work Morning',
    description: 'Focus on important tasks',
    energyLevel: 'HIGH',
    trackCompletion: true,
    icon: '💻',
  },
  {
    startTime: '12:00',
    endTime: '13:00',
    title: 'Lunch Break',
    description: 'Meal and rest',
    energyLevel: 'LOW',
    icon: '🍽️',
  },
  {
    startTime: '13:00',
    endTime: '17:00',
    title: 'Afternoon Work',
    description: 'Meetings and collaborative work',
    energyLevel: 'MEDIUM',
    trackCompletion: true,
    icon: '👥',
  },
  {
    startTime: '17:00',
    endTime: '18:00',
    title: 'Commute / Wind Down',
    description: 'Return home or transition',
    energyLevel: 'LOW',
    icon: '🚶',
  },
  {
    startTime: '18:00',
    endTime: '19:00',
    title: 'Dinner',
    description: 'Prepare and eat dinner',
    energyLevel: 'MEDIUM',
    icon: '🍲',
  },
  {
    startTime: '19:00',
    endTime: '21:00',
    title: 'Evening Activities',
    description: 'Hobbies, family time, relaxation',
    energyLevel: 'MEDIUM',
    icon: '🎮',
  },
  {
    startTime: '21:00',
    endTime: '22:00',
    title: 'Evening Routine',
    description: 'Prepare for bed, reflection',
    energyLevel: 'LOW',
    trackCompletion: true,
    icon: '🌙',
  },
  {
    startTime: '22:00',
    endTime: '06:00',
    title: 'Sleep',
    description: 'Rest and recovery',
    energyLevel: 'LOW',
    icon: '😴',
  },
];

export const DEFAULT_WEEKEND_ROUTINE: DefaultRoutineBlock[] = [
  {
    startTime: '08:00',
    endTime: '09:00',
    title: 'Wake Up & Breakfast',
    description: 'Leisurely morning',
    energyLevel: 'MEDIUM',
    icon: '🌅',
  },
  {
    startTime: '09:00',
    endTime: '10:00',
    title: 'Morning Habits',
    description: 'Exercise, meditation',
    energyLevel: 'HIGH',
    trackCompletion: true,
    icon: '🏃',
  },
  {
    startTime: '10:00',
    endTime: '12:00',
    title: 'Personal Projects',
    description: 'Hobbies and interests',
    energyLevel: 'HIGH',
    icon: '🎨',
  },
  {
    startTime: '12:00',
    endTime: '13:00',
    title: 'Lunch',
    description: 'Meal time',
    energyLevel: 'MEDIUM',
    icon: '🍽️',
  },
  {
    startTime: '13:00',
    endTime: '17:00',
    title: 'Afternoon Activities',
    description: 'Social, errands, or relaxation',
    energyLevel: 'MEDIUM',
    icon: '🎯',
  },
  {
    startTime: '17:00',
    endTime: '19:00',
    title: 'Dinner & Family Time',
    description: 'Evening meal and connections',
    energyLevel: 'MEDIUM',
    icon: '👨‍👩‍👧‍👦',
  },
  {
    startTime: '19:00',
    endTime: '22:00',
    title: 'Evening Leisure',
    description: 'Entertainment and relaxation',
    energyLevel: 'LOW',
    icon: '📺',
  },
  {
    startTime: '22:00',
    endTime: '23:00',
    title: 'Evening Routine',
    description: 'Prepare for bed',
    energyLevel: 'LOW',
    trackCompletion: true,
    icon: '🌙',
  },
  {
    startTime: '23:00',
    endTime: '08:00',
    title: 'Sleep',
    description: 'Rest',
    energyLevel: 'LOW',
    icon: '😴',
  },
];

// ============================================================================
// Helper Functions
// ============================================================================

export function getDayTypeConfig(type: DayType): DayTypeConfig {
  return DAY_TYPE_CONFIG[type];
}

export function getRoutineLogStatusConfig(
  status: RoutineLogStatus
): RoutineLogStatusConfig {
  return ROUTINE_LOG_STATUS_CONFIG[status];
}

export function getEnergyLevelConfig(level: EnergyLevel): EnergyLevelConfig {
  return ENERGY_LEVEL_CONFIG[level];
}

export function getDayTypeForDate(date: Date): DayType {
  const dayOfWeek = date.getDay();
  return dayOfWeek === 0 || dayOfWeek === 6 ? 'WEEKEND' : 'WORKDAY';
}

export const DAY_TYPES_ORDERED: DayType[] = [
  'WORKDAY',
  'WEEKEND',
  'HOLIDAY',
  'EXAM_DAY',
  'LOW_ENERGY',
  'CUSTOM',
];