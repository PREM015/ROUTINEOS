import { THRESHOLDS } from '@/config/scoring';
import { ScoreRepository } from '@/server/repositories/score.repository';
import { StreakRepository } from '@/server/repositories/streak.repository';
import {
  STREAK_MILESTONES,
  calculateLongestStreak,
  calculateCurrentStreak,
  daysUntilMilestone,
  nextStreakMilestone,
} from '@/server/domain/streak/streak-calculator';
import type { DateRange, StreakAnalytics } from '@/types/analytics';

/**
 * Streak Analytics
 * Current/longest streak breakdowns, history, milestones, and risk projection.
 */

const scoreRepository = new ScoreRepository();
const streakRepository = new StreakRepository();

const MS_PER_DAY = 86_400_000;

function toMs(dateStr: string): number {
  const [y = '1970', m = '1', d = '1'] = dateStr.split('-');
  return Date.UTC(Number(y), Number(m) - 1, Number(d));
}

function addDays(dateStr: string, days: number): string {
  return new Date(toMs(dateStr) + days * MS_PER_DAY).toISOString().slice(0, 10);
}

function isActiveDate(score: { coreScore: number | null; isMinimumDay: boolean }): boolean {
  return score.isMinimumDay === true || score.coreScore !== null;
}

interface ContiguousRun {
  start: string;
  end: string;
  length: number;
}

function contiguousRuns(activeDates: string[]): ContiguousRun[] {
  const sorted = [...new Set(activeDates)].sort((a, b) => toMs(a) - toMs(b));
  const runs: ContiguousRun[] = [];

  for (const date of sorted) {
    const last = runs[runs.length - 1];
    if (last && date === addDays(last.end, 1)) {
      last.end = date;
      last.length++;
    } else {
      runs.push({ start: date, end: date, length: 1 });
    }
  }

  return runs;
}

/**
 * For each milestone length, the date the user first reached that many
 * consecutive active days within the range.
 */
function milestonesFromRuns(runs: ContiguousRun[]): Array<{ type: string; days: number; reachedDate: string }> {
  const milestones: Array<{ type: string; days: number; reachedDate: string }> = [];
  for (const milestoneDays of STREAK_MILESTONES) {
    for (const run of runs) {
      if (run.length < milestoneDays) continue;
      const reachedDate = addDays(run.start, milestoneDays - 1);
      milestones.push({ type: 'current', days: milestoneDays, reachedDate });
      break;
    }
  }
  return milestones;
}

/**
 * Full streak report with a daily timeline, milestone history, and risk
 * projection based on how recently the streak was last completed.
 */
export async function streakAnalytics(userId: string, range: DateRange): Promise<StreakAnalytics> {
  const [scores, streak, uncelebratedMilestones] = await Promise.all([
    scoreRepository.findByRange(userId, range.startDate, range.endDate),
    streakRepository.findByUserId(userId),
    streakRepository.getUncelebratedMilestones(userId),
  ]);

  const activeDates = scores
    .filter(score => isActiveDate(score))
    .map(score => score.date);
  const restDates = new Set(scores.filter(score => score.isRestDay).map(score => score.date));

  const current = calculateCurrentStreak(activeDates, range.endDate, { restDates });
  const longest = calculateLongestStreak(activeDates, { restDates });
  const longestCore = calculateLongestStreak(
    scores.filter(score => score.coreScore !== null).map(score => score.date),
    { restDates }
  );
  const longestGrowth = calculateLongestStreak(
    scores.filter(score => score.growthScore !== null).map(score => score.date),
    { restDates }
  );
  const longestMinimum = calculateLongestStreak(
    scores.filter(score => score.isMinimumDay).map(score => score.date),
    { restDates }
  );

  const completedDays = activeDates.length;
  const minimumDays = scores.filter(score => score.isMinimumDay).length;
  const restDays = scores.filter(score => score.isRestDay).length;
  const perfectDays = scores.filter(
    score => score.totalScore !== null && score.totalScore >= THRESHOLDS.achievements.perfectDay
  ).length;

  const milestoneUncelebrated = new Set(
    uncelebratedMilestones
      .filter(milestone => milestone.streakType === 'current')
      .map(milestone => milestone.milestoneDays)
  );

  const milestones = milestonesFromRuns(contiguousRuns(activeDates)).map(milestone => ({
    type: milestone.type,
    days: milestone.days,
    reachedDate: milestone.reachedDate,
    celebrated: !milestoneUncelebrated.has(milestone.days),
  }));

  const timeline = scores.map(score => ({
    date: score.date,
    hasStreak: isActiveDate(score),
    isMinimumDay: score.isMinimumDay,
    isRestDay: score.isRestDay,
    score: score.totalScore,
  }));

  const lastCompleted = streak?.lastCompletedDate ?? null;
  let riskLevel: 'LOW' | 'MEDIUM' | 'HIGH';
  if (current === 0) {
    riskLevel = 'HIGH';
  } else if (lastCompleted === null || lastCompleted < range.endDate) {
    riskLevel = 'HIGH';
  } else {
    const gap = Math.round((toMs(range.endDate) - toMs(lastCompleted)) / MS_PER_DAY);
    riskLevel = gap > THRESHOLDS.warnings.streakAtRisk ? 'HIGH' : 'MEDIUM';
  }

  return {
    current: {
      total: streak?.currentStreak ?? current,
      core: streak?.coreStreak ?? longestCore,
      growth: streak?.growthStreak ?? longestGrowth,
      minimum: streak?.minimumDayStreak ?? longestMinimum,
    },
    longest: {
      total: Math.max(streak?.longestStreak ?? 0, longest),
      core: longestCore,
      growth: longestGrowth,
      minimum: longestMinimum,
    },
    history: {
      totalDays: scores.length,
      completedDays,
      minimumDays,
      restDays,
      perfectDays,
    },
    milestones,
    timeline,
    projections: {
      nextMilestone: nextStreakMilestone(current),
      daysToNextMilestone: daysUntilMilestone(current),
      riskLevel,
    },
  };
}