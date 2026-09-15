'use client';
import React from 'react';

interface WidgetGridProps {
  children: React.ReactNode;
  columns?: 1 | 2 | 3;
}

export const WidgetGrid: React.FC<WidgetGridProps> = ({ children, columns = 3 }) => {
  const gridColsClass = {
    1: 'grid-cols-1',
    2: 'grid-cols-1 md:grid-cols-2',
    3: 'grid-cols-1 md:grid-cols-2 lg:grid-cols-3',
  }[columns];

  return (
    <div className={`grid gap-6 ${gridColsClass} w-full`}>
      {children}
    </div>
  );
};
