'use client';

import { CheckCircle2, Circle, SkipForward } from 'lucide-react';

interface Habit {
  id: string;
  name: string;
  tier: 'NON_NEGOTIABLE' | 'GROWTH' | 'BONUS';
}

interface GroupedHabits {
  NON_NEGOTIABLE: Habit[];
  GROWTH: Habit[];
  BONUS: Habit[];
}

interface TodayHabitChecklistProps {
  habits: GroupedHabits;
  date: string;
  logs: Record<string, { completed: boolean; skipped: boolean }>;
  onToggle: (habitId: string) => void;
  onSkip: (habitId: string) => void;
}

export function TodayHabitChecklist({ habits, logs, onToggle, onSkip }: TodayHabitChecklistProps) {
  const renderTier = (title: string, tierHabits: Habit[]) => {
    if (!tierHabits.length) return null;
    return (
      <div className="mb-6">
        <h4 className="text-sm font-semibold text-zinc-400 mb-3 uppercase tracking-wider">{title}</h4>
        <div className="space-y-2">
          {tierHabits.map(habit => {
            const log = logs[habit.id];
            const isCompleted = log?.completed;
            const isSkipped = log?.skipped;
            return (
              <div key={habit.id} className="flex items-center justify-between p-3 bg-zinc-900 border border-zinc-800 rounded-lg">
                <div className="flex items-center gap-3">
                  <button onClick={() => onToggle(habit.id)} className="text-zinc-500 hover:text-white transition-colors">
                    {isCompleted ? <CheckCircle2 className="w-6 h-6 text-green-500" /> : <Circle className="w-6 h-6" />}
                  </button>
                  <span className={\`font-medium \${isCompleted || isSkipped ? 'text-zinc-500 line-through' : 'text-zinc-200'}\`}>
                    {habit.name}
                  </span>
                </div>
                <button 
                  onClick={() => onSkip(habit.id)} 
                  className={\`p-2 rounded-md transition-colors \${isSkipped ? 'bg-zinc-800 text-yellow-500' : 'text-zinc-500 hover:bg-zinc-800'}\`}
                  title="Skip for today"
                >
                  <SkipForward className="w-4 h-4" />
                </button>
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  return (
    <div>
      {renderTier('Non-Negotiable', habits.NON_NEGOTIABLE)}
      {renderTier('Growth', habits.GROWTH)}
      {renderTier('Bonus', habits.BONUS)}
    </div>
  );
}
