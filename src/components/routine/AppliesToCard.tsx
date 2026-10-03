'use client';

import Link from 'next/link';
import { ArrowUpRight } from 'lucide-react';
import { formatDuration } from '@/lib/routine/duration';
import type { DayTypeDefinition } from '@/types/routine';

/**
 * What this day type actually governs.
 *
 * `_count` on a `DayTypeDefinition` already holds habits, goals, templates and
 * exceptions — the data existed and nothing read it. This is where it is used, so
 * creating a "College Day" no longer silently changes which habits and goals are
 * scored on a Tuesday, with no visible consequence until a score changed.
 *
 * The template's total duration is **computed** from its blocks, not read from
 * `RoutineTemplate.estimatedDuration`: that column exists, is nullable, and no
 * code path in the repository ever writes it, so it is permanently `null` and
 * "total duration: —" was the honest-but-useless rendering of it.
 */
export function AppliesToCard({
  definition,
  templateTotalMinutes,
  blockCount,
  bare,
}: {
  definition: DayTypeDefinition | null;
  templateTotalMinutes: number;
  blockCount: number;
  /**
   * Render the body only — no `<section>`, no heading. Used when this card is the
   * body of a `CollapsibleRailCard`, which supplies both, so a folded card does
   * not show two headings saying the same thing.
   */
  bare?: boolean;
}) {
  const body = !definition ? (
    <p className="text-sm text-muted-foreground">
      This date resolves to the natural weekday type, not one of your own.
    </p>
  ) : (
    <AppliesToCounts definition={definition} blockCount={blockCount} templateTotalMinutes={templateTotalMinutes} />
  );

  if (bare) return <>{body}</>;

  return (
    <section
      aria-label="What this day type applies to"
      className="glass-panel rounded-xl border border-border/60 p-5"
    >
      <h2 className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
        {definition ? `${definition.name} applies to` : 'Applies to'}
      </h2>
      {body}
    </section>
  );
}

function AppliesToCounts({
  definition,
  blockCount,
  templateTotalMinutes,
}: {
  definition: DayTypeDefinition;
  blockCount: number;
  templateTotalMinutes: number;
}) {
  const counts = definition._count;
  const habits = counts?.habitAssignments ?? 0;
  const goals = counts?.goalAssignments ?? 0;
  const templates = counts?.routineTemplates ?? 0;
  const exceptions = counts?.routineExceptions ?? 0;

  return (
    <>
      <ul className="mt-2 space-y-1 text-sm">
        <CountRow one="habit" many="habits" value={habits} href="/habits" />
        <CountRow one="goal" many="goals" value={goals} href="/goals" />
        <CountRow one="routine template" many="routine templates" value={templates} />
        <CountRow one="date override" many="date overrides" value={exceptions} />
      </ul>

      <p className="mt-3 border-t border-border/60 pt-3 text-xs text-muted-foreground">
        {blockCount === 0
          ? 'No blocks in this template yet.'
          : `${blockCount} block${blockCount === 1 ? '' : 's'} · ${formatDuration(
              templateTotalMinutes
            )} scheduled in total.`}
      </p>
    </>
  );
}

/**
 * The card's answer while folded.
 *
 * Kept in one place with the card so the folded row and the expanded card can
 * never disagree — two versions of "what does this preset touch" on one screen
 * is the same failure as two versions of a completion rate.
 */
export function appliesToSummary(
  definition: DayTypeDefinition | null,
  blockCount: number,
  totalMinutes: number
): string | null {
  if (!definition) return 'natural weekday type';
  const parts: string[] = [];
  const counts = definition._count;
  if ((counts?.habitAssignments ?? 0) > 0) parts.push(`${counts?.habitAssignments} habits`);
  if ((counts?.goalAssignments ?? 0) > 0) parts.push(`${counts?.goalAssignments} goals`);
  const reach = parts.length > 0 ? parts.join(' · ') : 'no habits or goals';
  if (blockCount === 0) return `${reach} · no blocks yet`;
  return `${reach} · ${formatDuration(totalMinutes)} scheduled`;
}

/**
 * A count with a correctly pluralised label.
 *
 * Both forms are passed explicitly. The previous version took one plural
 * `label` and appended `s` unless the value was 1, which produced "0 habitss"
 * and "1 habitss" — the card rendered four of those on every load.
 */
function CountRow({
  one,
  many,
  value,
  href,
}: {
  one: string;
  many: string;
  value: number;
  href?: string;
}) {
  const body = (
    <>
      <span className="font-mono text-sm font-semibold tabular-nums text-foreground">{value}</span>
      <span className="text-muted-foreground">{value === 1 ? one : many}</span>
      {href && (
        <ArrowUpRight
          size={12}
          className="ml-auto opacity-0 transition group-hover:opacity-100"
          aria-hidden="true"
        />
      )}
    </>
  );

  if (!href) {
    return <li className="flex items-baseline gap-1.5">{body}</li>;
  }

  return (
    <li>
      <Link
        href={href}
        className="group -mx-1 flex items-baseline gap-1.5 rounded px-1 py-0.5 transition hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        {body}
      </Link>
    </li>
  );
}