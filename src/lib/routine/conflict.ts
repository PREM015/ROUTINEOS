import { RoutineBlock, RoutineConflict } from "@/types/routine";

export function timeToMinutes(time: string): number {
  const [hours, minutes] = time.split(':').map(Number);
  return hours * 60 + minutes;
}

export function minutesToTime(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
}

export function blocksOverlap(a: RoutineBlock, b: RoutineBlock): boolean {
  if (a.id === b.id) return false;
  
  const startA = timeToMinutes(a.startTime);
  const endA = timeToMinutes(a.endTime);
  const startB = timeToMinutes(b.startTime);
  const endB = timeToMinutes(b.endTime);

  return startA < endB && endA > startB;
}

export function getOverlapMinutes(a: RoutineBlock, b: RoutineBlock): number {
  if (!blocksOverlap(a, b)) return 0;
  
  const startA = timeToMinutes(a.startTime);
  const endA = timeToMinutes(a.endTime);
  const startB = timeToMinutes(b.startTime);
  const endB = timeToMinutes(b.endTime);

  const overlapStart = Math.max(startA, startB);
  const overlapEnd = Math.min(endA, endB);

  return overlapEnd - overlapStart;
}

export function detectConflicts(blocks: RoutineBlock[]): RoutineConflict[] {
  const conflicts: RoutineConflict[] = [];

  for (let i = 0; i < blocks.length; i++) {
    for (let j = i + 1; j < blocks.length; j++) {
      if (blocksOverlap(blocks[i], blocks[j])) {
        conflicts.push({
          blockIds: [blocks[i].id, blocks[j].id],
          overlapMinutes: getOverlapMinutes(blocks[i], blocks[j])
        });
      }
    }
  }

  return conflicts;
}
