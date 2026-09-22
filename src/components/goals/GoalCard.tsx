'use client';
import { Goal } from '@/types/goal';
import { calculateCompletionPercentage, getProgressStatus } from '@/lib/goals/progress';
import { motion } from 'framer-motion';
import { Calendar, Target } from 'lucide-react';
import GoalPriorityBadge from './GoalPriorityBadge';
import GoalProgressBar from './GoalProgressBar';
import { format } from 'date-fns';

export default function GoalCard({ goal, onClick }: { goal: Goal, onClick?: () => void }) {
  const percentage = calculateCompletionPercentage(goal);
  const status = getProgressStatus(goal);

  return (
    <motion.div 
      whileHover={{ scale: 1.02 }}
      onClick={onClick}
      className="bg-white dark:bg-gray-800 p-5 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm cursor-pointer hover:shadow-md transition-shadow"
    >
      <div className="flex justify-between items-start mb-3">
        <h3 className="font-semibold text-lg text-gray-900 dark:text-white line-clamp-1">{goal.title}</h3>
        <GoalPriorityBadge priority={goal.priority} />
      </div>
      
      <p className="text-sm text-gray-500 dark:text-gray-400 mb-4 line-clamp-2">
        {goal.description || 'No description provided.'}
      </p>

      <GoalProgressBar percentage={percentage} current={goal.currentValue || 0} target={goal.targetValue || 0} unit={goal.unit || undefined} />

      <div className="mt-4 flex items-center justify-between text-xs text-gray-500 dark:text-gray-400">
        <div className="flex items-center gap-1">
          <Calendar size={14} />
          <span>Due {format(new Date(goal.endDate), 'MMM d, yyyy')}</span>
        </div>
        <div className="flex items-center gap-1">
          <Target size={14} />
          <span className="capitalize">{status.replace('-', ' ')}</span>
        </div>
      </div>
    </motion.div>
  );
}
