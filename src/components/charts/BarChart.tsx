"use client";
/**
 * BarChart — a recharts-based vertical bar chart.
 *
 * Accepts an array of row objects, an x-axis key and one or more y-axis keys.
 * A single `dataKey` renders one bar series per datum (cells can be colored per
 * bar via `colors`); multiple `dataKey`s render one series per key.
 *
 * Props:
 * - data: dataset of row objects
 * - xKey:  property used for the X axis labels
 * - dataKey: property (or array of properties) used for bar height
 * - height:  chart pixel height (default 300)
 * - className: wrapper class
 * - colors: color palette; entries are cycled per bar/series
 * - showGrid: render a horizontal cartesian grid
 * - barSize: explicit width for bars
 */

import React from 'react';
import {
  BarChart as RechartsBarChart,
  Bar,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import { cn } from '@/lib/utils';

export interface BarChartProps {
  data: Array<Record<string, unknown>>;
  xKey: string;
  dataKey: string | string[];
  height?: number;
  className?: string;
  colors?: string[];
  showGrid?: boolean;
  barSize?: number;
  ariaLabel?: string;
  /** When set, bars render with a vertical gradient fill instead of solid colors. */
  gradient?: { id: string; from: string; to: string };
}

const DEFAULT_COLORS = [
  '#3b82f6',
  '#8b5cf6',
  '#06b6d4',
  '#f59e0b',
  '#ef4444',
  '#10b981',
  '#ec4899',
];

const TOOLTIP_STYLE: React.CSSProperties = {
  backgroundColor: '#18181b',
  border: '1px solid #27272a',
  borderRadius: '8px',
  color: '#fff',
};

/** Resolve the color at `index`, cycling through `colors` or the default palette. */
function resolveColor(index: number, colors?: string[]): string {
  return (
    colors?.[index % colors.length] ??
    DEFAULT_COLORS[index % DEFAULT_COLORS.length] ??
    DEFAULT_COLORS[0] ??
    '#3b82f6'
  );
}

export function BarChart({
  data,
  xKey,
  dataKey,
  height = 300,
  className,
  colors,
  showGrid = false,
  barSize,
  ariaLabel = 'Bar chart',
  gradient,
}: BarChartProps) {
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

  const keys = Array.isArray(dataKey) ? dataKey : [dataKey];
  const isGrouped = keys.length > 1;

  return (
    <div
      className={cn('w-full', className)}
      style={{ height }}
      role="img"
      aria-label={ariaLabel}
    >
      <ResponsiveContainer width="100%" height="100%">
        <RechartsBarChart data={data} barSize={barSize} margin={{ top: 8, right: 8, bottom: 0, left: -16 }}>
          {showGrid && <CartesianGrid strokeDasharray="3 3" stroke="#27272a" vertical={false} />}
          <XAxis dataKey={xKey} stroke="#52525b" fontSize={12} tickLine={false} axisLine={false} />
          <YAxis stroke="#52525b" fontSize={12} tickLine={false} axisLine={false} />
          <Tooltip contentStyle={TOOLTIP_STYLE} itemStyle={{ color: '#fff' }} labelStyle={{ color: '#a1a1aa' }} cursor={{ fill: 'rgba(255, 255, 255, 0.05)' }} />
          {gradient && (
            <defs>
              <linearGradient id={gradient.id} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={gradient.from} stopOpacity={1} />
                <stop offset="100%" stopColor={gradient.to} stopOpacity={0.45} />
              </linearGradient>
            </defs>
          )}
          {isGrouped ? (
            keys.map((key, index) => (
              <Bar
                key={key}
                dataKey={key}
                fill={gradient ? `url(#${gradient.id})` : resolveColor(index, colors)}
                radius={[4, 4, 0, 0]}
                animationDuration={750}
                animationEasing="ease-out"
              />
            ))
          ) : (
            <Bar
              dataKey={keys[0] ?? ''}
              fill={gradient ? `url(#${gradient.id})` : resolveColor(0, colors)}
              radius={[4, 4, 0, 0]}
              animationDuration={750}
              animationEasing="ease-out"
            >
              {!gradient &&
                data.map((_, index) => <Cell key={index} fill={resolveColor(index, colors)} />)}
            </Bar>
          )}
        </RechartsBarChart>
      </ResponsiveContainer>
    </div>
  );
}

export default BarChart;