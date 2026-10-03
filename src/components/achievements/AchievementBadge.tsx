'use client';

/**
 * AchievementBadge — single achievement card.
 *
 * Renders a compact, prop-driven badge for one achievement: its icon, name,
 * description, rarity tier, progress toward the next target and a clear
 * unlocked/locked visual state. Used inside a grid by `AchievementList`.
 *
 * Usage:
 *   <AchievementBadge
 *     achievement={{
 *       id: 'first-goal-completed',
 *       name: 'First Win',
 *       description: 'Complete your first goal',
 *       icon: '🏁',
 *       tier: 'COMMON',
 *       unlocked: true,
 *       progress: { current: 1, target: 1 },
 *     }}
 *   />
 */

import { Award, Lock } from 'lucide-react';
import { ACHIEVEMENT_RARITIES, rarityChipStyle, rarityTint, type AchievementRarity } from '@/lib/constants/achievements';
import { cn, formatDate } from '@/lib/utils';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { ProgressBar } from './ProgressBar';

export interface AchievementCardData {
  id: string;
  name: string;
  description?: string;
  icon?: string;
  color?: string;
  tier: AchievementRarity;
  unlocked: boolean;
  progress?: {
    current: number;
    target: number;
  };
  unlockedAt?: string;
}

export interface AchievementBadgeProps {
  achievement: AchievementCardData;
  className?: string;
}

export function AchievementBadge({ achievement, className }: AchievementBadgeProps) {
  const rarity = ACHIEVEMENT_RARITIES[achievement.tier];
  const accentColor = achievement.color ?? rarity.color;

  return (
    <Card
      className={cn(
        'group flex h-full flex-col p-4 transition-all duration-200',
        achievement.unlocked
          ? 'hover:shadow-md'
          : 'opacity-80 hover:opacity-100',
        className
      )}
      aria-label={`${achievement.name} — ${achievement.unlocked ? 'unlocked' : 'locked'}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div
          className={cn(
            'flex h-12 w-12 shrink-0 items-center justify-center rounded-xl text-2xl',
            achievement.unlocked ? 'ring-2 ring-offset-2' : 'grayscale'
          )}
          style={{
            // A locked tile used to hardcode `#f3f4f6`, a near-white grey, so in
            // dark mode every locked achievement rendered as a bright block
            // against a dark card — the loudest thing on the page, and the exact
            // inverse of what it means. `muted` follows the theme instead.
            backgroundColor: achievement.unlocked
              ? rarityTint(accentColor)
              : 'var(--muted)',
            ...(achievement.unlocked
              ? { boxShadow: `0 0 0 2px ${rarityTint(accentColor)}` }
              : {}),
          }}
        >
          <span aria-hidden="true">{achievement.icon ?? '🎖️'}</span>
        </div>
        <div className="flex flex-col items-end gap-1">
          <Badge
            variant={
              achievement.unlocked ? 'success' : 'default'
            }
            className="text-[10px] uppercase tracking-wide"
          >
            {achievement.unlocked ? 'Unlocked' : 'Locked'}
          </Badge>
          <Badge
            className="text-[10px]"
            style={rarityChipStyle(rarity.color)}
          >
            {rarity.icon} {rarity.label}
          </Badge>
        </div>
      </div>

      <div className="mt-3 flex items-center gap-1.5">
        {achievement.unlocked ? (
          <Award className="h-4 w-4 shrink-0" style={{ color: accentColor }} />
        ) : (
          <Lock className="h-4 w-4 shrink-0 text-muted-foreground" />
        )}
        {/*
          `text-gray-900` / `text-gray-500` were hardcoded Tailwind greys, not
          theme tokens. `gray-900` is near-black, so every achievement name
          rendered near-invisible on the dark card while looking correct on the
          light one — the clearest instance of ERROR.md I3.
        */}
        <h3 className="truncate text-sm font-semibold text-foreground" title={achievement.name}>
          {achievement.name}
        </h3>
      </div>

      {achievement.description && (
        <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
          {achievement.description}
        </p>
      )}

      {achievement.progress && (
        <div className="mt-auto pt-4">
          <ProgressBar
            value={achievement.progress.current}
            max={achievement.progress.target}
            color={achievement.unlocked ? accentColor : undefined}
            label={`${achievement.progress.current} / ${achievement.progress.target}`}
            showPct
          />
        </div>
      )}

      {achievement.unlockedAt && achievement.unlocked && (
        <p className="mt-3 text-[11px] text-muted-foreground">
          {formatDate(new Date(achievement.unlockedAt))}
        </p>
      )}
    </Card>
  );
}

export default AchievementBadge;