import type { ContributionCell, ContributionLevel } from './contributions';

/**
 * The habit contribution visual language.
 *
 * Pure strings, so the palette is testable and the component holds no design
 * decisions. Every value is a `color-mix` against a theme token, so one theme swap
 * re-tints the whole system.
 *
 * ## Every cell has a body
 *
 * A GitHub clone draws *nothing* for an inactive day, so a sparse year reads as a
 * broken component rather than as a sparse year. Here every cell has a neutral
 * floor plus a hairline, and the green sits **on top** of it. Two rules follow:
 *
 *  - **Inactive is never invisible.** The calendar's shape is always legible.
 *  - **Inactive is never brighter than active.** The floor is a desaturated
 *    `var(--muted)`, and the greens are the only saturated marks on the grid, so
 *    the eye lands on real activity without being asked to.
 *
 * ## The part that matters: three kinds of "no"
 *
 * A single empty cell collapses three genuinely different facts:
 *
 * | State | What it means | Treatment |
 * | ----- | ------------- | --------- |
 * | `UNSCHEDULED` | Nothing was due. A rest day. | Floor only, no hatch. |
 * | `NO_RECORD` | Something was due, nothing logged. **Unknown.** | Floor + a faint hatch. |
 * | `LOGGED_MISS` | Something was due, logged as missed. | Floor + a red hairline. |
 *
 * `NO_RECORD` must never look like failure. "I did not do it" and "I never opened
 * the app" produce identical rows in the database, and drawing both as a red cell
 * would be a lie the grid tells 300 times a year.
 */

/**
 * The 1-4 activity ramp. Level 0 has no green at all.
 *
 * These read from `--heat-green` / `--heat-green-hi` rather than carrying literal
 * RGB, and that is the whole reason a worked day looks the same in both themes.
 * A single hard-coded emerald-500 cannot: on a white card its 0.34 alpha averages
 * out to a pale mint that reads as "barely tinted" rather than "you did something",
 * while on the dark card the same value is clear. `--heat-green` is emerald-600 in
 * light mode and emerald-400 in dark mode, so each ramp entry is picked against
 * the card it is actually drawn on.
 *
 * `levelFor` already guarantees `completed > 0` for every level in this record —
 * level 0 means nothing was completed — so any cell that reaches here glows.
 */
export const HABIT_RAMP: Record<Exclude<ContributionLevel, 0>, string> = {
  1: 'linear-gradient(145deg, rgb(var(--heat-green) / 0.34), rgb(var(--heat-green) / 0.18))',
  2: 'linear-gradient(145deg, rgb(var(--heat-green) / 0.54), rgb(var(--heat-green) / 0.30))',
  3: 'linear-gradient(145deg, rgb(var(--heat-green) / 0.78), rgb(var(--heat-green) / 0.52))',
  4: 'linear-gradient(145deg, rgb(var(--heat-green-hi) / 0.96), rgb(var(--heat-green) / 0.72))',
};

/**
 * The halo on a cell the user actually completed, parallel to the dashboard's
 * `HEAT_GLOW`. A gradient fill alone reads as a coloured square; what makes a day
 * look lit is a little light spilling past its own edge.
 *
 * Index 0 is the literal `"none"` rather than an empty string so a cell can apply
 * it unconditionally, and so an uncompleted day can never inherit a halo.
 */
const HABIT_GLOW: Record<ContributionLevel, string> = {
  0: 'none',
  1: '0 0 3px 0 rgb(var(--heat-glow) / 0.45)',
  2: '0 0 4px 0 rgb(var(--heat-glow) / 0.55)',
  3: '0 0 5px 0 rgb(var(--heat-glow) / 0.65)',
  4: '0 0 7px 0 rgb(var(--heat-glow) / 0.75)',
};

/**
 * The neutral floor every cell starts from.
 *
 * Built from `--muted-foreground`, NOT from `--muted`. In dark mode those two
 * tokens are both `#27272a`, so a cell filled with `var(--muted)` and outlined with
 * `var(--border)` is almost exactly the value of the card behind it — which is why
 * every inactive cell in the first build of this card was invisible on a dark
 * theme. `CELL_FLOOR` mixes roughly 16% of a *mid-tone* over the background, so it
 * is measurably lighter than the surface in dark mode and measurably darker than
 * it in light mode, from one declaration.
 *
 * It stays desaturated, so the greens remain the only saturated marks and an
 * inactive cell never competes with an active one.
 */
export const CELL_FLOOR = 'color-mix(in srgb, var(--muted-foreground) 16%, transparent)';

/**
 * A hairline, so a cell has an edge even at level 0.
 *
 * Same reasoning as the floor, at a higher alpha so the grid's structure is
 * legible without the fill having to carry it.
 */
export const CELL_EDGE = 'color-mix(in srgb, var(--muted-foreground) 24%, transparent)';

/** A faint hatch for `NO_RECORD` - "we do not know", not "you failed". */
export const UNKNOWN_HATCH =
  'repeating-linear-gradient(135deg, color-mix(in srgb, var(--muted-foreground) 22%, transparent) 0 2px, transparent 2px 5px)';

export const TODAY_RIM = 'var(--primary)';

/**
 * A cell's fill.
 *
 * Level 0 is routed by *state*, not by level, which is the whole point: three
 * meanings, three treatments.
 */
export function cellFill(cell: Pick<ContributionCell, 'level' | 'state'>): string {
  if (cell.level > 0) return HABIT_RAMP[cell.level as Exclude<ContributionLevel, 0>];
  if (cell.state === 'NO_RECORD') return UNKNOWN_HATCH;
  return CELL_FLOOR;
}

/**
 * Every cell carries the same hairline, so the grid structure is always legible.
 *
 * The logged-miss rim is NOT here: a cell can only draw one `box-shadow`, and it
 * has to hold the fill's hairline as well, so miss-vs-today precedence is declared
 * once in `globals.css` under `[data-miss]` / `[data-today]`.
 */
export function cellEdge(cell: Pick<ContributionCell, 'level' | 'state'>): string {
  if (cell.level > 0) return 'color-mix(in srgb, var(--muted-foreground) 18%, transparent)';
  return CELL_EDGE;
}

/**
 * The cell's entire `box-shadow`, composed in one place.
 *
 * A cell can only draw one `box-shadow`, and four things want it: the structural
 * hairline, the green halo on a completed day, the red inset rim on a logged
 * miss, and the outer ring on today. **First shadow wins**, so the order below is
 * the precedence, highest first.
 *
 * This exists because it used to be split. The hairline was set inline while
 * `[data-miss]` / `[data-today]` were set from `globals.css` — and an inline
 * `style` beats a stylesheet rule outright, so those two CSS declarations had
 * been silently doing nothing and the "today" ring never rendered at all. One
 * `box-shadow`, composed in one function, cannot drift that way. The CSS block
 * that used to carry the last two values is gone.
 *
 * @param cell    the contribution cell
 * @param isToday whether this cell is today's date
 */
export function cellBoxShadow(
  cell: Pick<ContributionCell, 'level' | 'state'>,
  isToday: boolean
): string {
  const layers: string[] = [];

  // Today is the strongest orientation cue on the grid, so it outranks everything.
  // An OUTER shadow, so it paints outside the box and cannot change the cell's
  // layout size — an inset or border-based marker would shift all 364 siblings.
  if (isToday) layers.push(`0 0 0 1.5px var(--primary)`);

  if (cell.level > 0) layers.push(HABIT_GLOW[cell.level]);

  // Inset, so the miss reads as a property of the cell rather than a ring
  // floating around it.
  if (cell.state === 'LOGGED_MISS') {
    layers.push(`inset 0 0 0 1px color-mix(in srgb, var(--destructive) 45%, transparent)`);
  }

  // The structural hairline goes last, so it is always the bottom layer and
  // something else sitting on top of it never erases the grid structure.
  layers.push(`inset 0 0 0 1px ${cellEdge(cell)}`);

  return layers.join(', ');
}

/**
 * A day that carries no cell at all — outside the clipped window, or a gap a
 * month genuinely does not have.
 *
 * It still gets the floor and the hairline. An empty span renders as literally
 * nothing, which reads as "the app failed to draw here" rather than as "there is
 * no data here", and it is what made whole months look blank.
 */
export const REST_CELL_FILL = CELL_FLOOR;
export const REST_CELL_EDGE = CELL_EDGE;

/**
 * Human wording, used in the tooltip and its `aria-label`.
 *
 * The three "no" states must never produce the same sentence, because the grid is
 * drawing them differently for a reason the user must be able to read back.
 */
export function describeCell(cell: ContributionCell): string {
  if (cell.state === 'UNSCHEDULED') return 'Rest day, no habits scheduled';
  if (cell.state === 'NO_RECORD') {
    return `${cell.scheduled} scheduled, nothing recorded`;
  }
  if (cell.state === 'LOGGED_MISS') {
    return `${cell.scheduled} scheduled, ${cell.missed} missed and ${cell.skipped} skipped`;
  }
  const rate = cell.rate === null ? '' : `, ${cell.rate}% complete`;
  return `${cell.completed} of ${cell.scheduled} completed${rate}`;
}

/**
 * The compact legend.
 *
 * The five swatches are the *actual* levels the grid uses, in order, so the legend
 * is a key rather than decoration. `neutral` marks a rest day, because "no green"
 * has two causes and only one of them is a lapse.
 */
export const LEGEND_LEVELS: { key: string; label: string; fill: string }[] = [
  { key: 'unknown', label: 'Not recorded', fill: UNKNOWN_HATCH },
  { key: 'missed', label: 'Missed', fill: CELL_FLOOR },
  ...([1, 2, 3, 4] as const).map((level) => ({
    key: String(level),
    label: `${level}`,
    fill: HABIT_RAMP[level],
  })),
];

export const LEGEND_HINT =
  'Colour is how much of the day’s scheduled habits you completed. A hatched cell is a day something was due and you never logged it — unknown, not failed. Hover any cell for that day’s numbers.';

/** `January -> 23 active days` in the wording the brief asked for. */
export function monthCaption(
  month: { label: string; activeDays: number; days: number; futureDays: number }
): string {
  if (month.futureDays > 0 && month.days === 0) return 'Not yet';
  if (month.days === 0) return 'No data';
  return `${month.activeDays} active ${month.activeDays === 1 ? 'day' : 'days'}`;
}
