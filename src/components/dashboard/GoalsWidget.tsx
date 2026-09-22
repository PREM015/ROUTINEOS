'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useApp, Goal } from '@/context/AppContext';
import { Target, Plus, CheckCircle2, Circle } from 'lucide-react';
import { EmptyState, Badge } from '@/components/ui';
import { getDaysRemaining, getTodayString } from '@/lib/dates';

interface GoalsWidgetProps {
  type?: Goal['type'];
  showDailyCheckoff?: boolean;
}

const PRIORITY_COLORS: Record<Goal['priority'], 'success' | 'warning' | 'default' | 'primary'> = {
  CRITICAL: 'success',
  HIGH: 'success',
  MEDIUM: 'warning',
  LOW: 'default',
  PERSONAL: 'primary',
  ACADEMIC: 'primary',
  PROFESSIONAL: 'primary',
  NON_PROFIT: 'default',
};

export function GoalsWidget({ type = 'WEEKLY', showDailyCheckoff = false }: GoalsWidgetProps = {}) {
  const { goals, updateGoalProgress, updateGoal } = useApp();
  const [incrementingId, setIncrementingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const activeGoals = goals.filter(
    (g) => g.type === type && (g.status === 'ACTIVE' || g.status === 'CARRIED_OVER')
  );

  if (activeGoals.length === 0) {
    return (
      <EmptyState
        icon={<Target size={28} />}
        title="No goals set yet"
        description={`Add your first ${type.toLowerCase()} goal to track progress.`}
      />
    );
  }

  const handleIncrement = async (goal: Goal) => {
    const newVal = Math.min(goal.targetValue, goal.currentValue + 1);
    setIncrementingId(goal.id);
    setError(null);
    try {
      await updateGoalProgress(goal.id, newVal);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update progress');
    } finally {
      setTimeout(() => setIncrementingId(null), 400);
    }
  };

  const handleDailyCheck = async (goal: Goal) => {
    const completed = goal.currentValue < 1;
    setIncrementingId(goal.id);
    setError(null);
    try {
      const res = await fetch(`/api/goals/${goal.id}/checkin`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date: getTodayString(), completed }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.error || 'Failed to save check-in');
      await updateGoal(goal.id, {
        currentValue: completed ? 1 : 0,
        status: completed ? 'COMPLETED' : 'ACTIVE',
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save check-in');
    } finally {
      setTimeout(() => setIncrementingId(null), 400);
    }
  };

  return (
    <div className="space-y-4">
      {error && (
        <p role="alert" className="text-xs text-red-400">{error}</p>
      )}
      <AnimatePresence>
        {activeGoals.map((goal) => {
          const pct = goal.targetValue > 0 ? Math.min(100, (goal.currentValue / goal.targetValue) * 100) : 0;
          const daysLeft = getDaysRemaining(goal.endDate);
          const isDaily = goal.type === 'DAILY';
          const checked = isDaily && goal.currentValue >= 1;

          return (
            <motion.div
              key={goal.id}
              layout
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, height: 0 }}
              className="bg-card border border-border rounded-xl p-4 space-y-3"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-start gap-2 flex-1 min-w-0">
                  {isDaily && showDailyCheckoff && (
                    <button
                      onClick={() => handleDailyCheck(goal)}
                      aria-label={checked ? `Uncheck ${goal.title}` : `Check off ${goal.title}`}
                      className={`mt-0.5 shrink-0 transition ${checked ? 'text-emerald-400' : 'text-muted-foreground hover:text-emerald-400'}`}
                    >
                      {checked ? <CheckCircle2 size={18} /> : <Circle size={18} />}
                    </button>
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={`text-sm font-semibold truncate ${checked ? 'text-muted-foreground line-through' : 'text-foreground'}`}>{goal.title}</span>
                      <Badge variant={PRIORITY_COLORS[goal.priority]}>{goal.priority}</Badge>
                      {goal.carriedOverFrom && <Badge variant="primary">Carried Over</Badge>}
                    </div>
                    {!isDaily && (
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {daysLeft > 0 ? `${daysLeft} days remaining` : 'Deadline passed'}
                      </p>
                    )}
                  </div>
                </div>
                {!isDaily && (
                  <div className="flex items-center gap-1 shrink-0">
                    <span className="text-xs font-medium text-muted-foreground">
                      {goal.currentValue}/{goal.targetValue} {goal.unit || ''}
                    </span>
                    <motion.button
                      animate={incrementingId === goal.id ? { scale: [1, 1.3, 1] } : {}}
                      onClick={() => handleIncrement(goal)}
                      className="w-6 h-6 rounded-full bg-zinc-800 hover:bg-emerald-500/20 hover:text-emerald-400 text-muted-foreground flex items-center justify-center transition"
                      title="Increment progress by 1"
                      aria-label={`Increment ${goal.title} progress`}
                    >
                      <Plus size={14} />
                    </motion.button>
                  </div>
                )}
              </div>

              {!isDaily && (
                <div className="space-y-1">
                  <div className="h-2 w-full bg-muted rounded-full overflow-hidden">
                    <motion.div
                      initial={{ width: 0 }}
                      animate={{ width: `${pct}%` }}
                      transition={{ duration: 0.8, ease: 'easeOut' }}
                      className={`h-full rounded-full ${pct >= 100 ? 'bg-emerald-400' : 'bg-gradient-to-r from-emerald-600 to-emerald-400'}`}
                    />
                  </div>
                  <div className="flex justify-between text-[10px] text-muted-foreground">
                    <span>{Math.round(pct)}% complete</span>
                    {pct >= 100 && <span className="text-emerald-500 font-bold">✓ Done!</span>}
                  </div>
                </div>
              )}
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
}

export default GoalsWidget;
