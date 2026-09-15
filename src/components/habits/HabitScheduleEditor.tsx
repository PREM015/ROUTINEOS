"use client";

import { useState } from "react";

export default function HabitScheduleEditor({ initialFrequencyType = 'DAILY', initialConfig = null }: { initialFrequencyType?: string, initialConfig?: any }) {
  const [freqType, setFreqType] = useState(initialFrequencyType);

  return (
    <div className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Frequency</label>
        <select 
          value={freqType}
          onChange={(e) => setFreqType(e.target.value)}
          className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
        >
          <option value="DAILY">Every Day</option>
          <option value="SPECIFIC_WEEKDAYS">Specific Days of Week</option>
          <option value="WEEKLY_TARGET">Times per Week</option>
          <option value="MONTHLY_TARGET">Times per Month</option>
        </select>
      </div>

      {freqType === 'SPECIFIC_WEEKDAYS' && (
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Select Days</label>
          <div className="flex gap-2">
            {['S','M','T','W','T','F','S'].map((day, i) => (
              <button
                key={i}
                type="button"
                className="w-8 h-8 rounded-full border border-gray-300 dark:border-gray-600 flex items-center justify-center text-sm font-medium hover:bg-blue-50 dark:hover:bg-blue-900/30"
              >
                {day}
              </button>
            ))}
          </div>
        </div>
      )}

      {(freqType === 'WEEKLY_TARGET' || freqType === 'MONTHLY_TARGET') && (
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Target Times</label>
          <input 
            type="number" 
            min="1" 
            max={freqType === 'WEEKLY_TARGET' ? 7 : 31}
            defaultValue={1}
            className="w-24 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
          />
        </div>
      )}
    </div>
  );
}
