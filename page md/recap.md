# `/recap` — Complete System Audit

**Route:** `http://localhost:3000/recap`
**Route file:** `src/app/(dashboard)/recap/page.tsx` (648 physical / 610 non-blank lines, `'use client'`)
**Project:** RoutineOS (`daily-plan`) — Next.js 16 (App Router) + Prisma 7 + PostgreSQL (Neon)
**Audit date:** 2026-09-30 · **Re-verified:** 2026-10-03 · **Status:** documentation-only pass — no code was changed. Every claim is file-anchored.
**Sibling routes:** `src/app/(dashboard)/recap/loading.tsx`, `recap/weekly-review/page.tsx` (372 lines), `recap/monthly-reset/page.tsx` (443 lines)

> **Line-count convention:** **physical** line counts. PowerShell's `Measure-Object -Line` skips blank lines.

> ### ⚠ Re-verification note (2026-10-03)
>
> This document was written 2026-09-30. The analytics layer has since been refactored — `loadPeriodHabits` (`server/analytics/period-habits.ts`) replaced the per-habit log loops, and `timezone` became a **required** parameter of `weeklySummary` / `monthlySummary` / `yearlySummary`. **Four findings in the original pass were fixed in that refactor and are now retired**: the per-habit habit N+1 (old F2), the yearly `logs.length` denominator (old F3), the sequential journal/milestone reads (old F23), and the UTC-vs-zoned `goals.completed` split (old §27). Sections that described them have been rewritten rather than deleted, so the reader can see what changed and why the old line numbers no longer resolve. Where a finding survives, the line numbers have been refreshed to the current source.

> ### Two critical / major defects that remain
>
> 1. 🔴 **The day period's empty state is unreachable.** `recap.service.ts:532` computes `hasData = score?.totalScore !== null || …`. When there is **no** `DailyScore` row, `score` is `null`, so `score?.totalScore` is `undefined`, and **`undefined !== null` is `true`**. `hasData` is therefore always `true` for `period: 'day'` — a brand-new user with zero activity gets a full page of empty cards instead of the "No recap data available for this period" state. See [§25](#25-the-day-periods-empty-state-is-unreachable).
> 2. 🟠 **Period navigation is computed in UTC while everything else is timezone-aware.** `page.tsx:97` calls `shiftAnchor(anchorDate, period, delta)` **without the 4th argument**, so it defaults to `DEFAULT_TZ` (`'UTC'`, `lib/dates.ts:25`) — even though the same component passes `timezone` correctly to `PeriodControl` four lines later (`:118`). `PeriodControl`'s own docstring (`:68`–`:71`) records that passing the wrong argument here previously crashed `/analytics` with `RangeError: Invalid time value`. `src/app/(dashboard)/analytics/page.tsx` no longer shares this — it was migrated to `usePeriodUrlState`. See [§26](#26-shiftanchor-is-called-without-the-timezone) and [§7.4](#74-️-the-real-fix-already-exists--and-recap-is-not-using-it).
> 3. 🟠 **The fix for all of the client's period-state problems already exists and this page is not using it.** `src/hooks/usePeriodUrlState.ts` was written specifically for the four findings below — its docstring names `/analytics` as the page it was built for. `/analytics` adopted it; `/recap` still hand-rolls `useState` + raw `fetch`. Adopting it closes **F11** (timezone change does not refetch), **F12** (no URL state), **F21** (no retry), **F26** (the `shiftAnchor` bug above) and half of **F22** (no `AbortController`, no `apiRequest`). §7.4, F38.

> ### Also structural
> - `buildExtras` runs **before** the period branch (`recap.service.ts:181`) and always fires **16** parallel reads — including `streakAnalytics(userId, { startDate: '2000-01-01', end })` (`:244`), which materialises the user's **entire** `DailyScore` history on every period change, including a single-day view.
> - `buildWeek:544` and `buildMonth:561` re-fetch the exact `DailyScore` range that `weeklySummary`/`monthlySummary` already fetched. One redundant query per week and per month view. Neither module accepts a preloaded score array, though all four now accept `preloadedHabits`.
> - 🔴 **A fourth "scheduled" denominator survives — in the recap heatmap itself.** `recap.service.ts:255`–`:268` rebuilds `{completed, scheduled}` from raw `HabitLog` rows and excludes `SKIPPED`/`NOT_APPLICABLE` but **not** eligibility, and it has **no `noRecord` state**. `PeriodHabitDay` (`lib/analytics/period-habits.ts:63`) already carries `{date, completed, scheduled, noRecord}` and is already loaded once per period by the period builder. See [§27](#27-the-recap-heatmap-uses-a-log-row-denominator-not-eligibility).
> - `ExtrasGrid` always renders **13 cards**, including on the day period where 12 of them are structurally empty.
> - `error` is a **boolean**. The error state offers "Go to Today", never "Retry", so a failed period switch is unrecoverable without a manual reload.
> - `yearlySummary`'s `averageProgress` is **unclamped** and can exceed 100; `recap.service.ts:346` clamps the equivalent figure to 0–100.
> - `generateWeeklyRecap` (`server/recap/weekly.ts`, live via `review.service.ts`) still holds the last per-habit `findLogsByRange` N+1 and a `total: logs.length` denominator that includes `SKIPPED`. It is the only remaining member of the old defect family — see [§6.4](#64-two-surfaces-still-diverging-on-scheduled).

---

## Table of contents

| §   | Section                                                                                       |
| --- | --------------------------------------------------------------------------------------------- |
| 1   | [What `/recap` is, in one paragraph](#1-what-recap-is-in-one-paragraph)                         |
| 2   | [UI block diagram](#2-ui-block-diagram)                                                       |
| 3   | [UI → component mapping](#3-ui--component-mapping)                                            |
| 4   | [Frontend architecture](#4-frontend-architecture)                                             |
| 5   | [Backend / API architecture](#5-backend--api-architecture)                                    |
| 6   | [Database dependency](#6-database-dependency)                                                 |
| 7   | [Period-range and timezone logic](#7-period-range-and-timezone-logic)                          |
| 8   | [Complete user actions (serial)](#8-complete-user-actions-serial)                             |
| 9   | [What can the user create](#9-what-can-the-user-create)                                       |
| 10  | [What can the user edit](#10-what-can-the-user-edit)                                          |
| 11  | [What can the user delete](#11-what-can-the-user-delete)                                      |
| 12  | [Cross-page dependencies](#12-cross-page-dependencies)                                        |
| 13  | [Impact analysis](#13-impact-analysis)                                                        |
| 14  | [Current System Capabilities](#14-current-system-capabilities)                                |
| 15  | [Currently NOT Supported](#15-currently-not-supported)                                        |
| 16  | [Loading / Error / Empty / Edge states](#16-loading--error--empty--edge-states)               |
| 17  | [Authentication & security](#17-authentication--security)                                     |
| 18  | [Performance](#18-performance)                                                                |
| 19  | [External integrations](#19-external-integrations)                                            |
| 20  | [Background jobs / cron effects](#20-background-jobs--cron-effects)                           |
| 21  | [Data flow diagrams](#21-data-flow-diagrams)                                                  |
| 22  | [File-by-file dependency inventory](#22-file-by-file-dependency-inventory)                    |
| 23  | [Current behavior summary](#23-current-behavior-summary)                                      |
| 24  | [Findings register](#24-findings-register)                                                     |
| 25  | [The day period's empty state is unreachable](#25-the-day-periods-empty-state-is-unreachable) |
| 26  | [`shiftAnchor` is called without the timezone](#26-shiftanchor-is-called-without-the-timezone) |
| 27  | [The recap heatmap uses a log-row denominator, not eligibility](#27-the-recap-heatmap-uses-a-log-row-denominator-not-eligibility) |

> Sub-sections: [§6.3](#63-goalcompletedat-bucketing---resolved-2026-10-03) · [§6.4](#64-two-surfaces-still-diverging-on-scheduled) · [§7.4](#74-️-the-real-fix-already-exists--and-recap-is-not-using-it) · [§21.3](#213--resolved--goalscompletedat-is-now-zoned-on-both-paths) · [§25.1](#251--the-same-predicate-is-simultaneously-too-permissive-and-too-narrow) · [§27.1](#271-the-divergence) · [§27.2](#272-three-ways-the-heatmaps-rule-is-wrong) · [§27.3](#273-the-fix-is-one-parameter-and-it-deletes-a-query) · [§27.4](#274-the-sibling-divergence-outside-recap) · [§27.5](#275-why-this-was-missed)

---

## 1. What `/recap` is, in one paragraph

`/recap` is the app's **period review** surface. It is a `'use client'` Client Component (`page.tsx:1`) that fetches **one** endpoint, `GET /api/recap?period=…&date=…`, and re-renders a completely different layout for each of four periods — **day / week / month / year** — selected by a shared `PeriodControl` tab strip. The week view is the default. Each period renders a period-specific hero (`DailyRecap` / `WeeklyRecap` / `MonthlyRecap` / `YearlyRecap`), a Recharts score trend, a `BestDayCard`, a `MilestoneCard`, a 13-card `ExtrasGrid` of enrichment cards, a free-text "at a glance" highlights panel, and a `ShareRecapCard` that copies a plain-text summary to the clipboard. Navigation is a `‹ ›` pair plus a "Today" button; the `›` arrow disables once the visible period already contains today. **The page is entirely read-only** — there is not one form, button-that-mutates, or optimistic update on it. Every number is computed server-side per request from real rows; the file's own header comment (`:264`) states the rule explicitly: *"Real share stats (never fabricated; 0 superseded by '—' markers)"*. The heavy lifting is in `RecapService.getReport` (604 lines), which fans out to `src/server/analytics/*` and **16 repositories**.

---

## 2. UI block diagram

```
/recap  (src/app/(dashboard)/recap/page.tsx — 'use client', 648 lines)
│
└── <div class="container mx-auto max-w-7xl px-4 py-8">                 :100
    │
    ├── HEADER ROW  flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between  :101
    │   ├── <div>
    │   │   ├── <h1 class="text-2xl font-bold text-foreground">Recap</h1>          :103
    │   │   └── <p class="mt-1 text-sm text-muted-foreground">
    │   │         "Review how your habits, routine, sleep and scores evolved."      :104–106
    │   │
    │   └── <PeriodControl                                                     :109–119
    │         period={period} onPeriodChange={setPeriod}
    │         label={report?.label ?? '—'}
    │         onPrev={() => navigate(-1)}   onNext={() => navigate(1)}
    │         onToday={() => setAnchorDate(today)}
    │         anchorDate={anchorDate} maxAnchor={today} timezone={timezone}
    │         ⚠ navigate() calls shiftAnchor WITHOUT the timezone           :97  → §26
    │
    └── BODY — a 3-way exclusive branch                                  :122–138
        │
        ├── loading   → <SkeletonGrid/>                                    :122 → :418
        │              4× h-32 rounded-2xl bg-muted (xl:grid-cols-4) + one h-72
        │
        ├── error     → <EmptyState icon={<TrendingUp/>}                        :124
        │                 title="Couldn't load your recap"
        │                 body="Please try again in a moment."
        │                 + <Link href="/today">Go to Today</Link>       ◄── no Retry   :437
        │
        ├── !hasData  → <EmptyState icon={<CalendarDays/>}                       :130
        │                 title="No recap data available for this period."
        │                 body="Log habits, complete your routine, and track sleep…"
        │                 ⚠ UNREACHABLE for period='day'                             → §25
        │
        └── <RecapDashboard period={period} report={report} />            :137 → :143
            │
            ├── period === 'day' && report.day                           :144–153
            │     <DailyRecap day={report.day} />
            │     <Highlights … />
            │     <ExtrasGrid extras={report.extras} />          ◄── 13 cards, all optional
            │     <ShareRecapCard periodLabel="Today" stats={dayShareStats(…)} />
            │
            ├── period === 'week' && report.week                        :155–190
            │     <WeeklyRecap week={report.week} />
            │     <TrendCard title="Score trend" rows={7 × EEE→totalScore}
            │                delta={report.week.trend.delta} accent="#10b981" />
            │     grid md:grid-cols-2 lg:grid-cols-3
            │       ├── <BestDayCard date={EEE, MMM d} score={rounded}
            │       │                subtitle="Most consistent: {habitName}" />   (conditional)
            │       └── <MilestoneCard milestones={weekMilestones(report.week)} />
            │     <ExtrasGrid />
            │     <Highlights />
            │     <ShareRecapCard periodLabel={report.label} stats={weekShareStats(…)} />
            │
            ├── period === 'month' && report.month                      :192–226
            │     <MonthlyRecap />
            │     <TrendCard title="Daily scores" rows={day-number→score} accent="#f59e0b" />
            │     <BestDayCard date={MMM d} subtitle="{n} perfect day(s)" /> (conditional)
            │     <MilestoneCard milestones={monthMilestones(report.month)} />
            │     <ExtrasGrid /> <Highlights /> <ShareRecapCard … />
            │
            ├── period === 'year' && report.year                        :228–259
            │     <YearlyRecap />
            │     <TrendCard title="Monthly average scores"
            │                rows={monthlyScoreTrend → MMM→averageScore}
            │                accent="#6366f1" headline={rounded(averageScore)} />
            │     <BestDayCard date={bestMonth.month}                     ◄── see §16.3
            │                score={rounded(bestMonth.averageScore)}
            │                subtitle="{totalDaysScored} days scored all year" /> (conditional)
            │     <MilestoneCard milestones={yearMilestones(report.year)} />
            │     <ExtrasGrid /> <Highlights /> <ShareRecapCard … />
            │
            └── return null   ◄── silently blank if period/report mismatch  :261
```

### 2.1 `Highlights` — `page.tsx:449`–`:603`

Four period-specific panels, each a `glass-panel` titled *"Day / Week / Month / Year at a glance"* containing a 2-column `HighlightCard` pair (`emerald` = wins, `rose` = watch out).

```
Highlights (period)                                                    :449
├── 'day'   → "Day at a glance"      Wins: day.topMoments          :455–475
│                                      Needs work: day.bottomMoments
├── 'week'  → "Week at a glance"     Top moment:  best day, most-consistent habit  :477–518
│                                      Watch out:  worst day, avg sleep, trend delta
├── 'month' → "Month at a glance"    Highlights: best day, most reliable habit,
│                                                journal entry count               :520–562
│                                      Focus areas: focus duration+sessions,
│                                                 avg sleep, habits missed
└── 'year'  → "Year at a glance"     Highlights: best month, best habit, longest streak  :564–600
                                       Watch out: worst month, habits missed, focus total
```

Every list is built as `[cond ? value : null, …].filter(item => Boolean(item))`, and `HighlightCard` (`:605`–`:648`) renders `items.length ? <ul> : <p>{empty}</p>`. ✅ **No fabricated rows** — this is the one part of the page that is rigorously defensive.

`month` is the only branch that sorts: `month.habits.perHabit.filter(h => h.weeklyRates.some(r => r !== null)).sort((a,b) => b.completionRate - a.completionRate)[0]` (`:522`–`:524`) — "most reliable" is derived on the client rather than returned by the service.

### 2.2 The milestone builders — `page.tsx:338`–`:414`

Three pure functions build `Milestone[]` client-side from the already-fetched report. Each emits at most 3 items and each guards on `> 0`:

| Builder | Lines | Emits |
| ------- | ----- | ----- |
| `weekMilestones` | 338–362 | Perfect days, Longest streak, Most consistent |
| `monthMilestones` | 364–388 | Goals completed, Perfect days, Habit completions |
| `yearMilestones` | 390–414 | Longest streak, Goals completed, Habit completions |

Note `"Perfect days"` is described as **"N days at 100 points"** (`:343`, `:376`) while the threshold in all three analytics modules is `>= 95` (`weekly.ts:247`, `monthly.ts:257`, `yearly.ts` via `THRESHOLDS.achievements.perfectDay = 95`). §24 F14.

### 2.3 The four share-stat builders — `page.tsx:291`–`:334`

Each returns 4 `ShareStat[]` for `ShareRecapCard`'s 2×2 `<dl>`. The `'—'` convention is applied consistently to genuinely-absent values:

| Period | Score | Habit/Routine | Third | Fourth | `—` guards |
| ------ | ----- | ------------- | ----- | ------ | ---------- |
| day | `total != null ? round(total) : '—'` | `round(habitReliability)%` (no guard) | `routine.total > 0 ? round(rate)% : '—'` | `durationMinutes != null ? fmt : '—'` | 3 of 4 |
| week | `round(average)` | `round(averageCompletionRate)%` | `{current} day(s)` | `loggedDays > 0 ? fmt : '—'` | 1 of 4 |
| month | `round(average)` | `{totalCompleted}` | `{goals.completed}` | `{round(totalFocusMinutes/60)}h` | **0 of 4** |
| year | `round(averageScore)` | `{totalDaysScored}` | `{habits.totalCompleted}` | `{longest} days` | **0 of 4** |

⚠ `day.habitReliability` is printed with **no zero-guard** (`:294`) — a day with no habit logs renders `0%` where the sibling cells correctly render `—`.

---

## 3. UI → component mapping

### 3.1 Direct imports from `page.tsx` (`page.tsx:3`–`:34`) — **25 imports**

| Import | From | Lines | Directive | Role |
| ------ | ---- | ----- | --------- | ---- |
| `useCallback, useEffect, useRef, useState` | `react` | — | — | 5 state hooks + a `requestId` ref for race guarding |
| `format, parseISO` | `date-fns` | — | — | chart labels, date rendering |
| `CalendarDays, TrendingUp` | `lucide-react` | — | — | empty-state icons |
| `useUserTimezone` | `@/hooks/useUserTimezone` | 45 | `'use client'` | the user's `timezone` + `today` |
| `shiftAnchor, type Period` | `@/lib/period-range` | 230 | none | period navigation |
| `PeriodControl` | `@/components/shared/PeriodControl` | 158 | `'use client'` | the tab strip + arrows |
| `DailyRecap` | `@/components/recap/DailyRecap` | 142 | `'use client'` | day hero |
| `WeeklyRecap` | `@/components/recap/WeeklyRecap` | 80 | `'use client'` | week hero |
| `MonthlyRecap` | `@/components/recap/MonthlyRecap` | 102 | `'use client'` | month hero |
| `YearlyRecap` | `@/components/recap/YearlyRecap` | 120 | `'use client'` | year hero |
| `BestDayCard` | `@/components/recap/BestDayCard` | 37 | `'use client'` | celebratory best-day |
| `MilestoneCard`, `type Milestone` | `@/components/recap/MilestoneCard` | 77 | `'use client'` | tone-coloured milestone list |
| `ShareRecapCard`, `type ShareStat` | `@/components/recap/ShareRecapCard` | 85 | `'use client'` | clipboard summary |
| `TrendCard` | `@/components/recap/TrendCard` | 131 | `'use client'` | Recharts area chart |
| `HabitHeatmapCard` | `@/components/recap/HabitHeatmapCard` | 48 | `'use client'` | extras |
| `SleepTrendCard` | `@/components/recap/SleepTrendCard` | 70 | `'use client'` | extras |
| `MoodEnergyCard` | `@/components/recap/MoodEnergyCard` | 114 | `'use client'` | extras |
| `FocusBreakdownCard` | `@/components/recap/FocusBreakdownCard` | 48 | `'use client'` | extras |
| `GoalsProgressCard` | `@/components/recap/GoalsProgressCard` | 65 | `'use client'` | extras |
| `TaskThroughputCard` | `@/components/recap/TaskThroughputCard` | 40 | `'use client'` | extras |
| `NutritionHealthCard` | `@/components/recap/NutritionHealthCard` | 70 | `'use client'` | extras |
| `StreakMilestonesCard` | `@/components/recap/StreakMilestonesCard` | 74 | `'use client'` | extras |
| `JournalCard` | `@/components/recap/JournalCard` | 43 | `'use client'` | extras |
| `RoutineExceptionsCard` | `@/components/recap/RoutineExceptionsCard` | 68 | `'use client'` | extras |
| `MilestoneHitsCard` | `@/components/recap/MilestoneHitsCard` | 72 | `'use client'` | extras |
| `ReflectionNarrativesCard` | `@/components/recap/ReflectionNarrativesCard` | 53 | `'use client'` | extras |
| `LinkedReviewCard` | `@/components/recap/LinkedReviewCard` | 64 | `'use client'` | extras (conditional) |
| `type RecapReport`, `type RecapExtras` | `@/types/recap` | 166 | none (types only) | the response contract |

### 3.2 `src/components/recap/**` — exhaustive (22 files)

| # | File | Lines | `'use client'` | Imported by |
| - | ---- | ----- | -------------- | ----------- |
| 1 | `TrendCard.tsx` | 131 | `:1` | `page.tsx:19` |
| 2 | `YearlyRecap.tsx` | 120 | `:1` | `page.tsx:15` |
| 3 | `MoodEnergyCard.tsx` | 114 | `:1` | `page.tsx:22` |
| 4 | `MonthlyRecap.tsx` | 102 | `:1` | `page.tsx:14` |
| 5 | `DailyRecap.tsx` | 142 | `:1` | `page.tsx:12` |
| 6 | `ShareRecapCard.tsx` | 85 | `:1` | `page.tsx:18` |
| 7 | `MilestoneCard.tsx` | 77 | `:1` | `page.tsx:17` |
| 8 | `StreakMilestonesCard.tsx` | 74 | `:1` | `page.tsx:27` |
| 9 | `MilestoneHitsCard.tsx` | 72 | `:1` | `page.tsx:31` |
| 10 | `SleepTrendCard.tsx` | 70 | `:1` | `page.tsx:21` |
| 11 | `NutritionHealthCard.tsx` | 70 | `:1` | `page.tsx:26` |
| 12 | `RoutineExceptionsCard.tsx` | 68 | `:1` | `page.tsx:30` |
| 13 | `GoalsProgressCard.tsx` | 65 | `:1` | `page.tsx:24` |
| 14 | `LinkedReviewCard.tsx` | 64 | `:1` | `page.tsx:28` |
| 15 | `ReflectionNarrativesCard.tsx` | 53 | `:1` | `page.tsx:32` |
| 16 | `FocusBreakdownCard.tsx` | 48 | `:1` | `page.tsx:23` |
| 17 | `HabitHeatmapCard.tsx` | 48 | `:1` | `page.tsx:20` |
| 18 | `JournalCard.tsx` | 43 | `:1` | `page.tsx:29` |
| 19 | `TaskThroughputCard.tsx` | 40 | `:1` | `page.tsx:25` |
| 20 | `BestDayCard.tsx` | 37 | `:1` | `page.tsx:16` |
| 21 | `stat-tile.tsx` | 35 | **none** | the four period heroes |
| 22 | — | — | — | *no `index.ts`; every import is by full path* |

`stat-tile.tsx` is a local `StatTile` with **no** `'use client'` directive, while the four files that use it (`DailyRecap.tsx` etc.) do — it is therefore compiled into each of their client bundles rather than shared, and its `accent` prop is `string`-concatenated into a template literal (`:27`) rather than passed to `cn`. Cosmetic.

### 3.3 Two components that shadow each other

`src/components/dashboard/WeeklyRecap.tsx` (143 lines) is a **different** component from `src/components/recap/WeeklyRecap.tsx` (80 lines). Both are default exports named `WeeklyRecap`. The recap one is the one on this page; the dashboard one is the `/dashboard` panel that AGENTS.md notes derives from the shared overview rather than `/api/recap/weekly`. §24 F20.

### 3.4 Client-boundary check

✅ **Clean.** `@/lib/period-range` imports only `date-fns`, `date-fns-tz` and `./dates`. `useUserTimezone` → `useSettings` → the zustand store. `@/types/recap` imports `type { Period }` only. **No `@/server/**`, no `@/lib/prisma`, no Prisma value import is reachable from this page** — notably better than `/journal`'s three parallel mood stores, where two of the three are dead.

---

## 4. Frontend architecture

### 4.1 Page structure

| Concern | Reality |
| ------- | ------- |
| Directive | `'use client'` — `page.tsx:1`. One 648-line client component containing 8 additional local function components. |
| Route-level `loading.tsx` | **Exists** (12 lines) — but because the page is a client component that does its own fetching, this only covers the RSC/bundle phase. The page then renders its **own** `SkeletonGrid` (`:418`). **Two skeletons, two different shapes.** §24 F18 |
| Route-level `error.tsx` | **Does not exist.** A throw inside any of the 8 local components blanks the route to the nearest boundary. |
| Data fetching | Raw `fetch` at `:78` — **not** the shared `apiRequest`. Loses `ApiError` typing and the `{success,data}` unwrap; `json.data` is cast with `as RecapReport` (`:82`). Every other audited page uses `apiRequest`. |
| Race guarding | ✅ Good. `requestId = useRef(0)`; `load` takes `++requestId.current` and every `setState` is behind `if (requestId.current !== id) return`. A superseded response cannot overwrite a newer one. |
| Abort | ❌ No `AbortController`. The guard works, but the stale request still runs to completion server-side — see §18. |
| State | 6 pieces: `period`, `anchorDate`, `report`, `loading`, `error`, plus `today`/`timezone` from the hook. `anchorDate` starts `''` and is filled by an effect (`:69`–`:71`) — the pattern that guarantees the anchor is never frozen to a wrong first-render value, documented at `:58`–`:62`. |
| Derived rendering | `RecapDashboard` (`:143`) is a chain of 4 `if` guards on `period === X && report.X`. If the guard falls through all four it `return null` (`:261`) — a **silent blank page** with no error. |
| URL state | ❌ None on this page. **But `/analytics` solved it** — see F38. `/recap` keeps `period` and `anchorDate` in `useState`, so a recap view is not linkable, shareable, or back-button-navigable. |
| `report.extras` | The type marks it optional (`types/recap.ts:92`) and every render site guards `{report.extras && …}` (`:149`, `:185`, `:221`, `:254`) — but `buildExtras` **always** returns it, so the guard is vestigial dead defence. |

### 4.2 The 13-card `ExtrasGrid` (`page.tsx:271`–`:289`)

```
<div class="grid gap-6 md:grid-cols-2 xl:grid-cols-3">       :273
├── HabitHeatmapCard      habitHeatmap                          (always)
├── SleepTrendCard        sleepTrend                            (always)
├── MoodEnergyCard        moodEnergy                            (always)
├── FocusBreakdownCard    focusByCategory                       (always)
├── GoalsProgressCard     goalsDelta                            (always)
├── TaskThroughputCard    taskThroughput                        (always)
├── NutritionHealthCard   nutrition + health                    (always)
├── StreakMilestonesCard  streakEvents + achievements           (always)
├── JournalCard           journal                               (always)
├── RoutineExceptionsCard routineExceptions                    (always)
├── MilestoneHitsCard     milestoneHits                         (always)
├── ReflectionNarrativesCard reflections                        (always)
└── LinkedReviewCard      linkedReview                          ◄── CONDITIONAL
```

12 of 13 are **unconditional**, so the grid renders identically on all four periods. That is defensible — each card owns its own empty state and the service returns `null`/`[]` rather than fabricating — but it means the **day** view is a single `DailyRecap` followed by 12 mostly-empty cards, and the **week** view puts 13 cards below the fold.

`LinkedReviewCard` is the one card the page treats as optional, and correctly so: `linkedReviewFor` returns `null` for the `day` and `year` periods entirely (`recap.service.ts:487`, `:500`, `:514`).

### 4.3 `PeriodControl` (`components/shared/PeriodControl.tsx`, 158 lines)

The shared navigator. Five tabs (`role="tablist"` / `role="tab"` / `aria-selected`) from `PERIOD_ORDER`, a `‹` button, the range label, a `›` button, and a "Today" text button. Responsive: `flex-wrap` with `justify-center sm:justify-start` and the label on `basis-[150px]` (`:127`) — the comment at `:84`–`:86` records that an un-wrappable row pushed "Today" off-screen at 375px.

The `›` disable logic (`:72`–`:81`):

```ts
const atCurrentPeriod = useMemo(() => {
  if (!anchorDate || !maxAnchor) return false;
  try { return shiftAnchor(anchorDate, period, 1, timezone) > maxAnchor; }
  catch { return false; }        // never let date arithmetic take the page down
}, [anchorDate, maxAnchor, period, timezone]);
```

✅ Correct, and correctly parameterised — this is the call site that `page.tsx:97` gets wrong. The comment at `:68`–`:71` documents that passing `maxAnchor` into that 4th slot (the timezone) previously produced `fromZonedTime(…, "2026-09-28")` → Invalid Date → `format()` threw `RangeError` and **crashed `/analytics` entirely**. The `try/catch` is the belt to that braces.

---

## 5. Backend / API architecture

### 5.1 The one route the page uses

`src/app/api/recap/route.ts` — **47 lines**.

```ts
const recapQuerySchema = z.object({
  period: z.enum(['day', 'week', 'month', 'year']),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});                                                        // :12–15

GET: auth() → 401                                        // :19–22
    safeParse({ period: searchParams.get('period') ?? 'week',
                date:    searchParams.get('date') ?? undefined })
    → 400 + error.flatten() on failure                   // :29–34
    recapService.getReport(session.user.id, period, date) // :36–40
    → { success: true, data }                            // :42
    catch → 500 'Failed to generate recap'                // :43–46
```

✅ Thin, no business logic, `session.user.id` only — never a client-supplied `userId`. The `date` regex is the right shape for a `YYYY-MM-DD` anchor and `monthlySummary` re-validates its own `YYYY-MM` derivation (`monthly.ts:126`–`:134`).

⚠ **No bound on `date`.** `9999-12-31` is a valid match, so a client can ask for a year 7973 years out; `yearlySummary` then issues a `DailyScore` range scan for it. Harmless for correctness, wasteful on demand. §24 F16.

### 5.2 The dead sibling route

`src/app/api/recap/weekly/route.ts` — **43 lines**, `GET /api/recap/weekly`.

- **No caller.** `grep` finds no client fetch of `/api/recap/weekly` anywhere in `src`. AGENTS.md already flags this endpoint as an N+1 that the Weekly Recap card does *not* use.
- **It computes its own week in host-local time** (`:18`–`:28`) with a hand-rolled Monday calculation, while `getPeriodRange` already exists for exactly this and is timezone-aware.
- **It compares an instant against a bare date string**: `weekly.ts:55`–`:56` does `new Date(g.completedAt) >= new Date(weekStart)`. `new Date('2026-09-28')` parses as **UTC midnight**, so `weekEnd` is exclusive-by-one-day at the boundary and the west edge shifts by the host offset.

The function it calls, `generateWeeklyRecap` (`src/server/recap/weekly.ts`, 97 lines), **is** live — `review.service.ts:120` and `:136` call it. So only the route is dead, not the function. And `generateWeeklyRecap` itself contains the N+1 AGENTS.md describes: `habits.map(async habit => findLogsByRange(habit.id, …))` at `:29`–`:41`, one query per habit.

### 5.3 `RecapService.getReport` — `src/server/services/recap.service.ts` (604 lines)

```
getReport(userId, period, anchorDate?)                              :162
├── UserRepository.getSettings(userId) → settings?.timezone || 'UTC'  :167–168
├── anchor = isValidDate(date) ? date : getTodayString(timezone)      :169
├── range  = getPeriodRange(period, anchor, timezone)                 :170
├── base   = { period, anchorDate, startDate, endDate, label, isCurrent }  :172–179
│
├── extras = await buildExtras(...)      ◄── 16 PARALLEL READS, ALWAYS  :181
│
└── one of buildDay / buildWeek / buildMonth / buildYear              :183–196
```

🔴 **`buildExtras` runs before the period branch.** It is not conditional on the period and not conditional on whether the period has any data. Every period switch — including switching *to* an empty one — pays all 16 reads, then the page renders the "No recap data available" empty state.

The constructor instantiates **16 repository objects** (`:143`–`:160`), and `recapService` is a module singleton (`:599`) — while `src/server/analytics/*` each hold their **own** module-level singletons (`weekly.ts:20`–`:24`, `monthly.ts:21`–`:26`, `yearly.ts:21`–`:27`, `streaks.ts:19`–`:20`, `daily.ts`). So one recap request constructs **at least 21 repository instances** across two module graphs. Harmless (they are thin wrappers over one Prisma client) but it means repository-level caching, if ever added, would have to be added in two places.

### 5.4 `buildExtras` — the 16 reads (`recap.service.ts:214`–`:252`)

| # | Call | Window | Notes |
| - | ---- | ------ | ----- |
| 1 | `habitRepository.findLogsByUserRange(userId, start, end)` | period | 1 query, all habits — ✅ the correct shape |
| 2 | `sleepRepository.findByRange(userId, start, end)` | period | |
| 3 | `reflectionRepository.findByRange(userId, start, end)` | period | feeds `reflections` + the mood fallback |
| 4 | `focusRepository.findSessions(userId, { from: start, to: end })` | period | `from`/`to` are **strings** here, contrasted with #6's `Date`s |
| 5 | `goalRepository.findAll(userId)` | — | 🔴 **unbounded, all statuses**, used for `activeCount` + `completedInPeriod` |
| 6 | `taskRepository.getThroughput(userId, new Date(start+'T00:00:00'), …)` | period | 3 parallel `count()`s internally |
| 7 | `nutritionRepository.findAll(userId, { startDate, endDate })` | period | |
| 8 | `healthMetricRepository.findAll(userId, { startDate, endDate })` | period | |
| 9 | `streakAnalytics(userId, { startDate: '2000-01-01', end })` | 🔴 **ALL TIME** | 3 queries; materialises every `DailyScore` the user has ever had |
| 10 | `achievementRepository.findUnlocked(userId)` | 🔴 **ALL TIME** | unbounded `findMany`, then JS-filtered by date at `:406` |
| 11 | `linkedReviewFor(userId, period, range)` | — | 0 or 1; `null` for day/year |
| 12 | `journalRepository.findAll(userId, { from, to, limit: 6 })` | period | ✅ bounded to 6 |
| 13 | `routineRepository.findExceptionsByRange(userId, start, end)` | period | |
| 14 | `moodRepository.getMoodRange(userId, rangeStart, rangeEnd)` | period | `Date`s built with `fromZonedTime` ✅ |
| 15 | `energyRepository.getRange(userId, rangeStart, rangeEnd)` | period | `Date`s ✅ |
| 16 | `goalRepository.findCompletedMilestones(userId, rangeStart, rangeEnd)` | period | |

**Total ≈ 21 queries**, all in one `Promise.all` so latency ≈ the slowest, not the sum. (`findUnlocked` is 1 query; `linkedReviewFor` 0–1.)

`ACCOUNT_EPOCH = '2000-01-01'` (`:70`, commented *"comfortably older than any real account"*) is the root of #9. `streakAnalytics` needs the **whole** history to compute `contiguousRuns` and `longestStreak` correctly, so a bounded window would produce wrong streaks — but the *consumer* here (`streakEvents`, filtered to `isWithin(reachedDate, start, end)` at `:386`–`:392`) only ever reads milestones **inside the period**. The full-history read is therefore necessary for the streak maths and gratuitous for this call site. §24 F6.

Two of the 16 are filtered in JavaScript after an unbounded fetch (#5, #10) when both could be `where`-scoped. §24 F7.

### 5.5 The four period builders

```
buildDay(userId, range, timezone)                                     :517–540
  dailyBreakdown(userId, range.anchorDate, timezone)                  :519
  ScoreRepository.findByDate(userId, anchor)                          :520
  points = score && score.totalScore !== null ? [1 point] : []        :522–530
  hasData = score?.totalScore !== null || …                           :532–537  🔴 §25

buildWeek(userId, range, timezone)                                    :542–556
  weeklySummary(userId, range.start, timezone)                        :543
  ScoreRepository.findByRange(userId, start, end)   ◄── DUPLICATE     :544  🟠 §18.2
  points = toPoints(scores)
  hasData = points.length > 0 || average > 0 || perfectDays > 0 || … :547–553

buildMonth(userId, range, timezone)                                   :558–573
  monthlySummary(userId, range.anchorDate.slice(0, 7), timezone)      :560
  ScoreRepository.findByRange(userId, start, end)   ◄── DUPLICATE     :561  🟠 §18.2
  hasData = points.length > 0 || average > 0 || …                    :564–570

buildYear(userId, range, timezone)                                    :575–601
  yearlySummary(userId, Number(range.anchorDate.slice(0, 4)), tz)     :576
  points = monthlyScoreTrend → 12 points, core/growth/bonus = 0      :582–590
  hasData = totalDaysScored > 0 || …                                 :592–598
```

**None of the four passes `preloadedHabits`.** Each accepts it as a 4th/5th/6th parameter (`daily.ts:107`, `weekly.ts:171`, `monthly.ts:138`, `yearly.ts:123`) and each therefore loads `loadPeriodHabits` internally — five queries that `buildExtras` then partly repeats with `findLogsByUserRange` at `:232`. Threading the one model through both would remove that duplicate. §24 F36, §27.3.

Note `buildYear`'s `points` (`:582`–`:590`) is **not** `RecapScorePoint`-shaped in spirit — it is 12 monthly averages with `core: 0, growth: 0, bonus: 0` placeholders, so `RecapScorePoint.core/growth/bonus` are meaningless for the year period. The page avoids the issue by building its own `yearRows` from `monthlyScoreTrend` rather than from `points` (`page.tsx:229`–`:233`), so `points` for the year period is **computed, serialised and never read**. §24 F13.

### 5.6 `RecapReport` is declared twice

`src/types/recap.ts:86`–`:166` defines the client-facing contract, and `recap.service.ts:53`–`:67` defines `export interface RecapReport` with the **real** server shape (`extras?: RecapExtras`, `day?: DailyBreakdown`, `week?: WeeklySummary`, …). The service exports its own; the page imports the one from `@/types/recap`.

They are structurally compatible but **not identical** — `types/recap.ts` restates a hand-maintained subset of `WeeklySummary`/`MonthlySummary`/`YearlySummary`/`DailyBreakdown` with narrowed types (e.g. `week.habits` has only `averageCompletionRate` and `mostCompleted`, dropping `activeCount`, `mostMissed`, `perHabit`). It is a deliberate narrowing for the client, but nothing enforces that it stays in sync: adding a field to `WeeklySummary` does **not** surface it, and changing a field's type in `WeeklySummary` compiles clean until the server starts emitting the new shape. §24 F19.

---

## 6. Database dependency

`/recap` reads **essentially the entire database**. Twenty repositories and roughly twenty models are touched on a single request.

### 6.1 Models read, by period

| Model | Reached via | day | week | month | year |
| ----- | ------------ | --- | ---- | ----- | ---- |
| `UserSettings` | `userRepository.getSettings` | ✅ | ✅ | ✅ | ✅ |
| `DailyScore` | `scoreRepository.findByRange` / `findByDate` | ✅ (1 row) | ✅ ×3 | ✅ ×2 | ✅ ×2 |
| `Habit` + `HabitLog` + `HabitLogOverride` | `loadPeriodHabits` → `findAll` + `findLogsByUserRange` + `findOverridesByUserRange` | ✅ | ✅ | ✅ | ✅ |
| `SleepLog` | `sleepRepository.findByRange` / `countRestedDays` | ✅ | ✅ ×2 | ✅ | ✅ ×2 |
| `RoutineBlockLog` | via `dailyBreakdown` | ✅ | — | — | — |
| `Reflection` | `reflectionRepository.findByRange` | ✅ | ✅ | ✅ | ✅ |
| `FocusSession` (+ `Category`) | `focusRepository.findSessions` / `getStats` | ✅ | ✅ | ✅ ×2 | ✅ ×2 |
| `Goal` (+ `Project`) | `goalRepository.findAll` | ✅ (×2) | ✅ ×2 | ✅ | ✅ ×2 |
| `GoalProgress` | `goalRepository.findProgressByUserRange` | — | ✅ (1 range) | — | — |
| `GoalMilestone` | `goalRepository.findCompletedMilestones` | ✅ (1 range) | — | ✅ ×2 | ✅ |
| `RoutineDayTypeDefinition` + `RoutineDayTypeException` | via `loadPeriodHabits` | ✅ | ✅ | ✅ | ✅ |
| `Task` | `taskRepository.getThroughput` (3 `count()`s) | ✅ | ✅ | ✅ | ✅ |
| `NutritionEntry` | `nutritionRepository.findAll` | ✅ | ✅ | ✅ | ✅ |
| `HealthMetric` | `healthMetricRepository.findAll` | ✅ | ✅ | ✅ | ✅ |
| `Streak` + `StreakMilestone` | `streakRepository` via `streakAnalytics` | ✅ | ✅ | ✅ | ✅ |
| `Achievement` | `achievementRepository.findUnlocked` | ✅ | ✅ | ✅ | ✅ |
| `JournalEntry` | `journalRepository.findAll` / `countByRange` | ✅ | ✅ | ✅ | ✅ ×2 |
| `MoodLog` | `moodRepository.getMoodRange` | ✅ | ✅ | ✅ | ✅ |
| `EnergyLog` | `energyRepository.getRange` | ✅ | ✅ | ✅ | ✅ |
| `RoutineTemplateException` | `routineRepository.findExceptionsByRange` | ✅ | ✅ | ✅ | ✅ |
| `WeeklyReview` | `reviewRepository.findReviewByWeek` | — | ✅ | — | — |
| `MonthlyReset` | `reviewRepository.findMonthlyByMonth` | — | — | ✅ | — |

**21 models on a week view, 20 on a month view, 18 on a day view.** The `×N` columns are gone: the habit read is now one `findLogsByUserRange` per period regardless of habit count (`server/analytics/period-habits.ts:24` — *"a year for a user with 40 habits costs the same five queries a single day costs, where before it was 41"*).

> The `2000-01-01` streak scan means this table understates the **row volume** even where the query count is flat: `streakAnalytics` reads the user's whole `DailyScore` history on every period change. See [§18](#18-performance).

### 6.2 The one write

`/recap` performs **no writes**. It is the most strictly read-only audited page. The only writes anywhere in the recap tree are the `LinkedReviewCard`'s read of `WeeklyReview`/`MonthlyReset` (written by `/recap/weekly-review` and `/recap/monthly-reset`) and `ShareRecapCard`'s `localStorage`-free `navigator.clipboard.writeText` (`:26`), which touches no persistence layer at all.

### 6.3 `Goal.completedAt` bucketing — ✅ RESOLVED 2026-10-03

> **Original finding (2026-09-30).** This section reported that `extras.goalsDelta.completedInPeriod` used `formatInTimeZone(completedAt, timezone, 'yyyy-MM-dd')` (`recap.service.ts:339`) while `report.{week,month,year}.goals.completed` still used `goal.completedAt.toISOString().slice(0, 10)` — **UTC** — at `weekly.ts:237`, `monthly.ts:240`, `yearly.ts:177` and `monthly.ts:248`. The old table below recorded each as 🔴.
>
> **Status: fixed.** All four now zone-bucket through the same helper, and `timezone` is a *required* positional parameter of each summary function — `weekly.ts:166`–`:168` documents that it *"is a parameter rather than a default because a caller that forgot it would reintroduce exactly the bug this signature is here to prevent."* The old line numbers no longer resolve; the expression no longer exists anywhere in `server/analytics/`.

| Location | Expression | Zone |
| -------- | ---------- | ---- |
| `weekly.ts:263`–`:268` `week.goals.completed` | `formatInTimeZone(goal.completedAt, timezone, 'yyyy-MM-dd')` | ✅ zoned |
| `monthly.ts:245`–`:250` `month.goals.completed` | `formatInTimeZone(goal.completedAt, timezone, 'yyyy-MM-dd')` | ✅ zoned |
| `yearly.ts:212`–`:217` `year.goals.completed` | `formatInTimeZone(goal.completedAt, timezone, 'yyyy-MM-dd')` | ✅ zoned |
| `recap.service.ts:339` `extras.goalsDelta` | `formatInTimeZone(…, timezone, …)` | ✅ zoned |
| `recap.service.ts:400`–`:404` (achievements) | `formatInTimeZone(…, timezone, …)` | ✅ zoned |
| `recap.service.ts:433` (milestone hits) | `formatInTimeZone(…, timezone, …)` | ✅ zoned |

`monthly.ts` also moved its milestone count to one range query (`findCompletedMilestones(userId, rangeStart, rangeEnd)`, `:175`), which is why `month.goals.milestonesHit` no longer needs a `completedAt` slice at all.

**The general lesson still applies:** `completedAt` is an instant, so every calendar-day bucket on it needs the user's zone. `monthly.ts:112` and `:114` still call `.toISOString().slice(0, 10)` — but on `monthWeeks()`'s own cursor arithmetic over bare `YYYY-MM-DD` strings, where a zone is neither available nor meaningful. Those are not instances of this bug.

### 6.4 Two surfaces still diverging on "scheduled"

> **Original finding (2026-09-30) — RETIRED.** The pass reported a *third* denominator at `yearly.ts:150` (`completionRate: logs.length > 0 ? (completed / logs.length) * 100 : 0`), counting `SKIPPED` and `NOT_APPLICABLE` where `weekly.ts` and `monthly.ts` explicitly excluded them, and worked the example *"30 completed + 300 skipped reads as 9% on the year view and 100% on the month view."*
>
> **Status: fixed.** `lib/analytics/period-habits.ts` was written specifically to end this, and its docstring quotes the old four-way table as *"The problem this replaces"*. All four period builders now call `loadPeriodHabits(userId, start, end, today)` (`daily.ts:111`, `weekly.ts:183`, `monthly.ts:165`, `yearly.ts:136`), so `rate = completed / scheduled` where `scheduled` comes from the eligibility rule and is `null`, never `0`, when nothing was due.

What is left is narrower and is tracked as the live finding:

| Surface | Denominator | Excludes `SKIPPED` / `NOT_APPLICABLE`? | Applies eligibility? | Has `noRecord`? |
| ------- | ----------- | --------------------------------------- | -------------------- | ---------------- |
| `dailyBreakdown` | `PeriodHabitModel.byTier` / `.perHabit` | ✅ via `buildPeriodHabits` | ✅ | ✅ (`.days[].noRecord`) |
| `weeklySummary` | `habitModel.totals` | ✅ | ✅ | ✅ |
| `monthlySummary` | `habitModel.totals` | ✅ | ✅ | ✅ |
| `yearlySummary` | `habitModel.totals` | ✅ | ✅ | ✅ |
| 🔴 **`recap.service.ts:255`–`:268` (heatmap)** | **raw `HabitLog` row count** | ✅ by status filter | 🔴 **no** | 🔴 **no** |
| 🔴 **`server/recap/weekly.ts:37`–`:38`** | **`logs.length`** | 🔴 **no** | 🔴 **no** | 🔴 **no** |

The heatmap row is the one that matters for this page, because it is the *only* completion figure on `/recap` that is not derived from the shared model — and it is the card a user is most likely to read as "how did I do". [§27](#27-the-recap-heatmap-uses-a-log-row-denominator-not-eligibility).

`generateWeeklyRecap` is the last survivor of the old family. It is not on the `/recap` render path, but it *is* live — `review.service.ts:120` and `:136` call it — so `/recap/weekly-review` still shows a fourth habit-rate rule.

### 6.5 `YearlySummary.averageProgress` is unclamped

`yearly.ts:181`–`:184` averages `currentValue / targetValue * 100` over every goal with a positive target, with **no clamp**. A goal at 150% drags the average above 100, and the surface that renders it (`YearlyRecap.tsx`, via `goals.averageProgress`) has no clamp either.

The equivalent figure in `recap.service.ts:346` **is** clamped:

```ts
progressValues.push(clamp((goal.currentValue / goal.targetValue) * 100, 0, 100));
```

So `extras.goalsDelta.averageProgress` is capped at 100 and `report.year.goals.averageProgress` is not — two fields with the same name and different contracts in one response. §24 F4.

---

## 7. Period-range and timezone logic

### 7.1 `src/lib/period-range.ts` (230 lines) — the shared source of truth

The module docstring states the intent precisely: *"Used by the Recap page, the dashboard Routine Progress widget and any other surface that needs Day / Week / Month / Year navigation. Every range is computed against the user's timezone and weeks start on Monday, so the two surfaces can never disagree about a boundary."*

`getPeriodRange(period, anchorDate, tz)` (`:124`–`:202`) resolves:

```
toWall(toLocalInstant(anchorDate, tz), tz)     ← the user's wall-clock Date   :125
                                                                  period      start / end
day    :132–144   start = end = anchorDate                     buckets: 1
week   :145–157   startOfWeek/endOfWeek(wall, { weekStartsOn: 1 })   buckets: 7
month  :158–170   startOfMonth / endOfMonth(wall)                     buckets: 28–31
year   :171–186   `${year}-01-01` … `${year}-12-31`                    buckets: 12
isCurrent = start <= getTodayString(tz) && today <= end              :188–189
label: day 'EEE, MMM d' | week 'MMM d – MMM d[, yyyy]' | month 'MMMM yyyy' | year 'yyyy'  :108–118
```

`daysInMonth(year, month) = new Date(Date.UTC(year, month, 0)).getUTCDate()` (`:204`) — the classic day-0 trick; `month` is 1-based so `Date.UTC(y, 12, 0)` correctly yields Dec 31. ✅

The tz-correctness mechanism is `toLocalInstant` → `fromZonedTime(dateStr + 'T00:00:00', tz)` (`:74`–`:76`) for input and `toWall` → `toZonedTime(instant, tz)` (`:82`–`:84`) for arithmetic, so every `addDays`/`addMonths`/`startOfWeek` operates on a Date whose *fields* read as local time in the user's zone. This is the correct technique and it is applied consistently **inside this module**.

### 7.2 🔴 Where it breaks: `shiftAnchor` at the call site

```
period-range.ts:93
  export function shiftAnchor(date, period, delta, tz = DEFAULT_TZ)   ◄── tz defaults to 'UTC'

page.tsx:97
  const navigate = (delta: number) =>
    setAnchorDate(shiftAnchor(anchorDate, period, delta));              ◄── tz OMITTED

page.tsx:118
  timezone={timezone}                                                   ◄── tz PASSED here
```

The page has `timezone` in scope (`:62`) and hands it to `PeriodControl` for its own `shiftAnchor` call, but omits it from its own. So **the arrow buttons navigate in UTC while the tab-strip disable check navigates in the user's timezone** — two different answers to the same question inside one component tree.

Practical impact by period:

| Period | `shiftAnchor` body | Impact of using UTC |
| ------ | ------------------ | ------------------- |
| `day` | `addDays(wall, delta)` | `wall` is UTC-midnight of the anchor, so `+1` is the next calendar day. **Correct in practice** — the arithmetic is pure calendar math and neither zone shifts a `YYYY-MM-DD` string. |
| `week` | `addDays(wall, delta * 7)` | Same — correct. `getPeriodRange` re-snaps to the Monday anyway (`:146`). |
| `month` | `addMonths(wall, delta)` | Same — correct for a `YYYY-MM-DD` string, and `getPeriodRange` re-snaps to the 1st (`:159`). |
| `year` | `addYears(wall, delta)` | Same — correct; `getPeriodRange` slices `slice(0, 4)` (`:172`). |

⚠ **Honest assessment: because every branch is pure calendar arithmetic on a `YYYY-MM-DD` string, and `getPeriodRange` re-snaps to period boundaries server-side, omitting the timezone produces the same answer in all four cases.** It is therefore a latent defect, not a user-visible one today. It becomes real the moment `shiftAnchor` gains a zone-sensitive branch, and it is the exact argument omission that crashed `/analytics` before (recorded at `PeriodControl.tsx:68`–`:71`). §26.

### 7.3 `useUserTimezone` (45 lines)

Resolution order is **settings → browser → `DEFAULT_TZ`**, never committing to a hard-coded zone, and it returns `isLoading` so callers *can* wait. Its docstring records the original bug: *"every client component called `getTodayString()` with no argument and got the hard-coded `Asia/Kolkata` default, so a user in `America/New_York` saw *tomorrow's* date between local midnight and 05:30 — wrong checkboxes on the Today page and the wrong day's score."*

`/recap` uses `{ today, timezone }` and ignores `isLoading`. Because `anchorDate` starts `''` and is filled by an effect keyed on `today` (`:69`–`:71`), a settings change re-anchors the view — but only if `today` actually changes. Moving from `America/New_York` to `Asia/Tokyo` without crossing a date boundary leaves the anchor untouched, and the pending `/api/recap` response (computed server-side in the **new** zone) is discarded as stale only if a new request fires. It does not. §24 F11.

`/recap` is one of **17** call sites of this hook, and correctly passes `timezone` to `PeriodControl` — `/analytics` does the same. The pages that take only `{ today }` (`habits`, `goals`, `journal`, `AddHabitModal`, `AddGoalModal`, `CommandPalette`, `JournalEditor`) do not need it.

---

## 8. Complete user actions (serial)

### 8.1 Land on `/recap` (default = week)

```
mount
  useUserTimezone()  → { today, timezone, isLoading }              :62
  useState('')       → anchorDate                                 :63
  useState('week')   → period                                     :57
  useState(null)     → report                                     :64
  useState(true)     → loading                                    :65

  effect [today]  → setAnchorDate(current || today)                :69–71
  effect [period, anchorDate, load] → load('week', anchorDate)     :91–95

  load('week', anchor)                                            :73
    id = ++requestId.current                                       :74
    setLoading(true); setError(false)                              :75–76
    fetch(`/api/recap?period=week&date=${anchor}`)                 :78   ◄── raw fetch
    json = await res.json()                                       :79
    if (!res.ok || !json?.success) throw                          :80
    if (requestId.current !== id) return                           :81
    setReport(json.data as RecapReport)                            :82
    finally: if (requestId.current === id) setLoading(false)       :86–88

  render → loading ? <SkeletonGrid/> : …                          :122
```

### 8.2 Switch period (tab click)

`onPeriodChange={(p) => setPeriod(p)}` (`:111`) → the `period` dependency of the effect at `:91` changes → `load` runs again. The anchor is **preserved**: switching week → month keeps the same `anchorDate`, so the month containing that week's Monday is shown. ✅ Sensible.

### 8.3 Step to the previous / next period

```
navigate(-1) → shiftAnchor(anchorDate, period, -1)   [no tz]      :97
            → setAnchorDate(…)
            → effect fires → load(period, newAnchor)
            → server re-resolves the full range via getPeriodRange
            → report.label updates → PeriodControl label           :112
```

The `›` button is `disabled={atCurrentPeriod}` (`:137`) where `atCurrentPeriod = shiftAnchor(anchorDate, period, 1, timezone) > maxAnchor` — **with** the timezone. So the button that navigates uses UTC and the button that gates navigation uses the user's zone. §26.

### 8.4 Jump to today

`onToday={() => setAnchorDate(today)}` (`:115`). `today` comes from `useUserTimezone`, so it is the user's today, not the browser's. ✅

### 8.5 Copy the share summary

```
ShareRecapCard.copy()                                            :24–32
  buildSummary(periodLabel, stats)                                :16–19
    → ["My RoutineOS {periodLabel}", ...stats.map("{label}: {value}"), "Made with daily-plan"]
  await navigator.clipboard.writeText(summary)                    :26
  setCopied(true); setTimeout(() => setCopied(false), 1800)       :27–28
  catch → setCopied(false)                                        :29–31
```

⚠ **The button label says "your week" on all four periods** (`ShareRecapCard.tsx:50`: *"A quick, honest summary of your week"*), including the day, month and year views where `periodLabel` correctly says "Today" / "March 2026" / "2026". The `<h2>` above it uses the real label (`:48`), so the card contradicts itself one line apart. §24 F17.

⚠ `navigator.clipboard` is unavailable on insecure origins and throws in some embedded webviews. The `catch` is correct but the **user sees no message** — the button simply returns to its default label. There is no "Copy failed" state and no fallback to a `document.execCommand` path or a selectable `<textarea>`. §24 F18.

### 8.6 There is nothing else

No filter control, no search, no sort, no expand/collapse, no pagination, no export, no print stylesheet, no deep-link, no keyboard shortcut. The page has **one** input (`period`) and **two** pieces of local state the user drives (`period`, `anchorDate`).

---

## 9. What can the user create

**Nothing.** There is no create affordance anywhere on `/recap`: no button, no form, no modal, no POST/PATCH/PUT/DELETE fetch in `page.tsx`. `grep` for mutation verbs across the 22 recap components finds only `navigator.clipboard.writeText`.

This is architecturally correct — a recap is a **projection** over data owned by seven other domains (habits, goals, tasks, routine, sleep, journal, nutrition/health). Writing to a projection would duplicate state. The `/recap/weekly-review` and `/recap/monthly-reset` subroutes are where writing lives, and they target `WeeklyReview` / `MonthlyReset` rows, not the recap itself.

The one thing a user *appears* to be able to create is the clipboard text, and that is not persisted anywhere.

## 10. What can the user edit

**Nothing on this page.** The only user-controlled state is:

| State | Where | Persisted? |
| ----- | ----- | ---------- |
| `period` | `useState<Period>('week')` `page.tsx:57` | ❌ component state only |
| `anchorDate` | `useState('')` `page.tsx:63` | ❌ component state only |

Both are reset to their defaults on unmount, so navigating away and back loses the period and the position. Neither is reflected in the URL, so there is no back-button support — a user who clicks "‹" five times and then presses back leaves the page rather than undoing a step. §24 F12.

The **narrative text** a user writes on `/today` (reflections), `/journal` (entries) and `/recap/weekly-review` (wins/challenges) is *displayed* here — via `extras.reflections` and `extras.linkedReview` — but is edited on its own page. The `LinkedReviewCard` is deliberately read-only: it renders `review.biggestWins`, `challenges`, `lessonsLearned` and `nextFocus` as `<li>` with no affordance (`:51`–`:62`), and even omits a link to the review page that owns them.

## 11. What can the user delete

**Nothing.** No delete route, no delete method, no repository mutation of any kind. The page performs zero writes.

Notably, there is no way to remove a recap from history — and no need for one, since nothing is created. The closest equivalent is deleting the underlying data on its own page (a journal entry, a reflection, a `MonthlyReset`), after which the recap re-renders without it on the next load. There is no cache to invalidate, because there is no cache (§18).

---

## 12. Cross-page dependencies

### 12.1 Inbound — what this page depends on

| Dependency | Kind | Notes |
| ---------- | ---- | ----- |
| `@/lib/period-range` | shared pure lib | The reason `/recap` and `/analytics` cannot disagree about a boundary. 230 lines, no DB, no React. |
| `PeriodControl` | shared component | 158 lines, also used by `/analytics:153` and the dashboard `RoutineWidget` |
| `useUserTimezone` → `useSettings` → `settings.store` | shared state | 17 call sites repo-wide |
| `src/server/analytics/{daily,weekly,monthly,yearly,streaks}` | **shared with `AnalyticsService`** | 🔴 see §12.3 |
| 16 repositories | data | §6.1 |

### 12.2 Outbound — who depends on this page

Nothing depends on `/recap`. It has **no importers** — no component imports `RecapPage`, no store wraps it, no provider feeds it. It is a leaf route.

The **data** it reads, however, is shared: `AnalyticsService` (`src/server/services/analytics.service.ts`) wraps the same four `dailyBreakdown`/`weeklySummary`/`monthlySummary`/`yearlySummary` functions and backs `/api/analytics/*`, which `/analytics` and `/reports` consume. So every defect in §18.3's fan-out inventory and §6.3's timezone inconsistency affects **three pages**, not one.

| Consumer | Relationship |
| -------- | ------------ |
| `src/app/(dashboard)/analytics/page.tsx:153` | same `PeriodControl`, same `period-range`, different endpoint (`/api/analytics/*`) |
| `src/app/(dashboard)/reports/page.tsx:52`, `:58` | `apiRequest<WeeklySummary>` / `<MonthlySummary>` — the same analytics functions |
| `src/server/services/analytics.service.ts:187`–`:192` | the second entry point into the four analytics functions |
| `src/app/(dashboard)/recap/weekly-review/page.tsx:103` | comment references `generateWeeklyRecap`'s shape |
| `src/server/services/review.service.ts:120`, `:136` | the only live callers of `generateWeeklyRecap` |

### 12.3 🔴 Two services, one set of analytics functions, no shared cache

```
GET /api/recap ──► RecapService.getReport ──┬─► dailyBreakdown   (analytics/daily.ts)
                                              ├─► weeklySummary   (analytics/weekly.ts)
                                              ├─► monthlySummary  (analytics/monthly.ts)
                                              ├─► yearlySummary   (analytics/yearly.ts)
                                              ├─► streakAnalytics (analytics/streaks.ts)
                                              └─► 16 repositories
                                                    │
GET /api/analytics/* ─► AnalyticsService ────────────┘   ◄── the SAME five functions
```

Both entry points call the same five functions with **the same arguments**, and neither caches the result. A user who opens `/recap` and then `/analytics` runs the identical `weeklySummary` — including its five `loadPeriodHabits` queries — twice. There is no `unstable_cache`, no memoisation keyed on `(userId, range)`, and no shared request on the client either (`DashboardOverviewProvider` exists for `/dashboard`; `/recap` has no equivalent).

> **Re-verified 2026-10-03:** the per-habit N+1 this paragraph originally cited is gone. The duplication itself is unchanged, and it now duplicates a *flat* 5-query habit load rather than an N-scaled one, so the waste is smaller but the structural point stands. `preloadedHabits` was added to all four summary signatures specifically so a caller could pass the model down (`weekly.ts:171`, `monthly.ts:138`, `yearly.ts:123`, `daily.ts:107`); **`RecapService` does not yet use it** — `buildExtras:232` fetches the same logs a second time for the heatmap. §24 F36.

`RecapService` is a module singleton (`recap.service.ts:604`) as are the analytics modules' repository sets, so at least there is no per-request re-construction within one graph — but the two graphs do not share anything. §24 F15.

---

## 13. Impact analysis

**If `/recap` were deleted:** the route and 648 lines of client code vanish along with 22 recap components, `RecapService` (604 lines), `types/recap.ts` (166 lines) and `/api/recap`. `server/recap/weekly.ts` **survives** — it is called by `review.service.ts:120`/`:136`, not only by the dead `/api/recap/weekly`. The four `src/server/analytics/*` modules survive, backing `/analytics` and `/reports`. `period-range.ts` survives, backing `PeriodControl` for `/analytics` and the dashboard widget. Net loss: the entire period-review surface and nothing structural.

**If `buildExtras` were removed:** the page would keep working — every period branch renders its hero, trend, best-day, milestones, highlights and share card without `extras`. It would lose exactly the 13-card `ExtrasGrid`. This is worth stating because it means the extras block is **additive garnish on top of a working page**, and it currently costs 16 of ~21–25 queries including two all-time scans. The cost/benefit is inverted: the most expensive part of the request produces the least structural content.

**If the `hasData` bug (§25) were fixed:** a new user selecting the "Today" tab would see "No recap data available for this period" plus a "Go to Today" link — but the request would **still have paid all 16 extras queries first**, because `buildExtras` runs at `:181` before the period branch and `buildDay` computes `hasData` at `:532`. The empty state would be correct and just as slow. This is the clearest argument for moving the `hasData` computation ahead of `buildExtras`.

**✅ The timezone inconsistency (§6.3) is fixed.** `GoalsProgressCard`, the "Goals completed" milestone and `MilestoneHitsCard` now agree for every non-UTC user. No action remains.

**✅ The per-habit N+1s are fixed.** `loadPeriodHabits` (`server/analytics/period-habits.ts:29`) issues five queries — `findAll`, `findLogsByUserRange`, `findOverridesByUserRange`, `listDayTypeDefinitions`, `findExceptionsByRange` — independent of both the habit count and the range length. A 12-habit user and a 40-habit user cost the same. This also **removed** `weekly.ts:228`'s `getProgressHistory(…, 100)` per goal (now one `findProgressByUserRange`) and `monthly.ts:244`'s `getMilestones` fan-out (now one `findCompletedMilestones`).

**Blast radius of the "scheduled" divergence (§6.4):** now `recap.service.ts:255`–`:268` and `server/recap/weekly.ts:37`–`:38`. Both have no test pinning either denominator, so a fix in either place would be unpinned.

**Blast radius of §12.3:** every remaining query-shape and timezone issue in the analytics modules reaches `/recap`, `/analytics` **and** `/reports`. Fixing them in `server/analytics/*` fixes three pages; fixing them in `RecapService` fixes one and leaves the other two broken.

**If `shiftAnchor` were changed to be zone-sensitive** (e.g. to respect a user's week-start preference): `page.tsx:97` would immediately begin skipping or repeating days for non-UTC users, because it is the only call site that does not pass the timezone. §26 is cheap to fix now and expensive later.

---

## 14. Current System Capabilities

| Capability | Evidence |
| ---------- | -------- |
| Four periods with shared, non-divergent boundaries | `lib/period-range.ts:124`, used by `/recap`, `/analytics` and the dashboard widget |
| Monday-anchored weeks everywhere | `period-range.ts:146`, `:151`, and again in `weekly.ts:110` and `monthly.ts:103` |
| Timezone-correct range math on the server | `getPeriodRange(period, anchor, timezone)` via `fromZonedTime`/`toZonedTime` (`:74`–`:84`) |
| Timezone-correct "today" on the client | `useUserTimezone`, settings-first with a browser fallback (`:30`–`:39`) |
| "Next" arrow disabled once the period contains today | `PeriodControl.tsx:72`–`:81`, `:137` |
| Date-arithmetic failure cannot crash the page | `try/catch` at `PeriodControl.tsx:76`–`:79` |
| Race-safe request handling | `requestId` ref, every `setState` guarded (`page.tsx:74`, `:81`, `:84`, `:87`) |
| Anchor not frozen to a wrong first-render value | effect-keyed initialisation, `:69`–`:71` with the rationale documented at `:58`–`:62` |
| 16 extras reads in one `Promise.all` — latency ≈ slowest, not sum | `recap.service.ts:231`–`:252` |
| Per-card empty states; no section fabricates a number | every extras card guards `length > 0` or `!= null`; `types/recap.ts:14` |
| `'—'` instead of a misleading `0` for absent share stats | `page.tsx:293`, `:295`, `:298`, `:310` — 3 of 4 day stats, 1 of 4 week stats |
| Milestones emit only when `> 0` | `page.tsx:340`, `:347`, `:354`, `:366`, `:373`, `:380`, `:393`, `:399`, `:406` |
| Highlights list only real rows | `[cond ? v : null].filter(Boolean)` at `:486`, `:499`, `:530`, `:548`, `:572`, `:585` |
| Weekly trend delta vs the previous week | `weekly.ts:174`–`:175`, `:246`–`:248` |
| Best **and** worst day for week and month | `weekly.ts:195`–`:206`, `monthly.ts:182`–`:193` |
| Best/worst **month** for the year view | `yearly.ts:171`–`:179` |
| 12-month score trend for the year view, `null` for unscored months | `yearly.ts:161`–`:169` |
| Per-habit reliability with weekly sub-rates for the month | `monthly.ts:200`–`:214` — derived from the same per-day id lists, so a week rate cannot disagree with its own month rate |
| Habit completion cost independent of habit count and range length | `server/analytics/period-habits.ts:24`, five queries for a day or a year |
| Timezone is a **required** arg of every summary, so a caller cannot silently reintroduce UTC bucketing | `weekly.ts:166`–`:168` (documented), `monthly.ts:133`, `yearly.ts:118` |
| Future days are excluded from a live period's habit denominator | `loadPeriodHabits` clips `windowEnd` to `today` (`period-habits.ts:41`); rationale at `lib/analytics/period-habits.ts:47`–`:53` |
| Routine-exception reasons surfaced ("why did this day deviate") | `recap.service.ts:419`–`:425`, `RoutineExceptionsCard` |
| Reflection narrative extraction across 6 fields + 2 JSON tag columns | `recap.service.ts:116`–`:123`, `:437`–`:461` |
| Weekly review / monthly reset linked back to the exact period | `recap.service.ts:482`–`:515`, `LinkedReviewCard` |
| Goal-milestone hits with parent goal and project | `recap.service.ts:427`–`:434`, `MilestoneHitsCard` |
| Achievement unlocks in the period, zoned | `recap.service.ts:396`–`:408` |
| Clipboard share summary, never fabricated | `ShareRecapCard.tsx:16`–`:19` |
| Theme-aware charts via CSS custom properties | `TrendCard.tsx:24`–`:29` using `--color-card` / `--color-border`, both defined at `globals.css:28`–`:33` |
| Route-level `loading.tsx` | 12 lines |
| Clean client boundary | §3.4 — no `@/server/**`, no Prisma value import |
| Server re-validates its own derived inputs | `monthly.ts:143`–`:151` re-checks `YYYY-MM` and rejects `NaN` month numbers after `slice(0, 7)` |

---

## 15. Currently NOT Supported

| Not supported | What is missing |
| ------------- | --------------- |
| Deep-linking / sharing a view | Period and anchor are component state, never query params (§10) |
| Back/forward navigation through periods | Same — no URL state, no `history.pushState` |
| Persisting the last-viewed period | No `localStorage`, no cookie, no default other than `'week'` (`page.tsx:57`) |
| A retry affordance on failure | `error` is a boolean; the empty state offers "Go to Today", not "Retry" (§16.2) |
| Cancelling an in-flight request | No `AbortController`; superseded requests still complete server-side |
| Sharing to a social platform | Clipboard text only — no Web Share API, no image/canvas export |
| Copy-failure feedback | `catch` silently resets the label (`ShareRecapCard.tsx:29`–`:31`) |
| A custom week-start preference | Hard-coded Monday in `period-range.ts:146`, `weekly.ts:110`, `monthly.ts:103` |
| Comparing two arbitrary periods | Only week-vs-prior-week (`weekly.ts:270`); no month-vs-prior-month, no year-vs-prior-year |
| A trend for day or month-vs-prior | `TrendCard` `delta` is only wired for week (`page.tsx:167`) |
| Exporting the recap (PDF/CSV) | No route, no print stylesheet |
| Editing reflections or reviews here | Display-only; `LinkedReviewCard` has no edit or even a link to `/recap/weekly-review` |
| Hiding/filtering the 13 extras cards | No toggle; all 12 unconditional cards always render (§4.2) |
| A skeleton matching the real layout | `SkeletonGrid` is 4 tiles + 1 block (`page.tsx:418`), the real grid is 13 cards + 4 period heroes |
| An `error.tsx` boundary for the route | Absent; a render throw blanks the route |
| Rate limiting or payload caps | None on `/api/recap`; `date` is unbounded (§5.1) |
| Caching or revalidation | No cache layer at all — every period switch is a full recompute (§12.3) |
| Offline read | No service worker, no persisted last response |
| Accessibility audit of the charts | `TrendCard` sets `role="progressbar"`-style ARIA on the heatmap but the Recharts `<AreaChart>` has no `aria-label` or fallback table (`TrendCard.tsx:82`–`:122`) |
| Tests | `tests/` has **22** files. ✅ `tests/lib/analytics-period-habits.test.ts` **does** pin the shared denominator rule — so the rule is protected, but no test covers a *caller that declines to use it*, which is exactly F36. Still nothing covering `period-range.ts`, `recap.service.ts`, or the four `server/analytics/*` summaries. §24 F35 |

---

## 16. Loading / Error / Empty / Edge states

### 16.1 The four states that exist

| State | Trigger | Render |
| ----- | ------- | ------ |
| **Loading** | `loading === true` | `<SkeletonGrid/>` — 4 × `h-32 rounded-2xl bg-muted` in a `md:grid-cols-2 xl:grid-cols-4` grid, plus one `h-72`, all `animate-pulse` (`page.tsx:418`–`:429`) |
| **Error** | `error === true` | `EmptyState` with `TrendingUp` icon, "Couldn't load your recap", "Please try again in a moment." (`page.tsx:124`–`:129`) |
| **No data** | `!report?.hasData` | `EmptyState` with `CalendarDays`, "No recap data available for this period.", "Log habits, complete your routine, and track sleep to build your recap." (`:130`–`:135`) |
| **Loaded** | otherwise | `<RecapDashboard>` (`:137`) |

Both empty states are the **same local `EmptyState` component** (`page.tsx:431`–`:445`), which renders a `glass-panel` with the icon, a title, a body and a single CTA — `<Link href="/today">Go to Today</Link>`.

🔴 **The no-data state is unreachable for the day period.** `hasData` for `period: 'day'` is `score?.totalScore !== null || …` (`recap.service.ts:532`). When no `DailyScore` row exists, `score` is `null` → `score?.totalScore` is `undefined` → `undefined !== null` is **`true`** → `hasData === true` always. §25.

### 16.2 🔴 The error state has no recovery path

```
error === true
  → <EmptyState title="Couldn't load your recap" body="Please try again in a moment." />
  → <Link href="/today">Go to Today</Link>
```

There is **no retry button**. `load` is a `useCallback` in scope, but it is not wired to anything in the error branch. The only ways to retry are changing the period, changing the anchor, or a full page reload. The copy — "Please try again in a moment" — promises a retry that the UI does not offer. §24 F21.

Because `error` is a plain boolean, the message is fixed: a 401, a 500 and a network failure all render the same "Couldn't load your recap". The `catch` at `:83`–`:85` discards the error entirely.

### 16.3 Edge cases and how they render

| Edge case | Behaviour |
| --------- | --------- |
| **Year view `BestDayCard`** | 🔴 `date={report.year.bestMonth.month}` (`page.tsx:247`) renders a raw **`YYYY-MM`** key — "2026-03" — under a heading that says **"Best day"**, with the score being that *month's average*, not a day's score. `BestDayCard` has no prop to tell it the unit is a month. §24 F10 |
| `bestDay` is `null` (no scored days) | `BestDayCard` is not rendered (`{best && …}` `:172`, `:208`, `:245`); the grid collapses to just `MilestoneCard` |
| `milestones` empty | `MilestoneCard`'s own `<p>` — "Complete habits and hit goals to earn milestones here." (`MilestoneCard.tsx:60`–`:62`) ✅ |
| `points` empty | `TrendCard` swaps the chart for "No scores for this period yet — complete a few habits to see your trend here." (`TrendCard.tsx:123`–`:127`) ✅ |
| `rows.length === 1` | Recharts renders a single point; `domain={[0,'dataMax']}` (`:101`) yields a flat line. Acceptable |
| `rows` all zeros | `domain` collapses to `[0, 0]`; Recharts renders an empty plot. Edge case, no guard |
| `dataMax === 0` | `'auto'`-like behaviour; the chart may warn. No guard |
| `hasData` true but a sub-object missing | Every render site guards (`report.week &&`, `report.extras &&`), and `RecapDashboard` returns `null` (`:261`) rather than throwing ✅ |
| **Period/report mismatch** | 🔴 `return null` — a **blank page below the header** with no message. Reachable if the service ever returned a report whose period-specific key was absent. §24 F9 |
| No `DailyScore` for the anchor, day view | Score renders `0` via `scoreTotal ?? 0` (`DailyRecap.tsx:44`) with the ring at `--p: 0%`, and the label says "No score yet" (`:66`). ✅ Correct copy, but the big number still reads `0` |
| Habit heatmap, `scheduled === 0` | `rate: 0` (`HabitHeatmapCard.tsx:17`) → a **minColor** cell, not an "unknown" cell. It is indistinguishable from a genuinely 0% day |
| `linkedReview` null | `LinkedReviewCard` is not rendered at all (`:286`) — the only conditional card |
| Very long journal snippet | `line-clamp-2` (`JournalCard.tsx:26`) and a server-side 160-char slice (`recap.service.ts:414`–`:416`) ✅ |
| Long habit names | `min-w-0` + `truncate` patterns in the tiles; `truncate` in `JournalCard:23` ✅ |
| `formatDuration` edge | `0m` → `0h` branch never fires; `60` → `1h`; `90` → `1h 30m` (`page.tsx:44`–`:50`) ✅ |
| Clipboard unavailable | Silent — `catch` resets `copied` to `false` (`ShareRecapCard.tsx:29`–`:31`). No message |
| Reduced motion | `TrendCard` passes `animationDuration={900}` to Recharts unconditionally (`:116`) — ⚠ **not** gated on `prefers-reduced-motion`, unlike `/achievements` where both `Stagger` and the popup honour it. §24 F5 |

---

## 17. Authentication & security

### 17.1 Route protection

`/recap` is inside `src/app/(dashboard)/`, so it inherits the group layout's `privateMetadata` (`layout.tsx:26`) and `src/proxy.ts`'s unauthenticated redirect. There is no page-level auth check — correct for a client component; the data is protected server-side.

### 17.2 The one endpoint

```
GET /api/recap                                          src/app/api/recap/route.ts:17
  session = await auth()                                              :19
  if (!session?.user?.id) → 401 'Unauthorized'                        :20–22
  recapService.getReport(session.user.id, period, date)                :36–40
```

✅ **No client-supplied `userId`.** The service takes `userId` as its first parameter and every repository call below it is `userId`-scoped. This is the `FILE.MD` rule and it holds.

### 17.3 Input validation

```ts
const recapQuerySchema = z.object({
  period: z.enum(['day', 'week', 'month', 'year']),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});                                                       route.ts:12–15
```

| Property | Assessment |
| -------- | ---------- |
| `period` is a closed enum | ✅ An unknown period is a 400, not a fall-through |
| `date` regex-validated | ✅ Correct shape for a calendar-day anchor |
| `date` **not range-bounded** | ⚠ `9999-12-31` passes. `yearlySummary` then scans a `DailyScore` range for year 9999. No correctness risk, unbounded work. §24 F16 |
| `period` defaults to `'week'` | ✅ Matches `page.tsx:57` |
| `date` defaults to `undefined` → server resolves "today" in the user's zone | ✅ Correct — the client never sends a default date that could disagree with the server's timezone |
| Second validation layer | ✅ `monthlySummary` re-validates its derived `YYYY-MM` (`monthly.ts:126`–`:134`) — defensible, since `Number('99')` yields a number, not `NaN`, and the comment at `:123`–`:125` shows the author already thought about exactly this class of bug |
| `isValidDate` re-check in the service | ✅ `recap.service.ts:84`–`:86`, belt-and-braces on the same regex |

### 17.4 Injection and rendering

- **All Prisma access is via structured `findMany`/`count`/`aggregate` where objects.** No `$queryRaw`, no `$executeRaw`, no string interpolation anywhere in `recap.service.ts`, the analytics modules, or the 22 recap components. ✅
- **All rendering is React-escaped by default.** The interpolations that matter are habit names, goal titles, journal titles and snippets, reflection narrative text, and exception notes — all DB-stored strings rendered as JSX children (`JournalCard.tsx:23`, `:25`; `MilestoneHitsCard`; `ReflectionNarrativesCard`; `RoutineExceptionsCard`). ✅
- **No `dangerouslySetInnerHTML`** in any of the 22 components or in `page.tsx`. ✅
- The **only** HTML-adjacent sinks are inline `style={{ width: '…%' }}` on `HabitHeatmapCard`/`MoodEnergyCard`-style bars and `TrendCard`'s `CHART_TOOLTIP_STYLE`, all computed from numbers.
- **`bestMonth.month` is interpolated into a heading** (`page.tsx:247`) but comes from `monthKey(year, index+1)` in `yearly.ts:89` — server-generated, not user data. ✅

### 17.5 Rate limiting and abuse

❌ **None.** `GET /api/recap` costs ~21–25 queries (§18.1) and there is no per-user rate limit, no response cache, and no concurrency cap. A script can call it in a loop, and every call for `period=day` still runs the **all-time** `streakAnalytics` and `findUnlocked` scans (`recap.service.ts:244`, `:245`). §24 F6, §24 F16.

The cost is *not* proportional to the requested period, which is the structural reason this matters: the cheapest-looking request (`period=day`, one day of data) triggers two of the three most expensive queries in the whole file.

### 17.6 Privacy

Every query is `userId`-scoped and the service is only reachable behind `auth()`. There is no export, no share-token, and no public variant. The clipboard summary contains only the caller's own numbers, and the user initiates the copy. The route inherits `noindex` from the dashboard group's `privateMetadata`, so it cannot be indexed. ✅

---

## 18. Performance

### 18.1 The headline: cost does not scale with the period

| Period | Data actually needed | Queries actually issued |
| ------ | -------------------- | ---------------------- |
| `day` | 1 day's `DailyScore`, habits, routine, sleep, reflection | **≈ 21** — including an all-time `DailyScore` scan and an all-time `Achievement` scan |
| `week` | 7 days + the previous week | **≈ 24** |
| `month` | 28–31 days | **≈ 24** |
| `year` | 365 days | **≈ 25** |

**Re-verified 2026-10-03 — the counts are now flat.** The original table read `≈ 20–24 + N`, `≈ 20–23 + N (sequential)` and `≈ 24–35 + N + 12 sequential`. Every `+N` is gone: `loadPeriodHabits` is a fixed five queries and `findProgressByUserRange` / `findCompletedMilestones` / `countByRange` replaced their per-parent loops. A 12-habit user and a 40-habit user now cost the same on every period. The spread between periods is ~4 queries rather than ~15 plus N.

`buildExtras` (`recap.service.ts:204`–`:252`) runs **before** the period branch and is unconditional, so every row above includes its 16 queries regardless of period. **That is now the dominant share of every request** — 16 of ~21–25. §24 F6.

### 18.2 Two provably redundant queries

```
buildWeek   :543  weeklySummary(userId, range.start, timezone)
                    └─ weekly.ts:181  scoreRepository.findByRange(userId, startDate, endDate)
buildWeek   :544  ScoreRepository.findByRange(userId, range.start, range.end)   ◄── IDENTICAL

buildMonth  :560  monthlySummary(userId, YYYY-MM, timezone)
                    └─ monthly.ts:164 scoreRepository.findByRange(userId, startDate, endDate)
buildMonth  :561  ScoreRepository.findByRange(userId, range.start, range.end)   ◄── IDENTICAL
```

`weeklySummary` computes its own range from `weekRange(monday)` (`weekly.ts:173`) and `monthlySummary` its own from `YYYY-MM` (`monthly.ts:153`–`:156`) — both resolve to the same `startDate`/`endDate` the caller already holds. The identical row set (including the `calculationData` JSON blob) crosses the network twice per week/month view. §24 F1.

### 18.3 Query fan-out inventory

> **Re-verified 2026-10-03.** Six of the nine rows in the original inventory no longer exist. `preloadedHabits` was added to all four summary signatures so a caller *could* pass the model down; **`RecapService` does not**, which is why the heatmap re-reads the same logs (§24 F36).

| Site | Pattern | Count | Sequential? |
| ---- | ------- | ----- | ----------- |
| `server/analytics/period-habits.ts:46`–`:56` | 5 fixed queries replacing every per-habit loop | **5** | ✅ one `Promise.all` |
| `weekly.ts:187` | `goalRepository.findProgressByUserRange(userId, start, end)` — one range, grouped in JS by `groupProgressDelta` (`weekly.ts:139`–`:153`) | 1 | — |
| `monthly.ts:175` | `goalRepository.findCompletedMilestones(userId, rangeStart, rangeEnd)` — one range | 1 | — |
| `monthly.ts:168`, `yearly.ts:145` | `journalRepository.countByRange` — one range | 1 each | — |
| `weekly.ts:257`, `yearly.ts:210` | `sleepRepository.countRestedDays` | 1 each | — |
| `weekly.ts:185`, `yearly.ts:138` | `streakRepository.findByUserId` | 1 each | — |
| `weekly.ts:186`, `monthly.ts:169`, `yearly.ts:146`, `recap.service.ts:236` | `goalRepository.findAll(userId, …)` — unbounded, filtered in JS | 1 each | — |
| `yearly.ts:139` | `focusRepository.getStats` | 1 | — |
| `streaks.ts:145` | `scoreRepository.findByRange` over `'2000-01-01'`–`end` | 1 | — but **all-time** |
| `task.repository.ts` `getThroughput` | 3 parallel `count()` | 3 | ✅ |
| 🔴 `recap.service.ts:232` | `findLogsByUserRange` — a **second** read of logs `loadPeriodHabits` already loaded for the period builder | 1 | ✅ but redundant |

**Sequential fan-out: none remaining on this path.** Every loop the original pass flagged — `monthly.ts:180`'s `for…of` over habits, `yearly.ts:193`–`:195`'s 12 `countByMonth` calls — is gone.

**The residual cost is not N+1, it is unconditional breadth.** §24 F36 and F6.

### 18.4 Client-side cost

| Cost | Number |
| ---- | ------ |
| HTTP requests per page view | **1** |
| HTTP requests per period change | **1** |
| Aborted-but-still-executed requests | 1 per rapid period switch (no `AbortController`) |
| `useMemo` / `useCallback` | 1 (`load`), 1 (`atCurrentPeriod` inside `PeriodControl`) |
| Components rendered, week view | 1 page + 4 period helpers + `ExtrasGrid` (13) + `Highlights` (2 `HighlightCard`) + `TrendCard` + `BestDayCard` + `MilestoneCard` + `ShareRecapCard` ≈ **23 components** |
| Bundle | 648-line page + 22 components (~1,700 lines) + `recharts` + `PeriodControl` + the settings store |
| Caching / revalidation | **none** |
| Memoisation across periods | **none** — every switch is a full server recompute (§12.3) |

`recharts` is the single heaviest dependency here. `TrendCard` imports `Area`, `AreaChart`, `ResponsiveContainer`, `Tooltip`, `XAxis`, `YAxis` (`TrendCard.tsx:3`) — a tree-shaken subset, but `ResponsiveContainer` measures the DOM on mount and re-measures on resize, which is a layout-thrash risk given 13 sibling cards in a responsive grid.

### 18.5 What is already well-optimised

Documenting these because they show the intent:

- `buildExtras` runs its 16 reads in **one** `Promise.all` (`:231`–`:252`), so latency ≈ the slowest query rather than the sum.
- ✅ **Every analytics module now shares one habit read.** `loadPeriodHabits` (5 queries, N-independent) is called by `dailyBreakdown`, `weeklySummary`, `monthlySummary` and `yearlySummary` alike. The original pass's note that the comment at `recap.service.ts:201`–`:203` claimed "no N+1" was *"true for `buildExtras`, false for the analytics modules it calls"* — the second half no longer holds.
- Mood/energy are reduced to **one reading per day** in JS (`:277`–`:288`) rather than sending every reading to the client.
- Focus is grouped in one pass with an in-memory filter for incomplete sessions (`:314`–`:322`), so aborted sessions never reach the client.
- Nutrition and health use `null`-when-empty rather than sentinel zeros (`:356`–`:383`), so the client can distinguish "nothing logged" from "logged zero".
- Reflections are filtered to days with actual narrative content (`:461`), so the payload excludes empty rows.
- Journal is capped at 6 entries (`:247`).
- The 12-month year trend is built from an already-fetched score set (`yearly.ts:149`–`:169`) — no extra query, and months with no scored day emit `null` rather than `0` (`yearly.ts:161`–`:169`, with the rationale at `:33`–`:41`), so an unfinished year does not read as a year of zeroes.

### 18.6 The single highest-value fix

Move the `hasData` computation **above** `buildExtras` and skip extras when there is no data. That alone converts the most common case for a new or lightly-using account — "I clicked a period with nothing in it" — from ~21 queries into the ~5 the period builder needs. The `hasData` predicates already exist in each `build*` method (`recap.service.ts:532`, `:547`, `:564`, `:592`); they simply run too late. §24 F8.

---

## 19. External integrations

| Integration | Present? | Detail |
| ----------- | -------- | ------ |
| **Neon / Postgres** | ✅ | 21 models (§6.1) |
| **Clipboard API** | ✅ | `navigator.clipboard.writeText` (`ShareRecapCard.tsx:26`) — the only client-side external surface |
| **Recharts** | ✅ | `TrendCard.tsx:3` — chart rendering, no network |
| **`date-fns` / `date-fns-tz`** | ✅ | `period-range.ts:14`–`:26`; `fromZonedTime`/`toZonedTime`/`formatInTimeZone` are the timezone backbone |
| **AI services** | ❌ | `src/server/ai` is not touched. Every insight on this page is a **deterministic aggregate** — no LLM, no summarisation. This is a deliberate and correct choice: a recap whose numbers can change between two loads because a model phrased them differently is not a recap. Worth stating explicitly. |
| **Email** | ❌ | Not read by `/recap`. `emails/weekly-summary.tsx` and `email.service.ts:330 sendWeeklySummary` exist for a separate weekly-digest flow. |
| **Notifications** | ❌ | Not read. |
| **Weather** | ❌ | `WeatherRepository` exists but is not in the 16. |
| **External analytics / telemetry** | ❌ | No error reporting, no metrics, no tracing. The `catch` at `page.tsx:83` discards the error entirely. |
| **Push** | ❌ | Not referenced. |
| **PDF / image export** | ❌ | None. |

---

## 20. Background jobs / cron effects

**No cron writes anything a recap reads, with one partial exception.**

| Cron | Schedule | Effect on `/recap` |
| ---- | -------- | ------------------- |
| `/api/cron/compute-daily-scores` | `0 1 * * *` | 🔴 **Direct and significant.** Bounded to 200 rows/run, idempotent via upsert. `/recap` is the **only** surface that reports `perfectDays`, averages, best/worst day and the entire score trend — and every one of those reads `DailyScore`. A user who has not had scores computed sees an empty recap regardless of how many habits they logged, because `hasData` for week/month/year all test `points.length > 0` first. |
| `/api/cron/generate-insights` | `0 2 * * 0` | None — a stub returning `generated: 0`. |
| `sleep-notifications` | absent from `vercel.json` | Unrelated, but it confirms `/recap` cannot rely on a nightly scheduler for anything. |

**Consequences:**

- **A recap is only as fresh as the last score backfill.** `DailyScore` is written by `/today`'s interactions *and* by the cron. If the cron falls behind (200 rows/run is a hard bound), the recap shows a shorter period than requested — a "month" view with 12 days of trend.
- **`hasData` is score-gated, which propagates the cron's health into the empty state.** A user whose scores have not been computed sees "No recap data available for this period" and the instruction "Log habits, complete your routine, and track sleep" — advice that will not help, because the missing data is the score table, not the behaviour.
- **Nothing pre-computes or caches a recap.** There is no materialised summary table and no nightly snapshot, so a "2024 recap" re-reads 2024's rows from scratch every time. This is the right call for correctness and the wrong call for cost, and it is why §12.3's missing cache hurts.
- **No reconciliation, no backfill for recap itself.** §24 F6.

---

## 21. Data flow diagrams

### 21.1 One period switch, end to end

```
 user clicks "‹" or a tab
        │
        ▼
 page.tsx navigate(delta) / onPeriodChange(p)                     :97 / :111
        │   shiftAnchor(anchorDate, period, delta)   ◄── NO timezone  → §26
        │   setPeriod / setAnchorDate
        ▼
 useEffect [period, anchorDate, load] → load(...)                  :91–95
        │   id = ++requestId.current                               :74
        ▼
 fetch `/api/recap?period=week&date=2026-09-28`                   :78
        │   ⚠ raw fetch, no AbortController, no apiRequest
        ▼
 api/recap/route.ts GET                                            :17
        │   auth() → session.user.id                               :19–22
        │   zod: period ∈ {day,week,month,year}, date /^\d{4}-\d{2}-\d{2}$/   :12–15
        ▼
 RecapService.getReport(userId, 'week', '2026-09-28')              :162
        │
        ├── UserRepository.getSettings(userId) → timezone           :167
        ├── getPeriodRange('week', anchor, timezone)               :170
        │     Mon–Sun, buckets[7], label 'Sep 28 – Oct 4', isCurrent  period-range.ts:145
        │
        ├── buildExtras(userId, period, range, timezone)           :181   ◄── ALWAYS, 16 q
        │   ┌──────────────────────────────────────────────────────┐
        │   │ Promise.all([16])                                     │
        │   │  findLogsByUserRange  1  ◄── REDUNDANT, F36          │
        │   │  sleepLogs            1   focusSessions     1         │
        │   │  reflectionRows       1   getThroughput      3         │
        │   │  findAll(goals)     ALL   nutrition           1         │
        │   │  healthMetrics       1   streakAnalytics   ALL×3     │
        │   │  findUnlocked       ALL   linkedReviewFor     0/1      │
        │   │  journal(limit 6)    1   routineExceptions   1         │
        │   │  moodRange           1   energyRange         1         │
        │   │  completedMilestones 1                              │
        │   └──────────────────────────────────────────────────────┘
        │   ⇒ habitHeatmap, sleepTrend, moodEnergy, focusByCategory,
        │     goalsDelta, taskThroughput, nutrition, health, streakEvents,
        │     achievements, linkedReview, journal, routineExceptions,
        │     milestoneHits, reflections
        │
        └── buildWeek(userId, range, timezone)                      :542
            ├── weeklySummary(userId, range.start, timezone)         :543
            │   Promise.all([7]) + loadPeriodHabits(5 fixed queries)
            │   ⇒ WeeklySummary
            └── ScoreRepository.findByRange(...)   ◄── DUPLICATE   :544  → §18.2
        │
        ▼
 { success: true, data: RecapReport }                             route.ts:42
        │
        ▼
 page.tsx: json.data → setReport                                   :79–82
        │   if (requestId.current !== id) return                    :81   ✅ race-guarded
        ▼
 RecapDashboard(period, report)                                    :143
        │   if 'week' && report.week → <WeeklyRecap/> <TrendCard/>
        │   <BestDayCard/> <MilestoneCard/> <ExtrasGrid/> <Highlights/> <ShareRecapCard/>
        ▼
 loading=false                                                     :87
```

### 21.2 The `hasData` short-circuit that does not short-circuit

```
recap.service.ts
                                                       ┌────────────────────────────────┐
  :167  getSettings ──────────────────────────────────►│ 1 query                       │
  :170  getPeriodRange (pure)                           └────────────────────────────────┘
                                                       ┌────────────────────────────────┐
  :181  buildExtras  ◄── RUNS FIRST, ALWAYS            │ 16 queries                 │
  :183    if period === 'day'                          │ incl. streakAnalytics 2000→now│
  :187    if period === 'week'                         │ incl. findUnlocked (all time) │
  :191    if period === 'month'                        └────────────────────────────────┘
  :195    buildYear
                                                       ┌────────────────────────────────┐
  :532  buildDay:                                      │ 7 queries                     │
    hasData = score?.totalScore !== null || …          │                                │
              ▲                                        │ score === null                 │
              └── undefined !== null ──► TRUE           │ ⇒ hasData = true               │
                  ⇒ hasData is ALWAYS true             │ ⇒ no empty state ever  → §25  │
                  for period === 'day'                 └────────────────────────────────┘
```

The `hasData` predicate is the right idea in the wrong place: it is computed **after** the expensive block it should be gating, and for the day period its first clause is a `!==` against a value that is `undefined` rather than `null` whenever the row is absent.

> **Re-verified 2026-10-03.** The `hasData` bug is untouched — still `score?.totalScore !== null` at `:532`. It also has a **second, softer** failure that the original pass did not isolate: the remaining four clauses (`breakdown.tiers`, `breakdown.habits`, `breakdown.routine`, `breakdown.sleep`) do not include journal, reflection, focus or mood. A user who wrote a reflection but never ticked a habit gets `hasData === false` and is told *"No recap data available for this period"* despite having written something. §24 F37.

### 21.3 ✅ RESOLVED — `goals.completedAt` is now zoned on both paths

```
Goal.completedAt  (an instant, e.g. 2026-09-28T23:30Z)
                     │
       ┌─────────────┴──────────────┐
       ▼                            ▼
extras.goalsDelta          report.week/month/year.goals.completed
recap.service.ts:339      weekly.ts:263 / monthly.ts:245 / yearly.ts:212
       │                            │
       └──────── formatInTimeZone(completedAt, timezone, 'yyyy-MM-dd') ───────┘
                                     │
                        ┌────────────┴────────────┐
                        ▼                         ▼
      GoalsProgressCard: 1        weekMilestones → MilestoneCard
      "Goals completed in period" "Goals completed: 1"

  For a goal completed at 08:00 in Asia/Tokyo (23:00 UTC the previous day):
        both paths → '2026-09-28'  → both count
```

`timezone` is now a required positional parameter of all three summary functions, so a caller cannot silently drop back to the UTC slice. The original finding is retired as **F35a** (§24).

### 21.4 The "scheduled" denominators — one shared rule, plus two strays

```
ONE rule, used by all four period builders:

  lib/analytics/period-habits.ts  buildPeriodHabits()          :169
  ┌─────────────────────────────────────────────────────────────┐
  │ for each date in [start, end]:                              │
  │   for each habit:                                           │
  │     if (!isEligibleOn(habit, date, ctx).eligible) continue  │
  │        ◄── archived / paused / out-of-bounds / day type /    │
  │            frequency / skip / pause / not-applicable override│
  │     scheduled++                                             │
  │     if log.status === 'COMPLETED'  completed++              │
  │                                                             │
  │   rate = completed / scheduled,  null when scheduled === 0  │
  └─────────────────────────────────────────────────────────────┘
       daily.ts:111 · weekly.ts:183 · monthly.ts:165 · yearly.ts:136
       ◄── one implementation, 4 callers, future days clipped to today


TWO strays that did not adopt it:

  recap.service.ts:255–268  (heatmap)
  ┌───────────────────────────────────────────────┐
  │ dayMap over raw HabitLog rows                 │
  │   if status === 'COMPLETED'            → completed++   │
  │   if status !== 'SKIPPED' &&            → scheduled++   │
  │          !== 'NOT_APPLICABLE'                          │
  │  🔴 no eligibility — a habit not due that day │
  │     still counts if the user logged it        │
  │  🔴 no noRecord state — a day with no rows    │
  │     is simply absent from the map             │
  └───────────────────────────────────────────────┘

  server/recap/weekly.ts:37–38  (live via review.service)
  ┌───────────────────────────────────────────────┐
  │ total: logs.length                            │
  │ rate: completed / logs.length                 │
  │  🔴 INCLUDES SKIPPED + NOT_APPLICABLE          │
  │  🔴 still one findLogsByRange per habit        │
  └───────────────────────────────────────────────┘
```

A user who deliberately skips 300 days and completes 30 sees **9%** in `/recap/weekly-review` and, correctly, a high rate everywhere on `/recap`. §6.4, §27.

---

## 22. File-by-file dependency inventory

### 22.1 The route

| File | Lines | Directive | Notes |
| ---- | ----- | --------- | ----- |
| `src/app/(dashboard)/recap/page.tsx` | **648** / 610 | `'use client'` | 8 local components: `RecapDashboard` `:143`, `ExtrasGrid` `:271`, 4 share-stat builders `:291`–`:334`, 3 milestone builders `:338`–`:414`, `SkeletonGrid` `:418`, `EmptyState` `:431`, `Highlights` `:449`, `HighlightCard` `:605` |
| `src/app/(dashboard)/recap/loading.tsx` | 12 / 12 | none (RSC) | 4 tiles + a bar; **does not match** `SkeletonGrid`'s shape |
| `src/app/(dashboard)/recap/weekly-review/page.tsx` | 372 / 336 | `'use client'` | sibling, writes `WeeklyReview` |
| `src/app/(dashboard)/recap/monthly-reset/page.tsx` | 443 / 407 | `'use client'` | sibling, writes `MonthlyReset` |

### 22.2 API layer

| File | Lines | Notes |
| ---- | ----- | ----- |
| `src/app/api/recap/route.ts` | 47 / 41 | the only route this page uses |
| `src/app/api/recap/weekly/route.ts` | 43 / 36 | 🔴 **no caller**; host-local week; instant-vs-date comparison |
| `src/server/services/recap.service.ts` | 599 / 549 | module singleton at `:599`; 16 repositories in the constructor `:143`–`:160` |
| `src/server/recap/weekly.ts` | 97 / 86 | live via `review.service.ts:120`/`:136`; 🔴 still has its own per-habit N+1 at `:29`–`:41` **and** a `logs.length` denominator that counts `SKIPPED` — the last survivor of the retired defect family (**F20**, §27.4) |

### 22.3 Shared pure / state

| File | Lines | Role |
| ---- | ----- | ---- |
| `src/lib/period-range.ts` | 230 | `getPeriodRange` `:124`, `shiftAnchor` `:93`, `todayAnchor` `:104`, `isWithinRange` `:211`, `normalizeDate` `:219`, `nowInTz` `:228` |
| `src/hooks/useUserTimezone.ts` | 45 | settings → browser → `DEFAULT_TZ` |
| `src/components/shared/PeriodControl.tsx` | 158 | the tab strip |
| `src/types/recap.ts` | 166 | the client-facing contract (§5.6) |

### 22.4 Analytics modules — **shared with `/analytics` and `/reports`**

| File | Lines | Role | Defects (re-verified 2026-10-03) |
| ---- | ----- | ---- | ------------------------------- |
| `src/server/analytics/daily.ts` | 211 / — | `dailyBreakdown` `:102`, 5 parallel reads `:109` | — |
| `src/server/analytics/weekly.ts` | 312 / — | `weeklySummary` `:166` | ✅ clean — pooled `completed/scheduled`, zoned goals, one progress range query |
| `src/server/analytics/monthly.ts` | 287 / — | `monthlySummary` `:133` | unclamped `averageProgress` via `tier.rate ?? 0` at `:232` |
| `src/server/analytics/yearly.ts` | 277 / — | `yearlySummary` `:118` | unclamped `averageProgress` `:218`–`:221` (**F4**) |
| `src/server/analytics/streaks.ts` | 176 / — | `streakAnalytics` | called with an all-time window by recap (**F6**) |
| ✅ `src/server/analytics/period-habits.ts` | 81 / — | `loadPeriodHabits` `:29` | — **new; replaced every N+1 in the four modules above** |
| ✅ `src/lib/analytics/period-habits.ts` | 320 / — | `buildPeriodHabits` `:169` | — **new; the single denominator rule** |

### 22.5 Repositories — 16 instantiated by `RecapService`

`UserRepository` (523), `ScoreRepository` (303), `HabitRepository` (817), `SleepRepository` (232), `ReflectionRepository`, `FocusRepository` (416), `GoalRepository` (625), `TaskRepository`, `NutritionRepository`, `HealthMetricRepository`, `AchievementRepository` (128), `ReviewRepository`, `JournalRepository` (474), `RoutineRepository`, `MoodRepository` (381), `EnergyRepository`.

Plus, via the analytics modules: `StreakRepository` (212).

### 22.6 UI components — 22 in `components/recap/`

All listed with counts in §3.2. `stat-tile.tsx` (35) is the only one **without** `'use client'`.

### 22.7 🔴 Duplicate `RecapReport` and duplicate `WeeklyRecap`

| Name | Files | Relationship |
| ---- | ----- | ------------ |
| `RecapReport` | `types/recap.ts:86` **and** `recap.service.ts:53` | two independent declarations of the same concept; the service's is the real shape, the type file's is a hand-maintained client narrowing |
| `WeeklyRecap` | `components/recap/WeeklyRecap.tsx` (80) **and** `components/dashboard/WeeklyRecap.tsx` (143) | unrelated components sharing a name |
| `generateWeeklyRecap` | `server/recap/weekly.ts:11` | a **third** weekly-summary implementation alongside `weeklySummary` and `RecapService.buildWeek` |

Three independent "weekly summary" implementations exist — `weeklySummary` (analytics), `RecapService.buildWeek` (recap), and `generateWeeklyRecap` (review service). **Re-verified 2026-10-03:** the first two are now the same denominator (`buildWeek` delegates to `weeklySummary`), so there are **two** rules, not three. `generateWeeklyRecap`'s is the divergent one and it is unchanged: `total: logs.length` (`recap/weekly.ts:37`), including `SKIPPED`, plus its own per-habit `findLogsByRange` N+1 at `:29`–`:41`. It no longer matches `yearly.ts` — it matches nothing.

---

## 23. Current behavior summary

**What the page does.** One fetch per view change. `GET /api/recap` resolves the range server-side from the user's stored timezone, then fans out to 16 parallel `extras` reads plus the period-specific analytics module, and returns a single `RecapReport`. The client picks one of four layouts from `period`, renders a period hero, a Recharts trend, a best-day card, a milestone card, 13 extras cards, a free-text highlights panel and a clipboard share card. Filters and sorting do not exist; navigation is two arrows, four tabs and a "Today" button.

**What is genuinely well-built.** The timezone story is the strongest part of this codebase and `/recap` uses it properly on the server: one shared `period-range` module, Monday-anchored weeks, `fromZonedTime`/`toZonedTime` wall-clock arithmetic, and a `PeriodControl` that refuses to let a date-arithmetic failure take the page down. ✅ **Every habit completion figure on every period hero now comes from one shared eligibility rule** (`lib/analytics/period-habits.ts`), with future days clipped out of a live window and `null` rather than `0` for "nothing due". The race guard on `requestId` is correct. The em-dash-instead-of-0 convention is applied in 4 of the day share stats and 1 of the week ones. Every extras card owns its empty state, and the service returns `null`/`[]` rather than fabricating. Highlights and milestones emit rows only when real data exists. The AI-free design is a deliberate correctness win.

**The headline defects that remain.** The day period's empty state is **unreachable**, because `score?.totalScore !== null` is `true` whenever the row is absent (§25). Period navigation calls `shiftAnchor` without the timezone while the same component passes it correctly two lines later (§26). Two of the four period builders re-fetch the identical `DailyScore` range they were just handed. And the query cost still does not scale with the requested period: a one-day view pays two all-time scans and ~21 queries.

**The structural picture.** Cost is inverted: `buildExtras` is the most expensive block (16 of ~21–25 queries) and contributes the least structural content — the page renders fine without it. ✅ **The N-scaling is gone**; `loadPeriodHabits` costs the same five queries for a day or a year at any habit count, and no sequential fan-out remains anywhere on this path. What replaces it is **unconditional breadth**: the same 16 reads fire for a single day as for a full year, including `streakAnalytics` over `'2000-01-01'` and an unbounded `findUnlocked`. And every remaining defect in `server/analytics/*` reaches `/recap`, `/analytics` **and** `/reports` simultaneously, because three entry points share five functions with no cache between them.

**The correctness drift.** 🔴 `/recap`'s own habit heatmap uses a **log-row denominator** (`recap.service.ts:255`–`:268`) that does not apply eligibility and has **no `noRecord` state** — so it is a fourth definition of "scheduled", inside the very module that exists to prevent a fourth (§27). The rule itself *is* tested (`tests/lib/analytics-period-habits.test.ts`), which is what makes the drift easy to miss: the shared function is proven correct and the caller that bypasses it is what ships. `/recap/weekly-review` still shows `generateWeeklyRecap`'s `logs.length` rate. And nothing covers `period-range.ts`, `recap.service.ts`, or the analytics summaries.

---

## 24. Findings register

Severity: critical = wrong or missing user-visible behaviour; major = correctness/perf/data risk; minor = dead code, stale comments, cosmetic.

> **Re-verified 2026-10-03.** Nine findings closed in the `loadPeriodHabits` refactor and are marked **✅ RESOLVED** below with what replaced them. Two new findings (F36, F37) surfaced during re-verification. **26 open: 1 critical, 10 major, 15 minor.**

| ID | Sev | Finding | Evidence | Fix |
| -- | --- | ------- | -------- | --- |
| **F1** | major | `buildWeek` and `buildMonth` each re-fetch the identical `DailyScore` range that `weeklySummary` / `monthlySummary` already fetched. Full rows including the `calculationData` JSON blob, twice, per week/month view. | `recap.service.ts:544` vs `weekly.ts:181`; `:561` vs `monthly.ts:164` | Return `points` from the summary, or accept a `preloadedScores` param the way `preloadedHabits` is accepted. **18.2** |
| ~~**F2**~~ | — | ✅ **RESOLVED.** Per-habit N+1 in all three analytics modules. | was `weekly.ts:180`, `monthly.ts:180`, `yearly.ts:141` | Replaced by `loadPeriodHabits` — 5 fixed queries, N-independent. **6.1, 18.3** |
| ~~**F3**~~ | — | ✅ **RESOLVED.** `yearly.ts` divided by `logs.length`, including `SKIPPED` and `NOT_APPLICABLE`. | was `yearly.ts:150` | Replaced by `habitModel.totals.rate` (`yearly.ts:204`). **6.4, 21.4** |
| **F4** | minor | `yearlySummary.averageProgress` is unclamped and can exceed 100; the same-named `extras.goalsDelta.averageProgress` **is** clamped to 0-100. Two fields, one name, different contracts. | `yearly.ts:218`-`:221` vs `recap.service.ts:346` | Clamp, or extract the shared helper `recap.service.ts:346` uses. |
| **F5** | minor | `TrendCard` passes `animationDuration={900}` to Recharts unconditionally. The only animation on the page and **not** gated on `prefers-reduced-motion`, unlike `/achievements` where `Stagger` and the popup both honour it. | `TrendCard.tsx:116` | Gate on `useReducedMotion()` or CSS `motion-reduce`. |
| **F6** | major | `buildExtras` runs **before** the period branch and unconditionally, so every view pays 16 queries including two **all-time** scans (`streakAnalytics` from `'2000-01-01'`, `findUnlocked` unbounded). Even for a one-day view of an empty day. **This is now 16 of ~21–25 queries — the dominant cost of every request.** | `recap.service.ts:181`, `:244`, `:245`, `:70` | Compute `hasData` first and skip extras; scope the two all-time reads to what their consumer needs. **5.3, 18.1** |
| **F7** | minor | Two of the 16 extras reads are unbounded then filtered in JavaScript when both are `where`-scopable: `findAll(userId)` for goals and `findUnlocked(userId)` for achievements. | `recap.service.ts:236`, `:245`/`:406` | Scope in the query. |
| **F8** | critical | The day period's `hasData` is **always true**: `score?.totalScore !== null` is `undefined !== null`, so the "No recap data available" state is unreachable for `period: 'day'`. | `recap.service.ts:532`-`:533` | `score?.totalScore != null`. **25** |
| **F9** | minor | `RecapDashboard` returns `null` when no `period === X && report.X` guard matches: a silent **blank page** below the header, with no error, no empty state and no console output. | `page.tsx:261` | Render a diagnostic empty state. |
| **F10** | major | The year view's `BestDayCard` receives `date={report.year.bestMonth.month}`: a raw **`YYYY-MM`** key, "2026-03", under a heading that reads **"Best day"**, with the score being that month's **average**, not a day's score. | `page.tsx:245`-`:251`, `BestDayCard.tsx:23` | Give `BestDayCard` a `kind` prop, or use a distinct month card. **16.3** |
| **F11** | major | The timezone-change path is incomplete: `anchorDate` is only re-seeded when `today` changes, so moving between timezones without crossing a date boundary leaves the anchor stale and **no new request is issued**. | `page.tsx:69`-`:71` (keys on `today`), `:91`-`:95` | Key the effect on `timezone` as well. |
| **F12** | major | No URL state **on this page**: `period` and `anchorDate` are component-local, so views are not linkable or shareable and the back button leaves the page instead of undoing a period step. ✅ `/analytics` has been migrated to `usePeriodUrlState`, which does exactly this and more — see **F38**. | `page.tsx:57`, `:63` vs `hooks/usePeriodUrlState.ts` | Adopt the hook. **F38** |
| **F13** | minor | `buildYear`'s `points` (12 monthly averages with `core/growth/bonus: 0` placeholders) is serialised and **never read**. The page builds its own `yearRows` from `monthlyScoreTrend` instead. | `recap.service.ts:582`-`:590` vs `page.tsx:229`-`:233` | Omit `points` for year, or type the union. |
| **F14** | minor | `"Perfect days"` is labelled **"N days at 100 points"** while the threshold everywhere is `>= 95`. | `page.tsx:343`, `:376` vs `weekly.ts:276`, `monthly.ts:256` | Say "95 points", or use the threshold in the label. |
| **F15** | major | `weeklySummary` / `monthlySummary` / `yearlySummary` / `dailyBreakdown` are called from **two** services with **no cache between them**, so `/recap`, `/analytics` and `/reports` each recompute identical inputs. Was the N+1; is now a flat duplicated 5-query habit load — smaller waste, same structural problem. | `recap.service.ts:519`/`:543`/`:560`/`:577` vs `analytics.service.ts:187`-`:192` | `unstable_cache` keyed on `(userId, range)`, or make `preloadedHabits` actually threaded. **12.3** |
| **F16** | minor | No rate limiting and no bound on `date`: `9999-12-31` passes the regex, so a client can request an arbitrarily distant year and trigger the full year path. | `api/recap/route.ts:14`, `:36`-`:40` | Bound `date` to a sane window; add per-user rate limiting. **17.5** |
| **F17** | minor | `ShareRecapCard`'s body copy says "A quick, honest summary of your **week**" on all four periods, one line below an `<h2>` that correctly reads "Today" / "March 2026" / "2026". | `ShareRecapCard.tsx:50` vs `:48` | Pass the period through. |
| **F18** | minor | Two skeletons with two different shapes: `loading.tsx` (4 tiles in a 2-col grid + a bar) covers the RSC phase, then `SkeletonGrid` (4 tiles in a 4-col grid + one `h-72`) covers the fetch. Neither matches the real layout of up to 23 components. | `loading.tsx:3`-`:9` vs `page.tsx:418`-`:429` | One skeleton, shaped like the real grid. |
| **F19** | minor | `RecapReport` is declared **twice**: `types/recap.ts:86` (a hand-maintained client narrowing of the four summary types) and `recap.service.ts:53` (the real shape). Nothing keeps them in sync. | as cited | Derive the client type from the service type. **5.6** |
| **F20** | major | **Two** independent weekly-summary implementations with **two** habit-rate denominators. ✅ Reduced from three: `buildWeek` now delegates to `weeklySummary`, so the only divergence left is `generateWeeklyRecap` (`total: logs.length`, includes `SKIPPED`, per-habit N+1, live via `review.service.ts:120`/`:136`). Two components named `WeeklyRecap` with different implementations. | `recap/weekly.ts:29`-`:41` vs `weekly.ts:183`; `components/recap/WeeklyRecap.tsx` vs `components/dashboard/WeeklyRecap.tsx` | Consolidate `generateWeeklyRecap` onto `weeklySummary`. **22.7** |
| **F21** | major | The error state has **no retry**: `error` is a boolean, the `catch` at `:83` discards the message, and `EmptyState` offers "Go to Today" while the body text says "Please try again in a moment." A failed period switch is unrecoverable without a manual reload. ✅ `usePeriodUrlState` already exposes `retry()` and an `error: string` — see **F38**. | `page.tsx:66`, `:83`-`:85`, `:124`-`:129`, `:437` | Adopt the hook. **F38** |
| **F22** | minor | Raw `fetch` instead of the shared `apiRequest`, so no `ApiError` typing, no envelope unwrap, and an unchecked `as RecapReport` cast. No `AbortController`, so a superseded request still completes server-side on a ~21-query endpoint. | `page.tsx:78`, `:82` | Use `apiRequest` + `AbortController`. **18.4** |
| ~~**F23**~~ | — | ✅ **RESOLVED.** Sequential N+1s: `monthly.ts`'s `for…of` over habits, and `yearly.ts`'s 12 `countByMonth` calls in a loop. | was `monthly.ts:180`, `yearly.ts:193`-`:195` | Replaced by `loadPeriodHabits` and `journalRepository.countByRange` (`yearly.ts:145`). **18.3** |
| ~~**F24**~~ | — | ✅ **RESOLVED.** N+1 on goal progress and milestones: `weekly.ts` fetched **100** progress rows per active goal, `monthly.ts` fetched milestones for **every** goal including archived ones. | was `weekly.ts:228`, `monthly.ts:244` | One range query each, grouped in JS (`weekly.ts:187`, `monthly.ts:175`). |
| ~~**F25**~~ | — | ✅ **RESOLVED.** `weekly.ts` re-fetched `findAll(userId, { status: 'ACTIVE' })` in the same `Promise.all` and fetched all completed goals unbounded. | was `weekly.ts:227`, `:235` | One `findAll(userId, {})` at `weekly.ts:186`, date-filtered in JS at `:263`-`:268`. |
| **F26** | minor | `HabitHeatmapCard` renders a 0% day as a `minColor` cell (`#18181b`, near-black): indistinguishable from a real 0%, and on a **light** theme it reads as a strong filled cell rather than an empty one. `HeatMap`'s own default is the same hardcoded dark value. **Compounded by F36 — the heatmap has no `noRecord` state to render even if it wanted one.** | `HabitHeatmapCard.tsx:32`, `:17`; `HeatMap.tsx:66`, `:103` | Theme the low end, and add a "no record" state as `/habits` does. |
| **F27** | minor | `/api/recap/weekly` has **no caller**, computes its own week in **host-local** time with hand-rolled Monday math (bypassing the timezone-aware `getPeriodRange`), and compares an instant against a bare date string (`new Date('2026-09-28')` is UTC midnight). | `api/recap/weekly/route.ts:18`-`:28`; `recap/weekly.ts:55`-`:56` | Delete it: `review.service.ts` is the live consumer. |
| **F28** | minor | `ExtrasGrid` renders 12 cards unconditionally plus a 13th conditionally, on all four periods, including the day view where 12 are structurally empty. There is no toggle. | `page.tsx:271`-`:289` | Hide all-empty cards, or group behind a disclosure. |
| **F29** | minor | `{report.extras && ..}` guards at `:149`, `:185`, `:221`, `:254` are dead defence: `buildExtras` always returns the object. | `recap.service.ts:463`-`:479` | Drop the guards or make `extras` genuinely optional. |
| **F30** | minor | `dayShareStats` prints `habitReliability` with **no zero-guard** (`:294`) while its three siblings correctly render an em dash. A day with no habit logs shows `0%`. | `page.tsx:291`-`:301` | Guard it like the others. |
| **F31** | minor | Clipboard failures are silent: `catch` resets `copied` to `false` and nothing is reported. No `execCommand` fallback or selectable textarea for insecure origins. | `ShareRecapCard.tsx:29`-`:31` | Add a failure state and a fallback. |
| **F32** | minor | `stat-tile.tsx` (35 lines) has **no** `'use client'` while all four consumers do, so it is duplicated into each client bundle instead of shared; its `accent` class is string-concatenated rather than passed through `cn`. | `stat-tile.tsx:1`, `:27`; `DailyRecap.tsx:1` | Add the directive, use `cn`. |
| **F33** | minor | `RecapService` instantiates 16 repositories **and** the analytics modules each hold their own module-level singletons, so one request constructs 21+ repository wrappers across two module graphs. Any future repository-level cache would have to be added twice. | `recap.service.ts:143`-`:160`, `:604`; `weekly.ts:20`-`:24` | One shared repository registry. |
| **F34** | minor | The Recharts `<AreaChart>` has no `aria-label`, no fallback table and no `role`, while `HeatMap` does set `aria-label`. The page's primary visual is unlabelled to assistive tech. | `TrendCard.tsx:82`-`:122` vs `HeatMap.tsx:97` | Add `role="img"` + `aria-label`, and a visually-hidden data table. |
| **F35** | major | **No tests** cover `period-range.ts`, `recap.service.ts`, or any `server/analytics/*` summary. ✅ `tests/lib/analytics-period-habits.test.ts` exists and pins the shared denominator — but it cannot catch a caller that declines to use it, which is exactly **F36**. The rest of the defect list sits in pure, DB-free functions: `getPeriodRange`, `shiftAnchor`, `toPoints`, the 4 share-stat builders, the 3 milestone builders and `Highlights`. | `tests/` listing (22 files) | Add `tests/lib/period-range.test.ts` and `tests/domain/recap-derive.test.ts`. |
| ~~**F35a**~~ | — | ✅ **RESOLVED.** `goals.completedAt` bucketed with `.toISOString().slice(0, 10)` (UTC) in the three analytics modules while `extras` zoned it. | was `weekly.ts:237`, `monthly.ts:240`, `yearly.ts:177`, `monthly.ts:248` | `timezone` is now a **required** parameter of all three summaries; each zoned-buckets at `weekly.ts:266`, `monthly.ts:248`, `yearly.ts:215`. **6.3, 21.3** |
| **F36** | major | **New.** 🔴 `buildExtras` re-reads the period's habit logs with `findLogsByUserRange` (`:232`) and rebuilds the heatmap denominator by hand, instead of using the `PeriodHabitModel` the period builder **already loaded**. That makes the heatmap a *fourth* definition of "scheduled" (log rows minus `SKIPPED`/`NOT_APPLICABLE`, no eligibility, no `noRecord`) sitting inside the module whose own docstring exists to prevent exactly that. `preloadedHabits` was added to all four summary signatures for this purpose and is unused. | `recap.service.ts:232`, `:255`-`:268` vs `lib/analytics/period-habits.ts:63` (`PeriodHabitDay` already has `{date, completed, scheduled, noRecord}`) | Thread `preloadedHabits` into `build*` and build `habitHeatmap` from `habitModel.days`. Kills the duplicate query and the fourth definition at once. **6.4, 21.4** |
| **F37** | major | **New.** `hasData` is also **too narrow** in the opposite direction: its clauses cover score, habits, routine and sleep, but not journal, reflection, focus, mood or energy. A user who wrote a reflection and nothing else is told "No recap data available for this period" despite having written something — the data is in `extras.reflections` and `extras.journal`, which the predicate never consults. | `recap.service.ts:532`-`:537` vs `recap.service.ts:437`-`:461`, `:410` | Include `reflections.length > 0 \|\| journal.length > 0 \|\| moodEnergy.length > 0`, and distinguish "no records" from "measured zero" per AGENTS.md. **25.1** |
| **F38** | major | **New — and the most actionable item in this register.** 🔴 `src/hooks/usePeriodUrlState.ts` (212 lines) was written to fix *precisely* F11, F12, F21 and F22, its docstring naming `/analytics` by name — and **`/recap` does not use it**. `/analytics/page.tsx:110` does. The hook already provides URL-backed `period`/`date`, a token race guard, `error: string`, `retry()`, `isStale`, and `step()` built on `getPeriodRange(...).prev/.next` — which **also retires F26**, because `PeriodRange` already carries timezone-correct neighbours and `/recap` prefers hand-rolled `shiftAnchor`. | `hooks/usePeriodUrlState.ts` vs `page.tsx:57`-`:97`; `analytics/page.tsx:110` | Adopt the hook. One change closes **F11, F12, F21, F26, and half of F22**. Note it returns `label` from `getPeriodRange`, so `page.tsx:112`'s `report?.label ?? '—'` becomes redundant too. |

**Count: 38 findings filed. 27 open (1 critical, 11 major, 15 minor) · 9 resolved** (F2, F3, F23, F24, F25, F35a, plus F2/F3's descendants).

---

## 25. The day period's empty state is unreachable

```
recap.service.ts:532-537

  const hasData =
    score?.totalScore !== null ||                                     // the bug
    breakdown.tiers.some((tier) => tier.total > 0) ||
    breakdown.habits.some((habit) => habit.status !== 'NOT_LOGGED') ||
    breakdown.routine.total > 0 ||
    breakdown.sleep.logged;
```

`score` is `ScoreRepository.findByDate(userId, anchor)` (`:520`), which returns `null` when the day has never been scored. For a user with **no** `DailyScore` row on the anchor day:

| Expression | Value |
| ---------- | ----- |
| `score` | `null` |
| `score?.totalScore` | `undefined` (optional chaining short-circuits on `null`) |
| `undefined !== null` | **`true`** (`!==` is strict; `undefined` is not `null`) |
| therefore `hasData` | **`true`** |

The remaining four clauses are never evaluated: `||` short-circuits on the first `true`.

**What the user sees.** A brand-new user opens `/recap`, the default period is **week**, so they get the week empty state (correctly). They click the **"Today"** tab. `buildDay` returns `hasData: true`, so `page.tsx:130`'s `!report?.hasData` is false and `RecapDashboard` renders the day branch. They see:

- `DailyRecap` with a `0` score and a conic ring at `--p: 0%` (`DailyRecap.tsx:44`, `:55`). The label beside it correctly reads "No score yet" (`:66`), but the hero number still reads `0`.
- `Habit reliability 0%`, `Sleep --`, `Routine --`.
- all **13** `ExtrasGrid` cards, each with its own empty-state paragraph.
- a "Day at a glance" panel reading "No completed highlights yet." / "Nothing to fix. Nice work!".
- a `ShareRecapCard` whose first stat reads an em dash (correctly guarded) and second reads `0%` (**not** guarded, F30).

So a user with **zero data** gets a page that looks fully functional and reports zero for everything: the exact opposite of the intended "No recap data available for this period. Log habits, complete your routine, and track sleep to build your recap." And it cost roughly 21 queries to render, because `buildExtras` ran first (18.6).

**Why the other three periods are correct.** `buildWeek:547`, `buildMonth:564` and `buildYear:592` all start with `points.length > 0 ||`, a genuine length test that is `false` for an empty array. Only `buildDay` uses the `!== null` idiom, and only `buildDay` has a nullable source: `findByDate` returns a single row or `null`, whereas `findByRange` returns an array.

**The fix is one character class**, and either form works:

```ts
score?.totalScore != null        // loose: covers null and undefined
// or
score !== null && score.totalScore !== null
```

`points` at `:522`-`:530` already uses the **correct** guard (`score && score.totalScore !== null`), which is why the trend chart correctly shows its "No scores for this period yet" message while the surrounding page claims it has data. The inconsistency is inside a single 8-line method.

**Related but separate:** `x?.y !== null` is a common way to write "is this present" that silently inverts to `true` when `x` is nullish. Worth sweeping for. §24 F8.

### 25.1 🔴 The same predicate is simultaneously **too permissive and too narrow**

Re-verification surfaced the mirror-image failure. Fixing F8 alone — `score?.totalScore != null` — makes the empty state reachable, and then exposes a *second* bug in the four clauses that follow:

```ts
const hasData =                                                       // recap.service.ts:532
  score?.totalScore !== null ||           // ← nullish bug (F8)
  breakdown.tiers.some(tier => tier.total > 0) ||
  breakdown.habits.some(h => h.status !== 'NOT_LOGGED') ||
  breakdown.routine.total > 0 ||
  breakdown.sleep.logged;
```

`dailyBreakdown` (`server/analytics/daily.ts:109`–`:115`) reads **five** sources — score, habits, routine logs, sleep log, reflection — and the predicate consults four of them. It never looks at the **reflection**, and it never looks at anything `buildExtras` fetched: journal, mood, energy, focus.

| User activity on the selected day | `hasData` | Truth |
| --------------------------------- | --------- | ----- |
| Nothing at all | 🔴 `true` (F8) | false |
| Ticked a habit, nothing else | ✅ `true` | true |
| **Wrote a reflection only** | 🔴 `false` | **true** — `breakdown.reflection.biggestWin` is populated and rendered by `DailyRecap`, but the predicate never reads it |
| **Logged a journal entry only** | 🔴 `false` | **true** — `extras.journal` has the row; `JournalCard` would have rendered it |
| **Logged a mood reading only** | 🔴 `false` | **true** — `extras.moodEnergy` has the row |

So the day period currently gets both answers wrong: it says "yes, here is your data" for a user who has none, and "no recap data available for this period" for a user who wrote something. The empty-state copy is also too narrow — *"Log habits, complete your routine, and track sleep to build your recap."* — and names none of the four other things that would satisfy the predicate once fixed. §24 F37.

The corrected predicate needs to (a) use `!= null`, (b) union in the reflection and the `extras` sources, and (c) keep **zero distinct from absent** per AGENTS.md — a day where a habit was due and recorded as `MISSED` is not the same claim as a day with no rows at all.

---

## 26. `shiftAnchor` is called without the timezone

```
lib/period-range.ts:93
  export function shiftAnchor(
    date: string, period: Period, delta: number, tz = DEFAULT_TZ      // tz defaults to 'UTC'
  ): string {
    const wall = toWall(toLocalInstant(date, tz), tz);
    if (period === 'day')   return wallToDateStr(addDays(wall, delta));
    if (period === 'week')  return wallToDateStr(addDays(wall, delta * 7));
    if (period === 'month') return wallToDateStr(addMonths(wall, delta));
    return wallToDateStr(addYears(wall, delta));
  }

page.tsx:62    const { today, timezone } = useUserTimezone();         // tz is in scope
page.tsx:97    const navigate = (delta: number) =>
                 setAnchorDate(shiftAnchor(anchorDate, period, delta));   // OMITTED
page.tsx:118   timezone={timezone}                                     // PASSED
```

The page has `timezone` in scope and hands it to `PeriodControl`, which needs it for its own `shiftAnchor` call:

```
PeriodControl.tsx:75
  return shiftAnchor(anchorDate, period, 1, timezone) > maxAnchor;   // correct
```

So inside one component tree, **the prev/next buttons navigate in UTC and the button that decides whether next is enabled navigates in the user's timezone.**

**And this is the exact bug that already happened once.** `PeriodControl.tsx:68`-`:71`:

> *"NOTE the 4th argument to `shiftAnchor` is the **timezone**, not a bound. Passing `maxAnchor` there previously made `fromZonedTime(..., "2026-09-28")` return an Invalid Date, so `format()` threw `RangeError: Invalid time value` and crashed the whole `/analytics` page. Hence the explicit `timezone` prop."*

The fix for that crash added a `timezone` prop to `PeriodControl` and fixed **its** call site. `RecapPage`'s own call was not touched, and it makes the same omission, just with the *default* rather than a wrong value, so it does not throw.

**Why it is currently harmless.** Every branch is pure calendar arithmetic on a `YYYY-MM-DD` string, and the server re-snaps to real period boundaries:

| Period | Branch | Would a zone change the answer? |
| ------ | ------ | ------------------------------- |
| `day` | `addDays(wall, delta)` | No: `wall` is UTC-midnight of a calendar date, and `+1` is the next calendar day |
| `week` | `addDays(wall, delta * 7)` | No, and `getPeriodRange` re-snaps to Monday anyway (`period-range.ts:146`) |
| `month` | `addMonths(wall, delta)` | No: `getPeriodRange` re-snaps to the 1st (`:159`) |
| `year` | `addYears(wall, delta)` | No: `getPeriodRange` slices `slice(0, 4)` (`:172`) |

**So today the output is correct for every period.** That is why this is major and not critical: it is a latent defect, not an observable one.

**Why it still matters.**

1. **It becomes observable the moment `shiftAnchor` gains a zone-sensitive branch** (a user-configurable week start, a business-day skip, any `fromZonedTime` round-trip crossing a DST boundary). `page.tsx:97` would then be the only call site in the app still passing UTC.
2. **`getPeriodRange` is a safety net for the range, not for the anchor.** The *range* is always recomputed server-side, but the *label* and the *disable check* both derive from the anchor, so a drift shows up in the label and in whether next is enabled even when the data is right.
3. **It is a silent inconsistency**, and the one place in the codebase where the same function is called twice with different arities is the kind of thing a future reader will "fix" by copying the wrong line.

**The fix is one argument:**

```ts
const navigate = (delta: number) =>
  setAnchorDate(shiftAnchor(anchorDate, period, delta, timezone));   // page.tsx:97
```

### 7.4 ✅ The real fix already exists — and `/recap` is not using it

`getPeriodRange` returns more than boundaries. `PeriodRange` (`lib/period-range.ts:42`–`:59`) carries:

```
prev: string     ◄── anchor for the previous period, zone-correct
next: string     ◄── anchor for the next period,     zone-correct
```

`page.tsx:97` does not use them. It calls `shiftAnchor` by hand, which is why the argument was optional and why omitting it was silent. **`getPeriodRange` has no optional-timezone path at all** — the zone is a required 3rd parameter, so the bug class cannot recur there.

And `/recap` is not the page that shows the intended shape. `src/hooks/usePeriodUrlState.ts` (212 lines) exists and its docstring says why, naming this exact defect:

> *"`/analytics` kept `period` and `anchorDate` in component state. That made the page impossible to link to, impossible to bookmark, and impossible to reach with the back button: a user who looked at last month's habits and pressed back landed on 'today' with no sign that anything had happened. For a *reporting* surface, a reload silently resetting the view is the one thing that must not happen — the view is the result, not a transient UI state."*

`step(delta)` at `:182`–`:188` resolves through `getPeriodRange(period, anchorDate, timezone).prev/.next`, so adopting the hook retires §26 outright rather than patching it. It also carries `error: string`, `retry()`, and an `isStale` flag that keeps the previous period on screen while the next loads. See **F38**.

§24 F35 notes that `tests/lib/period-range.test.ts` would pin this class of defect: `shiftAnchor` is a pure function with one argument missing, and the existing `routine-duration.test.ts` already demonstrates the exact pattern needed.

---

## 27. The recap heatmap uses a log-row denominator, not eligibility

> **This section was §27 "UTC vs zoned `goals.completed`" and has been replaced.** That finding is **RESOLVED** — `timezone` became a required parameter of `weeklySummary` / `monthlySummary` / `yearlySummary` and all three now zone-bucket `completedAt`. The analysis is preserved at [§6.3](#63-goalcompletedat-bucketing---resolved-2026-10-03) and [§21.3](#213--resolved--goalscompletedat-is-now-zoned-on-both-paths).
>
> **It is replaced by a live, arguably worse defect that the 2026-09-30 pass missed**, because it only looked for *disagreement between periods* and never compared the extras block against the model the period builders now use.

### 27.1 The divergence

`buildExtras` builds the heatmap by hand from raw `HabitLog` rows (`recap.service.ts:255`–`:268`):

```ts
const dayMap = new Map<string, { completed: number; scheduled: number }>();
for (const log of habitLogs) {
  const bucket = dayMap.get(log.date) ?? { completed: 0, scheduled: 0 };
  if (log.status === 'COMPLETED') bucket.completed++;
  if (log.status !== 'SKIPPED' && log.status !== 'NOT_APPLICABLE') {
    bucket.scheduled++;                                    // ◄── the fourth rule
  }
  dayMap.set(log.date, bucket);
}
```

Everything above it was consolidated. `lib/analytics/period-habits.ts` exists for exactly this reason — its docstring opens with *"One habit-completion definition for every reporting period"* and quotes the old four-way denominator table as *"The problem this replaces"*. All four period builders adopted it. `buildExtras` did not, and it does not need a hand-rolled rule at all, because `PeriodHabitDay` (`period-habits.ts:63`–`:77`) is already `{date, completed, missed, skipped, noRecord, scheduled, …}` per day, already clipped to today, already eligibility-scored — and it is **already loaded for this same request** by the period builder.

### 27.2 Three ways the heatmap's rule is wrong

| # | Heatmap says | Shared model says | Why it matters |
| - | ----------- | ----------------- | -------------- |
| 1 | A habit the user was **not due** on that day counts as `scheduled` if they logged it at all. | `isEligibleOn` is checked **first**; a non-due day is not in the denominator. | Retroactive ticks inflate the denominator, so the heatmap under-reports. |
| 2 | A day with **no `HabitLog` rows** is simply **absent from the map**. | `days[].noRecord` = `scheduled − recorded`, a distinct third state. | "I had 3 due and did none" and "I was never due" both render as *no cell*. AGENTS.md: *"a day with no `HabitLog` row is unknown, not failed."* |
| 3 | `scheduled` counts `NOT_LOGGED`-status rows too, if that status exists on any row in range. | `buildPeriodHabits` only counts rows that survive the eligibility gate. | Denominator drifts with logging behaviour rather than with the schedule. |

Combined effect: the heatmap is the one card on `/recap` where a user cannot tell "I did everything" from "I was never due" from "I didn't do it" — and it is the card that most invites that reading, because a contribution grid *is* a schedule.

Compounding it: **F26**. `HabitHeatmapCard` renders its `minColor` as a hardcoded `#18181b`, which on a **light** theme is a strong filled cell rather than an empty one. Even after the denominator is fixed, a day with zero completion will look like data.

### 27.3 The fix is one parameter, and it deletes a query

`preloadedHabits` was added to all four summary signatures for precisely this:

| Function | Signature | Call site in `RecapService` |
| -------- | --------- | ---------------------------- |
| `dailyBreakdown` | `daily.ts:107` | `buildDay:519` — **not passed** |
| `weeklySummary` | `weekly.ts:171` | `buildWeek:543` — **not passed** |
| `monthlySummary` | `monthly.ts:138` | `buildMonth:560` — **not passed** |
| `yearlySummary` | `yearly.ts:123` | `buildYear:576` — **not passed** |

Load the model once in `getReport`, hand it to both the period builder **and** `buildExtras`, and build `habitHeatmap` from `habitModel.days.map(d => ({ date: d.date, completed: d.completed, scheduled: d.scheduled, noRecord: d.noRecord }))`.

That single change:
- removes the `findLogsByUserRange` at `recap.service.ts:232` (**F36**),
- eliminates the fourth denominator (**F36**),
- gives `HabitHeatmapCard` the `noRecord` value it needs to stop F26's ambiguity.

### 27.4 The sibling divergence, outside `/recap`

`generateWeeklyRecap` (`server/recap/weekly.ts:29`–`:41`) is live via `review.service.ts:120` and `:136`, backs `/recap/weekly-review`, and still carries **two** of the retired defects:

```ts
const logs = await habitRepository.findLogsByRange(habit.id, userId, weekStart, weekEnd);  // N+1
const completed = logs.filter(l => l.status === 'COMPLETED').length;
return { ..., total: logs.length, rate: logs.length > 0 ? (completed / logs.length) * 100 : 0 };
//                                        ^^^^^^^^^^^^^^  includes SKIPPED and NOT_APPLICABLE
```

30 completed · 2 missed · 300 deliberately skipped reads as **9%** here and, correctly, as a high rate everywhere on `/recap`. Consolidating it onto `weeklySummary` closes **F20** and is the last item in this whole family.

### 27.5 Why this was missed

The original pass found the denominator problem by *comparing periods* — day vs week vs month vs year disagreed, so something was wrong. After the refactor all four periods agree, which reads as "resolved". It did not check the one figure on the page that is **not** derived from the period model at all. The same blind spot applies to the three denominators AGENTS.md already documents (`habitCompletionRate`, `getHabitHealth`, the contribution heatmap): this page now contains a **fifth** surface, and `hasData` (§25) contains a sixth definition of "did anything happen".

---

*End of `/recap` audit. 27 sections, 37 findings (26 open: 1 critical, 10 major, 15 minor; 9 resolved), 2 headline defects remaining (unreachable day empty state, unparameterised `shiftAnchor`), 21 models read, 16 repositories, 22 recap components, 0 writes. Documentation only: no source file was modified.*

*Re-verified 2026-10-03 against `recap.service.ts` (604 lines), `page.tsx` (648), `server/analytics/{daily,weekly,monthly,yearly}.ts`, `lib/analytics/period-habits.ts` and `server/analytics/period-habits.ts`. Nine findings retired, two added.*