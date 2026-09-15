"use client";

import { AlertTriangle, Lightbulb } from "lucide-react";

export default function HabitFrictionCard({ habitName, reliability, suggestion }: { habitName: string, reliability: number, suggestion: string }) {
  return (
    <div className="bg-orange-50 dark:bg-orange-900/20 border border-orange-200 dark:border-orange-800 rounded-lg p-4 mb-4">
      <div className="flex items-start space-x-3">
        <div className="mt-0.5 text-orange-500">
          <AlertTriangle size={20} />
        </div>
        <div>
          <h4 className="text-sm font-medium text-orange-800 dark:text-orange-300">
            Friction Detected: {habitName}
          </h4>
          <p className="text-sm text-orange-700 dark:text-orange-400 mt-1">
            Reliability has dropped to {reliability}%. You often miss this on weekends.
          </p>
          <div className="mt-3 flex items-start space-x-2 bg-white dark:bg-gray-800 rounded-md p-3 border border-orange-100 dark:border-orange-700/50">
            <Lightbulb size={16} className="text-yellow-500 mt-0.5" />
            <p className="text-sm text-gray-700 dark:text-gray-300">
              <span className="font-medium text-gray-900 dark:text-gray-100">Suggestion: </span>
              {suggestion}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
