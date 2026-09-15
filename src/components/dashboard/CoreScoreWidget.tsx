'use client';
import React from 'react';

interface CoreScoreWidgetProps {
  score?: number;
  band?: string;
  nonNegCompleted: number;
  nonNegTotal: number;
  dayMode: string;
}

export const CoreScoreWidget: React.FC<CoreScoreWidgetProps> = ({
  score = 0,
  band = 'None',
  nonNegCompleted = 0,
  nonNegTotal = 0,
  dayMode = 'Normal',
}) => {
  const getColor = (s: number) => {
    if (s >= 90) return 'text-green-500';
    if (s >= 70) return 'text-blue-500';
    if (s >= 50) return 'text-yellow-500';
    return 'text-red-500';
  };
  const getStrokeColor = (s: number) => {
    if (s >= 90) return 'stroke-green-500';
    if (s >= 70) return 'stroke-blue-500';
    if (s >= 50) return 'stroke-yellow-500';
    return 'stroke-red-500';
  };

  const radius = 40;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (score / 100) * circumference;

  return (
    <div className="flex flex-col items-center justify-center p-4 bg-white dark:bg-gray-800 rounded-xl shadow">
      <div className="flex items-center justify-between w-full mb-4">
        <h3 className="text-lg font-semibold text-gray-700 dark:text-gray-200">Core Score</h3>
        <span className="px-2 py-1 text-xs font-medium bg-gray-100 dark:bg-gray-700 rounded-full">{dayMode}</span>
      </div>
      
      <div className="relative flex items-center justify-center mb-4">
        <svg className="w-32 h-32 transform -rotate-90">
          <circle
            cx="64"
            cy="64"
            r={radius}
            stroke="currentColor"
            strokeWidth="8"
            fill="transparent"
            className="text-gray-200 dark:text-gray-700"
          />
          <circle
            cx="64"
            cy="64"
            r={radius}
            stroke="currentColor"
            strokeWidth="8"
            fill="transparent"
            strokeDasharray={circumference}
            strokeDashoffset={strokeDashoffset}
            className={`${getStrokeColor(score)} transition-all duration-1000 ease-in-out`}
            strokeLinecap="round"
          />
        </svg>
        <div className="absolute flex flex-col items-center">
          <span className={`text-4xl font-bold ${getColor(score)}`}>{score}</span>
        </div>
      </div>
      
      <div className="text-center">
        <p className={`text-lg font-medium ${getColor(score)} mb-1`}>{band}</p>
        <p className="text-sm text-gray-500 dark:text-gray-400">
          Non-negotiables: {nonNegCompleted}/{nonNegTotal}
        </p>
      </div>
    </div>
  );
};
