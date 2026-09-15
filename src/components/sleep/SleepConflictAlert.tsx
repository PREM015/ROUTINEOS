'use client';
import React from 'react';
import { SleepConflict } from '@/lib/sleep/detect-conflict';

interface SleepConflictAlertProps {
  conflicts: SleepConflict[];
}

export function SleepConflictAlert({ conflicts }: SleepConflictAlertProps) {
  if (!conflicts || conflicts.length === 0) return null;

  return (
    <div className="p-4 bg-orange-50 border-l-4 border-orange-500 text-orange-800 rounded mb-4">
      <div className="flex items-center gap-2 mb-2">
        <span className="text-xl">⚠️</span>
        <h4 className="font-semibold">Schedule Conflicts Detected</h4>
      </div>
      <ul className="list-disc list-inside space-y-1 text-sm">
        {conflicts.map((c, i) => (
          <li key={i}>
            Your {c.type} conflicts with <strong>{c.blockName}</strong> by {c.overlapMinutes} minutes.
          </li>
        ))}
      </ul>
    </div>
  );
}
