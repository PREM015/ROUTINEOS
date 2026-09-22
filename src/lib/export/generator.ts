/**
 * Export generation pipeline.
 *
 * `generateFullExport` builds a portable JSON bundle from the server data
 * exporter (`@/server/data/exporter`); `generateDomainExport` produces the
 * domain-specific CSV exports (habits, goals, activity). Both are pure
 * data-assembly functions – callers decide how to deliver the payload
 * (download/send/archive).
 */

import prisma from '@/lib/prisma';
import { exportUserData } from '@/server/data/exporter';
import {
  toJSON,
  formatHabitsAsCSV,
  formatGoalsAsCSV,
  formatActivitiesAsCSV,
} from './formatters';
import type { ExportBundle, JsonRecord } from './formatters';

/**
 * Collect domain data for a user: habits, goals and activity log lines.
 * Uses the repositories' own queries via Prisma directly for a light shape.
 */
export async function getDomainExportData(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, email: true, name: true, timezone: true, createdAt: true },
  });
  if (!user) {
    throw new Error('User not found');
  }

  const [habits, goals, activities] = await Promise.all([
    prisma.habit.findMany({ where: { userId } }),
    prisma.goal.findMany({ where: { userId } }),
    prisma.activityLog.findMany({
      where: { userId },
      orderBy: { timestamp: 'desc' },
      take: 10_000,
    }),
  ]);

  return {
    user,
    habits,
    goals,
    activities,
  };
}

export interface FullExportResult {
  payload: JsonRecord;
  json: string;
  fileName: string;
  exportedAt: string;
}

/**
 * Full export: identical to `exportUserData`, wrapped in versioned metadata
 * and pretty-printed JSON. Filename embeds the export date.
 */
export async function generateFullExport(
  userId: string,
  options?: { includeArchived?: boolean; startDate?: string; endDate?: string }
): Promise<FullExportResult> {
  const data = (await exportUserData(userId, options)) as unknown as JsonRecord;
  const exportedAt = new Date().toISOString();

  const bundle: ExportBundle = {
    version: '1.0',
    exportedAt,
    data,
  };

  const json = toJSON(bundle as unknown as JsonRecord);
  const dateStamp = exportedAt.split('T')[0] ?? 'export';
  const fileName = `routineos-export-${dateStamp}.json`;

  return {
    payload: bundle as unknown as JsonRecord,
    json,
    fileName,
    exportedAt,
  };
}

export interface DomainExportResult {
  user: Awaited<ReturnType<typeof getDomainExportData>>['user'];
  habitsCsv: string;
  goalsCsv: string;
  activitiesCsv: string;
  concatenatedCsv: string;
  json: string;
  fileNameRoot: string;
  exportedAt: string;
}

/**
 * Domain export: columns-wise CSVs for habits, goals and activity plus a single
 * concatenated CSV (section headers included) and the raw domain JSON.
 */
export async function generateDomainExport(
  userId: string
): Promise<DomainExportResult> {
  const { user, habits, goals, activities } = await getDomainExportData(userId);

  const habitsCsv = formatHabitsAsCSV(habits);
  const goalsCsv = formatGoalsAsCSV(goals);
  const activitiesCsv = formatActivitiesAsCSV(activities);

  const sections = [
    ['== HabitLogs ==', habitsCsv],
    ['== Goals ==', goalsCsv],
    ['== Activities ==', activitiesCsv],
  ];
  const concatenatedCsv = sections
    .map(([heading, csv]) => `${heading}\n${csv}`)
    .join('\n\n');

  const exportedAt = new Date().toISOString();
  const json = toJSON({
    exportedAt,
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
    },
    habitsCount: habits.length,
    goalsCount: goals.length,
    activitiesCount: activities.length,
  });

  return {
    user,
    habitsCsv,
    goalsCsv,
    activitiesCsv,
    concatenatedCsv,
    json,
    fileNameRoot: `routineos-domain-${exportedAt.split('T')[0] ?? 'export'}`,
    exportedAt,
  };
}