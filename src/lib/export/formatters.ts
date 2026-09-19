/**
 * Export formatting utilities: JSON and CSV serialization of user data.
 *
 * Consumes the payload produced by `@/server/data/exporter` (loosely typed)
 * and any `{ version, data }` wrapper emitted by `@/lib/export/generator`.
 * All CSV writers are dependency-free and escape cells defensively.
 */

/** Loose JSON-safe record used across export payloads. */
export type JsonRecord = Record<string, unknown>;

export interface ExportBundle {
  version: string;
  exportedAt: string;
  data: JsonRecord;
}

/** Pretty-print any JSON-safe value. */
export function toJSON(value: JsonRecord): string {
  return JSON.stringify(value, null, 2);
}

/** Pretty-print an `ExportBundle` wrapper. */
export function bundleToJSON(bundle: ExportBundle): string {
  return JSON.stringify(bundle, null, 2);
}

/** Format a JSON export payload as a data URI for safe client-side download. */
export function toDataUri(json: string, mime = 'application/json'): string {
  return `data:${mime};charset=utf-8,${encodeURIComponent(json)}`;
}

/**
 * Export a collection as CSV. `columns` is the row-in-window cell extractor;
 * keys become the header row.
 */
export function toCSV(
  rows: readonly JsonRecord[],
  columns: Record<string, (row: unknown) => unknown> = {}
): string {
  const keys = Object.keys(columns);
  const header = keys.map(escapeCsv).join(',');
  const body = rows.map((row) => {
    const values = keys.map((key) => {
      try {
        return escapeCsv(cellToString(columns[key]?.(row)));
      } catch {
        return '""';
      }
    });
    return values.join(',');
  });
  return [header, ...body].join('\n');
}

function cellToString(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

/** Escape a single CSV cell (quotes/commas/newlines). */
export function escapeCsv(value: string): string {
  if (/[",\r\n]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

/**
 * Format habit rows (array of objects) as CSV with a fixed, conventional
 * column set. Missing fields are left blank rather than failing.
 */
export function formatHabitsAsCSV(habits: readonly unknown[]): string {
  const columns: Record<string, (row: unknown) => unknown> = {
    name: (row) => valueOf(row, 'name'),
    tier: (row) => valueOf(row, 'tier'),
    status: (row) => valueOf(row, 'status'),
    frequency: (row) => valueOf(row, 'frequencyType'),
    streak: (row) => valueOf(row, 'streakCount'),
    completionRate: (row) => valueOf(row, 'completionRate'),
    createdAt: (row) => valueOf(row, 'createdAt'),
  };
  return toCSV(habits as readonly JsonRecord[], columns);
}

function valueOf(row: unknown, key: string): unknown {
  if (row !== null && typeof row === 'object') {
    const record = row as JsonRecord;
    return record[key];
  }
  return undefined;
}

/**
 * Format goal rows as CSV (title, status, priority, target vs current, dates).
 */
export function formatGoalsAsCSV(goals: readonly unknown[]): string {
  const columns: Record<string, (row: unknown) => unknown> = {
    title: (row) => valueOf(row, 'title'),
    status: (row) => valueOf(row, 'status'),
    priority: (row) => valueOf(row, 'priority'),
    currentValue: (row) => valueOf(row, 'currentValue'),
    targetValue: (row) => valueOf(row, 'targetValue'),
    unit: (row) => valueOf(row, 'unit'),
    startDate: (row) => valueOf(row, 'startDate'),
    endDate: (row) => valueOf(row, 'endDate'),
    completedAt: (row) => valueOf(row, 'completedAt'),
  };
  return toCSV(goals as readonly JsonRecord[], columns);
}

/**
 * Format activity log rows as CSV. The ActivityLog model has no `type` column;
 * `action` carries the semantic type.
 */
export function formatActivitiesAsCSV(activities: readonly unknown[]): string {
  const columns: Record<string, (row: unknown) => unknown> = {
    timestamp: (row) => valueOf(row, 'timestamp'),
    action: (row) => valueOf(row, 'action'),
    description: (row) => valueOf(row, 'description'),
    entityType: (row) => valueOf(row, 'entityType'),
    metadata: (row) => valueOf(row, 'metadata'),
  };
  return toCSV(activities as readonly JsonRecord[], columns);
}