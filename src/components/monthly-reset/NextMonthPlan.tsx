'use client';
import React, { useState } from 'react';

interface NextMonthPlanProps {
  onSubmit: (data: { monthlyFocus: string; goals: string[] }) => void;
}

export const NextMonthPlan: React.FC<NextMonthPlanProps> = ({ onSubmit }) => {
  const [focus, setFocus] = useState('');
  const [goals, setGoals] = useState(['', '', '']);

  const handleGoalChange = (index: number, value: string) => {
    const newGoals = [...goals];
    newGoals[index] = value;
    setGoals(newGoals);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit({
      monthlyFocus: focus,
      goals: goals.filter((g) => g.trim() !== ''),
    });
  };

  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg p-6 max-w-3xl mx-auto w-full">
      <h3 className="text-xl font-bold text-gray-800 dark:text-gray-100 mb-6 border-b border-gray-100 dark:border-gray-700 pb-2">
        Plan Next Month
      </h3>
      
      <form onSubmit={handleSubmit} className="space-y-6">
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            Monthly Focus / Theme
          </label>
          <input
            type="text"
            required
            value={focus}
            onChange={(e) => setFocus(e.target.value)}
            placeholder="e.g., Deep Work, Health First, Consistency"
            className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
          />
          <p className="mt-1 text-xs text-gray-500">A single overarching theme for the month.</p>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            Key Goals (Top 3)
          </label>
          <div className="space-y-3">
            {goals.map((goal, index) => (
              <div key={index} className="flex items-center">
                <span className="w-6 text-center font-medium text-gray-400">{index + 1}.</span>
                <input
                  type="text"
                  value={goal}
                  onChange={(e) => handleGoalChange(index, e.target.value)}
                  placeholder={`Goal ${index + 1}`}
                  className="flex-1 ml-2 px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                />
              </div>
            ))}
          </div>
        </div>

        <div className="pt-4 border-t border-gray-100 dark:border-gray-700">
          <button
            type="submit"
            className="w-full py-3 bg-indigo-600 hover:bg-indigo-700 text-white font-medium rounded-lg transition-colors"
          >
            Save Plan
          </button>
        </div>
      </form>
    </div>
  );
};
