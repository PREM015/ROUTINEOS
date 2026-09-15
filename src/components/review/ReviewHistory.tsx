'use client';
import React from 'react';

interface ReviewHistoryProps {
  reviews: Array<{
    id: string;
    weekStart: string;
    weekEnd: string;
    averageScore: number;
  }>;
  onSelect: (id: string) => void;
}

export const ReviewHistory: React.FC<ReviewHistoryProps> = ({ reviews, onSelect }) => {
  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl shadow p-6 max-w-2xl mx-auto w-full">
      <h3 className="text-lg font-bold text-gray-800 dark:text-gray-100 mb-4 pb-2 border-b border-gray-100 dark:border-gray-700">
        Past Reviews
      </h3>
      
      {reviews.length === 0 ? (
        <p className="text-gray-500 dark:text-gray-400 text-center py-4">No past reviews found.</p>
      ) : (
        <ul className="divide-y divide-gray-100 dark:divide-gray-700">
          {reviews.map((review) => (
            <li key={review.id}>
              <button
                onClick={() => onSelect(review.id)}
                className="w-full flex items-center justify-between py-4 px-2 hover:bg-gray-50 dark:hover:bg-gray-700/50 rounded-lg transition-colors text-left"
              >
                <div>
                  <p className="font-medium text-gray-800 dark:text-gray-200">
                    Week of {review.weekStart}
                  </p>
                  <p className="text-sm text-gray-500 dark:text-gray-400">
                    {review.weekStart} - {review.weekEnd}
                  </p>
                </div>
                <div className="flex items-center space-x-3">
                  <div className="flex flex-col items-end">
                    <span className="text-xs text-gray-500 dark:text-gray-400 uppercase">Avg Score</span>
                    <span className="font-bold text-indigo-600 dark:text-indigo-400">{review.averageScore}</span>
                  </div>
                  <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7" />
                  </svg>
                </div>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};
