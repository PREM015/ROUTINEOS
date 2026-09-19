import { describe, expect, it } from 'vitest';

import {
  correlate,
  correlateMoodWithSleep,
  correlateWithDailyFactor,
  correlationStrength,
  pearsonCorrelation,
} from '../../src/lib/wellness/correlations';
import {
  analyzeEnergyPatterns,
  energyByHour,
  findPeakHour,
  findTroughHour,
} from '../../src/lib/wellness/energy-patterns';
import { generateWellnessInsights } from '../../src/lib/wellness/insights';
import {
  analyzeMood,
  averageEnergy,
  averageMood,
  findBestMoodDay,
  findWorstMoodDay,
  moodDistribution,
  moodTrend,
} from '../../src/lib/wellness/mood-analytics';

describe('mood analytics', () => {
  it('averages mood and energy values', () => {
    const logs = [
      { date: '2026-09-17', mood: 4, energy: 3 },
      { date: '2026-09-18', mood: 3, energy: 5 },
    ];
    expect(averageMood(logs)).toBe(3.5);
    expect(averageEnergy(logs)).toBe(4);
    expect(averageEnergy([{ date: '2026-09-17', mood: 4 }])).toBeNull();
  });

  it('builds a five-bucket distribution with percentages', () => {
    const distribution = moodDistribution([
      { date: '2026-09-17', mood: 4 },
      { date: '2026-09-18', mood: 4 },
      { date: '2026-09-19', mood: 1 },
    ]);
    expect(distribution).toHaveLength(5);
    expect(distribution.find(item => item.value === 4)).toEqual({
      value: 4,
      count: 2,
      percentage: 67,
    });
    expect(distribution.find(item => item.value === 1)).toEqual({
      value: 1,
      count: 1,
      percentage: 33,
    });
    expect(distribution.find(item => item.value === 3)?.count).toBe(0);
  });

  it('clamps extreme ratings before bucketing', () => {
    const distribution = moodDistribution([
      { date: '2026-09-17', mood: 99 },
      { date: '2026-09-18', mood: -5 },
    ]);
    expect(distribution.find(item => item.value === 5)?.count).toBe(1);
    expect(distribution.find(item => item.value === 1)?.count).toBe(1);
  });

  it('detects an improving linear trend across the window', () => {
    const trend = moodTrend([
      { date: '2026-09-15', mood: 2 },
      { date: '2026-09-16', mood: 3 },
      { date: '2026-09-17', mood: 4 },
    ]);
    expect(trend.slope).toBe(1);
    expect(trend.change).toBe(2);
    expect(trend.direction).toBe('IMPROVING');
  });

  it('reports a flat trend with a single check-in', () => {
    expect(moodTrend([])).toEqual({ slope: 0, direction: 'FLAT', change: 0 });
    expect(moodTrend([{ date: '2026-09-17', mood: 4 }])).toEqual({
      slope: 0,
      direction: 'FLAT',
      change: 0,
    });
  });

  it('picks best/worst days, breaking ties by energy', () => {
    const logs = [
      { date: '2026-09-17', mood: 4, energy: 1 },
      { date: '2026-09-18', mood: 4, energy: 5 },
      { date: '2026-09-19', mood: 2, energy: 5 },
    ];
    expect(findBestMoodDay(logs)?.date).toBe('2026-09-18');
    expect(findWorstMoodDay(logs)?.date).toBe('2026-09-19');
    expect(findBestMoodDay([])).toBeNull();
  });

  it('aggregates a full mood analysis', () => {
    const result = analyzeMood([
      { date: '2026-09-17', mood: 4, energy: 3 },
    ]);
    expect(result.averageMood).toBe(4);
    expect(result.averageEnergy).toBe(3);
    expect(result.count).toBe(1);
    expect(result.daysTracked).toBe(1);
    expect(result.distribution).toHaveLength(5);
    expect(result.moodTrend.direction).toBe('FLAT');
  });
});

describe('energy pattern analytics', () => {
  it('groups samples by hour with averages', () => {
    const bands = energyByHour([
      { date: '2026-09-17', time: '09:00', energy: 5 },
      { date: '2026-09-18', time: '09:30', energy: 4 },
      { date: '2026-09-17', time: '14:00', energy: 2 },
    ]);
    expect(bands).toContainEqual({ hour: 9, count: 2, averageEnergy: 4.5 });
    expect(bands).toContainEqual({ hour: 14, count: 1, averageEnergy: 2 });
  });

  it('only reports peak and trough hours with enough samples', () => {
    const points = [
      { date: '2026-09-17', time: '09:00', energy: 5 },
      { date: '2026-09-18', time: '09:30', energy: 4 },
      { date: '2026-09-17', time: '14:00', energy: 2 },
      { date: '2026-09-18', time: '14:30', energy: 2 },
    ];
    const bands = energyByHour(points);
    expect(findPeakHour(bands)).toEqual({ hour: 9, averageEnergy: 4.5 });
    expect(findTroughHour(bands)).toEqual({ hour: 14, averageEnergy: 2 });
    expect(findPeakHour(energyByHour(points.slice(0, 1)))).toBeNull();
  });

  it('recommends high- and low-energy hours from the full analysis', () => {
    const result = analyzeEnergyPatterns([
      { date: '2026-09-17', time: '09:00', energy: 5 },
      { date: '2026-09-18', time: '09:30', energy: 4 },
      { date: '2026-09-17', time: '14:00', energy: 2 },
      { date: '2026-09-18', time: '14:30', energy: 2 },
    ]);
    expect(result.sampleCount).toBe(4);
    expect(result.averageEnergy).toBe(3.3);
    expect(result.peakHour).toBe(9);
    expect(result.troughHour).toBe(14);
    expect(result.recommendedHighEnergyHours).toEqual([9]);
    expect(result.lowEnergyHours).toEqual([14]);
  });

  it('returns empty analytics when there are no samples', () => {
    const result = analyzeEnergyPatterns([]);
    expect(result.averageEnergy).toBe(0);
    expect(result.sampleCount).toBe(0);
    expect(result.peakHour).toBeNull();
    expect(result.byHour).toEqual([]);
  });
});

describe('correlation math', () => {
  it('computes perfect positive and negative Pearson coefficients', () => {
    expect(pearsonCorrelation([1, 2, 3], [2, 4, 6])).toBe(1);
    expect(pearsonCorrelation([1, 2, 3], [6, 4, 2])).toBe(-1);
  });

  it('returns zero for insufficient or constant data', () => {
    expect(pearsonCorrelation([1, 2], [2])).toBe(0);
    expect(pearsonCorrelation([], [])).toBe(0);
    expect(pearsonCorrelation([1, 1, 1], [2, 4, 6])).toBe(0);
  });

  it('classifies correlation strength by magnitude', () => {
    expect(correlationStrength(0.9)).toBe('STRONG');
    expect(correlationStrength(-0.5)).toBe('MODERATE');
    expect(correlationStrength(0.3)).toBe('WEAK');
    expect(correlationStrength(0.1)).toBe('NONE');
  });

  it('produces tagged correlation results', () => {
    expect(correlate([1, 2, 3], [2, 4, 6])).toEqual({
      coefficient: 1,
      strength: 'STRONG',
      inverse: false,
      sampleCount: 3,
    });
    const inverse = correlate([1, 2, 3], [6, 4, 2]);
    expect(inverse.inverse).toBe(true);
    expect(inverse.coefficient).toBe(-1);
  });

  it('aligns moods with daily factors, skipping unpaired days', () => {
    const result = correlateWithDailyFactor(
      [
        { date: '2026-09-17', mood: 4 },
        { date: '2026-09-18', mood: 5 },
        { date: '2026-09-19', mood: 4 },
      ],
      { '2026-09-17': 82, '2026-09-18': 95 }
    );
    expect(result.sampleCount).toBe(2);
    expect(result.coefficient).toBe(1);
    expect(result.strength).toBe('STRONG');
  });

  it('correlates mood with sleep durations', () => {
    const result = correlateMoodWithSleep(
      [
        { date: '2026-09-17', mood: 4 },
        { date: '2026-09-18', mood: 5 },
      ],
      { '2026-09-17': 400, '2026-09-18': 480 }
    );
    expect(result.coefficient).toBe(1);
  });
});

describe('wellness insight generation', () => {
  const emptyMood = analyzeMood([]);
  const emptyEnergy = analyzeEnergyPatterns([]);

  it('defaults to a not-enough-data prompt', () => {
    const insights = generateWellnessInsights(emptyMood, emptyEnergy, { daysAnalyzed: 7 });
    expect(insights).toHaveLength(1);
    expect(insights[0]?.title).toBe('Not enough data yet');
    expect(insights[0]?.tone).toBe('info');
  });

  it('celebrates a strong average mood', () => {
    const insights = generateWellnessInsights(
      analyzeMood([
        { date: '2026-09-17', mood: 5 },
        { date: '2026-09-18', mood: 4 },
      ]),
      emptyEnergy,
      { daysAnalyzed: 2 }
    );
    expect(insights.some(insight => insight.title === 'Mood is strong')).toBe(true);
    expect(insights.some(insight => insight.tone === 'positive')).toBe(true);
  });

  it('warns when mood is declining', () => {
    const insights = generateWellnessInsights(
      analyzeMood([
        { date: '2026-09-17', mood: 5 },
        { date: '2026-09-18', mood: 3 },
      ]),
      emptyEnergy,
      { daysAnalyzed: 2 }
    );
    expect(insights.some(insight => insight.title === 'Mood is declining')).toBe(true);
  });

  it('warns on short and praises on adequate sleep', () => {
    type SleepResult = Parameters<typeof generateWellnessInsights>[3];
    const shortSleep = { averageDuration: 360, score: 50 } as SleepResult;
    const healthySleep = { averageDuration: 480, score: 80 } as SleepResult;

    const short = generateWellnessInsights(emptyMood, emptyEnergy, { daysAnalyzed: 7 }, shortSleep);
    expect(short.some(insight => insight.title === 'Sleep is short')).toBe(true);

    const healthy = generateWellnessInsights(
      emptyMood,
      emptyEnergy,
      { daysAnalyzed: 7 },
      healthySleep
    );
    expect(healthy.some(insight => insight.title === 'Sleep looks healthy')).toBe(true);
  });

  it('surfaces strong sleep-mood correlations', () => {
    type CorrelationResult = Parameters<typeof generateWellnessInsights>[4];
    const strong = { coefficient: 0.8, strength: 'STRONG', inverse: false, sampleCount: 7 } as CorrelationResult;
    const insights = generateWellnessInsights(emptyMood, emptyEnergy, { daysAnalyzed: 7 }, undefined, strong);
    expect(insights.some(insight => insight.title === 'Sleep-mood connection')).toBe(true);
  });
});