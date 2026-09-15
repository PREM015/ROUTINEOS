'use client';

import { useState } from 'react';
import { BatteryCharging } from 'lucide-react';

export function RestDayButton({ date }: { date: string }) {
  const [loading, setLoading] = useState(false);

  const setRestDay = async () => {
    if (!confirm('Are you sure you want to declare today a Rest Day? This preserves your streak.')) return;
    setLoading(true);
    try {
      await fetch('/api/day-mode', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date, mode: 'REST' })
      });
      window.location.reload();
    } catch (e) {
      console.error(e);
      setLoading(false);
    }
  };

  return (
    <button 
      onClick={setRestDay}
      disabled={loading}
      className="flex items-center gap-2 px-4 py-2 bg-zinc-900 border border-zinc-800 hover:bg-zinc-800 text-zinc-300 rounded-lg transition-colors text-sm font-medium"
    >
      <BatteryCharging className="w-4 h-4 text-green-400" />
      Rest Day
    </button>
  );
}
