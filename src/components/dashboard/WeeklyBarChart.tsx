'use client';

import React from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, CartesianGrid } from 'recharts';
import { AlertCircle } from 'lucide-react';

// Assuming basic placeholder structures if they don't exist yet, but conforming to standard imports.
// Import EmptyState and Badge per rules.
import { EmptyState, Badge } from '@/components/ui';

interface DayData {
  date: string;
  coreScore: number;
  isToday: boolean;
  dayType: 'NORMAL' | 'MINIMUM' | 'REST' | 'MISSED';
}

interface WeeklyBarChartProps {
  days: DayData[];
  weeklyScore: number;
  weeklyBand: 'EXCELLENT' | 'GOOD' | 'NEEDS_IMPROVEMENT' | 'RESET';
}

const bandColors = {
  EXCELLENT: 'bg-emerald-500 text-black',
  GOOD: 'bg-teal-500 text-black',
  NEEDS_IMPROVEMENT: 'bg-amber-500 text-black',
  RESET: 'bg-red-500 text-white',
};

const bandLabels = {
  EXCELLENT: 'Excellent',
  GOOD: 'Good',
  NEEDS_IMPROVEMENT: 'Needs Improvement',
  RESET: 'Reset',
};

export default function WeeklyBarChart({ days, weeklyScore, weeklyBand }: WeeklyBarChartProps) {
  if (!days || days.length === 0) {
    return (
      <div className="w-full h-[300px] bg-zinc-900 rounded-xl flex items-center justify-center p-6 border border-zinc-800">
        {/* We use EmptyState if available, inline fallback isn't needed if we assume it exists as instructed. */}
        <EmptyState 
          icon={<AlertCircle className="w-8 h-8 text-zinc-500" />}
          title="No data for this week yet."
          description="Complete your daily core tasks to see your progress here."
        />
      </div>
    );
  }

  const formatXAxis = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', { weekday: 'short' });
  };

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload as DayData;
      return (
        <div className="bg-zinc-800 border border-zinc-700 p-3 rounded-lg shadow-xl">
          <p className="text-zinc-300 text-sm mb-1">{data.date}</p>
          <p className="text-white font-semibold">Score: {data.coreScore}%</p>
          <p className="text-zinc-400 text-xs mt-1 uppercase">{data.dayType}</p>
        </div>
      );
    }
    return null;
  };

  return (
    <div className="w-full bg-zinc-900 rounded-xl p-6 border border-zinc-800">
      <div className="flex justify-between items-start mb-6">
        <div>
          <h3 className="text-zinc-100 font-semibold text-lg">Weekly Progress</h3>
          <p className="text-zinc-400 text-sm">Your core scores for the last 7 days</p>
        </div>
        <div className="flex flex-col items-end">
          <span className="text-2xl font-bold text-zinc-100">{weeklyScore}%</span>
          <Badge className={`mt-1 font-semibold ${bandColors[weeklyBand]}`}>
            {bandLabels[weeklyBand]}
          </Badge>
        </div>
      </div>

      <div className="h-[240px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={days} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#3f3f46" />
            <XAxis 
              dataKey="date" 
              tickFormatter={formatXAxis} 
              stroke="#a1a1aa" 
              fontSize={12}
              tickLine={false}
              axisLine={false}
              dy={10}
            />
            <YAxis 
              domain={[0, 100]} 
              stroke="#a1a1aa" 
              fontSize={12}
              tickLine={false}
              axisLine={false}
              tickFormatter={(value) => `${value}%`}
            />
            <Tooltip content={<CustomTooltip />} cursor={{ fill: '#27272a' }} />
            <Bar dataKey="coreScore" radius={[4, 4, 0, 0]}>
              {days.map((entry, index) => {
                let fill = '#10b981'; // emerald-500 for normal
                if (entry.dayType === 'REST') fill = '#52525b'; // zinc-600
                if (entry.dayType === 'MISSED') fill = '#ef4444'; // red-500
                if (entry.dayType === 'MINIMUM') fill = '#f59e0b'; // amber-500
                
                return (
                  <Cell 
                    key={`cell-${index}`} 
                    fill={fill}
                    className={entry.isToday ? "drop-shadow-[0_0_8px_rgba(16,185,129,0.5)]" : ""} 
                  />
                );
              })}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
