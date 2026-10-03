# `/dashboard` - complete page audit (Redesign v2)

> **Supersedes** the pre-v2 audit of this page. That document described a page of
> fifteen independent widgets - a Day Pulse hero, a live Right Now countdown ring,
> a 24-hour Timeline, a four-card metrics row, and a Streak card - each fetching
> its own data on its own schedule. **All of that is deleted.** The findings
> register at the end of this file is the resolution state of the old audit's
> findings.
>
> **Scope.** Every widget, endpoint, derivation and state container reachable
> from `src/app/(dashboard)/dashboard/page.tsx`, its sibling `loading.tsx`, the
> two components it renders outside the page (the global `Header` and the
> Settings > Dashboard preference page), and the pure modules those depend on.
>
> **Method.** Read-only static analysis of the source tree. No runtime profiling
> and no database access were performed, so **behavioural** claims are derived
> from code and **request-count / latency** figures are labelled *(derived)*.
> Request counts here are nevertheless exact: every fetch on the page is a literal
> endpoint in a literal file, and each is listed.
>
> All paths are relative to the repository root. Line numbers refer to the state
> of the tree at the time of writing.

---

## Table of contents

| # | Section |
| - | ------- |
| 1 | [The core decision: what `/dashboard` is for](#1-the-core-decision-what-dashboard-is-for) |
| 2 | [UI block diagram](#2-ui-block-diagram) |
| 3 | [Component mapping](#3-component-mapping) |
| 4 | [Frontend architecture](#4-frontend-architecture) |
| 5 | [Backend / API architecture](#5-backend--api-architecture) |
| 6 | [Database dependency](#6-database-dependency) |
| 7 | [Date, timezone and day-type logic](#7-date-timezone-and-day-type-logic) |
| 8 | [User actions the page can perform](#8-user-actions-the-page-can-perform) |
| 9 | [What the user can create / edit / delete](#9-what-the-user-can-create--edit--delete) |
| 10 | [Widget gating and personalisation](#10-widget-gating-and-personalisation) |
| 11 | [Loading / error / empty / edge states](#11-loading--error--empty--edge-states) |
| 12 | [Design system: the DNA and how it is applied](#12-design-system-the-dna-and-how-it-is-applied) |
| 13 | [Performance](#13-performance) |
| 14 | [Authentication and security](#14-authentication-and-security) |
| 15 | [Accessibility](#15-accessibility) |
| 16 | [Relationship to `/today`](#16-relationship-to-today) |
| 17 | [Dead and orphaned code](#17-dead-and-orphaned-code) |
| 18 | [Resolution of the pre-v2 findings](#18-resolution-of-the-pre-v2-findings) |
| 19 | [Open items and known limitations](#19-open-items-and-known-limitations) |
| 20 | [Reproduction commands](#20-reproduction-commands) |
---

## 1. The core decision: what `/dashboard` is for

The pre-v2 page was not a UI problem, it was an **identity** problem. `/dashboard`
and `/today` both showed the same eight things twice, computed two different ways,
updated on two different schedules. Two pages cannot both be "the daily console."

v2 gives each exactly one job:

| Page | Job | Horizon |
| ---- | --- | ------- |
| `/today` | **Act.** Tick habits, log sleep, write a reflection, edit the day type, mark routine blocks. | Right now, this one day |
| `/dashboard` | **Understand.** Patterns, trends, consistency, what has changed. **Nothing here is a checkbox.** | This week, this month, over time |

Every structural decision below follows from that split. The load-bearing one:

> **The Momentum panel's hero number is the weekly average, never today's score.**

That is what makes the two pages structurally incapable of displaying the same
number, rather than merely unlikely to.

`/dashboard` is a **server component that renders no data itself**. It
authenticates, reads the timezone, resolves today's day-type name, and hands off
to **ten client widgets**. Six of them share a single request through one
provider; the other four fetch independently because their data is genuinely
outside the trailing-window window.

---

## 2. UI block diagram

```
+--------------------------------------------------------------------------+
| AURORA MESH (gradient-mesh-animated, 48s drift) + FILM GRAIN (3%)         |
|  both -z-10, behind every glass card                                        |
+--------------------------------------------------------------------------+
| HEADER STRIP                          HeaderStrip.tsx                     |
|  7-Day Mini Strip (7 dots)         |  Day-type pill -> /today (read-only)|
+--------------------------------------------------------------------------+
| CONTEXT STRIP                        ContextStrip.tsx                    |
|  weekly verdict (trailing 7d)      |  right-now chip -> /today          |
+--------------------------------------------------------------------------+
| QUOTE                                                           WidgetGate|
+--------------------------------------------------------------------------+
| FEATURE HUB - 8 tiles, navigation only, NEVER gated                     |
+--------------------------------------------------------------------------+
| MOMENTUM PANEL  (full width, the page's only .magnetic-tilt)             |
|   7d/30d trend + weekly average  |  streak arc + flame  |  week's mix   |
+--------------------------------------------------------------------------+
| LEFT (4 cols)                                    | RIGHT (2 cols)      |
|   Heatmap + deferred caption                    | AI Insight         |
|   Life Balance radar (5-axis)                   | Weekly Recap       |
|   Day-Type Perf  |  Routine Adherence            | Goals Velocity     |
|   Habit Health (tabbed buckets)                 | Quick Actions 2x2  |
+--------------------------------------------------------------------------+
| ACHIEVEMENTS STRIP (full width, the only ongoing shimmer)               |
+--------------------------------------------------------------------------+
```

---

## 3. Component mapping

### Server (`page.tsx`, 215 lines)

| Line | Element | Notes |
| ---- | ------- | ----- |
| 41-55 | Feature hub array | 8 static `{name, href, icon, desc, color}` objects. Navigation only. |
| 58-59 | `UserRepository().getSettings` | The only DB read the page performs directly. Yields `timezone`. |
| 66-76 | `resolveDayTypeForDate` | Dynamic `import()`, wrapped in try/catch. 2 queries. |
| 100-107 | `<HeaderStrip>` | `dayTypeName` passed down. |
| 109 | `<ContextStrip>` | `dayTypeName` passed down. |
| 114-116 | `WidgetGate['quotes']` | |
| 163 | `<MomentumPanel>` | Unconditional. Not gated. |
| 176-228 | `<AdaptiveColumns>` | `rightKeys={['insights','recap','goalsVelocity','quickActions']}` |
| 181-206 | Left column | `heatmap`, `radar`, `dayTypes`, `adherence`, `habitHealth` |
| 211-225 | Right column | `insights`, `recap`, `goalsVelocity`, `quickActions` |
| 230-232 | `WidgetGate['achievements']` | |

### Client widgets

| File | Lines | Role | Own fetch? |
| ---- | ----- | ---- | ---------- |
| `MomentumPanel.tsx` | 535 | The hero. Trend + streak arc + weekly composition. | No - shared |
| `LifeBalanceRadar.tsx` | 254 | 5-axis balance, trailing 7d. | No - shared |
| `DayTypePerformance.tsx` | 119 | Average score per day type, 30d. | No - shared |
| `RoutineAdherence.tsx` | 128 | 7 bars, routine completion per day. | No - shared |
| `WeeklyRecap.tsx` | 129 | Two-sentence rule-based recap. | No - shared |
| `GoalsVelocity.tsx` | 111 | "N of M goals on pace" + delta. | No - shared |
| `HeaderStrip.tsx` | 125 | 7-Day Mini Strip + day-type pill. | No - shared |
| `ContextStrip.tsx` | 202 | Weekly verdict + right-now chip. | **Yes** - `GET /api/routine/today` |
| `HabitHealthWidget.tsx` | 317 | 28-day habit health, tabbed. | **Yes** - `GET /api/habits/health?days=28` |
| `ContributionHeatmap.tsx` | - | Consistency: shell, view/year controls, stats, caption, modal. | **Yes** - `GET /api/scores/daily` |
| `contributions/ContributionYearGrid.tsx` | - | The GitHub-style week-column view. | No |
| `contributions/ContributionMonths.tsx` | - | The LeetCode-style month view. | No |
| `contributions/useContributionData.ts` | - | The fetch, the dense map, the timezone anchor. | **Yes** |
| `AchievementsStrip.tsx` | - | Unlocked + ghosted next, metallic medallions. | **Yes** - 2 endpoints |
| `InsightOfTheDay.tsx` | 283 | One sentence + one action. | **Yes** - `GET /api/insights/latest` |
| `QuickActions.tsx` | 117 | 2x2 deep links + mobile FAB. | No |
| `QuoteDisplay.tsx` | - | Quote of the day. | **Yes** |

Pure modules, no React:

| File | Role | Tests |
| ---- | ---- | ----- |
| `lib/dashboard/derive.ts` | Goal pace, day-type bucketing, `meanOfPresent` | 24 |
| `lib/dashboard/contributions.ts` | Year/month grid geometry, consistency stats | 27 |
| `lib/scheduling/day-type.ts` | The pure day-type rule | via `derive` |

### Shared design system (`src/components/dashboard-ui/`)

| File | Role |
| ---- | ---- |
| `Panel.tsx` | The card surface + its four states (default / loading / error / empty). Owns the A3 glass material. |
| `RadialGauge.tsx` | The ring, implemented once. A5 draw-on. |
| `layout.tsx` | `AdaptiveColumns` only. |
| `accent.ts` | The eight domain hues. |
| `tokens.ts` | Status / health / tier / heat ramp / radius / elevation / motion. |
| `primitives.tsx` | `Tag`, `PanelEmpty`. |

---

## 4. Frontend architecture

### 4.1 One request, one provider

Six widgets read the same trailing window of `DailyScore` rows. They share
`DashboardOverviewProvider` (`useDashboardOverview.tsx`), which issues exactly one
`GET /api/dashboard/overview`.

```
DashboardPage (server)
  └── DashboardOverviewProvider        <- the only fetcher for trend data
        ├── MomentumPanel          ┐
        ├── LifeBalanceRadar       │
        ├── DayTypePerformance     │
        ├── RoutineAdherence       ├── all read `useDashboardOverview()`
        ├── WeeklyRecap            │
        ├── GoalsVelocity          │
        ├── HeaderStrip            ┘
        └── ContextStrip           (also fetches /api/routine/today)
```

`useDashboardOverview()` **throws** outside its provider rather than silently
issuing a second request. A widget that forgot the wrapper should fail loudly in
development, not quietly multiply the page's traffic.

The window is always the full 30 days. The Momentum 7d/30d toggle slices it
client-side rather than refetching - that toggle sits on the hero card, and a
round trip there reads as the chart hanging.

### 4.2 Widget gating is an external store, not an effect

`WidgetGate` reads `localStorage` through `useSyncExternalStore`. It does **not**
use `useState` + `useEffect`, which would set state synchronously inside an effect
and force a `null` sentinel to avoid a hydration mismatch - rendering *nothing*
on the first pass, so every gated widget flashed out and back on load.

`readPreferences()` caches its result against the raw storage string.
`useSyncExternalStore` requires a referentially stable snapshot and throws
otherwise, so an uncached parser would make the store un-subscribeable.

All eleven gates share one subscription, not eleven.

### 4.3 The data contract

`src/types/dashboard.ts`. The load-bearing rule:

> **`null` never means zero.**

A `DailyScore` row with `totalScore: null` is a day that was never scored.
Averaging it as `0` draws a cliff for a day the user simply had no data for. The
service returns a **dense** array covering every date in the window, with all-null
metrics for unscored days, so consumers can position them correctly in time.
A 30-day view with three gaps would otherwise draw three *consecutive* columns
and imply the user scored on days that were never scored.

---

## 5. Backend / API architecture

### 5.1 The one new endpoint

`GET /api/dashboard/overview?days=30` -> `src/app/api/dashboard/overview/route.ts`
-> `DashboardOverviewService.getOverview` (`dashboard-overview.service.ts`).

Thin route, per `FILE.MD`: authenticate, validate `days` with Zod (7-90, `.catch`
to the default), delegate, shape the error.

### 5.2 Query budget - 8 queries, all concurrent

| # | Repository call | Supplies |
| - | --------------- | -------- |
| 1 | `UserRepository.getSettings` | timezone |
| 2 | `ScoreRepository.findByRange` | the `days` array |
| 3 | `StreakRepository.findByUserId` | streak |
| 4 | `RoutineRepository.listDayTypeDefinitions` | day-type display names |
| 5 | `RoutineRepository.findExceptionsByRange` | day-type overrides |
| 6 | `GoalRepository.findAll` | goals velocity + radar axis |
| 7 | `FocusRepository.getStats` | radar axis |
| 8 | `RoutineRepository.findLogsByRange` | biggest recurring miss |

All eight are in one `Promise.all`, so the endpoint costs one round trip's
latency, not eight.

**Queries 4 and 5 exist specifically to avoid a N+1.** `resolveDayTypeForDate` is
2 queries per date; over the 30-day window that is 60 queries. The service
bulk-loads definitions and exceptions once and applies the *pure* rule
(`resolveDayTypeFromException`) per date. Same rule, one query.

### 5.3 Response shape

| Field | Shape | Notes |
| ----- | ----- | ----- |
| `today`, `timezone` | `string` | |
| `days` | `DashboardDay[]` | Dense, ascending, `windowDays` long. |
| `windowDays` | `number` | 7-90. |
| `streak` | `{current, longest, lastCompletedDate}` | |
| `dayTypes` | `{dayTypeName, averageScore, scoredDays}[]` | User's own names, best-first. Low-sample types are **included** here; the widget filters. |
| `radar` | `{axes[], daysWithData}` | `axes[].value` is `number | null`. |
| `goals` | `{active, onPace, previousOnPace, furthestBehind}` | |
| `routineMisses` | `{blockTitle, misses}[]` | Gated at 2+ occurrences, top 3. |
| `focus` | `{totalMinutes, sessions}` | |

### 5.4 Radar axes - where each number comes from

| Axis | Source | Normalisation |
| ---- | ------ | ------------- |
| Habits | `habitCompletionRate`, trailing 7 scored days | Already 0-100. |
| Routine | `routineCompletionRate` | Already 0-100. |
| Sleep | `sleepScore` | Already 0-100. |
| Goals | `onPace / active` | 0-100. **`null` when `active === 0`.** |
| Focus | `getStats` over the trailing 7 days | Against `FOCUS_DAILY_REFERENCE_MINUTES = 50/day`. |

Goals and Focus are the two axes that do **not** exist in `DailyScore` at all -
which is why they needed real queries rather than another derivation of data
already on the page.

---

## 6. Database dependency

Reads only, via repositories. The page never touches Prisma directly.

| Model | Read by | For |
| ----- | ------- | --- |
| `UserSettings` | `getSettings` | timezone |
| `DailyScore` | `findByRange` | every trend widget |
| `Streak` | `findByUserId` | streak arc, global badge |
| `DayTypeDefinition` | `listDayTypeDefinitions` | day-type display names |
| `RoutineException` | `findExceptionsByRange` | day-type overrides |
| `Goal` | `findAll` | goals velocity, radar |
| `FocusSession` | `getStats` | radar focus axis |
| `RoutineLog` | `findLogsByRange` | recurring-miss detection |
| `Habit`, `HabitLog` | `/api/habits/health` | habit health |
| `Achievement` | `/api/achievements{,/next}` | strip |
| `Insight` | `/api/insights/latest` | AI insight |

No writes. The page cannot mutate anything.

---

## 7. Date, timezone and day-type logic

### 7.1 The day-type rule is now importable without a database

| File | Contains | Imports a repository? |
| ---- | -------- | --------------------- |
| `lib/scheduling/day-type.ts` | `resolveNaturalDayType`, `resolveDayTypeFromException`, `getDayTypeSlug` | **No** |
| `lib/scheduling/resolve-routine.ts` | `resolveDayTypeForDate` (async, DB), plus re-exports | Yes |

The split is not cosmetic. Keeping the pure rule beside the DB-backed function
meant importing anything from `resolve-routine` transitively evaluated
`@/lib/prisma`, which **throws at import time** without `DATABASE_URL` - so the
pure half was untestable and the dashboard derivation had to mock the entire
repository layer to get a unit test running. `day-type.ts` has no such import.

`resolve-routine.ts` re-exports the pure half, so all eight existing call sites
(`day-mode.service`, `goal.service`, `scoring.service`, `routine.service`,
`notifications/scheduler`, `habits/eligibility`, `context`, and the dashboard)
keep one import path and there is exactly one implementation of the rule.

### 7.2 Calendar dates are never derived from an instant

Every place that recovers a weekday from a `YYYY-MM-DD` string parses it as **UTC
midnight** and formats in **UTC**:

- `resolveNaturalDayType` - formatting UTC midnight in a zone behind UTC renders
  the previous day, which swapped every user's weekdays and weekends.
- `RoutineAdherence.weekdayIndex` - same rule, same reason.
- `WeeklyRecap.weekdayOf`, `ContextStrip.weeklyVerdict`,
  `HeaderStrip.weekdayShort`, `ContributionHeatmap` - all use
  `new Date(\`${date}T00:00:00.000Z\`).getUTCDay()`.

`DashboardOverviewService.toPaceGoals` flattens `Goal.startDate` / `endDate` to
calendar dates in UTC for the same reason: a goal's start day is a fact about the
calendar, not about an instant.

### 7.3 `timezone`

`DEFAULT_TZ` fallback, `getTodayString(timezone)` for "today", and
`fromZonedTime` for the focus query's `Date` bounds. `formatInTimeZone(..., timezone,
'yyyy-MM-dd')` for the streak's `lastCompletedDate`.

---

## 8. User actions the page can perform

**There are no checkboxes, no toggles and no "mark done" buttons on this page.**
That is the defining constraint, not an accident of layout.

| Action | Where it lives now |
| ------ | ------------------ |
| Tick a habit | `/today` checklist, `/habits` |
| Log sleep | `/today#today-sleep` |
| Write a reflection | `/today#today-reflection` |
| Edit day type | `/today` (the dashboard pill is read-only and links out) |
| Mark a routine block done/missed | `/today` Right-now card |
| Check off a goal | `/today`, `/goals` |

What the page *does* let you do:

| Action | Mechanism |
| ------ | --------- |
| Change the Momentum range 7d/30d | local state, no request |
| Open a day's score in the mini strip | local state popover, read-only |
| Expand the heatmap to a full year | local state modal |
| Regenerate an AI insight | `POST /api/insights/generate` |
| Refresh the weekly recap | re-reads the shared overview |
| Navigate anywhere | links: Quick Actions, feature hub, radar axis labels, card actions, "Go to Today" |

### 8.1 Quick Actions deep links

Three of the four tiles pointed at bare `/today`, which lands the user at the top
of the page with no indication of which card they wanted. The anchors already
existed in the `/today` DOM and were dead in the previous audit:

| Tile | Target | Anchor exists? |
| ---- | ------ | -------------- |
| Log a habit | `/today` | n/a |
| Start focus | `/focus` | n/a |
| Start sleep | `/today#today-sleep` | Yes - `Stagger id="today-sleep"`, `today/page.tsx:221` |
| Add reflection | `/today#today-reflection` | Yes - `Stagger id="today-reflection"`, `today/page.tsx:230` |

---

## 9. What the user can create / edit / delete

**Nothing.** The page is read-only by construction. Every mutation in the app
happens on a page that owns that domain.

The previous page had three mutation surfaces that are now gone: the Right Now
card's Done/Missed buttons (`POST /api/routine/today`), the Habits metric
checklist, and the Habit Health per-row tick. The Habit Health rows are now
`<Link href={/habits/[id]}>`.

---

## 10. Widget gating and personalisation

### 10.1 The key list

`DASHBOARD_WIDGETS` in `DashboardWidgets.tsx`. **One key per widget.**

| Key | Label | Default |
| --- | ----- | ------- |
| `heatmap` | Consistency heatmap | on |
| `radar` | Life balance radar | on |
| `dayTypes` | Day-type breakdown | on |
| `habitHealth` | Habit health | on |
| `adherence` | Routine adherence | on |
| `recap` | Weekly recap | on |
| `goalsVelocity` | Goals velocity | on |
| `achievements` | Achievements strip | on |
| `insights` | AI insights | **off** |
| `quickActions` | Quick actions | on |
| `quotes` | Quote of the day | on |

The pre-v2 list had **six keys for fifteen widgets**. Several widgets shared
`tasks` or `summary`, so a Settings label named "Routine" actually toggled the
heatmap and the trend chart, and nine widgets had no key at all and could not be
toggled at all.

### 10.2 What is not gated

The header strip, the feature hub, the page background and the **Momentum panel**
are permanent. A switch that hides the nav row would be a discoverability problem,
not a preference.

### 10.3 Storage and propagation

Per-device `localStorage` under `routineos.dashboard.widgets`. Not synced to the
account - the documented behaviour of that settings page.

Cross-component propagation uses a `routineos:dashboard-widgets` event in addition
to the `storage` event. `storage` only fires in *other* tabs, so without the
custom signal a Settings toggle did nothing to a dashboard already open behind
it, while the page promised "Changes apply immediately."

### 10.4 Backwards compatibility

`readPreferences` only applies keys still in the list, so a user with a stale
`score` / `streaks` / `goals` / `wellness` entry is unaffected - those keys are
silently dropped rather than resurrected.

### 10.5 `AdaptiveColumns` takes a list, not a key

The right column holds four independently-gated widgets. Collapsing it because
one (`insights`, the only default-off widget) is disabled would hide the other
three. It therefore takes `rightKeys: string[]` and renders the column when at
least one is enabled.

---

## 11. Loading / error / empty / edge states

Every state lives in one place (`Panel`), so a new widget cannot repeat the
omissions the previous page had by accident.

### 11.1 Per-widget state matrix

| Widget | Loading | Error | Empty / gated |
| ------ | ------- | ----- | ------------- |
| Momentum | 3-zone skeleton matching the 6/3/3 grid | inline, retry | **Flat dashed line + "Not enough days yet"** below 2 scored days |
| Radar | skeleton | inline, retry | **Faded dashed pentagon** below 3 scored days |
| Day-Type | skeleton | inline, retry | "No scored days yet" |
| Adherence | skeleton | inline, retry | "No routine data this week" |
| Weekly Recap | skeleton | inline, retry | "Nothing scored this week yet" |
| Goals Velocity | skeleton | inline, retry | "No active goals" |
| Habit Health | skeleton | inline, retry | "No active habits yet"; failed **refetch** degrades to a banner, keeping valid bars |
| Heatmap | 26x7 cell skeleton + controls | inline, retry | "No activity recorded yet" |
| Achievements | 9 medallion slots | inline, retry | "Nothing to show yet" |
| AI Insight | skeleton | inline, retry | Invitation + Generate (not a void) |
| Quick Actions | n/a | n/a | n/a |
| Header strip | 7 dot placeholders | n/a | n/a |
| Context strip | inline bar | degrades to verdict only | n/a |

### 11.2 The two explicit minimum-data gates

The pre-v2 audit's F2 was: Day Pulse coerced a missing score to `0` and drew a
**confident empty gauge** next to the words "nothing logged yet" - the number and
the message contradicted each other, and a large `0` reads as failure rather than
absence.

Two gates now stand in its place, both exported from the service so the widget
and the data layer cannot disagree:

| Gate | Threshold | Behaviour below it |
| ---- | --------- | ------------------ |
| `RADAR_MIN_DAYS` | 3 scored days in the trailing 7 | Faded dashed pentagon + "Not enough data yet this week" |
| `DAY_TYPE_MIN_SCORED_DAYS` | 3 scored days for that type | Muted "not enough data yet" row, **no bar** |

`DAY_TYPE_MIN_SCORED_DAYS` matters because "Exam Day 48" from a *single* exam day
is pixel-identical to a real, stable pattern. A missing bar is honest; a
one-sample bar is a lie with an axis.

### 11.3 The Consistency card: one dataset, two views

The card merges **two visualisation traditions behind one view toggle**, because
they answer different questions about the same trailing year and neither shape
subsumes the other.

| View | Shape | The question it answers |
| ---- | ----- | ---------------------- |
| **Year** | GitHub contribution graph: one column per week, seven weekday rows, back-filled to Sunday | "Is my consistency trending up or down? Which weekday do I always miss?" |
| **Months** | LeetCode streak calendar: one block per calendar month, day 1 placed in its own weekday row, cells numbered by date | "How did October actually go? How many days did I log this month?" |

Neither is a second widget. Both read the same `byDate` map, the same
`HEAT_FILL` gradient, the same tooltip copy and the same stats row, so they
cannot disagree about the user's history. A year selector appears only when the
366-day window actually crosses two calendar years.

The stats row (**active days · current streak · longest run · best weekday**) is
computed by `computeStats` from the same rows the grid paints, **not** read from
`GET /api/streak`. A header reading "current streak 9" above a calendar with a
visible gap in it is the exact small contradiction that makes a dashboard
untrustworthy.

Layout geometry lives in `src/lib/dashboard/contributions.ts` — pure, and
**27 unit tests**. It was previously inline in a `'use client'` module that
imports the settings store, which made it untestable; and grid geometry is
precisely the kind of code where an off-by-one is invisible until someone reads
the wrong week.

Two facts the geometry must never fudge, both asserted in those tests:

| `null` means | Rendered as | If it were drawn as a zero |
| ------------ | ----------- | -------------------------- |
| No stored `DailyScore` row for that date | An untinted gap | "You had a bad week" |
| The month has no such day (February, the 30th) | Nothing at all | Four invented days a month |

`currentStreak` ends on the most recent *scored* day rather than requiring today
specifically — a run that ended yesterday is still a run, it simply is not
current today, and the grid already shows the gap on its own.

### 11.4 Failure containment

A failure in the shared provider costs the six widgets that read it. The heatmap,
habit health, achievements, insight, quotes and quick actions fetch
independently and are unaffected. No card's failure collapses another's height -
the error branch renders inside the card's own footprint for exactly that reason.

---

## 12. Design system: the DNA and how it is applied

The standing design standard. Part A is reusable across the app; Part B governs
this page specifically.

### 12.1 Canvas and background

| Token | Value | Note |
| ----- | ----- | ---- |
| `--canvas-light` | `#fafafa` | Near-white, warm undertone. Was flat `#fff`. |
| `--canvas-dark` | `#0a0a0f` | Near-black with a **blue** cast, so the mesh's violet and sky blooms sit on the ground instead of fighting a neutral zinc. |

`.gradient-mesh-animated` is 4 domain-coloured blooms drifting on a **48s** cycle
(previously 26s, fast enough to read as a screensaver). `.noise-overlay` is at
**3%** (was 4.5%, which on a near-black canvas reads as video noise rather than
paper grain).

### 12.2 The card material (A3) - three layers

```
1. BLUR   backdrop-filter: blur(24px) saturate(140%)
2. TINT   the card's domain colour at 6-9%, a 135deg diagonal gradient
3. EDGE   1px gradient border, bright top-left -> transparent bottom-right
```

Implemented once in `globals.css` as `.glass-panel` and consumed by `Panel` via
`--glass-hue`. Pseudo-element order is load-bearing: `::before` is the TINT and
paints *below* children; `::after` is the EDGE and paints *above* them but is
transparent in the interior, so it never occludes content.

**`.glass-panel-lift` is separate and opt-in.** The A3 hover (3px lift, blur
24->28px, directional glow from `--mx`/`--my`) is deliberately *not* baked into
`.glass-panel`, because ~40 call sites across the app pair `.glass-panel` with
their own `hover:-translate-y-*`. Both selectors have equal specificity, so baking
the lift in would override them depending on stylesheet order.

### 12.3 Motion vocabulary (A5) - 2-3 per page, never all

| Effect | Where on this page | Primitive |
| ------ | ------------------ | --------- |
| Kinetic count-up, spring overshoot | Momentum's weekly average, streak number | `useCountUp(v, d, { spring: true })` |
| SVG ring / line draw-on, 900ms | Streak arc, every `RadialGauge`, the trend line, badge progress rings | `.ring-draw`, `.line-draw` |
| Staggered entrance, 12px rise | Every section, via `<Mount delay>` | existing `.dash-enter` |
| Magnetic micro-tilt, max 4deg | **Momentum panel only** | `.magnetic-tilt` + `useMagneticTilt` |
| One-shot glow pulse, 1.2s | The "vs last week" delta badge, positive only | `.glow-pulse-once` |
| Holographic shimmer, 8s | **Achievements medallions only** | `.shimmer-holographic` |
| Breathing ring, 3s | Today's dot in the mini strip | `.breathe-ring` |
| Metallic rim | Unlocked achievement medallions | `.medallion-metal` |

Two additions beyond A5, both from B5 and both rationed the same way:

| Addition | Why |
| -------- | --- |
| `.medallion-metal` | A domain-tinted edge says "this card belongs to Habits". A *metal* rim says "this was forged", which is what a badge is. Deliberately not a domain hue, and it desaturates in light mode where bright metal would vanish. |
| `.glass-overlay` | A7's depth level 2. An overlay is **not** the card material at a heavier blur — a 58%-opaque card surface at 32px blur over the aurora mesh reads as a slightly-fuzzy card rather than as a layer above the page. It gets a heavier blur *and* a more opaque fill. |

The Consistency card's stats header uses A4's hero number treatment
(`font-display`, bold, tabular) at 18px rather than the page's single 64px slot,
so the one number that matters is not competing with Momentum's weekly average.

The trend line and the radar polygon share a treatment on purpose: the visual
rhyme is what makes the page read as one coherent system rather than six
unrelated widgets.

All primitives are neutralised by `.reduce-motion` and
`prefers-reduced-motion`. `ring-draw` is deliberately **excluded** from that
list: its keyframes run from "empty ring" to the element's own resting
`stroke-dashoffset`, so cancelling it leaves a correctly drawn ring, whereas
killing it like the others would leave rings mid-draw.

### 12.4 Gold is rationed

`--accent-gold` is **not** in `DOMAIN_ACCENT` and is not reachable as an ordinary
identity hue. Its only sanctioned consumers are the streak tier resolver
(`StreakFlame.tsx`, tier 3 at 30+ days) and the global header badge, which uses
the same resolver - so a 30-day streak is the same gold in both places and cannot
drift.

### 12.5 What this page explicitly does not do

No 3D, no particles, no custom cursor, no scroll-hijacking, no page-transition
morphing, no sound, no glitch text, no magnetic elements outside the one hero
card. The mini-strip dots get **colour only** - no glow, no gradient - because at
7px anything heavier is noise.

### 12.6 The micro-tilt is a pointermove handler, and that matters

`useMagneticTilt` writes `--tilt-x`, `--tilt-y`, `--mx`, `--my` **straight to the
DOM**. Routing them through React state would re-render the entire hero card -
including the gradient area fill, the SVG trend path and the streak arc - on every
mouse move. The card is never re-rendered; four custom properties on one element
change. It bails out early on `(pointer: coarse)`.

### 12.7 Every card is the same material

Ten cards, one surface. Seven render through `Panel`; `MomentumPanel`,
`AchievementsStrip` and the two grid views compose `.glass-panel` directly because
their anatomy is genuinely different. The remaining three -
`QuickActions`, `QuoteDisplay` and the Consistency card's shell - take
`.glass-panel` + `.glass-panel-lift` directly rather than the older
`bg-card/70` + `border` + `shadow-raised` stack, which is what they all used to do
and is the reason a page drifts: the surface stops matching the material on the
other cards and nobody notices until the whole thing looks assembled rather than
designed.

`AchievementsStrip` is now a `Panel` like the rest, which also gave it the shared
loading/error/empty contract instead of a hand-rolled one, and a `hue` prop so it
can be **gold** rather than flame-orange - A2 reserves gold for "a new
achievement", which is the case it names, and `domain="streak"` would have given
it a different, less earned signal.

---

## 13. Performance

### 13.1 Client requests on first paint

| # | Endpoint | Issued by | Notes |
| - | -------- | --------- | ----- |
| 1 | `GET /api/dashboard/overview?days=30` | `DashboardOverviewProvider` | **Serves six widgets.** 8 DB queries. |
| 2 | `GET /api/routine/today` | `ContextStrip` | Right-now chip only. |
| 3 | `GET /api/habits/health?days=28` | `HabitHealthWidget` | |
| 4 | `GET /api/scores/daily?...` | `ContributionHeatmap` | 366 rows, slices to 91. |
| 5 | `GET /api/achievements?limit=6` | `AchievementsStrip` | Parallel with #6. |
| 6 | `GET /api/achievements/next?count=3` | `AchievementsStrip` | |
| 7 | `GET /api/insights/latest?period=WEEKLY` | `InsightOfTheDay` | **Only if `insights` is enabled.** |
| 8 | `GET /api/quotes/random?...` | `QuoteDisplay` | **Only if `quotes` is enabled.** |
| 9 | `GET /api/streak` | `StreakBadge` | Global header; fires on every page in the app. |
| - | `resolveDayTypeForDate` | `page.tsx` server-side | 2 queries, not a client request. |

**Nine client requests on first paint**, and eight once the default-off widgets
are accounted for. The pre-v2 page issued **fourteen** independent widget fetches
- and additionally polled `/api/routine/today` **twice** and `/api/habits/today`
**twice**, because two widgets each fetched the same resource and nothing shared
it.

One further endpoint exists but is **not** on the first-paint path:
`POST /api/insights/generate` fires only when the user presses Regenerate.

*(derived)* The heatmap fetches 366 rows to render 91. Fetching the full year once
is cheaper than two endpoints and makes the expand modal open instantly instead of
showing a spinner.

### 13.2 Rendering

- `Panel` boxes are transform/opacity only. `.glass-panel` transitions only
  `transform`, `backdrop-filter`, `border-color` and `box-shadow`.
- `.magnetic-tilt` sets `will-change: transform`, and only on desktop.
- Heatmap cells: 91 (or 366 expanded) `motion.div`s, each a transform + opacity.
  Hover is a 1px lift at 150ms - the cheapest effect on the page, deliberately,
  because there are 90+ of them.
- The Momentum 7d/30d toggle re-renders the panel but issues **no** request.

### 13.3 Bundle

No new runtime dependency. The redesign **deleted** `DayPulse`, `RightNow`,
`Timeline`, `MetricsRow`, `HeroCard`, `useDayScore`, `TrendChart`, `MetricCard` and
`ScrollableCard`.

---

## 14. Authentication and security

| Concern | Status |
| ------- | ------ |
| Route auth | `auth()` in `page.tsx`, `redirect('/login')` if absent. |
| API auth | `session?.user?.id` in the route; 401 otherwise. |
| Client-supplied userId | **Never trusted.** No endpoint on this page accepts one. |
| Input validation | `days` is Zod-validated, `coerce.number().int().min(7).max(90).catch(30)`. |
| Writes | None. See section 9. |
| XSS | No `dangerouslySetInnerHTML`. Recap copy is string-built from numeric values and block titles. |
| Timezone | Never taken from the client; always the user's stored setting. |

---

## 15. Accessibility

| Concern | Handling |
| ------- | -------- |
| Landmark + labelling | `aria-label` on every panel, section and control. |
| Range toggle | `role="tablist"` / `role="tab"` / `aria-selected`. |
| Health buckets | Same tablist semantics, counts in the label. |
| Progress bars | `role="progressbar"` with `aria-valuenow/min/max/label`. **Omitted entirely when the value is `null`** - a progressbar with no value is worse than none. |
| Score series | The trend SVG is `aria-hidden`; the values are in the surrounding text. Radar carries a full `aria-label` sentence. |
| Mini strip | Each dot is a `<button>` with a descriptive `aria-label`; the weekday is `sr-only`. |
| Motion | Every primitive neutralised by both `prefers-reduced-motion` and the in-app `animationsEnabled` setting (`applyAppearance()`). |
| Colour is never the only signal | Every bar and chip has a number or a text label beside it. Radar vertices with no data are hollow, not just grey. |
| Keyboard | All controls are native `<button>` / `<a>` / `<Link>`. No custom tab widgets. |
| Focus | Modals (heatmap) close on Escape. |

---

## 16. Relationship to `/today`

The v1/v2 split. Everything in this table was deliberately removed from
`/dashboard` because `/today` already owned it.

| Was on `/dashboard` | Now owned by | Reason |
| ------------------- | ------------ | ------ |
| Day Pulse hero (score ring) | `/today` `TodayScore` | Recalculated on read here, on write there. Two strategies, one number, and they could disagree. |
| Right Now countdown ring + Done/Missed | `/today` `CurrentRoutineBlock` | An interactive control on a read-only page is a category error. The one-line chip remains. |
| 24h Timeline | `/routine`, `/today` | A schedule is a single-day concept. Replaced by 7-day adherence. |
| Streak metric card | `/today` `StreakCard` + header badge + Momentum arc | Was its own competing answer to "how am I doing". |
| Habits metric (ring + fraction) | `/today` checklist | Replaced by 28-day Habit Health. |
| Goals metric | `/today` `TodayGoals` | Replaced by aggregate velocity. |
| Sleep metric | `/today` `TodaySleep` | **Dropped. See section 19.** |
| Day Type picker | `/today` `TodayDayType` | Two editable surfaces for one setting. |
| TrendChart | Momentum panel | Was a fourth view of the same series. |

Both pages now read the same two day-type sources, and both link to the same
anchors. `/dashboard` has no habit-write path and no routine-write path, so it is
impossible for the two pages to disagree about *what has been logged today*.

---

## 17. Dead and orphaned code

Removed in v2:

| File | Was |
| ---- | --- |
| `dashboard/DayPulse.tsx` | The hero. |
| `dashboard/RightNow.tsx` | The countdown card. |
| `dashboard/Timeline.tsx` | The 24h strip. |
| `dashboard/MetricsRow.tsx` | `DayPulseHero` + 4 metric cards. |
| `dashboard/HeroCard.tsx` | The merged 8/4 wrapper for the above two. |
| `dashboard/useDayScore.ts` | The hero's fetch hook. |
| `dashboard/TrendChart.tsx` | Folded into Momentum. |
| `dashboard-ui/MetricCard.tsx` | The metrics-row anatomy. Its only consumer was `MetricsRow`. |
| `dashboard/ScrollableCard.tsx` | Only consumer was the old `HabitHealthWidget`. |
| `dashboard-ui/layout.tsx` -> `stagger()` | Existed only for the metrics row. |

`MetricCard` is worth calling out: an exported card component left behind
invites the next person to reintroduce the duplicate-card pattern it was built
for.

---

## 18. Resolution of the pre-v2 findings

| Pre-v2 finding | Resolution |
| -------------- | ---------- |
| **F2** Day Pulse had no empty state; showed a confident `0` | Component deleted. `RADAR_MIN_DAYS` and `DAY_TYPE_MIN_SCORED_DAYS` gates replace it, and Momentum's own empty state draws a dashed baseline rather than an axis. |
| **F6 / 17.3** Habit Health and the Habits metric disagreed on "due today" | The metric is deleted. Habit Health no longer counts "due today" at all - it is a 28-day pattern with a header that says so. There is no second definition left to diverge. |
| **F7** RightNow showed a finished block as "Next" | The interactive card is deleted. The context chip derives from the same `getCurrentBlock` helper `/today` uses. |
| **F8** Gate labels did not match widgets | 11 keys, one per widget, labels naming what they switch. |
| **F15** Duplicated polling (`/api/routine/today` x2, `/api/habits/today` x2) | Both interactive widgets deleted. Six widgets now share one request through one provider. |
| **12.3** 9 of 15 widgets could not be toggled | Every widget is individually gated except the header strip and feature hub, which are permanent chrome. |
| Stale dead anchors `/today#today-sleep`, `/today#today-reflection` | Quick Actions now uses them. |
| Route skeleton described the deleted layout | `loading.tsx` rewritten to mirror the new one, including the 6/3/3 hero split and the 26x7 heatmap. |

Two **behaviour changes** are worth explicit sign-off, because they are
deliberate and a user could reasonably feel them:

1. **"On pace" is now measured against a pace line**, not a flat 40%-or-15%
   threshold picked from days remaining. The old threshold moved as the deadline
   approached *without any progress being logged*, so a goal could flip from "on
   track" to "not on track" purely because time passed, and two goals with
   identical progress landed on opposite sides of it purely because their
   deadlines differed. A goal now reads "not on pace" as its deadline closes with
   no logging - which is correct, but is a change.
   *(Implementation: `goalPace` in `lib/dashboard/derive.ts`, 11 unit tests.)*

2. **The focus radar axis normalises against a hardcoded 50 min/day**, because
   `UserSettings` has no focus target to use. `minSleepDuration` is the only
   duration setting. A user whose real target is 25 or 120 minutes will see this
   axis disagree with their intent. See section 19.

---

## 19. Open items and known limitations

| # | Item | Impact |
| - | ---- | ------ |
| 1 | **No sleep surface on `/dashboard`.** The redesign spec's removal table promised a 7-day sleep trend "inside the new Wellness panel", but no Wellness panel appears in its page architecture, section list or state rules, so none was built. Sleep is now only on `/today` and `/wellness`. | The radar's Sleep axis is the only aggregated sleep read on the page. Adding a small Wellness card is a self-contained follow-up. |
| 2 | **Focus normalisation constant.** 50 min/day, hardcoded, not a user setting. | The Focus axis is not configurable. The clean fix is a `UserSettings.focusTargetMinutes` column **plus** an entry in `updateSettingsSchema` - the schema is a plain `z.object`, so a column missing from it appears to save and then reverts on reload. |
| 3 | **`DayTypePerformance` filters in the widget, the service does not.** | Deliberate: "hide it" is a presentation decision. But it means `dayTypes` ships low-sample buckets over the wire. Cheap to filter server-side if it ever matters. |
| 4 | **Weekly Recap is rule-based, not AI.** Two sentences derived from the same window. | Cannot hallucinate, needs no model, but it cannot say anything the rules do not cover. Distinct from AI Insight on purpose. |
| 5 | **`/api/recap/weekly` still exists and is still an N+1.** | Nothing on the dashboard uses it. Any other caller still pays one `findLogsByRange` per habit. |
| 6 | **Heatmap duplicates the score window.** It fetches its own `/api/scores/daily` rather than reading the 30 days already in the provider. | Unavoidable: the grid needs 366 days, the provider holds 30. Merging would mean the provider always fetching a year. |
| 7 | **The year view shows 366 days, not the pre-v2 default of 91.** | The two views need different resolutions, and a year strip is only legible with room for ~52 columns. Horizontal scroll is GitHub's own answer, and 26 weeks is a one-line change to `WINDOW_DAYS` if the density is a problem. |
| 8 | **`ContributionHeatmap` keeps its filename.** | It is no longer only a heatmap, it is the Consistency card with two views. Renaming touches the page, the gate key and the loading skeleton for no behavioural gain. |

---

## 20. Reproduction commands

```bash
npm run type-check        # tsc --noEmit, strict + noUncheckedIndexedAccess
npm test                  # vitest, 4 files / 68 tests, no DB
npm run build             # next build
npm run lint              # eslint . -> 0 errors, 161 warnings (baseline was 165)

npx vitest run tests/lib/dashboard-derive.test.ts         # 24 - goal pace, day-type bucketing
npx vitest run tests/lib/dashboard-contributions.test.ts # 27 - grid geometry, streak stats
```

Every file reachable from this page is **warning-free**:

```bash
npx eslint src/components/dashboard src/components/dashboard-ui \
  src/components/streak src/lib/dashboard src/lib/scheduling \
  src/server/services/dashboard-overview.service.ts \
  "src/app/(dashboard)/dashboard" "src/app/(dashboard)/settings/dashboard" \
  tests/lib
# -> no output
```

The repo-wide 161 warnings are pre-existing `react-hooks` / `no-console`
advisories elsewhere in the tree. The redesign is **net -13** against the 165
baseline: it removed 13 pre-existing advisories (the `WidgetGate` and
`AdaptiveColumns` set-state effects, three `no-non-null-assertion`s in the
heatmap, the habit-health fetch) and added none.
