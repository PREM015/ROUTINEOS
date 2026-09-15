'use client';

import { motion } from 'framer-motion';
import { Flame } from 'lucide-react';

interface StreakCardProps {
  currentStreak: number;
  longestStreak: number;
}

export function StreakCard({ currentStreak, longestStreak }: StreakCardProps) {
  return (
    <motion.div 
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-zinc-900 border border-zinc-800 rounded-xl p-6 flex items-center justify-between shadow-lg"
    >
      <div className="flex items-center gap-4">
        <div className="h-16 w-16 bg-orange-500/20 rounded-full flex items-center justify-center border border-orange-500/50">
          <Flame className="w-8 h-8 text-orange-500" />
        </div>
        <div>
          <h2 className="text-3xl font-bold text-white">{currentStreak} Days</h2>
          <p className="text-zinc-400">Current Streak</p>
        </div>
      </div>
      <div className="text-right">
        <p className="text-xl font-semibold text-white">{longestStreak} Days</p>
        <p className="text-zinc-400">Longest Streak</p>
      </div>
    </motion.div>
  );
}
