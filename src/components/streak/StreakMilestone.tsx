'use client';

import { motion } from 'framer-motion';
import { getMilestoneEmoji } from '@/lib/streaks/milestones';

interface StreakMilestoneProps {
  days: number;
  achieved: boolean;
}

export function StreakMilestone({ days, achieved }: StreakMilestoneProps) {
  return (
    <motion.div 
      whileHover={{ scale: 1.05 }}
      className={`flex flex-col items-center justify-center p-4 rounded-xl border ${achieved ? 'bg-zinc-800 border-zinc-700 shadow-[0_0_15px_rgba(255,255,255,0.1)]' : 'bg-zinc-900/50 border-zinc-800 opacity-50'}`}
    >
      <div className="text-3xl mb-2">{getMilestoneEmoji(days)}</div>
      <div className="text-sm font-semibold text-white">{days} Days</div>
      <div className="text-xs text-zinc-400">{achieved ? 'Achieved' : 'Locked'}</div>
    </motion.div>
  );
}
