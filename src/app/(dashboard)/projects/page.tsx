'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { FolderKanban, Plus } from 'lucide-react';
import { apiRequest } from '@/lib/api-client';
import type { ProjectItem } from '@/store/projects.store';
import { Button, EmptyState } from '@/components/ui';
import { Skeleton } from '@/components/ui';
import ProjectList from '@/components/projects/ProjectList';
import AddProjectModal from '@/components/projects/AddProjectModal';

/** Stat summary derived from a project list. */
function summarize(projects: ProjectItem[]) {
  const active = projects.filter((project) => project.status === 'ACTIVE').length;
  const completed = projects.filter((project) => project.status === 'COMPLETED').length;
  const avgProgress =
    projects.length === 0
      ? 0
      : Math.round(projects.reduce((sum, project) => sum + project.progress, 0) / projects.length);
  return { active, completed, avgProgress };
}

/**
 * Projects Page
 * Browse projects, create new ones, and jump into a project detail view.
 */
export default function ProjectsPage() {
  const router = useRouter();
  const [projects, setProjects] = useState<ProjectItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);

  const load = useCallback(async () => {
    try {
      const data = await apiRequest<ProjectItem[]>('/api/projects');
      setProjects(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load projects');
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- mount data fetch
    void load();
  }, [load]);

  const stats = summarize(projects ?? []);

  return (
    <div className="container mx-auto max-w-6xl px-4 py-8">
      <div className="mb-8 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-2 text-3xl font-bold">
            <FolderKanban className="h-7 w-7 text-primary" />
            Projects
          </h1>
          <p className="mt-2 text-muted-foreground">
            Group goals, tasks and milestones so you can track outcomes, not just output.
          </p>
        </div>
        <Button onClick={() => setModalOpen(true)}>
          <Plus className="mr-1.5 h-4 w-4" />
          New project
        </Button>
      </div>

      {projects && projects.length > 0 && (
        <dl className="mb-8 grid grid-cols-3 gap-4">
          {[
            { label: 'Active', value: stats.active },
            { label: 'Completed', value: stats.completed },
            { label: 'Avg progress', value: `${stats.avgProgress}%` },
          ].map((stat) => (
            <div key={stat.label} className="rounded-xl border border-border bg-card p-4">
              <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                {stat.label}
              </dt>
              <dd className="mt-1 text-2xl font-bold tabular-nums text-foreground">{stat.value}</dd>
            </div>
          ))}
        </dl>
      )}

      {error && (
        <p role="alert" className="mb-6 rounded-lg bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {error}
        </p>
      )}

      {!projects ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 3 }, (_, index) => (
            <Skeleton key={index} className="h-44 w-full" />
          ))}
        </div>
      ) : projects.length === 0 ? (
        <EmptyState
          icon={<FolderKanban className="h-10 w-10 text-muted-foreground/60" />}
          title="No projects yet"
          description="Create your first project to group related goals and tasks."
          action={{ label: 'New project', onClick: () => setModalOpen(true) }}
        />
      ) : (
        <ProjectList projects={projects} onSelect={(id) => router.push(`/projects/${id}`)} />
      )}

      <AddProjectModal
        open={modalOpen}
        onOpenChange={setModalOpen}
        onCreated={() => {
          void load();
        }}
      />
    </div>
  );
}
