'use client';

interface SleepTrendProps {
  data: Array<{ date: string; totalMinutes: number }>;
  targetMinutes: number;
}

export function SleepTrend({ data, targetMinutes }: SleepTrendProps) {
  const maxMins = Math.max(...data.map(d => d.totalMinutes), targetMinutes + 120, 1);

  return (
    <div className="p-4 border rounded-lg bg-white shadow">
      <h3 className="text-lg font-semibold mb-4">Sleep Trend (Last 7 Days)</h3>
      <div className="flex items-end h-32 gap-2">
        {data.map((day, i) => {
          const isMet = day.totalMinutes >= targetMinutes;
          const isClose = !isMet && day.totalMinutes >= targetMinutes - 60;
          let bgColor = 'bg-red-500';
          if (isMet) bgColor = 'bg-green-500';
          else if (isClose) bgColor = 'bg-orange-400';

          const heightPercent = Math.min(100, (day.totalMinutes / maxMins) * 100);

          return (
            <div key={i} className="flex flex-col items-center flex-1 group relative">
              <div 
                className={`w-full rounded-t-md transition-all duration-300 ${bgColor}`}
                style={{ height: `${heightPercent}%` }}
              >
                <div className="opacity-0 group-hover:opacity-100 absolute bottom-full mb-1 left-1/2 -translate-x-1/2 bg-gray-800 text-white text-xs px-2 py-1 rounded whitespace-nowrap pointer-events-none">
                  {Math.floor(day.totalMinutes / 60)}h {day.totalMinutes % 60}m
                </div>
              </div>
              <span className="text-xs text-gray-500 mt-1">
                {new Date(day.date).toLocaleDateString(undefined, { weekday: 'narrow' })}
              </span>
            </div>
          );
        })}
      </div>
      <div className="mt-4 pt-2 border-t text-sm text-gray-600 flex justify-between">
        <span>Target: {Math.floor(targetMinutes / 60)}h {targetMinutes % 60}m</span>
      </div>
    </div>
  );
}
