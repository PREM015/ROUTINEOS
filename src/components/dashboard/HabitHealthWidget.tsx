'use client';
import React from 'react';

interface Habit {
  name: string;
  completionRate: number;
  streak: number;
  tier: string;
}

interface HabitHealthWidgetProps {
  habits: Habit[];
}

export const HabitHealthWidget: React.FC<HabitHealthWidgetProps> = ({ habits }) => {
  const topHabits = habits.slice(0, 3);
  
  const getTierColor = (tier: string) => {
    switch(tier.toLowerCase()) {
      case 'gold': return 'bg-yellow-400';
      case 'silver': return 'bg-gray-300';
      case 'bronze': return 'bg-amber-600';
      default: return 'bg-blue-400';
    }
  };

  return (
    <div className="p-4 bg-white dark:bg-gray-800 rounded-xl shadow h-full">
      <h3 className="text-lg font-semibold text-gray-700 dark:text-gray-200 mb-4">Habit Health</h3>
      
      {topHabits.length > 0 ? (
        <div className="space-y-4">
          {topHabits.map((habit, idx) => (
            <div key={idx} className="flex flex-col">
              <div className="flex justify-between items-center mb-1">
                <div className="flex items-center space-x-2">
                  <span className={`w-3 h-3 rounded-full ${getTierColor(habit.tier)}`} title={`Tier: ${habit.tier}`} />
                  <span className="font-medium text-gray-800 dark:text-gray-200">{habit.name}</span>
                </div>
                <div className="text-sm text-gray-500 dark:text-gray-400 flex space-x-2">
                  <span>{habit.completionRate}%</span>
                  <span>🔥 {habit.streak}</span>
                </div>
              </div>
              <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
                <div
                  className="bg-emerald-500 h-2 rounded-full"
                  style={{ width: `${habit.completionRate}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="text-center py-4 text-gray-500 dark:text-gray-400">
          No habits to display
        </div>
      )}
    </div>
  );
};
