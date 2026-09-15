'use client';

import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';

interface StreakHistoryProps {
  data: { date: string; streak: number }[];
}

export function StreakHistory({ data }: StreakHistoryProps) {
  return (
    <div className="h-64 w-full bg-zinc-900 rounded-xl p-4 border border-zinc-800">
      <h3 className="text-lg font-semibold text-white mb-4">Streak History</h3>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data}>
          <XAxis dataKey="date" stroke="#52525b" fontSize={12} tickLine={false} axisLine={false} />
          <YAxis stroke="#52525b" fontSize={12} tickLine={false} axisLine={false} />
          <Tooltip 
            contentStyle={{ backgroundColor: '#18181b', border: '1px solid #27272a', borderRadius: '8px' }}
            itemStyle={{ color: '#fff' }}
          />
          <Line type="monotone" dataKey="streak" stroke="#f97316" strokeWidth={3} dot={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
