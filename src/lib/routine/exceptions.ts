import type { DayType, RoutineException } from '@prisma/client';
import { RoutineRepository } from '@/server/repositories/routine.repository';
import { prisma } from '@/lib/prisma';
import { getDayTypeForDate } from '@/constants/routine';
import { ConflictError } from '@/lib/errors/app-error';

/**
 * Routine exception operations.
 * Per-date overrides for which routine applies on a given day.
 */

const routineRepository = new RoutineRepository();

export interface CreateRoutineExceptionInput {
  date: string; // YYYY-MM-DD
  dayType: DayType;
  templateId?: string;
  note?: string;
  reason?: string;
}

/**
 * The implied day type for a date when no explicit exception exists.
 */
export function defaultDayTypeForDate(date: string): DayType {
  const parsed = new Date(`${date}T12:00:00`);
  return getDayTypeForDate(parsed);
}

/**
 * Fetch the exception for a date, or `null` when none is set.
 */
export async function getRoutineException(
  userId: string,
  date: string
): Promise<RoutineException | null> {
  return routineRepository.findException(userId, date);
}

/**
 * List exceptions across the given window, sorted by date ascending.
 */
export async function listRoutineExceptions(
  userId: string,
  startDate: string,
  endDate: string
): Promise<RoutineException[]> {
  return prisma.routineException.findMany({
    where: {
      userId,
      date: { gte: startDate, lte: endDate },
    },
    include: { template: true },
    orderBy: { date: 'asc' },
  });
}

/**
 * Create a per-date exception. Only one exception can exist per user/date.
 */
export async function createRoutineException(
  userId: string,
  input: CreateRoutineExceptionInput
): Promise<RoutineException> {
  const existing = await routineRepository.findException(userId, input.date);
  if (existing) {
    throw new ConflictError(`An exception already exists for ${input.date}`);
  }
  return routineRepository.createException({
    date: input.date,
    dayType: input.dayType,
    user: { connect: { id: userId } },
    template: input.templateId ? { connect: { id: input.templateId } } : undefined,
    note: input.note,
    reason: input.reason,
  });
}

/**
 * Remove the exception for a date. Returns whether a row was removed.
 */
export async function deleteRoutineException(
  exceptionId: string
): Promise<boolean> {
  await routineRepository.deleteException(exceptionId);
  return true;
}