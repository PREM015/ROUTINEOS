/**
 * Prisma Seed Script
 * Seeds the database with initial data for RoutineOS
 */
import { PrismaClient } from "../src/generated/prisma";
import crypto from "crypto";

const prisma = new PrismaClient();

const hashPassword = (password: string) =>
  crypto.createHash("sha256").update(password).digest("hex");

async function main() {
  console.log("🌱 Starting seed...");

  // ── Admin user ──────────────────────────────────────────────
  const admin = await prisma.user.upsert({
    where: { email: "admin@routineos.app" },
    update: {},
    create: {
      email: "admin@routineos.app",
      name: "Admin",
      displayName: "RoutineOS Admin",
      passwordHash: hashPassword("admin123!"),
      role: "ADMIN",
      timezone: "Asia/Kolkata",
      emailVerified: new Date(),
      onboardingCompletedAt: new Date(),
      settings: {
        create: {
          timezone: "Asia/Kolkata",
          language: "en",
          dateFormat: "YYYY-MM-DD",
          timeFormat: "24h",
          weekStartsOn: 1,
          theme: "DARK",
          weightNonNeg: 1.0,
          weightGrowth: 0.5,
          weightBonus: 0.25,
          aiInsightsEnabled: true,
          notificationsEnabled: true,
          emailNotifications: true,
          pushNotifications: false,
          dailyReminder: true,
          dailyReminderTime: "08:00",
          habitReminders: true,
          goalReminders: true,
          weeklyReviewReminder: true,
          monthlyResetReminder: true,
          retroactiveEditDays: 3,
        },
      },
    },
  });
  console.log(`✅ Admin user: ${admin.email}`);

  // ── Demo user ────────────────────────────────────────────────
  const demo = await prisma.user.upsert({
    where: { email: "demo@routineos.app" },
    update: {},
    create: {
      email: "demo@routineos.app",
      name: "Demo User",
      displayName: "Demo",
      passwordHash: hashPassword("demo1234!"),
      role: "USER",
      timezone: "Asia/Kolkata",
      emailVerified: new Date(),
      onboardingCompletedAt: new Date(),
      settings: {
        create: {
          timezone: "Asia/Kolkata",
          language: "en",
          dateFormat: "YYYY-MM-DD",
          timeFormat: "24h",
          weekStartsOn: 1,
          theme: "DARK",
          weightNonNeg: 1.0,
          weightGrowth: 0.5,
          weightBonus: 0.25,
          targetBedtime: "22:30",
          targetWakeTime: "06:00",
          aiInsightsEnabled: true,
          notificationsEnabled: true,
          emailNotifications: false,
          pushNotifications: false,
          dailyReminder: true,
          dailyReminderTime: "07:00",
          habitReminders: true,
          goalReminders: true,
          weeklyReviewReminder: true,
          monthlyResetReminder: true,
          retroactiveEditDays: 3,
        },
      },
    },
  });
  console.log(`✅ Demo user: ${demo.email}`);

  // ── Categories for demo user ─────────────────────────────────
  const categories = [
    { name: "Health & Fitness", icon: "💪", color: "#ef4444" },
    { name: "Learning",         icon: "📚", color: "#3b82f6" },
    { name: "Mindfulness",      icon: "🧘", color: "#8b5cf6" },
    { name: "Nutrition",        icon: "🥗", color: "#22c55e" },
    { name: "Productivity",     icon: "⚡", color: "#64748b" },
  ];

  const createdCategories: Record<string, string> = {};
  for (const cat of categories) {
    const c = await prisma.category.upsert({
      where: { userId_nameNormalized: { userId: demo.id, nameNormalized: cat.name.toLowerCase().replace(/\s+/g, "-") } },
      update: {},
      create: {
        userId: demo.id,
        name: cat.name,
        nameNormalized: cat.name.toLowerCase().replace(/\s+/g, "-"),
        icon: cat.icon,
        color: cat.color,
      },
    });
    createdCategories[cat.name] = c.id;
  }
  console.log(`✅ ${categories.length} categories created`);

  // ── Habits for demo user ─────────────────────────────────────
  const today = new Date().toISOString().split("T")[0];

  const habits = [
    // Non-Negotiable
    {
      name: "Morning Workout",
      tier: "NON_NEGOTIABLE" as const,
      icon: "💪",
      color: "#ef4444",
      categoryId: createdCategories["Health & Fitness"],
      frequencyType: "DAILY" as const,
      frequencyConfig: { type: "DAILY" },
      estimatedDuration: 45,
      scheduledTime: "06:30",
      weight: 1.0,
    },
    {
      name: "Read 30 Minutes",
      tier: "NON_NEGOTIABLE" as const,
      icon: "📖",
      color: "#3b82f6",
      categoryId: createdCategories["Learning"],
      frequencyType: "DAILY" as const,
      frequencyConfig: { type: "DAILY" },
      estimatedDuration: 30,
      weight: 1.0,
    },
    {
      name: "Meditation",
      tier: "NON_NEGOTIABLE" as const,
      icon: "🧘",
      color: "#8b5cf6",
      categoryId: createdCategories["Mindfulness"],
      frequencyType: "DAILY" as const,
      frequencyConfig: { type: "DAILY" },
      estimatedDuration: 10,
      scheduledTime: "07:00",
      weight: 1.0,
    },
    // Growth
    {
      name: "Drink 2L Water",
      tier: "GROWTH" as const,
      icon: "💧",
      color: "#06b6d4",
      categoryId: createdCategories["Nutrition"],
      frequencyType: "DAILY" as const,
      frequencyConfig: { type: "DAILY" },
      weight: 0.5,
    },
    {
      name: "Study / Deep Work",
      tier: "GROWTH" as const,
      icon: "🧠",
      color: "#6366f1",
      categoryId: createdCategories["Productivity"],
      frequencyType: "SPECIFIC_WEEKDAYS" as const,
      frequencyConfig: { type: "SPECIFIC_WEEKDAYS", days: [1, 2, 3, 4, 5] },
      estimatedDuration: 120,
      weight: 0.5,
    },
    {
      name: "No Junk Food",
      tier: "GROWTH" as const,
      icon: "🥗",
      color: "#22c55e",
      categoryId: createdCategories["Nutrition"],
      frequencyType: "DAILY" as const,
      frequencyConfig: { type: "DAILY" },
      weight: 0.5,
    },
    // Bonus
    {
      name: "Evening Walk",
      tier: "BONUS" as const,
      icon: "🚶",
      color: "#10b981",
      categoryId: createdCategories["Health & Fitness"],
      frequencyType: "DAILY" as const,
      frequencyConfig: { type: "DAILY" },
      estimatedDuration: 20,
      weight: 0.25,
    },
    {
      name: "Journaling",
      tier: "BONUS" as const,
      icon: "✍️",
      color: "#f59e0b",
      categoryId: createdCategories["Mindfulness"],
      frequencyType: "DAILY" as const,
      frequencyConfig: { type: "DAILY" },
      estimatedDuration: 15,
      weight: 0.25,
    },
  ];

  for (const habit of habits) {
    await prisma.habit.upsert({
      where: {
        // Using a composite we can attempt to match by name+user
        // If no unique constraint, just create
        id: `seed-${demo.id}-${habit.name.replace(/\s+/g, "-").toLowerCase()}`,
      },
      update: {},
      create: {
        id: `seed-${demo.id}-${habit.name.replace(/\s+/g, "-").toLowerCase()}`,
        userId: demo.id,
        name: habit.name,
        icon: habit.icon,
        color: habit.color,
        tier: habit.tier,
        status: "ACTIVE",
        categoryId: habit.categoryId ?? null,
        frequencyType: habit.frequencyType,
        frequencyConfig: JSON.stringify(habit.frequencyConfig),
        estimatedDuration: (habit as { estimatedDuration?: number }).estimatedDuration ?? null,
        scheduledTime: (habit as { scheduledTime?: string }).scheduledTime ?? null,
        weight: habit.weight,
        startDate: today,
        isActive: true,
        sortOrder: habits.indexOf(habit),
        completionCount: 0,
      },
    });
  }
  console.log(`✅ ${habits.length} habits created`);

  // ── Routine Templates for demo user ─────────────────────────
  const workdayTemplate = await prisma.routineTemplate.upsert({
    where: { id: `seed-routine-workday-${demo.id}` },
    update: {},
    create: {
      id: `seed-routine-workday-${demo.id}`,
      userId: demo.id,
      name: "Workday Routine",
      dayType: "WORKKDAY",
      isDefault: true,
      color: "#3b82f6",
      icon: "💼",
      isActive: true,
    },
  });

  const blocks = [
    { name: "Wake Up & Freshen",  startTime: "06:00", endTime: "06:30", icon: "🌅", color: "#f59e0b", sortOrder: 0 },
    { name: "Workout",            startTime: "06:30", endTime: "07:15", icon: "💪", color: "#ef4444", sortOrder: 1 },
    { name: "Meditation",         startTime: "07:15", endTime: "07:30", icon: "🧘", color: "#8b5cf6", sortOrder: 2 },
    { name: "Breakfast",          startTime: "07:30", endTime: "08:00", icon: "🍳", color: "#f97316", sortOrder: 3 },
    { name: "Deep Work Block 1",  startTime: "09:00", endTime: "12:00", icon: "🧠", color: "#3b82f6", sortOrder: 4 },
    { name: "Lunch",              startTime: "12:00", endTime: "13:00", icon: "🥗", color: "#22c55e", sortOrder: 5 },
    { name: "Deep Work Block 2",  startTime: "13:00", endTime: "17:00", icon: "💼", color: "#6366f1", sortOrder: 6 },
    { name: "Evening Walk",       startTime: "17:30", endTime: "18:00", icon: "🚶", color: "#10b981", sortOrder: 7 },
    { name: "Dinner",             startTime: "19:00", endTime: "19:30", icon: "🍽️", color: "#ec4899", sortOrder: 8 },
    { name: "Reading",            startTime: "20:00", endTime: "21:00", icon: "📚", color: "#0ea5e9", sortOrder: 9 },
    { name: "Wind Down",          startTime: "21:30", endTime: "22:30", icon: "🌙", color: "#64748b", sortOrder: 10 },
  ];

  for (const block of blocks) {
    await prisma.routineBlock.upsert({
      where: { id: `seed-block-${demo.id}-${block.sortOrder}` },
      update: {},
      create: {
        id: `seed-block-${demo.id}-${block.sortOrder}`,
        userId: demo.id,
        templateId: workdayTemplate.id,
        name: block.name,
        startTime: block.startTime,
        endTime: block.endTime,
        icon: block.icon,
        color: block.color,
        sortOrder: block.sortOrder,
        isFlexible: false,
        isOptional: false,
      },
    });
  }
  console.log(`✅ Workday routine with ${blocks.length} blocks`);

  // ── Streak for demo user ─────────────────────────────────────
  await prisma.streak.upsert({
    where: { userId: demo.id },
    update: {},
    create: {
      userId: demo.id,
      currentStreak: 0,
      longestStreak: 0,
      coreStreak: 0,
      lastActiveDate: null,
      totalDaysTracked: 0,
      totalPerfectDays: 0,
    },
  });
  console.log("✅ Streak record initialized");

  // ── Demo Goals ───────────────────────────────────────────────
  const monthEnd = new Date();
  monthEnd.setMonth(monthEnd.getMonth() + 1);
  const monthEndStr = monthEnd.toISOString().split("T")[0];

  const goals = [
    {
      title: "Complete 30 Workout Sessions",
      type: "MONTHLY" as const,
      priority: "HIGH" as const,
      isQuantifiable: true,
      targetValue: 30,
      currentValue: 0,
      unit: "sessions",
      dueDate: monthEndStr,
    },
    {
      title: "Read 2 Books",
      type: "MONTHLY" as const,
      priority: "MEDIUM" as const,
      isQuantifiable: true,
      targetValue: 2,
      currentValue: 0,
      unit: "books",
      dueDate: monthEndStr,
    },
    {
      title: "Maintain 25-day Streak",
      type: "MONTHLY" as const,
      priority: "HIGH" as const,
      isQuantifiable: false,
      targetValue: null,
      currentValue: null,
      unit: null,
      dueDate: monthEndStr,
    },
  ];

  for (const goal of goals) {
    await prisma.goal.upsert({
      where: { id: `seed-goal-${demo.id}-${goal.title.replace(/\s+/g, "-").toLowerCase().slice(0, 30)}` },
      update: {},
      create: {
        id: `seed-goal-${demo.id}-${goal.title.replace(/\s+/g, "-").toLowerCase().slice(0, 30)}`,
        userId: demo.id,
        title: goal.title,
        type: goal.type,
        priority: goal.priority,
        status: "ACTIVE",
        isQuantifiable: goal.isQuantifiable,
        targetValue: goal.targetValue,
        currentValue: goal.currentValue,
        unit: goal.unit,
        startDate: today,
        dueDate: goal.dueDate,
        isCarriedOver: false,
        carryOverCount: 0,
        sortOrder: goals.indexOf(goal),
        isArchived: false,
      },
    });
  }
  console.log(`✅ ${goals.length} goals created`);

  console.log("\n🎉 Seed complete!");
  console.log("   Admin: admin@routineos.app / admin123!");
  console.log("   Demo:  demo@routineos.app  / demo1234!");
}

main()
  .catch((e) => {
    console.error("❌ Seed failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
