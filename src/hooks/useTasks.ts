'use client';

import { useShallow } from 'zustand/react/shallow';
import { useTasksStore } from '@/store/tasks.store';
import type {
  BulkTaskActionInput,
  BulkTaskResult,
  TaskFilters,
  TaskItem,
} from '@/store/tasks.store';
import type { CreateTaskInput, UpdateTaskInput } from '@/schemas/task';

/**
 * Tasks hook: subscribe to the tasks store for the cached list, current
 * selection, filters and the CRUD/complete/archive/bulk actions.
 */
export function useTasks() {
  const tasks = useTasksStore((state) => state.tasks);
  const selectedTaskId = useTasksStore((state) => state.selectedTaskId);
  const filters = useTasksStore((state) => state.filters);
  const loading = useTasksStore((state) => state.loading);
  const error = useTasksStore((state) => state.error);

  const actions = useTasksStore(
    useShallow((state) => ({
      fetchTasks: state.fetchTasks,
      fetchTask: state.fetchTask,
      createTask: state.createTask,
      updateTask: state.updateTask,
      deleteTask: state.deleteTask,
      completeTask: state.completeTask,
      archiveTask: state.archiveTask,
      bulkAction: state.bulkAction,
      selectTask: state.selectTask,
      clear: state.clear,
      reset: state.reset,
    }))
  );

  return {
    tasks,
    selectedTaskId,
    filters,
    loading,
    error,
    ...actions,
  };
}

export type {
  TaskFilters,
  TaskItem,
  BulkTaskActionInput,
  BulkTaskResult,
  CreateTaskInput,
  UpdateTaskInput,
};
export { useTasksStore };