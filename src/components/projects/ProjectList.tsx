"use client";

/**
 * ProjectList — a responsive grid of ProjectCard items with an empty state.
 *
 * Usage:
 *   <ProjectList projects={projects} onSelect={(id) => open(id)} />
 */
import { FolderKanban } from 'lucide-react';
import type { ProjectItem } from '@/types/projects';
import { EmptyState } from '@/components/ui';
import ProjectCard from './ProjectCard';
import { cn } from '@/lib/utils';
import { SCROLL_CARD } from '@/components/dashboard-ui/tokens';

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

  /*
    A capped, scrolling project grid.

    A user can create any number of projects and each card is roughly
    fixed-height, so the grid grows without bound. The cap keeps the grid from
    pushing the page footer off-screen on a desktop while still letting a short
    list breathe.

    `SCROLL_CARD.card` on the outer element and `SCROLL_CARD.region` on the grid:
    `overflow-hidden` plus `min-h-0` is what lets the inner `flex-1 overflow-y-auto`
    actually scroll rather than letting the card grow to fit its content.
  */
  return (
    <div className={cn(SCROLL_CARD.card, 'gap-4', className)}>
      <div
        className={cn(
          'grid grid-cols-1 gap-4 pr-1 sm:grid-cols-2 xl:grid-cols-3',
          SCROLL_CARD.region
        )}
      >
        {projects.map((project) => (
          <ProjectCard
            key={project.id}
            project={project}
            onSelect={onSelect ? () => onSelect(project.id) : undefined}
          />
        ))}
      </div>
    </div>
  );
}
