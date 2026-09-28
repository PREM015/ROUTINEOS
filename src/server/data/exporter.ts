import { HabitRepository } from '@/server/repositories/habit.repository';
import { GoalRepository } from '@/server/repositories/goal.repository';
import { RoutineRepository } from '@/server/repositories/routine.repository';
import { ScoreRepository } from '@/server/repositories/score.repository';
import { SleepRepository } from '@/server/repositories/sleep.repository';
import { ReflectionRepository } from '@/server/repositories/reflection.repository';
import prisma from '@/lib/prisma';

/**
 * Data Exporter
 * Export all user data in portable format
 */

export async function exportUserData(
  userId: string,
  options?: {
    includeArchived?: boolean;
    startDate?: string;
    endDate?: string;
  },
) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      email: true,
      name: true,
      timezone: true,
      createdAt: true,
    },
  });

  if (!user) {
    throw new Error('User not found');
  }

  const habitRepository = new HabitRepository();
  const goalRepository = new GoalRepository();
  const routineRepository = new RoutineRepository();
  const scoreRepository = new ScoreRepository();
  const sleepRepository = new SleepRepository();
  const reflectionRepository = new ReflectionRepository();

  // Determine date range
  const endDate = options?.endDate ?? new Date().toISOString().slice(0, 10);
  const startDate =
    options?.startDate ??
    (() => {
      const d = new Date();
      d.setFullYear(d.getFullYear() - 1);
      return d.toISOString().slice(0, 10);
    })();

  const [habits, goals, templates, scores, sleepLogs, reflections, settings, categories, tags] =
    await Promise.all([
      habitRepository.findAll(userId, {
        includeArchived: options?.includeArchived,
      }),
      goalRepository.findAll(userId, {}),
      routineRepository.findAllTemplates(userId),
      scoreRepository.findByRange(userId, startDate, endDate),
      sleepRepository.findByRange(userId, startDate, endDate),
      reflectionRepository.findByRange(userId, startDate, endDate),
      prisma.userSettings.findUnique({ where: { userId } }),
      prisma.category.findMany({ where: { userId } }),
      prisma.tag.findMany({ where: { userId } }),
    ]);

  // Get habit logs for each habit
  const habitsWithLogs = await Promise.all(
    habits.map(async (habit) => {
      const logs = await habitRepository.findLogsByRange(habit.id, userId, startDate, endDate);
      return { ...habit, logs };
    }),
  );

  // Build export payload
  const exportData = {
    exportMetadata: {
      version: '1.0',
      exportedAt: new Date().toISOString(),
      exportedBy: user.email,
      dataRange: { startDate, endDate },
    },
    user: {
      email: user.email,
      name: user.name,
      timezone: user.timezone,
      accountCreated: user.createdAt,
    },
    settings,
    categories,
    tags,
    habits: habitsWithLogs,
    goals,
    routines: templates,
    scores,
    sleep: sleepLogs,
    reflections,
  };

  return exportData;
}

export type ExportData = Awaited<ReturnType<typeof exportUserData>>;

/**
 * Export to JSON file
 */
export function exportToJSON(data: any): string {
  return JSON.stringify(data, null, 2);
}

/**
 * Export to CSV (habits only for now)
 */
export function exportHabitsToCSV(habits: any[]): string {
  const headers = ['Name', 'Tier', 'Status', 'Frequency', 'Streak', 'Completion Rate'];
  const rows = habits.map((h) => [
    h.name,
    h.tier,
    h.status,
    h.frequencyType,
    h.streakCount,
    h.completionRate || 0,
  ]);

  return [headers.join(','), ...rows.map((row) => row.join(','))].join('\n');
}

/**
 * Export to a human-readable Markdown report.
 *
 * Unlike the JSON/CSV formatters this renders the whole payload as prose plus
 * tables, so it is the format to use when a person (rather than a restore job)
 * is going to read the output.
 */
export function exportToMarkdown(data: ExportData): string {
  const lines: string[] = [];

  lines.push('# RoutineOS data export', '');
  lines.push(`- Exported: ${data.exportMetadata.exportedAt}`);
  lines.push(`- Account: ${data.user.name ?? data.user.email}`);
  lines.push(`- Email: ${data.user.email}`);
  lines.push(`- Timezone: ${data.user.timezone}`);
  lines.push(
    `- Range: ${data.exportMetadata.dataRange.startDate} to ${data.exportMetadata.dataRange.endDate}`,
    '',
  );

  lines.push('## Summary', '');
  lines.push('| Metric | Value |', '| --- | --- |');
  lines.push(`| Habits | ${data.habits.length} |`);
  lines.push(`| Goals | ${data.goals.length} |`);
  lines.push(`| Routine templates | ${data.routines.length} |`);
  lines.push(`| Scored days | ${data.scores.length} |`);
  lines.push(`| Sleep logs | ${data.sleep.length} |`);
  lines.push(`| Reflections | ${data.reflections.length} |`);
  lines.push('');

  lines.push('## Habits', '');
  if (data.habits.length === 0) {
    lines.push('_No habits._', '');
  } else {
    lines.push('| Name | Tier | Status | Streak |', '| --- | --- | --- | --- |');
    for (const habit of data.habits) {
      lines.push(
        `| ${mdCell(habit.name)} | ${mdCell(habit.tier)} | ${mdCell(habit.status)} | ${habit.streakCount ?? 0} |`,
      );
    }
    lines.push('');
  }

  lines.push('## Goals', '');
  if (data.goals.length === 0) {
    lines.push('_No goals._', '');
  } else {
    lines.push('| Title | Type | Status | Progress |', '| --- | --- | --- | --- |');
    for (const goal of data.goals) {
      const progress =
        goal.targetValue != null && Number(goal.targetValue) !== 0
          ? `${Math.round((Number(goal.currentValue ?? 0) / Number(goal.targetValue)) * 100)}%`
          : '—';
      lines.push(
        `| ${mdCell(goal.title)} | ${mdCell(goal.type)} | ${mdCell(goal.status)} | ${progress} |`,
      );
    }
    lines.push('');
  }

  lines.push('## Routine templates', '');
  if (data.routines.length === 0) {
    lines.push('_No routine templates._', '');
  } else {
    for (const template of data.routines) {
      lines.push(`### ${mdCell(template.name)}`, '');
      const blocks = Array.isArray(template.blocks) ? template.blocks : [];
      if (blocks.length > 0) {
        lines.push('| Start | End | Title |', '| --- | --- | --- |');
        for (const block of blocks) {
          lines.push(
            `| ${mdCell(block.startTime)} | ${mdCell(block.endTime)} | ${mdCell(block.title)} |`,
          );
        }
        lines.push('');
      }
    }
  }

  lines.push('## Daily scores', '');
  if (data.scores.length === 0) {
    lines.push('_No scored days in range._', '');
  } else {
    lines.push(
      '| Date | Core | Growth | Bonus | Total | Grade |',
      '| --- | --- | --- | --- | --- | --- |',
    );
    for (const score of data.scores) {
      lines.push(
        `| ${mdCell(score.date)} | ${score.coreScore ?? '—'} | ${score.growthScore ?? '—'} | ${
          score.bonusScore ?? '—'
        } | ${score.totalScore ?? '—'} | ${mdCell(score.overallGrade)} |`,
      );
    }
    lines.push('');
  }

  lines.push('## Sleep logs', '');
  if (data.sleep.length === 0) {
    lines.push('_No sleep logs in range._', '');
  } else {
    lines.push(
      '| Date | Bedtime | Wake | Minutes | Quality | Rested |',
      '| --- | --- | --- | --- | --- | --- |',
    );
    for (const entry of data.sleep) {
      lines.push(
        `| ${mdCell(entry.date)} | ${mdCell(entry.actualBedtime)} | ${mdCell(entry.actualWakeTime)} | ${
          entry.actualDurationMinutes ?? '—'
        } | ${entry.quality ?? '—'} | ${
          entry.feltRested === null || entry.feltRested === undefined
            ? '—'
            : entry.feltRested
              ? 'yes'
              : 'no'
        } |`,
      );
    }
    lines.push('');
  }

  return lines.join('\n');
}

/** Escape a value so it cannot break out of a Markdown table cell. */
function mdCell(value: unknown): string {
  if (value === null || value === undefined) return '—';
  return String(value).replace(/\|/g, '\\|').replace(/\r?\n/g, ' ');
}
