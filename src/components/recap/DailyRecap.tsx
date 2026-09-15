'use client';

import React from 'react';

interface Props {
  date: string;
  score: number;
  habitsCompleted: number;
  habitsTotal: number;
  routineCompletion: number;
  sleepHours: number;
  biggestWin?: string;
  streakCount: number;
}

export default function DailyRecap({ date, score, habitsCompleted, habitsTotal, routineCompletion, sleepHours, biggestWin, streakCount }: Props) {
  return (
    <div className="bg-white p-6 rounded-lg shadow-md max-w-md mx-auto my-4 border border-gray-100">
      <h2 className="text-xl font-bold text-gray-800 mb-4">Daily Recap - {new Date(date).toLocaleDateString()}</h2>
      
      <div className="grid grid-cols-2 gap-4 mb-6">
        <div className="bg-blue-50 p-4 rounded-md text-center">
          <p className="text-sm text-blue-600 font-semibold uppercase tracking-wider">Score</p>
          <p className="text-3xl font-bold text-blue-900">{score}</p>
        </div>
        <div className="bg-green-50 p-4 rounded-md text-center">
          <p className="text-sm text-green-600 font-semibold uppercase tracking-wider">Streak</p>
          <p className="text-3xl font-bold text-green-900">{streakCount} <span className="text-xl">🔥</span></p>
        </div>
      </div>

      <div className="space-y-4">
        <div>
          <div className="flex justify-between text-sm text-gray-600 mb-1">
            <span>Habits Completed</span>
            <span>{habitsCompleted} / {habitsTotal}</span>
          </div>
          <div className="w-full bg-gray-200 rounded-full h-2.5">
            <div className="bg-indigo-600 h-2.5 rounded-full" style={{ width: `${(habitsCompleted / Math.max(1, habitsTotal)) * 100}%` }}></div>
          </div>
        </div>
        
        <div className="flex justify-between items-center py-2 border-b border-gray-100">
          <span className="text-gray-600">Routine Completion</span>
          <span className="font-semibold text-gray-800">{routineCompletion.toFixed(1)}%</span>
        </div>
        
        <div className="flex justify-between items-center py-2 border-b border-gray-100">
          <span className="text-gray-600">Sleep</span>
          <span className="font-semibold text-gray-800">{sleepHours} hrs</span>
        </div>
        
        {biggestWin && (
          <div className="pt-2">
            <p className="text-sm text-gray-500 mb-1">Biggest Win</p>
            <p className="font-medium text-gray-800 italic">"{biggestWin}"</p>
          </div>
        )}
      </div>
    </div>
  );
}
