import { WorkoutRepository } from '@/server/repositories/workout.repository';
import { HabitRepository } from '@/server/repositories/habit.repository';
import { NotFoundError, ValidationError } from '@/lib/errors/app-error';
import {
  nextReviewDate,
  reviewIntervalDays,
  toDateString,
} from '@/lib/career/spaced-revision';
import type { UserId } from '@/types/ids';
import type {
  ApplicationStatus,
  Prisma,
} from '@/generated/prisma';
import type { SetInput } from '@/server/repositories/workout.repository';

/**
 * Career & training service.
 *
 * Workout logging, DSA spaced revision and job applications. Three domains that
 * share one requirement and nothing else: **the caller is the owner, and that is
 * checked on every single method**.
 *
 * There is no method here that accepts a user id from a caller-supplied value —
 * the id arrives from the session at the route and is threaded down unchanged.
 * Any id that is not the caller's resolves to `null` in the repository and to a
 * `NotFoundError` here, which the routes render as 404. That is deliberate: a
 * 403 would confirm the resource exists.
 */
export class CareerService {
  private repository: WorkoutRepository;
  private habitRepository: HabitRepository;

  constructor() {
    this.repository = new WorkoutRepository();
    this.habitRepository = new HabitRepository();
  }

  // ── Exercises ────────────────────────────────────────────────────────────

  listExercises(userId: UserId, includeArchived = false) {
    return this.repository.findExercises(userId, includeArchived);
  }

  async createExercise(
    userId: UserId,
    input: { name: string; description?: string | null; muscleGroup?: string | null; equipment?: string | null }
  ) {
    if (!input.name?.trim()) {
      throw new ValidationError('Exercise name is required');
    }
    return this.repository.upsertExercise(userId, {
      ...input,
      name: input.name.trim(),
    });
  }

  async deleteExercise(userId: UserId, exerciseId: string): Promise<void> {
    const exercise = await this.repository.findExercise(exerciseId, userId);
    if (!exercise) throw new NotFoundError('Exercise');
    // Sets cascade with the exercise; sessions referencing it are not deleted,
    // because the session is the record that matters and the exercise is a
    // lookup convenience.
    await this.repository.deleteExercise(exerciseId, userId);
  }

  // ── Workout sessions ─────────────────────────────────────────────────────

  listSessions(
    userId: UserId,
    options: { startDate?: string; endDate?: string; habitId?: string; limit?: number } = {}
  ) {
    return this.repository.findSessions(userId, options);
  }

  getSession(userId: UserId, sessionId: string) {
    return this.repository.findSession(sessionId, userId);
  }

  /**
   * Log a session and its sets.
   *
   * The habit link is verified against the caller's own habits first. Without
   * that, a client could point a session at another user's habit id and, because
   * the FK would happily accept it, silently complete a stranger's "Gym" habit.
   */
  async createSession(
    userId: UserId,
    input: {
      date: string;
      name?: string | null;
      notes?: string | null;
      habitId?: string | null;
      durationMinutes?: number | null;
      isRestDay?: boolean;
      exercises: Array<{ exerciseId: string; notes?: string | null; sets: SetInput[] }>;
    }
  ) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(input.date)) {
      throw new ValidationError('date must be YYYY-MM-DD');
    }

    if (input.habitId) {
      const habit = await this.habitRepository.findById(input.habitId, userId);
      if (!habit) throw new NotFoundError('Habit');
    }

    /*
     * Every referenced exercise must belong to the caller.
     *
     * Checked in one batch rather than per exercise: a five-exercise session
     * would otherwise be five round trips, and more importantly a *partial*
     * check would leave a window where the early ones passed and a later one
     * belonged to someone else.
     */
    const exerciseIds = [...new Set(input.exercises.map((e) => e.exerciseId))];
    if (exerciseIds.length > 0) {
      const owned = await this.repository.findExercises(userId, true);
      const ownedIds = new Set(owned.map((e) => e.id));
      const foreign = exerciseIds.filter((id) => !ownedIds.has(id));
      if (foreign.length > 0) {
        // 404, not 403: the caller must not learn these ids exist.
        throw new NotFoundError('Exercise');
      }
    }

    return this.repository.createSessionWithSets(userId, input);
  }

  async updateSession(
    userId: UserId,
    sessionId: string,
    data: Prisma.WorkoutSessionUpdateInput
  ) {
    const existing = await this.repository.findSession(sessionId, userId);
    if (!existing) throw new NotFoundError('Workout session');

    const updated = await this.repository.updateSession(sessionId, userId, data);
    if (!updated) throw new NotFoundError('Workout session');
    return updated;
  }

  async deleteSession(userId: UserId, sessionId: string): Promise<void> {
    const deleted = await this.repository.deleteSession(sessionId, userId);
    if (!deleted) throw new NotFoundError('Workout session');
  }

  // ── DSA problems ─────────────────────────────────────────────────────────

  listProblems(
    userId: UserId,
    options: { dueBefore?: string; status?: string; search?: string; limit?: number } = {}
  ) {
    return this.repository.findProblems(userId, options);
  }

  getProblem(userId: UserId, id: string) {
    return this.repository.findProblem(id, userId);
  }

  /**
   * Log a solved problem and schedule its first review.
   *
   * The schedule is computed here rather than in the repository because it is
   * business logic, and because it needs to be observable: the response carries
   * `nextReviewAt` and `reviewIntervalDays` so the user can see when it comes
   * back instead of trusting an invisible timer.
   */
  async createProblem(
    userId: UserId,
    input: {
      title: string;
      platform?: string | null;
      problemUrl?: string | null;
      difficulty?: string | null;
      topicTags?: string | null;
      notes?: string | null;
      solved?: boolean;
      from?: Date;
    }
  ) {
    if (!input.title?.trim()) {
      throw new ValidationError('Problem title is required');
    }

    const now = input.from ?? new Date();
    const solved = input.solved ?? true;
    // An unsolved problem has no review schedule — it needs work first, not a
    // reminder to be reminded about.
    const reviewAt = solved ? nextReviewDate(0, now) : null;

    const problem = await this.repository.createProblem(userId, {
      title: input.title.trim(),
      platform: input.platform ?? null,
      problemUrl: input.problemUrl ?? null,
      difficulty: input.difficulty ?? null,
      topicTags: input.topicTags ?? null,
      notes: input.notes ?? null,
      status: solved ? 'SOLVED' : 'UNSOLVED',
      solvedAt: solved ? now : null,
      reviewCount: 0,
      reviewIntervalDays: reviewAt ? reviewIntervalDays(0) : null,
      nextReviewAt: reviewAt,
      lastReviewedAt: null,
    });

    return { ...problem, intervalDays: reviewIntervalDays(0) };
  }

  /**
   * Mark a review.
   *
   * `forgotten` shortens the schedule back to the start of the table rather
   * than advancing it — that is the entire point of spaced repetition, and a
   * problem you could not recall again has not been learned.
   */
  async reviewProblem(
    userId: UserId,
    id: string,
    options: { forgotten?: boolean; from?: Date } = {}
  ) {
    const problem = await this.repository.findProblem(id, userId);
    if (!problem) throw new NotFoundError('Problem');

    const now = options.from ?? new Date();
    const forgotten = options.forgotten ?? false;

    const reviewCount = forgotten ? 0 : problem.reviewCount + 1;
    const next = nextReviewDate(reviewCount, now);
    const interval = reviewIntervalDays(reviewCount);

    const updated = await this.repository.updateProblem(id, userId, {
      reviewCount,
      reviewIntervalDays: interval,
      nextReviewAt: next,
      lastReviewedAt: now,
      status: forgotten ? 'LEARNING' : 'SOLVED',
    } as Prisma.ProblemLogUpdateInput);

    if (!updated) throw new NotFoundError('Problem');
    return { ...updated, intervalDays: interval };
  }

  async updateProblem(userId: UserId, id: string, data: Prisma.ProblemLogUpdateInput) {
    const existing = await this.repository.findProblem(id, userId);
    if (!existing) throw new NotFoundError('Problem');
    const updated = await this.repository.updateProblem(id, userId, data);
    if (!updated) throw new NotFoundError('Problem');
    return updated;
  }

  async deleteProblem(userId: UserId, id: string): Promise<void> {
    const deleted = await this.repository.deleteProblem(id, userId);
    if (!deleted) throw new NotFoundError('Problem');
  }

  // ── Job applications ─────────────────────────────────────────────────────

  listApplications(userId: UserId, status?: ApplicationStatus) {
    return this.repository.findApplications(userId, { status });
  }

  getApplication(userId: UserId, id: string) {
    return this.repository.findApplication(id, userId);
  }

  /**
   * Record an application.
   *
   * On a rejection the feedback fields are what make the row worth keeping —
   * "learn from rejections" is only possible if the rejection was written down
   * — so `rejectionReason` and `rejectionFeedback` are stored verbatim rather
   * than being treated as an afterthought of the status change.
   */
  async createApplication(
    userId: UserId,
    input: {
      company: string;
      role: string;
      jobUrl?: string | null;
      location?: string | null;
      workMode?: string | null;
      status?: ApplicationStatus;
      compensation?: string | null;
      notes?: string | null;
      rejectionReason?: string | null;
      rejectionFeedback?: string | null;
      followUpAt?: Date | null;
    }
  ) {
    if (!input.company?.trim()) {
      throw new ValidationError('Company is required');
    }
    if (!input.role?.trim()) {
      throw new ValidationError('Role is required');
    }

    return this.repository.createApplication(userId, {
      company: input.company.trim(),
      role: input.role.trim(),
      jobUrl: input.jobUrl ?? null,
      location: input.location ?? null,
      workMode: input.workMode ?? null,
      status: input.status ?? 'APPLIED',
      compensation: input.compensation ?? null,
      notes: input.notes ?? null,
      rejectionReason: input.rejectionReason ?? null,
      rejectionFeedback: input.rejectionFeedback ?? null,
      followUpAt: input.followUpAt ?? null,
    });
  }

  async updateApplication(
    userId: UserId,
    id: string,
    data: Prisma.JobApplicationUpdateInput
  ) {
    const existing = await this.repository.findApplication(id, userId);
    if (!existing) throw new NotFoundError('Application');
    const updated = await this.repository.updateApplication(id, userId, data);
    if (!updated) throw new NotFoundError('Application');
    return updated;
  }

  async deleteApplication(userId: UserId, id: string): Promise<void> {
    const deleted = await this.repository.deleteApplication(id, userId);
    if (!deleted) throw new NotFoundError('Application');
  }

  /** Pipeline summary: how many applications sit in each status. */
  applicationSummary(userId: UserId) {
    return this.repository.countApplicationsByStatus(userId);
  }

  /** Problems whose next review has arrived, as `YYYY-MM-DD` strings. */
  dueToday(userId: UserId, today = new Date()) {
    return this.repository.findProblems(userId, {
      dueBefore: toDateString(today),
    });
  }
}