import { RoutineBlock, RoutineLog, RoutineLogStatus } from "@/types/routine";

export function getBlockStatus(blockId: string, logs: RoutineLog[]): RoutineLogStatus | null {
  const log = logs.find(l => l.blockId === blockId);
  return log?.status || null;
}

export function isBlockCompleted(blockId: string, logs: RoutineLog[]): boolean {
  return getBlockStatus(blockId, logs) === 'COMPLETED';
}

export function getCompletionPercentage(blocks: RoutineBlock[], logs: RoutineLog[]): number {
  if (blocks.length === 0) return 0;
  
  const completedBlocks = blocks.filter(block => isBlockCompleted(block.id, logs));
  return Math.round((completedBlocks.length / blocks.length) * 100);
}
