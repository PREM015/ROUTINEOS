import type { SleepLog } from '@prisma/client';

/**
 * Sleep Tracking Types
 * Complete type system for sleep tracking and analysis
 */

// ============================================================================
// Core Sleep Types
// ============================================================================

export interface SleepLogWithAnalysis extends SleepLog {
  analysis: SleepAnalysis;
}

// ============================================================================
// Sleep Logging
// ============================================================================

export interface CreateSleepLogInput {
  date: string; // YYYY-MM-DD (wake-up date)
  targetBedtime?: string; // HH:mm
  targetWakeTime?: string; // HH:mm
  actualBedtime: string; // HH:mm or YYYY-MM-DD HH:mm for full datetime
  actualWakeTime: string; // HH:mm or YYYY-MM-DD HH:mm for full datetime
  quality?: number; // 1-5
  wakeUpCount?: number;
  feltRested?: boolean;
  moodOnWaking?: number; // 1-5
  energyOnWaking?: number; // 1-5
  notes?: string;
}

export interface UpdateSleepLogInput {
  targetBedtime?: string;
  targetWakeTime?: string;
  actualBedtime?: string;
  actualWakeTime?: string;
  quality?: number;
  wakeUpCount?: number;
  feltRested?: boolean;
  moodOnWaking?: number;
  energyOnWaking?: number;
  notes?: string;
}

export interface CreateSleepLogResponse {
  success: boolean;
  log?: SleepLogWithAnalysis;
  conflicts?: SleepConflict[];
  message?: string;
}

export interface UpdateSleepLogResponse {
  success: boolean;
  log?: SleepLogWithAnalysis;
  conflicts?: SleepConflict[];
  message?: string;
}

// ============================================================================
// Sleep Analysis
// ============================================================================

export interface SleepAnalysis {
  duration: {
    planned: number; // minutes
    actual: number; // minutes
    difference: number; // minutes (actual - planned)
  };
  timing: {
    bedtimeVariance: number; // minutes from target
    wakeTimeVariance: number; // minutes from target
    isConsistent: boolean;
  };
  quality: {
    rating: number | null; // 1-5
    feltRested: boolean | null;
    interruptions: number | null;
    qualityScore: number; // 0-100 calculated score
  };
  deficit: {
    tonightDeficit: number; // minutes
    weeklyDeficit: number; // minutes (if available)
    monthlyDeficit: number; // minutes (if available)
  };
  recommendations: string[];
}

// ============================================================================
// Sleep Conflicts
// ============================================================================

export interface SleepConflict {
  type: 'ROUTINE_OVERLAP' | 'INSUFFICIENT_DURATION' | 'UNUSUAL_PATTERN';
  message: string;
  severity: 'WARNING' | 'ERROR';
  conflictingItem?: {
    type: 'ROUTINE_BLOCK' | 'HABIT' | 'EVENT';
    id: string;
    name: string;
  };
}

// ============================================================================
// Sleep Schedule
// ============================================================================

export interface SleepSchedule {
  targetBedtime: string; // HH:mm
  targetWakeTime: string; // HH:mm
  targetDuration: number; // minutes
  flexibility: {
    bedtimeWindow: number; // ±minutes
    wakeTimeWindow: number; // ±minutes
  };
}

export interface UpdateSleepScheduleInput {
  targetBedtime?: string;
  targetWakeTime?: string;
  minSleepDuration?: number;
  sleepReminder?: boolean;
  sleepReminderTime?: string;
}

export interface UpdateSleepScheduleResponse {
  success: boolean;
  schedule?: SleepSchedule;
  message?: string;
}

// ============================================================================
// Sleep Analytics
// ============================================================================

export interface SleepAnalytics {
  period: {
    startDate: string;
    endDate: string;
    totalDays: number;
    daysWithData: number;
  };
  averages: {
    duration: number; // minutes
    bedtime: string; // HH:mm average
    wakeTime: string; // HH:mm average
    quality: number | null; // 1-5
    interruptions: number | null;
  };
  trends: {
    date: string;
    duration: number;
    quality: number | null;
    deficit: number;
  }[];
  consistency: {
    bedtimeVariance: number; // std deviation in minutes
    wakeTimeVariance: number; // std deviation in minutes
    isConsistent: boolean;
  };
  quality: {
    averageRating: number | null;
    daysFeelRested: number;
    percentageRested: number;
    averageInterruptions: number | null;
  };
  debt: {
    totalDeficit: number; // minutes
    averageDeficit: number; // minutes per day
    daysWithDeficit: number;
    largestDeficit: {
      date: string;
      minutes: number;
    } | null;
  };
  best: {
    date: string;
    duration: number;
    quality: number | null;
  } | null;
  worst: {
    date: string;
    duration: number;
    quality: number | null;
  } | null;
}

// ============================================================================
// Sleep Patterns
// ============================================================================

export interface SleepPattern {
  patternType: 'EARLY_BIRD' | 'NIGHT_OWL' | 'VARIABLE' | 'BIPHASIC';
  confidence: number; // 0-1
  characteristics: {
    typicalBedtime: string; // HH:mm
    typicalWakeTime: string; // HH:mm
    typicalDuration: number; // minutes
    consistency: number; // 0-1
  };
  recommendations: string[];
}

// ============================================================================
// Sleep Score
// ============================================================================

export interface SleepScore {
  date: string;
  score: number; // 0-100
  components: {
    duration: {
      score: number;
      weight: number;
      contribution: number;
    };
    timing: {
      score: number;
      weight: number;
      contribution: number;
    };
    quality: {
      score: number;
      weight: number;
      contribution: number;
    };
    consistency: {
      score: number;
      weight: number;
      contribution: number;
    };
  };
  grade: 'EXCELLENT' | 'GOOD' | 'FAIR' | 'POOR';
  insights: string[];
}

// ============================================================================
// Sleep History
// ============================================================================

export interface SleepHistoryEntry {
  date: string;
  actualBedtime: string;
  actualWakeTime: string;
  duration: number;
  quality: number | null;
  feltRested: boolean | null;
  deficit: number;
  notes: string | null;
}

export interface SleepHistoryRange {
  startDate: string;
  endDate: string;
  entries: SleepHistoryEntry[];
  summary: {
    averageDuration: number;
    averageQuality: number | null;
    totalDeficit: number;
    daysTracked: number;
  };
}

// ============================================================================
// Sleep Goals
// ============================================================================

export interface SleepGoal {
  targetDuration: number; // minutes
  targetBedtime: string; // HH:mm
  targetWakeTime: string; // HH:mm
  minQuality: number; // 1-5
  maxInterruptions: number;
}

export interface SleepGoalProgress {
  goal: SleepGoal;
  current: {
    averageDuration: number;
    averageBedtime: string;
    averageWakeTime: string;
    averageQuality: number | null;
    averageInterruptions: number | null;
  };
  progress: {
    durationProgress: number; // percentage
    timingProgress: number; // percentage
    qualityProgress: number; // percentage
    overallProgress: number; // percentage
  };
  onTrack: boolean;
}

// ============================================================================
// Helper Functions
// ============================================================================

export function calculateSleepDuration(
  bedtime: string,
  wakeTime: string
): number {
  const [bedHour, bedMin] = bedtime.split(':').map(Number);
  const [wakeHour, wakeMin] = wakeTime.split(':').map(Number);
  
  let bedMinutes = bedHour * 60 + bedMin;
  let wakeMinutes = wakeHour * 60 + wakeMin;
  
  // Handle overnight sleep
  if (wakeMinutes <= bedMinutes) {
    wakeMinutes += 24 * 60;
  }
  
  return wakeMinutes - bedMinutes;
}

export function calculateSleepDeficit(
  actualDuration: number,
  targetDuration: number
): number {
  return Math.max(0, targetDuration - actualDuration);
}

export function isSleepConsistent(
  logs: SleepLog[],
  maxVarianceMinutes: number = 30
): boolean {
  if (logs.length < 3) return false;
  
  const bedtimes = logs
    .filter(log => log.actualBedtime)
    .map(log => {
      const [hour, min] = log.actualBedtime!.split(':').map(Number);
      return hour * 60 + min;
    });
  
  if (bedtimes.length < 3) return false;
  
  const mean = bedtimes.reduce((a, b) => a + b, 0) / bedtimes.length;
  const variance = bedtimes.reduce((sum, time) => sum + Math.pow(time - mean, 2), 0) / bedtimes.length;
  const stdDev = Math.sqrt(variance);
  
  return stdDev <= maxVarianceMinutes;
}

// ============================================================================
// Type Guards
// ============================================================================

export function isSleepLogWithAnalysis(
  log: unknown
): log is SleepLogWithAnalysis {
  return (
    typeof log === 'object' &&
    log !== null &&
    'id' in log &&
    'analysis' in log &&
    typeof (log as SleepLogWithAnalysis).analysis === 'object'
  );
}