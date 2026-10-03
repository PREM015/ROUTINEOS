import type { DailyReflection } from '@/generated/prisma';
import { ReflectionRepository } from '@/server/repositories/reflection.repository';
import { reflectionSchema, type ReflectionInput } from '@/schemas/reflection.schema';
import type { UserId } from '@/types/ids';

/**
 * Daily reflection operations.
 * Validates input with Zod and delegates persistence to the repository.
 */

const reflectionRepository = new ReflectionRepository();

export interface ReflectionAverages {
  energy: number;
  mood: number;
  stress: number;
}

/**
 * Create or update a reflection for a user/date pair. `tomorrowPriorities` is
 * stored as a JSON array string, matching the journal entry convention.
 */
export async function upsertReflection(
  userId: UserId,
  input: ReflectionInput
): Promise<DailyReflection> {
  const data = reflectionSchema.parse(input);
  const gratitude = Array.isArray(data.gratitude)
    ? JSON.stringify(data.gratitude)
    : data.gratitude;
  const tomorrowPriorities =
    data.tomorrowPriorities !== undefined
      ? Array.isArray(data.tomorrowPriorities)
        ? JSON.stringify(data.tomorrowPriorities)
        : data.tomorrowPriorities
      : undefined;
  return reflectionRepository.upsertReflection(userId, data.date, {
    energy: data.energy,
    mood: data.mood,
    stress: data.stress,
    focus: data.focus,
    reflectionText: data.reflectionText,
    biggestWin: data.biggestWin,
    biggestDifficulty: data.biggestDifficulty,
    lessonsLearned: data.lessonsLearned,
    gratitude,
    improvements: data.improvements,
    tomorrowFocus: data.tomorrowFocus,
    tomorrowPriorities,
  });
}

/**
 * Fetch a reflection for a specific date, or `null` when none exists.
 */
export async function getReflection(
  userId: UserId,
  date: string
): Promise<DailyReflection | null> {
  return reflectionRepository.findByDate(userId, date);
}

/**
 * Fetch reflections within a date range (inclusive, newest first).
 */
export async function getReflectionsForRange(
  userId: UserId,
  startDate: string,
  endDate: string
): Promise<DailyReflection[]> {
  return reflectionRepository.findByRange(userId, startDate, endDate);
}

/**
 * Average energy, mood, and stress across a date range (0 when no data).
 */
export async function getReflectionAverages(
  userId: UserId,
  startDate: string,
  endDate: string
): Promise<ReflectionAverages> {
  const [energy, mood, stress] = await Promise.all([
    reflectionRepository.getAverageEnergy(userId, startDate, endDate),
    reflectionRepository.getAverageMood(userId, startDate, endDate),
    reflectionRepository.getAverageStress(userId, startDate, endDate),
  ]);
  return { energy, mood, stress };
}

/**
 * Count reflections that carry at least one meaningful data point.
 */
export async function countReflectionsWithData(
  userId: UserId,
  startDate: string,
  endDate: string
): Promise<number> {
  return reflectionRepository.countWithData(userId, startDate, endDate);
}
