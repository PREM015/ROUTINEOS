/**
 * Analytics Types
 * Complete type system for analytics and insights
 */

// ============================================================================
// Reflection Types
// ============================================================================

import type { DailyReflection as PrismaDailyReflection } from '@prisma/client';

export type DailyReflection = PrismaDailyReflection;

export interface ReflectionFormData {
  energyLevel?: number;
  moodLevel?: number;
  biggestWin?: string;
  biggestDifficulty?: string;
  lessonsLearned?: string;
  gratitude?: string;
}

// ============================================================================
// Period Types
// ============================================================================

export type AnalyticsPeriod = 'daily' | 'weekly' | 'monthly' | 'quarterly' | 'yearly' | 'custom';

export interface DateRange {
  startDate: string; // YYYY-MM-DD
  endDate: string; // YYYY-MM-DD
}

// ============================================================================
// Dashboard Analytics
// ============================================================================

export interface DashboardAnalytics {
  overview: {
    currentStreak: number;
    longestStreak: number;
    todayScore: number | null;
    weekAverageScore: number;
    monthAverageScore: number;
    activeHabits: number;
    activeGoals: number;
    completionRateToday: number;
  };
  habits: {
    total: number;
    active: number;
    paused: number;
    archived: number;
    completionRate: number;
    mostConsistent: HabitConsistencyInfo | null;
    needsAttention: HabitConsistencyInfo | null;
  };
  goals: {
    total: number;
    active: number;
    completed: number;
    onTrack: number;
    atRisk: number;
    overdue: number;
    completionRate: number;
  };
  recentActivity: ActivitySummary[];
  upcomingDeadlines: UpcomingDeadline[];
}

export interface HabitConsistencyInfo {
  id: string;
  name: string;
  tier: string;
  completionRate: number;
  currentStreak: number;
}

export interface ActivitySummary {
  type: 'HABIT_COMPLETED' | 'GOAL_COMPLETED' | 'PERFECT_DAY' | 'MILESTONE_REACHED';
  title: string;
  description: string;
  timestamp: Date;
  metadata?: Record<string, unknown>;
}

export interface UpcomingDeadline {
  type: 'GOAL' | 'MILESTONE' | 'PROJECT';
  id: string;
  title: string;
  dueDate: Date;
  daysUntilDue: number;
  progress: number;
  priority: string;
}

// ============================================================================
// Habit Analytics
// ============================================================================

export interface HabitAnalyticsSummary {
  habitId: string;
  habitName: string;
  tier: string;
  period: DateRange;
  
  completion: {
    totalDays: number;
    scheduledDays: number;
    completedDays: number;
    missedDays: number;
    skippedDays: number;
    completionRate: number;
  };
  
  streaks: {
    current: number;
    longest: number;
    average: number;
  };
  
  performance: {
    averageDifficulty: number | null;
    averageDuration: number | null;
    totalDuration: number;
    averageEnergyLevel: number | null;
    averageMoodImprovement: number | null;
  };
  
  patterns: {
    bestDayOfWeek: string | null;
    worstDayOfWeek: string | null;
    consistencyScore: number; // 0-100
  };
  
  trends: Array<{
    date: string;
    completed: boolean;
    duration: number | null;
    difficulty: number | null;
  }>;
}

export interface AllHabitsAnalytics {
  period: DateRange;
  totalHabits: number;
  
  byTier: {
    tier: string;
    count: number;
    completionRate: number;
    averageStreak: number;
  }[];
  
  topPerformers: Array<{
    habitId: string;
    habitName: string;
    completionRate: number;
    currentStreak: number;
  }>;
  
  needsAttention: Array<{
    habitId: string;
    habitName: string;
    completionRate: number;
    daysSinceLast: number;
    reason: string;
  }>;
  
  overallStats: {
    totalCompletions: number;
    averageCompletionRate: number;
    totalDuration: number;
    averageStreak: number;
  };
}

// ============================================================================
// Goal Analytics
// ============================================================================

export interface GoalAnalyticsSummary {
  goalId: string;
  goalTitle: string;
  type: string;
  priority: string;
  period: DateRange;
  
  progress: {
    current: number;
    target: number;
    percentage: number;
    remaining: number;
  };
  
  velocity: {
    overall: number; // units per day
    recent: number; // last 7 days
    required: number; // to meet deadline
    onTrack: boolean;
  };
  
  timeline: {
    startDate: Date;
    endDate: Date;
    daysElapsed: number;
    daysTotal: number;
    daysRemaining: number;
    projectedCompletion: Date | null;
  };
  
  milestones: {
    total: number;
    completed: number;
    upcoming: number;
    overdue: number;
  };
  
  progressHistory: Array<{
    date: string;
    value: number;
    cumulative: number;
  }>;
}

export interface AllGoalsAnalytics {
  period: DateRange;
  totalGoals: number;
  
  byStatus: {
    status: string;
    count: number;
    percentage: number;
  }[];
  
  byType: {
    type: string;
    count: number;
    completionRate: number;
    averageProgress: number;
  }[];
  
  performance: {
    onTrack: number;
    atRisk: number;
    overdue: number;
    completed: number;
    averageProgress: number;
  };
  
  topGoals: Array<{
    goalId: string;
    title: string;
    progress: number;
    velocity: number;
  }>;
}

// ============================================================================
// Streak Analytics
// ============================================================================

export interface StreakAnalytics {
  current: {
    total: number;
    core: number;
    growth: number;
    minimum: number;
  };
  
  longest: {
    total: number;
    core: number;
    growth: number;
    minimum: number;
  };
  
  history: {
    totalDays: number;
    completedDays: number;
    minimumDays: number;
    restDays: number;
    perfectDays: number;
  };
  
  milestones: Array<{
    type: string;
    days: number;
    reachedDate: string;
    celebrated: boolean;
  }>;
  
  timeline: Array<{
    date: string;
    hasStreak: boolean;
    isMinimumDay: boolean;
    isRestDay: boolean;
    score: number | null;
  }>;
  
  projections: {
    nextMilestone: number | null;
    daysToNextMilestone: number | null;
    riskLevel: 'LOW' | 'MEDIUM' | 'HIGH';
  };
}

// ============================================================================
// Score Analytics
// ============================================================================

export interface ScoreAnalyticsSummary {
  period: DateRange;
  
  averages: {
    core: number;
    growth: number;
    bonus: number;
    total: number;
  };
  
  distribution: {
    grade: string;
    count: number;
    percentage: number;
  }[];
  
  trends: {
    improving: boolean;
    trendDirection: 'UP' | 'DOWN' | 'STABLE';
    changePercentage: number;
    comparisonPeriod: DateRange;
  };
  
  specialDays: {
    minimumDays: number;
    restDays: number;
    perfectDays: number;
    excellentDays: number;
  };
  
  timeline: Array<{
    date: string;
    core: number | null;
    growth: number | null;
    bonus: number | null;
    total: number | null;
    grade: string | null;
  }>;
}

// ============================================================================
// Sleep Analytics
// ============================================================================

export interface SleepAnalyticsSummary {
  period: DateRange;
  
  averages: {
    duration: number; // minutes
    bedtime: string; // HH:mm
    wakeTime: string; // HH:mm
    quality: number | null;
  };
  
  consistency: {
    bedtimeVariance: number;
    wakeTimeVariance: number;
    durationVariance: number;
    score: number; // 0-100
  };
  
  debt: {
    total: number;
    average: number;
    trend: 'IMPROVING' | 'WORSENING' | 'STABLE';
  };
  
  quality: {
    averageRating: number | null;
    daysFeelRested: number;
    percentageRested: number;
  };
  
  timeline: Array<{
    date: string;
    duration: number;
    quality: number | null;
    deficit: number;
  }>;
}

// ============================================================================
// Context Analytics
// ============================================================================

export interface ContextAnalytics {
  period: DateRange;
  
  byDayType: {
    dayType: string;
    count: number;
    averageScore: number;
    averageCompletionRate: number;
  }[];
  
  byWeekday: {
    weekday: string;
    count: number;
    averageScore: number;
    averageCompletionRate: number;
    bestHabits: string[];
    worstHabits: string[];
  }[];
  
  correlations: {
    sleepVsScore: number; // -1 to 1
    energyVsCompletion: number;
    moodVsProductivity: number;
  };
}

// ============================================================================
// Friction Analysis
// ============================================================================

export interface FrictionAnalysis {
  habitId: string;
  habitName: string;
  
  frictionScore: number; // 0-100, higher = more friction
  
indicators: {
    inconsistentCompletion: boolean;
    frequentSkips: boolean;
    decliningTrend: boolean;
  };

  patterns: {
    strugglingDays: string[]; // weekdays
  };
  
  recommendations: string[];
}

// ============================================================================
// Trend Analysis
// ============================================================================

export interface TrendAnalysis {
  metric: string;
  period: DateRange;
  
  direction: 'IMPROVING' | 'DECLINING' | 'STABLE';
  strength: number; // 0-1
  
  current: number;
  previous: number;
  change: {
    absolute: number;
    percentage: number;
  };
  
  forecast: {
    nextPeriod: number;
    confidence: number;
  };
  
  dataPoints: Array<{
    date: string;
    value: number;
  }>;
}

// ============================================================================
// Comparative Analytics
// ============================================================================

export interface ComparativeAnalytics {
  current: AnalyticsPeriodSummary;
  previous: AnalyticsPeriodSummary;
  comparison: {
    scoreChange: number;
    completionRateChange: number;
    streakChange: number;
    goalsCompletedChange: number;
    improved: boolean;
    insights: string[];
  };
}

export interface AnalyticsPeriodSummary {
  period: DateRange;
  averageScore: number;
  completionRate: number;
  streak: number;
  goalsCompleted: number;
  perfectDays: number;
}

// ============================================================================
// Export Types
// ============================================================================

export interface AnalyticsExportData {
  user: {
    id: string;
    name: string;
    email: string;
  };
  exportDate: Date;
  period: DateRange;
  
  habits: HabitAnalyticsSummary[];
  goals: GoalAnalyticsSummary[];
  scores: ScoreAnalyticsSummary;
  sleep: SleepAnalyticsSummary;
  streaks: StreakAnalytics;
  
  summary: {
    totalDays: number;
    averageScore: number;
    completionRate: number;
    totalHabitsCompleted: number;
    totalGoalsCompleted: number;
    currentStreak: number;
  };
}

// ============================================================================
// Helper Types
// ============================================================================

export interface MetricDataPoint {
  timestamp: Date | string;
  value: number;
  label?: string;
  metadata?: Record<string, unknown>;
}

export interface ChartDataset {
  label: string;
  data: MetricDataPoint[];
  color?: string;
  type?: 'line' | 'bar' | 'area';
}