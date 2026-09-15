'use client';
import React from 'react';

interface MonthlySummaryWidgetProps {
  averageScore: number;
  bestDay: { date: string; score: number } | null;
  currentStreak: number;
  habitsCompleted: number;
}

export const MonthlySummaryWidget: React.FC<MonthlySummaryWidgetProps> = ({
  averageScore,
  bestDay,
  currentStreak,
  habitsCompleted,
}) => {
  return (
    <div className="p-4 bg-white dark:bg-gray-800 rounded-xl shadow h-full">
      <h3 className="text-lg font-semibold text-gray-700 dark:text-gray-200 mb-4">Monthly Summary</h3>
      
      <div className="grid grid-cols-2 gap-4">
        <div className="p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-100 dark:border-blue-800">
          <p className="text-xs text-blue-600 dark:text-blue-400 uppercase tracking-wide font-semibold mb-1">Avg Score</p>
          <p className="text-2xl font-bold text-gray-900 dark:text-white">{averageScore}</p>
        </div>
        
        <div className="p-3 bg-green-50 dark:bg-green-900/20 rounded-lg border border-green-100 dark:border-green-800">
          <p className="text-xs text-green-600 dark:text-green-400 uppercase tracking-wide font-semibold mb-1">Streak</p>
          <p className="text-2xl font-bold text-gray-900 dark:text-white">{currentStreak} <span className="text-sm font-normal">days</span></p>
        </div>
        
        <div className="p-3 bg-purple-50 dark:bg-purple-900/20 rounded-lg border border-purple-100 dark:border-purple-800">
          <p className="text-xs text-purple-600 dark:text-purple-400 uppercase tracking-wide font-semibold mb-1">Habits</p>
          <p className="text-2xl font-bold text-gray-900 dark:text-white">{habitsCompleted}</p>
        </div>
        
        <div className="p-3 bg-amber-50 dark:bg-amber-900/20 rounded-lg border border-amber-100 dark:border-amber-800">
          <p className="text-xs text-amber-600 dark:text-amber-400 uppercase tracking-wide font-semibold mb-1">Best Day</p>
          {bestDay ? (
            <div>
              <p className="text-xl font-bold text-gray-900 dark:text-white">{bestDay.score}</p>
              <p className="text-xs text-gray-500 dark:text-gray-400">{bestDay.date}</p>
            </div>
          ) : (
            <p className="text-sm text-gray-500 dark:text-gray-400">N/A</p>
          )}
        </div>
      </div>
    </div>
  );
};
