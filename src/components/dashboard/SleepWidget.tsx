'use client';
import React from 'react';
import { Moon } from 'lucide-react';
import { useCountUp } from '@/components/motion/useCountUp';

interface SleepWidgetProps {
  sleepLog?: {
    totalMinutes: number;
    bedtime: string;
    wakeTime: string;
  } | null;
  targetMinutes?: number;
}

export const SleepWidget: React.FC<SleepWidgetProps> = ({ sleepLog, targetMinutes = 480 }) => {
  const hours = sleepLog ? Math.floor(sleepLog.totalMinutes / 60) : 0;
  const minutes = sleepLog ? sleepLog.totalMinutes % 60 : 0;
  const score = sleepLog
    ? Math.min(100, Math.round((sleepLog.totalMinutes / targetMinutes) * 100))
    : 0;
  const display = useCountUp(sleepLog ? score : 0, 1);

  if (!sleepLog) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 rounded-xl border border-border bg-card p-6 shadow-sm h-full min-h-[160px] fade-rise-in">
        <Moon className="h-8 w-8 text-muted-foreground/60" aria-hidden="true" />
        <h3 className="text-lg font-semibold text-foreground">Sleep Summary</h3>
        <p className="text-muted-foreground">No sleep logged</p>
      </div>
    );
  }

  const getScoreColor = (s: number) => {
    if (s >= 90) return 'bg-emerald-500';
    if (s >= 75) return 'bg-sky-500';
    if (s >= 60) return 'bg-amber-500';
    return 'bg-rose-500';
  };

  return (
    <div className="rounded-xl border border-border bg-card p-4 shadow-sm flex flex-col justify-between h-full min-h-[160px] transition-all duration-300 ease-out-expo hover:-translate-y-0.5 hover:shadow-md fade-rise-in">
      <h3 className="text-lg font-semibold text-foreground mb-4">Sleep Summary</h3>

      <div className="flex items-center justify-between mb-4">
        <div>
          <p className="text-3xl font-bold text-foreground tabular-nums">
            {hours}h {minutes}m
          </p>
          <div className="text-sm text-muted-foreground mt-1">
            <p>Bedtime: {sleepLog.bedtime}</p>
            <p>Wake up: {sleepLog.wakeTime}</p>
          </div>
        </div>

        <div className="flex flex-col items-center">
          <div
            className={`w-16 h-16 rounded-full flex items-center justify-center text-white font-bold text-xl shadow-lg transition-colors duration-500 ${getScoreColor(score)}`}
          >
            {Math.round(display)}
          </div>
          <span className="text-xs text-muted-foreground mt-2">Score</span>
        </div>
      </div>
    </div>
  );
};

export default SleepWidget;