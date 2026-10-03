'use client';

import { useEffect, useState } from 'react';
import { 
  queueOfflineAction, 
  flushOutbox, 
  getPendingSyncCount, 
  setupSyncListeners,
  cleanupOutbox 
} from '@/lib/pwa/sync-engine';

/**
 * Hook to manage offline sync state and queue actions
 */
export function useOfflineSync() {
  const [pendingCount, setPendingCount] = useState(0);
  const [isOnline, setIsOnline] = useState(true);
  const [lastSync, setLastSync] = useState<Date | null>(null);

  useEffect(() => {
    // Initial count
    getPendingSyncCount().then(setPendingCount);
    
    // Online status
    setIsOnline(navigator.onLine);
    
    // Setup listeners
    const cleanup = setupSyncListeners();
    
    // Periodic sync count update
    const interval = setInterval(() => {
      getPendingSyncCount().then(setPendingCount);
    }, 30000);
    
    // Cleanup old items daily
    cleanupOutbox();
    
    return () => {
      cleanup();
      clearInterval(interval);
    };
  }, []);

  /**
   * Queue a sleep confirmation for offline sync
   */
  const queueSleepConfirmation = async (
    promptId: string,
    action: 'woke-at-target' | 'woke-later' | 'still-sleeping',
    actualWakeTime?: string
  ) => {
    const idempotencyKey = `sleep-confirm:${promptId}:${action}:${Date.now()}`;
    await queueOfflineAction(
      '/api/sleep/session/wake-confirm',
      'POST',
      { promptId, action, actualWakeTime },
      idempotencyKey
    );
    setPendingCount(prev => prev + 1);
  };

  /**
   * Queue a routine block action for offline sync
   */
  const queueRoutineAction = async (
    notificationId: string,
    action: 'STARTED' | 'NOT_YET' | 'COMPLETED' | 'PARTIAL' | 'NOT_DONE' | 'EXTEND' | 'SNOOZE',
    snoozeMinutes?: number
  ) => {
    const idempotencyKey = `routine-action:${notificationId}:${action}:${Date.now()}`;
    await queueOfflineAction(
      '/api/notifications/action',
      'POST',
      { notificationId, action, snoozeMinutes },
      idempotencyKey
    );
    setPendingCount(prev => prev + 1);
  };

  /**
   * Queue a habit completion for offline sync
   */
  const queueHabitCompletion = async (
    habitId: string,
    date: string,
    status: 'COMPLETED' | 'MISSED' | 'SKIPPED' | 'PARTIAL',
    quantity?: number
  ) => {
    const idempotencyKey = `habit-completion:${habitId}:${date}:${Date.now()}`;
    await queueOfflineAction(
      '/api/habits/log',
      'POST',
      { habitId, date, status, quantity },
      idempotencyKey
    );
    setPendingCount(prev => prev + 1);
  };

  /**
   * Queue a goal progress update for offline sync
   */
  const queueGoalProgress = async (
    goalId: string,
    progress: number,
    mode: 'delta' | 'set'
  ) => {
    const idempotencyKey = `goal-progress:${goalId}:${progress}:${Date.now()}`;
    await queueOfflineAction(
      '/api/goals/progress',
      'POST',
      { goalId, progress, mode },
      idempotencyKey
    );
    setPendingCount(prev => prev + 1);
  };

  /**
   * Trigger immediate sync
   */
  const triggerSync = async () => {
    const result = await flushOutbox();
    setPendingCount(prev => Math.max(0, prev - result.synced));
    setLastSync(new Date());
    return result;
  };

  return {
    pendingCount,
    isOnline,
    lastSync,
    queueSleepConfirmation,
    queueRoutineAction,
    queueHabitCompletion,
    queueGoalProgress,
    triggerSync,
  };
}

/**
 * Provider component to initialize sync listeners
 */
export function OfflineSyncProvider({ children }: { children: React.ReactNode }) {
  useOfflineSync();
  return <>{children}</>;
}