'use client';

/**
 * AchievementDetailDrawer — the answer to "what exactly do I have to do?".
 *
 * ## Why it exists
 *
 * A locked tile that says "Keep a habit for seven days in a row" with a 42% bar
 * still leaves the user guessing which habit, where to go, and whether the
 * number they are watching is the thing that matters. This panel answers all
 * three, and it gives `/achievements/${id}` - the target the notification and
 * email deep links already point at - an actual destination.
 *
 * It is built on the shared `Drawer` primitive (Radix Dialog), so focus is
 * trapped, Escape closes it, and focus returns to the tile that opened it. Those
 * are not re-implemented here.
 *
 * `side` is a viewport decision, not a preference: a right-hand drawer on a phone
 * covers the whole screen with a panel that has a desktop shape, so it becomes a
 * bottom sheet under `sm`.
 */

import { useSyncExternalStore } from 'react';
import Link from 'next/link';
import { ArrowRight, Lock, Sparkles } from 'lucide-react';
import {
  ACHIEVEMENT_CATEGORIES,
  ACHIEVEMENT_RARITIES,
  type AchievementCategory,
} from '@/lib/constants/achievements';
import type { AchievementTile } from '@/lib/achievements/view-model';
import { Drawer } from '@/components/ui/Drawer';
import { AchievementRing } from './AchievementRing';
import { ProgressBar } from './ProgressBar';

/**
 * Where the action for each category actually lives.
 *
 * Every href here is a real route - `/sleep` does not exist in this app, sleep
 * data is under `/wellness` - because a "Go to…" button that 404s is worse than
 * no button at all.
 */
const CATEGORY_ACTION: Record<AchievementCategory, { href: string; label: string }> = {
  HABITS: { href: '/habits', label: 'Go to Habits' },
  GOALS: { href: '/goals', label: 'Go to Goals' },
  CONSISTENCY: { href: '/today', label: 'Go to Today' },
  LIFESTYLE: { href: '/wellness', label: 'Go to Wellness' },
  MASTERY: { href: '/focus', label: 'Go to Focus' },
  MILESTONES: { href: '/dashboard', label: 'Go to Dashboard' },
  CUSTOM: { href: '/today', label: 'Go to Today' },
};

/**
 * A phone gets a bottom sheet.
 *
 * `useSyncExternalStore` rather than `useState` + `useEffect`: a media query is an
 * external store, and this hook is the primitive built for subscribing to one. It
 * also gives a real server snapshot, so the panel renders the `right` variant
 * during SSR and corrects after hydration without a mismatch - which a
 * `useEffect` version cannot do, because its first paint is unconditionally
 * `false`.
 */
const PHONE_QUERY = '(max-width: 639px)';

function subscribeToPhoneLayout(onChange: () => void): () => void {
  if (typeof window === 'undefined' || !window.matchMedia) return () => {};
  const query = window.matchMedia(PHONE_QUERY);
  query.addEventListener('change', onChange);
  return () => query.removeEventListener('change', onChange);
}

function isPhoneLayout(): boolean {
  if (typeof window === 'undefined' || !window.matchMedia) return false;
  return window.matchMedia(PHONE_QUERY).matches;
}

/** Server render: assume room for the side drawer. It is the wider-safe default. */
function serverLayout(): boolean {
  return false;
}

export interface AchievementDetailDrawerProps {
  tile: AchievementTile | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function AchievementDetailDrawer({
  tile,
  open,
  onOpenChange,
}: AchievementDetailDrawerProps) {
  const isPhone = useSyncExternalStore(subscribeToPhoneLayout, isPhoneLayout, serverLayout);

  if (!tile) {
    return <Drawer open={false} onOpenChange={onOpenChange} side="right">{null}</Drawer>;
  }

  const rarity = ACHIEVEMENT_RARITIES[tile.rarity];
  const category = ACHIEVEMENT_CATEGORIES[tile.category];
  const accent = tile.color || rarity.color;
  const action = CATEGORY_ACTION[tile.category];
  const measurable = tile.percent !== null && tile.target !== null && tile.target > 0;

  return (
    <Drawer
      open={open}
      onOpenChange={onOpenChange}
      side={isPhone ? 'bottom' : 'right'}
      title={tile.name}
      description={`${rarity.icon} ${rarity.label} · ${category.icon} ${category.label}`}
      // Puts the shared primitive's `bg-card` onto the page's own surface ramp. See
      // `.fixed.ach-drawer-surface` in globals.css - the primitive is shared and
      // must not be edited.
      className="ach-drawer-surface sm:max-w-md"
    >
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <div className="relative flex h-16 w-16 shrink-0 items-center justify-center">
            <AchievementRing
              percent={tile.unlocked ? 100 : tile.percent}
              hue={tile.unlocked ? 'var(--accent-gold)' : accent}
              size="md"
              complete={tile.unlocked}
              label={
                tile.unlocked
                  ? `${tile.name}, unlocked`
                  : measurable
                    ? `${tile.name}, ${tile.current} of ${tile.target}`
                    : `${tile.name}, progress not tracked`
              }
            />
            <span
              aria-hidden="true"
              className={`pointer-events-none absolute flex h-8 w-8 items-center justify-center rounded-full text-lg ${
                tile.unlocked ? 'shimmer-holographic overflow-hidden' : 'opacity-55 grayscale'
              }`}
            >
              {tile.icon}
            </span>
          </div>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-foreground">
              {tile.unlocked ? (
                <span className="inline-flex items-center gap-1.5 text-[var(--accent-gold)]">
                  <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
                  Unlocked
                </span>
              ) : measurable ? (
                `${tile.current} of ${tile.target}`
              ) : (
                <span className="inline-flex items-center gap-1.5 text-muted-foreground">
                  <Lock className="h-3.5 w-3.5" aria-hidden="true" />
                  Locked
                </span>
              )}
            </p>
            <p className="mt-0.5 text-xs tabular-nums text-muted-foreground">
              Worth {tile.xp} XP
              {tile.unlocked && tile.unlockedAt
                ? ` · ${new Date(tile.unlockedAt).toLocaleDateString(undefined, {
                    day: 'numeric',
                    month: 'short',
                    year: 'numeric',
                  })}`
                : ''}
            </p>
          </div>
        </div>

        <section>
          <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            How to earn it
          </h3>
          <p className="mt-1.5 text-sm leading-relaxed text-foreground">{tile.description}</p>
        </section>

        <section>
          <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Progress
          </h3>
          <div className="mt-2">
            {measurable ? (
              <ProgressBar
                value={tile.current ?? 0}
                max={tile.target ?? 1}
                color={accent}
                label={`${tile.current} of ${tile.target}`}
                showPct
                ariaLabel={`${tile.name} progress`}
              />
            ) : (
              /*
                Said out loud rather than shown as an empty bar. The service sends
                `current: null` when it cannot measure the criterion, and an empty
                track here would read as "0% done" - a claim, not a measurement.
              */
              <p className="text-sm text-muted-foreground">
                Progress toward this one isn&apos;t tracked yet, so there&apos;s nothing to show here.
                It still unlocks automatically when you meet the condition.
              </p>
            )}
          </div>
        </section>

        {!tile.unlocked && (
          <Link
            href={action.href}
            className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-background px-3 py-2 text-xs font-medium text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60 motion-reduce:transition-none"
          >
            {action.label}
            <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
          </Link>
        )}
      </div>
    </Drawer>
  );
}

export default AchievementDetailDrawer;