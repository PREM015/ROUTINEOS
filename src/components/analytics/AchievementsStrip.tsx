'use client';

import { Medal } from 'lucide-react';
import type { AnalyticsAchievement } from '@/types/analytics';

interface AchievementsStripProps {
  achievements: AnalyticsAchievement[];
}

/**
 * Horizontal strip of the most recently unlocked achievements. Each tile is a
 * real Achievement row — no achievements yet renders a single empty state.
 */
export default function AchievementsStrip({ achievements }: AchievementsStripProps) {
  return (
    <section className="glass-panel spotlight-hover rounded-2xl p-6 shadow-soft">
      <header className="mb-4 flex items-center gap-2">
        <span className="inline-flex rounded-lg bg-amber-500/10 p-2 text-amber-500">
          <Medal className="h-4 w-4" aria-hidden="true" />
        </span>
        <h2 className="text-sm font-semibold text-foreground">Recent achievements</h2>
      </header>

      {achievements.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted-foreground">
          Keep building consistent routines — achievements will appear here.
        </p>
      ) : (
        <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {achievements.map((achievement) => (
            <li
              key={achievement.id}
              className="rounded-xl border border-border/60 bg-card/60 p-3 transition-colors hover:border-amber-500/40"
            >
              <p className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
                <Medal className="h-3.5 w-3.5 shrink-0 text-amber-500" aria-hidden="true" />
                <span className="truncate">{achievement.title}</span>
              </p>
              {achievement.description && (
                <p className="mt-1 text-xs text-muted-foreground">{achievement.description}</p>
              )}
              <p className="mt-1.5 text-[11px] tabular-nums text-muted-foreground">
                {achievement.unlockedAt}
              </p>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}