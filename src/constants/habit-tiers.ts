/**
 * Habit Tiers Configuration
 *
 * Defines the three-tier habit system used throughout RoutineOS:
 *   - Non-Negotiable: Core habits that MUST be done every eligible day
 *   - Growth: Important habits that contribute to personal development
 *   - Bonus: Optional extras that add extra points when completed
 */

export interface HabitTierConfig {
  id: "NON_NEGOTIABLE" | "GROWTH" | "BONUS";
  name: string;
  shortName: string;
  description: string;
  icon: string;
  color: string;
  bgColor: string;
  borderColor: string;
  /** Scoring weight applied to this tier (0–1) */
  defaultWeight: number;
  /** Score required in this tier to maintain streak */
  streakThreshold: number;
  /** Order in the UI (lower = first) */
  sortOrder: number;
  /** Maximum % this tier can contribute to overall score (0–100) */
  maxContribution: number;
}

export const HABIT_TIERS: Record<
  "NON_NEGOTIABLE" | "GROWTH" | "BONUS",
  HabitTierConfig
> = {
  NON_NEGOTIABLE: {
    id: "NON_NEGOTIABLE",
    name: "Non-Negotiable",
    shortName: "Core",
    description:
      "Foundational habits that must be completed every eligible day. Missing these directly impacts your streak.",
    icon: "🔑",
    color: "#ef4444",
    bgColor: "#fef2f2",
    borderColor: "#fca5a5",
    defaultWeight: 1.0,
    streakThreshold: 1.0, // must complete ALL non-negotiables
    sortOrder: 1,
    maxContribution: 70,
  },
  GROWTH: {
    id: "GROWTH",
    name: "Growth",
    shortName: "Growth",
    description:
      "Important habits that drive personal development. Missing some is acceptable but aim for consistency.",
    icon: "🌱",
    color: "#22c55e",
    bgColor: "#f0fdf4",
    borderColor: "#86efac",
    defaultWeight: 0.5,
    streakThreshold: 0.6, // must complete ≥60% of growth habits
    sortOrder: 2,
    maxContribution: 20,
  },
  BONUS: {
    id: "BONUS",
    name: "Bonus",
    shortName: "Bonus",
    description:
      "Optional extras that reward you for going above and beyond. Every bonus habit adds to your score.",
    icon: "⭐",
    color: "#f59e0b",
    bgColor: "#fffbeb",
    borderColor: "#fcd34d",
    defaultWeight: 0.25,
    streakThreshold: 0, // bonus habits don't affect streaks
    sortOrder: 3,
    maxContribution: 10,
  },
};

export const HABIT_TIER_LIST = Object.values(HABIT_TIERS);

/** Ordered tier IDs for display */
export const TIER_ORDER: Array<"NON_NEGOTIABLE" | "GROWTH" | "BONUS"> = [
  "NON_NEGOTIABLE",
  "GROWTH",
  "BONUS",
];

export function getTierConfig(
  tier: "NON_NEGOTIABLE" | "GROWTH" | "BONUS"
): HabitTierConfig {
  return HABIT_TIERS[tier];
}

/** Returns true if a habit in this tier is required for streak maintenance */
export function isTierStreakCritical(
  tier: "NON_NEGOTIABLE" | "GROWTH" | "BONUS"
): boolean {
  return HABIT_TIERS[tier].streakThreshold > 0;
}

/** Minimum Day rules: which tiers are required on a Minimum Day */
export const MINIMUM_DAY_REQUIRED_TIERS: Array<
  "NON_NEGOTIABLE" | "GROWTH" | "BONUS"
> = ["NON_NEGOTIABLE"];
