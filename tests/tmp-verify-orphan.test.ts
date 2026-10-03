// @vitest-environment node
/** THROWAWAY verification of the orphaned-completion fix against the real database. */
import { describe, expect, it } from 'vitest';
import { RoutineService } from '@/server/services/routine.service';
import { prisma } from '@/lib/prisma';

const svc = new RoutineService();

describe('orphaned completion fix', () => {
  it(
    'a day whose day type changed after logging still reports its completions',
    async () => {
      const score = await prisma.dailyScore.findFirst({ orderBy: { date: 'desc' } });
      const userId = score!.userId;

      const raw = await prisma.routineLog.findMany({ where: { userId, date: '2026-10-02' } });
      const rawCompleted = raw.filter((l) => l.status === 'COMPLETED').length;
      console.log(`\n  raw COMPLETED logs on 2026-10-02 : ${rawCompleted}`);
      expect(rawCompleted).toBeGreaterThan(0);

      const day = await svc.getRoutineForDate(userId, '2026-10-02');
      console.log(`\n  getRoutineForDate:`);
      console.log(`    totalBlocks=${day.totalBlocks} completedBlocks=${day.completedBlocks} rate=${day.completionRate}%`);
      console.log(`    offScheduleLogs:`);
      for (const o of day.offScheduleLogs ?? []) {
        console.log(`      - "${o.title}" template="${o.templateName}"`);
      }

      const p = (await svc.getRoutineProgress(userId, 'week', '2026-10-02')) as Record<string, unknown>;
      const days = (p.days ?? []) as Array<Record<string, unknown>>;
      console.log(`\n  getRoutineProgress(week):`);
      for (const d of days) {
        console.log(
          `    ${d.date} total=${d.total} completed=${d.completed} rate=${d.completionRate}% switched=${d.scheduleSwitched} name="${d.dayTypeName}"`
        );
      }
      const today = days.find((d) => d.date === '2026-10-02')!;

      console.log(`\n=== ASSERTIONS ===`);
      expect(day.completedBlocks).toBe(rawCompleted);
      expect(Number(today.completed)).toBe(rawCompleted);
      expect(day.completionRate).toBeGreaterThan(0);
      expect(Number(today.completionRate)).toBeGreaterThan(0);
      expect(day.offScheduleLogs?.length ?? 0).toBeGreaterThan(0);
      expect(today.scheduleSwitched).toBe(true);

      // Both surfaces must count the same work.
      expect(day.completedBlocks).toBe(Number(today.completed));

      // An ordinary day must be untouched.
      const ordinary = days.find((d) => d.date === '2026-10-01')!;
      console.log(`  ordinary day 2026-10-01 switched=${ordinary.scheduleSwitched} (must be false)`);
      expect(ordinary.scheduleSwitched).toBe(false);

      console.log(`\n  ALL PASS`);

      await prisma.$disconnect();
    },
    120000
  );
});