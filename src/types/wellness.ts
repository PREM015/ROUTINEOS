import type {
  MoodLog,
  EnergyLog,
  HealthMetric,
  WeatherLog,
  NutritionEntry,
  SleepLog,
  WeatherCondition,
} from '@prisma/client';

/**
 * Wellness & Health Tracking Types
 * Complete type system for mood, energy, health metrics, nutrition, and weather
 */

// ============================================================================
// Domain Enums
// ============================================================================

export type HealthMetricType = 'WEIGHT' | 'BODY_FAT' | 'STEPS' | 'HEART_RATE' | 'BLOOD_PRESSURE';

export type MealType = 'BREAKFAST' | 'LUNCH' | 'DINNER' | 'SNACK';

export type TimeOfDayPeriod = 'MORNING' | 'AFTERNOON' | 'EVENING' | 'NIGHT';

// ============================================================================
// Core Wellness Types
// ============================================================================

export type MoodLogWithContext = Omit<MoodLog, 'triggers' | 'activities'> & {
  triggers: string[];
  activities: string[];
};

export interface MoodLogListItem {
  id: string;
  timestamp: Date;
  mood: number;
  energy: number | null;
  stress: number | null;
  anxiety: number | null;
  focus: number | null;
  triggers: string[];
  activities: string[];
  location: string | null;
  notes: string | null;
}

export interface EnergyLogListItem {
  id: string;
  timestamp: Date;
  energyLevel: number;
  activity: string | null;
  location: string | null;
  notes: string | null;
}

export interface HealthMetricListItem {
  id: string;
  date: string;
  metricType: HealthMetricType;
  value: number;
  unit: string;
  timeOfDay: string | null;
  source: string | null;
  sourceId: string | null;
  notes: string | null;
}

export interface WeatherLogEntry {
  id: string;
  date: string;
  condition: WeatherCondition;
  temperature: number | null;
  humidity: number | null;
  notes: string | null;
}

export interface NutritionEntryListItem {
  id: string;
  date: string;
  mealType: MealType;
  foodName: string;
  quantity: number;
  unit: string;
  calories: number | null;
  protein: number | null;
  carbs: number | null;
  fat: number | null;
  fiber: number | null;
  sugar: number | null;
  sodium: number | null;
}

// ============================================================================
// Mood & Energy Logging
// ============================================================================

export interface LogMoodInput {
  timestamp?: Date;
  mood: number; // 1-5
  energy?: number; // 1-5
  stress?: number; // 1-5
  anxiety?: number; // 1-5
  focus?: number; // 1-5
  triggers?: string[];
  activities?: string[];
  location?: string;
  weather?: string;
  notes?: string;
}

export interface LogMoodResponse {
  success: boolean;
  log?: MoodLogWithContext;
  message?: string;
}

export interface UpdateMoodLogInput {
  mood?: number;
  energy?: number | null;
  stress?: number | null;
  anxiety?: number | null;
  focus?: number | null;
  triggers?: string[];
  activities?: string[];
  location?: string | null;
  weather?: string | null;
  notes?: string | null;
}

export interface UpdateMoodLogResponse {
  success: boolean;
  log?: MoodLogWithContext;
  message?: string;
}

export interface LogEnergyInput {
  timestamp?: Date;
  energyLevel: number; // 1-5
  activity?: string;
  location?: string;
  notes?: string;
}

export interface LogEnergyResponse {
  success: boolean;
  log?: EnergyLog;
  message?: string;
}

// ============================================================================
// Health Metrics & Weather & Nutrition
// ============================================================================

export interface LogHealthMetricInput {
  date: string; // YYYY-MM-DD
  metricType: HealthMetricType;
  value: number;
  unit: string;
  timeOfDay?: string;
  notes?: string;
  source?: string;
  sourceId?: string;
}

export interface LogHealthMetricResponse {
  success: boolean;
  metric?: HealthMetric;
  message?: string;
}

export interface UpdateHealthMetricInput {
  value?: number;
  unit?: string;
  notes?: string | null;
}

export interface UpdateHealthMetricResponse {
  success: boolean;
  metric?: HealthMetric;
  message?: string;
}

export interface LogWeatherInput {
  date: string; // YYYY-MM-DD
  condition: WeatherCondition;
  temperature?: number;
  humidity?: number;
  notes?: string;
}

export interface LogWeatherResponse {
  success: boolean;
  weather?: WeatherLog;
  message?: string;
}

export interface LogNutritionEntryInput {
  date: string; // YYYY-MM-DD
  mealType: MealType;
  foodName: string;
  quantity: number;
  unit: string;
  calories?: number;
  protein?: number;
  carbs?: number;
  fat?: number;
  fiber?: number;
  sugar?: number;
  sodium?: number;
}

export interface LogNutritionEntryResponse {
  success: boolean;
  entry?: NutritionEntry;
  message?: string;
}

// ============================================================================
// Daily Wellness Summary
// ============================================================================

export interface WellnessDailySummary {
  date: string;
  sleep: {
    log: SleepLog | null;
    durationMinutes: number | null;
    quality: number | null;
    deficitMinutes: number | null;
  };
  mood: {
    average: number | null;
    logs: number;
    peak: number | null;
    trough: number | null;
  };
  energy: {
    average: number | null;
    logs: number;
  };
  health: {
    weight: number | null;
    steps: number | null;
    heartRate: number | null;
  };
  nutrition: {
    totalCalories: number;
    totalProtein: number;
    totalCarbs: number;
    totalFat: number;
  };
  weather: WeatherLog | null;
}

// ============================================================================
// Analytics
// ============================================================================

export interface MoodAnalytics {
  period: {
    startDate: string;
    endDate: string;
    totalDays: number;
  };
  totals: {
    logs: number;
  };
  averages: {
    mood: number | null;
    energy: number | null;
    stress: number | null;
    anxiety: number | null;
    focus: number | null;
  };
  distribution: Array<{
    rating: number;
    count: number;
    percentage: number;
  }>;
  trends: Array<{
    date: string;
    mood: number;
    energy: number | null;
    stress: number | null;
  }>;
  byTimeOfDay: Array<{
    period: TimeOfDayPeriod;
    averageMood: number | null;
    logs: number;
  }>;
  triggers: Array<{
    trigger: string;
    count: number;
    averageMood: number | null;
  }>;
  activities: Array<{
    activity: string;
    count: number;
    averageMood: number | null;
  }>;
  bestDay: {
    date: string;
    averageMood: number;
  } | null;
  worstDay: {
    date: string;
    averageMood: number;
  } | null;
}

export interface EnergyAnalytics {
  period: {
    startDate: string;
    endDate: string;
    totalDays: number;
  };
  totals: {
    logs: number;
  };
  averages: {
    energy: number | null;
  };
  trends: Array<{
    date: string;
    energy: number;
  }>;
  byTimeOfDay: Array<{
    period: TimeOfDayPeriod;
    averageEnergy: number | null;
    logs: number;
  }>;
}

export interface HealthMetricAnalytics {
  metricType: HealthMetricType;
  period: {
    startDate: string;
    endDate: string;
  };
  latest: HealthMetricListItem | null;
  average: number | null;
  min: {
    date: string;
    value: number;
  } | null;
  max: {
    date: string;
    value: number;
  } | null;
  trend: 'IMPROVING' | 'DECLINING' | 'STABLE' | 'NO_DATA';
  dataPoints: Array<{
    date: string;
    value: number;
  }>;
}

export interface NutritionAnalytics {
  period: {
    startDate: string;
    endDate: string;
  };
  daysTracked: number;
  averages: {
    calories: number;
    protein: number;
    carbs: number;
    fat: number;
    fiber: number;
    sugar: number;
    sodium: number;
  };
  byMealType: Array<{
    mealType: MealType;
    count: number;
    averageCalories: number;
  }>;
  trends: Array<{
    date: string;
    calories: number;
    protein: number;
  }>;
  topFoods: Array<{
    foodName: string;
    count: number;
    averageCalories: number;
  }>;
}

export interface WeatherAnalytics {
  period: {
    startDate: string;
    endDate: string;
  };
  daysTracked: number;
  conditionCounts: Partial<Record<WeatherCondition, number>>;
  averageTemperature: number | null;
  averageHumidity: number | null;
}

export interface SleepMetricsSummary {
  daysTracked: number;
  averageDurationMinutes: number | null;
  averageQuality: number | null;
  averageMoodOnWaking: number | null;
  averageEnergyOnWaking: number | null;
  feltRestedPercentage: number | null;
  cumulativeDeficitMinutes: number | null;
}

export interface WellnessCorrelation {
  moodEnergy: number | null;
  sleepMood: number | null;
  sleepEnergy: number | null;
  weatherMood: number | null;
  sampleSize: number;
}

export interface WellnessAnalytics {
  period: {
    startDate: string;
    endDate: string;
    totalDays: number;
  };
  mood: MoodAnalytics;
  energy: EnergyAnalytics;
  health: HealthMetricAnalytics[];
  nutrition: NutritionAnalytics;
  weather: WeatherAnalytics;
  sleep: SleepMetricsSummary;
  correlations: WellnessCorrelation;
  summaries: WellnessDailySummary[];
}

// ============================================================================
// Queries & Pagination
// ============================================================================

export interface Pagination {
  page: number;
  pageSize: number;
  total: number;
  hasMore: boolean;
}

export interface MoodLogQueryParams {
  date?: string;
  dateFrom?: string;
  dateTo?: string;
  mood?: number;
  sortBy?: 'timestamp' | 'mood' | 'energy';
  sortOrder?: 'asc' | 'desc';
  page?: number;
  pageSize?: number;
}

export interface MoodLogListResponse {
  success: boolean;
  logs: MoodLogListItem[];
  pagination: Pagination;
}

export interface EnergyLogQueryParams {
  date?: string;
  dateFrom?: string;
  dateTo?: string;
  energyLevel?: number;
  sortBy?: 'timestamp' | 'energyLevel';
  sortOrder?: 'asc' | 'desc';
  page?: number;
  pageSize?: number;
}

export interface EnergyLogListResponse {
  success: boolean;
  logs: EnergyLogListItem[];
  pagination: Pagination;
}

export interface HealthMetricQueryParams {
  metricType?: HealthMetricType;
  dateFrom?: string;
  dateTo?: string;
  source?: string;
  sortBy?: 'date' | 'value';
  sortOrder?: 'asc' | 'desc';
  page?: number;
  pageSize?: number;
}

export interface HealthMetricListResponse {
  success: boolean;
  metrics: HealthMetricListItem[];
  pagination: Pagination;
}

export interface NutritionQueryParams {
  dateFrom?: string;
  dateTo?: string;
  mealType?: MealType;
  search?: string;
  sortBy?: 'date' | 'calories' | 'foodName';
  sortOrder?: 'asc' | 'desc';
  page?: number;
  pageSize?: number;
}

export interface NutritionListResponse {
  success: boolean;
  entries: NutritionEntryListItem[];
  pagination: Pagination;
}

export interface WeatherQueryParams {
  dateFrom?: string;
  dateTo?: string;
  condition?: WeatherCondition;
}

export interface WellnessQueryParams {
  dateFrom?: string;
  dateTo?: string;
  include?: Array<'sleep' | 'mood' | 'energy' | 'health' | 'nutrition' | 'weather'>;
}

// ============================================================================
// Type Guards
// ============================================================================

export function isMoodLogWithContext(log: unknown): log is MoodLogWithContext {
  return (
    typeof log === 'object' &&
    log !== null &&
    'id' in log &&
    'mood' in log &&
    'triggers' in log &&
    Array.isArray((log as MoodLogWithContext).triggers)
  );
}

export function isValidHealthMetricType(value: unknown): value is HealthMetricType {
  return (
    typeof value === 'string' &&
    ['WEIGHT', 'BODY_FAT', 'STEPS', 'HEART_RATE', 'BLOOD_PRESSURE'].includes(value)
  );
}

export function isValidMealType(value: unknown): value is MealType {
  return (
    typeof value === 'string' &&
    ['BREAKFAST', 'LUNCH', 'DINNER', 'SNACK'].includes(value)
  );
}

export function isValidScaleRating(value: unknown): value is number {
  return typeof value === 'number' && value >= 1 && value <= 5;
}

// ============================================================================
// Utility Types
// ============================================================================

export type MoodLogsByDate = Record<string, MoodLogListItem[]>;

export type EnergyLogsByDate = Record<string, EnergyLogListItem[]>;

export type WellnessDataType = 'sleep' | 'mood' | 'energy' | 'health' | 'nutrition' | 'weather';