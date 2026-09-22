'use client'

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useApp } from '@/context/AppContext';
import { CheckCircle2, Circle, SkipForward, ChevronDown, ChevronUp } from 'lucide-react';
import { EmptyState, Card } from '@/components/ui';
import Link from 'next/link';

export default function HabitList() {
  const { habits, getLogForDate, logHabit, selectedDate } = useApp();
  
  const activeHabits = habits.filter(h => h.status === 'ACTIVE');
  
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

  const toggleCollapse = (tier: string) => {
    setCollapsed(prev => ({ ...prev, [tier]: !prev[tier] }));
  };

  if (activeHabits.length === 0) {
    return (
      <Card className="p-6">
        <EmptyState
          title="No habits yet"
          description="Start building your routine by adding your first habit."
          action={
            <Link href="/habits" className="mt-4 px-4 py-2 bg-emerald-500/20 text-emerald-400 rounded-lg hover:bg-emerald-500/30 transition text-sm font-medium">
              Add Habit
            </Link>
          }
        />
      </Card>
    );
  }

  const tiers: Array<'GROWTH' | 'BONUS' | 'LIFESTYLE'> = ['GROWTH', 'BONUS', 'LIFESTYLE'];

  let coreScore: number | null = null;
  let growthScore: number | null = null;

  const nonNegHabits = activeHabits.filter(h => h.tier === 'GROWTH');
  const growthHabits = activeHabits.filter(h => h.tier === 'BONUS');
  
  const allNonNegCompleted = nonNegHabits.length > 0 && nonNegHabits.every(h => getLogForDate(h.id, selectedDate)?.status === 'COMPLETED');
  
  if (nonNegHabits.length > 0) {
    const completed = nonNegHabits.filter(h => getLogForDate(h.id, selectedDate)?.status === 'COMPLETED').length;
    coreScore = Math.round((completed / nonNegHabits.length) * 100);
  }
  
  if (growthHabits.length > 0) {
    const completed = growthHabits.filter(h => getLogForDate(h.id, selectedDate)?.status === 'COMPLETED').length;
    growthScore = Math.round((completed / growthHabits.length) * 100);
  }

  return (
    <div className="space-y-6">
      {allNonNegCompleted && (
        <motion.div 
          initial={{ opacity: 0, y: -10 }} 
          animate={{ opacity: 1, y: 0 }}
          className="bg-emerald-500/10 border border-emerald-500/20 rounded-xl p-4 flex items-center justify-center text-emerald-400 font-medium"
        >
          All core habits done! 🎉
        </motion.div>
      )}

      {tiers.map(tier => {
        const tierHabits = activeHabits.filter(h => h.tier === tier);
        if (tierHabits.length === 0) return null;
        
        const isCollapsed = collapsed[tier] || false;
        
        return (
          <div key={tier} className="space-y-3">
            <button 
              onClick={() => toggleCollapse(tier)}
              className="flex items-center gap-2 text-sm font-semibold text-muted-foreground uppercase tracking-wider w-full text-left hover:text-foreground transition"
            >
              {isCollapsed ? <ChevronDown className="w-4 h-4" /> : <ChevronUp className="w-4 h-4" />}
              {tier.replace('_', ' ')}
            </button>
            
            <AnimatePresence>
              {!isCollapsed && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  className="space-y-2 overflow-hidden"
                >
                  {tierHabits.map(habit => {
                    const log = getLogForDate(habit.id, selectedDate);
                    const isCompleted = log?.status === 'COMPLETED';
                    const isSkipped = log?.status === 'SKIPPED';
                    const isMissed = log?.status === 'MISSED';

                    return (
                      <motion.div 
                        key={habit.id}
                        layout
                        className={`flex items-center justify-between p-3 rounded-xl border transition-colors ${
                          isCompleted ? 'bg-emerald-500/5 border-emerald-500/20' : 
                          isSkipped ? 'bg-muted/50 border-border opacity-60' :
                          isMissed ? 'bg-red-500/5 border-red-500/20' :
                          'bg-card border-border hover:border-muted-foreground/40'
                        }`}
                      >
                        <div className="flex items-center gap-3 flex-1">
                          <button 
                            onClick={() => logHabit(habit.id, selectedDate, isCompleted ? 'MISSED' : 'COMPLETED')}
                            className={`flex-shrink-0 transition-colors ${
                              isCompleted ? 'text-emerald-500' : 'text-muted-foreground hover:text-emerald-400'
                            }`}
                          >
                            {isCompleted ? <CheckCircle2 className="w-6 h-6" /> : <Circle className="w-6 h-6" />}
                          </button>
                          <div className="flex flex-col">
                            <span className={`text-sm font-medium transition-all ${
                              isCompleted || isSkipped ? 'text-muted-foreground line-through' : 'text-foreground'
                            }`}>
                              {habit.name}
                            </span>
                            <span className="text-[10px] text-muted-foreground uppercase tracking-wider">{habit.category}</span>
                          </div>
                        </div>
                        
                        <div className="flex items-center gap-2">
                          {!isCompleted && !isSkipped && (
                            <button
                              onClick={() => logHabit(habit.id, selectedDate, 'SKIPPED')}
                              className="p-1.5 text-muted-foreground hover:text-foreground hover:bg-muted rounded-md transition"
                              title="Skip for today"
                            >
                              <SkipForward className="w-4 h-4" />
                            </button>
                          )}
                        </div>
                      </motion.div>
                    );
                  })}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        );
      })}
      
      <div className="flex justify-between items-center text-xs text-muted-foreground border-t border-border pt-4 mt-6">
        <span>Core: {coreScore === null ? '—' : `${coreScore}%`}</span>
        <span>Growth: {growthScore === null ? '—' : `${growthScore}%`}</span>
      </div>
    </div>
  );
}
