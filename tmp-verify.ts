import 'dotenv/config';
import prisma from '@/lib/prisma';

async function main() {
  console.log('=== new tables ===');
  const tables = await prisma.$queryRawUnsafe<{ tablename: string }[]>(
    `SELECT tablename FROM pg_tables WHERE schemaname='public' AND tablename IN
     ('HabitDefinition','Exercise','WorkoutSession','WorkoutSessionExercise','WorkoutSet','ProblemLog','JobApplication')
     ORDER BY tablename`
  );
  console.log(tables.length === 0 ? '  NONE - push did not apply' : tables.map((t) => `  ${t.tablename}`).join('\n'));

  console.log('\n=== new Habit columns ===');
  const cols = await prisma.$queryRawUnsafe<{ column_name: string; data_type: string }[]>(
    `SELECT column_name, data_type FROM information_schema.columns
     WHERE table_name='Habit' AND column_name IN
     ('definitionId','trackingType','direction','targetValue','unit','timeOfDay','sortOrder','linkedMetricType','intervalDays','parentHabitId')
     ORDER BY column_name`
  );
  for (const c of cols) console.log(`  ${c.column_name.padEnd(18)} ${c.data_type}`);

  console.log('\n=== HabitLog.quantity (should be double precision) ===');
  const q = await prisma.$queryRawUnsafe<{ data_type: string }[]>(
    `SELECT data_type FROM information_schema.columns WHERE table_name='HabitLog' AND column_name='quantity'`
  );
  console.log(`  ${q[0]?.data_type}`);

  console.log('\n=== Habit unique index ===');
  const idx = await prisma.$queryRawUnsafe<{ indexname: string }[]>(
    `SELECT indexname FROM pg_indexes WHERE tablename='Habit' AND indexname='Habit_userId_name_key'`
  );
  console.log(idx.length > 0 ? '  Habit_userId_name_key EXISTS' : '  MISSING');

  console.log('\n=== row counts ===');
  console.log(`  users ${await prisma.user.count()} | habits ${await prisma.habit.count()}`);

  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});