import { PrismaClient } from '@/generated/prisma';
import { PrismaPg } from '@prisma/adapter-pg';

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error('DATABASE_URL is not set');
}

const adapter = new PrismaPg({ connectionString });
const prisma = new PrismaClient({ adapter });

const DEFAULT_DAY_TYPES = [
  { name: 'Work Day', slug: 'work-day', enumValue: 'WORKDAY', color: '#3b82f6', icon: 'briefcase', description: 'Standard work day routine', sortOrder: 0 },
  { name: 'Weekend', slug: 'weekend', enumValue: 'WEEKEND', color: '#22c55e', icon: 'sun', description: 'Weekend routine', sortOrder: 1 },
  { name: 'Holiday', slug: 'holiday', enumValue: 'HOLIDAY', color: '#f97316', icon: 'plane', description: 'Holiday routine', sortOrder: 2 },
  { name: 'Exam Day', slug: 'exam-day', enumValue: 'EXAM_DAY', color: '#8b5cf6', icon: 'graduation-cap', description: 'Exam preparation routine', sortOrder: 3 },
  { name: 'Low Energy Day', slug: 'low-energy-day', enumValue: 'LOW_ENERGY', color: '#f59e0b', icon: 'battery', description: 'Low energy recovery routine', sortOrder: 4 },
];

const ENUM_TO_SLUG: Record<string, string> = {
  'WORKDAY': 'work-day',
  'WEEKEND': 'weekend',
  'HOLIDAY': 'holiday',
  'EXAM_DAY': 'exam-day',
  'LOW_ENERGY': 'low-energy-day',
  'CUSTOM': 'custom',
};

async function seedDayTypes() {
  console.log('Starting day type seeding...');

  const users = await prisma.user.findMany({
    where: { isDeleted: false },
    select: { id: true },
  });

  console.log(`Found ${users.length} users`);

  let totalCreated = 0;
  let totalUpdated = 0;

  for (const user of users) {
    console.log(`\nProcessing user: ${user.id}`);

    for (const dt of DEFAULT_DAY_TYPES) {
      const existing = await prisma.dayTypeDefinition.findUnique({
        where: { userId_slug: { userId: user.id, slug: dt.slug } },
      });

      if (existing) {
        console.log(`  - ${dt.name} (${dt.slug}) already exists, skipping`);
        continue;
      }

      const created = await prisma.dayTypeDefinition.create({
        data: {
          userId: user.id,
          name: dt.name,
          slug: dt.slug,
          color: dt.color,
          icon: dt.icon,
          description: dt.description,
          isDefault: true,
          isArchived: false,
          sortOrder: dt.sortOrder,
        },
      });

      console.log(`  + Created: ${created.name} (${created.slug})`);
      totalCreated++;
    }

    // Backfill RoutineTemplate.dayTypeId
    const templates = await prisma.routineTemplate.findMany({
      where: { userId: user.id },
      select: { id: true, dayType: true, dayTypeId: true },
    });

    for (const template of templates) {
      const slug = ENUM_TO_SLUG[template.dayType];
      if (!slug) continue;
      
      const dayTypeDef = await prisma.dayTypeDefinition.findUnique({
        where: { userId_slug: { userId: user.id, slug } },
      });

      if (dayTypeDef && template.dayTypeId !== dayTypeDef.id) {
        await prisma.routineTemplate.update({
          where: { id: template.id },
          data: { dayTypeId: dayTypeDef.id },
        });
        console.log(`  ↳ Backfilled template ${template.id} (${template.dayType}) with dayTypeId ${dayTypeDef.id}`);
        totalUpdated++;
      }
    }

    // Backfill RoutineException.dayTypeId
    const exceptions = await prisma.routineException.findMany({
      where: { userId: user.id },
      select: { id: true, dayType: true, dayTypeId: true },
    });

    for (const exception of exceptions) {
      const slug = ENUM_TO_SLUG[exception.dayType];
      if (!slug) continue;
      
      const dayTypeDef = await prisma.dayTypeDefinition.findUnique({
        where: { userId_slug: { userId: user.id, slug } },
      });

      if (dayTypeDef && exception.dayTypeId !== dayTypeDef.id) {
        await prisma.routineException.update({
          where: { id: exception.id },
          data: { dayTypeId: dayTypeDef.id },
        });
        console.log(`  ↳ Backfilled exception ${exception.id} (${exception.dayType}) with dayTypeId ${dayTypeDef.id}`);
        totalUpdated++;
      }
    }
  }

  console.log(`\n=== Seeding Complete ===`);
  console.log(`Day types created: ${totalCreated}`);
  console.log(`Records backfilled: ${totalUpdated}`);
}

seedDayTypes()
  .catch((e) => {
    console.error('Seeding failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });