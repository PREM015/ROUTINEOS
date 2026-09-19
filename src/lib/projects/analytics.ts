import type { Project, Task, Goal, TimeEntry } from '@prisma/client';
import type { ProjectAnalytics, ProjectHealthScore } from '@/types/projects';
import { computeHealthScore, completionRate } from './helpers';

/**
 * Project analytics.
 * Pure aggregation over a project's tasks, goals, and time entries.
 */

export interface ProjectAnalyticsInput {
  project: Pick<Project, 'id' | 'createdAt' | 'status' | 'progress'>;
  tasks: readonly Task[];
  goals: readonly Goal[];
  timeEntries: readonly TimeEntry[];
}

export interface TaskSummary {
  total: number;
  completed: number;
  inProgress: number;
  waiting: number;
  overdue: number;
  completionRate: number;
}

export interface GoalSummary {
  total: number;
  completed: number;
  active: number;
  completionRate: number;
}

export interface TimeSummary {
  totalMinutes: number;
  billableMinutes: number;
  averagePerTask: number;
}

/**
 * Summarize task counts and completion for a project.
 */
export function summarizeTasks(
  tasks: readonly Task[],
  now: Date = new Date()
): TaskSummary {
  const total = tasks.length;
  let completed = 0;
  let inProgress = 0;
  let waiting = 0;
  let overdue = 0;

  for (const task of tasks) {
    if (task.status === 'COMPLETED') completed += 1;
    else if (task.status === 'CANCELLED') continue;
    if (task.status === 'IN_PROGRESS') inProgress += 1;
    if (task.status === 'WAITING') waiting += 1;
    if (
      task.status !== 'COMPLETED' &&
      task.status !== 'CANCELLED' &&
      task.dueDate !== null &&
      task.dueDate.getTime() < now.getTime()
    ) {
      overdue += 1;
    }
  }

  return {
    total,
    completed,
    inProgress,
    waiting,
    overdue,
    completionRate: completionRate(completed, total),
  };
}

/**
 * Summarize goal progress for a project.
 */
export function summarizeGoals(goals: readonly Pick<Goal, 'completedAt' | 'status'>[]): GoalSummary {
  const total = goals.length;
  let completed = 0;
  let active = 0;

  for (const goal of goals) {
    const done = goal.completedAt !== null || goal.status === 'COMPLETED';
    if (done) completed += 1;
    else if (goal.status !== 'CANCELLED') active += 1;
  }

  return {
    total,
    completed,
    active,
    completionRate: completionRate(completed, total),
  };
}

/**
 * Summarize tracked time for a project.
 */
export function summarizeTime(
  timeEntries: readonly Pick<TimeEntry, 'duration' | 'billable'>[],
  taskCount: number
): TimeSummary {
  let totalMinutes = 0;
  let billableMinutes = 0;

  for (const entry of timeEntries) {
    const minutes = entry.duration ?? 0;
    totalMinutes += minutes;
    if (entry.billable) billableMinutes += minutes;
  }

  return {
    totalMinutes,
    billableMinutes,
    averagePerTask: taskCount === 0 ? 0 : totalMinutes / taskCount,
  };
}

/**
 * Average progress points gained per calendar day since project creation.
 */
export function progressRate(
  project: Pick<Project, 'createdAt' | 'progress'>,
  now: Date = new Date()
): number {
  const days =
    Math.max(1, (now.getTime() - project.createdAt.getTime()) / 86_400_000);
  return (project.progress ?? 0) / days;
}

/**
 * Health-focus factor (0-100): share of effort logged, capped at 100.
 */
export function timeFocusScore(minutes: number, taskCount: number): number {
  const needle = taskCount > 0 ? Math.min(100, minutes / Math.max(1, taskCount) / 5) : 0;
  return clamp(Math.round(needle));
}

function clamp(value: number): number {
  return Math.max(0, Math.min(100, value));
}

/**
 * Full analytics for a project: task/goal/time summaries, progress rate, and a
 * computed health score.
 */
export function analyzeProject(input: ProjectAnalyticsInput): ProjectAnalytics {
  const tasks = summarizeTasks(input.tasks);
  const goals = summarizeGoals(input.goals);
  const time = summarizeTime(input.timeEntries, tasks.total);
  const progressPerDay = progressRate(input.project);
  const momentum = clamp(Math.round(progressPerDay * 20));

  const health: ProjectHealthScore = computeHealthScore({
    taskCompletion: tasks.completionRate,
    goalProgress: goals.completionRate,
    momentum,
    timeFocus: timeFocusScore(time.totalMinutes, tasks.total),
  });

  return {
    projectId: input.project.id,
    tasks,
    goals,
    time,
    progressRate: progressPerDay,
    health,
  };
}