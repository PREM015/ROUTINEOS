'use client';

/**
 * Settings — Scoring Weights
 * Adjusts how the three habit-tier buckets (Non-Negotiable / Growth / Bonus)
 * contribute to the daily score. Reads the persisted weights from
 * GET /api/settings and saves them via PUT /api/settings, which the
 * scoring.service reads when calculating daily scores.
 */

import { useCallback, useEffect, useState } from 'react';
import { CheckCircle2, RotateCcw, ShieldAlert, SlidersHorizontal } from 'lucide-react';
import { apiRequest, ApiError } from '@/lib/api-client';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Skeleton } from '@/components/ui/Skeleton';

interface WeightField {
  key: 'weightNonNeg' | 'weightGrowth' | 'weightBonus';
  label: string;
  tiers: string;
  description: string;
}

const WEIGHT_FIELDS: WeightField[] = [
  {
    key: 'weightNonNeg',
    label: 'Non-Negotiable',
    tiers: 'Growth habits',
    description: 'Your highest-priority habits. A large weight makes them dominate your daily score.',
  },
  {
    key: 'weightGrowth',
    label: 'Growth',
    tiers: 'Bonus, Lifestyle & Flexible habits',
    description: 'Your building routines. Raising this rewards consistency on growth habits.',
  },
  {
    key: 'weightBonus',
    label: 'Bonus',
    tiers: 'Optional & Experimental habits',
    description: 'Extra-credit habits. Keep this below the other tiers so fundamentals always count more.',
  },
];

const MIN_WEIGHT = 0;
const MAX_WEIGHT = 5;
const STEP_WEIGHT = 0.1;

const DEFAULT_WEIGHTS: Record<WeightField['key'], number> = {
  weightNonNeg: 1,
  weightGrowth: 0.5,
  weightBonus: 0.25,
};

export default function ScoringSettingsPage() {
  const [weights, setWeights] = useState<Record<WeightField['key'], number> | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setError(null);
      const settings = await apiRequest<{
        weightNonNeg?: number;
        weightGrowth?: number;
        weightBonus?: number;
      }>('/api/settings');
      setWeights({
        weightNonNeg: settings.weightNonNeg ?? DEFAULT_WEIGHTS.weightNonNeg,
        weightGrowth: settings.weightGrowth ?? DEFAULT_WEIGHTS.weightGrowth,
        weightBonus: settings.weightBonus ?? DEFAULT_WEIGHTS.weightBonus,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load scoring settings');
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- mount data fetch
    void load();
  }, [load]);

  const save = async () => {
    if (!weights || saving) return;
    setSaving(true);
    setError(null);
    try {
      await apiRequest('/api/settings', {
        method: 'PUT',
        body: {
          weightNonNeg: weights.weightNonNeg,
          weightGrowth: weights.weightGrowth,
          weightBonus: weights.weightBonus,
        },
      });
      setSaved(true);
      window.setTimeout(() => setSaved(false), 1600);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to save scoring settings');
    } finally {
      setSaving(false);
    }
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

      <Card>
        <div className="p-6">
          {weights === null ? (
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
                      <span className="text-sm font-semibold tabular-nums">{value.toFixed(1)}×</span>
                    </div>
                    <input
                      id={field.key}
                      type="range"
                      min={MIN_WEIGHT}
                      max={MAX_WEIGHT}
                      step={STEP_WEIGHT}
                      value={value}
                      onChange={(event) =>
                        setWeights({
                          ...weights,
                          [field.key]: Number(event.target.value),
                        })
                      }
                      className="mt-2 w-full accent-primary"
                    />
                    <p className="mt-1 text-xs text-muted-foreground">{field.description}</p>
                  </div>
                );
              })}

              <div className="mt-6 flex flex-wrap items-center gap-3">
                <Button onClick={() => void save()} isLoading={saving}>
                  Save weights
                </Button>
                <Button
                  variant="ghost"
                  onClick={() => setWeights({ ...DEFAULT_WEIGHTS })}
                  disabled={saving}
                >
                  <RotateCcw className="mr-1.5 h-4 w-4" />
                  Reset to defaults
                </Button>
                {saved && (
                  <span className="inline-flex items-center gap-1 text-sm text-emerald-600 dark:text-emerald-400">
                    <CheckCircle2 className="h-4 w-4" />
                    Saved
                  </span>
                )}
              </div>

              {error && (
                <p role="alert" className="mt-4 rounded-md bg-destructive/10 px-4 py-3 text-sm text-destructive">
                  <ShieldAlert className="mr-1.5 inline h-4 w-4" />
                  {error}
                </p>
              )}
            </div>
          )}
        </div>
      </Card>
    </main>
  );
}
