import prisma from '@/lib/prisma';

async function main() {
  const dupes = await prisma.$queryRawUnsafe<{ goalId: string; date: Date; ids: string[]; count: number }[]>(`
    SELECT "goalId", "date", array_agg(id) as ids, count(*)
    FROM "GoalProgress"
    GROUP BY "goalId", "date"
    HAVING count(*) > 1
  `);

  if (dupes.length === 0) {
    console.log('No duplicate GoalProgress rows found. Push can proceed.');
    return;
  }

  console.log(`Found ${dupes.length} goal+date pairs with duplicates:`);
  for (const d of dupes) {
    console.log(`  goalId=${d.goalId} date=${d.date.toISOString().slice(0,10)} count=${d.count} ids=${d.ids.join(', ')}`);
  }

  for (const d of dupes) {
    const keepId = d.ids[0];
    const deleteIds = d.ids.slice(1);
    await prisma.$executeRawUnsafe(
      `DELETE FROM "GoalProgress" WHERE id IN (${deleteIds.map(() => '$1').join(',')})`,
      ...deleteIds
    );
    console.log(`  Deleted ${deleteIds.length} duplicate(s) for goal ${d.goalId}, kept ${keepId}`);
  }

  console.log('Duplicate cleanup complete. Unique constraint can now be applied.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });