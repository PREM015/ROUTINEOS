'use client';

import { useState } from 'react';
import { Shield } from 'lucide-react';

export function MinimumDayButton({ date }: { date: string }) {
  const [loading, setLoading] = useState(false);

  const setMinimumDay = async () => {
    if (!confirm('Are you sure you want to declare today a Minimum Day? Only Non-Negotiables will count.')) return;
    setLoading(true);
    try {
      await fetch('/api/day-mode', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date, mode: 'MINIMUM' })
      });
      window.location.reload();
    } catch (e) {
      console.error(e);
      setLoading(false);
    }
  };

  return (
    <button 
      onClick={setMinimumDay}
      disabled={loading}
      className="flex items-center gap-2 px-4 py-2 bg-zinc-900 border border-zinc-800 hover:bg-zinc-800 text-zinc-300 rounded-lg transition-colors text-sm font-medium"
    >
      <Shield className="w-4 h-4 text-blue-400" />
      Minimum Day
    </button>
  );
}
