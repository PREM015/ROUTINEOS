'use client';

import { CalendarRange } from 'lucide-react';
import HeatMap from '@/components/charts/HeatMap';
import type { RecapExtras } from '@/types/recap';

interface HabitHeatmapCardProps {
  habitHeatmap: RecapExtras['habitHeatmap'];
}

/**
 * Habit heatmap for the period. Each cell is one day; intensity reflects the
 * completion rate (completed / scheduled) for that day. Source: HabitLog rows.
 */
export default function HabitHeatmapCard({ habitHeatmap }: HabitHeatmapCardProps) {
  const cells = habitHeatmap.map((day) => ({
    label: day.date,
    rate: day.scheduled > 0 ? (day.completed / day.scheduled) * 100 : 0,
  }));

  return (
    <section className="glass-panel spotlight-hover rounded-2xl p-6 shadow-soft">
      <header className="mb-4 flex items-center gap-2">
        <span className="inline-flex rounded-lg bg-primary/10 p-2 text-primary">
          <CalendarRange className="h-4 w-4" aria-hidden="true" />
        </span>
        <h2 className="text-sm font-semibold text-foreground">Daily habit heat</h2>
      </header>

      {cells.length > 0 ? (
        <HeatMap
          data={cells}
          valueKey="rate"
          labelKey="label"
          columns={7}
          showValues={false}
          minColor="#18181b"
          maxColor="#10b981"
          ariaLabel="Habit completion heatmap"
        />
      ) : (
        <p className="py-8 text-center text-sm text-muted-foreground">
          No habits were logged in this period yet — they will light up here.
        </p>
      )}
    </section>
  );
}