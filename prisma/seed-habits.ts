/**
 * Seeds the personal checklist as Habit rows (+ a few Goals).
 * Run: SEED_USER_EMAIL=you@example.com npx tsx prisma/seed-habits.ts
 * Idempotent: upserts on (userId, name) so re-running is safe.
 */
import "dotenv/config";

import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error("DATABASE_URL is not set");

// Prisma 7 requires a driver adapter; the datasource block has no `url`.
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });

type Tier = "NON_NEGOTIABLE" | "GROWTH" | "BONUS" | "OPTIONAL";
type Freq = "DAILY" | "WEEKLY_TARGET" | "MONTHLY_TARGET" | "EVERY_N_DAYS";
type TimeOfDay = "MORNING" | "AFTERNOON" | "EVENING" | "NIGHT" | "ANYTIME";

interface Extra {
  track?: "BOOLEAN" | "COUNT" | "DURATION";
  dir?: "BUILD" | "LIMIT" | "AVOID";
  target?: number;
  unit?: string;
  count?: number; // targetCount for WEEKLY/MONTHLY
  every?: number; // intervalDays for EVERY_N_DAYS
}
type Item = string | [string, Extra];

interface Section {
  category: string;
  tier: Tier;
  freq: Freq;
  time?: TimeOfDay;
  count?: number; // default targetCount
  status?: "ACTIVE" | "DRAFT";
  items: Item[];
}

const AVOID: Extra = { dir: "AVOID" };

const SECTIONS: Section[] = [
  // ───────────── TIER 1 (daily) ─────────────
  {
    category: "Morning Routine", tier: "NON_NEGOTIABLE", freq: "DAILY", time: "MORNING",
    items: [
      "Wake up at 5:00 AM",
      "Get out of bed without snoozing the alarm",
      "Make my bed",
      "Drink water after waking up",
      "Get sunlight before 10:00 AM",
      ["No phone for the first hour", AVOID],
      "Follow a planned morning routine",
      "Write down the top 3 priorities for the day",
      "Cleanse face gently",
      "Apply moisturiser suitable for my skin type",
      "Apply broad-spectrum SPF 30+ sunscreen",
      "Use deodorant",
      "Wear clean, well-fitting clothes and fresh socks",
    ],
  },
  {
    category: "Sleep & Evening Shutdown", tier: "NON_NEGOTIABLE", freq: "DAILY", time: "NIGHT",
    items: [
      ["Sleep 7–8 hours", { track: "DURATION", target: 7, unit: "h" }],
      "Maintain a consistent sleep and wake schedule",
      "Stop using phone shortly before bedtime",
      "Review the day before sleeping",
      "Review schedule for tomorrow",
      "Prepare clothes, workspace and tasks for tomorrow",
      "Quick room reset",
      "Cleanse face before bed",
      "Remove sunscreen/makeup properly at night",
    ],
  },
  {
    category: "Digital Discipline", tier: "GROWTH", freq: "DAILY", time: "ANYTIME",
    items: [
      ["Stay within daily social media time limit", { track: "DURATION", dir: "LIMIT", target: 60, unit: "min" }],
      "Do Not Disturb / limit distractions / notifications off",
      "Keep phone away while working or studying",
      ["No short-form videos during study sessions", AVOID],
      ["No scrolling during meals", AVOID],
      "Replace scrolling with a hobby, music, reading or outdoors",
      "Track time spent on distractions",
    ],
  },
  {
    category: "Planning & Productivity", tier: "GROWTH", freq: "DAILY", time: "MORNING",
    items: [
      "Use calendar or daily planner",
      "Set a clear start time for important work",
      "Break large goals into smaller tasks",
      "Finish or deliberately reschedule pending tasks",
      "Avoid multitasking during deep work",
      "Batch small tasks instead of interrupting focused work",
    ],
  },
  {
    category: "Study & Deep Work", tier: "NON_NEGOTIABLE", freq: "DAILY", time: "AFTERNOON",
    items: [
      "Plan study targets before starting",
      "Complete at least one focused study session",
      "Study without switching between unnecessary apps",
      "Keep desk clean before starting",
      "Track completed topics and pending work",
      "Review what I learned at the end of the day",
    ],
  },
  {
    category: "Movement & Recovery", tier: "GROWTH", freq: "DAILY", time: "ANYTIME",
    items: [
      "Walk regularly through the day",
      ["15,000 steps", { track: "COUNT", target: 15000, unit: "steps" }],
      "Cold showers",
      "Stretch / mobility work",
      "Eat enough to support activity and recovery",
      "Sleep sufficiently to recover from training",
    ],
  },
  {
    category: "Nutrition & Hydration", tier: "GROWTH", freq: "DAILY", time: "ANYTIME",
    items: [
      "Eat balanced meals consistently",
      "Include protein in meals",
      "Eat vegetables and fruit",
      "Choose mostly minimally processed foods",
      "Drink water throughout the day",
      ["Limit sugary drinks and frequent junk food", AVOID],
      ["Limit frequent sugary snacks", AVOID],
      ["No crash diets, dehydration or extreme food restrictions", AVOID],
      "Eat mindfully instead of snacking out of boredom",
    ],
  },
  {
    category: "Skincare, Grooming & Hygiene", tier: "GROWTH", freq: "DAILY", time: "ANYTIME",
    items: [
      "Reapply sunscreen when needed",
      ["Don't pick pimples or touch face unnecessarily", AVOID],
      "Maintain clean ears and general personal hygiene",
      "Avoid harsh treatments that damage hair or skin",
      "Keep clothes clean",
      "Stick to the everyday grooming routine I can sustain",
    ],
  },
  {
    category: "Oral Hygiene", tier: "NON_NEGOTIABLE", freq: "DAILY", time: "ANYTIME",
    items: [
      ["Brush teeth twice daily with fluoride toothpaste", { track: "COUNT", target: 2, unit: "times" }],
      "Clean between teeth daily (floss)",
      "Clean tongue gently",
    ],
  },
  {
    category: "Mind & Discipline", tier: "GROWTH", freq: "DAILY", time: "EVENING",
    items: [
      ["Read 10 pages of a book", { track: "COUNT", target: 10, unit: "pages" }],
      "Read the news",
      "Learn something new / something useful",
      "Do something creative",
      "Do something that challenges/scares me",
      "Reflect on mistakes without excessive self-criticism",
      "Reduce impulsive habits and distractions",
      "Say no to things that interfere with my priorities",
      "Follow my routine even when motivation is low",
      "Complete important tasks before unnecessary entertainment",
    ],
  },
  {
    category: "Posture & Healthy Mindset", tier: "BONUS", freq: "DAILY", time: "ANYTIME",
    items: [
      "Practise good posture",
      "Don't make my entire identity about productivity or appearance",
      "Take breaks before exhaustion builds up",
      "Make time for hobbies and enjoyable activities",
      "Stay connected with supportive friends and family",
    ],
  },

  // ───────────── TIER 2 (scheduled) ─────────────
  {
    category: "Gym & Training", tier: "GROWTH", freq: "WEEKLY_TARGET", count: 4, time: "EVENING",
    items: [
      "Go to the gym (follow training split)",
      "Warm up before intense training",
      "Train major muscle groups in a balanced programme",
      "Practise proper form before increasing weights",
      "Record workouts: sets, reps, weights",
      "Increase training difficulty gradually",
      ["Include cardio or other aerobic activity", { count: 2 }],
      ["Recovery / rest day", { count: 2 }],
    ],
  },
  {
    category: "Coding & Career Practice", tier: "GROWTH", freq: "WEEKLY_TARGET", count: 3,
    items: [
      ["Practise DSA", { count: 5 }],
      "Revise previously solved coding problems",
      "Learn the concept behind mistakes and failed solutions",
      "Write clean, readable code",
      "Learn one technical concept in depth",
      "Make progress on a real project",
      "Commit meaningful code changes to Git",
      "Read documentation instead of relying only on tutorials",
      "Debug problems myself before looking at solutions",
      "Practise explaining technical concepts in simple English",
      "Improve written communication",
      "Keep learning without endlessly switching technologies",
    ],
  },
  {
    category: "Study Techniques", tier: "GROWTH", freq: "WEEKLY_TARGET", count: 3,
    items: [
      "Revise previously learned topics",
      "Make short revision notes",
      "Test myself instead of only rereading",
      "Add to and solve my list of doubts",
    ],
  },
  {
    category: "Haircare & Grooming Schedule", tier: "GROWTH", freq: "EVERY_N_DAYS",
    items: [
      ["Follow my hair-washing schedule", { every: 2 }],
      ["Use conditioner when appropriate", { every: 7 }],
      ["Maintain haircut", { every: 21 }],
      ["Replace toothbrush when worn", { every: 90 }],
      ["Dentist visit and fix dental problems promptly", { every: 180 }],
      ["Regular healthcare appointments as appropriate", { every: 365 }],
    ],
  },
  {
    category: "Weekly: Planning & Review", tier: "GROWTH", freq: "WEEKLY_TARGET", count: 1,
    items: [
      "Plan the week",
      "Set goals for next week and month",
      "Review progress and achievements (weekly review)",
      "Review unfinished tasks and adjust the plan",
      "Review weekly coding progress",
      "Track screen time",
      "Plan meals",
    ],
  },
  {
    category: "Weekly: Finances", tier: "GROWTH", freq: "WEEKLY_TARGET", count: 1,
    items: ["Review spending", "Invest"],
  },
  {
    category: "Weekly: Career", tier: "GROWTH", freq: "WEEKLY_TARGET", count: 1,
    items: [
      "DSA revision session",
      "Project development session",
      "Apply to relevant internships/jobs on planned days",
      "Practise interview questions and communication",
      "Practise explaining my projects and technical decisions",
      "Practise speaking confidently (interviews / group discussions)",
      "Research career opportunities",
      "Review projects and improve their quality",
      "Update record of accomplishments",
      "Learn from rejections / interview feedback",
      "Practise collaborating and giving/receiving feedback",
    ],
  },
  {
    category: "Weekly: Body & Grooming", tier: "GROWTH", freq: "WEEKLY_TARGET", count: 1,
    items: [
      "Track body measurements (weight / waist)",
      "Trim facial hair or clean shave",
      "Keep nails clean and trimmed",
      "Clean grooming tools",
      "Wash pillowcases, towels and anything touching my face",
      "Wash/maintain clothes, clean shoes, repair or replace damaged items",
    ],
  },
  {
    category: "Weekly: Personal", tier: "GROWTH", freq: "WEEKLY_TARGET", count: 1,
    items: [
      "Deep clean and organise my room",
      "Do something outside my comfort zone",
      "Practise a hobby",
      "Meet friends or family",
      "Digital detox period",
    ],
  },
  {
    category: "Monthly", tier: "GROWTH", freq: "MONTHLY_TARGET", count: 1,
    items: [
      "Review subscriptions",
      "Monthly reset",
      "Buy something for myself",
      "Review my progress and goals",
      "Reset my routines and environment",
      "Maintain GitHub profile with genuine work",
      "Review overall monthly coding and career progress",
      "Review wardrobe",
      "Review skincare: introduce new products gradually",
      "Check skin: track irritation or persistent acne",
    ],
  },

  // ───────────── TIER 3 (optional) ─────────────
  {
    category: "Optional Growth", tier: "OPTIONAL", freq: "WEEKLY_TARGET", count: 3, status: "ACTIVE",
    items: [
      "Meditation or mindful breathing",
      "Write a short journal entry",
      "Spend some time alone without constant entertainment",
      "Extra reading beyond 10 pages",
      "Use timer / Pomodoro",
      "Maintain comfortable eye contact",
      "Speak clearly instead of rushing words",
      "Build confidence through preparation and practice, not comparison",
      "Extra communication practice",
      "Advanced grooming or style improvements",
    ],
  },
];

// Outcome-based items: these are Goals, not habits.
// Long-term, everyday goals — NOT a 30/90-day window. They stay ACTIVE and are
// re-surfaced every day (`appliesEveryDay`) until the user completes them.
const GOALS = [
  { title: "Build/improve a project that solves a real problem", priority: "PROFESSIONAL" },
  { title: "Improve resume and portfolio", priority: "PROFESSIONAL" },
  { title: "Land an internship/job", priority: "PROFESSIONAL" },
  { title: "New fitness goals", priority: "PERSONAL" },
  { title: "Pick up a new hobby", priority: "PERSONAL" },
] as const;

const normalize = (s: string) => s.trim().toLowerCase();

async function main() {
  const email = process.env.SEED_USER_EMAIL;
  if (!email) throw new Error("Set SEED_USER_EMAIL");
  const user = await prisma.user.findUniqueOrThrow({ where: { email } });

  let order = 0;
  let habitCount = 0;

  for (const s of SECTIONS) {
    const category = await prisma.category.upsert({
      where: { userId_nameNormalized: { userId: user.id, nameNormalized: normalize(s.category) } },
      update: {},
      create: { userId: user.id, name: s.category, nameNormalized: normalize(s.category) },
    });

    for (const raw of s.items) {
      const [name, x] = typeof raw === "string" ? [raw, {} as Extra] : raw;
      const data = {
        tier: s.tier,
        status: s.status ?? "ACTIVE",
        categoryId: category.id,
        frequencyType: s.freq,
        targetCount: s.freq === "WEEKLY_TARGET" || s.freq === "MONTHLY_TARGET" ? x.count ?? s.count ?? 1 : null,
        intervalDays: s.freq === "EVERY_N_DAYS" ? x.every ?? null : null,
        trackingType: x.track ?? "BOOLEAN",
        direction: x.dir ?? "BUILD",
        targetValue: x.target ?? null,
        unit: x.unit ?? null,
        timeOfDay: s.time ?? null,
        sortOrder: order++,
        // Ongoing: never expire. A daily habit has no end date.
        endDate: null,
        appliesEveryDay: true,
      } as const;

      await prisma.habit.upsert({
        where: { userId_name: { userId: user.id, name } },
        update: data,
        create: { userId: user.id, name, ...data },
      });
      habitCount++;
    }
  }

  // Everyday, long-term goals. endDate is a far horizon (not 30/90 days) so they
  // never look "expired"; `appliesEveryDay` keeps them visible on the daily view.
  const start = new Date();
  const end = new Date(start.getTime() + 3650 * 86_400_000); // ~10 years
  for (const g of GOALS) {
    const existing = await prisma.goal.findFirst({ where: { userId: user.id, title: g.title } });
    const data = {
      type: "YEARLY",
      priority: g.priority,
      status: "ACTIVE",
      targetValue: 100,
      unit: "%",
      startDate: start,
      endDate: end,
      appliesEveryDay: true,
    } as const;
    if (existing) {
      await prisma.goal.update({ where: { id: existing.id }, data });
    } else {
      await prisma.goal.create({ data: { userId: user.id, title: g.title, ...data } });
    }
  }

  console.log(`Seeded ${habitCount} habits and ${GOALS.length} goals for ${email}`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
