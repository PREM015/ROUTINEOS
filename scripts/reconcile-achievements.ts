/**
 * Reconcile `Achievement.definitionId`.
 *
 * Run this **before** pushing the `@@unique([userId, definitionId])` index, and
 * again afterwards to pick up rows created while the column was still nullable.
 *
 *   npx tsx scripts/reconcile-achievements.ts            # dry run, prints a plan
 *   npx tsx scripts/reconcile-achievements.ts --apply    # performs the writes
 *
 * ## Why it exists
 *
 * `Achievement` had no uniqueness constraint at all, and unlock checks are
 * triggered from several client workflows, so a user could hold two rows for the
 * same catalogue badge. The index that prevents that cannot be created while the
 * duplicates exist, so they have to be merged first — and the merge has to be
 * deterministic, because these rows are the user's history.
 *
 * ## What it preserves
 *
 * For each duplicate group the **earliest** `unlockedAt` row survives: that is
 * when the user actually earned the badge, and it is the date the history and
 * the celebration recency window are computed from. The survivor then absorbs
 * `celebrated` from the group (if any copy was seen, the badge counts as seen),
 * keeps the richest `metadata` blob, and is backfilled with its `definitionId`.
 * The remaining rows are deleted.
 *
 * Rows with no catalogue id (custom achievements) are left completely alone.
 */

import { config as loadEnv } from 'dotenv';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@/generated/prisma';

loadEnv({ path: '.env.local', quiet: true });
loadEnv({ path: '.env', quiet: true });

const connectionString = process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error('DATABASE_URL is not set. Add it to your environment before running this script.');
}

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });

interface Row {
  id: string;
  userId: string;
  title: string;
  metadata: string | null;
  definitionId: string | null;
  unlockedAt: Date;
  celebrated: boolean;
  isPublic: boolean;
  icon: string | null;
  color: string | null;
  description: string | null;
  level: number;
}

/** `definitionId` from the column, else from the legacy `metadata` blob. */
function resolveDefinitionId(row: Pick<Row, 'definitionId' | 'metadata'>): string | null {
  if (row.definitionId) return row.definitionId;
  if (!row.metadata) return null;
  try {
    const parsed: unknown = JSON.parse(row.metadata);
    if (typeof parsed !== 'object' || parsed === null) return null;
    const id = (parsed as { definitionId?: unknown }).definitionId;
    return typeof id === 'string' && id.length > 0 ? id : null;
  } catch {
    return null;
  }
}

/** The blob carrying the most information wins; ties keep the survivor's. */
function richerMetadata(survivor: Row, others: Row[]): string | null {
  let best = survivor.metadata;
  let bestLength = best?.length ?? 0;
  for (const row of others) {
    const length = row.metadata?.length ?? 0;
    if (length > bestLength) {
      best = row.metadata;
      bestLength = length;
    }
  }
  return best;
}

async function main(): Promise<void> {
  const apply = process.argv.includes('--apply');

  const rows = await prisma.achievement.findMany({
    orderBy: [{ userId: 'asc' }, { unlockedAt: 'asc' }, { id: 'asc' }],
  });

  const groups = new Map<string, Row[]>();
  let unclassified = 0;

  for (const row of rows) {
    const definitionId = resolveDefinitionId(row);
    if (!definitionId) {
      unclassified += 1;
      continue;
    }
    const key = `${row.userId}.${definitionId}`;
    const group = groups.get(key);
    if (group) group.push(row);
    else groups.set(key, [row]);
  }

  const duplicates = [...groups.values()].filter((group) => group.length > 1);
  const backfills = [...groups.values()].filter(
    (group) => group[0]?.definitionId === null
  );

  console.log(`Achievements scanned:            ${rows.length}`);
  console.log(`Custom / unclassified (skipped): ${unclassified}`);
  console.log(`Definition groups:               ${groups.size}`);
  console.log(`definitionId backfills needed:   ${backfills.length}`);
  console.log(`Duplicate groups to merge:       ${duplicates.length}`);
  console.log(`Rows that would be deleted:      ${duplicates.reduce((n, g) => n + g.length - 1, 0)}`);

  for (const group of duplicates) {
    const survivor = group[0]!;
    console.log(
      `  - ${survivor.userId} / ${resolveDefinitionId(survivor)}: ` +
        `${group.length} rows, keeping ${survivor.id} (${survivor.unlockedAt.toISOString()})`
    );
  }

  if (!apply) {
    console.log('\nDry run. Re-run with --apply to write.');
    return;
  }

  for (const group of groups.values()) {
    const survivor = group[0]!;
    const definitionId = resolveDefinitionId(survivor);
    if (!definitionId) continue;
    const others = group.slice(1);

    await prisma.achievement.update({
      where: { id: survivor.id },
      data: {
        definitionId,
        celebrated: group.some((row) => row.celebrated),
        isPublic: group.some((row) => row.isPublic),
        metadata: richerMetadata(survivor, others),
        icon: survivor.icon ?? others.find((row) => row.icon)?.icon ?? null,
        color: survivor.color ?? others.find((row) => row.color)?.color ?? null,
      },
    });

    if (others.length > 0) {
      await prisma.achievement.deleteMany({
        where: { id: { in: others.map((row) => row.id) } },
      });
    }
  }

  console.log(`\nReconciled ${groups.size} definition groups.`);
}

main()
  .catch((error) => {
    console.error('Reconciliation failed:', error);
    process.exitCode = 1;
  })
  .finally(() => {
    void prisma.$disconnect();
  });
