'use client';

import { CalendarRange, Info } from 'lucide-react';
import HeatMap from '@/components/charts/HeatMap';
import { heatmapCellState } from '@/lib/recap/derive';
import type { RecapExtras } from '@/types/recap';

interface HabitHeatmapCardProps {
  habitHeatmap: RecapExtras['habitHeatmap'];
  /** Days in the window with at least one habit due. */
  dueDays?: number;
  /** Days in the window considered, already clipped to today. */
  totalDays?: number;
  /** The window's noun, so the sentence reads "3 of these 7 days". */
  periodNoun?: string;
}

/**
 * Habit heatmap for the period.
 *
 * Each cell is one day and there are **three** states, not two:
 *
 *  - **done** — everything due was completed.
 *  - **partial** — some of it was.
 *  - **no record** — something was due and nothing was written down.
 *
 * That third one used to be impossible here. The card counted `HabitLog` rows
 * directly, so a day with no rows was simply missing from the grid and a day
 * with rows that were all `MISSED` rendered as a filled cell. "I had three due
 * and did none" and "I was never due" both looked like nothing. The data now
 * comes from the shared eligibility model (`habitHeatmap` carries `noRecord`),
 * and the cell state is decided by `heatmapCellState` rather than by dividing.
 *
 * The `minColor` is also no longer a hard-coded near-black. On a light theme
 * `#18181b` is the *strongest* value in the palette, so a 0% day rendered as a
 * bold filled square and read as achievement rather than absence.
 */
export default function HabitHeatmapCard({
  habitHeatmap,
  dueDays,
  totalDays,
  periodNoun = 'days',
}: HabitHeatmapCardProps) {
  const cells = habitHeatmap.map((day) => ({
    label: day.date,
    rate: day.scheduled > 0 ? (day.completed / day.scheduled) * 100 : 0,
    noRecord: heatmapCellState(day) === 'noRecord',
  }));

  const states = habitHeatmap.map((day) => heatmapCellState(day));
  const fullDays = states.filter((state) => state === 'full').length;
  const unrecordedDays = states.filter((state) => state === 'noRecord').length;
  const notDueDays = states.filter((state) => state === 'notDue').length;
  const nothingWasDue = notDueDays === habitHeatmap.length;

  /*
    Coverage before completion. A rate over a window where most days had nothing
    due is not a low score, it is a rate about almost nothing, and leading with
    the percentage invites exactly that misreading.
  */
  const coverage =
    typeof dueDays === 'number' && typeof totalDays === 'number' && totalDays > 0
      ? dueDays === totalDays
        ? `Something was scheduled every one of these ${totalDays} ${periodNoun}.`
        : `${dueDays} of these ${totalDays} ${periodNoun} had anything scheduled.`
      : null;

  return (
    <section className="glass-panel spotlight-hover rounded-2xl p-6 shadow-soft">
      <header className="mb-4 flex items-center gap-2">
        <span className="inline-flex rounded-lg bg-primary/10 p-2 text-primary">
          <CalendarRange className="h-4 w-4" aria-hidden="true" />
        </span>
        <h2 className="text-sm font-semibold text-foreground">Daily habit heat</h2>
      </header>

      {cells.length > 0 ? (
        <>
          <HeatMap
            data={cells}
            valueKey="rate"
            labelKey="label"
            noRecordKey="noRecord"
            columns={7}
            showValues={false}
            minColor="#e2e8f0"
            maxColor="#10b981"
            ariaLabel={`Habit completion heatmap. ${fullDays} fully completed days, ${unrecordedDays} days with something due but nothing recorded, across ${habitHeatmap.length} days.`}
          />

          {/* The legend is the only place the third state is explained. */}
          <ul className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[11px] text-muted-foreground">
            <li className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-sm bg-emerald-500" aria-hidden="true" />
              All done
            </li>
            <li className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-sm bg-emerald-200" aria-hidden="true" />
              Some done
            </li>
            <li className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-sm bg-slate-300 dark:bg-zinc-700" aria-hidden="true" />
              None done
            </li>
            <li className="flex items-center gap-1.5">
              <span
                className="h-2.5 w-2.5 rounded-sm border border-dashed border-border bg-muted/40"
                aria-hidden="true"
              />
              Due, not logged
            </li>
          </ul>

<p className="mt-3 flex items-start gap-1.5 text-xs text-muted-foreground">
            <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            {nothingWasDue ? (
              <>Nothing was scheduled in this period, so there is no rate to report.</>
            ) : (
              <>
                {coverage}
                {unrecordedDays > 0 && (
                  <>
                    {coverage ? ' ' : ''}
                    {unrecordedDays} day{unrecordedDays === 1 ? ' had' : 's had'} something due
                    but nothing logged — not counted as failures.
                  </>
                )}
                {unrecordedDays === 0 && fullDays > 0 && <>Every scheduled day was recorded.</>}
              </>
            )}
          </p>
        </>
      ) : (
        <p className="py-8 text-center text-sm text-muted-foreground">
          No habits were scheduled in this period yet — they will light up here.
        </p>
      )}
    </section>
  );
}