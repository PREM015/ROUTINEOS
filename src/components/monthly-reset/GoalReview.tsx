'use client';
import React from 'react';

interface Goal {
  id: string;
  title: string;
  status: string;
  progressPercent: number;
}

interface GoalReviewProps {
  goals: Goal[];
  onCarryOver: (id: string) => void;
  onComplete: (id: string) => void;
  onDrop: (id: string) => void;
}

export const GoalReview: React.FC<GoalReviewProps> = ({ goals, onCarryOver, onComplete, onDrop }) => {
  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg p-6 max-w-3xl mx-auto w-full">
      <h3 className="text-xl font-bold text-gray-800 dark:text-gray-100 mb-6 border-b border-gray-100 dark:border-gray-700 pb-2">
        Goal Review
      </h3>
      
      {goals.length === 0 ? (
        <p className="text-center text-gray-500 py-4">No active goals to review.</p>
      ) : (
        <div className="space-y-4">
          {goals.map((goal) => (
            <div key={goal.id} className="p-4 bg-gray-50 dark:bg-gray-700/40 rounded-lg border border-gray-100 dark:border-gray-600">
              <div className="flex justify-between items-start mb-3">
                <h4 className="font-semibold text-gray-800 dark:text-gray-200">{goal.title}</h4>
                <span className="text-xs px-2 py-1 bg-gray-200 dark:bg-gray-600 text-gray-700 dark:text-gray-300 rounded-full font-medium">
                  {goal.status}
                </span>
              </div>
              
              <div className="mb-4">
                <div className="flex justify-between text-xs text-gray-500 mb-1">
                  <span>Progress</span>
                  <span>{goal.progressPercent}%</span>
                </div>
                <div className="w-full bg-gray-200 dark:bg-gray-600 rounded-full h-1.5">
                  <div className="bg-indigo-500 h-1.5 rounded-full" style={{ width: `${goal.progressPercent}%` }}></div>
                </div>
              </div>
              
              <div className="flex space-x-2 mt-4 pt-4 border-t border-gray-200 dark:border-gray-600">
                <button
                  onClick={() => onComplete(goal.id)}
                  className="flex-1 py-2 bg-emerald-100 text-emerald-700 hover:bg-emerald-200 dark:bg-emerald-900/40 dark:text-emerald-400 dark:hover:bg-emerald-900/60 rounded-lg text-sm font-medium transition-colors"
                >
                  Mark Complete
                </button>
                <button
                  onClick={() => onCarryOver(goal.id)}
                  className="flex-1 py-2 bg-blue-100 text-blue-700 hover:bg-blue-200 dark:bg-blue-900/40 dark:text-blue-400 dark:hover:bg-blue-900/60 rounded-lg text-sm font-medium transition-colors"
                >
                  Carry Over
                </button>
                <button
                  onClick={() => onDrop(goal.id)}
                  className="flex-1 py-2 bg-red-100 text-red-700 hover:bg-red-200 dark:bg-red-900/40 dark:text-red-400 dark:hover:bg-red-900/60 rounded-lg text-sm font-medium transition-colors"
                >
                  Drop Goal
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
