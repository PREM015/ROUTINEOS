'use client';

import { ListChecks } from 'lucide-react';
import StatTile from './stat-tile';
import type { RecapExtras } from '@/types/recap';

interface TaskThroughputCardProps {
  taskThroughput: RecapExtras['taskThroughput'];
}

/**
 * Task throughput for the period: created, completed, and currently open.
 * Source: Task rows (createdAt / completedAt within the range).
 */
export default function TaskThroughputCard({ taskThroughput }: TaskThroughputCardProps) {
  const { created, completed, open } = taskThroughput;

  return (
    <section className="glass-panel spotlight-hover rounded-2xl p-6 shadow-soft">
      <header className="mb-4 flex items-center gap-2">
        <span className="inline-flex rounded-lg bg-emerald-500/10 p-2 text-emerald-500">
          <ListChecks className="h-4 w-4" aria-hidden="true" />
        </span>
        <h2 className="text-sm font-semibold text-foreground">Task momentum</h2>
      </header>

      {created + completed + open > 0 ? (
        <div className="grid grid-cols-3 gap-3">
          <StatTile accent="sky" icon={<ListChecks className="h-5 w-5" />} label="Created" value={String(created)} detail="in this period" />
          <StatTile accent="emerald" icon={<ListChecks className="h-5 w-5" />} label="Completed" value={String(completed)} detail="in this period" />
          <StatTile accent="amber" icon={<ListChecks className="h-5 w-5" />} label="Open" value={String(open)} detail="right now" />
        </div>
      ) : (
        <p className="py-8 text-center text-sm text-muted-foreground">
          Tasks created and completed here will show up.
        </p>
      )}
    </section>
  );
}