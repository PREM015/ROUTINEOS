'use client';

import { useEffect, useState } from 'react';
import { Card } from '@/components/ui/Card';
import { Progress } from '@/components/ui/Progress';
import { getCurrentBlock, calculateBlockProgress } from '@/lib/routine/duration';

interface Block {
  id: string;
  title: string;
  startTime: string;
  endTime: string;
  description: string | null;
  icon: string | null;
}

export function CurrentRoutineBlock() {
  const [currentBlock, setCurrentBlock] = useState<Block | null>(null);
  const [progress, setProgress] = useState(0);
  const [timeRemaining, setTimeRemaining] = useState('');

  useEffect(() => {
    fetchRoutine();
    const interval = setInterval(fetchRoutine, 60000); // Update every minute
    return () => clearInterval(interval);
  }, []);

  async function fetchRoutine() {
    try {
      const res = await fetch('/api/routine/today');
      const data = await res.json();
      
      if (data.success && data.data.blocks) {
        const current = getCurrentBlock(data.data.blocks) as Block | null;
        setCurrentBlock(current);

        if (current) {
          const prog = calculateBlockProgress(current.startTime, current.endTime);
          setProgress(prog.percentage);
          setTimeRemaining(formatMinutes(prog.minutesRemaining));
        }
      }
    } catch (error) {
      console.error('Error fetching routine:', error);
    }
  }

  if (!currentBlock) {
    return null;
  }

  return (
    <Card className="p-6 bg-gradient-to-r from-blue-50 to-indigo-50 border-blue-200">
      <div className="flex items-start justify-between mb-4">
        <div className="flex items-center gap-3">
          {currentBlock.icon && (
            <span className="text-3xl">{currentBlock.icon}</span>
          )}
          <div>
            <h3 className="text-lg font-semibold">{currentBlock.title}</h3>
            <p className="text-sm text-gray-600">
              {currentBlock.startTime} - {currentBlock.endTime}
            </p>
          </div>
        </div>
        <div className="text-right">
          <p className="text-sm text-gray-600">Time Remaining</p>
          <p className="text-xl font-bold text-blue-600">{timeRemaining}</p>
        </div>
      </div>

      {currentBlock.description && (
        <p className="text-sm text-gray-700 mb-4">{currentBlock.description}</p>
      )}

      <Progress value={progress} className="h-2" />
    </Card>
  );
}

function formatMinutes(minutes: number): string {
  if (minutes < 1) return 'Less than a minute';
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
}