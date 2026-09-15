/**
 * Goal Types
 *
 * Complete type definitions for the RoutineOS goal system,
 * including goals, milestones, progress, and carry-over logic.
 */

// ============================================================
// ENUMS
// ============================================================

export enum GoalType {
  DAILY = "DAILY",
  WEEKLY = "WEEKLY",
  MONTHLY = "MONTHLY",
  QUARTERLY = "QUARTERLY",
  YEARLY = "YEARLY",
  CUSTOM = "CUSTOM",
}

export enum GoalPriority {
  LOW = "LOW",
  MEDIUM = "MEDIUM",
  HIGH = "HIGH",
  CRITICAL = "CRITICAL",
}

export enum GoalStatus {
  ACTIVE = "ACTIVE",
  COMPLETED = "COMPLETED",
  MISSED = "MISSED",
  CARRIED_OVER = "CARRIED_OVER",
  ON_HOLD = "ON_HOLD",
  CANCELLED = "CANCELLED",
}

export enum ProjectStatus {
  PLANNING = "PLANNING",
  ACTIVE = "ACTIVE",
  ON_HOLD = "ON_HOLD",
  COMPLETED = "COMPLETED",
  ARCHIVED = "ARCHIVED",
  CANCELLED = "CANCELLED",
}

export enum MilestoneStatus {
  PENDING = "PENDING",
  COMPLETED = "COMPLETED",
  MISSED = "MISSED",
}

// ============================================================
// GOAL
// ============================================================

export interface Goal {
  id: string;
  userId: string;
  projectId: string | null;
  categoryId: string | null;

  title: string;
  description: string | null;

  type: GoalType;
  priority: GoalPriority;
  status: GoalStatus;

  // Progress
  isQuantifiable: boolean;
  targetValue: number | null;
  currentValue: number | null;
  unit: string | null;

  // Timeline
  startDate: string; // ISO date
  dueDate: string; // ISO date
  completedAt: Date | null;

  // Carry-over
  isCarriedOver: boolean;
  parentGoalId: string | null;
  carryOverCount: number;

  // Metadata
  icon: string | null;
  color: string | null;
  tags: string | null;
  notes: string | null;
  sortOrder: number;
  isArchived: boolean;

  createdAt: Date;
  updatedAt: Date;
}

// ============================================================
// GOAL PROGRESS
// ============================================================

export interface GoalProgress {
  id: string;
  goalId: string;
  userId: string;

  value: number;
  note: string | null;

  recordedAt: Date;
  createdAt: Date;
}

// ============================================================
// MILESTONE
// ============================================================

export interface Milestone {
  id: string;
  goalId: string;
  userId: string;

  title: string;
  description: string | null;

  targetValue: number | null;
  dueDate: string | null;
  status: MilestoneStatus;
  completedAt: Date | null;

  sortOrder: number;

  createdAt: Date;
  updatedAt: Date;
}

// ============================================================
// PROJECT
// ============================================================

export interface Project {
  id: string;
  userId: string;
  categoryId: string | null;

  name: string;
  description: string | null;

  status: ProjectStatus;
  priority: GoalPriority;

  startDate: string | null;
  dueDate: string | null;
  completedAt: Date | null;

  color: string | null;
  icon: string | null;
  tags: string | null;

  createdAt: Date;
  updatedAt: Date;
}

// ============================================================
// GOAL WITH RELATIONS
// ============================================================

export interface GoalWithProgress extends Goal {
  progress: GoalProgress[];
  milestones: Milestone[];
  completionPercentage: number;
  velocity: number | null; // units per day
  projectedCompletionDate: string | null;
  isOnTrack: boolean;
}

export interface GoalWithMilestones extends Goal {
  milestones: Milestone[];
}

// ============================================================
// CARRY-OVER
// ============================================================

export interface CarryOverPreview {
  goal: Goal;
  remainingValue: number | null;
  suggestedNewDueDate: string;
  carryOverCount: number;
}

// ============================================================
// FORM DATA
// ============================================================

export interface CreateGoalInput {
  title: string;
  description?: string;
  type: GoalType;
  priority: GoalPriority;
  projectId?: string;
  categoryId?: string;
  isQuantifiable?: boolean;
  targetValue?: number;
  unit?: string;
  startDate: string;
  dueDate: string;
  icon?: string;
  color?: string;
  notes?: string;
}

export interface UpdateGoalInput extends Partial<CreateGoalInput> {
  id: string;
  status?: GoalStatus;
  currentValue?: number;
  sortOrder?: number;
}

export interface LogGoalProgressInput {
  goalId: string;
  value: number;
  note?: string;
  recordedAt?: string;
}

export interface CarryOverGoalInput {
  goalId: string;
  newDueDate: string;
  adjustedTargetValue?: number;
  note?: string;
}
