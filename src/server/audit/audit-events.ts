import { auditService } from './audit.service';
import type { AuditAction } from '@prisma/client';

/**
 * Audit Event Helpers
 * Convenience functions for common audit events
 */

export async function auditHabitCreated(
  userId: string,
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
  userId: string,
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
  userId: string,
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
  userId: string,
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
  userId: string,
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
  userId: string,
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
  userId: string,
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
  userId: string,
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
  userId: string,
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
  userId: string,
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
  userId: string,
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
  userId: string,
  recordsImported: number
) {
  await auditService.log({
    userId,
    action: 'DATA_IMPORTED',
    metadata: { recordsImported },
  });
}

export async function auditAccountDeleted(
  userId: string,
  reason?: string
) {
  await auditService.log({
    userId,
    action: 'ACCOUNT_DELETED',
    metadata: { reason },
  });
}