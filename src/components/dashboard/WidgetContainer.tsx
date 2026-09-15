'use client';
import React from 'react';

interface WidgetContainerProps {
  title: string;
  icon?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  onEdit?: () => void;
}

export const WidgetContainer: React.FC<WidgetContainerProps> = ({
  title,
  icon,
  children,
  className = '',
  onEdit
}) => {
  return (
    <div className={`bg-white dark:bg-gray-800 rounded-xl shadow flex flex-col overflow-hidden ${className}`}>
      <div className="px-4 py-3 border-b border-gray-100 dark:border-gray-700 flex justify-between items-center bg-gray-50/50 dark:bg-gray-800/50">
        <div className="flex items-center space-x-2">
          {icon && <span className="text-gray-500 dark:text-gray-400">{icon}</span>}
          <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-200 uppercase tracking-wider">{title}</h3>
        </div>
        {onEdit && (
          <button 
            onClick={onEdit}
            className="p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors rounded-md hover:bg-gray-100 dark:hover:bg-gray-700"
            aria-label="Edit widget"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
          </button>
        )}
      </div>
      <div className="flex-grow p-4">
        {children}
      </div>
    </div>
  );
};
