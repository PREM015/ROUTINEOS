'use client';

/**
 * Layout helper: the adaptive main grid.
 *
 * This exists to work around a structural problem on the dashboard page, which is
 * why it is here rather than in `components/motion/Mount.tsx` - `Mount` is shared
 * with every other page in the app and its wrapper behaviour is depended upon.
 *
 * It used to also export `stagger()`, which spread `motion-safe:dash-enter` plus
 * a delay onto a widget. That was needed while the metrics row existed, because
 * `Mount` always wraps its child in a `div`, and those wrappers are what the
 * dashboard's CSS grid laid out - so hiding a widget left an empty cell behind
 * instead of reflowing the grid. The dashboard now wraps its sections in `<Mount>`
 * directly and no longer needs a widget-level entrance primitive, so `stagger` went
 * with the row it was written for.
 */

import { type ReactNode } from 'react';
import { useAnyWidgetEnabled } from '@/components/dashboard/DashboardWidgets';

/**
 * Two-column main grid that collapses when the right column has nothing in it.
 *
 * The dashboard page is a **server** component, so it cannot read the
 * `localStorage` widget preferences that decide which widgets are shown - and
 * several of them default to `enabled: false`. The layout was therefore
 * unconditional: a fresh browser reserved a full third of the page for cards the
 * user had not opted into, and squeezed the real cards into two thirds
 * (ERROR.md B.1 #21).
 *
 * Takes a LIST of keys rather than one. The right column holds several
 * independently-gated widgets, and collapsing it because a single one is off would
 * hide the others along with it - which is how "the right column is sometimes
 * mysteriously empty" happens.
 *
 * Server-rendered children are passed straight through, so nothing about the
 * widgets themselves changes - only the surrounding grid.
 */
export function AdaptiveColumns({
  left,
  right,
  rightKeys,
  rightLabel,
  secondLeft,
  secondRight,
  secondRightKeys,
}: {
  left: ReactNode;
  right: ReactNode;
  /**
   * Widget keys gating the right column. The column renders only when at least
   * one of them is enabled.
   */
  rightKeys: string[];
  rightLabel: string;
  /**
   * A second row, same 8/4 split.
   *
   * The Achievements rail was full-bleed below this grid, so a two-column card
   * stack spent the full page width and a lot of vertical scroll to show a dozen
   * badges. As a second row it sits beside the habit table and uses the width
   * the row already has.
   */
  secondLeft?: ReactNode;
  secondRight?: ReactNode;
  /** Keys gating the second right cell. Same collapse rule as the first row. */
  secondRightKeys?: string[];
}) {
  const anyRightEnabled = useAnyWidgetEnabled(rightKeys);
  /*
    Unconditional, so hook order is stable across renders.

    `secondRightKeys` is optional, and gating the call on it would make the hook
    count depend on a prop. `useAnyWidgetEnabled` already tolerates an empty
    list, so an absent key set resolves to false and the second row's right cell
    is simply not rendered.
  */
  const anySecondRightEnabled = useAnyWidgetEnabled(secondRightKeys ?? []);

  // Until the preference is known, render the two-column form. Collapsing and
  // then re-expanding would be a visible jump on every load; the other order is
  // a harmless one-frame difference the user never sees.
  const twoColumn = anyRightEnabled !== false;
  const hasSecondRow = secondLeft !== undefined || secondRight !== undefined;
  const twoColumnSecond = anySecondRightEnabled !== false;

  /*
    The cells are built once and reused, so the single-column and two-column
    branches cannot drift apart in their padding or their `min-w-0`. `min-w-0` is
    load-bearing: a grid child defaults to `min-width: auto`, so a wide card
    inside one refuses to shrink and pushes the whole row wider than the viewport.
  */
  const rowOne = twoColumn ? (
    <>
      <div className="min-w-0 min-h-0 space-y-4 sm:space-y-5 lg:col-span-4 lg:space-y-6">
        {left}
      </div>
      <div className="min-w-0 space-y-4 sm:space-y-5 lg:col-span-2 lg:space-y-6">
        <h2 className="sr-only">{rightLabel}</h2>
        {right}
      </div>
    </>
  ) : (
    <div className="min-w-0 min-h-0 space-y-4 sm:space-y-5 lg:col-span-6 lg:space-y-6">
      {left}
    </div>
  );

  /*
    The second row stretches, and so do both of its cells.

    `items-start` on the outer grid means every cell is sized to its own content,
    which is right for row one - the left column is a variable-height stack and
    forcing it to match the right would leave a hole under the shorter one. It is
    wrong for row two, where one cell is a table and the other is a scroll rail
    that should match it. So row two opts into `items-stretch` (the grid default)
    and the rail consumes the extra height with `flex-1 min-h-0`.

    `min-h-0` is load-bearing on both the cell and the card inside it. A flex child
    defaults to `min-height: auto`, so a scrolling child refuses to shrink below
    its content and the whole row grows instead - which is exactly the "card is
    short and there is black space below" symptom, caused by the opposite of what
    it looks like.
  */
  const rowTwo = hasSecondRow ? (
    twoColumnSecond ? (
      <>
        <div className="flex min-w-0 min-h-0 flex-col lg:col-span-4">{secondLeft}</div>
        <div className="flex min-w-0 min-h-0 flex-col lg:col-span-2">{secondRight}</div>
      </>
    ) : (
      <div className="flex min-w-0 min-h-0 flex-col lg:col-span-6">
        {secondLeft ?? secondRight}
      </div>
    )
  ) : null;

  if (!hasSecondRow) {
    return (
      <div className="grid grid-cols-1 items-start gap-4 sm:gap-5 md:grid-cols-2 lg:grid-cols-6 lg:gap-6">
        {rowOne}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-4 sm:gap-5 md:grid-cols-2 lg:grid-cols-6 lg:gap-6">
      {/*
        Row one keeps `items-start` via its own wrapper, so stretching the grid
        for row two's benefit does not change how row one behaves.
      */}
      <div className="grid min-w-0 grid-cols-1 items-start gap-4 sm:gap-5 md:col-span-2 md:grid-cols-2 lg:col-span-6 lg:grid-cols-6 lg:gap-6">
        {rowOne}
      </div>
      {rowTwo}
    </div>
  );
}
