'use client';

import { useEffect, useState } from 'react';
import { Card } from '@/components/ui/Card';

interface ProgressData {
  habits: number;
  goals: number;
  routine: number;
  sleep: number;
}

export function ProgressRings() {
  const [data, setData] = useState<ProgressData>({
    habits: 0,
    goals: 0,
    routine: 0,
    sleep: 0,
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchData();
  }, []);

  async function fetchData() {
    try {
      const today = new Date().toISOString().split('T')[0];
      
      // Fetch today's completion rates
      const [habitsRes, goalsRes, routineRes, sleepRes] = await Promise.all([
        fetch(`/api/habits/today?date=${today}`),
        fetch('/api/goals?status=ACTIVE'),
        fetch(`/api/routine/today?date=${today}`),
        fetch(`/api/sleep?date=${today}`),
      ]);

      const [habits, goals, routine, sleep] = await Promise.all([
        habitsRes.json(),
        goalsRes.json(),
        routineRes.json(),
        sleepRes.json(),
      ]);

      // Calculate completion rates
      const habitRate = habits.success && habits.data.length > 0
        ? (habits.data.filter((h: any) => h.log?.status === 'COMPLETED').length / habits.data.length) * 100
        : 0;

      const goalRate = goals.success && goals.data.length > 0
        ? (goals.data.filter((g: any) => g.progressPercentage >= 80).length / goals.data.length) * 100
        : 0;

      const routineRate = routine.success && routine.data.blocks?.length > 0
        ? (routine.data.blocks.filter((b: any) => b.log?.status === 'COMPLETED').length / routine.data.blocks.filter((b: any) => b.trackCompletion).length) * 100
        : 0;

      const sleepRate = sleep.success && sleep.data?.actualDurationMinutes
        ? Math.min(100, (sleep.data.actualDurationMinutes / 480) * 100)
        : 0;

      setData({
        habits: Math.round(habitRate),
        goals: Math.round(goalRate),
        routine: Math.round(routineRate),
        sleep: Math.round(sleepRate),
      });
    } catch (error) {
      console.error('Error fetching progress data:', error);
    } finally {
      setLoading(false);
    }
  }

  if (loading) {
    return (
      <Card className="p-6">
        <div className="animate-pulse">
          <div className="h-6 bg-gray-200 rounded w-1/2 mb-4"></div>
          <div className="space-y-4">
            {[1, 2, 3, 4].map(i => (
              <div key={i} className="h-12 bg-gray-200 rounded"></div>
            ))}
          </div>
        </div>
      </Card>
    );
  }

  return (
    <Card className="p-6">
      <h3 className="text-lg font-semibold mb-6">Today's Progress</h3>

      <div className="space-y-4">
        <ProgressRing label="Habits" value={data.habits} color="blue" />
        <ProgressRing label="Goals" value={data.goals} color="green" />
        <ProgressRing label="Routine" value={data.routine} color="purple" />
        <ProgressRing label="Sleep" value={data.sleep} color="indigo" />
      </div>
    </Card>
  );
}

function ProgressRing({
  label,
  value,
  color,
}: {
  label: string;
  value: number;
  color: string;
}) {
  const colorClasses = {
    blue: 'text-blue-600',
    green: 'text-green-600',
    purple: 'text-purple-600',
    indigo: 'text-indigo-600',
  };

  return (
    <div className="flex items-center justify-between">
      <span className="text-sm font-medium">{label}</span>
      <div className="flex items-center gap-3">
        <div className="w-24 h-2 bg-gray-200 rounded-full overflow-hidden">
          <div
            className={`h-full bg-${color}-600 transition-all duration-500`}
            style={{ width: `${value}%` }}
          />
        </div>
        <span className={`text-sm font-semibold ${colorClasses[color as keyof typeof colorClasses]} w-12 text-right`}>
          {value}%
        </span>
      </div>
    </div>
  );
}

export default ProgressRings;