import { PrismaClient } from '@prisma/client'; import { ExportData } from './exporter';
export async function importUserData(userId: string, data: ExportData, db: PrismaClient): Promise<{ imported: number; skipped: number; errors: string[] }> {
  let imported = 0; const errors: string[] = [];
  try { imported += await importHabits(userId, data.habits || [], db); imported += await importGoals(userId, data.goals || [], db); } catch (err: any) { errors.push(err.message); }
  return { imported, skipped: 0, errors };
}
export async function importHabits(userId: string, habits: any[], db: PrismaClient): Promise<number> {
  let count = 0; for (const h of habits) { await (db as any).habit.create({ data: { ...h, userId, id: undefined } }); count++; } return count;
}
export async function importGoals(userId: string, goals: any[], db: PrismaClient): Promise<number> {
  let count = 0; for (const g of goals) { await (db as any).goal.create({ data: { ...g, userId, id: undefined } }); count++; } return count;
}
