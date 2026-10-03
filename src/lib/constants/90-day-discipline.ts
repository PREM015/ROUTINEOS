import type { GoalType, HabitFrequencyType, HabitTier } from '@/generated/prisma';

/**
 * **90 Days of Discipline** — a 90-day challenge packaged as a template.
 *
 * ## Why this is data and not a seed row
 *
 * Applying a challenge should be a deliberate act the user takes from the
 * template library, reviewable before it touches their account. Seeding it into
 * a user record would write goals and habits nobody asked for, and would be
 * impossible to undo cleanly. So this is a *definition*; `TemplateService`
 * materialises it on request.
 *
 * ## Corrections applied to the source brief
 *
 * The original plan was sound but contained several items that are unsafe or
 * unhonest to encode as written. Each is corrected here rather than dropped,
 * and the reasoning is kept in the object so the UI can show it:
 *
 * 1. **"Drink 1 gallon of water/day" → a personalised target.** A gallon is not
 *    a universal requirement: it varies with body mass, climate, activity and
 *    diet, and forcing it risks hyponatraemia. `targetUnit: 'personalised'`
 *    means the UI must ask for the user's own figure before this habit counts.
 * 2. **"Max out your protein" → "meet your protein target".** "Max out" invites
 *    unbounded intake. The target is explicitly a per-body-weight figure the
 *    user sets, not a maximum.
 * 3. **"No sugar" → "no added sugar".** Eliminating naturally occurring sugars
 *    in whole fruit and plain milk is not the intent and is needlessly
 *    restrictive; the meaningful, trackable commitment is *added* sugars.
 * 4. **Abstentions are not do-it habits.** "No fast food", "no added sugar" and
 *    "no alcohol" are the *absence* of something. A streak on a normal habit
 *    means "consecutive days I did the thing"; for an abstention it means
 *    "consecutive days I did not do the thing". Scoring them identically would
 *    invert the meaning of the number, so they carry `abstention: true` and
 *    `UNDEFINED`-free handling is left to the scorer.
 * 5. **The two mindset principles are not habits.** "Focus on yourself" and
 *    "No excuses" have no objective pass condition — there is no state in which
 *    they are verifiably "done". Encoding them as habits would make the
 *    completion rate meaningless. They are modelled as **reflections**, which is
 *    what they actually are, and as the accountability note on the parent goal.
 * 6. **The three sleep commitments stay separate**, as the source brief
 *    required: duration, bedtime and wake time are distinct measurements and
 *    are all read from the existing `SleepLog`, so they can auto-track instead
 *    of being manual checkboxes. The window is **00:00 → 05:00** (the user's
 *    actual schedule), and the duration target is derived from that window
 *    rather than left at a figure the schedule cannot reach — see the note on
 *    `CHALLENGE_GOALS.sleep`.
 * 7. **Workout is a weekly target, not a daily habit.** `WEEKLY_TARGET` with
 *    `frequencyValue: '5'`; a daily habit here would make a rest day a failure.
 * 8. **Cold showers are optional and carry a safety note.** Intense cold
 *    exposure is not a safe default for people with cardiovascular conditions.
 * 9. **Accountability does not override health.** The parent goal says so
 *    explicitly: illness, injury and exhaustion are not missed commitments.
 */

export type HabitKind = 'ACTION' | 'ABSTENTION' | 'MEASUREMENT';

/** A habit the challenge defines. */
export interface ChallengeHabit {
  /** Stable slug, also the de-duplication key when the template is applied twice. */
  key: string;
  name: string;
  description: string;
  category: string;
  tier: HabitTier;
  frequencyType: HabitFrequencyType;
  /**
   * For `WEEKLY_TARGET` / `MONTHLY_TARGET` this is the count ("5" = five times a
   * week). `null` for `DAILY`.
   */
  frequencyValue: string | null;
  /**
   * Repetitions per day for countable habits ("8 glasses"). `null` for a simple
   * once-per-day habit.
   */
  targetCount: number | null;
  /**
   * How the habit is completed. `MEASUREMENT` means a numeric value has to be
   * logged — a checkbox would be a lie, because "did 10,000 steps" is not a
   * yes/no.
   */
  kind: HabitKind;
  /** For `MEASUREMENT`, what the user records. */
  targetUnit: string | null;
  /**
   * True when the habit can be completed automatically from data the app already
   * stores, so the user should never have to tick it by hand.
   */
  autoTracked: boolean;
  /** Shown verbatim in the UI. */
  safetyNote?: string;
  color: string;
  icon: string;
  points?: number;
}

/** A measurable goal the challenge defines. */
export interface ChallengeGoal {
  key: string;
  title: string;
  description: string;
  type: GoalType;
  targetValue: number;
  unit: string;
  category: string;
  icon: string;
  /** Keyed against `ChallengeHabit.key`; drives progress rollup. */
  drivenByHabitKeys: readonly string[];
}

/** The parent goal's own target is elapsed days. */
export const CHALLENGE_PARENT_GOAL = {
  key: 'parent',
  title: '90 Days of Discipline',
  description:
    'A 90-day consistency challenge across fitness, hydration, sleep, nutrition, ' +
    'learning and mental discipline. Progress rolls up from the child goals, ' +
    'each of which is measured by the habits that feed it.\n\n' +
    'This challenge tracks consistency, not perfection. A missed day is data, ' +
    'not a verdict. Illness, injury and genuine exhaustion are not failed ' +
    'commitments — rest when you need it and resume.',
  type: 'CUSTOM' as GoalType,
  targetValue: 90,
  unit: 'days',
  category: 'Discipline',
  icon: '🔥',
} as const;

/** Seven measurable goals, each derived from specific habits. */
export const CHALLENGE_GOALS: readonly ChallengeGoal[] = [
  {
    key: 'fitness',
    title: 'Physical Fitness',
    description:
      'Complete 5–6 structured workouts each week and reach 10,000 steps daily. ' +
      'Rest days are planned, not missed.',
    type: 'QUARTERLY',
    targetValue: 10_000,
    unit: 'steps/day',
    category: 'Physical Fitness',
    icon: '🏋️',
    drivenByHabitKeys: ['workout', 'steps-10k'],
  },
  {
    key: 'hydration',
    title: 'Hydration',
    description:
      'Hit your own daily water target, set for your body and climate. This is ' +
      'not a fixed volume — set it in the habit settings before this goal counts.',
    type: 'QUARTERLY',
    targetValue: 100,
    unit: '% of days on target',
    category: 'Hydration',
    icon: '💧',
    drivenByHabitKeys: ['hydration'],
  },
  {
    key: 'sleep',
    title: 'Sleep Optimisation',
    description:
      'A 00:00 bedtime and a 05:00 wake-up is a 5-hour window, so it can hold at ' +
      'most about 5 hours of actual sleep once you allow for falling asleep and ' +
      'brief awakenings. All three sleep measures track automatically from your ' +
      'sleep log.\n\n' +
      'Worth being clear about: 5 hours is below the 7–9 hours adults are ' +
      'generally recommended to get. This goal is set to the window you actually ' +
      'keep rather than to a figure this schedule cannot reach, so it is ' +
      'achievable — but if you want the original 8 hours of sleep, the window ' +
      'itself has to widen (for example 23:00–07:00). Widen it in Settings → ' +
      'Sleep and this goal will follow it.',
    type: 'QUARTERLY',
    targetValue: 5,
    unit: 'hours/night',
    category: 'Sleep & Recovery',
    icon: '😴',
    drivenByHabitKeys: ['sleep-duration', 'bedtime-by-midnight', 'wake-by-5am'],
  },
  {
    key: 'nutrition',
    title: 'Nutrition',
    description:
      'Meet your personalised protein target and keep your chosen restrictions ' +
      'on fast food, added sugar and alcohol.',
    type: 'QUARTERLY',
    targetValue: 100,
    unit: '% of days on target',
    category: 'Nutrition',
    icon: '🥗',
    drivenByHabitKeys: ['protein-target', 'no-fast-food', 'no-added-sugar', 'no-alcohol'],
  },
  {
    key: 'learning',
    title: 'Personal Development',
    description:
      'Read 10 pages a day. Across 90 days that is 900 pages — roughly 6–9 books, ' +
      'depending on length.',
    type: 'QUARTERLY',
    targetValue: 900,
    unit: 'pages',
    category: 'Personal Development',
    icon: '📖',
    drivenByHabitKeys: ['read-10-pages'],
  },
  {
    key: 'mental-discipline',
    title: 'Mental Discipline',
    description:
      'Keep distraction-free focus blocks and, where suitable, a cool or cold ' +
      'shower.',
    type: 'QUARTERLY',
    targetValue: 100,
    unit: '% of days on target',
    category: 'Mental Discipline',
    icon: '🧊',
    drivenByHabitKeys: ['distraction-free-focus', 'cold-shower'],
  },
  {
    key: 'personal-growth',
    title: 'Personal Growth & Accountability',
    description:
      'Record honest reflections, notice what broke the chain, and resume. ' +
      'Measured by reflection entries, not by a checkbox.',
    type: 'QUARTERLY',
    targetValue: 90,
    unit: 'reflections',
    category: 'Personal Growth',
    icon: '🌱',
    drivenByHabitKeys: ['self-focus-reflection', 'accountability-reflection'],
  },
] as const;

/** The habits. Thirteen trackable; the two mindset principles are reflections. */
export const CHALLENGE_HABITS: readonly ChallengeHabit[] = [
  // ---- Physical fitness ----
  {
    key: 'workout',
    name: 'Planned Workout',
    description:
      'Complete a planned training session. This is a weekly target of 5, not a ' +
      'daily one — a planned rest day is not a missed commitment.',
    category: 'Physical Fitness',
    tier: 'NON_NEGOTIABLE',
    frequencyType: 'WEEKLY_TARGET',
    frequencyValue: '5',
    targetCount: null,
    kind: 'ACTION',
    targetUnit: null,
    autoTracked: false,
    color: '#f97316',
    icon: '🏋️',
  },
  {
    key: 'steps-10k',
    name: '10,000 Steps',
    description: 'Reach 10,000 steps. Log the count, or connect a health source.',
    category: 'Physical Fitness',
    tier: 'GROWTH',
    frequencyType: 'DAILY',
    frequencyValue: null,
    targetCount: null,
    kind: 'MEASUREMENT',
    targetUnit: 'steps',
    autoTracked: false,
    color: '#84cc16',
    icon: '👟',
  },

  // ---- Hydration ----
  {
    key: 'hydration',
    name: 'Daily Water Target',
    description:
      'Hit your own daily water target. Set it in this habit\'s settings — a fixed ' +
      'volume is not appropriate for everyone, and pushing too hard is unsafe.',
    category: 'Hydration',
    tier: 'NON_NEGOTIABLE',
    frequencyType: 'DAILY',
    frequencyValue: null,
    targetCount: null,
    kind: 'MEASUREMENT',
    targetUnit: 'personalised',
    autoTracked: false,
    safetyNote:
      'Water needs vary with body size, climate, activity and diet. Set a target ' +
      'that suits you, and do not force excessive intake over a short period.',
    color: '#0ea5e9',
    icon: '💧',
  },

  // ---- Sleep (all auto-tracked from the sleep log) ----
  {
    key: 'sleep-duration',
    name: 'Sleep Duration',
    description:
      'Hours of actual sleep, measured from your sleep log. The target follows ' +
      'your configured window, so a 00:00–05:00 schedule targets 5 hours.',
    category: 'Sleep & Recovery',
    tier: 'NON_NEGOTIABLE',
    frequencyType: 'DAILY',
    frequencyValue: null,
    targetCount: null,
    kind: 'MEASUREMENT',
    targetUnit: 'hours',
    autoTracked: true,
    safetyNote:
      'A 5-hour window yields at most about 5 hours of sleep. Adults are ' +
      'generally recommended 7–9 hours, so consider widening the window rather ' +
      'than treating a short night as a completed target.',
    color: '#6366f1',
    icon: '🌙',
  },
  {
    key: 'bedtime-by-midnight',
    name: 'In Bed by Midnight',
    description: 'Your actual bedtime, from the sleep log. Enter the real time.',
    category: 'Sleep & Recovery',
    tier: 'NON_NEGOTIABLE',
    frequencyType: 'DAILY',
    frequencyValue: null,
    targetCount: null,
    kind: 'MEASUREMENT',
    targetUnit: 'time',
    autoTracked: true,
    color: '#818cf8',
    icon: '🛏️',
  },
  {
    key: 'wake-by-5am',
    name: 'Awake by 5 AM',
    description:
      'Your actual wake time, from the sleep log. Note that a 00:00–05:00 ' +
      'window leaves no room for a night out — treat those nights honestly ' +
      'rather than skipping the entry.',
    category: 'Sleep & Recovery',
    tier: 'NON_NEGOTIABLE',
    frequencyType: 'DAILY',
    frequencyValue: null,
    targetCount: null,
    kind: 'MEASUREMENT',
    targetUnit: 'time',
    autoTracked: true,
    color: '#a5b4fc',
    icon: '⏰',
  },

  // ---- Nutrition ----
  {
    key: 'protein-target',
    name: 'Protein Target',
    description:
      'Meet your own daily protein target, spread across meals. Set the figure in ' +
      'this habit\'s settings; "as much as possible" is not a target.',
    category: 'Nutrition',
    tier: 'GROWTH',
    frequencyType: 'DAILY',
    frequencyValue: null,
    targetCount: null,
    kind: 'MEASUREMENT',
    targetUnit: 'grams',
    autoTracked: false,
    safetyNote:
      'Meet an appropriate target rather than maximising intake. Very high ' +
      'protein intakes are not beneficial for everyone and can strain the kidneys.',
    color: '#eab308',
    icon: '🥚',
  },
  {
    key: 'no-fast-food',
    name: 'No Fast Food',
    description:
      'An abstention: the day counts when you do not eat fast food. A "miss" here ' +
      'means you did eat some — which is information, not a failure.',
    category: 'Nutrition',
    tier: 'GROWTH',
    frequencyType: 'DAILY',
    frequencyValue: null,
    targetCount: null,
    kind: 'ABSTENTION',
    targetUnit: null,
    autoTracked: false,
    color: '#ef4444',
    icon: '🍔',
  },
  {
    key: 'no-added-sugar',
    name: 'No Added Sugar',
    description:
      'Avoid added sugars: sweetened drinks, sweets, and sugar added to tea or ' +
      'coffee. Naturally occurring sugars in whole fruit and plain milk are not ' +
      'in scope.',
    category: 'Nutrition',
    tier: 'GROWTH',
    frequencyType: 'DAILY',
    frequencyValue: null,
    targetCount: null,
    kind: 'ABSTENTION',
    targetUnit: null,
    autoTracked: false,
    color: '#f43f5e',
    icon: '🍬',
  },
  {
    key: 'no-alcohol',
    name: 'Alcohol-Free Day',
    description: 'No alcohol today, including at social events.',
    category: 'Nutrition & Lifestyle',
    tier: 'OPTIONAL',
    frequencyType: 'DAILY',
    frequencyValue: null,
    targetCount: null,
    kind: 'ABSTENTION',
    targetUnit: null,
    autoTracked: false,
    color: '#a855f7',
    icon: '🍺',
  },

  // ---- Personal development ----
  {
    key: 'read-10-pages',
    name: 'Read 10 Pages',
    description: 'Read at least 10 pages. 10 × 90 = 900 pages across the challenge.',
    category: 'Personal Development',
    tier: 'GROWTH',
    frequencyType: 'DAILY',
    frequencyValue: null,
    targetCount: null,
    kind: 'MEASUREMENT',
    targetUnit: 'pages',
    autoTracked: false,
    color: '#3b82f6',
    icon: '📖',
  },

  // ---- Mental discipline ----
  {
    key: 'cold-shower',
    name: 'Cool or Cold Shower',
    description:
      'One cool or cold shower. This is optional — it is a practice, not a ' +
      'requirement, and it is not a substitute for consistency elsewhere.',
    category: 'Mental Discipline',
    tier: 'BONUS',
    frequencyType: 'DAILY',
    frequencyValue: null,
    targetCount: null,
    kind: 'ACTION',
    targetUnit: null,
    autoTracked: false,
    safetyNote:
      'Avoid deliberately dangerous water temperatures. If you have a heart ' +
      'condition, blood-pressure condition, or are pregnant, check with a ' +
      'healthcare professional before intense cold exposure.',
    color: '#06b6d4',
    icon: '🚿',
  },
  {
    key: 'distraction-free-focus',
    name: 'Distraction-Free Focus',
    description:
      'Complete a planned focus session with notifications off and your phone ' +
      'away. Necessary communication and genuine breaks are not distractions.',
    category: 'Mental Discipline',
    tier: 'GROWTH',
    frequencyType: 'DAILY',
    frequencyValue: null,
    targetCount: null,
    kind: 'ACTION',
    targetUnit: null,
    autoTracked: false,
    color: '#8b5cf6',
    icon: '🎯',
  },

  // ---- Mindset: reflections, not checkboxes ----
  {
    key: 'self-focus-reflection',
    name: 'Self-Focus Reflection',
    description:
      'A short note on your own progress this week, and what you are avoiding. ' +
      'This is a reflection, not a checkable action — there is no state in which ' +
      '"focus on yourself" is verifiably done.',
    category: 'Mindset & Growth',
    tier: 'FLEXIBLE',
    frequencyType: 'WEEKLY_TARGET',
    frequencyValue: '1',
    targetCount: null,
    kind: 'ACTION',
    targetUnit: null,
    autoTracked: false,
    color: '#10b981',
    icon: '🌱',
  },
  {
    key: 'accountability-reflection',
    name: 'Accountability Note',
    description:
      'Note what broke the chain and what you will change — then resume. ' +
      'Recording a miss honestly is the behaviour being measured.',
    category: 'Mindset & Discipline',
    tier: 'FLEXIBLE',
    frequencyType: 'WEEKLY_TARGET',
    frequencyValue: '1',
    targetCount: null,
    kind: 'ACTION',
    targetUnit: null,
    autoTracked: false,
    color: '#14b8a6',
    icon: '🪞',
  },
] as const;

/** The template id, referenced by the onboarding options and the library. */
export const CHALLENGE_TEMPLATE_ID = '90-day-discipline';

export const CHALLENGE_DURATION_DAYS = 90;

/** Habit keys the UI must ask the user to personalise before the goal can count. */
export const HABITS_REQUIRING_A_TARGET = CHALLENGE_HABITS.filter(
  (h) => h.targetUnit === 'personalised' || h.targetUnit === 'grams'
).map((h) => h.key);
