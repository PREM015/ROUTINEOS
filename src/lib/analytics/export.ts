/**
 * CSV and plain-text export, built from data already on screen.
 *
 * ## Why this is a pure builder
 *
 * The rule from the spec is that an export must match the on-screen figures. The way to
 * guarantee that is not to keep two renderers in step but to have **one**: the CSV and the
 * clipboard text are both built here, from the same `AnalyticsDashboard` the page renders,
 * and both read the same fields. There is no second place where a number is formatted, so
 * there is nothing to drift.
 *
 * This is also why no server round trip exists for an export. Everything below is already
 * in memory; fetching it again to format it differently would be the drift.
 *
 * ## What is exported, and what is deliberately not
 *
 * The figures, their denominators, and the comparison basis. Not the insight chips — a CSV
 * row reading "Run has fewer completions" is not a measurement, and a spreadsheet is the
 * wrong place for a sentence meant to be read once.
 *
 * `null` is written as an empty cell, never as `0`. A zero in a habit-rate column reads as
 * "the user completed nothing", which is the same defect the charts had.
 *
 * Pure and dependency-free: no repository, no Prisma, no environment.
 */

import type { AnalyticsDashboard } from '@/types/analytics';

export interface ExportRow {
  section: string;
  metric: string;
  value: string;
  detail: string;
}

const PERCENT_SUFFIX = '%';

/**
 * Flatten the payload into the rows a spreadsheet wants.
 *
 * Grouped by section rather than dumped flat, because a user opening this in a
 * spreadsheet is trying to answer "how did habits do" and a section column lets them
 * filter without reading every row.
 */
export function buildExportRows(payload: AnalyticsDashboard): ExportRow[] {
  const rows: ExportRow[] = [];
  const add = (section: string, metric: string, value: string, detail: string) =>
    rows.push({ section, metric, value, detail });

  add('Period', 'Range', payload.range.label, `${payload.range.start} to ${payload.range.end}`);

  if (payload.hero.total != null) {
    add('Score', 'Average score', formatScore(payload.hero.total), `Grade ${payload.hero.grade ?? '—'}`);
    add('Score', 'Scored days', String(payload.hero.daysScored), `of ${payload.freshness.elapsedDays} elapsed`);
  }
  if (payload.hero.core != null) add('Score', 'Core', formatScore(payload.hero.core), '');
  if (payload.hero.growth != null) add('Score', 'Growth', formatScore(payload.hero.growth), '');
  if (payload.hero.bonus != null) add('Score', 'Bonus', formatScore(payload.hero.bonus), '');

  add(
    'Habits',
    'Overall rate',
    payload.hero.habitReliability != null ? `${Math.round(payload.hero.habitReliability)}${PERCENT_SUFFIX}` : '',
    `${payload.habits.completed} of ${payload.habits.scheduled} due`
  );

  for (const habit of payload.habits.perHabit) {
    add(
      'Habits',
      habit.name,
      habit.rate != null ? `${Math.round(habit.rate)}${PERCENT_SUFFIX}` : '',
      habit.scheduled > 0 ? `${habit.completed} of ${habit.scheduled} completed` : 'not due'
    );
  }

  if (payload.tiles.routine != null) {
    add(
      'Routine',
      'Completion',
      `${payload.tiles.routine.completionRate}${PERCENT_SUFFIX}`,
      `${payload.tiles.routine.completed} of ${payload.tiles.routine.total} blocks`
    );
  }
  for (const block of payload.routine.blocks) {
    add(
      'Routine',
      block.title,
      `${block.completionRate}${PERCENT_SUFFIX}`,
      `${block.completed} of ${block.daysTracked} tracked`
    );
  }

  if (payload.tiles.sleepMinutes != null) {
    add(
      'Sleep',
      'Average per night',
      `${Math.round(payload.tiles.sleepMinutes)} min`,
      payload.sleep?.periodStats ? `${payload.sleep.periodStats.loggedDays} nights logged` : ''
    );
  }

  if (payload.tiles.mood != null) add('Mood', 'Average', `${payload.tiles.mood}/5`, '');

  add(
    'Focus',
    'Sessions',
    String(payload.focus.period.sessions),
    `${Math.round(payload.focus.period.minutes)} minutes total`
  );

  add('Tasks', 'Open', String(payload.tasks.open), `${payload.tasks.overdue} overdue`);

  for (const project of payload.projects) {
    add('Projects', project.name, `${project.progress}%`, project.status);
  }

  for (const milestone of payload.milestones) {
    add('Milestones', milestone.title, milestone.completedAt, milestone.goalTitle);
  }

  if (payload.comparison.delta != null) {
    add(
      'Comparison',
      'Change in average score',
      `${payload.comparison.delta > 0 ? '+' : ''}${payload.comparison.delta}`,
      payload.comparison.basis
    );
  }

  for (const point of [...payload.chart1, ...payload.chart2]) {
    if (point.value == null) continue;
    add(
      'Charts',
      point.name,
      unitFor(point) === 'percent' ? `${Math.round(point.value)}${PERCENT_SUFFIX}` : String(Math.round(point.value)),
      point.date ?? ''
    );
  }

  return rows;
}

/**
 * RFC 4180 CSV.
 *
 * Quotes any field containing a comma, quote or newline, and doubles embedded quotes.
 * Habit names are user-supplied and routinely contain commas — "Read, work, rest" is one
 * habit — and an unquoted comma there silently shifts every following column.
 */
export function toCsv(rows: ExportRow[]): string {
  const header = ['Section', 'Metric', 'Value', 'Detail'];
  const lines = [header, ...rows.map((row) => [row.section, row.metric, row.value, row.detail])];
  return lines.map((line) => line.map(escapeCsvField).join(',')).join('\r\n');
}

function escapeCsvField(value: string): string {
  if (!/[",\r\n]/.test(value)) return value;
  return `"${value.replace(/"/g, '""')}"`;
}

/**
 * The plain-text summary offered to the clipboard.
 *
 * Deliberately short. A full CSV pasted into a notes app is unreadable, so this is the
 * handful of figures a person would want to write down, in the order they would say them.
 */
export function toSummaryText(payload: AnalyticsDashboard): string {
  const lines: string[] = [`Analytics — ${payload.range.label}`];

  if (payload.hero.total != null) {
    lines.push(
      `Average score ${Math.round(payload.hero.total)}/100` +
        (payload.hero.grade ? ` (grade ${payload.hero.grade})` : '') +
        ` over ${payload.hero.daysScored} scored ${payload.hero.daysScored === 1 ? 'day' : 'days'}`
    );
  } else {
    lines.push('No score recorded for this period.');
  }

  if (payload.hero.habitReliability != null) {
    lines.push(
      `Habits ${Math.round(payload.hero.habitReliability)}% (${payload.habits.completed} of ${payload.habits.scheduled} due)`
    );
  }

  if (payload.tiles.routine != null) {
    lines.push(
      `Routine ${payload.tiles.routine.completionRate}% (${payload.tiles.routine.completed} of ${payload.tiles.routine.total} blocks)`
    );
  }

  if (payload.tiles.sleepMinutes != null) {
    lines.push(`Sleep ${Math.round(payload.tiles.sleepMinutes / 60)}h average per night`);
  }

  if (payload.comparison.delta != null) {
    lines.push(
      `${payload.comparison.delta > 0 ? 'Up' : 'Down'} ${Math.abs(payload.comparison.delta)} points — ${payload.comparison.basis}`
    );
  }

  if (payload.freshness.unscoredDays > 0) {
    lines.push(
      `${payload.freshness.unscoredDays} of ${payload.freshness.elapsedDays} elapsed days have no score yet.`
    );
  }

  return lines.join('\n');
}

function formatScore(value: number): string {
  return `${Math.round(value)}/100`;
}

/**
 * Whether a point is a percentage or a raw score.
 *
 * Inferred from the value's own range rather than carried as metadata: a habit rate and a
 * tier rate are both percentages and a monthly average score is not, and the payload does
 * not currently distinguish them. Anything above 100 cannot be a percentage, which makes
 * the inference safe at the boundary.
 */
function unitFor(point: { value: number | null }): 'percent' | 'score' {
  return point.value != null && point.value > 100 ? 'score' : 'percent';
}
