import type { TemplateType } from '@prisma/client';
import type { DefaultRoutineBlock } from '../../constants/routine';

/**
 * Template Constants
 * Template categories, colors, and default starter templates.
 * Keys match the Prisma `TemplateType` enum exactly.
 */

// ============================================================================
// Template Categories
// ============================================================================

export interface TemplateCategory {
  type: TemplateType;
  label: string;
  description: string;
  color: string;
  icon: string;
  isDefault: boolean;
}

export const TEMPLATE_CATEGORIES: Record<TemplateType, TemplateCategory> = {
  ROUTINE: {
    type: 'ROUTINE',
    label: 'Daily Routine',
    description: 'Full-day or partial-day routine templates',
    color: '#3b82f6',
    icon: '🗓️',
    isDefault: false,
  },
  HABIT_SET: {
    type: 'HABIT_SET',
    label: 'Habit Set',
    description: 'Curated collections of related habits',
    color: '#10b981',
    icon: '🎯',
    isDefault: false,
  },
  GOAL_SET: {
    type: 'GOAL_SET',
    label: 'Goal Set',
    description: 'Pre-built goal plans for common objectives',
    color: '#8b5cf6',
    icon: '🏆',
    isDefault: false,
  },
  MORNING_ROUTINE: {
    type: 'MORNING_ROUTINE',
    label: 'Morning Routine',
    description: 'Templates for starting the day with intent',
    color: '#f59e0b',
    icon: '🌅',
    isDefault: true,
  },
  EVENING_ROUTINE: {
    type: 'EVENING_ROUTINE',
    label: 'Evening Routine',
    description: 'Templates for winding down and preparing for rest',
    color: '#6366f1',
    icon: '🌙',
    isDefault: true,
  },
  WORKOUT: {
    type: 'WORKOUT',
    label: 'Workout',
    description: 'Exercise and training session templates',
    color: '#ef4444',
    icon: '🏋️',
    isDefault: false,
  },
  STUDY_SESSION: {
    type: 'STUDY_SESSION',
    label: 'Study Session',
    description: 'Structured learning and revision blocks',
    color: '#06b6d4',
    icon: '📚',
    isDefault: false,
  },
  CUSTOM: {
    type: 'CUSTOM',
    label: 'Custom',
    description: 'User-defined template',
    color: '#6b7280',
    icon: '⚙️',
    isDefault: false,
  },
} as const;

export type TemplateCategoryType = keyof typeof TEMPLATE_CATEGORIES;

// ============================================================================
// Colors
// ============================================================================

export const TEMPLATE_COLORS = [
  '#3b82f6', // blue
  '#8b5cf6', // violet
  '#10b981', // emerald
  '#f59e0b', // amber
  '#ef4444', // red
  '#06b6d4', // cyan
  '#6366f1', // indigo
  '#22c55e', // green
] as const;

export type TemplateColor = (typeof TEMPLATE_COLORS)[number];

// ============================================================================
// Default Templates
// ============================================================================

export interface DefaultTemplate {
  id: string;
  type: TemplateType;
  name: string;
  description: string;
  category: string;
  color: string;
  icon: string;
  tags: readonly string[];
  isFeatured: boolean;
  estimatedDurationMinutes?: number;
  blocks?: ReadonlyArray<DefaultRoutineBlock>;
}

export const DEFAULT_TEMPLATES = [
  {
    id: 'morning-routine',
    type: 'MORNING_ROUTINE',
    name: 'Morning Routine',
    description: 'A balanced morning to start the day focused',
    category: 'Morning Routine',
    color: '#f59e0b',
    icon: '🌅',
    tags: ['morning', 'breathing', 'focus'],
    isFeatured: true,
    estimatedDurationMinutes: 120,
    blocks: [
      {
        startTime: '06:00',
        endTime: '06:30',
        title: 'Wake Up & Hydrate',
        description: 'Drink water and get natural light',
        energyLevel: 'MEDIUM',
        trackCompletion: true,
        icon: '💧',
      },
      {
        startTime: '06:30',
        endTime: '07:00',
        title: 'Exercise',
        description: 'Light workout or stretch',
        energyLevel: 'HIGH',
        trackCompletion: true,
        icon: '🏃',
      },
      {
        startTime: '07:00',
        endTime: '07:30',
        title: 'Meditation & Journaling',
        description: 'Set intention for the day',
        energyLevel: 'HIGH',
        trackCompletion: true,
        icon: '🧘',
      },
      {
        startTime: '07:30',
        endTime: '08:00',
        title: 'Breakfast & Plan',
        description: 'Eat and review your top priorities',
        energyLevel: 'MEDIUM',
        trackCompletion: true,
        icon: '🍽️',
      },
    ],
  },
  {
    id: 'evening-routine',
    type: 'EVENING_ROUTINE',
    name: 'Evening Routine',
    description: 'Wind down, reflect, and prepare for rest',
    category: 'Evening Routine',
    color: '#6366f1',
    icon: '🌙',
    tags: ['evening', 'sleep', 'reflection'],
    isFeatured: true,
    estimatedDurationMinutes: 90,
    blocks: [
      {
        startTime: '20:30',
        endTime: '21:00',
        title: 'Tidy & Prep',
        description: 'Prepare clothes and workspace for tomorrow',
        energyLevel: 'LOW',
        trackCompletion: true,
        icon: '🧹',
      },
      {
        startTime: '21:00',
        endTime: '21:30',
        title: 'Screen-Free Wind Down',
        description: 'Read, stretch, or take a warm shower',
        energyLevel: 'LOW',
        trackCompletion: true,
        icon: '📖',
      },
      {
        startTime: '21:30',
        endTime: '22:00',
        title: 'Reflect & Plan Tomorrow',
        description: 'Journal wins and set tomorrow\'s top three',
        energyLevel: 'LOW',
        trackCompletion: true,
        icon: '✍️',
      },
    ],
  },
  {
    id: 'deep-work-session',
    type: 'ROUTINE',
    name: 'Deep Work Session',
    description: 'Focused blocks for high-value work',
    category: 'Daily Routine',
    color: '#3b82f6',
    icon: '💻',
    tags: ['focus', 'productivity', 'pomodoro'],
    isFeatured: true,
    estimatedDurationMinutes: 180,
    blocks: [
      {
        startTime: '09:00',
        endTime: '11:00',
        title: 'Deep Work Block',
        description: 'Single-tasking on your most important task',
        energyLevel: 'HIGH',
        trackCompletion: true,
        icon: '🎯',
      },
      {
        startTime: '11:00',
        endTime: '11:15',
        title: 'Break',
        description: 'Move, hydrate, rest your eyes',
        energyLevel: 'LOW',
        icon: '☕',
      },
      {
        startTime: '11:15',
        endTime: '12:15',
        title: 'Deep Work Block',
        description: 'Second focused session',
        energyLevel: 'HIGH',
        trackCompletion: true,
        icon: '🎯',
      },
    ],
  },
  {
    id: 'full-body-workout',
    type: 'WORKOUT',
    name: 'Full Body Workout',
    description: 'Strength and conditioning for every major muscle group',
    category: 'Workout',
    color: '#ef4444',
    icon: '🏋️',
    tags: ['strength', 'conditioning'],
    isFeatured: false,
    estimatedDurationMinutes: 60,
    blocks: [
      {
        startTime: '07:00',
        endTime: '07:10',
        title: 'Warm Up',
        description: 'Dynamic stretching and mobility',
        energyLevel: 'MEDIUM',
        trackCompletion: true,
        icon: '🤸',
      },
      {
        startTime: '07:10',
        endTime: '07:45',
        title: 'Strength Circuit',
        description: 'Squats, presses, and rows',
        energyLevel: 'HIGH',
        trackCompletion: true,
        icon: '🏋️',
      },
      {
        startTime: '07:45',
        endTime: '08:00',
        title: 'Cool Down',
        description: 'Cardio finisher and static stretching',
        energyLevel: 'LOW',
        icon: '🧘',
      },
    ],
  },
  {
    id: 'focused-study-session',
    type: 'STUDY_SESSION',
    name: 'Focused Study Session',
    description: 'Pomodoro-style learning with active recall',
    category: 'Study Session',
    color: '#06b6d4',
    icon: '📚',
    tags: ['learning', 'pomodoro', 'revision'],
    isFeatured: false,
    estimatedDurationMinutes: 150,
    blocks: [
      {
        startTime: '14:00',
        endTime: '14:50',
        title: 'Study Block',
        description: 'Focus on one subject, no multitasking',
        energyLevel: 'HIGH',
        trackCompletion: true,
        icon: '📚',
      },
      {
        startTime: '14:50',
        endTime: '15:00',
        title: 'Short Break',
        description: 'Stand up and stretch',
        energyLevel: 'LOW',
        icon: '☕',
      },
      {
        startTime: '15:00',
        endTime: '15:50',
        title: 'Active Recall',
        description: 'Quiz yourself on the material',
        energyLevel: 'HIGH',
        trackCompletion: true,
        icon: '🧠',
      },
    ],
  },
  {
    id: 'starter-habit-set',
    type: 'HABIT_SET',
    name: 'Starter Habit Set',
    description: 'Foundation habits to build momentum',
    category: 'Habit Set',
    color: '#10b981',
    icon: '🎯',
    tags: ['starter', 'foundation'],
    isFeatured: true,
  },
  {
    id: 'quarterly-goals',
    type: 'GOAL_SET',
    name: 'Quarterly Goals',
    description: 'Plan meaningful goals for the next 90 days',
    category: 'Goal Set',
    color: '#8b5cf6',
    icon: '🏆',
    tags: ['quarterly', 'planning'],
    isFeatured: false,
  },
] as const;

export type DefaultTemplateId = (typeof DEFAULT_TEMPLATES)[number]['id'];

export function getTemplateById(id: DefaultTemplateId): (typeof DEFAULT_TEMPLATES)[number] | undefined {
  return DEFAULT_TEMPLATES.find(template => template.id === id);
}

export function getTemplatesByType(type: TemplateType): (typeof DEFAULT_TEMPLATES)[number][] {
  return DEFAULT_TEMPLATES.filter(template => template.type === type);
}

export function getFeaturedTemplates(): (typeof DEFAULT_TEMPLATES)[number][] {
  return DEFAULT_TEMPLATES.filter(template => template.isFeatured);
}

export function getTemplateCategory(type: TemplateType): TemplateCategory {
  return TEMPLATE_CATEGORIES[type];
}