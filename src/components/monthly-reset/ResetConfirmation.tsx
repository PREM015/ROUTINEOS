'use client';
import React from 'react';

interface ResetConfirmationProps {
  summary: {
    habitsKept: number;
    habitsRemoved: number;
    goalsCarried: number;
    newGoals: number;
  };
  onConfirm: () => void;
  onBack: () => void;
}

export const ResetConfirmation: React.FC<ResetConfirmationProps> = ({ summary, onConfirm, onBack }) => {
  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg p-8 max-w-2xl mx-auto w-full text-center border border-gray-100 dark:border-gray-700">
      <div className="w-16 h-16 bg-indigo-100 dark:bg-indigo-900/50 rounded-full flex items-center justify-center mx-auto mb-4">
        <svg className="w-8 h-8 text-indigo-600 dark:text-indigo-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
        </svg>
      </div>
      
      <h2 className="text-2xl font-bold text-gray-800 dark:text-gray-100 mb-2">Ready for a fresh start?</h2>
      <p className="text-gray-500 dark:text-gray-400 mb-8">Review your changes for the upcoming month before finalizing.</p>
      
      <div className="grid grid-cols-2 gap-4 mb-8 text-left">
        <div className="bg-gray-50 dark:bg-gray-700/50 p-4 rounded-lg">
          <h4 className="font-semibold text-gray-700 dark:text-gray-300 mb-3 border-b border-gray-200 dark:border-gray-600 pb-2">Habits</h4>
          <ul className="space-y-2 text-sm text-gray-600 dark:text-gray-400">
            <li className="flex justify-between"><span>Kept:</span> <span className="font-medium">{summary.habitsKept}</span></li>
            <li className="flex justify-between"><span>Removed:</span> <span className="font-medium">{summary.habitsRemoved}</span></li>
          </ul>
        </div>
        <div className="bg-gray-50 dark:bg-gray-700/50 p-4 rounded-lg">
          <h4 className="font-semibold text-gray-700 dark:text-gray-300 mb-3 border-b border-gray-200 dark:border-gray-600 pb-2">Goals</h4>
          <ul className="space-y-2 text-sm text-gray-600 dark:text-gray-400">
            <li className="flex justify-between"><span>Carried over:</span> <span className="font-medium">{summary.goalsCarried}</span></li>
            <li className="flex justify-between"><span>New goals:</span> <span className="font-medium">{summary.newGoals}</span></li>
          </ul>
        </div>
      </div>
      
      <div className="flex space-x-4">
        <button
          onClick={onBack}
          className="flex-1 py-3 bg-gray-100 hover:bg-gray-200 text-gray-800 dark:bg-gray-700 dark:hover:bg-gray-600 dark:text-gray-200 font-medium rounded-lg transition-colors"
        >
          Go Back
        </button>
        <button
          onClick={onConfirm}
          className="flex-1 py-3 bg-indigo-600 hover:bg-indigo-700 text-white font-medium rounded-lg transition-colors shadow-sm"
        >
          Confirm Reset
        </button>
      </div>
    </div>
  );
};
