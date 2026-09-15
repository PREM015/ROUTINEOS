'use client';
import React from 'react';

interface ReviewAnswersProps {
  answers: {
    workedWell?: string;
    didntWork?: string;
    biggestWin?: string;
    biggestDifficulty?: string;
    shouldChange?: string;
    nextWeekFocus?: string;
  };
}

const QUESTION_MAP: Record<keyof ReviewAnswersProps['answers'], string> = {
  workedWell: 'What worked well this week?',
  didntWork: "What didn't work?",
  biggestWin: 'What was your biggest win?',
  biggestDifficulty: 'What was your biggest difficulty?',
  shouldChange: 'What should change next week?',
  nextWeekFocus: 'What is your focus for next week?',
};

export const ReviewAnswers: React.FC<ReviewAnswersProps> = ({ answers }) => {
  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg p-6 max-w-2xl mx-auto w-full">
      <h3 className="text-xl font-bold text-gray-800 dark:text-gray-100 mb-6 pb-2 border-b border-gray-100 dark:border-gray-700">
        Review Answers
      </h3>
      <div className="space-y-6">
        {Object.entries(answers).map(([key, value]) => {
          if (!value) return null;
          return (
            <div key={key} className="bg-gray-50 dark:bg-gray-700/30 p-4 rounded-lg">
              <h4 className="text-sm font-semibold text-gray-500 dark:text-gray-400 mb-2">
                {QUESTION_MAP[key as keyof ReviewAnswersProps['answers']]}
              </h4>
              <p className="text-gray-800 dark:text-gray-200 whitespace-pre-wrap">{value}</p>
            </div>
          );
        })}
      </div>
    </div>
  );
};
