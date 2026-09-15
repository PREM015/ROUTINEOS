import { PrismaClient } from '@prisma/client';

export async function canGenerateInsights(userId: string, db: PrismaClient): Promise<{ allowed: boolean; reason?: string }> {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const existingInsight = await (db as any).aIInsight?.findFirst({
    where: {
      userId,
      createdAt: {
        gte: today
      }
    }
  }).catch(() => null);

  if (existingInsight) {
    return { allowed: false, reason: 'Maximum of 1 generation per day per user reached.' };
  }

  return { allowed: true };
}

export async function recordInsightGeneration(userId: string, db: PrismaClient): Promise<void> {
  await (db as any).aIInsight?.create({
    data: {
      userId,
      content: 'RECORDED',
      createdAt: new Date()
    }
  }).catch(() => null);
}
