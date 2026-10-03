# PAGE.md — `/dashboard`

**Single source of truth for the RoutineOS Dashboard page.**
Scope: this page only. Other pages appear only where the Dashboard links to them or shares a file with them.

> **Note on version control:** `.gitignore:12` contains the pattern `.md` — with no wildcard. In gitignore syntax that matches a file or directory named *exactly* `.md`, **not** `*.md`, so it is effectively a no-op. `AGENTS.md`, `ERROR.md` and `FILE.MD` are ignored because they are named explicitly on lines 63–65. `PAGE.md` is therefore **untracked but not ignored** — `git status` shows it as `??`, and it *will* be picked up by `git add .` like any other new file. Add an explicit `PAGE.md` line to `.gitignore` if you want it kept local.

---

## 1. Page identity

| Property | Value |
|---|---|
| Route | `/dashboard` |
| Route file | `src/app/(dashboard)/dashboard/page.tsx` |
| Component type | **Server component** (`async`, uses `auth()`) |
| Auth | NextAuth **JWT** strategy; `redirect('/login')` if no session |
| Layout parent | `src/app/(dashboard)/layout.tsx` — `min-h-screen flex bg-background text-foreground` |
| Content container | `.container.mx-auto.px-4.py-8.max-w-7xl.space-y-8` |
| Route-level loading | `src/app/(dashboard)/dashboard/loading.tsx` (see §14) |
| Page title / metadata | None exported. The `<h1>` is rendered in JSX. |

The server sends **no widget data**. It resolves only two things and hands them down:

```ts
const session = await auth();                      // page.tsx:32
if (!session?.user) redirect('/login');            // page.tsx:34-36
const userTimezone = (await new UserRepository()
  .getSettings(session.user.id))?.timezone || DEFAULT_TZ;   // page.tsx:49-50
const today = getTodayString(userTimezone);         // page.tsx:51
```

`DEFAULT_TZ = 'UTC'` (`src/lib/dates.ts:25`).
`getTodayString(tz)` takes a **required** timezone argument — `format(toZonedTime(new Date(), tz), 'yyyy-MM-dd')` (`src/lib/dates.ts:32-35`). There is deliberately no default, so a call site that forgets it fails to compile.

> **Known deviation:** `page.tsx:49` instantiates `UserRepository` directly, bypassing the service layer. `UserService.getTimezone` (`src/server/services/user.service.ts:71-74`) exists and is what every API route uses. It also pulls the entire ~40-column `UserSettings` row to read one field.

---

## 2. UI block diagram — full page

```
╔══════════════════════════════════════════════════════════════════════════════╗
║ ROOT  div.container.mx-auto.px-4.py-8.max-w-7xl.space-y-8      page.tsx:54  ║
║                                                                              ║
║ ┌──────────────────────────────────────────────────────────────────────────┐ ║
║ │ [0] HEADER BANNER                                       Mount delay=0     │ ║
║ │  relative flex flex-col md:flex-row md:items-center                      │ ║
║ │            md:justify-between gap-4 pb-6                  page.tsx:57    │ ║
║ │  ┌────────────────────────────────────────┐  ┌──────────────────────────┐ │ ║
║ │  │ h1.text-3xl.font-bold.tracking-tight   │  │ Link → /today           │ │ ║
║ │  │     .animated-gradient-text            │  │  "Go to Today" +ArrowRight│ │ ║
║ │  │     "Welcome back, {name || 'User'}"   │  │  .light-sweep.glow-neon   │ │ ║
║ │  │ p.text-muted-foreground.text-sm       │  │  hover:scale-[1.03]       │ │ ║
║ │  │     "Here is your daily productivity    │  │  active:scale-[0.97]      │ │ ║
║ │  │      overview and performance…"         │  └──────────────────────────┘ │ ║
║ │  └────────────────────────────────────────┘                              │ ║
║ │  · absolute hairline: inset-x-0 -bottom-px h-px                          │ ║
║ │    bg-gradient-to-r from-primary/60 via-primary/20 to-transparent        │ ║
║ └──────────────────────────────────────────────────────────────────────────┘ ║
║                                                                              ║
║ ┌──────────────────────────────────────────────────────────────────────────┐ ║
║ │ [1] QUOTE OF THE DAY                              Mount delay=0.08        │ ║
║ │     [WidgetGate "quotes"] → QuoteDisplay         page.tsx:80-84          │ ║
║ │     full width · 1/1 col · root: bg-card border rounded-xl p-5 mb-8      │ ║
║ └──────────────────────────────────────────────────────────────────────────┘ ║
║                                                                              ║
║ ┌──────────────────────────────────────────────────────────────────────────┐ ║
║ │ [2] FEATURE HUB                                      Mount delay=0.16      │ ║
║ │  h2 "Feature Hub" (.text-sm uppercase tracking-wider mb-3)  page.tsx:89  ║
║ │  grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-3     page.tsx:92    ║
║ │  ┌────┬────┬────┬────┬────┬────┬────┬────┐  8 × 1×1 · NO col/row-span   ║
║ │  │ 1  │ 2  │ 3  │ 4  │ 5  │ 6  │ 7  │ 8  │                           ║
║ │  └────┴────┴────┴────┴────┴────┴────┴────┘                           ║
║ │   each: Link.spotlight-hover.glass-panel.shadow-soft                      ║
║ │          flex flex-col items-center justify-center p-3 rounded-xl        ║
║ │          icon chip (p-2.5 rounded-lg + per-feature colour)               ║
║ │          span.text-xs.font-semibold.truncate  ← name ONLY              ║
║ └──────────────────────────────────────────────────────────────────────────┘ ║
║                                                                              ║
║ ┌──────────────────────────────────────────────────────────────────────────┐ ║
║ │ [3] DAY TYPE                                            Mount delay=0.24  │ ║
║ │     [WidgetGate "summary"] → TodayDayType          page.tsx:115-119      │ ║
║ │     full width · 1/1 col · GlassPanel.min-h-[12rem].p-5                   │ ║
║ └──────────────────────────────────────────────────────────────────────────┘ ║
║                                                                              ║
║ ┌──────────────────────────────────────────────────────────────────────────┐ ║
║ │ [4] METRICS & MOMENTUM                                 Mount delay=0.28    │ ║
║ │  h2 "Metrics & Momentum" (same style)                      page.tsx:123  ║
║ │  grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-6 items-start       │ ║
║                                                 page.tsx:126              ║
║ │   ┌───────────┬───────────┬───────────┬───────────┐                      ║
║ │   │ ④-a SCORE │ ④-b STREAK│ ④-c GOALS │ ④-d SLEEP │  4 × 1×1            ║
║ │   │           │           │           │           │  NO col/row-span   ║
║ │   │ Gate      │ Gate      │ Gate      │ Gate      │  NO h-full on the  ║
║ │   │ "score"   │ "streaks" │ "goals"   │ "wellness"│  cards themselves  ║
║ │   │ Mount .26 │ Mount .30 │ Mount .34 │ Mount .38 │                      ║
║ │   │ CoreScore │ Streak    │ Goals     │ Sleep     │                      ║
║ │   │ Widget    │ Widget    │ Widget    │ Widget    │                      ║
║ │   └───────────┴───────────┴───────────┴───────────┘                      ║
║ └──────────────────────────────────────────────────────────────────────────┘ ║
║                                                                              ║
║ ┌──────────────────────────────────────────────────────────────────────────┐ ║
║ │ [5] MAIN GRID  grid grid-cols-1 lg:grid-cols-3 gap-6 items-start        │ ║
║ │                                  ▲ NO sm:  NO md:  ← known gap §12       │ ║
║ │                                                                          │ ║
║ │  LEFT  lg:col-span-2 space-y-6 min-w-0 min-h-0   page.tsx:138            │ ║
║ │  ┌────────────────────────────────────────────────────────────────────┐  │ ║
║ │  │ ⑤-a ROUTINE PROGRESS              Mount .42  Gate "routine"       │  │ ║
║ │  │ ⑤-b ACTIVITY OVERVIEW (heatmap)   Mount .48  Gate "habits"        │  │ ║
║ │  │ ⑤-c LAST 7 DAYS (bar chart)       Mount .54  Gate "tasks"         │  │ ║
║ │  │ ⑤-d HABIT HEALTH                  Mount .60  ◀ NO GATE            │  │ ║
║ │  └────────────────────────────────────────────────────────────────────┘  │ ║
║ │                                                                          │ ║
║ │  RIGHT  space-y-6  (implicit lg:col-span-1)              page.tsx:153     │ ║
║ │  ┌────────────────────────────────────────────────────────────────────┐  │ ║
║ │  │ ⑤-e AI INSIGHTS                    Mount .44  Gate "insights"     │  │ ║
║ │  │        ◀ the ONLY widget in this column; default OFF              │  │ ║
║ │  └────────────────────────────────────────────────────────────────────┘  │ ║
║ └──────────────────────────────────────────────────────────────────────────┘ ║
╚══════════════════════════════════════════════════════════════════════════════╝
```

### 2.1 Column-span / row-span ledger

| Region | Breakpoints present | Spans | Height control |
|---|---|---|---|
Root `:54` | none (`container` = 100%) + `max-w-7xl` | — | — |
Header `:57` | base, `md` | — | — |
Feature Hub `:92` | base, `sm`, `lg` | none (1×1 × 8) | — |
Day Type `:117` | n/a — full width | — | `min-h-[12rem]` |
Metrics `:126` | base, `md`, `xl` | none (1×1 × 4) | `items-start`, no `h-full` |
Main grid `:136` | base, `lg` | left `lg:col-span-2`, right implicit 1 | `items-start` |
Habit list (inside ⑤-a/⑤-d) | — | — | `slim-scroll … max-h-[184px]` |
Heatmap cells | base, `md` (expanded only) | — | `w-3 h-3` → `md:w-5 md:h-5` |
Week view (inside ⑤-a) | — | — | `min-w-[420px]` inside `overflow-x-auto` |

### 2.2 Breakpoint table

| Region | base | `sm` 640 | `md` 768 | `lg` 1024 | `xl` 1280 |
|---|---|---|---|---|---|
| Header banner | 1-col | — | ✅ 2-col | — | — |
| Feature Hub | 2 | ✅ 4 | — | ✅ 8 | — |
| Metrics row | 1 | — | ✅ 2 | — | ✅ 4 |
| **Main grid** | 1 | **MISSING** | **MISSING** | ✅ 3 | — |
| Layout `<main>` | `pb-20` | — | `md:pb-8` | — | — |
| Heatmap (expanded) | `w-3` | — | ✅ `w-5` | — | — |
| Heatmap "Last 365 days" | hidden | ✅ inline | — | — | — |
| Routine YearView | 3 | ✅ 4 | — | — | — |
| Weekly chart bars | `gap-2` | ✅ `gap-3` | — | — | — |
| PeriodControl | centered | ✅ start | — | — | — |

`globals.css` overrides only `--shadow-*`, `--font-*`, `--ease-out-expo` (`:6-15`); it does **not** override `--breakpoint-*`, so the Tailwind v4 defaults apply.

**iPad portrait (768–1023px) therefore renders the entire main grid as one column**, and the AI Insights card drops below the whole left column.

### 2.3 Background

The page sets **no** background class. It inherits `bg-background` from the dashboard layout plus `body { background: var(--background) }` (`globals.css:61-67`).

- `--background`: `#ffffff` (light) / `#09090b` (dark) — `globals.css:33,48`
- Cards: `bg-card border border-border` — `--card` `#ffffff` / `#101014`
- `.glass-panel` (`globals.css:415-424`) = `color-mix(--card 58%, transparent)` + `backdrop-blur(18px)` — **used only by the 8 Feature Hub tiles**
- `gradient-mesh-animated` is **not** used here (it exists on `/today` and the auth layout). `noise-overlay` is used nowhere in `src/app`.

> **A `backdrop-filter` other than `none` creates a containing block for `position: fixed` descendants.** `GlassPanel` on `/today` has this property, which is why its dialogs must be portalled. Any `position: fixed` overlay added inside a glass surface on this page will be clipped by it.

### 2.4 Animation

Every region is wrapped in `Mount` (`src/components/motion/Mount.tsx`): fade-in + 12px rise, 0.45s, `cubic-bezier(0.16,1,0.3,1)`. Delays cascade 0 → 0.60.

> **The delays are out of order.** The Metrics parent is `Mount(0.28)` but its first two children are `0.26` and `0.30`, so the score card animates in *before* the container meant to be assembling it, and the right column (`0.44`) precedes its left-column siblings (`0.42, 0.48…`).

> **`Mount` wraps `WidgetGate` in all 9 gated positions.** `WidgetGate` returns `null` until its effect runs, so (a) the server HTML for every gated widget is an **empty `<div>`** and the whole page is blank without JS, and (b) because the grid items *are* those `Mount` divs, hiding a widget leaves an **empty cell** rather than reflowing the grid.

---

## 3. Component hierarchy

```
DashboardPage (server, async)
├── auth() → redirect('/login')
├── UserRepository.getSettings() → userTimezone
├── getTodayString(userTimezone) → today
│
├── Mount(0)
│   └── header ── h1, p, Link→/today
│
├── Mount(0.08)
│   └── WidgetGate("quotes") ─────────► QuoteDisplay
│                                        └── useEffect → GET /api/quotes/random
│
├── Mount(0.16)
│   └── section "Feature Hub" ── 8 × Link (no data)
│
├── Mount(0.24)
│   └── WidgetGate("summary") ────────► TodayDayType        ⚠ SHARED WITH /today
│       props: { date: today }        └── GET /api/day-mode?date=
│                                        └── GET /api/day-types?active=true
│                                        └── POST /api/day-mode  (write)
│
├── Mount(0.28)
│   └── section "Metrics & Momentum"
│       ├── Mount(0.26) ▸ WidgetGate("score")   ▸ CoreScoreWidget   ─┐
│       ├── Mount(0.30) ▸ WidgetGate("streaks") ▸ StreakWidget      ─┤ each fetches
│       ├── Mount(0.34) ▸ WidgetGate("goals")   ▸ GoalsWidget       ─┤ its own data
│       └── Mount(0.38) ▸ WidgetGate("wellness")▸ SleepWidget      ─┘
│
└── div.grid.lg:grid-cols-3
    ├── LEFT (lg:col-span-2, space-y-6)
    │   ├── Mount(0.42) ▸ WidgetGate("routine") ▸ RoutineWidget
    │   │       useApp(), useUserTimezone(), PeriodControl
    │   │       GET /api/routine/progress?period&date
    │   │       POST /api/routine/today                        (write)
    │   │       shiftAnchor(date, period, delta, timezone)
    │   ├── Mount(0.48) ▸ WidgetGate("habits") ▸ ContributionHeatmap
    │   │       GET /api/scores/daily?startDate&endDate
    │   ├── Mount(0.54) ▸ WidgetGate("tasks") ▸ WeeklyBarChart
    │   │       GET /api/scores/daily?startDate&endDate
    │   └── Mount(0.60) ▸ HabitHealthWidget            ◀ NO GATE
    │           useApp(), useUserTimezone()
    │           GET /api/habits/health?days=28
    │
    └── RIGHT (space-y-6)
        └── Mount(0.44) ▸ WidgetGate("insights") ▸ InsightWidget
                GET  /api/insights/latest?period=WEEKLY
                POST /api/insights/generate                  (write)

AppContext (mounted in src/app/layout.tsx:38, not by this page)
└── provides to GoalsWidget, RoutineWidget, HabitHealthWidget, SleepWidget:
    habits, goals, selectedDate, getLogForDate(), logHabit(),
    updateGoal(), updateGoalProgress(), getStreakData()
AuthProvider / useSettingsLoader (root layout)
└── GET /api/settings once per session → useSettingsStore (zustand)
    read by SleepWidget (minSleepDuration)
WidgetGate ── reads localStorage['routineos.dashboard.widgets']
```

---

## 4. Data-flow diagram

```
                            ┌──────────────────────────────────┐
                            │  Postgres  (Neon, DATABASE_URL)  │
                            └──────────────────────────────────┘
                                     ▲
     ┌───────────────────────────────┼───────────────────────────────┐
     │ repositories                  │ services                      │
     │  BaseRepository.handleError    │  ALL business logic lives    │
     │  logs + rethrows               │  here. Timezone resolution,  │
     │  BaseRepository.buildPagination│  aggregation, score math,    │
     │  caps `take` at 100           │  streak rules, eligibility.  │
     │  BaseRepository.buildOrderQuery│                               │
     └───────────────────────────────┼───────────────────────────────┘
                                     ▲
                     ┌───────────────┴───────────────┐
                     │  API routes (thin)            │
                     │  auth() → session.user.id     │  ← userId NEVER
                     │  Zod validate input           │    from the client
                     │  delegate to service          │
                     │  { success, data } |          │
                     │  { error, details? }           │
                     └───────────────┬───────────────┘
                                     ▲
        ┌────────────────────────────┼──────────────────────────────┐
        │                            │                              │
   server component            client widgets                  background jobs
   page.tsx: today,        each `'use client'`, own          api/cron/* (Bearer
   userTimezone            useState + useEffect fetch        CRON_SECRET)
        │                            │                              │
        └──────────► HTML (empty Mount divs) ◄──────────────────────┘
                             │
                    user interaction → local state + re-fetch
                             │
                    data representation (see §5)
```

### 4.1 Where userId comes from — and never from the client

Every dashboard route resolves the owner from the session. Verified, no exceptions:

| Route | Line |
|---|---|
`api/score/[date]` | `route.ts:14-17` |
`api/streak` | `route.ts:13-16` |
`api/goals/today` | `route.ts:17-20` |
`api/goals` | `route.ts` via `auth()` |
`api/sleep` | `route.ts:31-34` |
`api/scores/daily` | `route.ts:19-22` |
`api/habits/health` | `route.ts:19-21` |
`api/routine/progress` | `route.ts:19-22` |
`api/insights/latest` | `route.ts:9-12` |
`api/quotes/random` | `route.ts:22-25` |

Ownership is also enforced in the repository for writes: `GoalRepository.findById(id, userId)`, `RoutineRepository.findBlockById(blockId, userId)` (`routine.repository.ts:608-626`), `HabitRepository.findById(habitId, userId)`.

### 4.2 Endpoint → service → repository → model

| Widget | Endpoint | Service | Repository | Prisma models |
|---|---|---|---|---|
Quote | `GET /api/quotes/random` | `QuoteService.getRandomQuote` | `QuoteRepository.findPool` — **the only `select` projection on this page** (`{id,text,author}`) | `Quote` |
Day Type | `GET /api/day-mode?date=` | `DayModeService.getDayMode` | `RoutineRepository.findException`, `ScoreRepository.findByDate`, `resolveDayTypeForDate` | `RoutineException`, `DailyScore`, `DayTypeDefinition` |
Score | `GET /api/score/[date]` | `ScoringService.recalculateDate` → `calculateDailyScore` | `ScoreRepository.findByDate` / `upsertScore` | `DailyScore`, `Habit`, `HabitLog`, `RoutineLog`, `UserSettings` |
Streak | `GET /api/streak` | `AchievementService.getStreakWithMilestones` | `StreakRepository.findByUserId` / `create` / `getUncelebratedMilestones` | `Streak`, `StreakMilestone` |
Goals | `GET /api/goals` (AppContext) | `GoalService.listGoals` (pass-through) | `GoalRepository.findAll` — `include` project, tags, dayTypes, milestones, `_count` | `Goal` |
Goals | `GET /api/goals/today` | `GoalService.getVisibleGoalsForDate` + `getProgressLogsForDate` | `GoalRepository.findActiveInDateWindow` / `findActiveByDayTypeId` / `findProgressLogsByDate` | `Goal`, `GoalProgress`, `RoutineException` |
Sleep | `GET /api/sleep?date=&limit=1` | `SleepService.listLogs` | `SleepRepository.findByDate` — whole row, no `select` | `SleepLog` |
Routine | `GET /api/routine/progress` | `RoutineService.getRoutineProgress` — **3 parallel reads** | `findAllTemplates` / `findExceptionsByRange` / `findLogsByRange` | `RoutineTemplate`, `RoutineBlock`, `RoutineException`, `RoutineLog` |
Routine | `POST /api/routine/today` | `RoutineService.logBlockStatus` — **ends at the upsert** | `RoutineRepository.upsertLog` | `RoutineLog` |
Heatmap + chart | `GET /api/scores/daily` | `ScoringService.getDailyScoreRange` (pass-through) | `ScoreRepository.findByRange` — whole rows, no `select` | `DailyScore` |
Habit Health | `GET /api/habits/health?days=28` | `HabitService.getHabitHealth` — 2 parallel reads | `HabitRepository.findAll` / `findLogsByUserRange` | `Habit`, `HabitLog` |
Insights | `GET /api/insights/latest` | `InsightReadService.getLatestInsight` | `InsightRepository.findLatest` — **whole row incl. `dataSnapshot`** | `AIInsight` |
Insights | `POST /api/insights/generate` | `InsightGenerationService.generate` | `InsightRepository.create` | `AIInsight` |

`InsightRepository` does **not** extend `BaseRepository`; it imports the `prisma` singleton directly (`insight.repository.ts:1`).

---

## 5. Data representation

How each dataset is shaped on the wire and on screen. This is the section to read before changing a field name.

### 5.1 Envelope

Every route uses one of two shapes:

```ts
{ success: true, data: <payload>, meta?: {...} }   // 200 / 201
{ error: string, details?: unknown }               // 400 / 401 / 500
```

**The one exception:** `POST /api/insights/generate` returns `cached` and `cost` as **top-level siblings of `data`**, not inside it (`insights/generate/route.ts:43-48`).

`GET /api/quotes/random` **cannot fail** — its `catch` swallows everything and returns `200 { success: true, data: FALLBACK_QUOTE }` (`route.ts:45-49`).

### 5.2 Two client helpers, not interchangeable

| Helper | Behaviour |
|---|---|
`apiRequest<T>(path)` (`src/lib/api-client.ts:60-114`) | Fetches, checks `res.ok`, **unwraps the envelope**, resolves with `data` as `T` |
`fetchWithAuth(path, init)` | Checks `res.ok`, throws on failure, **returns the raw `Response`** |

> A previous bug: the command palette typed its result as `{ data?: Habit[] }` *and* read `.data` through `apiRequest`, which had already unwrapped it — so both lists resolved to `undefined ?? []` and the features silently rendered nothing. There is no type error for this; the shape must be checked by hand.

### 5.3 Field-by-field: what is sent, what is shown, what is dropped

| Widget | Sent by the API | Rendered | Discarded |
|---|---|---|---|
Quote | `{id, text, author}` | all 3 | — |
Day Type | `date, dayType, dayTypeId, dayTypeName, naturalDayType, templateId, hasException, exception{id,dayType,dayTypeId,dayTypeName,templateId,reason}, isMinimumDay, isRestDay, minimumDayTemplateId` | `dayTypeName`, `dayTypeId`, `dayType`, `hasException` | `naturalDayType`, `templateId`, `isMinimumDay`, `isRestDay`, `minimumDayTemplateId`, and **all of `exception` including the user's own `reason`** |
Score | every `DailyScore` column + `context` + `breakdown` | `totalScore, coreScore, growthScore, bonusScore, habitCompletionRate, routineCompletionRate, sleepScore, overallGrade` (8) | `id, userId, date, isMinimumDay, minimumDayTemplateId, minimumDayReason, isRestDay, restDayReason, contextTags, calculationData, createdAt, updatedAt`, all of `context`, and **all of `breakdown`** — i.e. `core/growth/bonus.{score,maxScore,percentage,habits[]}` where each habit entry is `{habitId, habitName, tier, status, points, weight, contribution}` |
Streak | whole `Streak` row + `uncelebratedMilestones[]` | `currentStreak`, `longestStreak`, `lastCompletedDate` | `id, userId, coreStreak, growthStreak, minimumDayStreak, streakStartDate, totalCompletedDays, totalMinimumDays, totalRestDays, updatedAt`, and all of `uncelebratedMilestones` |
Goals (`/api/goals`) | 13 goal fields + `include`d project/tags/dayTypes/milestones/`_count` | `id, type, status, title, priority, targetValue, currentValue, unit, endDate, carriedOverFrom` | `description`, `startDate`, and every `include`d relation |
Goals (`/api/goals/today`) | 13 goal fields + `meta{date,dayType,dayTypeId,dayTypeSource,total}` | `id`, `loggedToday` — **2 of 18** | `title, description, type, priority, status, currentValue, targetValue, unit, startDate, endDate, appliesEveryDay` and all of `meta` |
Sleep | whole `SleepLog` row | `actualDurationMinutes, actualBedtime, actualWakeTime, quality, feltRested` | `id, userId, date, targetBedtime, targetWakeTime, availableWindowMinutes, deficitMinutes, wakeUpCount, moodOnWaking, energyOnWaking, notes, createdAt, updatedAt` |
Routine | `period, anchorDate, startDate, endDate, label, days[], months[]` | `label`, `days[].{scheduled,total,completed,completionRate,blocks[].{blockId,title,startTime,endTime,status}}`, `months[].{month,scheduledDays,averageCompletionRate}` | `period`, `anchorDate`, `startDate`, `endDate`, `days[].date` (React key only), and **`days[].dayType`** — resolved server-side with the full exception/template resolver and surfaced nowhere |
Heatmap | 366 whole `DailyScore` rows | `date`, `totalScore` | **18 columns per row**, incl. `overallGrade`, `isRestDay`, `isMinimumDay`, `calculationData` |
Chart | 7 whole `DailyScore` rows | `date, totalScore, coreScore, growthScore, bonusScore` (5/5) | same 18 minus one |
Habit Health | `window{startDate,endDate,days}`, `summary{6}`, `habits[]{13}` | `habits[].{habitId, completionRate, health}`, `summary.{totalActive, healthyCount, atRiskCount, unhealthyCount, overallCompletionRate}`, `window.days` | `summary.withDataCount`, `window.startDate`, `window.endDate`, and per habit `status, color, icon, currentStreak, longestStreak, completedCount, missedCount, skippedCount, dueCount`. The health row's own `name`/`tier` are fetched but the UI renders the `useApp()` copies instead. |
Insights | whole `AIInsight` row | `id, summary, wins, suggestions, generatedAt` | **`patterns`, `concerns`, `nextPeriodFocus`, `predictions`**, `dataSnapshot` (the raw AI prompt payload, `@db.Text`, up to 50 KB), `model`, `promptVersion`, `tokensUsed`, `wasHelpful`, `userRating`, `userFeedback`, `startDate`, `endDate`, `userId`, `period` |

> **Payload cost worth knowing before you redesign:** the heatmap fetches **366 whole `DailyScore` rows including the `calculationData` JSON blob** and uses two fields from each. The insights endpoint ships the entire AI prompt payload to the browser and uses none of it.

### 5.4 Numeric representation

| Quantity | Sent as | Rendered as | Notes |
|---|---|---|---|
`totalScore` | `number \| null`, 0–100, 2dp | `Math.round(x)` | `null` when unscored |
`coreScore` / `growthScore` / `bonusScore` | bucket **percentages**, 1dp | rounded int | `null` bucket persists as **`0`**, not null |
`habitCompletionRate` / `routineCompletionRate` | integer 0–100 | `%` | see §6.1 — the denominators differ from intuition |
`sleepScore` | `number \| null` | clamped to 0 | **never written by any code path — always `null`** |
`overallGrade` | `'A+'\|'A'\|'B'\|'C'\|'D'\|'F' \| null` | `{grade}` string | see §6.2 |
routine `completionRate` | integer 0–100 per day | `%` | day-level |
routine `averageCompletionRate` | integer per month | `%` | **month-weighted mean of daily percentages** |
habit `completionRate` | integer \| **null** | `%` or health label | `null` = no data in window |
`overallCompletionRate` (health) | integer \| **null** | `%` | **unweighted mean of per-habit rates** |
heatmap `level` | derived client-side `0–4` | background shade | `null→0, ≥90→4, ≥75→3, ≥50→2, ≥25→1` |
goal `%` | **not sent** | `Math.min(100, cur/target*100)` | client-only |
goal `daysLeft` | **not sent** | `getDaysRemaining(endDate, tz)` | client-only |
sleep score | **not sent** | `min(100, minutes/target*100)` | client-only, never persisted |

All percentage displays use `Math.round`. Progress bars are driven by a `style={{ width: 'N%' }}`; the animated count-ups use `useCountUp` (`src/components/motion/useCountUp.tsx`).

### 5.5 Time and date representation

| Concept | Storage | Transport | Notes |
|---|---|---|---|
Calendar day | `String` `"YYYY-MM-DD"` | string | Habit logs, routine logs, routine exceptions, `DailyScore.date`, `Streak.streakStartDate`, `Streak.lastCompletedDate` |
Day of a sleep log | `String` `"YYYY-MM-DD"` | string | **"the day you woke up"** — `schema.prisma:1299` |
Goal window | `DateTime` | **ISO datetime** | `/api/goals/today` returns `startDate`/`endDate` as full timestamps, not calendar labels |
`Habit.startDate` / `endDate` | `DateTime` | ISO | |
`generatedAt`, `createdAt`, `updatedAt` | `DateTime` | ISO | |

> **Three different representations for the same idea** (calendar string, UTC DateTime, ISO datetime) coexist in these payloads. `getDaysRemaining` parses a `Goal.endDate` **datetime** and compares it against `getTodayString(tz)`, which is **UTC midnight** — an off-by-one is possible and is documented as such.

> **`InsightWidget` renders `new Date(insight.generatedAt).toLocaleDateString()`** — the browser's locale and zone, ignoring `UserSettings.timezone`. A user east of UTC can see a "Generated" date that is tomorrow relative to their own day.

---

## 6. Every calculation

### 6.1 Daily score — `ScoringService.calculateDailyScore`

Entry: `src/server/services/scoring.service.ts:80-198`. It **upserts** a `DailyScore` row; it is a write.

**Inputs.** Active habits, that date's habit logs, that date's routine logs, and the per-user weights.

**Weights** (`scoring.service.ts:95-101`):

```
weights = { ...DEFAULT_TIER_WEIGHTS,
            weightNonNeg: settings?.weightNonNeg ?? DEFAULT.weightNonNeg,
            weightGrowth:  settings?.weightGrowth  ?? DEFAULT.weightGrowth,
            weightBonus:   settings?.weightBonus   ?? DEFAULT.weightBonus }
```

| Bucket | Tier | Weight actually used |
|---|---|---|
CORE | `NON_NEGOTIABLE` | `settings.weightNonNeg` — schema default **1.0** |
CORE | `GROWTH` | `settings.weightGrowth` — schema default **0.5** |
GROWTH | `LIFESTYLE` | 0.6 (config) |
GROWTH | `FLEXIBLE` | 0.7 (config) |
BONUS | `BONUS` | `settings.weightBonus` — schema default **0.25** |
BONUS | `OPTIONAL` / `EXPERIMENTAL` / `SPECIAL` / `JUST_FOR_FUN` / `UNDEFINED` / `ALTERNATIVE` | 0.25 / 0.1 / 0.5 / 0.2 / **0.0** / 1.0 |

> **Trap:** the config file declares `1.5 / 1.0 / 0.5` (`src/config/scoring.ts:23-35`) and `DEFAULT_TIER_WEIGHTS` mirrors that, but the `UserSettings` **column defaults are `1.0 / 0.5 / 0.25`** (`schema.prisma:612-614`). Because the columns are non-nullable, the `??` fallbacks only fire when the settings row does not exist — so a real user gets **1.0 / 0.5 / 0.25**, not the config values.

**Per-bucket math** (`buildBucket`, `:330-393`):

```
for each habit in bucket:
    points = habit.points ?? POINTS_SYSTEM.habitCompletion[habit.tier]  // NON_NEGOTIABLE 15, GROWTH 10, BONUS 5, …
    weight = weightForTier(habit.tier, weights)
    maxScore += points * weight                       // every habit counts toward the ceiling
    COMPLETED           → score += points * weight
    PARTIAL             → score += points * weight * 0.7
    MISSED/SKIPPED/N-A  → nothing, but still in maxScore

percentage = round(score / maxScore * 1000) / 10      // 1 decimal
```

**Day total** — `computeDayScore` (`src/server/domain/scoring/score-calculator.ts:201-227`):

```
buckets = { nonNeg: core%, growth: growth%, bonus: bonus%, core: null }   // core:null is deliberate
present = buckets with a non-null value
total   = Σ(value × bucketWeight) / Σ(bucketWeight)     // weighted mean of the present buckets
total   = total × (0.7 + 0.2 + 0.1)                     // = total × 1.0
if isRestDay    → total = 0                             // applied FIRST
if isMinimumDay → total = total × 0.5                   // applied SECOND
totalScore = clamp(round2(total), 0, 100)
band       = getScoreBand(totalScore)
```

> **The documented 70 / 20 / 10 habits/routine/sleep split is not implemented.** Routine and sleep are never supplied as separate bucket inputs, so `total === habitsPortion`. `SCORING_WEIGHTS.components` exists (`config/scoring.ts:38-42`) but is only ever summed to `1.0`.

> **Order matters:** rest-day is applied before the minimum-day multiplier, so a day flagged both scores `0 × 0.5 = 0`.

**Persisted** (`:160-183`):

```
coreScore / growthScore / bonusScore = bucket percentage ?? 0     // null bucket → 0
totalScore   = result.totalScore
overallGrade = result.band.grade
habitCompletionRate = scoredHabits.length > 0
    ? round(completedCount / scoredHabits.length * 100) : 0
routineCompletionRate = routineLogs.length > 0
    ? round(routineCompletedCount / routineLogs.length * 100) : 0
calculationData = JSON.stringify({ timestamp, breakdown, habitCount, completedCount, weights })
```

**Known defects in the two completion rates:**

- `habitCompletionRate` — denominator is **every ACTIVE habit**; numerator is **COMPLETED log rows for that date**. `PARTIAL` does not count. A log for a habit that is no longer ACTIVE can push the value **above 100**.
- `routineCompletionRate` — denominator is **all `RoutineLog` rows that day, any status**, i.e. "of blocks that have a log", *not* "of scheduled blocks". A day with no routine logs gives `0`, not "n/a". `PARTIAL` counts 0 here, though it counts 70% in the bucket math.
- `sleepScore` is a schema column that **no code path ever writes**. It is always `null`, and the Score widget renders `clamp100(sleepScore ?? 0)`, so the Sleep axis is structurally always 0.

### 6.2 Grade bands

`getScoreBand` (`src/config/scoring.ts:213-220`), first match wins:

| Threshold | `grade` | label | colour |
|---|---|---|---|
`≥ 95` | `A+` | Perfect | `#10b981` |
`≥ 85` | `A` | Excellent | `#22c55e` |
`≥ 70` | `B` | Good | `#84cc16` |
`≥ 50` | `C` | Fair | `#eab308` |
`≥ 30` | `D` | Poor | `#f97316` |
else | `F` | Incomplete | `#ef4444` |

The decorative `max` values (94, 84, 69, 49, 29) are **never read** — only `min` is. A 94.5 correctly falls into the `≥ 85` band.

**Three parallel grade implementations exist.** Only this one drives `DailyScore.overallGrade`:

| Implementation | Used by |
|---|---|
`config/scoring.ts` `SCORE_BANDS` + `getScoreBand` | **the scoring path** — what the Score widget shows |
`types/score.ts` `getGradeFromPercentage` | `ScoringService.withBreakdown` **fallback**, only when `calculationData` is null/unparseable |
`lib/scoring/bands.ts` | only `components/sleep/*` — different letters (`S A B C D F`), different labels, Tailwind classes not hex |

### 6.3 Streaks

**The single shared predicate** — `isStreakActiveDay` (`src/server/domain/streak/streak-calculator.ts:48-50`):

```ts
return score.isMinimumDay === true || (score.coreScore !== null && score.coreScore > 0);
```

A minimum day always counts. Otherwise a **strictly positive** `coreScore` counts. `null` (never scored) and numeric `0` both do **not** count.

**Two write paths, not equivalent:**

1. **Incremental** — `calculateStreak` (`src/lib/streaks/calculate-streak.ts:27-132`), called **only** from `HabitService.logHabit`, and only when the log is `COMPLETED` and a `Streak` row already exists.
   - Rest day → returns immediately, **no change and no `totalRestDays` increment**
   - Minimum day → `addMinimumDay`: `+1` to `currentStreak`, `minimumDayStreak`, `totalMinimumDays`, `totalCompletedDays`; sets `lastCompletedDate`; **does not touch `longestStreak`**
   - Active day **with a yesterday row** → `incrementCurrentStreak`, then `longestStreak` rises only if `currentStreak > longestStreak`
   - Active day **without a yesterday row** → `currentStreak = 1`, `streakStartDate = date`
   - Otherwise, if `currentStreak > 0` → reset to `0`
   - Milestones fire on **exact equality** with `THRESHOLDS.streakMilestones = [7,14,21,30,60,90,100,180,365]`. A jump from 6 to 8 records nothing.

2. **Authoritative rebuild** — `StreakRecomputeService.recompute` (`src/server/services/streak-recompute.service.ts:60-114`). The **only** caller is the nightly cron (`scripts/compute-daily-scores.ts:156`), with `asOfDate = yesterday`.
   - Scans **730 days** of `DailyScore`, rebuilds `currentStreak`, `longestStreak`, `totalCompletedDays`, `lastCompletedDate`, `streakStartDate` from scratch
   - `currentRunLength` is anchored at `end`, or **`end − 1` day if that is active** — so an unlogged morning does not zero the streak
   - `longestStreak` only ever moves **up** unless `repair: true` is passed (the cron does not)
   - Uses host-local `format(new Date())` for `end`, **not** the user's timezone

**Fields never written anywhere:**

| Field | Status |
|---|---|
`coreStreak` | **NEVER WRITTEN — always 0.** Only reads exist |
`growthStreak` | **NEVER WRITTEN — always 0** |
`totalRestDays` | Written by `addRestDay`, which has **no caller** |
`Habit.streakCount` / `Habit.longestStreak` / `Habit.completionRate` | `HabitRepository.updateStreak` has **no caller** |

> Consequence: the flame and streak number on individual habits in `HabitHealthWidget` are **always 0**.

**Rest-day divergence.** Three places assert rest days preserve streaks (`CALCULATION_RULES.restDay.countInStreak`, `STREAK_RULES.REST_DAY_PRESERVES`, `restDayPreservesStreak()`), but only `calculateCurrentStreak`/`calculateLongestStreak` in the domain honour a `restDates` set, and that is used only by `analytics/streaks.ts`. The incremental path short-circuits on rest days; the rebuild ignores them entirely.

### 6.4 Habit health

`HabitService.getHabitHealth` (`src/server/services/habit.service.ts:482-560`). Window is **inclusive** `days` ending on the user's today.

```
completedCount = logs with status COMPLETED
missedCount    = logs with status MISSED
skippedCount   = logs with status SKIPPED
dueCount       = completed + missed + skipped          ← PARTIAL and NOT_APPLICABLE excluded
completionRate = dueCount > 0 ? round(completed/dueCount*100) : null

health = completionRate === null ? 'NO_DATA'
       : completionRate >= 75    ? 'HEALTHY'
       : completionRate >= 40    ? 'AT_RISK'
       :                        'UNHEALTHY'
```

Summary: `totalActive`, `withDataCount`, `healthyCount`, `atRiskCount`, `unhealthyCount`, and
`overallCompletionRate = rated.length > 0 ? round(Σ per-habit rate / rated.length) : null`.

- Thresholds **75 / 40** are hard-coded inline at `habit.service.ts:518`. `THRESHOLDS.completionRate` (90/75/50) in `config/scoring.ts` is **unused**.
- A habit logged only as `PARTIAL` has `dueCount = 0` → `completionRate: null` → `NO_DATA`.
- `overallCompletionRate` is an **unweighted mean of per-habit rates**, not `Σcompleted / Σdue`. One habit at 10/10 and one at 0/1 both average 50%.
- `PARTIAL` counts **70%** in the score bucket but **0** here. The two surfaces disagree by design.

### 6.5 Routine progress

`RoutineService.getRoutineProgress` (`src/server/services/routine.service.ts:140-268`) — 3 parallel reads, day types resolved in memory.

Per day:
```
no template for the resolved day type → { scheduled:false, total:0, completed:0, completionRate:0, blocks:[] }
total          = template.blocks.length          ← every block, regardless of trackCompletion
completed      = blocks whose log status is COMPLETED
completionRate = blocks.length > 0 ? round(completed/blocks.length*100) : 0
scheduled      = blocks.length > 0
```

Per month (**only** when `period === 'year'`):
```
scheduledDays          = days in the month with scheduled === true
averageCompletionRate  = scheduled.length > 0
    ? round(Σ day.completionRate over scheduled / scheduled.length) : 0
```
Unscheduled days are excluded, and each **day** is weighted equally regardless of how many blocks it had.

**Widget aggregation differs from the server:**
- `period !== 'year'` → `rate = round(Σ done / Σ total * 100)` — **block-weighted**
- `period === 'year'` → mean of the months' `averageCompletionRate` — **month-weighted**

> `GET /api/routine/today` uses a third denominator: `completedBlocks` counts **log rows**, not template blocks (`routine.service.ts:131`), so a log for a block no longer in the template inflates it.

### 6.6 Goals

- **%** is **not** computed server-side. Client: `targetValue > 0 ? Math.min(100, currentValue/targetValue*100) : 0`.
- **daysLeft** = `getDaysRemaining(endDate, tz)` = `max(0, ceil((parseISO(endDate) − parseISO(getTodayString(tz)))/86 400 000))` (`lib/dates.ts:110-115`). `GoalService.getGoalAnalytics` uses a stricter, different definition (`goal.service.ts:385-387`).
- **`loggedToday`** = the `value` of the **most recent** `GoalProgress` for that goal inside a **UTC** day window, else `null`. Written by `POST /api/goals/[id]/checkin` as `1` or `0`.
- **`carriedOverFrom`** — set by `GoalService.carryOverGoal`, which flips the original to `CARRIED_OVER` and creates a new goal pointing at it. The widget shows a "Carried Over" badge iff truthy and treats `CARRIED_OVER` as active.

### 6.7 Heatmap levels

`getLevel(totalScore)` — `null → 0`, `≥90 → 4`, `≥75 → 3`, `≥50 → 2`, `≥25 → 1`, else `0`. Rendered as five shades: `bg-muted`, `emerald-500/25`, `/45`, `/70`, `/100`.

### 6.8 Chart auto-scale

`maxScore = Math.max(...days.map(d => d.score?.totalScore ?? 0), 1)` — the floor of 1 avoids division by zero when every column is empty. Bar heights are `score / maxScore × 192px` (the `h-48` track).

---

## 7. Section reference — every element

### 7.1 Header banner
**Purpose:** orientation + one primary action.
**Elements:** `h1` "Welcome back, {name || 'User'}" with `.animated-gradient-text`; subtitle; a 1px gradient hairline; a `Link → /today` "Go to Today" with `ArrowRight`, `light-sweep glow-neon`, `hover:scale-[1.03] active:scale-[0.97]`.
**Data:** `session.user.name` (server) only. No fetch.
**Falls back:** `'User'` when the name is empty.

### 7.2 Quote of the day
**Purpose:** decorative.
**Elements:** text in `text-base italic`; `— {author}`; a `RefreshCw` button with `aria-label="Show another quote"`; `aria-live="polite"` on the text block.
**Data:** `GET /api/quotes/random` → `{id, text, author}` (`author` is `String?`).
**Representation:** persisted in `localStorage['routineos-quote-state']`; scope in `routineos-quote-scope`. Rotates every **10 minutes** (`ROTATE_MS`). Refresh sends `exclude` (current id) and `scope`.
**Selection:** non-cryptographic `Math.random()` over the in-memory pool. If `exclude` empties a non-empty pool, the excluded quote is allowed back (`quote.service.ts:132`).
**Never fails:** route and client both fall back to `{ id:'default', text:'The secret of getting ahead is getting started.', author:'Mark Twain' }`. Note **two independent copies** of that literal exist (client `QuoteDisplay.tsx:16-20`, server `quote.service.ts:38-42`) and can drift.
**Never empty.** No loading skeleton — the placeholder text is `Loading inspiration…` styled identically to a real quote.

### 7.3 Feature Hub
**Purpose:** navigation launcher.
**Elements:** 8 `Link` tiles, each an icon chip + a truncated 12px name.

| # | Name | href | icon | icon colour |
|---|---|---|---|---|
1 | Today Checklist | `/today` | `CheckSquare` | `emerald-400` on `emerald-500/10` |
2 | Habits Tracker | `/habits` | `Activity` | `primary` on `primary/10` |
3 | Routine Schedule | `/routine` | `Calendar` | `purple-400` on `purple-500/10` |
4 | Goals & Milestones | `/goals` | `Target` | `rose-400` on `rose-500/10` |
5 | Focus Mode | `/focus` | `Timer` | `amber-400` on `amber-500/10` |
6 | Daily Journal | `/journal` | `BookOpen` | `cyan-400` on `cyan-500/10` |
7 | Analytics | `/analytics` | `BarChart3` | `indigo-400` on `indigo-500/10` |
8 | Achievements | `/achievements` | `Trophy` | `yellow-400` on `yellow-500/10` |

**Data:** none. **Not gated** — always present.
> Each entry declares a `desc` string that is **never rendered** (`page.tsx:39-46`). Free copy for a redesign.

### 7.4 Day Type — `TodayDayType` ⚠ shared with `/today`
**Purpose:** tell the user which kind of day this is, and let them override it.
**Elements:** `CalendarDays` icon + `<h2>Day Type</h2>`; a `Badge variant="primary"` with the day's icon and name; a status line — "Natural schedule for today" / "Manually overridden for today" / "Checking today's day type…"; a `Collapsible` "Change day type" containing a `DayContextSelector`; "Using natural schedule" / "Reset to schedule".
**Data:** `GET /api/day-mode?date=` and `GET /api/day-types?active=true`.
**Writes:** `POST /api/day-mode` with `mode: 'DAY_TYPE'` or `mode: 'CLEAR'`, then re-reads the snapshot.
**Resolution rule** (`src/lib/scheduling/resolve-routine.ts:122-152`): a `RoutineException` for that date wins (`source: 'EXCEPTION'`); otherwise the **natural** day type. `resolveNaturalDayType` parses the date as UTC midnight and returns **`WEEKEND` when the ISO weekday is 6 or 7, else `WORKDAY`** — so `HOLIDAY`, `EXAM_DAY`, `LOW_ENERGY` and `CUSTOM` can **only** come from an explicit exception.
> `isMinimumDay` / `isRestDay` come **only** from the `DailyScore` row. If no row exists they are `false`/`null`.
> On `/today` this component receives an extra server-resolved `resolvedDayType` prop; on `/dashboard` it does **not**, so the badge can briefly disagree with itself.

### 7.5 Score — `CoreScoreWidget`
**Purpose:** today's headline number.
**Elements:** `<h3>Today Progress</h3>`; a hexagon **radar** with 6 axes labelled `Core / Growth / Bonus / Habits / Routine / Sleep`; the total in the centre with the caption `overall`; footer `Grade {overallGrade} · Hexagon view of today's score`. `<svg role="img" aria-label="Today progress radar: Core 0, Growth 0, …">`. Hovering an axis draws a `r=14` hit target and shows a `role="status"` tooltip `{label}: {value}`.
**Data:** `GET /api/score/{today}` — which **recalculates and persists** today's score.
**Empty:** "No score yet today — complete a habit or routine block to get started." — effectively unreachable, because the endpoint recalculates, so the payload is always complete.
**Sleep axis is structurally 0** — `sleepScore` is never written (§6.1).

### 7.6 Streak — `StreakWidget`
**Purpose:** the current run.
**Elements:** a 48px flame disc that pulses while the streak is active; `"{n} Days"`; "Current Streak" or "Start your streak today!"; a right column with the label `LONGEST`, the value, and `Last: {lastCompletedDate}`.
**Data:** `GET /api/streak` → whole `Streak` row.
**No distinct empty state:** `currentStreak === 0` renders the normal body.
> The `Last:` label was previously bound to `streakStartDate` (the day the run **began**). It now reads `lastCompletedDate`. `coreStreak` and `growthStreak` are declared in the local type and never read — they are always 0.

### 7.7 Goals — `GoalsWidget`
**Purpose:** progress on active weekly goals.
**Elements per goal:** a check circle (**DAILY goals only, and `showDailyCheckoff` is `false` on `/dashboard`** so it never renders here); the title, `line-through` when checked; a priority `Badge`; a "Carried Over" badge; `"{n} days remaining"` or `"Deadline passed"`; `"{currentValue}/{targetValue} {unit}"` with a `+` increment button; a `Progress` bar; `"{pct}% complete"`; `"✓ Done!"` at 100%.
**Data:** `useApp().goals` (from `GET /api/goals`) **plus** `GET /api/goals/today`, from which only `id` and `loggedToday` are read.
**Filter:** `type === 'WEEKLY' && (status === 'ACTIVE' || status === 'CARRIED_OVER')`. The page passes **no props**, so the type default `'WEEKLY'` applies and **DAILY goals are invisible here**.
**Writes:** `+` → `useApp().updateGoalProgress` → `PATCH /api/goals/[id]`.
**Priority colours** — `PRIORITY_COLORS` (`GoalsWidget.tsx:28-37`): `CRITICAL → danger` (red), `HIGH → warning` (amber), `MEDIUM → default`, `LOW → default`, `PERSONAL / ACADEMIC / PROFESSIONAL → primary`, `NON_PROFIT → default`. `CRITICAL` and `HIGH` were **both** green `success` until recently — the `danger` variant existed in `Badge.tsx:12` and was unused.
**Empty:** `EmptyState` "No goals set yet" / "Add your first weekly goal to track progress."
> **No loading state.** `useApp().goals` starts `[]`, so the first paint shows the empty state for a user who has goals.

### 7.8 Sleep — `SleepWidget`
**Purpose:** last night's sleep.
**Elements:** `<h3>Sleep Summary</h3>`; `"{hours}h {mins}m"`; `Bedtime: {actualBedtime ?? '—'}`; `Wake up: {actualWakeTime ?? '—'}`; a 64px score disc; the label `Score`; `Quality {quality}/5 · felt rested`.
**Data:** `GET /api/sleep?date=&limit=1`, picking the row whose `date` matches.
**Target:** `useSettings().settings?.minSleepDuration ?? 480`. Score = `min(100, round(actualDurationMinutes / target × 100))` — **client-only, never persisted**, and *not* `DailyScore.sleepScore`.
**Empty:** Moon + "Sleep Summary" + "No sleep logged".
> The interface previously declared `{ totalMinutes, bedtime, wakeTime }` — **no such fields exist on `SleepLog`**. It type-checked because the shape was local fiction and the widget was never handed a value to check against.
> `date` comes from `useApp().selectedDate` — the **global `/today` date**. The dashboard sleep card silently shows whatever date was last selected on `/today`, with no UI indicating which.
> `SleepLog.date` is *"the day you woke up"*, so tonight's sleep appears on **tomorrow's** row.

### 7.9 Routine Progress — `RoutineWidget`
**Purpose:** the day's time blocks and period rollups.
**Elements:** `<h3>Routine Progress</h3>`; `PeriodControl`; a "Manage" link → `/routine`; a big `{rate}%`; an `indigo-600→400` bar; `"{done} of {scheduled} blocks done"` (or `"{scheduled} scheduled routine days in {label}"` for the year view).
**Day view** (max-height 184px, scrollable): one row per block, `title` + `{startTime} – {endTime}`, a clickable circle. **Filled green `CheckCircle2` when the server says `COMPLETED`; dashed amber `CircleDashed` with a `missed` / `partial` label when it says `MISSED` / `PARTIAL`; hollow grey `Circle` otherwise.**
**Other periods:** `WeekView` (7 columns, `min-w-[420px]` inside `overflow-x-auto`), `MonthView`, `YearView` — all click-through into `day`.
**Data:** `GET /api/routine/progress?period=&date=` → `days[].blocks[].status`.
**Write:** `POST /api/routine/today` with `{blockId, date, status}` where `status ∈ COMPLETED | PARTIAL | MISSED`. `IN_PROGRESS` is **rejected** by the Zod schema.
**Optimistic overlay:** `statusOf(blockId)` returns `overlay[blockId]` when the key **exists** (`in`, not `??`), otherwise the server's `status`. The overlay is cleared on every successful load.

> **This was the highest-impact bug on the page.** `statusOf` used to read only the optimistic map, which starts empty, so every block rendered as an unticked circle while the header showed the real percentage. Because `current` was always `null`, `next` was always `COMPLETED` and **a completed block could not be un-ticked without a page reload**. `MISSED` and `PARTIAL` were also being discarded entirely.
> `PeriodControl` is rendered **without** `anchorDate` / `maxAnchor` / `timezone`, so the `›` next arrow is **never disabled** and the user can walk into future periods that have no data.

### 7.10 Activity Overview — `ContributionHeatmap`
**Purpose:** a year of consistency at a glance.
**Elements:** `<h3>Activity Overview</h3>`; a `Last 365 days` chip (`hidden sm:inline`); 366 cells at `w-3 h-3` (`w-4 h-4 md:w-5 md:h-5` when expanded) in five shades; `Less ▪▪▪▪▪ More`; per-cell `title="{date}: {score|No data}"`; a `Maximize2` toggle opening a fullscreen `role="dialog" aria-modal="true"` with Escape-to-close and two close buttons.
**Data:** `GET /api/scores/daily?startDate=shiftCalendarDay(today,-365)&endDate=today` — 366 dates, inclusive.
**Grid construction:** `shiftCalendarDay(today, -WINDOW_DAYS + i)` for `i = 0 … 365` inclusive.

> **The grid was built from `new Date()` + `.toISOString().slice(0,10)`** — `setDate` mutates in the browser's **local** zone while `toISOString` renders in **UTC**, so for any user not on UTC the labels drifted out of the fetched range, and the loop `i < WINDOW_DAYS` started at `today-365`, so **today was never drawn** even though the request included it. Both fixed; **do not reintroduce `new Date()` here.**
> **Columns are not weekday-aligned** — the loop starts at `today-365` regardless of weekday, so row 0 of column 0 is not Sunday. The legend says "365 days" while 366 cells render.
> **No empty state.** A user with no history sees a full grid of `bg-muted` cells, pixel-identical to "every day scored 0".
> When expanded the grid is **rendered twice** (a second copy for the dialog) → ~732 cells plus 365 `motion.div` wrappers.
> The cells are plain `<div>`s with no `role` and no `aria-label`; the tooltip is `title`-only, so it is unavailable to touch and keyboard users.
> The loop does `data.find(...)` for each of 366 cells over an array of up to 366 rows (~133k comparisons) and **is not memoised against a `Map`**, so it re-runs on every render.

### 7.11 Last 7 Days — `WeeklyBarChart`
**Purpose:** short-term trend.
**Elements:** `<h3>Last 7 Days</h3>`; a static `Core / Growth / Bonus` legend; 7 stacked columns (`bg-sky-500`, `bg-emerald-500`, `bg-amber-400`); the day letter; the total under each; `—` for gaps; today in `text-primary font-bold`; a hover tooltip with Total/Core/Growth/Bonus.
**Data:** `GET /api/scores/daily?startDate=today−6&endDate=today` — the same endpoint as the heatmap, the best-projected widget on the page (5 of 5 fields used).
**Gap-fill:** the 7 slots are built client-side and missing dates render as `null`.
> The tooltip is `absolute` + `whitespace-nowrap` inside a `flex-1` column; at 320px the columns are ~38px wide and the tooltip ~120px, so it overflows the card. It is hover-only — no `group-focus-within`, no tap handler.
> The error branch has **no retry button** (it does correctly say "This is a failed request, not an empty history").

### 7.12 Habit Health — `HabitHealthWidget` ◀ the only ungated widget
**Purpose:** spot habits that are decaying.
**Elements:** `ScrollableCard title="Habit Health"` + "Manage" → `/habits`; summary `"{doneCount} of {active.length} done today · {overallRate}% completion"`; chips `"{n} Healthy"`, `"{n} At risk"`, `"{n} Unhealthy"`, `"{windowDays}-day view"`; per habit a tick button, a tier dot (`title="Tier: {tier}"`), the name, `{completionRate}%` (or the health label when null), a health-coloured bar, and a `Flame` with `streakCount`.
**Data:** `GET /api/habits/health?days=28`, plus `useApp().habits` for the tick state and names.
**`windowDays`** is read from the response's `window.days` — it was previously the hard-coded string `"28-day view"`, which lied the moment `?days=` changed.
> **No `WidgetGate` and no key in `DASHBOARD_WIDGETS`** — this is the one widget a user cannot hide from Settings.
> **It never refetches.** `fetchHealth` is `useCallback([])`, so ticking a habit leaves the 28-day bars, chip counts and overall percentage stale for the rest of the session.
> The per-habit flame and number read `Habit.streakCount`, which nothing ever writes → **always 0**.
> Its loading branch originally passed `isEmpty` *and* skeleton children; `ScrollableCard` renders `emptyMessage` and **discards `children`** when `isEmpty` is true, so it showed the bare text "Loading habit health…" with no skeleton and no `aria-busy`.

### 7.13 AI Insights — `InsightWidget`
**Purpose:** a weekly narrative.
**Elements:** `<h3>AI Insights</h3>`; `{summary}`; a `Wins` heading with `wins.slice(0,2)`; a `Suggestions` heading with `suggestions.slice(0,3)`; `Generated {date}`; a ghost `🔄` regenerate button that becomes a `Loader2` spinner.
**Data:** `GET /api/insights/latest?period=WEEKLY` → the whole `AIInsight` row.
**Write:** `POST /api/insights/generate` with `{period:'WEEKLY', startDate: endDate−7, endDate}`. **The window is derived in the user's timezone** — it previously used `new Date().toISOString().split('T')[0]`, which is the host's UTC date, so east-of-UTC users asked the AI to analyse a week ending *yesterday*.
**Nullability:** `wins` and `suggestions` are `String?` in the model and the API returns the raw row. The local type once declared them `string`, so `.split()` on a NULL row threw a `TypeError` and took down the card.
**Error behaviour:**
- read failure → `role="alert"` + Try again, and the **Generate button is deliberately withheld** — you cannot fix generation from a broken read
- `503` → "AI insights are not configured (missing API key). Your dashboard works fine without them." or a temporary-unavailable message
- network failure → "Could not reach the insights service. Please try later."
**Empty:** "Get personalized insights powered on by AI" + a `Generate Insight` button.
**Default OFF** — the only `false` in `DASHBOARD_WIDGETS`.

---

## 8. States matrix

| Widget | Loading | Error | Empty |
|---|---|---|---|
Quote | text reads `Loading inspiration…`, no skeleton, no `aria-busy` | **by design absent** | n/a — fallback quote is the permanent answer |
Day Type | keeps its real header, `Skeleton h-6 w-40`, `aria-busy="true"`, `min-h-[12rem]` | inline `role="alert"`; a **second** banner for a list error, each with Try again | "You have not created any day types yet." + link to `/routine` |
Score | `aria-busy`, `h-4 w-1/2` + `h-48 w-48 rounded-full` pulse — **no `motion-reduce:`** | `role="alert"` + Retry | "No score yet today…" — effectively unreachable |
Streak | `min-h-[104px]`, `aria-busy`, 3 pulse bars with `motion-reduce:animate-none` | alert + Try again | **none** — 0 renders the normal body |
Goals | 🔴 **missing** — first paint is the empty state | two `role="alert"` blocks: mutation, and check-in load | `EmptyState` "No goals set yet" + Create Goal |
Sleep | `min-h-[160px]`, `aria-busy`, moon + line pulse | Moon + alert + Try again | Moon + "No sleep logged" |
Routine | 3 × `h-14` pulse — **no `motion-reduce:`** | text, **no `role="alert"`, no retry**; copy duplicated for the empty-blocks case | "No activity recorded yet." + sub-copy |
Heatmap | `aria-busy`, 1 header + **26×7** skeleton cells (the real grid has 53 columns) | guarded on `data.length === 0` — **a post-load failure is silently swallowed** | 🔴 **missing** |
Chart | `aria-busy`, header + `h-48` skeleton | alert + "not an empty history", **no retry** | "No scores recorded for the last 7 days yet." |
Habit Health | 4 pulse rows with `aria-busy` (fixed) | alert + Try again when no data yet; otherwise a banner in `summary` — "showing the last successful load" | `ScrollableCard isEmpty` → "No active habits yet." |
Insights | `aria-busy`, header + 3 lines | alert + Try again, Generate withheld | "Get personalized insights powered by AI" + Generate |

### 8.1 What happens when data is bad

| Situation | Behaviour |
|---|---|
Widget fetch 401 | Each widget surfaces its own error branch. `WidgetGate` does **not** re-check auth. |
Widget fetch 500 | Same. `Score` alone reports the literal `Internal error`; others report the route's own message. |
Widget fetch 500 **after** a good load | Heatmap: swallowed, stale data shown with no banner. Habit Health: banner + stale data. Chart: full error card. Inconsistent by design history. |
`/api/scores/daily` returns nothing | Heatmap fills all 366 cells at level 0. Indistinguishable from a real zero. |
Habit with no logs in window | `completionRate: null` → the row shows the health label instead of a `%`; excluded from `overallCompletionRate`. |
No routine template for the day | `scheduled: false, total: 0, blocks: []`. The widget reports "No activity recorded yet." |
No goals | `EmptyState`. |
No sleep row for the date | "No sleep logged". |
No day types defined | "You have not created any day types yet." + link. |
Stale score (routine ticked but not recalculated) | See §10 — the Score widget is corrected on the next read. |
Data older than today | **Not rendered.** Heatmap and chart window to today; goals and sleep key on `selectedDate`. |
`insight.wins === null` | Guarded `?? ''` — renders no bullets, no crash. |
Quote service down | Fallback quote, `200 OK`, no error shown. |

---

## 9. State management

### 9.1 Where state lives

| Layer | Mechanism | Consumers |
|---|---|---|
Server → client | Two props only: `date={today}` (Day Type). `session.user.name` in markup. | `page.tsx` |
Session settings | zustand `useSettingsStore`, loaded **once per session** by `useSettingsLoader` in `AuthProvider` | `SleepWidget` (`minSleepDuration`) |
Timezone | `useUserTimezone()` → `useSettings()` → the store. `WeeklyBarChart`, `ContributionHeatmap`, `GoalsWidget`, `HabitHealthWidget`, `SleepWidget`, `InsightWidget` | — |
Shared entity data | `AppContext.fetchAll` issues `GET /api/habits?includeArchived=true&limit=100`, `GET /api/routine`, `GET /api/goals` in one batch | `GoalsWidget`, `RoutineWidget`, `HabitHealthWidget`, `SleepWidget` |
Per-widget data | Local `useState` + `useEffect` — **no cache, no SWR** | every widget |
Widget visibility | `localStorage['routineos.dashboard.widgets']` | `WidgetGate`, `/settings/dashboard` |
Quote persistence | `localStorage['routineos-quote-state']`, `['routineos-quote-scope']` | `QuoteDisplay` |
Cross-component event | `window` `day-mode-changed` | dispatched by `/today`; **never listened to on the dashboard** |

> There is **no request cache or SWR layer**. `/dashboard` and `/today` each fetch the same rows independently — `HabitHealthWidget`/`TodayHabitChecklist`, `WeeklyBarChart`/`ContributionHeatmap`/`TodayScore`, `RoutineWidget`/`CurrentRoutineBlock`. The same facts are fetched twice per navigation.

### 9.2 How state updates

All widget updates follow the same shape: optimistic local write → `fetch` → re-read or revert.

- **Goals `+`** → `updateGoalProgress` → `PATCH /api/goals/[id]` → updates `AppContext.goals`.
- **Routine circle** → `setOverlay({...prev, [blockId]: next})` → `POST /api/routine/today` → on success `load('day', anchorDate)` re-reads and clears the overlay; on failure the overlay entry reverts.
  > `finally { setTogglingId(null) }` fires **before** the re-fetch resolves, so the button re-enables while the reload is in flight.
- **Day Type change** → `POST /api/day-mode` → re-read the snapshot → re-render.
- **Insight regenerate** → `POST` → `setInsight(data.data)`.

### 9.3 Period navigation state

`RoutineWidget` holds `period` and `anchorDate` in local state, seeded from `useApp().selectedDate || getTodayString(timezone)`. `navigate(delta)` calls `shiftAnchor(anchorDate, period, delta, timezone)`.

> `PeriodControl`'s own `timezone` prop is **not** passed, so it falls back to `DEFAULT_TZ` (UTC) for its own label formatting even though the widget navigates correctly. `shiftAnchor` and `getDaysRemaining` both default to `DEFAULT_TZ` and **must** be passed the zone explicitly.

---

## 10. Cross-component interactions

### 10.1 Which components depend on which

```
AppContext ──┬─► GoalsWidget    (goals, updateGoal, updateGoalProgress)
             ├─► RoutineWidget  (selectedDate)
             ├─► HabitHealthWidget (habits, getLogForDate, logHabit, selectedDate)
             └─► SleepWidget    (selectedDate)

useSettings / useUserTimezone ──┬─► SleepWidget, GoalsWidget, HabitHealthWidget,
                                │   ContributionHeatmap, WeeklyBarChart, InsightWidget
                                │
WidgetGate (localStorage) ─────┴─► all 9 gated widgets
```

**The widgets do not talk to each other.** There is no shared store for score, streak, heatmap or chart data. Two widgets reading the same underlying fact (heatmap and chart both call `/api/scores/daily`) have independent copies and independent fetch timing.

### 10.2 How one user action affects the rest

| Action | Direct effect | Indirect effect | **Not** updated until |
|---|---|---|---|
Tick a routine block | `RoutineWidget` optimistic overlay; the block's circle/label | changes the inputs to `routineCompletionRate` | The next `GET /api/score/<today>`, the next habit log, or nothing. **The nightly cron does not repair it** — a `DailyScore` row for that day already exists, and the cron only backfills *missing* days. `POST /api/routine/today` recalculates nothing. |
Increment a goal | `AppContext.goals` → the Goals row | none | — |
Change the day type | `TodayDayType` re-reads; `resolveDayTypeForDate` output changes for the Routine widget **on its next fetch** | the routine template for that day changes | `RoutineWidget` reloads only on `period`/`anchorDate` change — it does **not** refetch when the day type changes, so a same-session change is not reflected until navigation |
Generate an insight | `InsightWidget` | none | — |
Tick a habit **on `/today`** | streak + score recalculated server-side | the dashboard's Score, Streak, Heatmap and Chart all become stale | any dashboard remount |

> **This is the single most confusing behaviour on the page for a new developer:** the dashboard is a set of independent snapshots. A user who completes a habit on `/today` and then opens `/dashboard` sees a score that was recalculated, but the Routine widget's percentage and the heatmap may reflect a different moment. There is no invalidation.

### 10.3 Score calculation timing — both, and they differ

- **Lazily on read:** `GET /api/score/[date]` for `date == today` always re-derives **and persists** (`route.ts:42-43`). This is why the Score widget is always current.
- **Lazily on write:** `HabitService.logHabit` (`habit.service.ts:288`) and `RoutineService.logBlockCompletion` (`routine.service.ts:687`).
- **Scheduled backfill:** `GET /api/cron/compute-daily-scores` at `0 1 * * *` UTC writes a row for every day in `(today−90 … yesterday]` that has none, bounded to 200 rows/run, then rebuilds the streak from 730 days of history. It **never scores today**.
- **Past dates are read-only** in `/api/score/[date]`: an existing row is served as stored, so a stored day's number never mutates on read.

### 10.4 `POST /api/routine/today` triggers nothing else

`logBlockStatus` (`routine.service.ts:438-456`) ends at the `RoutineLog` upsert. **No** score recalculation, **no** streak update, **no** achievement check, **no** automation event, **no** notification.

Compare `POST /api/habits/[id]/log` → `HabitService.logHabit`, which in order:
1. ownership check
2. eligibility gate — a `COMPLETED` log on an ineligible date **throws**
3. `upsertLog`
4. **streak** — only on `COMPLETED` and only if a `Streak` row exists
5. **score recalculation** — `await calculateDailyScore`
6. **automations** — `HABIT_COMPLETED`, fire-and-forget
7. **achievements** — `checkForUnlocks`, fire-and-forget, on every status

---

## 11. Background jobs

All `api/cron/*` routes are `GET` only and share one auth helper, `authorizeCron` (`src/lib/cron-auth.ts:19-45`):
`Authorization: Bearer ${process.env.CRON_SECRET}`. Unset `CRON_SECRET` → **500** (deliberately a misconfiguration, not a 401). Mismatch → **401**.

| Route | Work | `vercel.json` | GitHub Actions |
|---|---|---|---|
`compute-daily-scores` | backfill missing `DailyScore` rows + streak rebuild | ✅ `0 1 * * *` | ❌ |
`generate-insights` | weekly AI insight + `ProductivityPattern` upserts | ✅ `0 2 * * 0` | ❌ |
`notification-tick` | sleep prompts → schedule → dispatch | ❌ | ✅ every 5 min |
`sleep-notifications` | create the `SLEEP_PROMPT`, auto-start a sleep session | ❌ | via `notification-tick` |
`schedule-routine-notifications` | `scheduleAllReminders()` | ❌ | via `notification-tick` |
`dispatch-notifications` | task reminders + due dispatch | ❌ | via `notification-tick` |
`run-automations` | `TIME_REACHED` automations per user in their own timezone | ❌ | ❌ **— not scheduled anywhere** |

`vercel.json` schedules only the first two; the Hobby plan's ~2-daily cron budget rejects sub-daily expressions, which is why notifications run from GitHub Actions instead (`.github/workflows/notification-scheduler.yml`, `1,6,11,…,56 * * * *`, deliberately off the hour).

**Jobs that change dashboard data:**
- `compute-daily-scores` → writes `DailyScore` rows and rewrites `Streak` counters. It fires `SCORE_THRESHOLD` automations for every backfilled day, so it is not a pure read.
- `generate-insights` → writes `AIInsight` and `ProductivityPattern` rows. Does not touch `DailyScore`.
- `notification-tick` → calls `timeEntryRepository.stopRunning(userId)`, which **stops a running focus `TimeEntry`**.

**Two interactions with `/focus` worth knowing:** the sleep auto-start stops a running focus session, and the Focus Hub tile links to `/focus`. Focus data is otherwise not shown on the dashboard — `TimeEntry` rows are consumed by the scoring aggregator (`src/server/ai/aggregator.ts`) and by the analytics service, not by any dashboard widget.

---

## 12. Responsive behaviour

| Width | Layout |
|---|---|
`< 640` | Everything stacks to one full-width column. Feature Hub 2×4. Metrics 1 column. Main grid 1 column, so AI Insights sits below the entire left stack. |
`640–767` | Feature Hub 4×2. Heatmap "Last 365 days" chip appears. |
**`768–1023` (iPad portrait)** | Header becomes 2-col. Metrics 2×2. **Main grid is still 1 column** — the 2/3 + 1/3 split only engages at `lg`. |
`1024–1279` | Feature Hub 8×1. Main grid splits 2/3 + 1/3. Metrics 2×2. |
`≥ 1280` | Metrics 4×1. |

**Known overflow points:**
- `RoutineWidget` WeekView is `min-w-[420px]` inside `overflow-x-auto` — contained, but it always shows a horizontal scrollbar on a 320px screen.
- `WeeklyBarChart`'s tooltip is ~120px wide in ~38px columns at 320px.
- `StreakWidget`'s right column (`shrink-0` + `pl-5` + `Last:`) has no `min-w-0`/`truncate` on the date span, so a long value plus the `LONGEST` label is the widest thing in the card.
- `HabitHealthWidget` and `RoutineWidget` scroll internally via `slim-scroll` (`globals.css:378-389`, 6px width, no thumb track styling).
- Heatmap cells: `w-3 h-3` (12px) collapsed; `w-5 h-5` (20px) expanded at `md`.

**Mobile chrome:** the dashboard layout adds `pb-20` for a bottom nav (`MobileNav`) and a `FloatingFocusBar`, collapsing to `md:pb-8` at tablet.

---

## 13. Permissions and authentication

- **NextAuth JWT strategy.** The framework never writes a `DeviceSession` row; `DeviceSessionTracker` registers the browser separately.
- `proxy.ts` gates every non-public route. It resolves the session with `getToken`, and the cookie name is derived from the **configured** URL (`AUTH_URL ?? NEXTAUTH_URL`) exactly as NextAuth does, falling back to trying the other naming.

  > **This was a real bug.** Because `.env` sets `NEXTAUTH_URL=https://…`, NextAuth writes `__Secure-authjs.session-token` even in dev, while the proxy was computing `secureCookie` from the *request* (http) and looking for `authjs.session-token`. Sign-in succeeded, the session was valid, and every protected page still 307'd to `/login`.
- `sessionVersion` is what actually invalidates live JWTs — bumped by `logoutAll` / `changePassword` / `deleteAccount`. `instrumentation.ts` bumps it for every user on **dev server start only**, invalidating all pre-restart dev sessions.
- `page.tsx:32-36` double-guards: `auth()` then `redirect('/login')`.
- No role checks, no per-widget permissions, and no `isDeleted` check in the page. There is an `admin/` route group that is unrelated.
- Widget preferences are **per-device** (`localStorage`), not account-scoped. Toggling on one device does not affect another, and the settings page does not listen for a cross-tab `storage` event, so an open dashboard will not react to a change made in another tab.

---

## 14. Route-level loading skeleton

`src/app/(dashboard)/dashboard/loading.tsx` — root `div.space-y-8.fade-rise-in` with `aria-busy="true" aria-label="Loading dashboard"`.

- Header: `Skeleton shine h-8 w-72` + `h-4 w-96`
- 8 × `h-16 w-24 rounded-xl` in a `flex flex-wrap` — **not** the real `grid-cols-2 sm:grid-cols-4 lg:grid-cols-8`, so the Feature Hub reshapes on load
- `grid gap-6 md:grid-cols-2 xl:grid-cols-4` × 4 `CardSkeleton lines={3}`
- `grid gap-6 lg:grid-cols-3` → `lg:col-span-2` with 2 `ChartSkeleton` and 1 `ChartSkeleton` — **2 placeholders for 4 real left-column cards**
- No placeholder for the quote, the day-type panel, or Habit Health

> **The skeleton root has no `container` / `max-w-7xl`**, while the loaded page does. The skeleton is full-bleed and then snaps to 7xl on resolve.

---

## 15. Navigation map

| Element | Destination |
|---|---|
Header "Go to Today" | `/today` |
Feature Hub × 8 | `/today`, `/habits`, `/routine`, `/goals`, `/focus`, `/journal`, `/analytics`, `/achievements` |
Routine "Manage" | `/routine` |
Habit Health "Manage" | `/habits` |
Goals "View All" | `/goals` |
Day Type empty state | `/routine` |
Quote refresh | in-page, no navigation |

Nothing on the dashboard navigates away except those links. Every other interaction is in-page and state-local.

---

## 16. Business rules controlling what is displayed

| Rule | Effect |
|---|---|
`insights` defaults to `false` | The entire right column is an empty 1/3-width div on every fresh browser. The layout reserves space for an opt-in card. |
Only `WEEKLY` goals are rendered | `GoalsWidget`'s `type` default; the page passes no prop. DAILY goals are invisible, and the whole check-in path is dead code here. |
`HabitHealthWidget` has no gate | It is the one widget a user cannot hide, and it has no key in `DASHBOARD_WIDGETS`. |
Only `WORKDAY` / `WEEKEND` resolve naturally | Every other day type requires an explicit `RoutineException`. |
`resolveDayTypeForDate` prefers an exception | A manual override always beats the natural schedule. |
Rest day → `totalScore = 0` | Applied before the minimum-day ×0.5. |
A day with no `coreScore > 0` and no minimum-day flag is not a streak day | The shared predicate. |
Milestones need an **exact** hit | `[7,14,21,30,60,90,100,180,365]`; 6→8 records nothing. |
Habit `PARTIAL` counts 70% in the score but 0 in health | Deliberate divergence between two surfaces. |
Habit `PARTIAL` counts 0 in `habitCompletionRate` | The rate is strictly COMPLETED-only. |
`Habit.status = 'ACTIVE'` filter | Archived and paused habits are excluded from scoring and health. |
`max 5` goals in the `/today` card | The dashboard widget has no cap. |
`Quote.usageCount` | A column that exists and is **never incremented anywhere**. |
`SCORING_WEIGHTS.minimumDayMultiplier = 0.5` | Declared and **never read**; the code uses `CALCULATION_RULES.minimumDay.scoringMultiplier` instead. |
`POINTS_SYSTEM.streakBonus` / `perfectDayBonus` / `routineCompletionBonus` / `sleepQualityBonus` | All declared, all dead. |

---

## 17. Known defects — do not mistake these for intended behaviour

**Data / correctness**
1. `GoalsWidget` reads **2 of 18** fields from `/api/goals/today` and runs 4 queries for it on every dashboard mount, purely to obtain `loggedToday` that the disabled check-off never uses.
2. `GoalsWidget` has **no loading state** — the first paint says "No goals set yet" for a user who has goals.
3. `DAILY` goals are **entirely invisible** on the dashboard.
4. Heatmap columns are **not weekday-aligned**; the legend says 365 while 366 cells render.
5. `HabitHealthWidget` **never refetches** (`useCallback([])`), so its bars go stale for the session.
6. `SleepWidget` uses the **global `/today` `selectedDate`** with no UI indicating which date is shown.
7. Heatmap has **no empty state** — 366 empty cells look like "every day scored 0".
8. `PeriodControl` gets no `anchorDate`/`maxAnchor`, so `›` is never disabled.
9. `InsightWidget` renders `generatedAt` with `toLocaleDateString()` — browser locale, not `UserSettings.timezone`.
10. `sleepScore` is never written; the Score widget's Sleep axis is structurally 0.
11. `habitCompletionRate` can exceed 100 (denominator = habits, numerator = logs).
12. `coreStreak` / `growthStreak` / `totalRestDays` / `Habit.streakCount` are never written — always 0.
13. The per-habit flame in Habit Health is always 0 for the same reason.
14. `POST /api/routine/today` does not recalculate the score, and the nightly cron will not repair it.
15. The documented 70/20/10 habits/routine/sleep split is not implemented.
16. `UserSettings` column defaults (`1.0/0.5/0.25`) override the config weights (`1.5/1.0/0.5`) for every real user.
17. Two competing milestone lists: `STREAK_MILESTONES = [3,7,…]` vs `THRESHOLDS.streakMilestones = [7,14,…]`.
18. `MAX_INSIGHT_DATA_KB = 50` is exported but the cap is hard-coded independently in `validateDataSize`.

**Layout / rendering**
19. The main grid has **no `sm`/`md`** — the iPad-portrait band collapses to one column.
20. `Mount` wraps `WidgetGate` in all 9 gated positions → blank without JS, and hiding a widget leaves a hole.
21. Stagger delays are out of order (parent `0.28`, children `0.26`/`0.30`).
22. `loading.tsx` has no `max-w-7xl`; its Feature Hub and chart placeholders don't match the real layout.
23. `QuoteDisplay` has `mb-8` inside a `space-y-8` parent — 64px of dead space.
24. Heatmap renders its grid **twice** when expanded; the cells are 366 unmemoised `data.find()` lookups.
25. `InsightWidget`'s wins/suggestions are truncated at 2 and 3 with no "show more".

**Dead code**
26. Five files with **zero importers**: `DashboardCustomizer.tsx`, `MonthlySummaryWidget.tsx`, `ScoreRingMini.tsx`, `WidgetContainer.tsx`, `WidgetGrid.tsx`.
27. All 8 Feature Hub `desc` strings are declared and never rendered.
28. `ScoringService` discards the entire `breakdown`; `InsightWidget` discards `patterns`/`concerns`/`nextPeriodFocus` and ships a 50 KB `dataSnapshot` to the browser.

**A11y**
29. Heatmap cells have no `role` and no `aria-label`; the tooltip is `title`-only, unusable on touch and by keyboard.
30. `RoutineWidget`'s error state has no `role="alert"` and no retry; `WeeklyBarChart`'s error has no retry.
31. `PeriodControl` uses `role="tablist"`/`role="tab"` with `aria-selected` but no `aria-controls`, no `id`, and no `role="tabpanel"`.
32. `CoreScoreWidget` and `RoutineWidget` pulse without `motion-reduce:animate-none` (the global `prefers-reduced-motion` rule now covers `animate-pulse`, but the components are inconsistent).
33. `CoreScoreWidget` uses `text-red-500 dark:text-red-400` instead of the `destructive` token.

**Clean — verified, for contrast**
No hardcoded hex in `src/components/dashboard/`. No `text-*-600` without a `dark:` pair. No `role="meter"`. No missing `await` on `params`/`searchParams`. No N+1 (habit health uses one `Promise.all`; routine uses one `Promise.all` of 3). No user-scoping holes. No Prisma enum loaded as a *value* in a `'use client'` file. No hand-rolled settings fetch. No refetch loops from unstable deps. No unguarded `noUncheckedIndexedAccess` access.

---

## 18. Verified-clean and unverified

**Unverified — no runtime available, flagged rather than asserted:**
1. `buildOrderQuery('createdAt', undefined)` returning `{ createdAt: undefined }` and Prisma's runtime handling of it (`base.repository.ts:78-85`).
2. Whether `HabitRepository.findAll`'s `orderBy` actually resolves to Prisma's default order.
3. The `AppContext` abort/dedupe race: `normalizeHabit`/`normalizeGoal` depend on `today = selectedDate || '1970-01-01'`, so `fetchAll` and the data-layer effect both change identity when `selectedDate` resolves. The effect's cleanup calls `abortRef.current?.abort()` while the module-level `inflightFetch` guard suppresses the replacement fetch — if the abort lands, nothing refetches and `dataLoaded` stays false. The identity coupling is code-verified; whether the browser actually hits the window is not.
4. `POST /api/goals/[id]/checkin` deliberately bypassing `GoalService` is confirmed by reading the file, but the reason is documented nowhere.

---

## 19. Change-safety map

| Change | Blast radius |
|---|---|
`TodayDayType.tsx` | 🔴 **Also `/today`** — the same component instance |
`src/components/today/ui.tsx` (`GlassPanel`, `Tag`, `Stagger`, `PanelSkeleton`) | 🔴 Its header claims "sealed to this page", but the dashboard imports `GlassPanel` from it |
`src/lib/period-range.ts` (`shiftAnchor`, `PERIOD_LABEL`, `getPeriodRange`) | 🔴 `/dashboard`, `/recap`, `RoutineWidget`, `PeriodControl` |
`src/components/shared/PeriodControl.tsx` | 🔴 `/dashboard` and `/recap` |
`src/context/AppContext.tsx` | 🔴 Every dashboard page |
`src/lib/dates.ts` (`getTodayString`, `shiftCalendarDay`, `getDaysRemaining`, `DEFAULT_TZ`) | 🔴 Every page |
`src/config/scoring.ts` | 🔴 Scoring, analytics, the Score widget |
`DashboardWidgets.tsx` | 🟠 The key list must stay in sync with `/settings/dashboard` |
`src/components/ui/Badge.tsx` | 🟠 Goals, Day Type, Settings |
`globals.css` | 🟠 Global |
The individual widget files, `page.tsx`, `loading.tsx`, `Mount.tsx` | 🟢 Dashboard-only |

---

## 20. Quick reference

```bash
npm run dev            # localhost:3000/dashboard
npm run type-check     # tsc --noEmit — strict, noUnusedLocals, noUncheckedIndexedAccess
npm run lint           # 0 errors, ~165 warnings (all pre-existing advisories)
npm test               # NO TEST FILES — tests/ was deleted
```

There is **no test suite**. Verification is `tsc` plus browser inspection. When changing a widget, check all four states explicitly: loading, error, empty, and a populated render — three of the bugs fixed on this page were a state that did not exist, not a state that looked wrong.
