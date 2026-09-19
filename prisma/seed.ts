import { PrismaClient, Role, Theme, HabitTier, HabitStatus, HabitFrequencyType, DayType, GoalType, GoalPriority, GoalStatus } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

/**
 * Database Seeding Script
 * Creates demo user with sample data for development and testing
 */

async function main() {
  console.log('🌱 Starting database seed...');

  // Clean up existing data (development only)
  if (process.env.NODE_ENV === 'development') {
    console.log('🧹 Cleaning up existing data...');
    
    await prisma.habitLog.deleteMany();
    await prisma.habitOverride.deleteMany();
    await prisma.habit.deleteMany();
    
    await prisma.goalProgress.deleteMany();
    await prisma.milestone.deleteMany();
    await prisma.goal.deleteMany();
    
    await prisma.routineLog.deleteMany();
    await prisma.routineException.deleteMany();
    await prisma.routineBlock.deleteMany();
    await prisma.routineTemplate.deleteMany();
    
    await prisma.dailyScore.deleteMany();
    await prisma.dailyReflection.deleteMany();
    await prisma.sleepLog.deleteMany();
    
    await prisma.streak.deleteMany();
    await prisma.category.deleteMany();
    await prisma.tag.deleteMany();
    await prisma.quote.deleteMany();
    
    await prisma.userSettings.deleteMany();
    await prisma.userSubscription.deleteMany();
    await prisma.user.deleteMany();
  }

  // ============================================================================
  // Create Demo Users
  // ============================================================================

  console.log('👤 Creating demo users...');

  const demoUserPassword = await bcrypt.hash('Password123!', 12);

  const demoUser = await prisma.user.create({
    data: {
      email: 'demo@routineos.com',
      name: 'Demo User',
      displayName: 'Demo',
      passwordHash: demoUserPassword,
      role: Role.USER,
      timezone: 'America/New_York',
      emailVerified: new Date(),
      onboardingCompletedAt: new Date(),
      isActive: true,
    },
  });

  const adminUser = await prisma.user.create({
    data: {
      email: 'admin@routineos.com',
      name: 'Admin User',
      displayName: 'Admin',
      passwordHash: demoUserPassword,
      role: Role.ADMIN,
      timezone: 'America/New_York',
      emailVerified: new Date(),
      onboardingCompletedAt: new Date(),
      isActive: true,
    },
  });

  console.log(`✅ Created users: ${demoUser.email}, ${adminUser.email}`);

  // ============================================================================
  // Create User Settings
  // ============================================================================

  console.log('⚙️ Creating user settings...');

  await prisma.userSettings.create({
    data: {
      userId: demoUser.id,
      timezone: 'America/New_York',
      language: 'en',
      theme: Theme.LIGHT,
      weekStartsOn: 1, // Monday
      targetBedtime: '22:00',
      targetWakeTime: '06:00',
      minSleepDuration: 480, // 8 hours
      weightNonNeg: 1.0,
      weightGrowth: 0.5,
      weightBonus: 0.25,
      notificationsEnabled: true,
      dailyReminder: true,
      dailyReminderTime: '20:00',
      habitReminders: true,
      weeklyReviewReminder: true,
      aiInsightsEnabled: true,
    },
  });

  await prisma.userSettings.create({
    data: {
      userId: adminUser.id,
      timezone: 'America/New_York',
    },
  });

  // ============================================================================
  // Create Categories
  // ============================================================================

  console.log('📁 Creating categories...');

  const healthCategory = await prisma.category.create({
    data: {
      userId: demoUser.id,
      name: 'Health & Fitness',
      nameNormalized: 'health-fitness',
      description: 'Physical health, exercise, and nutrition',
      color: '#10b981',
      icon: '💪',
      sortOrder: 1,
    },
  });

  const productivityCategory = await prisma.category.create({
    data: {
      userId: demoUser.id,
      name: 'Productivity',
      nameNormalized: 'productivity',
      description: 'Work, study, and task completion',
      color: '#3b82f6',
      icon: '🎯',
      sortOrder: 2,
    },
  });

  const mindfulnessCategory = await prisma.category.create({
    data: {
      userId: demoUser.id,
      name: 'Mindfulness',
      nameNormalized: 'mindfulness',
      description: 'Meditation, reflection, and mental health',
      color: '#8b5cf6',
      icon: '🧘',
      sortOrder: 3,
    },
  });

  const learningCategory = await prisma.category.create({
    data: {
      userId: demoUser.id,
      name: 'Learning',
      nameNormalized: 'learning',
      description: 'Education and skill development',
      color: '#f59e0b',
      icon: '📚',
      sortOrder: 4,
    },
  });

  // ============================================================================
  // Create Tags
  // ============================================================================

  console.log('🏷️ Creating tags...');

  const morningTag = await prisma.tag.create({
    data: {
      userId: demoUser.id,
      name: 'Morning',
      color: '#f59e0b',
      icon: '🌅',
    },
  });

  const eveningTag = await prisma.tag.create({
    data: {
      userId: demoUser.id,
      name: 'Evening',
      color: '#8b5cf6',
      icon: '🌙',
    },
  });

  const importantTag = await prisma.tag.create({
    data: {
      userId: demoUser.id,
      name: 'Important',
      color: '#ef4444',
      icon: '⭐',
    },
  });

  // ============================================================================
  // Create Habits
  // ============================================================================

  console.log('✅ Creating habits...');

  const exerciseHabit = await prisma.habit.create({
    data: {
      userId: demoUser.id,
      name: 'Exercise',
      description: '30 minutes of physical activity',
      tier: HabitTier.GROWTH,
      status: HabitStatus.ACTIVE,
      categoryId: healthCategory.id,
      color: '#10b981',
      icon: '🏃',
      frequencyType: HabitFrequencyType.DAILY,
      targetCount: null,
      startDate: new Date(),
      reminderEnabled: true,
      reminderTime: '07:00',
      estimatedDuration: 30,
      difficulty: 3,
      points: 10,
    },
  });

  const meditationHabit = await prisma.habit.create({
    data: {
      userId: demoUser.id,
      name: 'Meditation',
      description: '10 minutes of mindfulness meditation',
      tier: HabitTier.GROWTH,
      status: HabitStatus.ACTIVE,
      categoryId: mindfulnessCategory.id,
      color: '#8b5cf6',
      icon: '🧘',
      frequencyType: HabitFrequencyType.DAILY,
      startDate: new Date(),
      estimatedDuration: 10,
      difficulty: 2,
      points: 10,
    },
  });

  const readingHabit = await prisma.habit.create({
    data: {
      userId: demoUser.id,
      name: 'Read',
      description: 'Read for 20 minutes',
      tier: HabitTier.GROWTH,
      status: HabitStatus.ACTIVE,
      categoryId: learningCategory.id,
      color: '#f59e0b',
      icon: '📚',
      frequencyType: HabitFrequencyType.DAILY,
      startDate: new Date(),
      estimatedDuration: 20,
      difficulty: 1,
      points: 10,
    },
  });

  const journalHabit = await prisma.habit.create({
    data: {
      userId: demoUser.id,
      name: 'Journal',
      description: 'Write daily reflections',
      tier: HabitTier.BONUS,
      status: HabitStatus.ACTIVE,
      categoryId: mindfulnessCategory.id,
      color: '#ec4899',
      icon: '📝',
      frequencyType: HabitFrequencyType.DAILY,
      startDate: new Date(),
      estimatedDuration: 15,
      difficulty: 2,
      points: 5,
    },
  });

  const waterHabit = await prisma.habit.create({
    data: {
      userId: demoUser.id,
      name: 'Drink Water',
      description: 'Drink 8 glasses of water',
      tier: HabitTier.BONUS,
      status: HabitStatus.ACTIVE,
      categoryId: healthCategory.id,
      color: '#06b6d4',
      icon: '💧',
      frequencyType: HabitFrequencyType.DAILY,
      targetCount: 8,
      startDate: new Date(),
      difficulty: 1,
      points: 5,
    },
  });

  const learningHabit = await prisma.habit.create({
    data: {
      userId: demoUser.id,
      name: 'Learn Something New',
      description: 'Study or practice a new skill',
      tier: HabitTier.BONUS,
      status: HabitStatus.ACTIVE,
      categoryId: learningCategory.id,
      color: '#3b82f6',
      icon: '🎓',
      frequencyType: HabitFrequencyType.SPECIFIC_WEEKDAYS,
      frequencyValue: '1,2,3,4,5', // Weekdays
      startDate: new Date(),
      estimatedDuration: 30,
      difficulty: 3,
      points: 5,
    },
  });

  console.log(`✅ Created ${6} habits`);

  // ============================================================================
  // Create Routine Templates
  // ============================================================================

  console.log('📅 Creating routine templates...');

  const workdayTemplate = await prisma.routineTemplate.create({
    data: {
      userId: demoUser.id,
      name: 'Workday Routine',
      description: 'Standard weekday schedule',
      dayType: DayType.WORKDAY,
      isDefault: true,
      isActive: true,
      color: '#3b82f6',
      icon: '💼',
    },
  });

  const weekendTemplate = await prisma.routineTemplate.create({
    data: {
      userId: demoUser.id,
      name: 'Weekend Routine',
      description: 'Relaxed weekend schedule',
      dayType: DayType.WEEKEND,
      isDefault: true,
      isActive: true,
      color: '#10b981',
      icon: '🌴',
    },
  });

  // ============================================================================
  // Create Routine Blocks
  // ============================================================================

  console.log('⏰ Creating routine blocks...');

  await prisma.routineBlock.createMany({
    data: [
      // Workday blocks
      {
        userId: demoUser.id,
        templateId: workdayTemplate.id,
        startTime: '06:00',
        endTime: '07:00',
        title: 'Morning Routine',
        description: 'Wake up, shower, breakfast',
        energyLevel: 'MEDIUM',
        trackCompletion: true,
        sortOrder: 1,
        icon: '🌅',
      },
      {
        userId: demoUser.id,
        templateId: workdayTemplate.id,
        startTime: '07:00',
        endTime: '08:00',
        title: 'Morning Habits',
        description: 'Exercise, meditation',
        categoryId: healthCategory.id,
        energyLevel: 'HIGH',
        trackCompletion: true,
        sortOrder: 2,
        icon: '🏃',
      },
      {
        userId: demoUser.id,
        templateId: workdayTemplate.id,
        startTime: '09:00',
        endTime: '12:00',
        title: 'Deep Work Morning',
        description: 'Focus on important tasks',
        categoryId: productivityCategory.id,
        energyLevel: 'HIGH',
        trackCompletion: true,
        sortOrder: 3,
        icon: '💻',
      },
      {
        userId: demoUser.id,
        templateId: workdayTemplate.id,
        startTime: '12:00',
        endTime: '13:00',
        title: 'Lunch Break',
        energyLevel: 'LOW',
        sortOrder: 4,
        icon: '🍽️',
      },
      {
        userId: demoUser.id,
        templateId: workdayTemplate.id,
        startTime: '21:00',
        endTime: '22:00',
        title: 'Evening Routine',
        description: 'Wind down, journal, prepare for bed',
        categoryId: mindfulnessCategory.id,
        energyLevel: 'LOW',
        trackCompletion: true,
        sortOrder: 5,
        icon: '🌙',
      },
      
      // Weekend blocks
      {
        userId: demoUser.id,
        templateId: weekendTemplate.id,
        startTime: '08:00',
        endTime: '09:00',
        title: 'Leisurely Morning',
        energyLevel: 'MEDIUM',
        sortOrder: 1,
        icon: '☕',
      },
      {
        userId: demoUser.id,
        templateId: weekendTemplate.id,
        startTime: '09:00',
        endTime: '10:00',
        title: 'Morning Habits',
        categoryId: healthCategory.id,
        energyLevel: 'HIGH',
        trackCompletion: true,
        sortOrder: 2,
        icon: '🏃',
      },
      {
        userId: demoUser.id,
        templateId: weekendTemplate.id,
        startTime: '10:00',
        endTime: '12:00',
        title: 'Personal Projects',
        description: 'Hobbies, learning, creative work',
        energyLevel: 'HIGH',
        sortOrder: 3,
        icon: '🎨',
      },
    ],
  });

  // ============================================================================
  // Create Goals
  // ============================================================================

  console.log('🎯 Creating goals...');

  const fitnessGoal = await prisma.goal.create({
    data: {
      userId: demoUser.id,
      type: GoalType.MONTHLY,
      priority: GoalPriority.HIGH,
      status: GoalStatus.ACTIVE,
      title: 'Exercise 20 days this month',
      description: 'Maintain consistent exercise routine',
      targetValue: 20,
      currentValue: 5,
      unit: 'days',
      startDate: new Date(new Date().getFullYear(), new Date().getMonth(), 1),
      endDate: new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0),
    },
  });

  const readingGoal = await prisma.goal.create({
    data: {
      userId: demoUser.id,
      type: GoalType.MONTHLY,
      priority: GoalPriority.MEDIUM,
      status: GoalStatus.ACTIVE,
      title: 'Read 3 books',
      description: 'Complete 3 books this month',
      targetValue: 3,
      currentValue: 1,
      unit: 'books',
      startDate: new Date(new Date().getFullYear(), new Date().getMonth(), 1),
      endDate: new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0),
    },
  });

  await prisma.milestone.createMany({
    data: [
      {
        goalId: readingGoal.id,
        title: 'First book completed',
        targetValue: 1,
        completedAt: new Date(),
        sortOrder: 1,
      },
      {
        goalId: readingGoal.id,
        title: 'Second book completed',
        targetValue: 2,
        sortOrder: 2,
      },
      {
        goalId: readingGoal.id,
        title: 'Third book completed',
        targetValue: 3,
        sortOrder: 3,
      },
    ],
  });

  // ============================================================================
  // Create Streak
  // ============================================================================

  console.log('🔥 Creating streak...');

  await prisma.streak.create({
    data: {
      userId: demoUser.id,
      currentStreak: 7,
      longestStreak: 14,
      coreStreak: 7,
      growthStreak: 7,
      minimumDayStreak: 0,
      totalCompletedDays: 45,
      totalMinimumDays: 2,
      totalRestDays: 1,
      streakStartDate: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      lastCompletedDate: new Date().toISOString().split('T')[0],
    },
  });

  // ============================================================================
  // Create Quotes
  // ============================================================================

  console.log('💬 Creating quotes...');

  await prisma.quote.createMany({
    data: [
      {
        userId: demoUser.id,
        text: 'The secret of getting ahead is getting started.',
        author: 'Mark Twain',
        isPublic: false,
        isFavorite: true,
      },
      {
        userId: demoUser.id,
        text: 'Success is the sum of small efforts repeated day in and day out.',
        author: 'Robert Collier',
        isPublic: false,
        isFavorite: true,
      },
      {
        userId: demoUser.id,
        text: "You don't have to be great to start, but you have to start to be great.",
        author: 'Zig Ziglar',
        isPublic: false,
      },
    ],
  });

  console.log('✨ Database seed completed successfully!');
  console.log('\n📊 Summary:');
  console.log(`  - Users: 2 (demo@routineos.com, admin@routineos.com)`);
  console.log(`  - Password: Password123!`);
  console.log(`  - Categories: 4`);
  console.log(`  - Habits: 6`);
  console.log(`  - Routine Templates: 2`);
  console.log(`  - Goals: 2`);
  console.log(`  - Quotes: 3`);
}

main()
  .catch((e) => {
    console.error('❌ Error seeding database:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });