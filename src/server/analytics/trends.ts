import { ScoreRepository } from '@/server/repositories/score.repository';
import { SleepRepository } from '@/server/repositories/sleep.repository';
import type { DateRange, TrendAnalysis } from '@/types/analytics';

/**
 * Trend Analytics
 * Linear-regression-backed trend lines over daily scores or sleep duration.
 */

const scoreRepository = new ScoreRepository();
const sleepRepository = new SleepRepository();

interface TrendPoint {
  date: string;
  value: number;
}

interface TrendLine {
  slope: number;
  intercept: number;
  direction: 'IMPROVING' | 'DECLINING' | 'FLAT';
}

/**
 * Ordinary-least-squares regression over a monotonic set of data points.
 * Returns slope, intercept, and direction based on the sign of the slope.
 */
export function linearRegression(points: TrendPoint[]): TrendLine {
  const n = points.length;
  if (n === 0) return { slope: 0, intercept: 0, direction: 'FLAT' };
  if (n === 1) return { slope: 0, intercept: points[0]?.value ?? 0, direction: 'FLAT' };

  const sumX = (n - 1) * n / 2;
  const sumY = points.reduce((acc, point) => acc + point.value, 0);
  const sumXY = points.reduce((acc, point, index) => acc + index * point.value, 0);
  const sumX2 = (n - 1) * n * (2 * n - 1) / 6;

  const meanX = sumX / n;
  const meanY = sumY / n;

  const denominator = sumX2 - n * meanX * meanX;
  if (denominator === 0) return { slope: 0, intercept: meanY, direction: 'FLAT' };

  const slope = (sumXY - n * meanX * meanY) / denominator;
  const intercept = meanY - slope * meanX;

  const totalChange = slope * (n - 1);
  const direction: TrendLine['direction'] =
    totalChange > 0.05 * Math.abs(meanY || 1)
      ? 'IMPROVING'
      : totalChange < -0.05 * Math.abs(meanY || 1)
        ? 'DECLINING'
        : 'FLAT';

  return { slope, intercept, direction };
}

function strengthFromR2(points: TrendPoint[], line: TrendLine): number {
  if (points.length < 2) return 0;
  const meanY = points.reduce((sum, point) => sum + point.value, 0) / points.length;
  let ssTotal = 0;
  let ssResidual = 0;
  for (let i = 0; i < points.length; i++) {
    const predicted = line.slope * i + line.intercept;
    ssResidual += Math.pow((points[i]?.value ?? 0) - predicted, 2);
    ssTotal += Math.pow((points[i]?.value ?? 0) - meanY, 2);
  }
  if (ssTotal === 0) return 0;
  return Math.round(Math.max(0, 1 - ssResidual / ssTotal) * 100) / 100;
}

function round(value: number, decimals = 2): number {
  const factor = Math.pow(10, decimals);
  return Math.round(value * factor) / factor;
}

function fromIndex(points: TrendPoint[], index: number): number {
  return index >= 0 && index < points.length
    ? points[index]?.value ?? 0
    : 0;
}

/**
 * Full trend analysis over a date range for either `score` or `sleep`
 * metric type, including a historical series, regression, and a single-
 * point forecast with confidence estimate.
 */
export async function trendAnalysis(
  userId: string,
  metric: 'score' | 'sleep',
  range: DateRange
): Promise<TrendAnalysis> {
  const [scores, sleepLogs] = await Promise.all([
    scoreRepository.findByRange(userId, range.startDate, range.endDate),
    sleepRepository.findByRange(userId, range.startDate, range.endDate),
  ]);

  let dataPoints: TrendPoint[];
  if (metric === 'sleep') {
    dataPoints = sleepLogs
      .filter(log => log.actualDurationMinutes !== null)
      .map(log => ({
        date: log.date,
        value: log.actualDurationMinutes as number,
      }));
  } else {
    dataPoints = scores
      .filter(score => score.totalScore !== null)
      .map(score => ({
        date: score.date,
        value: score.totalScore as number,
      }));
  }

  const line = linearRegression(dataPoints);
  const first = fromIndex(dataPoints, 0);
  const current = fromIndex(dataPoints, dataPoints.length - 1);
  const strength = strengthFromR2(dataPoints, line);

  return {
    metric,
    period: range,
    direction: line.direction === 'FLAT' ? 'STABLE' : line.direction,
    strength,
    current,
    previous: first,
    change: {
      absolute: round(current - first),
      percentage: first === 0 ? 0 : round(((current - first) / first) * 100),
    },
    forecast: {
      nextPeriod: round(line.slope * dataPoints.length + line.intercept),
      confidence: strength,
    },
    dataPoints: dataPoints.map(point => ({ date: point.date, value: round(point.value) })),
  };
}

/**
 * Lightweight trend series for charting without full analysis overhead.
 * Returns a LinearRegression over a monotonic data series for use by
 * client-side chart libraries.
 */
export async function trendSeries(
  userId: string,
  from: string,
  to: string
): Promise<{ period: DateRange; line: TrendLine; dataPoints: TrendPoint[] }> {
  const scores = await scoreRepository.findByRange(userId, from, to);
  const dataPoints = scores
    .filter(score => score.totalScore !== null)
    .map(score => ({ date: score.date, value: score.totalScore as number }));

  return {
    period: { startDate: from, endDate: to },
    line: linearRegression(dataPoints),
    dataPoints,
  };
}