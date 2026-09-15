'use client';
import React from 'react';

interface WeeklyReviewSummaryProps {
  review: {
    weekStart: string;
    weekEnd: string;
    averageScore: number;
    habitsCompleted: number;
    goalsAchieved: number;
    biggestWin?: string;
    weeklyFocus?: string;
  };
}

export const WeeklyReviewSummary: React.FC<WeeklyReviewSummaryProps> = ({ review }) => {
  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg p-6 max-w-2xl mx-auto border border-gray-100 dark:border-gray-700">
      <div className="text-center mb-6 border-b border-gray-100 dark:border-gray-700 pb-4">
        <h2 className="text-2xl font-bold text-gray-800 dark:text-gray-100">Weekly Review</h2>
        <p className="text-gray-500 dark:text-gray-400 mt-1">{review.weekStart} - {review.weekEnd}</p>
      </div>
      
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <div className="bg-indigo-50 dark:bg-indigo-900/30 p-4 rounded-lg text-center">
          <p className="text-sm text-indigo-600 dark:text-indigo-400 font-semibold mb-1">Avg Score</p>
          <p className="text-3xl font-bold text-indigo-700 dark:text-indigo-300">{review.averageScore}</p>
        </div>
        <div className="bg-emerald-50 dark:bg-emerald-900/30 p-4 rounded-lg text-center">
          <p className="text-sm text-emerald-600 dark:text-emerald-400 font-semibold mb-1">Habits Done</p>
          <p className="text-3xl font-bold text-emerald-700 dark:text-emerald-300">{review.habitsCompleted}</p>
        </div>
        <div className="bg-amber-50 dark:bg-amber-900/30 p-4 rounded-lg text-center">
          <p className="text-sm text-amber-600 dark:text-amber-400 font-semibold mb-1">Goals Met</p>
          <p className="text-3xl font-bold text-amber-700 dark:text-amber-300">{review.goalsAchieved}</p>
        </div>
      </div>
      
      <div className="space-y-4">
        {review.biggestWin && (
          <div className="p-4 bg-gray-50 dark:bg-gray-700/50 rounded-lg">
            <h4 className="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">Biggest Win</h4>
            <p className="text-gray-800 dark:text-gray-200">{review.biggestWin}</p>
          </div>
        )}
        
        {review.weeklyFocus && (
          <div className="p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
            <h4 className="text-sm font-semibold text-blue-500 dark:text-blue-400 uppercase tracking-wider mb-2">Focus for Next Week</h4>
            <p className="text-blue-800 dark:text-blue-300">{review.weeklyFocus}</p>
          </div>
        )}
      </div>
    </div>
  );
};
