/**
 * Wellness insights – pure logic that turns mood/energy/sleep analytics into
 * human-readable, actionable guidance. No DB access.
 */

import type { MoodAnalysisResult } from './mood-analytics';
import type { EnergyPatternResult } from './energy-patterns';
import type { CorrelationResult } from './correlations';
import type { SleepAnalysisResult } from '@/server/domain/sleep/sleep-analyzer';

// ============================================================================
// Types
// ============================================================================

export type InsightTone = 'positive' | 'warning' | 'info';

export interface WellnessInsight {
  tone: InsightTone;
  title: string;
  message: string;
}

export interface WellnessInsightContext {
  /** Number of days the analysis spans. */
  daysAnalyzed: number;
  /** Average sleep duration in minutes, if available. */
  averageSleepMinutes?: number;
}

// ============================================================================
// Building blocks
// ============================================================================

const MOOD_LABELS: Record<number, string> = {
  1: 'low',
  2: 'low',
  3: 'moderate',
  4: 'good',
  5: 'great',
};

function moodLabel(avg: number): string {
  return MOOD_LABELS[Math.round(avg)] ?? 'moderate';
}

// ============================================================================
// Insight generation
// ============================================================================

function moodInsights(analysis: MoodAnalysisResult): WellnessInsight[] {
  const insights: WellnessInsight[] = [];
  if (analysis.count === 0) return insights;

  const avg = analysis.averageMood;
  if (avg >= 4) {
    insights.push({
      tone: 'positive',
      title: 'Mood is strong',
      message: `Your average mood of ${avg}/5 this period was ${moodLabel(avg)}. Keep up whatever is working.`,
    });
  } else if (avg >= 3) {
    insights.push({
      tone: 'info',
      title: 'Mood is steady',
      message: `Your average mood landed at ${avg}/5. Look for small wins to lift it higher.`,
    });
  } else {
    insights.push({
      tone: 'warning',
      title: 'Mood is low',
      message: `An average mood of ${avg}/5 may signal burnout or low recovery. Prioritize rest and lighter goals.`,
    });
  }

  if (analysis.moodTrend.direction === 'IMPROVING') {
    insights.push({
      tone: 'positive',
      title: 'Mood is rising',
      message: `Mood improved by ${Math.round(analysis.moodTrend.change)} point(s) across the period. Your recent habits are paying off.`,
    });
  } else if (analysis.moodTrend.direction === 'DECLINING') {
    insights.push({
      tone: 'warning',
      title: 'Mood is declining',
      message: `Mood slid by ${Math.abs(Math.round(analysis.moodTrend.change))} point(s). Review sleep, energy, and workload.`,
    });
  }

  return insights;
}

function energyInsights(analysis: EnergyPatternResult): WellnessInsight[] {
  const insights: WellnessInsight[] = [];
  if (analysis.sampleCount === 0) return insights;

  if (analysis.peakHour !== null) {
    insights.push({
      tone: 'info',
      title: 'Energy peaks detected',
      message: `On average your energy peaks around ${String(analysis.peakHour).padStart(2, '0')}:00. Schedule deep work and tough goals there.`,
    });
  }

  if (analysis.recommendedHighEnergyHours.length > 0) {
    insights.push({
      tone: 'positive',
      title: 'High-energy windows',
      message: `Hours ${analysis.recommendedHighEnergyHours
        .map(hour => `${String(hour).padStart(2, '0')}:00`)
        .join(', ')} tend to be high-energy. Protect these for focused work.`,
    });
  }

  if (analysis.lowEnergyHours.length > 0) {
    insights.push({
      tone: 'info',
      title: 'Energy dips',
      message: `Energy usually dips around ${analysis.lowEnergyHours
        .map(hour => `${String(hour).padStart(2, '0')}:00`)
        .join(', ')}. Plan breaks or low-effort tasks for those windows.`,
    });
  }

  return insights;
}

function sleepInsights(
  sleep: SleepAnalysisResult | undefined,
  context: WellnessInsightContext
): WellnessInsight[] {
  const insights: WellnessInsight[] = [];
  if (!sleep || sleep.averageDuration === 0) return insights;

  const avgHours = Math.round((sleep.averageDuration / 60) * 10) / 10;
  if (sleep.averageDuration < 420) {
    insights.push({
      tone: 'warning',
      title: 'Sleep is short',
      message: `You are averaging ${avgHours}h of sleep, below the 7h target. Consider earlier bedtimes to protect recovery.`,
    });
  } else {
    insights.push({
      tone: 'positive',
      title: 'Sleep looks healthy',
      message: `You averaged ${avgHours}h of sleep across ${context.daysAnalyzed} day(s).`,
    });
  }

  if (sleep.score < 60) {
    insights.push({
      tone: 'info',
      title: 'Sleep quality can improve',
      message: `Your overall sleep score is ${sleep.score}/100. Consistency and wind-down routines help the most.`,
    });
  }

  return insights;
}

function correlationInsights(
  correlation: CorrelationResult | undefined
): WellnessInsight[] {
  if (!correlation || correlation.sampleCount < 3) return [];

  const direction =
    correlation.coefficient > 0 ? 'raise' : 'lower';
  const kind =
    correlation.strength === 'STRONG'
      ? 'is strongly associated with'
      : 'shows a moderate association with';

  if (correlation.strength === 'NONE' || correlation.strength === 'WEAK') return [];

  return [
    {
      tone: 'info',
      title: 'Sleep-mood connection',
      message: `Longer sleep ${kind} how you feel. On days you ${direction} your sleep, expect your mood to change noticeably.`,
    },
  ];
}

// ============================================================================
// Aggregate entry point
// ============================================================================

/**
 * Generate actionable wellness insights from mood/energy analysis, and
 * optionally sleep analysis + mood/sleep correlation.
 * @example
 * generateWellnessInsights(moodResult, energyResult, { daysAnalyzed: 7 })
 * // => WellnessInsight[]
 */
export function generateWellnessInsights(
  mood: MoodAnalysisResult,
  energy: EnergyPatternResult,
  context: WellnessInsightContext,
  sleep?: SleepAnalysisResult,
  sleepCorrelation?: CorrelationResult
): WellnessInsight[] {
  const insights = [
    ...moodInsights(mood),
    ...energyInsights(energy),
    ...sleepInsights(sleep, context),
    ...correlationInsights(sleepCorrelation),
  ];

  if (insights.length === 0) {
    return [
      {
        tone: 'info',
        title: 'Not enough data yet',
        message: 'Log mood, energy, and sleep regularly to unlock personalized wellness insights.',
      },
    ];
  }

  return insights;
}