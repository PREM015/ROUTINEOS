'use client';

import { useEffect, useState } from 'react';
import { Card } from '@/components/ui/Card';
import { Progress } from '@/components/ui/Progress';

interface StreakData {
  currentStreak: number;
  longestStreak: number;
  coreStreak: number;
  totalCompletedDays: number;
  streakStartDate: string | null;
}

export function StreakCard() {
  const [streak, setStreak] = useState<StreakData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchStreak();
  }, []);

  async function fetchStreak() {
    try {
      const res = await fetch('/api/streak');
      const data = await res.json();
      if (data.success) {
        setStreak(data.data);
      }
    } catch (error) {
      console.error('Error fetching streak:', error);
    } finally {
      setLoading(false);
    }
  }

  if (loading) {
    return (
      <Card className="p-6">
        <div className="animate-pulse">
          <div className="h-8 bg-gray-200 rounded w-1/3 mb-4"></div>
          <div className="h-4 bg-gray-200 rounded w-1/2"></div>
        </div>
      </Card>
    );
  }

  if (!streak) {
    return null;
  }

  const nextMilestone = getNextMilestone(streak.currentStreak);
  const progress = nextMilestone
    ? (streak.currentStreak / nextMilestone.days) * 100
    : 100;

  return (
    <Card className="p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold">Current Streak</h3>
        <span className="text-3xl">🔥</span>
      </div>

      <div className="space-y-4">
        {/* Current Streak */}
        <div>
          <div className="flex items-baseline gap-2">
            <span className="text-4xl font-bold text-orange-600">
              {streak.currentStreak}
            </span>
            <span className="text-gray-600">days</span>
          </div>
          {streak.currentStreak > 0 && (
            <p className="text-sm text-gray-500 mt-1">
              Started {formatDate(streak.streakStartDate)}
            </p>
          )}
        </div>

        {/* Progress to next milestone */}
        {nextMilestone && (
          <div>
            <div className="flex justify-between text-sm mb-2">
              <span className="text-gray-600">
                Next: {nextMilestone.label}
              </span>
              <span className="font-medium">
                {nextMilestone.days - streak.currentStreak} days to go
              </span>
            </div>
            <Progress value={progress} className="h-2" />
          </div>
        )}

        {/* Stats */}
        <div className="grid grid-cols-2 gap-4 pt-4 border-t">
          <div>
            <p className="text-sm text-gray-600">Longest Streak</p>
            <p className="text-2xl font-bold">{streak.longestStreak}</p>
          </div>
          <div>
            <p className="text-sm text-gray-600">Total Days</p>
            <p className="text-2xl font-bold">{streak.totalCompletedDays}</p>
          </div>
        </div>
      </div>
    </Card>
  );
}

function getNextMilestone(currentStreak: number): { days: number; label: string } | null {
  const milestones = [
    { days: 7, label: '1 week' },
    { days: 14, label: '2 weeks' },
    { days: 21, label: '3 weeks' },
    { days: 30, label: '1 month' },
    { days: 60, label: '2 months' },
    { days: 90, label: '3 months' },
    { days: 100, label: '100 days' },
    { days: 180, label: '6 months' },
    { days: 365, label: '1 year' },
  ];

  for (const milestone of milestones) {
    if (currentStreak < milestone.days) {
      return milestone;
    }
  }

  return null;
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return '';
  const date = new Date(dateStr);
  const now = new Date();
  const diffDays = Math.floor(
    (now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24)
  );

  if (diffDays === 0) return 'today';
  if (diffDays === 1) return 'yesterday';
  if (diffDays < 7) return `${diffDays} days ago`;
  if (diffDays < 30) return `${Math.floor(diffDays / 7)} weeks ago`;
  return date.toLocaleDateString();
}