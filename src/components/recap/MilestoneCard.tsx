'use client';

import { CheckCircle2, Flame, Target, Award } from 'lucide-react';
import { cn } from '@/lib/utils';

export type MilestoneTone = 'streak' | 'habit' | 'goal' | 'score';

export interface Milestone {
  label: string;
  value: string;
  tone: MilestoneTone;
}

interface MilestoneCardProps {
  milestones: Milestone[];
}

const ICONS: Record<MilestoneTone, typeof Flame> = {
  streak: Flame,
  habit: CheckCircle2,
  goal: Target,
  score: Award,
};

const TONE_CLASSES: Record<MilestoneTone, string> = {
  streak: 'text-orange-500 bg-orange-500/10',
  habit: 'text-emerald-500 bg-emerald-500/10',
  goal: 'text-sky-500 bg-sky-500/10',
  score: 'text-amber-500 bg-amber-500/10',
};

export default function MilestoneCard({ milestones }: MilestoneCardProps) {
  return (
    <div className="relative rounded-2xl">
      <div
        className="border-gradient-animated absolute -inset-px rounded-2xl"
        aria-hidden="true"
      />
      <div className="glass-panel relative rounded-2xl p-6 shadow-soft">
        <h2 className="mb-4 text-lg font-semibold text-foreground">Milestones</h2>
        {milestones.length > 0 ? (
          <ul className="space-y-3">
            {milestones.map((milestone) => {
              const Icon = ICONS[milestone.tone];
              return (
                <li
                  key={milestone.label}
                  className={cn(
                    'flex items-center gap-3 rounded-xl p-3 transition-transform duration-300 ease-out-expo hover:-translate-y-0.5',
                    'border border-border/60 bg-card/60',
                  )}
                >
                  <span
                    className={cn(
                      'inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg',
                      TONE_CLASSES[milestone.tone],
                    )}
                  >
                    <Icon className="h-4 w-4" aria-hidden="true" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm text-foreground">{milestone.label}</span>
                    <span className="block text-xs text-muted-foreground">{milestone.value}</span>
                  </span>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">
            Complete habits and hit goals to earn milestones here.
          </p>
        )}
      </div>
    </div>
  );
}