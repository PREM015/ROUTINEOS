import type { HabitFrequencyType } from '@/generated/prisma';
import {
  HABIT_CATALOG_SEED,
  type HabitDefinitionSeed,
} from './habit-catalog';

/**
 * The "Daily Essentials" starter pack.
 *
 * A **reusable template**, not a per-user setup: it is stored as one official
 * `Template` row with `type = 'HABIT_SET'` and `userId = null`, and any user
 * can apply it through `POST /api/starter-packs/apply`. Nothing in the
 * application path branches on who is applying it.
 *
 * ## Relationship to the catalogue
 *
 * Each entry is keyed to a `HabitDefinition` **by slug**, resolved to an id at
 * seed time. That `definitionId` is recorded on the created habit purely as
 * provenance for a "from catalogue" badge — the habit's target, tier and
 * schedule are its own from the moment it is created, so editing or
 * deactivating the definition afterwards changes nothing for anyone.
 *
 * ## Tier mapping
 *
 * The source list uses Tier 1 / 2 / 3. Mapped onto the existing enum as:
 *
 *   Tier 1 → `NON_NEGOTIABLE`   daily, from day one
 *   Tier 2 → `GROWTH`           scheduled (weekly/monthly/interval), `startDelayDays: 30`
 *   Tier 3 → `OPTIONAL`         optional growth, no pressure
 *
 * The remaining enum values are deliberately unused here. They are all present
 * and configurable in the UI for anyone who wants them; a starter pack simply
 * does not lead with them.
 *
 * ## De-duplication
 *
 * The source list repeats several items across sections ("Gym" and "Gym
 * according to my training split"; "Digital detox" in both Digital Discipline
 * and Weekly Personal; "Track body measurements" in both Weekly and Monthly;
 * "Pomodoro technique" and "Use timer / Pomodoro" in Tier 3). Each is listed
 * once here, at the frequency that matches what it actually is — see the
 * `DEDUPED` comment on each survivor.
 *
 * ## Targets
 *
 * Daily Steps suggests 15,000 because that is a reasonable starting number for
 * the account this pack was built for. It is a *suggestion*: the value is copied
 * onto the personal habit and is editable there, and two users applying this
 * same pack can set 15,000, 12,000 or 30. No part of the code treats 15,000 as
 * correct for anyone.
 */

/** Days after applying before tier-2 habits begin. */
export const TIER2_START_DELAY_DAYS = 30;

/** One habit in the starter pack, as stored in the template's JSON `content`. */
export interface StarterPackHabitSeed {
  name: string;
  /** Slug of the catalogue entry this mirrors; resolved to an id at seed time. */
  slug: string;
  tier: 'NON_NEGOTIABLE' | 'GROWTH' | 'OPTIONAL';
  /**
   * Days after "today" to set as `startDate`.
   *
   * Tier 1 is 0 (from day one). Tier 2 is 30, so the daily essentials are
   * established before the scheduled habits start piling on.
   */
  startDelayDays: number;
  sortOrder: number;
  /**
   * Overrides applied to the personal habit *after* copying the catalogue
   * suggestion. Only set where the pack genuinely differs from the suggestion.
   */
  overrides?: Partial<
    Pick<HabitDefinitionSeed, 'targetValue' | 'unit' | 'frequencyType' | 'frequencyValue' | 'intervalDays' | 'trackingType' | 'direction' | 'timeOfDay'>
  >;
}

const T1 = 0;
const T2 = TIER2_START_DELAY_DAYS;

/**
 * De-duplication ledger — what was merged, and why.
 *
 * Kept as data rather than deleted silently so the decision is auditable
 * rather than looking like an omission.
 */
export const DEDUPE_NOTES: Record<string, string> = {
  'go to the gym':
    'Merged "Go to the gym (follow structured workout plan)" and "Gym according to my training split" and "Gym" into one weekly-training habit.',
  'digital detox':
    'Merged "Digital detox period (daily or weekly)" and the weekly "Digital detox period" into one daily habit with a duration target.',
  'track body measurements':
    'Merged the weekly and monthly "Track body measurements" into one weekly habit. A daily-weight rule would be the wrong frequency, and monthly was too sparse to act on.',
  pomodoro:
    'Merged "Use timer / Pomodoro if it helps" and "Pomodoro technique" into one optional habit.',
  'dsa practice':
    'Merged "Practise DSA" with "Revise previously solved coding problems" as two separate habits — they are genuinely different actions (new problems vs. spaced review).',
  'review goals':
    'Merged "Set goals for next week and month" and "Review goals" into one weekly review.',
  'monthly goal review':
    'Merged "Review my progress and goals" (monthly personal) into the monthly goal review.',
  'review spending': 'Merged the weekly finance items into separate review and invest habits.',
};

export const STARTER_PACK: {
  name: string;
  description: string;
  category: string;
  habits: StarterPackHabitSeed[];
} = {
  name: 'Daily Essentials Starter Pack',
  description:
    'Tier 1 daily essentials, tier 2 scheduled habits starting after 30 days, and tier 3 optional growth. Every habit is yours to edit, retarget or delete afterwards.',
  category: 'habits',
  habits: [
    // ── Tier 1: daily essentials ────────────────────────────────────────────
    { name: 'Wake Up at a Consistent Time', slug: 'wake-up-consistent-time', tier: 'NON_NEGOTIABLE', startDelayDays: T1, sortOrder: 0 },
    { name: 'Get Out of Bed Without Snoozing', slug: 'get-out-of-bed-no-snooze', tier: 'NON_NEGOTIABLE', startDelayDays: T1, sortOrder: 1 },
    { name: 'Make My Bed', slug: 'make-bed', tier: 'NON_NEGOTIABLE', startDelayDays: T1, sortOrder: 2 },
    { name: 'Drink Water After Waking', slug: 'drink-water-after-waking', tier: 'NON_NEGOTIABLE', startDelayDays: T1, sortOrder: 3 },
    { name: 'Get Sunlight Before 10 AM', slug: 'morning-sunlight', tier: 'NON_NEGOTIABLE', startDelayDays: T1, sortOrder: 4 },
    { name: 'No Phone for the First Hour', slug: 'no-phone-first-hour', tier: 'NON_NEGOTIABLE', startDelayDays: T1, sortOrder: 5 },
    { name: 'Follow a Planned Morning Routine', slug: 'follow-planned-morning-routine', tier: 'NON_NEGOTIABLE', startDelayDays: T1, sortOrder: 6 },
    { name: 'Write Down the Top 3 Priorities', slug: 'write-top-3-priorities', tier: 'NON_NEGOTIABLE', startDelayDays: T1, sortOrder: 7 },
    { name: 'Use Deodorant', slug: 'use-deodorant', tier: 'NON_NEGOTIABLE', startDelayDays: T1, sortOrder: 8 },
    { name: 'Wear Clean, Well-Fitting Clothes and Fresh Socks', slug: 'wear-clean-clothes', tier: 'NON_NEGOTIABLE', startDelayDays: T1, sortOrder: 9 },
    { name: 'Cleanse Face Gently', slug: 'morning-skincare', tier: 'NON_NEGOTIABLE', startDelayDays: T1, sortOrder: 10, overrides: { targetValue: undefined } },
    { name: 'Apply Moisturiser', slug: 'morning-skincare', tier: 'NON_NEGOTIABLE', startDelayDays: T1, sortOrder: 11 },
    { name: 'Apply Broad-Spectrum SPF 30+ Sunscreen', slug: 'sunscreen', tier: 'NON_NEGOTIABLE', startDelayDays: T1, sortOrder: 12 },
    { name: 'Sleep 7-8 Hours', slug: 'sleep-7-8-hours', tier: 'NON_NEGOTIABLE', startDelayDays: T1, sortOrder: 13 },
    { name: 'Consistent Sleep and Wake Schedule', slug: 'consistent-sleep-schedule', tier: 'NON_NEGOTIABLE', startDelayDays: T1, sortOrder: 14 },
    { name: 'Stop Using Phone Before Bed', slug: 'stop-phone-before-bed', tier: 'NON_NEGOTIABLE', startDelayDays: T1, sortOrder: 15 },
    { name: 'Review the Day Before Sleeping', slug: 'evening-review', tier: 'NON_NEGOTIABLE', startDelayDays: T1, sortOrder: 16 },
    { name: "Review Tomorrow's Schedule", slug: 'review-tomorrow-schedule', tier: 'NON_NEGOTIABLE', startDelayDays: T1, sortOrder: 17 },
    { name: 'Prepare Clothes, Workspace and Tasks for Tomorrow', slug: 'prepare-tomorrow', tier: 'NON_NEGOTIABLE', startDelayDays: T1, sortOrder: 18 },
    { name: 'Quick Room Reset', slug: 'room-reset', tier: 'NON_NEGOTIABLE', startDelayDays: T1, sortOrder: 19 },
    { name: 'Cleanse Face Before Bed', slug: 'evening-skincare', tier: 'NON_NEGOTIABLE', startDelayDays: T1, sortOrder: 20 },
    { name: 'Remove Sunscreen and Makeup Properly', slug: 'evening-skincare', tier: 'NON_NEGOTIABLE', startDelayDays: T1, sortOrder: 21 },

    // Digital discipline — Tier 1
    { name: 'Stay Within Daily Social Media Time Limit', slug: 'social-media-limit', tier: 'NON_NEGOTIABLE', startDelayDays: T1, sortOrder: 22 },
    { name: 'Do Not Disturb / Notifications Off', slug: 'dnd-notifications-off', tier: 'NON_NEGOTIABLE', startDelayDays: T1, sortOrder: 23 },
    { name: 'Keep Phone Away While Working or Studying', slug: 'phone-away-while-working', tier: 'NON_NEGOTIABLE', startDelayDays: T1, sortOrder: 24 },
    { name: 'No Short-Form Video During Study Sessions', slug: 'no-short-form-videos-study', tier: 'NON_NEGOTIABLE', startDelayDays: T1, sortOrder: 25 },
    { name: 'No Scrolling During Meals', slug: 'no-scrolling-during-meals', tier: 'NON_NEGOTIABLE', startDelayDays: T1, sortOrder: 26 },
    { name: 'Replace Scrolling with a Hobby, Music, Reading or Outdoors', slug: 'replace-scrolling', tier: 'NON_NEGOTIABLE', startDelayDays: T1, sortOrder: 27 },
    { name: 'Digital Detox Period', slug: 'digital-detox', tier: 'NON_NEGOTIABLE', startDelayDays: T1, sortOrder: 28 },
    { name: 'Track Time Spent on Distractions', slug: 'track-distraction-time', tier: 'NON_NEGOTIABLE', startDelayDays: T1, sortOrder: 29 },

    // Planning & productivity — Tier 1
    { name: 'Use a Calendar or Daily Planner', slug: 'use-calendar-or-planner', tier: 'NON_NEGOTIABLE', startDelayDays: T1, sortOrder: 30 },
    { name: 'Set a Clear Start Time for Important Work', slug: 'set-start-time-for-important-work', tier: 'NON_NEGOTIABLE', startDelayDays: T1, sortOrder: 31 },
    { name: 'Break Large Goals Into Smaller Tasks', slug: 'break-large-goals-into-tasks', tier: 'NON_NEGOTIABLE', startDelayDays: T1, sortOrder: 32 },
    { name: 'Finish or Deliberately Reschedule Pending Tasks', slug: 'finish-or-reschedule-pending-tasks', tier: 'NON_NEGOTIABLE', startDelayDays: T1, sortOrder: 33 },
    { name: 'Avoid Multitasking During Deep Work', slug: 'avoid-multitasking', tier: 'NON_NEGOTIABLE', startDelayDays: T1, sortOrder: 34 },
    { name: 'Batch Small Tasks', slug: 'batch-small-tasks', tier: 'NON_NEGOTIABLE', startDelayDays: T1, sortOrder: 35 },

    // Study & deep work — Tier 1
    { name: 'Plan Study Targets Before Starting', slug: 'plan-study-targets', tier: 'NON_NEGOTIABLE', startDelayDays: T1, sortOrder: 36 },
    { name: 'Complete One Focused Study Session', slug: 'one-focused-study-session', tier: 'NON_NEGOTIABLE', startDelayDays: T1, sortOrder: 37 },
    { name: 'Study Without Switching Between Apps', slug: 'study-without-switching-apps', tier: 'NON_NEGOTIABLE', startDelayDays: T1, sortOrder: 38 },
    { name: 'Keep Desk Clean Before Starting', slug: 'clean-desk-before-starting', tier: 'NON_NEGOTIABLE', startDelayDays: T1, sortOrder: 39 },
    { name: 'Track Completed Topics and Pending Work', slug: 'track-completed-topics', tier: 'NON_NEGOTIABLE', startDelayDays: T1, sortOrder: 40 },
    { name: 'Review What I Learned at the End of the Day', slug: 'end-of-day-recall', tier: 'NON_NEGOTIABLE', startDelayDays: T1, sortOrder: 41 },

    // Movement & recovery — Tier 1
    { name: 'Walk Through the Day', slug: 'walk-regularly', tier: 'NON_NEGOTIABLE', startDelayDays: T1, sortOrder: 42 },
    // 15,000 is this account's suggested start. It lives on the personal row
    // and is editable; the catalogue suggestion is not a rule for anyone.
    { name: '15,000 Steps', slug: 'daily-steps', tier: 'NON_NEGOTIABLE', startDelayDays: T1, sortOrder: 43, overrides: { targetValue: 15000, unit: 'steps' } },
    { name: 'Cold Showers', slug: 'cold-shower', tier: 'NON_NEGOTIABLE', startDelayDays: T1, sortOrder: 44 },
    { name: 'Stretch / Mobility Work', slug: 'stretch-mobility', tier: 'NON_NEGOTIABLE', startDelayDays: T1, sortOrder: 45 },
    { name: 'Eat Enough to Support Activity and Recovery', slug: 'eat-enough-for-recovery', tier: 'NON_NEGOTIABLE', startDelayDays: T1, sortOrder: 46 },
    { name: 'Sleep Enough to Recover from Training', slug: 'sleep-enough-for-training', tier: 'NON_NEGOTIABLE', startDelayDays: T1, sortOrder: 47 },

    // Nutrition & hydration — Tier 1
    { name: 'Eat Balanced Meals Consistently', slug: 'balanced-meals', tier: 'NON_NEGOTIABLE', startDelayDays: T1, sortOrder: 48 },
    { name: 'Include Protein in Meals', slug: 'protein-in-meals', tier: 'NON_NEGOTIABLE', startDelayDays: T1, sortOrder: 49 },
    { name: 'Eat Vegetables and Fruit', slug: 'eat-vegetables-and-fruit', tier: 'NON_NEGOTIABLE', startDelayDays: T1, sortOrder: 50 },
    { name: 'Choose Mostly Minimally Processed Foods', slug: 'minimally-processed-food', tier: 'NON_NEGOTIABLE', startDelayDays: T1, sortOrder: 51 },
    { name: 'Drink Water Throughout the Day', slug: 'drinking-water', tier: 'NON_NEGOTIABLE', startDelayDays: T1, sortOrder: 52 },
    { name: 'Limit Sugary Drinks and Frequent Junk Food', slug: 'limit-sugary-drinks', tier: 'NON_NEGOTIABLE', startDelayDays: T1, sortOrder: 53 },
    { name: 'Limit Frequent Sugary Snacks', slug: 'limit-sugary-snacks', tier: 'NON_NEGOTIABLE', startDelayDays: T1, sortOrder: 54 },
    { name: 'No Crash Diets, Dehydration or Extreme Food Restrictions', slug: 'no-extreme-dieting', tier: 'NON_NEGOTIABLE', startDelayDays: T1, sortOrder: 55 },
    { name: 'Eat Mindfully Instead of Snacking Out of Boredom', slug: 'eat-mindfully', tier: 'NON_NEGOTIABLE', startDelayDays: T1, sortOrder: 56 },

    // Skincare, grooming & hygiene — Tier 1
    { name: 'Reapply Sunscreen When Outdoors', slug: 'reapply-sunscreen', tier: 'NON_NEGOTIABLE', startDelayDays: T1, sortOrder: 57 },
    { name: "Don't Pick Pimples or Touch Face Unnecessarily", slug: 'do-not-pick-skin', tier: 'NON_NEGOTIABLE', startDelayDays: T1, sortOrder: 58 },
    { name: 'Maintain Clean Ears and General Personal Hygiene', slug: 'personal-hygiene', tier: 'NON_NEGOTIABLE', startDelayDays: T1, sortOrder: 59 },
    { name: 'Avoid Harsh Treatments That Damage Hair or Skin', slug: 'avoid-harsh-hair-skin-treatments', tier: 'NON_NEGOTIABLE', startDelayDays: T1, sortOrder: 60 },
    { name: 'Keep Clothes Clean', slug: 'wash-clothes', tier: 'NON_NEGOTIABLE', startDelayDays: T1, sortOrder: 61 },
    { name: 'Stick to a Grooming Routine I Can Sustain', slug: 'sustainable-grooming-routine', tier: 'NON_NEGOTIABLE', startDelayDays: T1, sortOrder: 62 },

    // Oral hygiene — Tier 1
    { name: 'Brush Teeth Twice Daily with Fluoride Toothpaste', slug: 'brush-teeth', tier: 'NON_NEGOTIABLE', startDelayDays: T1, sortOrder: 63 },
    { name: 'Clean Between Teeth Daily (Floss)', slug: 'floss', tier: 'NON_NEGOTIABLE', startDelayDays: T1, sortOrder: 64 },
    { name: 'Clean Tongue Gently', slug: 'clean-tongue', tier: 'NON_NEGOTIABLE', startDelayDays: T1, sortOrder: 65 },

    // Mind & discipline — Tier 1
    { name: 'Read 10 Pages of a Book', slug: 'read-10-pages', tier: 'NON_NEGOTIABLE', startDelayDays: T1, sortOrder: 66 },
    { name: 'Read the News', slug: 'read-the-news', tier: 'NON_NEGOTIABLE', startDelayDays: T1, sortOrder: 67 },
    { name: 'Learn Something New and Useful', slug: 'learn-something-useful', tier: 'NON_NEGOTIABLE', startDelayDays: T1, sortOrder: 68 },
    { name: 'Do Something Creative', slug: 'do-something-creative', tier: 'NON_NEGOTIABLE', startDelayDays: T1, sortOrder: 69 },
    { name: 'Do Something That Challenges Me', slug: 'do-something-uncomfortable', tier: 'NON_NEGOTIABLE', startDelayDays: T1, sortOrder: 70 },
    { name: 'Reflect on Mistakes Without Excessive Self-Criticism', slug: 'reflect-on-mistakes', tier: 'NON_NEGOTIABLE', startDelayDays: T1, sortOrder: 71 },
    { name: 'Reduce Impulsive Habits and Distractions', slug: 'reduce-impulsive-habits', tier: 'NON_NEGOTIABLE', startDelayDays: T1, sortOrder: 72 },
    { name: 'Say No to Things That Interfere With My Priorities', slug: 'say-no-to-conflicting-things', tier: 'NON_NEGOTIABLE', startDelayDays: T1, sortOrder: 73 },
    { name: 'Follow My Routine Even When Motivation Is Low', slug: 'follow-routine-when-unmotivated', tier: 'NON_NEGOTIABLE', startDelayDays: T1, sortOrder: 74 },
    { name: 'Complete Important Tasks Before Unnecessary Entertainment', slug: 'important-tasks-before-entertainment', tier: 'NON_NEGOTIABLE', startDelayDays: T1, sortOrder: 75 },

    // Posture & healthy mindset — Tier 1
    { name: 'Practise Good Posture', slug: 'posture', tier: 'NON_NEGOTIABLE', startDelayDays: T1, sortOrder: 76 },
    { name: 'Do Not Make Identity About Productivity or Appearance', slug: 'not-identity-about-productivity', tier: 'NON_NEGOTIABLE', startDelayDays: T1, sortOrder: 77 },
    { name: 'Take Breaks Before Exhaustion Builds Up', slug: 'take-breaks-before-exhaustion', tier: 'NON_NEGOTIABLE', startDelayDays: T1, sortOrder: 78 },
    { name: 'Make Time for Hobbies and Enjoyable Activities', slug: 'time-for-hobbies', tier: 'NON_NEGOTIABLE', startDelayDays: T1, sortOrder: 79 },
    { name: 'Stay Connected with Supportive Friends and Family', slug: 'stay-connected', tier: 'NON_NEGOTIABLE', startDelayDays: T1, sortOrder: 80 },

    // ── Tier 2: scheduled habits, start after day 30 ───────────────────────
    { name: 'Go to the Gym (Follow My Training Split)', slug: 'workout', tier: 'GROWTH', startDelayDays: T2, sortOrder: 81 },
    { name: 'Warm Up Before Intense Training', slug: 'warm-up', tier: 'GROWTH', startDelayDays: T2, sortOrder: 82 },
    { name: 'Train Major Muscle Groups in a Balanced Programme', slug: 'balanced-muscle-groups', tier: 'GROWTH', startDelayDays: T2, sortOrder: 83 },
    { name: 'Practise Proper Form Before Increasing Weights', slug: 'proper-form-before-weight', tier: 'GROWTH', startDelayDays: T2, sortOrder: 84 },
    { name: 'Record Workouts: Sets, Reps, Weights', slug: 'record-workouts', tier: 'GROWTH', startDelayDays: T2, sortOrder: 85 },
    { name: 'Increase Training Difficulty Gradually', slug: 'progressive-overload', tier: 'GROWTH', startDelayDays: T2, sortOrder: 86 },
    { name: 'Include Cardio or Aerobic Activity', slug: 'cardio', tier: 'GROWTH', startDelayDays: T2, sortOrder: 87 },
    { name: 'Take a Recovery or Rest Day When Needed', slug: 'recovery-day', tier: 'GROWTH', startDelayDays: T2, sortOrder: 88 },

    { name: 'Practise DSA', slug: 'dsa-practice', tier: 'GROWTH', startDelayDays: T2, sortOrder: 89 },
    { name: 'Revise Previously Solved Coding Problems', slug: 'dsa-revision', tier: 'GROWTH', startDelayDays: T2, sortOrder: 90 },
    { name: 'Learn the Concept Behind Mistakes and Failed Solutions', slug: 'learn-from-mistakes-in-code', tier: 'GROWTH', startDelayDays: T2, sortOrder: 91 },
    { name: 'Write Clean, Readable Code', slug: 'write-clean-code', tier: 'GROWTH', startDelayDays: T2, sortOrder: 92 },
    { name: 'Learn One Technical Concept in Depth', slug: 'learn-one-concept-in-depth', tier: 'GROWTH', startDelayDays: T2, sortOrder: 93 },
    { name: 'Make Progress on a Real Project', slug: 'project-development', tier: 'GROWTH', startDelayDays: T2, sortOrder: 94 },
    { name: 'Commit Meaningful Code Changes to Git', slug: 'commit-to-git', tier: 'GROWTH', startDelayDays: T2, sortOrder: 95 },
    { name: 'Read Documentation Instead of Only Tutorials', slug: 'read-documentation', tier: 'GROWTH', startDelayDays: T2, sortOrder: 96 },
    { name: 'Debug Problems Myself Before Looking at Solutions', slug: 'debug-yourself', tier: 'GROWTH', startDelayDays: T2, sortOrder: 97 },
    { name: 'Practise Explaining Technical Concepts in Simple English', slug: 'explain-in-simple-english', tier: 'GROWTH', startDelayDays: T2, sortOrder: 98 },
    { name: 'Improve Written Communication', slug: 'written-communication', tier: 'GROWTH', startDelayDays: T2, sortOrder: 99 },
    { name: 'Keep Learning Without Endlessly Switching Technologies', slug: 'keep-learning-without-switching', tier: 'GROWTH', startDelayDays: T2, sortOrder: 100 },

    { name: 'Revise Previously Learned Topics', slug: 'revise-previous-topics', tier: 'GROWTH', startDelayDays: T2, sortOrder: 101 },
    { name: 'Make Short Revision Notes', slug: 'short-revision-notes', tier: 'GROWTH', startDelayDays: T2, sortOrder: 102 },
    { name: 'Test Myself Instead of Only Rereading', slug: 'test-yourself', tier: 'GROWTH', startDelayDays: T2, sortOrder: 103 },
    { name: 'Add to and Solve My List of Doubts', slug: 'doubt-list', tier: 'GROWTH', startDelayDays: T2, sortOrder: 104 },
    { name: 'Follow My Hair-Washing Schedule', slug: 'haircare-schedule', tier: 'GROWTH', startDelayDays: T2, sortOrder: 105 },
    { name: 'Use Conditioner When Appropriate', slug: 'use-conditioner', tier: 'GROWTH', startDelayDays: T2, sortOrder: 106 },

    // Weekly: planning & review
    { name: 'Plan the Week', slug: 'plan-the-week', tier: 'GROWTH', startDelayDays: T2, sortOrder: 107 },
    { name: 'Set Goals for Next Week and Month', slug: 'set-goals-for-next-week-month', tier: 'GROWTH', startDelayDays: T2, sortOrder: 108 },
    { name: 'Weekly Review', slug: 'weekly-review', tier: 'GROWTH', startDelayDays: T2, sortOrder: 109 },
    { name: 'Review Unfinished Tasks and Adjust the Plan', slug: 'review-unfinished-tasks', tier: 'GROWTH', startDelayDays: T2, sortOrder: 110 },
    { name: 'Review Weekly Coding Progress', slug: 'review-weekly-coding-progress', tier: 'GROWTH', startDelayDays: T2, sortOrder: 111 },
    { name: 'Track Screen Time', slug: 'screen-time', tier: 'GROWTH', startDelayDays: T2, sortOrder: 112 },
    { name: 'Plan Meals', slug: 'plan-meals', tier: 'GROWTH', startDelayDays: T2, sortOrder: 113 },

    // Weekly: finances
    { name: 'Review Spending', slug: 'review-spending', tier: 'GROWTH', startDelayDays: T2, sortOrder: 114 },
    { name: 'Invest', slug: 'invest', tier: 'GROWTH', startDelayDays: T2, sortOrder: 115 },

    // Weekly: career
    { name: 'DSA Revision Session', slug: 'dsa-revision', tier: 'GROWTH', startDelayDays: T2, sortOrder: 116 },
    { name: 'Project Development Session', slug: 'project-development', tier: 'GROWTH', startDelayDays: T2, sortOrder: 117 },
    { name: 'Apply to Relevant Internships and Jobs', slug: 'apply-to-jobs', tier: 'GROWTH', startDelayDays: T2, sortOrder: 118 },
    { name: 'Practise Interview Questions and Communication', slug: 'interview-practice', tier: 'GROWTH', startDelayDays: T2, sortOrder: 119 },
    { name: 'Practise Explaining My Projects and Technical Decisions', slug: 'practise-explaining-projects', tier: 'GROWTH', startDelayDays: T2, sortOrder: 120 },
    { name: 'Practise Speaking Confidently', slug: 'practice-speaking-confidently', tier: 'GROWTH', startDelayDays: T2, sortOrder: 121 },
    { name: 'Research Career Opportunities', slug: 'research-career-opportunities', tier: 'GROWTH', startDelayDays: T2, sortOrder: 122 },
    { name: 'Review Projects and Improve Their Quality', slug: 'improve-project-quality', tier: 'GROWTH', startDelayDays: T2, sortOrder: 123 },
    { name: 'Update Record of Accomplishments', slug: 'update-record-of-accomplishments', tier: 'GROWTH', startDelayDays: T2, sortOrder: 124 },
    { name: 'Learn from Rejections and Interview Feedback', slug: 'learn-from-rejections', tier: 'GROWTH', startDelayDays: T2, sortOrder: 125 },
    { name: 'Practise Giving and Receiving Feedback', slug: 'give-receive-feedback', tier: 'GROWTH', startDelayDays: T2, sortOrder: 126 },
    { name: 'Build a Project That Solves a Real Problem', slug: 'build-real-project', tier: 'GROWTH', startDelayDays: T2, sortOrder: 127 },

    // Weekly: body & grooming
    { name: 'Track Body Measurements (Weight / Waist)', slug: 'track-body-measurements', tier: 'GROWTH', startDelayDays: T2, sortOrder: 128 },
    { name: 'Trim Facial Hair or Clean Shave', slug: 'trim-facial-hair', tier: 'GROWTH', startDelayDays: T2, sortOrder: 129 },
    { name: 'Keep Nails Clean and Trimmed', slug: 'keep-nails-trimmed', tier: 'GROWTH', startDelayDays: T2, sortOrder: 130 },
    { name: 'Clean Grooming Tools', slug: 'clean-grooming-tools', tier: 'GROWTH', startDelayDays: T2, sortOrder: 131 },
    { name: 'Wash Pillowcases, Towels and Anything Touching My Face', slug: 'wash-pillowcases-towels', tier: 'GROWTH', startDelayDays: T2, sortOrder: 132 },
    { name: 'Wash Clothes and Clean Shoes, Repair Damaged Items', slug: 'repair-clothes-shoes', tier: 'GROWTH', startDelayDays: T2, sortOrder: 133 },

    // Weekly: personal
    { name: 'Deep Clean and Organise My Room', slug: 'deep-clean-room', tier: 'GROWTH', startDelayDays: T2, sortOrder: 134 },
    { name: 'Do Something Outside My Comfort Zone', slug: 'something-outside-comfort-zone', tier: 'GROWTH', startDelayDays: T2, sortOrder: 135 },
    { name: 'Practise a Hobby', slug: 'practise-a-hobby', tier: 'GROWTH', startDelayDays: T2, sortOrder: 136 },
    { name: 'Meet Friends or Family', slug: 'meet-friends-family', tier: 'GROWTH', startDelayDays: T2, sortOrder: 137 },
    { name: 'Digital Detox Period (Weekly Block)', slug: 'digital-detox', tier: 'GROWTH', startDelayDays: T2, sortOrder: 138, overrides: { frequencyType: 'WEEKLY_TARGET', frequencyValue: '2' } },

    // Monthly: finances & organisation
    { name: 'Review Subscriptions', slug: 'review-subscriptions', tier: 'GROWTH', startDelayDays: T2, sortOrder: 139 },
    { name: 'Monthly Reset', slug: 'monthly-reset', tier: 'GROWTH', startDelayDays: T2, sortOrder: 140 },

    // Monthly: personal
    { name: 'Buy Something for Myself', slug: 'buy-something-for-myself', tier: 'GROWTH', startDelayDays: T2, sortOrder: 141 },
    { name: 'Monthly Goal Review', slug: 'monthly-goal-review', tier: 'GROWTH', startDelayDays: T2, sortOrder: 142 },
    { name: 'Reset My Routines and Environment', slug: 'reset-routines-and-environment', tier: 'GROWTH', startDelayDays: T2, sortOrder: 143 },
    { name: 'Track Body Measurements (Monthly Check)', slug: 'track-body-measurements', tier: 'GROWTH', startDelayDays: T2, sortOrder: 144, overrides: { frequencyType: 'MONTHLY_TARGET', frequencyValue: '1' } },

    // Monthly: career & skills
    { name: 'Improve Resume and Portfolio', slug: 'improve-resume-portfolio', tier: 'GROWTH', startDelayDays: T2, sortOrder: 145 },
    { name: 'Maintain GitHub Profile with Genuine Work', slug: 'maintain-github-profile', tier: 'GROWTH', startDelayDays: T2, sortOrder: 146 },
    { name: 'Review Overall Monthly Coding and Career Progress', slug: 'review-monthly-coding-career-progress', tier: 'GROWTH', startDelayDays: T2, sortOrder: 147 },

    // Monthly: grooming & style
    { name: 'Maintain Haircut', slug: 'maintain-haircut', tier: 'GROWTH', startDelayDays: T2, sortOrder: 148 },
    { name: 'Review Wardrobe', slug: 'review-wardrobe', tier: 'GROWTH', startDelayDays: T2, sortOrder: 149 },
    { name: 'Review Skincare: Introduce New Products Gradually', slug: 'review-skincare-products', tier: 'GROWTH', startDelayDays: T2, sortOrder: 150 },
    { name: 'Check Skin: Track Irritation or Persistent Acne', slug: 'check-skin', tier: 'GROWTH', startDelayDays: T2, sortOrder: 151 },
    { name: 'Replace Toothbrush When Worn', slug: 'replace-toothbrush', tier: 'GROWTH', startDelayDays: T2, sortOrder: 152 },

    // Monthly: health check-ins
    { name: 'Dentist Visit and Fix Dental Problems', slug: 'dentist-visit', tier: 'GROWTH', startDelayDays: T2, sortOrder: 153 },
    { name: 'Regular Healthcare Appointments', slug: 'healthcare-appointments', tier: 'GROWTH', startDelayDays: T2, sortOrder: 154 },

    // ── Tier 3: optional growth ─────────────────────────────────────────────
    { name: 'Meditation or Mindful Breathing', slug: 'meditation', tier: 'OPTIONAL', startDelayDays: T2, sortOrder: 155 },
    { name: 'Write a Short Journal Entry', slug: 'journaling', tier: 'OPTIONAL', startDelayDays: T2, sortOrder: 156 },
    { name: 'Spend Time Alone Without Constant Entertainment', slug: 'time-alone-no-entertainment', tier: 'OPTIONAL', startDelayDays: T2, sortOrder: 157 },
    { name: 'Extra Reading Beyond 10 Pages', slug: 'extra-reading', tier: 'OPTIONAL', startDelayDays: T2, sortOrder: 158 },
    { name: 'New Hobbies', slug: 'new-hobbies', tier: 'OPTIONAL', startDelayDays: T2, sortOrder: 159 },
    { name: 'Use Pomodoro Technique', slug: 'pomodoro', tier: 'OPTIONAL', startDelayDays: T2, sortOrder: 160 },
    { name: 'New Fitness Goals', slug: 'new-fitness-goals', tier: 'OPTIONAL', startDelayDays: T2, sortOrder: 161 },
    { name: 'Maintain Comfortable Eye Contact', slug: 'eye-contact', tier: 'OPTIONAL', startDelayDays: T2, sortOrder: 162 },
    { name: 'Speak Clearly Instead of Rushing Words', slug: 'speak-clearly', tier: 'OPTIONAL', startDelayDays: T2, sortOrder: 163 },
    { name: 'Build Confidence Through Preparation and Practice', slug: 'build-confidence-through-preparation', tier: 'OPTIONAL', startDelayDays: T2, sortOrder: 164 },
    { name: 'Extra Communication Practice', slug: 'extra-communication-practice', tier: 'OPTIONAL', startDelayDays: T2, sortOrder: 165 },
    { name: 'Advanced Grooming or Style Improvements', slug: 'advanced-grooming', tier: 'OPTIONAL', startDelayDays: T2, sortOrder: 166 },
  ],
};

/**
 * The pack's JSON payload, as stored in `Template.content`.
 *
 * Each entry carries its resolved `definitionId` when the catalogue row exists,
 * plus the personal values (target, unit, frequency) that the habit will be
 * created with. Those personal values are stored **in the template**, which is
 * what makes the pack self-contained: applying it needs no catalogue lookup at
 * runtime, and editing the catalogue afterwards cannot change what the pack
 * offers.
 */
export interface StarterPackContentHabit {
  name: string;
  description: string | null;
  category: string | null;
  tier: 'NON_NEGOTIABLE' | 'GROWTH' | 'OPTIONAL';
  frequencyType: HabitFrequencyType;
  frequencyValue: string | null;
  intervalDays: number | null;
  trackingType: 'BOOLEAN' | 'COUNT' | 'DURATION';
  direction: 'BUILD' | 'LIMIT' | 'AVOID';
  targetValue: number | null;
  unit: string | null;
  timeOfDay: 'MORNING' | 'AFTERNOON' | 'EVENING' | 'NIGHT' | 'ANYTIME' | null;
  icon: string | null;
  color: string | null;
  sortOrder: number;
  definitionId: string | null;
  startDelayDays: number;
}

export interface StarterPackContent {
  version: 1;
  source: string;
  habits: StarterPackContentHabit[];
}

/**
 * Resolve the pack into the JSON stored on the `Template` row.
 *
 * `definitionsBySlug` is the catalogue as it exists **in this database**, so a
 * definition that has not been seeded leaves `definitionId: null` and the habit
 * is created as fully custom. That is not a degraded mode — custom habits are
 * first-class — it just means no catalogue badge on that one row.
 */
export function buildStarterPackContent(
  definitionsBySlug: ReadonlyMap<string, {
    id: string;
    description: string | null;
    category: string | null;
    tier: string;
    frequencyType: HabitFrequencyType;
    frequencyValue: string | null;
    intervalDays: number | null;
    trackingType: string;
    direction: string;
    targetValue: number | null;
    unit: string | null;
    timeOfDay: string | null;
    icon: string | null;
    color: string | null;
  }>
): StarterPackContent {
  const seeds = new Map(HABIT_CATALOG_SEED.map((s) => [s.slug, s]));

  const habits: StarterPackContentHabit[] = STARTER_PACK.habits.map((entry) => {
    const def = definitionsBySlug.get(entry.slug);
    const seed = seeds.get(entry.slug);

    // Overrides win over the catalogue suggestion. This is where "15,000 steps
    // for this pack" lives — as a suggestion on the pack, not a rule anywhere.
    const o = entry.overrides ?? {};

    return {
      name: entry.name,
      description: seed?.description ?? def?.description ?? null,
      category: seed?.category ?? def?.category ?? null,
      tier: entry.tier,
      frequencyType: o.frequencyType ?? def?.frequencyType ?? 'DAILY',      frequencyValue:
        o.frequencyValue !== undefined ? o.frequencyValue : (def?.frequencyValue ?? null),
      intervalDays:
        o.intervalDays !== undefined ? o.intervalDays : (def?.intervalDays ?? null),
      trackingType: o.trackingType ?? (def?.trackingType as 'BOOLEAN') ?? 'BOOLEAN',
      direction: o.direction ?? (def?.direction as 'BUILD') ?? 'BUILD',
      targetValue:
        o.targetValue !== undefined ? o.targetValue : (def?.targetValue ?? null),
      unit: o.unit !== undefined ? o.unit : (def?.unit ?? null),
      timeOfDay: (o.timeOfDay ?? (def?.timeOfDay as 'MORNING')) ?? null,
      icon: seed?.icon ?? def?.icon ?? null,
      color: seed?.color ?? def?.color ?? null,
      sortOrder: entry.sortOrder,
      definitionId: def?.id ?? null,
      startDelayDays: entry.startDelayDays,
    };
  });

  return {
    version: 1,
    source: 'starter-pack/daily-essentials',
    habits,
  };
}
