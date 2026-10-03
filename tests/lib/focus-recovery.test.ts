import { describe, expect, it } from 'vitest';

import {
  RECOVERY_DEFAULTS,
  applyRecoveryChoice,
  decideRecovery,
  evidenceMs,
  type RecoveryInput,
} from '@/lib/focus/recovery';

/**
 * Every row of the recovery matrix, pinned.
 *
 * The asymmetry these tests exist to protect: **auto-completing invents work the
 * user may not have done, auto-aborting destroys work they did.** So the default
 * is always the smaller claim, and the larger claim is always something the user
 * has to choose. If a change here ever makes the system more generous by default,
 * these tests should fail.
 */

const HOUR = 60 * 60 * 1000;
const T0 = new Date('2026-03-10T09:00:00.000Z').getTime();
const PLANNED = 25 * 60 * 1000;

function base(overrides: Partial<RecoveryInput> = {}): RecoveryInput {
  return {
    startedAt: T0,
    pausedAt: null,
    pausedTotalMs: 0,
    plannedMs: PLANNED,
    lastHeartbeatAt: null,
    ...overrides,
  };
}

describe('decideRecovery — still running', () => {
  it('leaves a live session alone', () => {
    expect(decideRecovery(base(), T0 + 60_000).kind).toBe('keep-running');
  });

  it('leaves a session alone before its deadline even with no heartbeat', () => {
    // Nothing has gone wrong; asking the user about a running session would be
    // noise.
    expect(decideRecovery(base(), T0 + PLANNED - 1000).kind).toBe('keep-running');
  });
});

describe('decideRecovery — countdown ran out', () => {
  const afterDeadline = T0 + PLANNED + 60_000;

  it('auto-completes at full credit when heartbeats continued to the deadline', () => {
    const decision = decideRecovery(base({ lastHeartbeatAt: T0 + PLANNED }), afterDeadline);
    expect(decision.kind).toBe('auto-complete');
    if (decision.kind !== 'auto-complete') return;
    expect(decision.endReason).toBe('COMPLETED');
    expect(decision.actualMs).toBe(PLANNED);
  });

  it('stamps the deadline, not the reopen time', () => {
    // A tab closed for six hours still finished its 25 minutes at T+25m. Stamping
    // `completedAt` with the reopen time would put the session on the wrong day in
    // every per-day bucket.
    const decision = decideRecovery(
      base({ lastHeartbeatAt: T0 + PLANNED }),
      afterDeadline + 6 * HOUR
    );
    expect(decision.kind).toBe('auto-complete');
    if (decision.kind !== 'auto-complete') return;
    expect(decision.completedAt).toBe(T0 + PLANNED);
  });

  it('asks rather than assuming, when heartbeats stopped before the deadline', () => {
    const decision = decideRecovery(base({ lastHeartbeatAt: T0 + 5 * 60_000 }), afterDeadline);
    expect(decision.kind).toBe('ask');
    if (decision.kind !== 'ask') return;
    expect(decision.reason).toBe('deadline-passed-no-heartbeat');
  });

  it('never recommends the full credit', () => {
    // "I was watching" is not evidence "I did the work".
    const decision = decideRecovery(base({ lastHeartbeatAt: T0 + 5 * 60_000 }), afterDeadline);
    if (decision.kind !== 'ask') throw new Error('expected ask');
    expect(decision.recommended).toBe('credit-evidence');
    expect(decision.options).toContain('credit-full');
  });

  it('offers no full credit when there is no heartbeat at all', () => {
    // A stopwatch has no deadline, so "credit the full timebox" is meaningless.
    const decision = decideRecovery(base(), afterDeadline);
    if (decision.kind !== 'ask') throw new Error('expected ask');
    expect(decision.options).not.toContain('credit-full');
    expect(decision.reason).toBe('no-heartbeat');
  });

  it('credits only up to the last heartbeat', () => {
    const input = base({ lastHeartbeatAt: T0 + 5 * 60_000 });
    // Never past what the evidence supports.
    expect(evidenceMs(input, afterDeadline)).toBe(5 * 60_000);
  });

  it('tolerates a heartbeat that is merely jittery', () => {
    // A heartbeat a few seconds stale is normal; treating it as absence would make
    // every laptop that briefly slept lose a full session.
    const stale = T0 + PLANNED - 1000;
    const decision = decideRecovery(
      base({ lastHeartbeatAt: stale }),
      T0 + PLANNED + 60_000
    );
    expect(decision.kind).toBe('auto-complete');
  });
});

describe('decideRecovery — paused', () => {
  it('leaves a recent pause alone', () => {
    const decision = decideRecovery(
      base({ pausedAt: T0 + 60_000 }),
      T0 + 61_000
    );
    expect(decision.kind).toBe('still-paused');
  });

  it('asks after a long pause', () => {
    const pausedAt = T0 + 60_000;
    const decision = decideRecovery(
      base({ pausedAt }),
      pausedAt + RECOVERY_DEFAULTS.stalePausedMs + HOUR
    );
    expect(decision.kind).toBe('ask');
    if (decision.kind !== 'ask') return;
    expect(decision.reason).toBe('long-pause');
  });

  it('auto-abandons a pause longer than a full day', () => {
    const pausedAt = T0 + 60_000;
    const decision = decideRecovery(
      base({ pausedAt }),
      pausedAt + RECOVERY_DEFAULTS.autoAbandonMs + HOUR
    );
    expect(decision.kind).toBe('auto-abandon');
  });

  it('does not credit paused time as focus time', () => {
    const pausedAt = T0 + 10 * 60_000;
    const decision = decideRecovery(
      base({ pausedAt, lastHeartbeatAt: pausedAt }),
      pausedAt + RECOVERY_DEFAULTS.autoAbandonMs + HOUR
    );
    if (decision.kind !== 'auto-abandon') throw new Error('expected auto-abandon');
    // Ten minutes of work, not ten minutes plus however long the pause ran.
    expect(decision.actualMs).toBe(10 * 60_000);
  });
});

describe('decideRecovery — abandoned', () => {
  it('auto-abandons a session older than the abandonment bound', () => {
    const decision = decideRecovery(
      base({ lastHeartbeatAt: T0 + 30 * 60_000 }),
      T0 + RECOVERY_DEFAULTS.autoAbandonMs + HOUR
    );
    expect(decision.kind).toBe('auto-abandon');
    if (decision.kind !== 'auto-abandon') return;
    expect(decision.endReason).toBe('AUTO_STALE');
    expect(decision.source).toBe('RECOVERED');
  });

  it('checks abandonment before the deadline', () => {
    // A 30-hour-old row has certainly passed its deadline, and asking the user
    // about it would be worse than writing it off.
    const decision = decideRecovery(
      base({ lastHeartbeatAt: T0 + 30 * HOUR }),
      T0 + RECOVERY_DEFAULTS.autoAbandonMs + HOUR
    );
    expect(decision.kind).toBe('auto-abandon');
  });

  it('caps an abandoned stopwatch', () => {
    // `plannedMs: 0` is the open-ended sentinel. A stopwatch left running for a
    // weekend is a forgotten tab, not a 48-hour session.
    const decision = decideRecovery(
      base({ plannedMs: 0, lastHeartbeatAt: T0 + HOUR }),
      T0 + 48 * HOUR
    );
    expect(decision.kind).toBe('auto-abandon');
    if (decision.kind !== 'auto-abandon') return;
    expect(decision.actualMs).toBeLessThanOrEqual(12 * HOUR);
  });

  it('keeps a genuinely running stopwatch alive', () => {
    const decision = decideRecovery(
      base({ plannedMs: 0, lastHeartbeatAt: T0 }),
      T0 + 2 * HOUR
    );
    expect(decision.kind).toBe('keep-running');
  });
});

describe('applyRecoveryChoice', () => {
  const afterDeadline = T0 + PLANNED + 60_000;

  it('deletes on discard rather than aborting', () => {
    // A session the user rejects outright should not sit in their history as a row
    // they have to keep explaining.
    expect(applyRecoveryChoice('discard', base(), afterDeadline).action).toBe('delete');
  });

  it('credits the evidence, not the deadline, on the conservative choice', () => {
    const input = base({ lastHeartbeatAt: T0 + 5 * 60_000 });
    const applied = applyRecoveryChoice('credit-evidence', input, afterDeadline);
    if (applied.action !== 'complete') throw new Error('expected complete');
    expect(applied.actualMs).toBe(5 * 60_000);
  });

  it('credits the full timebox only when the user says so', () => {
    const applied = applyRecoveryChoice('credit-full', base(), afterDeadline);
    if (applied.action !== 'complete') throw new Error('expected complete');
    expect(applied.actualMs).toBe(PLANNED);
  });

  it('marks a recovered session RECOVERED, not TIMER', () => {
    // Recovery is the one place where "the timer ran out" is not evidence that
    // "the work happened", so the provenance must remain visible.
    const applied = applyRecoveryChoice('credit-evidence', base(), afterDeadline);
    if (applied.action !== 'complete') throw new Error('expected complete');
    expect(applied.source).toBe('RECOVERED');
    expect(applied.endReason).toBe('COMPLETED');
  });

  it('stamps the end at the credited instant, never at the reopen time', () => {
    const input = base({ lastHeartbeatAt: T0 + 5 * 60_000 });
    const applied = applyRecoveryChoice('credit-evidence', input, afterDeadline + 10 * HOUR);
    if (applied.action !== 'complete') throw new Error('expected complete');
    expect(applied.completedAt).toBeLessThan(afterDeadline + 10 * HOUR);
  });

  it('makes every choice but discard a completed session', () => {
    // The user's word is what makes work completed.
    for (const choice of ['credit-evidence', 'credit-full'] as const) {
      const applied = applyRecoveryChoice(choice, base(), afterDeadline);
      if (applied.action !== 'complete') throw new Error('expected complete');
      expect(applied.endReason).toBe('COMPLETED');
    }
  });
});

describe('evidenceMs', () => {
  it('never exceeds the timebox', () => {
    const input = base({ lastHeartbeatAt: T0 + PLANNED });
    expect(evidenceMs(input, T0 + PLANNED * 3)).toBeLessThanOrEqual(PLANNED);
  });

  it('never counts paused time, and never exceeds the timebox', () => {
    // 25 minutes of box, 30 minutes of pause, heartbeat an hour in. The deadline
    // moved to T+55m, but you cannot have done more work than the box allows, so
    // the ceiling is 25 minutes — not the 30 of wall-clock-minus-pause.
    const input = base({ pausedTotalMs: 30 * 60_000, lastHeartbeatAt: T0 + HOUR });
    expect(evidenceMs(input, T0 + HOUR)).toBe(PLANNED);
  });

  it('is zero with no evidence at all', () => {
    // `noHeartbeatPolicy` is 'conservative', and conservative means zero. An
    // earlier version credited the full timebox here while the constant guarding
    // it was named and documented as conservative.
    expect(evidenceMs(base(), T0 + PLANNED * 2)).toBe(0);
  });

  it('is zero with no evidence and no deadline', () => {
    expect(evidenceMs(base({ plannedMs: 0 }), T0 + HOUR)).toBe(0);
  });
});
