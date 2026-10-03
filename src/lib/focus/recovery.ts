/**
 * Focus recovery — the pure decision layer for interrupted sessions.
 *
 * The problem this exists to solve: a session's end is normally reported by the
 * browser. When the tab is closed, the laptop sleeps, the app is killed or the
 * network drops, no report ever arrives — and the row sits `active` forever. The
 * old code's answer was to ignore it, which produced two failure modes at once:
 * a session from yesterday simply *vanished* from the UI while still reading as
 * "running" to the database, and a genuine all-nighter counted as a full
 * timebox of focus.
 *
 * The rule here is that **absence of a completion signal is not evidence of
 * absence of a session.** Every read of the active session re-derives what must
 * have happened from timestamps, and the caller writes that conclusion. When the
 * evidence is ambiguous, the decision is not "pick the generous option" — it is
 * "surface it to the user, with the conservative choice already selected".
 *
 * That asymmetry is deliberate. Auto-**completing** a session invents work the
 * user may not have done, and it silently inflates statistics and can unlock
 * achievements. Auto-**aborting** one destroys work the user did do. So the
 * default is always the smaller claim, and the larger claim is always something
 * the user has to actively choose.
 *
 * Pure and clock-free (`now` is always a parameter) so every row of the recovery
 * matrix is unit-testable, including the ones impossible to reproduce by hand.
 */

import type { FocusSessionEndReason, FocusSessionSource } from '@/constants/prisma-enums';
import { settleSession, type SettleInput, type SettleAction } from '@/lib/focus/settle';

const MS_PER_MINUTE = 60_000;
const HOUR_MS = 60 * MS_PER_MINUTE;

/** Defaults, all overridable per the settings module. */
export const RECOVERY_DEFAULTS = {
  /**
   * A pause longer than this probably means the user walked away, so a session
   * frozen for four hours is not "waiting to be resumed", it is ambiguous.
   */
  stalePausedMs: 4 * HOUR_MS,
  /**
   * Beyond this a session is unambiguously abandoned and is settled without
   * asking. Chosen at 24h rather than 12h because the *stopwatch* cap is 12h —
   * a countdown should be allowed a full night of elapsed wall-clock time before
   * being written off, and 24h also means a user who starts a session before bed
   * and opens the app in the morning is asked rather than silently charged.
   */
  autoAbandonMs: 24 * HOUR_MS,
  /**
   * How stale the last heartbeat may be and still count as "the user was
   * present". Two minutes is comfortably longer than any plausible timer
   * interval (the client sends one a minute) while still being much shorter than
   * a work block, so a laptop sleep is detected within a single block.
   */
  heartbeatGraceMs: 2 * MS_PER_MINUTE,
  /**
   * Used when there is no heartbeat evidence at all (every session written before
   * heartbeats existed). Deliberately the conservative branch: one full-credit
   * session is a rounding error, and repeatedly crediting sessions the user
   * never ran is how a statistic stops meaning anything.
   */
  noHeartbeatPolicy: 'conservative' as const,
} as const;

export type RecoveryDecision =
  /** Nothing happened. Leave the row active. */
  | { kind: 'keep-running' }
  /** Paused and waiting. Not ambiguous, so not a decision. */
  | { kind: 'still-paused'; pausedMs: number }
  /**
   * The timebox ran out and the user was demonstrably present (heartbeats
   * continued to the deadline). Full credit, at the deadline — not at reopen
   * time, so the session lands on the correct day.
   */
  | { kind: 'auto-complete'; endReason: 'COMPLETED'; source: 'TIMER'; completedAt: number; actualMs: number }
  /**
   * Unambiguously abandoned. Settled without asking, credited only up to the last
   * evidence.
   */
  | {
      kind: 'auto-abandon';
      endReason: 'AUTO_STALE';
      source: 'RECOVERED';
      endedAt: number;
      actualMs: number;
    }
  /**
   * Genuinely ambiguous. The user decides, and the conservative option is what
   * `recommended` points at.
   */
  | {
      kind: 'ask';
      /** What the UI should pre-select. Always the smaller claim. */
      recommended: 'credit-evidence' | 'credit-full' | 'discard';
      /** Never selectable automatically — it is the user's call to claim more. */
      options: readonly ('credit-evidence' | 'credit-full' | 'discard')[];
      /** Active time the evidence supports, in ms. */
      evidenceMs: number;
      /** The full timebox, in ms. `0` for a stopwatch, which has no full credit. */
      fullMs: number;
      /** Why the row is ambiguous, for the copy in the recovery sheet. */
      reason: 'deadline-passed-no-heartbeat' | 'long-pause' | 'no-heartbeat';
    };

export interface RecoveryInput extends SettleInput {
  /** When the client last proved the session was being watched. */
  lastHeartbeatAt: number | null;
  /** `0` for a stopwatch — open-ended, so "the full timebox" is meaningless. */
  plannedMs: number;
}

/**
 * True when the user was demonstrably present right up to the deadline.
 *
 * Heartbeats continue to `deadline + grace` if the tab was alive; if the last
 * one landed at least `grace` before the deadline, the tab was probably gone.
 * The grace period exists because a heartbeat can be a few seconds stale simply
 * from normal jitter, and treating that as absence would make every laptop that
 * briefly slept lose a full session.
 */
function wasPresentAtDeadline(input: RecoveryInput, deadline: number): boolean {
  if (input.lastHeartbeatAt === null) return false;
  return input.lastHeartbeatAt >= deadline - RECOVERY_DEFAULTS.heartbeatGraceMs;
}

/**
 * Active time up to the last evidence — never beyond.
 *
 * "Evidence" is the later of the deadline and the last heartbeat. Crediting up to
 * the deadline when the user demonstrably left before it would invent work;
 * crediting up to the heartbeat when heartbeats ran to the deadline would throw
 * away work they did.
 */
export function evidenceMs(input: RecoveryInput, now: number): number {
  const settled = settleSession(input, now);
  if (settled.action === 'paused') return settled.elapsedMs;

  const deadline = input.startedAt + input.plannedMs + input.pausedTotalMs;
  const hasDeadline = input.plannedMs > 0;

  if (input.lastHeartbeatAt === null) {
    // No heartbeat ever recorded. `noHeartbeatPolicy` decides whether that means
    // "trust the deadline" or "trust nothing beyond the start".
    if (hasDeadline && RECOVERY_DEFAULTS.noHeartbeatPolicy === 'conservative') {
      return Math.max(0, Math.min(now, deadline) - input.startedAt - input.pausedTotalMs);
    }
    return 0;
  }

  const boundary = hasDeadline ? Math.min(input.lastHeartbeatAt, deadline) : input.lastHeartbeatAt;
  return Math.max(0, boundary - input.startedAt - input.pausedTotalMs);
}

/**
 * Decide what to do with an active session that has not been touched.
 *
 * Order matters and is deliberate:
 *
 *   1. Paused        → not a decision. The user put it there on purpose.
 *   2. Auto-abandon  → beyond `autoAbandonMs`. Checked before the deadline test
 *                      because a session that ran for 30 hours has certainly
 *                      passed its deadline, and "ask the user" about a 30-hour-old
 *                      row is worse than writing it off.
 *   3. Deadline gone → the interesting case. Full credit if they were present,
 *                      otherwise ask.
 *   4. Otherwise     → still running, nothing to do.
 */
export function decideRecovery(input: RecoveryInput, now: number): RecoveryDecision {
  const settled = settleSession(input, now);

  // 1 — paused on purpose.
  if (settled.action === 'paused') {
    // `settleSession` only reports `paused` when it saw a finite `pausedAt`, so the
    // fallback is unreachable rather than merely defensive — but it keeps the
    // arithmetic total instead of relying on that invariant holding.
    const pausedSince = input.pausedAt ?? now;
    const pausedMs = Math.max(0, now - pausedSince);
    if (pausedMs > RECOVERY_DEFAULTS.autoAbandonMs) {
      return {
        kind: 'auto-abandon',
        endReason: 'AUTO_STALE',
        source: 'RECOVERED',
        endedAt: pausedSince,
        actualMs: settled.elapsedMs,
      };
    }
    if (pausedMs > RECOVERY_DEFAULTS.stalePausedMs) {
      return {
        kind: 'ask',
        recommended: 'credit-evidence',
        options: ['credit-evidence', 'discard'],
        evidenceMs: settled.elapsedMs,
        fullMs: settled.elapsedMs,
        reason: 'long-pause',
      };
    }
    return { kind: 'still-paused', pausedMs };
  }

  // A stopwatch with no deadline, abandoned.
  if (settled.action === 'abort') {
    return {
      kind: 'auto-abandon',
      endReason: 'AUTO_STALE',
      source: 'RECOVERED',
      endedAt: settled.endedAt,
      actualMs: settled.elapsedMs,
    };
  }

  const wallClockMs = now - input.startedAt;

  // 2 — unambiguously abandoned.
  if (wallClockMs > RECOVERY_DEFAULTS.autoAbandonMs) {
    const credit = evidenceMs(input, now);
    return {
      kind: 'auto-abandon',
      endReason: 'AUTO_STALE',
      source: 'RECOVERED',
      endedAt: now,
      actualMs: credit,
    };
  }

  // 3 — the timebox ran out.
  if (settled.action === 'complete') {
    const deadline = settled.endedAt;

    if (wasPresentAtDeadline(input, deadline)) {
      return {
        kind: 'auto-complete',
        endReason: 'COMPLETED',
        source: 'TIMER',
        completedAt: deadline,
        actualMs: input.plannedMs,
      };
    }

    const credit = evidenceMs(input, now);
    const hasHeartbeat = input.lastHeartbeatAt !== null;

    return {
      kind: 'ask',
      // Heartbeats stopped early, so credit what they proved. Offering
      // `credit-full` is fine — it is the user's call — but it is never the
      // default, and it is not offered at all when there is nothing to suggest
      // (a stopwatch, where "full" is undefined).
      recommended: 'credit-evidence',
      options: hasHeartbeat
        ? ['credit-evidence', 'credit-full', 'discard']
        : ['credit-evidence', 'discard'],
      evidenceMs: credit,
      fullMs: input.plannedMs,
      reason: hasHeartbeat ? 'deadline-passed-no-heartbeat' : 'no-heartbeat',
    };
  }

  // 4 — nothing has happened yet.
  return { kind: 'keep-running' };
}

/** Map a settle action onto the end reason it implies, for the settle-only path. */
export function endReasonForAction(action: SettleAction): FocusSessionEndReason | null {
  switch (action) {
    case 'complete':
      return 'COMPLETED';
    case 'abort':
      return 'AUTO_STALE';
    default:
      return null;
  }
}

/** Source implied by a recovery decision. */
export function sourceForDecision(decision: RecoveryDecision): FocusSessionSource {
  return decision.kind === 'auto-abandon' ? 'RECOVERED' : 'TIMER';
}

/**
 * Apply a recovery choice.
 *
 * `credit-evidence` and `credit-full` both produce a COMPLETED session — the user
 * saying "yes I did that work" is what makes it completed, not the fact that the
 * deadline passed. `discard` deletes rather than aborts, because a session the
 * user rejects outright should not sit in their history as a row they have to
 * keep explaining.
 */
export function applyRecoveryChoice(
  choice: 'credit-evidence' | 'credit-full' | 'discard',
  input: RecoveryInput,
  now: number
):
  | { action: 'delete' }
  | {
      action: 'complete';
      endReason: Extract<FocusSessionEndReason, 'COMPLETED'>;
      source: FocusSessionSource;
      completedAt: number;
      actualMs: number;
    } {
  if (choice === 'discard') return { action: 'delete' };

  const actualMs = choice === 'credit-full' ? input.plannedMs : evidenceMs(input, now);
  // The end instant is the evidence boundary for a partial credit, and the
  // deadline for a full one — never `now`, which would misattribute the session
  // to whatever day the user happened to reopen the app on.
  const completedAt =
    choice === 'credit-full'
      ? input.startedAt + input.plannedMs + input.pausedTotalMs
      : input.startedAt + actualMs + input.pausedTotalMs;

  return {
    action: 'complete',
    endReason: 'COMPLETED',
    source: 'RECOVERED',
    completedAt,
    actualMs,
  };
}
