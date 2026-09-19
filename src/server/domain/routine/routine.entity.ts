/**
 * Routine Entity – domain entity for daily routine blocks and their
 * scheduling / completion state. Uses @/lib/routine/duration helpers for
 * duration + overlap math. No DB access.
 */

import type { DayType, RoutineLogStatus } from '@/generated/prisma/client';

import {
  calculateBlockDuration,
  isOvernightBlock,
  isTimeOverlap,
  getCurrentBlock,
  getNextBlock,
} from '@/lib/routine/duration';

import type { DayRoutineBlock } from '@/types/routine';

// ============================================================================
// Types
// ============================================================================

export interface RoutineBlockInput {
  id: string;
  startTime: string; // HH:mm
  endTime: string; // HH:mm
  title: string;
  description?: string | null;
  categoryName?: string | null;
  energyLevel?: 'HIGH' | 'MEDIUM' | 'LOW' | string | null;
  trackCompletion?: boolean;
}

export interface CurrentBlockInfo {
  block: RoutineBlockInput | null;
  nextBlock: RoutineBlockInput | null;
  minutesUntilNext: number | null;
}

// ============================================================================
// Entity
// ============================================================================

/**
 * Domain entity wrapping a routine block.
 * @example
 * const block = new RoutineBlockEntity({
 *   id: 'b1', startTime: '06:00', endTime: '07:00', title: 'Workout',
 * });
 * block.durationMinutes // => 60
 * block.isOvernight // => false
 */
export class RoutineBlockEntity {
  readonly id: string;
  readonly startTime: string;
  readonly endTime: string;
  readonly title: string;

  constructor(block: RoutineBlockInput) {
    this.id = block.id;
    this.startTime = block.startTime;
    this.endTime = block.endTime;
    this.title = block.title;
  }

  get durationMinutes(): number {
    return calculateBlockDuration(this.startTime, this.endTime);
  }

  get isOvernight(): boolean {
    return isOvernightBlock(this.startTime, this.endTime);
  }

  /** Whether two blocks overlap in time. */
  overlapsWith(other: RoutineBlockInput): boolean {
    return isTimeOverlap(
      this.startTime,
      this.endTime,
      other.startTime,
      other.endTime,
    );
  }
}

// ============================================================================
// Day scope
// ============================================================================

/**
 * A day's ordered set of routine blocks (from one or more templates).
 * Blocks are sorted by start time; overnight blocks are treated as occurring
 * at the start of the day.
 * @example
 * const day = new DayRoutine([blockA, blockB]);
 * day.sortedBlocks()[0]?.id // => earliest block
 */
export class DayRoutine {
  readonly blocks: RoutineBlockEntity[];

  constructor(blocks: RoutineBlockEntity[]) {
    this.blocks = blocks;
  }

  /** Blocks ordered by start time (HH:mm). */
  sortedBlocks(): RoutineBlockEntity[] {
    return [...this.blocks].sort((a, b) =>
      a.startTime.localeCompare(b.startTime),
    );
  }

  /** Block active at `time` (HH:mm), or null. */
  getBlockAtTime(
    time: string = new Date().toTimeString().slice(0, 5),
  ): RoutineBlockEntity | null {
    const found = getCurrentBlock(this.blocks, time);
    const matched = found ? this.blocks.find((b) => b.id === found.id) : undefined;
    return matched ?? null;
  }

  /** Total planned duration of all blocks in minutes. */
  get totalMinutes(): number {
    return this.blocks.reduce((sum, b) => sum + b.durationMinutes, 0);
  }

  /** Number of blocks tracked for completion. */
  get trackedBlockCount(): number {
    return this.blocks.length;
  }

  /** Whether a block with `id` exists in this day. */
  hasBlock(id: string): boolean {
    return this.blocks.some((b) => b.id === id);
  }

  /** Remove a block by id and return a new DayRoutine (immutable). */
  withoutBlock(id: string): DayRoutine {
    return new DayRoutine(this.blocks.filter((b) => b.id !== id));
  }

  /** Count of blocks that overlap with a given block. */
  conflictsFor(block: RoutineBlockInput): number {
    return this.blocks.filter((b) =>
      b.id !== block.id && b.overlapsWith(block),
    ).length;
  }

  /** Current block + next block relative to `time`. */
  currentAndNext(time?: string): CurrentBlockInfo {
    const current = this.getBlockAtTime(time);
    const nextFound = getNextBlock(this.blocks, time) ?? null;
    const next = nextFound
      ? this.blocks.find((b) => b.id === nextFound.id) ?? null
      : null;
    const minutesUntilNext = next
      ? Math.max(0, minutesFromString(next.startTime) - minutesFromString(currentTime(time)))
      : null;
    return {
      block: current,
      nextBlock: next,
      minutesUntilNext,
    };
  }
}

// ============================================================================
// Completion status
// ============================================================================

/**
 * Aggregate completion state of a block's logs.
 * @example
 * completionStatusFor([
 *   { id: 'l1', status: 'COMPLETED' },
 *   { id: 'l2', status: 'PARTIAL' },
 * ])
 * // => { status: 'COMPLETED', percentage: 100, logged: 2 }
 */
export function completionStatusFor(
  logs: readonly { status: RoutineLogStatus }[],
): { status: 'COMPLETED' | 'PARTIAL' | 'IN_PROGRESS' | 'MISSED'; percentage: number; logged: number } {
  if (logs.length === 0) {
    return { status: 'MISSED', percentage: 0, logged: 0 };
  }
  const completed = logs.filter((l) => l.status === 'COMPLETED').length;
  const partial = logs.filter((l) => l.status === 'PARTIAL').length;
  if (completed === logs.length) {
    return { status: 'COMPLETED', percentage: 100, logged: logs.length };
  }
  const percentage = completed / logs.length * 100 + partial / logs.length * 50;
  if (percentage >= 50) {
    return { status: 'PARTIAL', percentage, logged: logs.length };
  }
  return { status: 'IN_PROGRESS', percentage, logged: logs.length };
}

/**
 * Map a routine-block shape onto a normalized entity without nullable state.
 * @example
 * const block = toRoutineBlockEntity({
 *   id: 'b1', startTime: '07:00', endTime: '08:00', title: 'Read',
 * });
 */
export function toRoutineBlockEntity(block: DayRoutineBlock): RoutineBlockEntity {
  return new RoutineBlockEntity({
    id: block.id,
    startTime: block.startTime,
    endTime: block.endTime,
    title: block.title,
    description: block.description,
    categoryName: block.category?.name ?? null,
    energyLevel: block.energyLevel,
    trackCompletion: block.trackCompletion,
  });
}

// ============================================================================
// Helpers
// ============================================================================

function minutesFromString(time: string): number {
  const [h = 0, m = 0] = time.split(':').map(Number);
  return h * 60 + m;
}

function currentTime(time?: string): string {
  return time ?? new Date().toTimeString().slice(0, 5);
}

// ============================================================================
// Day type helper
// ============================================================================

export type { DayType };

/** Whether a day type is a rest day (no scheduled work routines). */
export function isRestType(type: DayType): boolean {
  return type === 'WEEKEND';
}