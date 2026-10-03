import type { AchievementType } from '@/generated/prisma';
import { accentChipStyle, accentTint } from '@/lib/utils';

/**
 * Achievement Constants
 * Categories, rarity tiers, and unlock criteria for achievements.
 * Rarity is a display concept (no Prisma enum); `type` matches the
 * `AchievementType` enum on the Achievement model exactly.
 */

// ============================================================================
// Categories
// ============================================================================

export const ACHIEVEMENT_CATEGORIES = {
  HABITS: {
    label: 'Habits',
    description: 'Streaks and completion derived from habit logging',
    color: '#10b981',
    icon: '🎯',
  },
  GOALS: {
    label: 'Goals',
    description: 'Completing goals and their milestones',
    color: '#3b82f6',
    icon: '🏆',
  },
  CONSISTENCY: {
    label: 'Consistency',
    description: 'Perfect days, weeks, and long-running streaks',
    color: '#8b5cf6',
    icon: '🔥',
  },
  LIFESTYLE: {
    label: 'Lifestyle',
    description: 'Sleep, energy, and wellness behaviors',
    color: '#f59e0b',
    icon: '🌟',
  },
  MASTERY: {
    label: 'Mastery',
    description: 'Deep productivity, focus, and wellness expertise',
    color: '#ef4444',
    icon: '👑',
  },
  MILESTONES: {
    label: 'Milestones',
    description: 'Accumulated usage and activity milestones',
    color: '#06b6d4',
    icon: '📍',
  },
  CUSTOM: {
    label: 'Custom',
    description: 'User-created or event-specific achievements',
    color: '#6b7280',
    icon: '⭐',
  },
} as const;

export type AchievementCategory = keyof typeof ACHIEVEMENT_CATEGORIES;

export type AchievementCategoryConfig = (typeof ACHIEVEMENT_CATEGORIES)[AchievementCategory];

// ============================================================================
// Rarity Tiers
// ============================================================================

export const ACHIEVEMENT_RARITIES = {
  COMMON: {
    label: 'Common',
    description: 'Unlocked by more than 50% of active users',
    color: '#64748b',
    icon: '🪙',
    order: 1,
  },
  UNCOMMON: {
    label: 'Uncommon',
    description: 'Unlocked by 25-50% of active users',
    color: '#22c55e',
    icon: '🎖️',
    order: 2,
  },
  RARE: {
    label: 'Rare',
    description: 'Unlocked by 10-25% of active users',
    color: '#3b82f6',
    icon: '💎',
    order: 3,
  },
  EPIC: {
    label: 'Epic',
    description: 'Unlocked by 5-10% of active users',
    color: '#8b5cf6',
    icon: '🏆',
    order: 4,
  },
  LEGENDARY: {
    label: 'Legendary',
    description: 'Unlocked by fewer than 5% of active users',
    color: '#f59e0b',
    icon: '👑',
    order: 5,
  },
} as const;

export type AchievementRarity = keyof typeof ACHIEVEMENT_RARITIES;

export type AchievementRarityConfig = (typeof ACHIEVEMENT_RARITIES)[AchievementRarity];

/*
 * Theme-correct colours for a rarity (or any per-achievement accent) on a chip.
 *
 * ERROR.md I3: "the UI blocks of the Achievements section are not good in black
 * theme and white theme".
 *
 * `ACHIEVEMENT_RARITIES[...].color` is a mid-tone hue chosen to read as a
 * swatch, and three call sites used it directly as the **text** colour of a
 * `Badge`. Against a white card those fail WCAG AA — `#22c55e` is 2.3:1,
 * `#f59e0b` 2.2:1 — while against a near-black card they are fine, so the page
 * looked right in dark mode and washed out in light mode.
 *
 * `accentChipStyle` / `accentTint` are the shared implementation; these are
 * re-exported under the domain name so the achievement call sites read clearly
 * and so the rule stays documented next to the palette that causes it.
 */
export { accentChipStyle as rarityChipStyle, accentTint as rarityTint };

// ============================================================================
// Achievement Definitions
// ============================================================================

export interface AchievementCriteria {
  field: string;
  operator: '>=' | '<=' | '==' | '>';
  value: number;
  /**
   * The window the criterion is measured over.
   *
   * Honoured by `resolveCriterionValue`, and only meaningful for a `field` that
   * has a dated series in the world state (`<field>Dates`): `DAY` / `WEEK` /
   * `MONTH` / `YEAR` are trailing windows ending on the user's current day, and
   * `ALL_TIME` (or omitting it) uses the lifetime aggregate. A windowed
   * criterion whose field has no dated series cannot be measured and stays
   * locked — see `lib/achievements/timeframes.ts`.
   */
  timeframe?: 'DAY' | 'WEEK' | 'MONTH' | 'YEAR' | 'ALL_TIME';
}

export interface AchievementDefinition {
  id: string;
  type: AchievementType;
  category: AchievementCategory;
  name: string;
  description: string;
  rarity: AchievementRarity;
  icon: string;
  color: string;
  criteria: AchievementCriteria[];
}

export const ACHIEVEMENT_DEFINITIONS = {
  'first-habit-streak': {
    id: 'first-habit-streak',
    type: 'HABIT_STREAK',
    category: 'HABITS',
    name: 'First Streak',
    description: 'Complete a habit 3 days in a row',
    rarity: 'COMMON',
    icon: '🌟',
    color: '#10b981',
    criteria: [{ field: 'streak', operator: '>=', value: 3 }],
  },
  'habit-streak-7': {
    id: 'habit-streak-7',
    type: 'HABIT_STREAK',
    category: 'HABITS',
    name: 'One Week Strong',
    description: 'Complete a habit 7 days in a row',
    rarity: 'UNCOMMON',
    icon: '🔥',
    color: '#22c55e',
    criteria: [{ field: 'streak', operator: '>=', value: 7 }],
  },
  'habit-streak-30': {
    id: 'habit-streak-30',
    type: 'HABIT_STREAK',
    category: 'HABITS',
    name: 'Month of Mastery',
    description: 'Complete a habit 30 days in a row',
    rarity: 'RARE',
    icon: '💎',
    color: '#3b82f6',
    criteria: [{ field: 'streak', operator: '>=', value: 30 }],
  },
  'habit-streak-100': {
    id: 'habit-streak-100',
    type: 'HABIT_STREAK',
    category: 'HABITS',
    name: 'Century Streak',
    description: 'Complete a habit 100 days in a row',
    rarity: 'EPIC',
    icon: '🏆',
    color: '#8b5cf6',
    criteria: [{ field: 'streak', operator: '>=', value: 100 }],
  },
  'habit-streak-365': {
    id: 'habit-streak-365',
    type: 'HABIT_STREAK',
    category: 'HABITS',
    name: 'Iron Habit',
    description: 'Complete a habit 365 days in a row',
    rarity: 'LEGENDARY',
    icon: '👑',
    color: '#f59e0b',
    criteria: [{ field: 'streak', operator: '>=', value: 365 }],
  },
  'first-goal-completed': {
    id: 'first-goal-completed',
    type: 'GOAL_COMPLETED',
    category: 'GOALS',
    name: 'First Win',
    description: 'Complete your first goal',
    rarity: 'COMMON',
    icon: '🏁',
    color: '#3b82f6',
    criteria: [{ field: 'goalsCompleted', operator: '>=', value: 1 }],
  },
  'goals-completed-10': {
    id: 'goals-completed-10',
    type: 'GOAL_COMPLETED',
    category: 'GOALS',
    name: 'Goal Getter',
    description: 'Complete 10 goals',
    rarity: 'UNCOMMON',
    icon: '🎖️',
    color: '#22c55e',
    criteria: [{ field: 'goalsCompleted', operator: '>=', value: 10 }],
  },
  'goals-completed-50': {
    id: 'goals-completed-50',
    type: 'GOAL_COMPLETED',
    category: 'GOALS',
    name: 'Wall of Wins',
    description: 'Complete 50 goals',
    rarity: 'LEGENDARY',
    icon: '🏆',
    color: '#f59e0b',
    criteria: [{ field: 'goalsCompleted', operator: '>=', value: 50 }],
  },
  'perfect-day': {
    id: 'perfect-day',
    type: 'PERFECT_DAY',
    category: 'CONSISTENCY',
    name: 'Perfect Day',
    description: 'Score 95 or higher on a single day',
    rarity: 'UNCOMMON',
    icon: '💯',
    color: '#8b5cf6',
    criteria: [{ field: 'perfectDays', operator: '>=', value: 1, timeframe: 'ALL_TIME' }],
  },
  'perfect-week': {
    id: 'perfect-week',
    type: 'PERFECT_WEEK',
    category: 'CONSISTENCY',
    name: 'Perfect Week',
    description: 'Score 95 or higher on 7 days in a row',
    rarity: 'RARE',
    icon: '🔥',
    color: '#8b5cf6',
    criteria: [{ field: 'perfectDayStreak', operator: '>=', value: 7, timeframe: 'ALL_TIME' }],
  },
  'perfect-month': {
    id: 'perfect-month',
    type: 'PERFECT_MONTH',
    category: 'CONSISTENCY',
    name: 'Perfect Month',
    description: 'Score 95 or higher on 30 days in a row',
    rarity: 'EPIC',
    icon: '👑',
    color: '#8b5cf6',
    criteria: [{ field: 'perfectDayStreak', operator: '>=', value: 30, timeframe: 'ALL_TIME' }],
  },
  'perfect-year': {
    id: 'perfect-year',
    type: 'PERFECT_YEAR',
    category: 'CONSISTENCY',
    name: 'Perfect Year',
    description: 'Score 95 or higher on 365 days in a row',
    rarity: 'LEGENDARY',
    icon: '🌟',
    color: '#f59e0b',
    criteria: [{ field: 'perfectDayStreak', operator: '>=', value: 365, timeframe: 'ALL_TIME' }],
  },
  'early-riser': {
    id: 'early-riser',
    type: 'EARLY_RISER',
    category: 'LIFESTYLE',
    name: 'Early Riser',
    description: 'Wake before 6 AM on 10 days',
    rarity: 'UNCOMMON',
    icon: '🌅',
    color: '#f59e0b',
    criteria: [{ field: 'earlyWakeups', operator: '>=', value: 10, timeframe: 'ALL_TIME' }],
  },
  'night-owl': {
    id: 'night-owl',
    type: 'NIGHT_OWL',
    category: 'LIFESTYLE',
    name: 'Night Owl',
    description: 'Log 20 productive late-evening sessions',
    rarity: 'UNCOMMON',
    icon: '🌙',
    color: '#6366f1',
    criteria: [{ field: 'lateEvenings', operator: '>=', value: 20, timeframe: 'ALL_TIME' }],
  },
  'productivity-master': {
    id: 'productivity-master',
    type: 'PRODUCTIVITY_MASTER',
    category: 'MASTERY',
    name: 'Productivity Master',
    description: 'Log 100 focus hours',
    rarity: 'EPIC',
    icon: '👑',
    color: '#ef4444',
    criteria: [{ field: 'focusHours', operator: '>=', value: 100, timeframe: 'ALL_TIME' }],
  },
  'wellness-warrior': {
    id: 'wellness-warrior',
    type: 'WELLNESS_WARRIOR',
    category: 'MASTERY',
    name: 'Wellness Warrior',
    description: 'Log 30 wellness check-ins',
    rarity: 'RARE',
    icon: '💚',
    color: '#22c55e',
    criteria: [{ field: 'wellnessLogs', operator: '>=', value: 30, timeframe: 'ALL_TIME' }],
  },
  'focus-champion': {
    id: 'focus-champion',
    type: 'FOCUS_CHAMPION',
    category: 'MASTERY',
    name: 'Focus Champion',
    description: 'Complete 500 focus sessions',
    rarity: 'LEGENDARY',
    icon: '🧠',
    color: '#8b5cf6',
    criteria: [{ field: 'focusSessions', operator: '>=', value: 500, timeframe: 'ALL_TIME' }],
  },
  'consistency-king': {
    id: 'consistency-king',
    type: 'CONSISTENCY_KING',
    category: 'CONSISTENCY',
    name: 'Consistency King',
    description: 'Record 4 perfect weeks in a row',
    rarity: 'EPIC',
    icon: '👑',
    color: '#ef4444',
    criteria: [
      { field: 'perfectWeekStreak', operator: '>=', value: 4, timeframe: 'ALL_TIME' },
    ],
  },
  'milestone-habits-1000': {
    id: 'milestone-habits-1000',
    type: 'MILESTONE',
    category: 'MILESTONES',
    name: 'Thousand Builders',
    description: 'Log 1000 habit completions',
    rarity: 'RARE',
    icon: '📍',
    color: '#06b6d4',
    criteria: [{ field: 'totalHabitLogs', operator: '>=', value: 1000, timeframe: 'ALL_TIME' }],
  },
  'milestone-days-30': {
    id: 'milestone-days-30',
    type: 'MILESTONE',
    category: 'MILESTONES',
    name: 'One Month In',
    description: 'Track your routine for 30 active days',
    rarity: 'UNCOMMON',
    icon: '📆',
    color: '#06b6d4',
    criteria: [{ field: 'daysActive', operator: '>=', value: 30, timeframe: 'ALL_TIME' }],
  },
} as const;

export type AchievementDefinitionId = keyof typeof ACHIEVEMENT_DEFINITIONS;

export type AchievementDefinitionConfig = (typeof ACHIEVEMENT_DEFINITIONS)[AchievementDefinitionId];

// ============================================================================
// Helper Functions
// ============================================================================

export function getAchievementDefinition(id: AchievementDefinitionId): AchievementDefinitionConfig {
  return ACHIEVEMENT_DEFINITIONS[id];
}

export function getCategoryConfig(category: AchievementCategory): AchievementCategoryConfig {
  return ACHIEVEMENT_CATEGORIES[category];
}

export function getRarityConfig(rarity: AchievementRarity): AchievementRarityConfig {
  return ACHIEVEMENT_RARITIES[rarity];
}

export function findDefinitionsByCategory(category: AchievementCategory): AchievementDefinitionConfig[] {
  return Object.values(ACHIEVEMENT_DEFINITIONS).filter(definition => definition.category === category);
}

export function findDefinitionsByRarity(rarity: AchievementRarity): AchievementDefinitionConfig[] {
  return Object.values(ACHIEVEMENT_DEFINITIONS).filter(definition => definition.rarity === rarity);
}
