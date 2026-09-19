import type { RoutineConflict } from '@/types/routine';

/**
 * Routine Conflict Detection
 * Detect and report scheduling conflicts
 */

export interface BlockInput {
  id?: string;
  startTime: string;
  endTime: string;
  title: string;
}

/**
 * Check for conflicts in routine blocks
 */
export function detectConflicts(
  newBlock: BlockInput,
  existingBlocks: BlockInput[]
): RoutineConflict[] {
  const conflicts: RoutineConflict[] = [];
  
  // Validate time format
  if (!isValidTimeFormat(newBlock.startTime)) {
    conflicts.push({
      type: 'DURATION_INVALID',
      blockId: newBlock.id || 'new',
      message: 'Invalid start time format',
      severity: 'ERROR',
    });
  }
  
  if (!isValidTimeFormat(newBlock.endTime)) {
    conflicts.push({
      type: 'DURATION_INVALID',
      blockId: newBlock.id || 'new',
      message: 'Invalid end time format',
      severity: 'ERROR',
    });
  }
  
  // Check for time overlaps with existing blocks
  for (const existing of existingBlocks) {
    // Skip self
    if (existing.id === newBlock.id) continue;
    
    if (hasTimeOverlap(newBlock.startTime, newBlock.endTime, existing.startTime, existing.endTime)) {
      conflicts.push({
        type: 'TIME_OVERLAP',
        blockId: newBlock.id || 'new',
        conflictingBlockId: existing.id,
        message: `Overlaps with "${existing.title}"`,
        severity: 'ERROR',
      });
    }
  }
  
  // Check for very short blocks (less than 5 minutes)
  const duration = calculateDuration(newBlock.startTime, newBlock.endTime);
  if (duration < 5) {
    conflicts.push({
      type: 'DURATION_INVALID',
      blockId: newBlock.id || 'new',
      message: 'Block duration is too short (minimum 5 minutes)',
      severity: 'WARNING',
    });
  }
  
  // Check for very long blocks (more than 12 hours)
  if (duration > 720) {
    conflicts.push({
      type: 'DURATION_INVALID',
      blockId: newBlock.id || 'new',
      message: 'Block duration is very long (over 12 hours)',
      severity: 'WARNING',
    });
  }
  
  return conflicts;
}

function isValidTimeFormat(time: string): boolean {
  return /^([01]\d|2[0-3]):([0-5]\d)$/.test(time);
}

function hasTimeOverlap(
  start1: string,
  end1: string,
  start2: string,
  end2: string
): boolean {
  const [start1Hour, start1Min] = start1.split(':').map(Number);
  const [end1Hour, end1Min] = end1.split(':').map(Number);
  const [start2Hour, start2Min] = start2.split(':').map(Number);
  const [end2Hour, end2Min] = end2.split(':').map(Number);
  
  let start1Minutes = start1Hour * 60 + start1Min;
  let end1Minutes = end1Hour * 60 + end1Min;
  let start2Minutes = start2Hour * 60 + start2Min;
  let end2Minutes = end2Hour * 60 + end2Min;
  
  // Handle overnight blocks
  if (end1Minutes <= start1Minutes) {
    end1Minutes += 24 * 60;
  }
  if (end2Minutes <= start2Minutes) {
    end2Minutes += 24 * 60;
  }
  
  return (
    (start1Minutes < end2Minutes && end1Minutes > start2Minutes) ||
    (start2Minutes < end1Minutes && end2Minutes > start1Minutes)
  );
}

function calculateDuration(startTime: string, endTime: string): number {
  const [startHour, startMin] = startTime.split(':').map(Number);
  const [endHour, endMin] = endTime.split(':').map(Number);
  
  let startMinutes = startHour * 60 + startMin;
  let endMinutes = endHour * 60 + endMin;
  
  if (endMinutes <= startMinutes) {
    endMinutes += 24 * 60;
  }
  
  return endMinutes - startMinutes;
}

/**
 * Get conflict summary
 */
export function getConflictSummary(conflicts: RoutineConflict[]): {
  hasErrors: boolean;
  hasWarnings: boolean;
  errorCount: number;
  warningCount: number;
} {
  const errors = conflicts.filter(c => c.severity === 'ERROR');
  const warnings = conflicts.filter(c => c.severity === 'WARNING');
  
  return {
    hasErrors: errors.length > 0,
    hasWarnings: warnings.length > 0,
    errorCount: errors.length,
    warningCount: warnings.length,
  };
}