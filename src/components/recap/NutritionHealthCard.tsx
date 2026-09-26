'use client';

import { Apple, HeartPulse } from 'lucide-react';
import StatTile from './stat-tile';
import type { RecapExtras } from '@/types/recap';

interface NutritionHealthCardProps {
  nutrition: RecapExtras['nutrition'];
  health: RecapExtras['health'];
}

/**
 * Nutrition + health snapshot for the period. Both slots are independently
 * null-when-empty — a section with no data stays a placeholder, never 0.
 * Sources: NutritionEntry and HealthMetric rows.
 */
export default function NutritionHealthCard({ nutrition, health }: NutritionHealthCardProps) {
  return (
    <section className="glass-panel spotlight-hover rounded-2xl p-6 shadow-soft">
      <header className="mb-4 flex items-center gap-2">
        <span className="inline-flex rounded-lg bg-rose-500/10 p-2 text-rose-500">
          <HeartPulse className="h-4 w-4" aria-hidden="true" />
        </span>
        <h2 className="text-sm font-semibold text-foreground">Nutrition &amp; health</h2>
      </header>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {nutrition ? (
          <>
            <StatTile
              accent="amber"
              icon={<Apple className="h-5 w-5" />}
              label="Nutrition logged"
              value={String(nutrition.entries)}
              detail={`${nutrition.daysLogged} day${nutrition.daysLogged === 1 ? '' : 's'} · ${
                nutrition.calories != null ? `${nutrition.calories.toLocaleString()} kcal` : 'no calories tracked'
              }`}
            />
          </>
        ) : (
          <p className="rounded-2xl border border-dashed border-border/70 p-5 text-center text-sm text-muted-foreground">
            No meals logged in this period.
          </p>
        )}

        {health && health.length > 0 ? (
          <ul className="space-y-2">
            {health.slice(0, 4).map((metric, index) => (
              <li
                key={`${metric.metricType}-${metric.date}-${index}`}
                className="flex items-center justify-between rounded-xl border border-border/60 bg-card/60 px-3 py-2"
              >
                <span className="text-xs text-muted-foreground">
                  {metric.metricType} <span className="tabular-nums">({metric.date})</span>
                </span>
                <span className="text-sm font-semibold tabular-nums text-foreground">
                  {metric.value} {metric.unit}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="rounded-2xl border border-dashed border-border/70 p-5 text-center text-sm text-muted-foreground">
            No health metrics tracked in this period.
          </p>
        )}
      </div>
    </section>
  );
}