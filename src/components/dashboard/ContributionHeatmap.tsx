'use client';

import { useEffect, useState } from 'react';
import { Card } from '@/components/ui/Card';

interface DayData {
  date: string;
  score: number | null;
  level: 0 | 1 | 2 | 3 | 4;
}

export function ContributionHeatmap() {
  const [data, setData] = useState<DayData[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchData();
  }, []);

  async function fetchData() {
    try {
      const endDate = new Date();
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - 365);

      const res = await fetch(
        `/api/scores/daily?startDate=${startDate.toISOString().split('T')[0]}&endDate=${endDate.toISOString().split('T')[0]}`
      );
      const result = await res.json();

      if (result.success) {
        const heatmapData = result.data.map((score: any) => ({
          date: score.date,
          score: score.totalScore,
          level: getLevel(score.totalScore),
        }));
        setData(heatmapData);
      }
    } catch (error) {
      console.error('Error fetching heatmap data:', error);
    } finally {
      setLoading(false);
    }
  }

  function getLevel(score: number | null): 0 | 1 | 2 | 3 | 4 {
    if (score === null) return 0;
    if (score >= 90) return 4;
    if (score >= 75) return 3;
    if (score >= 50) return 2;
    if (score >= 25) return 1;
    return 0;
  }

  if (loading) {
    return (
      <Card className="p-6">
        <div className="animate-pulse">
          <div className="h-6 bg-gray-200 rounded w-1/3 mb-4"></div>
          <div className="h-32 bg-gray-200 rounded"></div>
        </div>
      </Card>
    );
  }

  // Group by weeks
  const weeks: DayData[][] = [];
  let currentWeek: DayData[] = [];

  const startDate = new Date();
  startDate.setDate(startDate.getDate() - 365);

  for (let i = 0; i < 365; i++) {
    const date = new Date(startDate);
    date.setDate(date.getDate() + i);
    const dateStr = date.toISOString().split('T')[0];

    const dayData = data.find(d => d.date === dateStr) || {
      date: dateStr,
      score: null,
      level: 0 as const,
    };

    currentWeek.push(dayData);

    if (currentWeek.length === 7) {
      weeks.push(currentWeek);
      currentWeek = [];
    }
  }

  if (currentWeek.length > 0) {
    weeks.push(currentWeek);
  }

  return (
    <Card className="p-6">
      <h3 className="text-lg font-semibold mb-4">Activity Overview</h3>

      <div className="overflow-x-auto">
        <div className="inline-flex gap-1">
          {weeks.map((week, weekIndex) => (
            <div key={weekIndex} className="flex flex-col gap-1">
              {week.map((day, dayIndex) => (
                <div
                  key={dayIndex}
                  className={`w-3 h-3 rounded-sm ${getLevelColor(day.level)}`}
                  title={`${day.date}: ${day.score !== null ? Math.round(day.score) : 'No data'}`}
                />
              ))}
            </div>
          ))}
        </div>
      </div>

      <div className="flex items-center gap-2 mt-4 text-sm text-gray-600">
        <span>Less</span>
        <div className="flex gap-1">
          {[0, 1, 2, 3, 4].map(level => (
            <div
              key={level}
              className={`w-3 h-3 rounded-sm ${getLevelColor(level as 0 | 1 | 2 | 3 | 4)}`}
            />
          ))}
        </div>
        <span>More</span>
      </div>
    </Card>
  );
}

function getLevelColor(level: 0 | 1 | 2 | 3 | 4): string {
  const colors = {
    0: 'bg-gray-100',
    1: 'bg-green-200',
    2: 'bg-green-400',
    3: 'bg-green-600',
    4: 'bg-green-800',
  };
  return colors[level];
}