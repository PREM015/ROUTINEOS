'use client';

import { motion } from 'framer-motion';

interface Goal {
  id: string;
  title: string;
  target: number;
  currentValue: number;
  unit: string;
}

export function TodayGoals({ goals }: { goals: Goal[] }) {
  if (goals.length === 0) return null;

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6">
      <h3 className="text-lg font-semibold text-white mb-4">Active Goals</h3>
      <div className="space-y-4">
        {goals.map(goal => {
          const progress = Math.min((goal.currentValue / goal.target) * 100, 100);
          return (
            <div key={goal.id}>
              <div className="flex justify-between text-sm text-zinc-300 mb-1">
                <span>{goal.title}</span>
                <span>{goal.currentValue} / {goal.target} {goal.unit}</span>
              </div>
              <div className="h-2 bg-zinc-800 rounded-full overflow-hidden">
                <motion.div 
                  initial={{ width: 0 }}
                  animate={{ width: \`\${progress}%\` }}
                  className="h-full bg-emerald-500 rounded-full"
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
