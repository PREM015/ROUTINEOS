export type ConflictResolution = 'local' | 'server' | 'merge';
export function resolveConflict(localData: any, serverData: any, _type: string): ConflictResolution {
  if (!localData) return 'server'; if (!serverData) return 'local';
  if (localData.updatedAt && serverData.updatedAt) return new Date(localData.updatedAt) > new Date(serverData.updatedAt) ? 'local' : 'server';
  return 'merge';
}
export function mergeHabitLogs(local: any[], server: any[]): any[] {
  const map = new Map<string, any>();
  server.forEach(log => map.set(log.id, log));
  local.forEach(log => {
    const existing = map.get(log.id);
    if (!existing) map.set(log.id, log); else if (log.completed && !existing.completed) map.set(log.id, log);
  });
  return Array.from(map.values());
}
