'use client';
import React from 'react';

interface RoutineWidgetProps {
  completedBlocks: number;
  totalBlocks: number;
  currentBlock?: {
    name: string;
    endTime: string;
  } | null;
}

export const RoutineWidget: React.FC<RoutineWidgetProps> = ({ completedBlocks, totalBlocks, currentBlock }) => {
  const percentage = totalBlocks > 0 ? Math.round((completedBlocks / totalBlocks) * 100) : 0;

  return (
    <div className="p-4 bg-white dark:bg-gray-800 rounded-xl shadow h-full">
      <h3 className="text-lg font-semibold text-gray-700 dark:text-gray-200 mb-4">Routine Progress</h3>
      
      <div className="mb-6">
        <div className="flex justify-between items-center mb-2">
          <span className="text-2xl font-bold text-gray-900 dark:text-white">{percentage}%</span>
          <span className="text-sm text-gray-500 dark:text-gray-400">{completedBlocks} of {totalBlocks} blocks</span>
        </div>
        <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-3">
          <div
            className="bg-indigo-600 h-3 rounded-full transition-all duration-500"
            style={{ width: `${percentage}%` }}
          />
        </div>
      </div>
      
      {currentBlock ? (
        <div className="p-3 bg-indigo-50 dark:bg-indigo-900/30 rounded-lg border border-indigo-100 dark:border-indigo-800">
          <p className="text-xs text-indigo-600 dark:text-indigo-400 font-semibold uppercase tracking-wider mb-1">Current Block</p>
          <p className="text-gray-900 dark:text-gray-100 font-medium">{currentBlock.name}</p>
          <p className="text-sm text-gray-500 dark:text-gray-400">Until {currentBlock.endTime}</p>
        </div>
      ) : (
        <div className="p-3 bg-gray-50 dark:bg-gray-700/50 rounded-lg border border-gray-100 dark:border-gray-600 text-center">
          <p className="text-gray-500 dark:text-gray-400">No active block</p>
        </div>
      )}
    </div>
  );
};
