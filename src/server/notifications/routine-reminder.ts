import { PrismaClient } from '@prisma/client';

export async function getUpcomingBlocks(
  userId: string,
  db: PrismaClient,
  withinMinutes: number = 30
): Promise<Array<{ blockId: string; name: string; startTime: string }>> {
  const blocks = (await (db as any).routineBlock.findMany({ where: { template: { userId } } })) || [];
  return blocks.map((b: any) => ({
    blockId: b.id,
    name: b.name,
    startTime: b.startTime || '08:00'
  }));
}

export function buildRoutineReminderMessage(blockName: string, startTime: string, minutesBefore: number): { title: string; body: string } {
  return {
    title: `Upcoming: ${blockName}`,
    body: `Starts in ${minutesBefore} minutes at ${startTime}.`
  };
}
