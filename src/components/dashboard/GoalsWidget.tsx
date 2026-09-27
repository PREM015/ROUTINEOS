'use client';

import { useState, useEffect } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import { useApp, Goal } from '@/context/AppContext';
import { Target, Plus, CheckCircle2, Circle } from 'lucide-react';
import { EmptyState, Badge } from '@/components/ui';
import { getDaysRemaining, getTodayString } from '@/lib/dates';
import { useCountUp } from '@/components/motion/useCountUp';
import { EASE } from '@/lib/motion';
import { fetchWithAuth } from '@/lib/api-client';

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

function AnimatedPct({ value }: { value: number }) {
  const display = useCountUp(value, 0.8);
  return <>{Math.round(display)}%</>;
}

export function GoalsWidget({ type = 'WEEKLY', showDailyCheckoff = false }: GoalsWidgetProps = {}) {
  const { goals, updateGoalProgress, updateGoal } = useApp();
  const reduce = useReducedMotion();
  const [incrementingId, setIncrementingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [checkins, setCheckins] = useState<Record<string, boolean>>({});

  const activeGoals = goals.filter(
    (g) => g.type === type && (g.status === 'ACTIVE' || g.status === 'CARRIED_OVER')
  );

  useEffect(() => {
    const loadCheckins = async () => {
      try {
        // A daily check-off is stored as a dated GoalProgress log by
        // POST /api/goals/[id]/checkin (value 1 = done, 0 = cleared), and
        // GET /api/goals/today already returns that value per goal as
        // `loggedToday`. The widget used to call a "goals today checkins"
        // endpoint that was never implemented, so every dashboard mount 404'd;
        // it now reads the canonical goals-for-today projection instead of
        // duplicating the query.
        const res = await fetchWithAuth('/api/goals/today');
        if (res.ok) {
          const json = (await res.json()) as {
            success?: boolean;
            data?: Array<{ id: string; loggedToday: number | null }>;
          };
          if (json.success && Array.isArray(json.data)) {
            const map: Record<string, boolean> = {};
            for (const goal of json.data) {
              // Null means "no progress logged today", which is different from
              // a logged 0 (an explicit un-check), so only null is falsy here.
              map[goal.id] = goal.loggedToday !== null && goal.loggedToday > 0;
            }
            setCheckins(map);
          }
        }
      } catch (err) {
        console.error('Failed to load checkins:', err);
      }
    };

    void loadCheckins();
  }, []);

  if (activeGoals.length === 0) {
    return (
      <EmptyState
        icon={<Target size={28} />}
        title="No goals set yet"
        description={`Add your first ${type.toLowerCase()} goal to track progress.`}
      />
    );
  }

  const handleDailyCheck = async (goal: Goal) => {
    const completed = checkins[goal.id] !== true;
    setIncrementingId(goal.id);
    setError(null);

    try {
      const res = await fetchWithAuth(`/api/goals/${goal.id}/checkin`, {
        method: 'POST',
        body: JSON.stringify({ date: getTodayString(), completed }),
      });

      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(json?.error || 'Failed to save check-in');
      }

      setCheckins((prev) => ({ ...prev, [goal.id]: completed }));

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

  return (
    <div className="space-y-4">
      {error && <p role="alert" className="text-xs text-destructive">{error}</p>}

      <AnimatePresence>
        {activeGoals.map((goal) => {
          const pct = goal.targetValue > 0 ? Math.min(100, (goal.currentValue / goal.targetValue) * 100) : 0;
          const daysLeft = getDaysRemaining(goal.endDate);
          const isDaily = goal.type === 'DAILY';
          const checked = isDaily && checkins[goal.id] === true;

          return (
            <motion.div
              key={goal.id}
              layout
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, height: 0 }}
              whileHover={reduce ? undefined : { y: -2 }}
              transition={{ layout: { duration: 0.4, ease: EASE } }}
              className="bg-card border border-border rounded-xl p-4 space-y-3 transition-shadow hover:shadow-md"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-start gap-2 flex-1 min-w-0">
                  {isDaily && showDailyCheckoff && (
                    <motion.span
                      key={checked ? 'checked' : 'open'}
                      initial={reduce ? false : { scale: checked ? 0.6 : 1 }}
                      animate={{ scale: 1 }}
                      transition={{ type: 'spring', stiffness: 500, damping: 22 }}
                      className="mt-0.5 shrink-0"
                    >
                      <button
                        onClick={() => handleDailyCheck(goal)}
                        aria-label={checked ? `Uncheck ${goal.title}` : `Check off ${goal.title}`}
                        className={`transition-colors ${checked ? 'text-emerald-400' : 'text-muted-foreground hover:text-emerald-400'}`}
                      >
                        {checked ? <CheckCircle2 size={18} /> : <Circle size={18} />}
                      </button>
                    </motion.span>
                  )}

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={`text-sm font-semibold truncate ${checked ? 'text-muted-foreground line-through' : 'text-foreground'}`}>
                        {goal.title}
                      </span>
                      <Badge variant={PRIORITY_COLORS[goal.priority]}>{goal.priority}</Badge>
                      {goal.carriedOverFrom && <Badge variant="primary">Carried Over</Badge>}
                    </div>

                    {!isDaily && (
                      <p className="text-xs text-muted-foreground mt-1 truncate">
                        {daysLeft > 0 ? `${daysLeft} days remaining` : 'Deadline passed'}
                      </p>
                    )}
                  </div>

                  {!isDaily && (
                    <div className="flex items-center gap-1 shrink-0">
                      <span className="text-xs font-medium text-muted-foreground">
                        {goal.currentValue}/{goal.targetValue} {goal.unit || ''}
                      </span>
                      <motion.button
                        animate={reduce ? {} : incrementingId === goal.id ? { scale: [1, 1.3, 1] } : {}}
                        whileTap={reduce ? undefined : { scale: 0.85 }}
                        onClick={() => handleIncrement(goal)}
                        className="w-6 h-6 rounded-full bg-muted hover:bg-emerald-500/20 hover:text-emerald-400 text-muted-foreground flex items-center justify-center transition"
                        title="Increment progress by 1"
                        aria-label={`Increment ${goal.title} progress`}
                      >
                        <Plus size={14} />
                      </motion.button>
                    </div>
                  )}
                </div>
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
                    <span>
                      <AnimatedPct value={pct} /> complete
                    </span>
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