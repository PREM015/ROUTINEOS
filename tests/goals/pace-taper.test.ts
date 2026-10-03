import { describe, expect, it } from 'vitest';
import {
  paceSeverity,
  wedgeOpacity,
  PACE_COLOR,
  PACE_TEXT,
  PACE_WASH,
} from '@/constants/goals';
import { paceBandFor, type PaceState } from '@/lib/goals/goal-metrics';

/**
 * The pace taper and token map.
 *
 * Two things are under test, and both are easy to get subtly wrong:
 *
 * 1. **The taper.** `paceSeverity` is what makes a 6-point slip look different
 *    from a 60-point one. If it is unbounded, every badly-late goal saturates to
 *    the same colour and the distinction is lost — which is the same failure as a
 *    flat alarm fill, just softer.
 * 2. **The token map.** Every pace state must resolve to a real colour in both
 *    `PACE_COLOR` (the marker) and `PACE_WASH` (the wedge). A missing key is
 *    `undefined` at runtime, which paints nothing and leaves a card silently
 *    uncoloured — and since colour is the primary signal here, that is a
 *    correctness bug, not a cosmetic one.
 */

const ALL_STATES: PaceState[] = [
  'ahead',
  'on_pace',
  'behind',
  'overdue',
  'done',
  'inactive',
];

describe('pace token maps', () => {
  it('cover every pace state exactly once', () => {
    expect(new Set(ALL_STATES).size).toBe(ALL_STATES.length);
    for (const state of ALL_STATES) {
      expect(PACE_COLOR[state], `PACE_COLOR.${state}`).toBeTruthy();
      expect(PACE_WASH[state], `PACE_WASH.${state}`).toBeTruthy();
      expect(PACE_TEXT[state], `PACE_TEXT.${state}`).toBeTruthy();
    }
  });

  it('use distinct colours per state, so two states never render identically', () => {
    const colors = ALL_STATES.map((s) => PACE_COLOR[s]);
    expect(new Set(colors).size).toBe(colors.length);
  });

  it('reads as CSS custom properties, not hex, so both themes stay correct', () => {
    // Hardcoding a hex here would make dark mode an inversion by accident.
    for (const state of ALL_STATES) {
      expect(PACE_COLOR[state]).toMatch(/^var\(--pace-/);
      expect(PACE_WASH[state]).toMatch(/^var\(--pace-.*-wash\)$/);
    }
  });
});

describe('paceSeverity', () => {
  it('is zero exactly at the band edge, so on-pace never tints', () => {
    expect(paceSeverity('on_pace', 0)).toBe(0);
    expect(paceSeverity('on_pace', 0.04)).toBe(0);
    // The band edge itself is still `on_pace`, so it must not start ramping.
    expect(paceSeverity('on_pace', 0.05)).toBe(0);
  });

  it('ramps up as a goal falls further behind', () => {
    const slight = paceSeverity('behind', -0.1);
    const moderate = paceSeverity('behind', -0.3);
    const severe = paceSeverity('behind', -0.5);
    expect(slight).toBeGreaterThan(0);
    expect(moderate).toBeGreaterThan(slight);
    expect(severe).toBeGreaterThan(moderate);
  });

  it('saturates rather than running away on an absurd deficit', () => {
    // gapPoints is unbounded. Without a cap, a goal 5x over its window would be
    // off the end of the scale and indistinguishable from one 2x over.
    expect(paceSeverity('behind', -0.5)).toBe(1);
    expect(paceSeverity('behind', -5)).toBe(1);
    expect(paceSeverity('behind', -500)).toBe(1);
  });

  it('never goes negative at the band edge', () => {
    // -0.05 is the edge; the subtraction is `-gapPoints - 0.05`, so a value just
    // inside the band would otherwise go slightly negative.
    expect(paceSeverity('behind', -0.05)).toBe(0);
    expect(paceSeverity('behind', -0.04)).toBe(0);
  });

  it('stays calm when ahead — being ahead is not a party', () => {
    // Capped at 0.4 even for an enormous lead, so an ahead goal never out-shouts
    // a behind one on the page.
    expect(paceSeverity('ahead', 0.1)).toBeGreaterThan(0);
    expect(paceSeverity('ahead', 1)).toBe(0.4);
    expect(paceSeverity('ahead', 100)).toBe(0.4);
  });

  it('rates overdue above a live deficit, because a closed window is a harder fact', () => {
    expect(paceSeverity('overdue', -0.01)).toBe(1);
    expect(paceSeverity('behind', -0.5)).toBeLessThanOrEqual(1);
  });

  it('is flat for done and inactive', () => {
    expect(paceSeverity('done', 1)).toBe(1);
    expect(paceSeverity('inactive', 0)).toBe(0);
  });

  it('agrees with paceBandFor about which states are untroubled', () => {
    // The taper and the banding must not disagree, or a card can be "on pace"
    // and tinted amber at the same time.
    for (const gap of [-0.9, -0.3, -0.06, -0.05, 0, 0.05, 0.06, 0.3, 0.9]) {
      const state = paceBandFor(gap);
      if (state === 'on_pace') {
        expect(paceSeverity(state, gap)).toBe(0);
      }
    }
  });
});

describe('wedgeOpacity', () => {
  it('stays within the CSS-usable range for every state and gap', () => {
    for (const state of ALL_STATES) {
      for (const gap of [-5, -0.5, -0.06, 0, 0.06, 0.5, 5]) {
        const opacity = wedgeOpacity(state, gap);
        expect(opacity).toBeGreaterThan(0);
        expect(opacity).toBeLessThanOrEqual(1);
      }
    }
  });

  it('gives an on-pace goal the faintest wedge', () => {
    expect(wedgeOpacity('on_pace', 0)).toBe(0.35);
  });

  it('never fully hides the wedge, because a 0-opacity band is a silent band', () => {
    expect(wedgeOpacity('on_pace', 0)).toBeGreaterThan(0);
    expect(wedgeOpacity('inactive', 0)).toBeGreaterThan(0);
  });

  it('darkens monotonically as a goal falls further behind', () => {
    const values = [-0.1, -0.2, -0.3, -0.4, -0.5].map((gap) =>
      wedgeOpacity('behind', gap)
    );
    for (let i = 1; i < values.length; i += 1) {
      expect(values[i]!).toBeGreaterThan(values[i - 1]!);
    }
  });
});