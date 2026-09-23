'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { ArrowLeft, Calendar, Target } from 'lucide-react';
import type { Goal, Milestone } from '@prisma/client';
import { apiRequest } from '@/lib/api-client';
import { formatDate } from '@/lib/utils';
import type { ProjectMilestoneListItem, ProjectWithRelations } from '@/types/projects';
import { Badge, Card, EmptyState, Spinner } from '@/components/ui';
import ProjectProgress from '@/components/projects/ProjectProgress';
import GoalProgressBar from '@/components/goals/GoalProgressBar';

function toMilestone(item: ProjectMilestoneListItem): Milestone {
  return {
    id: item.id,
    goalId: item.goalId,
    title: item.title,
    description: null,
    targetValue: null,
    dueDate: item.dueDate ? new Date(item.dueDate) : null,
    completedAt: item.completedAt ? new Date(item.completedAt) : null,
    sortOrder: item.sortOrder,
    createdAt: new Date(0),
    updatedAt: new Date(0),
  };
}

function goalPercentage(goal: Goal): number {
  const target = goal.targetValue ?? 0;
  if (target <= 0) return goal.status === 'COMPLETED' ? 100 : 0;
  return Math.min(100, Math.round(((goal.currentValue ?? 0) / target) * 100));
}

/**
 * Project Detail Page
 * Shows a single project's progress, milestone checklist and linked goals.
 */
export default function ProjectDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const [project, setProject] = useState<ProjectWithRelations | null>(null);
  const [milestones, setMilestones] = useState<Milestone[]>([]);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [projectData, milestoneData] = await Promise.all([
        apiRequest<ProjectWithRelations>(`/api/projects/${id}`),
        apiRequest<ProjectMilestoneListItem[]>(`/api/projects/${id}/milestones`),
      ]);
      setProject(projectData);
      setMilestones(milestoneData.map(toMilestone));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load project');
    }
  }, [id]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- mount data fetch
    void load();
  }, [load]);

  if (error) {
    return (
      <div className="container mx-auto max-w-4xl px-4 py-8">
        <p role="alert" className="rounded-lg bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {error}
        </p>
      </div>
    );
  }

  if (!project) {
    return (
      <div className="flex justify-center py-24">
        <Spinner className="h-6 w-6" />
      </div>
    );
  }

  return (
    <div className="container mx-auto max-w-4xl px-4 py-8">
      <Link
        href="/projects"
        className="mb-6 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to projects
      </Link>

      <div className="mb-8">
        <h1 className="text-3xl font-bold">{project.name}</h1>
        {project.description && <p className="mt-2 text-muted-foreground">{project.description}</p>}
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {project.category && <Badge variant="default">{project.category.name}</Badge>}
          {project.startDate && (
            <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
              <Calendar className="h-3.5 w-3.5" />
              {formatDate(project.startDate)}
              {project.endDate ? ` – ${formatDate(project.endDate)}` : ''}
            </span>
          )}
        </div>
      </div>

      <ProjectProgress project={project} milestones={milestones} goals={project.goals} />

      <Card className="mt-8 p-5">
        <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold text-foreground">
          <Target className="h-5 w-5 text-primary" />
          Linked goals
        </h2>
        {project.goals.length > 0 ? (
          <ul className="space-y-4">
            {project.goals.map((goal) => (
              <li key={goal.id}>
                <div className="mb-1 flex items-center justify-between gap-2">
                  <span className="truncate text-sm font-medium text-foreground">{goal.title}</span>
                  <Badge variant={goal.status === 'COMPLETED' ? 'success' : 'default'}>
                    {goal.status.replace(/_/g, ' ')}
                  </Badge>
                </div>
                <GoalProgressBar
                  percentage={goalPercentage(goal)}
                  current={goal.currentValue ?? 0}
                  target={goal.targetValue ?? 0}
                  unit={goal.unit ?? undefined}
                />
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState
            icon={<Target className="h-10 w-10 text-muted-foreground/60" />}
            title="No goals linked"
            description="Attach goals to this project to track outcomes."
          />
        )}
      </Card>
    </div>
  );
}
