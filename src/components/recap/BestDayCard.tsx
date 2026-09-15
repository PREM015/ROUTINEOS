'use client';

import React from 'react';

interface Props {
  date: string;
  score: number;
  habitsCompleted: number;
}

export default function BestDayCard({ date, score, habitsCompleted }: Props) {
  return (
    <div className="bg-gradient-to-r from-yellow-50 to-amber-50 p-5 rounded-xl border border-yellow-200 flex flex-col items-center justify-center text-center shadow-sm relative overflow-hidden">
      <div className="absolute top-0 right-0 p-2 opacity-10 text-6xl">⭐</div>
      <h3 className="text-sm font-semibold text-yellow-800 uppercase tracking-widest mb-1">Best Day</h3>
      <p className="text-gray-900 font-medium mb-3">{new Date(date).toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}</p>
      
      <div className="flex items-center space-x-4">
        <div className="text-center">
          <p className="text-3xl font-black text-amber-600">{score}</p>
          <p className="text-xs text-yellow-700 uppercase">Score</p>
        </div>
        <div className="h-8 w-px bg-yellow-300"></div>
        <div className="text-center">
          <p className="text-3xl font-black text-amber-600">{habitsCompleted}</p>
          <p className="text-xs text-yellow-700 uppercase">Habits</p>
        </div>
      </div>
    </div>
  );
}
