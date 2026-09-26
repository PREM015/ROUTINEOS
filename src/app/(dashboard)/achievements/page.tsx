'use client';

import { useEffect, useMemo, useState } from 'react';
import { Trophy, Medal, Sparkles } from 'lucide-react';
import {
  ACHIEVEMENT_DEFINITIONS,
  ACHIEVEMENT_RARITIES,
  type AchievementRarity,
} from '@/lib/constants/achievements';
import {
  ACHIEVEMENT_XP,
  computeTrophyLevel,
  xpForRow,
} from '@/lib/achievements/xp';
import { apiRequest } from '@/lib/api-client';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Spinner } from '@/components/ui';
import { EmptyState } from '@/components/ui/EmptyState';
import { AchievementList } from '@/components/achievements/AchievementList';
import { ProgressBar } from '@/components/achievements/ProgressBar';
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

function formatUnlockTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}

function localDateKey(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return 'Unknown date';
  return date.toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

interface HistoryEntry {
  id: string;
  title: string;
  description: string | null;
  icon: string | null;
  color: string | null;
  rarity: AchievementRarity;
  xp: number;
  unlockedAt: string;
  dateKey: string;
  time: string;
}

/**
 * Achievements Page
 * Shows the user's XP/level summary, unlock history timeline, and the full
 * catalog of defined achievements (rendered as locked until earned).
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
        tier: definition?.rarity ?? xpForRow(row).rarity,
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

  const { totalXp, levelInfo, rarityCounts, history } = useMemo(() => {
    const entries: HistoryEntry[] = (rows ?? []).map((row) => {
      const rarity = xpForRow(row).rarity;
      const listing = DEFINITIONS.find((item) => item.name === row.title);
      return {
        id: row.id,
        title: row.title,
        description: row.description ?? listing?.description ?? null,
        icon: row.icon ?? listing?.icon ?? null,
        color: row.color ?? listing?.color ?? null,
        rarity,
        xp: ACHIEVEMENT_XP[rarity],
        unlockedAt: row.unlockedAt,
        dateKey: localDateKey(row.unlockedAt),
        time: formatUnlockTime(row.unlockedAt),
      };
    });

    const total = entries.reduce((sum, entry) => sum + entry.xp, 0);

    const counts = RARITY_ORDER.reduce<Record<AchievementRarity, number>>(
      (acc, rarity) => {
        acc[rarity] = 0;
        return acc;
      },
      {} as Record<AchievementRarity, number>
    );
    for (const entry of entries) {
      counts[entry.rarity] += 1;
    }

    const grouped = new Map<string, HistoryEntry[]>();
    for (const entry of entries) {
      const bucket = grouped.get(entry.dateKey);
      if (bucket) bucket.push(entry);
      else grouped.set(entry.dateKey, [entry]);
    }
    const timeline: HistoryEntry[][] = Array.from(grouped.entries()).map(([, list]) => list);
    timeline.sort((a, b) => (a[0]?.unlockedAt ?? '').localeCompare(b[0]?.unlockedAt ?? '') * -1);
    for (const list of timeline) {
      list.sort((a, b) => b.unlockedAt.localeCompare(a.unlockedAt));
    }

    return {
      totalXp: total,
      levelInfo: computeTrophyLevel(total),
      rarityCounts: counts,
      history: timeline,
    };
  }, [rows]);

  return (
    <div className="container mx-auto max-w-6xl px-4 py-8">
      <div className="mb-8">
        <h1 className="flex items-center gap-2 text-3xl font-bold">
          <Trophy className="h-7 w-7 text-amber-500" />
          Achievements
        </h1>
        <p className="mt-2 text-muted-foreground">
          {rows
            ? `${unlockedCount} of ${achievements.length} achievements unlocked. Keep the streak going.`
            : 'Track milestones as you build consistency.'}
        </p>
      </div>

      {error && (
        <p role="alert" className="mb-6 rounded-lg bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {error}
        </p>
      )}

      {!rows && !error ? (
        <div className="flex justify-center py-16">
          <Spinner className="h-6 w-6" />
        </div>
      ) : (
        <>
          {/* XP / level summary */}
          <Card className="mb-8 p-6">
            <div className="flex flex-col gap-6 lg:flex-row lg:items-center">
              <div className="flex items-center gap-4">
                <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-amber-500/10 text-3xl ring-2 ring-amber-500/40">
                  <span aria-hidden="true">{levelInfo.maxed ? '👑' : '🏆'}</span>
                </div>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Trophy Level
                  </p>
                  <p className="text-3xl font-bold text-foreground tabular-nums">{levelInfo.level}</p>
                  <p className="text-sm text-muted-foreground tabular-nums">
                    {totalXp} XP earned
                  </p>
                </div>
              </div>

              <div className="min-w-0 flex-1">
                <div className="mb-1.5 flex items-center justify-between text-xs">
                  <span className="font-medium text-foreground">
                    {levelInfo.maxed ? 'Maximum level' : `Next level (${levelInfo.level + 1})`}
                  </span>
                  <span className="tabular-nums text-muted-foreground">
                    {levelInfo.maxed ? 'Max' : `${levelInfo.currentXp} / ${levelInfo.neededForNext} XP`}
                  </span>
                </div>
                <ProgressBar
                  value={levelInfo.currentXp}
                  max={levelInfo.neededForNext}
                  color={levelInfo.maxed ? '#f59e0b' : '#8b5cf6'}
                  ariaLabel="Progress to next trophy level"
                />
                <div className="mt-3 flex flex-wrap gap-2">
                  {RARITY_ORDER.map((rarity) => (
                    <Badge key={rarity} style={{ color: ACHIEVEMENT_RARITIES[rarity].color }}>
                      {ACHIEVEMENT_RARITIES[rarity].icon} {rarityCounts[rarity]} {ACHIEVEMENT_RARITIES[rarity].label}
                    </Badge>
                  ))}
                </div>
              </div>
            </div>
          </Card>

          <AchievementList achievements={achievements} />

          {/* Unlock history timeline */}
          <section className="mt-10" aria-labelledby="unlock-history-heading">
            <h2 id="unlock-history-heading" className="flex items-center gap-2 text-xl font-bold">
              <Medal className="h-5 w-5 text-amber-500" />
              Unlock History
            </h2>
            {history.length === 0 ? (
              <Card className="mt-4">
                <EmptyState
                  icon={<Sparkles className="mx-auto h-10 w-10 text-muted-foreground/50" />}
                  title="No unlocks yet"
                  description="Complete habits, goals and focus sessions — the first achievement is close."
                />
              </Card>
            ) : (
              <div className="mt-4 space-y-6">
                {history.map((group) => (
                  <div key={group[0]?.dateKey}>
                    <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      {group[0]?.dateKey}
                    </p>
                    <Card className="divide-y divide-border overflow-hidden">
                      {group.map((entry) => {
                        const rarity = ACHIEVEMENT_RARITIES[entry.rarity];
                        const accent = entry.color ?? rarity.color;
                        return (
                          <div key={entry.id} className="flex items-center gap-3 px-4 py-3">
                            <div
                              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-xl"
                              style={{ backgroundColor: `${accent}1a` }}
                              aria-hidden="true"
                            >
                              {entry.icon ?? '🎖️'}
                            </div>
                            <div className="min-w-0 flex-1">
                              <p className="truncate text-sm font-semibold text-foreground" title={entry.title}>
                                {entry.title}
                              </p>
                              {entry.description && (
                                <p className="truncate text-xs text-muted-foreground">{entry.description}</p>
                              )}
                            </div>
                            <div className="flex shrink-0 items-center gap-3">
                              <Badge style={{ color: rarity.color }}>{rarity.icon} {rarity.label}</Badge>
                              <Badge variant="success" className="tabular-nums">+{entry.xp} XP</Badge>
                              <span className="hidden text-xs tabular-nums text-muted-foreground sm:inline">
                                {entry.time}
                              </span>
                            </div>
                          </div>
                        );
                      })}
                    </Card>
                  </div>
                ))}
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
}