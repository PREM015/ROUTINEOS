'use client';

import React from 'react';

interface HeatmapDay {
  date: string;
  score: number;
  dayType: 'NORMAL' | 'MINIMUM' | 'REST' | 'MISSED' | 'FUTURE';
}

interface ContributionHeatmapProps {
  days: HeatmapDay[];
  title?: string;
  showMonthLabels?: boolean;
}

const getCellColor = (day: HeatmapDay) => {
  if (day.dayType === 'FUTURE') return 'bg-zinc-900 border border-zinc-800';
  if (day.dayType === 'REST') return 'bg-blue-900/40';
  
  if (day.score === 0) return 'bg-zinc-900';
  if (day.score < 40) return 'bg-emerald-950';
  if (day.score < 60) return 'bg-emerald-900';
  if (day.score < 75) return 'bg-emerald-700';
  if (day.score < 90) return 'bg-emerald-500';
  return 'bg-emerald-400';
};

export default function ContributionHeatmap({
  days,
  title = "Activity",
  showMonthLabels = true
}: ContributionHeatmapProps) {
  if (!days || days.length === 0) {
    // Skeleton state
    return (
      <div className="bg-zinc-900 p-6 rounded-xl border border-zinc-800 w-fit">
        {title && <h3 className="text-zinc-100 font-semibold mb-4">{title}</h3>}
        <div className="flex gap-[2px]">
          {Array.from({ length: 12 }).map((_, colIndex) => (
            <div key={colIndex} className="flex flex-col gap-[2px]">
              {Array.from({ length: 7 }).map((_, rowIndex) => (
                <div key={rowIndex} className="w-3 h-3 rounded-sm bg-zinc-800/50" />
              ))}
            </div>
          ))}
        </div>
      </div>
    );
  }

  const weeks: HeatmapDay[][] = [];
  let currentWeek: HeatmapDay[] = [];
  
  days.forEach((day, i) => {
    currentWeek.push(day);
    if (currentWeek.length === 7 || i === days.length - 1) {
      weeks.push(currentWeek);
      currentWeek = [];
    }
  });

  const monthLabels: { month: string; colIndex: number }[] = [];
  let currentMonth = '';
  
  weeks.forEach((week, index) => {
    if (week.length > 0) {
      const date = new Date(week[0].date);
      const month = date.toLocaleString('default', { month: 'short' });
      if (month !== currentMonth) {
        monthLabels.push({ month, colIndex: index });
        currentMonth = month;
      }
    }
  });

  return (
    <div className="bg-zinc-900 p-6 rounded-xl border border-zinc-800 w-fit">
      {title && <h3 className="text-zinc-100 font-semibold mb-4">{title}</h3>}
      
      <div className="relative">
        {showMonthLabels && (
          <div className="flex text-xs text-zinc-500 mb-2 h-4 relative">
            {monthLabels.map((label, i) => (
              <span 
                key={i} 
                className="absolute"
                style={{ left: `${label.colIndex * (12 + 2)}px` }} // 12px width + 2px gap
              >
                {label.month}
              </span>
            ))}
          </div>
        )}
        
        <div className="flex gap-[2px]">
          {weeks.map((week, weekIndex) => (
            <div key={weekIndex} className="flex flex-col gap-[2px]">
              {week.map((day) => (
                <div
                  key={day.date}
                  className={`group relative w-3 h-3 rounded-sm ${getCellColor(day)} transition-colors duration-200`}
                >
                  <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 hidden group-hover:block z-10 w-max bg-zinc-800 text-xs text-zinc-200 px-2 py-1 rounded shadow-lg border border-zinc-700 pointer-events-none">
                    <span className="font-semibold text-white">{day.score}%</span> on {day.date}
                    <div className="text-[10px] text-zinc-400 mt-0.5">{day.dayType}</div>
                  </div>
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>
      
      <div className="flex items-center gap-2 mt-4 text-xs text-zinc-500">
        <span>Less</span>
        <div className="flex gap-[2px]">
          <div className="w-3 h-3 rounded-sm bg-zinc-900 border border-zinc-800" />
          <div className="w-3 h-3 rounded-sm bg-emerald-950" />
          <div className="w-3 h-3 rounded-sm bg-emerald-900" />
          <div className="w-3 h-3 rounded-sm bg-emerald-700" />
          <div className="w-3 h-3 rounded-sm bg-emerald-500" />
          <div className="w-3 h-3 rounded-sm bg-emerald-400" />
        </div>
        <span>More</span>
      </div>
    </div>
  );
}
