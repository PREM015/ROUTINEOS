'use client';

import { useEffect, useState } from 'react';
import { Card } from '@/components/ui/Card';

interface SystemStats {
  users: {
    total: number;
    active: number;
    byRole: Array<{ role: string; count: number }>;
  };
  content: {
    habits: { total: number; averagePerUser: number };
    goals: { total: number; averagePerUser: number };
    scores: { total: number };
  };
  ai: {
    totalInsights: number;
  };
}

export function SystemStats() {
  const [stats, setStats] = useState<SystemStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchStats();
  }, []);

  async function fetchStats() {
    try {
      const res = await fetch('/api/admin/stats');
      const data = await res.json();
      if (data.success) {
        setStats(data.data);
      }
    } catch (error) {
      console.error('Error fetching stats:', error);
    } finally {
      setLoading(false);
    }
  }

  if (loading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {[1, 2, 3, 4].map(i => (
          <Card key={i} className="p-6">
            <div className="animate-pulse">
              <div className="h-4 bg-gray-200 rounded w-1/2 mb-2"></div>
              <div className="h-8 bg-gray-200 rounded w-1/3"></div>
            </div>
          </Card>
        ))}
      </div>
    );
  }

  if (!stats) {
    return <div>Failed to load statistics</div>;
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
      <StatCard
        title="Total Users"
        value={stats.users.total}
        subtitle={`${stats.users.active} active (30d)`}
      />
      <StatCard
        title="Total Habits"
        value={stats.content.habits.total}
        subtitle={`${stats.content.habits.averagePerUser.toFixed(1)} avg/user`}
      />
      <StatCard
        title="Total Goals"
        value={stats.content.goals.total}
        subtitle={`${stats.content.goals.averagePerUser.toFixed(1)} avg/user`}
      />
      <StatCard
        title="AI Insights"
        value={stats.ai.totalInsights}
        subtitle="Generated"
      />
    </div>
  );
}

function StatCard({
  title,
  value,
  subtitle,
}: {
  title: string;
  value: number;
  subtitle: string;
}) {
  return (
    <Card className="p-6">
      <h3 className="text-sm font-medium text-gray-600 mb-2">{title}</h3>
      <p className="text-3xl font-bold mb-1">{value.toLocaleString()}</p>
      <p className="text-sm text-gray-500">{subtitle}</p>
    </Card>
  );
}