"use client";

/**
 * ProjectList — a responsive grid of ProjectCard items with an empty state.
 *
 * Usage:
 *   <ProjectList projects={projects} onSelect={(id) => open(id)} />
 */
import { FolderKanban } from 'lucide-react';
import type { ProjectItem } from '@/store/projects.store';
import { EmptyState } from '@/components/ui';
import ProjectCard from './ProjectCard';
import { cn } from '@/lib/utils';

export interface ProjectListProps {
  projects: ProjectItem[];
  onSelect?: (id: string) => void;
  className?: string;
}

export default function ProjectList({ projects, onSelect, className }: ProjectListProps) {
  if (projects.length === 0) {
    return (
      <EmptyState
        icon={<FolderKanban className="h-10 w-10 text-gray-300" />}
        title="No projects yet"
        description="Create a project to group goals, tasks, and milestones together."
      />
    );
  }

  return (
    <div className={cn('grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3', className)}>
      {projects.map((project) => (
        <ProjectCard
          key={project.id}
          project={project}
          onSelect={onSelect ? () => onSelect(project.id) : undefined}
        />
      ))}
    </div>
  );
}