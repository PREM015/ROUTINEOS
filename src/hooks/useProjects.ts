'use client';

import { useShallow } from 'zustand/react/shallow';
import { useProjectsStore } from '@/store/projects.store';
import type { ProjectFilters, ProjectItem } from '@/store/projects.store';
import type { ProjectWithRelations } from '@/types/projects';
import type { CreateProjectInput, UpdateProjectInput } from '@/schemas/project.schema';

/**
 * Projects hook: subscribe to the projects store for the cached list,
 * current selection, filters and the CRUD actions.
 */
export function useProjects() {
  const projects = useProjectsStore((state) => state.projects);
  const selectedProject = useProjectsStore((state) => state.selectedProject);
  const selectedProjectId = useProjectsStore((state) => state.selectedProjectId);
  const filters = useProjectsStore((state) => state.filters);
  const loading = useProjectsStore((state) => state.loading);
  const error = useProjectsStore((state) => state.error);

  const actions = useProjectsStore(
    useShallow((state) => ({
      fetchProjects: state.fetchProjects,
      fetchProject: state.fetchProject,
      createProject: state.createProject,
      updateProject: state.updateProject,
      deleteProject: state.deleteProject,
      selectProject: state.selectProject,
      clear: state.clear,
      reset: state.reset,
    }))
  );

  return {
    projects,
    selectedProject,
    selectedProjectId,
    filters,
    loading,
    error,
    ...actions,
  };
}

export type {
  ProjectFilters,
  ProjectItem,
  ProjectWithRelations,
  CreateProjectInput,
  UpdateProjectInput,
};
export { useProjectsStore };