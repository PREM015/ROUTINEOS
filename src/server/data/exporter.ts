import { PrismaClient } from '@prisma/client';
export interface ExportData { exportedAt: string; version: string; user: any; habits: any[]; goals: any[]; sleepLogs: any[]; scores: any[]; reflections: any[]; }
export async function exportUserData(userId: string, db: PrismaClient): Promise<ExportData> {
  const [user, habits, goals] = await Promise.all([ (db as any).user.findUnique({ where: { id: userId } }), (db as any).habit.findMany({ where: { userId } }), (db as any).goal.findMany({ where: { userId } }) ]);
  return { exportedAt: new Date().toISOString(), version: '1.0', user, habits: habits || [], goals: goals || [], sleepLogs: [], scores: [], reflections: [] };
}
export function serializeExportData(data: ExportData): string { return JSON.stringify(data, null, 2); }
