'use client';

/**
 * AchievementPopup — toast-style celebration shown when an achievement unlocks.
 *
 * Renders a fixed bottom-right popup that animates in, auto-hides after a
 * configurable delay and can be dismissed manually. Either feed it the unlock
 * event via the `achievement` prop, or leave the prop empty and it will fetch
 * the user's most recent unlock from GET /api/achievements (avoiding repeats
 * via a localStorage "last seen" marker).
 *
 * Usage:
 *   <AchievementPopup achievement={{ id: 'x', name: 'First Win', icon: '🏁' }} />
 */

import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { PartyPopper, X } from 'lucide-react';
import { apiRequest } from '@/lib/api-client';
import { ACHIEVEMENT_RARITIES, type AchievementRarity } from '@/lib/constants/achievements';
import { Badge } from '@/components/ui/Badge';

export interface AchievementUnlockEvent {
  id: string;
  name: string;
  description?: string;
  icon?: string;
  color?: string;
  tier?: AchievementRarity;
  level?: number;
  unlockedAt?: string;
}

export interface AchievementPopupProps {
  achievement?: AchievementUnlockEvent | null;
  onDismiss?: () => void;
  autoHideMs?: number;
}

const LAST_SEEN_KEY = 'routineos_last_achievement_seen';

interface AchievementRow {
  id: string;
  title: string;
  description: string | null;
  icon: string | null;
  color: string | null;
  level: number;
  unlockedAt: string;
}

function readLastSeen(): string | null {
  try {
    return window.localStorage.getItem(LAST_SEEN_KEY);
  } catch {
    return null;
  }
}

function writeLastSeen(id: string): void {
  try {
    window.localStorage.setItem(LAST_SEEN_KEY, id);
  } catch {
    // Storage may be unavailable (private mode); ignore.
  }
}

function normalizeRow(row: AchievementRow): AchievementUnlockEvent {
  return {
    id: row.id,
    name: row.title,
    description: row.description ?? undefined,
    icon: row.icon ?? undefined,
    color: row.color ?? undefined,
    level: row.level,
    unlockedAt: row.unlockedAt,
  };
}

export function AchievementPopup({
  achievement,
  onDismiss,
  autoHideMs = 7000,
}: AchievementPopupProps) {
  const [queue, setQueue] = useState<AchievementUnlockEvent[]>([]);
  const [fetched, setFetched] = useState(false);
  const hideTimer = useRef<number | null>(null);

  // Push the prop-driven achievement into the queue when it changes (deduped).
  useEffect(() => {
    if (!achievement) return;
    setQueue((current) =>
      current.some((item) => item.id === achievement.id)
        ? current
        : [...current, achievement]
    );
  }, [achievement]);

  // Fallback: fetch the most recent unlock once when no prop is supplied.
  useEffect(() => {
    if (achievement || fetched) return;
    let cancelled = false;

    const load = async () => {
      try {
        const rows = await apiRequest<AchievementRow[]>(
          '/api/achievements',
          { query: { limit: 1 } }
        );
        if (cancelled) return;
        const latest = rows[0];
        setFetched(true);
        if (!latest) return;
        if (readLastSeen() === latest.id) return;
        setQueue([normalizeRow(latest)]);
      } catch {
        if (!cancelled) setFetched(true);
      }
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, [achievement, fetched]);

  const current = queue[0];

  const dismiss = () => {
    setQueue(([first, ...rest]) => {
      if (first) writeLastSeen(first.id);
      return rest;
    });
    onDismiss?.();
  };

  // Auto-hide the active popup after `autoHideMs`.
  useEffect(() => {
    if (!current) return;
    hideTimer.current = window.setTimeout(dismiss, autoHideMs);
    return () => {
      if (hideTimer.current !== null) window.clearTimeout(hideTimer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current?.id, autoHideMs]);

  const tierConfig = current?.tier ? ACHIEVEMENT_RARITIES[current.tier] : null;
  const accentColor = current?.color ?? tierConfig?.color ?? '#8b5cf6';

  return (
    <div className="pointer-events-none fixed bottom-4 right-4 z-50">
      <AnimatePresence>
        {current && (
          <motion.div
            key={current.id}
            initial={{ opacity: 0, y: 24, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 16, scale: 0.95 }}
            transition={{ type: 'spring', stiffness: 260, damping: 22 }}
            className="pointer-events-auto w-80 overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-xl"
            role="status"
            aria-live="polite"
          >
            <div className="flex items-start gap-3 p-4">
              <div
                className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl text-2xl"
                style={{ backgroundColor: `${accentColor}1a` }}
                aria-hidden="true"
              >
                {current.icon ?? '🎉'}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <PartyPopper className="h-3.5 w-3.5" style={{ color: accentColor }} />
                  <p className="text-[11px] font-semibold uppercase tracking-wide" style={{ color: accentColor }}>
                    Achievement unlocked
                  </p>
                </div>
                <h3 className="mt-1 truncate text-sm font-bold text-gray-900" title={current.name}>
                  {current.name}
                </h3>
                {current.description && (
                  <p className="mt-0.5 line-clamp-2 text-xs text-gray-500">{current.description}</p>
                )}
                <div className="mt-2 flex items-center gap-1.5">
                  {tierConfig && (
                    <Badge className="text-[10px]">
                      {tierConfig.icon} {tierConfig.label}
                    </Badge>
                  )}
                  {typeof current.level === 'number' && current.level > 1 && (
                    <Badge className="text-[10px]">Level {current.level}</Badge>
                  )}
                </div>
              </div>
              <button
                type="button"
                onClick={dismiss}
                aria-label="Dismiss"
                className="shrink-0 rounded-md p-1 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="h-1 w-full bg-gray-100">
              <motion.div
                className="h-full"
                style={{ backgroundColor: accentColor }}
                initial={{ width: '100%' }}
                animate={{ width: '0%' }}
                transition={{ duration: autoHideMs / 1000, ease: 'linear' }}
              />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default AchievementPopup;