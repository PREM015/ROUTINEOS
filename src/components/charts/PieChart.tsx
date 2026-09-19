"use client";
/**
 * PieChart — a recharts-based pie / donut chart.
 *
 * Renders one slice per datum using a `nameKey` for the legend/labels and a
 * `dataKey` for the slice size. Slice colors cycle through `colors`.
 *
 * Props:
 * - data: dataset of row objects
 * - nameKey: property used for slice name/label
 * - dataKey:  property used for slice value
 * - height:   chart pixel height (default 300)
 * - className: wrapper class
 * - colors:   slice color palette (cycled per datum)
 * - innerRadius / outerRadius: pie geometry (donut when innerRadius > 0)
 * - showLegend: toggle the legend
 * - showLabels: toggle slice labels
 */

import React from 'react';
import { PieChart as RechartsPieChart, Pie, Cell, Legend, Tooltip, ResponsiveContainer } from 'recharts';
import { cn } from '@/lib/utils';

export interface PieChartProps {
  data: Array<Record<string, unknown>>;
  nameKey: string;
  dataKey: string;
  height?: number;
  className?: string;
  colors?: string[];
  innerRadius?: number | string;
  outerRadius?: number | string;
  showLegend?: boolean;
  showLabels?: boolean;
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

export function PieChart({
  data,
  nameKey,
  dataKey,
  height = 300,
  className,
  colors,
  innerRadius = '55%',
  outerRadius = '90%',
  showLegend = false,
  showLabels = false,
  ariaLabel = 'Pie chart',
}: PieChartProps) {
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

  return (
    <div
      className={cn('w-full', className)}
      style={{ height }}
      role="img"
      aria-label={ariaLabel}
    >
      <ResponsiveContainer width="100%" height="100%">
        <RechartsPieChart margin={{ top: 8, right: 8, bottom: 8, left: 8 }}>
          <Tooltip contentStyle={TOOLTIP_STYLE} itemStyle={{ color: '#fff' }} labelStyle={{ color: '#a1a1aa' }} />
          {showLegend && (
            <Legend
              iconType="circle"
              formatter={(value: string) => <span style={{ color: '#e4e4e7', fontSize: '12px' }}>{value}</span>}
            />
          )}
          <Pie
            data={data}
            dataKey={dataKey}
            nameKey={nameKey}
            cx="50%"
            cy="50%"
            innerRadius={innerRadius}
            outerRadius={outerRadius}
            paddingAngle={2}
            label={showLabels}
          >
            {data.map((_, index) => (
              <Cell key={index} fill={resolveColor(index, colors)} stroke="#0a0a0a" strokeWidth={2} />
            ))}
          </Pie>
        </RechartsPieChart>
      </ResponsiveContainer>
    </div>
  );
}

export default PieChart;