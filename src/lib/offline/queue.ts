export interface OfflineAction { id: string; type: string; payload: any; timestamp: number; retries: number; }
const QUEUE_KEY = 'offline_action_queue';
export async function enqueueAction(action: Omit<OfflineAction, 'id' | 'timestamp' | 'retries'>): Promise<void> {
  const queue = await getQueue();
  queue.push({ ...action, id: crypto.randomUUID(), timestamp: Date.now(), retries: 0 });
  localStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
}
export async function getQueue(): Promise<OfflineAction[]> {
  const data = localStorage.getItem(QUEUE_KEY); return data ? JSON.parse(data) : [];
}
export async function removeFromQueue(id: string): Promise<void> {
  let queue = await getQueue(); queue = queue.filter(item => item.id !== id);
  localStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
}
export async function clearQueue(): Promise<void> { localStorage.removeItem(QUEUE_KEY); }
