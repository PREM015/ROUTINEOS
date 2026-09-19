"use client";
/**
 * LineChart — a recharts-based line chart.
 *
 * Accepts an array of row objects, an x-axis key and one or more series keys.
 * A single `dataKey` renders one line; multiple `dataKey`s render one line per
 * key (each colored from `colors`).
 *
 * Props:
 * - data: dataset of row objects
 * - xKey:  property used for the X axis labels
 * - dataKey: property (or array of properties) rendered as lines
 * - height:  chart pixel height (default 300)
 * - className: wrapper class
 * - colors: color palette; entries are cycled per line
 * - showDots: render a dot at every data point
 * - strokeWidth: line stroke width
 * - showGrid: render a cartesian grid
 */

import React from 'react';
import {
  LineChart as RechartsLineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import { cn } from '@/lib/utils';

export interface LineChartProps {
  data: Array<Record<string, unknown>>;
  xKey: string;
  dataKey: string | string[];
  height?: number;
  className?: string;
  colors?: string[];
  showDots?: boolean;
  strokeWidth?: number;
  showGrid?: boolean;
  ariaLabel?: string;
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

export function LineChart({
  data,
  xKey,
  dataKey,
  height = 300,
  className,
  colors,
  showDots = false,
  strokeWidth = 3,
  showGrid = false,
  ariaLabel = 'Line chart',
}: LineChartProps) {
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

  return (
    <div
      className={cn('w-full', className)}
      style={{ height }}
      role="img"
      aria-label={ariaLabel}
    >
      <ResponsiveContainer width="100%" height="100%">
        <RechartsLineChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -16 }}>
          {showGrid && <CartesianGrid strokeDasharray="3 3" stroke="#27272a" vertical={false} />}
          <XAxis dataKey={xKey} stroke="#52525b" fontSize={12} tickLine={false} axisLine={false} />
          <YAxis stroke="#52525b" fontSize={12} tickLine={false} axisLine={false} />
          <Tooltip contentStyle={TOOLTIP_STYLE} itemStyle={{ color: '#fff' }} labelStyle={{ color: '#a1a1aa' }} />
          {keys.map((key, index) => {
            const color = resolveColor(index, colors);
            return (
              <Line
                key={key}
                type="monotone"
                dataKey={key}
                stroke={color}
                strokeWidth={strokeWidth}
                dot={showDots ? { r: 3, fill: color, strokeWidth: 0 } : false}
                activeDot={{ r: 5 }}
              />
            );
          })}
        </RechartsLineChart>
      </ResponsiveContainer>
    </div>
  );
}

export default LineChart;