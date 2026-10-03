import { auditService } from './audit.service';
import type { UserId } from '@/types/ids';

/**
 * Audit Event Helpers
 * Convenience functions for common audit events
 */

export async function auditHabitCreated(
  userId: UserId,
  habitId: string,
  habitName: string
) {
  await auditService.log({
    userId,
    action: 'HABIT_CREATED',
    entityType: 'HABIT',
    entityId: habitId,
    metadata: { name: habitName },
  });
}

export async function auditHabitArchived(
  userId: UserId,
  habitId: string,
  habitName: string,
  reason?: string
) {
  await auditService.log({
    userId,
    action: 'HABIT_ARCHIVED',
    entityType: 'HABIT',
    entityId: habitId,
    metadata: { name: habitName, reason },
  });
}

export async function auditHabitDeleted(
  userId: UserId,
  habitId: string,
  habitName: string
) {
  await auditService.log({
    userId,
    action: 'HABIT_DELETED',
    entityType: 'HABIT',
    entityId: habitId,
    metadata: { name: habitName },
  });
}

export async function auditGoalCreated(
  userId: UserId,
  goalId: string,
  goalTitle: string
) {
  await auditService.log({
    userId,
    action: 'GOAL_CREATED',
    entityType: 'GOAL',
    entityId: goalId,
    metadata: { title: goalTitle },
  });
}

export async function auditGoalCompleted(
  userId: UserId,
  goalId: string,
  goalTitle: string
) {
  await auditService.log({
    userId,
    action: 'GOAL_COMPLETED',
    entityType: 'GOAL',
    entityId: goalId,
    metadata: { title: goalTitle },
  });
}

export async function auditGoalDeleted(
  userId: UserId,
  goalId: string,
  goalTitle: string
) {
  await auditService.log({
    userId,
    action: 'GOAL_DELETED',
    entityType: 'GOAL',
    entityId: goalId,
    metadata: { title: goalTitle },
  });
}

export async function auditRoutineChanged(
  userId: UserId,
  templateId: string,
  templateName: string
) {
  await auditService.log({
    userId,
    action: 'ROUTINE_CHANGED',
    entityType: 'ROUTINE_TEMPLATE',
    entityId: templateId,
    metadata: { name: templateName },
  });
}

export async function auditScoringSettingsChanged(
  userId: UserId,
  oldSettings: any,
  newSettings: any
) {
  await auditService.log({
    userId,
    action: 'SCORING_SETTINGS_CHANGED',
    entityType: 'USER_SETTINGS',
    metadata: { oldSettings, newSettings },
  });
}

export async function auditMinimumDayActivated(
  userId: UserId,
  date: string,
  reason?: string
) {
  await auditService.log({
    userId,
    action: 'MINIMUM_DAY_ACTIVATED',
    entityType: 'DAILY_SCORE',
    entityId: date,
    metadata: { date, reason },
  });
}

export async function auditRestDayActivated(
  userId: UserId,
  date: string,
  reason?: string
) {
  await auditService.log({
    userId,
    action: 'REST_DAY_ACTIVATED',
    entityType: 'DAILY_SCORE',
    entityId: date,
    metadata: { date, reason },
  });
}

export async function auditDataExported(
  userId: UserId,
  format: string,
  fileSize: number
) {
  await auditService.log({
    userId,
    action: 'DATA_EXPORTED',
    metadata: { format, fileSize },
  });
}

export async function auditDataImported(
  userId: UserId,
  recordsImported: number
) {
  await auditService.log({
    userId,
    action: 'DATA_IMPORTED',
    metadata: { recordsImported },
  });
}

export async function auditAccountDeleted(
  userId: UserId,
  reason?: string
) {
  await auditService.log({
    userId,
    action: 'ACCOUNT_DELETED',
    metadata: { reason },
  });
}