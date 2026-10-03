# `/analytics` — Complete System Audit

**Route:** `http://localhost:3000/analytics`
**Route file:** `src/app/(dashboard)/analytics/page.tsx` (538 physical lines, `'use client'`)
**Project:** RoutineOS (`daily-plan`) — Next.js (App Router) + Prisma + PostgreSQL (Neon)
**Audit date:** 2026-09-30 · **Revised:** 2026-10-03 (**implementation pass** — the correctness and query-cost findings in the original audit are now fixed; see [§28](#28-what-changed-in-the-2026-10-03-pass))
**Status of this document:** describes **only** what exists in the codebase. Every claim is file-anchored.

> **Line-count convention:** **physical** line counts. PowerShell's `Measure-Object -Line` skips blank lines.

> **The four denominators are now one.** The original audit's headline defect was that "habit completion rate" meant four different things across the day / week / month / year tabs. It is now a single definition — `completed / scheduled`, with `scheduled` derived from the eligibility rule — computed once per request in `src/lib/analytics/period-habits.ts` and shared by every surface. See [§26](#26-completion-rate-definition-drift).

> **Query cost is now flat and habit-count-independent.** The original audit measured ~28 (day) to ~55 (year) queries with six N+1 loops. It is now **~28–32 for every period, and independent of how many habits or goals the user owns**. See [§18](#18-performance).

---

## Table of contents

| §   | Section                                                                                                         |
| --- | --------------------------------------------------------------------------------------------------------------- |
| 1   | [What `/analytics` is, in one paragraph](#1-what-analytics-is-in-one-paragraph)                                 |
| 2   | [UI block diagram](#2-ui-block-diagram)                                                                         |
| 3   | [UI → component mapping](#3-ui--component-mapping)                                                              |
| 4   | [Frontend architecture](#4-frontend-architecture)                                                               |
| 5   | [Backend / API architecture](#5-backend--api-architecture)                                                      |
| 6   | [Database dependency](#6-database-dependency)                                                                   |
| 7   | [Period and date-range logic](#7-period-and-date-range-logic)                                                   |
| 8   | [Complete user actions (serial)](#8-complete-user-actions-serial)                                               |
| 9   | [What can the user create](#9-what-can-the-user-create)                                                         |
| 10  | [What can the user edit](#10-what-can-the-user-edit)                                                            |
| 11  | [What can the user delete](#11-what-can-the-user-delete)                                                        |
| 12  | [Cross-page dependencies](#12-cross-page-dependencies)                                                          |
| 13  | [Impact analysis](#13-impact-analysis)                                                                          |
| 14  | [Current System Capabilities](#14-current-system-capabilities)                                                  |
| 15  | [Currently NOT Supported](#15-currently-not-supported)                                                          |
| 16  | [Loading / Error / Empty / Edge states](#16-loading--error--empty--edge-states)                                 |
| 17  | [Authentication & security](#17-authentication--security)                                                       |
| 18  | [Performance](#18-performance)                                                                                  |
| 19  | [External integrations](#19-external-integrations)                                                              |
| 20  | [Background jobs / cron effects](#20-background-jobs--cron-effects)                                             |
| 21  | [Data flow diagrams](#21-data-flow-diagrams)                                                                    |
| 22  | [File-by-file dependency inventory](#22-file-by-file-dependency-inventory)                                      |
| 23  | [Current behavior summary](#23-current-behavior-summary)                                                        |
| 24  | [Findings register](#24-findings-register)                                                                     |
| 25  | [Cross-period data leaks](#25-cross-period-data-leaks)                                                         |
| 26  | [Completion-rate definition drift](#26-completion-rate-definition-drift)                                       |
| 27  | [N+1 inventory](#27-n1-inventory)                                                                               |
| 28  | [What changed in the 2026-10-03 pass](#28-what-changed-in-the-2026-10-03-pass)                                 |

---

## 1. What `/analytics` is, in one paragraph

`/analytics` is the app's **cross-domain reporting surface**. It is a `'use client'` Client Component that renders a **period overview** — a hero score ring, four hero sub-tiles, four summary tiles, three side stats and **two charts** — followed by a **collapsible detail section** holding the twelve domain cards. All of it comes from **a single request**: `GET /api/analytics/dashboard?period=&date=`. A four-tab `PeriodControl` (`Today / This week / This month / This year`) with prev/next chevrons and a "Today" link drives the period, and **the period and anchor date now live in the URL** (`?period=&date=`), so a view is linkable, bookmarkable and back-navigable. The server side is `AnalyticsService.getDashboard`, which resolves the timezone, computes the period range, loads **one** period habit model in five queries, and fans the rest out in a single `Promise.all` across 20 repositories. Every figure on the page is computed server-side from Prisma rows; the client derives **no** rate, average or total of its own.

---

## 2. UI block diagram

Layout: `max-w-7xl` container. Structure from `page.tsx`.

```
/analytics  (src/app/(dashboard)/analytics/page.tsx — 'use client')
│
└── <main class="… max-w-7xl">                                  :152
    │
    ├── HEADER ROW                                               :154–207
    │   ├── <h1> <BarChart3/> "Analytics"                        :156–164
    │   ├── <p> "Your report for {range.label}"                  :165–170
    │   ├── <PeriodControl                                        :171–180
    │   │     onPeriodChange={setPeriod}   onPrev={() => step(-1)}
    │   │     onNext={() => step(1)}       onToday={reset}
    │   │     anchorDate  maxAnchor={userToday}  timezone
    │   └── <p role="status" aria-live="polite">                  :188–207
    │         "Updating…" spinner | "<err> — showing the last
    │          loaded period." | (nothing when settled)
    │
    ├── ERROR (no prior data)  {error && data === null}           :124–137
    │            full-page role="alert" :127  + <button>Retry :131
    │
    ├── FIRST LOAD  {!data && <Spinner py-24/>}                   :140–145
    │
    └── MAIN  {data && ( … )}                                     :209–474
        │   wrapped in <div aria-busy={isLoading}
        │                class={isStale ? 'opacity-60' : …}>     :209–211
        │
        ├── OVERVIEW BAND  grid-cols-1 lg:grid-cols-3             :212–393
        │   │
        │   ├── [1] HERO — lg:col-span-2                          :213–304
        │   │     ├── conic-gradient ring, --p = heroPct           :233–237
        │   │     │      ring ONLY when hero.total != null;
        │   │     │      otherwise a dashed empty ring            :239
        │   │     │      centre: Math.round(hero.total) or "—"    :242–244
        │   │     ├── grade line | "No score recorded for this period"  :249–251
        │   │     ├── comparison line                             :253–278
        │   │     │      deltaText(comparison.delta) + exact comparison dates
        │   │     │      OR "No score recorded in {start} – {end} to compare"
        │   │     ├── 4 sub-tiles  Core/Growth/Bonus/Habit reliability  :280–303
        │   │     │      all four populated on EVERY period now
        │   │     └── <dl> of 4 <Tile> rows                         :308–346
        │   │            Routine  percent + "n of m blocks"      :309–317
        │   │            Habits   percentText(habits.rate) + "n of m due"  :318–326
        │   │            Sleep    hours + nights logged           :327–340
        │   │            Mood     /5 + "Average of logged days"  :341–345
        │   │
        │   └── [2] SIDE RAIL — 3 × <SideStat>                     :349–390
        │         ├── CalendarRange  "Average score"                 :350–359
        │         ├── Moon  "Sleep"  "Average per night"             :360–371
        │         └── Flame  tag="All time"  "Current streak"        :377–389
        │                ⚠ tag is explicitly ALL TIME, not the period
        │                   (see the comment at :372–376)
        │
        ├── CHART GRID  grid-cols-1 lg:grid-cols-2                 :394–424
        │   ├── [3] <PeriodChart>  habitChartCopy(period, range.label)  :395–409
        │   │     unit = 'score' (day) | 'percent' (week/month/year)
        │   │     gradient #10b981 → #059669
        │   └── [4] <PeriodChart>  tierChartCopy(period, range.label)    :410–424
        │         unit = 'percent' (day/week/month) | 'score' (year)
        │         gradient #8b5cf6 → #6d28d9
        │
        ├── DETAIL DISCLOSURE                                       :420–457
        │   ├── <section className="mt-6">                          :420
        │   ├── <button aria-expanded={detailOpen}>                :421–437
        │   │     "Explore every domain — habits, routine, wellbeing,
        │   │      focus, goals"   :429–432
        │   │     "Hide" | "Show"                                  :434–436
        │   └── {detailOpen && ( … )}                              :439–456
        │         grid-cols-1 md:grid-cols-2 xl:grid-cols-3         :440
        │         ├── StreakPanel          streaks                 :441
        │         ├── TierMixBar           tierMix                 :442
        │         ├── FocusSummaryCard     focus, periodLabel      :443
        │         ├── TimeAllocationCard   allocation              :444
        │         ├── RoutineDetailCard    routine                 :445
        │         ├── TaskQuadrantCard     tasks                   :446
        │         ├── ProjectProgressList  projects                :447
        │         ├── MilestoneHitsCard    milestones              :448
        │         ├── SleepSnapshotCard    sleep                   :449
        │         ├── NutritionHealthCard  nutrition, health       :450
        │         ├── JournalCard          journal                 :451
        │         └── AchievementsStrip    achievements            :452
        │
        └── MOOD + AI                                               :458–471
            ├── MoodPulseCard  moodPulse                            :458 (always)
            └── AICalloutCard   insight                             :465–470
                  ⚠ ONLY when data.aiInsight — no placeholder branch
```

### 2.1 `Tile` and `SideStat` — local components

`Tile` (`page.tsx:477`) is a `<dt>`/`<dd>` pair: label, tabular-numeral value, hint line, optional leading icon. `SideStat` (`page.tsx:502`) is the icon/tag/label/large-value/hint card — unchanged in shape from the original audit, and all 7 props are still passed at all 3 call sites.

### 2.2 The three charts

| Slot | Component | Data | Text alternative |
| ---- | --------- | ---- | ---------------- |
| Chart 1 | `PeriodChart` → `BarChart` | `data.chart1` | `sr-only` summary sentence + a **figure table** behind a "Show figures" disclosure |
| Chart 2 | `PeriodChart` → `BarChart` | `data.chart2` | same |
| Chart 3 | `MoodPulseCard` → `LineChart` | `data.moodPulse` | ⚠ still none — see §15.6 |

`PeriodChart` (`src/components/analytics/PeriodChart.tsx`, 182 lines) replaces the page-level empty-state branches and the unreachable branch inside `BarChart`. It:

- renders `emptyMessage` when `data` is empty **or every value is `null`** — so "nothing was due" no longer draws an empty axis;
- generates its own summary sentence from the data (`summarise`), so the caption cannot drift from what is plotted;
- exposes a `<table>` of the exact figures, with `No data` for `null` entries, behind `aria-expanded`;
- passes `ariaDescribedBy` to `BarChart` so the SVG points at that table.

`BarChart` gained one prop, `ariaDescribedBy` (`BarChart.tsx:50`–`:53`), forwarded to the `role="img"` div at `:117`.

### 2.3 `PeriodControl` — `src/components/shared/PeriodControl.tsx` (158 lines, unchanged)

```
<div class="…" role="tablist" aria-label="Reporting period">
├── 4 × <button role="tab" aria-selected>      PeriodControl.tsx:93–110
│     labels from PERIOD_LABEL (period-range.ts:63)
├── <button> ‹  Previous period                  :112–122
├── <span> range label  {label}                 :123–132
├── <button> ›  Next period                      :133–145
│     disabled when atCurrentPeriod  = shiftAnchor(anchorDate, period, 1, timezone) > maxAnchor
└── <button> "Today"                             :146–155
```

⚠ `PeriodControl` is unchanged, and the original audit's **F17** (the client computing "am I at the current period" with a different timezone than the server) is now resolved by the page never calling the bare 3-arg `shiftAnchor`: `usePeriodUrlState.step` reads `range.prev` / `range.next` from `getPeriodRange(period, anchorDate, timezone)`, so one function computes the range and both surfaces read it.

---

## 3. UI → component mapping

### 3.1 Direct imports from `page.tsx`

| # | Path | Lines | Directive | Renders |
| - | ---- | ----- | --------- | ------- |
| 1 | `src/components/analytics/PeriodChart.tsx` | 182 | `'use client'` | **New.** The chart + empty state + `sr-only` summary + figure table |
| 2 | `src/components/charts/BarChart.tsx` | 162 | `"use client"` | Recharts vertical/grouped bar chart; now accepts `ariaDescribedBy` |
| 3 | `src/components/analytics/StreakPanel.tsx` | 86 | `'use client'` | 4-up stat grid + risk badge + Longest / Next-milestone `dl` |
| 4 | `src/components/analytics/TierMixBar.tsx` | 67 | `'use client'` | Stacked horizontal bar of habit-tier mix + legend with counts |
| 5 | `src/components/analytics/FocusSummaryCard.tsx` | 95 | `'use client'` | Two `StatTile`s, peak-hours line, breaks `dl` |
| 6 | `src/components/analytics/TaskQuadrantCard.tsx` | 65 | `'use client'` | Eisenhower 2×2 grid + open / overdue counts |
| 7 | `src/components/analytics/ProjectProgressList.tsx` | 73 | `'use client'` | Per-project progress bar list with status label |
| 8 | `src/components/analytics/MoodPulseCard.tsx` | 67 | `'use client'` | `LineChart` of mood + energy |
| 9 | `src/components/analytics/AICalloutCard.tsx` | 83 | `'use client'` | AI insight callout with ✕ dismiss → `DELETE /api/analytics/insights/{id}`. **Its internal `insight === null` placeholder branch is now unreachable from this page** |
| 10 | `src/components/analytics/SleepSnapshotCard.tsx` | 112 | `'use client'` | Latest-night snapshot + period roll-up `dl` |
| 11 | `src/components/analytics/RoutineDetailCard.tsx` | 94 | `'use client'` | Overall/days-tracked/checks `dl` + per-block bars + "most missed" |
| 12 | `src/components/recap/MilestoneHitsCard.tsx` | 72 | `'use client'` | Goal milestones completed in period |
| 13 | `src/components/analytics/TimeAllocationCard.tsx` | 119 | `'use client'` | Tracked minutes by project/habit/goal, then focus by category; top-6 + "+N more" |
| 14 | `src/components/recap/NutritionHealthCard.tsx` | 70 | `'use client'` | Nutrition `StatTile` + up to 4 health-metric rows. Independent empty states |
| 15 | `src/components/recap/JournalCard.tsx` | 43 | `'use client'` | Journal entries in period: date, title, snippet |
| 16 | `src/components/analytics/AchievementsStrip.tsx` | 51 | `'use client'` | 4-col grid of recently unlocked achievements |
| 17 | `src/components/shared/PeriodControl.tsx` | 158 | `'use client'` | The 4-tab period strip |
| 18 | `src/components/ui/index.tsx` → `ui/Spinner.tsx` | 14 | no directive | Spinner for the `!data` skeleton |
| 19 | `lucide-react` | — | — | `BarChart3`, `BookOpen`, `CalendarRange`, `Flame`, `Loader2`, `Moon`, `Target`, `TrendingUp` |

### 3.2 Second-order (transitive)

| Path | Lines | Directive | Why |
| ---- | ----- | --------- | --- |
| `src/hooks/usePeriodUrlState.ts` | **208** | `'use client'` | **New.** URL-backed period, the fetch, and the race guard |
| `src/lib/analytics/format.ts` | **56** | none (pure) | **New.** `percentText`, `orNull`, `chartValue`, `widthPercent`, `deltaText` |
| `src/components/charts/LineChart.tsx` | 132 | `"use client"` | `MoodPulseCard.tsx:4` |
| `src/components/recap/stat-tile.tsx` | 35 | no directive | `FocusSummaryCard.tsx:4` and `NutritionHealthCard.tsx:4` — still two different import specifiers |
| `src/components/ui/PageSkeleton.tsx` | 54 | no directive | via `(dashboard)/loading.tsx` |

### 3.3 `src/components/charts/**` — 10 files, 5 still dead

| Chart file | Physical | On `/analytics`? | Used elsewhere? |
| ---------- | -------- | --------------- | --------------- |
| `BarChart.tsx` | 162 | **Yes** — via `PeriodChart` | `focus/FocusStats.tsx`, `recap/FocusBreakdownCard.tsx`, `reports/page.tsx`, `admin/analytics/page.tsx` |
| `LineChart.tsx` | 132 | **Yes** (transitively) via `MoodPulseCard.tsx` | — |
| `Calendar.tsx` | 143 | No | `calendar/page.tsx` |
| `HeatMap.tsx` | 122 | No | `recap/HabitHeatmapCard.tsx` |
| `ProgressRing.tsx` | 84 | No | `recap/GoalsProgressCard.tsx` |
| **`Gauge.tsx`** | 116 | ❌ | 🔴 **DEAD** |
| **`Histogram.tsx`** | 103 | ❌ | 🔴 **DEAD** |
| **`PieChart.tsx`** | 127 | ❌ | 🔴 **DEAD** |
| **`SparkLine.tsx`** | 90 | ❌ | 🔴 **DEAD** |
| **`TreeMap.tsx`** | 185 | ❌ | 🔴 **DEAD** |

Still 5 dead files, 621 lines. **Deliberately not deleted in this pass** — the handoff plan says not to remove shared chart components just because one route stopped referencing them, and pruning them is a separate, repo-wide decision.

### 3.4 `src/components/analytics/**` — 12 files, all live

`PeriodChart` 182 · `SleepSnapshotCard` 112 · `TimeAllocationCard` 119 · `FocusSummaryCard` 95 · `RoutineDetailCard` 94 · `StreakPanel` 86 · `AICalloutCard` 83 · `ProjectProgressList` 73 · `MoodPulseCard` 67 · `TierMixBar` 67 · `TaskQuadrantCard` 65 · `AchievementsStrip` 51.

### 3.5 Recap components — only 3 of 22 reach `/analytics`

**Used:** `MilestoneHitsCard` (72), `NutritionHealthCard` (70), `JournalCard` (43), plus `stat-tile` transitively.

### 3.6 Non-component modules in the client bundle

| Path | Physical | Directive | Role |
| ---- | -------- | --------- | ---- |
| `lib/api-client.ts` | 131 | none (pure) | `apiRequest<T>`, `ApiError` |
| `lib/period-range.ts` | 230 | none (pure) | `getPeriodRange`, `shiftAnchor`, `PERIOD_ORDER`, `PERIOD_LABEL`, types |
| `lib/dates.ts` | 253 | none (pure) | `DEFAULT_TZ`, `getTodayString`, `shiftCalendarDay` |
| `lib/analytics/format.ts` | 56 | none (pure) | the `null`-vs-`0` formatters |
| `hooks/usePeriodUrlState.ts` | 208 | `'use client'` | period in the URL + the fetch + the race guard |
| `hooks/useUserTimezone.ts` | 45 | `'use client'` | `{timezone, today, isLoading}` |
| `hooks/useSettings.ts` | 71 | `'use client'` | 5 selectors over the store |
| `store/settings.store.ts` | 174 | `'use client'` | zustand, **not persisted** |
| `lib/utils.ts` | 127 | none (pure) | `cn` |
| `types/analytics.ts` | 327 | type-only | `AnalyticsDashboard` and every widget interface |
| `types/recap.ts` | 172 | type-only | `RecapExtras`, `RecapReport` |

**Client/server boundary check:** no `'use client'` file imports `@/server/**`. `usePeriodUrlState` imports only `@/lib/period-range`, `next/navigation` and React. `format.ts` imports nothing.

---

## 4. Frontend architecture

### 4.1 Page structure

| Concern               | Reality |
| --------------------- | ------- |
| Component kind        | **Client Component** — `page.tsx:1` is `'use client'`; `export default function AnalyticsPage()` at `:100`. |
| Sibling route files   | **None.** `src/app/(dashboard)/analytics/` contains only `page.tsx` — no `loading.tsx`, `error.tsx`, `layout.tsx`, `not-found.tsx`, `template.tsx`. |
| Dynamic segment       | There is no `/analytics/[period]`. The period is a **query parameter**, not a path segment. |
| Route-segment loading | Falls through to `(dashboard)/loading.tsx` → `<PageSkeleton />`. Generic guess, not the `/analytics` shape. |
| Route-segment error   | Falls through to `(dashboard)/error.tsx`. Data errors are handled **in-page**; see §16.2 for the monitoring gap. |
| Layout                | `(dashboard)/layout.tsx` (server); `metadata = privateMetadata('RoutineOS')`. |
| Page metadata         | None — impossible for a Client Component. |

### 4.2 Module-private helpers in `page.tsx`

| Symbol | Line | Behaviour |
| ------ | ---- | --------- |
| `formatDuration(minutes)` | `:65` | minutes → `"45m"` / `"2h"` / `"2h 30m"` |
| `habitChartCopy(period, label)` | `:74` | `{title, description}` for chart 1. **Returns a description naming the exact range** — `"Share of due days completed per habit, Jan 6 – Jan 12."` |
| `tierChartCopy(period, label)` | `:87` | `{title, description}` for chart 2. Year says "Months with no scored day are left empty" |
| `Tile({…})` | `:477` | label / value / hint / optional icon — **not exported** |
| `SideStat({…})` | `:502` | icon / tag / label / value / hint / accent / glow — **not exported** |

Both chart-copy helpers replaced `chartLabel` / `chart2Label`. The old `chart2Label('week')` returned the literal string `"Tier completion (this month)"` — a label that existed only to disclose that the chart was reading the wrong period. The cross-period read is gone, so the label no longer needs the confession.

### 4.3 State inventory

| State | Where | Type | Updated by | Read by |
| ----- | ----- | ---- | ---------- | ------- |
| `period` | `usePeriodUrlState` | `Period` (derived from `?period=`) | the URL | the fetch URL, the chart copy, the grade suffix |
| `anchorDate` | `usePeriodUrlState` | `string` (derived from `?date=`) | the URL | the fetch URL, `PeriodControl anchorDate`, `step` |
| `data` | `usePeriodUrlState` | `AnalyticsDashboard \| null` | a successful fetch | the whole render tree |
| `error` | `usePeriodUrlState` | `string \| null` | a failed fetch | the alert / the status line |
| `isLoading` | `usePeriodUrlState` | `boolean` | fetch start/settle | the status line, `aria-busy` |
| `isStale` | `usePeriodUrlState` | `boolean` | `settledKey !== key` | the `opacity-60` wrapper |
| `settledKey` | `usePeriodUrlState` | `string` | fetch settle | `isStale` |
| `attempt` | `usePeriodUrlState` | `number` | `retry()` | a dependency of the fetch effect |
| `dismissedInsightId` | `page.tsx:116` | `string \| null` | `AICalloutCard onDismiss` | the AI-card condition at `:465` |
| `detailOpen` | `page.tsx:117` | `boolean` | the disclosure button | the detail grid at `:439` |

**Derived:** `userToday`, `timezone` from `useUserTimezone()`; `label` from `getPeriodRange(...)`; `heroPct = min(max(hero.total, 0), 100)`.

🔴 **`period` and `anchorDate` are no longer `useState`.** They are read from `useSearchParams()` and written with `router.replace`. This is the fix for the original audit's **F6**.

### 4.4 `usePeriodUrlState` — the URL, the fetch, and the race guard

`src/hooks/usePeriodUrlState.ts` (208 lines). Three responsibilities that used to be split between the page and nothing at all.

**Read.** `useSearchParams()` → `?period=`, `?date=`. Each is validated (`isPeriod`, `isDate`) and an unparseable value falls back to the default rather than being obeyed.

**Write.** `commit(nextPeriod, nextDate)` builds a `URLSearchParams` from the current query, sets both keys, and calls `router.replace` — **`replace`, not `push`**, so arrow-clicking through twelve months does not bury the previous page under twelve history entries. `setPeriod` re-derives the anchor with `getPeriodRange(next, anchorDate, timezone).start` so switching month → day lands on a date inside the day. `step(±1)` uses `range.prev` / `range.next`.

**Fetch + race guard.** The effect depends on `[period, anchorDate, attempt, fetcherRef]` and does:

```
const token = { current: true };
setIsLoading(true);
fetcherRef.current(period, anchorDate)
  .then(result => { if (!token.current) return; setData(result); setError(null); })
  .catch(err   => { if (!token.current) return; setError(message(err)); })
  .finally(()  => { if (!token.current) return; setIsLoading(false); setSettledKey(key); });
return () => { token.current = false; };
```

The token, flipped by the effect cleanup, is the entire guard. This is the fix for the original audit's **F2**. An `AbortController` would be tidier but is not sufficient on its own: a fetch can resolve in the same tick it is aborted, so a superseded response would still get to call `setData`.

**Stale data is kept, and labelled.** A failed refresh deliberately does **not** clear `data`; `isStale` (`settledKey !== key`) is `true` until the newest request settles, and the page renders it at `opacity-60` with a `role="status"` "Updating…". Blanking the screen on every arrow click destroys the sense of one continuous surface; showing the old numbers with no signal is how you read last week's average as today's.

**Exactly one lint suppression** in the hook, `react-hooks/set-state-in-effect` on the `setIsLoading(true)` line, with the reason inline. This matches the convention already used by `/recap` and `/reports`.

### 4.5 Hooks used on `/analytics`

| Hook | Source | Notes |
| ---- | ------ | ----- |
| `usePeriodUrlState<AnalyticsDashboard>` | **new** | the URL, the fetch, the race guard |
| `useUserTimezone()` | `hooks/useUserTimezone.ts` | `{timezone, today}`; `isLoading` still discarded |
| `useSettings()` | `hooks/useSettings.ts` | reached via `useUserTimezone` |
| `apiRequest<T>` | `lib/api-client.ts` | passed **into** the hook as a `useCallback`'d `load` |
| `useSearchParams` / `useRouter` / `usePathname` | `next/navigation` | the URL state |
| `useState` ×2 | React | `dismissedInsightId`, `detailOpen` |
| `useCallback` ×2 | React | `load`, `commit` |
| `useEffect` ×2 | React | the fetch, and the invalid-param cleanup |
| `useMemo` ×1 | React | the range label |

---

## 5. Backend / API architecture

### 5.1 Endpoints called — exactly 2

| # | Endpoint | Method | Caller | `auth()` | Zod | Service |
| - | -------- | ------ | ------ | -------- | --- | ------- |
| 1 | `/api/analytics/dashboard?period={p}&date={YYYY-MM-DD}` | GET | `page.tsx:105` | ✅ `dashboard/route.ts:19` | ✅ `dashboardQuerySchema` `route.ts:6`–`:9` (inline) | `analyticsService.getDashboard(session.user.id, {period, date})` `:36` |
| 2 | `/api/analytics/insights/${insight.id}` | DELETE | `AICalloutCard.tsx:38` | ✅ `[id]/route.ts:15` | ❌ no Zod; a non-empty `trim()` check in the service | `analyticsService.dismissInsight(...)` `:21` |

**Route details:**

- `src/app/api/analytics/dashboard/route.ts` — 49 lines. 401 at `:21`, 400 at `:30`–`:33`, `{success:true, data}` at `:41`, 500 at `:44`–`:47`. No `params` (static route, correctly).
- `src/app/api/analytics/insights/[id]/route.ts` — 31 lines. `await context.params` at `:20`, Next 15+ compliant.

⚠ `AICalloutCard.tsx:38` still uses raw `fetch` rather than `apiRequest` — see §24 F23, unchanged.

⚠ **The invalid-period behaviour is unchanged and still a finding.** `analytics.service.ts:155` still does `period = isPeriod(query.period) ? query.period : 'day'`. The Zod layer stops this from the UI, but a raw API caller asking for `period=quarter` gets day data with no indication. **F5 is open.** (See §28 for what the *client* now does about a bad param, which is a different problem from the service silently accepting one.)

### 5.2 Analytics routes that exist but are **not** called by `/analytics`

| Path | Physical | Service method | Consumed by |
| ---- | -------- | -------------- | ----------- |
| `/api/analytics/streaks` | 56 | `getStreaks(userId, from, to)` `:362` | `calendar/page.tsx` |
| `/api/analytics/reports` | 62 | `getReport(userId, type, date)` `:373` | `reports/page.tsx` |
| `/api/analytics/monthly` | 60 | `getMonthly(userId, month)` `:385` | `recap/monthly-reset/page.tsx` |

All three still delegate to the same period modules, so they inherit every metric fix below. **This is the main reason the fixes were made in `server/analytics/*` rather than inside `getDashboard`** — `/reports` and `/recap` were showing the old, disagreeing denominators too, and a fix applied only to the dashboard would have left three surfaces with four definitions again.

### 5.3 `AnalyticsService` — `src/server/services/analytics.service.ts` (1026 physical lines)

**Module constants:** `MOOD_PULSE_LIMIT = 300`.
**Type guards:** `isValidDate`, `isPeriod`.
**Exported type:** `DashboardQuery = { period?: string; date?: string }`.
**Class** with 19 repository fields, all instantiated in the constructor. Module singleton `analyticsService`.

🔴 `ACCOUNT_EPOCH = '2000-01-01'` is **gone**. It existed only to feed the all-time `streakAnalytics` call.

#### The 8 exported methods

| Method | Called by `/analytics`? | Behaviour |
| ------ | ----------------------- | --------- |
| `dismissInsight(userId, insightId)` | ✅ (via the card) | `trim()`, then `insightRepository.deleteOwned(userId, trimmed)` — user-scoped |
| **`getDashboard(userId, query)`** | ✅ **the only data path** | see below |
| `getStreaks(userId, from, to)` | ❌ | delegates to the full `streakAnalytics` (calendar page still needs the timeline) |
| `getReport(userId, type, date)` | ❌ | `monthlySummary` or `weeklySummary`, now with `timezone` + `today` |
| `getMonthly(userId, month)` | ❌ | `monthlySummary` |
| `getYearly(userId, year)` | **New** | `yearlySummary` — no route calls it yet; it exists so the yearly module's new signature has a caller |
| `getDaily(userId, date)` | **New** | `dailyBreakdown` |
| `previousRange(period, anchor, tz)` (private) | ✅ | the equivalent preceding period, for the comparison |
| `resolvePeriodContext(userId)` (private) | ❌ | `{timezone, today}` — the shared resolution, so the non-dashboard methods cannot forget the timezone |

#### `getDashboard` — step by step

```
:151  await userRepository.getSettings(userId)     ◄── SEQUENTIAL, before the fan-out
:152  timezone   = settings?.timezone || DEFAULT_TZ
:153  userToday  = getTodayString(timezone)
:154  today      = isValidDate(query.date) ? query.date : userToday
:155  period     = isPeriod(query.period) ? query.period : 'day'
:156  range      = getPeriodRange(period, today, timezone)
:158  rangeStart = fromZonedTime(range.start + 'T00:00:00',     tz)
:159  rangeEnd   = fromZonedTime(range.end   + 'T23:59:59.999', tz)

:175  const periodHabitsPromise = loadPeriodHabits(userId, range.start, range.end, userToday)
        ◄── ONE model for the whole request, started before the fan-out so it
            overlaps the other reads instead of adding a round trip

:198  ONE Promise.all of 20 branches ────────────────────────────────
        :199  periodHabitsPromise          (5 queries)
        :200  this.previousRange(...)      (0 queries — pure)
        :201  streak.findByUserId
        :202  sleep.findByRange
        :203  focus.getStats
        :204  productivityPattern.findPeakHours
        :205  task.findAll
        :206  project.findAll
        :207  mood.getMoodRange
        :208  energy.getRange
        :209  insight.findLatestByUser(5)
        :210  routine.findLogsByRange
        :211  goal.findCompletedMilestones
        :212  focus.listBreaks
        :213  focus.findSessions
        :214  timeEntry.list
        :215  nutrition.findAll
        :216  healthMetric.findAll
        :217  journal.findAll(limit 5)
        :218  achievement.recentUnlocked(8)

:222  comparisonPromise = (day | week) ? scoreRepository.findByRange(previous) : []

:227  ONE Promise.all of 5 branches ────────────────────────────────
        :229  dailyBreakdown  only period === 'day'    (4 queries, habits preloaded)
        :232  weeklySummary   only period === 'week'   (7 queries, habits preloaded)
        :235  monthlySummary  only period === 'month'  (6 queries, habits preloaded)
        :238  yearlySummary   only period === 'year'   (7 queries, habits preloaded)
        :241  comparisonPromise
        ⚠ monthlySummary is NO LONGER fetched on the week period

:253  build the widget datasets synchronously
:255  assemble the AnalyticsDashboard literal
```

**Removed from the fan-out:** `habit.countByStatus` and `goal.countByStatus` (two `groupBy`s feeding the removed `data.counts`), `habit.findAll(ACTIVE)` (the tier mix now comes from `periodHabits.activeTierMix`), and `streakAnalytics({startDate: '2000-01-01'})` (the all-time scan).

#### The module-private builders

`buildStreakSnapshot` `:419` · `buildScoreAverage` `:457` · `buildHero` `:503` · `buildRoutineTile` `:534` · `buildSleepMinutes` `:552` · `buildAverageMood` `:566` · `monthLabel` `:574` · `buildChart1` `:586` · `buildChart2` `:635` · `buildHabitPanel` `:655` · `buildComparison` `:682` · `buildTaskQuadrant` `:708` · `buildProjectProgress` `:750` · `buildFocusSummary` `:771` · `buildTimeAllocation` `:820` · `buildMoodPulse` `:872` · `buildRoutineDetail` `:915` · `buildSleepSnapshot` `:967` · `pickInsight` `:1010`.

**`buildTierMix` and `buildHabitCompletion` no longer exist.** Both computed things the shared period model now owns.

### 5.4 `src/server/analytics/**` — 7 files

| File | Physical | Exports | Purpose |
| ---- | -------- | ------- | ------- |
| **`period-habits.ts`** | **81** | `loadPeriodHabits(userId, start, end, today)` `:29` | **New.** Five bulk queries → one `PeriodHabitModel` |
| **`eligibility-context.ts`** | **86** | `buildEligibilityContext(overrides, definitions, exceptions, range)` `:39` | **New.** Extracted from `HabitContributionService` so both consumers build the day-type map once |
| `daily.ts` | 211 | `dailyBreakdown(userId, date, timezone, today?, preloadedHabits?)` `:102` | now reads the shared model |
| `weekly.ts` | 323 | `weeklySummary(userId, monday, timezone, today?, preloadedHabits?)` `:140` | now reads the shared model |
| `monthly.ts` | 287 | `monthlySummary(userId, month, timezone, today?, preloadedHabits?)` `:133` | now reads the shared model |
| `yearly.ts` | 277 | `yearlySummary(userId, year, timezone, today?, preloadedHabits?)` `:118` | now reads the shared model |
| `streaks.ts` | 235 | `streakAnalytics(userId, range)` `:143`, **`streakProjections(row, today)`** `:108` | the full report for `/calendar`, plus a projection-only path for the dashboard |

**Every period module now takes `timezone` as a required parameter.** That is deliberate: a defaulted `timezone = DEFAULT_TZ` would let a caller silently reintroduce the UTC-bucketing bug the parameter exists to prevent. `analytics.service.resolvePeriodContext` and `recap.service` both resolve it explicitly.

#### `loadPeriodHabits` — five queries, regardless of period or habit count

```
:49   if (start > today) return emptyPeriodHabits()      ◄── a future period costs ZERO
:52   windowStart = start
:53   windowEnd   = end < today ? end : today            ◄── clipped to today

      Promise.all of 5:
        habit.findAll({ status: ['ACTIVE','PAUSED'], sortBy: 'createdAt', sortOrder: 'asc' })
        habit.findLogsByUserRange(userId, windowStart, windowEnd)
        habit.findOverridesByUserRange(userId, windowStart, windowEnd)
        routine.listDayTypeDefinitions(userId)
        routine.findExceptionsByRange(userId, windowStart, windowEnd)

      buildEligibilityContext(...)
      buildPeriodHabits({ start, end, habits: rows.map(toContributionHabit), logs, ctx })
```

🔴 **Clipping to `today` is a correctness fix, not just an optimisation.** "This week" is Mon–Sun, but on a Thursday the user cannot yet have failed Friday. Counting those days in the denominator made the live period read several points lower than an equivalent completed week, which made the current week the worst-looking tab on the page.

A period **entirely** in the future returns `emptyPeriodHabits()` rather than clamping to a one-day "today" window, which would otherwise report the live day under a future month's label.

### 5.5 `streakProjections` — the dashboard's streak path

`streaks.ts` now has a second export. The original audit's **F9** was that `getDashboard` called the full `streakAnalytics` with `startDate: '2000-01-01'` on every period switch, loading every `DailyScore` the account has ever produced to build a `timeline[]` and `milestones[]` that `buildStreakSnapshot` immediately discarded.

`streakProjections(row, today)` takes the cached `Streak` row and applies **the identical rule** — `HIGH` when `current === 0`; `HIGH` when `lastCompletedDate` is null or `< today`; else `HIGH` when the gap exceeds `THRESHOLDS.warnings.streakAtRisk`; else `MEDIUM` — with no score scan at all. `current` and `longest` come from the row, which the write path already maintains. `/calendar` keeps the full `streakAnalytics` because it genuinely renders the timeline.

⚠ `riskLevel` is typed `'MEDIUM' | 'HIGH'` on this function's return, because `LOW` was never reachable in the original either (§24 F30, still open on `StreakAnalytics`).

---

## 6. Database dependency

### 6.1 Models read — **25 of 68**

`UserSettings` · `Habit` · `HabitOverride` · `HabitLog` · `HabitDayType` · `DayTypeDefinition` · `DayTypeException` (via `RoutineRepository.findExceptionsByRange`) · `Goal` · `GoalProgress` · `Milestone` · `SleepLog` · `FocusSession` · `Break` · `MoodLog` · `EnergyLog` · `Task` · `Project` · `Streak` · `ProductivityPattern` · `AIInsight` · `RoutineLog` · `RoutineBlock` · `TimeEntry` · `NutritionEntry` · `HealthMetric` · `JournalEntry` · `Achievement` · `DailyScore` · `DailyReflection`.

`DailyScore` is still read, but **only over the selected period** — the all-time scan is gone.

### 6.2 Repositories touched — **20**

| # | Repository | Methods called | Change |
| - | ---------- | -------------- | ------ |
| 1 | `user.repository.ts` | `getSettings` | – |
| 2 | `habit.repository.ts` | `findAll`, **`findLogsByUserRange`**, **`findOverridesByUserRange`** | `countByStatus` and per-habit `findLogsByRange` **removed from this path** |
| 3 | `routine.repository.ts` | `findLogsByRange`, `findLogsByDate`, **`listDayTypeDefinitions`**, **`findExceptionsByRange`** | 2 new calls, 5 total, replacing the habit loops |
| 4 | `goal.repository.ts` | `findCompletedMilestones`, `findAll`, **`findProgressByUserRange`** | **`countByStatus` and `getMilestones` removed; `getProgressHistory` replaced** |
| 5 | `score.repository.ts` | `findByDate`, `findByRange` | +1 call, the comparison |
| 6 | `sleep.repository.ts` | `findByRange`, `findByDate`, `countRestedDays` | – |
| 7 | `focus.repository.ts` | `getStats`, `listBreaks`, `findSessions` | – |
| 8 | `mood.repository.ts` | `getMoodRange` | – |
| 9 | `energy.repository.ts` | `getRange` | – |
| 10 | `task.repository.ts` | `findAll` | – |
| 11 | `project.repository.ts` | `findAll` | – |
| 12 | `streak.repository.ts` | `findByUserId` | **`getUncelebratedMilestones` removed** (was only for the discarded milestones) |
| 13 | `productivity-pattern.repository.ts` | `findPeakHours` | – |
| 14 | `insight.repository.ts` | `findLatestByUser`, `deleteOwned` | – |
| 15 | `time-entry.repository.ts` | `list` | ⚠ still unbounded |
| 16 | `nutrition.repository.ts` | `findAll` | ⚠ still unbounded |
| 17 | `health-metric.repository.ts` | `findAll` | ⚠ still unbounded |
| 18 | `journal.repository.ts` | `findAll`, **`countByRange`** | **`countByMonth` removed from this path** |
| 19 | `achievement.repository.ts` | `recentUnlocked` | – |
| 20 | `reflection.repository.ts` | `findByDate` | day period only |

### 6.3 Aggregate / groupBy / count calls

| Call | Site | Prisma op |
| ---- | ---- | --------- |
| `focusRepository.getStats` | `focus.repository.ts` | `focusSession.aggregate({ _count, _sum, _avg, _max })` |
| `sleepRepository.countRestedDays` | `sleep.repository.ts` | `sleepLog.count({ feltRested: true, date: {gte,lte} })` |
| `journalRepository.countByRange` | **`journal.repository.ts`, new** | `journalEntry.count({ date: { gte, lte } })` |
| ~~`habit.countByStatus`~~ | **removed from this path** | was a full-table `groupBy` for an unrendered field |
| ~~`goal.countByStatus`~~ | **removed from this path** | same |

🔴 **`journalRepository.countByRange` replaced `countByMonth` here** because the column is a `YYYY-MM-DD` string, so `gte`/`lte` is an indexable range scan where `startsWith` was not. `countByMonth` still exists and is still used elsewhere; only the twelve-call loop is gone.

### 6.4 Unbounded reads — 4, unchanged

| Repository method | Site | Consequence |
| ----------------- | ---- | ----------- |
| `timeEntryRepository.list(userId, query)` | `time-entry.repository.ts` | the user's entire time-entry history, every request |
| `nutritionRepository.findAll` | `nutrition.repository.ts` | the entire nutrition log |
| `healthMetricRepository.findAll` | `health-metric.repository.ts` | the entire health-metric log |
| `goalRepository.findAll(userId, {})` | `goal.repository.ts` | all goals, for the month/year aggregates |

`journalRepository.findAll(limit: 5)` is still the only capped list read on this path. **§24 F11 is open.**

🔴 **The all-time `DailyScore` scan is gone** — that entry no longer appears in this table.

### 6.5 Duplicated queries within a single request — **none**

The original audit recorded `habitRepository.findAll` running 2–3× and `streakRepository.findByUserId` 3–4×. That duplication was architectural: each of `daily/weekly/monthly/yearly/streaks` declared its **own module-level repository singletons**, so nothing was shared. The dashboard now loads the habit model once and passes it into whichever period module runs (`preloadedHabits`), and `streakRepository.findByUserId` is called once by the service. The remaining duplication is `sleep.findByRange` and `score.findByRange`, which the service and a period module each need for different aggregates.

---

## 7. Period and date-range logic

### 7.1 The pure library — `src/lib/period-range.ts` (230 lines, unchanged)

`Period` `:29` · `PeriodBucket` `:31` · `PeriodRange` `:42` · `PERIOD_ORDER` `:61` · `PERIOD_LABEL` `:63` · `shiftAnchor(date, period, delta, tz)` `:93` · `todayAnchor` `:104` · `getPeriodRange(period, anchor, tz)` `:124` · `isWithinRange` `:211` · `normalizeDate` `:219` · `nowInTz` `:228`.

### 7.2 🔴 FIXED — the client and the server no longer compute the range differently

The original **F17**: `page.tsx` called the 3-arg `shiftAnchor` (defaulting `tz` to `DEFAULT_TZ`) while `PeriodControl` called the 4-arg form with the user's `timezone`, so the same predicate was evaluated twice from two different inputs.

Now `usePeriodUrlState` derives every step from `getPeriodRange(period, anchorDate, timezone)` — one function, one timezone argument — and `PeriodControl`'s own `atCurrentPeriod` uses the same `shiftAnchor(..., timezone)` form as before. The two agree by construction rather than by inspection.

### 7.3 The server's range computation — `analytics.service.ts:156`–`:159`

```
range      = getPeriodRange(period, today, timezone)
rangeStart = fromZonedTime(range.start + 'T00:00:00',     tz)   ◄── a real instant
rangeEnd   = fromZonedTime(range.end   + 'T23:59:59.999', tz)
```

✅ Timezone-correct, and every module that needs an instant now receives `timezone` explicitly.

### 7.4 Period-conditional payload

```
                   day      week     month    year
 dailyBreakdown    ✓        –        –        –
 weeklySummary     –        ✓        –        –
 monthlySummary    –        ✗        ✓        –     ◄── week no longer triggers it
 yearlySummary     –        –        –        ✓
 the other 18      ✓        ✓        ✓        ✓     ◄── always run
 comparison query  ✓        ✓        ✗        ✗     ◄── see below
```

🔴 **`monthlySummary` is no longer fetched on the week period.** The original **F13**: it was fetched for `week || month` purely so `buildChart2` could read `month.scores.byTier` for the week's tier chart. That cross-period read is gone (§25.1), so the week tab no longer drags the month tab's aggregates — including its sequential habit loop and its per-goal milestone N+1 — into its own request.

The comparison query is deliberately skipped for month and year. Comparing a part-lived month against a whole one is not a comparison, it is a flattering number, and the service has no defensible way to clip the earlier period to match. `buildComparison` returns `null` for both.

### 7.5 🔴 FIXED — the two hardcoded-UTC focus ranges

The original **F1**. `monthlySummary` and `yearlySummary` both called `focusRepository.getStats` with `new Date('...T00:00:00.000Z')` while the service had computed a correct zoned range and then handed two consumers a UTC pair.

Both now derive their own bounds from the required `timezone` parameter:

```
monthly.ts   rangeStart = fromZonedTime(`${startDate}T00:00:00`,     timezone)
             rangeEnd   = fromZonedTime(`${endDate}T23:59:59.999`, timezone)
yearly.ts    the same, over 1 Jan – 31 Dec
```

### 7.6 🔴 FIXED — `Date`-typed columns are bucketed in the user's zone

The original audit noted three `.toISOString().slice(0, 10)` calls per row in `weekly.ts` and `monthly.ts`/`yearly.ts` goal filtering. For a user east of UTC a goal completed at 22:00 local on the 1st was counted on the 31st of the previous month.

All of them now use `formatInTimeZone(goal.completedAt, timezone, 'yyyy-MM-dd')`: `weekly.ts` goals and progress history, `monthly.ts` goals, `yearly.ts` goals.

⚠ **`weekRange` (`weekly.ts:112`–`:121`) is still UTC-based**, and is still correct. It maps a calendar date to the Monday of its ISO week, which is a pure calendar-date operation — reading the weekday off a `YYYY-MM-DD` in UTC is the same weekday everywhere. `getPeriodRange` supplies a Monday and `weekRange` re-snaps to the same Monday. **The original F18 stays open**, reclassified as low-risk: the earlier version's claim that the week bucket "can be off by one day at each edge" does not hold, because `shiftCalendarDay` and `getUTCDay` agree on calendar dates.

### 7.7 🔴 FIXED — chart 2 no longer leaks across periods

See §25.1.

---

## 8. Complete user actions (serial)

### 8.1 On first mount

| # | Action | Mechanism | Requests |
| - | ------ | --------- | -------- |
| 1 | `AppProvider` mounts (root layout) | `AppContext` | `GET /api/habits` ∥ `/api/routine` ∥ `/api/goals` — ⚠ **still discarded by `/analytics`**, yet `DataErrorBanner` surfaces their failures |
| 2 | `useSettingsLoader` resolves `UserSettings` | `AuthProvider` | `GET /api/settings` |
| 3 | `usePeriodUrlState` reads `?period=` / `?date=`, falling back to `'day'` + `userToday` | — | 0 |
| 4 | the hook's effect fires `load(period, anchorDate)` | – | **`GET /api/analytics/dashboard`** → ~28 queries |
| 5 | `!data && <Spinner py-24/>` | `:139`–`:145` | – |

### 8.2 Navigation actions

| # | User action | Handler | Effect on the URL | Requests |
| - | ----------- | ------- | ----------------- | -------- |
| 1 | Click a period tab | `setPeriod` → `commit` | `?period=` changes, `?date=` re-derived via `getPeriodRange(next, …).start` | **1** |
| 2 | Click **‹ Previous** | `step(-1)` → `range.prev` | `?date=` = the previous period's anchor | **1** |
| 3 | Click **› Next** | `step(1)` → `range.next` | `?date=` = the next period's anchor | **1** (disabled at the current period) |
| 4 | Click **Today** | `reset` → `commit(period, today)` | `?date=` = the user's today | **1** |
| 5 | Click **Retry** | `retry()` → `attempt++` | unchanged | **1** |
| 6 | Browser back / forward | `useSearchParams` re-reads | the previous URL is restored | **1** |
| 7 | Open a shared link | same | – | **1** |
| 8 | Toggle **Explore every domain** | `detailOpen` | unchanged | **0** — the detail datasets are already in the response; the disclosure is a render decision |
| 9 | **Show figures** on a chart | `PeriodChart` local state | unchanged | **0** |
| 10 | Dismiss the insight's **✕** | `AICalloutCard` | unchanged | **1** `DELETE /api/analytics/insights/{id}` |

**There is no export, print, CSV, share, custom date range, or per-widget persistence.** The one client-side persistence surface in the plan — widget visibility — is **not** implemented; see §15.6 for why.

### 8.3 There is no "edit" and no "create"

`/analytics` is read-only by construction. The only mutation it can perform is `DELETE /api/analytics/insights/{id}`.

---

## 9. What can the user create

**Nothing.** No `POST`/`PUT`/`PATCH` from this page.

The `AIInsight` rows it can display are created by the AI pipeline, not by this page — and the `generate-insights` cron that would produce them is **still a stub returning `generated: 0`**.

---

## 10. What can the user edit

**Nothing.** No field on the page is editable.

🔴 **The period and anchor are now URL state** — which is not "editing", but it is the answer to the original audit's **F6**: a view of a specific period is linkable, bookmarkable, survives a reload, and is reachable with the back button.

---

## 11. What can the user delete

| Target                  | Entry point                                | Request | Effect |
| ----------------------- | ------------------------------------------ | ------- | ------ |
| **An AI insight**       | the **✕** on `AICalloutCard`               | `DELETE /api/analytics/insights/{id}` | `deleteOwned(userId, trimmed)` — scoped, a hard delete |
| **An archived insight** | 🔴 no UI                                   | — | `InsightRepository.dismiss` is **unscoped by user**; nothing calls it |

---

## 12. Cross-page dependencies

### 12.1 Inbound — what links to `/analytics`

`components/layout/Sidebar.tsx` · `components/layout/JumpTo.tsx` · `components/layout/Footer.tsx` · `app/(dashboard)/dashboard/page.tsx`.

### 12.2 The shared period modules — `/reports` and `/recap` now inherit every fix

This is the most important structural change. `weeklySummary`, `monthlySummary`, `yearlySummary` and `dailyBreakdown` are consumed by:

| Consumer | Path |
| -------- | ---- |
| `/analytics` | `AnalyticsService.getDashboard` |
| `/reports` | `analyticsService.getReport` → `/api/analytics/reports` |
| `/recap/monthly-reset` | `analyticsService.getMonthly` |
| `/recap` | `recap.service.ts` `buildDay` / `buildWeek` / `buildMonth` / `buildYear` |

Because the fix landed in the modules and not in `getDashboard`, `/reports` and `/recap` stopped showing the old disagreeing denominators too. `recap.service.ts` now threads `timezone` into all four builders (`buildDay(userId, range, timezone)` etc.).

⚠ **`types/recap.ts` is a hand-written mirror of that payload and was lying.** It declared `averageCompletionRate: number`, `completionRate: number`, `averageScore: number` and `habitReliability: number` for fields the server had been returning as `number | null`. That is why `Math.round(week.habits.averageCompletionRate)` type-checked and then rendered **`NaN%`** on a week where nothing was due. All 19 nullable fields are now declared nullable, and every consumer renders them through `lib/analytics/format`.

### 12.3 Shared code with `/recap`

`/analytics` imports 3 of 22 recap components plus `stat-tile`. Neither page is a subset of the other.

### 12.4 Outbound

| Data | Produced by | Drift risk |
| ---- | ----------- | ---------- |
| `timezone`, `today` | `useUserTimezone()` → `useSettings()` → `UserSettings` | ⚠ `isLoading` is still discarded |
| `AppContext.*` | `AppContext.fetchAll()` | 🔴 still unused, yet `DataErrorBanner` surfaces their failures here |
| `AIInsight` rows | the AI pipeline | 🔴 `generate-insights` is a stub, so `aiInsight` is structurally `null` |

---

## 13. Impact analysis

### 13.1 The single request's blast radius

One `GET /api/analytics/dashboard` fans out across 20 repositories and ~25 models. If any branch rejects, the whole `Promise.all` rejects, the route's `catch` returns 500, and the page shows its `role="alert"` + Retry. **There is still no partial rendering** — one failing sub-widget blanks everything.

Several always-on branches remain **optional in spirit but mandatory in practice**:

| Branch | What breaks if it throws |
| ------ | ----------------------- |
| `nutritionRepository.findAll` | a feature the user may not use at all blanks the whole page |
| `healthMetricRepository.findAll` | same |
| `productivityPatternRepository.findPeakHours` | a table nothing in the repo ever writes |
| `insightRepository.findLatestByUser` | blocks the AI callout — a bonus feature |

**§24 F26 is open.**

### 13.2 🔴 FIXED — the four periods no longer differ by an order of magnitude

| Period | Before | After | N+1 loops |
| ------ | ------ | ----- | --------- |
| `day` | ~28 | **~28** | 0 |
| `week` | ~40 | **~32** | **0** |
| `month` | ~45 | **~29** | **0** |
| `year` | ~55 | **~30** | **0** |

And the cost is now **independent of the user's habit count** — the three per-habit loops (1 query per ACTIVE habit each), the per-goal milestone loop and the per-goal progress-history loop are all gone. §18.

### 13.3 🔴 FIXED — the week tab no longer runs the whole month summary

`analytics.service.ts` fetched `monthlySummary` when `period === 'week' || period === 'month'`, purely to feed the week's tier chart. Consequences, all gone:

- the week tab ran the month tab's full aggregate set, including its **sequential per-habit loop** and its **per-goal milestone N+1**;
- `habitRepository.findAll` ran 3× on the week path;
- `sleepRepository.findByRange` ran 2–3×.

### 13.4 🔴 FIXED — the page no longer computes fields nothing renders

The original audit found 9 unrendered fields, two of which cost a `groupBy` each. `data.counts` and both `groupBy`s are gone, along with `data.date`, `data.range.start`/`end`, `data.tiles.focusMinutes` — `range.start`/`end` and `today` are now read by the page (the comparison line and the period-label copy), so only `tiles.focusMinutes` remains unrendered. §15.2.

### 13.5 If the fetch fails

- with **no** prior data: a full-page `role="alert"` + Retry. `data === null`, so nothing stale is on screen.
- on a **refetch**: `data` is deliberately kept, the status line says
  `"<message> — showing the last loaded period."`, and the tree stays at `opacity-60`. The original audit's **F15** is resolved in the *honest* direction — it keeps the stale cards but refuses to present them as current.
- 🔴 **still bypasses `ErrorReporter`**, so a failed fetch is invisible to monitoring. **F16 is open.**

---

## 14. Current System Capabilities

1. **Aggregates ~25 Prisma models** into one `AnalyticsDashboard` from one request.
2. **Switches between four periods** with prev/next, a range label, a "Today" shortcut, and a correctly disabled "next".
3. **Keeps the period and anchor in the URL** — linkable, bookmarkable, back-navigable, reload-stable.
4. **Guards against out-of-order responses** with a per-effect token; only the newest request may write.
5. **Labels stale data** with `aria-live` "Updating…" and a dimmed tree, and says so explicitly when a refresh failed.
6. **Resolves every date range in the user's timezone**, including the month/year focus windows and every `Date`-typed column that has to become a calendar day.
7. **Computes one habit-completion rate, identically, on all four tabs** — `completed / scheduled`, with `scheduled` from the eligibility rule, pooled rather than averaged.
8. **Distinguishes "no data" from "zero"** everywhere: `null` rates, `null` chart values, `null` yearly-month averages, an empty ring instead of a ring at zero.
9. **Scores only days the user has lived** — the current week and month are not scored against days that have not happened.
10. **Populates Core / Growth / Bonus on every period**, including month and year.
11. **Populates the Routine tile on every period**, not just the day tab.
12. **Shows a prior-period comparison** on day and week, with the exact comparison dates, and refuses to compare month or year.
13. **Renders a hero ring** with a conic gradient, a grade, four sub-tiles and four summary tiles that each state their denominator ("5 of 7 due", "3 of 12 blocks").
14. **Labels the streak card "All time"**, because a streak is not period-scoped and nothing else on the page is.
15. **Renders two charts whose titles and descriptions name the exact range**, each with a generated `sr-only` summary sentence and a **figure table** disclosure.
16. **Groups the twelve domain cards behind a "Explore every domain" disclosure** with `aria-expanded`, so the overview answers the question first.
17. **Renders the AI callout only when a real insight exists** — no permanent "your insights will appear here" placeholder.
18. **Isolates the first load** with a spinner and offers a Retry that works by re-running the effect.
19. **Computes streaks without an all-time score scan**, from the cached `Streak` row.

---

## 15. Currently NOT Supported

### 15.1 Dead chart components — 5 files, 621 lines

`TreeMap` 185 · `PieChart` 127 · `Gauge` 116 · `Histogram` 103 · `SparkLine` 90. Each has both a named and a default export and its own `"use client"`, so nothing marks them unused. **Left in place deliberately** — pruning shared components is a repo-wide decision, not this page's.

### 15.2 Fields the service computes that the page never renders

| Field | Type | Produced at | Rendered? |
| ----- | ---- | ----------- | --------- |
| `data.tiles.focusMinutes` | `number` | `analytics.service.ts:268` | ❌ — `FocusSummaryCard` uses `focus.period.minutes` |
| `routine.blocks[].partial` | `number` | `buildRoutineDetail` | ❌ — 0 references in `RoutineDetailCard.tsx` |
| `timeAllocation.entries[].color` | `string \| null` | `buildTimeAllocation` | ❌ — `TimeAllocationCard` uses only `label` and `minutes` |

**Removed in this pass:** `data.counts.habits`, `data.counts.goals` (each cost a full-table `groupBy`), `data.date`, `data.range.start`, `data.range.end`, `data.range.isCurrent` — the last three are now read by the page.

### 15.3 Fields still computed but discarded

| Item | Location | Note |
| ---- | -------- | ---- |
| `DailyBreakdown.topMoments` / `bottomMoments` | `daily.ts` | `getDashboard` never reads them; `recap.service.ts` **does**, via `DailyRecap`. Cannot be removed while `/recap` uses them. |
| `MonthlyHabitReliability.weeklyRates` | `monthly.ts` | **now consumed** — `recap/page.tsx:522` filters on it to pick the most reliable habit. The original audit recorded it as dead; that was wrong. |
| `StreakAnalytics.timeline` / `.history` / `.milestones` / `longest.{core,growth,minimum}` | `streaks.ts` | still built by `streakAnalytics`, but the dashboard **no longer calls it** — only `/calendar` does, and `/calendar` renders the timeline. |

### 15.4 Dead service / repo methods on the analytics path

| Method | Location | Note |
| ------ | -------- | ---- |
| `InsightRepository.findByPeriod` / `findLatest` / `findHistory` / `create` / `markRead` | `insight.repository.ts` | not called by `/analytics` or any analytics route |
| **`InsightRepository.dismiss`** | `insight.repository.ts` | **unscoped by user** — an IDOR-shaped method nothing calls. **F21 open.** |
| `GoalRepository.getProgressHistory` | `goal.repository.ts` | live, but no longer on the analytics path — `findProgressByUserRange` replaced it here |
| `GoalRepository.getMilestones` | `goal.repository.ts` | live, but no longer on the analytics path — `findCompletedMilestones` replaced it in `monthlySummary` |
| `JournalRepository.countByMonth` | `journal.repository.ts` | still exists and is used elsewhere; the 12-call loop that used it is gone |
| `MoodRepository.getEnergyRange` | `mood.repository.ts` | `EnergyRepository.getRange` is used instead — duplicate capability |
| `AnalyticsService.getStreaks` / `getReport` / `getMonthly` | – | live, but not from `/analytics` |
| `AnalyticsService.getYearly` / `getDaily` | **New** | no route calls them yet |

### 15.5 Unused props

| Prop | Where | Note |
| ---- | ----- | ---- |
| `PeriodControl.size` | `PeriodControl.tsx` | neither page passes it; both its ternaries are `'sm' ? X : X`. **F27 open.** |
| `BarChart.className` / `colors` / `showGrid` / `barSize` | `BarChart.tsx` | not passed by `PeriodChart`, so no gridlines and no per-`Cell` colouring |
| `BarChartProps.dataKey` as `string[]` / the `isGrouped` branch | `BarChart.tsx` | unreachable from here |
| `PeriodChart.className` | `PeriodChart.tsx` | declared, not passed by the page |

### 15.6 Missing entirely

- **No `loading.tsx` / `error.tsx` local to `/analytics`.** The group `PageSkeleton` is a generic guess.
- **No widget visibility gate.** `/dashboard` wraps widgets in `WidgetGate` reading `routineos.dashboard.widgets`. `/analytics` now has a **single all-or-nothing disclosure** (`detailOpen`) instead of twelve equally-weighted cards — but the plan's per-widget preference with **server-side query skipping** is **not implemented**. Hiding a client-side panel does not remove its queries, and `getDashboard` still fetches every widget dataset on every request. This is the plan's largest unimplemented item and it is deliberately not half-done: a `localStorage` gate that only hides cards would claim a saving the server does not make.
- **No per-widget error boundary.** One failing branch blanks all 15 cards. **F26 open.**
- **No `ErrorReporter`** on the fetch failure path. **F16 open.**
- **No chart text alternative for `MoodPulseCard`** — it renders a raw `LineChart` with no `sr-only` summary or table. The two `PeriodChart`s are fixed; this one is not.
- **No table, no export, no print, no CSV, no share.**
- **No comparison for month or year.** Deliberate — see §7.4.
- **No custom date range.** Only whole periods.
- **No deep-dive.** Clicking a bar does nothing; clicking a streak does nothing.
- **No `localStorage`** on this page.
- **No tests for `AnalyticsService`, the API route, or any page component.** There **are** now 34 tests for the pure layers (§18.5).

---

## 16. Loading / Error / Empty / Edge states

### 16.1 Loading

| State | Trigger | Rendering |
| ----- | ------- | --------- |
| **Route loading** | server→client navigation | `(dashboard)/loading.tsx` → `<PageSkeleton />` |
| **First data load** | `!data` | `<Spinner class="h-6 w-6"/>` centred, `py-24` |
| **Every subsequent load** | period / anchor / retry change | 🔴 **fixed** — the status region says "Updating…" with a spinner, and the tree renders at `opacity-60` with `aria-busy` |
| **Chart empty** | `data.length === 0` **or** every value is `null` | `PeriodChart`'s `emptyMessage`, with a period-specific sentence |
| **Detail closed** | `detailOpen === false` | the twelve cards are not rendered at all |
| **Figures closed** | `PeriodChart` local state | only the SVG |
| **Widget empty** | per card | each card still has its own empty state; `NutritionHealthCard` has two independent ones |
| **Next arrow** | `atCurrentPeriod` | `disabled` |

### 16.2 Error

| Error | Where | Surface |
| ----- | ----- | ------- |
| `error` with **no** prior data | the hook's `catch` | a full-page `role="alert"` + a real `<button>Retry`. `data === null`, so nothing stale is shown. |
| `error` on a **refetch** | same | 🔴 **fixed** — `"<message> — showing the last loaded period."` in the `role="status"` region, tree dimmed. The cards stay, but they are not presented as current. |
| render crash | any | `(dashboard)/error.tsx` |
| **Monitoring** | — | 🔴 **still absent.** Neither path calls `ErrorReporter`, so a failed `/analytics` fetch is invisible. **F16 open.** |

### 16.3 Empty — and distinct from zero

| Condition | Rendering |
| --------- | --------- |
| Nothing was due in the period | `percentText(null)` → `—`; the hero says "No score recorded for this period"; the Habits tile hint says "Nothing was due" |
| Something was due, nothing done | `percentText(0)` → `0%` |
| No score at all | an **empty dashed ring**, not a ring at zero |
| A tier with nothing due | a `null` rate → a gap in the chart, `No data` in the figure table |
| A year with no data in a month | `averageScore: null` → a gap, and the month is dropped from `/recap`'s trend rows |
| No AI insight | the card is **not rendered** |
| No nutrition / health / journal / achievements | each card's own empty state |

### 16.4 Edge cases

| Edge case | Handling |
| --------- | -------- |
| **Future anchor in the URL** | `loadPeriodHabits` returns `emptyPeriodHabits()` with **zero** queries; every other widget is empty; `PeriodChart` shows its empty message. `PeriodControl` disables "next" so the arrows cannot reach one, but a hand-edited URL can. |
| **Invalid `?period=` / `?date=`** | dropped from the URL with `router.replace`, default used. A shared link renders today rather than someone's garbage. |
| **`getTodayString` before `UserSettings` resolves** | `userToday` starts at the browser zone and settles; the hook keys the fetch on `anchorDate`, so the effect re-fires when the real zone lands and the correct range is fetched. |
| **A week spanning two months** | 🔴 **fixed** — chart 2 reads the week, not the month (§25.1) |
| **The current week/month includes unspent days** | 🔴 **fixed** — the habit window is clipped to `today` |
| **`bestDay` / `worstDay` on an empty score set** | both are `reduce`s with a `null` initial, so they return `null` rather than an accumulator identity |
| **A user with 0 habits** | `perHabit: []`, `totals.rate: null`, `byTier: []`, `activeTierMix: []` — the chart shows its empty message, not an empty axis |
| **Rapid period switching** | 🔴 **fixed** — the token guard; only the newest request writes |
| **A goal with no in-week progress rows** | contributes `0` to `progressDelta`, same as the old per-goal version |
| **`progressDelta` timezone** | `GoalProgress.date` is a `DateTime`, so rows are bucketed with `formatInTimeZone(..., timezone, ...)` before being compared to the week bounds. A late-evening check-in does not move into the neighbouring week. |
| **A 409/500 from any branch** | the whole `Promise.all` rejects → 500 → the single error surface |

---

## 17. Authentication & security

| Concern | Reality |
| ------- | ------- |
| Middleware gate | Inside the `(dashboard)` group; `src/proxy.ts` 307s unauthenticated requests to `/login?callbackUrl=…` |
| Session enforcement | Both endpoints `await auth()`. `dashboard/route.ts:19`, `insights/[id]/route.ts:15` |
| User identity | ✅ Both derive `userId` from `session.user.id`. A client-supplied userId is never read. |
| `params` handling | ✅ `insights/[id]/route.ts:20` awaits `context.params`. The static `dashboard` route has no `params`. |
| Query validation | ✅ `dashboardQuerySchema`: `period: z.enum([...])`, `date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/)`. Anchored. |
| **Silent period fallback** | 🔴 **open.** `analytics.service.ts:155` still coerces an unrecognised period to `'day'`. The client now refuses to *send* one and drops a bad one from the URL, which removes the UI path but not the API path. **F5.** |
| Insight delete scoping | ✅ `deleteOwned(userId, id)` is user-scoped. |
| 🔴 `InsightRepository.dismiss` | unscoped by user; zero callers. **F21.** |
| **No validation on the insight id** | 🔴 only a non-empty `trim()`. **F22.** |
| XSS | No `dangerouslySetInnerHTML` on the page or in any card. |
| CSRF | Same-origin cookie JWT. 🔴 `AICalloutCard`'s raw `fetch` sets neither `credentials` nor `cache`. **F23.** |
| Rate limiting | 🔴 **None.** Still the most expensive endpoint in the app to leave unthrottled. |
| `tsconfig` strictness | `strict`, `noUnusedLocals`, `noUnusedParameters`, `noUncheckedIndexedAccess` |
| Lint | **One** suppression on the analytics surface: `usePeriodUrlState.ts` `react-hooks/set-state-in-effect` on the `setIsLoading(true)` line, justified inline. The page itself has none. |
| a11y — period tabs | `role="tablist"` + `role="tab"` + `aria-selected`. ⚠ **Still no `tabpanel`, no `aria-controls`, no arrow-key handling** — unchanged, and the same anti-pattern as `/routine`, `/goals` and `/focus`. |
| a11y — status region | ✅ `role="status"` + `aria-live="polite"`, and `aria-busy` on the tree. |
| a11y — hero ring | 🔴 The number has no `aria-label` saying what the ring represents; a screen reader reads "84" with no context. |
| a11y — charts | ✅ **Improved.** Both `PeriodChart`s carry a generated `sr-only` summary sentence plus a real `<table>` of figures, wired via `aria-describedby`. 🔴 `MoodPulseCard` still has neither. |
| a11y — disclosure | ✅ `aria-expanded` + `aria-controls` on the detail toggle and on the figures toggle. |
| a11y — reduced motion | The only motion is a 200 ms opacity transition and the `Loader2` spin, plus the existing `Spinner`. ⚠ No explicit `prefers-reduced-motion` guard was added. |

---

## 18. Performance

### 18.1 Query cost per period — the headline number

Always-on: **20 branches**, of which `loadPeriodHabits` is 5 queries and the other 19 are 1 each → **24 queries**.

| Period | Always-on | Conditional | N+1 | Sequential | Total |
| ------ | --------- | ----------- | --- | ---------- | ----- |
| `day` | 24 | `dailyBreakdown` 4 (score, routine, sleep, reflection) + comparison 1 | **0** | **0** | **~29** |
| `week` | 24 | `weeklySummary` 7 (2× score range, sleep, streak, goals, progress range, rested) + comparison 1 | **0** | **0** | **~32** |
| `month` | 24 | `monthlySummary` 6 (score, sleep, focus, journal count, goals, milestones) | **0** | **0** | **~30** |
| `year` | 24 | `yearlySummary` 7 (score, sleep, streak, focus, journal count, goals, rested) | **0** | **0** | **~31** |

**Before:** ~28 / ~40 / ~45 / ~55, with six N+1 loops and two 12-deep sequential chains.

Two properties matter more than the absolute numbers:

1. **The four periods are within ~3 queries of each other.** The year tab used to cost twice the day tab.
2. **Cost is independent of habit count and goal count.** The three per-habit loops, the per-goal milestone loop and the per-goal progress-history loop are all gone. A user with 40 habits and 60 goals now costs the same as a user with 3 and 2.

### 18.2 🔴 FIXED — the heaviest single query

`analytics.service.ts` no longer calls `streakAnalytics` with `startDate: '2000-01-01'`. The dashboard's streak figures come from `streakProjections(row, today)`, which reads only the cached `Streak` row and applies the same risk rule. `/calendar` still calls the full `streakAnalytics`, because it renders the timeline.

### 18.3 🔴 FIXED — all six N+1 loops and both sequential chains

| # | Site before | Shape | Replacement |
| - | ----------- | ----- | ----------- |
| 1 | `weekly.ts` habits | 1 per ACTIVE habit | `loadPeriodHabits`'s single `findLogsByUserRange`, grouped in memory |
| 2 | `weekly.ts` goal progress | 1 per goal, up to 100 rows each | **`GoalRepository.findProgressByUserRange`** — one range query, grouped by goal in `groupProgressDelta` |
| 3 | `monthly.ts` habits — **sequential `for…of { await }`** | 1 per habit, serialised | same single range query |
| 4 | `monthly.ts` milestones | 1 per goal, **all** goals including archived | `GoalRepository.findCompletedMilestones(userId, rangeStart, rangeEnd)` — already existed, already scoped |
| 5 | `yearly.ts` habits — a year of logs per habit | 1 per habit | same single range query |
| 6 | `yearly.ts` journal — **12 sequential `countByMonth`** | 12 fixed | **`JournalRepository.countByRange`** — one `count` with `gte`/`lte` |

**Zero N+1 loops remain on this path.** §27.

### 18.4 Unbounded `findMany` calls — 4, unchanged

`timeEntryRepository.list`, `nutritionRepository.findAll`, `healthMetricRepository.findAll`, `goalRepository.findAll({})`. **§24 F11 is open.**

### 18.5 Front-end render cost

- **Two charts render up front; twelve cards render only when the disclosure is open.** The original audit measured 15 cards rendering simultaneously with no gate.
- 🔴 **The queries are still all paid.** The disclosure is a render decision, not a query decision — see §15.6.
- `PeriodChart`'s figure table and summary are cheap string operations over a series of at most 12 entries.
- The status region's `Loader2` and the 200 ms opacity transition are the only new motion.

### 18.6 Tests

| Suite | Tests | Covers |
| ----- | ----- | ------ |
| `tests/lib/analytics-period-habits.test.ts` | **23** | the denominator, `null` vs `0`, pooling vs mean-of-rates, the ≤100 % ceiling, window clipping, start/end bounds, paused habits, skip vs bare-skip-log, reschedule precedence, `noRecord` vs logged miss, tier `null`, the active tier mix, and `buildEligibilityContext`'s slug mapping and exception precedence |
| `tests/lib/analytics-format.test.ts` | **11** | `percentText`, `orNull`, `chartValue`, `widthPercent`, `deltaText` — the `null`-vs-`0` contract |

Both are pure and need no database. **Nothing covers `AnalyticsService`, the API route, or any component** — see §15.6.

### 18.7 Known waste

| # | Waste | Where | Status |
| - | ----- | ----- | ------ |
| 1 | `/api/habits` + `/api/routine` + `/api/goals` fetched and discarded | `AppContext` | 🔴 open |
| 2 | 2 `groupBy`s feeding unrendered `data.counts` | – | ✅ **fixed** |
| 3 | All-time `DailyScore` scan + discarded timeline | `analytics.service.ts` | ✅ **fixed** |
| 4 | 6 N+1 loops + 2 sequential chains | §18.3 | ✅ **fixed** |
| 5 | 4 unbounded `findMany`s | §18.4 | 🔴 open |
| 6 | `topMoments` / `bottomMoments` built with no consumer **on this path** | `daily.ts` | ⚠ genuinely used by `/recap`; cannot be removed |
| 7 | Week ran the full `monthlySummary` | – | ✅ **fixed** |
| 8 | The chart empty state implemented twice (page + `BarChart`) | – | ✅ **fixed** — `PeriodChart` owns it |
| 9 | The UI barrel pulls 26 modules for the 1 (`Spinner`) this page renders | `page.tsx` | 🔴 open |

---

## 19. External integrations

**One, and it is inert:**

- **`AIInsight`** — the `AICalloutCard` displays an insight and can delete it. No AI call is issued from this page; `src/server/ai/**` is never reached by `getDashboard`.
- 🔴 **The `generate-insights` cron is still a stub returning `generated: 0`**, so `aiInsight` is structurally `null`.
- **What changed:** the page no longer renders `AICalloutCard` at all when there is no insight. The old always-on empty state promised content the app cannot produce, and it was the only mutation the page had — so the dismiss button was permanently unreachable. **The component's own `insight === null` branch is now dead code** and can be removed the next time that file is touched.
- **No e-mail, no web push, no calendar sync, no billing call, no external API, no upload.**

---

## 20. Background jobs / cron effects

| Relationship | Detail |
| ------------ | ------ |
| `compute-daily-scores` cron | 🔴 **Still the single most important input.** `DailyScore` rows are what the period score averages, the monthly trend and the streak projection all read. The cron is bounded to 200 rows/run and idempotent, so `/analytics` reflects only what it has caught up on — **there is still no "scores are behind" indicator.** |
| `generate-insights` cron | 🔴 **Still a stub returning `generated: 0`.** |
| `sleep-notifications` cron | Writes `SleepLog` rows; analytics reads them in 4 places. |
| `/today` habit toggles | `HabitLog` writes are the other half of every completion figure. |

**Net:** freshness is still entirely a function of cron cadence, and the page still does not say so.

---

## 21. Data flow diagrams

### 21.1 The single request

```
  Browser — GET /analytics
    │
    ├─ useUserTimezone() → { timezone, today }   (via useSettings → GET /api/settings)
    ├─ usePeriodUrlState reads ?period= / ?date=, validating both
    │     invalid → delete the key, router.replace, fall back to the default
    └─ useEffect([period, anchorDate, attempt])
         token = { current: true }                    ◄── THE RACE GUARD
         setIsLoading(true)
         apiRequest('/api/analytics/dashboard?period&date')
             │
             └─ AnalyticsService.getDashboard        analytics.service.ts:150
                  │
                  :151  userRepository.getSettings(userId)      ◄── SEQUENTIAL
                  :152  timezone = settings?.timezone || 'UTC'
                  :153  userToday = getTodayString(timezone)
                  :156  range = getPeriodRange(period, today, timezone)
                  :158  rangeStart / rangeEnd = fromZonedTime(…, tz)   ✓ correct
                  │
                  :175  periodHabitsPromise = loadPeriodHabits(…)   ◄── started EARLY
                  │        ├ start > today → emptyPeriodHabits()    0 queries
                  │        └ else 5 queries, window clipped to today
                  │
                  :198  Promise.all of 20 ─────────────────────────────
                  │  ├ streak.findByUserId            ◄── no more 2000-01-01 scan
                  │  ├ sleep.findByRange · focus.getStats · task.findAll
                  │  ├ project.findAll · mood.getMoodRange · energy.getRange
                  │  ├ insight.findLatestByUser(5) · achievement.recentUnlocked(8)
                  │  ├ routine.findLogsByRange · goal.findCompletedMilestones
                  │  ├ focus.listBreaks · focus.findSessions · timeEntry.list
                  │  ├ nutrition.findAll · healthMetric.findAll · journal.findAll(5)
                  │  ├ productivityPattern.findPeakHours
                  │  └ periodHabitsPromise        (habits + logs + overrides
                  │                              + dayTypeDefinitions + exceptions)
                  │
                  :222  comparisonPromise = (day|week) ? score.findByRange(prev) : []
                  │
                  :227  Promise.all of 5 ──────────────────────────────
                  │  ├ dailyBreakdown  (day)    → score/routine/sleep/reflection
                  │  ├ weeklySummary   (week)   → 2×score, sleep, streak, goals,
                  │  │                                  progress range, rested
                  │  ├ monthlySummary  (month)  → score, sleep, focus, journal count,
                  │  │                                  goals, milestones
                  │  ├ yearlySummary   (year)   → score, sleep, streak, focus,
                  │  │                                  journal count, goals, rested
                  │  └ comparisonPromise
                  │     ⚠ monthlySummary is NOT fetched on the week period
                  │
                  :253  synchronous builders:
                  │     tierMix = periodHabits.activeTierMix      ◄── no 2nd habit read
                  │     hero    = buildHero(buildScoreAverage(...), periodHabits)
                  │     habits  = buildHabitPanel(periodHabits)
                  │     routine = buildRoutineTile(...)          ◄── all 4 periods
                  │     chart1  = buildChart1(period, day, periodHabits)
                  │     chart2  = buildChart2(period, tz, periodHabits, yearSummary)
                  │
                  └─ { success: true, data: AnalyticsDashboard }
                       │
                       └─ hook: only the NEWEST token may setData
                            └─ page: isStale ? opacity-60 : 100, aria-busy
```

### 21.2 Period switching

```
  user clicks a tab | ‹ | › | Today | Retry | back/forward
    │
    ├─ router.replace('/analytics?period=…&date=…')     ◄── URL is the source of truth
    │     setPeriod re-derives the anchor inside the new period
    │
    └─ useEffect([period, anchorDate]) re-fires
         │
         ├─ token of the PREVIOUS run is flipped by its cleanup → it can no longer write
         └─ GET /api/analytics/dashboard
              │
              └─ ~29–32 queries, flat across periods   (§18.1)
                   │
                   └─ if this token is still current → setData
                        ├─ previous period stays on screen at opacity-60
                        ├─ role="status" announces "Updating…"
                        └─ a failure says "…showing the last loaded period."
```

### 21.3 Dismissing an AI insight

Unchanged from the original audit: `AICalloutCard` → raw `fetch` DELETE → `auth()` → `await context.params` → `dismissInsight` → `deleteOwned(userId, trimmed)` → `onDismiss` → `setDismissedInsightId`.

⚠ `dismissedInsightId` is still client state, so a reload brings a dismissed insight back if the DELETE failed. **F24 open.**

---

## 22. File-by-file dependency inventory

Physical line counts.

### 22.1 Route files

| File | Physical | Directive | Export |
| ---- | -------- | --------- | ------ |
| `src/app/(dashboard)/analytics/page.tsx` | **538** | `'use client'` | `default function AnalyticsPage()` `:100` |

That is the entire directory. Module-private: `formatDuration` `:65` · `habitChartCopy` `:74` · `tierChartCopy` `:87` · `Tile` `:477` · `SideStat` `:502`.

Inherited: `(dashboard)/layout.tsx` · `(dashboard)/loading.tsx` · `(dashboard)/error.tsx`.

### 22.2 New files introduced by this pass

| Path | Physical | Role |
| ---- | -------- | ---- |
| `src/lib/analytics/period-habits.ts` | **341** | the pure period model and **the one habit metric** |
| `src/server/analytics/period-habits.ts` | **81** | `loadPeriodHabits` — five bulk queries |
| `src/server/analytics/eligibility-context.ts` | **86** | `buildEligibilityContext`, shared with the contribution service |
| `src/lib/analytics/format.ts` | **56** | the `null`-vs-`0` formatters |
| `src/hooks/usePeriodUrlState.ts` | **208** | URL state + fetch + race guard |
| `src/components/analytics/PeriodChart.tsx` | **182** | the chart + empty state + text alternative |
| `tests/lib/analytics-period-habits.test.ts` | **402** | 23 tests |
| `tests/lib/analytics-format.test.ts` | **83** | 11 tests |

### 22.3 Files modified

| Path | Physical | Change |
| ---- | -------- | ------ |
| `src/server/services/analytics.service.ts` | **1026** | dropped `ACCOUNT_EPOCH`, `buildTierMix`, `buildHabitCompletion`, `counts`, the month-on-week fetch and the all-time streak scan; added `buildScoreAverage`, `buildRoutineTile`, `buildHabitPanel`, `buildComparison`, `previousRange`, `resolvePeriodContext`, `getYearly`, `getDaily` |
| `src/server/analytics/daily.ts` | 211 | reads the shared model; `NOT_DUE` status; `habitReliability: number \| null` |
| `src/server/analytics/weekly.ts` | 323 | `timezone` required; pooled rate; `groupProgressDelta` replaces the per-goal loop |
| `src/server/analytics/monthly.ts` | 287 | `timezone` required; zoned focus window; `countByRange`; `findCompletedMilestones` |
| `src/server/analytics/yearly.ts` | 277 | `timezone` required; zoned focus window; `null` months; `countByRange`; shared model |
| `src/server/analytics/streaks.ts` | 235 | added `streakProjections` and `StreakRowSnapshot` |
| `src/types/analytics.ts` | 327 | `AnalyticsChartData.value: number \| null`; added `AnalyticsHabitPanel`, `AnalyticsHabitRow`, `AnalyticsComparison`, `today`; removed `counts` |
| `src/lib/habits/contribution-eligibility.ts` | 216 | `ContributionHabit.streakCount` |
| `src/server/services/habit-contribution.service.ts` | 127 | uses the shared `buildEligibilityContext` |
| `src/server/repositories/journal.repository.ts` | 740 | added `countByRange` |
| `src/server/repositories/goal.repository.ts` | 952 | added `findProgressByUserRange` |
| `src/components/charts/BarChart.tsx` | 162 | added `ariaDescribedBy` |
| `src/types/recap.ts` | 172 | **19 fields corrected to `number \| null`** |
| `src/app/(dashboard)/recap/page.tsx` | 655 | guards for every nullable field; year trend drops `null` months |
| `src/app/(dashboard)/reports/page.tsx` | 201 | guards for `averageCompletionRate`; `null` chart values passed through |
| `src/components/recap/{Daily,Weekly,Monthly,Yearly}Recap.tsx` | – | `percentText` for tier and habit rates |

### 22.4 Charts

`BarChart.tsx` 162 · `LineChart.tsx` 132 · `HeatMap.tsx` 122 · `Calendar.tsx` 143 · `ProgressRing.tsx` 84 — live. `TreeMap.tsx` 185 · `PieChart.tsx` 127 · `Gauge.tsx` 116 · `Histogram.tsx` 103 · `SparkLine.tsx` 90 — **dead**.

### 22.5 Server-side files reached

`app/api/analytics/dashboard/route.ts` 49 · `app/api/analytics/insights/[id]/route.ts` 31 · `server/services/analytics.service.ts` 1026 · `server/analytics/{daily,weekly,monthly,yearly,streaks}.ts` · **`server/analytics/period-habits.ts` 81** · **`server/analytics/eligibility-context.ts` 86** · **20 repositories** · `lib/analytics/period-habits.ts` 341 · `lib/habits/{contribution-eligibility,day-type-match,scheduling}.ts` · `lib/scheduling/day-type.ts` · `lib/period-range.ts` 230 · `lib/dates.ts` 253 · `lib/errors/app-error.ts` · `server/domain/streak/streak-calculator.ts` · `server/domain/sleep/sleep-analyzer.ts` · `config/scoring.ts` · `config/app.ts` · `constants/routine.ts`.

---

## 23. Current behavior summary

### 23.1 What actually happens, end to end

1. The root layout fetches habits, routines and goals. **`/analytics` reads none of them** — but a failure still raises a `DataErrorBanner`.
2. `useUserTimezone` resolves the timezone. `usePeriodUrlState` reads `?period=` / `?date=` from the URL, validating both and dropping anything it cannot honour.
3. One request fires. The server resolves `UserSettings`, computes a timezone-correct range, loads **one** period habit model in five queries (window clipped to today), and fans out across 20 repositories.
4. Exactly **one** period module runs — the one matching the selected tab — and it receives the preloaded habit model.
5. The response assembles into one `AnalyticsDashboard` literal. Every habit figure on it comes from the same `PeriodHabitModel`.
6. The page renders a hero, four summary tiles, three side stats and two charts. Twelve domain cards render behind a disclosure.
7. Switching period updates the URL, re-fetches, and **shows the old period dimmed with an announced "Updating…"** — never a stale number presented as current.
8. The only mutation available is dismissing an AI insight — into a table the `generate-insights` cron still never writes, and which now renders no card at all when empty.

### 23.2 The shape of the page in one line each

| Dimension | Reality |
| --------- | ------- |
| Page file size | 538 lines for the page, plus 208 (hook) + 182 (chart) + 56 (formatters) of new infrastructure |
| Rendering strategy | fully client-side; no server component, no streamed data |
| HTTP requests | **1** for all data, 1 for the only mutation, **0** for opening the detail disclosure or a chart's figure table |
| **Database queries** | **~29 (day) / ~32 (week) / ~30 (month) / ~31 (year)**, across 20 repositories — **flat, and independent of habit and goal count** |
| N+1 loops | **0** |
| Sequential query chains | **0** |
| Data ownership | no context member — still paying for three fetches it discards |
| URL state | ✅ **`?period=` / `?date=`** — linkable, bookmarkable, back-navigable |
| Persisted state | zero `localStorage` on this page |
| Real-time | none |
| Refetch indicator | ✅ `role="status"` "Updating…" + `aria-busy` + dimming |
| Race guard | ✅ **a per-effect token** |
| Partial rendering | 🔴 **none** — one failing branch blanks everything |
| Widget visibility | ⚠ one all-or-nothing disclosure; **per-widget preferences with server-side query skipping are not implemented** |
| Accessibility | ✅ `role="alert"` + Retry, `role="status"` live region, `aria-busy`, `aria-expanded` disclosures, two charts with `sr-only` summaries and figure tables. 🔴 ARIA tabs still without tabpanels; hero ring still unlabelled; `MoodPulseCard` chart still has no text alternative |
| Internationalisation | none — hard-coded English literals |
| Tests | **34** for the pure layers; **0** for the service, the route, or any component |

---

## 24. Findings register

Severity: **H** = wrong behaviour or a dead feature a user can notice · **M** = wasted work or an internal inconsistency · **L** = cosmetic or hygiene. **Status** is from the 2026-10-03 pass.

| #  | Sev | Status | Finding | Location |
| -- | --- | ------ | ------- | -------- |
| F1  | **H** | ✅ **fixed** | Focus totals ignored the user's timezone — `monthlySummary` and `yearlySummary` passed hardcoded `Z` instants to `getStats` while the service had computed a correct zoned range. | `monthly.ts`, `yearly.ts` |
| F2  | **H** | ✅ **fixed** | No race guard on the fetch — no `AbortController`, no request-sequence check, `setData` was last-write-wins. | `usePeriodUrlState.ts` |
| F3  | **H** | ✅ **fixed** | `tiles.routine` was always `null` off the day period. `buildRoutineTile` now computes it from the range's routine logs on **every** period. | `analytics.service.ts:534` |
| F4  | **H** | ✅ **fixed** | Hero sub-tiles were `null` on month and year. `buildScoreAverage` now populates Core / Growth / Bonus wherever the module has the score rows. | `analytics.service.ts:457` |
| F5  | **H** | 🔴 **open** | An invalid `period` silently becomes `'day'` in the service. The client now refuses to send one and strips a bad one from the URL, which closes the UI path but not the API path. | `analytics.service.ts:155` |
| F6  | **H** | ✅ **fixed** | Period and anchor date were `useState` only — not linkable, not bookmarkable, not in history. | `usePeriodUrlState.ts` |
| F7  | **H** | ⚠ **mitigated** | The AI callout was a permanent placeholder because the `generate-insights` cron is a stub. The card is now **not rendered at all** when there is no insight, so there is no false affordance — but the feature is still missing. | `page.tsx:465` |
| F8  | **M** | ✅ **fixed** | Six N+1 loops, two of them 12-deep sequential chains. **Zero remain.** | §18.3 |
| F9  | **M** | ✅ **fixed** | All-time `DailyScore` scan on every period switch, most of it discarded. Replaced by `streakProjections`. | `analytics.service.ts` |
| F10 | **M** | ✅ **fixed** | Two `groupBy` queries fed the unrendered `data.counts`. `counts` is gone. | – |
| F11 | **M** | 🔴 **open** | Four `findMany` calls with no `take`. | §18.4 |
| F12 | **M** | ✅ **fixed** for this path | Every analytics module declared its own repository singletons, so `findAll` ran 2–3× and `streak.findByUserId` 3–4×. The dashboard now loads one model and passes it in. The modules still hold their own singletons for their standalone callers. | `server/analytics/*` |
| F13 | **M** | ✅ **fixed** | Selecting Week ran the full `monthlySummary`. | `analytics.service.ts` |
| F14 | **M** | ✅ **fixed** | No loading indicator on refetch. | `page.tsx:146` |
| F15 | **M** | ✅ **fixed** | A refetch failure left stale cards with no signal. Now dimmed, announced, and explicitly labelled as the last loaded period. | `usePeriodUrlState.ts` |
| F16 | **M** | 🔴 **open** | Fetch failures bypass `ErrorReporter`, so a failed `/analytics` fetch is invisible to monitoring. | – |
| F17 | **M** | ✅ **fixed** | Client and server computed "am I at the current period?" with different timezone inputs. Both now read `getPeriodRange(..., timezone)`. | `usePeriodUrlState.ts:178` |
| F18 | **M** | ⚠ **reclassified** | `weekRange` is UTC-anchored. **Not a defect**: it maps a calendar date to its ISO Monday, which is zone-independent. | `weekly.ts:112` |
| F19 | **M** | ❌ **was wrong** | The audit called `weeklyRates` dead. It **is** consumed — `recap/page.tsx:522`. Kept, and its cost is now trivial because the per-habit log loop is gone. | `monthly.ts` |
| F20 | **M** | ⚠ **cannot fix here** | `topMoments` / `bottomMoments` are discarded by `getDashboard` but **used by `/recap`** via `DailyRecap`. | `daily.ts` |
| F21 | **M** | 🔴 **open** | `InsightRepository.dismiss` is unscoped by user — an IDOR-shaped method with zero callers. | `insight.repository.ts` |
| F22 | **M** | 🔴 **open** | No validation on the insight id beyond a non-empty `trim()`. | `analytics.service.ts` |
| F23 | **M** | 🔴 **open** | `AICalloutCard` uses raw `fetch` — no `credentials`, no `cache`, no `ApiError` unwrapping. | `AICalloutCard.tsx:38` |
| F24 | **M** | 🔴 **open** | Dismissal is client-state-only; a failed DELETE brings the insight back on reload. | `page.tsx:116` |
| F25 | **M** | ⚠ **partial** | No widget visibility gate. A single all-or-nothing disclosure now exists, but **per-widget preferences with server-side query skipping are not implemented**, and hiding a card does not remove its queries. | `page.tsx:421` |
| F26 | **M** | 🔴 **open** | No partial rendering — one failing branch blanks all 15 cards. | `analytics.service.ts` |
| F27 | **L** | 🔴 **open** | `PeriodControl.size` has no visual effect; both its ternaries are `'sm' ? X : X`. | `PeriodControl.tsx:59` |
| F28 | | – | *(merged into F14/F15; the duplicate empty state is gone)* | – |
| F29 | **L** | 🔴 **open** | `stat-tile` imported by two different specifiers in two sibling components. | `FocusSummaryCard.tsx:4`, `NutritionHealthCard.tsx:4` |
| F30 | **L** | ⚠ **partial** | `riskLevel === 'LOW'` is unreachable. `streakProjections` narrows its own return to `'MEDIUM' \| 'HIGH'`; `StreakAnalytics` still declares three. | `streaks.ts` |
| F31 | **L** | ✅ **fixed** | `buildChart2`'s `return []` guard was unreachable. The signature changed; the day/week/month branches no longer depend on a possibly-null `month`. | `analytics.service.ts:635` |
| F32 | **L** | ✅ **fixed** | `navigate` was not memoized. `step` is a `useCallback` inside the hook. | `usePeriodUrlState.ts:178` |
| F33 | **L** | 🔴 **open** | A stale doc reference in `PeriodControl.tsx:27` cites a `RoutineWidget` variant that does not exist. | `PeriodControl.tsx:27` |
| F34 | **L** | ⚠ **partial** | `AnalyticsService`'s field/method ordering was malformed. `dismissInsight` is still above the constructor; the field block is now contiguous. | `analytics.service.ts` |
| F35 | **L** | ⚠ **deferred** | Five dead chart components, 621 lines. Deliberately not deleted — pruning shared components is a repo-wide decision. | `charts/*` |
| F36 | **L** | ✅ | Zero `TODO`/`FIXME`/`HACK` markers in the analytics files. Positive. | – |
| F37 | **L** | ⚠ | Exactly one `eslint-disable` on the analytics surface, justified inline. Positive. | `usePeriodUrlState.ts:114` |
| F38 | **L** | ⚠ **partial** | No tests. **34 now exist** for the pure layers; the service, the route and every component remain untested. | `tests/lib/analytics-*.test.ts` |
| **F39** | **H** | ✅ **fixed** | *(new)* Four disagreeing denominators for one metric. One definition, pooled, on every tab. | `lib/analytics/period-habits.ts` |
| **F40** | **H** | ✅ **fixed** | *(new)* The current week and month were scored against days that had not happened, making the live period read worst. The habit window is clipped to `today`. | `server/analytics/period-habits.ts:52` |
| **F41** | **H** | ✅ **fixed** | *(new)* The year chart drew a zero-height bar for every month the user had not reached. `averageScore` is `null`, chart values are `number \| null`, and `PeriodChart` renders gaps and says "No data". | `yearly.ts`, `PeriodChart.tsx` |
| **F42** | **H** | ✅ **fixed** | *(new)* `types/recap.ts` declared `number` for 19 fields the server returns as `number \| null`, so `Math.round(...)` type-checked and rendered `NaN%`. | `types/recap.ts` |
| **F43** | **M** | ✅ **fixed** | *(new)* A `GROUP BY` habit read duplicated the tier-mix denominator and could disagree with the rate denominator when a habit was paused or archived between reads. The mix now comes from the same habit rows. | `period-habits.ts` `activeTierMix` |
| **F44** | **M** | ⚠ **open** | *(new)* `MoodPulseCard` still renders a raw `LineChart` with no text alternative, while the two `PeriodChart`s now have summaries and figure tables. | `MoodPulseCard.tsx` |
| **F45** | **L** | 🔴 **open** | *(new)* `PeriodChart.className` is declared but never passed. | `PeriodChart.tsx` |
| **F46** | **L** | 🔴 **open** | *(new)* No `prefers-reduced-motion` guard on the new opacity transition or the loading spinner. | `page.tsx`, `usePeriodUrlState.ts` |

---

## 25. Cross-period data leaks

**None remain.**

### 25.1 ✅ FIXED — chart 2 on the week period

The original audit's most user-visible leak:

```
analytics.service.ts (before)
  period === 'week'  ->  month.scores.byTier
                          i.e. the MONTH the week sits in
page.tsx (before)
  chart2Label('week') === "Tier completion (this month)"
```

The mismatch was *labelled*, so a user reading it was being told the truth — but the page still put a **month** total next to a **week** hero score and a **week** habit chart, and paid for a second month of habit aggregates to do it. A week spanning two months (29 Jan – 4 Feb) was labelled with January's numbers and silently ignored the four February days on screen.

Now `buildChart2` reads `habits.byTier` from the same period model that produced the hero and chart 1, for **day, week and month** alike. The week tab does not fetch `monthlySummary` at all.

### 25.2 ✅ FIXED — `tiles.routine` on week / month / year

```
analytics.service.ts (before)
  tiles.routine = day && day.routine.total > 0 ? day.routine : null
```

`day` only exists for `period === 'day'`, so three of four tabs showed `—` while the Routine detail card further down the page listed real per-block numbers for the same range. `buildRoutineTile` now computes `completed / total` from the range's routine logs on every period.

### 25.3 ✅ FIXED — the year chart's empty months

```
yearly.ts (before)
  monthlyScoreTrend — ALWAYS 12 entries, averageScore: 0 for months with no data
```

A user who joined in March saw nine bars at zero, indistinguishable from nine months of failure, and the page's empty-state guard never fired because the array was never empty.

`averageScore` is now `number | null`, `AnalyticsChartData.value` is `number | null`, and `PeriodChart` renders a `null` as a gap and "No data" in its table. `/recap`'s year trend drops the empty months rather than plotting them at zero.

### 25.4 ✅ FIXED — the all-time streak beside a period-scoped page

`streaks` is inherently all-time, so the number itself is right; what was missing was the **label**. The `SideStat` tag now reads **"All time"** instead of the selected period's range label.

---

## 26. Completion-rate definition drift

### 26.1 What it used to be

The same conceptual metric — "habit completion rate" — was computed **four different ways**, and the page rendered whichever matched the selected tab, so the number visibly changed meaning when the user clicked a tab:

| Module | Denominator | Excludes `SKIPPED` / `NOT_APPLICABLE`? | Counts a day the user never opened the app? |
| ------ | ----------- | ---------------------------------------- | -------------------------------------------- |
| `daily.ts` | the mean of per-tier rates, each over **all ACTIVE habits** | ❌ No | ✅ **Yes** — penalised |
| `weekly.ts` | the mean of per-habit rates over **logged rows** minus skips | ✅ Yes | ❌ **No** — a habit with no rows was excluded from the average entirely |
| `monthly.ts` | the same as week | ✅ Yes | ❌ No |
| `yearly.ts` | `completed / logs.length` | ❌ **No** — a deliberate skip counted as a failure | ❌ No |

The observable consequence, from the original audit: a user who completed 5 days and skipped 2 saw a **week** rate of 100 % (denominator 5) and a **year** rate of 71 % (denominator 365). Switching tabs moved the same week's number by ~30 points.

### 26.2 What it is now

**One definition, in `src/lib/analytics/period-habits.ts`:**

```
rate = completed / scheduled

scheduled   days in the window where isEligibleOn(habit, date, ctx).eligible holds:
            not archived, not paused, inside its start/end bounds, no skip /
            pause / not-applicable override, day type matches, and the frequency
            rule says it was due (a RESCHEDULE override counts).
completed   COMPLETED logs, counted ONLY on days the habit was actually due, so a
            retroactive tick cannot push a rate above 100 %.
rate        number | null — null when nothing was due, never 0
```

This is the **third** definition the repo already had — the eligibility/scheduled rate used by the contribution heatmap — applied to a period range instead of a year. **It is not a fourth definition.** `lib/habits/contribution-eligibility.ts` is reused directly, so the precedence rules pinned by `tests/lib/habit-contribution-eligibility.test.ts` (skip beats reschedule, pause beats both, day type checked before frequency) apply unchanged.

Two further properties the old four-way split lacked:

- **Pooled, not the mean of per-habit rates.** A once-a-week habit no longer gets the same vote as a twice-a-day one. Pooling is the same arithmetic `DailyScore.habitCompletionRate` uses, so the period tiles and the daily score agree by construction.
- **Clipped to `today`.** The live week and month are not scored against days the user has not lived.

### 26.3 Known consequence, inherited deliberately

`isEligibleOn` reads the habit's **current** `status`, so a habit paused *today* is retroactively ineligible for days it genuinely was due earlier in the window. That is the behaviour the pinned contribution rule already has, and diverging here would recreate exactly the multi-definition problem this change exists to remove.

### 26.4 One clarification about "skipped"

A bare `SKIPPED` `HabitLog` row does **not** shrink the denominator; a `SKIP_TODAY`/`SKIP_RANGE` **override** does. `HabitService.skipHabit` writes both, so the real user-facing skip flow removes the day correctly — but a stray log row alone must not be able to erase a failure. `tests/lib/analytics-period-habits.test.ts` pins both halves of that.

---

## 27. N+1 inventory

**Zero remain.** All six loops and both sequential chains are gone.

| # | Site before | Shape | Queries added | Replacement |
| - | ----------- | ----- | ------------- | ----------- |
| 1 | `weekly.ts` habits | `Promise.all(habits.map(findLogsByRange))` | 1 per ACTIVE habit | one `findLogsByUserRange`, grouped in memory |
| 2 | `weekly.ts` goal progress | `Promise.all(goals.map(getProgressHistory(100)))` | 1 per goal, 100 rows each | `GoalRepository.findProgressByUserRange` |
| 3 | `monthly.ts` habits | **`for…of { await }` — sequential** | 1 per habit, serialised | one `findLogsByUserRange` |
| 4 | `monthly.ts` milestones | `Promise.all(goals.map(getMilestones))` over **all** goals | 1 per goal | `findCompletedMilestones(userId, rangeStart, rangeEnd)` |
| 5 | `yearly.ts` habits | `Promise.all(habits.map(findLogsByRange))`, a year each | 1 per habit | one `findLogsByUserRange` |
| 6 | `yearly.ts` journal | **`for (m = 1..12) { await countByMonth }`** | **12, sequential** | `JournalRepository.countByRange` |

### 27.1 Worked example

A user with **25 active habits**, **12 goals**, and 3 years of history:

| Period | N+1 queries before | after |
| ------ | ------------------ | ----- |
| `day` | 0 | **0** |
| `week` | 74 (25 habits + 12 goals, ×2 because `monthlySummary` also ran) | **0** |
| `month` | 37, plus 25 serialised round-trips of latency | **0** |
| `year` | 37, plus 12 serialised round-trips | **0** |

### 27.2 What replaced them

- **Habits (1, 3, 5):** `loadPeriodHabits` calls `HabitRepository.findLogsByUserRange` **once** — a method that already existed and was already used by `HabitService.getLogsForDate` — plus `findOverridesByUserRange`, `listDayTypeDefinitions` and `findExceptionsByRange`. Five queries total, **independent of habit count and of range length**.
- **Goal progress (2):** `GoalRepository.findProgressByUserRange`, **new**. Takes **instants**, not calendar-day strings, because `GoalProgress.date` is a `DateTime`; passing strings would let Prisma coerce them to UTC midnight and shift which check-ins land in the week for any user not on UTC. Each row is then bucketed with `formatInTimeZone(..., timezone, ...)`.
- **Milestones (4):** `GoalRepository.findCompletedMilestones` already existed and is already date-scoped. The N+1 existed only because `monthlySummary` was counting milestones it then filtered in JS.
- **Journal (6):** `JournalRepository.countByRange`, **new**. `date` is a `YYYY-MM-DD` string column, so `gte`/`lte` is an indexable range scan where `countByMonth`'s `startsWith` was not.

---

## 28. What changed in the 2026-10-03 pass

The original audit was a documentation-only pass. This pass implemented the P0 and P1 items from the handoff plan.

### 28.1 Data correctness

| Change | Finding |
| ------ | ------- |
| One `completed / scheduled` definition, pooled, shared by every tab and every consumer | F39 |
| Habit windows clipped to `today` | F40 |
| Year months with no scored day are `null`, not `0`; charts draw gaps and tables say "No data" | F41 |
| `types/recap.ts`'s 19 false `number` declarations corrected to `number \| null` | F42 |
| `monthlySummary` no longer fetched on the week period; chart 2 reads the week | §25.1, F13 |
| `monthlySummary` and `yearlySummary` focus windows built with `fromZonedTime` | F1 |
| Every `Date`-typed column bucketed with `formatInTimeZone`, including the new bulk progress read | F17 |
| `Core` / `Growth` / `Bonus` populated on month and year | F4 |
| `tiles.routine` computed on all four periods | F3 |
| Streak card labelled "All time" | §25.4 |
| `lib/analytics/format.ts` — one place where `null` cannot become `0` | – |

### 28.2 Query cost

| Change | Finding |
| ------ | ------- |
| `loadPeriodHabits` — five bulk queries replace three per-habit loops | F8, F27.2 |
| `GoalRepository.findProgressByUserRange` replaces the per-goal progress loop | F8 |
| `GoalRepository.findCompletedMilestones` replaces the per-goal milestone loop | F8 |
| `JournalRepository.countByRange` replaces 12 sequential `countByMonth` calls | F8 |
| `streakProjections` replaces the all-time `DailyScore` scan | F9 |
| `data.counts` and both `groupBy`s removed | F10 |
| `activeTierMix` derived from the same habit rows, removing a duplicate read | F43 |

**Net: 6 N+1 loops → 0. 2 sequential chains → 0. ~55 worst-case queries → ~31, flat across all four periods and independent of habit and goal count.**

### 28.3 Navigation and request state

| Change | Finding |
| ------ | ------- |
| `usePeriodUrlState` — period and anchor in the URL, linkable and back-navigable | F6 |
| Per-effect token — only the newest request may write | F2 |
| `role="status"` "Updating…", `aria-busy`, and a dimmed tree during a refetch | F14 |
| A failed refresh keeps the last period and says so explicitly | F15 |
| `router.replace`, not `push`, so history is not buried | F6 |
| Invalid `?period=` / `?date=` dropped rather than obeyed | – |
| `setPeriod` re-derives the anchor inside the new period | – |
| Invalid input on a hand-edited URL costs **zero** habit queries | – |

### 28.4 Interface and accessibility

| Change | Finding |
| ------ | ------- |
| `PeriodChart` — generated `sr-only` summary, a real figure `<table>`, `aria-describedby`, period-specific empty messages | – |
| `BarChart` — new `ariaDescribedBy` prop | – |
| Twelve domain cards behind an `aria-expanded` disclosure, so the overview answers first | F25 (partial) |
| AI callout rendered only when a real insight exists | F7 |
| Chart titles and descriptions name the **exact range** | – |
| Tiles state their denominator ("5 of 7 due") | – |

### 28.5 Deliberately not done, and why

| Not done | Why |
| -------- | --- |
| Per-widget preferences with server-side query skipping | The plan is explicit that a client-only gate must not claim a server saving. `getDashboard` still fetches every widget dataset. Doing it properly needs the widget set to be a request parameter, which is a contract change. |
| `Promise.allSettled` / per-widget error boundaries | F26 is real but the fix changes the API contract (a widget has to be able to fail independently) — a separate change. |
| `ErrorReporter` on the fetch path | F16. Small, but it needs a decision about which failures are worth reporting. |
| Deleting the five dead chart components | The plan says not to remove shared components just because one route stopped referencing them. |
| Comparison for month and year | Comparing a part-lived month against a whole one produces a flattering number. There is no defensible clipping without inventing one. |
| Component tests | jsdom is available; no component on this page has a test. `usePeriodUrlState` is the highest-value target — the race guard is the kind of bug that only shows up under rapid input. |

---

*End of `/analytics` audit.*
