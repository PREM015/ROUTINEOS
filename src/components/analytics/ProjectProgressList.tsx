'use client';

import { FolderKanban } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { AnalyticsProjectProgress } from '@/types/analytics';

interface ProjectProgressListProps {
  projects: AnalyticsProjectProgress[];
}

const STATUS_LABEL: Record<AnalyticsProjectProgress['status'], string> = {
  ACTIVE: 'Active',
  COMPLETED: 'Done',
  ARCHIVED: 'Archived',
  ON_HOLD: 'On hold',
  CANCELLED: 'Cancelled',
  PLANNING: 'Planning',
};

/**
 * Per-project progress bars (completed tasks / total tasks). Source: Project +
 * Task rows — an empty list is a placeholder, never fake percentages.
 */
export default function ProjectProgressList({ projects }: ProjectProgressListProps) {
  if (projects.length === 0) {
    return (
      <section className="glass-panel spotlight-hover rounded-2xl p-6 shadow-soft">
        <header className="mb-4 flex items-center gap-2">
          <span className="inline-flex rounded-lg bg-indigo-500/10 p-2 text-indigo-500">
            <FolderKanban className="h-4 w-4" aria-hidden="true" />
          </span>
          <h2 className="text-sm font-semibold text-foreground">Projects</h2>
        </header>
        <p className="py-6 text-center text-sm text-muted-foreground">
          Create projects with tasks to see progress here.
        </p>
      </section>
    );
  }

  return (
    <section className="glass-panel spotlight-hover rounded-2xl p-6 shadow-soft">
      <header className="mb-4 flex items-center gap-2">
        <span className="inline-flex rounded-lg bg-indigo-500/10 p-2 text-indigo-500">
          <FolderKanban className="h-4 w-4" aria-hidden="true" />
        </span>
        <h2 className="text-sm font-semibold text-foreground">Projects</h2>
      </header>

      <ul className="space-y-3">
        {projects.map((project) => (
          <li key={project.id}>
            <div className="mb-1 flex items-center justify-between gap-2 text-sm">
              <span className="truncate font-medium text-foreground">{project.name}</span>
              <span className="shrink-0 tabular-nums text-muted-foreground">
                {Math.round(project.progress)}% · {STATUS_LABEL[project.status]}
              </span>
            </div>
            <div className="h-2 w-full overflow-hidden rounded-full bg-muted" aria-hidden="true">
              <div
                className={cn('h-full rounded-full', project.color ? '' : 'bg-indigo-500')}
                style={{
                  width: `${Math.min(100, Math.max(0, project.progress))}%`,
                  backgroundColor: project.color ?? undefined,
                }}
              />
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}