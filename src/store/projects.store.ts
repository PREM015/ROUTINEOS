/**
 * Projects zustand store.
 *
 * Holds the project list, active filters and a selected project for detail
 * views. Reads/writes hit the real API routes:
 *   GET   /api/projects, /api/projects/[id]
 *   POST  /api/projects
 *   PATCH /api/projects/[id], DELETE /api/projects/[id]
 */

import { create } from 'zustand';
import { apiRequest } from '@/lib/api-client';
import type { Project, ProjectStatus } from '@prisma/client';
import type {
  CreateProjectInput,
  ProjectQueryParams,
  UpdateProjectInput,
} from '@/schemas/project.schema';
import type { ProjectWithRelations } from '@/types/projects';

export type ProjectFilters = ProjectQueryParams;
export type ProjectStatusFilter = ProjectStatus;

/** Project list item as returned by GET /api/projects (repository findAll). */
export interface ProjectItem extends Project {
  category: { id: string; name: string; color: string | null } | null;
  _count?: { goals: number; tasks: number; timeEntries: number };
}

interface ProjectsState {
  projects: ProjectItem[];
  selectedProject: ProjectWithRelations | null;
  selectedProjectId: string | null;
  filters: ProjectFilters;
  loading: boolean;
  error: string | null;
  fetchProjects: (filters?: ProjectFilters) => Promise<ProjectItem[]>;
  fetchProject: (id: string) => Promise<ProjectWithRelations>;
  createProject: (input: CreateProjectInput) => Promise<ProjectItem>;
  updateProject: (
    id: string,
    patch: UpdateProjectInput
  ) => Promise<ProjectWithRelations>;
  deleteProject: (id: string) => Promise<void>;
  selectProject: (id: string | null) => void;
  clear: () => void;
  reset: () => void;
}

function errorMessage(err: unknown, fallback: string): string {
  return err instanceof Error ? err.message : fallback;
}

export const useProjectsStore = create<ProjectsState>()((set, get) => ({
  projects: [],
  selectedProject: null,
  selectedProjectId: null,
  filters: {},
  loading: false,
  error: null,

  /**
   * Fetch the project list. Passing filters replaces the stored ones;
   * omitting them re-runs the last applied filters.
   */
  fetchProjects: async (filters) => {
    set({ loading: true, error: null });
    try {
      const next = filters ?? get().filters;
      const projects = await apiRequest<ProjectItem[]>('/api/projects', {
        query: next,
      });
      set({ projects, filters: next, loading: false });
      return projects;
    } catch (err) {
      const message = errorMessage(err, 'Failed to fetch projects');
      set({ loading: false, error: message });
      throw err;
    }
  },

  fetchProject: async (id) => {
    set({ loading: true, error: null });
    try {
      const project = await apiRequest<ProjectWithRelations>(
        `/api/projects/${id}`
      );
      set((state) => ({
        selectedProject: project,
        selectedProjectId: id,
        projects: state.projects.some((p) => p.id === id)
          ? state.projects.map((p) =>
              p.id === id ? { ...p, ...pickProjectScalars(project) } : p
            )
          : state.projects,
        loading: false,
      }));
      return project;
    } catch (err) {
      const message = errorMessage(err, 'Failed to fetch project');
      set({ loading: false, error: message });
      throw err;
    }
  },

  createProject: async (input) => {
    set({ loading: true, error: null });
    try {
      const project = await apiRequest<ProjectItem>('/api/projects', {
        method: 'POST',
        body: input,
      });
      set((state) => ({
        projects: [project, ...state.projects],
        selectedProject: project as ProjectWithRelations,
        selectedProjectId: project.id,
        loading: false,
      }));
      return project;
    } catch (err) {
      const message = errorMessage(err, 'Failed to create project');
      set({ loading: false, error: message });
      throw err;
    }
  },

  updateProject: async (id, patch) => {
    set({ loading: true, error: null });
    try {
      const updated = await apiRequest<ProjectWithRelations>(
        `/api/projects/${id}`,
        { method: 'PATCH', body: patch }
      );
      set((state) => ({
        projects: state.projects.map((project) =>
          project.id === id ? { ...project, ...pickProjectScalars(updated) } : project
        ),
        selectedProject:
          state.selectedProject?.id === id ? updated : state.selectedProject,
        loading: false,
      }));
      return updated;
    } catch (err) {
      const message = errorMessage(err, 'Failed to update project');
      set({ loading: false, error: message });
      throw err;
    }
  },

  deleteProject: async (id) => {
    set({ loading: true, error: null });
    try {
      await apiRequest<unknown>(`/api/projects/${id}`, { method: 'DELETE' });
      set((state) => ({
        projects: state.projects.filter((project) => project.id !== id),
        selectedProject:
          state.selectedProject?.id === id ? null : state.selectedProject,
        selectedProjectId:
          state.selectedProjectId === id ? null : state.selectedProjectId,
        loading: false,
      }));
    } catch (err) {
      const message = errorMessage(err, 'Failed to delete project');
      set({ loading: false, error: message });
      throw err;
    }
  },

  /**
   * Select a project for detail views. Uses the cached list entry immediately
   * and refreshes from the API when the project isn't in the list.
   */
  selectProject: (id) => {
    const cached = id
      ? get().projects.find((project) => project.id === id) ?? null
      : null;
    set({
      selectedProjectId: id,
      selectedProject: cached as ProjectWithRelations | null,
    });
    if (id && !cached) {
      get()
        .fetchProject(id)
        .catch(() => undefined);
    }
  },

  clear: () => {
    set({ projects: [], selectedProject: null, selectedProjectId: null });
  },

  reset: () => {
    set({
      projects: [],
      selectedProject: null,
      selectedProjectId: null,
      filters: {},
      loading: false,
      error: null,
    });
  },
}));

/** Copy the scalar Project fields from a relations payload onto a list item. */
function pickProjectScalars(project: ProjectWithRelations): Project {
  const scalar: Partial<Project> = {
    id: project.id,
    name: project.name,
    description: project.description,
    status: project.status,
    priority: project.priority,
    categoryId: project.categoryId,
    color: project.color,
    icon: project.icon,
    startDate: project.startDate,
    endDate: project.endDate,
    completedAt: project.completedAt,
    archivedAt: project.archivedAt,
    progress: project.progress,
  };
  return scalar as Project;
}