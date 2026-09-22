/**
 * Routine Duration Calculations
 * Calculate duration and detect time overlaps
 */

export interface TimeRange {
  startTime: string;
  endTime: string;
}

/**
 * Check if block is overnight (crosses midnight)
 */
export function isOvernightBlock(startTime: string, endTime: string): boolean {
  const [startHour = 0, startMin = 0] = startTime.split(':').map(Number);
  const [endHour = 0, endMin = 0] = endTime.split(':').map(Number);
  
  const startMinutes = startHour * 60 + startMin;
  const endMinutes = endHour * 60 + endMin;
  
  return endMinutes <= startMinutes;
}

/**
 * Calculate block duration in minutes
 */
export function calculateBlockDuration(startTime: string, endTime: string): number {
  const [startHour = 0, startMin = 0] = startTime.split(':').map(Number);
  const [endHour = 0, endMin = 0] = endTime.split(':').map(Number);
  
  let startMinutes = startHour * 60 + startMin;
  let endMinutes = endHour * 60 + endMin;
  
  // Handle overnight blocks
  if (endMinutes <= startMinutes) {
    endMinutes += 24 * 60; // Add 24 hours
  }
  
  return endMinutes - startMinutes;
}

/**
 * Format duration in human-readable format
 */
export function formatDuration(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  
  if (hours === 0) {
    return `${mins}m`;
  }
  
  if (mins === 0) {
    return `${hours}h`;
  }
  
  return `${hours}h ${mins}m`;
}

/**
 * Check if two time ranges overlap
 */
export function isTimeOverlap(
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
  
  // Check for overlap
  return (
    (start1Minutes < end2Minutes && end1Minutes > start2Minutes) ||
    (start2Minutes < end1Minutes && end2Minutes > start1Minutes)
  );
}

/**
 * Get current time block for a specific time
 */
export function getCurrentBlock(
  blocks: Array<{ startTime: string; endTime: string; id: string }>,
  currentTime: string = new Date().toTimeString().slice(0, 5)
): typeof blocks[number] | null {
  const [currentHour = 0, currentMin = 0] = currentTime.split(':').map(Number);
  const currentMinutes = currentHour * 60 + currentMin;
  
  for (const block of blocks) {
    const [startHour = 0, startMin = 0] = block.startTime.split(':').map(Number);
    const [endHour = 0, endMin = 0] = block.endTime.split(':').map(Number);
    
    let startMinutes = startHour * 60 + startMin;
    let endMinutes = endHour * 60 + endMin;
    
    // Handle overnight blocks
    if (endMinutes <= startMinutes) {
      endMinutes += 24 * 60;
      
      // Check if current time is after midnight for overnight block
      if (currentMinutes < startMinutes) {
        const adjustedCurrent = currentMinutes + 24 * 60;
        if (adjustedCurrent >= startMinutes && adjustedCurrent < endMinutes) {
          return block;
        }
      }
    }
    
    if (currentMinutes >= startMinutes && currentMinutes < endMinutes) {
      return block;
    }
  }
  
  return null;
}

/**
 * Get next block after current time
 */
export function getNextBlock(
  blocks: Array<{ startTime: string; endTime: string; id: string }>,
  currentTime: string = new Date().toTimeString().slice(0, 5)
): typeof blocks[number] | null {
  const [currentHour = 0, currentMin = 0] = currentTime.split(':').map(Number);
  const currentMinutes = currentHour * 60 + currentMin;
  
  // Sort blocks by start time
  const sortedBlocks = [...blocks].sort((a, b) => {
    const [aHour = 0, aMin = 0] = a.startTime.split(':').map(Number);
    const [bHour = 0, bMin = 0] = b.startTime.split(':').map(Number);
    return aHour * 60 + aMin - (bHour * 60 + bMin);
  });
  
  for (const block of sortedBlocks) {
    const [startHour = 0, startMin = 0] = block.startTime.split(':').map(Number);
    const startMinutes = startHour * 60 + startMin;
    
    if (startMinutes > currentMinutes) {
      return block;
    }
  }
  
  // No block found today, return first block of tomorrow
  return sortedBlocks[0] || null;
}

/**
 * Calculate time until next block
 */
export function minutesUntilBlock(
  blockStartTime: string,
  currentTime: string = new Date().toTimeString().slice(0, 5)
): number {
  const [currentHour = 0, currentMin = 0] = currentTime.split(':').map(Number);
  const [blockHour = 0, blockMin = 0] = blockStartTime.split(':').map(Number);
  
  const currentMinutes = currentHour * 60 + currentMin;
  const blockMinutes = blockHour * 60 + blockMin;
  
  let diff = blockMinutes - currentMinutes;
  
  // If negative, it's tomorrow
  if (diff < 0) {
    diff += 24 * 60;
  }
  
  return diff;
}

/**
 * Calculate progress through a block
 */
export function calculateBlockProgress(
  startTime: string,
  endTime: string,
  currentTime: string = new Date().toTimeString().slice(0, 5)
): { percentage: number; minutesElapsed: number; minutesRemaining: number } {
  const duration = calculateBlockDuration(startTime, endTime);
  
  const [currentHour = 0, currentMin = 0] = currentTime.split(':').map(Number);
  const [startHour = 0, startMin = 0] = startTime.split(':').map(Number);
  
  let currentMinutes = currentHour * 60 + currentMin;
  let startMinutes = startHour * 60 + startMin;
  
  // Handle overnight blocks
  if (currentMinutes < startMinutes) {
    currentMinutes += 24 * 60;
  }
  
  const minutesElapsed = currentMinutes - startMinutes;
  const minutesRemaining = duration - minutesElapsed;
  const percentage = Math.min(100, Math.max(0, (minutesElapsed / duration) * 100));
  
  return {
    percentage: Math.round(percentage),
    minutesElapsed,
    minutesRemaining: Math.max(0, minutesRemaining),
  };
}