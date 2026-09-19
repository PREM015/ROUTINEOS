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
import { ACHIEVEMENT_RARITIES, type AchievementRarity } from '@/lib/constants/achievements';
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
            backgroundColor: achievement.unlocked ? `${accentColor}1a` : '#f3f4f6',
            ...(achievement.unlocked ? { boxShadow: `0 0 0 2px ${accentColor}` } : {}),
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
            style={{ color: rarity.color }}
          >
            {rarity.icon} {rarity.label}
          </Badge>
        </div>
      </div>

      <div className="mt-3 flex items-center gap-1.5">
        {achievement.unlocked ? (
          <Award className="h-4 w-4 shrink-0" style={{ color: accentColor }} />
        ) : (
          <Lock className="h-4 w-4 shrink-0 text-gray-400" />
        )}
        <h3 className="truncate text-sm font-semibold text-gray-900" title={achievement.name}>
          {achievement.name}
        </h3>
      </div>

      {achievement.description && (
        <p className="mt-1 line-clamp-2 text-xs text-gray-500">
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
        <p className="mt-3 text-[11px] text-gray-400">
          {formatDate(new Date(achievement.unlockedAt))}
        </p>
      )}
    </Card>
  );
}

export default AchievementBadge;