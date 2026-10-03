import { describe, expect, it } from 'vitest';
import {
  cellBoxShadow,
  cellEdge,
  cellFill,
  describeCell,
  monthCaption,
  CELL_EDGE,
  CELL_FLOOR,
  HABIT_RAMP,
  REST_CELL_EDGE,
  REST_CELL_FILL,
  UNKNOWN_HATCH,
} from '@/lib/habits/contribution-visual';
import type { ContributionCell, ContributionLevel, ContributionState } from '@/lib/habits/contributions';

/**
 * The visual contract.
 *
 * The thing worth protecting here is not the colours - it is that the three
 * meanings of "no green" stay three. A GitHub clone has one empty cell; for
 * habits that collapses three different facts into one grey square, and 300 of
 * those squares is a year of quietly wrong information.
 */

function cell(overrides: Partial<ContributionCell> = {}): ContributionCell {
  return {
    date: '2026-03-04',
    scheduled: 3,
    completed: 0,
    missed: 0,
    skipped: 0,
    rate: 0,
    level: 0,
    state: 'NO_RECORD',
    completedHabitIds: [],
    missedHabitIds: [],
    ...overrides,
  };
}

describe('the five shades', () => {
  it('defines exactly four greens, and no colour for level 0', () => {
    // Level 0 carrying a green is the single failure this scale must not have.
    expect(Object.keys(HABIT_RAMP).sort()).toEqual(['1', '2', '3', '4']);
    for (const fill of Object.values(HABIT_RAMP)) {
      expect(fill).toContain('linear-gradient');
    }
  });
});

describe('cellFill', () => {
  it('uses a green for every level above zero', () => {
    for (const level of [1, 2, 3, 4] as const) {
      expect(cellFill(cell({ level, state: 'PARTIAL' }))).toBe(HABIT_RAMP[level]);
    }
  });

  it('gives NO_RECORD a hatch, not a green', () => {
    // "We do not know whether this was done" must not look like activity.
    expect(cellFill(cell({ level: 0, state: 'NO_RECORD' }))).toBe(UNKNOWN_HATCH);
  });

  it('gives LOGGED_MISS and UNSCHEDULED the same fill, told apart by the CSS rim', () => {
    // Deliberate: the two are distinguished by the `[data-miss]` rim declared in
    // globals.css, not by a fill, so "nothing due" never reads as faintly green.
    expect(cellFill(cell({ level: 0, state: 'LOGGED_MISS' }))).toBe(
      cellFill(cell({ level: 0, state: 'UNSCHEDULED' }))
    );
  });
});

describe('every rendered cell has visual weight', () => {
  /*
    Regression tests for a real bug: in dark mode `--muted` and `--border` are BOTH
    `#27272a`, which is within a couple of percent of the card background. A cell
    filled with `--muted` and outlined with `--border` was therefore invisible -
    the whole grid read as having holes in it, and users reported the day blocks
    as "hidden".

    Nothing asserted that a rendered cell carried any visual weight at all, which
    is why it shipped. These tests are that assertion.
  */

  it('does not build the floor or the edge from --muted or --border', () => {
    // Both tokens collide with the surface in dark mode.
    expect(CELL_FLOOR).not.toContain('var(--muted)');
    expect(CELL_FLOOR).not.toContain('var(--border)');
    expect(CELL_EDGE).not.toContain('var(--muted)');
    expect(CELL_EDGE).not.toContain('var(--border)');
    // A mid-tone at low alpha is off the background in either theme.
    expect(CELL_FLOOR).toContain('var(--muted-foreground)');
    expect(CELL_EDGE).toContain('var(--muted-foreground)');
  });

  it('gives a day with no cell a visible body rather than nothing', () => {
    // Outside the clipped window, or a day the month does not have.
    expect(REST_CELL_FILL).not.toBe('');
    expect(REST_CELL_EDGE).not.toBe('');
    expect(REST_CELL_FILL).toContain('color-mix');
  });

  it('returns a non-empty fill for every state', () => {
    const states: ContributionState[] = [
      'UNSCHEDULED',
      'NO_RECORD',
      'LOGGED_MISS',
      'PARTIAL',
      'FULL',
    ];
    for (const state of states) {
      const fill = cellFill(cell({ state, level: state === 'FULL' ? 4 : 2 }));
      expect(fill.length).toBeGreaterThan(0);
      expect(fill).not.toBe('none');
      expect(fill).not.toBe('transparent');
    }
  });

  it('returns a non-empty edge for every state', () => {
    const states: ContributionState[] = [
      'UNSCHEDULED',
      'NO_RECORD',
      'LOGGED_MISS',
      'PARTIAL',
      'FULL',
    ];
    for (const state of states) {
      expect(cellEdge(cell({ state, level: state === 'FULL' ? 4 : 2 })).length).toBeGreaterThan(0);
    }
  });

  it('keeps the floor desaturated so active greens stay dominant', () => {
    /*
      The floor must not carry a hue, or an inactive cell competes with an active
      one and the greens stop being the thing the eye lands on.

      This used to assert the literal `16 185 129` (emerald-500). That was pinning
      an implementation detail rather than the rule: the ramp now reads
      `var(--heat-green)`, which resolves to emerald-600 in light mode and
      emerald-400 in dark, so that one literal can no longer appear. What the test
      is actually for is "the floor is grey, the four ramp levels are green" — and
      that is asserted in a way that survives the theme tokens being retuned.
    */
    expect(CELL_FLOOR).not.toContain('--heat-green');
    expect(CELL_FLOOR).not.toContain('16 185 129');
    for (const level of [1, 2, 3, 4] as const) {
      expect(HABIT_RAMP[level]).toContain('--heat-green');
    }
  });

  it('routes every ramp entry through the theme tokens so both themes can differ', () => {
    /*
      This is the assertion that makes "glows green in light AND dark" a checked
      property rather than a hope. If a literal emerald ever comes back into
      HABIT_RAMP it would silently pin both themes to one green again, and white
      would go back to washing out at low alpha.
    */
    for (const level of [1, 2, 3, 4] as const) {
      // No hard-coded green channels anywhere in the ramp.
      expect(HABIT_RAMP[level]).not.toMatch(/rgb\(\s*\d+\s+\d+\s+\d+/);
      // Level 4 is the only band allowed the brighter "hi" token.
      if (level === 4) expect(HABIT_RAMP[level]).toContain('--heat-green-hi');
      else expect(HABIT_RAMP[level]).not.toContain('--heat-green-hi');
    }
  });

  it('gives every completed day a halo and no uncompleted day one', () => {
    const active = cell({ state: 'PARTIAL', scheduled: 3, completed: 1, level: 1 });
    for (let level = 1 as ContributionLevel; level <= 4; level = (level + 1) as ContributionLevel) {
      const shadow = cellBoxShadow(cell({ level, state: 'FULL' }), false);
      expect(shadow).toContain('var(--heat-glow)');
    }
    // Level 0: nothing green, whatever the state.
    for (const state of ['NO_RECORD', 'LOGGED_MISS', 'UNSCHEDULED'] as ContributionState[]) {
      expect(cellBoxShadow(cell({ level: 0, state }), false)).not.toContain('var(--heat-glow)');
    }
    expect(active.level).toBe(1);
  });

  it('layers today ring, halo, miss rim and hairline with today winning', () => {
    const todayComplete = cellBoxShadow(cell({ level: 2, state: 'FULL' }), true);
    const todayIndex = todayComplete.indexOf('var(--primary)');
    const glowIndex = todayComplete.indexOf('var(--heat-glow)');

    expect(todayIndex).toBeGreaterThanOrEqual(0);
    expect(glowIndex).toBeGreaterThanOrEqual(0);

    /*
      First shadow in a `box-shadow` list paints on top. So today must come first,
      the halo second, and the structural hairline LAST — otherwise the hairline
      sits on top of the halo and the glow stops reading.
    */
    expect(todayIndex).toBeLessThan(glowIndex);
    expect(glowIndex).toBeLessThan(todayComplete.lastIndexOf('inset 0 0 0 1px'));
  });

  it('keeps the miss rim under the halo but above the hairline', () => {
    const missed = cellBoxShadow(cell({ level: 0, state: 'LOGGED_MISS' }), false);
    expect(missed).toContain('var(--destructive)');
    // `lastIndexOf`, not `indexOf`: the rim is itself an `inset 0 0 0 1px`, so the
    // first match is the rim's prefix and not the hairline at all.
    const rimIndex = missed.indexOf('var(--destructive)');
    const hairlineIndex = missed.lastIndexOf('inset 0 0 0 1px');
    expect(rimIndex).toBeGreaterThanOrEqual(0);
    expect(hairlineIndex).toBeGreaterThan(rimIndex);
  });

  it('always ends every cell with the structural hairline', () => {
    /*
      A miss cell legitimately carries TWO inset layers (rim, then hairline), so the
      check is that the value ENDS with the muted hairline — not that there is
      exactly one inset. Losing it would erase the grid's structure on that cell.

      Matched against the whole string rather than by splitting on `', '`, because
      the layers themselves contain commas: `color-mix(in srgb, ...)` would be torn
      in half by that split.
    */
    const cases: ContributionState[] = ['FULL', 'PARTIAL', 'NO_RECORD', 'LOGGED_MISS', 'UNSCHEDULED'];
    for (const state of cases) {
      for (const level of [0, 1, 2, 3, 4] as ContributionLevel[]) {
        for (const isToday of [false, true]) {
          const shadow = cellBoxShadow(cell({ level, state }), isToday);
          expect(shadow).toMatch(
            /inset 0 0 0 1px color-mix\(in srgb, var\(--muted-foreground\)[^)]*\)$/
          );
        }
      }
    }
  });
});

describe('describeCell', () => {
  it('never uses the same sentence for two different states', () => {
    /*
      Each state gets a *realistic* cell, not the same `completed: 0` default.
      Forcing one cell across all five states would make FULL and PARTIAL produce
      the same sentence by accident and the assertion would pass for the wrong
      reason.
    */
    const cases: { state: ContributionState; cell: ContributionCell }[] = [
      { state: 'UNSCHEDULED', cell: cell({ state: 'UNSCHEDULED', scheduled: 0, rate: null }) },
      { state: 'NO_RECORD', cell: cell({ state: 'NO_RECORD', scheduled: 3, completed: 0 }) },
      { state: 'LOGGED_MISS', cell: cell({ state: 'LOGGED_MISS', scheduled: 3, completed: 0, missed: 3 }) },
      { state: 'PARTIAL', cell: cell({ state: 'PARTIAL', scheduled: 3, completed: 2, rate: 67 }) },
      { state: 'FULL', cell: cell({ state: 'FULL', scheduled: 3, completed: 3, level: 4, rate: 100 }) },
    ];

    const sentences = cases.map((c) => describeCell(c.cell));
    expect(new Set(sentences).size).toBe(5);
    expect(sentences).toHaveLength(5);
  });

  it('says "nothing recorded" for an unknown day, not "missed"', () => {
    // The distinction is the whole point: the database cannot tell "did not do
    // it" from "never opened the app".
    expect(describeCell(cell({ state: 'NO_RECORD' }))).toContain('nothing recorded');
    expect(describeCell(cell({ state: 'NO_RECORD' }))).not.toContain('missed');
  });

  it('never implies a rest day was missed', () => {
    const rest = cell({ state: 'UNSCHEDULED', scheduled: 0, rate: null, completed: 0 });
    expect(describeCell(rest)).toBe('Rest day, no habits scheduled');
    expect(describeCell(rest)).not.toContain('missed');
  });

  it('reports the completed / scheduled pair', () => {
    expect(
      describeCell(cell({ state: 'PARTIAL', completed: 2, scheduled: 4, rate: 50 }))
    ).toBe('2 of 4 completed, 50% complete');
  });
});

describe('monthCaption', () => {
  it('uses the wording the brief asked for', () => {
    expect(monthCaption({ label: 'January', activeDays: 23, days: 31, futureDays: 0 })).toBe(
      '23 active days'
    );
  });

  it('singularises a one-day month', () => {
    expect(monthCaption({ label: 'January', activeDays: 1, days: 31, futureDays: 0 })).toBe(
      '1 active day'
    );
  });

  it('does not claim a month the user has not reached is empty', () => {
    expect(monthCaption({ label: 'March', activeDays: 0, days: 0, futureDays: 1 })).toBe('Not yet');
  });
});
