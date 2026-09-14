// src/types/achievements.ts

// ============================================
// IMPORTS
// ============================================

// Models (types) - Use direct import
import type { Achievement, User } from '@prisma/client'

// Enums - Use direct import (same as models in Prisma Client)
import { AchievementType } from '@prisma/client'

// NOTE: In Prisma Client v5+, both models and enums are imported the same way!

// ============================================
// DATABASE TYPES (with relations)
// ============================================

/**
 * Achievement with User details
 * Use when you need to display who unlocked the achievement
 */
export type AchievementWithUser = Achievement & {
  user: Pick<User, 'id' | 'name' | 'email' | 'avatarUrl'>
}

/**
 * Achievement with full User object
 * Use when you need complete user information
 */
export type AchievementWithFullUser = Achievement & {
  user: User
}

/**
 * Minimal achievement data
 * Use for list views where you don't need all fields
 */
export type AchievementMinimal = Pick<Achievement, 
  | 'id' 
  | 'type' 
  | 'title' 
  | 'icon' 
  | 'color' 
  | 'unlockedAt'
  | 'celebrated'
>

// ============================================
// INPUT TYPES (Form/API)
// ============================================

/**
 * Data required to create a new achievement
 */
export type CreateAchievementInput = {
  userId: string
  type: AchievementType
  title: string
  description?: string
  icon?: string
  color?: string
  level?: number
  metadata?: AchievementMetadata
  isPublic?: boolean
}

/**
 * Data that can be updated in an achievement
 */
export type UpdateAchievementInput = {
  id: string
  celebrated?: boolean
  isPublic?: boolean
  metadata?: AchievementMetadata
}

/**
 * Bulk unlock achievements for a user
 */
export type BulkUnlockInput = {
  userId: string
  achievements: Array<{
    type: AchievementType
    title: string
    description?: string
    level?: number
    metadata?: AchievementMetadata
  }>
}

// ============================================
// METADATA TYPES
// ============================================

/**
 * Achievement metadata structure
 * Stored as JSON in database
 */
export type AchievementMetadata = {
  // For HABIT_STREAK
  habitId?: string
  habitName?: string
  streakDays?: number
  
  // For GOAL_COMPLETED
  goalId?: string
  goalTitle?: string
  completedValue?: number
  
  // For PERFECT_DAY/WEEK/MONTH
  date?: string
  score?: number
  perfectDays?: number
  
  // For MILESTONE
  milestoneType?: string
  milestoneValue?: number
  
  // Custom data
  [key: string]: any
}

/**
 * Type-safe metadata for specific achievement types
 */
export type HabitStreakMetadata = {
  habitId: string
  habitName: string
  streakDays: number
}

export type GoalCompletedMetadata = {
  goalId: string
  goalTitle: string
  targetValue: number
  completedValue: number
  completedInDays: number
}

export type PerfectDayMetadata = {
  date: string
  coreScore: number
  totalScore: number
  habitsCompleted: number
}

export type MilestoneMetadata = {
  milestoneType: 'DAYS_ACTIVE' | 'TOTAL_HABITS' | 'TOTAL_GOALS' | 'STREAK'
  value: number
  threshold: number
}

// ============================================
// FRONTEND DISPLAY TYPES
// ============================================

/**
 * Achievement card display data
 * Optimized for UI rendering
 */
export type AchievementCard = {
  id: string
  type: AchievementType
  title: string
  description?: string
  icon: string
  color: string
  level: number
  unlockedAt: Date
  celebrated: boolean
  isPublic: boolean
  
  // Computed fields
  isNew: boolean              // Unlocked in last 7 days
  daysAgo: number            // How many days since unlock
  shareUrl?: string          // URL to share achievement
  badgeImageUrl?: string     // Generated badge image
  categoryName: string       // Human-readable category
  
  // Metadata (parsed from JSON)
  metadata?: AchievementMetadata
}

/**
 * Achievement list item (minimal data for lists)
 */
export type AchievementListItem = {
  id: string
  type: AchievementType
  title: string
  icon: string
  color: string
  level: number
  unlockedAt: Date
  celebrated: boolean
  isNew: boolean
}

/**
 * Achievement notification data
 */
export type AchievementNotification = {
  id: string
  type: AchievementType
  title: string
  description?: string
  icon: string
  color: string
  level: number
  showConfetti?: boolean
  autoHideAfter?: number  // milliseconds
}

/**
 * Achievement share data
 */
export type AchievementShareData = {
  achievementId: string
  title: string
  description?: string
  imageUrl: string
  shareUrl: string
  socialText: string
}

// ============================================
// ANALYTICS/STATS TYPES
// ============================================

/**
 * User's achievement statistics
 */
export type AchievementStats = {
  total: number
  celebrated: number
  public: number
  recentCount: number  // Last 30 days
  
  // By type
  byType: Record<AchievementType, number>
  
  // By level
  byLevel: Record<number, number>
  
  // Trends
  thisMonth: number
  lastMonth: number
  growthRate: number  // percentage
  
  // Rarity
  rareAchievements: number      // Only X% of users have
  commonAchievements: number
  
  // Completion rate (for available achievements)
  availableCount: number
  completionRate: number  // 0-100
}

/**
 * Achievement leaderboard entry
 */
export type AchievementLeaderboardEntry = {
  userId: string
  userName: string
  userAvatar?: string
  achievementCount: number
  totalLevel: number  // Sum of all achievement levels
  rank: number
  rareAchievementsCount: number
}

/**
 * Achievement progress tracking
 */
export type AchievementProgress = {
  type: AchievementType
  title: string
  description: string
  icon: string
  color: string
  
  // Progress
  currentValue: number
  targetValue: number
  progress: number  // 0-100
  
  // Status
  isUnlocked: boolean
  unlockedAt?: Date
  
  // Requirements
  requirements: string[]
  hints?: string[]
}

/**
 * Achievement category statistics
 */
export type AchievementCategoryStats = {
  category: AchievementCategory
  total: number
  unlocked: number
  locked: number
  completionRate: number
  latestAchievement?: Achievement
}

// ============================================
// FILTER/QUERY TYPES
// ============================================

/**
 * Filters for achievement queries
 */
export type AchievementFilters = {
  type?: AchievementType[]
  level?: number[]
  celebrated?: boolean
  isPublic?: boolean
  isNew?: boolean  // Last 7 days
  
  // Date range
  unlockedAfter?: Date
  unlockedBefore?: Date
  
  // Search
  search?: string
}

/**
 * Sort options for achievements
 */
export type AchievementSortBy = 
  | 'unlockedAt'
  | 'title'
  | 'type'
  | 'level'
  | 'createdAt'

/**
 * Complete query options
 */
export type AchievementQuery = AchievementFilters & {
  sortBy?: AchievementSortBy
  sortOrder?: 'asc' | 'desc'
  limit?: number
  offset?: number
  includeUser?: boolean
}

// ============================================
// UTILITY TYPES
// ============================================

/**
 * Achievement categories for grouping
 */
export type AchievementCategory = 
  | 'HABITS'          // HABIT_STREAK
  | 'GOALS'           // GOAL_COMPLETED
  | 'CONSISTENCY'     // PERFECT_DAY, PERFECT_WEEK, etc.
  | 'LIFESTYLE'       // EARLY_RISER, NIGHT_OWL
  | 'MASTERY'         // PRODUCTIVITY_MASTER, WELLNESS_WARRIOR, etc.
  | 'MILESTONES'      // MILESTONE
  | 'CUSTOM'          // CUSTOM

/**
 * Achievement rarity levels
 */
export type AchievementRarity = 
  | 'COMMON'          // >50% of users have it
  | 'UNCOMMON'        // 25-50% of users
  | 'RARE'            // 10-25% of users
  | 'EPIC'            // 5-10% of users
  | 'LEGENDARY'       // <5% of users

/**
 * Achievement unlock conditions
 */
export type AchievementCondition = {
  type: AchievementType
  level: number
  requirements: {
    field: string      // 'streak', 'score', 'count', etc.
    operator: '>=' | '<=' | '==' | '>'
    value: number
    timeframe?: 'DAY' | 'WEEK' | 'MONTH' | 'YEAR' | 'ALL_TIME'
  }[]
}

/**
 * Achievement template (for creating new achievements)
 */
export type AchievementTemplate = {
  type: AchievementType
  titleTemplate: string        // "Complete {{count}} habits"
  descriptionTemplate?: string
  icon: string
  color: string
  levels: {
    level: number
    threshold: number
    title: string
    description?: string
  }[]
}

/**
 * Achievement unlock result
 */
export type AchievementUnlockResult = {
  achievement: Achievement
  isNew: boolean           // Newly unlocked or already had it
  previousLevel?: number   // If upgrading level
  shouldNotify: boolean
  shouldShowConfetti: boolean
}

// ============================================
// API RESPONSE TYPES
// ============================================

/**
 * Response when fetching achievements
 */
export type GetAchievementsResponse = {
  achievements: AchievementCard[]
  total: number
  page: number
  pageSize: number
  hasMore: boolean
}

/**
 * Response when unlocking achievement
 */
export type UnlockAchievementResponse = {
  success: boolean
  achievement: AchievementCard
  isNew: boolean
  message: string
}

/**
 * Response for achievement stats
 */
export type GetAchievementStatsResponse = {
  stats: AchievementStats
  recent: AchievementListItem[]
  nextToUnlock: AchievementProgress[]
}

// ============================================
// HELPER FUNCTIONS (Type Guards)
// ============================================

/**
 * Check if achievement type is habit-related
 */
export function isHabitAchievement(type: AchievementType): boolean {
  return type === 'HABIT_STREAK'
}

/**
 * Check if achievement type is goal-related
 */
export function isGoalAchievement(type: AchievementType): boolean {
  return type === 'GOAL_COMPLETED'
}

/**
 * Check if achievement type is perfection-related
 */
export function isPerfectionAchievement(type: AchievementType): boolean {
  return [
    'PERFECT_DAY',
    'PERFECT_WEEK',
    'PERFECT_MONTH',
    'PERFECT_QUARTER',
    'PERFECT_YEAR'
  ].includes(type)
}

/**
 * Get achievement category from type
 */
export function getAchievementCategory(type: AchievementType): AchievementCategory {
  switch (type) {
    case 'HABIT_STREAK':
      return 'HABITS'
    case 'GOAL_COMPLETED':
      return 'GOALS'
    case 'PERFECT_DAY':
    case 'PERFECT_WEEK':
    case 'PERFECT_MONTH':
    case 'PERFECT_QUARTER':
    case 'PERFECT_YEAR':
    case 'CONSISTENCY_KING':
      return 'CONSISTENCY'
    case 'EARLY_RISER':
    case 'NIGHT_OWL':
      return 'LIFESTYLE'
    case 'PRODUCTIVITY_MASTER':
    case 'WELLNESS_WARRIOR':
    case 'FOCUS_CHAMPION':
      return 'MASTERY'
    case 'MILESTONE':
      return 'MILESTONES'
    case 'CUSTOM':
      return 'CUSTOM'
    default:
      return 'CUSTOM'
  }
}

// ============================================
// CONSTANTS
// ============================================

/**
 * Achievement type display names
 */
export const ACHIEVEMENT_TYPE_LABELS: Record<AchievementType, string> = {
  HABIT_STREAK: 'Habit Streak',
  GOAL_COMPLETED: 'Goal Completed',
  PERFECT_DAY: 'Perfect Day',
  PERFECT_WEEK: 'Perfect Week',
  PERFECT_MONTH: 'Perfect Month',
  PERFECT_QUARTER: 'Perfect Quarter',
  PERFECT_YEAR: 'Perfect Year',
  EARLY_RISER: 'Early Riser',
  NIGHT_OWL: 'Night Owl',
  PRODUCTIVITY_MASTER: 'Productivity Master',
  WELLNESS_WARRIOR: 'Wellness Warrior',
  FOCUS_CHAMPION: 'Focus Champion',
  CONSISTENCY_KING: 'Consistency King',
  MILESTONE: 'Milestone',
  CUSTOM: 'Custom Achievement'
}

/**
 * Default achievement colors
 */
export const ACHIEVEMENT_COLORS: Record<AchievementCategory, string> = {
  HABITS: '#10b981',      // green
  GOALS: '#3b82f6',       // blue
  CONSISTENCY: '#8b5cf6', // purple
  LIFESTYLE: '#f59e0b',   // amber
  MASTERY: '#ef4444',     // red
  MILESTONES: '#06b6d4',  // cyan
  CUSTOM: '#6b7280'       // gray
}

/**
 * Default achievement icons
 */
export const ACHIEVEMENT_ICONS: Record<AchievementCategory, string> = {
  HABITS: '🎯',
  GOALS: '🏆',
  CONSISTENCY: '🔥',
  LIFESTYLE: '🌟',
  MASTERY: '👑',
  MILESTONES: '📍',
  CUSTOM: '⭐'
}

// ============================================
// EXPORT ENUMS (for re-export convenience)
// ============================================

export { AchievementType }

// You can also create type alias if needed
export type { AchievementType as AchievementTypeEnum }