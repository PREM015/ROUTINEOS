import type { DayType } from '@/generated/prisma/client';
import prisma from '@/lib/prisma';

function assertDate(date: string): void {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(new Date(`${date}T12:00:00.000Z`).valueOf())) {
    throw new Error('date must use YYYY-MM-DD format.');
  }
}

/** The date is already expressed in the user’s timezone, so weekday detection is calendar-based. */
export function resolveNaturalDayType(date: string, _timezone: string): DayType {
  assertDate(date);
  const weekday = new Date(`${date}T12:00:00.000Z`).getUTCDay();
  return weekday === 0 || weekday === 6 ? 'WEEKEND' : 'WORKDAY';
}

/**
 * The sole read path for a date’s routine. Callers must not query RoutineBlock
 * by day type directly: exceptions, template defaults, and block ordering stay
 * consistent everywhere this is used.
 */
export async function getRoutineForDate(userId: string, date: string, timezone: string) {
  assertDate(date);
  const exception = await prisma.routineException.findUnique({
    where: { userId_date: { userId, date } },
  });

  if (exception?.templateId) {
    return prisma.routineTemplate.findFirst({
      where: { id: exception.templateId, userId },
      include: { blocks: { include: { category: true }, orderBy: { sortOrder: 'asc' } } },
    });
  }

  const dayType = exception?.dayType ?? resolveNaturalDayType(date, timezone);
  return prisma.routineTemplate.findFirst({
    where: { userId, dayType, isDefault: true },
    include: { blocks: { include: { category: true }, orderBy: { sortOrder: 'asc' } } },
    orderBy: { updatedAt: 'desc' },
  });
}
