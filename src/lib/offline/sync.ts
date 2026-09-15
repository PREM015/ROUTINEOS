import { getQueue, removeFromQueue, OfflineAction } from './queue';
export async function syncOfflineActions(): Promise<{ synced: number; failed: number }> {
  const queue = await getQueue(); let synced = 0; let failed = 0;
  for (const action of queue) {
    const success = await processSingleAction(action);
    if (success) { await removeFromQueue(action.id); synced++; } else { failed++; }
  }
  return { synced, failed };
}
export function registerOnlineListener(callback: () => void): () => void {
  const handleOnline = () => callback(); window.addEventListener('online', handleOnline);
  return () => window.removeEventListener('online', handleOnline);
}
export async function processSingleAction(action: OfflineAction): Promise<boolean> {
  try { const res = await fetch('/api/sync', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(action) }); return res.ok; } catch { return false; }
}
