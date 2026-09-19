'use client';

import { useEffect, useMemo, useState } from 'react';
import { Trophy } from 'lucide-react';
import {
  ACHIEVEMENT_DEFINITIONS,
  type AchievementRarity,
} from '@/lib/constants/achievements';
import { apiRequest } from '@/lib/api-client';
import { Spinner } from '@/components/ui';
import { AchievementList } from '@/components/achievements/AchievementList';
import type { AchievementCardData } from '@/components/achievements/AchievementBadge';

interface AchievementRow {
  id: string;
  type: string;
  title: string;
  description: string | null;
  icon: string | null;
  color: string | null;
  level: number;
  unlockedAt: string;
  metadata: string | null;
}

const RARITY_ORDER: readonly AchievementRarity[] = [
  'COMMON',
  'UNCOMMON',
  'RARE',
  'EPIC',
  'LEGENDARY',
];

function tierFromLevel(level: number): AchievementRarity {
  return RARITY_ORDER[level - 1] ?? 'COMMON';
}

function parseProgress(metadata: string | null): { current: number; target: number } | undefined {
  if (!metadata) return undefined;
  try {
    const parsed: unknown = JSON.parse(metadata);
    if (typeof parsed !== 'object' || parsed === null) return undefined;
    const record = parsed as Record<string, unknown>;
    const current = record.current;
    const target = record.target;
    if (typeof current === 'number' && typeof target === 'number' && target > 0) {
      return { current, target };
    }
    return undefined;
  } catch {
    return undefined;
  }
}

const DEFINITIONS = Object.values(ACHIEVEMENT_DEFINITIONS);

/**
 * Achievements Page
 * Shows unlocked achievements from the API merged with the full catalog of
 * defined achievements (rendered as locked until earned).
 */
export default function AchievementsPage() {
  const [rows, setRows] = useState<AchievementRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const unlocked = await apiRequest<AchievementRow[]>('/api/achievements');
        if (!cancelled) setRows(unlocked);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load achievements');
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  const achievements = useMemo<AchievementCardData[]>(() => {
    const unlockedByTitle = new Map((rows ?? []).map((row) => [row.title, row]));

    const unlockedCards: AchievementCardData[] = (rows ?? []).map((row) => {
      const definition = DEFINITIONS.find((item) => item.name === row.title);
      return {
        id: row.id,
        name: row.title,
        description: row.description ?? definition?.description,
        icon: row.icon ?? definition?.icon,
        color: row.color ?? definition?.color,
        tier: definition?.rarity ?? tierFromLevel(row.level),
        unlocked: true,
        progress: parseProgress(row.metadata),
        unlockedAt: row.unlockedAt,
      };
    });

    const lockedCards: AchievementCardData[] = DEFINITIONS.filter(
      (definition) => !unlockedByTitle.has(definition.name),
    ).map((definition) => ({
      id: definition.id,
      name: definition.name,
      description: definition.description,
      icon: definition.icon,
      color: definition.color,
      tier: definition.rarity,
      unlocked: false,
    }));

    return [...unlockedCards, ...lockedCards];
  }, [rows]);

  const unlockedCount = achievements.filter((achievement) => achievement.unlocked).length;

  return (
    <div className="container mx-auto max-w-6xl px-4 py-8">
      <div className="mb-8">
        <h1 className="flex items-center gap-2 text-3xl font-bold">
          <Trophy className="h-7 w-7 text-amber-500" />
          Achievements
        </h1>
        <p className="mt-2 text-gray-600">
          {rows
            ? `${unlockedCount} of ${achievements.length} achievements unlocked. Keep the streak going.`
            : 'Track milestones as you build consistency.'}
        </p>
      </div>

      {error && (
        <p role="alert" className="mb-6 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-600">
          {error}
        </p>
      )}

      {!rows && !error ? (
        <div className="flex justify-center py-16">
          <Spinner className="h-6 w-6" />
        </div>
      ) : (
        <AchievementList achievements={achievements} />
      )}
    </div>
  );
}
