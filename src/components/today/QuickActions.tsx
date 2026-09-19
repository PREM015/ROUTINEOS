'use client';

import { Button } from '@/components/ui/Button';
import { useState } from 'react';

interface QuickActionsProps {
  date: string;
}

export function QuickActions({ date }: QuickActionsProps) {
  const [loading, setLoading] = useState(false);

  async function activateMinimumDay() {
    if (!confirm('Activate Minimum Day? This will adjust your scoring for today.')) {
      return;
    }

    setLoading(true);
    try {
      const res = await fetch('/api/day-mode', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          date,
          mode: 'MINIMUM',
        }),
      });

      if (res.ok) {
        window.location.reload();
      }
    } catch (error) {
      console.error('Error activating minimum day:', error);
    } finally {
      setLoading(false);
    }
  }

  async function activateRestDay() {
    if (!confirm('Activate Rest Day? No habits will be required today.')) {
      return;
    }

    setLoading(true);
    try {
      const res = await fetch('/api/day-mode', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          date,
          mode: 'REST',
        }),
      });

      if (res.ok) {
        window.location.reload();
      }
    } catch (error) {
      console.error('Error activating rest day:', error);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex gap-3">
      <Button
        variant="outline"
        onClick={activateMinimumDay}
        disabled={loading}
      >
        🎯 Minimum Day
      </Button>
      <Button
        variant="outline"
        onClick={activateRestDay}
        disabled={loading}
      >
        😴 Rest Day
      </Button>
    </div>
  );
}