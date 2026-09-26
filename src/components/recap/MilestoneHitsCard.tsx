'use client';

import { Trophy } from 'lucide-react';
import type { RecapExtras } from '@/types/recap';

type MilestoneHit = RecapExtras['milestoneHits'][number];

interface MilestoneHitsCardProps {
  milestones: MilestoneHit[];
  title?: string;
  accent?: 'violet' | 'emerald' | 'amber' | 'sky' | 'fuchsia' | 'rose';
}

const ACCENT_CLASS: Record<NonNullable<MilestoneHitsCardProps['accent']>, string> = {
  violet: 'bg-violet-500/10 text-violet-500',
  emerald: 'bg-emerald-500/10 text-emerald-500',
  amber: 'bg-amber-500/10 text-amber-500',
  sky: 'bg-sky-500/10 text-sky-500',
  fuchsia: 'bg-fuchsia-500/10 text-fuchsia-500',
  rose: 'bg-rose-500/10 text-rose-500',
};

/**
 * Goal milestones completed within the period. Each hit shows the milestone
 * title under its goal (+ project), with the completion date. Hides behind a
 * generic empty state when nothing was completed.
 * Source: Milestone rows linked to the user's goals (completedAt within range).
 */
export default function MilestoneHitsCard({
  milestones,
  title = 'Milestone hits',
  accent = 'violet',
}: MilestoneHitsCardProps) {
  return (
    <section className="glass-panel spotlight-hover rounded-2xl p-6 shadow-soft">
      <header className="mb-4 flex items-center gap-2">
        <span className={`inline-flex rounded-lg p-2 ${ACCENT_CLASS[accent]}`}>
          <Trophy className="h-4 w-4" aria-hidden="true" />
        </span>
        <h2 className="text-sm font-semibold text-foreground">{title}</h2>
      </header>

      {milestones.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted-foreground">
          No milestones completed in this period.
        </p>
      ) : (
        <ul className="space-y-2.5">
          {milestones.map((milestone) => (
            <li key={milestone.id} className="rounded-xl border border-border/60 bg-card/60 px-3 py-2.5">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-foreground">{milestone.title}</p>
                  <p className="mt-0.5 truncate text-xs text-muted-foreground">
                    {milestone.goalTitle}
                    {milestone.projectTitle ? ` · ${milestone.projectTitle}` : ''}
                  </p>
                </div>
                <span className="shrink-0 text-[11px] tabular-nums text-muted-foreground">
                  {milestone.completedAt}
                </span>
              </div>
              {milestone.description && (
                <p className="mt-1 text-xs text-muted-foreground">{milestone.description}</p>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}