'use client';

import { useEffect, useState } from 'react';
import { Card } from '@/components/ui/Card';

interface DayScore {
  date: string;
  day: string;
  totalScore: number;
  coreScore: number;
  growthScore: number;
  bonusScore: number;
}

export function WeeklyBarChart() {
  const [data, setData] = useState<DayScore[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchData();
  }, []);

  async function fetchData() {
    try {
      const endDate = new Date();
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - 7);

      const res = await fetch(
        `/api/scores/daily?startDate=${startDate.toISOString().split('T')[0]}&endDate=${endDate.toISOString().split('T')[0]}`
      );
      const result = await res.json();

      if (result.success) {
        const chartData = result.data.map((score: any) => ({
          date: score.date,
          day: new Date(score.date).toLocaleDateString('en-US', { weekday: 'short' }),
          totalScore: score.totalScore || 0,
          coreScore: score.coreScore || 0,
          growthScore: score.growthScore || 0,
          bonusScore: score.bonusScore || 0,
        }));
        setData(chartData);
      }
    } catch (error) {
      console.error('Error fetching weekly data:', error);
    } finally {
      setLoading(false);
    }
  }

  if (loading) {
    return (
      <Card className="p-6">
        <div className="animate-pulse">
          <div className="h-6 bg-gray-200 rounded w-1/3 mb-4"></div>
          <div className="h-48 bg-gray-200 rounded"></div>
        </div>
      </Card>
    );
  }

  const maxScore = Math.max(...data.map(d => d.totalScore), 100);

  return (
    <Card className="p-6">
      <div className="flex items-center justify-between mb-6">
        <h3 className="text-lg font-semibold">Last 7 Days</h3>
        <div className="flex items-center gap-4 text-sm">
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-blue-600"></div>
            <span>Core</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-green-600"></div>
            <span>Growth</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-yellow-600"></div>
            <span>Bonus</span>
          </div>
        </div>
      </div>

      <div className="flex items-end justify-between gap-2 h-48">
        {data.map((day, index) => {
          const coreHeight = (day.coreScore / maxScore) * 100;
          const growthHeight = (day.growthScore / maxScore) * 100;
          const bonusHeight = (day.bonusScore / maxScore) * 100;

          return (
            <div key={index} className="flex-1 flex flex-col items-center gap-2">
              <div className="w-full flex flex-col-reverse gap-0.5">
                {bonusHeight > 0 && (
                  <div
                    className="w-full bg-yellow-600 rounded-t"
                    style={{ height: `${bonusHeight}%` }}
                  />
                )}
                {growthHeight > 0 && (
                  <div
                    className="w-full bg-green-600"
                    style={{ height: `${growthHeight}%` }}
                  />
                )}
                {coreHeight > 0 && (
                  <div
                    className="w-full bg-blue-600 rounded-b"
                    style={{ height: `${coreHeight}%` }}
                  />
                )}
              </div>
              <div className="text-center">
                <div className="text-xs font-medium">{day.day}</div>
                <div className="text-xs text-gray-600">{Math.round(day.totalScore)}</div>
              </div>
            </div>
          );
        })}
      </div>
    </Card>
  );
}