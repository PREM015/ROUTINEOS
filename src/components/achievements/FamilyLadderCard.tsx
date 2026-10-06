'use client';

/**
 * FamilyLadderCard — a tiered family as one climbable card.
 *
 * ## What this is for
 *
 * The habit-streak badges are five catalogue entries a user cannot relate to each
 * other: "First Streak", "One Week Strong", "Month of Mastery", "Century Streak",
 * "Iron Habit" read as five unrelated tiles. They are one ladder. Showing them as
 * one card with the current rung lit and the next rung showing progress is the
 * difference between a gallery and a progression.
 *
 * ## It changes nothing about earning
 *
 * Each rung is still its own definition with its own XP, and `tile.xp` is read
 * from the same resolver as everywhere else. Folding five badges into one card is
 * presentation: the ladder's total is the sum of its rungs' XP, identical to the
 * flat grid's, and no rung's earned state is derived from another. The
 * `familyLadders` tests assert the XP equality directly.
 *
 * ## Missing rungs stay visible
 *
 * A rung whose badge is not in `tiles` renders greyed with no XP value rather than
 * being dropped. Dropping it would make the ladder look complete when it is not,
 * and `xp: null` (not `0`) is what distinguishes "not in the catalogue" from
 * "worth nothing".
 */

import { Check, Lock } from 'lucide-react';
import { ACHIEVEMENT_RARITIES } from '@/lib/constants/achievements';
import type { FamilyLadder } from '@/lib/achievements/derived';
import type { AchievementTile } from '@/lib/achievements/view-model';
import { cn } from '@/lib/utils';

export interface FamilyLadderCardProps {
  ladder: FamilyLadder;
  /** Tiles by id, so a rung can open the badge page. */
  tilesById: ReadonlyMap<string, AchievementTile>;
  onSelect?: (tile: AchievementTile) => void;
}

export function FamilyLadderCard({ ladder, tilesById, onSelect }: FamilyLadderCardProps) {
  const { family, steps, earnedCount, nextStep } = ladder;

  return (
    <section
      aria-label={`${family.label} ladder`}
      className="ach-panel rounded-2xl p-4"
    >
      <div className="flex items-baseline justify-between gap-3">
        <div className="min-w-0">
          <h3 className="truncate text-sm font-semibold text-foreground">{family.label}</h3>
          <p className="truncate text-[11px] text-muted-foreground">{family.description}</p>
        </div>
        <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
          {earnedCount} / {steps.length}
        </span>
      </div>

      {/*
        The progress line is proportional to rungs, not to XP: the rungs are not
        evenly spaced in cost (7 days then 30 then 100 then 365), so a bar weighted
        by XP would misrepresent the shape of the climb.
      */}
      <div
        className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-[var(--ach-surface-3)]"
        role="progressbar"
        aria-label={`${family.label} progress`}
        aria-valuenow={earnedCount}
        aria-valuemin={0}
        aria-valuemax={steps.length}
      >
        <div
          className="h-full rounded-full bg-[var(--accent-gold)] transition-[width] duration-500 ease-out motion-reduce:transition-none"
          style={{ width: `${(earnedCount / Math.max(1, steps.length)) * 100}%` }}
        />
      </div>

      <ol className="mt-3 flex flex-col gap-1">
        {steps.map((step) => {
          const tile = tilesById.get(step.id);
          const rarity = ACHIEVEMENT_RARITIES[step.rarity];
          const isNext = nextStep?.id === step.id;
          const missing = step.xp === null;

          const body = (
            <>
              <span
                aria-hidden="true"
                className={cn(
                  'flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs',
                  step.earned
                    ? 'bg-[color-mix(in_oklab,var(--accent-gold)_20%,transparent)]'
                    : isNext
                      ? 'bg-muted'
                      : 'bg-muted/50'
                )}
              >
                {step.earned ? (
                  <Check className="h-3.5 w-3.5 text-[var(--accent-gold)]" />
                ) : missing ? (
                  <Lock className="h-3 w-3 text-muted-foreground/60" />
                ) : (
                  <span className={cn('text-sm', isNext ? '' : 'opacity-55 grayscale')}>
                    {step.icon}
                  </span>
                )}
              </span>

              <span className="min-w-0 flex-1">
                <span
                  className={cn(
                    'block truncate text-xs font-medium',
                    step.earned ? 'text-foreground' : 'text-muted-foreground'
                  )}
                >
                  {step.name}
                </span>
                {isNext && tile?.percent !== null && tile?.percent !== undefined && (
                  <span className="block text-[11px] tabular-nums text-muted-foreground">
                    {tile.current}/{tile.target}
                  </span>
                )}
              </span>

              <span className="shrink-0 text-[10px] font-semibold" style={{ color: rarity.color }}>
                {step.earned ? 'Earned' : missing ? '—' : `${step.xp} XP`}
              </span>
            </>
          );

          return (
            <li key={step.id}>
              {tile ? (
                <button
                  type="button"
                  onClick={() => onSelect?.(tile)}
                  aria-current={isNext ? 'step' : undefined}
                  className={cn(
                    'flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left transition-colors',
                    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60 motion-reduce:transition-none',
                    isNext ? 'bg-muted/60 hover:bg-muted' : 'hover:bg-muted/40'
                  )}
                >
                  {body}
                </button>
              ) : (
                <div
                  aria-disabled="true"
                  className="flex items-center gap-2 px-2 py-1.5 opacity-60"
                >
                  {body}
                </div>
              )}
            </li>
          );
        })}
      </ol>
    </section>
  );
}