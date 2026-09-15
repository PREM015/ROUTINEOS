'use client';

import React from 'react';

interface Props {
  month: string;
  year: number;
  averageScore: number;
  habitCompletionRate: number;
  goalsAchieved: number;
  longestStreak: number;
  totalActiveDays: number;
}

export default function MonthlyRecap({ month, year, averageScore, habitCompletionRate, goalsAchieved, longestStreak, totalActiveDays }: Props) {
  return (
    <div className="bg-white p-6 rounded-xl shadow-lg max-w-md mx-auto my-4 bg-gradient-to-br from-purple-50 to-white">
      <div className="text-center mb-6">
        <h2 className="text-2xl font-extrabold text-purple-900">{month} {year}</h2>
        <p className="text-purple-600 text-sm">Monthly Recap</p>
      </div>
      
      <div className="grid grid-cols-2 gap-4 mb-6">
        <div className="bg-white p-4 rounded-lg shadow-sm border border-purple-100 text-center">
          <p className="text-3xl font-bold text-purple-700">{Math.round(averageScore)}</p>
          <p className="text-xs text-gray-500 uppercase mt-1">Avg Score</p>
        </div>
        <div className="bg-white p-4 rounded-lg shadow-sm border border-purple-100 text-center">
          <p className="text-3xl font-bold text-emerald-600">{longestStreak}</p>
          <p className="text-xs text-gray-500 uppercase mt-1">Best Streak</p>
        </div>
      </div>

      <div className="bg-white rounded-lg shadow-sm border border-gray-100 p-4 space-y-3">
        <div className="flex justify-between items-center">
          <span className="text-gray-600">Habit Completion</span>
          <span className="font-bold text-gray-800">{Math.round(habitCompletionRate)}%</span>
        </div>
        <div className="flex justify-between items-center">
          <span className="text-gray-600">Goals Achieved</span>
          <span className="font-bold text-gray-800">{goalsAchieved}</span>
        </div>
        <div className="flex justify-between items-center">
          <span className="text-gray-600">Active Days</span>
          <span className="font-bold text-gray-800">{totalActiveDays}</span>
        </div>
      </div>
    </div>
  );
}
