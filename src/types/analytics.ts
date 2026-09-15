/**
 * Analytics Types
 *
 * Complete type definitions for the RoutineOS analytics engine,
 * including trends, summaries, and insight aggregations.
 */

// ============================================================
// ENUMS
// ============================================================

export enum AnalyticsPeriod {
  DAILY = "DAILY",
  WEEKLY = "WEEKLY",
  MONTHLY = "MONTHLY",
  QUARTERLY = "QUARTERLY",
  YEARLY = "YEARLY",
}

export enum TrendDirection {
  UP = "UP",
  DOWN = "DOWN",
  STABLE = "STABLE",
}

// ============================================================
// CORE METRIC
// ============================================================

export interface Metric {
  value: number;
  label: string;
  unit?: string;
  change?: number; // absolute change from previous period
  changePercent?: number;
  trend?: TrendDirection;
}

export interface DataPoint {
  date: string; // ISO date
  value: number;
  label?: string;
}

export interface TimeSeries {
  period: AnalyticsPeriod;
  data: DataPoint[];
  average: number;
  min: number;
  max: number;
  trend: TrendDirection;
}

// ============================================================
// DAILY ANALYTICS
// ============================================================

export interface DailyAnalytics {
  date: string;
  overallScore: number;
  nonNegScore: number;
  growthScore: number;
  bonusScore: number;
  habitsCompleted: number;
  habitsTotal: number;
  sleepDurationMinutes: number | null;
  sleepQualityScore: number | null;
  energyLevel: number | null;
  moodScore: number | null;
  focusMinutes: number | null;
  dayMode: string;
}

// ============================================================
// WEEKLY ANALYTICS
// ============================================================

export interface WeeklyAnalytics {
  weekStart: string; // ISO date of Monday
  weekEnd: string; // ISO date of Sunday
  weekNumber: number;
  year: number;

  // Score summary
  averageScore: number;
  bestDay: DailyAnalytics | null;
  worstDay: DailyAnalytics | null;
  perfectDays: number;
  activeDays: number;

  // Habit stats
  totalHabitsCompleted: number;
  totalHabitsScheduled: number;
  completionRate: number;
  bestHabit: HabitStat | null;
  mostMissedHabit: HabitStat | null;

  // Sleep
  averageSleepMinutes: number | null;
  daysMetSleepTarget: number;

  // vs previous week
  scoreChange: number;
  completionRateChange: number;

  days: DailyAnalytics[];
}

// ============================================================
// MONTHLY ANALYTICS
// ============================================================

export interface MonthlyAnalytics {
  month: number; // 1-12
  year: number;
  daysInMonth: number;

  // Score
  averageScore: number;
  highestScore: number;
  lowestScore: number;
  perfectDays: number;
  activeDays: number;

  // Habits
  completionRate: number;
  totalCompletions: number;

  // Streak
  longestStreakThisMonth: number;

  // Top performers
  topHabits: HabitStat[];
  bottomHabits: HabitStat[];

  // vs previous month
  scoreChange: number;
  completionRateChange: number;

  weeks: WeeklyAnalytics[];
}

// ============================================================
// HABIT ANALYTICS
// ============================================================

export interface HabitStat {
  habitId: string;
  habitName: string;
  tier: string;
  completionRate: number;
  streak: number;
  totalCompletions: number;
  totalScheduled: number;
  frictionScore: number; // 0-1, higher = more friction
}

export interface HabitFrictionAnalysis {
  habitId: string;
  habitName: string;
  frictionScore: number;
  missedDays: number;
  skipDays: number;
  patterns: string[]; // e.g. ["Missed on Mondays", "High miss rate on weekends"]
  recommendation: string | null;
}

// ============================================================
// STREAK ANALYTICS
// ============================================================

export interface StreakAnalytics {
  currentStreak: number;
  longestStreak: number;
  coreStreak: number;
  totalDaysTracked: number;
  streakHistory: StreakPeriod[];
}

export interface StreakPeriod {
  start: string;
  end: string;
  length: number;
  broken: boolean;
  breakReason: string | null;
}

// ============================================================
// INSIGHT TYPES
// ============================================================

export enum InsightCategory {
  HABIT = "HABIT",
  SLEEP = "SLEEP",
  MOOD = "MOOD",
  ENERGY = "ENERGY",
  PRODUCTIVITY = "PRODUCTIVITY",
  ROUTINE = "ROUTINE",
  GOAL = "GOAL",
  STREAK = "STREAK",
  GENERAL = "GENERAL",
}

export enum InsightSeverity {
  INFO = "INFO",
  POSITIVE = "POSITIVE",
  WARNING = "WARNING",
  CRITICAL = "CRITICAL",
}

export interface AIInsight {
  id: string;
  userId: string;
  period: AnalyticsPeriod;
  periodLabel: string; // e.g., "Week 37, 2026"

  category: InsightCategory;
  severity: InsightSeverity;

  title: string;
  summary: string;
  details: string | null;

  recommendation: string | null;
  dataPoints: DataPoint[];

  isRead: boolean;
  isDismissed: boolean;

  generatedAt: Date;
}

// ============================================================
// PRODUCTIVITY PATTERN
// ============================================================

export interface ProductivityPattern {
  id: string;
  userId: string;

  dayOfWeek: number | null; // 0-6
  hourOfDay: number | null; // 0-23

  averageScore: number;
  completionRate: number;
  focusMinutes: number | null;
  energyLevel: number | null;

  sampleSize: number;
  periodStart: string;
  periodEnd: string;

  createdAt: Date;
}

// ============================================================
// ANALYTICS REQUEST
// ============================================================

export interface AnalyticsRequest {
  period: AnalyticsPeriod;
  startDate: string;
  endDate: string;
  habitIds?: string[];
  goalIds?: string[];
  includeHabitBreakdown?: boolean;
  includeSleepData?: boolean;
  includeMoodData?: boolean;
}
