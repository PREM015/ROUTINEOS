"use client";

import { HabitLog } from "@/types/habit";
import { format, subDays, isSameDay, parseISO } from "date-fns";

export default function HabitHistory({ logs }: { logs: HabitLog[] }) {
  const today = new Date();
  const days = Array.from({ length: 30 }).map((_, i) => subDays(today, 29 - i));

  const getStatusColor = (status?: string) => {
    switch (status) {
      case 'COMPLETED': return 'bg-blue-500';
      case 'PARTIAL': return 'bg-blue-300 dark:bg-blue-600';
      case 'MISSED': return 'bg-red-400 dark:bg-red-500';
      default: return 'bg-gray-200 dark:bg-gray-700';
    }
  };

  return (
    <div className="mt-4">
      <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Last 30 Days</h4>
      <div className="flex flex-wrap gap-1">
        {days.map((day, i) => {
          const log = logs.find(l => isSameDay(parseISO(l.date), day));
          return (
            <div
              key={i}
              title={`${format(day, 'MMM d')}: ${log?.status || 'No data'}`}
              className={`w-4 h-4 rounded-sm ${getStatusColor(log?.status)}`}
            />
          );
        })}
      </div>
    </div>
  );
}
