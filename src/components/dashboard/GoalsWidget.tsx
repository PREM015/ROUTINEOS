'use client';

import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useApp, Goal } from '@/context/AppContext';
import { Target, Plus, ChevronRight, Flame } from 'lucide-react';
import { EmptyState, Badge, Button } from '@/components/ui';
import { getDaysRemaining } from '@/lib/dates';

interface GoalsWidgetProps {
  type?: 'WEEKLY' | 'MONTHLY' | 'YEARLY';
}

const PRIORITY_COLORS = {
  HIGH: 'emerald' as const,
  MEDIUM: 'amber' as const,
  LOW: 'zinc' as const,
};

export default function GoalsWidget({ type = 'WEEKLY' }: GoalsWidgetProps) {
  const { goals, updateGoalProgress } = useApp();
  const [incrementingId, setIncrementingId] = useState<string | null>(null);

  const activeGoals = goals.filter(g => g.type === type && (g.status === 'ACTIVE' || g.status === 'CARRIED_OVER'));

  if (activeGoals.length === 0) {
    return (
      <EmptyState
        icon={<Target size={28} />}
        title="No goals set yet"
        description={`Add your first ${type.toLowerCase()} goal to track progress.`}
      />
    );
  }

  const handleIncrement = (goal: Goal) => {
    const newVal = Math.min(goal.targetValue, goal.currentValue + 1);
    updateGoalProgress(goal.id, newVal);
    setIncrementingId(goal.id);
    setTimeout(() => setIncrementingId(null), 400);
  };

  return (
    <div className="space-y-4">
      <AnimatePresence>
        {activeGoals.map((goal) => {
          const pct = goal.targetValue > 0 ? Math.min(100, (goal.currentValue / goal.targetValue) * 100) : 0;
          const daysLeft = getDaysRemaining(goal.endDate);

          return (
            <motion.div
              key={goal.id}
              layout
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, height: 0 }}
              className="bg-zinc-900/60 border border-zinc-800/60 rounded-xl p-4 space-y-3"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-semibold text-zinc-200 truncate">{goal.title}</span>
                    <Badge variant={PRIORITY_COLORS[goal.priority]}>{goal.priority}</Badge>
                    {goal.carriedOverFrom && <Badge variant="purple">Carried Over</Badge>}
                  </div>
                  <p className="text-xs text-zinc-500 mt-0.5">
                    {daysLeft > 0 ? `${daysLeft} days remaining` : 'Deadline passed'}
                  </p>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <span className="text-xs font-medium text-zinc-400">
                    {goal.currentValue}/{goal.targetValue} {goal.unit || ''}
                  </span>
                  <motion.button
                    animate={incrementingId === goal.id ? { scale: [1, 1.3, 1] } : {}}
                    onClick={() => handleIncrement(goal)}
                    className="w-6 h-6 rounded-full bg-zinc-800 hover:bg-emerald-500/20 hover:text-emerald-400 text-zinc-400 flex items-center justify-center transition"
                    title="Increment progress by 1"
                  >
                    <Plus size={14} />
                  </motion.button>
                </div>
              </div>

              <div className="space-y-1">
                <div className="h-2 w-full bg-zinc-800 rounded-full overflow-hidden">
                  <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: `${pct}%` }}
                    transition={{ duration: 0.8, ease: 'easeOut' }}
                    className={`h-full rounded-full ${pct >= 100 ? 'bg-emerald-400' : 'bg-gradient-to-r from-emerald-600 to-emerald-400'}`}
                  />
                </div>
                <div className="flex justify-between text-[10px] text-zinc-600">
                  <span>{Math.round(pct)}% complete</span>
                  {pct >= 100 && <span className="text-emerald-500 font-bold">✓ Done!</span>}
                </div>
              </div>
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
}
