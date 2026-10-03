import { auth } from '@/lib/auth';
import { redirect } from 'next/navigation';
import { formatInTimeZone } from 'date-fns-tz';
import { TodayHabitChecklist } from '@/components/today/TodayHabitChecklist';
import { CurrentRoutineBlock } from '@/components/today/CurrentRoutineBlock';
import { TodayMotionProvider } from '@/components/today/TodayMotionProvider';
import { AttentionStrip } from '@/components/today/AttentionStrip';
import { TodayDayType } from '@/components/today/TodayDayType';
import { TodayScore } from '@/components/today/TodayScore';
import { TodayGoals } from '@/components/today/TodayGoals';
import { TodaySleep } from '@/components/today/TodaySleep';
import { DailyReflection } from '@/components/today/DailyReflection';
import { TomorrowPlanner } from '@/components/today/TomorrowPlanner';
import { CommandPalette } from '@/components/today/CommandPalette';
import { Toaster } from 'sonner';
import { Stagger } from '@/components/today/ui';
import { StreakCard } from '@/components/streak/StreakCard';
import { getTodayString } from '@/lib/dates';
import { resolveDayTypeForDate } from '@/lib/scheduling/resolve-routine';
import { userService } from '@/server/services/user.service';
import { userIdFromSession } from '@/types/ids';

export default async function TodayPage() {
  const session = await auth();
  
  if (!session?.user) {
    redirect('/login');
  }

  const timezone = await userService.getTimezone(userIdFromSession(session));
  const today = getTodayString(timezone);
  
  // Resolve the actual day type for today (respects RoutineException)
  //
  // `resolveDayTypeForDate` is the single canonical resolver, and it is the same
  // one `/api/day-mode`, habit eligibility, goal visibility and `ScoringService`
  // use, so the value handed to the day-type card cannot drift from the value
  // the API would have returned.
  //
  // This previously called `RoutineService.getRoutineForDate`, which returned an
  // identical `dayType` but also loaded the template, every block and every
  // routine log for the date â€” all of which `CurrentRoutineBlock` then fetched
  // again through `/api/routine/today`. The page only ever used `.dayType`.
  const { dayType: resolvedDayType } = await resolveDayTypeForDate(userIdFromSession(session), today);

  return (
    <div className="relative mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 sm:py-8">
      {/*
        ERROR.md A6: /today was "very boring and not mobile responsive".

        The page was a single `max-w-4xl` column of stacked cards, so on a wide
        screen it was a narrow ribbon of content with dead space either side, and
        on a phone the score and streak were separated by three full cards. It is
        now a responsive bento grid: score and streak sit side by side from
        `sm` upward and stack on mobile, and every cell declares its own span so
        the layout cannot overflow.

        `gradient-mesh-animated` supplies the colour, `glass-panel` the surface,
        and both are driven by the theme tokens in `globals.css`, so the design
        follows the light/dark theme instead of hardcoding a palette (A7).
      */}
      <div
        className="gradient-mesh-animated pointer-events-none absolute inset-0 -z-10 opacity-60"
        aria-hidden="true"
      />

      <TodayMotionProvider>
        <Stagger>
          <header className="mb-6 sm:mb-8">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
                Today
              </h1>
              <p className="mt-2 inline-flex items-center gap-2 rounded-full glass-panel px-3.5 py-1.5 text-xs text-muted-foreground shadow-soft sm:text-sm">
                <CalendarIcon className="h-4 w-4 text-primary" aria-hidden="true" />
                {formatInTimeZone(new Date(), timezone, 'EEEE, MMMM d, yyyy')}
              </p>
            </div>

            {/* 2.9 â€” the palette is reachable by Cmd/Ctrl+K or by this button. */}
            {/*
              Not `hidden sm:block`. That made the entire palette unreachable on
              a phone â€” the only other entry point is the Cmd/Ctrl+K handler,
              which needs a keyboard â€” and /today was explicitly reworked for
              mobile. The trigger collapses to an icon on narrow screens.
            */}
            <div>
              <CommandPalette />
            </div>
          </div>
          </header>
        </Stagger>

        {/*
          ERROR.md A6 + feature 2.2 â€” bento grid.
          Columns: 1 on mobile, 2 from `md`, 6 from `xl`. The earlier version had
          only `lg`, so a tablet in the 768â€“1023px band got a single very wide
          column per card, which is the worst possible use of that width.

        {/*
          Arrangement, as specified. **No `xl:row-start` / `xl:row-span`.**
          Auto-placement follows DOM order:
            hero    Score (3) + Right now (3)
            main    Habits (3) + Goals (3)
            below   Day type (3) + Reflection (3)
            last    Streak (3) + Sleep (3)

          Every explicit `row-start`/`row-end`/`row-span` was removed. They pinned
          cards to fixed rows, so a cell reserved its row's height even when its own
          content was short â€” which is what produced the visible gap between the
          habit card and Active Goals, and the empty band under "Right now".
          With plain auto-placement a card occupies only the height it needs, and
          everything after it moves down **only** as content above actually grows:
          a longer routine description pushes Day type down, and the habit list
          stops growing once it hits its cap, at which point Goals stops moving.

          Two cards per row at `xl` also keeps the unavoidable same-row height
          difference small â€” CSS Grid has no masonry, so the tallest card in a row
          still sets that row's height and shorter siblings sit top-aligned.
        */}
        {/*
          `items-start` is what actually makes the cards fit-content.

          Removing the per-panel `min-h-*` was not sufficient on its own. CSS Grid
          stretches every item to the height of the tallest item in its row
          (`align-items: stretch` is the default), so "Right now" inherited
          Score's height and `h-full` on the `Stagger` wrapper carried that height
          down into the panel. The dead space was therefore coming from *stretch*,
          not from a fixed height, which is why trimming `min-h` left it intact.

          With `items-start` each cell is only as tall as its own content:
            * a `h-full` inside an auto-height parent resolves to `auto` (the
              percentage has nothing to resolve against), so the panel hugs its
              content;
            * a card with little content no longer reserves the tallest card's
              height, so its bottom border tracks the content instead of floating
              above an empty region.

          Loading skeletons keep an explicit `min-h`, because a placeholder with
          no reserved height would otherwise collapse the row and make the grid
          jump when real content arrives.
        */}
        {/*
          A single slim line above the two columns, rendered only when something
          is actually wrong. Not a ninth card â€” see `AttentionStrip` for why it
          sits here rather than inside one of the cards.
        */}
        <AttentionStrip />

        {/*
          Two independent column stacks, not a row-based grid.

          ## Why the row grid could not satisfy this

          A CSS Grid row has ONE height, set by its tallest cell. Every other cell
          in that row is then that tall, so a shorter card necessarily shows empty
          space beneath its content. No amount of `max-h`, `fit-content` or
          `h-auto` on the cards removes that gap â€” it is a property of sharing a
          row, not of the cards. The gaps reported between the habit card and
          Active Goals, and under "Right now", were all this.

          ## Why columns fix it

          Each column is an independent `flex flex-col` stack, so no cell ever
          shares a height with one in the other column:
            * Habits grows 1 â†’ 5 items and pushes **only its own column** down, so
              Day type moves with it â€” which is the requested behaviour.
            * At 5 items the habit card hits `max-h` and its internal scroll
              engages, so it stops growing and Day type stops moving even as more
              habits are added.
            * "Right now" fits its content, so Active Goals sits directly beneath
              it with the same `gap` as every other pair.
            * A long routine description expands "Right now" only, because Day type
              is in the *other* column and is unaffected.

          The two columns are deliberately allowed to end at different heights;
          forcing them equal would reintroduce exactly the gap being removed.
        */}
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 md:gap-5">
          {/* ---- left column: score, habits, day type, streak ---- */}
          <div className="flex min-w-0 flex-col gap-4 md:gap-5">
            <Stagger delay={0.06}>
              <TodayScore date={today} />
            </Stagger>

            {/*
              `h-full` is deliberately absent on these wrappers.

              In a flex column, `h-full` would resolve against an auto-height
              parent (so it is inert), but keeping it out makes the intent
              explicit: these cards are content-sized.
            */}
            <Stagger delay={0.14}>
              <TodayHabitChecklist date={today} />
            </Stagger>

            <Stagger delay={0.22}>
              {/*
                ERROR.md A1: /today showed "Minimum Day" and "Rest Day" but /routine
                has no such entries. They were day *modes*, rendered by a
                `QuickActions` block that has been removed, so the two screens
                cannot disagree about what a day can be.
              */}
              <TodayDayType date={today} resolvedDayType={resolvedDayType} />
            </Stagger>

            <Stagger delay={0.3}>
              <StreakCard />
            </Stagger>
          </div>

          {/* ---- right column: right now, goals, sleep, reflection ---- */}
          <div className="flex min-w-0 flex-col gap-4 md:gap-5">
            <Stagger delay={0.1}>
              <CurrentRoutineBlock timezone={timezone} />
            </Stagger>

            <Stagger delay={0.18}>
              <TodayGoals date={today} />
            </Stagger>

            <Stagger delay={0.26} id="today-sleep">
              <TodaySleep date={today} />
            </Stagger>

            {/*
              `id="today-reflection"` is the scroll target for the palette's "Jump
              to reflection" command. Anchors live outside the card so a card
              restyle cannot move or remove them.
            */}
            <Stagger delay={0.34} id="today-reflection">
              <DailyReflection date={today} />
            </Stagger>

            <Stagger delay={0.42}>
              <TomorrowPlanner date={today} />
            </Stagger>
          </div>
        </div>
      </TodayMotionProvider>
      {/*
        2.8 â€” the sonner toaster for the Undo toasts. Mounted here rather than in
        the root layout so it is scoped to `/today`; `richColors` keeps the
        semantic tones in step with the theme instead of fighting them.
      */}
      <Toaster
        position="bottom-right"
        richColors
        closeButton
        toastOptions={{ className: 'font-sans' }}
      />
    </div>
  );
}

function CalendarIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
      />
    </svg>
  );
}