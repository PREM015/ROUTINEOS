import { describe, expect, it } from 'vitest';
import { HEAT_EDGE, HEAT_FILL, HEAT_GLOW, heatBoxShadow, heatLevel } from '@/components/dashboard-ui/tokens';

/*
  The dashboard Consistency card.

  "Glow green when the user works on any day" is the contract, in both themes.
  These tests exist because it was previously false and failed silently: the
  level-1 threshold sat at `>= 25`, so any score of 1-24 was painted with the
  LEVEL 0 wash — the exact same pixels as a day with no score at all.
*/
describe('heatLevel — any day worked must not look like a day with no data', () => {
  it('returns 0 only for no stored score and for an exact zero', () => {
    expect(heatLevel(null)).toBe(0);
    expect(heatLevel(0)).toBe(0);
  });

  it('gives every score above zero at least level 1', () => {
    // 1 is the regression: one habit out of twelve scores around 8.
    for (const score of [1, 2, 5, 8, 12, 19, 24, 25, 49, 50, 74, 75, 89, 90, 100]) {
      expect(heatLevel(score)).toBeGreaterThanOrEqual(1);
    }
  });

  it('never returns a level outside 0-4', () => {
    for (const score of [-1, 0, 1, 49, 50, 100, 101, 1000]) {
      const level = heatLevel(score);
      expect(level).toBeGreaterThanOrEqual(0);
      expect(level).toBeLessThanOrEqual(4);
    }
  });

  it('keeps the top of the ramp unchanged', () => {
    expect(heatLevel(90)).toBe(4);
    expect(heatLevel(100)).toBe(4);
    expect(heatLevel(75)).toBe(3);
    expect(heatLevel(50)).toBe(2);
  });

  it('separates "worked a little" from "did nothing" in both directions', () => {
    // The whole bug in two assertions: a light day and an empty day must differ.
    expect(heatLevel(3)).not.toBe(heatLevel(0));
    expect(heatLevel(3)).not.toBe(heatLevel(null));
    // And a null must not be silently reported as a measured zero.
    expect(heatLevel(null)).not.toBe(heatLevel(0) + 1000);
  });
});

describe('HEAT_FILL — the ramp is green, and the theme decides which green', () => {
  it('keeps level 0 free of green so an inactive day never reads as activity', () => {
    expect(HEAT_FILL[0]).not.toContain('--heat-green');
    expect(HEAT_FILL[0]).not.toContain('--heat-glow');
    for (let level = 1; level <= 4; level += 1) {
      expect(HEAT_FILL[level]).toContain('--heat-green');
    }
  });

  it('routes every ramp entry through the theme tokens, not a literal emerald', () => {
    for (let level = 1; level <= 4; level += 1) {
      // A hard-coded `rgb(16 185 129)` would pin light and dark to one green,
      // which is the bug this replaced.
      expect(HEAT_FILL[level]).not.toMatch(/rgb\(\s*\d+\s+\d+\s+\d+/);
      expect(HEAT_FILL[level]).toMatch(/var\(--heat-green\)/);
    }
  });

  it('gives only level 4 the brighter "hi" token', () => {
    expect(HEAT_FILL[4]).toContain('--heat-green-hi');
    for (let level = 1; level <= 3; level += 1) {
      expect(HEAT_FILL[level]).not.toContain('--heat-green-hi');
    }
  });

  it('rises in opacity as the level climbs, so intensity is readable', () => {
    /*
      The PEAK alpha of each entry, not the first. Level 4 leads with the brighter
      `--heat-green-hi` token, so reading "the first `--heat-green` alpha" would
      compare level 3's 0.76 against level 4's *trailing* 0.70 and report the ramp
      as going backwards.
    */
    const peakAlpha = (fill: string): number => {
      const matches = [...fill.matchAll(/--(?:heat-green|heat-green-hi)\)(?: \/ ([\d.]+))?/g)]
        .map((m) => (m[1] ? Number(m[1]) : 1));
      expect(matches.length).toBeGreaterThan(0);
      return Math.max(...matches);
    };
    for (let level = 1; level < 4; level += 1) {
      expect(peakAlpha(HEAT_FILL[level + 1]!)).toBeGreaterThan(peakAlpha(HEAT_FILL[level]!));
    }
  });

  it('keeps level 0 visible rather than invisible on either theme', () => {
    // Regression guard for the documented failure: a floor derived from the same
    // token as the surface made every inactive cell a hole in the dark grid.
    expect(HEAT_FILL[0]).toContain('--muted-foreground');
    expect(HEAT_FILL[0]).not.toBe('transparent');
  });
});

describe('HEAT_GLOW — a worked day is lit, not merely tinted', () => {
  it('has no halo at level 0 and a real one at every level above', () => {
    expect(HEAT_GLOW[0]).toBe('none');
    for (let level = 1; level <= 4; level += 1) {
      expect(HEAT_GLOW[level]).toContain('var(--heat-glow)');
      expect(HEAT_GLOW[level]).not.toBe('none');
    }
  });

  it('spills further as the level climbs', () => {
    const spread = (glow: string): number => Number(glow.match(/0 0 (\d+)px/)?.[1] ?? '0');
    for (let level = 1; level < 4; level += 1) {
      expect(spread(HEAT_GLOW[level + 1]!)).toBeGreaterThan(spread(HEAT_GLOW[level]!));
    }
  });
});

describe('heatBoxShadow', () => {
  it('always keeps the structural inset hairline', () => {
    for (let level = 0; level <= 4; level += 1) {
      expect(heatBoxShadow(level, HEAT_EDGE)).toContain('inset 0 0 0 1px');
    }
  });

  it('adds the halo for worked levels and withholds it at level 0', () => {
    for (let level = 1; level <= 4; level += 1) {
      expect(heatBoxShadow(level, HEAT_EDGE)).toContain('var(--heat-glow)');
    }
    expect(heatBoxShadow(0, HEAT_EDGE)).not.toContain('var(--heat-glow)');
  });

  it('emits only the inset for level 0, so an inactive cell cannot glow', () => {
    const shadow = heatBoxShadow(0, HEAT_EDGE);
    expect(shadow).toBe(`inset 0 0 0 1px ${HEAT_EDGE}`);
  });

  it('paints the hairline under the halo, never over it', () => {
    // First layer wins in a box-shadow list, so the hairline must be last or it
    // would sit on top of the glow and flatten it.
    const shadow = heatBoxShadow(3, HEAT_EDGE);
    expect(shadow.indexOf('var(--heat-glow)')).toBeLessThan(shadow.lastIndexOf('inset 0 0 0 1px'));
  });

  it('ends with the hairline for every level, so the grid keeps its structure', () => {
    for (let level = 0; level <= 4; level += 1) {
      expect(heatBoxShadow(level, HEAT_EDGE).endsWith(HEAT_EDGE)).toBe(true);
    }
  });
});
