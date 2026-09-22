export interface SleepConflict {
  type: 'bedtime' | 'waketime';
  blockName: string;
  overlapMinutes: number;
}

function timeToMinutes(timeStr: string): number {
  const [h = 0, m = 0] = timeStr.split(':').map(Number);
  return h * 60 + m;
}

export function detectSleepConflicts(bedtime: string, wakeTime: string, routineBlocks: Array<{name: string; startTime: string; endTime: string}>): SleepConflict[] {
  const conflicts: SleepConflict[] = [];
  let bedMins = timeToMinutes(bedtime);
  let wakeMins = timeToMinutes(wakeTime);

  // If overnight, adjust wakeMins to next day
  const isOvernight = wakeMins < bedMins;
  if (isOvernight) wakeMins += 24 * 60;

  for (const block of routineBlocks) {
    let blockStart = timeToMinutes(block.startTime);
    let blockEnd = timeToMinutes(block.endTime);
    if (blockEnd < blockStart) {
      blockEnd += 24 * 60; // Assuming block doesn't span more than a day
    }

    // Check for today's sleep
    if (blockStart < wakeMins && blockEnd > bedMins) {
      let overlapStart = Math.max(bedMins, blockStart);
      let overlapEnd = Math.min(wakeMins, blockEnd);
      let overlapMinutes = overlapEnd - overlapStart;
      
      if (overlapMinutes > 0) {
        const isBedtimeConflict = Math.abs(overlapStart - bedMins) < Math.abs(overlapEnd - wakeMins);
        conflicts.push({
          type: isBedtimeConflict ? 'bedtime' : 'waketime',
          blockName: block.name,
          overlapMinutes
        });
      }
    } else if (isOvernight) {
      // Check for next day overlap
      let nextDayStart = blockStart + 24 * 60;
      let nextDayEnd = blockEnd + 24 * 60;
      if (nextDayStart < wakeMins && nextDayEnd > bedMins) {
        let overlapStart = Math.max(bedMins, nextDayStart);
        let overlapEnd = Math.min(wakeMins, nextDayEnd);
        let overlapMinutes = overlapEnd - overlapStart;
        if (overlapMinutes > 0) {
          const isBedtimeConflict = Math.abs(overlapStart - bedMins) < Math.abs(overlapEnd - wakeMins);
          conflicts.push({
            type: isBedtimeConflict ? 'bedtime' : 'waketime',
            blockName: block.name,
            overlapMinutes
          });
        }
      }
    }
  }

  return conflicts;
}

export function hasSleepConflict(bedtime: string, wakeTime: string, routineBlocks: any[]): boolean {
  return detectSleepConflicts(bedtime, wakeTime, routineBlocks).length > 0;
}
