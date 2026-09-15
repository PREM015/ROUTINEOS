/**
 * Routine Types
 *
 * Complete type definitions for the RoutineOS routine engine,
 * including templates, blocks, exceptions, and logs.
 */

// ============================================================
// ENUMS
// ============================================================

export enum DayType {
  WORKDAY = "WORKDAY",
  WEEKEND = "WEEKEND",
  HOLIDAY = "HOLIDAY",
  EXAM_DAY = "EXAM_DAY",
  LOW_ENERGY = "LOW_ENERGY",
  CUSTOM = "CUSTOM",
}

export enum RoutineLogStatus {
  COMPLETED = "COMPLETED",
  MISSED = "MISSED",
  PARTIAL = "PARTIAL",
  IN_PROGRESS = "IN_PROGRESS",
}

// ============================================================
// ROUTINE TEMPLATE
// ============================================================

export interface RoutineTemplate {
  id: string;
  userId: string;

  name: string;
  description: string | null;
  dayType: DayType;
  isDefault: boolean;

  color: string | null;
  icon: string | null;
  isActive: boolean;
  archivedAt: Date | null;

  estimatedDuration: number | null; // total minutes

  createdAt: Date;
  updatedAt: Date;
}

// ============================================================
// ROUTINE BLOCK
// ============================================================

export interface RoutineBlock {
  id: string;
  userId: string;
  templateId: string;
  categoryId: string | null;

  name: string;
  description: string | null;
  icon: string | null;
  color: string | null;

  startTime: string; // HH:mm
  endTime: string; // HH:mm
  isOvernight: boolean;

  isFlexible: boolean;
  isOptional: boolean;
  sortOrder: number;

  // Metadata
  tags: string | null;
  notes: string | null;

  createdAt: Date;
  updatedAt: Date;
}

// ============================================================
// ROUTINE EXCEPTION
// ============================================================

export interface RoutineException {
  id: string;
  userId: string;
  templateId: string;

  date: string; // ISO date YYYY-MM-DD
  overrideDayType: DayType | null;
  reason: string | null;

  createdAt: Date;
}

// ============================================================
// ROUTINE LOG
// ============================================================

export interface RoutineLog {
  id: string;
  userId: string;
  templateId: string;
  blockId: string | null;

  date: string; // ISO date YYYY-MM-DD
  status: RoutineLogStatus;

  scheduledStart: string | null;
  scheduledEnd: string | null;
  actualStart: string | null;
  actualEnd: string | null;

  notes: string | null;

  createdAt: Date;
  updatedAt: Date;
}

// ============================================================
// ROUTINE WITH RELATIONS
// ============================================================

export interface RoutineTemplateWithBlocks extends RoutineTemplate {
  blocks: RoutineBlock[];
}

export interface RoutineBlockWithLog extends RoutineBlock {
  todayLog: RoutineLog | null;
}

export interface TodayRoutine {
  template: RoutineTemplate;
  blocks: RoutineBlockWithLog[];
  currentBlock: RoutineBlockWithLog | null;
  nextBlock: RoutineBlockWithLog | null;
  completionPercentage: number;
}

// ============================================================
// TIME SLOT
// ============================================================

export interface TimeSlot {
  start: string; // HH:mm
  end: string; // HH:mm
  isOvernight: boolean;
}

export interface RoutineConflict {
  blockA: RoutineBlock;
  blockB: RoutineBlock;
  overlapMinutes: number;
}

// ============================================================
// MINIMUM DAY TEMPLATE
// ============================================================

export interface MinimumDayTemplate {
  id: string;
  userId: string;
  name: string;
  habitIds: string[];
  isDefault: boolean;
  createdAt: Date;
  updatedAt: Date;
}

// ============================================================
// FORM DATA
// ============================================================

export interface CreateRoutineTemplateInput {
  name: string;
  description?: string;
  dayType: DayType;
  isDefault?: boolean;
  color?: string;
  icon?: string;
}

export interface UpdateRoutineTemplateInput
  extends Partial<CreateRoutineTemplateInput> {
  id: string;
  isActive?: boolean;
}

export interface CreateRoutineBlockInput {
  templateId: string;
  name: string;
  description?: string;
  icon?: string;
  color?: string;
  categoryId?: string;
  startTime: string;
  endTime: string;
  isOvernight?: boolean;
  isFlexible?: boolean;
  isOptional?: boolean;
  sortOrder?: number;
  notes?: string;
  tags?: string;
}

export interface UpdateRoutineBlockInput
  extends Partial<CreateRoutineBlockInput> {
  id: string;
}

export interface CreateRoutineExceptionInput {
  templateId: string;
  date: string;
  overrideDayType?: DayType;
  reason?: string;
}

export interface LogRoutineBlockInput {
  blockId: string;
  date: string;
  status: RoutineLogStatus;
  actualStart?: string;
  actualEnd?: string;
  notes?: string;
}
