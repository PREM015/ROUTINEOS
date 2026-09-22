/**
 * Tasks zustand store.
 *
 * Holds the task list, active filters and a selected task. Reads/writes hit
 * the real API routes:
 *   GET   /api/tasks, /api/tasks/[id]
 *   POST  /api/tasks, /api/tasks/[id]/complete, /api/tasks/[id]/archive,
 *         /api/tasks/bulk
 *   PATCH /api/tasks/[id], DELETE /api/tasks/[id]
 */

import { create } from 'zustand';
import { apiRequest } from '@/lib/api-client';
import type { Task } from '@prisma/client';
import type {
  CreateTaskInput,
  TaskQueryParams,
  UpdateTaskInput,
} from '@/schemas/task.schema';

export type TaskFilters = TaskQueryParams;

/** Task list item as returned by GET /api/tasks (repository findAll). */
export interface TaskItem extends Task {
  project: { id: string; name: string; color: string | null } | null;
  goal: { id: string; title: string } | null;
  tags: Array<{ tag: { id: string; name: string; color: string | null } }>;
  _count?: { subtasks: number; dependsOn: number; tags: number };
}

export interface BulkTaskActionInput {
  create?: CreateTaskInput[];
  update?: Array<{ id: string; data: UpdateTaskInput }>;
  delete?: string[];
}

export interface BulkTaskResult {
  createdCount: number;
  updated: Array<{ id: string; success: boolean; error?: string }>;
  deleted: Array<{ id: string; success: boolean; error?: string }>;
}

interface TasksState {
  tasks: TaskItem[];
  selectedTaskId: string | null;
  filters: TaskFilters;
  loading: boolean;
  error: string | null;
  fetchTasks: (filters?: TaskFilters) => Promise<TaskItem[]>;
  fetchTask: (id: string) => Promise<TaskItem>;
  createTask: (input: CreateTaskInput) => Promise<TaskItem>;
  updateTask: (id: string, patch: UpdateTaskInput) => Promise<TaskItem>;
  deleteTask: (id: string) => Promise<void>;
  completeTask: (id: string) => Promise<TaskItem>;
  archiveTask: (
    id: string,
    options?: { restore?: boolean }
  ) => Promise<TaskItem>;
  bulkAction: (input: BulkTaskActionInput) => Promise<BulkTaskResult>;
  selectTask: (id: string | null) => void;
  clear: () => void;
  reset: () => void;
}

function errorMessage(err: unknown, fallback: string): string {
  return err instanceof Error ? err.message : fallback;
}

export const useTasksStore = create<TasksState>()((set, get) => ({
  tasks: [],
  selectedTaskId: null,
  filters: {},
  loading: false,
  error: null,

  /**
   * Fetch the task list. Passing filters replaces the stored ones; omitting
   * them re-runs the last applied filters.
   */
  fetchTasks: async (filters) => {
    set({ loading: true, error: null });
    try {
      const next = filters ?? get().filters;
      const tasks = await apiRequest<TaskItem[]>('/api/tasks', {
        query: next,
      });
      set({ tasks, filters: next, loading: false });
      return tasks;
    } catch (err) {
      const message = errorMessage(err, 'Failed to fetch tasks');
      set({ loading: false, error: message });
      throw err;
    }
  },

  fetchTask: async (id) => {
    set({ loading: true, error: null });
    try {
      const task = await apiRequest<TaskItem>(`/api/tasks/${id}`);
      set((state) => ({
        tasks: state.tasks.some((t) => t.id === id)
          ? state.tasks.map((t) => (t.id === id ? task : t))
          : state.tasks,
        loading: false,
      }));
      return task;
    } catch (err) {
      const message = errorMessage(err, 'Failed to fetch task');
      set({ loading: false, error: message });
      throw err;
    }
  },

  createTask: async (input) => {
    set({ loading: true, error: null });
    try {
      const task = await apiRequest<TaskItem>('/api/tasks', {
        method: 'POST',
        body: input,
      });
      set((state) => ({ tasks: [task, ...state.tasks], loading: false }));
      return task;
    } catch (err) {
      const message = errorMessage(err, 'Failed to create task');
      set({ loading: false, error: message });
      throw err;
    }
  },

  updateTask: async (id, patch) => {
    set({ loading: true, error: null });
    try {
      const updated = await apiRequest<TaskItem>(`/api/tasks/${id}`, {
        method: 'PATCH',
        body: patch,
      });
      set((state) => ({
        tasks: state.tasks.map((task) => (task.id === id ? { ...task, ...updated } : task)),
        loading: false,
      }));
      return updated;
    } catch (err) {
      const message = errorMessage(err, 'Failed to update task');
      set({ loading: false, error: message });
      throw err;
    }
  },

  deleteTask: async (id) => {
    set({ loading: true, error: null });
    try {
      await apiRequest<unknown>(`/api/tasks/${id}`, { method: 'DELETE' });
      set((state) => ({
        tasks: state.tasks.filter((task) => task.id !== id),
        selectedTaskId:
          state.selectedTaskId === id ? null : state.selectedTaskId,
        loading: false,
      }));
    } catch (err) {
      const message = errorMessage(err, 'Failed to delete task');
      set({ loading: false, error: message });
      throw err;
    }
  },

  completeTask: async (id) => {
    set({ loading: true, error: null });
    try {
      const updated = await apiRequest<TaskItem>(`/api/tasks/${id}/complete`, {
        method: 'POST',
      });
      set((state) => ({
        tasks: state.tasks.map((task) => (task.id === id ? { ...task, ...updated } : task)),
        loading: false,
      }));
      return updated;
    } catch (err) {
      const message = errorMessage(err, 'Failed to complete task');
      set({ loading: false, error: message });
      throw err;
    }
  },

  /**
   * Archive (or restore, when `options.restore` is true) a task via
   * POST /api/tasks/[id]/archive.
   */
  archiveTask: async (id, options) => {
    set({ loading: true, error: null });
    try {
      const updated = await apiRequest<TaskItem>(`/api/tasks/${id}/archive`, {
        method: 'POST',
        query: options?.restore ? { restore: true } : {},
      });
      set((state) => ({
        tasks: state.tasks.map((task) => (task.id === id ? { ...task, ...updated } : task)),
        loading: false,
      }));
      return updated;
    } catch (err) {
      const message = errorMessage(err, 'Failed to archive task');
      set({ loading: false, error: message });
      throw err;
    }
  },

  /**
   * Perform a bulk create/update/delete via POST /api/tasks/bulk, then
   * re-fetch the list to pick up server-side cascades.
   */
  bulkAction: async (input) => {
    set({ loading: true, error: null });
    try {
      const result = await apiRequest<BulkTaskResult>('/api/tasks/bulk', {
        method: 'POST',
        body: input,
      });
      await get().fetchTasks(get().filters);
      return result;
    } catch (err) {
      const message = errorMessage(err, 'Bulk operation failed');
      set({ loading: false, error: message });
      throw err;
    }
  },

  selectTask: (id) => {
    set({ selectedTaskId: id });
  },

  clear: () => {
    set({ tasks: [], selectedTaskId: null });
  },

  reset: () => {
    set({
      tasks: [],
      selectedTaskId: null,
      filters: {},
      loading: false,
      error: null,
    });
  },
}));