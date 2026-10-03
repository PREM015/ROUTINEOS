'use client';

import { useEffect, useMemo, useState } from 'react';
import { Trophy, Medal, Sparkles } from 'lucide-react';
import {
  ACHIEVEMENT_DEFINITIONS,
  ACHIEVEMENT_RARITIES,
  rarityChipStyle,
  rarityTint,
  type AchievementRarity,
} from '@/lib/constants/achievements';
import {
  ACHIEVEMENT_XP,
  computeTrophyLevel,
  xpForRow,
} from '@/lib/achievements/xp';
import { definitionIdOf } from '@/lib/achievements/metadata';
import { getAchievementById } from '@/lib/achievements/definitions';
import { apiRequest } from '@/lib/api-client';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Spinner } from '@/components/ui';
import { EmptyState } from '@/components/ui/EmptyState';
import { AchievementList } from '@/components/achievements/AchievementList';
import { ProgressBar } from '@/components/achievements/ProgressBar';
import { Stagger } from '@/components/today/ui';
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
  /**
   * The canonical join key into the definition catalogue. Null for rows written
   * before the column existed (and for custom achievements), which is why
   * `definitionIdOf` falls back to parsing `metadata`.
   */
  definitionId?: string | null;
}

const RARITY_ORDER: readonly AchievementRarity[] = [
  'COMMON',
  'UNCOMMON',
  'RARE',
  'EPIC',
  'LEGENDARY',
];

/**
 * A row from `GET /api/achievements/next`.
 *
 * `current` is `null` when the app cannot measure this criterion at all (see
 * `AchievementService.getNextUnearned`). It is deliberately not coerced to 0: a
 * zero reads as "you have made no progress", which is a different claim from
 * "this is not tracked", and the two render differently.
 */
interface NextUpRow {
  id: string;
  name: string;
  description: string;
  icon: string;
  color: string;
  current: number | null;
  target: number;
  percent: number | null;
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
  /**
   * Progress toward each *unearned* achievement, keyed by definition id.
   *
   * ERROR.md I2 ("the calculation of the data should be correct and fulfill all
   * the features listed in the project"). The locked tiles used to be built from
   * the shared definition catalogue alone, which has no per-user numbers, so
   * every locked achievement rendered with an empty progress bar and the page
   * could not tell the user what they were working toward — the one thing a
   * locked badge exists to communicate. `GET /api/achievements/next` computes
   * exactly this; the dashboard's strip has used it since B.3, this page had not.
   */
  const [nextUp, setNextUp] = useState<NextUpRow[]>([]);

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

    /*
     * Progress toward the locked set, fetched alongside the earned set.
     *
     * Deliberately *not* awaited by the first request and not allowed to set
     * `error`: the earned achievements are the primary content, and a failure
     * here must not blank the page or turn it into an error state. It only
     * decides whether a locked tile has a progress bar, so the worst case of
     * failing is the previous behaviour.
     */
    const loadNext = async () => {
      try {
        // The whole catalogue is 12 definitions; the route caps at 100, so this
        // asks for all of them and cannot be silently truncated.
        const next = await apiRequest<NextUpRow[]>('/api/achievements/next?count=100');
        if (!cancelled) setNextUp(next);
      } catch {
        // Progress is an enhancement, not a requirement — see above.
      }
    };
    void loadNext();

    return () => {
      cancelled = true;
    };
  }, []);

  const achievements = useMemo<AchievementCardData[]>(() => {
    /**
     * Joined on the stable definition id, which is what the service writes and
     * what the showcase reads. This used to key the earned rows by display
     * *title* while the progress rows were keyed by id, so a renamed definition
     * produced a locked tile and an unlocked tile for the same badge at once.
     */
    const unlockedByDefinition = new Map(
      (rows ?? []).map((row) => [definitionIdOf(row), row])
    );
    const progressById = new Map(nextUp.map((row) => [row.id, row]));

    const unlockedCards: AchievementCardData[] = (rows ?? []).map((row) => {
      const definition = getAchievementById(definitionIdOf(row) ?? '');
      return {
        id: row.id,
        name: row.title,
        description: row.description ?? definition?.description,
        icon: row.icon ?? definition?.icon,
        color: row.color ?? definition?.color,
        // `xpForRow` resolves the same way for the grid and for the history, so
        // a legacy row cannot be Common in one and Legendary in the other.
        tier: xpForRow({ definitionId: row.definitionId, title: row.title }).rarity,
        unlocked: true,
        progress: parseProgress(row.metadata),
        unlockedAt: row.unlockedAt,
      };
    });

    const lockedCards: AchievementCardData[] = DEFINITIONS.filter(
      (definition) => !unlockedByDefinition.has(definition.id),
    ).map((definition) => {
      const next = progressById.get(definition.id);
      return {
        id: definition.id,
        name: definition.name,
        description: definition.description,
        icon: definition.icon,
        color: definition.color,
        tier: definition.rarity,
        unlocked: false,
        // Left `undefined` when the service could not measure the criterion, so
        // the tile shows "not tracked" rather than a misleading 0%.
        progress:
          next && next.target > 0
            ? { current: next.current ?? 0, target: next.target }
            : undefined,
      };
    });

    return [...unlockedCards, ...lockedCards];
  }, [rows, nextUp]);

  const unlockedCount = achievements.filter((achievement) => achievement.unlocked).length;

  const { totalXp, levelInfo, rarityCounts, history } = useMemo(() => {
    const entries: HistoryEntry[] = (rows ?? []).map((row) => {
      const definition = getAchievementById(definitionIdOf(row) ?? '');
      const { rarity } = xpForRow({ definitionId: row.definitionId, title: row.title });
      return {
        id: row.id,
        title: row.title,
        description: row.description ?? definition?.description ?? null,
        icon: row.icon ?? definition?.icon ?? null,
        color: row.color ?? definition?.color ?? null,
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
    <div className="container relative mx-auto max-w-6xl px-4 py-6 sm:py-8">
      {/*
        ERROR.md I1: "the page UI can be improved as it is very boring and not
        mobile responsive."

        The page was a single `max-w-6xl` column of three stacked sections with a
        static header. Same treatment as /today, /routine and /dashboard: the
        gradient mesh supplies the colour, the hero is a bento cell so the trophy
        level and the rarity breakdown sit side by side from `sm` up instead of
        one above the other, and every cell declares its own span so the grid —
        never a card's own `w-*` — decides width.
      */}
      <div
        className="gradient-mesh-animated pointer-events-none absolute inset-0 -z-10 opacity-60"
        aria-hidden="true"
      />

      <div className="relative">
        <Stagger>
          <header className="mb-6 sm:mb-8">
            <h1 className="flex items-center gap-2 font-display text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
              <Trophy className="h-7 w-7 text-amber-500" aria-hidden="true" />
              Achievements
            </h1>
            <p className="mt-2 text-muted-foreground">
              {rows
                ? `${unlockedCount} of ${achievements.length} achievements unlocked. Keep the streak going.`
                : 'Track milestones as you build consistency.'}
            </p>
          </header>
        </Stagger>

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
            <Stagger delay={0.08} className="mb-6">
              <Card className="p-6">
                <div className="flex flex-col gap-6 lg:flex-row lg:items-center">
                  <div className="flex items-center gap-4">
                    <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-amber-500/10 text-3xl ring-2 ring-amber-500/40">
                      <span aria-hidden="true">{levelInfo.maxed ? '👑' : '🏆'}</span>
                    </div>
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        Trophy Level
                      </p>
                      <p className="font-display text-3xl font-bold tabular-nums text-foreground">{levelInfo.level}</p>
                      <p className="text-sm tabular-nums text-muted-foreground">
                        {totalXp} XP earned
                      </p>
                    </div>
                  </div>

                  <div className="min-w-0 flex-1">
                    <div className="mb-1.5 flex items-center justify-between gap-2 text-xs">
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
                      // A progress fill is not text, so the raw hue is correct here —
                      // but it still needs a theme-aware track, which `color-mix`
                      // against `--foreground` supplies for the same reason as
                      // `rarityChipStyle`.
                      color={levelInfo.maxed ? '#f59e0b' : '#8b5cf6'}
                      ariaLabel="Progress to next trophy level"
                    />
                    <div className="mt-3 flex flex-wrap gap-2">
                      {RARITY_ORDER.map((rarity) => (
                        <Badge key={rarity} style={rarityChipStyle(ACHIEVEMENT_RARITIES[rarity].color)}>
                          {ACHIEVEMENT_RARITIES[rarity].icon} {rarityCounts[rarity]} {ACHIEVEMENT_RARITIES[rarity].label}
                        </Badge>
                      ))}
                    </div>
                  </div>
                </div>
              </Card>
            </Stagger>

          <Stagger delay={0.14}>
            <AchievementList achievements={achievements} />
          </Stagger>

          {/* Unlock history timeline */}
          <Stagger delay={0.2}>
          <section className="mt-10" aria-labelledby="unlock-history-heading">
            <h2 id="unlock-history-heading" className="flex items-center gap-2 text-xl font-bold">
              <Medal className="h-5 w-5 text-amber-500" aria-hidden="true" />
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
                              style={{ backgroundColor: rarityTint(accent) }}
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
                              <Badge style={rarityChipStyle(rarity.color)}>{rarity.icon} {rarity.label}</Badge>
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
          </Stagger>
        </>
      )}
      </div>
    </div>
  );
}