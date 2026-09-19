"use client";

/**
 * ProjectProgress — a progress overview for one project: an overall progress
 * % (from the project, or derived from completed milestones), a milestone
 * checklist, and goal/task counts.
 *
 * Usage:
 *   <ProjectProgress project={project} milestones={milestones} goals={projectGoals} />
 */
import { CircleCheck, Circle, Flag, FolderKanban, Target } from 'lucide-react';
import type { Milestone, Goal } from '@prisma/client';
import type { ProjectItem } from '@/store/projects.store';
import { formatDate, getPercentageColor } from '@/lib/utils';
import { Badge, Card, Progress } from '@/components/ui';
import { PROJECT_STATUS_LABELS } from './ProjectCard';
import { cn } from '@/lib/utils';

export interface ProjectProgressProps {
  project: ProjectItem;
  milestones?: Milestone[];
  goals?: Goal[];
  onToggleMilestone?: (milestone: Milestone) => void;
  className?: string;
}

export default function ProjectProgress({
  project,
  milestones = [],
  goals = [],
  onToggleMilestone,
  className,
}: ProjectProgressProps) {
  const completedMilestones = milestones.filter((milestone) => milestone.completedAt !== null).length;
  const derivedProgress = milestones.length > 0 ? Math.round((completedMilestones / milestones.length) * 100) : 0;
  const progress = Math.min(100, Math.max(0, project.progress ?? derivedProgress));
  const goalCount = goals.length || project._count?.goals ?? 0;
  const completedGoals = goals.filter((goal) => goal.status === 'COMPLETED').length;

  return (
    <Card className={cn('p-5', className)}>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <h2 className="truncate text-lg font-semibold text-gray-900">{project.name}</h2>
          <p className="text-xs text-gray-500">
            {PROJECT_STATUS_LABELS[project.status] ?? project.status}
          </p>
        </div>
        <Badge variant="primary">
          <Flag className="mr-1 h-3 w-3" />
          {progress}% complete
        </Badge>
      </div>

      <div className="mb-5">
        <div className="mb-1.5 flex items-center justify-between text-xs text-gray-500">
          <span>Progress</span>
          <span className={cn('font-semibold', getPercentageColor(progress))}>{progress}%</span>
        </div>
        <Progress value={progress} />
      </div>

      <div className="mb-5 grid grid-cols-2 gap-3 text-sm">
        <div className="rounded-lg bg-gray-50 p-3">
          <div className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-gray-500">
            <Target className="h-3.5 w-3.5" />
            Goals
          </div>
          <p className="mt-1 text-xl font-bold text-gray-900">
            {completedGoals}/{goalCount}
          </p>
        </div>
        <div className="rounded-lg bg-gray-50 p-3">
          <div className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-gray-500">
            <FolderKanban className="h-3.5 w-3.5" />
            Milestones
          </div>
          <p className="mt-1 text-xl font-bold text-gray-900">
            {completedMilestones}/{milestones.length}
          </p>
        </div>
      </div>

      {milestones.length > 0 ? (
        <ul className="space-y-1">
          {milestones
            .slice()
            .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0))
            .map((milestone) => {
              const done = milestone.completedAt !== null;
              return (
                <li key={milestone.id}>
                  <button
                    type="button"
                    disabled={!onToggleMilestone}
                    onClick={() => onToggleMilestone?.(milestone)}
                    aria-pressed={done}
                    className={cn(
                      'flex w-full items-start gap-2.5 rounded-md px-2 py-1.5 text-left text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600',
                      onToggleMilestone && 'hover:bg-gray-50',
                    )}
                  >
                    {done ? (
                      <CircleCheck className="mt-0.5 h-4 w-4 shrink-0 text-green-600" />
                    ) : (
                      <Circle className="mt-0.5 h-4 w-4 shrink-0 text-gray-300" />
                    )}
                    <span className="min-w-0 flex-1">
                      <span className={cn('block', done && 'text-gray-400 line-through')}>
                        {milestone.title}
                      </span>
                      {milestone.dueDate && (
                        <span className="text-xs text-gray-500">Due {formatDate(milestone.dueDate)}</span>
                      )}
                    </span>
                  </button>
                </li>
              );
            })}
        </ul>
      ) : (
        <p className="py-4 text-center text-sm text-gray-500">
          No milestones yet — add one to track incremental progress.
        </p>
      )}
    </Card>
  );
}