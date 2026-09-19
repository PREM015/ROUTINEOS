/**
 * Database backup and restore utilities.
 *
 * `createDatabaseBackup` snapshots the core tables (bounded, at most
 * `SNAPSHOT_LIMIT` rows per table) into a single JSON blob. `restoreFromBackup`
 * replays that blob best-effort in FK-safe creation order. Rich libs such as
 * `pg_dump` are out of scope; this is a portable JSON snapshot suitable for
 * small/medium datasets and dev seeding.
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import prisma from '@/lib/prisma';

/** Maximum rows snapshotted/restored per table. */
export const SNAPSHOT_LIMIT = 10_000;

/** Tables included in a backup snapshot. */
export const SNAPSHOT_TABLES = [
  'user',
  'userSettings',
  'category',
  'tag',
  'quote',
  'routineTemplate',
  'routineBlock',
  'project',
  'goal',
  'milestone',
  'goalProgress',
  'task',
  'habit',
  'habitLog',
  'sleepLog',
  'moodLog',
  'energyLog',
  'dailyScore',
  'dailyReflection',
  'journalEntry',
  'focusSession',
  'streak',
  'weeklyReview',
  'aIInsight',
  'notificationLog',
  'attachment',
  'template',
  'dataExport',
  'integration',
  'deviceSession',
] as const;

type SnapshotTable = (typeof SNAPSHOT_TABLES)[number];

/** Parent-first creation order used during restore. */
const RESTORE_ORDER: readonly SnapshotTable[] = [
  'user',
  'userSettings',
  'streak',
  'category',
  'tag',
  'quote',
  'routineTemplate',
  'routineBlock',
  'project',
  'goal',
  'milestone',
  'goalProgress',
  'task',
  'habit',
  'habitLog',
  'sleepLog',
  'moodLog',
  'energyLog',
  'dailyScore',
  'dailyReflection',
  'journalEntry',
  'focusSession',
  'weeklyReview',
  'aIInsight',
  'notificationLog',
  'attachment',
  'template',
  'dataExport',
  'integration',
  'deviceSession',
];

interface FindManyDelegate {
  findMany(args: { take: number }): Promise<readonly Record<string, unknown>[]>;
}

interface CreateManyDelegate {
  createMany(args: {
    data: readonly Record<string, unknown>[];
    skipDuplicates?: boolean;
  }): Promise<{ count: number }>;
}

function delegateFor<T>(table: SnapshotTable): {
  delegate: T | undefined;
} {
  const all = prisma as unknown as Record<string, unknown>;
  return { delegate: all[table] as T | undefined };
}

/**
 * Serializable backup document.
 */
export interface DatabaseBackup {
  version: 1;
  createdAt: string;
  counts: Record<string, number>;
  tables: Record<string, readonly Record<string, unknown>[]>;
}

export interface BackupResult {
  blob: string;
  sizeBytes: number;
  createdAt: string;
  counts: Record<string, number>;
}

/**
 * Snapshot the core tables into a portable JSON blob.
 */
export async function createDatabaseBackup(): Promise<BackupResult> {
  const rowsByTable = await Promise.all(
    SNAPSHOT_TABLES.map(async (table) => {
      const { delegate } = delegateFor<FindManyDelegate>(table);
      if (!delegate) {
        return [table, [] as readonly Record<string, unknown>[]] as const;
      }
      const rows = await delegate.findMany({ take: SNAPSHOT_LIMIT });
      return [table, rows] as const;
    })
  );

  const tables: Record<string, readonly Record<string, unknown>[]> = {};
  const counts: Record<string, number> = {};
  for (const [table, rows] of rowsByTable) {
    tables[table] = rows;
    counts[table] = rows.length;
  }

  const backup: DatabaseBackup = {
    version: 1,
    createdAt: new Date().toISOString(),
    counts,
    tables,
  };

  const blob = JSON.stringify(backup);
  return {
    blob,
    sizeBytes: Buffer.byteLength(blob, 'utf8'),
    createdAt: backup.createdAt,
    counts,
  };
}

/**
 * Replay a backup blob into the database.
 *
 * Best-effort: rows are created parent-first with `skipDuplicates` and each
 * table is isolated so a single failing table does not abort the rest. Tables
 * not present in the blob are ignored. No destructive deletion is performed.
 */
export async function restoreFromBackup(blob: string): Promise<{
  restored: Record<string, number>;
  failed: Record<string, string>;
}> {
  let backup: DatabaseBackup;
  try {
    const parsed = JSON.parse(blob) as Partial<DatabaseBackup>;
    if (!parsed.tables || typeof parsed.tables !== 'object') {
      throw new Error('Backup blob has no `tables` payload.');
    }
    backup = parsed as DatabaseBackup;
  } catch (error) {
    throw new Error(
      `Invalid backup blob: ${
        error instanceof Error ? error.message : 'unparseable JSON'
      }`
    );
  }

  const restored: Record<string, number> = {};
  const failed: Record<string, string> = {};

  for (const table of RESTORE_ORDER) {
    const rows = backup.tables[table];
    if (!rows || rows.length === 0) continue;

    const { delegate } = delegateFor<CreateManyDelegate>(table);
    if (!delegate || typeof delegate.createMany !== 'function') {
      failed[table] = 'delegate unavailable';
      continue;
    }

    try {
      const result = await delegate.createMany({
        data: rows,
        skipDuplicates: true,
      });
      restored[table] = result.count;
    } catch (error) {
      failed[table] =
        error instanceof Error ? error.message : 'unknown error';
    }
  }

  return { restored, failed };
}

/** Metadata entry returned by `listBackups`. */
export interface BackupFileInfo {
  name: string;
  path: string;
  sizeBytes: number;
  createdAt: string;
}

/** Resolve the backup directory (`BACKUP_DIR` env override). */
function backupDirectory(directory?: string): string {
  return directory ?? process.env.BACKUP_DIR ?? 'backups';
}

/**
 * Write the backup blob to disk under the backup directory and return its path.
 */
export async function writeBackupFile(
  result: Pick<BackupResult, 'blob' | 'createdAt'>
): Promise<string> {
  const dir = backupDirectory();
  await fs.mkdir(dir, { recursive: true });
  const fileName = `backup-${result.createdAt.replace(/[:.]/g, '-')}.json`;
  const filePath = path.join(dir, fileName);
  await fs.writeFile(filePath, result.blob, 'utf8');
  return filePath;
}

/**
 * List existing backup files, newest first.
 */
export async function listBackups(directory?: string): Promise<BackupFileInfo[]> {
  const dir = backupDirectory(directory);
  let entries;
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch {
    return [];
  }

  const files = entries
    .filter((entry) => entry.isFile() && entry.name.endsWith('.json'))
    .map((entry) => path.join(dir, entry.name));

  const infos = await Promise.all(
    files.map(async (filePath) => {
      const stat = await fs.stat(filePath);
      return {
        name: path.basename(filePath),
        path: filePath,
        sizeBytes: stat.size,
        createdAt: new Date(stat.mtime).toISOString(),
      };
    })
  );

  return infos.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

/**
 * Delete the oldest backups beyond `keep`, newest-first retention. Returns the
 * number of files removed.
 */
export async function cleanupOldBackups(
  keep: number,
  directory?: string
): Promise<number> {
  const backups = await listBackups(directory);
  const toDelete = backups.slice(Math.max(0, keep));

  let removed = 0;
  for (const backup of toDelete) {
    try {
      await fs.unlink(backup.path);
      removed += 1;
    } catch {
      // Ignore races with concurrent cleanup.
    }
  }
  return removed;
}