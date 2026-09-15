'use client';

import React from 'react';

interface Props {
  year: number;
  averageScore: number;
  bestMonth: string;
  habitCompletionRate: number;
  goalsAchieved: number;
  longestStreak: number;
  totalActiveDays: number;
  topHabit?: string;
}

export default function YearlyRecap({ year, averageScore, bestMonth, habitCompletionRate, goalsAchieved, longestStreak, totalActiveDays, topHabit }: Props) {
  return (
    <div className="bg-gradient-to-tr from-indigo-900 to-purple-900 text-white p-8 rounded-2xl shadow-2xl max-w-lg mx-auto my-6">
      <div className="text-center mb-8 border-b border-white/20 pb-6">
        <p className="text-indigo-200 text-sm tracking-widest uppercase mb-1">Year In Review</p>
        <h2 className="text-5xl font-black">{year}</h2>
      </div>
      
      <div className="grid grid-cols-2 gap-6 mb-8">
        <div className="text-center bg-white/10 p-4 rounded-xl backdrop-blur-sm">
          <p className="text-4xl font-bold text-yellow-300">{Math.round(averageScore)}</p>
          <p className="text-xs text-indigo-200 uppercase mt-2">Avg Score</p>
        </div>
        <div className="text-center bg-white/10 p-4 rounded-xl backdrop-blur-sm">
          <p className="text-4xl font-bold text-emerald-300">{habitCompletionRate}%</p>
          <p className="text-xs text-indigo-200 uppercase mt-2">Habit Completion</p>
        </div>
      </div>

      <div className="space-y-4 bg-white/5 p-6 rounded-xl">
        <div className="flex justify-between items-center">
          <span className="text-indigo-200">Active Days</span>
          <span className="font-bold text-xl">{totalActiveDays} <span className="text-sm text-indigo-300 font-normal">/ 365</span></span>
        </div>
        <div className="flex justify-between items-center">
          <span className="text-indigo-200">Longest Streak</span>
          <span className="font-bold text-xl">{longestStreak} days</span>
        </div>
        <div className="flex justify-between items-center">
          <span className="text-indigo-200">Goals Crushed</span>
          <span className="font-bold text-xl">{goalsAchieved}</span>
        </div>
        <div className="flex justify-between items-center">
          <span className="text-indigo-200">Best Month</span>
          <span className="font-bold text-xl">{bestMonth}</span>
        </div>
        {topHabit && (
          <div className="flex justify-between items-center pt-2 border-t border-white/10">
            <span className="text-indigo-200">Top Habit</span>
            <span className="font-bold text-right pl-4">{topHabit}</span>
          </div>
        )}
      </div>
    </div>
  );
}
