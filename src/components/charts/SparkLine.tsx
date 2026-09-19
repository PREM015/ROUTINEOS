"use client";
/**
 * SparkLine — a tiny, axis-free area/line chart for compact trend indicators.
 *
 * Renders a single series as an optionally gradient-filled area with a stroke.
 * No axes, grid or tooltip are drawn so it can sit inline next to labels.
 *
 * Props:
 * - data: dataset of row objects
 * - dataKey: property rendered as the line/area
 * - height:  chart pixel height (default 40)
 * - className: wrapper class
 * - color:  line + gradient color (default blue-500)
 * - showArea: fill the area under the line with a fading gradient
 */

import { useId } from 'react';
import { AreaChart, Area, ResponsiveContainer } from 'recharts';
import { cn } from '@/lib/utils';

export interface SparkLineProps {
  data: Array<Record<string, unknown>>;
  dataKey: string;
  height?: number;
  className?: string;
  color?: string;
  showArea?: boolean;
  ariaLabel?: string;
}

export function SparkLine({
  data,
  dataKey,
  height = 40,
  className,
  color = '#3b82f6',
  showArea = true,
  ariaLabel = 'Trend',
}: SparkLineProps) {
  const gradientId = `sparkline-${useId().replace(/[^a-zA-Z0-9]/g, '')}`;

  if (data.length === 0) {
    return (
      <div
        className={cn('flex items-center justify-center', className)}
        style={{ height }}
        role="img"
        aria-label={`${ariaLabel} — no data`}
      >
        <span className="text-xs text-gray-600">—</span>
      </div>
    );
  }

  return (
    <div
      className={cn('w-full', className)}
      style={{ height }}
      role="img"
      aria-label={ariaLabel}
    >
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 2, right: 0, bottom: 2, left: 0 }}>
          {showArea && (
            <defs>
              <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={color} stopOpacity={0.35} />
                <stop offset="100%" stopColor={color} stopOpacity={0} />
              </linearGradient>
            </defs>
          )}
          <Area
            type="monotone"
            dataKey={dataKey}
            stroke={color}
            strokeWidth={2}
            fill={showArea ? `url(#${gradientId})` : 'transparent'}
            fillOpacity={1}
            dot={false}
            isAnimationActive={false}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

export default SparkLine;