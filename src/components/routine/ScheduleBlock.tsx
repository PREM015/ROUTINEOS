'use client';

import {
  AlertTriangle,
  Check,
  Circle,
  Clock,
  Copy,
  Minus,
  Moon,
  MoreHorizontal,
  Pencil,
  Play,
  Trash2,
  X,
} from 'lucide-react';
import { motion } from 'framer-motion';
import { Dropdown } from '@/components/ui/Dropdown';
import { formatClockMinutes, formatDuration } from '@/lib/routine/duration';
import { displayTitle } from '@/lib/routine/display-text';
import { useAnimationsEnabled } from '@/hooks/useAnimationsEnabled';
import { cn } from '@/lib/utils';
import { blockChipStyle, resolveBlockColor } from '@/constants/routine-block-color';
import type { GanttBlockItem } from '@/lib/routine/timeline';
import type { ResolvedRoutineBlock } from '@/types/routine';

/**
 * One scheduled block, drawn as a glass capsule on the rail.
 *
 * Three fixed rows, in a fixed order, and none of them wraps:
 *
 *   1. timestamp + duration   (exactly two items, so it cannot wrap)
 *   2. title                  (truncates rather than pushing the card taller)
 *   3. chips                  (overflowing chips are dropped, not clipped)
 *
 * The card is sized by uildGanttLayout, whose height floor is derived from
 * these rows. Row 1 must not be allowed to wrap: an earlier version let the meta
 * line wrap, and because the card is exactly as tall as its slot with
 * overflow-hidden, the wrapped line and everything below it were silently
 * discarded. That was the text-overlap-and-clipping bug.
 *
 * Presentation only; every action is a callback the page already owned.
 */
/**
 * Status and energy presentation.
 *
 * These live next to the card because only the card reads them. They were
 * module constants in `RoutineTimeline` before the split, which left the
 * timeline importing nothing it used and the card importing something it could
 * not see.
 *
 * `Record<string, string>` rather than a keyed enum: `ResolvedRoutineBlock`
 * types these fields as `string`, and a narrower key type here would need a cast
 * at every call site without buying any safety.
 */
const STATUS_TEXT: Record<string, string> = {
  COMPLETED: 'Done',
  PARTIAL: 'Partial',
  MISSED: 'Missed',
  IN_PROGRESS: 'In progress',
};

const STATUS_COLOR: Record<string, string> = {
  COMPLETED: 'text-primary',
  PARTIAL: 'text-warning',
  MISSED: 'text-destructive',
  IN_PROGRESS: 'text-accent-focus',
};

const ENERGY: Record<string, string> = {
  HIGH: 'High energy',
  MEDIUM: 'Medium energy',
  LOW: 'Low energy',
};

export function BlockCard({
  item,
  timeFormat24h,
  readOnly,
  busy,
  onToggleDone,
  onStart,
  onDetails,
  onEdit,
  onDuplicate,
  onNudge,
  onDelete,
}: {
  item: GanttBlockItem;
  timeFormat24h: boolean;
  readOnly: boolean;
  busy: boolean;
  onToggleDone: (block: ResolvedRoutineBlock) => void;
  onStart: (block: ResolvedRoutineBlock) => void;
  onDetails: (block: ResolvedRoutineBlock) => void;
  onEdit: (block: ResolvedRoutineBlock) => void;
  onDuplicate: (block: ResolvedRoutineBlock) => void;
  onNudge: (block: ResolvedRoutineBlock, deltaMinutes: number) => void;
  onDelete: (block: ResolvedRoutineBlock) => void;
}) {
  const { block, phase, logStatus } = item;
  const done = logStatus === 'COMPLETED';
  const isCurrent = phase === 'CURRENT';
  const isPast = phase === 'PAST' && !done;
  /*
   * The block's hue.
   *
   * This used to be `block.color ?? block.category?.color ?? null`, with the
   * article falling back to `var(--primary)`. Since `RoutineBlock.color` is a
   * nullable column most users never set, **the fallback was the common case** —
   * so a whole day of blocks rendered as one shade of green and the colour
   * channel carried no information whatsoever. That, more than the material, is
   * why the schedule read as flat.
   *
   * `resolveBlockColor` closes the gap: an uncategorised block with no colour of
   * its own gets a stable hash of its id, so it keeps its hue across reorderings
   * and reloads, and every block in a category shares that category's colour.
   */
  const { hue: accent, source: accentSource } = resolveBlockColor({
    id: block.id,
    color: block.color,
    category: block.category,
  });
  // B2's gate. `useAnimationsEnabled` folds the OS preference and the in-app
  // setting together, so the pulse and its static fallback stay in agreement.
  const animationsEnabled = useAnimationsEnabled();

  const durationMinutes = item.endMinutes - item.startMinutes;
  const durationLabel = formatDuration(durationMinutes);
  /*
   * How much of the block has elapsed, as a percentage of its own height.
   *
   * `progressPercent` only exists for the *current* block — it needs a clock — so
   * the other two phases are resolved here. A past block is fully elapsed and an
   * upcoming one has not started; a block on a past or future date has no clock
   * at all, and falls out of `phaseOf` as PAST, so it reads as spent. That is
   * correct: a past date's blocks *are* behind you.
   */
  const elapsedPercent = isCurrent ? item.progressPercent : isPast ? 100 : 0;

  /*
   * Height tiers.
   *
   * The engine runs the schedule in `'stack'` mode by default, where every card
   * is the same height and the vertical axis is sequence order rather than the
   * clock. Two consequences for the card:
   *
   *  - `isTall` is never true, so no card grows a duration numeral, an elapsed
   *    fill or a description. In a list those were decoration, and every card
   *    now reads the same. Duration is stated in the row instead, as
   *    `00:00 → 05:00   5h`.
   *  - `showChips` must stay true at the uniform height, or the category and
   *    energy chips — the reason a card carries a colour at all — would
   *    disappear. The uniform height is 96px — `DEFAULT_UNIFORM_ROW` in
   *    `lib/routine/timeline.ts` derives it as `p-4` of padding (32) plus the
   *    three rows (64) — and it is precisely that height which fits them.
   *
   * The tiers are kept because `'time'` mode is still reachable, and because the
   * thresholds are what stop a chip row being sliced by the card's
   * `overflow-hidden` at any height.
   */
  const showChips = item.height >= 72;
  const isTall = item.height >= 168;
  const isCompact = !showChips;

  return (
    <article
      className={cn(
        'glass-capsule group relative flex h-full min-h-[88px] flex-col overflow-hidden rounded-2xl transition-[box-shadow,border-color] duration-300',
        'focus-within:ring-2 focus-within:ring-ring',
        isCurrent
          ? 'shadow-floating ring-1 ring-primary/25'
          : 'hover:border-foreground/20 hover:shadow-soft',
        isPast && !done && 'opacity-70'
      )}
      // The capsule's glass tint is the block's own resolved hue, so the schedule
      // reads as a sequence of coloured commitments rather than grey tiles.
      // `--glass-hue` is the only custom property `glass-capsule` reads, and
      // `data-running` raises its tint for whichever block is live.
      data-running={isCurrent || logStatus === 'IN_PROGRESS' ? 'true' : undefined}
      style={{ '--glass-hue': accent } as React.CSSProperties}
    >
      {/*
        A hue wash off the top edge.

        A second, softer use of the block's colour than the capsule tint: the
        capsule says *what kind of block* this is, and this says it again at a
        different scale, so the eye can find one block in a column of twelve
        without reading a single word. Deliberately weaker than the tint, or the
        two would fight.
      */}
      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0 h-16"
        style={{
          background: `linear-gradient(to bottom, color-mix(in oklab, ${accent} 16%, transparent), transparent)`,
        }}
      />
      {/*
        The elapsed fill.

        A wash rising from the floor of the block, so "how much of this time box
        is gone" is answered by the shape of the card rather than by arithmetic.

        Deliberately low opacity and behind the content: at a strength that
        competed with the text it would be a colour field, and text over a colour
        field is exactly the readability problem this card was restructured to
        fix. The edge line is the part that carries the reading, so it is the
        part that gets full strength.
      */}
      {isTall && elapsedPercent > 0 && (
        <span
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 bottom-0"
          style={{ height: `${elapsedPercent}%` }}
        >
          <span
            className="absolute inset-0"
            style={{
              background: `linear-gradient(to top, color-mix(in oklab, ${accent} 26%, transparent), color-mix(in oklab, ${accent} 8%, transparent))`,
            }}
          />
          <span
            className="absolute inset-x-0 top-0 h-px"
            style={{
              background: `color-mix(in oklab, ${accent} 62%, transparent)`,
            }}
          />
        </span>
      )}

      {/*
        The ghosted duration numeral, sized off the block's own height.

        Only reachable in `'time'` mode, where a block is as tall as it is long and
        the numeral makes that length readable from across the panel. In `'stack'`
        mode `isTall` is never true, so no card carries it — in a list of identical
        cards it would be pure noise.

        `tabular-nums` so it does not shimmer against the meta row's real duration
        above it.
      */}
      {isTall && (
        <span
          aria-hidden="true"
          className="pointer-events-none absolute bottom-1 right-3 select-none font-mono font-bold leading-none tracking-tighter"
          style={{
            fontSize: `${Math.min(112, Math.max(52, Math.round(item.height * 0.24)))}px`,
            color: accent,
            opacity: 0.11,
          }}
        >
          {durationLabel}
        </span>
      )}

{/*
        The accent hairline. A gradient along the block's length rather than a
        flat bar, so a three-hour block reads as having duration.

        No longer conditional on the user having set a colour — it now always
        renders, because `accent` is always resolved. That is the single most
        visible change: a saturated edge on every block is what makes a column
        of twelve scannable.

        4px, and positioned to sit *under* the `p-4` content rather than pushing
        it: `absolute inset-y-0 left-0` overlaps the padding, so the capsule's
        total width is unchanged and no card grows by 4px relative to its
        neighbours. `pl-4` clears it with 12px to spare.

        The colour is the block's own accent — its category or custom colour —
        not a fixed emerald. One hard-coded accent across every block would erase
        the one thing the left edge is for, which is naming the category at a
        glance.
      */}
      <span
        aria-hidden="true"
        className="absolute inset-y-0 left-0 w-1 rounded-l-2xl"
        style={{
          background: `linear-gradient(to bottom, ${accent}, color-mix(in oklab, ${accent} 25%, transparent))`,
        }}
      />

      {/*
        Halo behind whatever is running, tinted with **its own** hue.

        It was hardcoded to `bg-primary`, so the one block the page wanted you to
        look at was the one block that ignored the colour system — a green glow
        behind a violet block. Tying it to `accent` also means the halo is
        visible against the card surface at any hue, rather than vanishing when
        the block happens to be green-on-green.
      */}
      {isCurrent && (
        <span
          aria-hidden="true"
          className="pointer-events-none absolute -inset-2 -z-10 rounded-3xl blur-xl motion-reduce:hidden"
          style={{
            background: `color-mix(in oklab, ${accent} 22%, transparent)`,
          }}
        />
      )}

      {/*
        The in-progress breathe.

        Keyed on `IN_PROGRESS` — the status the user *set* by pressing Start —
        rather than on `isCurrent`, which is only a clock calculation. Those are
        genuinely different: a block can be running and un-started (the default
        state of every current block), and a user can start one early or let it
        run past its end time, and only the log status means "you told the app
        you are inside this right now".

        Two seconds, and a narrow band. It is an edge that brightens and settles,
        not a glow that expands: a wide or fast pulse reads as an alert, and this
        page is a chronometer, not a notification surface. Animating `opacity` on
        a composited overlay keeps it off the layout and paint path.

        The ring is the block's own hue rather than `--primary`, for the same
        reason the halo is: a "you are inside this" signal that ignores the
        block's colour is a signal about the wrong thing.
      */}
      {logStatus === 'IN_PROGRESS' && animationsEnabled && (
        <motion.span
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 rounded-2xl ring-1 ring-inset"
          style={{
            // `color-mix` rather than `ring-primary/40` so the opacity of the
            // animated element is the only thing changing — animating a ring
            // colour would not composite.
            boxShadow: `inset 0 0 0 1px color-mix(in oklab, ${accent} 55%, transparent)`,
          }}
          initial={{ opacity: 0.4 }}
          animate={{ opacity: [0.4, 0.95, 0.4] }}
          transition={{
            duration: 2,
            // Symmetric, and back to the start value, so the loop has no seam.
            repeat: Infinity,
            ease: 'easeInOut',
          }}
        />
      )}

      {/*
        A non-animated equivalent for when motion is off. Without it, turning
        animations off would leave an in-progress block with *less* signal than
        before this existed, which is the wrong direction: the static ring is the
        same information without the movement.
      */}
      {logStatus === 'IN_PROGRESS' && !animationsEnabled && (
        <span
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 rounded-2xl ring-1 ring-inset"
          style={{
            boxShadow: `inset 0 0 0 1px color-mix(in oklab, ${accent} 55%, transparent)`,
          }}
        />
      )}

      {/*
        Three fixed rows, no wrapping.

        `min-h-0` on the content wrapper plus `overflow-hidden` on the article is
        what previously clipped the third row: the meta line was allowed to wrap,
        so a long title plus wrapped chips exceeded the card's exact height and
        the overflow was discarded. Row 1 is now exactly two items and cannot
        wrap; every variable-length label (title, chips) sits on its own row.

        `relative z-10` is load-bearing. The elapsed fill and the duration numeral
        are absolutely positioned, and a positioned box paints above a static one
        in the same stacking context — so without this the numeral would sit on
        top of the title rather than behind it.

        The padding tightens on compact cards so the 44px completion target still
        fits inside a 60px block: `py-1.5` leaves 48px of content height, and
        `py-2.5` would leave 40 and clip the button's bottom edge.

At the shipped 96px row, `py-2.5` leaves 76px of content for rows
         totalling 16 + 4 + 18 + 4 + 14 = 56, so every row fits with 20px spare
         and nothing is clipped. The compact branch only fires in `'time'` mode,
         where the engine can still produce a floored short block.
      */}
      <div
        className={cn(
          /*
           * A **row**, not a column. The tick target sits to the left of the text
           * and the action buttons to its right, so the three regions are
           * side by side. The `gap-2` the brief asked for is the *vertical*
           * rhythm between the timestamp, title and chip rows, and that lives on
           * the inner text column below — putting it here would space the tick
           * button away from the title instead.
           */
          'relative z-10 flex min-h-0 flex-1 items-center gap-3 overflow-hidden',
          /*
           * Padding lives in the branches only, never in the base class.
           * Listing `p-4` in the base and `py-2` in the branch happens to work
           * today because Tailwind emits `py-*` after `p-*`, so the vertical
           * override wins — but that is stylesheet ordering, not intent, and it
           * breaks silently the moment a class is renamed. One source per branch.
           */
          isCompact ? 'py-2 pl-4 pr-2' : 'p-4'
        )}
      >
        {block.trackCompletion && !readOnly && (
          <button
            type="button"
            onClick={() => onToggleDone(block)}
            disabled={busy}
            aria-pressed={done}
            aria-label={done ? `Mark ${block.title} not done` : `Mark ${block.title} done`}
            className={cn(
              /*
                44px, the minimum comfortable touch target, on every card with
                room for it. A 60px block has 48px of content height after
                `py-1.5`, so a 44px circle still fits there without clipping.
                Below that the target shrinks to 36 — smaller than the guideline
                rather than cut off, because a half-rendered button is not a
                button.
              */
              'flex shrink-0 items-center justify-center rounded-full border-2 transition active:scale-90 motion-reduce:transform-none',
              isCompact ? 'h-9 w-9' : 'h-11 w-11',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
              'disabled:opacity-50',
              done
                ? 'border-primary bg-primary text-primary-foreground'
                : 'border-border text-muted-foreground hover:border-primary hover:text-primary'
            )}
          >
            {done ? (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path
                  d="M20 6 9 17l-5-5"
                  stroke="currentColor"
                  strokeWidth={3}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            ) : (
              <Circle size={17} aria-hidden="true" />
            )}
          </button>
        )}

        <div className="flex min-w-0 flex-1 flex-col justify-center gap-2">
          {/* Row 1 — timestamp + duration. Exactly two items, never wraps. */}
          <div className="flex shrink-0 items-baseline gap-2 overflow-hidden">
            <span className="shrink-0 font-mono text-xs font-semibold tabular-nums text-foreground">
              {formatClockMinutes(item.startMinutes, timeFormat24h)}
              <span className="mx-0.5 text-muted-foreground/50">→</span>
              {formatClockMinutes(item.endMinutes, timeFormat24h)}
            </span>
            <span className="shrink-0 font-mono text-[11px] tabular-nums text-muted-foreground">
              {formatDuration(item.endMinutes - item.startMinutes)}
            </span>
          </div>

          {/*
            Row 2 — the title. Truncates on one line so it can never push the
            card past its own height.

            Stepped up on tall blocks rather than scaled continuously. A card that
            is 384px tall with a 14px title still reads as a small task in a big
            box; a 17px semibold title reads as the block's subject and uses the
            space. Three discrete steps, not a computed size: a title that changes
            on every scroll-driven pixel of a resize is unreadable and impossible
            to restyle predictably.
          */}
          <p
            className={cn(
              'shrink-0 truncate leading-tight',
              isTall ? 'text-base font-semibold sm:text-lg' : 'text-sm font-semibold',
              done ? 'text-muted-foreground line-through' : 'text-foreground'
            )}
            title={block.title}
          >
            {block.icon && (
              <span aria-hidden="true" className="mr-1">
                {block.icon}
              </span>
            )}
            {displayTitle(block.title)}
          </p>

          {/*
            Row 3 — chips.

            Only rendered when the card is at least 76px, which is the measured
            height at which this row fits without the card's `overflow-hidden`
            slicing it. `flex-wrap` is safe here because it is the last row and
            the `overflow-hidden` on it drops anything that would wrap rather
            than letting it push the card past its own height.
          */}
          {showChips && (
          <div className="flex min-w-0 shrink-0 items-center gap-1 overflow-hidden">
          {/*
            The description, only where there is room for it.

            On a short block the three rows are the whole budget and a fourth
            would be clipped, so it is omitted entirely rather than truncated to
            one clipped line. On a tall block the space is otherwise empty, and
            "what is this four hours for" is a question the title alone does not
            answer. Clamped rather than `truncate` so it wraps into the space it
            was given instead of running off the edge.
          */}
          {isTall && block.description && (
            <p className="mt-2 min-w-0 shrink-0 overflow-hidden text-xs leading-relaxed text-muted-foreground line-clamp-4">
              {block.description}
            </p>
          )}

{isCurrent && (
              /*
                Tinted with the block's own hue rather than `bg-primary`.

                The foreground here is `var(--card)` rather than
                `primary-foreground`: the accent can be any of eight hues,
                including the light sky and yellow entries in dark mode, and a
                fixed white-on-light-blue pairing would be the one contrast
                failure in an otherwise readable chip. Mixing toward the card
                keeps the text dark on every light hue and light on every dark
                one.
              */
              <span
                className="shrink-0 rounded-full px-1.5 py-px text-[9px] font-bold uppercase tracking-wider"
                style={{
                  background: `color-mix(in oklab, ${accent} 88%, var(--card))`,
                  color: 'var(--card)',
                }}
              >
                Now
              </span>
            )}
            {logStatus && (
              <span
                className={cn(
                  'shrink-0 text-[10px] font-semibold uppercase tracking-wide',
                  STATUS_COLOR[logStatus]
                )}
              >
                {STATUS_TEXT[logStatus]}
              </span>
            )}
            {item.isOvernight && (
              <span className="inline-flex shrink-0 items-center gap-0.5 text-[10px] text-muted-foreground">
                <Moon size={9} aria-hidden="true" />
                next day
              </span>
            )}
            {block.category && (
              <span
                className="shrink-0 truncate rounded-full px-1.5 py-py-px text-[10px] font-medium"
                style={
                  /*
                    The category chip wears `accent`, not `category.color`.

                    Those are the same value when the colour came from the
                    category, and the block's own colour when it did not — so
                    reading `category.color` directly produced a chip that
                    disagreed with the card it sits on whenever the user had
                    overridden the block. One source: `accent`.
                  */
                  block.category.color || accentSource === 'category'
                    ? blockChipStyle(accent)
                    : { backgroundColor: 'var(--muted)', color: 'var(--muted-foreground)' }
                }
              >
                {block.category.name}
              </span>
            )}
            {item.hasConflict && (
              <span className="inline-flex shrink-0 items-center gap-0.5 text-[10px] font-medium text-warning">
                <AlertTriangle size={9} aria-hidden="true" />
                overlap
              </span>
            )}
            {isCurrent && item.minutesRemaining > 0 && (
              <span
                className="shrink-0 font-mono text-[10px] font-semibold tabular-nums"
                style={{ color: accent }}
              >
                {formatDuration(item.minutesRemaining)} left
              </span>
            )}
            {block.energyLevel && ENERGY[block.energyLevel] && item.height >= 120 && (
              <span className="shrink-0 truncate rounded-full bg-muted px-1.5 py-px text-[10px] text-muted-foreground">
                {ENERGY[block.energyLevel]}
              </span>
            )}
          </div>
          )}

          {isCurrent && showChips && (
            <div className="mt-auto pt-2">
              {/* Track and fill both derive from `accent`, so the one live
                  progress bar on the page is the block's own colour. */}
              <div
                className="h-1 w-full overflow-hidden rounded-full"
                style={{ background: `color-mix(in oklab, ${accent} 18%, transparent)` }}
              >
                <div
                  className="h-full rounded-full transition-[width] duration-700 ease-out motion-reduce:transition-none"
                  style={{
                    width: `${item.progressPercent}%`,
                    background: `linear-gradient(to right, ${accent}, color-mix(in oklab, ${accent} 65%, transparent))`,
                  }}
                />
              </div>
            </div>
          )}
        </div>

        {!readOnly && (
          <div className="flex shrink-0 flex-col items-center gap-0.5">
            <button
              type="button"
              onClick={() => (done ? onToggleDone(block) : onStart(block))}
              disabled={busy}
              aria-label={done ? `Mark ${block.title} not done` : `Start ${block.title}`}
              title={done ? 'Mark not done' : 'Start'}
              className="hidden h-9 w-9 items-center justify-center rounded-lg text-muted-foreground transition hover:bg-muted hover:text-primary active:scale-90 motion-reduce:transform-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:flex"
            >
              {done ? <X size={14} aria-hidden="true" /> : <Play size={14} aria-hidden="true" />}
            </button>

            <Dropdown
              align="end"
              trigger={
                <button
                  type="button"
                  aria-label={`More actions for ${block.title}`}
                  className="flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground transition hover:bg-muted hover:text-foreground active:scale-90 motion-reduce:transform-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <MoreHorizontal size={15} aria-hidden="true" />
                </button>
              }
              items={[
                ...(block.trackCompletion
                  ? [
                      {
                        kind: 'item' as const,
                        label: done ? 'Mark not done' : 'Tick done',
                        icon: done ? X : Check,
                        onSelect: () => onToggleDone(block),
                      },
                    ]
                  : []),
                {
                  kind: 'item' as const,
                  label: 'Details…',
                  icon: Clock,
                  onSelect: () => onDetails(block),
                },
                ...(done
                  ? []
                  : [
                      {
                        kind: 'item' as const,
                        label: 'Start',
                        icon: Play,
                        onSelect: () => onStart(block),
                      },
                    ]),
                { kind: 'item' as const, label: 'Edit', icon: Pencil, onSelect: () => onEdit(block) },
                { kind: 'item' as const, label: 'Duplicate', icon: Copy, onSelect: () => onDuplicate(block) },
                { kind: 'item' as const, label: 'Start 15 min earlier', icon: Minus, onSelect: () => onNudge(block, -15) },
                { kind: 'item' as const, label: 'Start 15 min later', icon: Clock, onSelect: () => onNudge(block, 15) },
                { kind: 'item' as const, label: 'Start 5 min earlier', icon: Minus, onSelect: () => onNudge(block, -5) },
                { kind: 'item' as const, label: 'Start 5 min later', icon: Clock, onSelect: () => onNudge(block, 5) },
                {
                  kind: 'item' as const,
                  label: 'Delete',
                  icon: Trash2,
                  destructive: true,
                  separatorBefore: true,
                  onSelect: () => onDelete(block),
                },
              ]}
            />
          </div>
        )}
      </div>
    </article>
  );
}
