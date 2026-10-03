'use client';

/**
 * The streak badge in the global header.
 *
 * ## What it replaces
 *
 * A flame icon and the words "Active Streak" inside a link to `/achievements`,
 * present on every page. It never read a streak. It claimed one unconditionally,
 * including for a user whose streak was 0 and who had never logged anything -
 * which is the specific failure mode of putting an unconditional badge in shared
 * code. It is now a real number, read from `GET /api/streak`.
 *
 * ## Why gold is allowed here
 *
 * B7: "the streak flame badge in the global header gets the tiered glow from
 * A2/A5's gold rule — this is a two-pixel detail that pays off disproportionately
 * because it's visible on every page, all the time."
 *
 * That last clause is the whole argument for doing it here rather than only on
 * the dashboard. The tier resolver is shared with the Momentum panel's arc, so
 * the two cannot drift: a 30-day streak is the same gold in both places.
 *
 * ## Degradation
 *
 * No skeleton, no spinner, no error state. A failed fetch renders nothing rather
 * than an empty pill - the header must never be the thing that looks broken, and
 * this badge is decoration-adjacent, not information the page depends on.
 */

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { apiRequest } from '@/lib/api-client';
import { StreakFlame, streakTier } from '@/components/streak/StreakFlame';
import { accentTint } from '@/components/dashboard-ui/accent';

interface StreakPayload {
  currentStreak: number;
  longestStreak: number;
}

export function StreakBadge() {
  const [streak, setStreak] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const data = await apiRequest<StreakPayload>('/api/streak');
        if (!cancelled) setStreak(data.currentStreak);
      } catch {
        // Deliberately silent: see the note above. A missing badge is far less
        // disruptive than a broken-looking header.
        if (!cancelled) setStreak(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (streak === null) return null;

  const tier = streakTier(streak);

  return (
    <Link
      href="/achievements"
      aria-label={`${streak} day streak. ${tier.label}. View achievements`}
      title={`${streak} day streak · ${tier.label}`}
      className="flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold transition-colors"
      style={{
        background: accentTint(tier.hue, tier.glow > 0 ? 14 : 8),
        color: tier.hue,
        // The tiered glow. At the gold tier it is a genuine peak moment (A2); at
        // grey there is no glow at all, so a 1-day streak does not get the same
        // visual weight as a 60-day one.
        boxShadow: tier.glow > 0 ? `0 0 14px -4px ${accentTint(tier.hue, 60)}` : undefined,
      }}
    >
      <StreakFlame days={streak} size={14} />
      <span className="tabular-nums">{streak}</span>
      <span className="hidden sm:inline">{streak === 1 ? 'day' : 'days'}</span>
    </Link>
  );
}
