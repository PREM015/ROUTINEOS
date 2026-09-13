'use client';

import React from 'react';
import { motion } from 'framer-motion';
import { Flame } from 'lucide-react';

interface StreakWidgetProps {
  currentStreak: number;
  longestStreak: number;
  lastCompleted?: string;
}

export default function StreakWidget({ currentStreak, longestStreak, lastCompleted }: StreakWidgetProps) {
  const isActive = currentStreak > 0;

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 flex items-center justify-between">
      <div className="flex items-center space-x-4">
        <div className={`flex items-center justify-center w-12 h-12 rounded-full ${isActive ? 'bg-orange-500/20 text-orange-500' : 'bg-zinc-800 text-zinc-500'}`}>
          {isActive ? (
            <motion.div
              animate={{ scale: [1, 1.1, 1] }}
              transition={{ repeat: Infinity, duration: 2, ease: "easeInOut" }}
            >
              <Flame className="w-6 h-6 fill-current" />
            </motion.div>
          ) : (
            <Flame className="w-6 h-6" />
          )}
        </div>
        
        <div>
          <div className="flex items-baseline space-x-2">
            <h3 className="text-2xl font-bold text-zinc-100">
              {currentStreak} <span className="text-sm font-medium text-zinc-400">Days</span>
            </h3>
          </div>
          <p className="text-sm text-zinc-400">
            {isActive ? 'Current Streak' : 'Start your streak today!'}
          </p>
        </div>
      </div>

      <div className="flex flex-col items-end text-right border-l border-zinc-800 pl-5">
        <span className="text-zinc-500 text-xs uppercase tracking-wider mb-1">Longest</span>
        <span className="text-zinc-100 font-bold text-lg">{longestStreak}</span>
        {lastCompleted && (
          <span className="text-zinc-600 text-xs mt-1">Last: {lastCompleted}</span>
        )}
      </div>
    </div>
  );
}
