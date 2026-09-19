"use client";

/**
 * SleepChart — visualizes actual sleep duration per day against a nightly
 * target, plus a quality line. By default it fetches the last 30 days from
 * GET /api/wellness/sleep, or you can pass `data` in directly.
 *
 * Usage:
 *   <SleepChart data={{ analysis, logs }} targetMinutes={480} />
 *   <SleepChart />
 */
import * as React from 'react';
import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { MoonStar } from 'lucide-react';
import type { SleepAnalysisResult, SleepLogLike } from '@/server/domain/sleep/sleep-analyzer';
import { apiRequest } from '@/lib/api-client';
import { Badge, Card, Spinner } from '@/components/ui';
import { cn } from '@/lib/utils';

export interface SleepChartData {
  analysis: SleepAnalysisResult;
  logs: Array<SleepLogLike & { actualDurationMinutes?: number | null; quality?: number | null }>;
}

export interface SleepChartProps {
  data?: SleepChartData | null;
  /** Nightly target in minutes; used for the reference line. */
  targetMinutes?: number;
  className?: string;
}

const TOOLTIP_STYLE: React.CSSProperties = {
  backgroundColor: '#18181b',
  border: '1px solid #27272a',
  borderRadius: '8px',
  color: '#fff',
};

function hoursLabel(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  return `${h}h ${m.toString().padStart(2, '0')}m`;
}

export default function SleepChart({ data, targetMinutes = 480, className }: SleepChartProps) {
  const [chartData, setChartData] = React.useState<SleepChartData | null>(data ?? null);
  const [loading, setLoading] = React.useState(!data);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    setChartData(data ?? null);
  }, [data]);

  React.useEffect(() => {
    if (data) return;
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const result = await apiRequest<SleepChartData>('/api/wellness/sleep');
        if (!cancelled) setChartData(result);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load sleep data');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [data]);

  const rows = React.useMemo(() => {
    if (!chartData) return [];
    const targetHours = targetMinutes / 60;
    return chartData.logs
      .filter((log) => log.actualDurationMinutes !== null && log.actualDurationMinutes !== undefined)
      .slice()
      .sort((a, b) => a.date.localeCompare(b.date))
      .map((log) => ({
        date: log.date.slice(5),
        fullDate: log.date,
        hours: Number(((log.actualDurationMinutes ?? 0) / 60).toFixed(1)),
        targetHours,
        quality: log.quality ?? null,
      }));
  }, [chartData, targetMinutes]);

  const analysis = chartData?.analysis ?? null;

  return (
    <Card className={cn('p-5', className)}>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <h3 className="flex items-center gap-2 text-lg font-semibold text-gray-900">
          <MoonStar className="h-5 w-5 text-indigo-600" />
          Sleep
        </h3>
        {analysis && (
          <div className="flex flex-wrap gap-1.5">
            <Badge variant="primary">
              Avg {hoursLabel(analysis.averageDuration)} / night
            </Badge>
            <Badge variant="default">Score {analysis.score}</Badge>
          </div>
        )}
      </div>

      {loading ? (
        <div className="flex justify-center py-10">
          <Spinner className="h-6 w-6" />
        </div>
      ) : error ? (
        <p role="alert" className="py-8 text-center text-sm text-red-600">
          {error}
        </p>
      ) : rows.length === 0 ? (
        <p className="py-8 text-center text-sm text-gray-500">
          No sleep logs yet — log last night&apos;s sleep to see trends.
        </p>
      ) : (
        <>
          <div className="h-64 w-full" role="img" aria-label="Sleep duration over the last days">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={rows} margin={{ top: 4, right: 8, bottom: 0, left: -20 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" vertical={false} />
                <XAxis dataKey="date" stroke="#9ca3af" fontSize={11} tickLine={false} axisLine={false} />
                <YAxis stroke="#9ca3af" fontSize={11} tickLine={false} axisLine={false} unit="h" domain={[0, 12]} />
                <ReferenceLine
                  y={targetMinutes / 60}
                  stroke="#22c55e"
                  strokeDasharray="4 4"
                  label={{ value: 'Target', position: 'insideTopRight', fill: '#22c55e', fontSize: 11 }}
                />
                <Tooltip
                  contentStyle={TOOLTIP_STYLE}
                  labelStyle={{ color: '#a1a1aa' }}
                  itemStyle={{ color: '#fff' }}
                />
                <Line
                  type="monotone"
                  dataKey="hours"
                  name="Sleep hours"
                  stroke="#6366f1"
                  strokeWidth={2.5}
                  dot={{ r: 3, fill: '#6366f1', strokeWidth: 0 }}
                  activeDot={{ r: 5 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
          <p className="mt-3 text-xs text-gray-500">
            Target: {hoursLabel(targetMinutes)} per night · bars above the green line are ahead of goal.
          </p>
        </>
      )}
    </Card>
  );
}