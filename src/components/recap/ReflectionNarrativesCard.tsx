'use client';

import { BookHeart } from 'lucide-react';
import type { RecapExtras } from '@/types/recap';

interface ReflectionNarrativesCardProps {
  reflections: RecapExtras['reflections'];
}

/**
 * Narrative reflections for the period — wins, difficulties, lessons learned,
 * gratitude, and tomorrow focus, straight from real DailyReflection rows. Only
 * days that actually contain written narrative appear.
 * Source: DailyReflection rows within the period.
 */
export default function ReflectionNarrativesCard({ reflections }: ReflectionNarrativesCardProps) {
  return (
    <section className="glass-panel spotlight-hover rounded-2xl p-6 shadow-soft">
      <header className="mb-4 flex items-center gap-2">
        <span className="inline-flex rounded-lg bg-amber-500/10 p-2 text-amber-500">
          <BookHeart className="h-4 w-4" aria-hidden="true" />
        </span>
        <h2 className="text-sm font-semibold text-foreground">Reflections</h2>
      </header>

      {reflections.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted-foreground">
          Write a reflection to see your notes here.
        </p>
      ) : (
        <ul className="space-y-3">
          {reflections.map((day) => (
            <li key={day.date} className="rounded-xl border border-border/60 bg-card/60 px-3 py-2.5">
              <p className="text-[11px] font-semibold tabular-nums text-muted-foreground">
                {day.date}
              </p>
              <ul className="mt-1.5 space-y-2">
                {day.narrative.map((entry) => (
                  <li key={entry.label} className="text-sm">
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-amber-500">
                      {entry.label}
                    </p>
                    <p className="mt-0.5 text-foreground/90">{entry.value}</p>
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}