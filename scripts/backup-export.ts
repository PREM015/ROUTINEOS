/**
 * Backup Export Script
 * Dumps the core user-owned tables to a timestamped JSON file under
 * `./backups`. Useful for operational snapshots and disaster recovery.
 *
 * Run with:
 *   node scripts/backup-export.ts      (Node 22.7+ / 23 with type stripping)
 *   npx tsx scripts/backup-export.ts   (alternative runner)
 *
 * Requires DATABASE_URL to be present in the environment.
 */

import { PrismaClient } from '@prisma/client';
import { mkdir, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';

const SAMPLE_LIMIT = 1000;

const prisma = new PrismaClient();

/** Local timestamp used as the backup file name, e.g. 20260919-153042. */
function timestamp(): string {
  const now = new Date();
  const pad = (n: number): string => String(n).padStart(2, '0');
  return [
    now.getFullYear(),
    pad(now.getMonth() + 1),
    pad(now.getDate()),
    '-',
    pad(now.getHours()),
    pad(now.getMinutes()),
    pad(now.getSeconds()),
  ].join('');
}

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error('DATABASE_URL is required. Set it in the environment before running this script.');
    process.exit(1);
  }

  console.log('Connecting to the database…');

  const [userCount, users] = await Promise.all([
    prisma.user.count(),
    prisma.user.findMany({ orderBy: { createdAt: 'desc' }, take: SAMPLE_LIMIT }),
  ]);

  const [habitCount, habits] = await Promise.all([
    prisma.habit.count(),
    prisma.habit.findMany({ orderBy: { createdAt: 'desc' }, take: SAMPLE_LIMIT }),
  ]);

  const [goalCount, goals] = await Promise.all([
    prisma.goal.count(),
    prisma.goal.findMany({ orderBy: { createdAt: 'desc' }, take: SAMPLE_LIMIT }),
  ]);

  const [taskCount, tasks] = await Promise.all([
    prisma.task.count(),
    prisma.task.findMany({ orderBy: { createdAt: 'desc' }, take: SAMPLE_LIMIT }),
  ]);

  const [journalCount, journalEntries] = await Promise.all([
    prisma.journalEntry.count(),
    prisma.journalEntry.findMany({ orderBy: { createdAt: 'desc' }, take: SAMPLE_LIMIT }),
  ]);

  const [sleepCount, sleepLogs] = await Promise.all([
    prisma.sleepLog.count(),
    prisma.sleepLog.findMany({ orderBy: { createdAt: 'desc' }, take: SAMPLE_LIMIT }),
  ]);

  const [moodCount, moodLogs] = await Promise.all([
    prisma.moodLog.count(),
    prisma.moodLog.findMany({ orderBy: { createdAt: 'desc' }, take: SAMPLE_LIMIT }),
  ]);

  const [dailyScoreCount, dailyScores] = await Promise.all([
    prisma.dailyScore.count(),
    prisma.dailyScore.findMany({ orderBy: { createdAt: 'desc' }, take: SAMPLE_LIMIT }),
  ]);

  const [routineCount, routineTemplates] = await Promise.all([
    prisma.routineTemplate.count(),
    prisma.routineTemplate.findMany({ orderBy: { createdAt: 'desc' }, take: SAMPLE_LIMIT }),
  ]);

  const backup = {
    exportedAt: new Date().toISOString(),
    generator: 'scripts/backup-export.ts',
    tables: [
      { name: 'User', count: userCount, recentRows: users },
      { name: 'Habit', count: habitCount, recentRows: habits },
      { name: 'Goal', count: goalCount, recentRows: goals },
      { name: 'Task', count: taskCount, recentRows: tasks },
      { name: 'JournalEntry', count: journalCount, recentRows: journalEntries },
      { name: 'SleepLog', count: sleepCount, recentRows: sleepLogs },
      { name: 'MoodLog', count: moodCount, recentRows: moodLogs },
      { name: 'DailyScore', count: dailyScoreCount, recentRows: dailyScores },
      { name: 'RoutineTemplate', count: routineCount, recentRows: routineTemplates },
    ],
  };

  const backupsDir = resolve(process.cwd(), 'backups');
  await mkdir(backupsDir, { recursive: true });

  const filePath = join(backupsDir, `backup-${timestamp()}.json`);
  const serialized = `${JSON.stringify(backup, null, 2)}\n`;
  await writeFile(filePath, serialized, 'utf8');

  console.log('Backup written to %s', filePath);
  console.log('Size: %.1f KB', serialized.length / 1024);
  console.log('Table counts:');
  for (const table of backup.tables) {
    console.log('  %s: %s', table.name, table.count.toLocaleString());
  }
}

main()
  .then(() => prisma.$disconnect())
  .catch((error: unknown) => {
    console.error('Backup failed:', error);
    return prisma.$disconnect().catch(() => undefined).finally(() => process.exit(1));
  });