'use client';

import React from 'react';

interface Props {
  milestone: {
    title: string;
    description: string;
    achievedAt: string;
    type: 'streak' | 'habit' | 'goal' | 'score';
  };
}

export default function MilestoneCard({ milestone }: Props) {
  const icons = {
    streak: '🔥',
    habit: '✅',
    goal: '🎯',
    score: '⭐'
  };

  const bgColors = {
    streak: 'bg-orange-50 border-orange-200',
    habit: 'bg-green-50 border-green-200',
    goal: 'bg-blue-50 border-blue-200',
    score: 'bg-yellow-50 border-yellow-200'
  };

  const iconColors = {
    streak: 'bg-orange-100 text-orange-600',
    habit: 'bg-green-100 text-green-600',
    goal: 'bg-blue-100 text-blue-600',
    score: 'bg-yellow-100 text-yellow-600'
  };

  return (
    <div className={`p-4 rounded-xl border ${bgColors[milestone.type]} flex items-center space-x-4 shadow-sm`}>
      <div className={`w-12 h-12 rounded-full flex items-center justify-center text-2xl ${iconColors[milestone.type]}`}>
        {icons[milestone.type]}
      </div>
      <div className="flex-1">
        <h3 className="font-bold text-gray-800">{milestone.title}</h3>
        <p className="text-sm text-gray-600">{milestone.description}</p>
      </div>
      <div className="text-xs text-gray-400 font-medium">
        {new Date(milestone.achievedAt).toLocaleDateString()}
      </div>
    </div>
  );
}
