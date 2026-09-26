'use client';

import { Award, Flame } from 'lucide-react';
import type { RecapExtras } from '@/types/recap';

interface StreakMilestonesCardProps {
  streakEvents: RecapExtras['streakEvents'];
  achievements: RecapExtras['achievements'];
}

/**
 * Streak milestones reached + achievements unlocked within the period.
 * Sources: StreakAnalytics milestones and Achievement rows, filtered to the
 * recap range.
 */
export default function StreakMilestonesCard({
  streakEvents,
  achievements,
}: StreakMilestonesCardProps) {
  const empty = streakEvents.length === 0 && achievements.length === 0;

  return (
    <section className="glass-panel spotlight-hover rounded-2xl p-6 shadow-soft">
      <header className="mb-4 flex items-center gap-2">
        <span className="inline-flex rounded-lg bg-orange-500/10 p-2 text-orange-500">
          <Flame className="h-4 w-4" aria-hidden="true" />
        </span>
        <h2 className="text-sm font-semibold text-foreground">Milestones &amp; achievements</h2>
      </header>

      {empty ? (
        <p className="py-8 text-center text-sm text-muted-foreground">
          Keep consistent streaks and unlock achievements — they will appear here.
        </p>
      ) : (
        <ul className="space-y-2">
          {streakEvents.map((event) => (
            <li
              key={`streak-${event.days}`}
              className="flex items-center justify-between rounded-xl border border-border/60 bg-card/60 px-3 py-2"
            >
              <span className="flex items-center gap-2 text-sm text-foreground">
                <Flame className="h-4 w-4 text-orange-500" aria-hidden="true" />
                {event.days}-day streak reached
              </span>
              <span className="text-xs tabular-nums text-muted-foreground">{event.reachedDate}</span>
            </li>
          ))}
          {achievements.map((achievement) => (
            <li
              key={`achievement-${achievement.title}-${achievement.unlockedAt}`}
              className="flex items-center justify-between rounded-xl border border-border/60 bg-card/60 px-3 py-2"
            >
              <span className="flex items-center gap-2 text-sm text-foreground">
                <Award className="h-4 w-4 text-amber-500" aria-hidden="true" />
                <span className="min-w-0">
                  <span className="block truncate">{achievement.title}</span>
                  {achievement.description && (
                    <span className="block truncate text-xs text-muted-foreground">
                      {achievement.description}
                    </span>
                  )}
                </span>
              </span>
              <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                {achievement.unlockedAt}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}