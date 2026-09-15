"use client";

import { RoutineBlock, RoutineConflict } from "@/types/routine";
import { AlertCircle } from "lucide-react";
import { formatDuration } from "@/lib/routine/duration";

interface RoutineConflictAlertProps {
  conflicts: RoutineConflict[];
  blocks: RoutineBlock[];
}

export default function RoutineConflictAlert({ conflicts, blocks }: RoutineConflictAlertProps) {
  if (conflicts.length === 0) return null;

  return (
    <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4 mb-6">
      <div className="flex items-start space-x-3">
        <div className="text-red-500 mt-0.5">
          <AlertCircle size={20} />
        </div>
        <div>
          <h4 className="text-sm font-medium text-red-800 dark:text-red-300">
            Schedule Conflicts Detected
          </h4>
          <div className="mt-2 space-y-2">
            {conflicts.map((conflict, i) => {
              const b1 = blocks.find(b => b.id === conflict.blockIds[0]);
              const b2 = blocks.find(b => b.id === conflict.blockIds[1]);
              if (!b1 || !b2) return null;

              return (
                <div key={i} className="text-sm text-red-700 dark:text-red-400 bg-white/50 dark:bg-gray-900/50 p-2 rounded">
                  <span className="font-semibold">{b1.title}</span> ({b1.startTime}-{b1.endTime}) overlaps with{' '}
                  <span className="font-semibold">{b2.title}</span> ({b2.startTime}-{b2.endTime}) by{' '}
                  <span className="font-bold">{formatDuration(conflict.overlapMinutes)}</span>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
