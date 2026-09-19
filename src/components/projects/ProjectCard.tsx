"use client";

/**
 * ProjectCard — a summary card for a single project: name, status badge,
 * progress bar, due date and task/goal counts.
 *
 * Usage:
 *   <ProjectCard project={project} onSelect={() => open(project.id)} />
 */
import { CalendarDays, CheckSquare, Target } from 'lucide-react';
import type { ProjectStatus } from '@prisma/client';
import type { ProjectItem } from '@/store/projects.store';
import { formatDate, getPercentageColor } from '@/lib/utils';
import { Badge, Card, Progress } from '@/components/ui';
import { cn } from '@/lib/utils';

export const PROJECT_STATUS_LABELS: Record<ProjectStatus, string> = {
  PLANNING: 'Planning',
  ACTIVE: 'Active',
  ON_HOLD: 'On hold',
  COMPLETED: 'Completed',
  ARCHIVED: 'Archived',
  CANCELLED: 'Cancelled',
};

const STATUS_VARIANTS: Record<ProjectStatus, 'default' | 'primary' | 'success' | 'warning' | 'danger'> = {
  PLANNING: 'default',
  ACTIVE: 'primary',
  ON_HOLD: 'warning',
  COMPLETED: 'success',
  ARCHIVED: 'default',
  CANCELLED: 'danger',
};

export interface ProjectCardProps {
  project: ProjectItem;
  onSelect?: () => void;
  className?: string;
}

export default function ProjectCard({ project, onSelect, className }: ProjectCardProps) {
  const taskCount = project._count?.tasks ?? 0;
  const goalCount = project._count?.goals ?? 0;
  const progress = Math.min(100, Math.max(0, project.progress ?? 0));
  const color = project.color ?? '#3b82f6';

  const statusLabel = PROJECT_STATUS_LABELS[project.status] ?? project.status;

  const inner = (
    <>
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-2.5">
          <span
            className="mt-0.5 inline-block h-3.5 w-3.5 shrink-0 rounded-full"
            style={{ backgroundColor: color }}
            aria-hidden="true"
          />
          <div className="min-w-0">
            <h3 className="truncate text-base font-semibold text-gray-900">{project.name}</h3>
            {project.description && (
              <p className="mt-0.5 line-clamp-2 text-sm text-gray-500">{project.description}</p>
            )}
          </div>
        </div>
        <Badge variant={STATUS_VARIANTS[project.status]} className="shrink-0">
          {statusLabel}
        </Badge>
      </div>

      <div className="mt-4">
        <div className="mb-1.5 flex items-center justify-between text-xs text-gray-500">
          <span>Progress</span>
          <span className={cn('font-semibold', getPercentageColor(progress))}>{progress}%</span>
        </div>
        <Progress value={progress} />
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-gray-500">
        {project.endDate && (
          <span className="inline-flex items-center gap-1">
            <CalendarDays className="h-3.5 w-3.5" />
            Due {formatDate(project.endDate)}
          </span>
        )}
        <span className="inline-flex items-center gap-1">
          <CheckSquare className="h-3.5 w-3.5" />
          {taskCount} task{taskCount === 1 ? '' : 's'}
        </span>
        <span className="inline-flex items-center gap-1">
          <Target className="h-3.5 w-3.5" />
          {goalCount} goal{goalCount === 1 ? '' : 's'}
        </span>
      </div>
    </>
  );

  return (
    <Card className={cn('p-5', onSelect && 'cursor-pointer hover:shadow-md', className)}>
      {onSelect ? (
        <button
          type="button"
          onClick={onSelect}
          aria-label={`Open project ${project.name}`}
          className="block w-full text-left focus-visible:outline-none"
        >
          {inner}
        </button>
      ) : (
        inner
      )}
    </Card>
  );
}