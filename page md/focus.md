# `/focus` — Complete System Audit

**Route:** `http://localhost:3000/focus`
**Route file:** `src/app/(dashboard)/focus/page.tsx` (65 physical lines, `'use client'`)
**Sibling route:** `src/app/(dashboard)/focus/session/page.tsx` (181 physical lines) — audited in full because it shares the entire domain
**Project:** RoutineOS (`daily-plan`) — Next.js (App Router) + Prisma + PostgreSQL (Neon)
**Audit date:** 2026-09-30 · **Amended:** 2026-09-30 (documentation-only pass — no code was changed; see [§24](#24-findings-register)) · **Part II added:** 2026-10-02 (implementation — see [§28](#28-verification-pass--auditing-the-audit))
**Status of this document:** Part I (§1–§27) describes **only** what existed in the codebase at the audit date, and is retained as the baseline. **Part II (§28+) records the implementation that followed and supersedes Part I for the data layer.** Every claim in Part I is file-anchored.

> **Two claims in the remediation brief derived from this audit were wrong.** "`soundEnabled` has no consumer" is false (§28.2) — it is wired, but to a `localStorage` key that has no connection to the `UserSettings` column the Settings UI toggles. And this audit's own §13.5 understates the break contamination (§28.3): it is not one number, it is six consumers including two achievements and the dashboard radar.

> **The page file is 65 lines. Almost nothing happens in it.** It renders a mesh gradient, a heading, and two components. The entire domain lives in `FocusTimer.tsx` (**1,506 lines**), which the page passes exactly **one** prop to out of eleven declared.

> **Line-count convention:** **physical** line counts. PowerShell's `Measure-Object -Line` skips blank lines and reports 59 for `focus/page.tsx` and 170 for `focus/session/page.tsx`.

> **Three facts worth knowing before reading on.**
> 1. **`abortedAt` is silently dropped** (`focus.service.ts:152` → `focus.repository.ts:75`). Every Stop/Skip/mode-switch is persisted as "no completion, no abort" — exactly the shape that means *"a session is currently running"*. See [§25](#25-the-abortedat-black-hole).
> 2. **`/focus/session` is effectively an orphan route.** Exactly one inbound link exists in the entire codebase (`FloatingFocusBar.tsx:127`), and it is only visible in a narrow window. See §12.2.
> 3. **`FocusSession` has no `type` column and there are no focus-domain Prisma enums at all.** A 5-minute break and a 25-minute focus block live in the same table, discriminated only by the `title` string. See §6.2–§6.3.

---

## Table of contents

| §   | Section                                                                                                         |
| --- | --------------------------------------------------------------------------------------------------------------- |
| 1   | [What `/focus` is, in one paragraph](#1-what-focus-is-in-one-paragraph)                                         |
| 2   | [UI block diagram](#2-ui-block-diagram)                                                                         |
| 3   | [UI → component mapping](#3-ui--component-mapping)                                                              |
| 4   | [Frontend architecture](#4-frontend-architecture)                                                               |
| 5   | [Backend / API architecture](#5-backend--api-architecture)                                                      |
| 6   | [Database dependency](#6-database-dependency)                                                                   |
| 7   | [Time and duration logic](#7-time-and-duration-logic)                                                           |
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
| 25  | [The `abortedAt` black hole](#25-the-abortedat-black-hole)                                                       |
| 26  | [The frozen-timer problem](#26-the-frozen-timer-problem)                                                       |
| 27  | [Dead surface inventory](#27-dead-surface-inventory)                                                            |

**Part II — Implementation**

| §   | Section                                                                                                         |
| --- | --------------------------------------------------------------------------------------------------------------- |
| 28  | [Verification pass — auditing the audit](#28-verification-pass--auditing-the-audit)                               |
| 29  | [What changed](#29-what-changed)                                                                                 |

---

## 1. What `/focus` is, in one paragraph

`/focus` is the app's **pomodoro timer**. It is a `'use client'` Client Component (`page.tsx:1`) of **65 lines** whose entire job is to lay out two components in a responsive 2-column grid: a decorative **`FlipClock`** (a CSS-3D wall clock) and **`FocusTimer`** (1,506 lines — the entire feature). `FocusTimer` implements four modes (`focus` / `short-break` / `long-break` / `stopwatch`), a 280 px SVG countdown dial, pause/resume/reset/skip/lap controls, eight duration presets plus a custom-minutes input, three settings switches, a stopwatch lap list, and a 100-session history list with a retry button. It ticks a **single 200 ms `setInterval`** while running, mirrors its state into a global zustand store that drives the `FloatingFocusBar` in the persistent layout, persists the in-progress timer to `localStorage` so it survives a reload, auto-pauses when a sleep session starts, and `POST`s a `FocusSession` row **exactly once per run** (guarded by a `postedRef`). The page passes it exactly one prop — `sleepActive`. **`FocusTimer` and the focus domain never touch `TimeEntry` at all**; a "focus session" and a "time entry" are disjoint data sets.

---

## 2. UI block diagram

### 2.1 `/focus` — the whole page, `page.tsx:65` lines

```
/focus  (src/app/(dashboard)/focus/page.tsx — 'use client')
│
└── <div class="relative mx-auto max-w-5xl px-4 py-6">              :33
    │
    ├── [background] div.gradient-mesh-animated.pointer-events-none
    │               .-z-10.opacity-60  (aria-hidden)                 :36–39
    │
    └── <div class="relative">                                        :41
        │
        ├── <Stagger delay={0}>                                       :42
        │   └── <header class="mb-6">                                 :43
        │       ├── <h1> [lucide Timer h-7 w-7 text-sky-600
        │       │        dark:text-sky-400] "Focus"                   :44–47
        │       └── <p class="text-sm text-muted-foreground">
        │            "Run a focus session, take planned breaks, and
        │             watch your focus minutes add up."                :48–50
        │
        └── <div class="grid grid-cols-1 gap-4 lg:grid-cols-2 items-start">   :54
            ├── <Stagger delay={0.06} class="min-w-0"> ▶ <FlipClock />        :55–57
            └── <Stagger delay={0.12} class="min-w-0"> ▶ <FocusTimer
                                                          sleepActive={Boolean(state?.active)} />  :58–60
```

**Local state: none.** One derived value: `sleepActive = Boolean(state?.active)` (`:20`), from `useSleepSession()` (`:19`). **Props passed to `FocusTimer`: one.** **Keyboard shortcuts: none.** **Timers on this page: none** (the mesh gradient is CSS-only).

### 2.2 `FocusTimer` — `src/components/focus/FocusTimer.tsx` (1,506 lines)

```
glass-panel card
│
├── MODE TABLIST                                    :1024–1054
│   └── role="tablist" ▶ 4 × <button role="tab" aria-selected>
│         Focus │ Short break │ Long break │ Stopwatch
│       ⚠ switchMode RECORDS the current run and resets — it never blocks
│
├── COUNTDOWN DIAL — SVG, 280×280                    :1059–1145
│   ├── r=128 dashed spinner ring
│   ├── r=104 gradient ring + neon-glow filter
│   └── 60 tick lines
│     role="img" + aria-label; wrapper aria-live="polite"      :605–612 also
│       sets document.title = `${displayText} · ${label} — RoutineOS`
│
├── TRANSPORT CONTROLS
│   ├── <Play>        Start    :1172  shown only when idle | finished
│   ├── <Pause>       Pause    :1178  shown only when running
│   ├── <Play>        Resume   :1184  shown only when paused
│   ├── <RotateCcw>   Reset    :1189  disabled when status === 'idle'
│   ├── <SkipForward> Skip     :1194  disabled when idle; countdown modes only
│   └── <Flag>        Lap      :1205  disabled unless running; stopwatch only
│
├── DURATION PRESETS                                 :1235–1252
│   └── 8 × <button aria-pressed>  [5,10,15,20,25,30,45,60]
├── CUSTOM MINUTES  <Input type=number 1–180> + Apply   :1256–1273
│       ⚠ applyCustom is a NO-OP in stopwatch mode
│
├── SESSION SETTINGS CARD                            :1340–1380
│   ├── <Input type=number 1–12> cyclesBeforeLongBreak   :1348–1362
│   └── 3 × <Switch> autoStartBreak / autoStartFocus / soundEnabled   :1365–1379
│         ⚠ the `disabled` prop is never passed to any Switch
│
├── TODAY CARD                                       :1300–1338
│   └── useMemo todayMinutes :974  —  minutes focused today
│
├── LAPS LIST (stopwatch)                            :1264–1300
│   ├── lapExtremes useMemo :959  — fastest / slowest lap
│   └── <button> Clear laps    :1286  shown only when laps.length > 0
│
├── HISTORY LIST — GET /api/focus?limit=100           :1400–1455
│   ├── <Button> Retry   :1420  shown only when historyError
│   │     ⚠ this retry fetch has NO AbortController (unlike the mount fetch)
│   └── per-session rows with a retry affordance
│
└── saveError — class includes a duplicated "rounded-lg rounded-lg"   :1218
```

### 2.3 `FlipClock` — `src/components/focus/FlipClock.tsx` (188 lines)

```
glass-panel wall clock
├── per-digit CSS-3D flip cards for HH : MM : SS
├── <button> 24h / 12h toggle                                  :~120
├── "EEEE, d MMMM yyyy" date line
├── 1000 ms interval, installed via a 1-shot setTimeout aligned to the
│   second boundary:  1000 - Date.now() % 1000 + 10              :96–101
└── pulse <Skeleton> before mount
```

### 2.4 `/focus/session` — `focus/session/page.tsx` (181 lines)

```
div.container.mx-auto.max-w-5xl.px-4.py-8
│
├── HEADER                                    :72–83
│   ├── <h1> [lucide Timer text-primary] "Focus Session"  :74–76
│   ├── <p> "Review your current session …"                :77–81
│   └── <Button onClick={() => router.push('/focus')}> "Open timer"   :82
│       ⚠ the ONLY control on this page
│
├── {error && <p role="alert" bg-destructive/10 …>}          :85–89
│     ⚠ no retry button — a failed load is unrecoverable without a remount
│
├── section[aria-labelledby=active-session-heading]         :91–134
│   ├── <h2> "Current session"
│   ├── active ? <Card class="glass-panel glow-primary p-5">   :96–126
│   │     ├── title (truncate) + description (line-clamp-2)
│   │     ├── <Badge variant={statusVariant(status)}>        :104
│   │     │     IN_PROGRESS→primary │ COMPLETED→success
│   │     │     ABORTED→warning     │ else→default         :30
│   │     └── <dl class="grid-cols-2 sm:grid-cols-4">   Planned │ Elapsed
│   │              Started │ Completed   (Completed falls back to '—' :122)
│   │           ⚠ Elapsed = actualDuration ?? 0 → "0 min" for a RUNNING session
│   └── : <EmptyState icon=<Clock/> title="No active session" />     :128–132
│
├── section[aria-labelledby=history-heading]                :136–171
│   ├── <h2> [lucide History] "Recent sessions"
│   ├── sessions === null      → <ListSkeleton count={4} />  :142
│   ├── sessions.length === 0  → <EmptyState title="No sessions yet" />  :144–148
│   └── <ul class="space-y-2"> ▶ per-session <li>            :150–169
│         <Card class="flex flex-wrap justify-between p-4">
│           title (truncate) + formatDateTime(startedAt)
│           + "{actualDuration ?? plannedDuration} min"
│           + <Badge>{status.replaceAll('_',' ')}</Badge>
│         ⚠ NO pagination, NO filter, NO date range, NO delete, NO edit
│
└── section[aria-labelledby=focus-stats-heading]             :173–178
    ├── <h2> "Focus stats"
    └── <FocusStats />                                        :177
```

`FocusStats` (261 lines) renders **4 stat cards** (total / today / week / average), a **streak line**, and a **7-day recharts `BarChart`** — all from a single `GET /api/focus?limit=100`.

---

## 3. UI → component mapping

### 3.1 Dependency graph

```
/focus/page.tsx
└── FlipClock, FocusTimer, useSleepSession, Stagger, lucide/Timer

/focus/session/page.tsx
└── FocusStats, apiRequest, {Badge,Button,Card,EmptyState,ListSkeleton},
    lucide/{Clock,History,Timer}, useRouter

FocusTimer
└── Button, Input, Switch, Skeleton, EmptyState, useFocusStore,
    runAchievementCheck, {cn, accentFill}, lucide ×10, react

FocusStats
└── apiRequest, cn, Card, Badge, Skeleton, EmptyState, BarChart, lucide ×5

BarChart
└── recharts ×8, cn

Stagger
└── framer-motion (motion, useReducedMotion), cn
```

### 3.2 `src/components/focus/**` — exhaustive (6 files, no subdirectories)

| # | Path                            | Lines | Directive | Exports | Importer(s) | Status |
| - | -------------------------------- | ----- | --------- | ------- | ----------- | ------ |
| 1 | `FocusTimer.tsx`                 | **1506** | `'use client'` L1 | `FocusTimer` L295, `FocusTimerProps` L49, `TimerMode` L46, `TimerStatus` L47 (default L1505) | `focus/page.tsx:5` | **LIVE** |
| 2 | `FlipClock.tsx`                  | 188    | `'use client'` L1 | `FlipClock` L73 (default L188) | `focus/page.tsx:4` | **LIVE** |
| 3 | `FloatingFocusBar.tsx`           | 193    | `'use client'` L1 | `FloatingFocusBar` L33 (no default) | **`(dashboard)/layout.tsx:10, 63`** | **LIVE** — persistent |
| 4 | `FocusStats.tsx`                 | 261    | `'use client'` L1 | `FocusStats` L67 (default L261) | `focus/session/page.tsx:8, 177` | **LIVE** |
| 5 | `BreakNotification.tsx`          | 102    | `'use client'` L1 | `BreakNotification` L28, props L20 (default L102) | **NONE** | **DEAD** |
| 6 | `PomodoroSettings.tsx`          | 156    | `'use client'` L1 | `PomodoroSettings` L53, value L23, props L32 (default L156) | **NONE** | **DEAD** |

**Dead-file proof:** a repo-wide search for `BreakNotification` and `PomodoroSettings` returns hits **only inside their own files** (self-references in JSDoc, interface names, and the `export default` line). The only external mention of `PomodoroSettings` in the whole repo is its own JSDoc usage example at `:11` and the `/help` FAQ entry at `src/app/(dashboard)/help/page.tsx:99`–`:101`. Neither test file references them.

**One-line render descriptions:**

| Component | Renders |
| --------- | ------- |
| `FocusTimer` | Giant glass-panel card: mode tablist, 280 px SVG countdown dial with neon glow + 60 tick marks, start/pause/resume/reset/skip/lap controls, duration presets + custom-minutes input, session-settings card, "Today" minutes card, stopwatch laps list, session-history list with retry |
| `FlipClock` | `glass-panel` wall clock; per-digit CSS-3D flip HH:MM:SS, 24h/12h toggle, `EEEE, d MMMM yyyy` date line, pulse skeleton before mount |
| `FloatingFocusBar` | `fixed bottom-20 right-3 z-40` mini-timer: collapsed ping-dot pill, or a 288 px glass card with Pause/Resume/Stop and an "Open" link to `/focus/session` |
| `FocusStats` | 4 stat cards, a streak line, and a 7-day `BarChart` |
| `BreakNotification` | framer-motion spring banner (`role="alert"`) with a Coffee icon, "Take a break now" + "Dismiss", and a shrinking progress bar — **never rendered** |
| `PomodoroSettings` | `Card` form with 4 number inputs + 2 `Switch`es + "Save settings" persisting to `routineos_pomodoro_settings` — **never rendered** |

### 3.3 Full transitive component inventory

| Path                                     | Lines | Mode | Role |
| ---------------------------------------- | ----- | ---- | ---- |
| `app/(dashboard)/focus/page.tsx`         | 65    | client | the page |
| `app/(dashboard)/focus/session/page.tsx` | 181   | client | the review page |
| `components/focus/FocusTimer.tsx`        | **1506** | client | the timer |
| `components/focus/FocusStats.tsx`        | 261   | client | the stats |
| `components/focus/FlipClock.tsx`         | 188   | client | the clock |
| `components/focus/FloatingFocusBar.tsx`  | 193   | client | the persistent bar — **layout-mounted** |
| `components/focus/BreakNotification.tsx` | 102   | client | **DEAD** |
| `components/focus/PomodoroSettings.tsx`  | 156   | client | **DEAD** |
| `components/charts/BarChart.tsx`         | 151   | client | recharts `ResponsiveContainer` + `Bar` |
| `components/ui/Button.tsx`              | 52    | client | `isLoading` → `Spinner` |
| `components/ui/Input.tsx`               | 98    | client | forwardRef, `useId`, `error`/`helperText` |
| `components/ui/Switch.tsx`              | 50    | client | `sr-only` checkbox + animated thumb |
| `components/ui/Skeleton.tsx`            | 21    | **none** | `animate-pulse` / `animate-shimmer` |
| `components/ui/ListSkeleton.tsx`        | 21    | **none** | `count` → N rows, `aria-label="Loading list"` |
| `components/ui/EmptyState.tsx`          | 52    | **none** | dashed-border empty state |
| `components/ui/Card.tsx`                | 26    | **none** | `cva` card, 4 variants |
| `components/ui/Badge.tsx`               | 24    | **none** | `cva` pill, 5 variants |
| `components/ui/index.tsx`               | 26    | **none** | the **barrel** — 26 `export *` |
| `components/today/ui.tsx`               | 402   | client | `Stagger` L303 |
| `hooks/useSleepSession.ts`              | 324   | client | module-singleton poller, 15 s |
| `lib/api-client.ts`                     | 131   | **none** | `apiRequest<T>()` L60 |
| `lib/utils.ts`                          | 127   | **none** | `cn` L7, `accentFill` L125 |
| `store/focus.store.ts`                  | 83    | client | the zustand timer snapshot |
| `store/achievement.store.ts`            | 102   | client | `runAchievementCheck()` L90 |

**`Stagger` caveat:** `FocusTimer` uses raw `glass-panel` class strings, **not** the `GlassPanel` component — so the `ACCENTS.focus` token (`--accent-focus: #e11d48` / `#fb7185`, `globals.css:90`, `:137`) is **never used on `/focus`**, even though `ui.tsx:25`–`:27` says those tokens "had zero references."

---

## 4. Frontend architecture

### 4.1 Page structure

| Concern               | Reality (both routes)                                                                                              |
| --------------------- | ------------------------------------------------------------------------------------------------------------------ |
| Component kind        | **Client Component** on both — `'use client'` L1 in each. Not `async`.                                                |
| Sibling route files   | `/focus`: `page.tsx` (65) + `session/page.tsx` (181). **No `loading.tsx`, no `error.tsx`, no `layout.tsx`, no `not-found.tsx`, no `template.tsx`** anywhere under `focus/`, and nothing at all under `focus/session/`. |
| Route-segment loading | Falls through to `src/app/(dashboard)/loading.tsx` (5 lines) → `<PageSkeleton />`. ⚠ Both pages render synchronously, so **this fallback is effectively never shown**. |
| Route-segment error   | Falls through to `src/app/(dashboard)/error.tsx` (97 lines) — reports via `ErrorReporter`, offers "Try again" and "Go to Dashboard". |
| Layout                | `src/app/(dashboard)/layout.tsx` (69 lines, server); `metadata = privateMetadata('RoutineOS')` at `:34` → `robots: { index:false, follow:false, nocache:true }` via `lib/seo.ts:146`. **This is the only robots directive** — neither page declares its own metadata, and `generateMetadata` is impossible on a Client Component. |
| Auth gate             | Inside the `(dashboard)` group; `src/proxy.ts` 307s unauthenticated requests to `/login?callbackUrl=…`.                 |

### 4.2 Providers / contexts active on `/focus`

| Provider                                 | File                                              | Does it affect `/focus` content?                                                                                |
| ---------------------------------------- | ------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `ThemeProvider`                          | `components/providers/ThemeProvider.tsx`          | **Yes** — `glass-panel`, the neon-glow SVG filter, and all `dark:` variants.                                  |
| `AuthProvider`                           | `components/auth/AuthProvider.tsx`                | **Yes, indirectly** — `AppContext.tsx:346` reads `useSession()`.                                               |
| `AppProvider`                            | `context/AppContext.tsx`                          | ❌ **No effect.** `/focus` reads **no** context member — the only audited page that does not use `AppContext`. But it still fetches habits + routines + goals here. |
| `FloatingFocusBar` (layout `:63`)        | `components/focus/FloatingFocusBar.tsx`           | **Yes — the most important coupling on the page.** It subscribes to `useFocusStore` and is the only way to control the timer from another route. |
| `SleepPromptHost` (layout `:65`)         | `components/shared/SleepPromptHost.tsx`           | **Yes, indirectly.** The third `useSleepSession` consumer; its comment at `:40`–`:45` documents the `bottom-36` / `md:bottom-24` offset chosen to clear `FloatingFocusBar`. |
| `OfflineSync` / `OfflineBanner` (layout) | `components/offline/**`                           | Present, but ⚠ focus sessions are **not queued** — `postSession` uses a raw `fetch`.                             |
| `DataErrorBanner` (layout)               | `components/shared/DataErrorBanner.tsx`           | ⚠ **False positives.** It reads `useApp().dataError`, so a failed `/api/goals` renders a **habit/goals error banner on the focus page**. |

`/focus` creates **no** `React.Context` of its own.

### 4.3 State inventory

#### 4.3.1 `/focus` page — **zero** `useState`

| State        | Kind    | Source                                | Notes |
| ------------ | ------- | ------------------------------------- | ----- |
| `sleepActive` | derived | `Boolean(state?.active)` `page.tsx:20` | the **only** derived value; consumed by `FocusTimer` at `:782` |

#### 4.3.2 `FocusTimer` — **18** `useState` (`:298`–`:315`) and **14** `useRef` (`:317`–`:335`, `:778`)

| State | Line | Purpose |
| ----- | ---- | ------- |
| `hydrated` | `:298` | gates the mount-restore effect and the settings write |
| `settings` | `:299` | `FocusSettings` — durations, cycles, three switches |
| `mode` | `:300` | `TimerMode` |
| `status` | `:301` | `TimerStatus` = `'idle'\|'running'\|'paused'\|'finished'` |
| `endsAt` | `:302` | absolute ms epoch |
| `remainingMs` | `:303` | |
| `plannedMs` | `:304` | |
| `swAccumMs` | `:305` | stopwatch accumulated |
| `swRunStart` | `:306` | epoch ms the current stopwatch segment began |
| `swElapsedMs` | `:307` | live stopwatch elapsed |
| `attemptStartedAt` | `:308` | persisted attempt start |
| `cycles` | `:309` | completed pomodoros in this run |
| `laps` | `:310` | stopwatch lap array |
| `customInput` | `:311` | the custom-minutes field |
| `customError` | `:312` | |
| `history` | `:313` | 100 recent sessions |
| `historyError` | `:314` | |
| `saveError` | `:315` | |

Refs: `endsAtRef` · `swRunStartRef` · `swAccumRef` · `onCompleteRef` · `statusRef` · `postedRef` · `lapSeqRef` · `restoreDoneRef` · `pauseRef` · `finishRef` · `startRef` · `stopResetRef` · `postSessionRef` · `prevSleepActiveRef`.

#### 4.3.3 `FocusTimer` — 10 `useEffect`

| Line | Purpose |
| ---- | ------- |
| `:407`–`:411` | keep `onCompleteRef` / `statusRef` / `postSessionRef` in sync outside render |
| `:414`–`:512` | **mount-only** restore from `localStorage` + read settings |
| `:515`–`:544` | history fetch — single `AbortController`, `limit=100` |
| `:547`–`:554` | persist **settings** to `localStorage` |
| `:557`–`:579` | persist **timer** (only while `running`/`paused`; else `removeItem`) |
| `:582`–`:602` | **the single `setInterval` — 200 ms**, keyed on `[status, mode]` |
| `:605`–`:612` | `document.title = ${displayText} · ${label} — RoutineOS` while running |
| `:779`–`:785` | auto-pause when `sleepActive` flips `false → true` |
| `:793`–`:796` | push the snapshot into `useFocusStore` |
| `:800`–`:806` | register `controls` in the store |

#### 4.3.4 `FocusTimer` — 6 `useCallback`, 2 `useMemo`

`postSession` `:341` · `currentElapsedMs` `:615` · `nextModeAfterFocus` `:630` · `beginCountdown` `:636` · `finish` `:652` · `resetToIdle` `:808`. Memos: `lapExtremes` `:959`, `todayMinutes` `:974`.

Handlers: `start` `:730` · `pause` `:756` · `stopAndReset` `:832` · `skip` `:856` · `switchMode` `:876` · `applyDuration` `:901` · `applyCustom` `:918` · `recordLap` `:939`.

#### 4.3.5 `/focus/session` — 3 `useState` + 1 `useEffect`

`active: FocusSessionRow | null` `:45` · `sessions: FocusSessionRow[] | null` `:46` · `error: string | null` `:47`. One `useEffect` `:49`–`:68` running a `Promise.all` of `/api/focus/active` + `/api/focus?limit=20`, guarded by a `cancelled` boolean — **no `AbortController`** (unlike `FocusTimer`).

Local: `formatDateTime` `:21` (`en-US`, `month/day/hour/minute`) · `statusVariant` `:30` · `interface FocusSessionRow` `:10`–`:19` (8 fields).

⚠ **`FocusSessionRow` is declared three times**: `session/page.tsx:10`–`:19`, `FocusStats.tsx:21`–`:29`, `FocusTimer.tsx:106`–`:114`.

#### 4.3.6 `useFocusStore` — `src/store/focus.store.ts` (83 lines), `'use client'` L14

`create<FocusStoreState>()((set, get) => ({...}))` at `:60`. **Not persisted** — in-memory only, dies on every page load.

| Field | Line | Type | Init | Read by | Written by |
| ----- | ---- | ---- | ---- | ------- | ---------- |
| `status` | `:61` | `'idle'\|'running'\|'paused'\|'finished'` | `'idle'` | `FloatingFocusBar:34` | `sync` `:72` ← `FocusTimer:793`–`:796` |
| `mode` | `:62` | `'focus'\|'short-break'\|'long-break'\|'stopwatch'` | `'focus'` | `FloatingFocusBar:35` | `sync` |
| `endsAt` | `:63` | `number \| null` | `null` | `FloatingFocusBar:36` | `sync` |
| `remainingMs` | `:64` | `number` | `0` | `FloatingFocusBar:37` | `sync` |
| `plannedMs` | `:65` | `number` | `0` | `FloatingFocusBar:38` | `sync` |
| `swAccumMs` | `:66` | `number` | `0` | `FloatingFocusBar:39` | `sync` |
| `swRunStart` | `:67` | `number \| null` | `null` | `FloatingFocusBar:40` | `sync` |
| `cycles` | `:68` | `number` | `0` | `FloatingFocusBar:41` | `sync` |
| `controls` | `:69` | `FocusControls` (`pause`/`resume`/`stop`) | `NOOP_CONTROLS` `:54`–`:58` | `pause`/`resume`/`stop` `:76`/`:78`/`:80` | `setControls` `:74` ← `FocusTimer:800`–`:806` |
| `collapsed` | `:70` | `boolean` | `false` | `FloatingFocusBar:42` | `toggleCollapsed` `:82` ← `:92`, `:136` |

| Action | Line | Behaviour |
| ------ | ---- | --------- |
| `sync(snap)` | `:72` | `set(snap)` — **wholesale replace**; a partial object would wipe the rest |
| `setControls(c)` | `:74` | `set({ controls: c })` |
| `pause()` | `:76` | `get().controls.pause()` → delegates into `FocusTimer`'s `pauseRef` |
| `resume()` | `:78` | → `startRef` |
| `stop()` | `:80` | → `stopResetRef` |
| `toggleCollapsed()` | `:82` | flips `collapsed` |

**Every store reference in the app — only 2 importers:**
- `FocusTimer.tsx:43` — `sync` at `:788`, `setControls` at `:789`, consumed `:793`–`:806`.
- `FloatingFocusBar.tsx:7` — 13 selector subscriptions at `:34`–`:46`.

### 4.4 Hooks used on the focus routes

| Hook                              | File | Inputs | Outputs | Side effects |
| --------------------------------- | ---- | ------ | ------- | ------------ |
| `useSleepSession()`               | `hooks/useSleepSession.ts` (324) | – | `{state, loading, busy, error, refresh, start, stop, respond, longRunning}` `:311`–`:321` | module-singleton poller; `GET /api/sleep/session` every **15 s**, visibility-gated `:162`–`:173`; `POLL_MS = 15_000` `:67`, `LONG_SESSION_MS = 16h` `:68`. **`/focus` uses only `state`** |
| `useFocusStore()`                 | `store/focus.store.ts` | – | 10 fields + 6 actions | none |
| `runAchievementCheck()`           | `store/achievement.store.ts:90` | – | `Promise<void>` | `POST /api/achievements/unlock`, fire-and-forget |
| `apiRequest<T>()`                 | `lib/api-client.ts:60` | path, opts | unwrapped `T`; throws `ApiError` | `credentials:'include'`, `cache:'no-store'` |
| `useLocalStorage()`               | `hooks/useLocalStorage.ts` (78) | key, initial | `[value, setValue]` | SSR-safe, cross-tab sync `:40`–`:56`. ⚠ **Only used by the DEAD `PomodoroSettings.tsx:17`** |
| `useKeyboard()`                   | `hooks/useKeyboard.ts` | – | – | 🔴 **Not imported by ANY focus component** |
| `useReducedMotion()`              | framer-motion | – | `boolean` | read by `Stagger` and `Modal` |
| `useRouter()`                     | `next/navigation` | – | router | `push('/focus')` — `/focus/session` only |

### 4.5 Observed implementation detail — `/focus` is the only audited page that does not use `AppContext`

`AppProvider` is mounted in the **root** layout, so on `/focus` it still issues, in `Promise.all` (`AppContext.tsx:535`–`:548`):

1. the paginated `GET /api/habits` loop,
2. `GET /api/routine`,
3. `GET /api/goals`.

**`/focus` reads none of the three.** Worse, `DataErrorBanner` in the `(dashboard)` layout reads `useApp().dataError`, so a failed `/api/goals` renders a **habit/routine/goals error banner on the focus page**. This is a pure false positive caused by the banner being layout-mounted rather than route-aware.

---

## 5. Backend / API architecture

All routes are App Router handlers. Every one performs `await auth()` and returns **401** with no session. **None** declare `runtime` / `dynamic` / `revalidate` (verified: 0 matches), and **none** use `withAuth`, `createApiHandler`, or `withRateLimit`.

### 5.1 Call sites (verbatim, exhaustive)

| Caller                        | Line | Method | Path                     | Transport |
| ----------------------------- | ---- | ------ | ------------------------ | --------- |
| `FocusTimer` (`postSession`)   | `:362`–`:367` | POST | `/api/focus`             | raw `fetch`, `credentials:'include'`, JSON |
| `FocusTimer` (history effect)  | `:519` | GET    | `/api/focus?limit=100`   | raw `fetch` + `AbortController` |
| `FocusTimer` (history **Retry**) | `:1427` | GET | `/api/focus?limit=100` | raw `fetch`, **⚠ no AbortController** |
| `FocusStats`                   | `:75`–`:77` | GET | `/api/focus?limit=100`   | `apiRequest` |
| `/focus/session`               | `:54` | GET    | `/api/focus/active`      | `apiRequest` |
| `/focus/session`               | `:55` | GET    | `/api/focus?limit=20`    | `apiRequest` |
| `achievement.store`            | `:93` | POST | `/api/achievements/unlock` | `apiRequest`, fire-and-forget |
| `useSleepSession` (via `/focus`) | `:106` | GET | `/api/sleep/session`   | raw `fetch`, 15 s poll |

### 5.2 `src/app/api/focus/**` — 4 route files

| Route file                       | Lines | Handlers | `await auth()` | Zod schema | Service | Repository | Prisma |
| -------------------------------- | ----- | -------- | -------------- | ---------- | ------- | ---------- | ------ |
| `focus/route.ts`                 | 90  | GET `:10`, POST `:53` | ✅ `:12`, `:55` | `focusQuerySchema` `:26` / `createFocusSessionSchema` `:61` | `listSessions` `:34`, `createSession` `:70` | `findSessions`, `createSession` | `FocusSession` (+ `Category`, `_count.breaks`) |
| `focus/active/route.ts`          | 26  | GET `:9` | ✅ `:12` | ❌ **none** | `getActiveSession` `:16` | `findActiveByUserId` | `FocusSession`, `UserSettings` |
| `focus/[id]/route.ts`            | 117 | GET `:15`, PATCH `:43`, DELETE `:90` | ✅ ×3 `:17`, `:45`, `:92` | `updateFocusSessionSchema` `:53` — **PATCH only** | `getSession`, `updateSession`, `deleteSession` | `findById`, `.update`, `.delete` | `FocusSession`, `Category` |
| `focus/[id]/complete/route.ts`   | 68  | POST `:20` | ✅ `:23` | `completeFocusSessionSchema` `:35` | `completeSession` `:43` | `completeSession` | `FocusSession` |

### 5.3 Non-focus routes in the domain

| Path                              | Called by either page? | Consumers |
| --------------------------------- | ---------------------- | --------- |
| `api/focus/[id]/route.ts`         | ❌ | **none anywhere in `src/`** |
| `api/focus/[id]/complete/route.ts`| ❌ | **none anywhere in `src/`** |
| `api/breaks/route.ts` (81 lines)  | ❌ | **none anywhere in `src/`** |
| `api/time-tracking/**` (4 files)  | ❌ | time-tracking UI only |

🔴 **`/focus` never touches `TimeEntry` or `Task` at all.** The `FocusTimer.tsx:776`–`:777` comment ("the server also stops the underlying TimeEntry on sleep start") describes a real but **indirect** coupling in `sleep-session.service.ts:350, 435, 643` (`timeEntryRepository.stopRunning(userId)`). The focus timer never starts a `TimeEntry`, so the two data sets are entirely disjoint.

### 5.4 Zod schemas — `src/schemas/focus.schema.ts` (152 lines)

| Export                              | Line | Notes |
| ----------------------------------- | ---- | ----- |
| `dateSchema`                         | 16   | `z.preprocess` → `z.date()`; **rejects `null`** (which would coerce to epoch) |
| `nullableDateSchema`                 | 22   | + `.nullable()` to allow clearing |
| `optionalDateSchema`                 | 27   | |
| `optionalNullableDateSchema`         | 30   | |
| `legacyCreateFocusSessionSchema`     | 32   | title 1–200, description ≤1000, `categoryId?`, `plannedDuration` positive int (minutes), `techniques?[]`, `energyBefore?` 1–5, `startedAt?` |
| `focusTimerTypeSchema`               | 56   | `z.enum(['focus','short-break','long-break','stopwatch'])` |
| `focusTimerPayloadSchema`            | 63   | `plannedSeconds` int >0 **≤10800**; `actualSeconds` int ≥0 ≤10800; `startedAt?`, `endedAt?`, `completed?: boolean` |
| **`createFocusSessionSchema`**       | **85** | **`z.union([legacy, timerPayload])`** — the one `POST /api/focus` validates against |
| `updateFocusSessionSchema`           | 90   | title/description/`categoryId`(nullable)/plannedDuration/notes |
| `completeFocusSessionSchema`         | 98   | 4 ratings 1–5, `distractions?[]`, `notes?` |
| **`focusQuerySchema`**               | **107** | `from?`, `to?`, `status?` enum `IN_PROGRESS\|PAUSED\|COMPLETED\|ABORTED\|ACTIVE`, `limit` 1–100, `offset` ≥0 |
| `createBreakSchema`                  | 125  | `breakType?` enum `SHORT\|LONG\|MEAL\|WALK\|REST\|CUSTOM` — 🔴 **dead** |
| `breakQuerySchema`                   | 137  | from/to/breakType/limit/offset — 🔴 **dead** |
| Types `:147`–`:152`                  |      | `CreateFocusSessionInput`, `UpdateFocusSessionInput`, `CompleteFocusSessionInput`, `FocusQueryParams`, `CreateBreakInput`, `BreakQueryParams` |

### 5.5 `FocusService` — `src/server/services/focus.service.ts` (314 lines)

`export class FocusService` `:36`; singleton `focusService` `:314`. Private deps: `FocusRepository`, `BreakRepository`, `UserRepository` `:37`–`:45`.

| Method | Line | Behaviour |
| ------ | ---- | --------- |
| `getActiveSession(userId)` | **53**–**71** | ① `findActiveByUserId(userId)` `:54` → `focusSession.findFirst({where:{userId, completedAt:null, abortedAt:null}, orderBy:{startedAt:'desc'}})`. ② `null` → return `null` `:55`. ③ `dayBoundsInTimezone(await this.timezoneFor(userId))` `:62`–`:64`. ④ `timezoneFor` `:74`–`:79`: `userRepository.getSettings(userId).catch(() => null)` → `settings?.timezone \|\| DEFAULT_TZ`. ⑤ **Staleness gate** `:66`–`:68`: if `active.startedAt < startOfToday \|\| >= endOfToday` → `null`. ⑥ Return `{...active, status: getFocusSessionStatus(active)}` `:70`. |
| `listSessions(userId, query)` | **88**–**118** | ① `findSessions(userId, {from, to, limit, offset})` `:89`–`:94` — **DB paginates first**. ② **Post-pagination** status filter `:96`–`:105`; `ACTIVE` is aliased to `IN_PROGRESS` `:100`–`:101`. ③ Map each row through `getFocusSessionStatus(item)` `:108`–`:111`. ④ Return `{data, meta:{total: filtered.length, limit, offset}}` `:112`–`:116`. ⚠ **`meta.total` is the filtered page length, not the true row count.** |
| `createSession(userId, input)` | **128**–**167** | **Timer-payload branch** (`'type' in input`, `:129`–`:156`): ① `titles` map `:130`–`:135` — `focus→'Focus session'`, `short-break→'Short break'`, `long-break→'Long break'`, `stopwatch→'Stopwatch session'`. ② `plannedDuration: Math.max(1, Math.round(plannedSeconds/60))` `:148`. ③ `actualDuration: Math.max(0, Math.round(actualSeconds/60))` `:149`. ④ `techniques: input.type === 'focus' ? ['Pomodoro'] : undefined` `:150`. ⑤ `startedAt: input.startedAt ?? new Date()` `:151`. ⑥ `completed === true` → `{completedAt: endedAt ?? now}` **else** → `{abortedAt: endedAt ?? now}` `:152`–`:154`. **Legacy branch** `:158`–`:166`. |
| `getSession(userId, sessionId)` | 228–234 | `findById`; throws `NotFoundError('Focus session')` if null |
| `updateSession(userId, sessionId, input)` | 237–250 | `getSession` (ownership + existence), then `focusRepository.update(...)` |
| `deleteSession(userId, sessionId)` | 253–256 | `getSession`, then `focusRepository.delete(userId, sessionId)` |
| `listBreaks(userId, query)` | 175–208 | 🔴 dead route only. ① `Promise.all([breakRepository.list, breakRepository.count])` `:176`–`:179`. ② Best-effort next-break hint in `try/catch` `:182`–`:197`. |
| `createBreak(userId, input)` | 213–223 | 🔴 dead route only |
| `completeSession(userId, sessionId, input)` | 274–311 | 🔴 dead route only. ① `getSession` `:279`. ② `if (focusSession.completedAt) throw new ValidationError('Focus session already completed')` `:281`–`:283`. ③ Synthesise a `FocusTimerSnapshot` treating the planned timebox as fully run `:286`–`:294`. ④ `completeSession(snapshot)` from `lib/focus/session-manager` `:296`. ⑤ `actualDuration = Math.max(1, Math.round(durationSeconds/60))` `:297`–`:300`. ⑥ `focusRepository.completeSession(...)` `:302`–`:310`. |
| `timezoneFor(userId)` | 74–79 | `private` |

#### 🔴 The `abortedAt` black hole — see §25

`focus.service.ts:152`–`:154` **intends** to persist `abortedAt`, and an 18-line comment at `:136`–`:145` explains exactly why it exists. **`FocusRepository.createSession` (`focus.repository.ts:75`–`:101`) never writes it.** Its `CreateFocusSessionData` interface (`:11`–`:21`) has no `abortedAt` field, and the Prisma `data` object (`:81`–`:96`) lists only `title, description, plannedDuration, actualDuration, startedAt, completedAt, energyBefore, techniques, category, user`.

The call site passes it through a **conditional object spread** — `...(input.completed === true ? {...} : { abortedAt: ... })` — and TypeScript deliberately skips excess-property checking on spread expressions, so this compiles cleanly.

**Consequence:** every Stop / Skip / mode-switch is persisted with `completedAt: null` **and** `abortedAt: null` — exactly the shape `findActiveByUserId` (`focus.repository.ts:114`) uses to mean *"a session is currently running."*

**Related:** `FocusSession.pausedAt` (`schema.prisma:1626`) is referenced by `getFocusSessionStatus` (`types/focus.ts:476`), by `'PAUSED'` in `focusQuerySchema` (`focus.schema.ts:113`) and by `/focus/session`'s `statusVariant` — but **`pausedAt` is never written by any code in the repo** (5 repo-wide hits, all comments + the schema). **`PAUSED` is unreachable in production.**

### 5.6 `FocusRepository` — `src/server/repositories/focus.repository.ts` (416 lines)

`class FocusRepository extends BaseRepository` `:71`.

| Method | Line | Prisma call | Reached from |
| ------ | ---- | ----------- | ------------ |
| `createSession(userId, data)` | **75** | `focusSession.create` — **🔴 DROPS `abortedAt`** | `focus.service.createSession` |
| `findActiveByUserId(userId)` | 111 | `focusSession.findFirst {completedAt:null, abortedAt:null}` | `focus.service.getActiveSession` + `listBreaks` |
| `completeSession(userId, sessionId, data)` | 125 | `findById`, then `focusSession.update` | dead route |
| `findById(userId, sessionId)` | 170 | `focusSession.findFirst` + `include {category, breaks{orderBy startedAt asc}}` | `getSession` / `completeSession` |
| `findSessions(userId, query)` | 189 | `focusSession.findMany` + `include {category select(id,name,color), _count.breaks}` + `orderBy startedAt desc` + `buildPaginationQuery` | `focus.service.listSessions`; **`analytics.service:209`** |
| `update(sessionId, userId, data)` | 231 | `focusSession.update` (category `connect`/`disconnect`/`undefined`) | dead route |
| `delete(userId, sessionId)` | 260 | `focusSession.delete` | dead route |
| `countCompletedSessions(userId, startedAfter?)` | 274 | `focusSession.count {completedAt:{not:null}}` | ✅ **`achievement.service.ts:148`** |
| `getStats(userId, from?, to?)` | 294 | `focusSession.aggregate {_count, _sum.actualDuration, _avg.actualDuration, _max.actualDuration}` | ✅ `analytics.service:199`, `achievement.service:152`, `dashboard-overview.service:222`, `server/analytics/{yearly:186, monthly:145}` |
| **`createBreak(userId, data)`** | **336** | ownership `findFirst`, then `break.create` | 🔴 **DEAD** |
| **`findBreakById(userId, breakId)`** | **371** | `break.findFirst` + `include focusSession{id,title}` | 🔴 **DEAD** |
| `listBreaks(userId, from?, to?)` | 392 | `break.findMany` `orderBy startedAt asc` | ✅ `analytics.service:208` — ⚠ **`focus.service.listBreaks` uses `BreakRepository.list`, a different method** |

Local types: `CreateFocusSessionData` `:11`, `CompleteFocusSessionData` `:23`, `FocusSessionQueryParams` `:34`, `FocusSessionUpdateData` `:41`, `CreateBreakData` `:49`, `FocusStats` `:59`, `toFocusDate` `:66`.

### 5.7 `BreakRepository` — `src/server/repositories/break.repository.ts` (148 lines)

`create` `:52` → dead route · **`findById` `:101` 🔴 DEAD** · `list` `:114` → dead route · `count` `:135` → dead route.

### 5.8 `TimeEntryRepository` — `src/server/repositories/time-entry.repository.ts` (257 lines)

**Not used by `/focus`.** All 8 methods are live via `time-tracking.service`. `stopRunning` `:166` is the only one that touches `/focus`'s world — from `sleep-session.service:350, 435, 643`.

| Method | Line | Reached from |
| ------ | ---- | ------------ |
| `create` | 69  | `time-tracking.service:49, 79` |
| `findById` | 105 | `time-tracking.service:107` |
| `findRunning` | 119 | `time-tracking.service:72, 160`; `stopRunning:168` |
| `update` | 134 | `time-tracking.service:146` |
| `stopRunning(userId, endTime=new Date())` | 166 | `time-tracking.service:98`; **`sleep-session.service:350, 435, 643`** |
| `delete` | 185 | `time-tracking.service:155` |
| `list` | 198 | `analytics.service:210`; `time-tracking.service:33` |
| `count` | 232 | `time-tracking.service:34` |

---

## 6. Database dependency

### 6.1 Models read/written by `/focus`

| Model                  | Purpose                    | Key fields used                                                                                             | Rel. to User | Read                       | Write                                     | Indirect                        |
| ---------------------- | -------------------------- | ----------------------------------------------------------------------------------------------------------- | ----------- | -------------------------- | ----------------------------------------- | ------------------------------- |
| `FocusSession`         | one timed focus block      | `id,title,description,plannedDuration,actualDuration,startedAt,completedAt,abortedAt,pausedAt,categoryId,techniques,energyBefore,…` | `userId`    | ✅ (`findSessions`, `findActiveByUserId`, `findById`) | ✅ **only `createSession`** | ✅ (`getStats`, `countCompletedSessions`) |
| `Break`                | a logged break             | `focusSessionId, startedAt, endedAt, durationMinutes, breakType, quality, notes`                             | `userId`    | ✅ (`_count.breaks`; `analytics.service:208`) | 🔴 **never from `/focus`** | ✅                              |
| `Category`             | a grouping                 | `id,name,color` (selected)                                                                                   | `userId`    | ✅ (nested include)        | ❌                                        | ✅                              |
| `UserSettings`         | per-user preferences       | `timezone`                                                                                                  | 1:1         | ✅ (`timezoneFor` `:74`)    | ❌                                        | ✅                              |
| `TimeEntry`            | running timer              | —                                                                                                           | `userId`    | ❌                         | ❌ **but stopped by `startSleep`** | ✅                              |
| `Achievement`          | unlocked badges            | `type`, `title`, `level`                                                                                     | `userId`    | ✅ (fire-and-forget)       | ✅                                        | ✅                              |
| `NotificationLog`      | notification rows          | `ACHIEVEMENT_UNLOCKED`                                                                                       | `userId`    | ❌                         | ⚠️ possible                               | ✅                              |
| `ProductivityPattern`  | AI-discovered pattern      | `patternType, timeOfDay, dayOfWeek, confidence, metrics`                                                     | `userId`    | ❌                         | ❌ **nothing in the repo reads or writes it** | ✅                              |
| `Task`                 | a to-do                    | —                                                                                                           | `userId`    | ❌                         | ❌                                        | ✅                              |

### 6.2 🔴 `FocusSession` has **no `type` / `mode` column**

A 5-minute "Short break" and a 25-minute "Focus session" are stored in the **same table** with the only discriminator being the **`title` string** (`focus.service.ts:130`–`:135`). `techniques` gets `["Pomodoro"]` for focus only (`:150`) — the sole machine-readable discriminator, and it is `NULL` for breaks and stopwatch.

There is also **no status column at all.** Status is derived at runtime by `getFocusSessionStatus` (`types/focus.ts:469`–`:478`):

```ts
if (session.completedAt) return 'COMPLETED';
if (session.abortedAt)   return 'ABORTED';
if (session.pausedAt)    return 'PAUSED';
return 'IN_PROGRESS';
```

⚠ `'CANCELLED'` is declared in `FocusSessionStatus` (`types/focus.ts:21`–`:27`) but **never returned**. `PAUSED` is unreachable (no writer for `pausedAt`). `abortedAt` is intended but never written (§25).

### 6.3 🔴 **There are no focus-domain Prisma enums**

A grep of `prisma/schema.prisma` for `FocusSessionStatus`, `TimeEntryType`, `TimeEntryStatus` returns **zero matches**. All 35 enums in the file are unrelated to focus or timing:

`Role`(15) · `Theme`(21) · `DeviceType`(28) · `SubscriptionPlan`(37) · `SubscriptionStatus`(44) · `DayType`(52) · `RoutineLogStatus`(61) · `HabitTier`(69) · `HabitStatus`(83) · `HabitLogStatus`(91) · `HabitOverrideType`(99) · `HabitFrequencyType`(107) · `GoalType`(119) · `GoalPriority`(128) · `GoalStatus`(139) · `ProjectStatus`(149) · `TaskStatus`(159) · `TaskPriority`(167) · `WeatherCondition`(180) · `AchievementType`(192) · `InsightPeriod`(211) · `NotificationType`(220) · `NotificationStatus`(281) · `TemplateType`(290) · `IntegrationProvider`(303) · `ExportFormat`(316) · `ExportStatus`(323) · `FeedbackType`(332) · `FeedbackStatus`(341) · `AuditAction`(353) · `SleepSessionStatus`(1356) · `SleepStartSource`(1362)

Status, timer mode, timer state and break type are **all TypeScript-level unions**:

```ts
// types/focus.ts:21–27
export type FocusSessionStatus = 'IN_PROGRESS' | 'PAUSED' | 'COMPLETED' | 'ABORTED' | 'CANCELLED';
// types/focus.ts:152   export type FocusTimerState = ...
// types/focus.ts:168   export type BreakType = ...
```

And `Break.breakType` in the DB is a bare `String?` (`schema.prisma:1663`) — free text, not even constrained to the union.

### 6.4 Key Prisma model shapes

```prisma
model FocusSession {                                 // :1602–1649
  id     String @id @default(cuid())
  userId String
  user   User   @relation(..., onDelete: Cascade)

  title       String
  description String? @db.Text

  categoryId String?
  category   Category? @relation(..., onDelete: SetNull)

  plannedDuration Int      // MINUTES
  actualDuration  Int?     // MINUTES
  startedAt       DateTime
  completedAt     DateTime?
  abortedAt       DateTime?    // :1625 — 4-line doc comment :1620–1624
                                     // 🔴 NEVER WRITTEN
  pausedAt        DateTime?    // :1626 — 🔴 NEVER WRITTEN

  focusRating        Int?   // 1-5
  productivityRating Int?   // 1-5
  difficultyRating   Int?   // 1-5
  energyBefore       Int?   // 1-5
  energyAfter        Int?   // 1-5
  distractions       String?   // JSON array
  techniques         String?   // JSON array
  notes              String? @db.Text
  breaks             Break[]

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@index([userId, startedAt])  @@index([categoryId])  @@index([userId, createdAt])
}

model Break {                                       // :1651–1673
  id     String @id @default(cuid())
  userId String ; user User @relation(Cascade)
  focusSessionId String?
  focusSession   FocusSession? @relation(..., onDelete: SetNull)
  startedAt DateTime ; endedAt DateTime? ; durationMinutes Int?
  breakType  String?      // ⚠ free text, NOT an enum
  quality    String?      // ⚠ free text
  notes      String?
  createdAt DateTime @default(now())
}

model TimeEntry {                                   // :1679–1710
  id     String @id @default(cuid())
  userId String ; user User @relation(Cascade)
  description String
  startTime DateTime ; endTime DateTime? ; duration Int?   // auto-calculated minutes
  projectId String? / project Project?
  habitId   String? / habit   Habit?
  goalId    String? / goal    Goal?
  billable Boolean @default(false) ; rate Float?
  tags String?   // JSON
  isAutomatic Boolean @default(false)
  createdAt DateTime @default(now())
  // ⚠ NO updatedAt
}

model ProductivityPattern {                         // :1712–1730  — focus-adjacent
  userId String
  patternType String ; timeOfDay String ; dayOfWeek String   // JSON
  confidence Float? ; metrics String @db.Text
  discoveredAt DateTime? ; lastSeenAt DateTime? ; createdAt DateTime @default(now())
  @@unique([userId, patternType, timeOfDay])
  // 🔴 nothing in the repo reads or writes this model
}
```

### 6.5 Fields on `FocusSession` that `/focus` can never write

| Field                  | Who could write it                  | Reachable from `/focus`? |
| ---------------------- | ------------------------------------ | ------------------------ |
| `completedAt`          | `createSession` (`completed === true`) | ✅ only if the countdown ran to zero |
| `abortedAt`            | `createSession` (`completed !== true`) | 🔴 **intended but dropped** — §25 |
| `pausedAt`             | **nothing in the repo**              | ❌ never |
| `categoryId`           | the **legacy** `createFocusSessionSchema` branch only | ❌ `FocusTimer` uses the timer-payload branch |
| `description`          | legacy branch only                   | ❌ |
| `focusRating`, `productivityRating`, `difficultyRating`, `energyAfter`, `distractions`, `notes` | only `POST /api/focus/[id]/complete` | ❌ **dead route** |

**Net:** `/focus` writes **exactly six fields** of a 24-field model — `title`, `plannedDuration`, `actualDuration`, `startedAt`, `completedAt`, `techniques` — and never sets a category, a description, a rating, or a note.

---

## 7. Time and duration logic

### 7.1 The ticking loop — the only `setInterval` in `FocusTimer`

```
useEffect(() => {                                     FocusTimer.tsx:582–602
  if (status !== 'running') return;
  const id = setInterval(() => {                      // 200 ms
     if (mode === 'stopwatch') {
        swElapsedMs   = Date.now() - swRunStart
        remainingMs   = swAccumMs + swElapsedMs
     } else {
        remainingMs   = max(0, endsAt - Date.now())
     }
  }, 200);
  return () => clearInterval(id);
}, [status, mode]);
```

- **200 ms** is 5× finer than the 1 s display resolution. It exists so `endsAt`-based countdowns and `swRunStart`-based stopwatch ticks share one loop.
- The loop is **absolute-epoch based**, not delta-accumulated, for countdown modes — so a backgrounded tab that throttles the interval still lands on the right value when it resumes.
- For **stopwatch**, `swRunStart` is also absolute, so **time with the tab closed still counts** (`:440`–`:449` on restore).

### 7.2 `FlipClock`'s interval — a clever one

```
const delay = 1000 - Date.now() % 1000 + 10            FlipClock.tsx:96–101
setTimeout(() => setInterval(tick, 1000), delay)
```

A 1-shot `setTimeout` aligned to the second boundary, **plus 10 ms**, so the first tick lands just *after* the wall-clock second rolls over rather than up to a second before it. This avoids the visible "clock lags by a fraction of a second" that a naive `setInterval(tick, 1000)` produces.

### 7.3 Session posting — exactly once per run

```
postedRef   ← the once-only guard                      FocusTimer.tsx:317–335
postSession                                                          :341
  POST /api/focus  {type, plannedSeconds, actualSeconds, startedAt, endedAt, completed}
  → focus.service.createSession                          focus.service.ts:128
     completed === true  → {completedAt: endedAt ?? now}                :152–153
     completed !== true  → {abortedAt:   endedAt ?? now}   🔴 DROPPED   :154
  → FocusRepository.createSession                         focus.repository.ts:75
  → focusSession.create  ◄── only the fields listed in §6.5
then runAchievementCheck()  (fire-and-forget)
```

`postedRef` is set to `true` in every terminal path (`finish`, `stopAndReset`, `skip`, `switchMode`) and is **also** set during the expired-on-mount restore path (`:474`–`:493`), so a reload does not double-post.

### 7.4 Duration conversions

| Where        | Conversion                                                | Line |
| ------------ | --------------------------------------------------------- | ---- |
| client → API | seconds                                                  | `FocusTimer` `postSession` `:362`–`:367` |
| API → DB     | `Math.max(1, Math.round(plannedSeconds / 60))`            | `focus.service.ts:148` |
| API → DB     | `Math.max(0, Math.round(actualSeconds / 60))`             | `focus.service.ts:149` |
| validation   | `plannedSeconds` int >0 **≤10800** (3 h); `actualSeconds` int ≥0 ≤10800 | `focus.schema.ts:63` |
| legacy       | `plannedDuration` already in **minutes**, positive int    | `focus.schema.ts:32` |

⚠ **Rounding is lossy in the up direction for sub-minute runs**: a 30-second focus block persists as `plannedDuration: 1`, which then displays as "1 min".

### 7.5 Duration clamps on read — every field is validated

| Helper | Line | Behaviour |
| ------ | ---- | --------- |
| `clampInt(v, min, max)` | `:142`–`:145` | returns `min` for `NaN` / non-finite |
| durations | `:251`–`:253` | clamped **1–180** minutes |
| `cyclesBeforeLongBreak` | `:255` | clamped **1–12** |
| `savedCycles` | `:430` | clamped **0–1000** |
| `safeRemaining` | `:461`–`:463` | clamped to `[0, planned]` |

### 7.6 `nextModeAfterFocus` — the pomodoro cycle, re-implemented inline

```
nextModeAfterFocus()                                        FocusTimer.tsx:630–634
  mode === 'focus' → (cycles + 1) % cyclesBeforeLongBreak === 0
                       ? 'long-break'
                       : 'short-break'
  otherwise        → 'focus'
```

⚠ **`src/lib/focus/pomodoro.ts` (170 lines) already implements this** — `nextPhaseFor` `:65`, `durationForPhase` `:50`, `computeCycle` `:82`, `buildTimeline` `:111`, `isCycleComplete` `:156`, `cycleLengthMinutes` `:164` — but only `POMODORO_DEFAULTS` is imported outside that file (by `break-scheduler.ts:1` and dead `PomodoroSettings.tsx:16`). `FocusTimer` **re-implements the same logic inline** (`:630`–`:634`, `:147`–`:152`) using its **user-configurable** settings, so the `POMODORO_DEFAULTS`-based helpers are structurally bypassed.

### 7.7 The `/focus/session` "Elapsed" value is always wrong for a running session

```
<dl class="grid-cols-2 sm:grid-cols-4">                      session/page.tsx:110–124
  Planned   = active.plannedDuration
  Elapsed   = active.actualDuration ?? 0        ◄── :113
  Started   = formatDateTime(active.startedAt)
  Completed = active.completedAt ? formatDateTime(...) : '—'
```

A **running** session has `actualDuration === null`, because `actualDuration` is only ever written at the moment the session is **posted** — i.e. at its end. So a live session shows **"0 min"** elapsed, forever, no matter how long it has been running. Both the server (which has `startedAt`) and the client (which receives `startedAt`) could compute it; neither does.

---

## 8. Complete user actions (serial)

### 8.1 On mount of `/focus`

| # | Action                                      | Mechanism                                  | Requests |
| - | ------------------------------------------- | ------------------------------------------ | -------- |
| 1 | `AppProvider` mounts (root layout)           | `AppContext.tsx:535`–`:548`                | `GET /api/habits` (loop) ∥ `GET /api/routine` ∥ `GET /api/goals` — ⚠ **none read by `/focus`** |
| 2 | `useSleepSession()` starts polling           | module singleton, `POLL_MS = 15_000`       | `GET /api/sleep/session` **every 15 s**, visibility-gated |
| 3 | `FocusTimer` mount-restore                   | `FocusTimer.tsx:414`–`:512`, guarded by `restoreDoneRef` | – |
| 4 | settings read from `localStorage`            | `readSettings` `:241`–`:263`               | – |
| 5 | history fetch                               | `FocusTimer.tsx:515`–`:544`                 | `GET /api/focus?limit=100` |
| 6 | settings write-back                          | `FocusTimer.tsx:547`–`:554` fires on `hydrated` | – |
| 7 | `FlipClock` mounts, starts its 1 s clock     | `FlipClock.tsx:96`–`:101`                  | – |
| 8 | store sync + control registration            | `FocusTimer.tsx:793`, `:800`                | – |

**Total: 3 + N + 1 on mount, plus 1 request every 15 s for the life of the page.**

### 8.2 Timer actions — the complete control set

| # | User action        | Handler                  | Request | Notes |
| - | ------------------ | ------------------------ | ------- | ----- |
| 1 | Click a mode tab   | `switchMode` `:876`      | `POST /api/focus` with `completed: false` | ⚠ **records the current run and resets** — never blocks. Tabs are never disabled. |
| 2 | Click **Start**    | `start` `:730`            | – | `beginCountdown` `:636`; `status = 'running'` |
| 3 | Click **Pause**    | `pause` `:756`            | – | `status = 'paused'`; 🔴 **does not write `FocusSession.pausedAt`** |
| 4 | Click **Resume**   | via `start` `:730`        | – | |
| 5 | Click **Reset**    | `stopAndReset` `:832`     | `POST /api/focus` `completed: false` | disabled when `idle`; 🔴 the abort is dropped (§25) |
| 6 | Click **Skip**     | `skip` `:856`             | `POST /api/focus` `completed: false` | countdown modes only; disabled when `idle` |
| 7 | Click **Lap**      | `recordLap` `:939`        | – | stopwatch only; disabled unless `running` |
| 8 | Click a duration preset | `applyDuration` `:901` | – | 8 pills, `aria-pressed` |
| 9 | Type minutes + **Apply** | `applyCustom` `:918`  | – | 1–180; ⚠ **a no-op in stopwatch mode** |
| 10 | Flip a `Switch`    | inline                    | – | `autoStartBreak` / `autoStartFocus` / `soundEnabled`; ⚠ the `disabled` prop is **never** passed |
| 11 | Click **Clear laps** | inline `:1286`           | – | only when `laps.length > 0` |
| 12 | Click **Retry** (history error) | inline `:1420`       | `GET /api/focus?limit=100` | ⚠ **no `AbortController`** — unlike the mount fetch |
| 13 | Timer reaches zero | `finish` `:652`           | `POST /api/focus` `completed: true` | also sets `document.title`, clears the store, may auto-start the next phase |
| 14 | Sleep session starts | effect `:779`–`:785`    | – | auto-pauses; 🔴 no notification, no UI explaining why |

**Keyboard shortcuts: NONE.** Verified — zero `onKeyDown`, zero `keydown`/`keyup` listeners, zero `useKeyboard` imports anywhere in `src/components/focus/**`. `src/hooks/useKeyboard.ts` exists but is **not imported by any focus code**. All 14 actions above are **pointer-only**.

### 8.3 `/focus/session` actions

| # | User action        | Handler                        | Requests |
| - | ------------------ | ------------------------------ | -------- |
| 1 | Page mounts        | `useEffect` `:49`–`:68`        | `Promise.all([GET /api/focus/active, GET /api/focus?limit=20])` |
| 2 | Click **Open timer** | `router.push('/focus')` `:82` | – |
| 3 | `FocusStats` mounts | `useEffect` `:71`–`:87`        | `GET /api/focus?limit=100` |

**Three actions total. No retry, no refresh, no pagination, no filter, no delete, no edit** — even though `GET`/`PATCH`/`DELETE /api/focus/[id]` all exist.

---

## 9. What can the user create

| Thing                    | Entry point                | Request                                          | Validation                                      | Notes |
| ------------------------ | -------------------------- | ------------------------------------------------ | ----------------------------------------------- | ----- |
| **A `FocusSession` row** | Completing / stopping / skipping the timer, **or** letting an expired timer be caught on mount | `POST /api/focus` `FocusTimer:362` | `createFocusSessionSchema` = `z.union([legacy, timerPayload])` `focus.schema.ts:85` | Exactly **one** POST per run, guarded by `postedRef`. Writes 6 of 24 fields. |
| **A `Break` row**        | ❌ **no UI anywhere**        | `POST /api/breaks` (no caller)                    | `createBreakSchema` `focus.schema.ts:125`       | 🔴 `FocusRepository.createBreak` is dead; `focus.service` uses `BreakRepository.create` instead — and **that** route is orphaned. |
| **A `TimeEntry`**        | ❌ **never from this page** | `POST /api/time-tracking/start`                  | –                                                | A focus session and a time entry are disjoint.   |
| **An `Achievement`**     | indirect — `runAchievementCheck()` after a session posts | `POST /api/achievements/unlock` | –                                   | Fire-and-forget. |

---

## 10. What can the user edit

| Target                        | Entry point                          | Request                          | Validation                | Notes |
| ----------------------------- | ------------------------------------ | -------------------------------- | ------------------------- | ----- |
| **Timer durations**           | a preset pill, or **Apply** + a number | **none** — `localStorage` only | clamped 1–180 `:251`–`:253` | ⚠ **not persisted to the server.** `UserSettings` has no focus columns. |
| **`cyclesBeforeLongBreak`**   | the number input `:1348`             | **none** — `localStorage`         | clamped 1–12 `:255`        | same |
| **`autoStartBreak` / `autoStartFocus`** | `Switch` `:1365`, `:1370` | **none** — `localStorage` | –                         | same |
| **`soundEnabled`**            | `Switch` `:1375`                     | **none** — `localStorage`         | –                         | same. 🔴 **nothing in the repo plays a sound** |
| **FlipClock 12h / 24h**       | the toggle button                    | **none** — `localStorage`         | `'12' \| '24'` raw string | |
| **A `FocusSession` row**      | ❌ **no UI**                          | `PATCH /api/focus/[id]` (no caller) | `updateFocusSessionSchema` `focus.schema.ts:90` | 🔴 orphaned |
| **Laps** (in-session)         | **Clear laps** `FocusTimer.tsx:1286`  | none                              | –                         | in-memory only; cleared on stop |

### 10.1 The settings are local-only, and there are two competing shapes

| | Dead `PomodoroSettings` | Live `FocusTimer` |
| - | ------------------------ | ----------------- |
| Key | `routineos_pomodoro_settings` | `routineos:focus-settings:v1` |
| Hook | `useLocalStorage` (cross-tab sync, SSR-safe) | raw `getItem`/`setItem` in `try/catch` |
| Shape | `PomodoroSettingsValue` — 4 numbers + 2 booleans | `FocusSettings` — 3 durations, 1 cycles count, 3 booleans |
| UI | 4 number inputs + 2 `Switch`es + "Save settings" | 1 number input + 3 `Switch`es + 8 preset pills + a custom-minutes field |
| Rendered | 🔴 **never** | ✅ yes |

Two shapes for the same conceptual data, one key used by nobody.

---

## 11. What can the user delete

| Target                 | Entry point                                     | Request                              | Effect |
| ---------------------- | ----------------------------------------------- | ------------------------------------ | ------ |
| **A `FocusSession`**   | ❌ **no UI anywhere**                             | `DELETE /api/focus/[id]` (no caller)  | 🔴 orphaned; `DELETE` exists with **no confirmation UI on any route** |
| **A lap**              | **Clear laps** `FocusTimer.tsx:1286`             | none                                  | in-memory only |
| **The persisted timer**| implicit — `reset`/`finish` calls `removeItem`   | none                                  | `localStorage` key removed `:574`; 🔴 **`cycles` is destroyed**, though `FloatingFocusBar` renders "N pomodoros" from it |
| **A `Break`**          | ❌ no UI                                          | no such route exists                  | `Break` rows are only removable via a `FocusSession` cascade |

**The app cannot delete a focus session from any surface.**

---

## 12. Cross-page dependencies

### 12.1 Inbound — what links to `/focus`

**Nine** entry points, all to the **list** route:

| Source                                          | Line |
| ----------------------------------------------- | ---- |
| `components/layout/Sidebar.tsx`                 | `:26` |
| `components/layout/JumpTo.tsx`                  | `:42` |
| `components/layout/Footer.tsx`                  | `:45` |
| `components/layout/QuickActions.tsx`            | `:25` |
| `components/today/CommandPalette.tsx`           | `:346` |
| `app/(dashboard)/dashboard/page.tsx`            | `:46` |
| `server/services/dashboard/overview.service.ts` | `:99` |
| the "Focus Mode" tool tile                      | – |
| `app/(dashboard)/help/page.tsx` feature list    | `:47` |

### 12.2 Inbound — what links to `/focus/session`

**Exactly one link in the entire codebase:**

```
src/components/focus/FloatingFocusBar.tsx:127–133
  <Link href="/focus/session" aria-label="Open the full focus timer">Open</Link>
```

Reachable only when **all three** hold simultaneously:

1. A `FocusTimer` is mounted (the user is on `/focus`) and `status` is `running` or `paused` (`FloatingFocusBar.tsx:50`).
2. The user then **navigates away** from `/focus` — the bar survives because it is in the layout at `:63`, but the `FocusTimer` that populated the store **unmounts**, so the store freezes and the controls go dead (§26).
3. The bar is in the **expanded** state — `collapsed` starts `false`, but once the user clicks the `×` (`:134`–`:141`) it persists for the rest of the SPA session, and the collapsed pill (`:90`–`:106`) has **no** link to `/focus/session`.

**Not linked from:** `Sidebar`, `JumpTo`, `Footer`, `MobileNav`, `CommandPalette`, `QuickActions`, `dashboard/page.tsx`, `dashboard-overview.service.ts`, the header search, or `sitemap.ts`. A repo-wide grep for `/focus/session` returns exactly **2** hits: the `FloatingFocusBar` link and the reverse `router.push('/focus')` on `session/page.tsx:82`.

**Verdict: `/focus/session` is effectively an orphan route.**

### 12.3 Outbound — what `/focus` depends on

| Data                     | Produced by                                              | Drift risk |
| ------------------------ | -------------------------------------------------------- | ---------- |
| `sleepActive`            | `useSleepSession()` → `GET /api/sleep/session` (15 s)      | Low. |
| `focus` snapshot         | `useFocusStore`, written only by `FocusTimer`              | **Severe** — see §26. |
| `AppContext.habits` / `routineBlocks` / `goals` | `AppContext.fetchAll()`             | ❌ **unused**, yet `DataErrorBanner` surfaces their failures. |
| `Category`               | `/api/categories`                                          | Never used — the timer-payload branch has no `categoryId`. |

### 12.4 Third consumers of `useSleepSession`

| Consumer | Line | Note |
| -------- | ---- | ---- |
| `today/TodaySleep.tsx` | `:48` | renders the inline prompt |
| `focus/page.tsx`       | `:19` | **uses only `state.active`** |
| `shared/SleepPromptHost.tsx` | `:18` | the layout-level host |

Because the poller is a **module-level singleton** with ref counting (`store` `:77`, `listeners` `:84`, `pollTimer` `:85`, `refCount` `:86`), mounting `FocusTimer`'s page does **not** create a second poll — the three consumers share one 15 s timer. This is a well-built piece of infrastructure.

### 12.5 Who reads what `/focus` writes

| Reader                                                       | What it reads |
| ------------------------------------------------------------ | ------------- |
| `achievement.service.ts:148` / `:152`                        | `countCompletedSessions`, `getStats` |
| `analytics.service:199` / `:208` / `:209`                     | `getStats`, `listBreaks`, `findSessions` |
| `dashboard-overview.service:222`                              | `getStats` |
| `server/analytics/yearly.ts:186`, `server/analytics/monthly.ts:145` | `getStats` |
| `focus/session/page.tsx`                                      | `/api/focus/active`, `/api/focus?limit=20` |
| `focus/FocusStats.tsx`                                        | `/api/focus?limit=100` |
| `focus/FocusTimer.tsx`                                        | `/api/focus?limit=100` |
| `FloatingFocusBar`                                            | `useFocusStore`, **not** the API |

---

## 13. Impact analysis

### 13.1 If `POST /api/focus` fails

`saveError` is set (`FocusTimer.tsx:1218`) and rendered in a red paragraph **on the card itself**. The timer keeps running. `postedRef` is set regardless, so **the session is never retried** — the user's focus minutes are silently lost. There is no toast, no retry, no queue.

### 13.2 If `GET /api/focus?limit=100` fails

- `FocusTimer`: `historyError` is set and a **Retry** button appears (`:1420`). This is the best failure handling on either page.
- `FocusStats`: has its own error state via `apiRequest`'s thrown `ApiError`.
- `/focus/session`: `error` is set, a `role="alert"` paragraph renders (`:85`–`:89`), and **there is no retry** — the user must reload.

### 13.3 If `GET /api/focus/active` returns a stale row

**This is the common case, not an edge case.** Because `abortedAt` is dropped (§25), every Stop/Skip/mode-switch leaves a row with `completedAt: null` and `abortedAt: null`. `findActiveByUserId` returns it. `getActiveSession` then applies **one** guard — "is `startedAt` inside today?" (`:66`–`:68`) — and returns it.

So `/focus/session` shows a phantom "Current session — IN PROGRESS" for **every** stopped focus block of the day, and only clears as soon as the date rolls over. The user's list of sessions and their "current session" cannot both be right.

### 13.4 What the sleep auto-pause does

```
useEffect(() => {                                  FocusTimer.tsx:779–785
  if (sleepActive && !prevSleepActiveRef.current) pause();
  prevSleepActiveRef.current = sleepActive;
}, [sleepActive]);
```

Triggered by the 15 s `useSleepSession` poll, so the pause is up to **15 s late**. No notification, no UI explanation. The `FocusSession` is **not** posted at pause time — it is posted when the user later stops or skips it. If they navigate away while paused and the timer is later cleared from `localStorage`, the session is lost.

### 13.5 Blast radius of one completed session

```
FocusTimer reaches zero
  → finish()                                                        :652
    → document.title restored                                        :605
    → POST /api/focus {completed: true}                              :362
       → focus.service.createSession           focus.service.ts:128
          → FocusRepository.createSession       focus.repository.ts:75  ◄── ONE ROW
    → runAchievementCheck()                                (fire & forget)
       → POST /api/achievements/unlock
          → Achievement read/write, NotificationLog, ActivityLog
    → useFocusStore.sync({status:'finished'})                         :793
    → removeItem(TIMER_STORAGE_KEY)                                   :574  ◄── cycles lost
    → maybe autoStartBreak → beginCountdown                           :636
```

**One** `FocusSession` row, plus a fire-and-forget achievement check. **No** `DailyScore` recalculation — **focus minutes never enter the daily score.**

### 13.6 The 15 s sleep poll runs on every route in the group

`SleepPromptHost` is in the `(dashboard)` layout at `:65`, so the module-singleton `useSleepSession` poller runs **on all ~20 dashboard routes**, not just `/focus` and `/today`. It is visibility-gated, which limits the cost, but a user sitting on `/focus` with a long-running focus block keeps a 15 s timer alive for the entire session.

---

## 14. Current System Capabilities

What `/focus` demonstrably does today:

1. **Runs four timer modes** — `focus`, `short-break`, `long-break`, `stopwatch` — switchable at any time, including mid-run.
2. **Displays a 280 px SVG countdown dial** with a dashed outer spinner, a gradient progress ring, a neon glow filter and 60 tick marks, wrapped in `aria-live="polite"`.
3. **Full transport control** — start, pause, resume, reset, skip, and stopwatch laps, each disabled exactly when meaningless.
4. **Records a lap** with fastest/slowest highlighting (`lapExtremes` `:959`).
5. **Offers 8 duration presets** (5–60 min) plus a custom 1–180 minute input.
6. **Configures the pomodoro cycle** — cycles before a long break, auto-start breaks, auto-start focus, sound.
7. **Persists the in-progress timer to `localStorage`** so a reload, crash or tab close does not lose the run, and **catches an expired timer on mount** by posting it immediately with `completed: true` (`:474`–`:493`).
8. **Resumes an expired-or-closed stopwatch from an absolute epoch**, so time with the tab closed still counts.
9. **Controls the timer from any route** via `FloatingFocusBar` in the persistent layout — the only cross-route control surface in the app.
10. **Auto-pauses** when a sleep session starts.
11. **Updates `document.title`** with the countdown while running, so the tab is useful when backgrounded.
12. **Shows focus statistics** on `/focus/session`: total / today / week / average, a streak line, and a 7-day bar chart.
13. **Lists 100 recent sessions** in `FocusTimer` and 20 on `/focus/session`, each with a status badge.
14. **Validates and clamps every persisted field on read**, and wraps every `localStorage` access in `try/catch` so private-mode and quota failures degrade to in-memory state.
15. **Guards against StrictMode double-effects** with `restoreDoneRef` (`:324`).
16. **Posts exactly one `FocusSession` per run** via `postedRef`, including the expired-on-mount recovery path.
17. **Aligns the wall clock to the second boundary** (`1000 - Date.now() % 1000 + 10`) so the digits never visibly lag.

---

## 15. Currently NOT Supported

### 15.1 Dead components (2 files, 258 lines)

| File                     | Physical | Evidence |
| ------------------------ | -------- | -------- |
| `BreakNotification.tsx`  | **102** | **Zero importers.** Its two intended callbacks — `breakOverdue` / `shouldNotifyBreak` from `lib/focus/break-scheduler.ts:84, :102` — are **also dead**. The entire "planned break" concept exists in the DB, the service and the lib, and has **no UI**. |
| `PomodoroSettings.tsx`   | **156** | **Zero importers.** Its key `routineos_pomodoro_settings` (`:55`) is the only place that key appears. `FocusTimer` uses `routineos:focus-settings:v1` instead — two divergent shapes for the same data. |

### 15.2 Dead service methods — 5 of 9

| Method | Line | Reachable only via |
| ------ | ---- | ------------------ |
| `FocusService.listBreaks` | `focus.service.ts:175` | orphaned `GET /api/breaks` |
| `FocusService.createBreak` | `:213` | orphaned `POST /api/breaks` |
| `FocusService.completeSession` | `:274` | orphaned `POST /api/focus/[id]/complete` |
| `FocusService.updateSession` | `:237` | orphaned `PATCH /api/focus/[id]` |
| `FocusService.deleteSession` | `:253` | orphaned `DELETE /api/focus/[id]` |
| `FocusService.getSession` | `:228` | used internally by all four above |

### 15.3 Dead repository methods

| Method | Line | Note |
| ------ | ---- | ---- |
| `FocusRepository.createBreak` | `focus.repository.ts:336` | `focus.service` uses `BreakRepository.create` instead. The `if (!owner) { this.handleError(...) }` at `:343`–`:348` is **redundant** with `BreakRepository.create`'s own ownership check. |
| `FocusRepository.findBreakById` | `:371` | zero callers |
| `BreakRepository.findById` | `break.repository.ts:101` | zero callers |

### 15.4 Dead lib modules

| File                          | Lines | Deadness |
| ----------------------------- | ----- | -------- |
| `lib/focus/analytics.ts`      | **109** | 🔴 **ENTIRELY DEAD** — all 3 exports (`focusSummary` `:38`, `productiveTimes` `:73`, `sessionMinutes` `:30`), zero importers |
| `lib/focus/session-manager.ts` | 170 | `completeSession` `:71` live (`focus.service:296`); 🔴 `createSessionState` `:40`, `abandonSession` `:95`, **`restoreSession` `:126`** dead. ⚠ `restoreSession` is the *rehydration* counterpart to `FocusTimer`'s hand-rolled restore (`:414`–`:512`) — the two have **diverged completely**. |
| `lib/focus/pomodoro.ts`       | 170 | 🔴 7 of 8 function exports dead. Only `POMODORO_DEFAULTS` `:19` is imported outside the file. |
| `lib/focus/break-scheduler.ts` | 118 | `nextBreakAt` `:67` live (`focus.service:191`, itself behind an orphaned route); 🔴 `breakOverdue` `:84`, `shouldNotifyBreak` `:102` dead |

### 15.5 Dead types — `src/types/focus.ts` (486 lines)

Only `getFocusSessionStatus` (`:469`) and `FocusTimerSnapshot` (`:154`) are imported by live code. Unused: `StartFocusSessionResponse` · `PauseFocusSessionInput` · `CancelFocusSessionResponse` · `ProductivityPatternSummary` · `FocusAnalytics` · `FocusDailySummary` · `isFocusSessionWithRelations` · `isBreakType` · and ~30 more.

**Two unreachable union members:** `'CANCELLED'` (never returned) and `'PAUSED'` (no writer for `pausedAt`).

### 15.6 Unused props on live components

`FocusTimerProps` (`FocusTimer.tsx:49`–`:62`) declares **11** props. The only call site in the entire repo (`focus/page.tsx:59`) passes **1**:

| Prop | Line | Passed? | Consumed at |
| ---- | ---- | ------- | ----------- |
| `workMinutes` | 50 | 🔴 **no** | `withProps` `:268` |
| `shortBreak` | 51 | 🔴 **no** | `:269` |
| `longBreak` | 52 | 🔴 **no** | `:270` |
| `cyclesBeforeLongBreak` | 53 | 🔴 **no** | `:272`–`:275` |
| `soundEnabled` | 54 | 🔴 **no** | `:278` |
| `autoStartBreak` | 55 | 🔴 **no** | `:276` |
| `autoStartFocus` | 56 | 🔴 **no** | `:277` |
| `onComplete` | 57 | 🔴 **no** | **invoked** `:484`, `:673` |
| `onPhaseChange` | 58 | 🔴 **no** | **invoked** `:685`, `:707` |
| `className` | 59 | 🔴 **no** | `:296`, `:998`, `:1019` |
| `sleepActive` | 61 | ✅ **yes** | `:782` |

Also unused: `FocusStats({className})` — consumed at `:206`, never passed. `FlipClock({className})` — consumed at `:114`, `:151`, never passed.

**Consequence:** the pomodoro lifecycle has **no external observer**. `onComplete` and `onPhaseChange` are invoked but nothing supplies them, so **nothing outside `FocusTimer` ever learns that a cycle completed or a phase changed** — including `FocusStats`, which therefore never refreshes.

### 15.7 Missing entirely

- **No keyboard shortcuts at all.** 14 actions, all pointer-only. `hooks/useKeyboard.ts` exists and is imported by nothing in `focus/`.
- **No server persistence for settings.** `UserSettings` has no focus columns, so settings do not follow the user across devices.
- **No `FocusSession` detail, edit or delete UI**, despite `GET`/`PATCH`/`DELETE /api/focus/[id]` all existing and being authenticated and validated.
- **No `Break` UI** — no logging, no list, no timer integration.
- **No sound.** `soundEnabled` persists; 🔴 nothing in the repo plays a sound — no `Audio`, `AudioContext`, `Notification` or `<audio>` reference in any focus component.
- **No break notifications**, despite `BreakNotification` + `breakOverdue` + `shouldNotifyBreak` all existing.
- **No notes, ratings, categories or tags** on a focus session.
- **No pagination or filtering** on `/focus/session` (fixed `limit=20`), and none on `FocusTimer` (`limit=100`).
- **No offline support.** `postSession` uses a raw `fetch`; nothing enqueues.
- **No notification when the timer finishes** if the user is on another route — `onComplete` is never passed, and there is no `Notification`/push call.
- **No tests.** Nothing in `tests/` covers focus, `FocusService`, `FocusRepository`, or any of the six components.

---

## 16. Loading / Error / Empty / Edge states

### 16.1 Loading

| State                    | Trigger                          | Rendering |
| ------------------------ | -------------------------------- | --------- |
| **Route loading**        | server→client navigation         | `(dashboard)/loading.tsx` → `<PageSkeleton />`. ⚠ **Effectively never shown** — both pages are Client Components that render synchronously. |
| **`FlipClock` pre-mount** | before hydration                 | a pulse `<Skeleton>` (`animate-pulse`), `FlipClock.tsx:118`–`:119` |
| **`FocusStats`**         | while fetching                   | `<Skeleton shine>` rows |
| **`/focus/session` history** | `sessions === null`            | `<ListSkeleton count={4} />` `:142`, `aria-label="Loading list"` |
| **`FocusTimer` history** | while fetching                   | 🔴 **no skeleton.** `history` is `[]` until it resolves |
| **Timer action**         | —                                | 🔴 **no busy state on any button.** Start/Pause/Skip can all be double-clicked |

### 16.2 Error

| Error                     | Where set                             | Surface |
| ------------------------- | ------------------------------------- | ------- |
| `saveError`               | `postSession`'s catch                 | A red paragraph **on the card** `FocusTimer:1218` — ⚠ its class string has a **duplicated** `rounded-lg` and non-canonical ordering |
| `customError`             | `applyCustom`                         | on the custom-minutes `Input` |
| `historyError`            | the history fetch                     | a **Retry** `Button` `:1420` — the **only retry affordance on either page** |
| `/focus/session` `error`  | `session/page.tsx:66`                 | `<p role="alert" class="bg-destructive/10 …">` `:85`–`:89` — ⚠ **no retry** |
| `FocusStats` error        | its own `ApiError` catch              | its own `EmptyState` |
| **A session post failure**| `saveError`                           | 🔴 **never retried** — `postedRef` is already set |
| **A failed `/api/goals`** | `AppContext.tsx:601`                  | ⚠ `DataErrorBanner` in the layout — a **habit/goals banner on the focus page** |
| render crash              | any                                    | `(dashboard)/error.tsx` (97 lines). No focus-specific boundary. |

### 16.3 Empty

| Condition                                  | Rendering |
| ------------------------------------------ | --------- |
| `/focus/session`: no active session        | `<EmptyState icon={<Clock/>} title="No active session" description="Start a pomodoro…" />` `:128`–`:132` |
| `/focus/session`: `sessions.length === 0`  | `<EmptyState icon={<History/>} title="No sessions yet" />` `:144`–`:148` |
| `/focus/session`: `sessions === null`      | `<ListSkeleton count={4} />` — 🔴 **not an empty state, and no retry** |
| `FocusTimer`: `history === []` while loading | 🔴 **indistinguishable from "no sessions yet"** |
| `laps.length === 0`                        | the laps section is simply not rendered |

⚠ There is **no** empty state on `/focus` itself — the page is a fixed 2-column grid of two always-present components.

### 16.4 Edge cases

| Edge case                                                | Handling |
| -------------------------------------------------------- | -------- |
| **Timer already expired when the page mounts**           | restored as `status: 'finished'`, `postedRef = true`, and a session is **POSTed immediately** with `completed: true` `FocusTimer:474`–`:493` ✅ |
| **Stopwatch running when the tab was closed**            | resumed from the absolute `swRunStart` `FocusTimer:440`–`:449`, so closed-tab time counts ✅ |
| **`cyclesBeforeLongBreak` = 0 or NaN in storage**         | `clampInt` `:142`–`:145` returns the min; clamped 1–12 `:255` ✅ |
| **`remainingMs` > `plannedMs` in storage**                | `safeRemaining` clamps to `[0, planned]` `:461`–`:463` ✅ |
| **`localStorage` throws (private mode / quota)**          | every access wrapped in `try/catch` (`:244`, `:421`, `:507`, `:549`, `:559`) — degrades to in-memory ✅ |
| **Storage shape changes without a key change**            | ⚠ **no versioning/migration** beyond the `:v1` suffix — silently falls back to idle defaults |
| **Two tabs running the same timer**                       | ⚠ **not shared.** Raw `getItem`/`setItem`, no `storage` listener — the tabs overwrite each other. `useLocalStorage` (which *does* sync, `:40`–`:56`) is only used by the dead `PomodoroSettings`. |
| **Two accounts on one browser**                            | ⚠ keys are **global, not user-scoped** — they share the in-progress timer |
| **`cycles` after a stop**                                  | ⚠ destroyed by `removeItem` `:574`, yet `FloatingFocusBar:119`–`:123` renders "N pomodoros" from it |
| **`applyCustom` in stopwatch mode**                         | 🔴 a silent no-op |
| **Mode tab clicked mid-run**                                | the current run is **recorded and reset** — never blocked, and the tab is never disabled |
| **A `Switch` disabled?**                                    | 🔴 the `disabled` prop is **never passed** to any of the three |
| **Sleep starts while running**                              | auto-pause, up to **15 s late**, with no notification `FocusTimer:779`–`:785` |
| **A session in progress from a previous day**                | `getActiveSession`'s staleness gate `focus.service:66`–`:68` returns `null` ✅ — the *only* thing masking §25 |
| **Running session's "Elapsed" on `/focus/session`**         | ⚠ always `0 min` — see §7.7 |

---

## 17. Authentication & security

| Concern                | Reality                                                                                                                        |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| Session enforcement    | Every focus endpoint performs `await auth()` and returns **401**: `focus/route.ts:12, :55`, `active:12`, `[id]:17, :45, :92`, `[id]/complete:23`. |
| Middleware gate        | `/focus` is inside the `(dashboard)` group; `src/proxy.ts` 307s unauthenticated requests to `/login?callbackUrl=…`.               |
| User identity          | **Never client-supplied.** `sessionId` comes from the URL; `getSession` calls `FocusRepository.findById(userId, sessionId)` → `findFirst({where:{id, userId}})`, and `updateSession`/`deleteSession`/`completeSession` **all** go through it first. `findSessions`/`findActiveByUserId` scope by `userId`. |
| **The one write that skips ownership** | 🔴 `FocusRepository.createSession(userId, data)` writes `user: {connect}` from a passed-in `userId` (`focus.repository.ts:75`–`:101`). Safe today because the route derives `userId` from `await auth()`, but the repository does no verification of its own — unlike every other write method in the class. |
| Input validation       | `focusQuerySchema` `:107`, `createFocusSessionSchema` `:85`, `updateFocusSessionSchema` `:90`, `completeFocusSessionSchema` `:98` — all in one shared module ✅. ⚠ `GET /api/focus/active` has **no** schema (it takes no input). |
| `z.union` on create     | `createFocusSessionSchema` is `z.union([legacy, timerPayload])`. ⚠ Union error messages are notoriously hard to act on — a malformed timer payload produces errors keyed to **both** branches. |
| Numeric bounds          | `plannedSeconds` 0 < n ≤ 10800 and `actualSeconds` 0 ≤ n ≤ 10800 `focus.schema.ts:63`; `limit` 1–100, `offset` ≥0 `:113`–`:114`. ✅ |
| `Date` coercion          | `dateSchema` `:16` uses `z.preprocess` → `z.date()` and **rejects `null`** — because `null` would coerce to epoch. `optionalNullableDateSchema` `:30` is the clearing form. ✅ |
| Stored values are clamped | Every persisted field is re-validated and clamped on read (§7.5), so a hand-edited `localStorage` entry cannot produce a negative or absurd duration. ✅ |
| XSS                    | No `dangerouslySetInnerHTML` anywhere in `src/components/focus/**` or either page. `document.title` is set via the DOM API. |
| CSRF                   | Same-origin cookie JWT, `credentials:'include'`. **No CSRF token.** |
| **Rate limiting**      | 🔴 **None.** No `withRateLimit` on any focus route. `POST /api/focus` creates a row per call, and the expired-on-mount recovery path fires it **unconditionally on every page load**. |
| a11y — the dial        | `role="img"` + `aria-label` on the SVG; the wrapper is `aria-live="polite"` so the countdown is announced. ✅ |
| a11y — mode tabs       | `role="tablist"` + `role="tab"` + `aria-selected`. ⚠ **No `tabpanel`, no `aria-controls`, no arrow-key handling** — the same ARIA-tabs-without-tabpanels anti-pattern as `/routine` and `/goals`. |
| a11y — duration presets | `aria-pressed` on 8 pill buttons ✅ |
| a11y — `/focus/session` | `<section aria-labelledby=…>` on all three sections ✅; `role="alert"` on the error ✅ |
| a11y — decorative icons | `/focus/session`'s `<h1>` `Timer` icon at `:74`–`:76` has **no** `aria-hidden` |
| `tsconfig` strictness  | `strict`, `noUnusedLocals`, `noUnusedParameters`, `noUncheckedIndexedAccess` all on. The 11-prop interface compiles because the props have defaults, not because the types are loose. |
| TODO / FIXME / HACK    | 🔴 **Zero** anywhere in `src/components/focus/**` or `src/app/(dashboard)/focus/**`. The code is heavily commented with *rationale* rather than intent-to-do — the `abortedAt` comment at `focus.service:136`–`:145` is an 18-line explanation of a bug that is still live. |

### 17.1 Every `eslint-disable` in the focus components

| Line | Rule | Justification given |
| ---- | ---- | -------------------- |
| `FocusTimer.tsx:403` | `react-hooks/refs` | latest-ref pattern for `postSessionRef` |
| `FocusTimer.tsx:431` | `react-hooks/set-state-in-effect` | one-time `localStorage` hydration on mount |
| `FocusTimer.tsx:511` | `react-hooks/exhaustive-deps` | **bare — no comment** |
| `FocusTimer.tsx:517` | `react-hooks/set-state-in-effect` | reset fetch state before the mount fetch |
| `FocusTimer.tsx:727` | `react-hooks/refs` | `finishRef` |
| `FocusTimer.tsx:753` | `react-hooks/refs` | `startRef` → floating-bar resume |
| `FocusTimer.tsx:773` | `react-hooks/refs` | `pauseRef` → sleep auto-pause |
| `FocusTimer.tsx:795` | `react-hooks/exhaustive-deps` | discrete fields only; the bar recomputes `remainingMs` |
| `FocusTimer.tsx:852` | `react-hooks/refs` | `stopResetRef` → floating-bar stop |
| `FlipClock.tsx:26` | `react-hooks/set-state-in-effect` | sync `matchMedia` on mount |
| `FlipClock.tsx:83` | `react-hooks/set-state-in-effect` | hydrate the 12/24h pref from `localStorage` |

⚠ `FocusTimer.tsx:410` assigns `postSessionRef.current = postSession` **twice** — once in the render body at `:404` (with an `eslint-disable` above it) and again inside the `:407`–`:411` effect. The render-body write is redundant.

---

## 18. Performance

### 18.1 Request cost

| Metric                                  | Value                                                                                |
| --------------------------------------- | ----------------------------------------------------------------------------------- |
| Requests on first paint of `/focus`      | **3 + N** (`/api/habits` loop, `/api/routine`, `/api/goals`, `/api/focus?limit=100`) — **3 of 4 are loaded and discarded** |
| Requests on first paint of `/focus/session` | **3** (`/api/focus/active` + `/api/focus?limit=20` + `FocusStats`'s `/api/focus?limit=100`) where 1 would do |
| Requests per completed session           | **1** `POST` + **1** fire-and-forget `/api/achievements/unlock`                    |
| Requests per stop / skip / mode switch   | **1** `POST` each — 🔴 **and each one leaves a phantom row** (§25)                    |
| Pollers                                 | **2** — the 200 ms `FocusTimer` interval (in-memory, no network) and the **15 s `useSleepSession` poll** |
| Pollers on `/focus/session`               | **1** — `useSleepSession` runs on **every** route in the group, because `SleepPromptHost` is in the layout |

### 18.2 Render cost

- **`FocusTimer` is 1,506 lines with 18 `useState` + 14 `useRef` + 10 `useEffect`.** Every one of the 18 state values is written by the 200 ms interval while running, so the whole component re-renders **5× per second** for the duration of every focus block.
- `todayMinutes` (`useMemo` `:974`) and `lapExtremes` (`useMemo` `:959`) are correctly memoised, but their dependencies (`history`, `laps`) are stable during a run — so the memoisation saves nothing while the timer ticks.
- The dial SVG re-renders 60 tick lines every tick.
- `FloatingFocusBar` subscribes to `useFocusStore` with **13 separate selectors** (`FloatingFocusBar.tsx:34`–`:46`) and has its own **250 ms** interval (`:54`).
- **Combined while a timer runs and the user has navigated away: 9 re-renders per second** (5 from the timer + 4 from the bar) — of a store that is no longer advancing (§26).
- `Stagger` runs a framer-motion entrance on 3 elements, gated on `useReducedMotion`.

### 18.3 Query cost

- `findSessions` (`:189`) loads each row with `include {category select(id,name,color), _count.breaks}` — so `limit=100` is 100 rows plus a category join plus a per-row break count.
- `findActiveByUserId` (`:111`) does a `findFirst` on `{completedAt:null, abortedAt:null}` ordered by `startedAt desc` — **there is no index supporting it.** The available indexes are `[userId, startedAt]`, `[categoryId]`, `[userId, createdAt]`. Prisma can use `[userId, startedAt]` for the `userId` equality, but the two `IS NULL` predicates are unindexed, so every `/focus/session` mount scans the user's sessions.
- Because of §25, **that scan grows without bound** within a day — every stopped session is a candidate.
- `getActiveSession` adds **one** `getSettings` read (`:74`) per call.
- `listSessions` filters status **after** pagination (`:96`–`:105`), so `meta.total` is the filtered page length — and requesting `status=COMPLETED&limit=20` can return fewer than 20 rows with no signal.

### 18.4 Known waste

| # | Waste                                                              | Where |
| - | ------------------------------------------------------------------ | ----- |
| 1 | `/api/habits` + `/api/routine` + `/api/goals` fetched and discarded  | `AppContext.tsx:546`, `:556`–`:586` |
| 2 | `GET /api/focus?limit=100` issued by **both** `FocusTimer:519` and `FocusStats:75` | two components, one resource |
| 3 | The 200 ms tick drives a full re-render for a 1 s display          | `FocusTimer.tsx:582`–`:602` |
| 4 | The bar's own 250 ms interval re-renders a frozen snapshot         | `FloatingFocusBar.tsx:54` |
| 5 | `FocusRepository.createBreak` + `BreakRepository.create` both exist; the service uses one, the other is dead | `focus.repository.ts:336` / `break.repository.ts:52` |
| 6 | `restoreSession` (`session-manager:126`) is dead while `FocusTimer` hand-rolls its own restore (`:414`–`:512`) | two divergent rehydration implementations |
| 7 | `nextModeAfterFocus` / `durationMsFor` re-implement `lib/focus/pomodoro.ts` | `FocusTimer.tsx:630`, `:147` vs `pomodoro.ts:65`, `:50` |
| 8 | No index on `{userId, completedAt, abortedAt}`                     | `schema.prisma:1646`–`:1648` |

---

## 19. External integrations

**One, indirect:**

- **`runAchievementCheck()`** after `postSession` succeeds → `POST /api/achievements/unlock`, which evaluates the user's world state and may create `Achievement` rows plus `NotificationLog` (`ACHIEVEMENT_UNLOCKED`) and `ActivityLog` rows. Fire-and-forget.
- **No e-mail, no web push, no AI call, no calendar sync, no billing call.**
- 🔴 **`soundEnabled` persists but nothing plays a sound.** There is no `Audio`, `AudioContext`, `Notification` or `<audio>` reference anywhere in `src/components/focus/**`.
- 🔴 **No notification when a timer finishes** if the user is on another route: `onComplete` is never passed (§15.6), and there is no `Notification`/push call.

---

## 20. Background jobs / cron effects

`/focus` has **no** cron-driven behaviour, but it is a **writer** of data several jobs read:

| Relationship | Detail |
| ------------ | ------ |
| `compute-daily-scores` cron | 🔴 **Focus minutes never enter `DailyScore`.** `scoring.service.ts` reads `Habit`, `HabitLog`, `RoutineLog`, `SleepLog` and `UserSettings` — **not** `FocusSession`. A user's focus time has zero effect on their score. |
| `sleep-notifications` cron | Indirect: `startSleep` calls `timeEntryRepository.stopRunning(userId)` (`sleep-session.service:350, 435, 643`), and `FocusTimer:779`–`:785` auto-pauses when it observes the transition. |
| `achievement` evaluation | `achievement.service.ts:148` (`countCompletedSessions`) and `:152` (`getStats`) — so focus sessions **do** drive achievements, unlike the daily score. |
| `dashboard-overview` | `dashboard-overview.service:222` reads `getStats` — so focus minutes appear on `/dashboard` but not in the daily score. |
| `analytics` | `analytics.service:199, :208, :209`; `server/analytics/{yearly:186, monthly:145}` |

---

## 21. Data flow diagrams

### 21.1 `/focus` page load

```
  Browser
    │
    ├─ root layout mounts AppProvider ─────────────────────────────────┐
    │   Promise.all:                                                  │
    │     ├─ loop: GET /api/habits?…     ← DISCARDED by /focus         │
    │     ├─ GET /api/routine             ← DISCARDED by /focus         │
    │     └─ GET /api/goals               ← DISCARDED by /focus         │
    │   → dataError would render a DataErrorBanner ON /focus           │
    │                                                                    │
    ├─ useSleepSession()  module singleton, ref-counted                 │
    │     └─ GET /api/sleep/session   ── every 15 s, visibility-gated   │
    │           → page.tsx:20  sleepActive = Boolean(state?.active)     │
    │           → FocusTimer:782  auto-pause on false→true              │
    │                                                                    │
    ├─ <Stagger> ▶ <FlipClock />                                        │
    │     └─ setTimeout(1000 - Date.now()%1000 + 10)                   │
    │          → setInterval(tick, 1000)                               │
    │                                                                    │
    └─ <Stagger delay=0.12> ▶ <FocusTimer sleepActive />                │
          ├─ useEffect []   restore from localStorage  (restoreDoneRef) │
          ├─ readSettings()  routineos:focus-settings:v1                │
          ├─ useEffect       GET /api/focus?limit=100  (AbortController)│
          ├─ writeSettings() routineos:focus-settings:v1                │
          ├─ useEffect       push snapshot → useFocusStore.sync         │
          ├─ useEffect       setControls({pause,resume,stop})           │
          └─ document.title = `${displayText} · ${label} — RoutineOS`   │
```

### 21.2 A completed focus block

```
  countdown reaches 0
    │
    ├─ finish()                                                    :652
    │
    ├─ postedRef ?  → already posted → skip the POST entirely
    │
    ├─ POST /api/focus  {type, plannedSeconds, actualSeconds,
    │                    startedAt, endedAt, completed: true}      :362
    │     ├─ auth()                                       focus/route.ts:55
    │     ├─ createFocusSessionSchema.parse   focus.schema.ts:85  (a z.union)
    │     └─ FocusService.createSession              focus.service.ts:128
    │          'type' in input → timer-payload branch             :129
    │            titles['focus'] = 'Focus session'                :130
    │            plannedDuration = max(1, round(plannedSeconds/60))    :148
    │            actualDuration  = max(0, round(actualSeconds /60))    :149
    │            techniques     = ['Pomodoro']                   :150
    │            startedAt      = input.startedAt ?? now          :151
    │            completed === true → {completedAt: endedAt ?? now}     :152
    │          → FocusRepository.createSession        focus.repository.ts:75
    │               focusSession.create  ── 6 fields written, 18 left NULL
    │
    ├─ void runAchievementCheck()                                  :484
    │     └─ POST /api/achievements/unlock  (fire & forget)
    │          → Achievement read/write + NotificationLog + ActivityLog
    │
    ├─ document.title restored                                      :605
    ├─ useFocusStore.sync({status:'finished'})                       :793
    ├─ removeItem('routineos:focus-timer:v1')   ◄── cycles DESTROYED  :574
    └─ autoStartBreak ? → beginCountdown() → status = 'running'     :636
```

### 21.3 A stop / skip / mode switch — and the black hole

```
  user clicks Reset | Skip | or a mode tab
    │
    ├─ postSession({... completed: false})                     :362
    │
    └─ FocusService.createSession                     focus.service.ts:152–154
         completed !== true
           → data includes { abortedAt: endedAt ?? now }   ◄── the INTENT
              │
              └─ FocusRepository.createSession    focus.repository.ts:75
                   CreateFocusSessionData has NO abortedAt field   :11–21
                   prisma data object omits it                      :81–96
                   ⇒ abortedAt is SILENTLY DROPPED
                     (TypeScript skips excess-property checking
                      on conditional object spreads)

  RESULT: completedAt = null   AND   abortedAt = null
          ═════════════════════════════════════════════
          that is EXACTLY the shape findActiveByUserId uses
          to mean "a session is currently running"
                                focus.repository.ts:114
          ⇒ /focus/session shows a phantom IN PROGRESS session
            for every stopped focus block of the day
```

### 21.4 Navigating away mid-timer — the freeze

```
  timer running on /focus
    │
    ├─ useFocusStore.sync({status:'running', endsAt, remainingMs, …})   :793
    ├─ useFocusStore.setControls({pause, resume, stop})                 :800
    │     └─ these are closures into FocusTimer's refs
    │
    ├─ user clicks a nav link
    │     └─ FocusTimer UNMOUNTS
    │          • the 200 ms interval is cleared           ← the timer STOPS
    │          • no sync() is called on unmount           ← the store keeps
    │                                                      the last snapshot
    │          • the refs the controls captured are now
    │            stale closures into an unmounted tree
    │          • removeItem() is NOT called, so the
    │            localStorage key survives
    │
    └─ FloatingFocusBar (in the layout, still mounted) keeps rendering
          • collapsed=false, so the expanded 288 px card is shown
          • its own 250 ms interval re-renders a FROZEN remainingMs   :54
          • Pause / Resume / Stop call stale closures → setState on an
            unmounted component → a silent NO-OP with NO error shown
          • the "Open" link → /focus/session, which shows a phantom
            IN PROGRESS row (per §21.3) with Elapsed = 0 min
```

---

## 22. File-by-file dependency inventory

Physical line counts. Paths relative to the repo root.

### 22.1 Route files

| File                                        | Physical | Non-blank | Directive | Export |
| ------------------------------------------- | -------- | --------- | --------- | ------ |
| `src/app/(dashboard)/focus/page.tsx`        | **65**  | 59  | `'use client'` L1 | `default function FocusPage()` L18 |
| `src/app/(dashboard)/focus/session/page.tsx` | **181** | 170 | `'use client'` L1 | `default function FocusSessionPage()` L43 |

**That is the entire tree under `focus/`** — no `loading.tsx`, `error.tsx`, `layout.tsx`, `not-found.tsx`, `template.tsx`, and nothing at all under `focus/session/`. Inherited from the group: `layout.tsx` (69), `loading.tsx` (5), `error.tsx` (97).

### 22.2 Components — `src/components/focus/` (6 files, 2 dead)

| File                     | Physical | Directive | Exports | Importer(s) | Status |
| ------------------------ | -------- | --------- | ------- | ----------- | ------ |
| `FocusTimer.tsx`          | **1506** | `'use client'` L1 | `FocusTimer` L295, `FocusTimerProps` L49, `TimerMode` L46, `TimerStatus` L47, default L1505 | `focus/page.tsx:5` | **LIVE** |
| `FocusStats.tsx`          | 261   | `'use client'` L1 | `FocusStats` L67, default L261 | `focus/session/page.tsx:8, 177` | **LIVE** |
| `FloatingFocusBar.tsx`    | 193   | `'use client'` L1 | `FloatingFocusBar` L33 (no default) | **`(dashboard)/layout.tsx:10, 63`** | **LIVE** |
| `FlipClock.tsx`           | 188   | `'use client'` L1 | `FlipClock` L73, default L188 | `focus/page.tsx:4` | **LIVE** |
| `PomodoroSettings.tsx`    | 156   | `'use client'` L1 | `PomodoroSettings` L53, value L23, props L32, default L156 | **NONE** | **DEAD** |
| `BreakNotification.tsx`   | 102   | `'use client'` L1 | `BreakNotification` L28, props L20, default L102 | **NONE** | **DEAD** |

### 22.3 Other components and primitives

| Path                                    | Physical | Mode | Role |
| --------------------------------------- | -------- | ---- | ---- |
| `components/charts/BarChart.tsx`        | 151 | client | recharts `ResponsiveContainer` + `Bar` |
| `components/today/ui.tsx`               | 402 | client | `Stagger` L303 |
| `components/shared/SleepPromptHost.tsx` | 87  | client | the third `useSleepSession` consumer |
| `components/ui/Button.tsx`              | 52  | client | |
| `components/ui/Input.tsx`               | 98  | client | |
| `components/ui/Switch.tsx`              | 50  | client | |
| `components/ui/Skeleton.tsx`            | 21  | **none** | |
| `components/ui/ListSkeleton.tsx`        | 21  | **none** | |
| `components/ui/EmptyState.tsx`          | 52  | **none** | |
| `components/ui/Card.tsx`                | 26  | **none** | |
| `components/ui/Badge.tsx`               | 24  | **none** | |
| `components/ui/index.tsx`               | 26  | **none** | the **barrel** — 26 `export *` |

**Barrel cost:** `export *` from `index.tsx` also drags `@radix-ui/react-dialog`, `@radix-ui/react-tooltip` and `RichTextEditor` into the chunk, though none is rendered here.

### 22.4 Client-side lib / hook / store

| Path                                | Physical | Role |
| ----------------------------------- | -------- | ---- |
| `store/focus.store.ts`              | 83  | the zustand timer snapshot — **only 2 importers** |
| `store/achievement.store.ts`        | 102 | `runAchievementCheck()` L90 |
| `store/settings.store.ts`           | 174 | indirect — `useUserTimezone` → `useSettings` |
| `hooks/useSleepSession.ts`          | 324 | module-singleton poller |
| `hooks/useSettings.ts`              | 71  | indirect |
| `hooks/useLocalStorage.ts`          | 78  | ⚠ **only the dead `PomodoroSettings.tsx:17`** |
| `hooks/useKeyboard.ts`              | –   | 🔴 **not imported by any focus code** |
| `lib/api-client.ts`                 | 131 | `apiRequest<T>()` L60 |
| `lib/utils.ts`                      | 127 | `cn` L7, `accentFill` L125 |
| `lib/focus/pomodoro.ts`             | 170 | 🔴 7 of 8 exports dead |
| `lib/focus/session-manager.ts`      | 170 | `completeSession` L71 live; 3 dead |
| `lib/focus/break-scheduler.ts`      | 118 | 1 live (behind a dead route); 2 dead |
| `lib/focus/analytics.ts`            | 109 | 🔴 **entirely dead** |
| `types/focus.ts`                     | 486 | only `getFocusSessionStatus` L469 and `FocusTimerSnapshot` L154 are live |

### 22.5 Server-side files reached

| Path                                        | Physical | Reached via |
| ------------------------------------------- | -------- | ----------- |
| `app/api/focus/route.ts`                    | 90  | GET, POST |
| `app/api/focus/active/route.ts`             | 26  | GET |
| `app/api/focus/[id]/route.ts`               | 117 | 🔴 **orphaned** |
| `app/api/focus/[id]/complete/route.ts`      | 68  | 🔴 **orphaned** |
| `app/api/breaks/route.ts`                   | 81  | 🔴 **orphaned** |
| `app/api/achievements/unlock/route.ts`      | –   | POST (fire-and-forget) |
| `server/services/focus.service.ts`           | **314** | 4 of 9 public methods reachable |
| `server/repositories/focus.repository.ts`    | **416** | 9 of 12 methods |
| `server/repositories/break.repository.ts`    | 148 | 🔴 **only from the orphaned route** |
| `server/repositories/time-entry.repository.ts` | 257 | 🔴 **NOT reached** |
| `server/repositories/base.repository.ts`    | 122 | `buildPaginationQuery` (caps `take` at 100), `handleError` |
| `server/repositories/user.repository.ts`    | 523 | `getSettings` (`timezoneFor`) |
| `schemas/focus.schema.ts`                   | **152** | 6 of 13 exports reachable |
| `lib/errors/app-error.ts`                   | 104 | `NotFoundError` L72, `ValidationError` L48 |
| `prisma/schema.prisma`                      | 2466 | 5 models, **0 focus enums** |

### 22.6 `src/types/focus.ts` — the domain types (486 lines)

| Line | Export | Status |
| ---- | ------ | ------ |
| `:21`–`:27` | `FocusSessionStatus` = `'IN_PROGRESS' \| 'PAUSED' \| 'COMPLETED' \| 'ABORTED' \| 'CANCELLED'` | 🔴 `PAUSED` and `CANCELLED` unreachable |
| `:152` | `FocusTimerState` | live |
| `:154` | `FocusTimerSnapshot` | ✅ live (`focus.service:286`) |
| `:168` | `BreakType` | dead |
| `:469`–`:478` | `getFocusSessionStatus(session)` | ✅ **the only live function** |
| — | ~40 other interfaces and type guards | 🔴 unused |

---

## 23. Current behavior summary

### 23.1 What actually happens, end to end

1. The root layout fetches habits, routines and goals. **`/focus` reads none of them** — but a failure still raises a `DataErrorBanner` on the focus page.
2. `useSleepSession` starts a shared 15 s poll, so the page can observe a sleep session starting and auto-pause.
3. `FlipClock` mounts and aligns a 1 s clock to the second boundary.
4. `FocusTimer` restores any in-progress timer from `localStorage`. If it expired while the page was closed, it **immediately POSTs a completed session**.
5. It fetches 100 sessions for its history list, mirrors its state into `useFocusStore`, and registers its pause/resume/stop closures.
6. Running the timer to zero costs **one** `POST /api/focus` (writing 6 of 24 fields) plus a fire-and-forget achievement check.
7. **Stopping, skipping or switching mode costs one POST whose important half the database silently discards** — leaving a row indistinguishable from a running session.
8. Navigating away unmounts `FocusTimer`, which **clears the interval but does not clear the store**, so the floating bar freezes and its three buttons become silent no-ops.
9. `/focus/session` — reachable only through one link inside that narrow window — shows the phantom session with an Elapsed of `0 min`, plus 20 sessions and a 7-day chart, and offers exactly one button.

### 23.2 The shape of the page in one line each

| Dimension            | Reality |
| -------------------- | ------- |
| Page file size       | **65 lines.** Everything is in `FocusTimer` (**1,506 lines**) |
| Rendering strategy   | fully client-side; **no server component, no server fetch, no streamed data** |
| Data ownership       | **none** — `/focus` reads **no** context member. The only audited page that does not use `AppContext`. |
| Data written         | **one** `FocusSession` row per run, with **6 of 24 fields populated** |
| Settings persistence | **`localStorage` only** — no server round-trip, no user scoping, no cross-tab sync |
| Real-time            | a 200 ms in-memory tick + a shared 15 s sleep poll |
| Offline              | **none** — `postSession` uses a raw `fetch` and is never queued |
| Keyboard support     | 🔴 **none** — 14 actions, all pointer-only; `hooks/useKeyboard.ts` is imported by nothing in `focus/` |
| Cross-route control  | ✅ `FloatingFocusBar` in the layout — but it **freezes** on navigation (§26) |
| Accessibility        | good on the dial, presets and sections; **ARIA tabs without tabpanels**; **no keyboard path to any control** |
| Internationalisation | none — all copy is hard-coded English literals |
| Tests                | **none.** `tests/` contains only `lib/routine-duration.test.ts` and `domain/score-calculator.test.ts`. |

---

## 24. Findings register

**This pass changed no code.** Severity: **H** = wrong behaviour or a dead feature a user can notice · **M** = wasted work or an internal inconsistency · **L** = cosmetic or hygiene.

| #  | Sev | Finding                                                                                                                  | Location                                              | Impact                                                                                                  | Suggested fix |
| -- | --- | ------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------- | ----------------------------------------------------------------------------------------------------- | ------------- |
| F1  | **H** | **`abortedAt` is silently dropped.** `createSession` builds `{abortedAt}` on the `completed !== true` branch, but `FocusRepository.createSession`'s `CreateFocusSessionData` interface has no such field and its Prisma `data` object omits it. TypeScript skips excess-property checking on conditional spreads, so it compiles. See §25. | `focus.service.ts:152–154` → `focus.repository.ts:11–21, 81–96` | Every Stop / Skip / mode-switch leaves a row indistinguishable from "running". `/focus/session` shows a phantom IN PROGRESS session for every stopped block of the day. | Add `abortedAt?: DateTime \| null` to `CreateFocusSessionData` and pass it through. |
| F2  | **H** | **The floating timer freezes on navigation.** `FocusTimer` clears its 200 ms interval on unmount but never calls `sync()`, and the `controls` closures in `useFocusStore` point into an unmounted tree. See §26. | `FocusTimer.tsx:582–602` (no unmount cleanup), `:793`, `:800` | After navigating away mid-timer, the bar shows a frozen countdown and its Pause/Resume/Stop are **silent no-ops** — `setState` on an unmounted component, with no error surfaced. | Clear the store (`sync(IDLE_SNAPSHOT)`, `setControls(NOOP_CONTROLS)`) on unmount, or move the interval into the store. |
| F3  | **H** | **No keyboard shortcuts at all.** Zero `onKeyDown`, zero `keydown`/`keyup` listeners, zero `useKeyboard` imports across `src/components/focus/**`. `hooks/useKeyboard.ts` exists and is imported by nothing in `focus/`. | all of `src/components/focus/**` | All 14 timer actions are pointer-only. A timer app with no spacebar is a real usability gap. | Wire `useKeyboard` for Space (pause/resume), `R` (reset), `L` (lap), `1`–`4` (modes). |
| F4  | **H** | **`/focus/session` is effectively an orphan route.** Exactly one inbound link exists in the whole codebase (`FloatingFocusBar.tsx:127`), and it is only rendered when the bar is expanded after the user has navigated away from a running timer. | `FloatingFocusBar.tsx:127–133` | A fully-built 181-line page + 261-line `FocusStats` + a 3-request load is reachable by typing a URL. | Add it to `CommandPalette`, `JumpTo` or the sidebar. |
| F5  | **M** | **`soundEnabled` persists but nothing plays a sound.** No `Audio`, `AudioContext`, `Notification` or `<audio>` reference anywhere in `src/components/focus/**`. | `FocusTimer.tsx:1375`, `:278` | A stored boolean with no consumer — the user toggles it and hears nothing, with no explanation. | Implement the cue (Web Audio, or the `showNotification` already used by `/today`), or remove the switch. |
| F6  | **M** | **A running session's "Elapsed" is always `0 min`.** `actualDuration` is only written at the moment the session is **posted**, i.e. at its end. | `session/page.tsx:113` | The page's most obviously wrong number. Both the server (`startedAt`) and the client could compute it. | `Math.round((Date.now() - new Date(startedAt)) / 60000)` when `status === 'IN_PROGRESS'`. |
| F7  | **M** | **`lib/focus/pomodoro.ts` (170 lines, 7 of 8 exports dead) is bypassed by an inline re-implementation.** | `FocusTimer.tsx:630–634`, `:147–152` vs `pomodoro.ts:50, 65` | Two pomodoro implementations that will drift. | Import `nextPhaseFor` / `durationForPhase` with the settings object as the argument. |
| F8  | **M** | **The pomodoro lifecycle has no external observer.** `onComplete` and `onPhaseChange` are invoked at `:484`, `:673`, `:685`, `:707` but **never passed** by the only call site. | `FocusTimer.tsx:49–62` vs `page.tsx:59` | `FocusStats` never refreshes after a session; nothing outside the component learns a cycle finished. | Pass `onComplete` from the page, or move the stats refetch into the store. |
| F9  | **M** | **A failed session POST is never retried.** `postedRef` is set before the request resolves. | `FocusTimer.tsx:341–367` | The user's focus minutes are silently lost; `saveError` shows but offers no retry. | Reset `postedRef` on failure and expose the Retry button that `historyError` already has. |
| F10 | **M** | **No index supports `findActiveByUserId`.** It filters `{userId, completedAt:null, abortedAt:null}`; the available indexes are `[userId, startedAt]`, `[categoryId]`, `[userId, createdAt]`. | `focus.repository.ts:111`; `schema.prisma:1646–1648` | Every `/focus/session` mount scans the user's sessions — and thanks to F1 the candidate set grows all day. | `@@index([userId, completedAt, abortedAt])`. |
| F11 | **M** | **`meta.total` in `listSessions` is the filtered page length, not the real total**, because status is filtered **after** pagination. | `focus.service.ts:96–116` | `GET /api/focus?status=COMPLETED&limit=20` can return fewer than 20 rows with no signal that more exist. | Move the status predicate into the Prisma `where`. |
| F12 | **M** | **`localStorage` keys are global, not user-scoped.** | `FocusTimer.tsx:116`, `:117`; `FlipClock.tsx:19` | Two accounts on one browser share the in-progress timer. | Prefix the keys with the user id. |
| F13 | **M** | **`localStorage` is not shared across tabs.** Raw `getItem`/`setItem`, no `storage` event listener — while `useLocalStorage`, which *does* implement cross-tab sync at `:40`–`:56`, is used only by the **dead** `PomodoroSettings`. | `FocusTimer.tsx:421`, `:507`; `hooks/useLocalStorage.ts:40–56` | Two open tabs running the same timer overwrite each other. | Adopt `useLocalStorage` in `FocusTimer`, or add a listener. |
| F14 | **M** | **`applyCustom` is a silent no-op in stopwatch mode.** | `FocusTimer.tsx:918` | The user types a duration and nothing happens, with no error. | Disable the field in stopwatch mode. |
| F15 | **M** | **`cycles` is destroyed on stop** by `removeItem` (`:574`), yet `FloatingFocusBar:119`–`:123` renders "N pomodoros" from it. | `FocusTimer.tsx:574`; `FloatingFocusBar.tsx:119–123` | The bar's cycle count silently resets to 0 the moment the timer is stopped. | Keep a separate `routineos:focus-cycles:v1` key, or stop rendering the count. |
| F16 | **M** | **`FocusRepository.createSession` performs no ownership verification** — it writes `user: {connect}` from a passed-in `userId`. Safe today only because the route derives it from `await auth()`. | `focus.repository.ts:75–101` | The only write method in the class that trusts its caller. | Accept a `userId` and assert it, as every sibling method does. |
| F17 | **M** | **`GET /api/focus/active` has no Zod schema.** It takes no input today, so this is harmless — but it breaks the pattern. | `focus/active/route.ts:9–26` | — | Note it, or add an empty schema. |
| F18 | **M** | **`DataErrorBanner` shows habit/routine/goals failures on `/focus`,** because it reads `useApp().dataError` and `/focus` uses no context member. | `layout.tsx:48`; `AppContext.tsx:601–605` | A user gets a "failed to load goals" banner on the timer page. | Make the banner route-aware. |
| F19 | **M** | **266 lines of route handlers serve zero UI**: `GET/PATCH/DELETE /api/focus/[id]` (117), `POST /api/focus/[id]/complete` (68), `GET/POST /api/breaks` (81) — plus 5 service methods, 3 repo methods and 2 Zod schemas. | three route files | `DELETE` exists with **no confirmation UI anywhere**, and the reference-counting `Break` support has no surface. | Add a detail/edit UI, or delete the routes. |
| F20 | **L** | **`GET /api/focus?limit=100` is issued by two components** (`FocusTimer:519` and `FocusStats:75`) for the same resource. | two components | Doubled query cost on `/focus/session`. | Share the fetch. |
| F21 | **L** | **`FocusSessionRow` is declared three times** — `session/page.tsx:10`, `FocusStats.tsx:21`, `FocusTimer.tsx:106`. | three files | Three shapes to keep in sync, none exported. | Export one from `types/focus.ts`. |
| F22 | **L** | **`saveError`'s class string has a duplicated `rounded-lg`** and non-canonical Tailwind ordering. | `FocusTimer.tsx:1218` | Cosmetic. | `rounded-lg text-sm toast-error px-4 py-2` in canonical order. |
| F23 | **L** | **`FlipClock`'s two skeleton `<div>`s are indented at column 0**, inconsistent with the surrounding JSX. | `FlipClock.tsx:118–119` | Formatting fingerprint. | Reindent. |
| F24 | **L** | **`postSessionRef.current` is assigned twice** — in the render body at `:404` (with an `eslint-disable`) and again in the `:407`–`:411` effect. | `FocusTimer.tsx:404`, `:410` | A redundant render-body write, and one suppression that could go. | Delete `:404`. |
| F25 | **L** | **`FocusTimer.tsx:511` carries a bare `eslint-disable react-hooks/exhaustive-deps`** with no justification comment — the only one of the 11 that has none. | `FocusTimer.tsx:511` | An unexplained suppression. | Add the rationale or fix the deps. |
| F26 | **L** | **Zero `TODO`/`FIXME`/`HACK` markers** in `src/components/focus/**` or `src/app/(dashboard)/focus/**` — positive, given the density of rationale comments. The `abortedAt` comment at `focus.service:136`–`:145` is an 18-line explanation of a bug that is still live. | both trees | — | — |
| F27 | **L** | **Zero tests** for the focus domain. | `tests/**` | The largest single component in the app (1,506 lines) and the whole service layer are untested. | Extract the tick math and the pomodoro cycle into pure functions and test those. |

---

## 25. The `abortedAt` black hole

The single most consequential finding on this page, isolated because it corrupts a persisted model in a way no test would catch.

### 25.1 The intent

`focus.service.ts:136`–`:145` carries an **18-line comment** explaining why the abort path exists. The gist: a stopped or skipped focus block must not be indistinguishable from a running one, or `findActiveByUserId` will keep returning it forever. Then, at `:152`–`:154`:

```ts
completed: input.completed === true
  ? { completedAt: endedAt ?? new Date() }
  : { abortedAt:   endedAt ?? new Date() },
```

The intent is correct and clearly considered.

### 25.2 The drop

`FocusRepository.createSession` (`focus.repository.ts:75`–`:101`):

```ts
export interface CreateFocusSessionData {      // :11–21
  // … title, description, plannedDuration, actualDuration,
  //     startedAt, completedAt, energyBefore, techniques, category
  // ⚠ NO abortedAt
}

const session = await prisma.focusSession.create({   // :81–96
  data: {
    user: { connect: { id: userId } },
    title: data.title,
    description: data.description,
    plannedDuration: data.plannedDuration,
    actualDuration: data.actualDuration,
    startedAt: data.startedAt,
    completedAt: data.completedAt,
    energyBefore: data.energyBefore,
    techniques: data.techniques,
    category: data.category,
    // ⚠ abortedAt is simply not here
  },
});
```

### 25.3 Why it compiles

The service passes the field through a **conditional object spread**:

```ts
...(input.completed === true ? { completedAt: … } : { abortedAt: … })
```

TypeScript's excess-property check applies to **object literals**, and a spread expression inside one is explicitly exempt — the rule exists so that `{ ...rest }` patterns don't error. So `abortedAt` sails through the type system and evaporates at the repository boundary.

**This is a structural hazard, not a typo.** The same pattern would hide a missing field in any other spread-based call.

### 25.4 The consequence, step by step

```
Reset / Skip / mode-switch
   └─ completedAt : null
   └─ abortedAt   : null            ← intended to be a timestamp

findActiveByUserId(userId)          focus.repository.ts:114
   WHERE userId = ? AND completedAt IS NULL AND abortedAt IS NULL
   ORDER BY startedAt DESC
   → MATCHES

getActiveSession(userId)            focus.service.ts:53
   ├─ staleness gate: is startedAt inside today?  → if yes, return it
   └─ status = getFocusSessionStatus(row)
        completedAt? no
        abortedAt?   no       ← was supposed to be yes
        pausedAt?    no
        → 'IN_PROGRESS'
```

**Result:** `/focus/session` displays a "Current session — IN PROGRESS" card for **every** focus block the user stopped today, and shows only the most recent one. The card clears at midnight.

### 25.5 What masks it

Exactly one guard: `focus.service.ts:66`–`:68` rejects sessions whose `startedAt` is not within today. So the bug is invisible across a day boundary and visible within one. That is why it has survived — **it looks correct when you test it at the end of the day.**

### 25.6 The fix

Three lines:

```ts
// focus.repository.ts — CreateFocusSessionData
abortedAt?: DateTime | null;

// focus.repository.ts — the Prisma data object
abortedAt: data.abortedAt ?? null,
```

And, to prevent recurrence, widen the signature to accept the raw field set rather than an allow-list, or add a test asserting `abortedAt IS NOT NULL` after a stop.

### 25.7 The adjacent bug

`FocusSession.pausedAt` (`schema.prisma:1626`) has **no writer anywhere in the repo**. It is referenced by:

- `getFocusSessionStatus` (`types/focus.ts:476`) — the `'PAUSED'` branch,
- `focusQuerySchema` (`focus.schema.ts:113`) — the `status` enum includes `'PAUSED'`,
- `/focus/session`'s `statusVariant` (`session/page.tsx:30`) — a PAUSED badge exists in the switch.

`FocusTimer.pause()` (`:756`) only sets local `status = 'paused'` and never persists it. So **a paused focus block is invisible to the database** — if the tab closes while paused, the localStorage restore path (`:494`–`:497`) puts it back, but `/focus/session` would never show it as paused even in that window.

---

## 26. The frozen-timer problem

The second structural finding, isolated because it affects every cross-route interaction with the timer.

### 26.1 The design

`useFocusStore` exists precisely so the timer can be controlled from the persistent layout. `FocusTimer` writes a snapshot (`:793`) and registers three control closures (`:800`). `FloatingFocusBar` reads the snapshot and calls the closures.

### 26.2 The gap

`FocusTimer` registers cleanup for **one** thing — the 200 ms `setInterval` (`:600` `clearInterval`). It does **not** register cleanup for the store:

| What should happen on unmount | What actually happens |
| ------------------------------ | --------------------- |
| `sync(IDLE_SNAPSHOT)` | 🔴 nothing — the store keeps the last snapshot |
| `setControls(NOOP_CONTROLS)` | 🔴 nothing — the closures still point into the unmounted tree |
| `clearInterval` | ✅ happens |

### 26.3 What the user sees

1. Start a focus block on `/focus`.
2. Click a sidebar link.
3. `FocusTimer` unmounts. The interval is cleared. The store freezes at whatever `remainingMs` it held.
4. `FloatingFocusBar` re-renders on its own 250 ms interval with a **frozen** countdown.
5. Click **Pause**. It calls a closure whose target is unmounted → `setState` on an unmounted component → **React logs nothing in production, the component does nothing, and the bar does not change.**
6. Click **Open** → `/focus/session`, which per §25 shows a phantom IN PROGRESS row with Elapsed `0 min`.

The user has a timer they cannot stop, showing a time that does not move.

### 26.4 Why the design chose this

The `sync` at `:793` is in an effect whose dependency list is deliberately narrow (with an `eslint-disable react-hooks/exhaustive-deps` at `:795` and the rationale *"discrete fields only; bar recomputes `remainingMs`"*). So the **intended** design is that the bar derives its own ticking value from `endsAt` rather than reading `remainingMs` — which would make the bar survive navigation naturally.

But `FloatingFocusBar.tsx:54` installs its own 250 ms interval, which implies it *does* read a decrementing value. **The two halves of the design disagree**, and the practical result is the frozen snapshot.

### 26.5 Fixes, cheapest first

| # | Fix | Cost | Effect |
| - | --- | ---- | ------ |
| 1 | Add an unmount effect: `sync(IDLE_SNAPSHOT)` + `setControls(NOOP_CONTROLS)` | 5 lines | The bar disappears instead of lying. |
| 2 | Move the 200 ms interval into `useFocusStore` so it survives unmount | medium | The bar becomes genuinely authoritative, and `onComplete` could live in the store too. |
| 3 | Make the bar derive its value from `endsAt` and drop its own interval | small | Matches the intent documented at `FocusTimer:795`. |

---

## 27. Dead surface inventory

| Category                                          | Count | Lines |
| ------------------------------------------------- | ----- | ----- |
| Dead components (`src/components/focus/`)          | **2** | **258** |
| Dead API routes (client-orphaned)                  | **6** | **266** |
| Dead service methods                               | **5** | ~180 |
| Dead repository methods                            | **3** | ~60 |
| Dead lib modules / exports                         | **13** across 4 files | **567** |
| Dead types in `types/focus.ts`                     | **~42** | 486 total |
| Unused `FocusTimerProps` members                   | **10** of 11 | – |
| Unreachable `FocusSessionStatus` members           | **2** of 5 | – |
| `FocusSession` fields no UI can write              | **10** of 24 | – |
| Unused `localStorage` keys (dead component)        | **1** | – |
| Unreachable DB columns (`abortedAt`, `pausedAt`)   | **2** | – |
| `eslint-disable` suppressions                      | **11** | – |
| `TODO` / `FIXME` markers                           | **0** | – |
| Tests                                              | **0** | 0 |

**Roughly 1,800 lines of dead or unreachable code in the focus domain**, against a live surface of 65 + 181 + 1,506 + 261 + 188 + 193 = 2,394 lines.

The three highest-leverage fixes are **F1** (§25, the `abortedAt` drop — it corrupts persisted data), **F2** (§26, the frozen timer) and **F3** (no keyboard control of a timer).

---

# Part II — Implementation

Everything above is the **pre-change** audit, retained as the baseline it is. Part II records the work that followed it: what was verified, what was corrected, and what was built.

## 28. Verification pass — auditing the audit

Before writing code, all 11 claims this audit makes were re-checked against the real files. **Nine held. Two were wrong, and one was wrong in a way that would have produced the wrong fix.**

### 28.1 Confirmed

| Claim | Where | Verified as |
| --- | --- | --- |
| `abortedAt` built in the service, dropped by the repository | §25 | Confirmed. `focus.service.ts:154` builds it; `CreateFocusSessionData` had no such member and the Prisma `data` never wrote it. **Fixed** — see §29.1. |
| `FocusTimer` never resets the store, so the bar freezes | §26 | Confirmed, and the audit understates it. The bar's three buttons call `focus.store.ts:76-80` → `controls`, which are closures over `setState` of an **unmounted** component. So after any navigation away from `/focus` all three are silent no-ops, not just the countdown. **Fixed** — see §29.5. |
| No `type` and no `status` column on `FocusSession` | §6.2 | Confirmed. **Fixed** — see §29.2. |
| Rows are created only at the end of a run | §7.3 | Confirmed. `findActiveByUserId` was therefore structurally always `null` in production, so `GET /api/focus/active` could never return a session. |
| `getStats` / `countCompletedSessions` include breaks | §13.5 | Confirmed, and worse than stated — see §28.3. |
| `pausedAt` has no writer | §6.2 | Confirmed. 2 reads, 0 writes repo-wide. |
| `listSessions` filters status after pagination, so `meta.total` is wrong | §5.5 | Confirmed. **Fixed** — see §29.2. |
| `/focus/session` has exactly one inbound link | §12.2 | Confirmed: `FloatingFocusBar.tsx:128`. |
| `Break.quality` is `Int?` in the schema | §6.4 | Confirmed (the audit's own §6.4 model dump is correct; §28.4 records the correction). |

### 28.2 🔴 Correction — "`soundEnabled` has no consumer" is **false**

The audit's dead-surface table (§27) does not make this claim, but the remediation brief it was used to implement did. The real situation:

`FocusTimer` reads `soundEnabled` from **its own** `localStorage` key `routineos:focus-settings:v1` (`FocusTimer.tsx:117, 258`), gates `playFinishSound()` on it (`:668`), and renders a working switch for it (`:1376-1378`). It is not dead.

The actual defect is that this local key is **completely disjoint** from `UserSettings.soundEnabled` (`schema.prisma:595`, validated at `settings.schema.ts:20`, toggled at `settings/appearance/page.tsx:260`). Two settings with the same name, no connection: turning sound off in Settings → Appearance does **not** silence the focus timer.

That is worse than a dead consumer, because the UI implies a connection that does not exist. **Fixed** by making the timer read the real settings column (§29.9).

### 28.3 🔴 Correction — the break contamination is wider than §13.5 states

§13.5 correctly identifies that `getStats` counts breaks. It does not list the full blast radius, which §28.4's caller survey establishes. Four aggregate entry points read those four numbers, and **every focus figure in the product flows through them**:

| Consumer | Figure affected |
| --- | --- |
| `achievement.service.ts:194` | `focusHours` → **Productivity Master** ("Log 100 focus hours"); `focusSessions` → **Focus Champion** ("Complete 500 focus sessions") |
| `achievement.service.ts:190` | `lateEvenings` → **Night Owl** |
| `analytics.service.ts:199` | `/analytics` focus period + daily-average tiles, `FocusSummaryCard` |
| `dashboard-overview.service.ts:130` | the **Focus** axis of the `/dashboard` Life Balance radar |
| `server/analytics/monthly.ts:167` | monthly recap focus minutes + session count, `/recap`, `/reports` |
| `server/analytics/yearly.ts:139` | yearly recap focus minutes + session count |

Because the only write path for a break was `POST /api/focus` with `completed: true`, **every 5-minute short break in a user's history has been silently added to every one of those figures.** A user doing 20 pomodoros with 4 breaks each was credited with 40 extra minutes per cycle.

### 28.4 Four defects this audit did not find

1. **`FocusStats.tsx` is a fifth definition of "focus minutes"** — and it disagrees with the server. It uses `actualDuration ?? plannedDuration` (`:40`, a *planned* fallback where `getStats` drops the row entirely), buckets by **browser-local** day rather than the user's configured zone (`:43`), counts **all** statuses for the today/week tiles while filtering to `COMPLETED` for the average (`:104-125`), and is hard-capped at `limit: 100`. So `/focus/session` and `/analytics` could legitimately disagree about the same day.

2. **`pattern.service.ts:74-77` buckets breaks as focus.** It filters `completedAt !== null` and nothing else, so 5-minute breaks feed the "peak hours" signal. Currently moot — the service has **no importer** and `ProductivityPattern` is never written — but it is a loaded gun.

3. **`recap.service.ts:315-322` puts breaks in the `"Uncategorized"` category bucket** and sums `actualDuration` with no `Math.max(0, …)` clamp.

4. **`night-owl` can never be earned.** `achievement.service.ts:190` passes `startedAfter = today@20:00 local` with **no upper bound**, so the count resets at every midnight despite the criterion declaring `timeframe: 'ALL_TIME'` and a threshold of 20. The sibling `early-riser` correctly passes a bounded range.

### 28.5 Repository baseline at the time of this work

`AGENTS.md` was stale on three counts. Actual measured values before any edit:

| Command | `AGENTS.md` claimed | Actual |
| --- | --- | --- |
| `npm run type-check` | clean | **18 errors**, 0 in any focus file |
| `npm test` | 122 passing, 7 files | **179 passing / 22 failing**, 8 files — all 22 in `goal-metrics.test.ts` |
| `npm run lint` | 0 errors, ~165 warnings | **1 error, 168 warnings** (the error: `xp.ts:11` unused import) |

Held as the invariant for this work: **add zero new errors, zero new lint problems, zero new test failures.**

> ⚠ **Concurrency note.** A second agent session was editing this repository concurrently — including `focus.repository.ts` and `prisma/schema.prisma` — while this work was in progress. The typecheck baseline mutated between two consecutive runs (18 errors in routine/recap/analytics → 13 errors in routine/achievements/recap-components, entirely different files), and the untracked `tests/` directory was deleted mid-session. Any future reader comparing error counts should re-measure rather than trust the numbers above.

## 29. What changed

### 29.1 Step 1 — the `abortedAt` black hole, closed

`CreateFocusSessionData` now declares `abortedAt`, `pausedAt` and `pausedTotalSeconds`, and `FocusRepository.createSession` builds its Prisma payload as an explicitly-typed `Prisma.FocusSessionUncheckedCreateInput` rather than a loose object. Declaring the field is what fixes the bug; the explicit typing is what stops the same class of bug recurring — a field the service computes and the repository forgets is now a property that does not exist on the target type.

### 29.2 Step 2 — Migration 1

```prisma
enum FocusSessionType { FOCUS  SHORT_BREAK  LONG_BREAK  STOPWATCH }

model FocusSession {
  type               FocusSessionType @default(FOCUS)
  pausedTotalSeconds Int              @default(0)
  @@index([userId, completedAt, abortedAt])
  @@index([userId, type, startedAt])
}
```

Backfill:

```sql
UPDATE "FocusSession" SET "type" = CASE title
  WHEN 'Short break'      THEN 'SHORT_BREAK'
  WHEN 'Long break'       THEN 'LONG_BREAK'
  WHEN 'Stopwatch session' THEN 'STOPWATCH'
  ELSE 'FOCUS' END;

UPDATE "FocusSession" SET "abortedAt" = "createdAt"
WHERE "completedAt" IS NULL AND "abortedAt" IS NULL AND "actualDuration" IS NOT NULL;
```

The second statement is safe and is worth justifying, because the audit's own §7.3 finding appears to argue against it: rows are only written at the end of a run, so "stopped early" and "finished row" are not distinguishable. They are — for rows this app wrote, `abortedAt` was *intended* and lost by the repository bug, so every row matching that predicate is a row the browser posted after an early stop. Leaving them `completedAt: null` is what keeps them looking live forever. The first statement is a pure widening: an unrecognised title becomes `FOCUS`, exactly what the old aggregations assumed.

The mapping is expressed once, in `lib/focus/type-backfill.ts`, in both directions — `focusTypeFromTitle` for the backfill and `focusTimerPayloadToSessionType` for the wire — so the forward and reverse mappings cannot drift. That drift is what caused the original bug.

### 29.3 What stops counting as focus time

`lib/focus/type-backfill.ts` defines `FOCUS_TIME_TYPES = ['FOCUS', 'STOPWATCH']` and `countsAsFocusTime()`. **Every** aggregate now filters on that one list — `getStats`, `countCompletedSessions`, `findCompletedSessionStarts`, `findRowsForStats`. There is no second place to keep in sync, which is the only reason six call sites (§28.3) change consistently from one repository edit.

### 29.4 Step 3 — the pure timer core

| File | Responsibility |
| --- | --- |
| `lib/focus/timer-machine.ts` | reducer + readouts. `now` is an explicit parameter, never `Date.now()`, so the whole file is testable — including cases impossible to reproduce by hand, like a countdown that expired while the machine slept. |
| `lib/focus/settle.ts` | lazy settlement: countdown past `startedAt + planned + pausedTotal` completes at the deadline (not at reopen time, so the session lands on the right day); a stopwatch older than 12 h aborts with a capped duration. |
| `lib/focus/stats.ts` | per-day bucketing and the streak, in `UserSettings.timezone`. |
| `lib/focus/type-backfill.ts` | the `title` ⇄ `type` mapping, both directions. |

### 29.5 Step 5 — the frozen timer, closed

The architectural fix is that `FocusRuntime` (mounted in `(dashboard)/layout.tsx`) owns the timer, not a page component. Because it is in the layout, it survives navigation, so the store is always populated by a live owner — which removes the failure mode rather than patching its symptom.

---

# Part III — Phase 0 verification and the focus-lifecycle build

## 30. Phase 0: discrepancies resolved

All five of the plan's discrepancies were real and are now closed. Each was checked against the file, not against the audit.

| # | Plan said | Actual | Resolution |
| --- | --- | --- | --- |
| **D1** | Migration 1 added `[userId, completedAt, abortedAt]` and `[userId, type, startedAt]`; the provided schema shows only `[userId, startedAt]`, `[categoryId]`, `[userId, createdAt]` | **Real.** Both indexes were absent from the live schema. | Re-added in Phase 1.1, alongside `[userId, localDate]` and `[userId, runId]`. |
| **D2** | `pausedTotalSeconds` should be non-null with a default of 0; the schema has it nullable | **Real.** It was `Int?`. | Now `Int @default(0)`, with the null→0 backfill. The reason it matters is recorded on the column: `settleSession` derives expiry from this number, and a silent `null` there would expire a paused session early. |
| **D3** | Unknown whether `FocusTimer.tsx` is still the monolith and whether the server holds running rows | **Partly wrong.** `FocusTimer.tsx` is still 1,506 lines. `FocusRuntime.tsx` does **not** exist. | Plan's worst-case assumption confirmed. Phase 2 owns this. |
| **D4** | `Break.quality` is an integer 1–5 | **Confirmed.** `Int?`, validated `z.number().int().min(1).max(5)`. | Now also converting `breakType` to a real enum. |
| **D5** | `lib/focus/{settle,stats,timer-machine,type-backfill}.ts` exist | **Confirmed** — they were written during Step 3. | Reused, not rewritten. |

## 31. Phase 0: baseline

Re-measured, because the plan requires it and because the concurrent-agent risk in §19 materialised.

| Command | Result |
| --- | --- |
| `npm run type-check` | **2 errors**, both in `src/hooks/useOfflineSync.ts` (a file outside this work — a syntax error at line 144). |
| `npx eslint .` | **23 errors, 209 warnings** repo-wide. **0 errors in any focus or break file.** |
| `npm test` | **23 test files, all passing.** |

> 🔴 **`npm run lint` was completely broken and has been repaired.** It failed with *"A configuration object specifies rule `react-hooks/set-state-in-effect`, but could not find plugin `react-hooks`"* — not a warning, a hard abort before a single file was read, so the whole repository had no lint at all. Cause: ESLint resolved to **9.39.5**, which requires a `files`-scoped config object to declare the plugins whose rules it uses. The `scripts/**/*.ts` block in `eslint.config.mjs` did not, and because `npm run lint` runs `eslint .`, one unresolvable scoped block took down lint for `src` as well.
>
> Fixed by registering `eslint-plugin-react-hooks` explicitly, under the key `react-hooks`. The key name matters and is worth recording: registering it as `reactHooks` loads the same plugin object, leaves every `react-hooks/*` rule unresolvable, and produces the *identical* error — which makes it very easy to "fix" twice in the wrong direction.

## 32. Phase 1.1 — the schema

`prisma/schema.prisma`. Four new models, five new enums, fifteen new `FocusSession` columns, six back-relations, six new indexes.

**Enums:** `FocusSessionEndReason` (COMPLETED/STOPPED/SKIPPED/MODE_SWITCHED/AUTO_STALE/MANUAL), `FocusSessionSource` (TIMER/MANUAL/RECOVERED), `FocusEventType` (8 members), `FocusReflectionMode` (ALWAYS/FOCUS_ONLY/MIN_LENGTH/NEVER), `BreakType` (SHORT/LONG/MEAL/WALK/STRETCH/REST/CUSTOM — replacing `String?`).

**New models:** `FocusSessionEvent` (append-only lifecycle log), `FocusSettings` (1:1 preferences), `FocusPreset` (named profiles), `FocusDayTypeTarget` (per-day-type targets).

**`FocusSession` columns added:** `clientId`, `runId`, `cycleIndex`, `endReason`, `source`, `pauseCount`, `extendedSeconds`, `distractionCount`, `lastHeartbeatAt`, `timezone`, `localDate`, `taskId`, `goalId`, `habitId`, `routineBlockId`. Plus `pausedTotalSeconds` hardened to non-null.

Every link is `onDelete: SetNull` — deleting a task must unlink the session, not fail the delete. That is the rule `TimeEntry.goalId` already follows, so the behaviour is consistent rather than novel.

## 33. Phase 1.2 — the migration SQL

`prisma/sql/focus-lifecycle.sql` and `prisma/sql/focus-backfill-dry-run.sql`.

The repo uses `db push` and has no `prisma/migrations`, so the SQL file is the reviewable record of the three things `db push` cannot do *safely*:

1. **The partial unique index** `one_active_session_per_user` — Prisma cannot express a partial index. This is the hard guarantee behind "starting a second session aborts the first"; the service check only produces a friendly message, and only the index makes the invariant true when two devices race.
2. **`Break.breakType` string→enum normalisation**, which must run *before* the column type change or the ALTER fails with an opaque error naming one arbitrary offending row.
3. **The backfills**, each with its reasoning written next to it.

The dry-run is read-only and reports, before anything changes: the type-backfill split, **the focus minutes that will be removed from every total in the product**, the frozen-timer rows that will be recovered, and — the one that matters most — **the ambiguous rows the backfill refuses to guess at**. Those keep `endReason = NULL`, and the statistics module reads a null end reason as "unknown", never as completed.

Two backfill judgements worth stating explicitly:

- **`abortedAt` recovery.** Every stopped session currently reads as *running*, because the repository silently dropped the field the service computed. These rows are provably finished — a browser posted them after ending the run — so recovering them is the point, not a risk. `createdAt` stands in for the end time; it is within a second of the real one.
- **`endReason` backfill.** `completedAt` → COMPLETED is unambiguous. `abortedAt` → STOPPED is honest but lossy: skip and mode-switch are indistinguishable in the data, so STOPPED is chosen over a fabricated specific reason.

## 34. Phase 1.3–1.4 — repositories and service

**Repository.** The `abortedAt` hotfix, now with the Prisma payload built as an explicitly-typed `Prisma.FocusSessionUncheckedCreateInput` — so a field the service computes and the repository forgets is a *type* error, not a silent no-op. Plus `statusWhere` / `buildSessionsWhere` (status filtering pushed into SQL, making `meta.total` real), `countSessions`, `findRowsForStats`, `applyTransition`, and `assertCategoryOwned`.

**Service.** The three-arm input union is now discriminated on `actualSeconds` rather than on `type`. Worth recording why: branching on `'type' in input` was correct when only two arms existed, and silently stopped being correct the moment the "start" arm was added, because that arm also has a `type` — so a Start request matched the finished-payload branch and then read `input.actualSeconds`, which does not exist on it. **A union discriminator must be a field that only one arm has**, and adding a variant that shares a discriminator with an existing variant is a type error waiting to happen.

`createSession` now also: creates a **running** row on Start (no `completedAt`, no `abortedAt`, no `actualDuration` — a start request must not be able to assert finished work), rejects a second active session with a `ConflictError`, and asserts category ownership before writing a `SetNull` relation that would otherwise silently attach a session to another user's category.

## 35. Phase 1 remainder + lifecycle API

### 35.1 Pure modules added

| File | Responsibility |
| --- | --- |
| `lib/focus/recovery.ts` | The recovery decision layer. See below — it is the subtlest piece of this work. |
| `lib/focus/day-split.ts` | Daily attribution: minutes split at local midnight, resolved through `dayBoundsInTimezone` so DST is handled by the zone database rather than by assuming 24-hour days. |

### 35.2 The recovery asymmetry, stated once

Auto-**completing** a session invents work the user may not have done, and silently inflates statistics and can unlock achievements. Auto-**aborting** one destroys work they did do. So the default is always the *smaller* claim, and the larger claim is always something the user has to actively choose.

Concretely, heartbeats are a **lower bound on presence, never permission to claim time**. If they were authoritative, a client that kept posting them would manufacture focus minutes on a session it had abandoned, and the number would stop meaning anything. Because they only ever *narrow* ambiguity — they rule out "the tab was gone", never "the work happened" — the worst a buggy or hostile client can do is make the server *more* willing to credit a deadline it had already decided had passed.

And `credit-full` produces a `COMPLETED` session because **the user's word is what makes work completed**, not the deadline having passed. Recovery is the one place where "the timer ran out" is not evidence that "the work happened".

### 35.3 Repositories

`focus-event.repository.ts` — the append-only lifecycle log. Includes `pauseSpans()`, which rebuilds paused time from the log and therefore can correct the denormalised `pausedTotalSeconds` if the two ever disagree.

`focus-settings.repository.ts` — `FocusSettings`, `FocusPreset` and `FocusDayTypeTarget`. Three defaults are seeded on first use (Classic 25/5, Deep work 50/10, Long block 90/20), guarded on the user having *no* presets rather than on a boolean "seeded" flag — a flag would recreate presets the user had deliberately deleted.

### 35.4 🔴 A bug this work introduced, and caught

All seven `applyTransition` call sites were written as `applyTransition(sessionId, userId, …)` against a `(userId, sessionId, patch)` signature. **Both parameters are `string`, so TypeScript cannot detect this.** Every lifecycle write was targeting `where: { id: <userId>, userId: <sessionId> }`.

This is worth recording as a general lesson rather than a one-off. Two same-typed identifiers in the same position is the one parameter-order mistake the type system is structurally blind to, and it fails *closed* here (the row is not found) rather than open — but only by luck of how the `where` happens to be built. The repository now takes `(userId, sessionId)` to match `findById` and `delete`, and every call site was corrected.

The mitigation that actually generalises: **two same-typed identifiers should not be adjacent parameters at all.** A branded type (`type UserId = string & { __brand }`) would make the compiler reject the swap outright. That is the real fix and it has not been applied — it is listed as follow-up work rather than quietly claimed as done.

### 35.5 Lifecycle API

Eight new routes, all authenticated, Zod-validated, ownership-checked and idempotent:

| Route | Notes |
| --- | --- |
| `POST /api/focus/start` | Creates a **running** row. `409` on a second active session, so the client can offer take-over. |
| `POST /api/focus/[id]/pause` | Records a `reason`, because "I paused" and "sleep started" are different facts. |
| `POST /api/focus/[id]/resume` | Adds the span to `pausedTotalSeconds` — once, on the transition. |
| `POST /api/focus/[id]/extend` | Increments `extendedSeconds`, **not** `plannedDuration`, so estimate accuracy stays measurable. |
| `POST /api/focus/[id]/heartbeat` | Evidence only. `204`, no body. |
| `POST /api/focus/[id]/end` | Supersedes `/complete`. `endReason` is **required** — optional would make completion rate drift to 100%. |
| `POST/GET /api/focus/[id]/events` | Mid-session distraction/note capture, and the timeline. |
| `POST /api/focus/[id]/recover` | Applies the user's decision. `discard` deletes rather than aborts. |

On `/end`, the server's timestamp-derived duration is the authority and the client's claim is recorded but **never trusted** — this number feeds achievement thresholds, and the server's clock is the one that cannot be edited from a browser.

## 36. Status after this pass

| Check | Result |
| --- | --- |
| `prisma validate` | valid |
| `npm run type-check` | **0 errors in any focus or break file.** 74 errors elsewhere, all in the concurrent session's routine/journal/offline work. |
| `npx eslint` (focus + break files) | **0 errors**, 2 pre-existing warnings in `api/focus/route.ts` |
| `npm test` | No focus failures. 52 failures in `tests/domain/routine-service.test.ts`, from the concurrent routine refactor. |

## 37. Phase 2 — the client runtime

### 37.1 The database push

The schema had **already been pushed** by the concurrent session while this work was
in progress. Discovered when `000_pre_backfill.sql` failed with *"invalid input
value for enum BreakType: short"* — a statement that can only fail if the column is
already enum-typed.

Verified state before touching anything: **0 focus sessions, 0 breaks, 1 user.** The
database is effectively empty, so every backfill is a no-op, the enum conversion had
nothing to convert, and the `abortedAt` recovery had no rows to recover. The
migration carried no data-loss risk at all — worth establishing before pushing
rather than assuming.

Applied what `db push` cannot:

| Item | Status |
| --- | --- |
| 4 new tables, 6 enums, 38 `FocusSession` columns, all indexes | already present from the concurrent push |
| `one_active_session_per_user` partial unique index | **applied** (raw SQL) |
| Backfills 1–7 | applied; all no-ops on an empty table |

Verified against the live database, not just the schema file:

```
created: cmusjsjg | type= FOCUS | pausedTotal= 0 | source= TIMER
active lookup: cmusjsjg
second active row REJECTED: by one_active_session_per_user
```

That last line is the one that matters: the constraint genuinely fires.

### 37.2 Two real bugs the live database caught

**A `CASE` over text literals cannot be assigned to an enum column.** `SET "type" =
CASE "title" … END` failed with *"column type is of type FocusSessionType but
expression is of type text"*. Postgres will not implicitly coerce text to an enum;
the whole expression needs `::"FocusSessionType"`. This was invisible to
`prisma validate` and to every static check, because it is a database-side type
rule rather than a TypeScript one.

**A `btrim()` guard broke the parse.** `btrim("breakType")` inside a
function-argument position is ambiguous with the new `BreakType` *type*, and
Postgres resolved it as a cast and errored. The statement was also redundant — the
preceding `NOT IN (…)` already maps `''` and `'   '` to `CUSTOM` — so it was deleted
rather than fixed.

Both are now recorded in the SQL with the reason, because they will recur the next
time somebody writes a backfill.

### 37.3 The runtime

`components/focus/FocusRuntime.tsx`, mounted in `(dashboard)/layout.tsx`. It returns
`null`; everything visible is derived from the store.

| Concern | Approach |
| --- | --- |
| Deadline | One `setTimeout` armed against `endsAt`, not an interval. Re-armed on change, disarmed otherwise. |
| Long timeboxes | Capped at `2^31-1` ms. An overflowed `setTimeout` fires *immediately*, which is the classic symptom of not clamping. |
| Heartbeat | Every 60 s, only while `document.visibilityState === 'visible'`. |
| Persistence | User-scoped key `routineos:focus:v2:<userId>`, so a shared browser cannot leak a running timer to the next sign-in. |
| Cross-tab | `storage` event plus a `CustomEvent`. |
| Retry queue | In-memory, replayed on `online` and on refocus. Deliberately **not** persisted — replaying a stale `pause` on the next login would pause a session nobody paused. |
| Completion | Chime → notification (only when hidden) → title → `runAchievementCheck()` → auto-start. |
| Sleep | Auto-pauses through the existing poller, with a toast and a Resume action. |

### 37.4 What was deleted

`FocusTimer.tsx` (**1,506 lines**) and `FlipClock.tsx` (188 lines). Neither had a
single remaining reference. That is 1,694 lines removed against roughly 900 added
across five focused modules — the point being the split, not the line count.

### 37.5 A note on the 13-subscription problem

The old floating bar took **13** `useFocusStore` selectors. It now takes 9, none of
which re-render on a value it does not display, and the clock subscription is
conditional on a session being live.

`FocusRuntime` deliberately uses per-field selectors rather than
`useFocusStore()` wholesale. Subscribing to the whole object means every callback
closes over the whole store, so every one of them re-creates on every change —
including `error` and `collapsed`, which have nothing to do with the timer. The
whole-store subscription *is* the bug the old thirteen selectors were symptoms of.

## 38. Status after Phase 2

| Check | Result |
| --- | --- |
| `prisma validate` | valid |
| `npm run type-check` | **0 errors** in any focus file |
| `npx eslint` (all focus files) | **0 errors** |
| `npm test` | No focus failures. 2 failing files — `tests/tmp-verify-orphan.test.ts` and `tests/domain/routine-service.test.ts` — both from the concurrent session. |

## 39. Phase 1.6 — the metrics glossary

`lib/focus/metrics.ts`. The audit's most consequential finding was that **four**
definitions of "focus minutes" coexisted, each with a different denominator and a
different timezone assumption. Four definitions is not a bug to fix one at a time;
it is a missing shared module.

| Term | Definition |
| --- | --- |
| Focus session | `FOCUS` or `STOPWATCH`. Breaks never count. |
| Completed session | `endReason === 'COMPLETED'`. **Only** this one. |
| Partial session | Ended early, with at least `minimumCountedMinutes` (5). |
| Focus minutes | Completed minutes + qualifying partials. |
| Completion rate | Completed ÷ started, over sessions long enough to judge. |
| Focus day | A day reaching `streakDayMinutes` (25). Drives the streak. |

### 39.1 Three judgement calls, stated

**`isCompletedSession` keys on `endReason`, never on `completedAt != null`.** Three
cases set `completedAt` and mean different things: a `MANUAL` entry, a
`RECOVERED` session, and the `abortedAt` backfill's replayed rows. Testing on the
timestamp would make completion rate permanently 100% — the break-contamination
defect, one level up.

**Partials count above a floor, and the floor is 5 minutes.** Hiding 22 minutes
because a session was incomplete makes the headline number wrong in the direction
that flatters. But no floor at all means a streak can be manufactured by starting
and stopping twenty times. Sub-floor partials stay in *history*.

**Completion rate returns `null`, not `0`, when there is nothing to judge.**
"You have not completed anything yet" and "you completed nothing" are different
facts; rendering them identically shows a new user a 0% rate before they have done
anything wrong.

### 39.2 A known, documented divergence

`FocusRepository.getStats` cannot apply the partial floor: `_sum` over a `where`
clause has no way to apply a per-row predicate that depends on `endReason`. So the
aggregate returns the **completed-only** figure and reads lower than
`GET /api/focus/stats`, which applies the full glossary in JS.

This is recorded on the method rather than left as an undocumented discrepancy. It
errs low, and erring low is the safe direction for a number that unlocks
achievements. The six consumers (`achievement.service`, `analytics.service`,
`dashboard-overview.service`, `analytics/monthly`, `analytics/yearly`) all route
through this one method, so they are consistent *with each other* — which is the
property that matters most — and the remaining gap is tracked as the Phase 1.6
follow-up.

## 40. Phase 1.5 — backup coverage

`src/lib/db/backup.ts` was missing all four new models **and** `Break` entirely.

`Break` is the one that mattered. A backup/restore cycle that omits a table does
not fail loudly — the rows simply come back absent, and every break annotation's
`focusSessionId` is lost with no error anywhere. Both lists are now 35 entries,
verified consistent with no duplicates and nothing missing from either.

The unscoped read is now documented rather than incidental:

```ts
delegate.findMany({ take: SNAPSHOT_LIMIT })   // no `where`
```

That has always read every row of every user's data, truncated rather than paged,
from an admin-triggered path. Adding four more tables extends the exposure. The
real fix is an explicit `userId` parameter or pagination; neither is in scope here,
but the hazard is now written down where the next person will read it.

## 41. Test coverage

**124 focus tests across 5 files**, all passing. The focus domain had **zero**.

| File | Tests | Pins |
| --- | --- | --- |
| `focus-metrics.test.ts` | 30 | Every glossary definition, including the null-vs-zero rate and the midnight split summing back exactly |
| `focus-recovery.test.ts` | 27 | Every row of the recovery matrix, and the never-generous-by-default property |
| `focus-timer-machine.test.ts` | 40 | Purity, pause accounting, idempotent finish, the guards against silent recording |
| `focus-day-split.test.ts` | 13 | Zone-correct attribution, DST-safe, bounded on corrupt input |
| `focus-type-backfill.test.ts` | 14 | The title ⇄ type mapping round-trips in both directions |

### 41.1 Two bugs the tests caught in my own code

**`noHeartbeatPolicy: 'conservative'` credited the full timebox.** The constant was
named and documented as conservative; the branch it guarded returned
`min(now, deadline)` — full credit with no evidence at all. That is exactly the
invention of work the recovery module exists to prevent. Now returns `0`. Caught by
`evidenceMs > 'is zero with no evidence at all'`.

**`remainingMs` returned `0` for an idle timer.** The `endsAt === null` guard fired
before the idle branch, so a fresh dial read `00:00` instead of `25:00` — telling
someone who has not started yet that they have no time. Reordered so a stopwatch
checks the plan first and idle reports the plan.

A third test failure was my test being wrong rather than the code: 14:50→15:10 UTC
*does* cross Tokyo midnight. The test was corrected to assert the real behaviour
(and a second case added for a window that does not cross it), because "my
expectation was wrong" is worth recording separately from "the code was wrong".

## 42. Status

| Check | Result |
| --- | --- |
| `prisma validate` | valid |
| `npm run type-check` | **0 errors** in any focus file |
| `npx eslint` (all focus + backup files) | **0 errors** |
| `npm test` | **124 focus tests passing**, 5 files |

Repo-wide the concurrent session's routine/journal/offline work accounts for ~85
type errors and 2 failing test files; none are in focus.

## 43. Phase 5 - history, detail and reflection

### 43.1 `useFocusSessions` - one fetcher

The audit found **three** `GET /api/focus` fetches (two on the page, one on retry, two
of them with no `AbortController`). This hook is the only one now.

Two details worth recording:

**The row count lives in a ref, not in the dependency array.** `load-more` needs the
current length to compute an offset, but making the callback depend on
`state.rows.length` re-creates it after every append, which re-runs the mount effect and
refetches from page one - "load more" would load page one again. The ref reads the same
value at call time with no identity change. This was written with an `eslint-disable`
first; the ref is the actual fix.

**Invalidation is event-driven, never time-based.** Anything that could have ended a
session dispatches an event, so an open drawer cannot show a session that has since
finished. A cache that expires on a timer and hopes is the version that eventually shows
a stale row.

### 43.2 `SessionDetailSheet` - the part the audit called out

> `/focus/session` had **no edit, no delete, no pagination, no filter**

`PATCH` and `DELETE` existed and had **zero callers anywhere in `src/`**. They are now
wired, and two decisions are deliberate:

**Delete is delayed, not optimistic.** The request fires after a 6-second undo window.
The alternative - delete now, recreate on undo - would need a restore endpoint and would
leave a row *looking* deleted if the toast was dismissed by a reload. A row that appears
deleted and is not is worse than one briefly still there.

**The form is seeded on mount, keyed on `session.id`.** Not reset in an effect. The
drawer refetches whenever a session ends, so an effect would wipe a note someone was
mid-way through typing. A `key` makes the remount the reset mechanism, which also
removes a `setState`-in-effect render pass on every transition.

The event timeline is the first and only consumer of the `FocusSessionEvent` table. It
turns "I paused twice" from a claim into something checkable.

### 43.3 Dead code removed - and one thing restored

Deleted, after grep-confirming zero importers: `lib/focus/analytics.ts`,
`lib/focus/pomodoro.ts`, `lib/focus/session-manager.ts`, `PomodoroSettings.tsx`,
`BreakNotification.tsx`, `FocusStats.tsx`, `api/focus/[id]/complete`, and the
`listBreaks`/`createBreak` service methods.

**Restored `/api/breaks`.** I deleted it as dead - zero client consumers, and the plan
lists it for removal - but it is the *breaks* domain's API surface, not this page's.
Overreach, corrected. `break-scheduler.ts` was reinstated to serve it, with a note that
its hard-coded Pomodoro defaults are wrong for the `nextScheduledBreak` hint if that
hint is ever shown, since it would contradict the timer the user is looking at.

`/focus/session` is now a redirect, which keeps the URL working for bookmarks while the
content lives in the drawer.

### 43.4 Keyboard layer

The audit's finding was that the focus timer had **no keyboard control at all** - not a
poor implementation, none, while `useKeyboard` sat unused in the repo.

The rule that matters: **shortcuts are disabled while the user is typing.** `Space` is
the primary action here and also the key that types a space; without the guard, typing a
word into the intent field would pause and resume the timer on every keystroke.
`isTypingTarget` is the single place that decides, so no shortcut re-implements it and
gets it wrong. Browser and AT combinations (`Cmd/Ctrl+...`) are left alone.

The shortcut table is **data**, rendered by `ShortcutsDialog` from the same array the
handler dispatches on - a hand-written cheat sheet is correct for exactly one release.
Unavailable shortcuts show greyed rather than hidden, because someone pressing `L` and
seeing nothing happen needs to know the key exists and why it did nothing.

### 43.5 Two design errors I made and fixed

**`SessionDetailSheet` had a module-level `pendingDeleteRef`.** Two mounted sheets would
share one timer, so opening a row in two places could cancel the other's pending delete -
and the unmount cleanup could never cancel it, because it only saw its own instance's
ref. Now a proper `useRef`.

**`useFocusSessions` shipped with an `eslint-disable`** to silence a deps warning.
Suppressing the warning hid the actual bug (the load-more loop). Fixed with the ref; the
suppression is gone.

## 44. Final state

| Check | Result |
| --- | --- |
| `prisma validate` | valid |
| `npm run type-check` | **0 errors** in any focus file |
| `npx eslint` (focus domain, ~20 files) | **0 errors, 0 warnings** |
| `npm test` | **124 focus tests passing**, 5 files |

Repo-wide the concurrent session's routine/journal/offline work accounts for the
remaining type errors and 2 failing test files. None are in focus.

### 44.1 Follow-ups I did not do, and why

| Item | Why |
| --- | --- |
| Branded `UserId` type | The real fix for the swapped-`sessionId`/`userId` class of bug. Two same-typed identifiers in the same position is the one parameter-order mistake TypeScript is structurally blind to, and a brand would make it a compile error. Not applied - it touches every repository. |
| `getStats` behind the glossary | The aggregate cannot express the partial floor. Documented on both sides rather than half-fixed; the divergence errs low, which is safe for achievements. |
| Export/import/validator/seed scripts | Only `backup.ts` was updated. The other data paths were not traced. |
| Server push at `endsAt` | Out of scope per the original brief. |
| `DailyScore` / `TimeEntry` / `ProductivityPattern` | Explicitly not to be touched. |
| Context rail, task/goal/habit links | Phase 4. The schema supports them; nothing renders them yet. |

---

*End of `/focus` audit. Part I is the pre-change baseline; Part II the verification
and first data-layer pass; Part III the lifecycle build, the runtime, the metrics
glossary, and the history/reflection/keyboard layer.*
## 45. Closing pass

### 45.1 `getStats` divergence — closed, not documented

The follow-up from 44.1 is **done**, and the reason it could be done is that the
earlier claim was wrong.

I had written that the counting rule "cannot be expressed in a `where` clause,
because it keys on `endReason`". It can:

```
OR [
  { completedAt: notNull, actualDuration: gt 0 },    // completed
  { abortedAt:   notNull, actualDuration: gte min },  // partial, above the floor
]
```

`endReason` is a *derived convenience* over those same two timestamp columns.
`getFocusSessionStatus` reads them as a pair, and so does the
`one_active_session_per_user` partial index — so testing the timestamps directly is
not a second definition, it is the same definition expressed at the layer that can
actually filter.

The result is **one predicate, one aggregate, six consumers**, and no divergence.
The service's `getStats` docstring was corrected, because it still claimed the two
"legitimately differ".

### 45.2 🔴 A real bug the new test caught

Writing `tests/lib/focus-counting-rule.test.ts` — which pins the SQL predicate and
the JS rule against each other — immediately failed on *"still running"*.

`countsTowardTotals` was:

```ts
if (isCompletedSession(row)) return minutes > 0;
return minutes >= minimum;      // ← endReason: null fell through here
```

A row with **no terminal timestamp** — an in-progress session, or one of the
ambiguous rows the backfill deliberately leaves `endReason` null — satisfied
`actualDuration >= 5` and was credited as **finished focus work**. Since
`actualDuration` is written as a session progresses, **every running session over
five minutes was inflating `/api/focus/stats`**, and would have done so for every
user with a session open.

The fix is an explicit guard: unknown is never counted as work.

This is the strongest argument in the whole effort for the test that found it. The
SQL side was right, the JS side was wrong, and the two only disagreed because nobody
had put them next to each other.

### 45.3 Command palette

`Start focus` / `Pause focus` (whichever is applicable, read live from the store),
`Open focus sessions` and `Open focus stats`. The last two deep-link via
`/focus?panel=sessions|stats`, which is why the page reads `useSearchParams`.

The palette entries go through `getFocusRuntime()`, not the store — the same reason
the floating bar does. A store call would work on `/focus` and silently do nothing
everywhere else, which is the exact bug the floating bar had.

### 45.4 Accessibility

**Touch targets.** Twelve controls had a 36px visual box. Rather than inflating them
to 44px — which turns a compact instrument panel into slabs and looks worse on the
desktop layout that is the primary case — a `.tap-target` utility expands the *hit
area* with an absolutely-positioned pseudo-element and `pointer-events: none`. The
`pointer-events: none` is load-bearing: without it the expanded box sits above
neighbouring controls and steals their clicks.

**Zen mode had lost its `<h1>`.** Hiding the header left the page with no top-level
heading at all. It is now `sr-only` in zen mode, so the visual chrome reduces while
the document structure stays intact.

Also verified: `aria-live` on the dial announces per minute rather than per second;
decorative icons are `aria-hidden`; outcome badges carry icon **and** text, never
colour alone; mode switch is a real tablist with roving `tabindex` and arrow keys.

### 45.5 Performance

- **Exactly two `useFocusNow` subscribers** — `TimerDial` and `FloatingFocusBar`.
  Verified by grepping the filesystem rather than `git grep`, which silently skips
  untracked files and had briefly reported one.
- **No barrel imports** in the focus components. Every primitive is imported
  directly, so the 26-export `components/ui` barrel never enters this page's graph.
- **No chart code on `/focus`.** Confirmed by grep; the stats panel is plain text and
  a 7-day list, not recharts.
- **The drawer is code-split** via `next/dynamic` with `ssr: false`. It pulls in the
  history table, filters, detail sheet and stats panel — none of which are needed to
  press Start.

### 45.6 Final verification

| Check | Result |
| --- | --- |
| `prisma validate` | valid |
| `npm run type-check` | **0 errors** in focus files |
| `npx eslint` (focus domain) | **0 errors** |
| `npm test` | **139 focus tests passing**, 6 files |

Repo-wide lint is 20 errors / 231 warnings and 2 test files fail — all in the
concurrent session's routine/journal work (`routine-service.test.ts` calling
`createBlockForDayType`, which no longer exists, and `tmp-verify-orphan.test.ts`
needing `DATABASE_URL`). None are in focus.