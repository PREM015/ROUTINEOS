/**
 * Offline Queue
 * Queue actions when offline
 */

export interface QueuedAction {
  id: string;
  type: 'HABIT_LOG' | 'GOAL_PROGRESS' | 'REFLECTION';
  data: any;
  timestamp: number;
}

export type OfflineAction = QueuedAction;

const QUEUE_KEY = 'routineos_offline_queue';

export function queueAction(type: QueuedAction['type'], data: any): string {
  const id = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

  const action: QueuedAction = {
    id,
    type,
    data,
    timestamp: Date.now(),
  };

  const queue = getQueue();
  queue.push(action);
  saveQueue(queue);

  return id;
}

export function getQueue(): QueuedAction[] {
  if (typeof window === 'undefined') return [];

  const stored = localStorage.getItem(QUEUE_KEY);
  return stored ? JSON.parse(stored) : [];
}

export function saveQueue(queue: QueuedAction[]): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
}

export function removeFromQueue(id: string): void {
  const queue = getQueue();
  const filtered = queue.filter(action => action.id !== id);
  saveQueue(filtered);
}

export function clearQueue(): void {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(QUEUE_KEY);
}

export async function syncQueue(): Promise<{
  synced: number;
  failed: number;
}> {
  const queue = getQueue();
  let synced = 0;
  let failed = 0;

  for (const action of queue) {
    try {
      await syncAction(action);
      removeFromQueue(action.id);
      synced++;
    } catch (error) {
      console.error('Failed to sync action:', action, error);
      failed++;
    }
  }

  return { synced, failed };
}

async function syncAction(action: QueuedAction): Promise<void> {
  switch (action.type) {
    case 'HABIT_LOG':
      await fetch(`/api/habits/${action.data.habitId}/log`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(action.data),
      });
      break;

    case 'GOAL_PROGRESS':
      await fetch(`/api/goals/${action.data.goalId}/progress`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(action.data),
      });
      break;

    case 'REFLECTION':
      await fetch('/api/reflections', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(action.data),
      });
      break;
  }
}