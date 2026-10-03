'use client';

/**
 * Streak tier — the one place gold is allowed to appear.
 *
 * A2: "Gold is reserved. It only appears at a genuine peak moment (100% day, top
 * streak tier, a new achievement). That scarcity is what makes it feel earned
 * rather than decorative."
 *
 * So the tiers run grey -> orange -> gold and stop. There is no platinum, no
 * rainbow, no fourth colour, because the moment a badge invents a new colour for
 * a longer streak the tier stops meaning anything.
 *
 * The thresholds are the same milestone ladder `StreakMetric` used
 * (7/14/21/30/60/90/100/180/365), so the number in the badge, the number on
 * `/achievements` and the number in the Momentum arc cannot disagree.
 */

export interface StreakTier {
  label: string;
  /** The CSS custom property — `var(--accent-streak)` or `var(--accent-gold)`. */
  hue: string;
  /** Glow intensity, 0-1. Scales with streak length per B1. */
  glow: number;
  /** True only at the top tier. The single sanctioned gold consumer. */
  gold: boolean;
}

/** Longest streak that still counts as "warming up". Below this, muted grey. */
const GREY_CEILING = 2;
const ORANGE_CEILING = 29;
const TIER_THREE = 30;

export function streakTier(days: number): StreakTier {
  if (days >= TIER_THREE) {
    return { label: 'On fire', hue: 'var(--accent-gold)', glow: 1, gold: true };
  }
  if (days > GREY_CEILING) {
    // Glow scales with the streak so the flame visibly earns intensity rather
    // than sitting at one fixed brightness for a month.
    const span = Math.min(1, (days - GREY_CEILING) / (ORANGE_CEILING - GREY_CEILING));
    return {
      label: 'Building',
      hue: 'var(--accent-streak)',
      glow: 0.35 + span * 0.5,
      gold: false,
    };
  }
  return { label: days > 0 ? 'Just started' : 'No streak', hue: 'var(--muted-foreground)', glow: 0, gold: false };
}

/** Days until the next milestone, and the milestone itself. */
export function nextMilestone(days: number): { target: number; toGo: number } | null {
  const milestones = [7, 14, 21, 30, 60, 90, 100, 180, 365];
  const target = milestones.find((m) => m > days);
  return target === undefined ? null : { target, toGo: target - days };
}

/**
 * The flame glyph, layered.
 *
 * B1: "layered SVG with a soft inner glow, intensity scaling with streak
 * length". Three layers rather than one filled path: an outer bloom that fades
 * with the tier, a body, and a hot inner core. At tier grey the bloom collapses
 * to nothing, so a 1-day streak does not get the same visual weight as a 60-day
 * one — the glow *is* the progress readout.
 */
export function StreakFlame({
  days,
  size = 16,
  className,
}: {
  days: number;
  size?: number;
  className?: string;
}) {
  const tier = streakTier(days);
  const id = `flame-${tier.gold ? 'gold' : tier.glow > 0 ? 'hot' : 'cold'}`;

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      className={className}
      aria-hidden="true"
      style={{ color: tier.hue }}
    >
      <defs>
        <radialGradient id={`${id}-core`} cx="50%" cy="62%" r="50%">
          <stop offset="0%" stopColor="#fff" stopOpacity={0.85} />
          <stop offset="100%" stopColor={tier.hue} stopOpacity={0} />
        </radialGradient>
        <filter id={`${id}-blur`} x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="2.2" />
        </filter>
      </defs>

      {/* Layer 1 — the bloom. Collapses to nothing at the grey tier. */}
      {tier.glow > 0 && (
        <path
          d="M12 2c.6 3.2-1.4 4.6-2.8 6.2C7.6 10 6 11.6 6 14.4A6 6 0 0 0 18 14.4c0-2-.9-3.4-1.8-4.6-.3 1-.9 1.7-1.7 2 .5-2.6-.2-5.6-2.5-9.8Z"
          fill={tier.hue}
          opacity={0.45 * tier.glow}
          filter={`url(#${id}-blur)`}
        />
      )}

      {/* Layer 2 — the body. */}
      <path
        d="M12 2c.6 3.2-1.4 4.6-2.8 6.2C7.6 10 6 11.6 6 14.4A6 6 0 0 0 18 14.4c0-2-.9-3.4-1.8-4.6-.3 1-.9 1.7-1.7 2 .5-2.6-.2-5.6-2.5-9.8Z"
        fill={tier.hue}
      />

      {/* Layer 3 — the hot core, only once there is something to celebrate. */}
      {tier.glow > 0 && (
        <ellipse cx="12" cy="16" rx="2.6" ry="3.4" fill={`url(#${id}-core)`} opacity={0.5 + tier.glow * 0.5} />
      )}
    </svg>
  );
}
