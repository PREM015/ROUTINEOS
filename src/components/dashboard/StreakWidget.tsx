'use client';

import { motion, useReducedMotion } from 'framer-motion';
import { Flame } from 'lucide-react';
import { useCountUp } from '@/components/motion/useCountUp';

export interface StreakWidgetProps {
  currentStreak?: number;
  longestStreak?: number;
  lastCompleted?: string;
}

export function StreakWidget({ currentStreak = 0, longestStreak = 0, lastCompleted }: StreakWidgetProps = {}) {
  const reduce = useReducedMotion();
  const isActive = currentStreak > 0;
  const display = useCountUp(currentStreak, 1);
  const longestDisplay = useCountUp(longestStreak, 0.8);

  return (
    <div className="bg-card border border-border rounded-xl p-5 flex items-center justify-between">
      <div className="flex items-center space-x-4">
        <div className={`flex items-center justify-center w-12 h-12 rounded-full ${isActive ? 'bg-orange-500/20 text-orange-500' : 'bg-muted text-muted-foreground'}`}>
          {isActive && !reduce ? (
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
            <h3 className="text-2xl font-bold text-foreground tabular-nums">
              {Math.round(display)} <span className="text-sm font-medium text-muted-foreground">Days</span>
            </h3>
          </div>
          <p className="text-sm text-muted-foreground">
            {isActive ? 'Current Streak' : 'Start your streak today!'}
          </p>
        </div>
      </div>

      <div className="flex flex-col items-end text-right border-l border-border pl-5">
        <span className="text-muted-foreground text-xs uppercase tracking-wider mb-1">Longest</span>
        <span className="text-foreground font-bold text-lg tabular-nums">{Math.round(longestDisplay)}</span>
        {lastCompleted && (
          <span className="text-muted-foreground/70 text-xs mt-1">Last: {lastCompleted}</span>
        )}
      </div>
    </div>
  );
}

export default StreakWidget;