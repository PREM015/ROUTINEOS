'use client';

/**
 * Settings — Scoring Weights
 *
 * Adjusts how the three habit-tier buckets contribute to the daily score.
 * `scoring.service.ts` reads these three columns when building each bucket:
 *
 *   weightNonNeg -> CORE_TIERS   (NON_NEGOTIABLE, GROWTH)
 *   weightGrowth -> GROWTH_TIERS (LIFESTYLE, FLEXIBLE)
 *   weightBonus  -> BONUS_TIERS  (BONUS, OPTIONAL, EXPERIMENTAL)
 *
 * Fixes vs. the previous version:
 *  - The error banner lived inside the `weights !== null` branch, but
 *    `weights` only becomes non-null on a *successful* load, so the
 *    `role="alert"` could never render. It is now outside the branch, and
 *    there is an auth guard (a 401 used to mean three permanent skeletons
 *    with no message).
 *  - "Reset to defaults" only mutated local state; navigating away lost it.
 *    It now persists immediately.
 *  - The tier captions were wrong ("Growth habits" on the Non-Negotiable
 *    slider). They now match `CORE_TIERS` / `GROWTH_TIERS` / `BONUS_TIERS`.
 */

import { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  CheckCircle2,
  RotateCcw,
  ShieldAlert,
  SlidersHorizontal,
} from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { useSettings } from '@/hooks/useSettings';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Skeleton } from '@/components/ui/Skeleton';

type WeightKey = 'weightNonNeg' | 'weightGrowth' | 'weightBonus';
type Weights = Record<WeightKey, number>;

interface WeightField {
  key: WeightKey;
  label: string;
  tiers: string;
  description: string;
}

const WEIGHT_FIELDS: WeightField[] = [
  {
    key: 'weightNonNeg',
    label: 'Core',
    tiers: 'Non-Negotiable + Growth habits',
    description:
      'Your highest-priority habits. A large weight makes them dominate your daily score.',
  },
  {
    key: 'weightGrowth',
    label: 'Growth',
    tiers: 'Lifestyle + Flexible habits',
    description: 'Your building routines. Raising this rewards consistency here.',
  },
  {
    key: 'weightBonus',
    label: 'Bonus',
    tiers: 'Bonus, Optional + Experimental habits',
    description:
      'Extra-credit habits. Keep this below the other tiers so fundamentals always count more.',
  },
];

const MIN_WEIGHT = 0;
const MAX_WEIGHT = 5;
const STEP_WEIGHT = 0.1;

/**
 * The weights a brand-new account starts with, i.e. the column defaults on
 * `UserSettings` in `prisma/schema.prisma`. Resetting to these restores exactly
 * what the user had before touching the sliders.
 *
 * Note these deliberately differ from `SCORING_WEIGHTS.tiers` in
 * `src/config/scoring.ts` (1.5 / 1.0 / 0.5). That config is only the fallback
 * for a null column; the columns are non-null with these defaults, so these are
 * the values a real account uses. `tests/domain/tier-weights.test.ts` pins the
 * relationship.
 */
const DEFAULT_WEIGHTS: Weights = {
  weightNonNeg: 1,
  weightGrowth: 0.5,
  weightBonus: 0.25,
};

function isDefaultWeights(weights: Weights): boolean {
  return WEIGHT_FIELDS.every((field) => weights[field.key] === DEFAULT_WEIGHTS[field.key]);
}

export default function ScoringSettingsPage() {
  const { isAuthenticated, isLoading: authLoading } = useAuth();
  const { settings, loading, save, patchLocal, saving, error } = useSettings();

  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (!saved) return;
    const timer = window.setTimeout(() => setSaved(false), 1600);
    return () => window.clearTimeout(timer);
  }, [saved]);

  if (authLoading) {
    return (
      <main className="container mx-auto max-w-3xl px-4 py-8">
        <Skeleton className="h-8 w-40" />
        <div className="mt-6 space-y-6">
          <Skeleton className="h-64 rounded-xl" />
        </div>
      </main>
    );
  }

  if (!isAuthenticated) {
    return (
      <main className="container mx-auto max-w-2xl px-4 py-16">
        <Card>
          <div className="p-8 text-center">
            <ShieldAlert className="mx-auto h-12 w-12 text-amber-500" />
            <h1 className="mt-4 text-xl font-bold">Sign in required</h1>
            <Link
              href="/login"
              className="mt-6 inline-flex h-10 w-full items-center justify-center rounded-lg bg-primary light-sweep glow-neon px-4 text-sm font-semibold text-primary-foreground shadow-sm transition-[background-color,box-shadow,transform] duration-200 ease-out-expo hover:bg-primary/90 active:scale-[0.97]"
            >
              Sign in
            </Link>
          </div>
        </Card>
      </main>
    );
  }

  const weights: Weights | null = settings
    ? {
        weightNonNeg: settings.weightNonNeg,
        weightGrowth: settings.weightGrowth,
        weightBonus: settings.weightBonus,
      }
    : null;

  const persist = async () => {
    if (!weights) return;
    const result = await save(weights);
    if (result) setSaved(true);
  };

  const resetToDefaults = async () => {
    patchLocal(DEFAULT_WEIGHTS);
    const result = await save(DEFAULT_WEIGHTS);
    if (result) setSaved(true);
  };

  return (
    <main className="container mx-auto max-w-3xl px-4 py-8">
      <div className="mb-6">
        <h1 className="flex items-center gap-2 text-2xl font-bold">
          <SlidersHorizontal className="h-6 w-6 text-primary" />
          Scoring Weights
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Adjust how much each habit tier contributes to your daily score.
        </p>
      </div>

      {/* Rendered outside the loading branch: a failed load leaves `weights`
          null, so an error shown only when weights exist is unreachable. */}
      {error && (
        <div
          className="mb-6 rounded-md bg-destructive/10 px-4 py-3 text-sm text-destructive"
          role="alert"
        >
          <ShieldAlert className="mr-1.5 inline h-4 w-4" aria-hidden="true" />
          {error}
        </div>
      )}

      <Card>
        <div className="p-6">
          {loading || weights === null ? (
            <div className="space-y-4">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-20 rounded-lg" />
              ))}
            </div>
          ) : (
            <div className="space-y-6">
              {WEIGHT_FIELDS.map((field) => {
                const value = weights[field.key];
                return (
                  <div key={field.key}>
                    <div className="flex items-baseline justify-between gap-3">
                      <label htmlFor={field.key} className="text-sm font-medium">
                        {field.label}
                        <span className="block text-xs font-normal text-muted-foreground">
                          {field.tiers}
                        </span>
                      </label>
                      <span className="text-sm font-semibold tabular-nums">
                        {value.toFixed(1)}×
                      </span>
                    </div>
                    <input
                      id={field.key}
                      type="range"
                      min={MIN_WEIGHT}
                      max={MAX_WEIGHT}
                      step={STEP_WEIGHT}
                      value={value}
                      onChange={(event) =>
                        patchLocal({
                          [field.key]: Number(event.target.value),
                        } as Partial<Weights>)
                      }
                      className="mt-2 w-full accent-primary"
                    />
                    <p className="mt-1 text-xs text-muted-foreground">
                      {field.description}
                    </p>
                  </div>
                );
              })}

              <div className="flex flex-wrap items-center gap-3">
                <Button onClick={() => void persist()} isLoading={saving}>
                  Save weights
                </Button>
                <Button
                  variant="ghost"
                  onClick={() => void resetToDefaults()}
                  disabled={saving || isDefaultWeights(weights)}
                  title="Persist the default weights"
                >
                  <RotateCcw className="mr-1.5 h-4 w-4" aria-hidden="true" />
                  Reset to defaults
                </Button>
                {saved && (
                  <span className="inline-flex items-center gap-1 text-sm text-emerald-600 dark:text-emerald-400">
                    <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
                    Saved
                  </span>
                )}
              </div>

              <p className="text-xs text-muted-foreground">
                Weights apply to scores calculated from now on. Previously
                calculated days keep the weights that were in effect at the
                time.
              </p>
            </div>
          )}
        </div>
      </Card>
    </main>
  );
}
