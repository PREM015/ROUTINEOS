import type {
  Exercise,
  WorkoutSession,
  WorkoutSessionExercise,
  WorkoutSet,
  ProblemLog,
  JobApplication,
  Prisma,
  ApplicationStatus,
} from '@/generated/prisma';
import { BaseRepository } from './base.repository';
import type { UserId } from '@/types/ids';

/**
 * Workout, DSA and job-application data. All three domains, one repository.
 *
 * They are grouped because they share exactly one property that matters here:
 * **every method is keyed on `userId`**, and none of them has an overload that
 * takes a bare id. `findSession(id)` without a user cannot be written, so there
 * is no way to read another person's training log by guessing a cuid.
 *
 * Returns are `null` / `throw` rather than "found another user's row", which is
 * what lets the routes answer 404 for a foreign id without leaking that it
 * exists.
 */

/** One set as written by a client, before it is attached to anything. */
export interface SetInput {
  setNumber: number;
  reps?: number | null;
  weightKg?: number | null;
  rpe?: number | null;
  isWarmup?: boolean;
  notes?: string | null;
}

export class WorkoutRepository extends BaseRepository {
  // ── Exercises ────────────────────────────────────────────────────────────

  async findExercises(userId: UserId, includeArchived = false): Promise<Exercise[]> {
    try {
      return await this.prisma.exercise.findMany({
        where: { userId, ...(includeArchived ? {} : { isArchived: false }) },
        orderBy: { name: 'asc' },
      });
    } catch (error) {
      this.handleError(error, 'findExercises');
    }
  }

  /**
   * Create or fetch by `(userId, name)`.
   *
   * Backed by the new unique index, so a client that races itself — or a habit
   * that logs the same exercise twice — gets the existing row instead of a
   * unique violation surfacing as a 500.
   */
  async upsertExercise(
    userId: UserId,
    data: { name: string; description?: string | null; muscleGroup?: string | null; equipment?: string | null }
  ): Promise<Exercise> {
    try {
      return await this.prisma.exercise.upsert({
        where: { userId_name: { userId, name: data.name } },
        update: {
          ...(data.description !== undefined && { description: data.description }),
          ...(data.muscleGroup !== undefined && { muscleGroup: data.muscleGroup }),
          ...(data.equipment !== undefined && { equipment: data.equipment }),
        },
        create: {
          userId,
          name: data.name,
          description: data.description ?? null,
          muscleGroup: data.muscleGroup ?? null,
          equipment: data.equipment ?? null,
        },
      });
    } catch (error) {
      this.handleError(error, 'upsertExercise');
    }
  }

  async findExercise(exerciseId: string, userId: UserId): Promise<Exercise | null> {
    try {
      return await this.prisma.exercise.findFirst({ where: { id: exerciseId, userId } });
    } catch (error) {
      this.handleError(error, 'findExercise');
    }
  }

  /**
   * Delete an exercise and everything attached to it.
   *
   * `WorkoutSet` cascades from the exercise and `WorkoutSessionExercise`
   * cascades too, so the sets go with it. The **sessions** do not: the session
   * is the record that matters, and deleting a lookup row must not delete a
   * training history. The join rows within those sessions go, leaving the
   * session itself intact.
   */
  async deleteExercise(exerciseId: string, userId: UserId): Promise<boolean> {
    try {
      const result = await this.prisma.exercise.deleteMany({
        where: { id: exerciseId, userId },
      });
      return result.count > 0;
    } catch (error) {
      this.handleError(error, 'deleteExercise');
    }
  }

  // ── Sessions ─────────────────────────────────────────────────────────────

  /**
   * Sessions with their exercises and sets, newest first.
   *
   * Nested `include` rather than three queries so the whole log renders in one
   * round trip; the rows are already scoped to `userId` at the top level and the
   * joins are by foreign key, so no second user's data can be pulled in.
   */
  async findSessions(
    userId: UserId,
    options: { startDate?: string; endDate?: string; habitId?: string; limit?: number } = {}
  ): Promise<
    Array<WorkoutSession & { exercises: Array<WorkoutSessionExercise & { exercise: Exercise; sets: WorkoutSet[] }> }>
  > {
    try {
      return await this.prisma.workoutSession.findMany({
        where: {
          userId,
          ...(options.startDate && { date: { gte: options.startDate } }),
          ...(options.endDate && { date: { lte: options.endDate } }),
          ...(options.habitId && { habitId: options.habitId }),
        },
        include: {
          exercises: {
            include: { exercise: true, sets: { orderBy: { setNumber: 'asc' } } },
            orderBy: { sortOrder: 'asc' },
          },
        },
        orderBy: { date: 'desc' },
        take: options.limit ?? 50,
      });
    } catch (error) {
      this.handleError(error, 'findSessions');
    }
  }

  async findSession(sessionId: string, userId: UserId) {
    try {
      return await this.prisma.workoutSession.findFirst({
        where: { id: sessionId, userId },
        include: {
          exercises: {
            include: { exercise: true, sets: { orderBy: { setNumber: 'asc' } } },
            orderBy: { sortOrder: 'asc' },
          },
        },
      });
    } catch (error) {
      this.handleError(error, 'findSession');
    }
  }

  /**
   * A session plus all of its sets, written in one transaction.
   *
   * Either the whole session and every set land, or none of it does. A partially
   * written session is not a state the UI can render and a retry would duplicate
   * the sets that did land.
   */
  async createSessionWithSets(
    userId: UserId,
    data: {
      date: string;
      name?: string | null;
      notes?: string | null;
      habitId?: string | null;
      durationMinutes?: number | null;
      isRestDay?: boolean;
      exercises: Array<{ exerciseId: string; sortOrder?: number; notes?: string | null; sets: SetInput[] }>;
    }
  ) {
    try {
      return await this.prisma.$transaction(async (tx) => {
        const session = await tx.workoutSession.create({
          data: {
            userId,
            date: data.date,
            name: data.name ?? null,
            notes: data.notes ?? null,
            habitId: data.habitId ?? null,
            durationMinutes: data.durationMinutes ?? null,
            isRestDay: data.isRestDay ?? false,
          },
        });

        for (const [index, entry] of data.exercises.entries()) {
          // The join row is written first because it owns the sets: a `WorkoutSet`
          // hangs off it, not off the session and exercise separately.
          const link = await tx.workoutSessionExercise.create({
            data: {
              sessionId: session.id,
              exerciseId: entry.exerciseId,
              userId,
              sortOrder: entry.sortOrder ?? index,
              notes: entry.notes ?? null,
            },
          });

          if (entry.sets.length > 0) {
            await tx.workoutSet.createMany({
              data: entry.sets.map((set) => ({
                sessionExerciseId: link.id,
                userId,
                setNumber: set.setNumber,
                reps: set.reps ?? null,
                weightKg: set.weightKg ?? null,
                rpe: set.rpe ?? null,
                isWarmup: set.isWarmup ?? false,
                notes: set.notes ?? null,
              })),
            });
          }
        }

        return tx.workoutSession.findUniqueOrThrow({
          where: { id: session.id },
          include: {
            exercises: {
              include: { exercise: true, sets: { orderBy: { setNumber: 'asc' } } },
              orderBy: { sortOrder: 'asc' },
            },
          },
        });
      });
    } catch (error) {
      this.handleError(error, 'createSessionWithSets');
    }
  }

  async updateSession(
    sessionId: string,
    userId: UserId,
    data: Prisma.WorkoutSessionUpdateInput
  ): Promise<WorkoutSession | null> {
    try {
      // `updateMany` rather than `update` so a foreign id updates zero rows
      // instead of raising a "record not found" that would be indistinguishable
      // from a genuine error.
      const result = await this.prisma.workoutSession.updateMany({
        where: { id: sessionId, userId },
        data,
      });
      if (result.count === 0) return null;
      return this.prisma.workoutSession.findUnique({ where: { id: sessionId } });
    } catch (error) {
      this.handleError(error, 'updateSession');
    }
  }

  async deleteSession(sessionId: string, userId: UserId): Promise<boolean> {
    try {
      const result = await this.prisma.workoutSession.deleteMany({
        where: { id: sessionId, userId },
      });
      return result.count > 0;
    } catch (error) {
      this.handleError(error, 'deleteSession');
    }
  }

  /** Sessions in a date range, as a flat list for the calendar. */
  async findSessionDates(userId: UserId, startDate: string, endDate: string) {
    try {
      return await this.prisma.workoutSession.findMany({
        where: { userId, date: { gte: startDate, lte: endDate } },
        select: { id: true, date: true, name: true, isRestDay: true },
        orderBy: { date: 'asc' },
      });
    } catch (error) {
      this.handleError(error, 'findSessionDates');
    }
  }

  // ── DSA problems ─────────────────────────────────────────────────────────

  async findProblems(
    userId: UserId,
    options: { dueBefore?: string; status?: string; search?: string; limit?: number } = {}
  ): Promise<ProblemLog[]> {
    try {
      return await this.prisma.problemLog.findMany({
        where: {
          userId,
          ...(options.status && { status: options.status }),
          ...(options.dueBefore && {
            nextReviewAt: { lte: new Date(`${options.dueBefore}T23:59:59.999Z`) },
          }),
          ...(options.search && {
            OR: [
              { title: { contains: options.search, mode: 'insensitive' } },
              { platform: { contains: options.search, mode: 'insensitive' } },
              { topicTags: { contains: options.search, mode: 'insensitive' } },
            ],
          }),
        },
        orderBy: { nextReviewAt: { sort: 'asc', nulls: 'last' } },
        take: options.limit ?? 50,
      });
    } catch (error) {
      this.handleError(error, 'findProblems');
    }
  }

  async findProblem(id: string, userId: UserId): Promise<ProblemLog | null> {
    try {
      return await this.prisma.problemLog.findFirst({ where: { id, userId } });
    } catch (error) {
      this.handleError(error, 'findProblem');
    }
  }

  /**
 * Create a problem.
 *
 * Takes `Prisma.ProblemLogUncheckedCreateInput` so the caller may pass a flat
 * row with `userId` on it (the natural shape here, since the habit/problem is
 * always created for exactly one user) rather than having to build a
 * `user: { connect }` wrapper it cannot type without a cast.
 */
async createProblem(
    userId: UserId,
    data: Omit<Prisma.ProblemLogUncheckedCreateInput, 'userId'>
  ): Promise<ProblemLog> {
    try {
      return await this.prisma.problemLog.create({ data: { ...data, userId } });
    } catch (error) {
      this.handleError(error, 'createProblem');
    }
  }

  async updateProblem(
    id: string,
    userId: UserId,
    data: Prisma.ProblemLogUpdateInput
  ): Promise<ProblemLog | null> {
    try {
      const result = await this.prisma.problemLog.updateMany({ where: { id, userId }, data });
      if (result.count === 0) return null;
      return this.prisma.problemLog.findUnique({ where: { id } });
    } catch (error) {
      this.handleError(error, 'updateProblem');
    }
  }

  async deleteProblem(id: string, userId: UserId): Promise<boolean> {
    try {
      const result = await this.prisma.problemLog.deleteMany({ where: { id, userId } });
      return result.count > 0;
    } catch (error) {
      this.handleError(error, 'deleteProblem');
    }
  }

  // ── Job applications ─────────────────────────────────────────────────────

  async findApplications(
    userId: UserId,
    options: { status?: ApplicationStatus; limit?: number } = {}
  ): Promise<JobApplication[]> {
    try {
      return await this.prisma.jobApplication.findMany({
        where: { userId, ...(options.status && { status: options.status }) },
        orderBy: { appliedAt: 'desc' },
        take: options.limit ?? 100,
      });
    } catch (error) {
      this.handleError(error, 'findApplications');
    }
  }

  async findApplication(id: string, userId: UserId): Promise<JobApplication | null> {
    try {
      return await this.prisma.jobApplication.findFirst({ where: { id, userId } });
    } catch (error) {
      this.handleError(error, 'findApplication');
    }
  }

  async createApplication(
    userId: UserId,
    data: Omit<Prisma.JobApplicationUncheckedCreateInput, 'userId'>
  ): Promise<JobApplication> {
    try {
      return await this.prisma.jobApplication.create({ data: { ...data, userId } });
    } catch (error) {
      this.handleError(error, 'createApplication');
    }
  }

  async updateApplication(
    id: string,
    userId: UserId,
    data: Prisma.JobApplicationUpdateInput
  ): Promise<JobApplication | null> {
    try {
      const result = await this.prisma.jobApplication.updateMany({ where: { id, userId }, data });
      if (result.count === 0) return null;
      return this.prisma.jobApplication.findUnique({ where: { id } });
    } catch (error) {
      this.handleError(error, 'updateApplication');
    }
  }

  async deleteApplication(id: string, userId: UserId): Promise<boolean> {
    try {
      const result = await this.prisma.jobApplication.deleteMany({ where: { id, userId } });
      return result.count > 0;
    } catch (error) {
      this.handleError(error, 'deleteApplication');
    }
  }

  /** How many applications sit in each status, for the pipeline summary. */
  async countApplicationsByStatus(userId: UserId): Promise<Record<string, number>> {
    try {
      const rows = await this.prisma.jobApplication.groupBy({
        by: ['status'],
        where: { userId },
        _count: true,
      });
      const result: Record<string, number> = {};
      for (const row of rows) result[row.status] = row._count;
      return result;
    } catch (error) {
      this.handleError(error, 'countApplicationsByStatus');
    }
  }
}