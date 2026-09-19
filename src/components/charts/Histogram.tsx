"use client";
/**
 * Histogram — distribution chart rendered from pre-bucketed data.
 *
 * Expects one row per bucket (`{ [xKey]: label, [yKey]: count }`) and renders
 * either bars or an area fill. Good for score distributions, habit frequency
 * buckets, etc.
 *
 * Props:
 * - data: bucket rows
 * - xKey: bucket label key
 * - yKey: bucket frequency key
 * - height: chart pixel height (default 280)
 * - variant: 'bar' or 'area'
 * - color: series color (default blue-500)
 * - showGrid: render a cartesian grid
 */

import React from 'react';
import {
  BarChart as RechartsBarChart,
  Bar,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import { cn } from '@/lib/utils';

export interface HistogramProps {
  data: Array<Record<string, unknown>>;
  xKey: string;
  yKey: string;
  height?: number;
  variant?: 'bar' | 'area';
  className?: string;
  color?: string;
  showGrid?: boolean;
  ariaLabel?: string;
}

const TOOLTIP_STYLE: React.CSSProperties = {
  backgroundColor: '#18181b',
  border: '1px solid #27272a',
  borderRadius: '8px',
  color: '#fff',
};

export function Histogram({
  data,
  xKey,
  yKey,
  height = 280,
  variant = 'bar',
  className,
  color = '#3b82f6',
  showGrid = false,
  ariaLabel = 'Histogram',
}: HistogramProps) {
  if (data.length === 0) {
    return (
      <div
        className="flex h-40 items-center justify-center text-sm text-gray-500"
        role="img"
        aria-label={`${ariaLabel} — no data`}
      >
        No data to display
      </div>
    );
  }

  const axes = (
    <>
      {showGrid && <CartesianGrid strokeDasharray="3 3" stroke="#27272a" vertical={false} />}
      <XAxis dataKey={xKey} stroke="#52525b" fontSize={12} tickLine={false} axisLine={false} />
      <YAxis stroke="#52525b" fontSize={12} tickLine={false} axisLine={false} />
      <Tooltip contentStyle={TOOLTIP_STYLE} itemStyle={{ color: '#fff' }} labelStyle={{ color: '#a1a1aa' }} cursor={{ fill: 'rgba(255, 255, 255, 0.05)' }} />
    </>
  );

  return (
    <div className={cn('w-full', className)} style={{ height }} role="img" aria-label={ariaLabel}>
      <ResponsiveContainer width="100%" height="100%">
        {variant === 'area' ? (
          <AreaChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -16 }}>
            {axes}
            <Area type="stepAfter" dataKey={yKey} stroke={color} strokeWidth={2} fill={color} fillOpacity={0.25} />
          </AreaChart>
        ) : (
          <RechartsBarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -16 }}>
            {axes}
            <Bar dataKey={yKey} fill={color} radius={[4, 4, 0, 0]} />
          </RechartsBarChart>
        )}
      </ResponsiveContainer>
    </div>
  );
}

export default Histogram;