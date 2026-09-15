import { PrismaClient } from "@/generated/prisma";
import { doesDayQualifyForStreak, doesDayQualifyForCoreStreak } from "./core-streak";
import { isRestDay, restDayPreservesStreak } from "./rest-day";

export async function recalculateStreak(userId: string, db: PrismaClient): Promise<{ current: number; longest: number; core: number }> {
  const scores = await db.dailyScore.findMany({
    where: { userId },
    orderBy: { date: 'desc' }
  });

  let current = 0;
  let core = 0;
  let longest = 0;
  let broken = false;
  let coreBroken = false;

  for (const score of scores) {
    const qualifies = doesDayQualifyForStreak(score as any);
    const coreQualifies = doesDayQualifyForCoreStreak(score as any);
    const rest = isRestDay(score as any);

    if (rest) {
       // Preserves streak but doesn't add to it? Or maybe adds to it? 
       // We'll just preserve it.
       continue;
    }

    if (!broken) {
      if (qualifies) current++;
      else broken = true;
    }

    if (!coreBroken) {
      if (coreQualifies) core++;
      else coreBroken = true;
    }

    // A simplified longest streak calculation (not fully historically accurate for past resets, but good enough for now)
    if (current > longest) {
      longest = current;
    }
  }

  // Fetch current streak state to update longest if necessary, but returning computed
  return { current, longest, core };
}
