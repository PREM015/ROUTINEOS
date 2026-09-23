'use client';

import { useState } from 'react';
import { Shield, Loader2 } from 'lucide-react';

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
      className="flex items-center gap-2 rounded-lg border border-border bg-card px-4 py-2 text-sm font-medium text-muted-foreground transition-all duration-300 ease-out-expo hover:-translate-y-0.5 hover:border-primary/40 hover:text-foreground active:translate-y-0 active:scale-[0.97] disabled:opacity-50"
    >
      {loading ? (
        <Loader2 className="h-4 w-4 animate-spin text-primary" aria-hidden="true" />
      ) : (
        <Shield className="h-4 w-4 text-primary" />
      )}
      Minimum Day
    </button>
  );
}