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

export interface RoutineConflictReport extends RoutineConflict {
  severity: 'ERROR' | 'WARNING';
}

/**
 * Check for conflicts in routine blocks
 */
export function detectConflicts(
  newBlock: BlockInput,
  existingBlocks: BlockInput[]
): RoutineConflictReport[] {
  const conflicts: RoutineConflictReport[] = [];
  
  // Validate time format
  if (!isValidTimeFormat(newBlock.startTime)) {
    conflicts.push({
      type: 'INVALID_TIME',
      blockId1: newBlock.id || 'new',
      message: 'Invalid start time format',
      severity: 'ERROR',
    });
  }
  
  if (!isValidTimeFormat(newBlock.endTime)) {
    conflicts.push({
      type: 'INVALID_TIME',
      blockId1: newBlock.id || 'new',
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
        type: 'OVERLAP',
        blockId1: newBlock.id || 'new',
        blockId2: existing.id,
        message: `Overlaps with "${existing.title}"`,
        severity: 'ERROR',
      });
    }
  }
  
  // Check for very short blocks (less than 5 minutes)
  const duration = calculateDuration(newBlock.startTime, newBlock.endTime);
  if (duration < 5) {
    conflicts.push({
      type: 'INVALID_TIME',
      blockId1: newBlock.id || 'new',
      message: 'Block duration is too short (minimum 5 minutes)',
      severity: 'WARNING',
    });
  }
  
  // Check for very long blocks (more than 12 hours)
  if (duration > 720) {
    conflicts.push({
      type: 'INVALID_TIME',
      blockId1: newBlock.id || 'new',
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
  const [start1Hour = 0, start1Min = 0] = start1.split(':').map(Number);
  const [end1Hour = 0, end1Min = 0] = end1.split(':').map(Number);
  const [start2Hour = 0, start2Min = 0] = start2.split(':').map(Number);
  const [end2Hour = 0, end2Min = 0] = end2.split(':').map(Number);
  
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
  const [startHour = 0, startMin = 0] = startTime.split(':').map(Number);
  const [endHour = 0, endMin = 0] = endTime.split(':').map(Number);
  
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
export function getConflictSummary(conflicts: RoutineConflictReport[]): {
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