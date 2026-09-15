'use client';
import React from 'react';

interface PreviousMonthSummaryProps {
  month: string;
  year: number;
  averageScore: number;
  bestStreak: number;
  habitsCompleted: number;
  goalsAchieved: number;
  totalGoals: number;
}

export const PreviousMonthSummary: React.FC<PreviousMonthSummaryProps> = ({
  month,
  year,
  averageScore,
  bestStreak,
  habitsCompleted,
  goalsAchieved,
  totalGoals
}) => {
  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg p-8 max-w-3xl mx-auto w-full text-center">
      <h2 className="text-3xl font-bold text-gray-800 dark:text-gray-100 mb-2">
        {month} {year} Review
      </h2>
      <p className="text-gray-500 dark:text-gray-400 mb-8">Let's look back before planning ahead.</p>
      
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-indigo-50 dark:bg-indigo-900/30 p-6 rounded-xl border border-indigo-100 dark:border-indigo-800">
          <p className="text-sm text-indigo-600 dark:text-indigo-400 font-semibold mb-2 uppercase tracking-wide">Avg Score</p>
          <p className="text-4xl font-black text-indigo-700 dark:text-indigo-300">{averageScore}</p>
        </div>
        
        <div className="bg-emerald-50 dark:bg-emerald-900/30 p-6 rounded-xl border border-emerald-100 dark:border-emerald-800">
          <p className="text-sm text-emerald-600 dark:text-emerald-400 font-semibold mb-2 uppercase tracking-wide">Best Streak</p>
          <p className="text-4xl font-black text-emerald-700 dark:text-emerald-300">{bestStreak}</p>
        </div>
        
        <div className="bg-amber-50 dark:bg-amber-900/30 p-6 rounded-xl border border-amber-100 dark:border-amber-800">
          <p className="text-sm text-amber-600 dark:text-amber-400 font-semibold mb-2 uppercase tracking-wide">Habits Done</p>
          <p className="text-4xl font-black text-amber-700 dark:text-amber-300">{habitsCompleted}</p>
        </div>
        
        <div className="bg-blue-50 dark:bg-blue-900/30 p-6 rounded-xl border border-blue-100 dark:border-blue-800">
          <p className="text-sm text-blue-600 dark:text-blue-400 font-semibold mb-2 uppercase tracking-wide">Goals Met</p>
          <p className="text-4xl font-black text-blue-700 dark:text-blue-300">
            {goalsAchieved}<span className="text-xl text-blue-500/70 font-medium">/{totalGoals}</span>
          </p>
        </div>
      </div>
    </div>
  );
};
