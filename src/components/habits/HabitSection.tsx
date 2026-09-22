"use client";

import { Habit, HabitLog } from "@/types/habit";
import { useState } from "react";
import HabitItem from "./HabitItem";
import { ChevronDown, ChevronRight } from "lucide-react";

interface HabitWithLog extends Habit {
  logs?: HabitLog[];
}

interface HabitSectionProps {
  title: string;
  habits: HabitWithLog[];
  tier: string;
  onToggle: (habitId: string, isCompleted: boolean) => void;
  onSkip: (habitId: string) => void;
  date: string;
}

export default function HabitSection({ title, habits, onToggle, onSkip, date }: HabitSectionProps) {
  const [isExpanded, setIsExpanded] = useState(true);

  if (habits.length === 0) return null;

  const completedCount = habits.filter(h => 
    h.logs?.some(l => l.date === date && l.status === 'COMPLETED')
  ).length;

  return (
    <div className="mb-6 bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-100 dark:border-gray-700 overflow-hidden">
      <button 
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full flex items-center justify-between p-4 bg-gray-50 dark:bg-gray-800/50 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
      >
        <div className="flex items-center space-x-2">
          {isExpanded ? <ChevronDown size={20} className="text-gray-500" /> : <ChevronRight size={20} className="text-gray-500" />}
          <h3 className="text-lg font-medium text-gray-800 dark:text-gray-200">{title}</h3>
        </div>
        <div className="flex items-center space-x-3">
          <span className="text-sm text-gray-500 font-medium">
            {completedCount} / {habits.length} completed
          </span>
          <div className="w-24 h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
            <div 
              className="h-full bg-blue-500 transition-all duration-300"
              style={{ width: `${(completedCount / habits.length) * 100}%` }}
            />
          </div>
        </div>
      </button>

      {isExpanded && (
        <div className="divide-y divide-gray-100 dark:divide-gray-700">
          {habits.map(habit => (
            <HabitItem 
              key={habit.id} 
              habit={habit} 
              date={date}
              onToggle={onToggle}
              onSkip={onSkip}
            />
          ))}
        </div>
      )}
    </div>
  );
}
