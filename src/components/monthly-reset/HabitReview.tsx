'use client';
import React from 'react';

interface Habit {
  id: string;
  name: string;
  completionRate: number;
  tier: string;
}

interface HabitReviewProps {
  habits: Habit[];
  onKeep: (id: string) => void;
  onRemove: (id: string) => void;
  onModify: (id: string) => void;
}

export const HabitReview: React.FC<HabitReviewProps> = ({ habits, onKeep, onRemove, onModify }) => {
  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg p-6 max-w-3xl mx-auto w-full">
      <h3 className="text-xl font-bold text-gray-800 dark:text-gray-100 mb-6 border-b border-gray-100 dark:border-gray-700 pb-2">
        Habit Review
      </h3>
      
      {habits.length === 0 ? (
        <p className="text-center text-gray-500 py-4">No habits to review.</p>
      ) : (
        <div className="space-y-4">
          {habits.map((habit) => (
            <div key={habit.id} className="flex flex-col md:flex-row md:items-center justify-between p-4 bg-gray-50 dark:bg-gray-700/40 rounded-lg border border-gray-100 dark:border-gray-600">
              <div className="mb-4 md:mb-0">
                <h4 className="font-semibold text-gray-800 dark:text-gray-200 text-lg">{habit.name}</h4>
                <div className="flex items-center space-x-4 mt-1 text-sm text-gray-500 dark:text-gray-400">
                  <span className="flex items-center">
                    <span className="w-2 h-2 rounded-full bg-blue-500 mr-2"></span>
                    Completion: {habit.completionRate}%
                  </span>
                  <span className="flex items-center">
                    <span className="w-2 h-2 rounded-full bg-purple-500 mr-2"></span>
                    Tier: {habit.tier}
                  </span>
                </div>
              </div>
              
              <div className="flex space-x-2">
                <button
                  onClick={() => onKeep(habit.id)}
                  className="px-3 py-1.5 bg-green-100 text-green-700 hover:bg-green-200 dark:bg-green-900/40 dark:text-green-400 dark:hover:bg-green-900/60 rounded-md text-sm font-medium transition-colors"
                >
                  Keep
                </button>
                <button
                  onClick={() => onModify(habit.id)}
                  className="px-3 py-1.5 bg-yellow-100 text-yellow-700 hover:bg-yellow-200 dark:bg-yellow-900/40 dark:text-yellow-400 dark:hover:bg-yellow-900/60 rounded-md text-sm font-medium transition-colors"
                >
                  Modify
                </button>
                <button
                  onClick={() => onRemove(habit.id)}
                  className="px-3 py-1.5 bg-red-100 text-red-700 hover:bg-red-200 dark:bg-red-900/40 dark:text-red-400 dark:hover:bg-red-900/60 rounded-md text-sm font-medium transition-colors"
                >
                  Drop
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
