'use client';

/**
 * AchievementList — grid of achievement cards with filters.
 *
 * Renders an array of `AchievementCardData` as a responsive grid of
 * `AchievementBadge`s and exposes client-side filters for unlock status
 * (all / unlocked / locked) and rarity tier. Fully prop-driven; the parent
 * is responsible for fetching the data.
 *
 * Usage:
 *   <AchievementList achievements={achievements} />
 */

import { useMemo, useState } from 'react';
import { Trophy } from 'lucide-react';
import { ACHIEVEMENT_RARITIES, type AchievementRarity } from '@/lib/constants/achievements';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/Badge';
import { EmptyState } from '@/components/ui/EmptyState';
import {
  AchievementBadge,
  type AchievementCardData,
} from './AchievementBadge';

export type AchievementStatusFilter = 'ALL' | 'UNLOCKED' | 'LOCKED';
export type AchievementTierFilter = 'ALL' | AchievementRarity;

export interface AchievementListProps {
  achievements: readonly AchievementCardData[];
  showFilters?: boolean;
  className?: string;
}

const STATUS_OPTIONS: ReadonlyArray<{ value: AchievementStatusFilter; label: string }> = [
  { value: 'ALL', label: 'All' },
  { value: 'UNLOCKED', label: 'Unlocked' },
  { value: 'LOCKED', label: 'Locked' },
];

export function AchievementList({
  achievements,
  showFilters = true,
  className,
}: AchievementListProps) {
  const [status, setStatus] = useState<AchievementStatusFilter>('ALL');
  const [tier, setTier] = useState<AchievementTierFilter>('ALL');

  const filtered = useMemo(
    () =>
      achievements.filter((achievement) => {
        if (status === 'UNLOCKED' && !achievement.unlocked) return false;
        if (status === 'LOCKED' && achievement.unlocked) return false;
        if (tier !== 'ALL' && achievement.tier !== tier) return false;
        return true;
      }),
    [achievements, status, tier]
  );

  const counts = useMemo(
    () => ({
      total: achievements.length,
      unlocked: achievements.filter((a) => a.unlocked).length,
      locked: achievements.filter((a) => !a.unlocked).length,
    }),
    [achievements]
  );

  return (
    <div className={cn('w-full', className)}>
      {showFilters && (
        <div className="mb-5 flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-1 rounded-lg bg-gray-100 p-1" role="group" aria-label="Filter by status">
            {STATUS_OPTIONS.map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => setStatus(option.value)}
                aria-pressed={status === option.value}
                className={cn(
                  'rounded-md px-3 py-1.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600',
                  status === option.value
                    ? 'bg-white text-gray-900 shadow-sm'
                    : 'text-gray-500 hover:text-gray-800'
                )}
              >
                {option.label}
                <span className="ml-1.5 tabular-nums text-xs text-gray-400">
                  {option.value === 'ALL' ? counts.total : option.value === 'UNLOCKED' ? counts.unlocked : counts.locked}
                </span>
              </button>
            ))}
          </div>

          <select
            aria-label="Filter by tier"
            value={tier}
            onChange={(event) => setTier(event.target.value as AchievementTierFilter)}
            className="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="ALL">All tiers</option>
            {Object.entries(ACHIEVEMENT_RARITIES).map(([key, config]) => (
              <option key={key} value={key}>
                {config.icon} {config.label}
              </option>
            ))}
          </select>
        </div>
      )}

      {filtered.length === 0 ? (
        <EmptyState
          icon={<Trophy className="h-12 w-12 text-gray-300" />}
          title="No achievements match"
          description={tier !== 'ALL' || status !== 'ALL' ? 'Try clearing the filters.' : undefined}
        />
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {filtered.map((achievement) => (
            <AchievementBadge key={achievement.id} achievement={achievement} />
          ))}
        </div>
      )}
    </div>
  );
}

export default AchievementList;