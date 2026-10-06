'use client';

/**
 * TrophyHero — the one dominant element on the page.
 *
 * ## Why this is its own component
 *
 * It was a `Card` inside the page's render tree: an emoji tile, a level number, a
 * `ProgressBar` and five rarity chips. Splitting it out is not tidiness — the hero
 * is the only part of this page that has to be right about XP, and it now reads
 * six separate derived values (level, total XP, XP to next, cumulative XP, rarity
 * counts, lifetime stats, next-level route). Keeping them together means a change
 * to the XP story is a change in one place.
 *
 * ## Every number here comes from the same resolver
 *
 * The ring's percentage is `computeTrophyLevel(...).progress`. The route's XP values
 * are `tile.xp`. The spectrum's counts are `rarityCounts`. None of them is computed
 * locally, so the hero cannot disagree with the grid, the chips or the history.
 *
 * ## "One possible route", always
 *
 * AC2 is a suggestion, not a plan. XP can also arrive from a badge added to the
 * catalogue next month, or a level rule change, so the wording never claims this is
 * *the* way. Getting that wrong turns a helpful hint into a promise.
 *
 * ## Visual weight
 *
 * This is the only element on the page that gets a light source: one warm bloom
 * behind the ring, on a gold-washed band. The Almanac's "one dominant element per
 * viewport" rule — the eye needs somewhere to land, and the trophy level is it.
 */

import { TrendingUp } from 'lucide-react';
import {
  ACHIEVEMENT_CATEGORIES,
  ACHIEVEMENT_RARITIES,
  rarityInk,
  type AchievementRarity,
} from '@/lib/constants/achievements';
import { ACHIEVEMENT_XP } from '@/lib/achievements/xp';
import {
  RARITY_ORDER,
  type AchievementFilters,
} from '@/lib/achievements/view-model';
import type { LifetimeStats, NextLevelRoute } from '@/lib/achievements/derived';
import { AchievementRing } from './AchievementRing';
import { cn } from '@/lib/utils';

export interface TrophyHeroProps {
  level: number;
  /** 0-1 progress toward the next level, from `computeTrophyLevel`. */
  levelProgress: number;
  totalXp: number;
  /** XP earned inside the current level. */
  currentXp: number;
  /** XP needed to advance from the current level; 0 when maxed. */
  neededForNext: number;
  /** Cumulative XP at which the next level is reached. */
  nextLevelAt: number;
  maxed: boolean;
  rarityCounts: Record<AchievementRarity, number>;
  /** Total badges in the catalogue, for the spectrum's denominator. */
  totalBadges: number;
  /** `null` until there is at least one unlock. */
  stats: LifetimeStats | null;
  /** `null` at max level, or when there is nothing left to earn. */
  route: NextLevelRoute | null;
  /** Current filter state, so the spectrum can reflect and set the tier filter. */
  filters: AchievementFilters;
  onFiltersChange: (next: AchievementFilters) => void;
  /** Candidate tiles for the next-level route suggestion. */
  candidates?: readonly { id: string; name: string; xp: number; rarity: AchievementRarity }[];
}

/** The nearest named tier to a 0-4 average, so the figure has a word attached. */
function rarityNameFor(averageIndex: number): string {
  const nearest = Math.round(averageIndex);
  const key = RARITY_ORDER[Math.min(RARITY_ORDER.length - 1, Math.max(0, nearest))];
  return key ? ACHIEVEMENT_RARITIES[key].label : '';
}

function Stat({
  label,
  value,
  hint,
  icon,
  accent,
}: {
  label: string;
  value: string;
  /** Secondary line: the tier name behind a number, for example. */
  hint?: string;
  icon?: string;
  /** When present, the value is drawn in the tier's own colour. */
  accent?: string;
}) {
  return (
    <div className="ach-panel min-w-0 rounded-xl px-3 py-2.5">
      <dt className="text-[9px] font-semibold uppercase tracking-widest text-muted-foreground">
        {label}
      </dt>
      <dd
        className="mt-0.5 flex items-baseline gap-1 truncate text-sm font-semibold"
        style={accent ? { color: rarityInk(accent) } : undefined}
        title={value}
      >
        {icon && (
          <span aria-hidden="true" className="text-xs">
            {icon}
          </span>
        )}
        <span className={accent ? '' : 'text-foreground'}>{value}</span>
      </dd>
      {hint && <p className="truncate text-[10px] text-muted-foreground">{hint}</p>}
    </div>
  );
}

export function TrophyHero({
  level,
  levelProgress,
  totalXp,
  currentXp,
  neededForNext,
  nextLevelAt,
  maxed,
  rarityCounts,
  totalBadges,
  stats,
  route,
  filters,
  onFiltersChange,
}: TrophyHeroProps) {
  const percent = Math.round(levelProgress * 100);
  const xpToNext = Math.max(0, neededForNext - currentXp);

  return (
    <section
      aria-labelledby="trophy-hero-heading"
      className="ach-band-gold relative overflow-hidden rounded-3xl border border-[var(--ach-hairline-strong)] p-5 shadow-lg sm:p-7"
    >
      <h2 id="trophy-hero-heading" className="sr-only">
        Trophy level and progress
      </h2>

      {/* The single warm bloom. One light source, on the dominant element only. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -left-24 -top-32 h-72 w-72 rounded-full opacity-60 blur-3xl"
        style={{
          background:
            'radial-gradient(circle, color-mix(in oklab, var(--accent-gold) 34%, transparent), transparent 68%)',
        }}
      />

      <div className="relative flex flex-col gap-7 lg:flex-row lg:items-start">
        <div className="flex items-center gap-5">
          {/* The number lives *inside* the ring: the ring is the frame, the value is
              the content. A ring with the number beside it is two readouts for one
              fact. */}
          <div className="relative flex h-28 w-28 shrink-0 items-center justify-center">
            <AchievementRing
              percent={percent}
              hue="var(--accent-gold)"
              size="lg"
              complete={maxed}
              label={
                maxed
                  ? `Trophy level ${level}, maximum level`
                  : `Trophy level ${level}, ${currentXp} of ${neededForNext} XP to level ${level + 1}`
              }
            />
            <span
              aria-hidden="true"
              className="pointer-events-none absolute flex flex-col items-center"
            >
              <span className="font-display text-4xl font-bold leading-none tabular-nums text-foreground">
                {level}
              </span>
              <span className="mt-1 text-[9px] font-semibold uppercase tracking-widest text-muted-foreground">
                Level
              </span>
            </span>
          </div>

          <div className="min-w-0">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
              Trophy Level
            </p>
            <p className="mt-1 font-display text-3xl font-bold leading-none tabular-nums text-foreground">
              {totalXp.toLocaleString()}
              <span className="ml-1 text-base font-semibold text-muted-foreground">XP</span>
            </p>
            {maxed ? (
              <p className="mt-1.5 text-xs text-muted-foreground">Maximum level reached</p>
            ) : (
              <>
                <p className="mt-1.5 text-xs font-medium tabular-nums text-foreground">
                  {xpToNext} XP to level {level + 1}
                </p>
                {/* "250 XP to go" and "350 XP lifetime" answer different questions
                    and users check both. */}
                <p className="text-[11px] tabular-nums text-muted-foreground">
                  {nextLevelAt.toLocaleString()} XP total
                </p>
              </>
            )}
          </div>
        </div>

        <div className="min-w-0 flex-1 space-y-5">
          {/* AC2. Hidden when there is nothing to suggest, rather than rendering a
              sentence with no sentence after it. */}
          {route && route.steps.length > 0 && (
            <div className="ach-panel-inset rounded-2xl p-4">
              <p className="flex items-start gap-2.5 text-sm leading-relaxed text-foreground">
                <TrendingUp
                  className="mt-0.5 h-4 w-4 shrink-0 text-[var(--accent-gold)]"
                  aria-hidden="true"
                />
                <span>
                  <span className="font-semibold tabular-nums">{route.xpRemaining} XP</span> to
                  level {level + 1}.{' '}
                  <span className="text-muted-foreground">One possible route: </span>
                  {route.steps.map((step, index) => (
                    <span key={step.id}>
                      {index > 0 && <span className="text-muted-foreground"> and </span>}
                      <span className="font-medium">{step.name}</span>{' '}
                      <span
                        className="font-semibold tabular-nums"
                        style={{ color: rarityInk(ACHIEVEMENT_RARITIES[step.rarity].color) }}
                      >
                        +{step.xp}
                      </span>
                    </span>
                  ))}
                  {route.shortfall && (
                    <span className="text-muted-foreground">
                      {' '}
                      — those alone won&apos;t close the gap.
                    </span>
                  )}
                </span>
              </p>
            </div>
          )}

          {/* AC3. Absent rather than zeroed: "first unlock —" teaches nothing, and an
              explanation is more use than a row of dashes. */}
          {stats ? (
            <dl className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
              <Stat
                label="First unlock"
                value={new Date(stats.firstUnlockAt).toLocaleDateString(undefined, {
                  day: 'numeric',
                  month: 'short',
                  year: 'numeric',
                })}
              />
              <Stat
                label="Most recent"
                value={new Date(stats.lastUnlockAt).toLocaleDateString(undefined, {
                  day: 'numeric',
                  month: 'short',
                  year: 'numeric',
                })}
              />
              <Stat
                label="Rarest earned"
                value={stats.rarest.name}
                icon={ACHIEVEMENT_RARITIES[stats.rarest.rarity].icon}
                accent={ACHIEVEMENT_RARITIES[stats.rarest.rarity].color}
              />
              <Stat
                label="Average rarity"
                value={`${stats.averageRarityIndex.toFixed(1)} / 4`}
                hint={rarityNameFor(stats.averageRarityIndex)}
              />
            </dl>
          ) : (
            <p className="text-xs leading-relaxed text-muted-foreground">
              XP comes from the rarity of each badge you unlock — Common is worth{' '}
              {ACHIEVEMENT_XP.COMMON}, Legendary {ACHIEVEMENT_XP.LEGENDARY}.
            </p>
          )}

          {/*
            AC4. The spectrum is the filter, not a legend, so it is a set of buttons
            carrying `aria-pressed`. Colour is never the only signal: every segment
            has its icon, count and name as text.

            The bar is sized by share of the whole catalogue, not of earned badges,
            so an unearned Legendary leaves a visible gap instead of the bar
            rescaling to pretend the tier is empty.
          */}
          <div>
            <div
              className="mb-2.5 flex h-2.5 w-full gap-0.5 overflow-hidden rounded-full bg-[var(--ach-surface-3)]"
              role="img"
              aria-label={RARITY_ORDER.map(
                (r) => `${ACHIEVEMENT_RARITIES[r].label} ${rarityCounts[r] ?? 0}`
              ).join(', ')}
            >
              {RARITY_ORDER.map((rarity) => {
                const count = rarityCounts[rarity] ?? 0;
                if (count === 0) return null;
                return (
                  <span
                    key={rarity}
                    className="h-full first:rounded-l-full last:rounded-r-full"
                    style={{
                      width: `${(count / Math.max(1, totalBadges)) * 100}%`,
                      backgroundColor: ACHIEVEMENT_RARITIES[rarity].color,
                    }}
                  />
                );
              })}
            </div>

            <div className="flex flex-wrap gap-1.5">
              {RARITY_ORDER.map((rarity) => {
                const config = ACHIEVEMENT_RARITIES[rarity];
                const count = rarityCounts[rarity] ?? 0;
                const active = filters.rarity === rarity;
                return (
                  <button
                    key={rarity}
                    type="button"
                    onClick={() =>
                      onFiltersChange({ ...filters, rarity: active ? 'ALL' : rarity })
                    }
                    aria-pressed={active}
                    title={`${count} ${config.label} earned — filter the gallery`}
                    className={cn(
                      'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-semibold',
                      'border transition-[background-color,border-color,transform] duration-150',
                      'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60',
                      'active:scale-95 motion-reduce:transition-none motion-reduce:active:scale-100',
                      active
                        ? 'border-transparent'
                        : 'border-[var(--ach-hairline)] hover:border-[var(--ach-hairline-strong)]'
                    )}
                    style={{
                      // Theme-safe text colour. The raw hue is a mid-tone swatch and
                      // is 1.8:1 on a white card; mixing toward --foreground makes it
                      // dark in light mode and light in dark mode from one declaration.
                      color: rarityInk(config.color),
                      backgroundColor: active
                        ? `color-mix(in oklab, ${config.color} 22%, transparent)`
                        : `color-mix(in oklab, ${config.color} 10%, transparent)`,
                    }}
                  >
                    <span aria-hidden="true">{config.icon}</span>
                    <span className="tabular-nums">{count}</span>
                    <span className="text-foreground/85">{config.label}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* Category breakdown. Only shown once it says something: eight categories with
          zero in most of them is noise, not information. Each chip carries its own
          category accent, so the shelf colours below have an anchor. */}
      {stats && stats.perCategory.length > 1 && (
        <div className="relative mt-6 flex flex-wrap items-center gap-1.5 border-t border-[var(--ach-hairline)] pt-5">
          {stats.perCategory.map((entry) => {
            const config = ACHIEVEMENT_CATEGORIES[entry.category];
            return (
              <span
                key={entry.category}
                className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-medium"
                style={{
                  color: rarityInk(config.color),
                  backgroundColor: `color-mix(in oklab, ${config.color} 13%, transparent)`,
                }}
              >
                <span aria-hidden="true">{config.icon}</span>
                {config.label}
                <span className="font-semibold tabular-nums text-foreground">
                  {entry.earned}
                </span>
              </span>
            );
          })}
        </div>
      )}
    </section>
  );
}

export default TrophyHero;