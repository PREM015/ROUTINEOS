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
    <div className={`flex flex-col overflow-hidden rounded-xl border border-border bg-card shadow-sm transition-all duration-300 ease-out-expo hover:-translate-y-0.5 hover:shadow-md ${className}`}>
      <div className="px-4 py-3 border-b border-border flex justify-between items-center bg-muted/30">
        <div className="flex items-center space-x-2">
          {icon && <span className="text-muted-foreground">{icon}</span>}
          <h3 className="text-sm font-semibold text-foreground uppercase tracking-wider">{title}</h3>
        </div>
        {onEdit && (
          <button
            onClick={onEdit}
            className="p-1 text-muted-foreground/70 hover:text-foreground transition-colors rounded-md hover:bg-muted active:scale-90"
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

export default WidgetContainer;