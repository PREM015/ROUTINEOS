"use client";

import { Habit, HabitLog } from "@/types/habit";
import HabitQuickActions from "./HabitQuickActions";
import { Check, Flame } from "lucide-react";

interface HabitWithLog extends Habit {
  logs?: HabitLog[];
}

interface HabitItemProps {
  habit: HabitWithLog;
  date: string;
  onToggle: (habitId: string, isCompleted: boolean) => void;
  onSkip: (habitId: string) => void;
}

export default function HabitItem({ habit, date, onToggle, onSkip }: HabitItemProps) {
  const log = habit.logs?.find(l => l.date === date);
  const isCompleted = log?.status === 'COMPLETED';
  
  const streak = habit.stats?.currentStreak || 0;

  const getTierColor = () => {
    switch (habit.tier) {
      case 'CORE': return 'border-blue-500';
      case 'SECONDARY': return 'border-green-500';
      case 'FLEX': return 'border-purple-500';
      default: return 'border-gray-500';
    }
  };

  return (
    <div className={`p-4 flex items-center justify-between hover:bg-gray-50 dark:hover:bg-gray-800/80 transition-colors border-l-4 ${getTierColor()}`}>
      <div className="flex items-center space-x-4">
        <button
          onClick={() => onToggle(habit.id, !isCompleted)}
          className={`w-6 h-6 rounded-md border flex items-center justify-center transition-colors ${
            isCompleted 
              ? 'bg-blue-500 border-blue-500 text-white' 
              : 'border-gray-300 dark:border-gray-600 hover:border-blue-400'
          }`}
        >
          {isCompleted && <Check size={16} strokeWidth={3} />}
        </button>
        
        <div>
          <h4 className={`text-base font-medium ${isCompleted ? 'text-gray-400 line-through' : 'text-gray-800 dark:text-gray-200'}`}>
            {habit.name}
          </h4>
          {habit.description && (
            <p className="text-sm text-gray-500 line-clamp-1">{habit.description}</p>
          )}
        </div>
      </div>

      <div className="flex items-center space-x-4">
        {streak > 0 && (
          <div className="flex items-center space-x-1 text-orange-500 bg-orange-50 dark:bg-orange-500/10 px-2 py-1 rounded-full text-xs font-medium">
            <Flame size={14} />
            <span>{streak}</span>
          </div>
        )}
        <HabitQuickActions habit={habit} onSkip={() => onSkip(habit.id)} />
      </div>
    </div>
  );
}
