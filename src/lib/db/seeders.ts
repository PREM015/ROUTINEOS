/**
 * Idempotent database seeders.
 *
 * Mirrors the logic of `prisma/seed.ts` (demo users, categories, quotes) but
 * runs against the shared Prisma singleton and is safe to call more than once
 * (upserts / existence checks). System-wide data (official templates, public
 * quotes) is seeded independently of any user.
 */

import { Role, TemplateType, type Prisma } from '@/generated/prisma';
import bcrypt from 'bcryptjs';
import prisma from '@/lib/prisma';
import { toUserId, type UserId } from '@/types/ids';

const DEFAULT_TIMEZONE = 'America/New_York';

export interface SeedUserInput {
  email: string;
  name?: string;
  displayName?: string;
  role?: Role;
  password?: string;
  timezone?: string;
  isActive?: boolean;
}

/**
 * Upsert a user by email, mirroring the demo/admin creation in `prisma/seed.ts`.
 * A password, when supplied, is bcrypt-hashed before persistence.
 */
export async function seedUser(input: SeedUserInput) {
  const passwordHash = input.password
    ? await bcrypt.hash(input.password, 12)
    : undefined;

  const base = {
    name: input.name ?? null,
    displayName: input.displayName ?? null,
    role: input.role ?? Role.USER,
    timezone: input.timezone ?? DEFAULT_TIMEZONE,
    isActive: input.isActive ?? true,
    emailVerified: new Date(),
    onboardingCompletedAt: new Date(),
  };

  return prisma.user.upsert({
    where: { email: input.email },
    update: {
      ...base,
      ...(passwordHash ? { passwordHash } : {}),
    },
    create: {
      email: input.email,
      ...base,
      ...(passwordHash ? { passwordHash } : {}),
    },
  });
}

export interface SeedCategoryInput {
  name: string;
  nameNormalized: string;
  description: string;
  color: string;
  icon: string;
  sortOrder: number;
}

/**
 * Default categories seeded per user — the standard RoutineOS set covering
 * health, study, build work, career and life admin. `nameNormalized` mirrors
 * `normalizeCategoryName` in `category.service.ts` (lowercase, spaces → `-`)
 * because that is what the `[userId, nameNormalized]` unique key compares on.
 */
export const DEFAULT_CATEGORIES: readonly SeedCategoryInput[] = [
  { name: 'Health', nameNormalized: 'health', description: 'Workout, sleep, meals, hygiene, recovery', color: '#10b981', icon: '🟢', sortOrder: 1 },
  { name: 'Learning', nameNormalized: 'learning', description: "General learning that isn't DSA/Web Dev", color: '#eab308', icon: '🟡', sortOrder: 2 },
  { name: 'DSA', nameNormalized: 'dsa', description: 'DSA concepts, LeetCode, problem solving', color: '#0ea5e9', icon: '🔷', sortOrder: 3 },
  { name: 'Web Dev / AI', nameNormalized: 'web-dev-/-ai', description: 'Coding, projects, AI learning, development', color: '#8b5cf6', icon: '🟣', sortOrder: 4 },
  { name: 'Career', nameNormalized: 'career', description: 'Resume, portfolio, interview prep, networking', color: '#3b82f6', icon: '🔵', sortOrder: 5 },
  { name: 'College', nameNormalized: 'college', description: 'Classes, assignments, labs, college work', color: '#a855f7', icon: '🟪', sortOrder: 6 },
  { name: 'Personal', nameNormalized: 'personal', description: 'Breaks, family, errands, personal activities', color: '#94a3b8', icon: '⚪', sortOrder: 7 },
  { name: 'Job Apply', nameNormalized: 'job-apply', description: 'Applications, job searching, recruiter outreach', color: '#f97316', icon: '🟠', sortOrder: 8 },
  { name: 'Plan & Review', nameNormalized: 'plan-&-review', description: 'Daily planning, weekly reviews, journaling, reflection', color: '#06b6d4', icon: '📅', sortOrder: 9 },
  { name: 'Chores / Home', nameNormalized: 'chores-/-home', description: 'Cooking, cleaning, laundry, room upkeep', color: '#ef4444', icon: '🧹', sortOrder: 10 },
  { name: 'Finance', nameNormalized: 'finance', description: 'Budgeting, expenses, payments, investments', color: '#22c55e', icon: '💰', sortOrder: 11 },
  { name: 'Recreation', nameNormalized: 'recreation', description: 'Hobbies, gaming, shows, leisure time', color: '#14b8a6', icon: '🎮', sortOrder: 12 },
  { name: 'Commute / Transit', nameNormalized: 'commute-/-transit', description: 'Travel to college, travel between places', color: '#38bdf8', icon: '✈️', sortOrder: 13 },
  { name: 'Social', nameNormalized: 'social', description: 'Friends, calls, catching up (non-career)', color: '#2dd4bf', icon: '💬', sortOrder: 14 },
  { name: 'Mental Wellbeing', nameNormalized: 'mental-wellbeing', description: 'Meditation, mindfulness, stress management, breathing exercises', color: '#7c3aed', icon: '🧘', sortOrder: 15 },
  { name: 'Reading', nameNormalized: 'reading', description: 'Books, novels, articles, non-study reading', color: '#f59e0b', icon: '📚', sortOrder: 16 },
  { name: 'Assignments / Projects', nameNormalized: 'assignments-/-projects', description: "Large academic/project deliverables that don't fit College or Web Dev / AI", color: '#f43f5e', icon: '📝', sortOrder: 17 },
  { name: 'Maintenance', nameNormalized: 'maintenance', description: 'Device maintenance, software updates, backups, organizing files', color: '#475569', icon: '🛠️', sortOrder: 18 },
  { name: 'Appointments', nameNormalized: 'appointments', description: 'Doctor, dentist, bank, government office visits', color: '#fb7185', icon: '🩺', sortOrder: 19 },
  { name: 'Errands', nameNormalized: 'errands', description: 'Shopping, groceries, collecting parcels', color: '#fbbf24', icon: '🛒', sortOrder: 20 },
  { name: 'Family', nameNormalized: 'family', description: 'Family responsibilities, events, helping at home', color: '#d946ef', icon: '🙏', sortOrder: 21 },
  { name: 'Experiments', nameNormalized: 'experiments', description: 'Trying new routines, tools, productivity experiments', color: '#84cc16', icon: '🧪', sortOrder: 22 },
  { name: 'Growth', nameNormalized: 'growth', description: 'Personal development, communication, discipline, confidence', color: '#4ade80', icon: '🌱', sortOrder: 23 },
  { name: 'Open Source', nameNormalized: 'open-source', description: 'GitHub issues/PRs, community projects', color: '#6366f1', icon: '🧑‍💻', sortOrder: 24 },
  { name: 'Internship / Part-time', nameNormalized: 'internship-/-part-time', description: 'Actual paid work or internship hours', color: '#0284c7', icon: '💼', sortOrder: 25 },
  { name: 'Communication', nameNormalized: 'communication', description: 'Email, messages, calls, DMs', color: '#7dd3fc', icon: '📧', sortOrder: 26 },
  { name: 'Travel / Trip', nameNormalized: 'travel-/-trip', description: 'Vacations, trips, outings', color: '#fdba74', icon: '🏖️', sortOrder: 27 },
  { name: 'Events / Meetups', nameNormalized: 'events-/-meetups', description: 'Workshops, hackathons, seminars', color: '#facc15', icon: '🎯', sortOrder: 28 },
  { name: 'Certification / Course', nameNormalized: 'certification-/-course', description: 'Structured courses, exams, certificates (Coursera, NPTEL)', color: '#a78bfa', icon: '🎓', sortOrder: 29 },
  { name: 'Design / Creative', nameNormalized: 'design-/-creative', description: 'Figma, UI design, art, video editing, music, photography', color: '#ec4899', icon: '🎨', sortOrder: 30 },
  { name: 'Content Creation', nameNormalized: 'content-creation', description: 'Blog, YouTube, LinkedIn posts, personal brand', color: '#e11d48', icon: '📢', sortOrder: 31 },
  { name: 'Freelance / Side Hustle', nameNormalized: 'freelance-/-side-hustle', description: 'Paid freelance work, side income', color: '#16a34a', icon: '💸', sortOrder: 32 },
  { name: 'Volunteering', nameNormalized: 'volunteering', description: 'Community service, NGO, event volunteering', color: '#5eead4', icon: '🤝', sortOrder: 33 },
  { name: 'College Admin', nameNormalized: 'college-admin', description: 'Forms, fees, documents, paperwork (vs actual classes)', color: '#c084fc', icon: '📋', sortOrder: 34 },
  { name: 'Ideas / Brainstorming', nameNormalized: 'ideas-/-brainstorming', description: 'Capturing ideas, planning future side projects', color: '#fde047', icon: '💡', sortOrder: 35 },
  { name: 'Typing / Skills Drills', nameNormalized: 'typing-/-skills-drills', description: 'Typing practice, speed drills, rote skill drills', color: '#a3e635', icon: '⌨️', sortOrder: 36 },
  { name: 'Sleep & Recovery', nameNormalized: 'sleep-&-recovery', description: 'Bed/wake time, naps, sleep quality', color: '#60a5fa', icon: '😴', sortOrder: 37 },
  { name: 'Focus / Deep Work', nameNormalized: 'focus-/-deep-work', description: 'Pomodoro & Focus Mode sessions, distraction-free blocks', color: '#2563eb', icon: '🧠', sortOrder: 38 },
  { name: 'Language Learning', nameNormalized: 'language-learning', description: 'Practicing a new language (distinct from general Learning)', color: '#34d399', icon: '🗣️', sortOrder: 39 },
  { name: 'Misc / Unsorted', nameNormalized: 'misc-/-unsorted', description: 'Anything that fits nowhere — prevents getting stuck when nothing matches', color: '#64748b', icon: '🎲', sortOrder: 40 },
];

/**
 * Upsert the default categories for a user keyed on the composite
 * `[userId, nameNormalized]` unique constraint. Returns the created/kept rows.
 */
export async function seedCategories(
  userId: UserId,
  categories: readonly SeedCategoryInput[] = DEFAULT_CATEGORIES
) {
  const results: Awaited<ReturnType<typeof seedCategory>>[] = [];
  for (const category of categories) {
    results.push(await seedCategory(userId, category));
  }
  return results;
}

async function seedCategory(userId: UserId, data: SeedCategoryInput) {
  const values = {
    name: data.name,
    description: data.description,
    color: data.color,
    icon: data.icon,
    sortOrder: data.sortOrder,
  };
  return prisma.category.upsert({
    where: {
      userId_nameNormalized: { userId, nameNormalized: data.nameNormalized },
    },
    update: values,
    create: { userId, nameNormalized: data.nameNormalized, ...values },
  });
}

export interface SystemTemplateInput {
  type: TemplateType;
  name: string;
  description: string;
  category: string;
  content: Prisma.InputJsonValue;
  tags: string[];
}

/** Official system templates seeded for every environment. */
export const DEFAULT_SYSTEM_TEMPLATES: readonly SystemTemplateInput[] = [
  {
    type: TemplateType.MORNING_ROUTINE,
    name: 'Morning Reset',
    description: 'A focused morning routine to start the day right',
    category: 'wellness',
    content: {
      version: 1,
      blocks: [
        { title: 'Hydrate', duration: 5 },
        { title: 'Stretch', duration: 5 },
        { title: 'Review goals', duration: 5 },
      ],
    },
    tags: ['morning', 'routine'],
  },
  {
    type: TemplateType.EVENING_ROUTINE,
    name: 'Evening Wind-Down',
    description: 'Unwind, reflect and prepare for restful sleep',
    category: 'wellness',
    content: {
      version: 1,
      blocks: [
        { title: 'Journal', duration: 10 },
        { title: 'No screens', duration: 30 },
        { title: 'Prepare tomorrow', duration: 10 },
      ],
    },
    tags: ['evening', 'routine'],
  },
  {
    type: TemplateType.HABIT_SET,
    name: 'Core Four',
    description: 'A balanced starter set of daily habits',
    category: 'productivity',
    content: {
      version: 1,
      habits: ['Exercise', 'Meditation', 'Read', 'Journal'],
    },
    tags: ['starter', 'habits'],
  },
];

/**
 * Seed official (system-level) templates idempotently. Templates are matched on
 * `name + type`; existing rows are skipped rather than overwritten.
 */
export async function seedSystemTemplates(
  templates: readonly SystemTemplateInput[] = DEFAULT_SYSTEM_TEMPLATES
) {
  const created = [];
  for (const template of templates) {
    const existing = await prisma.template.findFirst({
      where: { name: template.name, type: template.type, isOfficial: true },
    });
    if (existing) {
      created.push(existing);
      continue;
    }
    created.push(
      await prisma.template.create({
        data: {
          type: template.type,
          name: template.name,
          description: template.description,
          category: template.category,
          isPublic: true,
          isOfficial: true,
          isFeatured: true,
          content: JSON.stringify(template.content),
          tags: JSON.stringify(template.tags),
        },
      })
    );
  }
  return created;
}

export interface SeedQuoteInput {
  text: string;
  author: string;
}

/** Public quotes seeded for the whole workspace. */
export const DEFAULT_PUBLIC_QUOTES: readonly SeedQuoteInput[] = [
  {
    text: 'The secret of getting ahead is getting started.',
    author: 'Mark Twain',
  },
  {
    text: 'Success is the sum of small efforts repeated day in and day out.',
    author: 'Robert Collier',
  },
  {
    text: "You don't have to be great to start, but you have to start to be great.",
    author: 'Zig Ziglar',
  },
];

/**
 * Seed public/system quotes idempotently. Rows are matched on `text` (public);
 * duplicates are skipped.
 */
export async function seedDefaultQuotes(
  quotes: readonly SeedQuoteInput[] = DEFAULT_PUBLIC_QUOTES
) {
  const created = [];
  const systemUser = await prisma.user.upsert({
    where: { email: 'system@routineos.com' },
    update: {},
    create: { email: 'system@routineos.com', name: 'System' },
  });
  for (const quote of quotes) {
    const existing = await prisma.quote.findFirst({
      where: { text: quote.text, isPublic: true },
    });
    if (existing) {
      created.push(existing);
      continue;
    }
    created.push(
      await prisma.quote.create({
        data: {
          text: quote.text,
          author: quote.author,
          isPublic: true,
          user: { connect: { id: systemUser.id } },
        },
      })
    );
  }
  return created;
}

/**
 * Result summary of a full seed run.
 */
export interface SeedSummary {
  templates: number;
  quotes: number;
  users?: number;
  categories?: number;
}

/**
 * Run the complete idempotent seed: system templates + public quotes, plus the
 * demo user + categories when `withDemoUser` is enabled (mirrors `prisma/seed.ts`).
 */
export async function seedDatabase(options: { withDemoUser?: boolean } = {}): Promise<SeedSummary> {
  const [templates, quotes] = await Promise.all([
    seedSystemTemplates(),
    seedDefaultQuotes(),
  ]);

  const summary: SeedSummary = {
    templates: templates.length,
    quotes: quotes.length,
  };

  if (options.withDemoUser) {
    const demo = await seedUser({
      email: 'demo@routineos.com',
      name: 'Demo User',
      displayName: 'Demo',
      password: 'Password123!',
      role: Role.USER,
      isActive: true,
    });
    const categories = await seedCategories(toUserId(demo.id));
    summary.users = 1;
    summary.categories = categories.length;
  }

  return summary;
}
