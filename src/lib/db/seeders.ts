/**
 * Idempotent database seeders.
 *
 * Mirrors the logic of `prisma/seed.ts` (demo users, categories, quotes) but
 * runs against the shared Prisma singleton and is safe to call more than once
 * (upserts / existence checks). System-wide data (official templates, public
 * quotes) is seeded independently of any user.
 */

import { Role, TemplateType, type Prisma } from '@prisma/client';
import bcrypt from 'bcryptjs';
import prisma from '@/lib/prisma';

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

/** Default categories used by the demo seed (matches `prisma/seed.ts`). */
export const DEFAULT_CATEGORIES: readonly SeedCategoryInput[] = [
  {
    name: 'Health & Fitness',
    nameNormalized: 'health-fitness',
    description: 'Physical health, exercise, and nutrition',
    color: '#10b981',
    icon: '💪',
    sortOrder: 1,
  },
  {
    name: 'Productivity',
    nameNormalized: 'productivity',
    description: 'Work, study, and task completion',
    color: '#3b82f6',
    icon: '🎯',
    sortOrder: 2,
  },
  {
    name: 'Mindfulness',
    nameNormalized: 'mindfulness',
    description: 'Meditation, reflection, and mental health',
    color: '#8b5cf6',
    icon: '🧘',
    sortOrder: 3,
  },
  {
    name: 'Learning',
    nameNormalized: 'learning',
    description: 'Education and skill development',
    color: '#f59e0b',
    icon: '📚',
    sortOrder: 4,
  },
];

/**
 * Upsert the default categories for a user keyed on the composite
 * `[userId, nameNormalized]` unique constraint. Returns the created/kept rows.
 */
export async function seedCategories(
  userId: string,
  categories: readonly SeedCategoryInput[] = DEFAULT_CATEGORIES
) {
  const results: Awaited<ReturnType<typeof seedCategory>>[] = [];
  for (const category of categories) {
    results.push(await seedCategory(userId, category));
  }
  return results;
}

async function seedCategory(userId: string, data: SeedCategoryInput) {
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
    const categories = await seedCategories(demo.id);
    summary.users = 1;
    summary.categories = categories.length;
  }

  return summary;
}