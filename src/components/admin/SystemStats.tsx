"use client";

import React, { useEffect, useState } from 'react';
import { Card } from '@/components/ui/Card';

interface Stats {
  totalUsers: number;
  activeToday: number;
  totalHabits: number;
  totalGoals: number;
}

export function SystemStats() {
  const [stats, setStats] = useState<Stats | null>(null);

  useEffect(() => {
    fetch('/api/admin/stats')
      .then(res => res.json())
      .then(data => setStats(data))
      .catch(console.error);
  }, []);

  if (!stats) return <div>Loading stats...</div>;

  return (
    <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
      <Card>
        <div className="p-4">
          <h3 className="text-sm font-medium text-gray-500">Total Users</h3>
          <p className="text-2xl font-bold">{stats.totalUsers}</p>
        </div>
      </Card>
      <Card>
        <div className="p-4">
          <h3 className="text-sm font-medium text-gray-500">Active Today</h3>
          <p className="text-2xl font-bold">{stats.activeToday}</p>
        </div>
      </Card>
      <Card>
        <div className="p-4">
          <h3 className="text-sm font-medium text-gray-500">Total Habits</h3>
          <p className="text-2xl font-bold">{stats.totalHabits}</p>
        </div>
      </Card>
      <Card>
        <div className="p-4">
          <h3 className="text-sm font-medium text-gray-500">Total Goals</h3>
          <p className="text-2xl font-bold">{stats.totalGoals}</p>
        </div>
      </Card>
    </div>
  );
}
