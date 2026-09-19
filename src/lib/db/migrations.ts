/**
 * Informational migration helpers.
 *
 * These functions never execute migrations or spawn child processes. They only
 * report the presence/state of `prisma/migrations` so callers can decide
 * whether to run `npm run db:migrate:deploy`. This keeps library code free of
 * implicit side effects.
 */

import fs from 'node:fs';
import path from 'node:path';

/** Where Prisma expects its migration folder (relative to the project root). */
export const MIGRATIONS_RELATIVE_PATH = 'prisma/migrations';

export interface MigrationStatus {
  /** Absolute (or relative) path inspected for migrations. */
  migrationsDir: string;
  /** Whether the migrations folder exists. */
  exists: boolean;
  /** List of migration folders present (nearest to source of truth). */
  migrations: string[];
  /** Deployable = a package.json `db:migrate:deploy` script exists. */
  deployScriptAvailable: boolean;
}

/**
 * Inspect the migration folder and report its state. Never throws.
 */
export function getMigrationStatus(): MigrationStatus {
  const migrationsDir = path.resolve(
    process.cwd(),
    MIGRATIONS_RELATIVE_PATH
  );

  try {
    const exists = fs.existsSync(migrationsDir) && fs.statSync(migrationsDir).isDirectory();
    const migrations = exists
      ? fs
          .readdirSync(migrationsDir, { withFileTypes: true })
          .filter((entry) => entry.isDirectory())
          .map((entry) => entry.name)
          .sort()
      : [];

    return {
      migrationsDir,
      exists,
      migrations,
      deployScriptAvailable: hasDeployScript(),
    };
  } catch {
    return {
      migrationsDir,
      exists: false,
      migrations: [],
      deployScriptAvailable: hasDeployScript(),
    };
  }
}

function hasDeployScript(): boolean {
  try {
    const raw = fs.readFileSync(path.resolve(process.cwd(), 'package.json'), 'utf8');
    const pkg = JSON.parse(raw) as { scripts?: Record<string, string> };
    return typeof pkg.scripts?.['db:migrate:deploy'] === 'string';
  } catch {
    return false;
  }
}

/**
 * Number of pending migrations. Informational only – without executing
 * anything, this returns `0` when no migrations directory can be inspected.
 */
export function pendingMigrations(): number {
  return getMigrationStatus().migrations.length;
}

export interface MigrationRunResult {
  ok: boolean;
  message: string;
  status: MigrationStatus;
}

/**
 * Informational "run" marker. This module deliberately does NOT execute
 * migrations (no child processes, no raw commands); it returns a status object
 * and instructs the caller to use the package script when migrations exist.
 */
export function runMigrations(): MigrationRunResult {
  const status = getMigrationStatus();
  if (!status.exists || status.migrations.length === 0) {
    return {
      ok: true,
      message:
        'No migrations folder found; the schema is applied via `prisma db push` or a fresh setup.',
      status,
    };
  }
  if (!status.deployScriptAvailable) {
    return {
      ok: true,
      message:
        'Migration deploy should be triggered externally (`prisma migrate deploy`).',
      status,
    };
  }
  return {
    ok: true,
    message:
      'Migrations detected – run `npm run db:migrate:deploy` to apply them (not executed from library code).',
    status,
  };
}