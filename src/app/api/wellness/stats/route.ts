import { auth } from '@/lib/auth';
import { SleepRepository } from '@/server/repositories/sleep.repository';
import { MoodRepository } from '@/server/repositories/mood.repository';
import { UserRepository } from '@/server/repositories/user.repository';
import { wellnessQuerySchema } from '@/schemas/wellness.schema';
import { analyzeMood, type MoodLogLike } from '@/lib/wellness/mood-analytics';
import { analyzeEnergyPatterns, type EnergyPoint } from '@/lib/wellness/energy-patterns';
import { correlateMoodWithSleep } from '@/lib/wellness/correlations';
import { generateWellnessInsights } from '@/lib/wellness/insights';
import {
  analyzeSleep,
  type SleepLogLike,
} from '@/server/domain/sleep/sleep-analyzer';
import { NextRequest, NextResponse } from 'next/server';

/**
 * Wellness: Stats Route
 * GET /api/wellness/stats – aggregate mood, energy, and sleep analytics over a
 *                          date range with correlations and insights
 */

function toDateString(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function defaultRange(): { startDate: string; endDate: string } {
  const end = new Date();
  const start = new Date();
  start.setDate(start.getDate() - 29);
  return { startDate: toDateString(start), endDate: toDateString(end) };
}

function toMoodLogLike(log: {
  timestamp: Date;
  mood: number;
  energy?: number | null;
}): MoodLogLike {
  return {
    date: log.timestamp.toISOString().slice(0, 10),
    mood: log.mood,
    energy: log.energy,
    timestamp: log.timestamp.toISOString(),
  };
}

function toEnergyPoint(log: { timestamp: Date; energyLevel: number }): EnergyPoint {
  return {
    date: log.timestamp.toISOString().slice(0, 10),
    time: log.timestamp.toISOString().slice(11, 16),
    energy: log.energyLevel,
  };
}

function toSleepLogLike(log: {
  date: string;
  actualBedtime: string | null;
  actualWakeTime: string | null;
  quality?: number | null;
  wakeUpCount?: number | null;
}): SleepLogLike | null {
  if (!log.actualBedtime || !log.actualWakeTime) return null;
  return {
    date: log.date,
    actualBedtime: log.actualBedtime,
    actualWakeTime: log.actualWakeTime,
    quality: log.quality,
    wakeUpCount: log.wakeUpCount,
  };
}

function daysBetween(startDate: string, endDate: string): number {
  const start = new Date(`${startDate}T00:00:00`).getTime();
  const end = new Date(`${endDate}T00:00:00`).getTime();
  return Math.max(1, Math.round((end - start) / 86400000) + 1);
}

/**
 * GET /api/wellness/stats
 * Aggregate wellness overview for the period: mood summary, energy patterns,
 * sleep analysis, mood↔sleep correlation, and generated insights.
 */
export async function GET(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const queryData = {
      startDate: searchParams.get('startDate') ?? undefined,
      endDate: searchParams.get('endDate') ?? undefined,
      limit: searchParams.get('limit') ? parseInt(searchParams.get('limit')!, 10) : undefined,
      offset: searchParams.get('offset') ? parseInt(searchParams.get('offset')!, 10) : undefined,
    };

    const validated = wellnessQuerySchema.safeParse(queryData);
    if (!validated.success) {
      return NextResponse.json(
        { error: 'Invalid query parameters', details: validated.error.flatten() },
        { status: 400 }
      );
    }

    const range = defaultRange();
    const startDate = validated.data.startDate ?? range.startDate;
    const endDate = validated.data.endDate ?? range.endDate;
    const daysAnalyzed = daysBetween(startDate, endDate);

    const moodRepository = new MoodRepository();
    const sleepRepository = new SleepRepository();

    const moodLogs = await moodRepository.getMoodRange(session.user.id, startDate, endDate);
    const energyLogs = await moodRepository.getEnergyRange(session.user.id, startDate, endDate);
    const sleepLogs = await sleepRepository.findByRange(session.user.id, startDate, endDate);

    const sleepLike = sleepLogs
      .map(toSleepLogLike)
      .filter((log): log is SleepLogLike => log !== null);

    const userRepository = new UserRepository();
    const settings = await userRepository.getSettings(session.user.id);
    const targetMinutes = settings?.minSleepDuration ?? 480;

    const moodAnalysis = analyzeMood(moodLogs.map(toMoodLogLike));
    const energyAnalysis = analyzeEnergyPatterns(energyLogs.map(toEnergyPoint));
    const sleepAnalysis = analyzeSleep(sleepLike, targetMinutes);

    const sleepMinutesByDate: Record<string, number> = {};
    for (const log of sleepLogs) {
      if (log.actualDurationMinutes !== null) {
        sleepMinutesByDate[log.date] = log.actualDurationMinutes;
      }
    }
    const sleepCorrelation = correlateMoodWithSleep(
      moodLogs.map(log => ({
        date: log.timestamp.toISOString().slice(0, 10),
        mood: log.mood,
      })),
      sleepMinutesByDate
    );

    const insights = generateWellnessInsights(
      moodAnalysis,
      energyAnalysis,
      { daysAnalyzed, averageSleepMinutes: sleepAnalysis.averageDuration },
      sleepAnalysis,
      sleepCorrelation
    );

    return NextResponse.json({
      success: true,
      data: {
        period: { startDate, endDate, daysAnalyzed },
        mood: moodAnalysis,
        energy: energyAnalysis,
        sleep: sleepAnalysis,
        correlations: {
          moodWithSleep: sleepCorrelation,
        },
        insights,
      },
    });
  } catch (error) {
    console.error('Error computing wellness stats:', error);
    return NextResponse.json({ error: 'Failed to compute wellness stats' }, { status: 500 });
  }
}