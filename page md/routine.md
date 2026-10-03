# `/routine` — Complete System Audit

**Route:** `http://localhost:3000/routine`
**Route file:** `src/app/(dashboard)/routine/page.tsx` (1113 physical lines, `'use client'`)
**Project:** RoutineOS (`daily-plan`) — Next.js 16 (App Router) + React 19 + TypeScript + Tailwind v4 + Prisma 7 + PostgreSQL (Neon)
**First audited:** 2026-09-30
**This revision:** 2026-10-02 — **full rewrite.** The page was rebuilt; the previous revision described a page that no longer exists.
**Re-verified:** 2026-10-02 (later pass). Three findings below were **fixed in code and are marked RESOLVED** — F6 (edit window now guards block writes), F8 (all `YYYY-MM-DD` validation now goes through `calendarDateSchema`), and the eight dead types in [§22](#22-dead-surface-inventory) (deleted). F10's orphaned routes are now partly adopted. Claims not re-checked in that pass are unchanged from the rewrite above.
**Status:** describes **only** what exists in the codebase. Every claim is file-anchored. Anything that looks like a feature but is not wired up is in [§22](#22-dead-surface-inventory) and [§21](#21-findings-register).

> **Three runtime bugs found and fixed after this document was written**, all of which the audit text above did not predict. Recorded here because each is a *data-flow* defect, and this document is the spec that data flow is supposed to follow.
>
> 1. **`api-response.ts` returned plain objects, not `Response`s.** Next 16 rejects a plain object from a route handler, so every route importing a helper from that module returned `500 No response is returned from route handler ... received 'Object'`. `errorResponse(error, status)` additionally took `status` in a slot the call sites passed `details` to, so a `401` was being sent as **`200` with `details: 401`**. All helpers now return `NextResponse` and honour the status argument.
> 2. **The block editor's live overlap preview compared the wrong schedule.** `BlockEditor` received `siblings` — the block list of the day type **resolved for the date being viewed** — and compared the form against it regardless of which day type the form targeted. Adding a `09:00–13:00` block to a Placement schedule while viewing a College date reported a clash against a *College* block that does not apply. The preview is now scoped by a required `siblingsDayTypeId` prop, and stands down with a visible note when the target differs. The **server was always correct** — it resolves the template from the submitted day type — so this never corrupted data, it only lied to the user before they saved.
> 3. **Two SVG animations crashed or silently skipped.** `ProgressRing` animated `strokeDashoffset` with no `initial`, so Framer read `undefined` from the SVG presentation attribute, warned, and skipped the tween. `MomentumPanel` called `getTotalLength()` on a persistent `pathRefs` array that can retain paths unmounted by a previous render, and `getTotalLength()` throws `InvalidStateError` on a detached geometry node, taking down the panel.
>
> A fourth, non-code issue is worth recording: **four stale `next dev` processes were running against one `.next` directory.** Concurrent dev servers corrupt the generated route-type manifest — the same failure that produced a corrupted `.next/dev/types/routes.d.ts` earlier. Stop every server before deleting `.next`, and confirm with `Get-NetTCPConnection -LocalPort 3000 -State Listen` that exactly one process owns the port.


> **What changed since the 2026-09-30 audit.** That revision documented a 512-line page that rendered `RoutineList`, `AddRoutineBlockModal` and a `RoutineScheduleDebug` panel, read its blocks from `AppContext.routineBlocks` (`GET /api/routine`), and had **no date picker and no day-type selector driven by real data**. It has been replaced. The four components named above no longer exist as files; `AppContext` no longer fetches routine data at all; the page now owns **one request per date** and keeps date + day type in the URL.
>
> Findings F1–F29 from the previous revision are **not** carried forward unless independently re-verified here. Sections that describe the old page have been replaced wholesale rather than patched, because the page's data flow changed shape rather than gaining features.

---

## Table of contents

| §   | Section                                                                                    |
| --- | ----------------------------------------------------------------------------------------- |
| 1   | [What `/routine` is, in one paragraph](#1-what-routine-is-in-one-paragraph)                |
| 2   | [Page composition](#2-page-composition)                                                    |
| 3   | [Component inventory](#3-component-inventory)                                              |
| 4   | [State: the URL is the source of truth](#4-state-the-url-is-the-source-of-truth)          |
| 5   | [The data chain](#5-the-data-chain)                                                        |
| 6   | [Pure logic — `src/lib/routine/`](#6-pure-logic--srclibroutine)                            |
| 7   | [The Gantt layout engine](#7-the-gantt-layout-engine)                                      |
| 8   | [API surface — called by this page](#8-api-surface--called-by-this-page)                   |
| 9   | [API surface — orphaned](#9-api-surface--orphaned)                                          |
| 10  | [Service and repository contract](#10-service-and-repository-contract)                     |
| 11  | [Complete user actions (serial)](#11-complete-user-actions-serial)                        |
| 12  | [What the user can create, edit, delete](#12-what-the-user-can-create-edit-delete)          |
| 13  | [Cross-page dependencies](#13-cross-page-dependencies)                                     |
| 14  | [Impact analysis and failure modes](#14-impact-analysis-and-failure-modes)                 |
| 15  | [Current system capabilities](#15-current-system-capabilities)                             |
| 16  | [Loading / error / empty / edge states](#16-loading--error--empty--edge-states)             |
| 17  | [Authentication and security](#17-authentication-and-security)                             |
| 18  | [Performance](#18-performance)                                                             |
| 19  | [Design-system additions](#19-design-system-additions)                                     |
| 20  | [Accessibility](#20-accessibility)                                                         |
| 21  | [Findings register](#21-findings-register)                                                 |
| 22  | [Dead surface inventory](#22-dead-surface-inventory)                                       |
| 23  | [Duplication map](#23-duplication-map)                                                     |
| 24  | [Tests](#24-tests)                                                                         |

---

## 1. What `/routine` is, in one paragraph

`/routine` is the app's **schedule builder and time-and-schedule command centre**. It is a `'use client'` Client Component that renders a hero summary for one selected date, a 14-day date strip, a day-type tab strip, a **Gantt timeline** laid out on a real time axis, and a right-hand analytics rail (now/next, a 24-hour distribution bar, and the active preset's reach). It owns **exactly one data request** — `GET /api/routine/today?date=YYYY-MM-DD` — via the `useRoutineDay` hook, and derives everything else with pure functions from `src/lib/routine/`. The selected **date and day type live in the URL** (`?date=`, `?day=`), so a reload, a bookmark and the browser Back button all restore the same view. Writes are four: `POST /api/routine/today` (tick done / start / log detail), `PUT /api/routine` (nudge and edit), `POST /api/routine` (create, duplicate), `DELETE /api/routine`, plus `POST`/`PUT /api/day-types` and `POST /api/day-mode` for the two editors. It has no `loading.tsx` and no `error.tsx` of its own — every state it can be in is rendered inline by `RoutineStates.tsx`.

---

## 2. Page composition

`src/app/(dashboard)/routine/` contains **exactly one file**, `page.tsx`. Layout is a `max-w-7xl` container over an animated gradient mesh with a 4% grain overlay.

```
/routine  (src/app/(dashboard)/routine/page.tsx — 916 lines, 'use client')
│
├── <div class="relative mx-auto max-w-7xl …">                     page.tsx:~418
│   ├── [background] div.gradient-mesh-animated  +  div.grain-overlay   (aria-hidden)
│   │
│   ├── <RoutineHero …/>                                     :438   day context + 3 metrics
│   ├── <DateStrip …/>                                       :459   14 days, ← → navigation
│   ├── <DayTypeTabs …/>   (+ TabsSkeleton)                   :493   real DayTypeDefinition rows
│   │
│   ├── MAIN GRID  — grid-cols-1 lg:grid-cols-3, NO items-start      :545
│   │   ├── <section class="flex flex-col" lg:col-span-2>     :~553
│   │   │   ├── [error]   <RoutineErrorState onRetry/>       :573
│   │   │   ├── [loading] <RoutineLoadingState/>             :575
│   │   │   ├── [rest]    <RestDayBanner/>                   RoutineStates
│   │   │   ├── [no tmpl] <NoTemplateState/>                 RoutineStates
│   │   │   ├── [empty]   <EmptyBlocksState/>                RoutineStates
│   │   │   └── <RoutineTimeline blocks=visibleBlocks …/>    :594   the Gantt
│   │   └── <aside class="lg:sticky lg:top-4 lg:self-start"> :~626
│   │       ├── <NowNextCard …/>                             :638
│   │       ├── <DayShapeBar …/>                             :649
│   │       └── <AppliesToCard …/>                           :656
│   │
│   ├── Floating "+ Add block" (mobile, safe-area aware)     :613
│   ├── Desktop "+ Add block"                                 :666
│   │
│   └── OVERLAYS                                                :679
│       ├── <BlockEditor …/>        create + edit, one component
│       ├── <CompletionSheet …/>   full log detail for one block
│       ├── <DayTypeEditor …/>     create / edit / archive a day type
│       └── <DayModeDialog/>       DAY_TYPE | REST | MINIMUM | CLEAR   :764 (in-file)
└── <Toaster richColors closeButton/>                         sonner
```

**Why the grid has no `items-start`.** It did, and the timeline panel then only ever grew to its own content height, leaving a dead dark band beneath it on a short day regardless of how tall its neighbour was. Removing `items-start` lets both columns stretch; the timeline's inner scroll area carries the `min-h`/`max-h` bounds instead. `aside` keeps `lg:self-start` so `lg:sticky` still works.

---

## 3. Component inventory

All in `src/components/routine/`. Physical line counts.

| File                        | Lines | Responsibility |
| --------------------------- | ----: | -------------- |
| `BlockEditor.tsx`           |   534 | Create **and** edit a block. One component, two modes. Runs the **same** overlap engine as the server (`conflictsAgainst`, `overlapMinutes` from `lib/routine/conflicts`) for live feedback. |
| `ScheduleBlock.tsx`        |   353 | One block, drawn as a glass capsule. Extracted from `RoutineTimeline.tsx` during the last refactor. Owns the card's three-row content budget and its `STATUS_TEXT` / `STATUS_COLOR` / `ENERGY` maps. |
| `RoutineStates.tsx`        |   291 | Every non-normal state, in one file: 6 skeletons/states + 3 banners + 2 notices + `SectionLabel`. |
| `CompletionSheet.tsx`      |   250 | Full log detail for one block — status, actual times, three ratings, note, clear. |
| `DayTypeEditor.tsx`        |   244 | Create / edit / archive a `DayTypeDefinition`. Uses `previewDayTypeSlug` for a live slug preview. |
| `DayTypeTabs.tsx`          |   229 | The day-type strip. Exports `buildDayTypeTabs` + `DayTypeTab` so the page owns the derived list. Roving `aria-selected`, arrow-key navigation. |
| `RoutineHero.tsx`          |   229 | Glass hero: day context, day-type colour wash, three summary metrics. |
| `DayShapeBar.tsx`          |   173 | 24-hour distribution strip — where the day's minutes actually went, coloured by category. |
| `DateStrip.tsx`            |   168 | 14-day horizontal strip; the selected date is a button, the rest navigate. |
| `NowNextCard.tsx`          |   155 | Current block + next block, with a completion ring. |
| `AppliesToCard.tsx`        |   119 | What the active preset touches: habits, goals, routine templates, date overrides. |
| `ProgressRing.tsx`         |   88   | The SVG ring used by `NowNextCard`. |
| `useDayTypes.ts`           |   82   | `GET /api/day-types` + `dayTypeValueOf`. |
| `RoutineTimeline.tsx`      |   427 | Layout glue only: scroll container, hour grid, rail, now marker, gap ribbons, pointer spotlight, stagger. Owns the Gantt **chrome**; `ScheduleBlock` owns the card. |

`useDayTypes.ts` is a hook, not a component — it lives in the component folder because only this route uses it.

**Removed during the rebuild** (no files, and no remaining references outside this document): `RoutineList.tsx`, `AddRoutineBlockModal.tsx`, `RoutineScheduleDebug.tsx`, `TimelineBlock.tsx`, `GapRow.tsx`, `NowLine.tsx`.

---

## 4. State: the URL is the source of truth

`page.tsx` reads `?date=` and `?day=` through `useSearchParams` (`:79`, `:80`) and writes them back with `router.replace(…, { scroll: false })` (`:183`–`:191`). It holds **no** `useState` for either. That is what makes a reload, a bookmark and Back behave.

```
?date=2026-10-01          → searchParams.get('date') ?? today
?day=id:clx123           → parseTabSelection(searchParams.get('day'))
```

`parseTabSelection` (`lib/routine/day-type-identity.ts:101`) normalises a bare enum value to the `enum:` namespace so **old links keep working**. Keys are namespaced precisely because the `DayType` enum collapses every user-defined day type to `'CUSTOM'` — see [§21 F1](#21-findings-register).

### Local state (6 `useState`)

| State               | Line | Purpose |
| ------------------- | ---: | ------- |
| `editor`            | `:86` | `{ mode: 'create' } \| { mode: 'edit', block } \| null` — one drawer, two modes. |
| `completionBlock`   | `:91` | The block whose `CompletionSheet` is open. |
| `dayTypeEditor`     | `:92` | The `DayTypeDefinition` being edited (`null` = create). |
| `dayTypeEditorOpen` | `:93` | Whether the day-type drawer is open at all. |
| `dayModeOpen`       | `:94` | `DayModeDialog` visibility. |
| `pendingDelete`     | `:95` | The block awaiting delete confirmation. |

### Derived (10 `useMemo`)

`blocks` (`:97`) · `summary = summarizeDay(blocks)` (`:98`) · `blockCountsByDayType` (`:119`) · `tabs` (`:127`) · `activeTab` (`:140`) · `viewingOtherDayType` (`:154`) · `visibleBlocks` (`:169`) · `trackedBlocks` (`:383`) · `minutesRemainingToday` (`:390`) · `dayTypeDefinition` (`:406`).

`activeTab` (`:140`–`:152`) resolves the URL key first, then falls back to matching the **server-resolved** `data.dayTypeId`. That fallback is what makes the tab strip highlight the right preset when the user deep-links to a bare `?date=` with no `?day=`.

### Callbacks (9 `useCallback`)

`writeUrl` · `selectDate` · `selectTab` · `notify` (`:214`) · `toggleDone` (`:216`) · `startBlock` (`:246`) · `nudge` (`:258`) · `duplicate` (`:289`) · `confirmDelete` (`:330`).

### Keyboard (1 `useEffect`, `:344`–`:381`)

| Key      | Action |
| -------- | ------ |
| `N`      | New block — **gated on `!readOnly`** |
| `T`      | Jump to today |
| `←` / `→` | Previous / next calendar day |

Guarded by `event.defaultPrevented`-safe early returns: the handler bails when any of `metaKey`/`ctrlKey`/`altKey` is held (`:353`) and when focus is in an `INPUT`, `TEXTAREA`, `SELECT` or `contentEditable` (`:346`–`:351`). Without the second guard the shortcuts would fire while typing a block title.

### The edit window (`:204`–`:206`)

```
retroactiveDays = resolveRetroactiveEditDays(settings?.retroactiveEditDays)   // default 3, clamped 0..30
windowDecision  = evaluateEditWindow(date, today, retroactiveDays)
readOnly        = !windowDecision.allowed
```

The rule lives in `lib/routine/edit-window.ts` and is pure. `readOnly` disables every mutating control **and** the `N` shortcut, and renders `ReadOnlyNotice`. The same rule is enforced server-side on the log path — see [§10](#10-service-and-repository-contract).

---

## 5. The data chain

```
useRoutineDay(date)                                        hooks/useRoutineDay.ts:68
└── load()                                                   :78
    └── apiRequest<ResolvedDailyRoutine>('/api/routine/today', { date })   :91
        └── routine/today/route.ts:23  GET
            ├── await auth()                                            :25
            ├── date: hand-rolled /^\d{4}-\d{2}-\d{2}$/ on ?date=      :34
            │        (NOT the shared calendarDateSchema)
            └── RoutineService.getRoutineForDate(userId, date)         service:165
                ├── findException(userId, date)                         1 query
                ├── resolveDayTypeFromException(date, 'UTC', exc)       pure
                ├── template by templateId else by resolved dayType     1 query
                ├── findLogsByDate(userId, date)                       ─┐ parallel
                └── DailyScore for that date                           ─┘
                └── per block: durationMinutes, isOvernight, category, log
                    → ResolvedDailyRoutine { blocks, completionRate, score, dayTypeId,
                                            dayTypeName, dayTypeSource, templateIsActive }
```

`apiRequest` unwraps the `{ success, data }` envelope, so `setData` receives `ResolvedDailyRoutine` directly (`useRoutineDay.ts:89`–`:91`).

**Optimistic writes.** `setLog` (`:127`) snapshots the current payload **before** writing, synthesises an optimistic `ResolvedBlockLog`, applies it, then reconciles (`useRoutineDay.ts:129`–`:170`). On failure it restores the exact snapshot and returns `false` rather than throwing, so the caller decides how to report. `pendingBlockIds` (`:72`) drives per-block disabled state during the request.

**A failed refetch does not blank the schedule** — the error is set, but the previous payload is deliberately kept (`useRoutineDay.ts:113`) so a transient blip does not read as "you have no blocks today".

**Offline.** `useOnlineStatus` (`page.tsx:70`) drives `OfflineNotice`. Note the limitation in [§21 F7](#21-findings-register): these mutations use plain `fetch` and are **not** queued, so an offline write fails immediately.

---

## 6. Pure logic — `src/lib/routine/`

Six modules. Every one imports **no repository** and **no Prisma**, which is what makes them unit-testable with no `DATABASE_URL` — a hard constraint, because `@/lib/prisma` throws at import time without it.

| Module                | Lines | Exports |
| --------------------- | ----: | ------- |
| `timeline.ts`         |   930 | The whole timeline derivation: `sortBlocks`, `blockEndMinutes`, `phaseOf`, `buildTimeline`, `findConflictMap`, `summarizeDay`, `getNowNext`, `buildGanttLayout`. Plus `toMinutes`/`minutesToClock`/`clockToMinutes`. |
| `duration.ts`         |   249 | `isOvernightBlock`, `calculateBlockDuration`, `formatDuration`, `formatClockMinutes`, `isTimeOverlap`, `isNowWithin`, `getCurrentBlock`, `getNextBlock`, `minutesUntilBlock`, `calculateBlockProgress`. |
| `conflicts.ts`        |   175 | **The canonical overlap engine.** `timeToMinutesExact`, `minutesToTime`, `intervalsFor`, `overlapMinutes`, `routineBlocksConflict`, `conflictsAgainst`, `findRoutineConflicts`, `timesConflict`. |
| `day-type-identity.ts`|   107 | `routineTabKey`, `isTabSelected`, `blockMatchesSelection`, `parseTabSelection`. |
| `edit-window.ts`      |   105 | `resolveRetroactiveEditDays`, `evaluateEditWindow`, `assertWithinEditWindow`, `EditWindowError`, `DEFAULT_RETROACTIVE_EDIT_DAYS`. |
| `day-type-slug.ts`    |    47 | `normalizeDayTypeSlug`, `previewDayTypeSlug`. |

### `conflicts.ts` is genuinely canonical

Its header calls itself the single source of truth, and every consumer delegates — `duration.ts:129`/`138`, `timeline.ts:145`/`217`/`794`, `routine.service.ts:79`/`85`, `components/routine/BlockEditor.tsx:198`/`526`, `server/domain/routine/routine.entity.ts:76`. The **client and the server run the same overlap code**, so the warning the user sees before saving is the warning the server would produce.

`intervalsFor` (`:90`) is the load-bearing function: `end > start` → one interval; `start === end` → `[[0, 1440]]` (a full day); otherwise overnight → `[[start, 1440], [0, end]]`. So `22:00 → 06:00` correctly clashes with `23:00 → 00:30`. `end <= start` is treated as authoritative over the stored `isOvernight` column (`conflicts.ts:44`–`:49`), so a wrong flag cannot produce a wrong overlap.

### `day-type-slug.ts` exists purely for import safety

`normalizeDayTypeSlug` used to live in `day-type.service.ts`, which transitively imports `@/lib/prisma` and therefore throws without `DATABASE_URL`. `DayTypeEditor.tsx:96` needs the same function to preview a slug, so it was split out into a zero-import module.

---

## 7. The Gantt layout engine

> **⚠️ This section describes the engine's *time mode*, which is no longer what the page renders.** Re-verified 2026-10-02. The page now defaults to **stack mode**: every block is a uniform `uniformRowHeight: 96` card, ordered by start time, with a `rowGap: 18` between rows. Duration no longer changes a block's height, and the hour grid and time rail are suppressed. The time-scaled path below is still implemented, still correct, and still pinned by `tests/lib/routine-timeline.test.ts` (via a `TIME_MODE` options override) — it is simply not the default any more. Read this section as the description of the fallback, not of the page.
>
> One consequence worth stating, because it is a live correctness concern rather than a style note: **lane packing still measures occupancy on the drawn extent (`occupyUntilMinutes`), which is correct for time mode and wrong for stack mode.** In stack mode two blocks that do not overlap on the clock can be assigned two lanes, which narrows them and reintroduces the squeezed-block appearance that stack mode exists to prevent. `buildGanttLayout` needs a clock-extent lane assignment when `uniformRowHeight` is set.

`buildGanttLayout(blocks, nowMinutes, options)` — `lib/routine/timeline.ts:482`. Returns `{ items, height, rangeStartMinutes, rangeEndMinutes, pxPerMinute, heightForMinutes }` where each item is a `GanttBlockItem` or a `GanttGapItem`, absolutely positioned.

### Stack-mode defaults (what the page uses)

| Option                | Value | Why |
| --------------------- | ----: | --- |
| `uniformRowHeight`    |    96 | Every block is the same height regardless of duration. A schedule is read as a **list of commitments**, not as a bar chart — a 3-hour block no longer dwarfs a 30-minute one, and short blocks stay legible instead of being floored. |
| `rowGap`              |    18 | Vertical rhythm between stacked rows. |
| `paddingMinutes`      |    15 | Unused in stack mode; retained so the two modes share one options type. |

### Time-mode defaults (the fallback, still tested)

| Option                 | Value | Why |
| ---------------------- | ----: | --- |
| `minRowHeight`         |    88 | A **content budget**, derived: padding 20 + row1 18 + row2 20 + row3 15 + gaps 4 = **77**, +11 of air. At the previous 64 the chip row was silently clipped by the card's `overflow-hidden`. |
| `pxPerMinute`          |     3 | **Derived, not chosen.** A 30-minute block must clear 88px *and* height must stay strictly proportional — together those pin the scale to ≥ `88/30 = 2.93`, so 3 (180px/hour). |
| `paddingMinutes`       |    15 | Breathing room above the first and below the last block. |
| `granularityMinutes`   |    15 | Axis snapping. |
| `minSpanMinutes`       |   180 | A one-block day still gets a readable axis. |

`pxPerMinute: 0.9` was the previous value and it was wrong in both directions: a 1-hour block was 48px, floored to 88, making it **1.1× the height of a 2-hour block** instead of half of it; and every floored block spilled up to 38 virtual minutes past its real end time, so short back-to-back blocks overlapped on screen.

### The four guarantees, and how each is held

These are stated in time-mode terms. In stack mode, guarantees 1 and 2 (the axis is the clock; the axis is bounded) are replaced by **row order** — position encodes sequence, not elapsed time.

1. **The axis is the clock.** `top = (start − rangeStartMinutes) × pxPerMinute`. A block sits at its actual time; the hour grid, the rail and the now marker share that scale.
2. **The axis is bounded to the schedule.** `rangeStart`/`rangeEnd` snap **outward** from first-start/last-end by `granularityMinutes`, plus `paddingMinutes`, floored at `minSpanMinutes`. An evening-only schedule fills the height instead of sitting at the bottom of six empty hours. This is what makes the component work as both a list and a chart.
3. **Height is duration-proportional.** `heightForMinutes = max(88, minutes × 3)`. A 3-hour block is exactly **6×** a 30-minute one. — **time mode only; stack mode deliberately inverts this.**
4. **Blocks in one lane never overlap.** Lane assignment (`assignLanes`, `:447`) is the textbook interval-graph greedy — leftmost lane free for the block's whole extent — but occupancy is measured on the block's **drawn** extent (`occupyUntilMinutes`), not its clock extent. When the floor applies, the card reserves the space it actually occupies. `top` stays pure clock time, so guarantee 1 is untouched. Without this, a floored 5-minute block (88px ≈ 29 axis-minutes) would overlap the next block in its lane by ~50px. — **see the stack-mode caveat above; this guarantee is the one that does not transfer.**

A clean day still packs into **one full-width lane**: any block of 30 minutes or more clears the floor at this scale, so its drawn extent equals its clock extent and nothing changes for it. That case is pinned by a test.

Gaps are computed on the **union** of all intervals (`:584`–`:608`), so two blocks that overlap each other do not leave a phantom "free" stripe between them.

---

## 8. API surface — called by this page

Every route `await auth()` and returns 401 without a session. **None** use `withAuth`, `createApiHandler` or a rate limiter.

| Call                       | Method | Route                                     | Schema | Service |
| -------------------------- | ------ | ----------------------------------------- | ------ | ------- |
| the day                    | GET    | `/api/routine/today?date=`                | hand-rolled date regex (`today/route.ts:34`) | `getRoutineForDate` `:165` |
| tick done / start / detail | POST   | `/api/routine/today`                      | `logRoutineBlockTodaySchema` **imported** | `logBlockStatus` `:669` |
| create block               | POST   | `/api/routine`                            | `createRoutineBlockSchema` **imported** | `createBlockForDayType` `:773` |
| edit / nudge               | PUT    | `/api/routine`                            | `updateRoutineBlockSchema` **imported** | `updateBlockForUser` `:935` |
| duplicate                  | POST   | `/api/routine`                            | `createRoutineBlockSchema` **imported** | `createBlockForDayType` `:773` |
| delete block               | DELETE | `/api/routine`                            | `deleteRoutineSchema` **imported** | `deleteById` `:1037` |
| the tab strip              | GET    | `/api/day-types`                          | none | `DayTypeService.listAllDayTypes` |
| create day type            | POST   | `/api/day-types`                          | `createDayTypeSchema` (inline, `day-types/route.ts:8`) | `DayTypeService.createDayType` |
| edit / archive day type    | PUT    | `/api/day-types/[id]`                     | `updateDayTypeSchema` (inline, `[id]/route.ts:8`) | `DayTypeService.updateDayType` |
| set the day's mode         | POST   | `/api/day-mode`                           | `dayModeSchema` | `DayModeService.setDayMode` |

**Shared validation is the norm here.** `src/lib/validation/routine.schema.ts` (170 lines) exports `dayTypeSchema`, `HH_MM`, `timeSchema`, `calendarDateSchema`, `dayTypeIdSchema`, `energyLevelSchema`, `routineLogStatusSchema`, `ratingSchema` and the six request schemas, and the three main routine routes import theirs. This is a real improvement over the previous audit, where every route defined its schema inline.

**`GET /api/day-types` returns archived types too.** `useDayTypes` does not pass `?active=true`, so the strip needs the full list for the Restore affordance in `DayTypeEditor`. `/habits` and `/today` pass `?active=true` and get the filtered list.

**`?date` is validated twice, differently.** The route uses its own regex at `today/route.ts:34` while `calendarDateSchema` exists in the shared file and is used by `logRoutineBlockTodaySchema`. Harmless today, but it is a second spelling of one rule — see [§23](#23-duplication-map).

---

## 9. API surface — orphaned

Six routine route files and two day-type methods have **zero client callers** anywhere in `src/`. They are not referenced by any `fetch`, `apiRequest`, or template-literal URL construction.

| Endpoint                                | File                        | Methods | Reachable service code that no UI uses |
| --------------------------------------- | --------------------------- | ------- | -------------------------------------- |
| `/api/routine/progress`                 | `progress/route.ts` (51)    | GET     | `getRoutineProgress` `:281` (3 bulk queries + per-day resolution) |
| `/api/routine/exceptions`               | `exceptions/route.ts` (70)  | GET, PUT | `listExceptions` `:543`, `upsertException` `:564` |
| `/api/routine/templates`                | `templates/route.ts` (106)  | GET, POST, PUT | `createSimpleTemplate` `:493`, `updateTemplate` `:508` |
| `/api/routine/[id]`                     | `[id]/route.ts` (129)       | GET, PUT, DELETE | `getTemplate` `:464` |
| `/api/routine/[id]/blocks`              | `[id]/blocks/route.ts` (124)| GET, POST | `getBlocks` `:475`, `addBlock` `:1064` (**`@deprecated`**) |
| `/api/routine/[id]/blocks/[blockId]`    | `[blockId]/route.ts` (139)  | PUT, DELETE | `reorderBlock` `:1227`, `updateBlock` `:1136`, `deleteBlock` `:1255` |
| `GET /api/day-types/[id]`               | `day-types/[id]/route.ts:28`| GET     | `DayTypeService.getDayType` |
| `DELETE /api/day-types/[id]`            | `day-types/[id]/route.ts:85`| DELETE  | `archiveDayType` / `deleteDayType` — the client archives via `PUT { isArchived }` instead |

**The `?peerId=` reorder path has no caller at all.** `swapBlockOrder` (`routine.repository.ts:751`) is a correct single-`$transaction` implementation of an interaction the UI does not offer. The timeline orders by **start time**, not `sortOrder` (`sortBlocks`), so reordering is not merely hidden — it is not part of this page's model of a day.

`RoutineExceptionEditor.tsx`, referenced by the previous revision, **does not exist**. Date overrides are set through `/api/day-mode` from `DayModeDialog` (`page.tsx:764`), not through the exceptions routes.

---

## 10. Service and repository contract

`src/server/services/routine.service.ts` (1397 lines). Private helpers: `retroactiveEditDaysFor` (`:613`), `recalculateScoreAfterLog` (`:638`), `autoProvisionTemplateForDayTypeId` (`:880`), `autoProvisionTemplateForDayType` (`:903`), `findLogsForRange` (`:1375`).

### Overlaps are a warning, never a rejection

`buildOverlapWarnings` (`:75`) is a module-private function, not a method. It maps `findRoutineConflicts` → `RoutineOverlapWarning[]`, sizing each with `overlapMinutes`. Called from four places: `createBlockForDayType` `:807`, `updateBlockForUser` `:985`, `addBlock` `:1085`, `updateBlock` `:1200`.

The two update paths check **only if `startTime` or `endTime` is present in the input** (`:981`, `:1189`), so a title-only edit never produces a spurious warning.

**Overnight blocks are no longer exempt.** `createBlockForDayType`'s docblock (`:760`–`:766`) states it explicitly. There is no `isOvernight` guard at any of the four call sites; `intervalsFor` handles the wrap, so `22:00 → 06:00` correctly clashes with `23:00 → 00:30`. The previous audit's exemption no longer exists.

### Score recalculation happens on log, on both branches

`logBlockStatus` calls `recalculateScoreAfterLog(userId, date)` at `:700` (clear) and `:734` (write). That helper (`:638`–`:645`) dynamically imports `ScoringService` and calls **`recalculateDate`**, deliberately *not* `calculateDailyScore`, which would clobber `isRestDay` / `isMinimumDay` (`:628`–`:636`). Failures are `console.error` only and do not fail the write. The recalc **is** awaited, so the response waits for it.

No other write path recalculates — creating, editing or deleting a block does not.

### The edit window is enforced only on the log path

`retroactiveEditDaysFor` (`:613`–`:616`) reads the setting **fresh on every write** rather than caching it, then `assertWithinEditWindow` (`:690`–`:692`) throws `EditWindowError` → **403** (`today/route.ts:101`–`:105`). Today and future dates always pass (`daysAgo` is negative for future dates).

Block create / update / delete, template update and exception writes are **not** window-checked. The page disables its controls client-side, which is presentation, not enforcement — see [§21 F6](#21-findings-register).

### `sortOrder` on create

```
nextSortOrder = input.sortOrder ?? (await maxSortOrderForTemplate(template.id)) + 1
```

`maxSortOrderForTemplate` returns `_max.sortOrder ?? -1` (`routine.repository.ts:679`–`:689`), so the first block in an empty template lands at `0`. It is **`max + 1`, not `count`** — `count` would reuse an index after a delete and collide. There is **no unique constraint** on `(templateId, sortOrder)`; the repository docblock (`:669`–`:674`) explains why, since `swapBlockOrder` transiently duplicates it.

### Category

Three different mechanisms, which is [§21 F4](#21-findings-register):

- `createBlockForDayType` (`:817`–`:824`, `:848`) — ownership-checked `connect`. **An explicit `categoryId: null` is a no-op on create**, falling through to `undefined`.
- `updateBlockForUser` (`:961`–`:972`) — non-empty string → `connect`; `clearCategory === true` → `category = null`. Both are then deleted from the data object.
- `updateBlock` (`:1175`–`:1185`) — `categoryId === null` → `disconnect`. **No `clearCategory` support on this path.**
- `addBlock` (`:1113`) — `connect` with **no ownership check**.

### Energy level

`energyLevelSchema` is `z.enum(['HIGH','MEDIUM','LOW']).nullable()` (`routine.schema.ts:46`). The nullability is load-bearing and documented at `:37`–`:45`: because `z.object` strips unknown keys and `JSON.stringify` drops `undefined`, an `.optional()`-only field makes clearing impossible. `updateBlock` writes on `!== undefined` (`:1172`), so `null` clears the column. `BlockEditor.tsx:258` sends an explicit `null` when the select is empty.

A **second, unrelated** `energyLevel` exists on `RoutineLog` as a 1–5 integer (`routine.schema.ts:156`, `ResolvedBlockLog.energyLevel: number | null`, `types/routine.ts:133`). Same name, different column, different domain.

### Repository

`src/server/repositories/routine.repository.ts` (1024 lines) is the only DB access layer, per `FILE.MD`. It is **shared** — `resolve-routine.ts`, `notifications/scheduler.ts`, `exporter.ts`, `day-mode.service.ts`, `auth.service.ts`, `day-type.service.ts`, `scoring.service.ts`, `habit.service.ts`, `recap.service.ts`, `analytics.service.ts` and `ai/aggregator.ts` all call into it.

Six methods are unreferenced by anyone in `src/`, `tests/` or `scripts/`: `clearDefaultTemplateFlags` (`:403`), `createException` (`:873`), `deleteException` (`:886`), `findLog` (`:903`), `updateLog` (`:994`), `countCompletedForDate` (`:1011`). See [§22](#22-dead-surface-inventory).

### `params` are awaited

All four dynamic routes in the routine and day-type trees declare `params` as `Promise<{…}>` and `await` it: `[id]/route.ts:47`/`:70`/`:108`, `[id]/blocks/route.ts:55`/`:82`, `[id]/blocks/[blockId]/route.ts:57`/`:118`, `day-types/[id]/route.ts:35`/`:50`/`:92`. A repo-wide search for `params: {` across `src/app/api/**/route.ts` returns **zero** synchronous hits.

---

## 11. Complete user actions (serial)

### On mount

1. `useDayTypes()` → `GET /api/day-types` (no `?active`).
2. `useRoutineDay(date)` → `GET /api/routine/today?date=`.
3. `useNowMinutes(timezone)` starts a per-minute tick.
4. Read `?date` / `?day` from the URL; derive `tabs`, `activeTab`, `visibleBlocks`, `summary`.
5. Evaluate the edit window → `readOnly`.

### Block actions

| Action           | Path | Endpoint |
| ---------------- | ---- | -------- |
| Toggle done      | `toggleDone` `:216` → `setLog(id, { status:'COMPLETED' })` or `{ clear:true }` | `POST /api/routine/today` |
| Start now        | `startBlock` `:246` → `setLog(id, { status:'IN_PROGRESS' })` | `POST /api/routine/today` |
| Edit             | `setEditor({ mode:'edit', block })` → `BlockEditor` | `PUT /api/routine` |
| Duplicate        | `duplicate` `:289` → same payload, `+1` on `sortOrder` | `POST /api/routine` |
| Delete           | `setPendingDelete` → `confirmDelete` `:330` | `DELETE /api/routine` |
| Nudge +5 / +15   | `nudge` `:258` → shifts `startTime`, preserves duration (wrapping past midnight), surfaces `warnings[0].message` | `PUT /api/routine` |
| Open details     | `setCompletionBlock(block)` → `CompletionSheet` | `POST /api/routine/today` on save |

`nudge` (`:258`–`:283`) recomputes both ends from `timeToMinutesExact`, preserves duration including the overnight case (`length > 0 ? length : length + 1440`, `:263`), and re-wraps with `((start % 1440) + 1440) % 1440` (`:264`).

### Day / day-type actions

| Action                | Path | Endpoint |
| --------------------- | ---- | -------- |
| Change day            | `selectDate` `:193` → `writeUrl` | — (URL only) |
| Change day type       | `selectTab` `:198` → `writeUrl` | — (URL only) |
| Create / edit type    | `DayTypeEditor` | `POST` / `PUT /api/day-types` |
| Archive / restore     | `DayTypeEditor` | `PUT /api/day-types/[id]` with `isArchived` |
| Set day mode          | `DayModeDialog` `:764` → `DAY_TYPE` \| `REST` \| `MINIMUM` \| `CLEAR` | `POST /api/day-mode` |

### Keyboard

`N` new block (blocked when `readOnly`) · `T` jump to today · `←` `→` change day.

---

## 12. What the user can create, edit, delete

**Create** — a routine block (title, start/end, category, colour, icon, description, notes, energy, track-completion); a day type (name, slug preview, description, colour, icon, sort order, default flag); a day mode for one date (day type / rest / minimum / clear).

**Edit** — a block (all create fields except identity); a day type, including archive and restore; the selected date and day type, via the URL.

**Delete** — a block. `deleteById` (`service:1037`) tries the **block** first, then the template, and returns which it removed.

> The previous audit's warning — *"deleting the last block of a template deletes the whole template"* — **no longer applies.** `deleteById` returns `'block'` and stops; it never cascades. `page.tsx:335` calls `DELETE /api/routine` with `{ id: pendingDelete.id }`, where `id` is always a block id from `visibleBlocks`.

**Not offered on this page:** reordering (`sortOrder` is not user-editable in the UI), permanent deletion of a day type, template CRUD (that is `/settings/routine`), per-block Focus linking (no schema field exists), and drag-and-drop.

---

## 13. Cross-page dependencies

### Inbound — what links to `/routine`

| Source | Line |
| ------ | ---: |
| `components/layout/Sidebar.tsx` | `:21` |
| `components/layout/Navigation.tsx` | `:44` |
| `components/layout/JumpTo.tsx` | `:40` |
| `components/layout/Footer.tsx` | `:43` |
| `app/(dashboard)/dashboard/page.tsx` | `:44` |
| `app/(dashboard)/search/page.tsx` | `:76` |
| `components/today/TodayDayType.tsx` | `:287` |
| `server/services/dashboard-overview.service.ts` | `:97` (quick-link list) |

### Outbound — shared components and endpoints

| Shared thing | Other consumers |
| ------------ | --------------- |
| `GET /api/routine/today` | `components/today/CurrentRoutineBlock.tsx:58`, `components/dashboard/ContextStrip.tsx:133` |
| `GET /api/routine`, `POST`, `PUT`, `DELETE` | `app/(dashboard)/settings/routine/page.tsx:102`/`:125`/`:152`/`:176`/`:194` — **this is now the only caller of `GET /api/routine`** |
| `GET /api/day-types?active=true` | `habits/page.tsx:240`, `TodayDayType.tsx:64`, `CommandPalette.tsx:91`, `AddHabitModal.tsx:95`, `EditHabitModal.tsx:108` |
| `RoutineRepository` | 11 other services — see [§10](#10-service-and-repository-contract) |
| `constants/routine.ts`, `constants/day-types.ts` | `lib/dashboard/derive.ts`, `lib/habits/day-type-match.ts`, `lib/scheduling/day-type.ts`, `server/analytics/eligibility-context.ts`, `lib/templates/converter.ts` |

### `AppContext` no longer participates

The routine slice was **removed**, not deprecated in place. `AppContext.tsx:517`–`:525` documents that `GET /api/routine` is no longer fetched there: it flattened every template and every day type into one array, and its only consumer was the old `/routine` page. The old `RoutineBlock` type in that context is marked `@deprecated` (`AppContext.tsx:194`) in favour of `ResolvedRoutineBlock`. This removed a layout-level banner that double-reported routine failures.

---

## 14. Impact analysis and failure modes

### `GET /api/day-types` fails

`useDayTypes` sets `error` instead of quietly substituting the six built-in day types (`useDayTypes.ts:21`–`:25`). The day-type strip degrades but **the page still works**: `tabs` falls back to the resolved `data.dayTypeId`, and `activeTab`'s fallback (`:147`) matches the server-resolved definition. The error is surfaced rather than hidden — the previous behaviour offered presets the server had never heard of.

### `GET /api/routine/today` fails

`RoutineErrorState` (`:573`) replaces the whole timeline, with a retry that calls `refetch`. The previous payload is preserved across a failed refetch (`useRoutineDay.ts:113`), so a transient blip does not blank an already-rendered day.

### A log write fails

`setLog` restores the exact pre-write snapshot and returns `false`. Callers surface `apiErrorMessage(caught)` through `notify` (`:214`). A **403** means the edit window closed — the user sees that message rather than a generic failure.

### Blast radius of one block action

One optimistic client write → one service call → `logBlockStatus` → ownership → edit-window check → `upsertLog` → duration → `ScoringService.recalculateDate`. There is no cross-page cache to invalidate: `AppContext` does not hold routine data, so `/today` and `/dashboard` will show the old value until their own next fetch. That is the accepted trade for one request per page.

### The whole day

Everything derives from one payload plus pure functions. If `useRoutineDay` returns `null` blocks, the page renders `NoTemplateState` or `EmptyBlocksState` — it never throws.

---

## 15. Current system capabilities

- Real Gantt layout on a true time axis, bounded to the schedule, strictly duration-proportional, greedy lanes, union-based gaps.
- One request per date; date and day type in the URL, so deep links and Back work.
- Live now-marker, current/next resolution, remaining-minutes maths, overnight-safe arithmetic.
- Full block CRUD with duplicate, nudge (+5/+15), delete confirmation, and live client-side overlap feedback from the same engine the server uses.
- Category persistence with ownership checks; nullable energy level.
- Day-type create / edit / archive / restore with a live slug preview.
- Per-date day mode: day type, rest day, minimum day, clear.
- Retroactive edit window, enforced server-side on logs and reflected in the UI.
- Automatic `DailyScore` recalculation on every log write, on both the write and clear branches.
- 12 distinct loading / error / empty / edge states in one file.
- Keyboard navigation with typing and modifier guards.
- Reduced-motion support on every effect, gated on **both** `useReducedMotion()` and the in-app `animationsEnabled` setting.

---

## 16. Loading / error / empty / edge states

`RoutineStates.tsx` (291 lines) owns all twelve.

| Export | Purpose |
| ------ | ------- |
| `TimelineSkeleton` | Placeholder rail while the day loads |
| `RailSkeleton` | Placeholder for the right-hand analytics rail |
| `TabsSkeleton({ count })` | Placeholder day-type strip |
| `RoutineLoadingState` | The composed loading panel |
| `RoutineErrorState({ message, onRetry })` | Fetch failure, with retry |
| `EmptyBlocksState` | Day resolved, template exists, zero blocks |
| `NoTemplateState` | Day resolved, **no template at all** — distinct from empty |
| `RestDayBanner` | `data.score.isRestDay === true` (`page.tsx:415`) |
| `DayCompleteBanner({ onUndoLast })` | Every tracked block done (`page.tsx:414`) |
| `OfflineNotice` | Driven by `useOnlineStatus` (`page.tsx:70`) |
| `ReadOnlyNotice({ daysAgo, windowDays })` | Edit window closed; states both numbers |
| `SectionLabel({ children, action })` | Shared rail heading with an optional action slot |

`EmptyBlocksState` and `NoTemplateState` are deliberately separate states: "you have a `College` template with nothing in it" and "this date resolves to no template" call for different CTAs, and collapsing them was a previous defect.

---

## 17. Authentication and security

| Concern | Reality |
| ------- | ------- |
| Auth gate | `src/proxy.ts`. `/routine` is not in `publicPaths`, so an unauthenticated request 307s to `/login?callbackUrl=/routine`. |
| Per-request auth | Every route in §8 calls `await auth()` and returns 401. |
| User id | Always `session.user.id`. **No route accepts a client-supplied `userId`** — `FILE.MD` requires this and the routine routes comply. |
| Ownership | `getRoutineForDate` resolves through `findException(userId, …)` and a template lookup scoped to that user. `updateBlockForUser` (`:935`) checks `block.userId`; `updateTemplateForUser` (`:1008`) checks the template's owner; `deleteById` (`:1037`) matches on both. |
| Validation | Zod on every write, imported from the shared module (§8). `blockId`/`dayTypeId` are `min(1)`, deliberately **not** `cuid()`, so a malformed id is a 400 rather than a Prisma error. |
| XSS | No `dangerouslySetInnerHTML` on this route. Descriptions render as text. |
| Rate limiting | **None**, consistent with the rest of the API. |
| SQL injection | Not applicable — Prisma parameterises everything. |

---

## 18. Performance

**Requests: one per date.** `GET /api/routine/today?date=` plus `GET /api/day-types`, and nothing else on mount. The previous page issued `GET /api/routine` (every template, every day type) from the layout, `GET /api/routine/today` from the list, and a **third** `GET /api/routine/today` from the debug panel. All three are gone.

**Queries per day: 4.** One exception lookup, one template lookup, then logs and `DailyScore` in parallel.

**Queries per write: bounded.** `logBlockStatus` is ownership + edit-window + upsert + one `recalculateDate`. `createBlockForDayType` auto-provisions a template if absent, then reads siblings for the warning.

**Render cost.** All layout maths is in `useMemo` keyed on `blocks`. The per-minute clock tick (`useNowMinutes`) re-renders the page once a minute; the timeline reads `nowMinutes` only when the viewed date **is** today (`page.tsx:101`), so a past or future date re-renders nothing on the tick.

**Known costs, accepted.**

- A full day is ~2900px of internal scroll at 3px/min. That is the honest price of an axis where position means something, and it is how calendar day views behave.
- `buildGanttLayout` is O(n log n) and recomputed per `blocks` change, not per tick.
- `backdrop-filter` on `.glass-capsule` (20px blur, 180% saturation) across up to ~15 capsules is a real compositing cost. This is why the timeline's own scroll container is bounded rather than the page scrolling.

---

## 19. Design-system additions

Four rules added to `src/app/globals.css` for this route. All four are generic and could be reused.

| Rule | Line | Purpose |
| ---- | ---: | ------- |
| `.glass-capsule` | `:662` | `blur(20px) saturate(180%)`, bright top hairline, dark bottom shade, drop shadow, `--glass-hue` tint. **Separate from `.glass-panel` on purpose** — a 24px blur × 12 capsules is a `backdrop-filter` budget problem. `.dark` variant inverts to a lighter surface with a light top edge. |
| `.grain-overlay` | `:696` | The 4% film grain via `feTurbulence` as an inline SVG data URI: no network request, ~1KB, `mix-blend-mode: overlay`. Above ~6% it reads as a dirty screen. |
| `.scrollbar-none` | `:721` | `scrollbar-width: none` + `::-webkit-scrollbar { width: 0 }`. The day-type and week strips previously used `[scrollbar-width: thin]`, which is **Firefox-only** — Chrome and Safari drew a full scrollbar track through the header. |
| `.scroll-fade-x` | `:736` | A mask-image edge fade, paired with the two horizontal strips so the removed scrollbar track is replaced by a cue that content continues. |

`globals.css` must stay valid UTF-8 — a single invalid byte makes Turbopack fail with `invalid utf-8 sequence ... failed to convert rope into string`. Verified clean. Edit it with the editor tools, never a PowerShell read-modify-write.

---

## 20. Accessibility

- The tab strip is a real `role="tablist"` / `role="tab"` with `aria-selected`, roving focus and arrow-key navigation (`DayTypeTabs.tsx`).
- The timeline panel is `role="tabpanel"` with `aria-labelledby` derived from the active tab's id (`page.tsx`).
- The schedule region is labelled and the `tabIndex={-1}` panel is programmatically focusable.
- Every interactive control is a real `<button>`; the completion toggle is a 44px target.
- Status is never conveyed by colour alone — `DONE` / `NOW` / `IN PROGRESS` are text.
- All times, durations, counters and the ring are `tabular-nums` + mono, so digits do not reflow as they tick.
- `prefers-reduced-motion` **and** the in-app `animationsEnabled` setting both gate every effect; a card whose blur snapped while it still moved would read as a glitch, so both are removed together.
- Decorative layers (`gradient-mesh-animated`, `grain-overlay`, pointer spotlight) are `aria-hidden` / `pointer-events-none`.
- Keyboard shortcuts bail out while typing and when a modifier is held (§4).

---

## 21. Findings register

Numbering restarts from the previous revision's F1–F29, which described a page that no longer exists.

**F1 — The `DayType` enum cannot represent a custom day type.** *By design, but load-bearing.* Every user-defined day type collapses to `'CUSTOM'`, so **identity is `DayTypeDefinition.id`**. `day-type-identity.ts` namespaces tab keys as `id:<cuid>` vs `enum:<value>` and `routineTabKey` / `blockMatchesSelection` branch symmetrically. `parseTabSelection` (`:101`) normalises a bare enum value so pre-existing links still resolve. `constants/day-types.ts:14` records the original symptom: `/today` offered day types `/routine` did not show.

**F2 — Three different "completion" numbers exist, all live at once.**

| # | Where | Denominator |
| - | ----- | ----------- |
| 1 | `ResolvedDailyRoutine.completionRate` — `service:264` | **every** block in the template |
| 2 | the page's tracked rate — `page.tsx:383`–`:388` | only `trackCompletion` blocks |
| 3 | `DailyScore.routineCompletionRate` — `scoring.service.ts:242`–`:243` | only days that have a `RoutineLog` row at all |

The hero and the timeline show #2; the score card shows #3; #1 is in the payload but not surfaced. #3 is the subtlest: a day the user never opened the app has **no log rows**, so it is excluded from the denominator entirely rather than counted as zero. A user can legitimately see "8/8 blocks done" in one place and a lower routine percentage in another. The three are defensible individually; nothing in the UI says which is which.

**F3 — Overnight blocks are no longer exempt from overlap warnings.** Correct and deliberate (`service:760`–`:766`), `intervalsFor` handles the wrap, and `end <= start` is authoritative over the stored `isOvernight` column (`conflicts.ts:44`–`:49`). Recorded here because the previous audit asserted the opposite.

**F4 — Category handling differs across the three write paths.** `createBlockForDayType` treats an explicit `categoryId: null` as a no-op; `updateBlockForUser` needs `clearCategory: true` to null it; `updateBlock` uses `disconnect` and does not understand `clearCategory` at all; `addBlock` connects with **no ownership check** (`service:1113`). The page only ever uses `updateBlockForUser`, so it is correct today — the divergence is a trap for the next caller.

**F5 — `sortOrder` is `max + 1`, not `count`.** `maxSortOrderForTemplate` returns `_max.sortOrder ?? -1`, so a first block lands at `0` and a block after a delete does not reuse an index. There is no unique constraint, by design (`routine.repository.ts:669`–`:674`).

**F6 — ~~The edit window is enforced on logs only.~~ ✅ RESOLVED.** `assertWithinEditWindow` originally guarded `logBlockStatus` only, leaving block create / update / delete editable from a closed date. Block write schemas now take an optional `date`, the route resolves it (defaulting to the host today) and calls `assertDateEditable` before any write, so the same product rule now covers all four write paths.

**F7 — Routine mutations are not queued offline.** `useRoutineDay.setLog` uses plain `apiRequest`; `OfflineNotice` is advisory. A write attempted offline fails immediately. This matches the rest of the app's routine mutations but is worth stating, because the offline banner implies otherwise.

**F8 — ~~Four spellings of the date regex.~~ ✅ RESOLVED.** `day-mode/route.ts` was the last holdout, validating `?date` with its own inline regex in both the `GET` query and a body schema. It now imports `calendarDateSchema` from `lib/validation/routine.schema.ts` and parses with `safeParse`. `grep '\d\{4\}-'` across `app/api/routine/**` and `app/api/day-mode` returns nothing; there is one rule.

**F9 — `/routine` is not the only caller of the routine endpoints it appears to own.** `app/(dashboard)/settings/routine/page.tsx` is the sole caller of `GET /api/routine` (`GET /api/routine/today` is shared with `/today` and `/dashboard` too). A change to the shared `routine.repository.ts` can therefore break a page this audit does not cover.

**F10 — Four route files are reachable only by hand. — PARTLY RESOLVED.** `progress` and `exceptions` are now adopted: `useWeekPattern` calls `GET /api/routine/progress` and `useDayOverrides` calls `GET /api/routine/exceptions`. **`analytics` and `metrics` still have zero callers.** `getRoutineProgress` (`:281`) and `getRoutineAnalytics` (`:1313`) are implemented and used by nothing.

**F11 — `getRoutineAnalytics` is dead and N+1.** `:1313` walks `findLogsForRange` day by day. Zero callers in `src/`. Left in place deliberately during the bug-fix pass, because deleting ~100 lines of service code carries more risk than a dormant method does — but it is a trap: it looks like the ready-made analytics endpoint and would issue one query per day if anyone ever wired it up. Delete it or rewrite it as a grouped aggregate before it gets used.

---

## 22. Dead surface inventory

### Components

`RoutineList`, `AddRoutineBlockModal`, `RoutineScheduleDebug`, `RoutineExceptionEditor`, `TimelineBlock`, `GapRow`, `NowLine` — **none exist as files.** The only remaining references to the first four are in this document. The `DayModeDialog` replaced the debug panel's arbitrary-date resolver: it sets the mode for the date already selected.

### Types — ✅ RESOLVED, all eight deleted

`RoutineValidationResult` · `RoutineLogSummary` · `RoutineStats` · `RoutineListProps` · `RoutineBlockProps` · `RoutineTimelineProps` · `RoutineEditorProps` · `isRoutineTemplateWithBlocks`

All eight were defined in `src/types/routine.ts` and referenced nowhere else in `src/` — the four `*Props` interfaces were the prop contracts of components that no longer exist, kept alive only because a type file is not tree-shaken. They have been removed.

### Repository methods — still dead

`clearDefaultTemplateFlags` · `createException` · `deleteException` · `findLog` · `updateLog` · `countCompletedForDate`. Re-checked 2026-10-02: zero callers outside the repository.

### Service methods

`getRoutineAnalytics` (dead **and** N+1 — see [F11](#21-findings-register)) · `addBlock` (`@deprecated`, reachable only from the orphaned `[id]/blocks` route) · `logBlockCompletion` (`@deprecated`; re-checked 2026-10-02 and now has zero callers, having been replaced by direct `logBlockStatus` calls in `notification.service.ts`).

---

## 23. Duplication map

| Duplicated thing | Where | Assessment |
| ---------------- | ----- | ---------- |
| Overlap logic | `lib/routine/conflicts.ts` only | **Not duplicated.** Six consumers, including the client and the server, all delegate. `server/domain/routine/routine.entity.ts:76` forwards to it. |
| `HH:mm` parsing | `conflicts.timeToMinutesExact` (strict, throws), `timeline.toMinutes` (lenient, returns `0`), `dates.timeToMinutes` (lenient), `duration.minutes` (strict) | **Three behaviours under one concept.** Defensible — the lenient variants exist so one malformed row cannot blank a whole day — but `routine.service.ts:35` imports `dates.timeToMinutes` while `addBlock` (`:1118`) and `updateBlock` (`:1213`) use `duration.isOvernightBlock`. Same answer for valid input, two parsers. |
| Date regex | **Single shared rule.** `routine.schema.calendarDateSchema` is the only `YYYY-MM-DD` validation in the routine and day-mode routes. | ✅ Was four spellings. **F8**, resolved. |
| Time formatting | `duration.formatClockMinutes` (canonical), plus local `formatClock` in `sleep.ts:54`, `focus/timer-machine.ts:258`, `TodaySleep.tsx:691` | Three unrelated local helpers, but different domains (minutes-from-midnight vs elapsed ms). A `timeline.formatClock` duplicate **was** removed in the last refactor — it was justified by a comment claiming "three modules need it" when exactly one did. |
| Block create | `createBlockForDayType` `:773` vs `addBlock` `:1064` | Two implementations. They differ on `trackCompletion` default (`?? true` vs `?? false`) and on category ownership checking. Only the first is reachable from UI. |
| Block update | `updateBlockForUser` `:935` vs `updateBlock` `:1136` | Two implementations, differing on how category is cleared and whether `notes` is accepted (`updateBlock`'s signature omits `notes` even though the route's schema allows it). |
| Day-type normalisation | `day-type-slug.normalizeDayTypeSlug` | Single implementation, shared by the service and the client editor. Correctly split out to avoid a `@/lib/prisma` import in a client component. |
| Block status presentation | `ScheduleBlock.STATUS_TEXT` / `STATUS_COLOR` / `ENERGY` | Single copy, moved next to its only consumer. |

---

## 24. Tests

`npm test` → **431 passing across 14 files.** Six of them cover this route's logic; all are pure and database-free, run in Vitest's default `node` environment with no setup file.

| File | Lines | Covers |
| ---- | ----: | ------ |
| `tests/lib/routine-timeline.test.ts` | 880 | `sortBlocks`, `blockEndMinutes`, `phaseOf`, `buildTimeline`, `findConflictMap`, `summarizeDay`, `getNowNext`, and the whole Gantt engine — axis bounds, height floor as a content budget, **exact 6× ratio**, gaps, lane assignment on drawn extents, and the guarantee that a clean day still packs into one lane. |
| `tests/lib/routine-conflicts.test.ts` | 242 | `intervalsFor`, `overlapMinutes`, self-exclusion, overnight expansion. |
| `tests/lib/routine-day-type-identity.test.ts` | 174 | `routineTabKey`, `blockMatchesSelection`, `parseTabSelection`, including the `id:`/`enum:` namespaces and old-link normalisation. |
| `tests/lib/routine-edit-window.test.ts` | 132 | Clamping, future dates, the boundary, and `EditWindowError`. |
| `tests/lib/routine-duration.test.ts` | 86 | Overnight duration, `getNextBlock` null-on-no-future-block, progress across midnight. |
| `tests/service/routine-service.test.ts` | 843 | The service with mocked repositories: overlap warnings, `max(sortOrder)+1`, category, nullable energy, edit-window enforcement, score recalculation, delete semantics. |

**Not covered.** No component test, no route test, no browser-based visual QA. `jsdom` and `@types/jsdom` are installed as devDependencies and a `// @vitest-environment jsdom` docblock works, but no file uses it. Every claim in this document about **layout, spacing or responsiveness** — including the dead-space fix, the collapsed scrollbar and the 88px content budget — is verified by reasoning and by the engine's tests, **not** by a rendered page. Per `AGENTS.md`, those need a human in a real browser.

There is no `test:e2e` script and no `playwright.config.*`.

---

## 25. Current behavior summary

`/routine` is one request and one URL. `?date=` and `?day=` are the state; everything on screen is a pure function of the payload `GET /api/routine/today?date=` returns plus `lib/routine/`. The timeline puts each block at its real time, heights it by duration, and splits into lanes only when blocks genuinely collide. Writes are optimistic with exact rollback, and every one of them is re-validated server-side. What remains unfinished is not the page — it is the six orphaned routes, the eight dead types, and F2, where three defensible completion percentages sit on one screen without saying which is which.