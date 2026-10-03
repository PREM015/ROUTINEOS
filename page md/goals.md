# `/goals` — Complete System Audit

**Route:** `http://localhost:3000/goals`
**Route file:** `src/app/(dashboard)/goals/page.tsx` (328 physical lines, `'use client'`)
**Project:** RoutineOS (`daily-plan`) — Next.js (App Router) + Prisma + PostgreSQL (Neon)
**Audit date:** 2026-09-30 · **Amended:** 2026-10-02 (two passes — §28 fixed the data layer, §29 built the page)
**Status of this document:** §1–§27 describe **only** what existed before the 2026-10-02 changes and are kept as the baseline. **§28 and §29 are the current state.** Every claim is file-anchored. Anything that looks like a feature but is not wired up is listed in [§15](#15-currently-not-supported) and [§24](#24-findings-register).

> **Line-count convention:** **physical** line counts throughout. PowerShell's `Measure-Object -Line` skips blank lines and reports 309 for `page.tsx`.

> **Five structural facts worth knowing before reading on.**
> 1. **The `/goals/{id}` 404 links are fixed.** Two notification systems built `/goals/{id}` links and both 404'd. They now point at `/goals?goal=<id>`, which the page answers by opening the detail drawer. See §12.1 and §29.6.
> 2. **`src/components/goals/GoalCard.tsx` is now the live card.** It used to be dead: `page.tsx` defined a private `GoalCard` that shadowed it. The page now renders the shared one.
> 3. **`src/lib/goals/` contains one file.** `goal-metrics.ts` — the pace engine everything else derives from. It replaced five mutually contradictory modules; see §29.10.
> 4. **The daily check-in trap (§25) is closed at the source**, not compensated for on the page. A daily goal stays `ACTIVE` for its whole window.
> 5. **The findings below are a baseline, not a live report.** §28.8 and §29.1 map every finding to its current status. Read those before acting on anything in §24.

---

## Table of contents

| §   | Section                                                                                                         |
| --- | --------------------------------------------------------------------------------------------------------------- |
| 1   | [What `/goals` is, in one paragraph](#1-what-goals-is-in-one-paragraph)                                         |
| 2   | [UI block diagram](#2-ui-block-diagram)                                                                         |
| 3   | [UI → component mapping](#3-ui--component-mapping)                                                              |
| 4   | [Frontend architecture](#4-frontend-architecture)                                                               |
| 5   | [Backend / API architecture](#5-backend--api-architecture)                                                      |
| 6   | [Database dependency](#6-database-dependency)                                                                   |
| 7   | [Date and day-type logic](#7-date-and-day-type-logic)                                                           |
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
| 25  | [The daily-goal check-in trap](#25-the-daily-goal-check-in-trap)                                               |
| 26  | [Cross-enum audit-action contamination](#26-cross-enum-audit-action-contamination)                              |
| 27  | [Dead surface inventory](#27-dead-surface-inventory)                                                            |
| **28** | **[Remediation log — data layer (2026-10-02)](#28-remediation-log)**                                       |
| **29** | **[Trajectory — the page, built (2026-10-02)](#29-trajectory--the-goals-page-built)**                          |

---

## 1. What `/goals` is, in one paragraph

`/goals` is the app's **goal registry and progress console**. It is a `'use client'` Client Component (`page.tsx:1`) that renders a **3-way tab strip** (`Daily` / `Long-term` / `Completed`), a responsive **card grid** (`sm:grid-cols-2 lg:grid-cols-3`), an **add-goal modal**, an **edit-goal modal**, and a hand-rolled **delete-confirm overlay**. Each card is rendered by a private `GoalCard` defined inside `page.tsx` itself (`:26`–`:152`) — **not** by the shared `src/components/goals/GoalCard.tsx`, which is dead. The page reads exactly **three** members from `AppContext` (`goals`, `deleteGoal`, `updateGoal` at `:155`) and performs **no fetching of its own**; notably it reads neither `dataLoaded` nor `dataError`, so a failed load is indistinguishable from an empty account. `DAILY` goals get a check-in circle and **no progress UI at all**; everything else gets a range slider, a progress bar and a percentage. Every write is an optimistic client mutation followed by one or two HTTP requests. The page has **no `loading.tsx`**, **no `error.tsx`**, **no `layout.tsx`**, **no page metadata**, and **no `localStorage`** — every piece of state is discarded on navigation.

---

## 2. UI block diagram

Everything below is the real structure from `src/app/(dashboard)/goals/page.tsx`.

```
/goals  (src/app/(dashboard)/goals/page.tsx — 'use client' Client Component)
│
└── <div class="container mx-auto max-w-7xl">                      page.tsx:216
    │
    ├── HEADER ROW                                                   :217
    │   ├── <div>
    │   │   ├── <h1> "Goals"                                        :219
    │   │   └── <p> "{n} daily · {n} long-term · {n} completed"     :220–223
    │   │         counts from the useMemo partition at :166–173
    │   └── <Button variant="primary" onClick={setModalOpen(true)}>
    │          <Plus/> "Add goal"                                   :224–226
    │
    ├── {error && <p role="alert" class="… text-destructive …">}     :229–233
    │         set ONLY by handleCheckin's and handleDelete's catch
    │
    ├── <div role="tablist" aria-label="Goal filter">                :235–253
    │   └── 3 × <button role="tab" aria-selected={tab===t}
    │              onClick={setTab(t)}>
    │              Daily | Long-term | Completed                    :236–251
    │
    ├── BRANCH A — visible.length === 0                             :255–273
    │   └── <EmptyState icon={<Target size={28}/>}
    │              title       = per-tab                            :257–266
    │              description = per-tab                            :260–265
    │              action      = <Button "Add Goal"/>  ONLY when tab !== 'COMPLETED'  :267–272
    │
    ├── BRANCH B — the grid                                         :275
    │   └── <div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">   :275
    │       └── <AnimatePresence>                                    :276
    │           └── GoalCard × N   ← the PRIVATE component at page.tsx:26   :277–287
    │
    ├── <AddGoalModal open={modalOpen}
    │       defaultType={tab === 'DAILY' ? 'DAILY' : 'WEEKLY'} />     :292
    ├── <EditGoalModal goal={editing} />                             :293
    │
    └── <AnimatePresence> → DELETE-CONFIRM OVERLAY                    :295–325
          rendered LAST, z-50, outside the Modal portal hierarchy
          <div role="alertdialog" aria-modal="true" onClick={close}>  backdrop
            └── <div onClick={e => e.stopPropagation()}>              :298
                  ├── <h3> "Delete goal?"                            :299
                  ├── <p>  "<title>" will be permanently deleted …   :300–305
                  ├── <Button variant="ghost"   Cancel>             :307–310
                  └── <Button variant="danger"  Delete>             :312–317
```

### 2.1 Anatomy of the private `GoalCard` — `page.tsx:26`–`:152`

```
<motion.div layout initial{opacity:0,y:8} animate{opacity:1,y:0} exit{opacity:0,height:0}>  :60–65
│
├── HEADER ROW                                              :67–93
│   ├── [isDaily] <button aria-label="Mark <title> done|not done"
│   │            disabled={busyId === goal.id}>             :69–78
│   │      <CheckCircle2/> when checked, <Circle/> otherwise
│   ├── <h3 class={checked ? 'line-through …' : …}>{goal.title}</h3>   :81–83
│   ├── <Badge variant={PRIORITY_COLORS[goal.priority]}>{priority}</Badge>   :84
│   ├── [isDaily] <Badge variant="primary">Daily</Badge>    :85
│   ├── description — line-clamp-2                          :87–89
│   └── "{startDate} → {endDate}"                           :90–92
│
├── ACTIONS — ALWAYS ENABLED, never gated on busy          :95–111
│   ├── <Pencil>   onClick={onEdit}    title="Edit goal"    :96–103
│   └── <Trash2>   onClick={onDelete}  title="Delete goal"  :104–111
│
└── {!isDaily && ( … )}          ◄── DAILY GOALS GET NONE OF THIS   :115–149
      ├── <input type="range" min=0 max=targetValue step=1
      │            value={sliderValue}
      │            onChange={e => setSliderValue(Number(e.target.value))}
      │            onMouseUp={onSliderCommit} onTouchEnd={onSliderCommit} />   :118–130
      ├── "{sliderValue} / {targetValue} {unit}"            :131–133
      ├── progress bar <motion.div width={pct}%>           :135–142
      │     bg flips to solid bg-emerald-400 at pct >= 100  :136
      ├── "{pct}% complete" | "✓ Done!"                     :143–146
      └── {sliderError && <p role="alert">}                :147

pct = targetValue > 0 ? Math.min(100, currentValue/targetValue*100) : 0   :45
checkedToday = isDaily && (checkinState[goal.id] ?? goal.currentValue >= 1)   :47
```

### 2.2 `AddGoalModal` — `src/components/goals/AddGoalModal.tsx` (170 lines)

```
<Modal isOpen={open} title="Add Goal">  → AnimatePresence + createPortal  Modal.tsx:124–165
└── <form onSubmit={handleSubmit}>
    ├── <Input>   Title                                                :48
    ├── <Textarea> Description                                          :57
    ├── <Select>  Type          — DAILY | WEEKLY | MONTHLY | YEARLY  ← only 4 of 6   :101–106
    ├── <Select>  Priority     — HIGH | MEDIUM | LOW  ← only 3 of 8                :112–116
    ├── [type !== 'DAILY']
    │     ├── <Input> Target Value                                      :120–124
    │     └── <Input> Unit                                              :126–130
    ├── <Input type="date"> Start Date                                   :134
    ├── <Input type="date"> End Date   label "End Date (optional)"        :147
    ├── {errors && <p role="alert">}                                     :151–155
    └── footer — ghost Cancel / primary "Add Goal"  (inside Modal)
```

`validate()` (`:33`–`:44`), hand-rolled: title required; **for non-DAILY** a positive target, a required end date, and `endDate > startDate`. The DAILY path **deliberately skips** the end-date check (`:36`–`:41`).

`handleSubmit` (`:54`–`:66`) builds:
```
targetValue = type === 'DAILY' ? 1 : parseFloat(targetValue)
endDate     = endDate || (type === 'DAILY' ? startDate : today)
```

`reset()` (`:68`) on success clears **only** `title, description, targetValue, unit, errors`. `type`, `priority`, `startDate`, `endDate` and `submitError` all persist into the next open.

### 2.3 `EditGoalModal` — `src/components/goals/EditGoalModal.tsx` (127 lines)

```
if (!goal) return null                                              :40   (after all hooks — hook order is legal)
useEffect on [goal] re-syncs all 10 fields                         :25–38
<Modal isOpen={!!goal} title="Edit Goal">
└── <form>
    ├── <Input>   Title
    ├── <Textarea> Description        → sends `description: … || null`  (deliberate, comment :59–60)
    ├── <Select>  Priority  — HIGH | MEDIUM | LOW | CRITICAL
    ├── <Select>  Status    — all 6 GoalStatus values
    ├── [goal.type !== 'DAILY']  Target / Current / Unit Inputs
    ├── <Input type="date"> End Date     → `endDate: endDate || goal.endDate`  :67  (cannot be cleared)
    ├── {error && <p role="alert">}
    └── footer — ghost Cancel / primary "Save"
currentValue is clamped to Math.min(current, target)               :65
```

### 2.4 The delete-confirm overlay — `page.tsx:295`–`:325`

A hand-rolled fixed overlay with `role="alertdialog"` and `aria-modal="true"`, a click-to-close backdrop, and an inner `onClick={e => e.stopPropagation()}`. It has **no Escape handler, no focus trap, no initial focus and no focus restoration** — all four of which the shared `Modal` provides at `Modal.tsx:63`–`:116`. It is also rendered outside the `Modal` portal hierarchy, so it stacks independently.

---

## 3. UI → component mapping

Each chain is traced through real imports. Paths relative to the repo root.

### 3.1 Direct imports from `page.tsx`

```
page.tsx
├── src/components/goals/AddGoalModal.tsx   (170)   page.tsx:6, 292
│   └── src/components/ui/{Modal,Input,Textarea,Select,Button}.tsx  (all via the barrel)
├── src/components/goals/EditGoalModal.tsx  (127)   page.tsx:7, 293
│   └── same set
├── src/context/AppContext.tsx  (1168)  useApp + type Goal   page.tsx:8, 155
├── src/hooks/useUserTimezone.ts (45)    useUserTimezone    page.tsx:9, 156
├── src/store/achievement.store.ts (102) runAchievementCheck  page.tsx:10, 194
├── src/lib/api-client.ts                 fetchWithAuth (via AppContext.deleteGoal)
├── src/components/ui/index.tsx (26)      the BARREL          page.tsx:11
├── framer-motion                          motion, AnimatePresence
└── lucide-react                           Target, Plus, Pencil, Trash2, CheckCircle2, Circle
```

**`GoalCard` at `page.tsx:26` is a private, file-local function component.** It imports nothing but framer-motion and `Badge`.

### 3.2 UI primitives reached through the barrel

| Component        | File                      | Lines | Used by |
| ---------------- | ------------------------- | ----- | ------- |
| `Button`         | `ui/Button.tsx:36`        | 52    | header, empty state, both modals, the delete overlay |
| `Badge`          | `ui/Badge.tsx:22`         | 24    | the priority badge and the "Daily" badge inside `GoalCard` |
| `EmptyState`     | `ui/EmptyState.tsx:19`    | 52    | the empty branch |
| `Modal`          | `ui/Modal.tsx:24`         | 166   | both modals |
| `Input`          | `ui/Input.tsx:33`         | 98    | both modals |
| `Select`         | `ui/Select.tsx:20`        | 55    | both modals |
| `Textarea`       | `ui/Textarea.tsx:18`      | 50    | both modals |
| `Spinner`        | `ui/Spinner.tsx:1`        | 14    | `Button` — **⚠ rendered when `isLoading`, which no goals caller ever passes** |

`Badge.tsx` has **no `'use client'` directive**, so it is server-compatible — the only primitive on this route that is.

### 3.3 The data chain

```
AppContext.goals  (set by fetchAll, AppContext.tsx:547)
→ GET /api/goals                                   (bare fetch, NO query params)
→ src/app/api/goals/route.ts  (GET, :13 auth, manual param parsing :18–33 — NO Zod)
→ GoalService.listGoals                             goal.service.ts:72
→ GoalRepository.findAll                            goal.repository.ts:62
→ Prisma Goal + Project(select) + GoalTag→Tag(select) + GoalDayType→DayTypeDefinition
                  + Milestone(select) + _count{subGoals,milestones}
   ⚠ defaults: sortBy='endDate', sortOrder='asc', limit=50, offset=0

AddGoalModal → AppContext.addGoal                    AppContext.tsx:1025
→ POST /api/goals                                   route.ts:52 auth → createGoalSchema goal.schema.ts:17
→ GoalService.createGoal                            goal.service.ts:156
   1 startDate = input.startDate ?? now;  endDate = input.endDate ?? startDate + 365d   :161–164
   2 THROW if endDate <= startDate                     :166   ← §24 F1
   3 appliesEveryDay ?? true; dayTypeIds = [] when every-day                            :170–171
   4 goalRepository.create({... status:'ACTIVE', priority ?? 'MEDIUM',
                             currentValue ?? 0, isPublic || false})                     :174–194
   5 addDayTypeAssignments                            :197
   6 Promise.all(input.milestones) → createMilestone(sortOrder: index)                   :200–213
   7 addTags(goal.id, input.tagIds ?? [])              :216
   8 findWithRelations                               :219
→ Prisma Goal, GoalDayType, Milestone, GoalTag

EditGoalModal → AppContext.updateGoal                AppContext.tsx:1061
→ PATCH /api/goals/[id]   (aliases PUT, [id]/route.ts:102–108)
→ GoalService.updateGoal                             goal.service.ts:225
   1 findById → throw new Error('Goal not found')     :228
   2 13 conditional spreads                          :231–262
        status + archivedAt  (archivedAt set on CANCELLED, NULLed otherwise)   :240–245
        startDate ?? now;  endDate ?? now                                    :250–251
        completedAt  ◄── ACCEPTED BY THE SERVICE BUT NOT BY THE SCHEMA  §24 F4
        projectId connect/disconnect; isPublic; appliesEveryDay
   3 if (input.dayTypeIds) → clearDayTypeAssignments, then addDayTypeAssignments
     only when !appliesEveryDay                     :265–275
   4 if (input.tagIds) → clearTags + addTags         :278–281
   5 findWithRelations                               :284
→ Prisma Goal, GoalDayType, GoalTag

handleCheckin → POST /api/goals/[id]/checkin        page.tsx:182
→ [id]/checkin/route.ts:18 auth → goalCheckinSchema goal.schema.ts:71
→ GoalService.checkInDaily                          goal.service.ts:420
   1 findById → throw new NotFoundError('Goal')      :423   ← STRUCTURED 404
   2 if (goal.type !== 'DAILY')
       throw new ValidationError('Daily check-in is only available for DAILY goals')   :427
   3 value = completed ? 1 : 0                       :432
   4 addProgressLog({goal, value,
                     note: 'daily-checkin:done' | 'daily-checkin:cleared',
                     date: new Date(`${date}T00:00:00.000Z`)})                       :435–440
   5 update(goalId, userId, {currentValue: value,
                              status: completed ? 'COMPLETED' : 'ACTIVE',
                              completedAt: completed ? new Date() : null})             :442–446
   6 returns the BARE Goal row — no relations                             §24 F6
→ Prisma GoalProgress (CREATE, not upsert — no @@unique on [goalId, date]) + Goal

handleCheckin → AppContext.updateGoal                page.tsx:190
→ PATCH /api/goals/[id]  {currentValue: 0|1, status: 'ACTIVE'|'COMPLETED'}
   ⚠ REDUNDANT — checkInDaily already wrote both fields

handleDelete → AppContext.deleteGoal                 AppContext.tsx:1085 (fetchWithAuth)
→ DELETE /api/goals/[id]                             [id]/route.ts:77 auth, NO Zod
→ GoalService.deleteGoal                             goal.service.ts:670
   1 findById → throw new Error('Goal not found')     :672
   2 delete(goalId, userId) → goal.delete({where:{id, userId}})   :676
   3 // TODO: Audit log                                :678
   4 returns void
→ Prisma Goal (+ cascades GoalProgress, Milestone, GoalTag, GoalDayType)
   ⚠ P2003 if any Task references the goal — no pre-check, no null-out

slider commit → AppContext.updateGoalProgress        AppContext.tsx:1108
→ PATCH /api/goals/[id]  {currentValue}               :1112
→ GoalService.updateGoal                             ◄── NO addProgressLog
   ⇒ GoalProgress rows come ONLY from checkInDaily and task completion   §24 F2
```

---

## 4. Frontend architecture

### 4.1 Page structure

| Concern               | Reality                                                                                                                    |
| --------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| Component kind        | **Client Component** — `page.tsx:1` is `'use client'`; `export default function GoalsPage()` at `:154`. Not `async`.        |
| Sibling route files   | **None.** `src/app/(dashboard)/goals/` contains **only** `page.tsx` — no `loading.tsx`, no `error.tsx`, no `layout.tsx`, no `[id]/`, no `template.tsx`, no `not-found.tsx`. |
| Route-segment loading | Falls through to `src/app/(dashboard)/loading.tsx` (5 lines) → `<PageSkeleton />`.                                            |
| Route-segment error   | Falls through to `src/app/(dashboard)/error.tsx` (97 lines) — reports via `ErrorReporter`, Try-again + Go-to-Dashboard.    |
| Layout                | `src/app/(dashboard)/layout.tsx` (69 lines, server); `metadata = privateMetadata('RoutineOS')` at `:34`.                   |
| Page metadata         | **None.** `page.tsx` declares no `metadata` / `generateMetadata` / `revalidate` / `dynamic` / `runtime` / `generateStaticParams`. |
| Missing route segment | **No `/goals/[id]` exists** — yet two notification systems build links to it. See §12.1.                                   |

### 4.2 Providers / contexts active on `/goals`

| Provider                                     | File                                              | Does it affect `/goals` content?                                                                                     |
| -------------------------------------------- | ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| `ThemeProvider`                              | `components/providers/ThemeProvider.tsx`          | **Yes** — every `bg-card` / `border-border` / `text-muted-foreground`.                                              |
| `AuthProvider`                               | `components/auth/AuthProvider.tsx`                | **Yes, indirectly** — `AppContext.tsx:346` reads `useSession()`; `AuthSync` pre-loads `UserSettings`, which supplies `today` for the check-in date. |
| `AppProvider`                                | `context/AppContext.tsx`                          | **Yes** — supplies `goals`, `deleteGoal`, `updateGoal`, and `updateGoalProgress`.                                     |
| `CookieConsentProvider`                      | `components/privacy/CookieConsent.tsx`            | No.                                                                                                                  |
| `DataErrorBanner` (layout)                   | `components/shared/DataErrorBanner.tsx`           | **Yes** — `AppContext.fetchAll` sets `dataError` on a failed `GET /api/goals` (`:601`–`:605`) and the banner renders, **but the page itself ignores `dataError`**, so the user sees a banner *and* "No daily goals". |
| `CelebrationHost` (layout)                   | `components/achievements/CelebrationHost.tsx`    | Indirectly — `runAchievementCheck()` at `:194` fires on a daily check-in.                                             |
| `OfflineSync` / `OfflineBanner` (layout)     | `components/offline/**`                           | ⚠ **Partially relevant** — `lib/offline/queue.ts:90` and `components/offline/PendingChanges.tsx:88` queue and replay `GOAL_PROGRESS` against `POST /api/goals/[id]/progress`. The **slider never enqueues**, so this page's writes are not offline-safe. |

`/goals` creates **no** `React.Context` of its own.

### 4.3 State inventory

#### 4.3.1 `GoalsPage` — 7 `useState` (`page.tsx:157`–`:163`)

| State          | Line | Initial | Updated by                                        | Read by                                                        |
| -------------- | ---- | ------- | ------------------------------------------------ | -------------------------------------------------------------- |
| `tab`          | `:157` | `'DAILY'` | the 3 tab buttons `:244`                        | the `visible` partition `:165`; the counts text `:221`; `AddGoalModal.defaultType` `:292`; the empty-state copy `:257`–`:266` |
| `modalOpen`    | `:158` | `false`   | "Add goal" `:225`, the empty-state CTA `:270`, `AddGoalModal.onClose` | `<AddGoalModal open>` `:292`                        |
| `editing`      | `:159` | `null`    | the Pencil button `:98`; cleared by `EditGoalModal.onClose` | `<EditGoalModal goal>` `:293` and its internal `useEffect` `:25`–`:38` |
| `confirmDelete`| `:160` | `null`    | the Trash button `:106`; cleared by `handleDelete` `:207`, Cancel `:309`, backdrop `:298`, Delete `:314` | the overlay `:296`–`:318` |
| `error`        | `:161` | `null`    | **only** `handleCheckin`'s catch `:197` and `handleDelete`'s catch `:213` | the `role="alert"` banner `:229`–`:233`. **`handleSliderCommit`'s failure is NOT surfaced here.** |
| `busyId`      | `:162` | `null`    | `handleCheckin` start `:180` / `finally` `:199` | only the daily toggle's `disabled` `:72`. **⚠ A single id, so only one card can be busy at a time, and the Pencil/Trash buttons are never gated.** |
| `checkins`     | `:163` | `{}`      | optimistically in `handleCheckin` `:183`/`:197`; reset on error | `checkedToday` `:47` inside each `GoalCard`. **⚠ Never hydrated from the server and never persisted.** |

#### 4.3.2 The private `GoalCard` — 2 `useState` (`page.tsx:42`–`:43`)

| State          | Line | Initial                 | Updated by | Notes |
| -------------- | ---- | ----------------------- | ---------- | ----- |
| `sliderValue`  | `:42` | `goal.currentValue`     | the range `onChange` `:127` | **Initialised once — there is no `useEffect`**, so a server refresh of `currentValue` does not move the thumb |
| `sliderError`  | `:43` | `null`                  | `onSliderCommit`'s catch   | rendered at `:147` |

Derived: `isDaily = goal.type === 'DAILY'` `:39`; `pct` `:45`; `checkedToday` `:47`; `busy = busyId === goal.id` `:40`; `priority` `:41`.

#### 4.3.3 Both modals

`AddGoalModal` — 11 states (`title, description, type, priority, targetValue, unit, startDate, endDate, errors, submitting, submitError`, `:21`–`:31`).
`EditGoalModal` — 10 states (`title, description, priority, status, targetValue, currentValue, unit, endDate, error, saving`, `:14`–`:23`), **all re-synced** by `useEffect([goal])` at `:25`–`:38`.

#### 4.3.4 Lifted / shared

| Source            | Field                                                    | Defined at                          | Persisted? |
| ----------------- | -------------------------------------------------------- | ----------------------------------- | ---------- |
| `AppContext`      | `goals: Goal[]`, `deleteGoal` `:1085`, `updateGoal` `:1061`, `updateGoalProgress` `:1108` | –                          | **No** |
| `useUserTimezone` | `{today}` — the check-in date `page.tsx:156, 164`        | `hooks/useUserTimezone.ts:21`        | Server (`UserSettings`), cached in memory |
| `achievement.store` | `runAchievementCheck()` `page.tsx:194`                 | `store/achievement.store.ts:90`      | **No** (in-memory zustand) |
| URL / query state | —                                                          | **None**                             | —         |

### 4.4 Hooks used on `/goals`

| Hook                     | File                                    | Inputs       | Outputs                            | Side effects / API                                                                 |
| ------------------------ | --------------------------------------- | ------------ | ---------------------------------- | ----------------------------------------------------------------------------------- |
| `useApp()`               | `context/AppContext.tsx` (via `context/useApp.ts`) | –   | `goals`, `deleteGoal`, `updateGoal` **only** | the context performs all network I/O; the page does none of its own |
| `useUserTimezone()`      | `hooks/useUserTimezone.ts` (45)         | –            | `{timezone, today, isLoading}`      | reads `useSettings()`; order `settings.timezone` → browser zone → `DEFAULT_TZ('UTC')` |
| `useSettings()` (indirect) | `hooks/useSettings.ts` (71)             | –            | the settings store projection       | `useSettingsLoader` on auth; deduped by a module-level `loadInflight` (`settings.store.ts:75`) |
| `useSession()` (indirect) | `next-auth/react`                        | –            | session                             | read at `AppContext.tsx:346`                                                        |
| `runAchievementCheck()`   | `store/achievement.store.ts:90`          | –            | `Promise<void>`                    | `POST /api/achievements/unlock`, then pushes to `useAchievementStore` — **check-ins only** |
| `fetchWithAuth`           | `lib/api-client.ts`                      | path, opts   | response                           | `credentials:'include'`, `cache:'no-store'`; **does not throw on `!ok`**            |
| `useState` ×19            | React                                    | —            | see §4.3                            | pure                                                                                |
| `useEffect` ×1            | React                                    | `[goal]`     | —                                   | `EditGoalModal` field re-sync `:25`–`:38`                                          |
| `useMemo` ×1             | React                                    | `[goals, tab]` | `visible`, `dailyGoals`, `longTermGoals`, `completedGoals` `:165`–`:173` | pure |

---

## 5. Backend / API architecture

All routes are App Router handlers under `src/app/api/**`. Every one performs `await auth()` and returns **401** with no session. **None** use `withAuth`, `createApiHandler`, `withRateLimit`, or any rate limiter.

### 5.1 `GET /api/goals` — the page's only data source

- **Validation** — **none**. Query params are parsed manually at `goals/route.ts:18`–`:33`, despite the repository supporting `status` / `type` / `priority` / `projectId` / `parentGoalId` / `overdue` / `dueSoon` / `dayTypeAssignments`.
- **Service** — `GoalService.listGoals` (`:72`), a pure pass-through to `goalRepository.findAll`.
- **Repository** `findAll` (`goal.repository.ts:62`): builds `where` from status/type/priority/projectId/parentGoalId/overdue/dueSoon/dayTypeAssignments; includes `project(select)`, `tags{include tag(select)}`, `dayTypeAssignments{include dayType}`, `milestones(select id,completedAt)`, `_count{subGoals,milestones}`; orders by `buildOrderQuery(sortBy ?? 'endDate', sortOrder ?? 'asc')` and paginates with `buildPaginationQuery(limit, offset)`.
- **Defaults that matter here** — `limit = 50`, `offset = 0`, `sortBy = 'endDate'`, `sortOrder = 'asc'`. `AppContext.tsx:547` sends **no query params**, so these apply.
- ⚠ **`buildPaginationQuery` caps `take` at `Math.min(limit, 100)`** (`base.repository.ts:58`–`:73`).
- ⚠ **`meta.total = goals.length`** (`goals/route.ts:38`) — i.e. the **page size**, not the real total.
- **Errors** — 401; 500.

### 5.2 `POST /api/goals`

- **Validation** — `createGoalSchema` (`src/schemas/goal.schema.ts:17`).
- **Service** `GoalService.createGoal` (`:156`) — step-by-step in §3.3.
- ⚠ **`endDate <= startDate` throws `'End date must be after start date'`** (`:166`), which `goals/route.ts:82` returns as **HTTP 400**. `createGoalSchema.endDate` (`:39`) coerces, so a DAILY goal whose modal sent `endDate = startDate` hits this. See §24 F1.
- **Response** — 201 `{success:true, data}`.

### 5.3 `PATCH /api/goals/[id]`

- `PATCH` is a **pure alias**: `[id]/route.ts:102`–`:108` destructures `params` then calls `PUT(request, { params: Promise.resolve({ id }) })`. Note the promise is **never awaited** — harmless, but it is the same pattern that caused 13 routes to break earlier (see `AGENTS.md`).
- **Validation** — `updateGoalSchema = createGoalSchema.partial().extend({ status })` (`goal.schema.ts:58`–`:61`). ⚠ It declares **no `completedAt`**, and a plain `z.object` strips unknown keys — so the service's `input.completedAt` branch (`goal.service.ts:252`) is **unreachable**. §24 F4.
- **Service** `GoalService.updateGoal` (`:225`) — 13 conditional spreads, then optional day-type and tag replacement.
- **Errors** — 401; **400** for "Goal not found" (a bare `Error`, not `NotFoundError`); 500.

### 5.4 `DELETE /api/goals/[id]`

- **Validation** — **none**.
- **Service** `GoalService.deleteGoal` (`:670`): `findById` → `delete(goalId, userId)` → `// TODO: Audit log` → **returns `void`**.
- ⚠ **`Task.goalId` has no `onDelete`** (`schema.prisma`), so `goal.delete` fails with **P2003** if any task references the goal. Neither the service nor the route pre-checks or nulls out `Task.goalId`. §24 F9.
- **Errors** — 401; **400** for "Goal not found".

### 5.5 `POST /api/goals/[id]/checkin`

- **Validation** — `goalCheckinSchema` (`goal.schema.ts:71`); `export type GoalCheckinInput` at `:83`.
- **Service** `GoalService.checkInDaily` (`:420`) — step-by-step in §3.3.
- **This is the one goal method that throws typed errors**: `NotFoundError('Goal')` → **404**, `ValidationError` → **400**. Every sibling method throws a bare `Error` and answers **400**. §24 F5.
- ⚠ `addProgressLog` is a **`create`**, and `GoalProgress` has **no `@@unique([goalId, date])`** — so repeated check-ins on the same date insert multiple rows.
- **Response** — `{success:true, data: Goal}` (bare row).

### 5.6 Goal routes that `/goals` **never** calls (7 resources, 13 endpoints)

| Endpoint                          | Physical | Method      | `auth()` | Schema | Service | Notes |
| --------------------------------- | -------- | ----------- | -------- | ------ | ------- | ----- |
| `/api/goals/[id]/progress`        | 59       | POST        | ✅ `:18` | **inline** `progressSchema` at `:6` (not in `src/schemas/`) | `updateProgress` `:34` | The **only** writer of `GoalProgress` besides `checkInDaily`, and the only auto-complete path. Reached **only** by offline replay (`queue.ts:90`, `PendingChanges.tsx:88`) — **the slider never reaches it.** |
| `/api/goals/[id]/carry-over`      | 53       | POST        | ✅ `:17` | **inline** `carryOverSchema` at `:6` | `carryOverGoal` `:33` | **No UI caller.** `CarryOverDialog.tsx` (21 lines) is dead. |
| `/api/goals/[id]/history`         | 64       | GET         | ✅ `:20` | none (limit/offset clamped to 200) | `getHistory` `:39` | **No UI caller.** `GoalHistory.tsx` (29 lines) is dead. |
| `/api/goals/[id]/tags`            | 98       | GET, PUT    | ✅ `:21`, `:53` | **inline** `updateGoalTagsSchema` at `:11` | `getTags` `:31`, `setTags` `:72` | **No UI caller** from `/goals`; `/today`'s `TodayGoals` does not use it either. |
| `/api/goals/[id]/milestones`      | 87       | GET, POST   | ✅ `:17`, `:49` | `milestoneSchema` — **`src/schemas/project.schema.ts:3`** (cross-file reuse) | `getMilestones` `:27`, `addMilestone` `:68` | **No UI caller** from `/goals`, though `AddGoalModal` sends `milestones` on create. |
| `/api/goals/bulk`                 | 105      | POST        | ✅ `:29` | **inline** `bulkGoalsSchema` at `:7` (composes create/update) | `createGoal`, `updateGoal`, `deleteGoal` | **No UI caller.** |
| `/api/goals/today`                | 73       | GET         | ✅ `:17` | none (regex at `:27`) | `getVisibleGoalsForDate` `:33`, `getProgressLogsForDate` `:34` | Used by `/today`'s `TodayGoals`. |
| `/api/goals/[id]` (GET only)      | 108      | GET         | ✅ `:11` | none | `getGoal` `:19` | **Orphaned** — there is no `/goals/[id]` page to consume it. |

### 5.7 Goal-touching routes outside `/api/goals`

| Path                                  | Physical | Method      | Goal coupling |
| ------------------------------------- | -------- | ----------- | ------------- |
| `/api/projects/[id]/goals`            | 99       | GET, POST   | `getProjectGoals` `:31`, `attachToProject` `:75`. **The POST has no UI caller.** |
| `/api/projects/[id]/milestones`       | 92       | GET, POST   | inline `createProjectMilestoneSchema = {goalId}.merge(milestoneSchema)` `:11` |
| `/api/tasks/[id]/complete`            | 39       | POST        | **`TaskService.completeTask` calls `goalService.updateProgress(userId, goalId, +1, undefined, true)`** (`task.service.ts:223`) — the second writer of `GoalProgress` |
| `/api/tasks/[id]` (un-complete)       | 113      | PATCH       | **`TaskService.updateTask` calls `goalService.updateProgress(userId, goalId, -1, undefined, false)`** (`task.service.ts:197`) |
| `/api/tasks`                          | 102      | GET, POST   | `TaskService.createTask` ownership-checks `goalId` via `GoalRepository.findById` |
| `/api/bulk/archive`                   | 49       | POST        | **`BulkService` → `GoalService.archiveGoal`** (`bulk.service.ts:49`), which sets `status='CANCELLED'` + `archivedAt` |
| `/api/bulk/delete`                    | 49       | POST        | `BulkService` → `GoalService.deleteGoal` (`bulk.service.ts:77`) |
| `/api/search/goals`                   | 58       | GET         | `SearchService.searchGoals` → `findAll(userId, {limit: 200})` (`search.service.ts:107`) |
| `/api/projects`, `/api/projects/[id]` | 111, 113 | — | `ProjectService` writes audit rows with `'GOAL_*'` actions — see §26 |

**Two writers of `GoalProgress` exist: `checkInDaily` (this page) and `TaskService.completeTask`/`updateTask`. A third route — `POST /api/goals/[id]/progress` — also writes it, but only offline replay reaches it.**

---

## 6. Database dependency

### 6.1 Models read/written by `/goals`

| Model             | Purpose                        | Key fields used                                                                                                  | Rel. to User | Rel. to "today"                    | Read                       | Write                                  | Indirect                    |
| ----------------- | ------------------------------ | ---------------------------------------------------------------------------------------------------------------- | ----------- | ---------------------------------- | -------------------------- | -------------------------------------- | --------------------------- |
| `Goal`            | a tracked goal                 | `id,title,description,type,priority,status,targetValue,currentValue,unit,startDate,endDate,completedAt,archivedAt,parentGoalId,carriedOverFrom,isPublic,appliesEveryDay,projectId` | `userId`    | via the date window              | ✅                         | ✅ (create, update, delete, check-in)   | ✅                          |
| `GoalProgress`    | dated progress log             | `value`, `date` (DateTime), `note`                                                                               | via `Goal`  | the day                            | ✅ (`/api/goals/today` only) | ✅ **only `checkInDaily`** on this page | ✅                          |
| `GoalDayType`     | goal ↔ day-type join           | `dayTypeId`, **`userId` (denormalised)**                                                                          | `userId`, `goalId` | via day type             | ✅                         | ✅ (create; clear+recreate on update)    | ✅                          |
| `GoalTag`         | goal ↔ tag join                | `tagId`                                                                                                          | via `Goal`  | —                                  | ✅                         | ⚠️ **never from `/goals`** — no UI sends `tagIds` | ✅                          |
| `Tag`             | a label                        | `id,name,color,icon`                                                                                              | `userId`    | —                                  | ✅ (nested select)         | ❌ (no picker on this page)              | ✅                          |
| `Milestone`       | a goal checkpoint              | `id,goalId,title,description,targetValue,dueDate,completedAt,sortOrder`                                           | via `Goal`  | —                                  | ✅ (select `id,completedAt`) | ⚠️ only on **create** (`createGoal:200–213`) | ✅                          |
| `Project`         | a grouping                     | `id,name,status,priority` (**reuses `GoalPriority`**), `progress Float`                                          | `userId`    | —                                  | ✅ (`select` only)         | ❌ (no picker on this page)              | ✅                          |
| `Task`            | a to-do                        | `goalId`                                                                                                          | `userId`    | —                                  | ❌                         | ❌ **but read by `deleteCascade` via FK** | ✅                          |
| `DayTypeDefinition` | user-defined day types        | `id,name,slug`                                                                                                    | `userId`    | via `resolveDayTypeForDate`        | ✅ (nested include)        | ❌ (written from `/routine`)              | ✅                          |
| `RoutineException` | per-date day-type override    | `date`                                                                                                            | `userId`    | via `resolveDayTypeForDate`        | ✅ (`/api/goals/today` only) | ❌                                        | ✅                          |
| `Achievement`     | unlocked badges                | `type`, `title`, `level`                                                                                          | `userId`    | —                                  | ✅ (fire-and-forget)       | ✅ (via `checkForUnlocks`)               | ✅                          |
| `NotificationLog` | notification rows              | `ACHIEVEMENT_UNLOCKED`                                                                                            | `userId`    | —                                  | ❌                         | ⚠️ possible                              | ✅                          |
| `UserSettings`    | per-user preferences           | `timezone`                                                                                                        | 1:1         | —                                  | ✅ (via `getTimezone`)      | ❌                                         | ✅                          |
| `AuditLog`        | audit trail                    | —                                                                                                                | `userId`    | —                                  | ❌                         | ❌ **`deleteGoal` has `// TODO: Audit log`** | —                       |
| `AutomationRule`/`Task` | automations                 | —                                                                                                                | `userId`    | —                                  | ⚠️ possible               | ⚠️ possible (`automation.service.ts:355, :370`) | ✅                       |

### 6.2 `Goal` fields the page never surfaces

| Field              | Where it exists                          | Reachable through the UI? |
| ------------------ | ---------------------------------------- | ------------------------- |
| `status`            | `GoalStatus` (6 values)                   | ✅ **Edit modal only.** Never rendered as a badge. A checked DAILY goal silently leaves the Daily tab. §25 |
| `completedAt`      | written by `updateGoal`/`complete`       | ⚠️ **unreachable through the API** — `updateGoalSchema` strips it. §24 F4 |
| `archivedAt`       | written only by `archiveGoal` (bulk)      | ❌ no archive control on `/goals` |
| `carriedOverFrom`  | set by `carryOverGoal`                   | ❌ no UI caller for `POST /api/goals/[id]/carry-over` |
| `parentGoalId` / `subGoals` | goal hierarchy                      | ❌ no UI — `createGoalSchema` and `AppContext.addGoal` both omit it |
| `projectId` / `project` | project linkage                      | ❌ no project picker; **`/goals` contains no reference to `/projects` at all.** §24 F7 |
| `isPublic`         | never settable from any client           | ❌ `AddGoalModal` has no control and `AppContext.addGoal` builds an explicit allow-list body that omits it. §24 F7 |
| `appliesEveryDay`  | day-type gating                          | ❌ no control; `AppContext.addGoal` omits it, so it always defaults `true` |
| `dayTypeAssignments` | day-type gating                        | ❌ no picker — unlike `/habits`, which has day-type chips |
| `tagIds`           | goal tags                                | ❌ no picker on this page, though `POST /api/goals/[id]/tags` and `GoalRepository.addTags` exist |
| `unit`             | displayed for non-DAILY only             | ⚠️ a DAILY goal's `unit` is never rendered |
| `priority`         | rendered as a badge                      | ⚠️ `CRITICAL`/`HIGH` both map to the same `'success'` badge variant; `NON_PROFIT` maps to `'default'`. §24 F8 |
| `type`             | `GoalType` (6 values)                    | ⚠️ the modal offers only **4**; `QUARTERLY` and `CUSTOM` are uncreatable |
| `priority`         | `GoalPriority` (8 values)               | ⚠️ the modal offers only **3** (Add) / **4** (Edit); `PERSONAL`, `ACADEMIC`, `NON_PROFIT`, `PROFESSIONAL` are uncreatable |

### 6.3 Fields the schema accepts that `AppContext.addGoal` drops

`AppContext.addGoal` (`AppContext.tsx:1028`–`:1038`) builds an **explicit allow-list body**. Omitted, despite `createGoalSchema` accepting all of them:

`isPublic` · `tagIds` · `milestones` · `appliesEveryDay` · `dayTypeIds` · `projectId` · `parentGoalId`.

So `Milestone` rows can only ever be created by `POST /api/goals/[id]/milestones` (no UI caller) or a direct API call — **never from the Add modal**, despite `AddGoalModal` having no milestone field either. §24 F2.

---

## 7. Date and day-type logic

### 7.1 Which date `/goals` uses

The page reads **no** date from the user. `today` comes from `useUserTimezone().today` (`page.tsx:156`, used at `:164`), which resolves `settings.timezone` → browser zone → `DEFAULT_TZ('UTC')`. It is used **only** as the `date` field of the daily check-in body.

There is **no date picker, no `selectedDate`, and no date navigation** on `/goals`. Goals are not filtered by the viewed date — the tabs filter by `type` and `status` only.

### 7.2 Day-type gating — happens entirely on the server, and this page never triggers it

```
GET /api/goals/today?date=YYYY-MM-DD                 (used by /today, NOT by /goals)
→ GoalService.getVisibleGoalsForDate                  goal.service.ts:92
   1 resolveDayTypeForDate(userId, date)              :94   ← the canonical resolver
        RoutineRepository.findException(userId, date)
          → hit?  findDayTypeDefinitionById(...).catch(()=>null)
                  resolveDayTypeFromException(…, 'UTC', …)
          → miss? resolveNaturalDayType(date, 'UTC')
                  findDayTypeDefinitionBySlug(userId, getDayTypeSlug(dayType))
        ⇒ returns the CONCRETE dayTypeId
   2 dayWindow(date)                                  :95   half-open UTC day
   3 findActiveInDateWindow(userId, start, end)       :97
   4 filter appliesEveryDay → alwaysVisible           :102
   5 if no dayTypeId → return alwaysVisible only       :104–106
   6 findActiveByDayTypeId(userId, dayTypeId)         :108
   7 in-window filter: startDate < end && endDate >= start   :112
   8 de-dup by id with a Set                          :117–122
   returns {goals, resolved}
```

`resolveNaturalDayType` (`resolve-routine.ts:45`) parses `date` as **UTC midnight**, takes the ISO weekday via `formatInTimeZone(dateObj,'UTC','i')`, and returns `WEEKEND` for `0` or `6`, else `WORKDAY`. Its `_timezone` parameter is **ignored** — documented at `:40`–`:43`. So a `DAILY` goal's day-type resolution is timezone-independent by design.

**Because `/goals` calls bare `GET /api/goals` and never `GET /api/goals/today`, a day-type-restricted goal appears on `/goals` even on a day it should not.** §24 F6.

### 7.3 Pure helpers in `src/lib/goals/` — 100 % dead

| File            | Physical | Export                                              | Behaviour                                                        | Callers |
| --------------- | -------- | --------------------------------------------------- | ---------------------------------------------------------------- | ------- |
| `velocity.ts`   | 45       | `interface GoalProgress` (`:3`)                     | **a local duplicate of the Prisma `GoalProgress` shape**, named identically, with a non-existent `recordedAt` field | 0 |
|                |          | `calculateVelocity(_goal, entries)` (`:11`)         | `_goal` **unused**; `<2` entries → `null`; sorts by `recordedAt`; `(last−first)/daysDiff`; `daysDiff===0` → `null` | 0 |
|                |          | `getProjectedCompletionDate(goal, velocity)` (`:27`)| `velocity<=0 \|\| !targetValue` → `null`; `remaining<=0` → **now ISO**; else `now + ceil(remaining/velocity)` days | 0 (only `isOnTrack`) |
|                |          | `isOnTrack(goal, velocity)` (`:40`)                 | `projectedDate <= goal.endDate`                                  | 0 |
| `progress.ts`  | 26       | `calculateCompletionPercentage(goal)` (`:3`)        | `targetValue===0` → **100** (an inverted default); clamps 0–100   | **1, dead** — `GoalCard.tsx:3` |
|                |          | `getProgressStatus(goal)` (`:10`)                   | `COMPLETED`→'completed'; `now > endDate`→'overdue'; `!currentValue`→'not-started'; else 'in-progress' | **1, dead** — `GoalCard.tsx:3` |
|                |          | `getRemainingValue(goal)` (`:22`)                   | `null` if no target; `max(target − current, 0)`                  | 0 |
| `expiration.ts` | 39       | `isGoalExpired` (`:4`)                              | not expired if COMPLETED; `today > endDate`                      | 0 |
|                |          | `getDaysUntilDue` (`:11`)                          | `ceil(max(due − today, 0) / 86400000)`                            | 0 |
|                |          | `isGoalAtRisk(goal)` (`:18`)                        | false if COMPLETED or `totalDuration<=0`; **hardcoded heuristic `timeProgress > 75 && valueProgress < 50`** | 0 |
|                |          | `getExpiredGoals(goals, today?)` (`:37`)            | `goals.filter(isGoalExpired)`                                     | 0 |
| `completion.ts` | 21       | `checkGoalCompletion(goal)` (`:3`)                  | `!targetValue` → `status==='COMPLETED'`; else `current >= target`  | 0 |
|                |          | `markGoalComplete(_goal)` (`:9`)                    | returns `{status:'COMPLETED', completedAt: new Date()}`; `_goal` unused | 0 |
|                |          | `checkAllGoalsCompletion(goals)` (`:16`)            | filter+map to **new** objects (does not mutate)                   | 0 |
| `carry-over.ts` | 34       | `canCarryOver(goal)` (`:3`)                         | false if COMPLETED; `now >= endDate \|\| status==='MISSED'`        | 0 |
|                |          | `createCarryOverGoal(goal, newDueDate)` (`:10`)     | `{...goal, title: "<t> (Carried Over)", status:'ACTIVE', currentValue: 0, carriedOverFrom: …} as any` — ⚠ **CONTRADICTS the server**, which keeps the original title and writes `status:'CARRIED_OVER'` on the *original* | 0 |
|                |          | `getSuggestedCarryOverDate(goal)` (`:22`)           | +7d / +1mo / +1yr by `goal.type`, default +7d                     | 0 |

**The page re-implements `calculateCompletionPercentage` inline** at `page.tsx:45` (`pct = targetValue > 0 ? min(100, current/target*100) : 0`) — with a **different** zero-target behaviour (`0`, not `100`). §24 F10.

### 7.4 Dead exports in `src/lib/scheduling/`

`resolve-routine.ts:157` `getDayTypeSlug` (internal only) · `:164` `findDayTypeDefinitionBySlug` (0 callers) · `:171` `findTemplateByDayTypeId` (0 callers).
All of `src/lib/scheduling/frequency.ts` (71 lines): `isHabitDueByFrequency` `:32` and `frequencyLabel` `:62`, with private helpers `toDateOnly` `:15`, `utcDay` `:20` (uses `T12:00:00.000Z` to dodge DST) and `positiveInteger` `:23`. Note `isHabitDueByFrequency` returns **`false`** for `YEARLY_TARGET` and `RANDOM` via its `default:` branch — dead, but a trap if adopted.

---

## 8. Complete user actions (serial)

### 8.1 On first mount

| # | Action                                        | Mechanism                              | Requests |
| - | --------------------------------------------- | -------------------------------------- | -------- |
| 1 | `AppProvider` mounts (root layout, pre-paint) | `AppContext.tsx:535`–`:548`            | `GET /api/habits` (loop) ∥ `GET /api/routine` ∥ **`GET /api/goals`** |
| 2 | `goals` populated                             | `AppContext.tsx:547` — **no query params** | –  |
| 3 | No session?                                   | `AppContext.tsx:346`                    | –        |
| 4 | `useUserTimezone()` resolves `today`          | `settings` → browser → `'UTC'`          | –        |
| 5 | `visible` partition computed                  | `page.tsx:165`–`:173` (`useMemo`)       | –        |
| 6 | Grid or empty state renders                   | `page.tsx:255` / `:275`                 | –        |

**Total: 3 + N requests. `/goals` reads exactly one of them** — and the two it discards are `/api/habits` and `/api/routine`.

**There is no skeleton.** The page reads neither `dataLoaded` nor `dataError`, so between mount and the fetch resolving, `goals` is `[]` and the page renders the **empty state**. §24 F11.

### 8.2 Card actions

| # | User action                        | Handler                       | Optimistic | Requests | Follow-up |
| - | ---------------------------------- | ----------------------------- | ---------- | -------- | --------- |
| 1 | Click the daily circle (`DAILY` only) | `handleCheckin(goal, !checked)` `:177` | ✅ `checkins` `:183` | **`POST /api/goals/[id]/checkin`** `:182` **then a second `PATCH /api/goals/[id]`** `:190` | `void runAchievementCheck()` `:194`; revert + `setError` on failure `:197`; `setBusyId(null)` `:199` |
| 2 | Drag the slider then release (non-DAILY) | `onSliderCommit` `:130` / `:132` | ✅ `sliderValue` | **`PATCH /api/goals/[id]`** `{currentValue}` via `updateGoalProgress` `:1108` | `setSliderError` on failure — **not surfaced in the page's `error` banner** |
| 3 | Click **Pencil**                  | `onEdit` → `setEditing(goal)` `:98` | – | – | opens `EditGoalModal`. **Never disabled** — a double-click re-enters while a request is in flight. |
| 4 | Click **Trash2**                  | `onDelete` → `setConfirmDelete(goal)` `:106` | – | – | opens the hand-rolled overlay. **Never disabled.** |
| 5 | Confirm **Delete**                | `handleDelete` `:203`          | ✅ row removed from `goals` `:210` | `DELETE /api/goals/[id]` via `AppContext.deleteGoal` `:1085` | `setError` on failure `:213` |
| 6 | Submit the Edit modal             | `EditGoalModal.handleSubmit`   | ❌          | `PATCH /api/goals/[id]` via `updateGoal` `:1061` | – |
| 7 | Submit the Add modal              | `AddGoalModal.handleSubmit`    | ❌          | `POST /api/goals` via `addGoal` `:1025` | `reset()` clears only 4 of 11 fields |

### 8.3 Navigation actions

| # | User action         | Handler        | Effect |
| - | ------------------- | -------------- | ------ |
| 1 | Click a tab         | `setTab(t)` `:244` | re-partitions `visible` (`:165`–`:173`) and swaps the empty-state copy. **No request.** |
| 2 | Click **Cancel** on the delete overlay | `setConfirmDelete(null)` `:309` | – |
| 3 | Click the overlay backdrop | `setConfirmDelete(null)` `:298` | ⚠ **no Escape key**, so keyboard users cannot close it |

**There is no `<Link>`, no `href`, and no `router.push` anywhere in `page.tsx`, `AddGoalModal` or `EditGoalModal`.**

---

## 9. What can the user create

| Thing                | Entry point                  | Request                                  | Validation                       | Notes |
| -------------------- | ---------------------------- | ---------------------------------------- | -------------------------------- | ----- |
| **A goal**           | "Add goal" / the empty-state CTA → `AddGoalModal` | `POST /api/goals` `AppContext:1025`     | `createGoalSchema` (`goal.schema.ts:17`) | Fields: title, description, type (4 of 6), priority (3 of 8), target + unit (non-DAILY only), start date, end date. `targetValue` is forced to `1` for DAILY. |
| **`GoalProgress`**   | clicking the daily circle    | `POST /api/goals/[id]/checkin` `:182`    | `goalCheckinSchema`               | `note` is hard-coded to `'daily-checkin:done'` or `'daily-checkin:cleared'`; `date` is `new Date(\`${date}T00:00:00.000Z\`)`. **A `create`, not an upsert.** |
| **A `Milestone`**    | ⚠ **no UI on this page**       | `POST /api/goals/[id]/milestones` (no caller) | `milestoneSchema` from `project.schema.ts:3` | `createGoal` does `Promise.all(input.milestones)`, but `AppContext.addGoal` omits `milestones`, so **no client can ever produce one.** |
| **`GoalTag` / `GoalDayType`** | ⚠ **no UI on this page** | `PUT /api/goals/[id]/tags` (no caller) | `updateGoalTagsSchema` (inline) | `AppContext.addGoal` omits `tagIds` and `dayTypeIds`. |
| **`Task`**           | ⚠ `/tasks` only                 | `POST /api/tasks`                        | `createTaskSchema`                 | Completing a task writes `GoalProgress` via `goalService.updateProgress(…, +1)`. |
| **An `Achievement`** | indirect — `runAchievementCheck()` `:194` | `POST /api/achievements/unlock` | –                            | **Check-ins only.** Slider drags, edits and deletes trigger **no** achievement check. |

**Not creatable from this page:** a `Project`, a sub-goal, a tag, a day-type assignment, a milestone.

---

## 10. What can the user edit

| Target                        | Entry point                       | Request                                    | Validation                          | Notes |
| ----------------------------- | --------------------------------- | ------------------------------------------ | ----------------------------------- | ----- |
| **A goal's fields**           | Pencil → `EditGoalModal`          | `PATCH /api/goals/[id]` `AppContext:1061`  | `updateGoalSchema` (`goal.schema.ts:58`) | title, description, priority, **status**, target, current, unit (non-DAILY only), end date |
| **`currentValue`** (non-DAILY)| dragging the slider               | `PATCH /api/goals/[id]` `AppContext:1108`  | same                                | ⚠ **writes no `GoalProgress`** — §24 F2 |
| **`currentValue`** (DAILY)    | the circle toggles it 0 ⇄ 1        | the checkin + the redundant PATCH        | `goalCheckinSchema` + `updateGoalSchema` | always `0` or `1` — there is no count |
| **The tab**                   | the tab strip                     | –                                          | –                                    | local only |
| **`description` / `unit` cleared** | the fields, blanked           | same                                       | –                                    | ✅ correctly sent as `null` (`EditGoalModal:59`–`:60`) — the deliberate pattern the habits schema also uses |
| **The end date cleared**      | the field, blanked                | same                                       | –                                    | ❌ **impossible** — `endDate: endDate \|\| goal.endDate` (`:67`) |
| **`completedAt`**             | —                                  | —                                          | ❌ **stripped** by `updateGoalSchema` | §24 F4 |

### 10.1 The 8-value priority enum, 3 or 4 of which are reachable

| Value          | In `AddGoalModal` | In `EditGoalModal` | `PRIORITY_COLORS` variant |
| -------------- | ----------------- | ------------------ | ------------------------- |
| `HIGH`         | ✅                | ✅                 | `'success'`               |
| `MEDIUM`       | ✅                | ✅                 | `'warning'`               |
| `LOW`          | ✅                | ✅                 | `'default'`               |
| `CRITICAL`     | ❌                | ✅                 | `'success'` — **same as HIGH** |
| `PERSONAL`     | ❌                | ❌                 | `'primary'`               |
| `ACADEMIC`     | ❌                | ❌                 | `'primary'`               |
| `NON_PROFIT`   | ❌                | ❌                 | `'default'`               |
| `PROFESSIONAL` | ❌                | ❌                 | `'primary'`               |

Four of eight priorities are **uncreatable**, and `HIGH` and `CRITICAL` render identically. `Project.priority` reuses the same enum (`schema.prisma:1103`), so the same confusion exists on the projects side.

### 10.2 The 6-value type enum, 4 of which are reachable

`DAILY` ✅ · `WEEKLY` ✅ · `MONTHLY` ✅ · `YEARLY` ✅ · **`QUARTERLY` ❌** · **`CUSTOM` ❌**.

`AddGoalModal`'s `defaultType` prop is typed `'DAILY'|'WEEKLY'|'MONTHLY'|'YEARLY'` (`:16`) while the inner `GoalType` union (`:14`) has all 6. ⚠ `useState<GoalType>(defaultType)` (`:23`) reads `defaultType` **only on first mount** — and the modal is mounted unconditionally at `page.tsx:292`, so **switching tabs never changes the preselected type.**

---

## 11. What can the user delete

| Target                | Entry point                                   | Request                                    | Effect |
| --------------------- | --------------------------------------------- | ------------------------------------------ | ------ |
| **A goal, permanently** | Trash → the hand-rolled overlay → **Delete**  | `DELETE /api/goals/[id]` `AppContext:1085` | `goal.delete({where:{id, userId}})` — cascades `GoalProgress`, `Milestone`, `GoalTag`, `GoalDayType`. **`// TODO: Audit log` — no audit row.** |
| **A goal (archived)** | ⚠ **no control on this page**                    | `POST /api/bulk/archive` → `archiveGoal`   | sets `status='CANCELLED'` + `archivedAt`. Only reachable through `/bulk`. |
| **A task on the goal** | ⚠ **not handled**                                | —                                          | `Task.goalId` has no `onDelete`; `goal.delete` fails with **P2003**. §24 F9 |

**There is no soft-delete and no undo.** One click on Delete destroys the goal, its entire progress history, its milestones and its tags.

---

## 12. Cross-page dependencies

### 12.1 Inbound — what links to `/goals`

Thirteen sources link to it, and **every one links to the list, never to a detail page**:

| Source                                              | Line(s)          |
| --------------------------------------------------- | ---------------- |
| `components/layout/Sidebar.tsx`                     | `:22`            |
| `components/layout/Navigation.tsx`                   | `:45`            |
| `components/layout/MobileNav.tsx`                    | `:17`            |
| `components/layout/JumpTo.tsx`                       | `:41`            |
| `components/layout/Footer.tsx`                       | `:44`            |
| `app/(dashboard)/dashboard/page.tsx`                 | `:50`            |
| `server/services/dashboard/overview.service.ts`      | `:98`            |
| `app/(dashboard)/dashboard/MetricsRow.tsx`           | `:308`           |
| `app/(dashboard)/dashboard/GoalsVelocity.tsx`        | `:71`, `:109`    |
| `app/(dashboard)/today/TodayGoals.tsx`               | `:165`, `:179`   |
| `app/(dashboard)/search/page.tsx`                    | `:64`            |
| `app/(dashboard)/dashboard/GoalsWidget.tsx` (via `useApp().goals`) | –    |

### 12.2 Broken deep links — two systems build `/goals/{id}` and **there is no such route**

| Source                                              | Line   | What it builds |
| --------------------------------------------------- | ------ | ------------- |
| `server/services/notification.service.ts`           | `:522` | `actionUrl: \`/goals/${goal.id}\`` on a goal notification |
| `server/services/email.service.ts`                  | `:383` | a "View goal" button to `${APP_URL}/goals/${goal.id}` |

A directory scan confirms there is **no** `src/app/(dashboard)/goals/[id]/`. **Both links 404.** The API route `GET /api/goals/[id]` exists (`[id]/route.ts:11`, 108 lines) with **zero consumers**.

### 12.3 `/projects` ↔ `/goals`

| Direction        | Reality |
| ---------------- | ------- |
| → `/goals`       | ✅ 13 sources, listed above |
| **`/goals` → `/projects`** | ❌ **NONE.** `page.tsx`, `AddGoalModal` and `EditGoalModal` contain no `/projects` reference, no project picker, no project badge — even though `Goal.project` is a real relation and `ProjectService.getProjectStats` computes goal progress. |
| `/projects` → `/goals` | **Partial and one-way per row.** `projects/[id]/page.tsx:110`–`:141` renders "Linked goals" from `project.goals` via `GET /api/projects/{id}`, using the shared `GoalProgressBar` at `:125`. **No row links to `/goals`**, and `POST /api/projects/[id]/goals` (attach) has **no UI caller**. |

### 12.4 What `/goals` reads from elsewhere

| Data         | Produced by                                            | Drift risk |
| ------------ | ------------------------------------------------------ | ---------- |
| `goals`      | `AppContext.fetchAll()` (root layout)                  | **Real.** Bare `GET /api/goals` means `limit=50`. Every widget and every page reading `useApp().goals` is silently truncated past 50 goals, and there is **no `includeArchived` equivalent** for goals — so archived goals are never listable at all. |
| `today`      | `useUserTimezone()` → `useSettings()` → `UserSettings` | Low. Used only for the check-in date. |
| `dataError`  | `AppContext.tsx:601`–`:605`                           | **Not read by this page** — see §16.2. |
| `dataLoaded` | `AppContext.tsx:600`                                   | **Not read by this page** — there is no skeleton. |

### 12.5 Shared components

| Shared item               | Also used by |
| ------------------------- | ------------ |
| `Modal`, `Button`, `Input`, `Select`, `Textarea`, `Badge`, `EmptyState` | the whole app, via the barrel |
| `GoalProgressBar.tsx` (28) | **only** `app/(dashboard)/projects/[id]/page.tsx:13, :125` — **not** by `/goals`, which re-implements the bar inline at `page.tsx:135`–`:142` |
| `runAchievementCheck`     | `TodayHabitChecklist.tsx` |
| `GoalService`             | `/today` (`TodayGoals`), `/tasks` (completion → progress), `/projects`, `/bulk`, `/search`, `analytics/*`, `recap/*`, `template.service`, `review.service`, `ai/aggregator`, `data/exporter`, `automation.service` |

---

## 13. Impact analysis

### 13.1 If `GET /api/goals` fails

- `AppContext` sets `dataError` (`:601`–`:605`), so **`DataErrorBanner` in the layout renders**.
- The page itself reads only `{goals, deleteGoal, updateGoal}` (`:155`), so **it renders "No daily goals"** — byte-identical to a genuinely empty account.
- Two contradictory surfaces for one failure. `MetricsRow.tsx:272`–`:274` documents having fixed exactly this for its own card; the goals page was not included.

### 13.2 What happens when a DAILY goal is checked

This is the single most consequential behaviour on the page and has its own section, [§25](#25-the-daily-goal-check-in-trap). In short:

1. `POST /api/goals/[id]/checkin` writes a `GoalProgress` row **and** sets `currentValue = 1`, `status = 'COMPLETED'`, `completedAt = now`.
2. A **redundant** `PATCH /api/goals/[id]` repeats `currentValue` and `status`.
3. `runAchievementCheck()` fires.
4. The page's tab partition sees `status === 'COMPLETED'` and moves the goal **out of the Daily tab**.
5. The circle the user just clicked is now unreachable from `/goals`. Un-checking is only possible from `/today` or the Edit modal's Status select.

### 13.3 Blast radius of each write

| Action            | Writes                                                                                              | Recomputes a score? | Reversible? |
| ----------------- | --------------------------------------------------------------------------------------------------- | ------------------- | ----------- |
| Check in          | `GoalProgress` (**create** — no `@@unique`) + `Goal` (`currentValue`, `status`, `completedAt`) + a redundant `Goal` `PATCH` + a fire-and-forget `Achievement` check | ❌ | ⚠ only via `/today` |
| Slider commit     | `Goal` (`currentValue`) only                                                                          | ❌                   | ✅ drag back |
| Edit              | `Goal` + optional `GoalDayType` / `GoalTag` replacement                                               | ❌                   | ✅ |
| Delete            | `Goal` + cascades `GoalProgress`, `Milestone`, `GoalTag`, `GoalDayType`                                | ❌                   | ❌ **no** |
| **Cross-page**    | —                                                                                                    | —                   | — |
| **Task completed** (`/tasks`) | `GoalProgress` (+`Goal.currentValue`, + auto-`complete()` if it crosses the target, + fire-and-forget achievements) | ❌ | ✅ un-complete decrements by −1 |
| **Goal archived** (`/bulk`) | `Goal` (`status='CANCELLED'`, `archivedAt`)                                                    | ❌ | ✅ |
| **`/today` check-in** | identical to this page's check-in                                                               | ❌ | same trap |

### 13.4 Effects on other domains

- **`GoalProgress` feeds analytics.** `GoalRepository.getProgressHistory` (`:279`) is called by `analytics/weekly.ts:124` and `GoalService.getGoalAnalytics` (`:635`, dead). Since the slider writes **no** progress rows, a goal's velocity/analytics only ever reflect check-ins and task completions — never manual progress.
- **Achievements depend on `Goal` state.** `AchievementService.checkForUnlocks` builds its world state from `Streak`, `Goal`, `DailyScore`, `SleepLog` and `countAllCompletedLogs`. Only the check-in path triggers it on this page, so slider-driven progress never unlocks anything.
- **`Task.goalId` blocks deletion.** `Goal.tasks` has no `onDelete` (`schema.prisma`), so any goal with tasks cannot be deleted from this page — and the failure surfaces as an error banner, not as an explanation. §24 F9.
- **Audit trail.** `deleteGoal` writes **no** `AuditLog` (`// TODO` at `goal.service.ts:678`), while `ProjectService` and `TaskService` **do** for the same class of event — so goal deletion is the only destructive goal write with no trail. See §26.

---

## 14. Current System Capabilities

What `/goals` demonstrably does today:

1. **Lists** every goal `AppContext` holds, partitioned into three tabs: **Daily** (`type === 'DAILY'`), **Long-term** (everything else, `status !== 'COMPLETED'`), and **Completed** (`status === 'COMPLETED'`).
2. **Shows live counts** in the header — "N daily · N long-term · N completed" — computed with a single `useMemo`.
3. **Check-ins daily goals** with a single click, optimistically, with a correct optimistic rollback and a page-level error banner on failure.
4. **Drives non-daily progress with a range slider**, clamped to `[0, targetValue]`, showing the numeric pair, an animated bar, and either "N% complete" or "✓ Done!" with a colour flip at 100 %.
5. **Creates goals** with title, description, type, priority, target, unit, and a date window.
6. **Edits goals** including their **status** — the only place on the page any `GoalStatus` value is reachable.
7. **Deletes goals** behind a confirm dialog that names the goal.
8. **Animates** card entry, exit and layout changes with framer-motion (`layout` + `AnimatePresence`), so the grid reflows when a card leaves.
9. **Distinguishes checked daily goals visually** — a filled `CheckCircle2`, a struck-through title, and a muted fill.
10. **Exposes exactly 3 of the 6 `GoalStatus` values** through the tabs (the rest via the Edit modal's select) and 3 of the 8 `GoalPriority` values through the Add modal.
11. **Isolates per-card busy state** via a single `busyId`, so one check-in does not lock the page.
12. **Triggers achievement checks** on daily check-ins — the only page action that does.
13. **Renders four genuinely distinct empty states**, one per tab, with a CTA on the three that warrant one.

---

## 15. Currently NOT Supported

### 15.1 Dead components — 5 of the 8 files in `src/components/goals/`

| File                        | Physical | Role                                                       | Status |
| --------------------------- | -------- | ---------------------------------------------------------- | ------ |
| `GoalCard.tsx`              | 43       | `motion.div` card: title, `GoalPriorityBadge`, `GoalProgressBar`, due date via `date-fns`, `getProgressStatus` label | **DEAD — zero importers.** Shadowed by the private `GoalCard` at `page.tsx:26`. |
| `GoalPriorityBadge.tsx`     | 13       | `<span>` colour-coded LOW/MEDIUM/HIGH; unknown priority falls back to LOW | **DEAD** — only importer is the dead `GoalCard.tsx:6`. |
| `GoalHistory.tsx`           | 29       | Vertical timeline of `GoalProgress[]` (date, value, note) or "No progress history yet." | **DEAD — zero importers.** The reason `GET /api/goals/[id]/history` is orphaned. |
| `GoalProgressEditor.tsx`    | 29       | Number input + note input + Save/Cancel                     | **DEAD — zero importers.** |
| `CarryOverDialog.tsx`       | 21       | Fixed-overlay dialog with a New Deadline date input + Confirm/Cancel | **DEAD — zero importers.** The reason `POST /api/goals/[id]/carry-over` is orphaned. |

### 15.2 Live but not on this route

| File                    | Physical | Only importer |
| ----------------------- | -------- | ------------- |
| `GoalProgressBar.tsx`   | 28       | `app/(dashboard)/projects/[id]/page.tsx:13, :125` |

`/goals` **re-implements** the progress bar inline at `page.tsx:135`–`:142`.

### 15.3 Dead API routes — 7 resources, 13 endpoints

`POST /api/goals/[id]/progress` · `POST /api/goals/[id]/carry-over` · `GET /api/goals/[id]/history` · `GET`/`PUT /api/goals/[id]/tags` · `GET`/`POST /api/goals/[id]/milestones` · `POST /api/goals/bulk` · `GET /api/goals/[id]`.

Five of those seven validate with an **inline** schema in the route file rather than a shared module, and two use schemas from the **project** domain (`milestoneSchema` from `project.schema.ts:3`).

### 15.4 Dead service / repository methods

| Level      | Method                                             | Location                  | Note |
| ---------- | -------------------------------------------------- | ------------------------- | ---- |
| Service    | `GoalService.completeGoal`                         | `goal.service.ts:334`     | zero callers. Contains `// TODO: Trigger notification` at `:349`. |
| Service    | `GoalService.getGoalAnalytics`                     | `goal.service.ts:601`     | zero callers; **no route exists** for it. Returns 18 fields incl. `recentTrend`, `velocity`, `projectedCompletion`, `onTrack`. Its `GoalAnalytics` type (`types/goal.ts:239`) is also unreferenced. Mis-indented JSDoc at `:598`–`:600`. |
| Repository | `GoalRepository.updateMilestone`                    | `goal.repository.ts:479`  | **⚠ `where: { id }` — not user-scoped** |
| Repository | `GoalRepository.deleteMilestone`                    | `goal.repository.ts:496`  | **⚠ not user-scoped** |
| Repository | `GoalRepository.completeMilestone`                  | `goal.repository.ts:509`  | **⚠ not user-scoped** |
| Repository | `GoalRepository.getEndingSoon`                      | `goal.repository.ts:605`  | zero callers |
| Service    | `ProjectService.getProjectStats`                    | `project.service.ts:240`  | no route. Aggregates tasks/goals/milestones and calls `calculateGoalProgress('VALUE', current, target).percentage` from `domain/goal/goal-tracker.ts:87`. |
| Service    | `TaskService.getTaskStats`                          | `task.service.ts:337`     | no route |

The three milestone mutators are doubly dead **and** unsafe if ever wired up, because none scopes by `userId`.

### 15.5 Dead lib modules

**`src/lib/goals/` is 100 % dead** — all 11 exports across 5 files (see §7.3). Its only inbound edge is `GoalCard.tsx:3`, itself unimported. Two specific hazards:

- `carry-over.ts:10` `createCarryOverGoal` **contradicts** `GoalService.carryOverGoal` — it suffixes the title with " (Carried Over)" and sets the **new** goal to `ACTIVE`, whereas the service keeps the original title and marks the **original** `CARRIED_OVER`.
- `velocity.ts:3` re-declares an `interface GoalProgress` that **shadows** the Prisma model name and carries a non-existent `recordedAt` field.

Also dead: `resolve-routine.ts:164 findDayTypeDefinitionBySlug` · `:171 findTemplateByDayTypeId` · `:157 getDayTypeSlug` (internal only) · **all of `src/lib/scheduling/frequency.ts`** (71 lines).

### 15.6 Unused props and constants

| Item | Detail |
| ---- | ------ |
| `AddGoalModal.defaultType` | Typed against 4 of 6 `GoalType` values, and read from `useState` **only on first mount** — the modal is always mounted, so switching tabs never changes the preselected type. |
| `AddGoalModal` label | `'End Date (optional)'` for DAILY (`:149`) is **contradicted by the server** — see §24 F1. |
| `EditGoalModal.status` select | Reachable but never reflected in the UI: `page.tsx` never renders `goal.status`. |
| `EmptyState`'s object `action` form | `EmptyState.tsx:5, 15`–`:17, 44`–`:46` — the goals page passes a ReactNode instead (`:268`). |
| `Button.isLoading` → `Spinner` | Exists on every button this page renders and is **never used**. |
| `PRIORITY_COLORS` (`page.tsx:15`–`:24`) | `CRITICAL` and `HIGH` both → `'success'`; `NON_PROFIT` → `'default'`. Four of the eight keys are unreachable. |

### 15.7 Missing entirely

- **No `/goals/[id]` detail page** — and two notification systems link to one.
- **No progress history view**, despite `getHistory` + `GoalProgressHistory` UI existing as dead code.
- **No milestones UI**, despite the route, the service, the repository and the schema all being live.
- **No tag UI**, despite `PUT /api/goals/[id]/tags` and the `GoalTag` model.
- **No day-type UI** — unlike `/habits`, which has day-type chips on every row.
- **No project picker** — `Goal.project` exists, `ProjectService.getProjectStats` computes over it, and `/projects` renders linked goals, but `/goals` has no reference to `/projects`.
- **No sub-goal / hierarchy UI**, despite `GoalHierarchy` being a self-relation.
- **No archive control**, despite `archiveGoal` and `POST /api/bulk/archive`.
- **No carry-over UI**, despite the route, the service and the dialog.
- **No bulk operations UI**, despite `POST /api/goals/bulk`.
- **No search, no sort, no priority filter, no status filter, no project filter, no date filter** — 11 server-side query parameters exist and **none is ever sent**.
- **No undo** for delete.
- **No skeleton, no error surface, no `loading.tsx`, no `error.tsx`.**
- **No offline write path** for the slider or any modal — only `lib/offline/queue.ts` knows about `GOAL_PROGRESS`, and nothing on this page enqueues.
- **No tests.** Nothing in `tests/` covers goals, `GoalService`, `GoalRepository`, or any of the three components.

---

## 16. Loading / Error / Empty / Edge states

### 16.1 Loading

| State                | Trigger                        | Rendering |
| -------------------- | ------------------------------ | --------- |
| **Route loading**    | server→client navigation       | `src/app/(dashboard)/loading.tsx` (5 lines) → `<PageSkeleton />` |
| **In-page loading**  | —                              | **None exists.** The page reads neither `dataLoaded` nor `dataError`, so from first paint until the fetch resolves the user sees the **empty state** — "No daily goals" — for an account with 40 goals. |
| **Card action**      | `busyId === goal.id`            | Only the daily toggle is disabled (`:72`). **The Pencil and Trash buttons are never disabled**, so a double-click re-enters `handleDelete` / `setEditing` while a request is in flight. |
| **Modal submit**    | `submitting` / `saving`         | Footer button disabled + label swap. **`Button.isLoading` exists and is unused.** |
| **Slider**          | —                              | **No busy state at all** — dragging fires a `PATCH` on every `mouseup`/`touchend`. |

### 16.2 Error

| Error                    | Where set                                       | Surface |
| ------------------------ | ----------------------------------------------- | ------- |
| `dataError` (context)    | `AppContext.tsx:601`–`:605`                      | `DataErrorBanner` in the layout — **but the page ignores the field**, so the user also sees "No daily goals" |
| `error` (page)           | **only** `handleCheckin`'s catch `:197` and `handleDelete`'s catch `:213` | `<p role="alert" class="… text-destructive …">` at `:229`–`:233` |
| `sliderError`            | `onSliderCommit`'s catch                          | `<p role="alert">` inside the card at `:147` — **per card**, and **not** the page banner |
| `AddGoalModal.submitError` | its own catch                                   | `<p role="alert">` at `:151`–`:155` |
| `EditGoalModal.error`    | its own catch                                    | `<p role="alert">` |
| **A failed slider PATCH** | the card's own catch                            | ✅ surfaced, but the page's `error` banner stays empty, so the failure is easy to miss |
| **A failed Edit PATCH**   | `AppContext.updateGoal` — **no page-level catch** | ❌ **silent** |
| **A failed Add POST**      | `AddGoalModal.submitError`                      | ✅ |
| render crash              | any                                            | `src/app/(dashboard)/error.tsx` (97 lines). **No goals-specific `error.tsx`.** |

### 16.3 Empty

Four distinct empty states, one per tab, plus a CTA on the three that warrant one:

| Tab         | Title                 | Description | Action |
| ----------- | --------------------- | ----------- | ------ |
| `DAILY`     | "No daily goals"      | per-tab copy | "Add Goal" |
| `LONG_TERM` | "No long-term goals"  | per-tab copy | "Add Goal" |
| `COMPLETED` | "No completed goals"  | per-tab copy | **none** |

**What is not distinguished:** "you have no goals at all" vs "`GET /api/goals` failed" vs "the fetch is still in flight". All three render the identical empty state. Compare `/habits`, which uses `dataLoaded` to gate its empty state and `dataError` for a separate `EmptyState` branch.

### 16.4 Edge cases

| Edge case                                            | Handling |
| ---------------------------------------------------- | -------- |
| `targetValue === 0`                                  | `pct = 0` (`:45`), so an empty bar rather than the 100 % that `lib/goals/progress.ts:3` would produce. ⚠ A `Goal` with `targetValue: 0` is creatable — `createGoalSchema.targetValue` has no `.positive()`. |
| `unit` on a DAILY goal                              | never rendered |
| `checked` state after a server refresh              | `sliderValue` has **no `useEffect` re-sync** (`:42`), so a background refetch of `currentValue` does not move the thumb — the slider and the card can display different numbers. |
| `checkins` map after a reload                        | reset to `{}`; `checkedToday` falls back to `goal.currentValue >= 1` (`:47`) — but a checked daily goal has `status='COMPLETED'` and is therefore **in a different tab**. §25 |
| Rapid double-click on Trash                          | `handleDelete` clears `confirmDelete` synchronously (`:207`), so a second click has no target — but the Pencil/Trash buttons themselves are ungated. |
| Rapid double-click on the daily circle               | `disabled={busy}` on the button (`:72`) prevents it. ✅ |
| Two goals checked concurrently                       | **impossible** — `busyId` is a single id, so the second card's toggle is *enabled* but its check-in is refused only by luck of ordering; the first to resolve clears `busyId`. §24 F12 |
| `endDate` blanked in the Edit modal                  | `endDate: endDate \|\| goal.endDate` (`:67`) — **cannot be cleared** |
| `description` / `unit` blanked                        | correctly sent as `null` (`:59`–`:60`) ✅ |
| Slider `max={0}` (targetValue 0)                      | a range input with `max === min === 0`; browsers clamp to 0 |
| `status` set to `CANCELLED` then back to `ACTIVE`     | `archivedAt` is nulled (`:240`–`:245`) ✅ but **`completedAt` is never cleared** — §24 F3 |
| A goal with a task attached                           | **cannot be deleted** — P2003, surfaced only as an error banner. §24 F9 |

---

## 17. Authentication & security

| Concern                | Reality                                                                                                                        |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| Session enforcement    | Every one of the 5 endpoints performs `await auth()` and returns **401** with no session.                                          |
| Middleware gate        | `/goals` is inside the `(dashboard)` group; `src/proxy.ts` 307s unauthenticated requests to `/login?callbackUrl=…`.               |
| User identity          | **Never client-supplied.** `goalId` comes from the URL; every service method begins `goalRepository.findById(goalId, userId)` → `findFirst({where:{id, userId}})`. |
| Write scoping          | `goal.repository.ts` uses `where: { id, userId }` for `update` (`:196`), `delete` (`:214`) and `updateProgress` (`:227`) — Prisma's compound-unique trick, so a wrong-owner write throws rather than silently succeeding. |
| **Unscoped milestone writes** | `updateMilestone` (`:479`), `deleteMilestone` (`:496`) and `completeMilestone` (`:509`) use **`where: { id }` only**. All three are dead today, so there is no live exposure — but they are a trap for whoever wires up the (already-live) `GET`/`POST /api/goals/[id]/milestones`. |
| Input validation       | `createGoalSchema` (`goal.schema.ts:17`), `updateGoalSchema` (`:58`), `goalCheckinSchema` (`:71`) are shared modules ✅. **`GET /api/goals`, `DELETE /api/goals/[id]`, `GET /api/goals/today`, `GET /api/goals/[id]` have none.** Five more routes use inline schemas (see §5.6). |
| Unknown-key stripping | `updateGoalSchema = createGoalSchema.partial().extend({status})`. A plain `z.object` strips undeclared keys, so the service's `completedAt` branch (`:252`) is **unreachable**. §24 F4 |
| `PATCH` alias shape    | `[id]/route.ts:102`–`:108` destructures `params` then calls `PUT(request, { params: Promise.resolve({ id }) })`. ⚠ The promise is **never awaited**. Harmless today, but this is the exact pattern that broke 13 routes in this codebase (see `AGENTS.md`). |
| Error-type confusion   | 8 of 17 service methods throw typed `NotFoundError`/`ValidationError` → **404/400**. The other nine throw a bare `new Error('Goal not found')`, which the routes map to **400**. So `DELETE /api/goals/{bogus}` answers **400 "Goal not found"**. §24 F5 |
| XSS                    | No `dangerouslySetInnerHTML` anywhere in the page or the modals.                                                            |
| CSRF                   | Same-origin cookie JWT, `credentials:'include'`. **No CSRF token** — standard for Next.js + NextAuth-JWT, recorded for completeness. |
| Rate limiting          | **None.** No `withRateLimit` on any goal route.                                                                        |
| Audit trail            | ❌ **`deleteGoal` has `// TODO: Audit log`** (`:678`). `ProjectService` and `TaskService` **do** write audit rows for the same class of event. See §26. |
| Cross-enum audit actions | `TaskService.createTask` writes `'GOAL_CREATED'/'GOAL_UPDATED'/'GOAL_DELETED'` with `entityType:'TASK'` (`task.service.ts:94, 185, 263`), and `ProjectService` uses the same actions for `entityType:'PROJECT'`. §26 |
| a11y — daily toggle    | `aria-label="Mark <title> done|not done"`, `disabled={busy}`. ✅                                                              |
| a11y — tab strip       | `role="tablist" aria-label="Goal filter"` + `role="tab" aria-selected`. **⚠ No `tabpanel`, no `aria-controls`, no arrow-key handling** — the same ARIA-tabs-without-tabpanels anti-pattern as `/routine`. |
| a11y — **delete dialog** | ⚠ **`role="alertdialog"` and `aria-modal="true"` are declared, but nothing implements what the role promises**: no focus trap, no Escape handler, no initial focus, no focus restoration. The rest of the page uses the shared `Modal`, which provides all four (`Modal.tsx:63`–`:116`). The overlay is also rendered outside the `Modal` portal hierarchy. |
| a11y — card actions    | `title="Edit goal"` / `title="Delete goal"` only — **no `aria-label`** (unlike `/habits`, which labels every row button). |
| a11y — empty state     | `<EmptyState>` with an icon, title, description and a ReactNode action.                                                        |
| `tsconfig` strictness  | `strict`, `noUnusedLocals`, `noUnusedParameters`, `noUncheckedIndexedAccess` all on.                                            |
| Lint                   | `eslint .` with `next/core-web-vitals`, `next/typescript`, `prettier`.                                                         |

---

## 18. Performance

### 18.1 Request cost

| Metric                          | Value                                                                                        |
| ------------------------------- | -------------------------------------------------------------------------------------------- |
| Requests on first paint         | **3 + N** (N = habit pages)                                                                   |
| Requests the page reads         | **1** — `GET /api/goals`                                                                       |
| Requests loaded and discarded   | **2** — `/api/habits` and `/api/routine`                                                        |
| Requests per check-in            | **2** — the checkin POST **plus** a redundant `PATCH`                                           |
| Requests per slider release     | **1** `PATCH` — and one per `mouseup`/`touchend`; there is **no** debounce                    |
| Requests per filter / tab change | **0**                                                                                          |
| Pollers                         | **none**                                                                                       |

### 18.2 Render cost

- The `visible` partition is a single `useMemo` on `[goals, tab]` (`:165`–`:173`) — good.
- Every card is a framer-motion `layout` element (`:61`), so the grid is measured and animated on every tab change.
- `checkedToday` (`:47`) and `pct` (`:45`) are computed per card per render — trivial.
- `pct` uses `Math.min` without `Math.max(0, …)`; a negative `currentValue` (possible via `EditGoalModal`'s `currentValue` input) yields a negative width, which the DOM clamps.
- The `AnimatePresence` for the delete overlay is a **second** `AnimatePresence` on the page, independent of the grid's.

### 18.3 Query cost

- `GET /api/goals` returns **every** goal with `project(select)`, `tags{include tag(select)}`, `dayTypeAssignments{include dayType}`, `milestones(select id,completedAt)` and `_count{subGoals,milestones}` — **capped at 50**. Every widget reading `useApp().goals` inherits the cap.
- `GoalRepository.findWithRelations` (`:27`) — used by create, update, delete-adjacent, getTags and setTags — includes `progressLogs(orderBy date desc, **take 50**)` and `_count{…}`. **Every edit of a goal reads up to 50 progress rows to return a value the page does not use.**
- The redundant `PATCH` after each check-in re-runs the full `updateGoal` + `findWithRelations`, so a single click costs **2 writes + 2 full relation reads**.

### 18.4 Known waste

| # | Waste                                                                | Where |
| - | -------------------------------------------------------------------- | ----- |
| 1 | `/api/habits` + `/api/routine` fetched and discarded                  | `AppContext.tsx:546`, `:556`–`:586` |
| 2 | **A redundant `PATCH` after every check-in**                          | `page.tsx:190`–`:193` |
| 3 | `findWithRelations` reads 50 progress rows on every create/update      | `goal.repository.ts:27` |
| 4 | `meta.total` is the **page size**, not the real total                 | `goals/route.ts:38` |
| 5 | The slider fires a `PATCH` per `mouseup` with **no debounce**         | `page.tsx:130`, `:132` |
| 6 | `Button.isLoading` / `Spinner` unused on every button                 | `ui/Button.tsx:33, 42, 46` |
| 7 | The shared `GoalProgressBar` is bypassed for an inline re-implementation | `page.tsx:135`–`:142` vs `GoalProgressBar.tsx` |

---

## 19. External integrations

**None are triggered synchronously by this page**, with one indirect exception:

- **`runAchievementCheck()`** (`:194`) issues `POST /api/achievements/unlock`, which evaluates the user's world state and may create `Achievement` rows plus `NotificationLog` (`ACHIEVEMENT_UNLOCKED`) and `ActivityLog` rows. It is **fire-and-forget** (`void`) and fires **only on a daily check-in**.
- **No e-mail, no web push, no AI call, no calendar sync, no billing call.**
- `email.service.ts:383` renders a "View goal" link to `${APP_URL}/goals/${goal.id}` — but no e-mail is sent from this page, and that link 404s regardless. §12.2

---

## 20. Background jobs / cron effects

`/goals` has **no** cron-driven behaviour, but it reads and writes data other jobs read:

| Relationship | Detail |
| ------------ | ------ |
| `compute-daily-scores` cron | Writes `DailyScore` rows. **Goals do not enter the daily score** — `scoring.service.ts` reads `Habit`, `HabitLog`, `RoutineLog`, `SleepLog` and `UserSettings`. A goal can therefore never move the score, in either direction. |
| `automation.service.ts:355, :370` | Calls `GoalService.updateGoal` and `updateProgress` on automation triggers — **the one place a goal's progress changes without a user action.** |
| `template.service.ts:298, 309, 327` | Reads `findAll` and calls `create` — template instantiation creates goals outside any UI. |
| `ai/aggregator.ts:29` | Reads `GoalRepository.findAll` for AI insight generation. Note `generate-insights` is a stub returning `generated: 0`. |
| `recap.service.ts:236, :251`, `recap/weekly.ts:52`, `analytics/*` | All read goals, `GoalProgress` and completed `Milestone`s. |

**Net:** `/goals` writes goals and progress, and eleven other consumers read them. The page itself has no invalidation responsibility, and none of its writes trigger a refresh of those consumers.

---

## 21. Data flow diagrams

### 21.1 Page load

```
  Browser
    │
    ├─ root layout mounts AppProvider ─────────────────────────────────┐
    │   Promise.all:                                                  │
    │     ├─ loop: GET /api/habits?…      ← DISCARDED by /goals        │
    │     ├─ GET /api/routine              ← DISCARDED by /goals        │
    │     └─ GET /api/goals   (no params → limit=50, sortBy=endDate)   │
    │   → dataLoaded = true | dataError = <msg>                        │
    │   ⚠ the page reads neither flag                                   │
    │                                                                    │
    ├─ useUserTimezone() → today                                         │
    │                                                                    │
    └─ useMemo([goals, tab]) → visible / dailyGoals /                  │
                                longTermGoals / completedGoals           │
                                                                         
          render:  visible.length === 0 ? EmptyState (per tab)          │
                                        : grid of GoalCard              │
                 ⚠ during the fetch, goals === [] so the empty state shows
```

### 21.2 Daily check-in — two requests for one click

```
  click the circle (DAILY only)
    │
    ├─ setBusyId(goal.id); setError(null)
    ├─ setCheckins(prev => ({...prev, [id]: completed}))        OPTIMISTIC
    │
    ├─ POST /api/goals/{id}/checkin  {date: today, completed}
    │     ├─ auth()                          [id]/checkin/route.ts:18
    │     ├─ goalCheckinSchema.parse        goal.schema.ts:71
    │     └─ GoalService.checkInDaily       goal.service.ts:420
    │          1 findById → NotFoundError('Goal')                     :423
    │          2 type !== 'DAILY' → ValidationError                   :427
    │          3 value = completed ? 1 : 0                              :432
    │          4 addProgressLog({goal, value, note: 'daily-checkin:done'
    │                            | 'daily-checkin:cleared',
    │                            date: new Date(`${date}T00:00:00.000Z`)})   :435
    │             ⚠ goalProgress.create — NO @@unique([goalId, date])
    │          5 update(goalId, userId, {currentValue: value,
    │                                    status: COMPLETED | ACTIVE,
    │                                    completedAt: now | null})       :442
    │          6 returns the BARE Goal row
    │
    ├─ await updateGoal(goal.id, {currentValue: completed ? 1 : 0,
    │                              status: completed ? 'COMPLETED' : 'ACTIVE'})   :190
    │     └─ PATCH /api/goals/{id}  ◄── BOTH FIELDS WERE ALREADY WRITTEN
    │
    ├─ if (completed) void runAchievementCheck()                     :194
    │     └─ POST /api/achievements/unlock  (fire & forget)
    │
    └─ catch → revert checkins, setError      finally → setBusyId(null)      :197, :199
                                                                          │
      side effect: the tab partition now sees status==='COMPLETED' ◄────────┘
                   ⇒ the card leaves the Daily tab
```

### 21.3 Slider commit

```
  release the range input  (onMouseUp / onTouchEnd, NO debounce)
    │
    └─ onSliderCommit
         └─ AppContext.updateGoalProgress(goal.id, sliderValue)   AppContext:1108
              └─ PATCH /api/goals/{id} {currentValue}            :1112
                   └─ GoalService.updateGoal
                        NO addProgressLog  ◄── NO history is written
                        NO achievement check
                   ⇒ GoalProgress rows come ONLY from checkInDaily
                     and from TaskService.completeTask / updateTask
```

### 21.4 Delete

```
  Trash → overlay → Delete
    │
    └─ handleDelete                                page.tsx:203
         ├─ setConfirmDelete(null)
         ├─ AppContext.deleteGoal(id)              :1085  (fetchWithAuth)
         │    └─ DELETE /api/goals/{id}
         │         ├─ auth()                        [id]/route.ts:77
         │         ├─ NO Zod validation
         │         └─ GoalService.deleteGoal        goal.service.ts:670
         │              1 findById → Error('Goal not found')     :672  → HTTP 400
         │              2 delete(goalId, userId)                 :676
         │                 └─ goal.delete({where:{id, userId}})
         │                    ⚠ P2003 if any Task.goalId === id
         │                       (no onDelete, no pre-check, no null-out)
         │                    cascades: GoalProgress, Milestone,
         │                                 GoalTag, GoalDayType
         │              3 // TODO: Audit log                       :678
         │              4 returns void
         ├─ remove the row from AppContext.goals   :210  (optimistic)
         └─ catch → setError                       :213
```

---

## 22. File-by-file dependency inventory

Physical line counts. Paths relative to the repo root.

### 22.1 Route files — `src/app/(dashboard)/goals/`

| File      | Physical | Non-blank | Directive     | Export                                  |
| --------- | -------- | --------- | ------------- | --------------------------------------- |
| `page.tsx` | **328** | 309       | `'use client'` | `default function GoalsPage()` `:154` — **the only export** |

File-level declarations: `:13` `type TabType = 'DAILY' | 'LONG_TERM' | 'COMPLETED'` (not exported) · `:15`–`:24` `PRIORITY_COLORS: Record<Goal['priority'], …>` (not exported) · `:26`–`:152` `function GoalCard({…})` — **a local, file-private component**.

That is the entire directory. Inherited from the group: `layout.tsx` (69), `loading.tsx` (5), `error.tsx` (97).

### 22.2 Components — `src/components/goals/` (8 files, 5 dead)

| File                     | Physical | Directive | Live? | Reached from |
| ------------------------ | -------- | --------- | ----- | ------------- |
| `AddGoalModal.tsx`       | 170      | `'use client'` | ✅ | `page.tsx:6, :292` |
| `EditGoalModal.tsx`      | 127      | `'use client'` | ✅ | `page.tsx:7, :293` |
| `GoalProgressBar.tsx`    | 28       | `'use client'` | ✅ but not here | **only** `app/(dashboard)/projects/[id]/page.tsx:13, :125` |
| `GoalCard.tsx`           | 43       | `'use client'` | ❌ | **nothing** — shadowed by `page.tsx:26` |
| `GoalHistory.tsx`        | 29       | `'use client'` | ❌ | **nothing** |
| `GoalProgressEditor.tsx` | 29       | `'use client'` | ❌ | **nothing** |
| `CarryOverDialog.tsx`    | 21       | `'use client'` | ❌ | **nothing** |
| `GoalPriorityBadge.tsx`  | 13       | **none** (server-compatible) | ❌ | only the dead `GoalCard.tsx:6` |

### 22.3 UI primitives (all via the barrel `src/components/ui/index.tsx`, 26 lines)

| Component    | File                   | Lines | Directive | Note |
| ------------ | ---------------------- | ----- | --------- | ---- |
| `Button`     | `ui/Button.tsx:36`     | 52    | `'use client'` | `isLoading` → `Spinner`, **never used** |
| `Badge`      | `ui/Badge.tsx:22`      | 24    | **none**  | the only server-compatible primitive on this route |
| `EmptyState` | `ui/EmptyState.tsx:19` | 52    | **none**  | |
| `Modal`      | `ui/Modal.tsx:24`      | 166   | `'use client'` | portal + focus trap + Esc + focus restore + scroll lock |
| `Input`      | `ui/Input.tsx:33`      | 98    | `'use client'` | |
| `Select`     | `ui/Select.tsx:20`     | 55    | `'use client'` | |
| `Textarea`   | `ui/Textarea.tsx:18`   | 50    | `'use client'` | |
| `Spinner`    | `ui/Spinner.tsx:1`     | 14    | **none**  | via `Button` only |

**Barrel cost:** `export *` from `index.tsx` also drags `@radix-ui/react-dialog` (`ui/Dialog.tsx:8`), `@radix-ui/react-tooltip` (`ui/Tooltip.tsx:14`) and `RichTextEditor` into the `/goals` chunk, though none is rendered here.

### 22.4 Client-side lib / hook / store / context

| File                            | Physical | Role on `/goals` |
| ------------------------------- | -------- | ---------------- |
| `src/context/AppContext.tsx`     | 1168     | `goals`, `deleteGoal` `:1085`, `updateGoal` `:1061`, `updateGoalProgress` `:1108`, `addGoal` `:1025` |
| `src/context/useApp.ts`          | 16       | `useApp()` |
| `src/hooks/useUserTimezone.ts`   | 45       | `{timezone, today}` at `:156` |
| `src/hooks/useSettings.ts`       | 71       | indirect |
| `src/store/achievement.store.ts` | 102      | `runAchievementCheck()` `:90`, called at `:194` |
| `src/store/settings.store.ts`    | 174      | indirect; deduped by `loadInflight` `:75` |
| `src/lib/api-client.ts`          | 131      | `fetchWithAuth` — **does not throw on `!ok`** |
| `src/lib/offline/queue.ts`       | –        | **not used here**, but it is the only caller of `POST /api/goals/[id]/progress` (`:90`) |

### 22.5 Server-side files reached

| File                                        | Physical | Reached via |
| ------------------------------------------- | -------- | ----------- |
| `src/app/api/goals/route.ts`                | –        | GET, POST |
| `src/app/api/goals/[id]/route.ts`           | 108      | PUT/PATCH, DELETE |
| `src/app/api/goals/[id]/checkin/route.ts`   | –        | POST |
| `src/server/services/goal.service.ts`       | **700**  | 15 of 17 exported methods reachable; **2 dead** |
| `src/server/repositories/goal.repository.ts` | **625**  | 22 of 26 methods; **4 dead** |
| `src/server/repositories/base.repository.ts` | 122      | `buildPaginationQuery` (caps `take` at 100), `buildOrderQuery`, `handleError` |
| `src/server/repositories/routine.repository.ts` | 965   | `findException`, `findDayTypeDefinitionById`, `findDayTypeDefinitionBySlug` — via `resolveDayTypeForDate` |
| `src/server/repositories/project.repository.ts` | 363   | `findById`, `getGoals` — only via `getProjectGoals`/`attachToProject`, which are **not** reached from `/goals` |
| `src/server/repositories/user.repository.ts` | 523      | `getSettings` (via `/api/goals/today`, which this page does not call) |
| `src/schemas/goal.schema.ts`                | –        | `createGoalSchema` `:17`, `updateGoalSchema` `:58`, `goalCheckinSchema` `:71`, `GoalCheckinInput` `:83` |
| `src/schemas/project.schema.ts`             | –        | `milestoneSchema` `:3` (used by `/api/goals/[id]/milestones`, which this page does not call) |
| `src/lib/scheduling/resolve-routine.ts`     | 173      | `resolveDayTypeForDate` `:122` — **not reached from `/goals`** (only from `/api/goals/today`) |
| `src/lib/errors/app-error.ts`               | 104      | `NotFoundError` `:72`, `ValidationError` `:48` |
| `prisma/schema.prisma`                      | 2466     | 6 models + 7 enums |

### 22.6 Prisma enums

```prisma
enum GoalType {      // :119–125
  DAILY WEEKLY MONTHLY QUARTERLY YEARLY CUSTOM
}
enum GoalPriority {  // :128–136  — 8 values
  LOW MEDIUM HIGH CRITICAL PERSONAL ACADEMIC NON_PROFIT PROFESSIONAL
}
enum GoalStatus {    // :139–147  (note a stray blank line at :145)
  ACTIVE COMPLETED MISSED CARRIED_OVER ON_HOLD CANCELLED
}
enum ProjectStatus { // :149–157
  PLANNING ACTIVE ON_HOLD COMPLETED ARCHIVED CANCELLED
}
enum TaskStatus {    // :159–165
  TODO IN_PROGRESS WAITING COMPLETED CANCELLED
}
enum TaskPriority {  // :167–176  — 9 values
  LOW MEDIUM HIGH URGENT CRITICAL PERSONAL ACADEMIC NON_PROFIT PROFESSIONAL
}
enum DayType {       // :52–59
  WORKDAY WEEKEND HOLIDAY EXAM_DAY LOW_ENERGY CUSTOM
}
```

`updateGoalSchema` (`goal.schema.ts:59`–`:61`) lists exactly `['ACTIVE','COMPLETED','MISSED','CARRIED_OVER','ON_HOLD','CANCELLED']` — matching `GoalStatus`.

⚠ `Project.priority` **reuses `GoalPriority`** (`schema.prisma:1103`), so the same 8-value enum spans two domains with the same 4-of-8 unreachable problem.

### 22.7 Key Prisma model shapes

```prisma
model Goal {                                        // :1139–1190
  id     String @id @default(cuid())
  userId String
  user   User   @relation(fields:[userId], references:[id], onDelete: Cascade)

  projectId String?
  project   Project? @relation(fields:[projectId], references:[id], onDelete: SetNull)

  type     GoalType
  priority GoalPriority @default(MEDIUM)
  status   GoalStatus   @default(ACTIVE)
  title    String
  description String? @db.Text

  targetValue  Float
  currentValue Float   @default(0)
  unit         String?

  startDate   DateTime      // NON-NULL
  endDate     DateTime      // NON-NULL
  completedAt DateTime?
  archivedAt  DateTime?

  parentGoalId    String?
  parentGoal      Goal?   @relation("GoalHierarchy", …, onDelete: SetNull)
  subGoals        Goal[]  @relation("GoalHierarchy")
  carriedOverFrom String?          // plain String — NOT a self-FK

  isPublic        Boolean @default(false)
  appliesEveryDay Boolean @default(true)

  dayTypeAssignments GoalDayType[]
  milestones    Milestone[]
  progressLogs  GoalProgress[]
  tags          GoalTag[]
  timeEntries   TimeEntry[]
  tasks         Task[]               // ⚠ NO onDelete — see §24 F9
  createdAt / updatedAt

  @@index([userId, status, endDate])  @@index([projectId])
  @@index([status, priority])          @@index([userId, createdAt])
}

model GoalProgress {                                 // :1214–1226
  id     String @id @default(cuid())
  goalId String
  goal   Goal   @relation(fields:[goalId], references:[id], onDelete: Cascade)

  value Float
  date  DateTime @default(now())
  note  String?  @db.Text
  createdAt DateTime @default(now())

  @@index([goalId, date])
  // ⚠ NO @@unique([goalId, date]) → repeated same-day check-ins insert duplicates
}

model GoalDayType {                                 // :2397–2411
  id       String @id @default(cuid())
  goalId   String ; goal   Goal             @relation(Cascade)
  dayTypeId String ; dayType DayTypeDefinition @relation(Cascade)
  userId   String ; user   User             @relation(Cascade)  // DENORMALISED
  createdAt DateTime @default(now())
  @@unique([goalId, dayTypeId])  @@index([dayTypeId])  @@index([userId])
}
```

⚠ `GoalDayType.userId` is **denormalised** and written **only** by `GoalRepository.addDayTypeAssignments` (`goal.repository.ts:388`). It is never back-filled and never verified on read.

```prisma
model Milestone {                                    // :1192–1212
  id     String @id @default(cuid())
  goalId String ; goal Goal @relation(..., onDelete: Cascade)
  title  String
  description String? @db.Text
  targetValue  Float?
  dueDate      DateTime?
  completedAt  DateTime?
  sortOrder    Int @default(0)
  createdAt / updatedAt
}

model Project {                                     // :1103–1137
  id     String @id @default(cuid())
  userId String ; user User @relation(Cascade)
  name   String
  description String? @db.Text
  status   ProjectStatus @default(ACTIVE)
  priority GoalPriority  @default(MEDIUM)      // ◄── reuses the GOAL enum
  categoryId String? ; category Category? @relation(SetNull)
  color String? ; icon String?
  startDate DateTime? ; endDate DateTime?
  completedAt DateTime? ; archivedAt DateTime?
  progress Float @default(0)                    // 0-100
  goals Goal[] ; tasks Task[] ; timeEntries TimeEntry[]
  createdAt / updatedAt
}

model Task {                                        // :1232–1278
  id     String @id @default(cuid())
  userId String ; user User @relation(Cascade)
  title  String
  description String? @db.Text
  status   TaskStatus   @default(TODO)
  priority TaskPriority @default(MEDIUM)
  projectId String? ; project Project? @relation(…)   // ⚠ NO onDelete → Restrict
  goalId    String? ; goal    Goal?    @relation(…)   // ⚠ NO onDelete → Restrict
  parentTaskId String? ; parentTask Task? @relation("TaskSubtasks")
  subtasks     Task[]     @relation("TaskSubtasks")
  dueDate DateTime? ; scheduledFor DateTime?
  estimatedMinutes Int? ; actualMinutes Int?
  isUrgent Boolean @default(false) ; isImportant Boolean @default(false)
  dependsOn TaskDependency[] @relation("TaskDependencies")
  blocks     TaskDependency[] @relation("TaskBlocks")
  completedAt DateTime?
  tags TaskTag[]
  createdAt / updatedAt
}
```

---

## 23. Current behavior summary

### 23.1 What actually happens, end to end

1. The root layout's `AppProvider` fetches habits, routines and goals. `/goals` reads exactly one of the three.
2. Because the page reads neither `dataLoaded` nor `dataError`, **the first paint and a failed load both render the empty state**.
3. Goals are partitioned by `type` and `status` in a single `useMemo`, and rendered as motion-layout cards in a 1/2/3-column grid.
4. A `DAILY` goal gets a circle and nothing else — no target, no unit, no progress bar.
5. Checking that circle costs **two HTTP requests**, writes a `GoalProgress` row with a machine-generated note, sets the goal to `COMPLETED`, fires an achievement check, and then **removes the card from the tab the user is looking at**.
6. Dragging a non-daily slider writes `currentValue` with **no progress history and no achievement check**, one request per mouse-up with no debounce.
7. Editing a goal reads up to 50 progress rows to return a payload the page ignores.
8. Deleting a goal destroys it, its history, its milestones and its tags, writes **no audit row**, and **fails outright** if any task is attached — with an error banner as the only explanation.
9. Four of eight priorities, two of six types, milestones, tags, day-types, projects and sub-goals are all unreachable through the UI.

### 23.2 The shape of the page in one line each

| Dimension            | Reality |
| -------------------- | ------- |
| Rendering strategy   | fully client-side; **no server component, no server fetch, no streamed data** |
| Data ownership       | `AppContext` only — the page issues **zero** requests of its own |
| Data size            | capped at **50 goals** with no pagination UI and no `includeArchived` equivalent |
| Filtering            | 1 dimension (a 3-way tab), in memory. **11 server-side query parameters exist; none is sent.** |
| Writes               | 4 endpoints; the daily check-in costs 2 requests |
| Real-time            | none — no polling, no websocket |
| Offline              | **none.** `AppContext`'s goal mutators use plain `fetch`; only `lib/offline/queue.ts` knows about `GOAL_PROGRESS`, and nothing here enqueues. |
| Date control         | none; `today` is used only as the check-in date |
| Persisted state      | **zero.** `tab`, `checkins`, `editing` and `confirmDelete` are all discarded on navigation. |
| Accessibility        | reasonable on the toggle and tabs; **ARIA tabs without tabpanels**; **the delete dialog declares `role="alertdialog"` and implements none of its promise** |
| Internationalisation | none — all copy is hard-coded English literals |
| Tests                | **none.** `tests/` contains only `lib/routine-duration.test.ts` and `domain/score-calculator.test.ts`. |

---

## 24. Findings register

**The 2026-09-30 audit pass changed no code.** This table is the pre-remediation register; **§28.8 maps every finding below to its current status.** Severity: **H** = wrong behaviour or a dead feature a user can notice · **M** = wasted work or an internal inconsistency · **L** = cosmetic or hygiene.

| #  | Sev | Finding                                                                                                                | Location                                              | Impact                                                                                                  | Suggested fix |
| -- | --- | ---------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------- | --------------------------------------------------------------------------------------------------------- | ------------- |
| F1  | **H** | **A DAILY goal cannot be created without an explicit end date.** `AddGoalModal:65` sends `endDate: endDate \|\| startDate` when the field is blank; `createGoalSchema.endDate` (`:39`) coerces it to the **same instant**; `createGoal` then throws `'End date must be after start date'` (`:166`), returned as **400**. The field is labelled **"End Date (optional)"** at `:149`, and `validate()` deliberately skips the end-date check for DAILY at `:36`–`:41`. | `AddGoalModal.tsx:36–41, 65, 149`; `goal.service.ts:166`; `goals/route.ts:82` | A user following the UI literally cannot create a daily goal. The error text contradicts the label. | Send `endDate = startDate + 1 day` for DAILY, or make the server's default (`startDate + 365d`, `:162`) the client's default too. |
| F2  | **H** | **A checked daily goal immediately vanishes from the Daily tab and cannot be un-checked from `/goals`.** `checkInDaily` sets `status = 'COMPLETED'`; the tab partition's `done()` puts `COMPLETED` into `completedGoals`. The circle the user just clicked is unreachable. See §25. | `page.tsx:165–173`; `goal.service.ts:444`; `AddGoalModal:68` | The primary interaction on the page is a one-way door. | Exclude `COMPLETED` **daily** goals from the Completed tab, or keep checked daily goals in the Daily tab with an un-check affordance. |
| F3  | **H** | **The slider writes no progress history.** `AppContext.updateGoalProgress` PATCHes `{currentValue}` → `GoalService.updateGoal`, which has **no** `addProgressLog` call. `POST /api/goals/[id]/progress` — the only auto-completing path — is reached **only** by offline replay. | `AppContext.tsx:1108–1112`; `goal.service.ts:225–288`; `queue.ts:90` | `GoalProgress` only ever comes from `checkInDaily` and task completion. Velocity and analytics (`analytics/weekly.ts:124`) therefore never see manual progress. | Route the slider through `POST /api/goals/[id]/progress`, or add an explicit `logProgress` flag to `updateGoal`. |
| F4  | **H** | **`completedAt` is unreachable through the API.** `GoalService.updateGoal` reads `input.completedAt` (`:252`), but `updateGoalSchema = createGoalSchema.partial().extend({status})` declares **no** `completedAt`, and a plain `z.object` strips unknown keys. | `goal.service.ts:252`; `goal.schema.ts:58` | The Edit modal's "Completed" sets `status = COMPLETED` with `completedAt = null`. `isOverdue` (`:651`) then reads the row as complete. | Declare `completedAt` `.nullable()` in `updateGoalSchema`, or derive it from `status` inside the service. |
| F5  | **H** | **A goal with a task attached cannot be deleted.** `Task.goalId` has **no `onDelete`**, so `goal.delete` fails with **P2003**. Neither the service nor the route pre-checks or nulls out `Task.goalId`. | `schema.prisma:1232–1278`; `goal.repository.ts:216`; `goal.service.ts:676` | A destructive action fails with an opaque error banner. | Add `onDelete: SetNull` to `Task.goal`, or null out `Task.goalId` inside `deleteGoal`'s transaction. |
| F6  | **M** | **`checkInDaily` returns the bare row**, and `handleCheckin` immediately issues a **second `PATCH`** to resync — a redundant write whose only purpose is the return shape. | `goal.service.ts:442`; `page.tsx:190–193` | **2 writes + 2 full relation reads per click.** | Return `findWithRelations(goal.id)` from `checkInDaily`, as `createGoal` and `updateGoal` both already do. |
| F7  | **M** | **`AppContext.addGoal` builds an explicit allow-list body** that omits `isPublic`, `tagIds`, `milestones`, `appliesEveryDay`, `dayTypeIds`, `projectId` and `parentGoalId` — all accepted by `createGoalSchema`. | `AppContext.tsx:1028–1038`; `goal.schema.ts:17` | **`Milestone` rows can never be created from any client.** `/projects` cannot be linked. Day-type and tag gating is impossible. | Forward the full input, or narrow `createGoalSchema` to match. |
| F8  | **M** | **`CRITICAL` and `HIGH` both map to the same `'success'` badge**, and 4 of 8 priorities are uncreatable via the UI. `AddGoalModal` offers 3, `EditGoalModal` 4. `NON_PROFIT` maps to `'default'`. | `page.tsx:15–24`; `AddGoalModal:112–116`; `EditGoalModal:92` | Two distinct priorities are indistinguishable; four are unreachable. | Give each priority its own variant, or reduce the enum. |
| F9  | **M** | **Every goal query is capped at 50 rows and silently truncated.** `goals/route.ts:30` defaults `limit` to 50; `AppContext.tsx:547` sends no params; `meta.total` is set to `goals.length` — the **page size**, not the real total. There is **no `includeArchived` equivalent** for goals. | `goals/route.ts:30, 38`; `AppContext.tsx:547` | Past 50 goals, every widget and page reading `useApp().goals` is wrong, with no signal. Archived goals are never listable at all. | Paginate in `AppContext` (as it already does for habits) and fix `meta.total`. |
| F10 | **M** | **The page ignores `dataLoaded` and `dataError`.** `AppContext.fetchAll` sets both; `page.tsx:155` destructures only `{goals, deleteGoal, updateGoal}`. | `page.tsx:155`; `AppContext.tsx:600–605` | A failed or in-flight load renders **"No daily goals"** — identical to an empty account. `MetricsRow.tsx:272–274` documents having fixed exactly this for its own card. | Read both flags; gate the empty state on `dataLoaded` and add an `EmptyState` error branch. |
| F11 | **M** | **`AddGoalModal.defaultType` is read only on first mount** (`useState<GoalType>(defaultType)` at `:23`), and the modal is mounted unconditionally at `page.tsx:292`. | `AddGoalModal.tsx:23`; `page.tsx:292` | Switching to the Daily tab and clicking "Add goal" still pre-selects `WEEKLY`. | Re-sync on `open`, or key the modal on `defaultType`. |
| F12 | **M** | **`busyId` is a single id**, and the Pencil/Trash buttons are **never** gated on it. | `page.tsx:98, 106, 162` | Two cards can be acted on concurrently; `busyId` clears as soon as the first resolves, un-gating the second mid-flight. | Use a `Set<string>`, or disable all row actions while any request is in flight. |
| F13 | **M** | **The delete dialog declares `role="alertdialog"` + `aria-modal="true"` and implements none of it** — no focus trap, no Escape, no initial focus, no focus restoration — while the rest of the page uses the shared `Modal`, which provides all four. It is also rendered outside the `Modal` portal hierarchy. | `page.tsx:295–325`; `Modal.tsx:63–116` | Keyboard users cannot close it; focus escapes into the page behind it. | Replace with the shared `Modal`. |
| F14 | **M** | **Error types are inconsistent across 17 service methods.** 8 throw typed `NotFoundError`/`ValidationError` → 404/400. Nine throw a bare `new Error('Goal not found')`, which routes map to **400**. So `DELETE /api/goals/{bogus}` answers **400 "Goal not found"**. | `goal.service.ts:228, 297, 363, 405, 675` vs `:423, 455, 473, 503, 519, 549, 567, 583` | Wrong status codes; clients cannot distinguish "not found" from "bad request". | Use `NotFoundError` everywhere and centralise the mapping. |
| F15 | **M** | **`archivedAt` and `completedAt` can disagree.** `updateGoal` nulls `archivedAt` when `status !== 'CANCELLED'` (`:243`–`:245`) but **never nulls `completedAt`** when `status !== 'COMPLETED'`. | `goal.service.ts:243–245, 252` | A goal moved back to `ACTIVE` still carries a `completedAt`. | Clear both fields symmetrically in the same spread. |
| F16 | **M** | **Additive vs absolute semantics mismatch.** `GoalService.updateProgress` treats `value` as a **delta** (`:311`) — correct for `task.service.ts:197, :223` and `automation.service.ts:370`. The `/goals` range slider emits an **absolute** value (`:52`, `:125`–`:127`), and the offline payloads are typed `any`. | `goal.service.ts:311`; `page.tsx:52, 125–127` | A latent compounding bug: if the slider were ever pointed at `/progress`, every drag would add to the previous value. | Make the delta/absolute distinction explicit in the API (e.g. `{value, mode}`). |
| F17 | **M** | **The end date cannot be cleared** in the Edit modal: `endDate: endDate \|\| goal.endDate` (`:67`). | `EditGoalModal.tsx:67` | Unlike `description` and `unit` — which are correctly sent as `null` at `:59`–`:60` — a cleared date silently reverts. | Send `null` and declare `endDate` nullable, or remove the affordance. |
| F18 | **M** | **A day-type-restricted goal appears on `/goals` on days it should not**, because the page calls bare `GET /api/goals` and never `GET /api/goals/today` (the only endpoint that resolves the day type). | `page.tsx:155`; `goals/today/route.ts:33` | The list and `/today`'s `TodayGoals` disagree, with no explanation. | Either add day-type chips (as `/habits` does) or note in the UI that `/goals` is not day-scoped. |
| F19 | **M** | **`reset()` on Add-modal success clears only 4 of 11 fields.** `type`, `priority`, `startDate`, `endDate` and `submitError` persist into the next open. | `AddGoalModal.tsx:68` | A stale error message and a stale date can silently apply to the next goal. | Clear every field, or reset on open. |
| F20 | **M** | **Cross-enum audit actions.** `TaskService.createTask` writes `'GOAL_CREATED'/'GOAL_UPDATED'/'GOAL_DELETED'` with `entityType:'TASK'` (`task.service.ts:94, 185, 263`); `ProjectService` uses the same actions for `entityType:'PROJECT'` (`project.service.ts:56, 127, 146, 165`). See §26. | three service files | Any goal-completion analytics filtered on `AuditAction` **over-counts by 3×**. | Add `TASK_*` / `PROJECT_*` audit actions. |
| F21 | **M** | **`GoalProgress` has no `@@unique([goalId, date])`** and `addProgressLog` is a `create`, so repeated same-day check-ins insert multiple rows. | `schema.prisma:1214–1226`; `goal.repository.ts:266`; `goal.service.ts:435` | `sum(GoalProgress.value)` diverges from `Goal.currentValue`. | Add the unique constraint and upsert, as `HabitLog` already does. |
| F22 | **M** | **The tab strip has `role="tablist"`/`role="tab"` but no `tabpanel`, no `aria-controls` and no arrow-key handling** — the same anti-pattern as `/routine`. | `page.tsx:235, 241–251` | Screen readers get tabs controlling nothing; keyboard users cannot switch tabs. | Add `id`/`aria-controls`, a `tabpanel`, and roving `tabIndex`. |
| F23 | **M** | **No achievement check on slider, edit or delete** — only on check-in. | `page.tsx:194` | Completing a goal by dragging to 100 % unlocks nothing. | Fire `runAchievementCheck()` after any write that can change `currentValue` or `status`. |
| F24 | **M** | **`GoalDayType.userId` is denormalised**, written only by `addDayTypeAssignments` (`:388`) and never back-filled or verified on read. | `schema.prisma:2397–2411`; `goal.repository.ts:388` | A latent cross-user integrity hole in a security-adjacent column. | Verify ownership in `addDayTypeAssignments`, or drop the column. |
| F25 | **L** | **`createGoalSchema.targetValue` has no `.positive()`**, so a goal with `targetValue: 0` is creatable. `pct` then renders an empty bar (`:45`), while `lib/goals/progress.ts:3` would report **100 %**. | `goal.schema.ts:17`; `page.tsx:45` | Two implementations of the same calculation disagree on the zero case. | Add `.positive()` and delete the duplicate helper. |
| F26 | **L** | **`Button.isLoading` → `Spinner` is unused on every button this page renders.** | `ui/Button.tsx:33, 42, 46` | Duplicated label-swap logic; the spinner affordance is dead. | Use `isLoading`. |
| F27 | **L** | **`EmptyState`'s object `action` form is unused** — the goals page passes a ReactNode instead. | `EmptyState.tsx:5, 15–17, 44–46`; `page.tsx:268` | — | — |
| F28 | **L** | **`AddGoalModal` offers 4 of 6 `GoalType` values**; `QUARTERLY` and `CUSTOM` are uncreatable. Its `defaultType` prop is typed against only those 4 while the inner union has 6. | `AddGoalModal.tsx:14, 16, 101–106` | Two of six goal types are unreachable. | Offer all six, or drop them from the enum. |
| F29 | **L** | **The shared `GoalProgressBar` is bypassed** for an inline re-implementation at `page.tsx:135`–`:142`. | `GoalProgressBar.tsx`; `page.tsx:135–142` | Two progress-bar implementations; the shared one is used only on `/projects`. | Import the shared component. |
| F30 | **L** | **Card actions have `title` but no `aria-label`** — unlike `/habits`, which labels every row button. | `page.tsx:96–111` | Weak accessible names on 2 buttons per card. | Add `aria-label={`Edit ${goal.title}`}`. |
| F31 | **L** | **Formatting fingerprints:** `getProgressHistory`'s body is indented at **column 0** (`goal.repository.ts:279`–`:298`), and `getGoalAnalytics`'s JSDoc is indented 5 spaces (`goal.service.ts:598`–`:600`). | two files | Suggests hand-edits in otherwise uniformly formatted code. | Reformat. |
| F32 | **L** | **Two `TODO` markers** — `goal.service.ts:349` (`// TODO: Trigger notification`, inside the dead `completeGoal`) and `:678` (`// TODO: Audit log`, inside the **live** `deleteGoal`). No `FIXME`, `XXX` or `HACK` anywhere in the goals path. | `goal.service.ts:349, 678` | One of the two is on a live destructive path. | Write the audit row. |
| F33 | **L** | **Zero `localStorage` / `sessionStorage` / `persist` usage** anywhere in `app/(dashboard)/goals/**` or `components/goals/**` — verified. Every piece of state is discarded on navigation. | both trees | The tab always resets to `DAILY`. | Persist the tab if desired. |
| F34 | **L** | **Zero tests.** Nothing in `tests/` covers goals, `GoalService`, `GoalRepository`, or any of the three components. | `tests/**` | The whole domain is untested. | Add service-level tests with mocked repositories (the pattern `tests/domain/score-calculator.test.ts` already uses). |

---

## 25. The daily-goal check-in trap

The single most consequential behavioural finding on the page, isolated here because it is the primary user flow.

### 25.1 The mechanism

```
GoalService.checkInDaily                       goal.service.ts:420–450
  value = completed ? 1 : 0                     :432
  addProgressLog({...})                         :435–440
  update(goalId, userId, {
    currentValue: value,                        :443
    status:      completed ? 'COMPLETED' : 'ACTIVE',   :444   ◄── THE CULPRIT
    completedAt: completed ? new Date() : null }) :445
```

```
page.tsx:165–173 — the tab partition
  dailyGoals      = goals.filter(g => g.type === 'DAILY' && g.status !== 'COMPLETED')
  completedGoals  = goals.filter(g => g.status === 'COMPLETED')
```

So a single click:

1. Writes a `GoalProgress` row with `note: 'daily-checkin:done'` ✅ — that part is right.
2. Sets `currentValue = 1`, `status = 'COMPLETED'`, `completedAt = now`.
3. Fires a **redundant** `PATCH` repeating `currentValue` and `status` (`page.tsx:190`–`:193`).
4. Fires `runAchievementCheck()` ✅ — the only achievement check on the page.
5. **The card moves out of the Daily tab.** The circle the user just clicked is gone.
6. `checkins[goal.id]` is still `true` in memory, but nothing renders it any more.

### 25.2 What the user is left with

| They want to…                       | Only possible via |
| ----------------------------------- | ----------------- |
| Un-check the goal                   | `/today`'s `TodayGoals` un-check affordance, **or** the Edit modal's Status select set back to `ACTIVE` |
| See which daily goals are done today | `/today` only |
| Get to the card again from `/goals` | The **Completed** tab — where it sits among long-term completed goals with no indication that it is daily |

### 25.3 Three compounding factors

1. **`checkins` is never hydrated.** `page.tsx:163` initialises `{}` and nothing ever loads it from the server. So even if a completed daily goal *were* rendered in the Daily tab, `checkedToday` would fall back to `goal.currentValue >= 1` (`:47`) — which happens to be correct here, but only by accident.
2. **`completedAt` cannot be cleared**, because `updateGoalSchema` strips it (§24 F4). Moving the status back to `ACTIVE` leaves `completedAt` set, which `isOverdue` (`:651`) reads as complete.
3. **`AddGoalModal`'s `reset()`** does not reset `type`, so the modal re-opens with whatever type was last chosen — including `DAILY` after a daily check-in created one. Minor, but it compounds the confusion.

### 25.4 Suggested fixes, cheapest first

| # | Fix | Cost | Effect |
| - | --- | ---- | ------ |
| 1 | Exclude `type === 'DAILY'` goals from the Completed tab: `completedGoals = goals.filter(g => g.status === 'COMPLETED' && g.type !== 'DAILY')` | 1 line | A checked daily goal stays in the Daily tab with its circle filled. |
| 2 | Hydrate `checkins` from `GET /api/goals/today` (which already returns `loggedToday`) | small | The circle reflects reality after a reload. |
| 3 | Make `checkInDaily` return `findWithRelations(goal.id)` | 1 line | Removes the redundant PATCH and §24 F6. |
| 4 | Add `completedAt` to `updateGoalSchema` as nullable | 1 line | Fixes §24 F4 and un-blocking. |

---

## 26. Cross-enum audit-action contamination

`AuditAction` is a single flat enum shared by three domains, and all three reuse the **`GOAL_*`** values for non-goal entities:

| Writer | Line | Action written | `entityType` |
| ------ | ---- | -------------- | ------------ |
| `GoalService` (via `ProjectService`) | `project.service.ts:56` | `'GOAL_CREATED'` | `'PROJECT'` |
| `GoalService` (via `ProjectService`) | `project.service.ts:127` | `'GOAL_UPDATED'` | `'PROJECT'` |
| `GoalService` (via `ProjectService`) | `project.service.ts:146` | `'GOAL_DELETED'` | `'PROJECT'` |
| `GoalService` (via `ProjectService`) | `project.service.ts:165` | `'GOAL_ARCHIVED'` | `'PROJECT'` |
| `TaskService` | `task.service.ts:94` | `'GOAL_CREATED'` | `'TASK'` |
| `TaskService` | `task.service.ts:185` | `'GOAL_UPDATED'` | `'TASK'` |
| `TaskService` | `task.service.ts:263` | `'GOAL_DELETED'` | `'TASK'` |
| **`GoalService.deleteGoal`** | `goal.service.ts:678` | **`// TODO: Audit log`** — nothing written | — |

**Consequences:**

1. Any query filtering `AuditLog` on `action: 'GOAL_CREATED'` and **not** also filtering on `entityType: 'GOAL'` returns goals + projects + tasks.
2. Goal deletion — the most destructive write on the page — leaves **no** row at all, so the count is not merely over-counted but **under**-counted for that one action.
3. `ProjectService` and `TaskService` write a row for the same class of event that `GoalService` skips, so the audit trail is inconsistent in the *opposite* direction for goals.

**Fix:** add `PROJECT_*` and `TASK_*` variants to `AuditAction`, and write the row in `deleteGoal`.

---

## 27. Dead surface inventory

| Category                                        | Count | Lines |
| ---------------------------------------------- | ----- | ----- |
| Dead components (`src/components/goals/`)      | **5** | **135** |
| Dead API resources (client-orphaned)           | **7** | 548 |
| Dead service methods                           | **4** | ~230 |
| Dead repository methods (3 of them unscoped)   | **4** | ~60 |
| Dead lib modules (`src/lib/goals/`, whole dir) | **5 files** | **165** |
| Dead exports inside live files                 | 5 | – |
| Fields in `createGoalSchema` that no client can send | **7** | – |
| Values in `GoalPriority` unreachable via the UI | **4** of 8 | – |
| Values in `GoalType` unreachable via the UI     | **2** of 6 | – |
| Live domain columns with no UI                 | **6** (`projectId`, `parentGoalId`, `isPublic`, `appliesEveryDay`, `dayTypeAssignments`, `tags`) | – |
| `TODO` / `FIXME` markers                       | **2** | – |
| Tests                                           | **0** | 0 |

**Roughly 1,140 lines of dead code in the goals domain**, against a live page of 328 + 170 + 127 = 625 lines. The dead surface is nearly twice the size of the shipped one.

The three highest-leverage fixes are **F2** (§25 — the daily check-in trap), **F3** (the slider writes no history) and **F1** (daily goals cannot be created).

---

## 28. Remediation log

**Amended 2026-10-02.** This section is the current state. §1–§27 are the pre-change baseline and have been left intact so the before/after stays legible.

### 28.1 Scope of what landed

| Area | State |
| ---- | ----- |
| Pace engine (`src/lib/goals/goal-metrics.ts`) | **New, complete, tested** |
| Tests for goals (`tests/lib/goal-metrics.test.ts`) | **New — 76 tests** |
| Daily check-in semantics (F2, §25) | **Fixed at the source** |
| Progress `mode: set \| delta` (F16) | **Fixed** |
| Undo / `GoalProgress` sum invariant (F21) | **Fixed without a migration** |
| Repository: count + range read + delete-by-date | **New** |
| `POST /api/goals/[id]/progress` envelope + validation | **Fixed** |
| Pace colour tokens in `globals.css` | **Not started** |
| All `/goals` UI (rows, Pace Track, drawer, Today ring, horizon) | **Not started** |
| `page.tsx` rewrite, `loading.tsx`, archive route, deep-link fixes, pagination wiring | **Not started** |

Verification at the time of writing: `npx tsc --noEmit` → **0 errors**. `npx vitest run` → **440 passing across 14 files**. (`AGENTS.md` still claims a smaller suite; it is stale.)

### 28.2 New file — `src/lib/goals/goal-metrics.ts`

The `/goals` page had **no** definition of "on track" anywhere in it: `GoalCard` computed a bare `currentValue / targetValue` percentage and `GoalProgressBar` computed the same percentage a second time, while three separate velocity implementations sat unused (§7.3, §15.5). Nothing on the page could answer the question it exists to answer.

This module is the single answer. It is **import-free** — not `@/lib/dates`, not Prisma, not React — which is a hard constraint, not a style choice: `'use client'` files import it (any value import from `@/lib/prisma` pulls the 679 KB Node client into the browser bundle, which has already happened twice in this repo), and `tests/lib/*.test.ts` import it (a test may not transitively reach `@/lib/prisma`, which throws at import time without `DATABASE_URL`).

| Export | Answers |
| ------ | ------- |
| `computeGoalPace(goal, today, points)` | The whole pace derivation: `state`, `progressShare`, `elapsedShare`, `gapPoints`, day counts, velocity, projected finish, slack |
| `paceBandFor(gapPoints)` | The one ±5-point banding rule, shared by every consumer |
| `netProgressByDay(points)` | Collapses `GoalProgress` rows to one net value per calendar day |
| `observedVelocityPerDay(...)` | Rate per day from the log window; `null` when unknowable |
| `buildConsistency(...)` | Heat-strip cells, current/longest streak, completion rate |
| `buildSparkline(...)` | Cumulative share per day, with `null` for "no baseline yet" |
| `paceLabel` / `paceSummary` / `dueLabel` | Text alternatives for every state, so colour is never the only signal |
| `addDays` / `daysBetween` / `formatValuePair` / `formatPercent` | Calendar-label arithmetic and number formatting |
| `GOAL_STATUS` | Client-safe string mirror of the Prisma enum |

**The invariant:** pace is one subtraction — `progressShare − elapsedShare`. Every visual planned for the page (the Pace Track's gap wedge, the row tint, the Horizon bar's overhang, the projected finish) is a projection of that number. `GoalPriority` deliberately does not appear in the module.

**Decisions worth recording, because they are choices a reader could reasonably have made differently:**

- **`COMPLETED` resolves to `done`, not `inactive`.** A goal completed by raising its target afterwards has 0 % progress and is still done; conversely a target reached on an `ACTIVE` goal resolves to `done`, because the alternative is a full bar reading "Behind".
- **`ON_HOLD` / `CANCELLED` / `CARRIED_OVER` never resolve to `overdue`.** Parking a goal is deliberate; reporting it as late would punish the user's own decision. They are reported `inactive` even once the window has closed, for the same reason.
- **A goal with no target is still paced by the calendar.** It reports `hasNoTarget: true` and `NO TARGET` in the deadline slot, but is not excused from the calendar — excusing it would hide every untargeted goal at 0 % from the "Behind" filter.
- **`observedVelocityPerDay` divides by the span movement actually happened over**, not by the whole look-back window, so a goal that was silent on Sunday is not reported at a seventh of its real rate. It falls back to the lifetime rate when the window has no rows at all.
- **It returns `null`, never `0`, when the rate is unknowable.** Fewer than two distinct logged days means no *movement* to divide. A projected finish built on a fabricated `0` is worse than no projection.
- **`dueLabel` takes the goal's `endDate` as a parameter** rather than reconstructing it from `GoalPace.daysTotal`, which is a clamped, normalised count and would drift by a day exactly when a day is what is being reported.

### 28.3 New file — `tests/lib/goal-metrics.test.ts` (76 tests)

Closes **F34** ("zero tests") for the domain's calculation layer. It pins the failure modes rather than restating the implementation:

- **Calendar correctness** — month/year/leap-day boundaries, `addDays` round-trips, unparseable input. Every date assertion is on a `YYYY-MM-DD` label, never on an instant, because `new Date('2026-10-01')` is UTC midnight while `.getDate()` reads the host's day.
- **The three "no data is not zero" cases** — no target set, no observable velocity, and a goal that applied on no days (`completionRate` must be `null`, never `0`).
- **The three ways "did not do it" must not read as failure** — outside the goal window (`not_applicable`), the current day (`pending`), and a same-day correction netting back to zero.
- **Streak semantics** — a streak survives an unfinished today (otherwise every goal reports a broken streak all morning, which is a fact about the clock, not the user) and breaks on a genuine gap.
- **Degenerate geometry** — same-day window, inverted window, negative `currentValue`, overshoot, non-finite target. Every share must stay finite.

The suite caught two real bugs in the module while it was being written, both now covered by regression tests:

1. **The window-closed comparison was inverted.** `daysBetween(today, endDate) > 0` is true *while the goal is still running*; the closed case is `< 0`. As written, every unfinished goal reported `overdue` on day one.
2. **`COMPLETED` was classified as inactive**, because it sat in the same `INACTIVE_STATUSES` set as `ON_HOLD`. A completed goal with no progress rendered as "Paused".

A third bug surfaced while fixing the first: **`buildSparkline` emitted `null` on every silent day**, punching holes in the curve after each logged day. `null` means "no baseline exists yet" — once any row has been seen, every later day reports the running total. Carried forward through a quiet week, a goal's progress reads as a curve instead of a row of disconnected spikes.

### 28.4 `checkInDaily` — the §25 trap, fixed at the source

`src/server/services/goal.service.ts`. The page-level mitigations suggested in §25.4 (filter daily goals out of the Completed tab, hydrate `checkins`) are all now unnecessary, because the status write is gone rather than compensated for.

**What was wrong, restated:** `checkInDaily` wrote `status: 'COMPLETED'` and `completedAt: now` on a check-in. `COMPLETED` is terminal in `GOAL_STATUS_CONFIG`, so ticking "Morning read" removed the goal from `findActiveInDateWindow` — and therefore from `/api/goals/today` — for the rest of its window. The goal also flipped back to `ACTIVE` on the next check-out, so the status tracked "was the last interaction a tick" rather than any real state.

**Now:** a daily goal stays `ACTIVE` for its whole window, and no check-in can complete one. `updateProgress` reaching the target is the **only** path to `COMPLETED`. "Done today" is exactly what it says — a `GoalProgress` row exists for today. `currentValue` still mirrors `1`/`0` for the existing widgets, but is explicitly documented as a mirror, not the source of truth.

**Undo now deletes the day's rows** instead of appending a `value: 0` row. This part mattered more than the status write. `GoalProgress` has no `@@unique([goalId, date])`, so the old undo left the day summing to `1`: the goal read as **done after being unticked**, and the toggle inverted its own meaning. That is F21's divergence between `sum(GoalProgress.value)` and `Goal.currentValue` reaching the user through the primary interaction on the page.

This closes F21's *symptom* without a migration. The missing unique constraint is still missing; the invariant now holds because the undo path maintains it, and `netProgressByDay` nets defensively if a row ever does land twice.

### 28.5 `updateProgress` — `mode` makes delta vs. absolute explicit (F16)

`value` was always treated as a **delta**. That is right for "I ran 5 km" and catastrophic for "I have done 42 of 100", which silently became 147. Callers had no way to say which they meant, so the `/goals` slider — which wanted an absolute set — was routed around this endpoint entirely and PATCHed `currentValue` directly, leaving **no `GoalProgress` row at all** (F3). Every streak, sparkline and projection computed from the log was therefore blind to it.

- `mode: 'delta'` (the default, and the only prior behaviour) — `value` is added to `currentValue`.
- `mode: 'set'` — `currentValue` becomes `value` outright.

Either way a `GoalProgress` row is written, so the log is a complete record. **In `set` mode the row stores the change, not the new total**, so summing a day's rows still reconstructs the same running total regardless of which mode wrote them. `netProgressByDay` is the reader that depends on this.

Also: non-finite values are rejected, `set` cannot go negative, `delta` clamps at 0 rather than driving `currentValue` negative, and a no-op write (`newValue === currentValue`) skips the log row instead of recording a phantom `0`.

### 28.6 Repository — `src/server/repositories/goal.repository.ts`

| Addition | Why |
| -------- | --- |
| `GoalListOptions` (exported) | The filter shape, extracted so `findAll` and `countAll` cannot drift |
| `buildWhere` (private) | One filter composition. `overdue`/`dueSoon` pin `status` rather than adding to it; the two were previously written out twice |
| `countAll` | Backs a real `meta.total` (F9). `meta.total` was `goals.length` — the *page* length — so a client paging with `offset` could not tell "last page" from "there are more" |
| `deleteProgressLogsForDate` | Makes undo the absence of rows (§28.4) |
| `findProgressLogsInRange` | One query for all heat-strips/streaks across every goal. Reading them per goal was one HTTP request per row — 15 goals meant 15 round trips before a pixel was on screen |
| `getProgressHistory` re-indented | Partial fix for F31; the body had been sitting at column 0 |

Also `GoalService.getProgressRange(userId, from, to)` was added as the service-level wrapper, so the range read obeys the repository-is-the-only-DB-layer rule.

### 28.7 `POST /api/goals/[id]/progress` — envelope and validation

- `mode` added to the schema, defaulting to `'delta'`.
- `value` is now `z.number().finite()`; `note` is capped at 2000.
- **`completed` moved from beside the envelope into `meta`.** It previously sat at the top level next to `{ success, data }`, unlike every other route in the app — and `apiRequest` only unwraps `data`, so consumers reading the standard envelope got `undefined`.
- Errors now go through the shared `handleError` instead of an ad-hoc branch that returned **400 for any `Error`**, including `NotFoundError`.

### 28.8 Finding status

| # | Status | Note |
| - | ------ | ---- |
| **F2** | **Closed** | Daily check-in no longer writes `COMPLETED`/`completedAt` (§28.4). |
| **F16** | **Closed** | `mode: 'set' \| 'delta'` (§28.5). |
| **F21** | **Closed (symptom)** | Undo deletes rows instead of appending `0`; `netProgressByDay` nets defensively. The missing unique constraint remains. |
| **F31** | **Partial** | `getProgressHistory` re-indented; `getGoalAnalytics`'s JSDoc still is not. |
| **F34** | **Closed** | 76 tests over the pace engine (§28.3). |
| **F3** | **Partial** | `updateProgress` now always logs, but `AppContext.updateGoalProgress` still PATCHes `currentValue` directly — the slider is **not** yet routed through it, so manual progress is still invisible to the log. |
| **F6** | **Open** | `checkInDaily` still returns the bare row; the redundant client-side `PATCH` is still in `page.tsx`. |
| **F9** | **Partial** | `countAll` exists; `GET /api/goals` does not yet call it, and the 50-row cap and silent truncation are unchanged. |
| **F1** | **Open** | `AddGoalModal` still sends `endDate: endDate \|\| startDate` for DAILY, so the service's `startDate + 365d` default is still unreachable from the UI. |
| **F4, F7, F8, F10, F11, F12, F13, F18, F19, F22, F23, F25** | **Open** | UI-layer findings; `page.tsx` has not been touched. |
| **F5, F14, F15, F17, F20, F24, F26–F30, F32, F33** | **Open** | Untouched. |
| §12.1 broken `/goals/{id}` deep links | **Open** | `notification.service.ts:522` and `email.service.ts:383` still 404. The plan is to point them at `/goals?goal=<id>`. |

### 28.9 Deliberately not done yet

`src/lib/goals/velocity.ts` is still present and still dead. `goal-metrics.ts` supersedes it — its `GoalProgress` interface declares a `recordedAt` field that **does not exist** on the Prisma model, so it could never be fed real rows without mapping — but deleting it is left for the same commit as the `/goals` UI, so that nothing imports from either and the dead surface disappears in one step.

---

---

## 29. "Trajectory" — the `/goals` page, built

**2026-10-02, second pass.** §28 fixed the data layer. This section records the page itself: the Part A correctness gaps closed, and the Part B redesign that consumes the pace engine.

### 29.1 Finding status after this pass

| # | Status | What closed it |
| - | ------ | -------------- |
| **F1** | **Closed** | Daily goals are creatable. `GoalFormModal` derives a real deadline from the start date and the type's natural span, so a blank field can never become "the same instant" again (§29.4). |
| **F2** | **Closed** | §28.4. The check-in no longer writes `COMPLETED`. |
| **F3** | **Closed** | `updateGoalProgress` posts to `/api/goals/[id]/progress` with `mode: 'set'`, so the slider writes a `GoalProgress` row like every other write (§29.3). |
| **F5** | **Closed** | `deleteDetaching` nulls `Task.goalId` and `TimeEntry.goalId` in one transaction, and `GET /api/goals/[id]?impact=true` states the split before the user commits (§29.5). |
| **F6** | **Closed** | The redundant second `PATCH` is gone; nothing compensates for server behaviour that no longer exists. |
| **F7** | **Closed** | `addGoal` forwards the whole `CreateGoalRequest` instead of a seven-field allow-list, so `projectId`, `dayTypeIds`, `tagIds` and `milestones` are reachable for the first time. |
| **F8 / F28** | **Closed** | All 6 `GoalType` and all 8 `GoalPriority` members are offered. Status is edit-only, because a new goal is always `ACTIVE` and the service ignores it on create. |
| **F9** | **Closed** | `GET /api/goals` returns a real `meta.total` and `meta.hasMore` from a `countAll` sharing the page's filter; the client pages until `hasMore` is false. |
| **F13** | **Closed** | `DeleteGoalDialog` uses the shared `Modal`, which supplies the focus trap, `Escape`, initial focus and focus restoration the fake `role="alertdialog"` only promised. |
| **F14** | **Partial** | `DELETE` and `PUT /api/goals/[id]` now route through `handleError`, so `NotFoundError` is a 404. Several service methods still throw bare `new Error('Goal not found')`. |
| **F16** | **Closed** | §28.5. |
| **F21** | **Closed (symptom)** | §28.4. The unique constraint is still absent. |
| **F31** | **Partial** | `getProgressHistory` re-indented; `getGoalAnalytics`'s JSDoc still is not. |
| **F34** | **Closed** | 76 pace tests + 15 taper tests. |
| **§12.1** | **Closed** | Notification and email now emit `/goals?goal=<id>`, which the page answers with the drawer (§29.6). |
| **F4, F10, F11, F12, F18, F19, F22, F23, F25** | **Closed or moot** | Addressed by the rewrite — see §29.7 for how each was resolved. |
| **F15, F17, F20, F24, F26–F30, F32, F33** | **Open** | Untouched; service- and habit-level, not page-level. |

### 29.2 What the page is now

Part B's thesis: Dashboard glances, Habits tends, Routine clocks — **Goals projects forward.** Every number the backend now computes is about where you are headed, so the page is a flight instrument rather than a progress bar.

The layout is three altitudes, not tabs-and-cards:

```
Header      Goals · "2 of 4 done today · 3 in flight · 1 behind pace"
            [search] [Behind ▾n] [+ Add goal]
Tabs        Daily · Long-term · Completed      ← real tablist, arrow keys, tabpanel
─────────────────────────────────────────────────────────────
[rail]      ⚠ NEEDS ATTENTION · 1              ← behind-pace, promoted not separated
            [same card material, just first]
[grid]      every other goal in the tab
```

Behind-pace goals are **promoted into a rail rather than filtered into one**. They are the same cards from the same list, drawn first, with a pace-tinted leading edge. The previous page made the user eyeball percentages against dates to notice the same fact — which is the one computation this page exists to perform for them.

**One focal point per view.** Daily leads with the check-in strip; Long-term leads with the needs-attention rail; the completed tab has nothing to promote and says so. There is no separate "Today ring" — the plan for this page is trajectory-first, and a large ring would compete with the Pace Track rather than summarise it.

### 29.3 F3 — the fix that made the rest of the page possible

`AppContext.updateGoalProgress` posted `PATCH /api/goals/[id]` with `{ currentValue }`, which writes the column and **no `GoalProgress` row**. Everything the new page renders — streaks, consistency strips, sparklines, observed velocity, projected finish — is derived from `GoalProgress`. So without this fix the entire redesign would have rendered empty for every goal driven by the slider, which is most of them.

It now posts to `/api/goals/[id]/progress` with `mode: 'set'`. The endpoint computes the delta itself and writes a row for the movement, so the log stays a faithful record and summing a day's rows still reconstructs the total. It also accepts an optional `note`, which is what the drawer's log form writes through.

`note` was added rather than a second write so context stays the single source of truth: a bare `fetch` in the drawer would have updated the card and left the dashboard's goal widgets stale until the next full reload.

### 29.4 F1, F7, F8, F28 — one form instead of two

`AddGoalModal` and `EditGoalModal` (297 lines) are deleted and replaced by `GoalFormModal`. They duplicated every field, disagreed about the priority list (3 vs 4 of 8) and about which types existed (4 of 6), and neither could set a project or a day-type scope.

- **The deadline is derived, not stored.** While untouched it follows `addDays(startDate, GOAL_TYPE_SPAN_DAYS[type])`, so a YEARLY goal gets a year and a WEEKLY goal gets a quarter — which is what makes the Pace Track's elapsed share mean something later. Once the user edits it, their value wins permanently.
  This is derivation rather than an effect on purpose. An effect that syncs the field writes state on every keystroke in the start-date box, causing a second render pass each time — exactly the "adjusting state when props change" shape React's docs warn about.
- **`defaultType` is re-read on open.** The old modal initialised it in a `useState` argument, so it latched the value from the first render forever: opening "Add goal" from the Daily tab still pre-selected Weekly.
- **`status` is edit-only.** A new goal is always `ACTIVE`; the service ignores a status on create, so offering the control on the create path would be a field that appears to work and does not.
- **Priority moved to a 3px corner tick**, not a filled badge, so it cannot be confused with pace — which is the collision that made CRITICAL and HIGH identical in the old map.

### 29.5 F5 — delete tells you what it costs, then does it

`Task.goalId` and `TimeEntry.goalId` are both nullable with **no `onDelete`**, so a goal with either attached could not be deleted at all; the request failed with a bare foreign-key violation. Adding `onDelete: SetNull` to the schema would express the same intent, but a migration is a heavier instrument than the situation needs.

The delete now runs one transaction: re-check ownership, null both links, delete the goal. Two writes are deliberately in the same transaction — between them, a failure would leave orphaned tasks pointing at a goal that still exists, which is worse than the original error because it is silent.

The linked tasks and time entries are **detached, not deleted**. Deleting a commitment the user actually worked on should not destroy the record that they did that work.

Because that outcome is genuinely two-sided, `GET /api/goals/[id]?impact=true` returns the counts so the dialog can name both halves — *"Gone for good: 12 progress entries, 2 milestones"* / *"Kept, unlinked: 3 tasks. They stay in your lists without a goal."* It is a separate verb rather than an always-present `meta` block because the counts cost six queries and the list view reads a hundred goals.

`DeleteGoalDialog` leads with **Archive** as the big button, and puts Delete last, quiet, with the loss summary attached.

### 29.6 §12.1 — the 404 links became the detail surface

`notification.service.ts` and `email.service.ts` both built `/goals/${goal.id}`, and there is no `/goals/[id]` route, so every goal-deadline notification and reminder email produced a dead link. Both now emit `/goals?goal=<id>`.

That is not only a bug fix. It gives the page its first real detail surface: the page reads the param, opens the drawer on that goal, and lands you on the tab that contains it. A bug report turned into a shareable link to one goal's trajectory.

`useSearchParams` requires a `Suspense` boundary in the App Router; the page is currently a plain client component and the build passed, so this is verified working rather than assumed — but it is worth re-checking if the route is ever converted to a server component.

### 29.7 The remaining Part A findings, by how the rewrite resolved them

| # | How it is resolved |
| - | ------------------ |
| **F10** | `dataLoaded` / `dataError` are now read. Loading, error, empty and **no-results** are four distinct screens; the previous page rendered "No daily goals" for all four. |
| **F11** | `GoalFormModal` re-seeds on open. |
| **F12** | Row actions moved into the drawer; per-row `busyId` disables only that control. |
| **F18** | Day-type scope is now a chip on the card, and the client model carries `appliesEveryDay` / `dayTypeNames` instead of discarding them. `GET /api/goals` already selected the relation on every load. |
| **F19** | No partial reset — the form re-seeds wholesale from `initial`. |
| **F22** | Real `tablist` / `tab` / `tabpanel`, `aria-controls`, roving `tabIndex`, and arrow-key navigation. |
| **F23** | `runAchievementCheck()` fires on check-in **and** on any progress write that reaches the target. |
| **F25** | The duplicate percentage helpers are gone; `targetValue: 0` renders "No target set" rather than a fake 0 %. |
| **F29** | The shared `GoalCard` is finally the live one. `page.tsx` previously defined a private `GoalCard` that shadowed it, which is why this file sat unreachable since it was written. |

### 29.8 Design decisions worth recording

**Colour is pace, and only pace.** The `--pace-*` tokens are defined once in `:root` and `.dark` and mapped through `@theme inline`, so `text-pace-ahead` works in both themes with no second `dark:` variant per element. Dark is not an inversion: the solids move *lighter* against the near-black ground, because a mid-tone amber has no edge there.

Priority was moved off colour entirely — a 3px tick plus the word. It was never a small problem: two priorities shared one colour and four were unreachable.

**The taper is bounded.** `paceSeverity` maps the gap onto 0..1 and clamps. `gapPoints` is unbounded, so without a cap a goal 5× over its window saturates identically to one 2× over — which is the same failure as a flat alarm fill, just softer. Ahead is capped at 0.4 on purpose: being ahead is correct, not a party, and must never out-shout a goal that is behind.

**Motion is "watch the trajectory assemble".** Markers scale in from the left, the wedge draws last, the ghost line fades up 100 ms behind. Only `transform` and `opacity` animate — the fill is `scaleX`, because animating `width` on a grid of cards would relayout every row on every progress write. Nothing glows, blooms, shimmers or pulses; a completed goal's track simply resolves flat and full, once.

**A day with no log row is still unknown, not failed.** The consistency strip draws four states, not two. `pending` (today, day not over) is a ring rather than a miss, because rendering an unfinished day as a failure reports something that has not happened yet — and it is also what keeps a live streak from *appearing* broken all morning.

**One request for the whole page's history.** `GET /api/goals/progress-range` reads every `GoalProgress` row across all goals in one 30-day window. The obvious shape — `/api/goals/[id]/history` per goal — was fifteen round trips before the first card had a streak, growing linearly with the list. Range is validated and capped at 365 days server-side.

### 29.9 Verification

`npx tsc --noEmit` → **0 errors**. `npx vitest run` → **494 passing across 17 files** (`tests/lib/goal-metrics.test.ts` 76, `tests/goals/pace-taper.test.ts` 15). `npx next build` → **compiled successfully**, all 11 `/api/goals*` routes registered. `npx eslint` over the new files → **0 errors, 10 warnings**, all pre-existing advisories (`setState` in an effect inside the log-fetch effects, and non-null assertions in the metrics module, both guarded by preceding length checks).

Not verified, and honestly so: **nothing has been rendered in a browser.** No component test, no Playwright, no screenshot. Layout, spacing, contrast in situ, and the feel of the motion are unproven. The WCAG claim for the pace palette is an arithmetic claim about token values against their own surfaces, not a measured contrast ratio.

### 29.10 Dead code removed

Nine files, ~600 lines, all previously unreachable from any route:

| File | Why it was dead |
| ---- | --------------- |
| `components/goals/AddGoalModal.tsx` | Superseded by `GoalFormModal` |
| `components/goals/EditGoalModal.tsx` | Superseded by `GoalFormModal` |
| `components/goals/CarryOverDialog.tsx` | Hand-rolled overlay, no portal, no focus trap — and no route to reach it |
| `components/goals/GoalHistory.tsx` | Replaced by the drawer's trajectory section |
| `components/goals/GoalPriorityBadge.tsx` | Stale 3-value map; priority is a tick now |
| `components/goals/GoalProgressEditor.tsx` | Unstyled inline form; replaced by the drawer's log section |
| `lib/goals/velocity.ts` | Superseded by `goal-metrics.ts`; its `GoalProgress` interface declared a `recordedAt` field that **does not exist** on the Prisma model |
| `lib/goals/{progress,completion,expiration,carry-over}.ts` | Contradicted the live service; the only inbound edge was the dead `GoalCard` |

`lib/goals/` now contains exactly one file: `goal-metrics.ts`, which is imported by the page, the hook and two test suites.

### 29.11 Still open, deliberately

- **Milestones, sub-goal hierarchy, carry-over UI.** All three have complete, tested backend paths and no interface. Real opportunities, and the second wave.
- **`@@unique([goalId, date])` on `GoalProgress`.** The invariant now holds because the undo path maintains it. A migration is the durable fix and needs sign-off.
- **`getGoalAnalytics`** is still unreachable over HTTP and still computes a lifetime-average velocity that contradicts `goal-metrics.ts`. It should probably be deleted in favour of the tested engine rather than left as a second answer to the same question.
- **F20** (cross-enum `AuditAction` contamination) and **F24** (`GoalDayType.userId` denormalisation) are service-level integrity issues with no page-visible symptom.

---

*End of `/goals` audit · amended 2026-10-02 (§28 remediation log, §29 Trajectory build).*