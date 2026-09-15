'use client';
import React from 'react';

interface SleepWidgetProps {
  sleepLog?: {
    totalMinutes: number;
    bedtime: string;
    wakeTime: string;
  } | null;
  targetMinutes: number;
}

export const SleepWidget: React.FC<SleepWidgetProps> = ({ sleepLog, targetMinutes }) => {
  if (!sleepLog) {
    return (
      <div className="flex flex-col items-center justify-center p-6 bg-white dark:bg-gray-800 rounded-xl shadow h-full min-h-[160px]">
        <h3 className="text-lg font-semibold text-gray-700 dark:text-gray-200 mb-2">Sleep Summary</h3>
        <p className="text-gray-500 dark:text-gray-400">No sleep logged</p>
      </div>
    );
  }

  const hours = Math.floor(sleepLog.totalMinutes / 60);
  const minutes = sleepLog.totalMinutes % 60;
  const score = Math.min(100, Math.round((sleepLog.totalMinutes / targetMinutes) * 100));

  const getScoreColor = (s: number) => {
    if (s >= 90) return 'bg-green-500';
    if (s >= 75) return 'bg-blue-500';
    if (s >= 60) return 'bg-yellow-500';
    return 'bg-red-500';
  };

  return (
    <div className="p-4 bg-white dark:bg-gray-800 rounded-xl shadow flex flex-col justify-between h-full min-h-[160px]">
      <h3 className="text-lg font-semibold text-gray-700 dark:text-gray-200 mb-4">Sleep Summary</h3>
      
      <div className="flex items-center justify-between mb-4">
        <div>
          <p className="text-3xl font-bold text-gray-900 dark:text-white">
            {hours}h {minutes}m
          </p>
          <div className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            <p>Bedtime: {sleepLog.bedtime}</p>
            <p>Wake up: {sleepLog.wakeTime}</p>
          </div>
        </div>
        
        <div className="flex flex-col items-center">
          <div className={`w-16 h-16 rounded-full flex items-center justify-center text-white font-bold text-xl shadow-lg ${getScoreColor(score)}`}>
            {score}
          </div>
          <span className="text-xs text-gray-500 dark:text-gray-400 mt-2">Score</span>
        </div>
      </div>
    </div>
  );
};
