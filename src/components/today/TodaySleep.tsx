'use client';

import { Moon } from 'lucide-react';

interface TodaySleepProps {
  sleepLog: { duration: number; quality: number } | null;
}

export function TodaySleep({ sleepLog }: TodaySleepProps) {
  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6 flex items-center justify-between">
      <div className="flex items-center gap-4">
        <div className="p-3 bg-indigo-500/20 rounded-xl border border-indigo-500/30">
          <Moon className="w-6 h-6 text-indigo-400" />
        </div>
        <div>
          <h3 className="text-white font-medium">Sleep</h3>
          {sleepLog ? (
            <p className="text-sm text-zinc-400">{sleepLog.duration} hrs • {sleepLog.quality}/10 Quality</p>
          ) : (
            <p className="text-sm text-zinc-400">Not logged yet</p>
          )}
        </div>
      </div>
      {!sleepLog && (
        <button className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-white text-sm rounded-lg transition-colors">
          Log Sleep
        </button>
      )}
    </div>
  );
}
