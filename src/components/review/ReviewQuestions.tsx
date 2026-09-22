'use client';
import React, { useState } from 'react';

export interface ReviewFormData {
  workedWell?: string;
  didntWork?: string;
  biggestWin?: string;
  biggestDifficulty?: string;
  shouldChange?: string;
  nextWeekFocus?: string;
}

interface ReviewQuestionsProps {
  onSubmit: (data: ReviewFormData) => void;
}

const QUESTIONS = [
  { id: 'workedWell', label: 'What worked well this week?' },
  { id: 'didntWork', label: "What didn't work?" },
  { id: 'biggestWin', label: 'What was your biggest win?' },
  { id: 'biggestDifficulty', label: 'What was your biggest difficulty?' },
  { id: 'shouldChange', label: 'What should change next week?' },
  { id: 'nextWeekFocus', label: 'What is your focus for next week?' },
] as const;

export const ReviewQuestions: React.FC<ReviewQuestionsProps> = ({ onSubmit }) => {
  const [currentStep, setCurrentStep] = useState(0);
  const [formData, setFormData] = useState<ReviewFormData>({});

  const handleNext = () => {
    if (currentStep < QUESTIONS.length - 1) {
      setCurrentStep((prev) => prev + 1);
    } else {
      onSubmit(formData);
    }
  };

  const handlePrev = () => {
    if (currentStep > 0) {
      setCurrentStep((prev) => prev - 1);
    }
  };

  const question = QUESTIONS[currentStep];
  if (!question) {
    return null;
  }
  const progress = Math.round(((currentStep + 1) / QUESTIONS.length) * 100);

  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg p-6 max-w-2xl mx-auto w-full">
      <div className="mb-6">
        <div className="flex justify-between items-center mb-2">
          <span className="text-sm text-gray-500 dark:text-gray-400">Question {currentStep + 1} of {QUESTIONS.length}</span>
          <span className="text-sm font-medium text-indigo-600 dark:text-indigo-400">{progress}%</span>
        </div>
        <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
          <div className="bg-indigo-600 h-2 rounded-full transition-all duration-300" style={{ width: `${progress}%` }} />
        </div>
      </div>

      <div className="mb-8 min-h-[150px]">
        <h3 className="text-xl font-semibold text-gray-800 dark:text-gray-100 mb-4">{question.label}</h3>
        <textarea
          className="w-full p-4 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 resize-none h-32"
          placeholder="Type your answer here..."
          value={formData[question.id as keyof ReviewFormData] || ''}
          onChange={(e) => setFormData({ ...formData, [question.id]: e.target.value })}
        />
      </div>

      <div className="flex justify-between items-center">
        <button
          onClick={handlePrev}
          disabled={currentStep === 0}
          className={`px-4 py-2 rounded-lg font-medium transition-colors ${
            currentStep === 0
              ? 'text-gray-400 cursor-not-allowed bg-gray-100 dark:bg-gray-800 dark:text-gray-600'
              : 'text-gray-700 bg-gray-200 hover:bg-gray-300 dark:text-gray-200 dark:bg-gray-700 dark:hover:bg-gray-600'
          }`}
        >
          Previous
        </button>
        <button
          onClick={handleNext}
          className="px-6 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg font-medium transition-colors"
        >
          {currentStep === QUESTIONS.length - 1 ? 'Submit Review' : 'Next'}
        </button>
      </div>
    </div>
  );
};
