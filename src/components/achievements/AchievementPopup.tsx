'use client';

/**
 * AchievementPopup — toast-style celebration shown when an achievement unlocks.
 *
 * Renders a fixed popup that animates in, auto-hides after a configurable delay and
 * can be dismissed manually. Either feed it the unlock event via the `achievement`
 * prop, or leave the prop empty and it will fetch the user's most recent unlock
 * from GET /api/achievements (avoiding repeats via a localStorage "last seen"
 * marker).
 *
 * ## Why bottom-LEFT, not bottom-right
 *
 * This panel was `fixed bottom-4 right-4`, which put it on top of two other fixed
 * elements:
 *
 * | Element | Offset | Overlap |
 * | ------ | ------ | ------- |
 * | `MobileNav` | `bottom-0`, `h-[4rem + safe-area]`, full width, `z-50` | the toast sat **inside** the nav bar on phones |
 * | `FloatingFocusBar` | `bottom-20 right-3`, `md:bottom-6` | same corner on desktop |
 *
 * `SleepPromptHost` (`bottom-36`/`md:bottom-24`) and `QuickActions` (`bottom-24`)
 * are in that corner too. Four occupants in one quadrant, and none of them may be
 * moved - they belong to other features and other pages.
 *
 * So the toast moves instead. Every one of those occupants is right-anchored, which
 * leaves the **left** column free; on mobile the toast sits directly above the nav
 * rather than inside it. The only element still sharing the column is
 * `CookieConsent`, which is `inset-x-0 bottom-0` at `z-[60]` and therefore paints
 * above the toast at `z-50` - unchanged behaviour, and correct: a consent banner
 * outranks a celebration.
 *
 * Usage:
 *   <AchievementPopup achievement={{ id: 'x', name: 'First Win', icon: '🏁' }} />
 */

import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { PartyPopper, X } from 'lucide-react';
import { apiRequest } from '@/lib/api-client';
import { cn } from '@/lib/utils';
import { markAchievementCelebrated } from '@/store/achievement.store';
import { celebrationTreatment } from '@/lib/achievements/celebration';
import { useAnimationsEnabled } from '@/hooks/useAnimationsEnabled';
import { ACHIEVEMENT_RARITIES, rarityChipStyle, rarityTint, type AchievementRarity } from '@/lib/constants/achievements';
import { Badge } from '@/components/ui/Badge';

/**
 * Where the toast sits, and why it is not simply `bottom-4 right-4`.
 *
 * Above the mobile nav (4rem plus the safe area) on phones, and in the free
 * bottom-left column on desktop. See the module note for the overlap table.
 */
const TOAST_POSITION =
  'pointer-events-none fixed left-4 z-50 bottom-[calc(4rem+env(safe-area-inset-bottom)+0.75rem)] md:bottom-6 md:left-6';

export interface AchievementUnlockEvent {
  id: string;
  /**
   * The `Achievement` row id, used by the celebrate call on dismiss.
   *
   * `id` is the catalogue definition id. Without this the dismiss had nothing to
   * send: the celebrate endpoint updates by row id.
   */
  recordId?: string | null;
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

/**
 * How many times to retry the "latest unlock" lookup after a failure before
 * giving up for the session. A single transient error should not permanently
 * silence celebrations, but a hard outage should not retry forever.
 */
const MAX_FETCH_ATTEMPTS = 2;

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
  autoHideMs,
}: AchievementPopupProps) {
  const [queue, setQueue] = useState<AchievementUnlockEvent[]>([]);
  const [fetched, setFetched] = useState(false);
  /** Failed-fetch attempt counter, driving the bounded retry below. */
  const [attempts, setAttempts] = useState(0);
  const hideTimer = useRef<number | null>(null);
  const retryTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

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
        if (cancelled) return;
        // The old handler called `setFetched(true)` here, which permanently
        // disabled the celebration check for the rest of the session: one
        // transient 500 on page load and the user never saw an unlock toast
        // again, with no way to recover short of a reload.
        //
        // Nothing false is rendered on failure, so there is nothing to report —
        // but it must retry. Bounded, so a persistent outage does not spin.
        if (attempts >= MAX_FETCH_ATTEMPTS) {
          setFetched(true);
        } else {
          retryTimer.current = setTimeout(
            () => setAttempts((n) => n + 1),
            2000 * (attempts + 1)
          );
        }
      }
    };

    void load();
    return () => {
      cancelled = true;
      if (retryTimer.current) clearTimeout(retryTimer.current);
    };
  }, [achievement, fetched, attempts]);

  const current = queue[0];

/**
 * Dismiss the front popup: advance the queue, remember it, and mark it seen.
 *
 * AC18: `Achievement.celebrated` was a real column with **no callers** — nothing
 * wrote it, so the "New" state could never clear and `celebrated: false` was
 * permanent. Dismissing the toast is the moment the user has demonstrably seen the
 * badge, which is exactly what the flag is meant to record. The write is
 * fire-and-forget: a stale dot on the next load is better than a dismissal that
 * waits on a network call.
 */
const dismiss = () => {
  setQueue((current) => {
    const [first, ...rest] = current;
    if (first) {
      writeLastSeen(first.id);
      void markAchievementCelebrated(first.recordId);
    }
    return rest;
  });
  onDismiss?.();
};

  const tierConfig = current?.tier ? ACHIEVEMENT_RARITIES[current.tier] : null;
  const accentColor = current?.color ?? tierConfig?.color ?? '#8b5cf6';

  /*
    Rarity decides the treatment, and the policy lives in
    `lib/achievements/celebration.ts` rather than here, so the escalation is a
    tested ordering rather than a set of conditionals in a component. A component
    that decided for itself is exactly how every unlock ended up looking identical.

    `animationsEnabled` is the project's two-signal gate (OS `prefers-reduced-motion`
    AND the in-app setting). Under it the burst is dropped and the toast simply
    stays longer - a Legendary still earns more of the user's attention, just not
    movement. The glow is a border and a halo rather than an animation, so it
    survives reduced motion for free.
  */
  const treatment = celebrationTreatment(current?.tier);
  const motionAllowed = useAnimationsEnabled();
  const glow = treatment.intensity === 'glow' || treatment.intensity === 'strong';
  const showBurst = treatment.burst && motionAllowed;

  /**
   * How long this toast stays.
   *
   * The caller's `autoHideMs` wins when supplied; otherwise the rarity decides, so
   * a Legendary is on screen for twice as long as a Common without any component
   * having to know that.
   */
  const hideMs = autoHideMs ?? treatment.autoHideMs;

  // Auto-hide the active popup. Re-armed per toast, so a queued second unlock gets
  // its own full duration rather than inheriting the first one's remaining time.
  useEffect(() => {
    if (!current) return;
    hideTimer.current = window.setTimeout(dismiss, hideMs);
    return () => {
      if (hideTimer.current !== null) window.clearTimeout(hideTimer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current?.id, hideMs]);

  return (
    <div className={TOAST_POSITION}>
      <AnimatePresence>
        {current && (
          <motion.div
            key={current.id}
            initial={{ opacity: 0, y: 24, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 16, scale: 0.95 }}
            transition={{ type: 'spring', stiffness: 260, damping: 22 }}
            // ERROR.md I3. This panel was hardcoded light: `bg-white`,
            // `border-gray-200`, `text-900`, `text-gray-500`, `bg-gray-100`
            // track. None of those invert, so on a dark theme the achievement
            // popup — the one moment the app deliberately interrupts the user —
            // flashed a white card with near-black text and was the brightest
            // object on screen. Tokens only, so it follows the theme.
            className={cn(
              'pointer-events-auto relative w-[calc(100vw-2rem)] max-w-80 overflow-hidden rounded-2xl border border-border bg-card text-card-foreground shadow-xl',
              // Proportional emphasis. A glow is a border and a halo in the badge's
              // own colour - no extra motion, so it survives reduced motion for free
              // and still communicates "this one was bigger".
              glow &&
                treatment.intensity === 'strong' &&
                'border-[color-mix(in_oklab,var(--accent-gold)_55%,transparent)] shadow-2xl'
            )}
            style={
              glow
                ? {
                    boxShadow: `0 0 0 1px color-mix(in oklab, ${accentColor} 45%, transparent), 0 18px 40px -18px color-mix(in oklab, ${accentColor} 65%, transparent)`,
                  }
                : undefined
            }
            role="status"
            aria-live="polite"
          >
            {/*
              The Legendary burst: one short ring, once, on entry only. Keyed to the
              toast so it cannot replay, and gated on motionAllowed so reduced-motion
              users get the message without the movement.
            */}
            {showBurst && (
              <motion.span
                aria-hidden="true"
                className="pointer-events-none absolute inset-0 rounded-2xl"
                initial={{ opacity: 0.55, scale: 0.97 }}
                animate={{ opacity: 0, scale: 1.06 }}
                transition={{ duration: 1.2, ease: 'easeOut' }}
                style={{ boxShadow: `0 0 0 2px ${accentColor}` }}
              />
            )}
            <div className="flex items-start gap-3 p-4">
              <div
                className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl text-2xl"
                style={{ backgroundColor: rarityTint(accentColor) }}
                aria-hidden="true"
              >
                {current.icon ?? '🎉'}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <PartyPopper
                    className="h-3.5 w-3.5"
                    style={{ color: `color-mix(in oklab, ${accentColor} 75%, var(--foreground))` }}
                  />
                  {/*
                    The label is *text*, so it gets the mixed colour rather than
                    the raw accent: `#f59e0b` on a light card is 2.2:1, while
                    the mixed value darkens with the theme and stays legible.
                  */}
                  <p
                    className="text-[11px] font-semibold uppercase tracking-wide"
                    style={{ color: `color-mix(in oklab, ${accentColor} 72%, var(--foreground))` }}
                  >
                    Achievement unlocked
                  </p>
                </div>
                <h3 className="mt-1 truncate text-sm font-bold text-foreground" title={current.name}>
                  {current.name}
                </h3>
                {current.description && (
                  <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{current.description}</p>
                )}
                <div className="mt-2 flex items-center gap-1.5">
                  {tierConfig && (
                    <Badge className="text-[10px]" style={rarityChipStyle(tierConfig.color)}>
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
                className="shrink-0 rounded-md p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="h-1 w-full bg-muted">
              <motion.div
                className="h-full"
                style={{ backgroundColor: accentColor }}
                initial={{ width: '100%' }}
                animate={{ width: '0%' }}
                transition={{ duration: hideMs / 1000, ease: 'linear' }}
              />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default AchievementPopup;