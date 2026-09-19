/**
 * Zustand store barrel.
 *
 * Re-exports every feature store under a single import surface, so consuming
 * code can do `import { useAuthStore, useTasksStore } from '@/store'`.
 */

export * from './auth.store';
export * from './user.store';
export * from './goals.store';
export * from './habits.store';
export * from './tasks.store';
export * from './projects.store';
export * from './routine.store';
export * from './notifications.store';
export * from './theme.store';
export * from './ui.store';