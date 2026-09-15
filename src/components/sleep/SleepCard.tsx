'use client';
import React from 'react';
import { SleepLog } from '@/types/sleep';
import { formatSleepDuration } from '@/lib/sleep/calculate-duration';
import { getSleepScoreBand } from '@/lib/sleep/sleep-score';

interface SleepCardProps {
  sleepLog?: SleepLog | null;
  targetBedtime?: string;
  targetWakeTime?: string;
  onEdit: () => void;
}

export function SleepCard({ sleepLog, targetBedtime, targetWakeTime, onEdit }: SleepCardProps) {
  if (!sleepLog) {
    return (
      <div className="p-4 border rounded-lg bg-white shadow flex flex-col items-center justify-center space-y-4">
        <div className="text-gray-500 flex items-center gap-2">
          <span className="text-2xl">🌙</span>
          <span>No sleep logged for today.</span>
        </div>
        <button 
          onClick={onEdit}
          className="px-4 py-2 bg-indigo-600 text-white rounded hover:bg-indigo-700 transition"
        >
          Log Sleep
        </button>
      </div>
    );
  }

  const band = sleepLog.score !== undefined ? getSleepScoreBand(sleepLog.score) : null;

  return (
    <div className="p-4 border rounded-lg bg-white shadow">
      <div className="flex justify-between items-start mb-4">
        <h3 className="text-lg font-semibold flex items-center gap-2">
          <span className="text-2xl">🌙</span> Sleep Summary
        </h3>
        {band && (
          <span className={`px-2 py-1 rounded text-sm font-medium ${band.color}`}>
            {band.label} {sleepLog.score}
          </span>
        )}
      </div>

      <div className="flex justify-between items-end mb-4">
        <div>
          <p className="text-sm text-gray-500">Duration</p>
          <p className="text-3xl font-bold text-gray-900">
            {formatSleepDuration(sleepLog.totalMinutes)}
          </p>
        </div>
        <div className="text-right">
          <p className="text-sm text-gray-500">Bedtime</p>
          <p className="font-medium">{sleepLog.bedtime}</p>
        </div>
        <div className="text-right">
          <p className="text-sm text-gray-500">Wake Time</p>
          <p className="font-medium">{sleepLog.wakeTime}</p>
        </div>
      </div>

      <div className="flex justify-end">
        <button 
          onClick={onEdit}
          className="text-sm text-indigo-600 hover:text-indigo-800"
        >
          Edit
        </button>
      </div>
    </div>
  );
}
