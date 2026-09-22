import type { HabitTier } from '@prisma/client';

/**
 * Habit Tier Constants
 * Configuration and metadata for habit tiers
 */

export interface HabitTierConfig {
  tier: HabitTier;
  label: string;
  description: string;
  longDescription: string;
  defaultPoints: number;
  defaultWeight: number;
  color: string;
  icon: string;
  examples: string[];
  recommendedFrequency: string[];
}

export const HABIT_TIER_CONFIG: Record<HabitTier, HabitTierConfig> = {
  NON_NEGOTIABLE: {
    tier: 'NON_NEGOTIABLE',
    label: 'Non-Negotiable',
    description: 'Non-negotiable core habits',
    longDescription: 'Your daily non-negotiables — the habits that keep the whole system running.',
    defaultPoints: 20,
    defaultWeight: 1.0,
    color: '#ef4444',
    icon: '🔒',
    examples: [
      'Morning workout',
      'Deep work block',
      'Minimum day checklist',
    ],
    recommendedFrequency: ['DAILY'],
  },
  GROWTH: {
    tier: 'GROWTH',
    label: 'Growth',
    description: 'Core habits for personal development',
    longDescription: 'Essential habits that drive personal growth and self-improvement. These are your foundation.',
    defaultPoints: 10,
    defaultWeight: 1.0,
    color: '#3b82f6',
    icon: '🌱',
    examples: [
      'Exercise 30 minutes',
      'Read for 20 minutes',
      'Practice meditation',
      'Journal daily',
      'Study new skill',
    ],
    recommendedFrequency: ['DAILY', 'SPECIFIC_WEEKDAYS'],
  },
  
  BONUS: {
    tier: 'BONUS',
    label: 'Bonus',
    description: 'Extra habits for optimization',
    longDescription: 'Additional habits that enhance your routine but are not critical. These provide bonus points.',
    defaultPoints: 5,
    defaultWeight: 0.5,
    color: '#10b981',
    icon: '⭐',
    examples: [
      'Cold shower',
      'Practice gratitude',
      'Stretch',
      'Listen to podcast',
      'Tidy workspace',
    ],
    recommendedFrequency: ['DAILY', 'WEEKLY_TARGET', 'SPECIFIC_WEEKDAYS'],
  },
  
  OPTIONAL: {
    tier: 'OPTIONAL',
    label: 'Optional',
    description: 'Flexible habits to explore',
    longDescription: 'Habits you want to explore without pressure. No penalty for skipping.',
    defaultPoints: 3,
    defaultWeight: 0.25,
    color: '#8b5cf6',
    icon: '🎯',
    examples: [
      'Try new recipe',
      'Learn new word',
      'Take photos',
      'Practice instrument',
    ],
    recommendedFrequency: ['WEEKLY_TARGET', 'MONTHLY_TARGET', 'RANDOM'],
  },
  
  EXPERIMENTAL: {
    tier: 'EXPERIMENTAL',
    label: 'Experimental',
    description: 'Testing new habits',
    longDescription: 'Habits in trial phase. Track to see if they stick before committing.',
    defaultPoints: 2,
    defaultWeight: 0.1,
    color: '#f59e0b',
    icon: '🧪',
    examples: [
      'Wake up at 5 AM',
      'Intermittent fasting',
      'New workout routine',
    ],
    recommendedFrequency: ['DAILY', 'SPECIFIC_WEEKDAYS', 'WEEKLY_TARGET'],
  },
  
  UNDEFINED: {
    tier: 'UNDEFINED',
    label: 'Undefined',
    description: 'Uncategorized habits',
    longDescription: 'Habits not yet assigned to a tier. Assign a tier to include in scoring.',
    defaultPoints: 0,
    defaultWeight: 0,
    color: '#6b7280',
    icon: '❓',
    examples: [],
    recommendedFrequency: [],
  },
  
  ALTERNATIVE: {
    tier: 'ALTERNATIVE',
    label: 'Alternative',
    description: 'Substitute habits',
    longDescription: 'Alternative versions of other habits. Only one from the group needs completion.',
    defaultPoints: 10,
    defaultWeight: 1.0,
    color: '#14b8a6',
    icon: '🔄',
    examples: [
      'Gym OR home workout',
      'Run OR swim',
      'Read OR audiobook',
    ],
    recommendedFrequency: ['DAILY', 'SPECIFIC_WEEKDAYS'],
  },
  
  SPECIAL: {
    tier: 'SPECIAL',
    label: 'Special',
    description: 'Context-specific habits',
    longDescription: 'Habits that only apply in specific contexts or situations.',
    defaultPoints: 5,
    defaultWeight: 0.5,
    color: '#ec4899',
    icon: '🌟',
    examples: [
      'Exam day routine',
      'Travel workout',
      'Social event preparation',
    ],
    recommendedFrequency: ['CUSTOM', 'ONE_TIME'],
  },
  
  FLEXIBLE: {
    tier: 'FLEXIBLE',
    label: 'Flexible',
    description: 'Adaptable habits',
    longDescription: 'Habits with flexible scheduling and completion criteria.',
    defaultPoints: 7,
    defaultWeight: 0.7,
    color: '#06b6d4',
    icon: '🌊',
    examples: [
      'Connect with friend (weekly)',
      'Creative project (when inspired)',
      'Deep work (3x week)',
    ],
    recommendedFrequency: ['WEEKLY_TARGET', 'MONTHLY_TARGET'],
  },
  
  JUST_FOR_FUN: {
    tier: 'JUST_FOR_FUN',
    label: 'Just for Fun',
    description: 'Enjoyment-focused habits',
    longDescription: 'Habits purely for enjoyment and leisure. No pressure, just fun.',
    defaultPoints: 3,
    defaultWeight: 0.2,
    color: '#f97316',
    icon: '🎉',
    examples: [
      'Play video game',
      'Watch favorite show',
      'Browse hobby subreddit',
      'Play with pet',
    ],
    recommendedFrequency: ['RANDOM', 'WEEKLY_TARGET'],
  },
  
  LIFESTYLE: {
    tier: 'LIFESTYLE',
    label: 'Lifestyle',
    description: 'Daily living habits',
    longDescription: 'Essential life maintenance habits that keep things running smoothly.',
    defaultPoints: 5,
    defaultWeight: 0.6,
    color: '#22c55e',
    icon: '🏡',
    examples: [
      'Make bed',
      'Drink 8 glasses of water',
      'Plan tomorrow',
      'Prepare meals',
      'Clean workspace',
    ],
    recommendedFrequency: ['DAILY'],
  },
} as const;

export const HABIT_TIERS_ORDERED: HabitTier[] = [
  'NON_NEGOTIABLE',
  'GROWTH',
  'BONUS',
  'LIFESTYLE',
  'FLEXIBLE',
  'ALTERNATIVE',
  'OPTIONAL',
  'EXPERIMENTAL',
  'SPECIAL',
  'JUST_FOR_FUN',
  'UNDEFINED',
];

export function getHabitTierConfig(tier: HabitTier): HabitTierConfig {
  return HABIT_TIER_CONFIG[tier];
}

export function getHabitTierLabel(tier: HabitTier): string {
  return HABIT_TIER_CONFIG[tier].label;
}

export function getHabitTierColor(tier: HabitTier): string {
  return HABIT_TIER_CONFIG[tier].color;
}

export function getHabitTierWeight(tier: HabitTier): number {
  return HABIT_TIER_CONFIG[tier].defaultWeight;
}

export function getHabitTierPoints(tier: HabitTier): number {
  return HABIT_TIER_CONFIG[tier].defaultPoints;
}