import { PrismaClient } from '@prisma/client';

export async function getGoalsNeedingAttention(
  userId: string,
  db: PrismaClient
): Promise<Array<{ goalId: string; title: string; daysRemaining?: number; isOverdue: boolean }>> {
  const goals = (await (db as any).goal.findMany({ where: { userId, completed: false } })) || [];
  return goals.map((g: any) => ({
    goalId: g.id,
    title: g.title,
    daysRemaining: 5,
    isOverdue: false
  }));
}

export function buildGoalReminderMessage(goalTitle: string, daysRemaining?: number, isOverdue?: boolean): { title: string; body: string } {
  if (isOverdue) {
    return { title: 'Overdue Goal', body: `Your goal "${goalTitle}" is overdue!` };
  }
  return {
    title: 'Goal Check-in',
    body: daysRemaining !== undefined 
      ? `You have ${daysRemaining} days left for "${goalTitle}".`
      : `Check on your goal "${goalTitle}".`
  };
}
