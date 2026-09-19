import type { Project, Task, ProjectStatus } from '@prisma/client';
import type { ProjectHealthScore } from '@/types/projects';

/**
 * Project domain helpers.
 * Pure utilities for status, progress, and health scoring.
 */

const STATUS_LABELS: Record<ProjectStatus, string> = {
  PLANNING: 'Planning',
  ACTIVE: 'Active',
  ON_HOLD: 'On hold',
  COMPLETED: 'Completed',
  ARCHIVED: 'Archived',
  CANCELLED: 'Cancelled',
};

/**
 * Human-readable label for a project status.
 */
export function projectStatusLabel(status: ProjectStatus): string {
  return STATUS_LABELS[status];
}

/**
 * Whether the project is currently underway (not an end state).
 */
export function isActiveProject(
  project: Pick<Project, 'status' | 'archivedAt'>
): boolean {
  return (
    project.status === 'ACTIVE' ||
    project.status === 'ON_HOLD' ||
    project.status === 'PLANNING'
  ) && project.archivedAt === null;
}

/**
 * Whether an active project has blown past its target end date.
 */
export function isProjectOverdue(
  project: Pick<Project, 'status' | 'endDate' | 'archivedAt'>,
  now: Date = new Date()
): boolean {
  return (
    isActiveProject(project) &&
    project.endDate !== null &&
    project.endDate.getTime() < now.getTime()
  );
}

/**
 * Completion rate as a 0-100 number, guarding against division by zero.
 */
export function completionRate(completed: number, total: number): number {
  if (total <= 0) return 0;
  return (completed / total) * 100;
}

export interface ProgressInput {
  explicitProgress?: number | null;
  tasksCompleted?: number;
  tasksTotal?: number;
  goalsCompleted?: number;
  goalsTotal?: number;
}

/**
 * Derive a project's 0-100 progress. An explicit override wins; otherwise the
 * value is blended from task and goal completion.
 */
export function computeProgress(input: ProgressInput): number {
  if (input.explicitProgress !== undefined && input.explicitProgress !== null) {
    return clampProgress(input.explicitProgress);
  }
  const taskRate = completionRate(input.tasksCompleted ?? 0, input.tasksTotal ?? 0);
  const goalRate = completionRate(input.goalsCompleted ?? 0, input.goalsTotal ?? 0);
  const blended = (taskRate + goalRate) / 2;
  return clampProgress(blended);
}

function clampProgress(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)));
}

export interface HealthFactors {
  /** 0-100 task completion. */
  taskCompletion: number;
  /** 0-100 goal completion. */
  goalProgress: number;
  /** 0-100 momentum based on daily progress rate. */
  momentum: number;
  /** 0-100 share of effort logged against the project. */
  timeFocus: number;
}

/**
 * Compute a `ProjectHealthScore` from its four 0-100 factors, plus curated
 * recommendations targeting the weakest signals.
 */
export function computeHealthScore(factors: HealthFactors): ProjectHealthScore {
  const score = Math.round(
    0.4 * factors.taskCompletion +
      0.3 * factors.goalProgress +
      0.15 * factors.momentum +
      0.15 * factors.timeFocus
  );

  const status =
    score >= 80 ? 'EXCELLENT' : score >= 60 ? 'GOOD' : score >= 40 ? 'AT_RISK' : 'CRITICAL';

  const recommendations: string[] = [];
  if (factors.taskCompletion < 50) {
    recommendations.push('Break remaining tasks into smaller, completable pieces');
  }
  if (factors.goalProgress < 50) {
    recommendations.push('Revisit goal targets or milestones that are lagging');
  }
  if (factors.momentum < 50) {
    recommendations.push('Schedule consistent daily work to regain momentum');
  }
  if (factors.timeFocus < 50) {
    recommendations.push('Log time entries so effort can be tracked accurately');
  }
  if (recommendations.length === 0) {
    recommendations.push('Keep up the momentum; consider raising your targets');
  }

  return {
    score,
    status,
    factors: { ...factors },
    recommendations,
  };
}

/**
 * Count completed tasks/tasks in a list by status.
 */
export function countTasksByStatus(
  tasks: readonly Pick<Task, 'status'>[]
): Record<Task['status'], number> {
  return tasks.reduce<Record<Task['status'], number>>((acc, task) => {
    acc[task.status] = (acc[task.status] ?? 0) + 1;
    return acc;
  }, {} as Record<Task['status'], number>);
}