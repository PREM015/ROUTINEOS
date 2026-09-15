'use client';
import React from 'react';

interface InsightWidgetProps {
  insight?: {
    summary: string;
    type: string;
    createdAt: string;
  } | null;
}

export const InsightWidget: React.FC<InsightWidgetProps> = ({ insight }) => {
  if (!insight) {
    return (
      <div className="p-4 bg-white dark:bg-gray-800 rounded-xl shadow h-full flex flex-col justify-center items-center">
        <svg className="w-8 h-8 text-gray-400 mb-2 animate-pulse" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 10V3L4 14h7v7l9-11h-7z" />
        </svg>
        <p className="text-gray-500 dark:text-gray-400">Insights loading...</p>
      </div>
    );
  }

  const getTypeColor = (type: string) => {
    switch(type.toLowerCase()) {
      case 'warning': return 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300';
      case 'positive': return 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300';
      case 'suggestion': return 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300';
      default: return 'bg-indigo-100 text-indigo-800 dark:bg-indigo-900/30 dark:text-indigo-300';
    }
  };

  return (
    <div className="p-4 bg-white dark:bg-gray-800 rounded-xl shadow h-full flex flex-col relative overflow-hidden">
      <div className="absolute top-0 right-0 p-4 opacity-10 pointer-events-none">
        <svg className="w-16 h-16" fill="currentColor" viewBox="0 0 20 20">
          <path d="M9 2a1 1 0 000 2h2a1 1 0 100-2H9z" />
          <path fillRule="evenodd" d="M4 5a2 2 0 012-2 3 3 0 003 3h2a3 3 0 003-3 2 2 0 012 2v11a2 2 0 01-2 2H6a2 2 0 01-2-2V5zm3 4a1 1 0 000 2h.01a1 1 0 100-2H7zm3 0a1 1 0 000 2h3a1 1 0 100-2h-3zm-3 4a1 1 0 100 2h.01a1 1 0 100-2H7zm3 0a1 1 0 100 2h3a1 1 0 100-2h-3z" clipRule="evenodd" />
        </svg>
      </div>
      
      <div className="flex justify-between items-start mb-3 z-10">
        <h3 className="text-lg font-semibold text-gray-700 dark:text-gray-200">AI Insight</h3>
        <span className={`px-2 py-1 text-xs font-semibold rounded-full ${getTypeColor(insight.type)}`}>
          {insight.type}
        </span>
      </div>
      
      <div className="flex-grow z-10">
        <p className="text-gray-700 dark:text-gray-300 italic">"{insight.summary}"</p>
      </div>
      
      <div className="mt-4 pt-3 border-t border-gray-100 dark:border-gray-700 z-10 text-right">
        <span className="text-xs text-gray-500 dark:text-gray-400">{insight.createdAt}</span>
      </div>
    </div>
  );
};
