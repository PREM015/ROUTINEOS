"use client";

/**
 * EnergyChart — visualizes time-of-day energy patterns. By default it fetches
 * the analysis for the last 30 days from GET /api/wellness/energy?analyze=true,
 * or you can pass an `EnergyPatternResult` in directly. The bar chart shows
 * the average energy per hour, with recommended high-energy hours green and
 * low-energy hours amber.
 *
 * Usage:
 *   <EnergyChart data={stats.energy} />
 *   <EnergyChart />
 */
import * as React from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { Flame, Snowflake } from 'lucide-react';
import type { EnergyPatternResult, HourBand } from '@/lib/wellness/energy-patterns';
import { apiRequest } from '@/lib/api-client';
import { Badge, Card, Spinner } from '@/components/ui';
import { cn } from '@/lib/utils';

export interface EnergyChartProps {
  data?: EnergyPatternResult | null;
  className?: string;
}

const AVERAGE_REFERENCE = 3;
const HIGH_COLOR = '#22c55e';
const LOW_COLOR = '#f59e0b';
const DEFAULT_COLOR = '#3b82f6';

const TOOLTIP_STYLE: React.CSSProperties = {
  backgroundColor: '#18181b',
  border: '1px solid #27272a',
  borderRadius: '8px',
  color: '#fff',
};

function hourLabel(hour: number): string {
  return `${String(hour).padStart(2, '0')}:00`;
}

interface BarDatum extends HourBand {
  label: string;
  color: string;
}

export default function EnergyChart({ data, className }: EnergyChartProps) {
  const [result, setResult] = React.useState<EnergyPatternResult | null>(data ?? null);
  const [loading, setLoading] = React.useState(!data);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    setResult(data ?? null);
  }, [data]);

  React.useEffect(() => {
    if (data) return;
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const analysis = await apiRequest<EnergyPatternResult>('/api/wellness/energy', {
          query: { analyze: 'true' },
        });
        if (!cancelled) setResult(analysis);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load energy data');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [data]);

  const bars: BarDatum[] = React.useMemo(() => {
    if (!result) return [];
    return result.byHour.map((band) => {
      const recommended = result.recommendedHighEnergyHours.includes(band.hour);
      const low = result.lowEnergyHours.includes(band.hour);
      return {
        ...band,
        label: hourLabel(band.hour),
        color: recommended ? HIGH_COLOR : low ? LOW_COLOR : DEFAULT_COLOR,
      };
    });
  }, [result]);

  return (
    <Card className={cn('p-5', className)}>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-lg font-semibold text-gray-900">Energy patterns</h3>
        {result && (
          <div className="flex flex-wrap gap-1.5">
            {result.peakHour !== null && (
              <Badge variant="success" className="gap-1">
                <Flame className="h-3 w-3" />
                Peak {hourLabel(result.peakHour)}
              </Badge>
            )}
            {result.troughHour !== null && (
              <Badge variant="warning" className="gap-1">
                <Snowflake className="h-3 w-3" />
                Trough {hourLabel(result.troughHour)}
              </Badge>
            )}
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
      ) : !result || bars.length === 0 ? (
        <p className="py-8 text-center text-sm text-gray-500">
          No energy check-ins yet — log your energy through a check-in to see patterns.
        </p>
      ) : (
        <>
          <div className="h-56 w-full" role="img" aria-label="Average energy by hour of day">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={bars} margin={{ top: 4, right: 8, bottom: 0, left: -20 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" vertical={false} />
                <XAxis dataKey="label" stroke="#9ca3af" fontSize={11} tickLine={false} axisLine={false} interval={1} />
                <YAxis domain={[0, 5]} ticks={[1, 2, 3, 4, 5]} stroke="#9ca3af" fontSize={11} tickLine={false} axisLine={false} />
                <ReferenceLine y={AVERAGE_REFERENCE} stroke="#9ca3af" strokeDasharray="4 4" />
                <Tooltip
                  contentStyle={TOOLTIP_STYLE}
                  labelStyle={{ color: '#a1a1aa' }}
                  itemStyle={{ color: '#fff' }}
                  cursor={{ fill: 'rgba(59, 130, 246, 0.08)' }}
                />
                <Bar dataKey="averageEnergy" name="Avg energy" radius={[4, 4, 0, 0]}>
                  {bars.map((bar) => (
                    <Cell key={bar.hour} fill={bar.color} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>

          <div className="mt-3 flex flex-wrap gap-4 text-xs text-gray-500">
            <span className="inline-flex items-center gap-1.5">
              <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: HIGH_COLOR }} aria-hidden="true" />
              Recommended high-energy hours
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: LOW_COLOR }} aria-hidden="true" />
              Low-energy dip hours
            </span>
          </div>
        </>
      )}
    </Card>
  );
}