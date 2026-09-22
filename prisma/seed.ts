/* eslint-disable no-console */
/**
 * RoutineOS — Database Seed  (prisma/seed.ts)
 *
 * Seeds YOUR real routine: categories, routine templates (college / weekend /
 * holiday / rest day), habits (non-negotiable / growth / bonus), minimum-day
 * checklist, goal -> project -> milestone -> task hierarchy, user settings,
 * streak row and a few quotes.
 *
 * Safe by design:
 *   - Idempotent: re-running never creates duplicates (everything is "ensure by name").
 *   - Never touches other users. Never deletes anything unless you pass --reset.
 *   - Existing password is never changed.
 *
 * Usage:
 *   1. In .env add:   SEED_USER_EMAIL=you@example.com
 *      (optional)     SEED_USER_PASSWORD=...  SEED_USER_NAME=...  SEED_USER_ROLE=ADMIN
 *   2. npm run db:seed
 *
 * Flags (pass after --):
 *   npm run db:seed -- --email=you@example.com   override SEED_USER_EMAIL
 *   npm run db:seed -- --reset                   wipe THIS user's routine templates,
 *                                                habits (+logs), goals, projects, tasks,
 *                                                categories, quotes, then re-seed
 */

import { randomBytes } from 'node:crypto';
import { config as loadEnv } from 'dotenv';
import bcrypt from 'bcryptjs';
import { PrismaPg } from '@prisma/adapter-pg';
import {
  DayType,
  GoalPriority,
  GoalStatus,
  GoalType,
  HabitFrequencyType,
  HabitStatus,
  HabitTier,
  PrismaClient,
  ProjectStatus,
  Role,
  TaskPriority,
  TaskStatus,
} from '../src/generated/prisma/client';

// Same precedence as Next.js: .env.local wins over .env (dotenv never overrides already-set vars).
loadEnv({ path: '.env.local', quiet: true });
loadEnv({ path: '.env', quiet: true });

// ============================================================================
// CLI
// ============================================================================

const argv = process.argv.slice(2);
const hasFlag = (name: string): boolean => argv.includes(`--${name}`);
const getArg = (name: string): string | undefined => {
  const prefix = `--${name}=`;
  const hit = argv.find((a) => a.startsWith(prefix));
  return hit ? hit.slice(prefix.length) : undefined;
};

const RESET = hasFlag('reset');

// ============================================================================
// CONFIG  (edit freely — everything below is plain data)
// ============================================================================

const TIMEZONE = 'Asia/Kolkata';
const IST_OFFSET_MS = 330 * 60 * 1000; // IST has no DST
const DAY_MS = 24 * 60 * 60 * 1000;

/** Prisma HabitTier names that mean "non-negotiable" (first one that exists in your schema wins). */
const CORE_TIER_CANDIDATES = ['NON_NEGOTIABLE', 'CORE'];

type CategoryKey =
  | 'HEALTH'
  | 'GATE'
  | 'DSA'
  | 'WEB_AI'
  | 'SSB'
  | 'COLLEGE'
  | 'PERSONAL'
  | 'JOB_APPLY';

const CATEGORIES: Record<
  CategoryKey,
  { name: string; description: string; color: string; icon: string; sortOrder: number }
> = {
  HEALTH: {
    name: 'Health',
    description: 'Workout, running, gym, sports, sunlight, recovery',
    color: '#10b981',
    icon: '💪',
    sortOrder: 1,
  },
  GATE: {
    name: 'GATE',
    description: 'GATE preparation — morning and evening study blocks',
    color: '#3b82f6',
    icon: '🎓',
    sortOrder: 2,
  },
  DSA: {
    name: 'DSA',
    description: 'Problem solving, LeetCode, topic-based practice',
    color: '#8b5cf6',
    icon: '🧩',
    sortOrder: 3,
  },
  WEB_AI: {
    name: 'Web Dev / AI',
    description: 'Web development, AI/ML learning and projects',
    color: '#06b6d4',
    icon: '💻',
    sortOrder: 4,
  },
  SSB: {
    name: 'SSB',
    description: 'SSB and OIR preparation',
    color: '#ef4444',
    icon: '🎖️',
    sortOrder: 5,
  },
  COLLEGE: {
    name: 'College',
    description: 'Classes, travel and college preparation',
    color: '#f59e0b',
    icon: '🏫',
    sortOrder: 6,
  },
  PERSONAL: {
    name: 'Personal',
    description: 'Meals, planning, review, reading, resets and life management',
    color: '#64748b',
    icon: '🧘',
    sortOrder: 7,
  },
  JOB_APPLY: {
    name: 'Job Apply',
    description: 'Resume, applications and job search',
    color: '#ec4899',
    icon: '💼',
    sortOrder: 8,
  },
};

// ============================================================================
// ROUTINE TEMPLATES
// ============================================================================

type Energy = 'HIGH' | 'MEDIUM' | 'LOW';

interface BlockSeed {
  start: string; // HH:mm
  end: string; // HH:mm
  title: string;
  category: CategoryKey;
  energy: Energy;
  track: boolean;
  icon: string;
  description?: string;
  isSleep?: boolean;
}

const block = (
  start: string,
  end: string,
  title: string,
  category: CategoryKey,
  energy: Energy,
  track: boolean,
  icon: string,
  description?: string,
): BlockSeed => ({ start, end, title, category, energy, track, icon, description });

const sleepBlock = (wakeTime: string): BlockSeed => ({
  start: '00:00',
  end: wakeTime,
  title: 'Sleep',
  category: 'PERSONAL',
  energy: 'LOW',
  track: false,
  icon: '😴',
  description: 'Sleep is tracked in the Sleep log, not as a routine checkbox',
  isSleep: true,
});

interface TemplateSeed {
  name: string;
  description: string;
  dayType: DayType;
  color: string;
  icon: string;
  blocks: BlockSeed[];
}

const ROUTINE_TEMPLATES: TemplateSeed[] = [
  {
    // Your actual routine, exactly as planned.
    name: 'College Day',
    description: 'College -> DSA -> GATE -> Web/AI/Projects -> SSB',
    dayType: DayType.WORKDAY,
    color: '#3b82f6',
    icon: '🏫',
    blocks: [
      sleepBlock('05:00'),
      block('05:00', '05:15', 'Wake up', 'PERSONAL', 'MEDIUM', true, '⏰', 'Wake up on time'),
      block('05:15', '06:30', 'Workout', 'HEALTH', 'HIGH', true, '🏃', 'Running / Gym / Sports'),
      block('06:30', '07:15', 'Get ready + breakfast', 'PERSONAL', 'MEDIUM', false, '🍳'),
      block('07:15', '08:00', 'GATE — Morning', 'GATE', 'HIGH', true, '🎓'),
      block('08:00', '09:00', 'Get ready / travel / college prep', 'COLLEGE', 'MEDIUM', false, '🚌'),
      block('09:00', '13:00', 'College', 'COLLEGE', 'MEDIUM', true, '🏫'),
      block('13:00', '14:00', 'Lunch + travel / recovery', 'PERSONAL', 'LOW', false, '🍽️'),
      block('14:00', '14:30', 'Nap', 'HEALTH', 'LOW', false, '💤'),
      block('14:30', '17:30', 'DSA', 'DSA', 'HIGH', true, '🧩', 'Problem solving, LeetCode, topic-based practice'),
      block('17:30', '18:00', 'Break / recovery', 'PERSONAL', 'LOW', false, '☕'),
      block('18:00', '20:00', 'GATE — Evening', 'GATE', 'HIGH', true, '📚'),
      block('20:00', '21:00', 'Dinner + break', 'PERSONAL', 'LOW', false, '🍛'),
      block('21:00', '23:00', 'Web Dev / AI / Projects', 'WEB_AI', 'MEDIUM', true, '💻'),
      block('23:00', '00:00', 'SSB / OIR', 'SSB', 'MEDIUM', true, '🎖️', 'OIR and SSB preparation'),
    ],
  },
  {
    name: 'Weekend Routine',
    description: 'Flexible Saturday/Sunday — deep work + weekly planning, review and reset',
    dayType: DayType.WEEKEND,
    color: '#10b981',
    icon: '🌴',
    blocks: [
      sleepBlock('06:00'),
      block('06:00', '06:15', 'Wake up', 'PERSONAL', 'MEDIUM', true, '⏰'),
      block('06:15', '07:30', 'Run / Gym / Sports', 'HEALTH', 'HIGH', true, '🏃'),
      block('07:30', '08:30', 'Get ready + breakfast', 'PERSONAL', 'MEDIUM', false, '🍳'),
      block('08:30', '11:30', 'GATE — Deep Work', 'GATE', 'HIGH', true, '🎓'),
      block(
        '11:30',
        '12:30',
        'Planning / Review / Reset',
        'PERSONAL',
        'MEDIUM',
        true,
        '🗓️',
        'Sunday: review last week, plan next week, reset room + workspace',
      ),
      block('12:30', '13:30', 'Lunch + recovery', 'PERSONAL', 'LOW', false, '🍽️'),
      block('13:30', '14:00', 'Nap', 'HEALTH', 'LOW', false, '💤'),
      block('14:00', '17:00', 'DSA', 'DSA', 'HIGH', true, '🧩'),
      block('17:00', '18:00', 'Sports / walk / recovery', 'HEALTH', 'LOW', false, '⚽'),
      block('18:00', '20:00', 'GATE — Revision', 'GATE', 'HIGH', true, '📚'),
      block('20:00', '21:00', 'Dinner + break', 'PERSONAL', 'LOW', false, '🍛'),
      block('21:00', '23:00', 'Web Dev / AI / Projects', 'WEB_AI', 'MEDIUM', true, '💻'),
      block('23:00', '00:00', 'SSB / OIR', 'SSB', 'MEDIUM', true, '🎖️'),
    ],
  },
  {
    name: 'Holiday Routine',
    description: 'Longer deep-work blocks: GATE + DSA + Projects + skill development',
    dayType: DayType.HOLIDAY,
    color: '#f59e0b',
    icon: '🏖️',
    blocks: [
      sleepBlock('05:30'),
      block('05:30', '05:45', 'Wake up', 'PERSONAL', 'MEDIUM', true, '⏰'),
      block('05:45', '07:00', 'Workout', 'HEALTH', 'HIGH', true, '🏃'),
      block('07:00', '08:00', 'Get ready + breakfast', 'PERSONAL', 'MEDIUM', false, '🍳'),
      block('08:00', '12:00', 'GATE — Deep Work', 'GATE', 'HIGH', true, '🎓'),
      block('12:00', '13:00', 'Lunch + recovery', 'PERSONAL', 'LOW', false, '🍽️'),
      block('13:00', '13:30', 'Nap', 'HEALTH', 'LOW', false, '💤'),
      block('13:30', '17:30', 'DSA — Deep Work', 'DSA', 'HIGH', true, '🧩'),
      block('17:30', '18:30', 'Break / walk / sports', 'HEALTH', 'LOW', false, '⚽'),
      block('18:30', '20:30', 'Projects / Skill Development', 'WEB_AI', 'HIGH', true, '💻'),
      block('20:30', '21:30', 'Dinner + break', 'PERSONAL', 'LOW', false, '🍛'),
      block('21:30', '23:00', 'GATE — Revision / Mock Test', 'GATE', 'MEDIUM', true, '📚'),
      block('23:00', '00:00', 'SSB / OIR', 'SSB', 'MEDIUM', true, '🎖️'),
    ],
  },
  {
    name: 'Rest Day',
    description: 'Intentional recovery day — light revision, no pressure',
    dayType: DayType.LOW_ENERGY,
    color: '#8b5cf6',
    icon: '🛌',
    blocks: [
      sleepBlock('07:00'),
      block('07:00', '07:30', 'Slow wake-up + sunlight', 'PERSONAL', 'LOW', false, '🌤️'),
      block('07:30', '08:30', 'Light walk / stretching', 'HEALTH', 'LOW', false, '🚶'),
      block('08:30', '09:30', 'Breakfast + room reset', 'PERSONAL', 'LOW', false, '🍳'),
      block('09:30', '11:00', 'Light GATE revision', 'GATE', 'LOW', false, '📚'),
      block('11:00', '13:00', 'Free time / hobbies', 'PERSONAL', 'LOW', false, '🎨'),
      block('13:00', '14:00', 'Lunch', 'PERSONAL', 'LOW', false, '🍽️'),
      block('14:00', '14:30', 'Nap', 'HEALTH', 'LOW', false, '💤'),
      block('14:30', '16:00', 'Light DSA (revision / 1–2 problems)', 'DSA', 'LOW', false, '🧩'),
      block('16:00', '20:00', 'Free time / recovery', 'PERSONAL', 'LOW', false, '☕'),
      block('20:00', '21:00', 'Dinner + break', 'PERSONAL', 'LOW', false, '🍛'),
      block('21:00', '22:00', 'Reflection + plan tomorrow', 'PERSONAL', 'LOW', true, '📝'),
      block('22:00', '00:00', 'Wind down', 'PERSONAL', 'LOW', false, '🌙'),
    ],
  },
];

// ============================================================================
// HABITS  (routine = scheduled blocks, habits = repeatable behaviours)
// Scoring weights come from UserSettings: non-negotiable 1 / growth 0.5 / bonus 0.25
// (Habit.points is left null so the tier default applies.)
// ============================================================================

type TierKey = 'CORE' | 'GROWTH' | 'BONUS';

interface HabitSeed {
  name: string;
  description: string;
  tier: TierKey;
  category: CategoryKey;
  frequencyType: HabitFrequencyType;
  frequencyValue?: string; // "0" = Sunday ... "6" = Saturday; "3" = 3x per week
  targetCount?: number;
  estimatedDuration?: number; // minutes
  difficulty: number; // 1-5
  icon: string;
}

const HABITS: HabitSeed[] = [
  // ---- Non-Negotiable (1 point) ----
  {
    name: 'Morning Workout',
    description: 'Running / gym / sports in the 5:15 AM block',
    tier: 'CORE',
    category: 'HEALTH',
    frequencyType: HabitFrequencyType.DAILY,
    estimatedDuration: 75,
    difficulty: 3,
    icon: '🏃',
  },
  {
    name: 'GATE Study',
    description: 'Morning 45 min + evening 2 h GATE blocks',
    tier: 'CORE',
    category: 'GATE',
    frequencyType: HabitFrequencyType.DAILY,
    estimatedDuration: 165,
    difficulty: 4,
    icon: '🎓',
  },
  {
    name: 'DSA Practice',
    description: 'Solve problems and review mistakes in the 2:30 PM block',
    tier: 'CORE',
    category: 'DSA',
    frequencyType: HabitFrequencyType.DAILY,
    targetCount: 3,
    estimatedDuration: 180,
    difficulty: 4,
    icon: '🧩',
  },

  // ---- Growth (0.5 point) ----
  {
    name: 'Web Dev / AI Session',
    description: 'Build, learn or ship something in the 9 PM block',
    tier: 'GROWTH',
    category: 'WEB_AI',
    frequencyType: HabitFrequencyType.DAILY,
    estimatedDuration: 120,
    difficulty: 3,
    icon: '💻',
  },
  {
    name: 'SSB / OIR Practice',
    description: 'OIR and SSB preparation before sleep',
    tier: 'GROWTH',
    category: 'SSB',
    frequencyType: HabitFrequencyType.DAILY,
    estimatedDuration: 60,
    difficulty: 2,
    icon: '🎖️',
  },
  {
    name: 'Daily Reading / News',
    description: 'Small daily personal-development reading or news',
    tier: 'GROWTH',
    category: 'PERSONAL',
    frequencyType: HabitFrequencyType.DAILY,
    estimatedDuration: 15,
    difficulty: 1,
    icon: '📰',
  },
  {
    name: 'Morning Sunlight',
    description: 'Get some sunlight early in the day',
    tier: 'GROWTH',
    category: 'HEALTH',
    frequencyType: HabitFrequencyType.DAILY,
    estimatedDuration: 10,
    difficulty: 1,
    icon: '☀️',
  },
  {
    name: 'Phone Control',
    description: 'Keep unnecessary phone use from eating the routine',
    tier: 'GROWTH',
    category: 'PERSONAL',
    frequencyType: HabitFrequencyType.DAILY,
    difficulty: 3,
    icon: '📵',
  },
  {
    name: 'Daily Planning',
    description: 'Plan tomorrow — what needs to happen, in what order',
    tier: 'GROWTH',
    category: 'PERSONAL',
    frequencyType: HabitFrequencyType.DAILY,
    estimatedDuration: 10,
    difficulty: 1,
    icon: '🗓️',
  },
  {
    name: 'Weekly Review',
    description: 'Sunday: review the last week and prepare the next one',
    tier: 'GROWTH',
    category: 'PERSONAL',
    frequencyType: HabitFrequencyType.SPECIFIC_WEEKDAYS,
    frequencyValue: '0',
    estimatedDuration: 45,
    difficulty: 2,
    icon: '🔁',
  },

  // ---- Bonus (0.25 point) ----
  {
    name: 'Room & Workspace Reset',
    description: 'Quick reset of room, desk and general environment',
    tier: 'BONUS',
    category: 'PERSONAL',
    frequencyType: HabitFrequencyType.DAILY,
    estimatedDuration: 10,
    difficulty: 1,
    icon: '🧹',
  },
  {
    name: 'Creative Time',
    description: 'Keep some space for creative activity',
    tier: 'BONUS',
    category: 'PERSONAL',
    frequencyType: HabitFrequencyType.WEEKLY_TARGET,
    frequencyValue: '3',
    estimatedDuration: 30,
    difficulty: 2,
    icon: '🎨',
  },
  {
    name: 'Discomfort Challenge',
    description: 'Deliberately do one uncomfortable thing to build discipline',
    tier: 'BONUS',
    category: 'PERSONAL',
    frequencyType: HabitFrequencyType.WEEKLY_TARGET,
    frequencyValue: '2',
    estimatedDuration: 15,
    difficulty: 3,
    icon: '🧊',
  },
];

/** Minimum Day = reduced checklist of exactly 5 items (names must exist in HABITS). */
const MINIMUM_DAY_HABITS = [
  'Morning Workout',
  'GATE Study',
  'DSA Practice',
  'Daily Planning',
  'Morning Sunlight',
];

// ============================================================================
// GOAL -> PROJECT -> MILESTONES -> TASKS   (monthly goals for the current IST month)
// ============================================================================

interface TaskSeed {
  title: string;
  description?: string;
  priority: TaskPriority;
  dueInDays: number;
}

interface ProjectSeed {
  name: string;
  description: string;
  category: CategoryKey;
  priority: GoalPriority;
  icon: string;
  goal: { title: string; description: string; targetValue: number; unit: string };
  tasks: TaskSeed[];
}

const MILESTONE_STEPS = [0.25, 0.5, 0.75, 1];

const PROJECTS: ProjectSeed[] = [
  {
    name: 'GATE Preparation',
    description: 'Consistent daily GATE study — morning and evening blocks',
    category: 'GATE',
    priority: GoalPriority.ACADEMIC,
    icon: '🎓',
    goal: {
      title: 'GATE study hours',
      description: 'Roughly 2h45m of GATE study every day',
      targetValue: 80,
      unit: 'hours',
    },
    tasks: [
      { title: 'Build a subject-wise GATE syllabus tracker', priority: TaskPriority.HIGH, dueInDays: 5 },
      { title: 'Attempt a full-length GATE mock test', priority: TaskPriority.HIGH, dueInDays: 14 },
    ],
  },
  {
    name: 'DSA Mastery',
    description: 'Problem solving, LeetCode and topic-based practice',
    category: 'DSA',
    priority: GoalPriority.HIGH,
    icon: '🧩',
    goal: {
      title: 'Solve 90 DSA problems',
      description: 'About 3 problems a day, with review of mistakes',
      targetValue: 90,
      unit: 'problems',
    },
    tasks: [
      { title: 'Set up a topic-wise DSA problem tracker', priority: TaskPriority.MEDIUM, dueInDays: 3 },
      { title: 'Finish one complete topic sheet end to end', priority: TaskPriority.HIGH, dueInDays: 10 },
    ],
  },
  {
    name: 'Web Dev & AI Portfolio',
    description: 'Build and ship projects in the 9–11 PM block',
    category: 'WEB_AI',
    priority: GoalPriority.PROFESSIONAL,
    icon: '💻',
    goal: {
      title: 'Web Dev / AI build hours',
      description: 'Two focused hours a day on projects and AI/ML learning',
      targetValue: 60,
      unit: 'hours',
    },
    tasks: [
      { title: 'Choose the next project to ship', priority: TaskPriority.MEDIUM, dueInDays: 3 },
      { title: 'Deploy and document one project (README + demo)', priority: TaskPriority.HIGH, dueInDays: 14 },
    ],
  },
  {
    name: 'Job Applications',
    description: 'Resume, profiles and consistent applications',
    category: 'JOB_APPLY',
    priority: GoalPriority.PROFESSIONAL,
    icon: '💼',
    goal: {
      title: 'Send job applications',
      description: 'Targeted applications, tracked in one place',
      targetValue: 20,
      unit: 'applications',
    },
    tasks: [
      { title: 'Update resume, GitHub and LinkedIn', priority: TaskPriority.HIGH, dueInDays: 7 },
      { title: 'Shortlist 20 target companies', priority: TaskPriority.MEDIUM, dueInDays: 10 },
    ],
  },
  {
    name: 'SSB / OIR Preparation',
    description: 'Steady OIR and SSB preparation before sleep',
    category: 'SSB',
    priority: GoalPriority.HIGH,
    icon: '🎖️',
    goal: {
      title: 'OIR practice sessions',
      description: 'Regular OIR practice, timed where possible',
      targetValue: 20,
      unit: 'sessions',
    },
    tasks: [
      { title: 'Collect OIR practice sets', priority: TaskPriority.MEDIUM, dueInDays: 5 },
      { title: 'Take a first timed OIR test', priority: TaskPriority.MEDIUM, dueInDays: 12 },
    ],
  },
  {
    name: 'Fitness & Health',
    description: 'Running + gym + sports — sustainable consistency',
    category: 'HEALTH',
    priority: GoalPriority.PERSONAL,
    icon: '💪',
    goal: {
      title: 'Workouts completed',
      description: 'Morning workouts across running, gym and sports',
      targetValue: 24,
      unit: 'workouts',
    },
    tasks: [
      { title: 'Decide the weekly run / gym / sports split', priority: TaskPriority.MEDIUM, dueInDays: 3 },
      { title: 'Log a baseline run time and weight', priority: TaskPriority.LOW, dueInDays: 7 },
    ],
  },
];

// ============================================================================
// QUOTES
// ============================================================================

const QUOTES: Array<{ text: string; author?: string; source?: string; isFavorite?: boolean }> = [
  { text: 'Consistency over perfection.', author: 'RoutineOS', isFavorite: true },
  { text: 'Missed is not failed. Reset and go again.', author: 'RoutineOS', isFavorite: true },
  { text: 'Action beats analytics.', author: 'RoutineOS' },
  { text: 'A minimum day still counts.', author: 'RoutineOS' },
  {
    text: 'You do not rise to the level of your goals. You fall to the level of your systems.',
    author: 'James Clear',
    source: 'Atomic Habits',
  },
];

// ============================================================================
// HELPERS
// ============================================================================

const normalizeName = (name: string): string => name.trim().toLowerCase();

function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
}

/** End <= start means the block crosses midnight (e.g. 23:00 -> 00:00). */
const crossesMidnight = (start: string, end: string): boolean => toMinutes(end) <= toMinutes(start);

function durationMinutes(start: string, end: string): number {
  const diff = toMinutes(end) - toMinutes(start);
  return diff > 0 ? diff : diff + 24 * 60;
}

function istMonthBounds(now: Date = new Date()): { start: Date; end: Date } {
  const ist = new Date(now.getTime() + IST_OFFSET_MS);
  const year = ist.getUTCFullYear();
  const month = ist.getUTCMonth();
  return {
    start: new Date(Date.UTC(year, month, 1) - IST_OFFSET_MS),
    end: new Date(Date.UTC(year, month + 1, 1) - IST_OFFSET_MS - 1),
  };
}

function must<T>(map: Map<string, T>, key: string, label: string): T {
  const value = map.get(key);
  if (value === undefined) throw new Error(`Seed bug: ${label} "${key}" not found`);
  return value;
}

function parseRole(value: string | undefined): Role | undefined {
  if (!value || !value.trim()) return undefined;
  const upper = value.trim().toUpperCase();
  if (!(Object.values(Role) as string[]).includes(upper)) {
    throw new Error(`SEED_USER_ROLE "${value}" is invalid. Use one of: ${Object.values(Role).join(', ')}`);
  }
  return upper as Role;
}

function resolveEmail(): string {
  const email = (getArg('email') ?? process.env.SEED_USER_EMAIL ?? '').trim().toLowerCase();
  if (!email) {
    throw new Error(
      'No seed user email. Add SEED_USER_EMAIL=you@example.com to .env (use the same email you log in / register with), ' +
        'or run: npm run db:seed -- --email=you@example.com',
    );
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error(`"${email}" is not a valid email address`);
  }
  return email;
}

function resolveCoreTier(): HabitTier {
  const tiers = HabitTier as Record<string, HabitTier>;
  const found = CORE_TIER_CANDIDATES.map((key) => tiers[key]).find(Boolean);
  if (found) return found;

  console.warn(
    `⚠️  HabitTier enum has no ${CORE_TIER_CANDIDATES.join(' / ')} value. ` +
      'Non-negotiable habits will be seeded as GROWTH (weight 0.5).\n' +
      '    Fix: add NON_NEGOTIABLE to `enum HabitTier` in schema.prisma, run `npm run db:push` and `npm run db:generate`, ' +
      'then `npm run db:seed -- --reset`.',
  );
  return HabitTier.GROWTH;
}

type Db = PrismaClient;

// ============================================================================
// SEED STEPS
// ============================================================================

async function ensureUser(prisma: Db, email: string) {
  const roleOverride = parseRole(process.env.SEED_USER_ROLE);
  const existing = await prisma.user.findUnique({ where: { email } });

  if (existing) {
    if (existing.isDeleted) {
      throw new Error(`User ${email} is marked as deleted. Use a different email or restore the account first.`);
    }
    const user = await prisma.user.update({
      where: { id: existing.id },
      data: {
        timezone: TIMEZONE,
        emailVerified: existing.emailVerified ?? new Date(),
        onboardingCompletedAt: existing.onboardingCompletedAt ?? new Date(),
        ...(roleOverride ? { role: roleOverride } : {}),
      },
    });
    return { user, created: false, generatedPassword: null as string | null };
  }

  const envPassword = process.env.SEED_USER_PASSWORD;
  const generatedPassword = envPassword ? null : `${randomBytes(9).toString('base64url')}aA1!`;
  const password = envPassword ?? (generatedPassword as string);
  const name = process.env.SEED_USER_NAME?.trim() || email.split('@')[0] || 'RoutineOS User';

  const user = await prisma.user.create({
    data: {
      email,
      name,
      displayName: name,
      passwordHash: await bcrypt.hash(password, 12),
      role: roleOverride ?? Role.ADMIN,
      timezone: TIMEZONE,
      preferredLanguage: 'en',
      emailVerified: new Date(),
      onboardingCompletedAt: new Date(),
      isActive: true,
    },
  });
  return { user, created: true, generatedPassword };
}

async function resetUserData(prisma: Db, userId: string): Promise<void> {
  console.log('🧨 --reset: removing this user\'s routine templates, habits (+logs), goals, projects, tasks, categories, quotes...');
  await prisma.taskDependency.deleteMany({
    where: { OR: [{ task: { userId } }, { dependsOn: { userId } }] },
  });
  await prisma.task.deleteMany({ where: { userId } });
  await prisma.goal.deleteMany({ where: { userId } });
  await prisma.project.deleteMany({ where: { userId } });
  await prisma.habit.deleteMany({ where: { userId } });
  await prisma.minimumDayTemplate.deleteMany({ where: { userId } });
  await prisma.routineTemplate.deleteMany({ where: { userId } });
  await prisma.category.deleteMany({ where: { userId } });
  await prisma.quote.deleteMany({ where: { userId } });
}

async function seedSettings(prisma: Db, userId: string): Promise<void> {
  const data = {
    timezone: TIMEZONE,
    language: 'en',
    weekStartsOn: 1, // Monday
    defaultView: 'dashboard',

    // Sleep (bed 12:00 AM, wake 5:00 AM per routine; 7 h is the target minimum)
    targetBedtime: '00:00',
    targetWakeTime: '05:00',
    minSleepDuration: 420,
    sleepReminder: true,
    sleepReminderTime: '23:45',

    // Scoring weights: non-negotiable 1 / growth 0.5 / bonus 0.25
    weightNonNeg: 1.0,
    weightGrowth: 0.5,
    weightBonus: 0.25,

    // Reminders
    notificationsEnabled: true,
    dailyReminder: true,
    dailyReminderTime: '23:30',
    habitReminders: true,
    goalReminders: true,
    weeklyReviewReminder: true,
    monthlyResetReminder: true,
    quietHoursStart: '00:00',
    quietHoursEnd: '05:00',

    aiInsightsEnabled: true,
  };

  await prisma.userSettings.upsert({
    where: { userId },
    update: RESET ? data : {},
    create: { userId, ...data },
  });
  await prisma.streak.upsert({ where: { userId }, update: {}, create: { userId } });
}

async function seedCategories(prisma: Db, userId: string): Promise<Map<string, string>> {
  const ids = new Map<string, string>();
  for (const key of Object.keys(CATEGORIES) as CategoryKey[]) {
    const c = CATEGORIES[key];
    const nameNormalized = normalizeName(c.name);
    const category = await prisma.category.upsert({
      where: { userId_nameNormalized: { userId, nameNormalized } },
      update: {},
      create: {
        userId,
        name: c.name,
        nameNormalized,
        description: c.description,
        color: c.color,
        icon: c.icon,
        sortOrder: c.sortOrder,
      },
    });
    ids.set(key, category.id);
  }
  return ids;
}

async function seedRoutineTemplates(
  prisma: Db,
  userId: string,
  categoryIds: Map<string, string>,
): Promise<{ templates: number; blocks: number }> {
  let templates = 0;
  let blocks = 0;

  for (const t of ROUTINE_TEMPLATES) {
    const existing = await prisma.routineTemplate.findFirst({
      where: { userId, name: t.name },
      include: { _count: { select: { blocks: true } } },
    });

    let templateId: string;
    let existingBlocks = 0;

    if (existing) {
      templateId = existing.id;
      existingBlocks = existing._count.blocks;
    } else {
      const hasDefault = await prisma.routineTemplate.count({
        where: { userId, dayType: t.dayType, isDefault: true },
      });
      const estimatedDuration = t.blocks
        .filter((b) => !b.isSleep)
        .reduce((sum, b) => sum + durationMinutes(b.start, b.end), 0);
      const created = await prisma.routineTemplate.create({
        data: {
          userId,
          name: t.name,
          description: t.description,
          dayType: t.dayType,
          isDefault: hasDefault === 0,
          isActive: true,
          color: t.color,
          icon: t.icon,
          estimatedDuration,
        },
      });
      templateId = created.id;
      templates += 1;
    }

    // Blocks are only written when the template has none, so logs on existing blocks are never wiped.
    if (existingBlocks === 0) {
      await prisma.routineBlock.createMany({
        data: t.blocks.map((b, index) => ({
          userId,
          templateId,
          startTime: b.start,
          endTime: b.end,
          isOvernight: crossesMidnight(b.start, b.end),
          title: b.title,
          description: b.description ?? null,
          sortOrder: index,
          color: CATEGORIES[b.category].color,
          icon: b.icon,
          categoryId: must(categoryIds, b.category, 'category'),
          energyLevel: b.energy,
          trackCompletion: b.track,
          isRecurring: true,
        })),
      });
      blocks += t.blocks.length;
    }
  }

  return { templates, blocks };
}

async function seedHabits(
  prisma: Db,
  userId: string,
  categoryIds: Map<string, string>,
  coreTier: HabitTier,
): Promise<{ habitIds: Map<string, string>; created: number }> {
  const tierMap: Record<TierKey, HabitTier> = {
    CORE: coreTier,
    GROWTH: HabitTier.GROWTH,
    BONUS: HabitTier.BONUS,
  };
  const habitIds = new Map<string, string>();
  let created = 0;

  for (const h of HABITS) {
    const existing = await prisma.habit.findFirst({
      where: { userId, name: h.name },
      select: { id: true },
    });
    if (existing) {
      habitIds.set(h.name, existing.id);
      continue;
    }

    const habit = await prisma.habit.create({
      data: {
        userId,
        name: h.name,
        description: h.description,
        tier: tierMap[h.tier],
        status: HabitStatus.ACTIVE,
        categoryId: must(categoryIds, h.category, 'category'),
        color: CATEGORIES[h.category].color,
        icon: h.icon,
        frequencyType: h.frequencyType,
        frequencyValue: h.frequencyValue ?? null,
        targetCount: h.targetCount ?? null,
        estimatedDuration: h.estimatedDuration ?? null,
        difficulty: h.difficulty,
      },
    });
    habitIds.set(h.name, habit.id);
    created += 1;
  }

  return { habitIds, created };
}

async function seedMinimumDay(prisma: Db, userId: string, habitIds: Map<string, string>): Promise<void> {
  const name = 'Minimum Day';
  const existing = await prisma.minimumDayTemplate.findFirst({ where: { userId, name } });
  const hasDefault = existing ? 1 : await prisma.minimumDayTemplate.count({ where: { userId, isDefault: true } });

  const template =
    existing ??
    (await prisma.minimumDayTemplate.create({
      data: {
        userId,
        name,
        description: 'Reduced 5-item checklist for days when the full routine is not possible',
        isDefault: hasDefault === 0,
      },
    }));

  await prisma.minimumDayTemplateHabit.createMany({
    data: MINIMUM_DAY_HABITS.map((habitName, index) => ({
      templateId: template.id,
      habitId: must(habitIds, habitName, 'habit'),
      sortOrder: index,
    })),
    skipDuplicates: true,
  });
}

async function seedProjectsAndGoals(
  prisma: Db,
  userId: string,
  categoryIds: Map<string, string>,
): Promise<{ projects: number; goals: number; milestones: number; tasks: number }> {
  const month = istMonthBounds();
  const monthSpan = month.end.getTime() - month.start.getTime();
  const counts = { projects: 0, goals: 0, milestones: 0, tasks: 0 };

  for (const p of PROJECTS) {
    // Project
    const existingProject = await prisma.project.findFirst({ where: { userId, name: p.name } });
    const project =
      existingProject ??
      (await prisma.project.create({
        data: {
          userId,
          name: p.name,
          description: p.description,
          status: ProjectStatus.ACTIVE,
          priority: p.priority,
          categoryId: must(categoryIds, p.category, 'category'),
          color: CATEGORIES[p.category].color,
          icon: p.icon,
          startDate: month.start,
        },
      }));
    if (!existingProject) counts.projects += 1;

    // Goal (monthly, current IST month)
    const existingGoal = await prisma.goal.findFirst({
      where: { userId, title: p.goal.title, type: GoalType.MONTHLY, startDate: month.start },
    });
    const goal =
      existingGoal ??
      (await prisma.goal.create({
        data: {
          userId,
          projectId: project.id,
          type: GoalType.MONTHLY,
          priority: p.priority,
          status: GoalStatus.ACTIVE,
          title: p.goal.title,
          description: p.goal.description,
          targetValue: p.goal.targetValue,
          currentValue: 0,
          unit: p.goal.unit,
          startDate: month.start,
          endDate: month.end,
        },
      }));
    if (!existingGoal) counts.goals += 1;

    // Milestones: 25 / 50 / 75 / 100 % of the goal target
    const milestoneCount = await prisma.milestone.count({ where: { goalId: goal.id } });
    if (milestoneCount === 0) {
      await prisma.milestone.createMany({
        data: MILESTONE_STEPS.map((step, index) => {
          const value = Math.round(p.goal.targetValue * step);
          return {
            goalId: goal.id,
            title: `${Math.round(step * 100)}% — ${value} ${p.goal.unit}`,
            targetValue: value,
            dueDate: new Date(month.start.getTime() + step * monthSpan),
            sortOrder: index,
          };
        }),
      });
      counts.milestones += MILESTONE_STEPS.length;
    }

    // Tasks
    for (const t of p.tasks) {
      const existingTask = await prisma.task.findFirst({
        where: { userId, title: t.title },
        select: { id: true },
      });
      if (existingTask) continue;
      await prisma.task.create({
        data: {
          userId,
          title: t.title,
          description: t.description ?? null,
          status: TaskStatus.TODO,
          priority: t.priority,
          projectId: project.id,
          goalId: goal.id,
          dueDate: new Date(Date.now() + t.dueInDays * DAY_MS),
          isImportant: true,
        },
      });
      counts.tasks += 1;
    }
  }

  return counts;
}

async function seedQuotes(prisma: Db, userId: string): Promise<number> {
  let created = 0;
  for (const q of QUOTES) {
    const existing = await prisma.quote.findFirst({ where: { userId, text: q.text }, select: { id: true } });
    if (existing) continue;
    await prisma.quote.create({
      data: {
        userId,
        text: q.text,
        author: q.author ?? null,
        source: q.source ?? null,
        isFavorite: q.isFavorite ?? false,
        isPublic: false,
      },
    });
    created += 1;
  }
  return created;
}

// ============================================================================
// MAIN
// ============================================================================

async function main(): Promise<void> {
  const email = resolveEmail();

  // Seeding prefers the direct (unpooled) Neon connection, same as prisma.config.ts.
  const dbUrl = process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL;
  if (!dbUrl) {
    throw new Error('DATABASE_URL (or DATABASE_URL_UNPOOLED) is not set. Check your .env / .env.local.');
  }

  console.log(`🌱 RoutineOS seed  |  DB host: ${new URL(dbUrl).host}  |  user: ${email}${RESET ? '  |  --reset' : ''}`);

  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: dbUrl }) });

  try {
    const coreTier = resolveCoreTier();

    console.log('👤 User + settings');
    const { user, created, generatedPassword } = await ensureUser(prisma, email);
    if (RESET) await resetUserData(prisma, user.id);
    await seedSettings(prisma, user.id);

    console.log('📁 Categories');
    const categoryIds = await seedCategories(prisma, user.id);

    console.log('⏰ Routine templates + blocks');
    const routine = await seedRoutineTemplates(prisma, user.id, categoryIds);

    console.log('✅ Habits + Minimum Day');
    const { habitIds, created: habitsCreated } = await seedHabits(prisma, user.id, categoryIds, coreTier);
    await seedMinimumDay(prisma, user.id, habitIds);

    console.log('🎯 Projects, goals, milestones, tasks');
    const work = await seedProjectsAndGoals(prisma, user.id, categoryIds);

    console.log('💬 Quotes');
    const quotesCreated = await seedQuotes(prisma, user.id);

    console.log('\n✨ Seed complete');
    console.log(`   User            : ${created ? 'created' : 'already existed (kept, timezone/onboarding ensured)'} — ${user.email} [${user.role}]`);
    console.log(`   Categories      : ${Object.keys(CATEGORIES).length} ready`);
    console.log(`   Routine         : +${routine.templates} templates, +${routine.blocks} blocks`);
    console.log(`   Habits          : +${habitsCreated} new (${HABITS.length} total defined), Minimum Day = ${MINIMUM_DAY_HABITS.length} items`);
    console.log(`   Projects/Goals  : +${work.projects} projects, +${work.goals} goals, +${work.milestones} milestones, +${work.tasks} tasks`);
    console.log(`   Quotes          : +${quotesCreated}`);

    if (created) {
      console.log('\n🔐 New account created');
      console.log(`   Email    : ${user.email}`);
      console.log(
        generatedPassword
          ? `   Password : ${generatedPassword}   (generated — shown only once, change it after login)`
          : '   Password : the value of SEED_USER_PASSWORD',
      );
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error('\n❌ Seed failed:', error instanceof Error ? error.message : error);
  if (error instanceof Error && error.stack && process.env.DEBUG) console.error(error.stack);
  process.exitCode = 1;
});