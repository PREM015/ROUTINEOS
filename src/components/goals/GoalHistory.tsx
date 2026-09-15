'use client';
import { GoalProgress } from '@/types/goal';
import { format } from 'date-fns';

export default function GoalHistory({ history }: { history: GoalProgress[] }) {
  if (!history || history.length === 0) {
    return <p className="text-sm text-gray-500">No progress history yet.</p>;
  }

  return (
    <div className="space-y-4">
      {history.map((entry) => (
        <div key={entry.id} className="flex gap-4 items-start">
          <div className="w-24 text-sm text-gray-500 pt-1">
            {format(new Date(entry.date), 'MMM d, yyyy')}
          </div>
          <div className="flex-1 border-l-2 border-gray-200 dark:border-gray-700 pl-4 pb-4">
            <div className="font-medium text-gray-900 dark:text-gray-100">
              Value: {entry.value}
            </div>
            {entry.note && (
              <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">{entry.note}</p>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
