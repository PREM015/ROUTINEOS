# `/habits` — Complete System Audit

**Route:** `http://localhost:3000/habits`
**Route file:** `src/app/(dashboard)/habits/page.tsx` (1,124 lines, `'use client'`)
**Project:** RoutineOS (`daily-plan`) — Next.js (App Router) + Prisma + PostgreSQL (Neon)
**Audit date:** 2026-09-30 · **Amended:** 2026-09-30 (documentation-only pass — no code was changed; see [§24](#24-findings-register))
**Status of this document:** describes **only** what exists in the codebase. Every claim is file-anchored. Where something could not be proven from code it is marked **`Needs verification`**. Anything that looks like a feature but is not wired up is listed in [§15](#15-currently-not-supported). Defects found are recorded in [§24](#24-findings-register) with a severity and a fix suggestion, but **none were repaired** — the pass was documentation-only.

> **This page is unusual in one respect worth stating up front:** it is the only audited route so far whose data layer lives **outside the page file**. `/today` owns eight `useState` blocks and fetches its own data. `/habits` owns almost no fetching — it reads `habits`, `selectedDate`, `getLogForDate` and 13 mutators straight out of the app-wide `AppContext`, which is mounted in the **root** layout. A large share of this document is therefore about that context rather than about `page.tsx`.

---

## Table of contents

| §   | Section                                                                                                         |
| --- | --------------------------------------------------------------------------------------------------------------- |
| 1   | [What `/habits` is, in one paragraph](#1-what-habits-is-in-one-paragraph)                                         |
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
| 25  | [UI/UX pass already applied in the file](#25-uiux-pass-already-applied-in-the-file)                              |
| 26  | [Cross-page consistency notes](#26-cross-page-consistency-notes)                                                |
| 27  | [The half-orphaned `/habits/[id]` subtree](#27-the-half-orphaned-habitsid-subtree)                              |
| 28  | [The Habit Consistency card (added later)](#28-the-habit-consistency-card-added-later)                      |

---

> **Section 28 was written after the audit above** and describes a feature that
> did not exist when sections 1-27 were written. It is appended rather than woven
> in, so the original findings register stays valid.

---

## 1. What `/habits` is, in one paragraph

`/habits` is the app's **habit registry and management console**. It is a `'use client'` Client Component (`page.tsx:1`) that renders a filterable, tabbed list of the user's `Habit` rows grouped by tier, with a **28-day health bar and streak badge per row**, a status tab strip (`ACTIVE` / `PAUSED` / `ARCHIVED`), a day-type filter, a tag filter, a free-text search, a per-row completion toggle for "today", and row-level lifecycle actions (pause / resume / edit / archive / restore / delete). Unlike `/today`, this page performs almost no data fetching of its own: the habit list, the selected date, and **thirteen mutators** all come from `AppContext` (`src/context/AppContext.tsx`, 1,168 lines), which is mounted in the **root** layout and therefore loads on every route in the app. Only three requests originate in `page.tsx` itself — `GET /api/day-types?active=true`, `GET /api/day-mode?date=` (for the "Today" filter sentinel), and `GET /api/habits/health?days=28`. The page has **no date picker**: `today` is `AppContext.selectedDate`, which is seeded from the user's timezone and can be changed from elsewhere in the app. There is **no route segment `error.tsx`**, so a render crash falls through to `src/app/(dashboard)/error.tsx`.

---

## 2. UI block diagram

Layout: no local wrapper — the page inherits the `(dashboard)` shell. Everything below is the **real** structure from `src/app/(dashboard)/habits/page.tsx`.

```
/habits  (src/app/(dashboard)/habits/page.tsx — 'use client' Client Component)
│
├── HEADER ROW                                     (page.tsx:811–838)
│   ├── <h1> "My Habits"
│   └── summary line (text-sm, muted):
│         "N active habits"                          ← AppContext.habits filtered on status==='ACTIVE'
│         ·  "H healthy"  (emerald if >0)            ← healthSummary.healthy
│         ·  "A at risk"  (amber if >0)
│         ·  "U unhealthy" (red if >0)
│         ·  "X% avg (28d)" (tabular-nums)           ← mean of non-null completionRate
│       └── whole block hidden when healthData.length === 0
│   └── <Button variant="primary"> + Plus  "Add Habit"  → setModalOpen(true)
│
├── ACTION ERROR BANNER                            (page.tsx:840–844)
│   └── <p role="alert"> destructive bg — set by runAction()'s catch
│
├── HEALTH ERROR NOTE                              (page.tsx:848–860)
│   └── muted <p>: "<error>. Health metrics are unavailable; everything else
│                   is unaffected. [Retry]"   ← inline button → fetchHealth()
│
├── SEARCH + TAG FILTER ROW                        (page.tsx:872–939)
│   ├── search box: <Search icon> + <input type="search" aria-label="Search habits">
│   │      value=searchTerm, placeholder "Search habits or tags…"
│   │      + clear ✕ button (only when searchTerm non-empty)
│   └── tag strip (only when allTags.length > 0):
│         "Tags" label · "All" button (aria-pressed) · one <TagChip> per tag
│         DATA: derived client-side from AppContext.habits[].tags  (no request)
│
├── DAY-TYPE FILTER + STATUS TABS ROW              (page.tsx:942–992)
│   ├── <Filter icon> + <Select aria-label="Filter by day type">
│   │      options: "All Days" | "Today · <name>" (only if todayDayType.id) | one per DayTypeDefinition
│   │      disabled while dayTypesLoading || loadError
│   └── "Retry filter" button (only when loadError)
│   └── <div role="tablist" aria-label="Habit status filter">
│         3 × <button role="tab" aria-selected>: Active | Paused | Archived
│
├── <AnimatePresence mode="wait"> > <motion.div key={tab}>   (page.tsx:994–1074)
│   │
│   ├── BRANCH A — !dataLoaded                     (page.tsx:1012–1017)
│   │      <div aria-busy="true" aria-label="Loading habits">
│   │        3 × <div class="h-[74px] … animate-pulse">
│   │
│   ├── BRANCH B — dataError                       (page.tsx:1018–1028)
│   │      <EmptyState icon={<Target/>} title="Could not load your habits"
│   │                 description={dataError} action="Try again" → reloadData()>
│   │
│   ├── BRANCH C — filteredHabits.length === 0     (page.tsx:1029–1059)
│   │      <EmptyState>
│   │        title   = "No {active|paused|archived} habits"  when statusCount(tab)===0
│   │                 = "No matching habits"                  otherwise
│   │        desc    = tab-specific copy / "None of your {tab} habits match …"
│   │        action  = "Add Your First Habit"  (only: tab ACTIVE && statusCount===0)
│   │                 "Clear filters"         (only: statusCount>0)
│   │
│   └── BRANCH D — the list                        (page.tsx:1060–1072)
│          ├── 3 × renderTierGroup('GROWTH' | 'BONUS' | 'LIFESTYLE')   (page.tsx:1062)
│          │      <h3> "Core Habits" | "Growth Habits" | "Lifestyle Habits"
│          │      rows sorted a.name.localeCompare(b.name), each = renderHabitRow(habit)
│          └── "More Habits" group (page.tsx:1063–1070)
│                 rows = filteredHabits whose tier ∈ OTHER_TIERS, sorted by name
│
├── <AddHabitModal open onClose onSaved→fetchHealth />    (page.tsx:1076–1080)
├── <EditHabitModal habit={editing} onClose onSaved→fetchHealth /> (page.tsx:1081–1085)
│
└── <Modal isOpen={confirmDelete!==null} title="Delete habit?">   (page.tsx:1102–1121)
       Cancel (ghost) / Delete (danger)
       body: "<name>" and its history will be permanently removed. This cannot be undone.
```

### 2.1 Anatomy of one `renderHabitRow` — `page.tsx:453–784`

```
<motion.div layout initial{opacity:0,y:6} animate{opacity:1,y:0}
            class="group relative flex items-start gap-3 overflow-hidden rounded-2xl
                   border border-border bg-card p-3 … sm:p-4">
│
├── [optional] <span aria-hidden class="absolute inset-y-0 left-0 w-1"
│                 style={{background: linear-gradient(accent → color-mix(accent 25%, transparent))}}>
│      accent = habit.color ?? TIER_ACCENT[habit.tier] ?? null      (page.tsx:488)
│
├── LEFT COLUMN — tab-dependent                                    (page.tsx:509–556)
│   ├── tab === 'ACTIVE'  → <button aria-pressed={done} aria-label / title>
│   │      icon  = done ? <CheckCircle2/> : LOG_STATUS_STYLE[logStatus ?? 'NONE'].icon
│   │            COMPLETED       CheckCircle2  emerald-500
│   │            PARTIAL         CircleMinus   amber-500
│   │            SKIPPED         CircleSlash   sky-500
│   │            MISSED          Circle        red-500
│   │            NOT_APPLICABLE  CircleSlash   muted-foreground
│   │            NONE            Circle        muted-foreground
│   │      disabled = busy || Boolean(notDue)
│   │      colour  = color-mix(accent 70%, var(--foreground)) when clickable & not done
│   └── else (PAUSED / ARCHIVED) → <span aria-hidden> icon tile
│            {habit.icon ?? <Circle size={18}/>}
│
├── CENTRE COLUMN <div class="min-w-0 flex-1">                    (page.tsx:558–713)
│   ├── line 1  (flex-wrap)
│   │     ├── <span> habit.name  (line-through + muted when done)
│   │     ├── status badge — only when isMarked && !done: "partly done" / "skipped" /
│   │     │        "marked not done" / "not applicable", tinted by LOG_STATUS_STYLE
│   │     ├── "Not due" pill — only when tab==='ACTIVE' && notDue
│   │     ├── 🔥 habit.streakCount          (only when > 0, amber)
│   │     └── 📈 best {health.longestStreak} (only when > habit.streakCount, muted)
│   ├── line 2  (text-xs muted)
│   │     ├── getFrequencyLabel(frequencyType, frequencyValue)
│   │     ├── "· target N"        (only when habit.targetCount)
│   │     ├── "· 🔔 HH:mm"        (only when habit.reminderTime)
│   │     └── "· N min"           (only when habit.estimatedDuration)
│   ├── 28-day health bar        (only when health?.completionRate != null)  (page.tsx:610–631)
│   │     <div role="meter" aria-valuemin=0 aria-valuemax=100
│   │          aria-label="<name> 28-day completion" aria-valuenow={rate}>
│   │       <motion.div class={HEALTH_BAR[health.health]}
│   │               initial{width:0} animate{width:'N%'} transition{duration:.5}/>
│   │     + "{rate}% · {health}"
│   ├── description             (line-clamp-2, only when habit.description)
│   ├── tag chips               (only when habit.tags.length > 0)  — clickable, toggles tagFilter
│   └── day-type chips          (only when habit.appliesEveryDay === false)   (page.tsx:685–712)
│         ├── 0 assignments → amber "No day types selected — never scheduled"
│         └── n>0          → "Day type"/"Day types" label + one chip per assignment
│                            (icon + dayType.name)
│
└── RIGHT COLUMN <div class="… shrink-0 md:opacity-0 md:group-hover:opacity-100
                          focus-within:opacity-100 transition-opacity">   (page.tsx:714–781)
      ├── tab ACTIVE   → <Pause>   pauseHabit(id)
      ├── tab PAUSED   → <Play>    resumeHabit(id)
      ├── always       → <Pencil>  setEditing(habit)
      └── tab !== ARCHIVED → <Archive> archiveHabit(id)
          tab === ARCHIVED → <RotateCcw> restoreHabit(id) + <Trash2> setConfirmDelete(habit)
      every button: disabled={busy}, own aria-label, own hover tint
```

### 2.2 `notDueReason` — the gate on the toggle — `page.tsx:411–444`

Returns a human string, or `null` when the habit **is** due. Checked in order; first match wins:

| # | Condition                                                | Returned string                                     |
| - | -------------------------------------------------------- | --------------------------------------------------- |
| 1 | `habit.status !== 'ACTIVE'`                             | `This habit is not active.`                         |
| 2 | `appliesEveryDay === false` **and** `!todayDayType.dayType` | `null` — **cannot decide, so it does not disable** |
| 2b| `appliesEveryDay === false` **and** `!habitAppliesToDayType(...)` | `Restricted to <names>.`                  |
| 3 | `startDay && date < startDay`                            | `Starts on YYYY-MM-DD.`                              |
| 4 | `endDay && date > endDay`                                | `Ended on YYYY-MM-DD.`                               |
| 5 | `!isHabitScheduledForDate(habit, date, timezone)`         | `Not scheduled for YYYY-MM-DD.`                      |
| – | otherwise                                                 | `null`                                              |

The docblock at `page.tsx:395–410` states the design intent explicitly: **deliberately conservative — return "do not disable" whenever it cannot decide**, because a false "not due" would block a completion the server would have accepted.

---

## 3. UI → component mapping

Each row is a real chain traced through imports. Paths are relative to the repo root.

### 3.1 Direct imports from `page.tsx`

```
page.tsx
→ src/context/AppContext.tsx        useApp() + type Habit      (the data layer — 14 of 39 members)
→ src/hooks/useUserTimezone.ts      useUserTimezone()          → { timezone }
→ src/lib/habits/frequency.ts       getFrequencyLabel()
→ src/lib/habits/scheduling.ts      isHabitScheduledForDate()
→ src/lib/habits/day-type-match.ts  habitAppliesToDayType()
→ src/lib/dates.ts                  getTodayString()
→ src/lib/api-client.ts             fetchWithAuth()
→ src/lib/utils.ts                  cn()
→ src/constants/*                   (indirect, via the two above)
→ src/components/habits/AddHabitModal.tsx   (522 lines)
   ↳ src/components/habits/TagPicker.tsx    TagPicker (GET/POST /api/tags)
   ↳ src/components/ui/{Input,Checkbox,Select,Button,Modal}.tsx
   ↳ src/components/ui/modal-frame.ts, src/lib/motion.ts
→ src/components/habits/EditHabitModal.tsx  (331 lines)
   ↳ same set as above (TagPicker, Input, Select, Button, Checkbox, Modal)
→ src/components/habits/TagPicker.tsx       TagChip + type TagOption
   ↳ lucide-react, @/lib/api-client (fetchWithAuth), @/lib/utils (cn)
→ src/components/ui/index.tsx  (barrel, 26 lines, re-exports 26 modules)
   ↳ Button.tsx (52) · EmptyState.tsx (52) · Select.tsx (55) · Modal.tsx (166)
   ↳ **barrel also pulls**: RichTextEditor (147), ColorPicker (117), Tooltip (58),
     Dialog (137), Pagination (91) and the rest — none rendered on this route
→ framer-motion  motion, AnimatePresence
→ lucide-react   20 icons
→ @/generated/prisma  type DayType   (type-only import — erased at compile time, safe in a client file)
→ @/types/routine      type DayTypeDefinition
```

### 3.2 The real data chain — `AppContext` → API → service → repository

```
AppContext.habits  (set by fetchAllHabits)
→ GET /api/habits?includeArchived=true&limit=100&offset=N        (AppContext.tsx:492, looped :486–520)
→ src/app/api/habits/route.ts  (GET, :13 auth, :48 habitQuerySchema)
→ src/server/services/habit.service.ts  listHabits + countHabits
→ src/server/repositories/habit.repository.ts  findAll / countAll
→ Prisma model Habit  (+ category, tags→Tag, dayTypeAssignments→DayTypeDefinition, _count.logs/overrides)

AppContext.habitLogs  (set by fetchHabitLogs, once selectedDate is set)
→ GET /api/habits/logs?date=YYYY-MM-DD                            (AppContext.tsx:626)
→ src/app/api/habits/logs/route.ts (:23 auth, :33 manual regex)
→ HabitService.getLogsForDate → habitRepository.findLogsByUserRange
→ Prisma model HabitLog

AppContext.logHabit
→ POST /api/habits/{id}/log                                       (AppContext.tsx:912)
→ src/app/api/habits/[id]/log/route.ts (:16 auth, :82 handleError)
→ HabitService.logHabit                                            (habit.service.ts:278)
   ↳ src/lib/habits/eligibility.ts  calculateHabitEligibility
      ↳ src/lib/habits/scheduling.ts isHabitScheduledForDate
      ↳ src/lib/habits/frequency.ts  parseFrequencyConfig
      ↳ src/lib/habits/day-type-match.ts habitAppliesToDayType
      ↳ src/lib/scheduling/resolve-routine.ts resolveDayTypeForDate
   ↳ habitRepository.findById / upsertLog
   ↳ streakRepository.findByUserId
   ↳ src/lib/streaks/calculate-streak.ts calculateStreak, recordStreakMilestone
   ↳ src/server/services/scoring.service.ts ScoringService.calculateDailyScore  (awaited)
   ↳ src/server/services/automation.service.ts handleEvent(HABIT_COMPLETED)      (fire & forget)
   ↳ src/server/services/achievement.service.ts checkForUnlocks                 (fire & forget)
→ Prisma models HabitLog, Streak, StreakMilestone, DailyScore, AutomationRule,
                    AutomationRun, Task, Achievement, NotificationLog, ActivityLog

AppContext.archiveHabit / restoreHabit
→ POST /api/habits/{id}/archive[?restore=true]                    (AppContext.tsx:781, :857)
→ src/app/api/habits/[id]/archive/route.ts (:20 auth)
→ HabitService.archiveHabit / restoreHabit
→ habitRepository.archive / updateStatus + auditRepository.create (AuditLog)

AppContext.pauseHabit / resumeHabit
→ POST /api/habits/{id}/pause | /resume                           (AppContext.tsx:805, :830)
→ src/app/api/habits/[id]/pause|resume/route.ts (:15 / :14 auth)
→ HabitService.pauseHabit / resumeHabit → habitRepository.updateStatus,
                                       habitRepository.createOverride / deleteOverridesByType

AppContext.deleteHabit
→ DELETE /api/habits/{id}                                         (AppContext.tsx:877)
→ src/app/api/habits/[id]/route.ts (:104, :116 handleError)
→ HabitService.deleteHabit → habitRepository.deleteCascade (6-step $transaction) + AuditLog

AppContext.addHabit
→ POST /api/habits                                               (AppContext.tsx:710)
→ src/app/api/habits/route.ts (:93 auth, :123 handleError)
→ HabitService.createHabit (:131) → habitRepository.create, addTags, addDayTypeAssignments, findWithRelations

AppContext.updateHabit
→ PATCH /api/habits/{id}                                         (AppContext.tsx:742)
→ src/app/api/habits/[id]/route.ts (PATCH aliases PUT at :87–93)
→ HabitService.updateHabit (:194) → habitRepository.update, clearTags/addTags,
                                   clearDayTypeAssignments/addDayTypeAssignments
```

### 3.3 Requests originating in `page.tsx` itself

| Request                        | Called at        | Client used  | Consumed by |
| ------------------------------ | ---------------- | ------------ | ----------- |
| `GET /api/day-types?active=true` | `page.tsx:239` | `fetchWithAuth` | `loadDayTypes()` → `dayTypes` → the day-type `Select` |
| `GET /api/day-mode?date=<today>` | `page.tsx:217` | `fetchWithAuth` | `loadTodayDayType()` → `todayDayType {id,name,dayType}` → the `TODAY_FILTER` sentinel **and** `notDueReason` |
| `GET /api/habits/health?days=28` | `page.tsx:261` | **bare `fetch`** | `fetchHealth()` → `healthData` → `healthByHabit`, `healthSummary`, the per-row meter |
| `GET /api/tags`               | `TagPicker.tsx:130` | `fetchWithAuth` | the tag picker inside both modals |
| `POST /api/tags`              | `TagPicker.tsx:160` | `fetchWithAuth` | inline "new tag" creation |

---

## 4. Frontend architecture

### 4.1 Page structure

| Concern               | Reality                                                                                                                                                          |
| --------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Component kind        | **Client Component** — `page.tsx:1` is literally `'use client'`; `export default function HabitsPage()` at `:134`. Not `async`.                       |
| Sibling route files   | `loading.tsx` (12 lines) and `[id]/` — **no `layout.tsx`, no `error.tsx`, no `not-found.tsx`, no `template.tsx`** at this level.                                 |
| Route-segment loading | `src/app/(dashboard)/habits/loading.tsx` — 5 pulsing `h-14` rows. Renders inside the group `<main className="pb-20 md:pb-8">` and adds its own `p-6`, i.e. double padding. |
| Route-segment error   | **None.** Falls through to `src/app/(dashboard)/error.tsx` (97 lines) — a generic full-page error card, not habit-specific.                                      |
| Layout                | `src/app/(dashboard)/layout.tsx` (69 lines, server) — see §4.6. The comment at `page.tsx:802–809` records that `/habits` used to sit **outside** this group with a hand-rolled `DashboardLayout` and has since moved in. |
| Root layout           | `src/app/layout.tsx` (179 lines) — `ThemeProvider` → `AuthProvider` → `AppProvider` → `CookieConsentProvider`, plus `AutoLogout`, `SWRegistration`, `Analytics`, `CookieConsentBanner` |
| Page metadata         | **None.** No `title`, no `description`, no `generateMetadata`. The page therefore inherits `"<SITE_NAME> — <SITE_TAGLINE>"` from `src/app/layout.tsx:36`. Only `/habits/[id]` generates a title. |

### 4.2 Providers / contexts active on `/habits`

| Provider                                                                          | File                                                | Does it affect `/habits` content?                                                                                                                            |
| --------------------------------------------------------------------------------- | --------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ThemeProvider`                                                                   | `src/components/providers/ThemeProvider.tsx`        | **Yes** — light/dark drives every `bg-card` / `border-border` / `text-muted-foreground` in the row, and the `dark:` half of the health-summary tints.        |
| `AuthProvider` (NextAuth `SessionProvider` + `AuthSync` + `DeviceSessionTracker`) | `src/components/auth/AuthProvider.tsx`              | **Yes, indirectly** — `AppContext.tsx:346` reads `useSession()` and aborts all data loading when there is no session. `AuthSync` pre-loads `UserSettings`, which is what `useUserTimezone()` returns. |
| `AppProvider`                                                                     | `src/context/AppContext.tsx`                        | **Yes — this is the page's primary data layer.** See §4.5.                                                                                                    |
| `CookieConsentProvider`                                                           | `src/components/privacy/CookieConsent.tsx`          | No.                                                                                                                                                          |
| `DataErrorBanner` (layout)                                                        | `src/components/shared/DataErrorBanner.tsx`         | **Yes** — reads `useApp().dataError`, so a failed context fetch renders a banner *and* the page's own `EmptyState` branch. Double reporting.                   |
| `CelebrationHost` (layout)                                                        | `src/components/achievements/CelebrationHost.tsx`   | Indirectly — achievement pops are fed by `AchievementService.checkForUnlocks`, which `/habits`'s log action triggers.                                            |
| `OfflineSync` / `OfflineBanner` (layout)                                          | `src/components/offline/**`                         | Indirectly — habit mutations go through `AppContext`, which does **not** enqueue to `routineos.offline.queue`, so this page has no offline write path.              |
| `SleepPromptHost` (layout)                                                        | `src/components/shared/SleepPromptHost.tsx`         | No — it only early-returns `null` on `/today`.                                                                                                              |
| `FloatingFocusBar` (layout)                                                       | `src/components/focus/**`                           | No content effect.                                                                                                                                           |

`/habits` creates **no** `React.Context` of its own.

### 4.3 State inventory

| State                                          | Kind                       | Owner (`file:line`)                     | Initial                                             | Updated by                                                                                                                                                          | Read by                                                                                          | Persisted                          |
| ---------------------------------------------- | -------------------------- | --------------------------------------- | --------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- | ----------------------------------- |
| `tab`                                          | local `useState`           | `page.tsx:141`                          | `'ACTIVE'`                                          | the three `role="tab"` buttons (`:983`)                                                                                                                              | `statusMap[tab]` filter, row rendering (toggle vs icon tile, action buttons), empty-state copy        | no                                  |
| `dayTypeFilter`                                | local `useState`           | `page.tsx:142`                          | `null` = "All Days"                                 | the `Select` (`:948`), `clearFilters` (`:368`); can hold the `TODAY_FILTER` sentinel string                                                                       | `filteredHabits` memo (`:318`)                                                                   | no                                  |
| `dayTypes`                                     | local `useState`           | `page.tsx:143`                          | `[]`                                                | `loadDayTypes()` (`:244`), which additionally re-filters out `isArchived` (`:245`)                                                                                   | the `Select` options (`:959`)                                                                    | no                                  |
| `dayTypesLoading`                              | local `useState`           | `page.tsx:144`                          | `true`                                              | `loadDayTypes()` `finally` (`:255`)                                                                                                                                  | `Select disabled` (`:961`)                                                                        | no                                  |
| `searchTerm`                                   | local `useState`           | `page.tsx:146`                          | `''`                                                | the search input (`:882`), the clear ✕ (`:890`), `clearFilters` (`:367`)                                                                                             | `filteredHabits` memo (`:335`)                                                                   | no                                  |
| `tagFilter`                                    | local `useState`           | `page.tsx:148`                          | `null` = "All tags"                                 | any `TagChip` on the row or in the strip (`:655`, `:919`), the "All" button (`:904`), `clearFilters` (`:368`)                                                     | `filteredHabits` memo (`:344`), chip `aria-pressed`                                               | no                                  |
| `loadError`                                    | local `useState`           | `page.tsx:150`                          | `null`                                              | `loadDayTypes()` catch (`:251`)                                                                                                                                      | the "Retry filter" button (`:965`), `Select disabled`                                             | no                                  |
| `healthError`                                  | local `useState`           | `page.tsx:152`                          | `null`                                              | `fetchHealth()` (`:268`, `:275`)                                                                                                                                     | the health error note (`:848`)                                                                    | no                                  |
| `modalOpen`                                    | local `useState`           | `page.tsx:153`                          | `false`                                             | "Add Habit" (`:835`), "Add Your First Habit" (`:1050`)                                                                                                             | `<AddHabitModal open>`                                                                           | no                                  |
| `editing`                                      | local `useState<Habit\|null>` | `page.tsx:154`                      | `null`                                              | the Pencil button (`:738`); reset to `null` by `EditHabitModal.onClose`                                                                                             | `<EditHabitModal habit>`                                                                         | no                                  |
| `confirmDelete`                                | local `useState<Habit\|null>` | `page.tsx:155`                      | `null`                                              | the Trash button (`:771`), cleared by `handleDelete` (`:449`) and both footer buttons                                                                                | `<Modal isOpen>` and its body copy                                                                | no                                  |
| `actionError`                                  | local `useState`           | `page.tsx:156`                          | `null`                                              | `runAction` start (`:374`) and catch (`:383`)                                                                                                                        | the alert banner (`:840`)                                                                         | no                                  |
| `busyId`                                       | local `useState`           | `page.tsx:157`                          | `null`                                              | `runAction` start/finally (`:373`, `:385`)                                                                                                                          | every row's `disabled`                                                                            | no                                  |
| `healthData`                                   | local `useState`           | `page.tsx:158`                          | `[]`                                                | `fetchHealth()` success (`:267`); refreshed after **every** `runAction` (`:381`) and after both modals save (`:1079`, `:1084`)                                      | the header summary, `healthByHabit`, the row meter                                                | no                                  |
| `todayDayType`                                 | local `useState`           | `page.tsx:170–175`                      | `{id:null,name:null,dayType:null}`                 | `loadTodayDayType()` success (`:220`); **silently left at the default on any failure** (`:226–228`)                                                                   | the `TODAY_FILTER` option, `filteredHabits`, `notDueReason`                                        | no                                  |
| `timezone`                                     | derived                    | `useUserTimezone()` (`page.tsx:140`)    | `settings.timezone` → browser zone → `'UTC'`                                                                                                                       | `useSettingsLoader` on sign-in                                                                                                                                    | `today`, `notDueReason` date conversion                                                          | via `UserSettings` (server)             |
| `today`                                        | derived                    | `page.tsx:160`                          | `AppContext.selectedDate \|\| getTodayString(timezone)`                                                                                                            | `AppContext` effect seeding `selectedDate` (`AppContext.tsx:355–358`) — **not settable on this page**                                                               | every log lookup, `loadTodayDayType`, `notDueReason`                                              | via `AppContext` (in memory)            |
| `habits`, `dataLoaded`, `dataError`             | **AppContext**             | `AppContext.tsx:361,368,369`            | `[]`, `false`, `null`                                                                                      | `fetchAll()` (`:535–604`)                                                                                                                                         | the whole page                                                                                     | no (re-fetched per mount)              |
| `allTags`                                      | `useMemo`                  | `page.tsx:192–207`                      | derived from `habits[].tags`; a `Map` keyed by `join.tagId`, values `{id,name,color,icon}`, sorted by `localeCompare`                                           | recomputed when `habits` changes                                                                                                                                   | the tag strip, `tagById` fallback                                                                 | no                                  |
| `tagById`                                      | `useMemo`                  | `page.tsx:213`                          | `new Map(allTags.map(t => [t.id, t]))`                                                                        | derived                                                                                               | row chip fallback when `join.tag` is missing                                                      | no                                  |
| `healthByHabit`                                | `useMemo`                  | `page.tsx:286–289`                      | `new Map(healthData.map(h => [h.habitId, h]))`                                                                | derived                                                                                               | `renderHabitRow` (`:457`)                                                                          | no                                  |
| `healthSummary`                                | `useMemo`                  | `page.tsx:291–302`                      | derived: `{overall, healthy, atRisk, unhealthy}`; `overall` = rounded mean over rows with a non-null `completionRate`, else `null`                          | derived                                                                                               | the header summary line                                                                             | no                                  |
| `filteredHabits`                               | `useMemo`                  | `page.tsx:311–351`                      | derived in 4 stages: tab → day type → search → tag                                                            | `[habits, tab, dayTypeFilter, todayDayType.id, searchTerm, tagFilter]`                                 | `renderTierGroup`, `otherHabits`, the empty-state branch                                           | no                                  |
| `statusMap`                                    | module const               | `page.tsx:304–308`                      | `{ACTIVE:['ACTIVE'], PAUSED:['PAUSED'], ARCHIVED:['ARCHIVED','COMPLETED']}`                                                                                             | never                                                                                                | `filteredHabits` (`:313`), `statusCount` (`:364`)                                                 | —                                    |
| `statusCount(t)`                               | plain function             | `page.tsx:363–364`                      | derived — counts habits in tab `t` **before** search/tag filtering                                                                                                    | derived each render                                                                                   | the empty-state title/description/action choice                                                    | —                                    |
| URL / query state                              | —                          | **None**                                | —                                                                                                           | —                                                                                                     | —                                                                                                 | —                                    |
| Optimistic updates                             | **AppContext**             | `AppContext.tsx:703,734,778,802,827,854,870,888` | —                                                                                                      | every mutator patches `habits` (or removes) first, then requests, then rolls back in `catch`                                                                      | the row list                                                                                        | —                                    |

### 4.4 Hooks used on `/habits`

| Hook                              | File                                 | Inputs               | Outputs                                                    | Side effects / API                                                                                                   |
| --------------------------------- | ------------------------------------ | -------------------- | ---------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| `useApp()`                        | `src/context/AppContext.tsx` (re-exported by `src/context/useApp.ts`, 16 lines) | – | 14 of 39 context members, destructured at `page.tsx:135–139` | the context itself performs the network I/O (see §4.5)                                                            |
| `useUserTimezone()`               | `src/hooks/useUserTimezone.ts` (45 lines) | –              | `{timezone, today, isLoading}`                              | reads `useSettings()`; resolution order `:30–39` = `settings.timezone` → `Intl.DateTimeFormat().resolvedOptions().timeZone` → `DEFAULT_TZ('UTC')` |
| `useSettings()` (indirect)        | `src/hooks/useSettings.ts` (71 lines) | –               | the settings store projection                                | `useSettingsLoader` on auth; deduped by a module-level `loadInflight` (`settings.store.ts:75`)                          |
| `useSession()` (indirect)         | `next-auth/react`                    | –                   | session                                                     | read at `AppContext.tsx:346`; `refetchInterval 0`, no window-focus refetch (`layout.tsx`)                             |
| `useEffect` ×2                    | React                                 | `[]` / `[loadTodayDayType]` | –                                                    | `loadDayTypes()` on mount (`:178–180`); `loadTodayDayType()` whenever `today` changes (`:231–233`)                     |
| `useEffect`                       | React                                 | `[fetchHealth]`     | –                                                          | `fetchHealth()` on mount (`:281–284`) — carries an `eslint-disable react-hooks/set-state-in-effect`                     |
| `useCallback` ×2                  | React                                 | `[today]` / `[]`     | stable loaders                                               | identity used as the `useEffect` dependency so the loaders are stable                                                |
| `useMemo` ×7                      | React                                 | see §4.3              | derived values                                               | pure                                                                                                                  |
| `useState` ×13                    | React                                 | —                     | see §4.3                                                     | pure                                                                                                                  |

### 4.5 Observed implementation detail — `AppContext` is the data layer, and it over-fetches

`AppProvider` is mounted in the **root** layout, so it runs on `/habits` — and on every other route. On every page load it issues, in `Promise.all` (`AppContext.tsx:535–548`):

1. `fetchAllHabits()` → a **looped** paginated `GET /api/habits?includeArchived=true&limit=100&offset=N` (`:486–520`). It terminates on `json.meta.hasMore === false`, falling back to `batch.length >= HABIT_FETCH_PAGE` (`:512–518`). Module constants: `HABIT_FETCH_PAGE = 100` (`:333`), `HABIT_FETCH_MAX = 1000` (`:343`) — **the loop is hard-capped at 1,000 habits.**
2. `fetch('/api/routine')` → all routine templates and blocks. **`/habits` never reads `routineBlocks`.**
3. `fetch('/api/goals')` → all goals. **`/habits` never reads `goals`.**

and, once `selectedDate` is set (`:694–697`), `fetchHabitLogs(selectedDate)` → `GET /api/habits/logs?date=`.

`dataLoaded` is set `true` at `:600` **only after all three succeed**; `dataError` is set at `:604` on failure.

Consequences specific to `/habits`:

- **`/habits` pays for two payloads it never reads.** `GET /api/routine` and `GET /api/goals` are ~457 lines of route handler executed on every visit to populate the dashboard / routine / goals widgets.
- **`dataError` is doubly surfaced.** `DataErrorBanner` in the `(dashboard)` layout reads the same field, so a failure produces a banner *and* the page's `EmptyState` branch (`:1018–1028`).
- **`today` is not this page's to choose.** `today = AppContext.selectedDate || getTodayString(timezone)` (`:160`). `selectedDate` is seeded once from `useUserTimezone().today` in an effect (`AppContext.tsx:355–358`) and there is **no date control anywhere on `/habits`** — the "Today" filter sentinel resolves against whatever `selectedDate` currently is, not necessarily the real today.
- **13 of 39 context members are consumed; 26 are not.** Unused on this route: `habitLogs` (raw), `routineBlocks` + 3 mutators, `goals` + 5 mutators, `dayMeta`/`setDayMeta`/`getDayMeta`, `setSelectedDate`, `selectedRoutineTab`/`setSelectedRoutineTab`, `undoStack`/`pushUndo`/`undo`.

> This is a descriptive observation, not a recommendation. Nothing was changed.

---

## 5. Backend / API architecture

Every route below is a Next.js App Router route handler under `src/app/api/**`. Every one performs `await auth()` and returns `{ error: 'Unauthorized' }` with **401** when there is no session. **None** use `withAuth`, `createApiHandler`, `withRateLimit`, or any rate limiter.

### 5.1 Read endpoints

#### `GET /api/habits?includeArchived=true&limit=100&offset=N` — the page's primary load

- **Purpose** — the user's habits with relations and pagination metadata.
- **Validation** — `habitQuerySchema` (`src/schemas/habit.schema.ts:71`): `status` and `tier` string arrays, `categoryId` cuid, `search` string, `sortBy ∈ {name,createdAt,streak,completionRate}`, `sortOrder ∈ {asc,desc}`, `limit` int 1–100, `offset` ≥ 0, `includeArchived` boolean, `dayTypeId` cuid.
- **Service** — `HabitService.listHabits` ∥ `HabitService.countHabits` (`habit.service.ts:39`, `:65`). Both are thin passthroughs to `habitRepository.findAll` / `.countAll`, which **share the same private `buildWhere`** (`habit.repository.ts:166`), so the list and the count can never disagree.
- **`buildWhere` clauses** — `status` (`{in:[…]}`, or `{not:'ARCHIVED'}` when `includeArchived` is falsy, `:173–179`); `tier` (`:182`); `categoryId` (`:189`); `dayTypeAssignments.some.dayTypeId` (`:194`); `tags.some.tagId` (`:203`); `search` → `OR:[{name contains insensitive},{description contains insensitive}]` (`:219–225`).
- **Include shape** — `{category, tags:{include:{tag}}, dayTypeAssignments:{include:{dayType}}, _count:{select:{logs,overrides}}}`, ordered by `buildOrderQuery(HABIT_SORT_COLUMNS[sortBy], sortOrder)` and paginated by `buildPaginationQuery(limit, offset)` — **which caps `take` at `Math.min(limit, 100)`** (`base.repository.ts:58`).
- **Response** — `{ success:true, data, meta:{ total, limit, offset, hasMore } }`.
- **Errors** — 401; 500 `'Failed to fetch habits'`. ⚠️ The GET handler uses a **raw `console.error` + 500** (`habits/route.ts:78–84`) rather than `handleError`, so a `ValidationError` surfaces as a generic 500 rather than a 400.
- **Cost** — one `findMany` with five nested `include`s, plus one `count`.

#### `GET /api/day-types?active=true`

- **Purpose** — the user's own day types for the filter dropdown.
- **Validation** — none on GET.
- **Service** — `DayTypeService.listDayTypes` → `routineRepository.listDayTypeDefinitions(userId)` (filters `isArchived`, no `_count`).
- The page **re-filters `isArchived` client-side anyway** (`page.tsx:245`), which is redundant.
- Without `?active=true` this returns the management list (`listDayTypeDefinitionsWithCounts`). `/habits` only ever asks for `active=true`.
- **Also requested independently by `AddHabitModal.tsx:95` and `EditHabitModal.tsx:108`** — so opening a modal issues a **third** fetch of the same resource on a page that already holds it in `dayTypes`. Not shared, not deduped.

#### `GET /api/day-mode?date=YYYY-MM-DD`

- **Purpose** — resolve the concrete day type for the date being viewed, so the `TODAY_FILTER` sentinel and `notDueReason` have something to work with.
- **Validation** — `date` required and must match `^\d{4}-\d{2}-\d{2}$`, else **400 `'Invalid date'`**.
- **Service** — `DayModeService.getDayMode` (∥): `routineService.listExceptions(userId,date)[0]`, `scoreRepository.findByDate(userId,date)`, `resolveDayTypeForDate(userId,date)`.
- **Response** — `{ success:true, data: DayModeSnapshot }`; the page reads only `dayTypeId`, `dayTypeName`, `dayType`.
- **Failure is silent** — `loadTodayDayType`'s catch block is an intentional no-op with a comment (`:226–228`): the "Today" option is simply omitted.

#### `GET /api/habits/health?days=28`

- **Purpose** — 28-day completion metrics per habit, feeding the per-row meter and the header summary.
- **Validation** — a **local** `healthQuerySchema` (`health/route.ts:6–8`): `z.coerce.number().int().min(7).max(90)`, so `days=28` passes and the range is 7–90.
- **Service** `HabitService.getHabitHealth` (`habit.service.ts:563`):
  1. `UserRepository.getSettings(userId)` → `timezone`; `endDate = getTodayString(timezone)` (`:569–573`); `startDate = format(subDays(parseISO(endDate), windowDays-1))` (`:574`).
  2. `Promise.all([findAll(userId,{status:'ACTIVE'}), findLogsByUserRange(userId, start, end)])` (`:576–579`).
  3. Bucket logs by `habitId` (`:581–586`).
  4. Per habit: `completedCount` / `missedCount` / `skippedCount`; `dueCount = c+m+s`; `completionRate = Math.round(c/due*100)` **or `null`** when `dueCount === 0` (`:590–595`).
  5. Classify: `≥75` → `HEALTHY`; `≥40` → `AT_RISK`; else `UNHEALTHY`; `NO_DATA` when `dueCount === 0` (`:597–600`).
  6. Return `{window, summary{totalActive,withDataCount,healthyCount,atRiskCount,unhealthyCount,overallCompletionRate}, habits[]}` (`:629–640`).
- **Two consequences visible on this page:**
  - **Only `status:'ACTIVE'` habits get a row** (`:577`). PAUSED and ARCHIVED habits therefore show no health bar at all — but they sit in the same list, under the same tab strip, as ACTIVE ones.
  - **`PARTIAL` and `NOT_APPLICABLE` are excluded from `dueCount`.** A habit logged only PARTIAL reports `NO_DATA` and its meter disappears, even though the user has data.
- **Response** — `{ success:true, data:{…} }`. The page reads `data.data.habits` and casts to `HealthRow[]` (`:267`) — `longestStreak` is read by the row (`:589`) but **is never populated by this service**, so the "best N" badge is unreachable. See §24 F7.

#### `GET /api/habits/logs?date=YYYY-MM-DD` (via `AppContext`, once `selectedDate` is set)

- **Validation** — manual regex at `logs/route.ts:33`, falling back to `getTodayString(userTimezone)`. Also calls `UserService.getTimezone(userId)` (`:31`) purely to build that fallback.
- **Service** — `HabitService.getLogsForDate` → `habitRepository.findLogsByUserRange(userId, date, date)`, `orderBy:{date:'asc'}`.
- **Response** — `{ success:true, data }`; `AppContext` stores it as `habitLogs` and `getLogForDate(habitId, date)` does a client-side `.find()` over it (`:938`).
- The page **never reads `habitLogs` directly** — it goes through `getLogForDate`.

#### `GET /api/tags` (from inside `AddHabitModal` / `EditHabitModal`)

- **Auth** — `tags/route.ts:21`. **No Zod validation** on GET.
- **Service** — `TagService.list` → `tagRepository.listForUser`.
- The page itself **does not call this**; it derives `allTags` from the habits it already holds (`:192–207`).

### 5.2 Write endpoints

| Endpoint                     | Method                       | Body                                                                                          | Validation                                                                                                                                                                                                                                                                                                  | Service → Repo                                                                                                                                                                        | Prisma effect                                                                                                                                                        | Response / errors                                                              |
| ---------------------------- | ---------------------------- | --------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| `/api/habits`                | POST                         | full habit payload                                                                           | `createHabitSchema` (`habit.schema.ts:14`): `name` 1–100; `description` ≤500 nullable; `tier` one of **11** values; `categoryId` cuid; `color` `/^#[0-9A-F]{6}$/i` nullable; `icon` nullable; `frequencyType` one of 8; `frequencyValue` nullable; `targetCount` positive int nullable; `startDate`/`endDate` optional-nullable; `reminderTime` `/^\d{2}:\d{2}$/` nullable; `reminderEnabled`, `points` positive, `estimatedDuration` positive int, `difficulty` 1–5, `isPublic`, `tagIds`, `appliesEveryDay`, `dayTypeIds` | `HabitService.createHabit` (`:131`) → `habitRepository.create` (**forces `status:'ACTIVE'` `:154`**, `startDate: startDate ?? new Date()` `:163`, `reminderEnabled ?? false` `:167`, `isPublic ?? false`, `appliesEveryDay ?? true` `:171`), then `addTags(habit.id, tagIds ?? [])` `:175`, then `addDayTypeAssignments` **only if `appliesEveryDay === false`** `:178–180`, then `findWithRelations` `:185`. `points` defaults from `HABIT_TIER_CONFIG[input.tier].defaultPoints` `:145`. Blank name → `ValidationError` `:136`; >100 → `ValidationError` `:140` | `Habit`, `HabitTag`, `HabitDayType`. **No `AuditLog` row**, despite `AuditAction.HABIT_CREATED` existing | 201 `{success:true, data}`; 400 `{error:'Invalid input',details}`; 500 |
| `/api/habits/{id}`           | **PUT** (+ `PATCH` alias `:87–93`) | `{name, description?, tier?, …}` — **`/habits` only ever sends `name`**                      | `updateHabitSchema` = `createHabitSchema.partial().extend({ status })` (`:47–52`). The `status` extension exists because `z.object()` strips undeclared keys and the Edit modal's Status select would silently revert | `HabitService.updateHabit` (`:194`) → `findById` ownership `:200–203`; name >100 → `ValidationError` `:206`; `habitRepository.update` with **every key guarded by `!== undefined`** (`:220–253`, with the rationale comment at `:212–219` that `&&` would silently drop `null`); `categoryId` maps to `connect`/`disconnect` `:225–229`; `endDate` uses `!== undefined` so `null` clears `:243–245`; `if (tagIds)` → `clearTags`+`addTags` `:256–259`; `if (dayTypeIds !== undefined)` → `clearDayTypeAssignments`, then `addDayTypeAssignments` **only if `appliesEveryDay === false`** `:262–267`; `findWithRelations` `:269` | `Habit`, `HabitTag`, `HabitDayType`. **No `AuditLog` row** | `{success:true, data:habit}`; 400; 404; 500 |
| `/api/habits/{id}/log`       | POST                         | `{ habitId, date, status, completedAt? }`                                                   | `logHabitSchema` (`:54`): `habitId` **cuid**, `date` anchored regex, `status ∈ {COMPLETED,MISSED,SKIPPED,NOT_APPLICABLE,PARTIAL}`, `completedAt` optional-**nullable** (the comment at `:58–60` explains `z.coerce.date().optional()` would turn an explicit `null` into 1970-01-01), plus optional `durationMinutes/quantity/difficulty/energyLevel/moodBefore/moodAfter/note` | `HabitService.logHabit` (`:278`) | ① `findById` ownership `:289–292` ② `calculateHabitEligibility(habitId, userId, date)` — **timezone not threaded**, so it re-reads `UserSettings` `:295` ③ **Refuses `COMPLETED` *and* `MISSED`** when ineligible, with a 16-line rationale at `:297–312`; `SKIPPED`/`PARTIAL`/`NOT_APPLICABLE` always allowed `:313–315` ④ `upsertLog` `:319–337` ⑤ streak block, `COMPLETED` only `:343–366`: `streakRepository.findByUserId` — **if no `Streak` row exists nothing happens**; else `calculateStreak(userId, date, habit.tier)`; on change → `recordStreakMilestone` dated to **the log's own day** `:357–362` ⑥ **`await new ScoringService().calculateDailyScore(userId, date)`** `:369` ⑦ `COMPLETED` only → `automationService.handleEvent(HABIT_COMPLETED)` **fire-and-forget** `:378–382` ⑧ `AchievementService.checkForUnlocks(userId)` **fire-and-forget** `:386–388` | `HabitLog` (upsert on `@@unique([userId,habitId,date])`); `Streak`/`StreakMilestone`; **always** rewrites `DailyScore` for the date; may create `AutomationRun`+`Task` and `Achievement`+`NotificationLog`+`ActivityLog` | `{success:true, data:{log, streakUpdated, newStreak?}}`; 400; 500 |
| `/api/habits/{id}/archive`   | POST (`?restore=true`)      | – (body reason is sent by the **detail** dialog, not this page)                               | **none**                                                                                                                                                                                                                                                                                                    | `HabitService.archiveHabit` (`:423`) / `restoreHabit` (`:456`) | archive: `findById` `:429` → `habitRepository.archive` (`status='ARCHIVED'`, `archivedAt = new Date()`) `:434` → `auditRepository.create({action:'HABIT_ARCHIVED', metadata:{reason}?})` `:437–443`. restore: `findById` `:457` → **if `status !== 'ARCHIVED'` returns early with no audit row** `:462–466` → `updateStatus(...,'ACTIVE')` `:468` → audit `HABIT_RESTORED` `:470–475` → `findById` `:477` | `Habit`, `AuditLog`. Neither path touches `ScoringService`, `AchievementService` or `StreakRepository` | `{success:true}`; **400 with `error.message` for any failure** `:43–48` |
| `/api/habits/{id}/pause`     | POST                         | `{ reason?, resumeDate? }` — **`AppContext` sends `{reason: undefined}`**                      | **none**; `await request.json()` is unguarded `:20`                                                                                                                                                                                                                     | `HabitService.pauseHabit` (`:483`) | `findById` `:490` → `updateStatus(...,'PAUSED')` `:496` → **only if `resumeDate`** create `HabitOverride{type:'PAUSE', startDate: today, endDate: resumeDate, reason}` `:499–509`, where `today = new Date().toISOString().split('T')[0]` — **UTC, not the user's timezone** `:500`. **No audit row** | `Habit`, and *usually not* `HabitOverride` — see §24 F4 | `{success:true}`; **400 with `error.message`** `:30–35` |
| `/api/habits/{id}/resume`    | POST                         | –                                                                                              | **none**                                                                                                                                                                                                                                                                                                    | `HabitService.resumeHabit` (`:516`) | `findById` `:518` → if `status !== 'PAUSED'` → `ValidationError('Habit is not paused')` `:523–525` → `updateStatus(...,'ACTIVE')` `:528` → `deleteOverridesByType(habitId,'PAUSE')` `:531`. **No audit row** | `Habit`, `HabitOverride` | `{success:true}`; 400; **500 for the not-paused case** — it is a `ValidationError` but the handler only 400s on a thrown error with a message `:27–32` |
| `/api/habits/{id}`           | **DELETE**                   | –                                                                                              | **none**                                                                                                                                                                                                                                                                                                    | `HabitService.deleteHabit` (`:746`) | `findById` `:748` → `habitRepository.deleteCascade(habitId)` `:754`, a 6-step `$transaction`: `timeEntry.updateMany({habitId:null})` → `habitLog.deleteMany` → `habitOverride.deleteMany` → `habitTag.deleteMany` → `habitDayType.deleteMany` → `habit.delete` → then `auditRepository.create({action:'HABIT_DELETED'})` `:757–762`. **No score recalculation for the affected dates** | `TimeEntry` (detached), `HabitLog`, `HabitOverride`, `HabitTag`, `HabitDayType`, `Habit`, `AuditLog` | `{success:true}`; 400; 404; 500 |
| `/api/tags`                   | GET + POST                   | `{ name, color?, icon? }`                                                                     | POST uses `createTagSchema` (`src/schemas/tag.schema.ts`). **GET has none**                                                                                                                                                                                                                          | `TagService.list` / `TagService.create` → `tagRepository.listForUser` / `.create`                                                                                                   | `Tag`                                                                                                                                                              | `{success:true, data}`; 400; 500 |

### 5.3 Habit API routes that exist but are **not reachable from `/habits`**

| Route                                                    | Lines | What it does                                                                                                    |
| -------------------------------------------------------- | ---- | ------------------------------------------------------------------------------------------------------------- |
| `POST /api/habits/bulk`                                  | 102  | `bulkHabitsSchema` (`:7–14`, `.max(100)` per array). No `/habits` UI.                                            |
| `GET` / `POST /api/habits/today`                         | 86   | `getHabitsForDate` / `dayAddRemoveSchema` (`:41–45`). Used by `/today`. **No ADD/REMOVE-to-today UI here.**         |
| `GET /api/habits/by-day-type/{dayTypeId}`                | 48   | **Bypasses the service** — raw `db.dayTypeDefinition.findFirst` + `db.habit.findMany`.                           |
| `GET` / `POST` / `PUT /api/habits/{id}/day-types`        | 144  | **Bypasses the service** — raw `db.habitDayType.createMany` + `db.habit.update`. A **second, parallel** day-type write path. |
| `DELETE /api/habits/{id}/day-types/{dayTypeId}`          | 47   | **Bypasses the service** — raw `db.habitDayType.deleteMany`, and auto-flips `appliesEveryDay` to `true`. A **third** path. |
| `GET /api/search/habits`                                 | 52   | Not called from this route.                                                                                       |
| `POST /api/bulk/archive`, `POST /api/bulk/delete`        | 44/44| `BulkService` wraps `HabitService`. No `/habits` UI.                                                             |

There are **three** parallel day-type write paths in the codebase; only `HabitService.updateHabit:262–267` is used by `/habits`.

### 5.4 Error-handling inconsistency across the habit routes

`handleError` (from `base.repository.ts:111`) logs via `createLogger('repository')` and re-throws. Habit routes use it inconsistently:

| Route file                          | Handler                                | Consequence                                                                    |
| ----------------------------------- | -------------------------------------- | ------------------------------------------------------------------------------ |
| `habits/route.ts` GET                | raw `console.error` + 500 (`:78–84`)   | `ValidationError` → generic 500, not 400                                    |
| `habits/route.ts` POST               | `handleError` (`:123`)                  | ✅                                                                            |
| `[id]/route.ts` GET                  | raw 500 (`:34–40`)                      | same gap                                                                      |
| `[id]/route.ts` PUT/PATCH/DELETE      | `handleError` (`:79`, `:116`)           | ✅                                                                            |
| `[id]/log`                           | `handleError` (`:82`)                   | ✅                                                                            |
| `[id]/skip`                          | `handleError` (`:49`)                   | ✅                                                                            |
| `[id]/archive`                       | raw `error.message` @ **400** (`:43–48`) | any DB failure reported as 400                                               |
| `[id]/pause`                         | raw `error.message` @ **400** (`:30–35`) | any DB failure reported as 400                                               |
| `[id]/resume`                        | raw `error.message` @ **400** (`:27–32`) | a `ValidationError` surfaces as 400, but a DB failure also 400s              |
| `[id]/note`                          | raw `error.message` @ **400** (`:54–56`) | any DB failure reported as 400                                               |
| `habits/logs`, `habits/health`        | raw 500                                 | acceptable (read-only)                                                        |

---

## 6. Database dependency

### 6.1 Models read/written by `/habits`

| Model                      | Purpose                             | Key fields used by `/habits`                                                                                                                                     | Rel. to User               | Rel. to "today"                          | Read                      | Write                                                       | Indirect                        |
| -------------------------- | ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------- | ---------------------------------------- | ------------------------- | ------------------------------------------------------------ | -------------------------------- |
| `Habit`                    | a tracked habit                     | `id,name,description,tier,status,color,icon,frequencyType,frequencyValue,targetCount,startDate,endDate,archivedAt,reminderTime,reminderEnabled,points,estimatedDuration,difficulty,isPublic,appliesEveryDay,categoryId,streakCount,longestStreak,lastCompletedDate,completionRate` | `userId`                   | via `notDueReason`                        | ✅                        | ✅ (create, update, archive, delete)                          | ✅                              |
| `HabitLog`                 | one habit on one day                | `id,habitId,userId,date,status,completedAt,note`                                                                                                                     | `userId`, `habitId`        | `date` = `selectedDate`                   | ✅                        | ✅ (`logHabit`)                                              | ✅                              |
| `HabitOverride`            | per-date exception                  | `type` ∈ `{SKIP_TODAY,SKIP_RANGE,PAUSE,NOT_APPLICABLE,RESCHEDULE}`, `startDate`,`endDate`,`reason`                                                                  | `userId`, `habitId`        | date range                               | ✅ (`_count.overrides`; `findActiveOverrides` only on `/today`) | ⚠️ **effectively never written by this page** — see §24 F4 | ✅ (from `/today`, not here) |
| `HabitDayType`             | habit ↔ day-type join               | `dayTypeId`                                                                                                                                                          | via `Habit`                | via day type                             | ✅ (`dayTypeAssignments`)  | ✅ (create on add; clear+recreate on edit)                    | ✅                              |
| `HabitTag`                 | habit ↔ tag join                    | `tagId`                                                                                                                                                              | via `Habit`                | –                                        | ✅ (`tags`)               | ✅ (`createMany skipDuplicates` / `deleteMany`)               | ✅                              |
| `Tag`                      | a label                             | `id,name,color,icon`                                                                                                                                                 | `userId`                   | –                                        | ✅ (nested in `tags`)     | ✅ (`POST /api/tags` from `TagPicker`)                        | ✅                              |
| `Category`                 | a grouping                          | `id,name,color,icon`                                                                                                                                                  | `userId`                   | –                                        | ✅ (nested include)       | ❌ (no picker on this page)                                   | ✅                              |
| `DayTypeDefinition`        | user-defined day types              | `id,name,slug,description,color,icon,isDefault,isArchived,sortOrder`                                                                                                  | `userId`                   | via `habitAppliesToDayType`               | ✅                        | ❌ (written from `/routine`)                                  | ✅                              |
| `Streak`                   | streak aggregates                   | `currentStreak`, `longestStreak`, `totalCompletedDays`, `streakStartDate`                                                                                            | `userId @unique`           | –                                        | ✅ (on log)               | ✅ (only if a row already exists)                             | ✅                              |
| `StreakMilestone`          | milestone events                    | `milestoneDays`, `streakType`, `reachedDate`, `celebrated`                                                                                                           | `userId`                   | `reachedDate` = the log's day             | ✅                        | ✅ (indirectly)                                               | ✅                              |
| `DailyScore`               | per-day score snapshot              | every field — rewritten by `calculateDailyScore` on **every** log                                                                                                    | `userId`                   | `@@unique([userId,date])`                | ✅                        | ✅ — **on every habit log**                                   | ✅                              |
| `UserSettings`             | per-user preferences                | `timezone`                                                                                                                                                           | 1:1 (`userId @unique`)     | –                                        | ✅ (eligibility, health)   | ❌                                                          | ✅                              |
| `AutomationRule`           | automations                         | `triggerType`                                                                                                                                                         | `userId`                   | –                                        | ⚠️ possible               | ⚠️ possible                                                 | ✅                              |
| `AutomationRun` / `Task`   | automation execution                | –                                                                                                                                                                    | `userId`                   | –                                        | ❌                        | ⚠️ possible (on `HABIT_COMPLETED`)                         | ✅                              |
| `Achievement`              | unlocked badges                     | `type`, `title`, `level`, `unlockedAt`, `celebrated`                                                                                                                 | `userId`                   | –                                        | ✅                        | ✅ (indirectly, on `COMPLETED` only)                         | ✅                              |
| `NotificationLog`          | in-app/push notifications           | `HABIT_REMINDER`, `ACHIEVEMENT_UNLOCKED`                                                                                                                             | `userId`                   | –                                        | ❌                        | ⚠️ possible                                                 | ✅                              |
| `ActivityLog`              | activity trail                      | –                                                                                                                                                                    | `userId`                   | –                                        | ❌                        | ⚠️ possible                                                 | ✅                              |
| `AuditLog`                 | audit trail                         | `HABIT_ARCHIVED`, `HABIT_RESTORED`, `HABIT_DELETED` **only**                                                                                                        | `userId`                   | –                                        | ❌                        | ✅ (3 of 7 habit actions)                                    | ✅                              |
| `TimeEntry`                | running timer with a habit FK       | `habitId`                                                                                                                                                            | `userId`                   | –                                        | ❌                        | ✅ **`habitId` set to `null`** on delete                     | ✅                              |
| `User`                     | account                             | `id`                                                                                                                                                                 | —                          | –                                        | ✅ (session only)         | ❌                                                          |                                 |

### 6.2 Fields that exist on `Habit` and are **never** written by this page

| Field             | Schema default         | Written by `/habits`?                                                    |
| ----------------- | ---------------------- | ----------------------------------------------------------------------- |
| `streakCount`     | `0`                    | ❌ `habitRepository.updateStreak` exists (`:310`) but has **zero callers** — the per-row 🔥 badge therefore always reads `0` and never renders |
| `longestStreak`   | `0`                    | ❌ same reason                                                            |
| `lastCompletedDate` | `null`                | ❌ same reason                                                            |
| `completionRate`  | `null`                 | ❌ same reason — the row instead renders the **live** health metric from `GET /api/habits/health` |
| `difficulty`      | `null`                 | ❌ no input on either modal                                                |
| `points`          | `null`                 | ❌ no input; the server defaults it from `HABIT_TIER_CONFIG[tier].defaultPoints` (`habit.service.ts:145`) |
| `isPublic`        | `false`                | ❌ no input                                                                 |
| `categoryId`      | `null`                 | ❌ no picker on this page — `category` is included by the repository and **never rendered** |
| `icon`            | `null`                 | ✅ writable via the schema, but **neither modal has an icon picker**, so it is always `null` and the row always falls back to `<Circle/>` (`page.tsx:554`) |
| `estimatedDuration` | `null`               | ❌ no input — yet it **is rendered** at `page.tsx:607` when non-null, so it can only ever be reached by a raw API call |

---

## 7. Date and day-type logic

### 7.1 Which date is "today" on this page

```
AppContext.selectedDate                       ← seeded once, from useUserTimezone().today
        │                                      (AppContext.tsx:355–358); '' before hydration
        │  fallback
        ▼
today = selectedDate || getTodayString(timezone)     (page.tsx:160)
```

There is **no date control on `/habits`**. The consequence is that "Today" in the day-type filter and the row toggle both resolve against `selectedDate`, which can be set from another route and is **not re-derived** if the user crosses local midnight while the page stays open.

### 7.2 `toDateKeyInZone` — the two-shape date problem — `page.tsx:108–123`

The helper's docblock (`:95–107`) documents the trap precisely:

- `habit.startDate` / `endDate` are `DateTime` in Prisma and arrive as full ISO timestamps; they must be shifted into the user's zone before taking the date part.
- A habit created through this page's Add modal stores its dates as **bare `yyyy-MM-dd` strings**, and the repository returns them verbatim. Parsing `"2026-01-01"` with `new Date()` yields midnight **UTC**, which in any negative-offset zone is the previous local day. The recorded symptom: a habit whose start date was today reported "Starts on yesterday" and rendered as **Not due**.

The fix is a strict `BARE_DATE = /^\d{4}-\d{2}-\d{2}$/` regex (`page.tsx:46`, anchored so a full ISO string cannot match):

```
bare date?  → return it untouched
timestamp?  → Intl.DateTimeFormat('en-CA', { timeZone, year, month:'2-digit', day:'2-digit' })
               (en-CA yields YYYY-MM-DD)
catch?      → d.toISOString().slice(0,10)
invalid?    → null
```

### 7.3 Day-type matching — two calls, two sources of truth

```
/habits does:   habitAppliesToDayType(habit, { dayType, dayTypeId })      (page.tsx:419)
server does:    the same function, via calculateHabitEligibility

inputs on /habits:
  dayType   ← todayDayType.dayType  ← GET /api/day-mode  (the resolved enum)
  dayTypeId ← todayDayType.id       ← GET /api/day-mode
```

Because both sides call the same function, the two cannot drift on the enum comparison. They **can** drift on the fixture: the server's `calculateHabitEligibility` calls `resolveDayTypeForDate` per day-type-restricted habit (`eligibility.ts:167`), while the page resolves it once for the whole list. The list filter (`page.tsx:321–326`) is a **different, simpler** test than `habitAppliesToDayType`:

```
list filter   (page.tsx:322–325):
  h.appliesEveryDay === true  ||  h.dayTypeAssignments.some(dta => dta.dayTypeId === effectiveFilter)
                                     ↑ a bare id comparison — no enum fallback

notDueReason  (page.tsx:419–422):
  habitAppliesToDayType(habit, {dayType, dayTypeId})   ↑ id match OR enum match via slug
```

A habit assigned only to a **custom** day type whose definition `slug` does not map to a built-in `DayType` enum value can therefore be **visible under the filter but still enabled** (and vice-versa). See §24 F11.

### 7.4 `isHabitScheduledForDate` — the shared cadence test

`page.tsx:439` calls `src/lib/habits/scheduling.ts isHabitScheduledForDate(habit, date, timezone)` — **the same function the server's `calculateHabitEligibility` uses**, so the client and server cannot disagree on cadence. It reads `frequencyType` + `frequencyValue` + `startDate`/`endDate`.

`frequencyValue` parsing is `src/lib/habits/frequency.ts parseFrequencyConfig` (`:12–31`): it first tries `JSON.parse` (accepting `{daysOfWeek:[…], exactDates:[…]}`), and falls back to the legacy comma-separated / plain-number form (`"1,3,5"` → `{daysOfWeek:[1,3,5]}`; `"4"` → `{daysOfWeek:[4]}`).

### 7.5 `getFrequencyLabel` — what the row actually prints — `frequency.ts:33–68`

| `frequencyType`      | Output                                             |
| -------------------- | -------------------------------------------------- |
| `DAILY`              | `Every day`                                        |
| `SPECIFIC_WEEKDAYS`  | `formatWeekdays(value)` — see below                |
| `WEEKLY_TARGET`      | `{n}x per week` (or `Weekly target` if no value)   |
| `MONTHLY_TARGET`     | `{n}x per month`                                   |
| `YEARLY_TARGET`      | `{n}x per year`                                    |
| `RANDOM`             | `Whenever you want`                                |
| `ONE_TIME`           | `One time`                                         |
| `CUSTOM`             | `Custom schedule`                                  |
| anything else        | `Unknown`                                          |

`formatWeekdays` (`:70–89`) special-cases 7 days → `Every day`, exactly `[1,2,3,4,5]` → `Weekdays`, exactly `[0,6]` → `Weekends`; otherwise `['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].map(...)` joined with `, `.

---

## 8. Complete user actions (serial)

Every action, in the order the user performs it. "Mutator" = `AppContext`; "local" = `page.tsx` state only.

### 8.1 On first mount

| # | Action                                          | Mechanism                                            | Requests |
| - | ----------------------------------------------- | ---------------------------------------------------- | -------- |
| 1 | `AppContext` mounts (root layout, before paint)  | `AppContext.tsx:535–548` `Promise.all`                | `GET /api/habits` (loop, `includeArchived=true&limit=100&offset=N` up to 1,000) ∥ `GET /api/routine` ∥ `GET /api/goals` |
| 2 | No session?                                     | `AppContext.tsx:346` reads `useSession()` — loading aborts                                    | –        |
| 3 | `selectedDate` seeds                            | `AppContext.tsx:355–358`                              | –        |
| 4 | `fetchHabitLogs(selectedDate)`                  | `AppContext.tsx:624–662`, effect on `selectedDate`     | `GET /api/habits/logs?date=` |
| 5 | `loadDayTypes()`                                | `page.tsx:178–180`, `useEffect []`                    | `GET /api/day-types?active=true` |
| 6 | `loadTodayDayType()`                            | `page.tsx:231–233`, `useEffect [loadTodayDayType]`    | `GET /api/day-mode?date=<today>` |
| 7 | `fetchHealth()`                                 | `page.tsx:281–284`, `useEffect [fetchHealth]`         | `GET /api/habits/health?days=28` |
| 8 | Branch A renders                                | `!dataLoaded` → 3 skeleton rows                       | –        |
| 9 | Branch D renders                                | `dataLoaded` → tier groups                            | –        |

**Total on first paint: 4 to 4+N requests** (N = number of 100-habit pages), **two of which (`/api/routine`, `/api/goals`) the page never reads**, and **three of which (`/api/routine`, `/api/goals`, `/api/habits/logs`) are not habit-list data at all** as far as the rendered output is concerned.

### 8.2 Row actions

| # | User action                             | Handler                             | Optimistic? | Request                                                     | Rollback / follow-up |
| - | --------------------------------------- | ----------------------------------- | ----------- | ----------------------------------------------------------- | -------------------- |
| 1 | Click the completion circle (`ACTIVE` tab, not `notDue`) | `toggleToday` `:389–393` → `runAction` `:372` | ✅ `AppContext.logHabit` `:888–905` upserts the local log | `POST /api/habits/{id}/log` `{habitId,date,status}` `:912` | revert on `catch` `:930–933`; `void fetchHealth()` `:381`; `setBusyId(null)` |
| 2 | Click 🔥/📈 badges                     | none — decorative `title` only       | –           | –                                                            | –                    |
| 3 | Click a tag chip on a row               | `setTagFilter(active ? null : join.tagId)` `:655` + `onKeyDown` Enter/Space `:656–661` | local | –                                                | filters the list in place |
| 4 | Click **Pause** (`ACTIVE` tab)          | `runAction(habit.id, () => pauseHabit(habit.id))` `:717` | ✅ `'PAUSED'` `:802` | `POST /api/habits/{id}/pause` `{reason: undefined}` `:805` | revert `:789`-style; `void fetchHealth()` |
| 5 | Click **Play** (`PAUSED` tab)           | `runAction(habit.id, () => resumeHabit(habit.id))` `:728` | ✅ `'ACTIVE'` `:827` | `POST /api/habits/{id}/resume` `:830` | revert; `void fetchHealth()` |
| 6 | Click **Pencil**                        | `setEditing(habit)` `:738`             | –           | –                                                            | opens `<EditHabitModal>` |
| 7 | Click **Archive** (non-`ARCHIVED` tab)  | `runAction(habit.id, () => archiveHabit(habit.id))` `:748` | ✅ `'ARCHIVED'` `:778` | `POST /api/habits/{id}/archive` `:781` | revert `:789`; `void fetchHealth()` |
| 8 | Click **RotateCcw** (`ARCHIVED` tab)    | `runAction(habit.id, () => restoreHabit(habit.id))` `:762` | ✅ `'ACTIVE'` `:854` | `POST /api/habits/{id}/archive?restore=true` `:857` | revert; then **reconciled against the response body** `:859–860` |
| 9 | Click **Trash2** (`ARCHIVED` tab)       | `setConfirmDelete(habit)` `:771`        | –           | –                                                            | opens the delete `Modal` |
| 10 | Confirm **Delete**                      | `handleDelete` `:446–451` → `runAction` | ✅ row removed `:870` | `DELETE /api/habits/{id}` `:877` | **whole-array rollback** `:881`; `void fetchHealth()` |

### 8.3 Filter and navigation actions

| # | User action                       | Handler                    | Effect                                                                                              |
| - | --------------------------------- | -------------------------- | --------------------------------------------------------------------------------------------------- |
| 1 | Type in the search box            | `setSearchTerm` `:882`      | `filteredHabits` re-filters client-side over name + description + tag names (`:335–342`); **no request** |
| 2 | Click the search ✕                 | `setSearchTerm('')` `:890`  | clears the term                                                                                        |
| 3 | Click a tag in the strip / "All"  | `setTagFilter` `:904`, `:919` | re-filters (`:344–346`); **no request**                                                          |
| 4 | Choose a day type                 | `setDayTypeFilter(e.target.value \|\| null)` `:948` | re-filters (`:321–326`); **`TODAY_FILTER` resolves to `todayDayType.id`** (`:318–319`) |
| 5 | Click **Active / Paused / Archived** | `setTab(t)` `:983`      | re-filters, re-groups, and **re-mounts** the whole list through `<AnimatePresence mode="wait">` keyed on `tab` (`:996`) |
| 6 | Click **Add Habit**               | `setModalOpen(true)` `:835` | opens `AddHabitModal` → which itself issues `GET /api/day-types?active=true` again |
| 7 | Click **Retry** (health error)    | `void fetchHealth()` `:854`  | re-issues `GET /api/habits/health?days=28`                                                         |
| 8 | Click **Retry filter** (day-type error) | `void loadDayTypes()` `:968` | re-issues `GET /api/day-types?active=true`                                                     |
| 9 | Click **Clear filters** (empty state) | `clearFilters` `:366`  | resets `searchTerm`, `tagFilter`, `dayTypeFilter`                                                   |
| 10 | Click **Try again** (data error)  | `void reloadData()` `:1024` | re-runs the whole `AppContext.fetchAll()` — i.e. **also** re-issues `/api/routine` and `/api/goals`    |

**There is no `<Link>`, no `href`, and no `router.push` anywhere in `page.tsx`.** See §27.

---

## 9. What can the user create

| Thing                    | Entry point                                                              | Request                                          | Validation                                    | Notes                                                                   |
| ------------------------ | ------------------------------------------------------------------------ | ------------------------------------------------ | --------------------------------------------- | ------------------------------------------------------------------------- |
| **A habit**              | "Add Habit" → `AddHabitModal` → submit                                  | `POST /api/habits` via `AppContext.addHabit` `:710` | `createHabitSchema` — see §5.2                | Form fields actually present: **name**, description, **6 of 11 tiers**, frequency + weekdays + target, `appliesEveryDay` + day-type chips, **12 colour presets + a free colour input + a hex field + a live preview**, reminder time, tags via `TagPicker` |
| **A tag** (inline)       | `TagPicker`'s "new tag name" + Add button, inside either modal          | `POST /api/tags` `TagPicker.tsx:160`            | `createTagSchema`                              | Does **not** reach `page.tsx`'s `allTags` — see §24 F9                     |
| **A `HabitLog`** (today) | clicking a row's completion circle                                      | `POST /api/habits/{id}/log` `:912`             | `logHabitSchema`                              | Toggles `COMPLETED ⇄ MISSED`. Always recalculates the day's `DailyScore`     |
| **A `HabitOverride`**    | —                                                    | —                                                | —                                              | Effectively **never** created from this page — see §24 F4                  |
| **An `AuditLog`**        | Archive / Restore / Delete only                       | via the three above                              | –                                              | Only 3 of the 7 `AuditAction.HABIT_*` values have code paths               |

**Not creatable from this page:** categories (no picker, `GET /api/categories` never called), day types (that is `/routine`), tags in bulk, habits in bulk (`POST /api/habits/bulk` has no UI), `HabitTag` links outside the modals, `HabitDayType` links outside the modals.

---

## 10. What can the user edit

| Target                    | Entry point                            | Request                                   | Validation                | Optimistic | Notes |
| ------------------------- | -------------------------------------- | ----------------------------------------- | ------------------------- | ---------- | ----- |
| Habit name + the Edit modal's full field set | Pencil → `EditHabitModal` → submit | `PATCH /api/habits/{id}` `AppContext.tsx:742` | `updateHabitSchema`       | ✅ `:734`  | The page's own `renderHabitRow` **does not** offer inline rename — unlike `/today`'s `TodayHabitChecklist`, which does. |
| Tab                        | the tab strip                          | –                                         | –                         | –          | local only |
| Day-type filter            | the `Select`                           | –                                         | –                         | –          | local only |
| Tag filter                 | tag chips / "All"                      | –                                         | –                         | –          | local only |
| Search term                | the input                              | –                                         | –                         | –          | local only |
| `today`                    | **nowhere on this page**                | –                                         | –                         | –          | `AppContext.selectedDate` only                                                |

### 10.1 The two modals are not the same form

This matters because the two write through the **same** endpoint with the **same** schema but expose **different subsets**:

| Field                        | `AddHabitModal` | `EditHabitModal` | Divergence |
| ---------------------------- | ---------------- | ---------------- | ---------- |
| Colour presets               | **12** `:400–496` | **6** `:299–315`  | A habit created with a custom hex cannot be **re-shown** in Edit — `aria-pressed={color === c}` is false for all six, so the field appears unset |
| Free colour input + hex + live preview | ✅ `:400–496` | ❌               | –          |
| Tier options                 | **6** `:25–32`    | **7** `:24–32` (adds `OPTIONAL`) | Add cannot produce a tier Edit can show; `createHabitSchema` accepts **11** |
| Frequency types              | + `ONE_TIME`      | + `ONE_TIME`     | Neither offers `RANDOM` or `CUSTOM`; the schema accepts **8**. `HabitScheduleEditor` on the detail page offers `WEEKLY`/`MONTHLY`/`YEARLY` — **which are not `HabitFrequencyType` values at all**, so `updateHabitSchema` rejects them with a 400 |
| `status` select              | ❌                | ✅               | Declared in `updateHabitSchema` (`:51`) purely so `z.object()` does not strip it |
| Icon picker                  | ❌                | ❌               | `src/components/ui/IconPicker.tsx` (111 lines) exists; neither modal uses it |

---

## 11. What can the user delete

| Target                | Entry point                                     | Request                                | Effect                                                                                    |
| --------------------- | ----------------------------------------------- | -------------------------------------- | ----------------------------------------------------------------------------------------- |
| **A habit, permanently** | `ARCHIVED` tab → Trash2 → `Modal` → **Delete** | `DELETE /api/habits/{id}` `:877`       | `habitRepository.deleteCascade` — a 6-step `$transaction`: `timeEntry.updateMany({habitId:null})` → `habitLog.deleteMany` → `habitOverride.deleteMany` → `habitTag.deleteMany` → `habitDayType.deleteMany` → `habit.delete`, then an `AuditLog` with `HABIT_DELETED` |

Deletion is **only** reachable from the `ARCHIVED` tab. A user on `ACTIVE` has no delete affordance at all — archive is the intended two-step, which is why the archive confirmation has no reason prompt and restore exists as the undo.

**Not deletable from this page:** a tag, a category, a `HabitLog` individually, a `HabitOverride` individually, a `HabitDayType` link individually.

---

## 12. Cross-page dependencies

### 12.1 Inbound — what other pages link to `/habits`

| Source                                                        | Target        | Nature |
| ------------------------------------------------------------- | ------------- | ------ |
| `src/server/services/notification.service.ts:540`              | `/habits/${habit.id}` | **`actionUrl` on a `HABIT_REMINDER` push/notification — the only inbound link to the *detail* route in the entire codebase** |
| `src/components/dashboard/HabitHealthWidget.tsx:174, :289`     | `/habits`     | sidebar / widget links |
| `src/components/dashboard/MetricsRow.tsx:231`                  | `/habits`     | metric link |
| `src/app/(dashboard)/search/page.tsx:66`                       | `/habits`     | search-result link |
| `src/app/(dashboard)/today/**` (`AddHabitModal`)              | `POST /api/habits`, `POST /api/habits/{id}` | the **same create path**; `TodayHabitChecklist` embeds the identical component |

### 12.2 Outbound — what `/habits` reads from elsewhere

| Data                                    | Produced by                                  | Drift risk |
| --------------------------------------- | -------------------------------------------- | ---------- |
| `habits`, `dataLoaded`, `dataError`      | `AppContext.fetchAll()` (root layout)        | None — single source.                                                            |
| `selectedDate`                          | `AppContext` effect → `useUserTimezone().today` | **Real.** Set once on mount; a habit logged from `/habits` at 23:59 does not roll over at local midnight, and another route can change it underneath this page without a refetch of the day-mode health data. |
| `timezone`                              | `useUserTimezone()` → `useSettings()` → `UserSettings` | Low. A timezone change does not re-run `loadTodayDayType` (its dependency is `today`, not `timezone`). |
| `dayTypes`                              | `GET /api/day-types?active=true`             | Duplicated: also fetched by both modals.                                                   |
| `todayDayType`                          | `GET /api/day-mode?date=<today>`             | **Not refetched** after a habit log. Logging does not change the day type, so this is benign, but there is no cache invalidation of any kind on this page. |

### 12.3 Sibling pages that share components with `/habits`

| Component           | Also used by                                                                 |
| ------------------- | ----------------------------------------------------------------------------- |
| `AddHabitModal`     | `src/app/(dashboard)/today/TodayHabitChecklist.tsx`                          |
| `EditHabitModal`    | nothing else in `src/` (grep-verified)                                       |
| `TagPicker`         | `AddHabitModal`, `EditHabitModal`, `src/components/journal/**`, `src/components/goals/**` |
| `TagChip`           | `page.tsx` (row chips + filter strip), `TagPicker` internals                 |
| `Button`, `Select`, `Modal`, `EmptyState`, `Input`, `Checkbox` | the whole app via `src/components/ui/index.tsx` |

---

## 13. Impact analysis

### 13.1 If `AppContext` stops loading

The page shows **Branch B**: `EmptyState` "Could not load your habits" + "Try again". Simultaneously `DataErrorBanner` in the `(dashboard)` layout renders, because it reads the same field. Two error surfaces for one failure.

### 13.2 If `GET /api/habits/health` fails

**Only** the health chrome disappears: the header's `H · A · U · %` summary and every row's meter. The `healthError` note (`:848–860`) states this explicitly: *"Health metrics are unavailable; everything else is unaffected."* The rest of the page is fully functional. This is the correct isolation boundary and the docblock at `:846–847` calls health "supplementary".

### 13.3 If `GET /api/day-types` fails

The `Select` is `disabled` and the inline "Retry filter" button appears. `TODAY_FILTER` is never added. Filtering by day type becomes impossible but the tab strip, search and tag filter all still work.

### 13.4 If `GET /api/day-mode` fails

**Silent** by design (`:226–228`). The `TODAY_FILTER` option is simply absent from the `Select`, and `notDueReason` returns `null` for day-type-restricted habits — i.e. the toggle **stays enabled** for a habit that may not be due. That is the documented conservative fallback, and the failure is invisible to the user.

### 13.5 Blast radius of one row completion

`POST /api/habits/{id}/log` is by far the heaviest action in the app. One click cascades through **eight** write targets:

```
HabitLog (upsert)
  → Streak (read; write only if a row already exists)
  → StreakMilestone (insert, dated to the log's own day)
  → DailyScore (full recompute: habits + habitLogs + routineLogs + sleepLog + userSettings → upsert)
       ├─ automationService.handleEvent(HABIT_COMPLETED)            fire & forget
       │     → AutomationRule (read) → AutomationRun + Task (write, via dynamic import of task.service)
       └─ AchievementService.checkForUnlocks                        fire & forget
             → Achievement (read all, early-bail)
             → on unlock: Achievement (write) + NotificationLog + ActivityLog
→ and the ROUTE fires a SECOND score recalculation:
  log/route.ts:56–62  →  ScoringService.recalculateDate   fire & forget
```

See §24 F3 for the double recalculation.

### 13.6 What happens to a habit's history on delete

`deleteCascade` hard-deletes `HabitLog` rows for that habit **across all dates**. Those logs were inputs to `DailyScore` rows for those dates, and **no score is recomputed**, so every affected day keeps a score that included a habit the user has since deleted. Nothing re-derives it. This is by design (scores are snapshots) but it means `GET /api/score/[today]` — which *does* recalculate for today — can disagree with a historical date it serves from storage.

---

## 14. Current System Capabilities

What `/habits` demonstrably does today:

1. **Lists** every habit the context holds, across three status tabs (`ACTIVE`, `PAUSED`, `ARCHIVED` + `COMPLETED`), with relations: category, tags, day-type assignments, and `_count` of logs/overrides.
2. **Groups by tier** into three labelled groups (`Core Habits` = `GROWTH`, `Growth Habits` = `BONUS`, `Lifestyle Habits` = `LIFESTYLE`) plus a catch-all `More Habits` for the other eight tier values. Each group is sorted by `name.localeCompare`.
3. **Filters** by status tab, day type (including a `TODAY` sentinel that resolves live), tag, and a free-text term over name + description + tag names — all **client-side**, so instant and never stale.
4. **Shows a 28-day health meter per row** with a `role="meter"` and four bands (`HEALTHY` / `AT_RISK` / `UNHEALTHY` / `NO_DATA`), plus a header roll-up of counts and the mean completion rate.
5. **Toggles completion for `selectedDate`**, distinguishing all five `HabitLogStatus` values with their own glyph, colour, badge text and accessible name — not a single "done/not-done" boolean.
6. **Disables the toggle and explains why** for habits not due: not active, wrong day type, before `startDate`, after `endDate`, or off-cadence — with the specific reason in the `title`, the `aria-label`, and a visible "Not due" pill.
7. **Runs the full habit lifecycle**: pause → resume → archive → restore → delete, each optimistic with rollback.
8. **Creates and edits habits** through two modals with tier, frequency, weekday selection, target, day-type assignment, colour (presets + picker + hex + live preview), reminder time and tags.
9. **Creates tags inline** from inside the create/edit modal.
10. **Renders the habit's own colour** as a left rail and avatar tint via `color-mix(in oklab, …)`, so a pastel choice stays legible in both themes.
11. **Surfaces the day-type restriction** as chips, and the pathological empty case (`appliesEveryDay === false` with zero assignments) as an explicit amber "never scheduled" warning.
12. **Distinguishes the two empty causes** — "you have no habits in this tab" vs "your filters excluded everything" — via `statusCount(tab)` computed **before** the search and tag filters.
13. **Isolates failures** per data source, so a broken health query does not break the list.
14. **Uses the shared `Modal`** for delete confirmation, which supplies a focus trap, Escape, initial focus, focus restore, scroll lock and a title-bound `role="dialog"` — replacing a hand-rolled `role="alertdialog"` overlay that had none of them (the rationale is preserved in the docblock at `page.tsx:1087–1101`).

---

## 15. Currently NOT Supported

### 15.1 Dead service/repository code (verified by full-tree grep)

| Item                                        | Location                       | Evidence |
| ------------------------------------------- | ------------------------------ | -------- |
| `HabitService.getLogsInRange`               | `habit.service.ts:553`         | zero callers in `src/` |
| `HabitService.getHabitAnalytics`            | `habit.service.ts:769`         | zero callers in `src/` — returns counts, `completionRate`, `averageDifficulty` and the full log list, all of which would be useful *here* |
| `HabitRepository.updateStreak`              | `habit.repository.ts:310`      | zero callers — `Habit.streakCount`, `longestStreak`, `lastCompletedDate`, `completionRate` are **never written by any flow** |
| `HabitRepository.countByStatus`             | `habit.repository.ts:768`      | zero callers; an orphaned `/** Count habits by status */` docblock sits above `addTags` at `:673–676` |
| `src/lib/habits/lifecycle.ts` (32 lines)    | –                              | `canArchiveHabit`, `canDeleteHabit`, `getHabitHealthScore`, `getHabitStatus` — self-referential only |
| `src/lib/habits/pause.ts` (22 lines)        | –                              | `isHabitPaused`, `getPauseStatus`, `shouldAutoResume` — self-referential only |
| `src/lib/habits/skip.ts` (25 lines)         | –                              | `createSkipOverride`, `isHabitSkippedOnDate`, `getSkipReason` — self-referential only |
| `src/server/domain/habit/habit-frequency.ts` (241), `habit-rules.ts` (226), `habit.entity.ts` (222) | – | imported **only by each other** (`habit.entity.ts:18`, `habit-rules.ts:12`) |
| `src/lib/validation/habits.ts` (94 lines)  | –                              | duplicate/shadow schema module, **zero importers**. Its `logHabitSchema` uses `z.string().uuid()` for `habitId` (`:4`) while the canonical `src/schemas/habit.schema.ts:55` uses `z.string().cuid()` — a trap if anyone adopts it |
| `calculateCompletionTarget`                 | `frequency.ts:91–133`          | zero callers |
| ~15 unused interfaces in `src/types/habit.ts` | `:206–430`                    | `HabitFrequency`, `HabitSchedule`, `HabitAnalytics`, `HabitTrendData`, `HabitCalendarData`, `HabitQueryParams`, `HabitFilterOptions`, `TodayHabit`, `TodayHabitsByTier`, `HabitHistoryEntry`, `HabitHistoryRange`, `ArchiveHabit*`, `PauseHabit*`, `ResumeHabit*`, `SkipHabit*` |
| `parseFrequencyValue` export                | `HabitScheduleEditor.tsx:55`   | exported, used only inside that file |
| `HABIT_TIER_CONFIG.longDescription` / `.examples` / `.recommendedFrequency`, `getHabitTierColor` / `Label` / `Weight` / `Points`, `HABIT_TIERS_ORDERED` | `constants/habit-tiers.ts` (245 lines) | only `.defaultPoints` (via `habit.service.ts:145`) is used |
| `HabitEligibilityReason.SCHEDULED`, `isHabitWithRelations`, `isValidHabitLogStatus`, `HabitGroupedByTier`, `HabitsByDate`, `HabitCompletionMap` | `types/habit.ts` | unused |

### 15.2 Dead UI surface — fields the page renders or the schema accepts but no control exists for

| Field                     | Rendered / accepted at                        | Reachable through the UI? |
| ------------------------- | ---------------------------------------------- | ------------------------- |
| `habit.estimatedDuration` | rendered `page.tsx:607`                       | ❌ no input in either modal |
| `habit.icon`              | rendered `page.tsx:554` (falls back to `<Circle/>`) | ❌ no icon picker in either modal, although `IconPicker.tsx` exists and the schema accepts it |
| `habit.category`          | **never rendered on `/habits`**                 | ❌ no category picker; `GET /api/categories` never called |
| `habit.difficulty`        | not on `/habits`                                | ❌ no input |
| `habit.points`            | not on `/habits`                                | ❌ no input |
| `habit.isPublic`          | not on `/habits`                                | ❌ no input |
| `habit.streakCount`       | rendered `page.tsx:581–588`                    | ❌ **never written by any flow** — the badge never renders |
| `health.longestStreak`    | rendered `page.tsx:589–596`                    | ❌ never populated by `getHabitHealth` — the badge never renders |
| `TagPicker`'s **`onTagsLoaded`** prop | declared `TagPicker.tsx:39`, called `:135`, `:172` | ❌ **neither modal passes it** — a tag created inline cannot reach `page.tsx`'s `allTags` memo |
| `TagChip`'s **`onRemove`** | `TagPicker.tsx:57`, `:98–112`                 | ❌ `/habits` never passes it (correct — that branch is the filter's job), so it is dead on this route |
| `GET /api/habits?search=` | wired `route.ts:30` → schema `:77` → repo `:219–225` | ❌ the page filters client-side and never sends it |
| `GET /api/habits?tagId=`  | `route.ts:44` reads it into `queryData`, **but `habitQuerySchema` has no `tagId` key** → `z.object()` strips it → `validated.data.tagId` is `undefined` → the repository's `tagId` branch (`:203–205`) is **unreachable from the API** | ❌ dead at the wire |
| `habitQuerySchema.sortBy` values `updatedAt`, `longestStreak`, `points` | handled by `HABIT_SORT_COLUMNS` (`habit.repository.ts:22–30`) | ❌ the schema only allows `name|createdAt|streak|completionRate` |

### 15.3 Missing entirely

- **No pagination, sorting or server-side filtering.** The page renders the whole context array. Above 1,000 habits the loop silently truncates (`HABIT_FETCH_MAX`, `AppContext.tsx:343`) with no indication.
- **No reorder.** `sortOrder` exists on `Category` but not on `Habit`; there is no drag handle.
- **No bulk edit.** `POST /api/habits/bulk` exists with no UI.
- **No habit duplication.**
- **No schedule preview.** A habit's next N scheduled days cannot be previewed from here.
- **No inline rename**, unlike `/today`.
- **No date picker** — `today` is not this page's to choose.
- **No navigation to `/habits/[id]`.** See §27.
- **No per-habit note editing.** `PATCH /api/habits/{id}/note` and `HabitNotes` exist on the detail route only.
- **No inline status `<select>`**; status changes only through the row icon buttons.
- **No pause reason or resume date UI**, so `HabitOverride{type:'PAUSE'}` is never written.
- **No tooltip library usage.** Every hover affordance is a native `title`.
- **No `totalLoaded` notice**, despite the docblock at `:333–334` referring to one. It was described and not built.

---

## 16. Loading / Error / Empty / Edge states

### 16.1 Loading

| State                        | Trigger                        | Rendering |
| ---------------------------- | ------------------------------ | --------- |
| **Route loading**            | server→client navigation       | `src/app/(dashboard)/habits/loading.tsx` — 5 pulsing `h-14` rows. Renders **inside** the group `<main className="pb-20 md:pb-8">` and adds its own `p-6`, so it is double-padded relative to its siblings. |
| **In-page loading**          | `!dataLoaded`                  | `page.tsx:1012–1017` — `aria-busy="true"` + `aria-label="Loading habits"` + **3** pulsing `h-[74px]` rows. ⚠️ **Disagrees with `loading.tsx`, which renders 5.** |
| **Day-type dropdown**        | `dayTypesLoading`              | `Select disabled` (`:961`) — no spinner, no text |
| **Health columns**           | while `fetchHealth` is in flight | **No skeleton at all.** The meter simply does not render (`health?.completionRate` is `undefined`). This is why `healthError`'s docblock notes the empty `catch` "meant the columns silently disappeared … with no message at all". |
| **Row action**               | `busyId === habit.id`          | All four row buttons + the toggle become `disabled`; `runAction`'s `finally` clears it. No per-button spinner. |

### 16.2 Error

| Error           | Where set                              | Surface |
| --------------- | -------------------------------------- | ------- |
| `actionError`   | `runAction` catch `:383`               | `<p role="alert">` destructive banner at `:840–844`, above everything |
| `dataError`     | `AppContext.tsx:604`                   | **Two surfaces at once:** `DataErrorBanner` (layout) **and** the `EmptyState` Branch B (`:1018–1028`) |
| `healthError`   | `fetchHealth` `:268`, `:275`           | A muted inline note at `:848–860` with a **Retry** button — deliberately *not* a page-level error, per the docblock at `:846–847` |
| `loadError`     | `loadDayTypes` catch `:251`            | `Select disabled` + a "Retry filter" link (`:965–973`) |
| day-mode failure| `loadTodayDayType` catch `:226–228`    | **None** — the `TODAY_FILTER` option is omitted and `notDueReason` degrades to permissive. Documented as intentional. |
| render crash    | any                                  | Falls through to `src/app/(dashboard)/error.tsx` (97 lines) — a generic card, plus `ErrorReporter.reportClientError`. **There is no habit-specific `error.tsx`.** |

### 16.3 Empty

The page distinguishes **five** distinct empty presentations:

| # | Condition                                | Title                              | Description                                              | Action                          |
| - | ---------------------------------------- | ---------------------------------- | -------------------------------------------------------- | -------------------------------- |
| 1 | `dataError`                              | `Could not load your habits`       | `dataError` (the raw message)                            | **Try again** → `reloadData()`  |
| 2 | `!dataLoaded`                            | — (skeleton)                       | —                                                        | —                                |
| 3 | `statusCount(tab) === 0`                 | `No {active\|paused\|archived} habits` | ACTIVE: *"Add your first habit to start tracking your consistency."* PAUSED/ARCHIVED: `''` | ACTIVE only → **Add Your First Habit** |
| 4 | `statusCount(tab) > 0` but filtered = 0  | `No matching habits`               | *"None of your {tab} habits match the current search and filters."* | **Clear filters**               |
| 5 | a tier group is empty                    | — (group hidden)                   | —                                                        | —                                |

The distinction between #3 and #4 is the point of `statusCount` (`:363–364`), and its docblock (`:353–362`) is explicit that telling a 40-habit user to "Add your first habit" because their search matched nothing is "exactly the kind of wrong-but-confident message this page has been producing".

### 16.4 Edge cases and how they are handled

| Edge case                                                | Handling                                                                                       |
| -------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| `habit.tags` is `undefined` / empty                     | `?? []` at every access (`:195`, `:340`, `:345`, `:647`); the chip row is skipped entirely      |
| `join.tag` missing on a join row                        | falls back to `tagById.get(join.tagId)` (`:648`), then `null` and the chip is skipped           |
| `habit.dayTypeAssignments` empty **with** `appliesEveryDay === false` | amber **"No day types selected — never scheduled"** (`:688`) — a real user-visible dead state surfaced explicitly |
| `habit.description` is null                             | not rendered (`:633`)                                                                          |
| `health.completionRate` is `null` (no data)             | the entire meter block is skipped (`:610`)                                                    |
| `health.longestStreak` is `undefined`                   | `health?.longestStreak && … > …` short-circuits (`:589`)                                      |
| `completionRate` is `0`                                 | `!== null && !== undefined` is true, so **a 0% bar does render**                               |
| `startDate` before / after the viewed date              | `notDueReason` rules 3–4 (`:432–435`)                                                        |
| `endDate` is null                                       | guarded (`:434`)                                                                               |
| `todayDayType.dayType` is null (custom day type)         | `notDueReason` returns `null` for day-type-restricted habits — **toggle stays enabled** (`:417`) |
| `todayDayType` unresolved (day-mode failed)              | same fallback, plus the `TODAY_FILTER` option is absent                                        |
| Crossed local midnight while the page is open            | `today` does **not** re-derive; `loadTodayDayType`'s effect does not re-run                    |
| Filter matches nothing while `statusCount > 0`           | **Clear filters** action (`:1054`)                                                            |
| `busyId` set and the user clicks another row's button    | the *other* row is unaffected — `busyId` is a single id, not a global lock                     |
| A tag exists on a habit but no habit in the current tab carries it | the tag simply drops out of `allTags`, per the docblock at `:186–191` — correct behaviour |
| `tiER_ACCENT` has no entry for the habit's tier          | `?? null` → no rail, no tint (`:488–491`)                                                     |

---

## 17. Authentication & security

| Concern                | Reality                                                                                                                        |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| Session enforcement    | Every one of the 12 endpoints this page touches performs `await auth()` and returns **401 `{error:'Unauthorized'}`** with no session.   |
| User identity          | **Never client-supplied.** `habitId` comes from the URL and every service method does `habitRepository.findById(habitId, userId)` → `findFirst({where:{id, userId}})` before any write. `HabitService.updateHabit:200–203`, `logHabit:289–292`, `archiveHabit:429`, `pauseHabit:490`, `resumeHabit:518`, `deleteHabit:748` all do this. |
| `userId` in Prisma `where` | `habitRepository.update` and `.delete` use `where:{id, userId}` — Prisma's compound-unique trick, so a wrong-owner update throws rather than silently succeeding. |
| **The one method that skips the ownership check** | `HabitService.removeHabitFromToday:686` never calls `findById` — unlike all 18 sibling methods. Not reachable from `/habits`, but a latent IDOR-adjacent gap. |
| Input validation       | `createHabitSchema`, `updateHabitSchema`, `logHabitSchema`, `habitQuerySchema` are all `z.object` — **unknown keys are silently stripped**. `updateHabitSchema` exists as `createHabitSchema.partial().extend({status})` precisely because `status` had to be declared or the Edit modal's Status select would revert (`:49–51`). |
| Clearable fields       | Every field the Edit modal can empty is `.nullable()` — the module docblock (`:6–12`) explains that `{field: undefined}` never reaches the server because `JSON.stringify` drops it. `frequencyValue` is nullable specifically so switching away from `SPECIFIC_WEEKDAYS` can clear a stale `"1,3,5"`. |
| `completedAt`          | `optionalNullableDateSchema`, **not** `z.coerce.date().optional()` — the comment at `:58–60` records that the coerce form would turn an explicit `null` (un-checking a habit) into `1970-01-01` and persist it, because `new Date(null)` is a valid date. |
| `color` format          | `/^#[0-9A-F]{6}$/i` — no CSS injection surface.                                                      |
| `reminderTime` format   | `/^\d{2}:\d{2}$/` — anchored.                                                                  |
| XSS                    | No `dangerouslySetInnerHTML` anywhere in `page.tsx` or the modals. Values are React children.  |
| CSRF                   | All writes are `fetch`/`fetchWithAuth` with `credentials:'include'`, same-origin cookie JWT. **No CSRF token.** Standard for a Next.js + NextAuth-JWT app but worth recording. |
| Rate limiting          | **None.** No `withRateLimit` on any habit route. `POST /api/habits/{id}/log` triggers a full score recompute plus two fire-and-forget fan-outs and is unlimited. |
| Audit trail            | Only 3 of 7 `AuditAction.HABIT_*` values are ever written: `HABIT_ARCHIVED`, `HABIT_RESTORED`, `HABIT_DELETED`. **`HABIT_CREATED`, `HABIT_UPDATED`, `HABIT_PAUSED`, `HABIT_RESUMED` have no code path at all.** |
| Barrel import          | `page.tsx:15` imports 4 primitives from `src/components/ui/index.tsx`, which re-exports 26 modules — pulling `RichTextEditor` (147 lines), `ColorPicker` (117), `Dialog` (137), `Tooltip` (58), `Pagination` (91) and the rest into this route's chunk. Bundle cost, not a security issue. |
| a11y on the toggle     | `aria-pressed={done}`, a full `aria-label` that states the *next action* and the *not-due reason*, and a `title` that states the current state. `role="meter"` + `aria-valuenow/min/max` on the health bar. `role="tablist"`/`role="tab"`/`aria-selected` on the tab strip. `role="alert"` on the action error. |
| a11y on the delete modal | Uses the shared `Modal`, which supplies focus trap, Escape, initial focus, focus restore, scroll lock and `role="dialog"` bound to its own title id. |
| a11y on tag chips      | `role="button"`, `tabIndex={0}`, an `onKeyDown` handler for Enter **and** Space with `preventDefault()`, `aria-pressed`/`aria-label` describing the next action, and a `title`. |
| `tsconfig` strictness  | `strict`, `noUnusedLocals`, `noUnusedParameters`, `noUncheckedIndexedAccess` are all on (`tsconfig.json`). `noUnusedLocals` is why `page.tsx` has zero unused imports — the unused surface is entirely in **props** and **dead service methods**. |
| Lint                   | `eslint .` with `next/core-web-vitals`, `next/typescript`, `prettier`. `page.tsx:282` carries a targeted `eslint-disable react-hooks/set-state-in-effect`. |

---

## 18. Performance

### 18.1 Request cost

| Metric                       | Value                                                                                    |
| ---------------------------- | ---------------------------------------------------------------------------------------- |
| Requests on first paint      | **4 + N**, where N = `ceil(habits / 100)` capped at 10                                   |
| Requests the page reads      | 3 of those (`/api/habits`, `/api/day-types`, `/api/day-mode`, `/api/habits/health`) — **`/api/routine` and `/api/goals` are never read** |
| Requests per row action      | 1 write + **1 read** (`fetchHealth`, `void`, `:381`)                                    |
| Requests per **modal open**  | **+1** — each modal independently re-fetches `GET /api/day-types?active=true`            |
| Requests per filter keystroke| **0** — search, tag and day-type filters are all client-side                           |
| Requests per tab switch      | **0** — the list re-groups in place; `AnimatePresence mode="wait"` re-mounts             |
| Pollers                      | **none** — unlike `/today`, this page has no interval                                    |

### 18.2 Render cost

- `renderHabitRow` is a **plain function**, not a component. It is passed directly to `.map()` (`:794`, `:1067`) while **also** setting `key={habit.id}` on its root `motion.div` (`:495`) — React therefore adds a second wrapper key. Harmless, but it signals the function was written for a keyed-render call site that no longer exists.
- Every row is a `framer-motion` `layout` element (`:496`), which means the browser is measuring and animating each one on filter/tab change.
- `useMemo` coverage is good: `allTags`, `tagById`, `healthByHabit`, `healthSummary`, `filteredHabits` are all memoised with correct dependency arrays. `notDueReason`, `statusCount`, `runAction`, `toggleToday` and `renderHabitRow` are **not** memoised, but they are per-render functions over the same data, so the cost is bounded by habit count.
- `filteredHabits` runs `localeCompare` in `renderTierGroup` (`:789`) and again for `otherHabits` (`:800`) — two sorts per render, both `O(n log n)` over the filtered set.

### 18.3 Query cost

- `GET /api/habits` issues **one** `findMany` with five nested `include`s plus a `count`. The `_count.select` on `logs` and `overrides` is the most expensive part of it and the page **never reads** either count.
- `GET /api/habits/health` issues `getSettings` + `findAll(ACTIVE)` + `findLogsByUserRange` = 3 queries, and it re-reads **every active habit** on every call — and `fetchHealth` runs after **every single row action**.
- `POST /api/habits/{id}/log` is the heaviest write in the app (§13.5) — 8 write targets, one of which is a full `DailyScore` recompute, **and a second one from the route** (§24 F3).

### 18.4 Known waste

| # | Waste                                                                                          | Where |
| - | ---------------------------------------------------------------------------------------------- | ----- |
| 1 | `/api/routine` + `/api/goals` fetched and discarded                                              | `AppContext.tsx:546–547`, `:556–586` |
| 2 | `_count.{logs,overrides}` computed, never read                                                   | `habit.repository.ts:108` |
| 3 | `GET /api/day-types` fetched three times on one page visit                                        | `page.tsx:239`, `AddHabitModal.tsx:95`, `EditHabitModal.tsx:108` |
| 4 | `dayTypes` re-filtered for `isArchived` client-side although the service already filtered it       | `page.tsx:245` |
| 5 | Health refetched after **every** action, including ones that cannot affect it (edit, pause, archive) | `page.tsx:381` |
| 6 | `findWithRelations` runs twice per `/habits/[id]` request (once in `generateMetadata`, once in the page) | `[id]/page.tsx:19–36` and `:45` |
| 7 | `calculateDailyScore` runs twice per log                                                         | `habit.service.ts:369` (awaited) + `log/route.ts:56–62` (fire-and-forget) |

---

## 19. External integrations

**None are triggered synchronously by this page.** Specifically:

- **No e-mail send.** `HabitService.archiveHabit` writes an `AuditLog`, not a notification.
- **No web push** from this page. `HABIT_REMINDER` push is sent by `notification.service.ts` (the cron's job) and its `actionUrl` is `/habits/${habit.id}` — the only inbound link to the detail route.
- **No AI call.**
- **No calendar sync, no billing call.**
- **Indirect only:** logging a habit `COMPLETED` triggers `AchievementService.checkForUnlocks` (fire-and-forget), which may create `NotificationLog` rows of type `ACHIEVEMENT_UNLOCKED`, and `automationService.handleEvent(HABIT_COMPLETED)` (fire-and-forget), which reads `AutomationRule` and may write `AutomationRun` + `Task`.

---

## 20. Background jobs / cron effects

`/habits` has **no** cron-driven or scheduled behaviour of its own. It is, however, both a **writer** and a **reader** of cron-owned data:

| Cron endpoint (`src/app/api/cron/**`)         | Relationship to `/habits`                                                                                     |
| ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| `compute-daily-scores`                         | Writes the same `DailyScore` rows `/habits` triggers on every log. Bounded to 200 rows/run, idempotent via upsert. |
| `generate-insights`                            | A **stub** returning `generated: 0`. No relationship.                                                          |
| `sleep-notifications`                          | Sends `HABIT_REMINDER`? No — it handles sleep. Habit reminders are a separate concern; see §19.                |
| habit reminders                               | `HABIT_REMINDER` `NotificationLog`s with `actionUrl = /habits/{id}`. Whichever job creates them, **the only inbound link to the detail route.** |

---

## 21. Data flow diagrams

### 21.1 Page load

```
  Browser
    │
    ├─ root layout mounts AppProvider ─────────────────────────────────────┐
    │                                                                      │
    │   AppContext.fetchAll()  Promise.all:                               │
    │     ├─ loop: GET /api/habits?includeArchived=true&limit=100&offset=N │
    │     │         → auth → habitQuerySchema → listHabits ∥ countHabits   │
    │     │         → findAll ∥ countAll → prisma.habit.findMany/count     │
    │     ├─ GET /api/routine      → AppContext.routineBlocks  (UNUSED)    │
    │     └─ GET /api/goals        → AppContext.goals         (UNUSED)    │
    │   then (once selectedDate set): GET /api/habits/logs?date=           │
    │   → dataLoaded = true   OR   dataError = <message>                  │
    │                                                                      │
    ├─ page.tsx useEffect []        → GET /api/day-types?active=true      │
    ├─ page.tsx useEffect [lTDay]  → GET /api/day-mode?date=<today>       │
    └─ page.tsx useEffect [fetchHealth] → GET /api/habits/health?days=28   │
                                                                          │
    └──────────────────────────► render                                   │
                                     !dataLoaded → 3 skeleton rows         │
                                     dataError   → EmptyState + Try again  │
                                     empty       → EmptyState + action      │
                                     else        → tier groups of rows     │
```

### 21.2 Completing a habit

```
  click circle
    │
    ├─ toggleToday(habit)                      page.tsx:389
    │    log = getLogForDate(id, today)        AppContext.tsx:938  (pure, client)
    │    next = log?.status === 'COMPLETED' ? 'MISSED' : 'COMPLETED'
    │
    ├─ runAction(id, () => logHabit(...))      page.tsx:372
    │    setBusyId(id); setActionError(null)
    │
    ├─ AppContext.logHabit                     AppContext.tsx:886
    │    OPTIMISTIC: upsert local log          :888–905
    │    POST /api/habits/{id}/log
    │      │
    │      ├─ auth()                            log/route.ts:16        → 401 on failure
    │      ├─ logHabitSchema.parse             schemas/habit.schema.ts:54
    │      │
    │      ├─ HabitService.logHabit            habit.service.ts:278
    │      │    1 findById (ownership)                              :289
    │      │    2 calculateHabitEligibility
    │      │        → re-reads UserSettings (tz not threaded)       :295
    │      │        → refuses COMPLETED/MISSED when ineligible      :313
    │      │    3 upsertLog                                       :319
    │      │    4 if COMPLETED: findByUserId(Streak)                :344
    │      │        → calculateStreak → recordStreakMilestone      :357
    │      │    5 await calculateDailyScore(userId, date)          :369  ◄── WRITE
    │      │    6 ff handleEvent(HABIT_COMPLETED)                  :378
    │      │    7 ff AchievementService.checkForUnlocks            :386
    │      │
    │      └─ ROUTE ALSO: ff ScoringService.recalculateDate        log/route.ts:56  ◄── SECOND SCORE WRITE
    │
    ├─ reconcile (accepts `data.log` or bare `data`)  :919
    ├─ catch → revert the optimistic upsert            :930
    ├─ void fetchHealth()                               :381   (no await, deliberate)
    └─ finally setBusyId(null)                          :385
```

### 21.3 The not-due gate

```
  renderHabitRow(habit)
    │
    └─ notDueReason(habit, today)                     page.tsx:411
         │
         ├─ status !== 'ACTIVE'                      → "This habit is not active."
         ├─ appliesEveryDay === false
         │    └─ todayDayType.dayType is null?        → null  (cannot decide → ENABLED)
         │       └─ habitAppliesToDayType(...) false? → "Restricted to <names>."
         ├─ toDateKeyInZone(startDate, tz) > today    → "Starts on YYYY-MM-DD."
         ├─ toDateKeyInZone(endDate,   tz) < today    → "Ended on YYYY-MM-DD."
         ├─ !isHabitScheduledForDate(...)             → "Not scheduled for YYYY-MM-DD."
         └─ otherwise                                 → null  (ENABLED)

       null  → button enabled, aria-label "Mark <name> done"
       str   → button disabled + "Not due" pill + title + aria-label = the reason
```

---

## 22. File-by-file dependency inventory

Paths relative to the repo root. Line counts are `(Get-Content).Count`.

### 22.1 Route files — `src/app/(dashboard)/habits/`

| File                       | Lines | Directive     | Export                                       |
| -------------------------- | ----- | ------------- | -------------------------------------------- |
| `page.tsx`                  | 1124  | `'use client'` | `default function HabitsPage()` `:134`       |
| `loading.tsx`               | 12    | server        | `default function HabitsLoading()` `:1` — 5 pulsing `h-14` rows |
| `[id]/page.tsx`             | 51    | server        | `generateMetadata()` `:19`, `default async function HabitDetailPage()` `:39` |
| `[id]/HabitDetailClient.tsx`| 435   | `'use client'` | `default function HabitDetailClient({habit})` `:51` |
| `[id]/loading.tsx`          | 42    | server        | `default function HabitDetailLoading()` `:1`  |
| `[id]/error.tsx`            | 48    | `'use client'` | `default function HabitDetailError({error,reset})` `:12` |

There is **no `error.tsx`, no `layout.tsx`, no `not-found.tsx`, no `template.tsx`** at the `/habits` level.

### 22.2 Direct components — `src/components/habits/`

| File                  | Lines | `'use client'`? | Renders |
| --------------------- | ----- | -------------- | ------- |
| `AddHabitModal.tsx`   | 522   | ✅ `:1`         | Full create form: name, description, tier (6), frequency + weekdays + target, `appliesEveryDay` + day-type chips, 12 colour presets + `<input type=color>` + hex field + live preview, reminder time, `TagPicker`. Footer via `Modal footer` + `form={formId}`. |
| `EditHabitModal.tsx`  | 331   | ✅ `:1`         | Same form minus colour-preview/hex (**6 presets**); 7 tiers; adds `OPTIONAL` + `ONE_TIME`; a `status` select. Internally `Modal` → `EditHabitForm` keyed by `habit.id` `:61`. |
| `TagPicker.tsx`       | 272   | ✅ `:1`         | Two exports: **`TagPicker`** (default) — load/select chips + inline "New tag name" + Add; and **`TagChip`** — a pill with a colour dot, optional icon, name, optional remove `×`. `onClick` and `onRemove` are deliberately separate props (`:49–54`). `GET /api/tags` `:130`, `POST /api/tags` `:160`. |

### 22.3 Detail-only components — also under `src/components/habits/`

| File                       | Lines | Renders |
| -------------------------- | ----- | ------- |
| `HabitScheduleEditor.tsx`  | 281   | `Card` + `Select` frequency + M/T/W/T/F/S weekday circles + target + **Save schedule** / **Reset**. Also exports `parseFrequencyValue()` `:55`. |
| `HabitNotes.tsx`           | 168   | Today's-note textarea + save; the last 20 notes listed. `GET /api/habits/{id}` `:36`, `PATCH .../note` `:70`. |
| `HabitArchiveDialog.tsx`   | 86    | Hand-rolled fixed-overlay archive dialog with an optional reason textarea. `POST /api/habits/{id}/archive` `:25` via **bare `fetch`**. |
| `HabitHistory.tsx`         | 36    | 30 colour-coded squares (`4×4 w-4`), `title` = status; `date-fns` `format`/`subDays`/`isSameDay`/`parseISO`. |
| `HabitFrictionCard.tsx`    | 30    | Orange warning card: "Friction Detected", `reliability`%, suggestion. |

No orphan files in `src/components/habits/` — all eight are accounted for.

### 22.4 UI primitives

| File                        | Lines | Pulled in by                                   |
| --------------------------- | ----- | ---------------------------------------------- |
| `src/components/ui/index.tsx` | 26  | `page.tsx:15` — the **barrel**; re-exports 26 modules |
| `ui/Button.tsx`              | 52  | page, both modals, `Modal` footer               |
| `ui/EmptyState.tsx`          | 52  | `page.tsx:1019`, `:1030`                        |
| `ui/Select.tsx`              | 55  | page `:946`, both modals, `HabitScheduleEditor`  |
| `ui/Modal.tsx`               | 166 | page `:1102`, both modals                       |
| `ui/Input.tsx`               | 98  | both modals                                    |
| `ui/Checkbox.tsx`            | 73  | both modals (Radix `CheckboxPrimitive.Root`)     |
| `ui/Spinner.tsx`             | 14  | `Button`                                        |
| `ui/Card.tsx`                | 26  | `HabitScheduleEditor` (detail route only)        |
| `ui/modal-frame.ts`          | 53  | `Modal`                                         |

**Barrel cost:** importing 4 primitives from `index.tsx` also drags `RichTextEditor` (147), `ColorPicker` (117), `Tooltip` (58), `Dialog` (137), `Pagination` (91) and the rest into the `/habits` route chunk, though none are rendered here.

### 22.5 Client-side lib / hook / store

| File                            | Lines | Role on `/habits` |
| ------------------------------- | ----- | ----------------- |
| `src/context/AppContext.tsx`     | 1168  | the data layer — 14 of 39 members consumed |
| `src/context/useApp.ts`          | 16    | `useApp()` |
| `src/hooks/useUserTimezone.ts`   | 45    | `{timezone}` |
| `src/hooks/useSettings.ts`       | 71    | indirect, via `useUserTimezone` |
| `src/store/settings.store.ts`    | 174   | indirect — loaded once by `AuthProvider`, deduped by a module-level `loadInflight` `:75` |
| `src/lib/api-client.ts`          | –     | `fetchWithAuth` (`credentials:'include'`, `cache:'no-store'`) |
| `src/lib/habits/frequency.ts`    | 133   | `getFrequencyLabel`, `parseFrequencyConfig` |
| `src/lib/habits/scheduling.ts`   | –     | `isHabitScheduledForDate` — the shared cadence test |
| `src/lib/habits/day-type-match.ts`| –     | `habitAppliesToDayType` — the shared enum match |
| `src/lib/habits/eligibility.ts`  | –     | **server-side only** (via `calculateHabitEligibility`) |
| `src/lib/scheduling/resolve-routine.ts` | – | **server-side only** (via `resolveDayTypeForDate`) |
| `src/lib/dates.ts`               | –     | `getTodayString` |
| `src/lib/utils.ts`               | –     | `cn` |
| `src/constants/habit-tiers.ts`   | 245   | `HABIT_TIER_CONFIG` — only `.defaultPoints` is used |
| `src/constants/prisma-enums.ts`  | –     | **not needed here** — `page.tsx:11` imports `DayType` as a *type*, which is erased at compile time, so it is safe in a client file |

**No `src/store/*` file is imported by `page.tsx` or any of its direct components.**

### 22.6 Server-side files reached

| File                                        | Lines | Reached via |
| ------------------------------------------- | ----- | ----------- |
| `src/app/api/habits/route.ts`               | –     | GET + POST   |
| `src/app/api/habits/[id]/route.ts`          | –     | GET/PUT/PATCH/DELETE |
| `src/app/api/habits/[id]/log/route.ts`      | –     | POST         |
| `src/app/api/habits/[id]/archive/route.ts`  | –     | POST         |
| `src/app/api/habits/[id]/pause/route.ts`    | –     | POST         |
| `src/app/api/habits/[id]/resume/route.ts`   | –     | POST         |
| `src/app/api/habits/[id]/skip/route.ts`     | –     | detail route only |
| `src/app/api/habits/[id]/note/route.ts`     | –     | detail route only |
| `src/app/api/habits/logs/route.ts`          | –     | GET          |
| `src/app/api/habits/health/route.ts`        | –     | GET          |
| `src/app/api/day-mode/route.ts`             | –     | GET          |
| `src/app/api/day-types/route.ts`            | –     | GET          |
| `src/app/api/tags/route.ts`                 | –     | GET + POST   |
| `src/app/api/achievements/unlock/route.ts`  | –     | indirectly, via `AchievementService` |
| `src/server/services/habit.service.ts`       | 820   | 17 of 20 exported methods reachable |
| `src/server/services/scoring.service.ts`     | –     | `calculateDailyScore`, `recalculateDate` |
| `src/server/services/achievement.service.ts` | –     | `checkForUnlocks` (ff) |
| `src/server/services/automation.service.ts`  | –     | `handleEvent(HABIT_COMPLETED)` (ff) |
| `src/server/services/day-mode.service.ts`    | –     | `getDayMode` |
| `src/server/services/day-type.service.ts`    | –     | `listDayTypes` |
| `src/server/services/tag.service.ts`         | –     | `list`, `create` |
| `src/server/repositories/habit.repository.ts`| 786   | ~30 methods |
| `src/server/repositories/base.repository.ts` | 122   | `buildPaginationQuery`, `buildOrderQuery`, `handleError` |
| `src/server/repositories/audit.repository.ts`| 233   | `create` |
| `src/server/repositories/streak.repository.ts`| 212  | `findByUserId` |
| `src/server/repositories/user.repository.ts`  | 523   | `getSettings` |
| `src/server/repositories/tag.repository.ts`   | 175   | `listForUser`, `create` |
| `src/server/repositories/score.repository.ts` | 303   | `findByDate`, upsert |
| `src/server/repositories/routine.repository.ts`| 965  | `findLogsByDate` (scoring), `listDayTypeDefinitions` |
| `src/server/repositories/sleep.repository.ts`   | 232   | `findByDate` (scoring) |
| `src/server/repositories/automation.repository.ts`| 163 | `findActiveByTriggerType`, `markTriggered` |
| `src/server/repositories/achievement.repository.ts`| 120 | `findByUserId`, `create` |
| `src/server/repositories/time-entry.repository.ts`| 232 | `updateMany` inside `deleteCascade` |
| `src/server/repositories/notification.repository.ts`| 468 | `createNotification` for `ACHIEVEMENT_UNLOCKED` |
| `src/schemas/habit.schema.ts`   | 89   | `createHabitSchema`, `updateHabitSchema`, `logHabitSchema`, `habitQuerySchema` |
| `src/schemas/tag.schema.ts`     | –    | `createTagSchema` |
| `src/schemas/focus.schema.ts`   | –    | `optionalNullableDateSchema` (imported by `habit.schema.ts:2`) |
| `src/types/habit.ts`            | 479  | `HabitWithRelations` `:36`, `CreateHabitInput` `:77`, `UpdateHabitInput` `:101`, `LogHabitInput` `:142`, `HabitEligibilityReason` `:229–248` |
| `src/types/routine.ts`          | –    | `DayTypeDefinition` |
| `prisma/schema.prisma`          | 2466 | `Habit` `:944–1010`, `HabitLog` `:1012–1042`, `HabitOverride` `:1044–1062`, `HabitTag` `:751–760`, `Tag` `:731–749`, `Category` `:703–729`, `HabitDayType` `:2384–2395`, `DayTypeDefinition` `:2355–2381`, `MinimumDayTemplateHabit` `:1086–1097`, plus 7 enums |

### 22.7 Prisma enums in the habits domain

```prisma
enum HabitTier {           // schema.prisma:69–81 — 11 values
  NON_NEGOTIABLE GROWTH BONUS OPTIONAL EXPERIMENTAL UNDEFINED
  ALTERNATIVE SPECIAL FLEXIBLE JUST_FOR_FUN LIFESTYLE
}

enum HabitStatus {         // :83–89
  DRAFT ACTIVE PAUSED ARCHIVED COMPLETED
}

enum HabitLogStatus {      // :91–97
  COMPLETED MISSED SKIPPED NOT_APPLICABLE PARTIAL
}

enum HabitOverrideType {   // :99–105
  SKIP_TODAY SKIP_RANGE PAUSE NOT_APPLICABLE RESCHEDULE
}

enum HabitFrequencyType {  // :107–116 — 8 values
  DAILY SPECIFIC_WEEKDAYS WEEKLY_TARGET MONTHLY_TARGET
  YEARLY_TARGET RANDOM ONE_TIME CUSTOM
}

enum DayType {             // :52–59 — the ROUTINE taxonomy
  WORKDAY WEEKEND HOLIDAY EXAM_DAY LOW_ENERGY CUSTOM
}
```

⚠️ There is **no `HabitDayType` enum** — `HabitDayType` is a **model** (`:2384–2395`). `page.tsx:11`'s `import type { DayType } from '@/generated/prisma'` is the routine `DayType`, and it is a *type-only* import so it is erased at compile time and safe in a `'use client'` file.

### 22.8 Key Prisma model shapes

```prisma
model Habit {                                            // :944–1010
  id        String  @id @default(cuid())
  userId    String
  user      User    @relation(..., onDelete: Cascade)

  name        String
  description String? @db.Text
  tier        HabitTier   @default(GROWTH)
  status      HabitStatus @default(ACTIVE)

  categoryId String?
  category   Category? @relation(..., onDelete: SetNull)

  color String?
  icon  String?

  frequencyType  HabitFrequencyType
  frequencyValue String?     // "1,3,5" weekdays | "4" Nx/week | "20" Nx/month
  targetCount    Int?        // countable habits

  startDate  DateTime  @default(now())
  endDate    DateTime?
  archivedAt DateTime?

  reminderTime    String?
  reminderEnabled Boolean @default(false)

  points            Float?
  estimatedDuration Int?
  difficulty        Int?

  isPublic Boolean @default(false)

  appliesEveryDay     Boolean      @default(true)
  dayTypeAssignments HabitDayType[]

  // cached — and per §6.2, NEVER written by this flow
  streakCount       Int     @default(0)
  longestStreak     Int     @default(0)
  lastCompletedDate String?
  completionRate    Float?

  logs                  HabitLog[]
  overrides             HabitOverride[]
  minimumDayTemplates   MinimumDayTemplateHabit[]
  tags                  HabitTag[]
  timeEntries           TimeEntry[]

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@index([userId, status])  @@index([userId, isPublic])  @@index([categoryId])
  @@index([userId, createdAt])  @@index([status, tier])
}

model HabitLog {                                         // :1012–1042
  id      String @id @default(cuid())
  habitId String ; habit Habit @relation(..., onDelete: Cascade)
  userId  String ; user  User  @relation(..., onDelete: Cascade)

  date   String          // YYYY-MM-DD
  status HabitLogStatus

  completedAt     DateTime?
  durationMinutes Int?
  quantity        Int?

  difficulty  Int?   // 1-5
  energyLevel Int?   // 1-5
  moodBefore  Int?   // 1-5
  moodAfter   Int?   // 1-5

  note String? @db.Text
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@unique([userId, habitId, date])   ◄── the upsert key
  @@index([userId, date])  @@index([date, userId])  @@index([habitId, status])
}

model HabitOverride {                                    // :1044–1062
  id      String @id @default(cuid())
  habitId String ; habit Habit @relation(..., onDelete: Cascade)
  userId  String ; user  User  @relation(..., onDelete: Cascade)

  type      HabitOverrideType
  startDate String
  endDate   String?
  reason    String? @db.Text
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@index([habitId, startDate])  @@index([userId, type])  @@index([userId, createdAt])
}

model HabitTag {                                         // :751–760
  id      String @id @default(cuid())
  habitId String ; habit Habit @relation(..., onDelete: Cascade)
  tagId   String ; tag   Tag   @relation(..., onDelete: Cascade)
  @@unique([habitId, tagId])  @@index([tagId])
}

model HabitDayType {                                     // :2384–2395
  id        String            @id @default(cuid())
  habitId   String            ; habit   Habit             @relation(Cascade)
  dayTypeId String            ; dayType DayTypeDefinition @relation(Cascade)
  createdAt DateTime @default(now())
  @@unique([habitId, dayTypeId])  @@index([dayTypeId])
}
```

### 22.9 Providers / layouts

| File                                | Lines | Mounts |
| ----------------------------------- | ----- | ------ |
| `src/app/layout.tsx`                | 179   | `ThemeProvider` `:153` → `AuthProvider` `:154` → **`AppProvider` `:155`** → `CookieConsentProvider` `:156` → `AutoLogout` `:157` → `SWRegistration` `:158` → `Analytics` `:163` (only after consent) → `{children}` `:164` → `CookieConsentBanner` `:171`. `metadataBase` = `SITE_URL` `:28`; `title.template = '%s \| RoutineOS'` `:35–38`. |
| `src/app/(dashboard)/layout.tsx`    | 69    | server; `export const metadata = privateMetadata('RoutineOS')` `:34` → `noindex, nofollow` for the whole group. `SkipLink` `:43` → `OfflineSync` `:44` → `OfflineBanner` `:45` → `DataErrorBanner` `:48` → `Sidebar` `:51` → `<div flex-col>` → `Header` `:55` → `<main id="main-content" className="flex-1 pb-20 md:pb-8">` `:57–59` → `{children}` → `Footer` `:61` → `MobileNav` `:62` → `FloatingFocusBar` `:63` → `CelebrationHost` `:64` → `SleepPromptHost` `:65`. |

---

## 23. Current behavior summary

### 23.1 What actually happens, end to end

1. The root layout's `AppProvider` fetches the full habit list (paginated, up to 1,000), **plus all routine templates and all goals, which this page never reads**. It sets `dataLoaded` on success or `dataError` on failure.
2. The page fetches day types, the day's day-mode snapshot, and 28-day health metrics — three independent requests, three independent failure surfaces.
3. It groups the filtered set into three named tier groups plus a catch-all, sorting each by name.
4. Each row shows: a completion toggle with a per-status glyph, the name with a struck-through treatment when done, a status badge for the four non-COMPLETED statuses, a "Not due" pill with a specific reason when the toggle is disabled, the frequency label, the target, the reminder time, the estimated duration, a 28-day health meter, the description, tag chips, day-type chips, and up to four lifecycle buttons revealed on hover or focus.
5. Completing a row issues one POST that cascades into eight write targets, including **two** full `DailyScore` recomputations, then a background health refetch.
6. Pause / resume / archive / restore / delete are each optimistic with rollback, and each is followed by a health refetch — including for actions that cannot possibly change health.
7. Delete is reachable only from the `ARCHIVED` tab and is confirmed in the shared accessible `Modal`.

### 23.2 The shape of the page in one line each

| Dimension            | Reality |
| -------------------- | ------- |
| Rendering strategy   | fully client-side; **no server component, no server fetch, no streamed data** |
| Data ownership       | `AppContext` (root) + 3 page-local fetches + `useUserTimezone` |
| Data size            | the entire habit set, capped at 1,000 by `HABIT_FETCH_MAX` |
| Filtering            | 100% client-side across 4 dimensions (status, day type, tag, text) |
| Writes               | 7 distinct endpoints, all optimistic |
| Real-time            | none — no polling, no websocket, no `router.refresh` |
| Offline              | **none.** `AppContext` mutators do not enqueue to `routineos.offline.queue`, so every write requires a live connection. |
| Date control         | none on this page; inherits `AppContext.selectedDate` |
| Accessibility        | strong on the toggle, meter, tabs, chips and modal; **no tooltip library anywhere** — every hover affordance is a native `title` |
| Internationalisation | none — all copy is hard-coded English literals |
| Tests                | **none.** `tests/` contains only `lib/routine-duration.test.ts` and `domain/score-calculator.test.ts`. No habits test, no component test. |

---

## 24. Findings register

**This pass changed no code.** Every item below is a recorded observation with a proposed fix, not a repair. Severity: **H** = wrong behaviour or a dead feature a user can notice · **M** = wasted work or an internal inconsistency · **L** = cosmetic or hygiene.

| #  | Sev | Finding                                                                                                                  | Location                     | Impact                                                                                                  | Suggested fix |
| -- | --- | ------------------------------------------------------------------------------------------------------------------------ | ---------------------------- | ------------------------------------------------------------------------------------------------------- | ------------- |
| F1 | **H** | `health.longestStreak` is read by the row (`:589`) but **never populated** by `getHabitHealth`, so the "best N" badge is permanently unreachable. | `page.tsx:589–596` vs `habit.service.ts:629–640` | A rendered branch that can never fire.                                                                 | Add `longestStreak` to the service response, or drop the branch. |
| F2 | **H** | `Habit.streakCount` / `longestStreak` / `lastCompletedDate` / `completionRate` are **never written by any flow**. `habitRepository.updateStreak` exists (`:310`) and has **zero callers**. | `habit.repository.ts:310`; rendered `page.tsx:581–588` | The 🔥 streak badge can never render. Any future sort/filter on those columns returns zeros.                | Either call `updateStreak` from `logHabit`'s streak block, or stop rendering the badge and delete the dead columns. |
| F3 | **H** | **One habit log recalculates `DailyScore` twice** — once awaited in the service (`habit.service.ts:369`), once fire-and-forget from the route (`log/route.ts:56–62`). | `habit.service.ts:369` + `log/route.ts:56–62` | 2× the score query cost per completion, and the two can race — the fire-and-forget one can land after the awaited one. | Delete the route's extra `recalculateDate`. |
| F4 | **H** | **`pauseHabit` never creates a `PAUSE` override from this page.** `AppContext.pauseHabit(id)` always sends `{reason: undefined}` → `JSON.stringify` drops it → `pause/route.ts:21` destructures `undefined` → `HabitService.pauseHabit:499` sees no `resumeDate` → the override branch is skipped. The `resumeDate`/`reason` half of the method is dead from this page, and `GET /api/habits/{id}` (which includes `overrides`) shows the user nothing. | `AppContext.tsx:798` → `pause/route.ts:21` → `habit.service.ts:499–509` | "Pause" is a pure status flip with no scheduled resume — the feature reads as more than it is. Also `today` is computed as **UTC** at `:500`, not the user's timezone. | Add a resume-date field to the pause action, or delete the override branch from the service. Use `getTodayString(tz)`. |
| F5 | **M** | `/habits` fetches `GET /api/routine` and `GET /api/goals` and never reads either. ~457 lines of unrelated route handler on every visit. | `AppContext.tsx:546–547`, `:556–586` | Wasted latency and DB work on every page load, `/habits` included. | Make `fetchAll` per-route, or split the context into per-route loaders. |
| F6 | **M** | `fetchHealth()` runs after **every** `runAction`, including `edit`, `pause`, `resume`, `archive`, `restore`, `delete` — none of which can change a 28-day completion rate except by making the habit leave the `ACTIVE` set. | `page.tsx:381` | 1 extra 3-query health read per action. | Only refetch health after a log or a status change. |
| F7 | **M** | `GET /api/habits?tagId=` is **dead at the wire**: `habits/route.ts:44` reads it into `queryData`, but `habitQuerySchema` has no `tagId` key, so `z.object()` strips it and `validated.data.tagId` is `undefined`. The repository's `tagId` branch (`:203–205`) and the `// tagId was declared on habitQuerySchema` comment at `route.ts:42–43` are both wrong. | `habits/route.ts:42–44` vs `habit.schema.ts:71–84` | Server-side tag filtering can never be used.                                                                 | Add `tagId: z.string().cuid().optional()` to `habitQuerySchema`. |
| F8 | **M** | **`dayTypeFilter` can never match a non-`ACTIVE` habit's day-type chips semantically**, because the list filter (`:322–325`) is a bare `dta.dayTypeId === effectiveFilter` while `notDueReason` (`:419–422`) uses `habitAppliesToDayType` (id match **or** enum-via-slug). A habit assigned only to a custom day type with no enum mapping can be visible under the filter yet still enabled. | `page.tsx:321–326` vs `:416–429` | Visible/enabled disagreement on custom day types. | Make the list filter use `habitAppliesToDayType` too. |
| F9 | **M** | `TagPicker`'s **`onTagsLoaded`** prop is declared (`TagPicker.tsx:39`) and called (`:135`, `:172`), but **neither `AddHabitModal.tsx:505` nor `EditHabitModal.tsx:319` passes it.** A tag created inline cannot reach `page.tsx`'s `allTags` memo until the habit is saved *and* the whole list re-fetches. | `TagPicker.tsx:39`; `AddHabitModal.tsx:505`; `EditHabitModal.tsx:319` | A tag the user just created is invisible in the filter strip. | Pass `onTagsLoaded` from both modals. |
| F10 | **M** | `AuditAction.HABIT_CREATED`, `HABIT_UPDATED`, `HABIT_PAUSED`, `HABIT_RESUMED` **have no code path at all** — only `HABIT_ARCHIVED`, `HABIT_RESTORED`, `HABIT_DELETED` are written. | `habit.service.ts:131`, `:194`, `:483`, `:516` | Four of seven lifecycle actions are invisible to the audit trail, despite the enum existing. | Add `auditRepository.create` calls mirroring `:437`, `:470`, `:757`. |
| F11 | **M** | `health` covers **only `status:'ACTIVE'` habits**, so PAUSED and ARCHIVED rows show no meter — while sitting in the same list under the same tab strip as ACTIVE ones, and next to a header summary that describes only ACTIVE habits. | `habit.service.ts:577`; `page.tsx:610`, `:816–831` | The roll-up is silently scoped to a subset the UI does not say so about. | Either pass `status` through, or label the summary "active habits". |
| F12 | **M** | **`PARTIAL` and `NOT_APPLICABLE` are excluded from `dueCount`**, so a habit logged only PARTIAL reports `NO_DATA` and its meter disappears despite the user having data. | `habit.service.ts:590–595` | A legitimate habit silently loses its metric.                                                                   | Include them in `dueCount`, or add a separate `NO_DATA` definition. |
| F13 | **M** | `page.tsx:1022` passes `description={dataError}` where `dataError: string \| null` and `EmptyStateProps.description?: string` — a mismatch under `strictNullChecks`. | `page.tsx:1022`; `EmptyState.tsx:10`; `tsconfig.json:38` | Should fail `npm run type-check`; verify.                                                                            | `description={dataError ?? undefined}`. |
| F14 | **M** | The in-page skeleton renders **3** rows (`:1014`) while `loading.tsx` renders **5** (`:4`) — the two loading states disagree. | `page.tsx:1014` vs `loading.tsx:4` | A visible pop when the route segment hands over to the page.                                                            | Make both 4, or make `loading.tsx` match the page. |
| F15 | **M** | `HabitScheduleEditor` offers `WEEKLY`, `MONTHLY`, `YEARLY` (`:32–34`) as frequency types, which are **not `HabitFrequencyType` values at all**, so `updateHabitSchema` (`habit.schema.ts:28`) rejects them with a 400. | `HabitScheduleEditor.tsx:32–34` | The detail route's Schedule tab offers three choices that always fail. | Use `WEEKLY_TARGET` / `MONTHLY_TARGET` / `YEARLY_TARGET`. |
| F16 | **M** | `/habits/[id]` runs `HabitRepository.findWithRelations` **twice per request** — once in `generateMetadata` (`:19–36`) and once in the page (`:45`) — and then `JSON.parse(JSON.stringify(habit))` (`:50`) re-serialises a value Prisma already produced for the wire. | `[id]/page.tsx:19–36`, `:45`, `:50` | 2× the query cost per detail view.                                                                              | `cache()` / `React.cache()` the repository call, or drop the DB query from `generateMetadata`. |
| F17 | **M** | Six habit routes report **any** failure as **400** by returning the raw `error.message`: `archive`, `pause`, `resume`, `note`. | `archive/route.ts:43–48`, `pause:30–35`, `resume:27–32`, `note:54–56` | A database outage is reported to the client as a bad request.                                                          | Route `ValidationError` to 400 and everything else through `handleError`. |
| F18 | **M** | `habits/route.ts` GET and `[id]/route.ts` GET use raw `console.error` + 500 rather than `handleError`, so a `ValidationError` becomes a 500. | `habits/route.ts:78–84`; `[id]/route.ts:34–40` | Wrong status codes on read paths.                                                                                   | Use `handleError` consistently. |
| F19 | **M** | `pause/route.ts:20` calls `await request.json()` **unguarded**, so an empty body throws before the handler. | `pause/route.ts:20` | 500 on a bodyless POST.                                                                                            | Wrap in `try`/`catch` or default to `{}`. |
| F20 | **M** | `HabitService.restoreHabit` uses `updateStatus`, which **never clears `archivedAt`** — and always restores to `ACTIVE`, so a habit that was `PAUSED` before being archived cannot be restored as `PAUSED`. Both are acknowledged in the docblock at `:453–454` but not fixed. | `habit.service.ts:456–478` | A restored habit displays a stale `archivedAt`; pause state is lost. | Set `archivedAt: null` in the update, and restore the previous status. |
| F21 | **M** | `HabitService.removeHabitFromToday:686` is the **only** one of 19 service methods that skips the `findById` ownership check. | `habit.service.ts:686–700` | A latent IDOR-adjacent gap. Not reachable from `/habits`, but reachable from `/today`. | Add the ownership check. |
| F22 | **M** | `deleteHabit` performs no score recalculation, so every `DailyScore` row that counted the deleted habit keeps counting it forever. | `habit.service.ts:746–763` | A deleted habit continues to influence historical scores. `GET /api/score/[today]` (which *does* recalculate for today) will disagree with stored history. | Recompute affected dates, or document scores as immutable snapshots in the UI. |
| F23 | **M** | Three parallel day-type write paths bypass `HabitService` entirely: `habits/[id]/day-types/route.ts:47–59` (`createMany` + `habit.update`), `…/day-types/[dayTypeId]/route.ts:25–40` (`deleteMany` + auto-flip `appliesEveryDay` to `true`), and `HabitService.updateHabit:262–267`. Only the third is used by this page. | three files | Divergent validation and divergent `appliesEveryDay` semantics. | Delete the two raw routes, or have them delegate to the service. |
| F24 | **L** | `page.tsx:261` uses bare `fetch()` while `:217` and `:239` use `fetchWithAuth()`. Same-origin so the cookie still rides along, but inconsistent within one file. | `page.tsx:261` | Cosmetic inconsistency.                                                                                          | Use `fetchWithAuth`. |
| F25 | **L** | `page.tsx:495` sets `key={habit.id}` on the row's root `motion.div` **and** passes `renderHabitRow` directly to `.map()` (`:794`, `:1067`), so React adds a second wrapper key. | `page.tsx:495`, `:794`, `:1067` | Harmless, but it signals the render function was written for a keyed-render call site that no longer exists. | Drop the `key` from the element, or turn `renderHabitRow` into a real component. |
| F26 | **L** | `TIER_ACCENT.CORE` (`page.tsx:57`) is **not** a `HabitTier` value, so that entry is unreachable. | `page.tsx:55–64` | Dead map entry.                                                                                                   | Remove `CORE`, or document the intent. |
| F27 | **L** | `page.tsx` sets **no page-level metadata**, so the browser title is `"<SITE_NAME> — <SITE_TAGLINE>"` rather than anything habit-specific. Only `/habits/[id]` generates a title. | `page.tsx`; `layout.tsx:36` | Wrong tab title and no description for a primary nav destination. | Add `export const metadata = { title: 'Habits' }`. |
| F28 | **L** | The docblock at `:333–334` refers to a "`totalLoaded` notice in the header" that **does not exist**. | `page.tsx:333–334` | The doc describes a behaviour the file does not have — misleading for the next reader. | Build the notice, or amend the docblock. |
| F29 | **L** | `habit.repository.ts:673–676` holds an orphaned `/** Count habits by status */` docblock immediately above `addTags`, left behind when a method was moved. | `habit.repository.ts:673–676` | Misleading documentation next to real code.                                                                 | Delete the stray docblock. |
| F30 | **L** | `HabitScheduleEditor.tsx:37`'s docblock says "Monday-first index 0..6, matching the `Date#getDay()` convention" while the array at `:38–46` is Monday-first for **display** but stores `getDay()` values (`1..6, 0`). | `HabitScheduleEditor.tsx:37–46` | A self-contradictory comment on a subtle convention.                                                                | Rewrite the comment. |
| F31 | **L** | `page.tsx:15` imports 4 primitives from the `src/components/ui/index.tsx` barrel, which re-exports 26 modules — pulling `RichTextEditor` (147 lines), `ColorPicker` (117), `Dialog` (137), `Tooltip` (58) and `Pagination` (91) into this route's chunk. | `page.tsx:15`; `ui/index.tsx` | Bundle cost on the app's most-linked route.                                                                        | Import the four modules directly. |
| F32 | **L** | `dayTypes` is re-filtered for `isArchived` client-side (`page.tsx:245`) although `listDayTypes` already filters it. | `page.tsx:245` | Redundant work; also masks what the service actually does.  | Drop the client-side filter. |
| F33 | **L** | `dataError` is surfaced **twice** — by `DataErrorBanner` in the layout *and* by the page's `EmptyState` Branch B. | `layout.tsx:48`; `page.tsx:1018–1028` | Two error surfaces for one failure.                                                                             | Drop the page's branch, or drop the layout's banner for this route. |
| F34 | **L** | There is **zero** `TODO`/`FIXME`/commented-out code in `src/app/(dashboard)/habits/**` or `src/components/habits/**` (verified). `noUnusedLocals` + `noUnusedParameters` are both `true`, which is why the file has no unused imports — the unused surface is entirely in **props** and **dead service methods**. | `src/app/(dashboard)/habits/**` | Positive finding: the stubs are at the library layer, not in the route. | – |
| F35 | **L** | `getFrequencyLabel` is called with the raw `frequencyType` string rather than the typed union, so an unexpected value silently renders **"Unknown"** with no signal. | `page.tsx:600`; `frequency.ts:33–68` | Silent degradation.                                                                                              | Type the parameter as `HabitFrequencyType` and narrow the `default`. |

---

## 25. UI/UX pass already applied in the file

The in-file docblocks record a set of repairs that are **already shipped**. They are listed here because a reader comparing this audit to an older version of the file needs to know which behaviours are intentional and recent.

| Repair                                                            | Docblock at    | What changed |
| ----------------------------------------------------------------- | -------------- | ------------ |
| `notDueReason` gate                                                 | `:395–410`     | The toggle used to be offered unconditionally, so a `MONTHLY_TARGET` habit, one past its `endDate`, or one restricted to "Weekend" all presented a clickable circle on a day they were never due. Completing one earned a 400; *un*-completing one wrote a `MISSED` that silently depressed the 28-day rate and the streak. |
| `dataLoaded` gating of the empty state                              | `:1002–1011`  | `habits` starts as `[]`, so every first paint matched the empty branch and rendered "No active habits / Add your first habit" to users who already had dozens — for as long as the fetch took. |
| Per-`HabitLogStatus` rendering                                      | `:458–468`    | All four non-`COMPLETED` statuses collapsed to "not done": a skipped habit looked identical to an untouched one, and the only way to find out was to open `/today`. |
| `statusCount` before filtering                                      | `:353–362`    | "No habits in this tab" vs "your filters excluded everything" both rendered `length === 0`. |
| `toDateKeyInZone` bare-date handling                                | `:95–107`     | A habit created through this page stores bare `yyyy-MM-dd` strings; `new Date()` on one yields midnight **UTC**, which in a negative-offset zone is the previous local day — so a habit starting today reported "Starts on yesterday" and rendered **Not due**. |
| Habit `color` / `icon` rendering                                    | `:479–487`    | Both fields had been capturable since the Add modal first shipped and were **never rendered anywhere**: a user could pick red and 🏃 and see no difference. `color-mix` against the card token keeps a pastel legible in both themes instead of only the one where that hex has contrast — the white-on-white failure. |
| Tag chips                                                           | `:637–644`    | The whole `Tag` / `HabitTag` / `tagIds` / `tagId`-filter path existed on the server and **nothing in the client ever touched it**, so a tag could only be attached by calling the API by hand and was never visible here. |
| Day-type chips                                                      | `:677–684`    | The restriction was invisible: a habit assigned to "Weekend" simply did not appear on `/today` on a weekday, with nothing here explaining why. |
| `healthError` surfacing                                             | `:273–274`    | An empty `catch` meant the 28-day columns silently disappeared from every row **with no message at all**. |
| `loadError` surfacing                                               | `:246–250`    | Previously `console.error` only — the filter dropdown showed just "All Days" with no indication that filtering was unavailable. |
| `allTags` derived rather than fetched                               | `:182–191`    | Derived from the habits the context already holds, so it needs no fetch and cannot drift from what the list is showing. A tag whose last habit was archived drops out of the filter, which is correct. |
| Delete confirmation moved to the shared `Modal`                    | `:1087–1101`  | It was a hand-rolled `role="alertdialog"` overlay that declared the role and `aria-modal` but implemented none of what the role promises: no focus trap (Tab walked into the page behind it), no Escape, no focus restore. |
| Restore button                                                      | `:758–760`    | Archiving used to be a one-way door with no control anywhere to undo it — a mis-click hid a habit and its whole history permanently. |
| Route moved into the `(dashboard)` group                           | `:802–809`    | `/habits` used to sit outside the group with a hand-rolled *different* `DashboardLayout` and a divergent nav set, so the page every nav item links to was missing `SkipLink`, `OfflineBanner`, `MobileNav`, `FloatingFocusBar`, `CelebrationHost` and `SleepPromptHost`. |

**What is still missing from the rendered surface** (fields the schema accepts and the service supports, but no control exists): `icon`, `estimatedDuration`, `categoryId`, `difficulty`, `points`, `isPublic`, and `habit.streakCount`. See §6.2 and §15.2.

---

## 26. Cross-page consistency notes

| Concern                 | `/habits`                                   | `/today` (`TodayHabitChecklist`)   | Divergence |
| ----------------------- | ------------------------------------------- | ---------------------------------- | ---------- |
| Rename a habit          | Edit modal only (no inline rename)          | **inline rename in the row** (hover-revealed) | `/today` is richer |
| Add a habit             | `AddHabitModal`                            | **the same `AddHabitModal`**       | shared component, so the fields cannot diverge |
| Complete a habit        | toggle writes `COMPLETED` ⇄ `MISSED`       | toggle writes `COMPLETED` ⇄ … (+Undo toast) | `/habits` has **no undo toast**; `/today` does |
| Skip                    | ❌ not offered                              | ✅ offered                                                                   | a habit can be skipped from `/today` but not `/habits` |
| Add/remove from today   | ❌ not offered                              | ✅ `POST /api/habits/today`                                               | |
| Colour picker           | Add: 12 presets + picker + hex + preview    | —                                                                          | |
| Colour picker           | Edit: **6 presets only**                   | —                                                                          | A custom hex created in Add cannot be re-shown in Edit |
| Archive                 | row icon → context → `POST /archive`       | `HabitArchiveDialog` → direct `fetch`  | The dialog uses bare `fetch`, a hardcoded `zinc-800/zinc-700/amber-600/red-400` palette instead of theme tokens, and is a hand-rolled overlay with **no `role="dialog"`, no `aria-modal`, no focus trap, no Escape, no focus restore** — exactly the regression the list page's delete dialog was refactored to fix |
| Delete                   | shared `Modal` with a real focus trap      | **`window.confirm()`**                            | two entirely different confirmation patterns |
| Frequency editor        | `EditHabitModal` (no `RANDOM`/`CUSTOM`)    | `HabitScheduleEditor` (offers 3 invalid types)  | neither matches the 8-value schema |
| Tier options             | Add 6 / Edit 7                              | detail: —                                                            | Add cannot produce 5 of the 11 tiers |
| Day-mode data            | `GET /api/day-mode?date=`                  | `GET /api/day-mode?date=` ∥ `GET /api/day-types?active=true`           | `/today` batches them in one `Promise.all`; `/habits` does not |
| Data layer               | `AppContext`                                | **local `useState` + its own fetches**            | the single largest structural difference between the two routes |

---

## 27. The half-orphaned `/habits/[id]` subtree

This deserves its own section because it is the largest structural finding on the page and it is **not visible from the UI**.

### 27.1 The fact

**`page.tsx` contains no `<Link>`, no `href`, and no `router.push`.** There is zero navigation from the list page to the detail page. A full-tree grep finds exactly **one** inbound link to `/habits/{id}` anywhere in the codebase:

```
src/server/services/notification.service.ts:540
    actionUrl: `/habits/${habit.id}`     ← on a HABIT_REMINDER push/notification
```

Every other link in the app points at `/habits` (the **list**): `HabitHealthWidget.tsx:174, :289`, `MetricsRow.tsx:231`, `search/page.tsx:66`.

### 27.2 What that leaves orphaned

| Orphaned asset                                           | Size    |
| -------------------------------------------------------- | ------- |
| `[id]/page.tsx`                                          | 51      |
| `[id]/HabitDetailClient.tsx`                             | 435     |
| `[id]/loading.tsx`, `[id]/error.tsx`                     | 42 + 48 |
| `HabitScheduleEditor.tsx`                                | 281     |
| `HabitNotes.tsx`                                         | 168     |
| `HabitArchiveDialog.tsx`                                 | 86      |
| `HabitHistory.tsx`                                       | 36      |
| `HabitFrictionCard.tsx`                                  | 30      |
| **9 detail-only API calls** (`GET /api/habits/{id}`, `PUT`, `PATCH .../note`, `POST .../log`, `POST .../skip`, `POST .../pause`, `POST .../resume`, `POST .../archive`, `DELETE`) | — |

Roughly **1,177 lines of component code** that a user can only reach by receiving a habit reminder notification — never by clicking.

### 27.3 Why it matters beyond discoverability

1. **`HabitScheduleEditor` duplicates `EditHabitModal`** and offers three frequency types that **always 400**.
2. **`HabitArchiveDialog` duplicates `archiveHabit`** with worse accessibility and a hardcoded palette, and **cannot restore** even though it posts to the endpoint that supports it.
3. **`window.confirm()` vs a real `Modal`** — two entirely different confirmation patterns for the same irreversible action.
4. **`HabitNotes` is the only place** `PATCH /api/habits/{id}/note` is exercised, so the per-habit note feature has no discoverable entry point.
5. **`HabitHistory` and `HabitFrictionCard`** are the only surfaces for a habit's 30-square history grid and its friction warning — neither reachable.
6. `findWithRelations` caps `logs` at **`take: 30`** (`habit.repository.ts:82`), which is what feeds `HabitHistory`'s 30 squares. Any growth beyond that is silently truncated with no indicator.
7. `HabitFrictionCard` computes a `reliability` percentage — the same kind of number the list page shows from `GET /api/habits/health` — via a **different, unreachable** code path.

### 27.4 Options, in order of cost

| # | Option                                                        | Cost | Effect |
| - | ------------------------------------------------------------- | ---- | ------ |
| 1 | Add a `<Link>` on the habit name to `/habits/{id}`            | tiny | Makes 1,177 lines reachable; zero new code elsewhere. |
| 2 | Delete the subtree and fold its unique value into the modals  | large | Removes ~1,177 lines and 9 API surfaces; loses history/friction/notes. |
| 3 | Keep both and reconcile the divergences (§27.3 items 1–3)     | medium | Two working implementations instead of two broken ones. |

**Recommendation (not applied — this pass was documentation-only):** option 1 first, then option 3. Option 2 throws away working functionality that the list page cannot currently substitute for.

---

*End of `/habits` audit.*

---

## 28. The Habit Consistency card (added later)

A full-calendar-year contribution system, added after the audit above. **No schema
change**, and it reuses the existing eligibility rule rather than inventing a
fourth definition of "scheduled".

### 28.1 Why the day count is never hardcoded

`daysInYear` applies the Gregorian rule — divisible by 4, except centuries which
must be divisible by 400. So 2028 renders 366 cells, 1900 renders 365, 2000
renders 366. A hardcoded 365 silently drops December 29th of a leap year and shifts
every weekday row after February: invisible until someone notices their worst day
is always the wrong day. Two tests pin the century cases.

### 28.2 Which "completion" this uses, and why

The repo already had two disagreeing definitions (see `AGENTS.md`). This card uses
the third, and the only one the brief's tooltip asks for:

| Definition | Denominator | Where |
| ---------- | ----------- | ----- |
| `DailyScore.habitCompletionRate` | *Applicable* habits, 9 scored tiers only | `scoring.service.ts` |
| `getHabitHealth` rate | Days the user actually recorded | `habit.service.ts` |
| **The heatmap** | **Eligible** — the full eligibility rule | `lib/habits/contributions.ts` |

`getHabitHealth` is the closest existing thing and is deliberately *not* reused:
its denominator is `completed + missed + skipped`, so a day the user never opened
the app never enters the maths, and the grid overstates consistency. Here the
denominator is what the user was *meant* to do.

**Eligibility without 5,000 queries.** `calculateHabitEligibility` costs 2-4
queries per habit per date, so a year over 12 habits is ~5,000 — not a slow page,
a denial of service against the database. Every one of those *lookups* is
bulk-loadable and every *rule* was already pure (`isHabitScheduledForDate`,
`habitAppliesToDayType`, plain date comparison). So
`lib/habits/contribution-eligibility.ts` hoists the lookups into a context the
caller fills once and applies **the same rules in the same order** synchronously.
This is a deliberate second implementation, so `tests/lib/habit-contribution-eligibility.test.ts`
pins the 20 precedence cases that are easy to get subtly wrong (skip beats
reschedule; pause beats both; day-type is checked before frequency).

### 28.3 Six queries

| # | Query | Supplies |
| - | ----- | -------- |
| 1 | `UserRepository.getSettings` | timezone |
| 2 | `HabitRepository.findAll` | habits + day-type assignments |
| 3 | `HabitRepository.findLogsByUserRange` | every log in the year |
| 4 | `HabitRepository.findOverridesByUserRange` | skip / pause / reschedule |
| 5 | `RoutineRepository.listDayTypeDefinitions` | day-type names |
| 6 | `RoutineRepository.findExceptionsByRange` | per-date day-type overrides |

All six in one `Promise.all`. Queries 4-6 exist purely to avoid the per-date
per-habit lookups. `findOverridesByUserRange` is the one new repository method —
the range form of the existing `findActiveOverrides`.

### 28.4 The three kinds of "no"

The invariant the whole grid rests on:

> A day with no `HabitLog` row is **unknown**, not failed.

"I did not do it" and "I never opened the app" produce identical rows in the
schema. A GitHub-style single empty cell collapses that — and two others — into one
grey square, which over a year is a lot of confidently wrong information.

| State | Meaning | Treatment |
| ----- | ------- | --------- |
| `UNSCHEDULED` | Nothing was due. A rest day. | Neutral floor, no hatch |
| `NO_RECORD` | Due, nothing logged. Unknown. | Floor + diagonal hatch |
| `LOGGED_MISS` | Due, logged as missed | Floor + red hairline |
| `PARTIAL` | Some done | Green level 1-2 |
| `FULL` | Everything due, done | Green level 4 |

Every cell also has a neutral floor and a hairline, so **inactive is never
invisible** — a sparse year reads as sparse, not as broken. The greens are the only
saturated marks, so **inactive is also never brighter than active**.

**The floor is `color-mix(--muted-foreground 16%)`, not `var(--muted)`.** In dark
mode `--muted` and `--border` are both `#27272a`, within a couple of percent of the
card background `#0a0a0f`. A cell filled with `--muted` and outlined with
`--border` was therefore almost exactly the value of the panel behind it, and
every inactive cell was invisible on a dark theme while looking fine in light mode.
Mixing a *mid-tone* over the surface at low alpha is measurably off the background
in both themes from one declaration. The same reasoning produced `CELL_EDGE` and,
on the dashboard side, `HEAT_FILL[0]` (18% → 11% gradient) and `HEAT_EDGE` (26%) —
on a sparse year ~99.6% of the grid is level 0, so those two values, not the green
ramp, decide whether the calendar is visible at all.

Intensity is driven by the **completion rate**, not volume: 1 of 3 and 9 of 10 are
both 100% of what was due, and a day that did nothing gets level 0, not a pale
green. Thresholds are fixed absolute bands (100 / 70 / 40) rather than GitHub's
distribution quartiles, so a bad year keeps looking like a bad year.

### 28.5 Grid span vs scoring window (the "empty dark space" bug)

Three data-layer defects, not CSS. Every "huge empty rectangle" report on either
card traced back to one of them, and no amount of layout work could have fixed any
of them because the model was emitting the wrong number of cells.

1. **`buildContributionYear` clipped the grid to the window.** It iterated
   `windowStart..windowEnd`, where `windowStart` is the earliest habit start and
   `windowEnd` is today. A user whose first habit was created three days ago got a
   **three-day grid** inside a full-width card.
2. **`buildYearView` (dashboard) spanned the data, not the year.** It iterated
   `dates[0]..dates[dates.length - 1]` — the first and last keys actually present
   in the map. One logged day produced a **one-week grid**. The week-column
   alignment tests passed the whole time, because they asserted the invariant on
   whatever range they were given; nothing asserted the range.
3. **The month view's "empty month" test became dead.** It branched on
   `summary.days === 0`, and `days` means "days inside the scoring window". Once
   the grid spanned the year every month had cells, so the condition was never true
   again while the branch stayed wired to it.

The fix is to keep the two concepts apart:

| | Grid span | Scoring window |
| - | --------- | -------------- |
| Is | always the full calendar year, 52-53 columns | earliest habit start .. today |
| Purpose | the shape of the year is legible before you log anything | which days count toward a rate |
| Outside it | a cell is still emitted, as inert `UNSCHEDULED` | nothing is counted |

Every aggregate keys off `scheduled > 0` or `completed > 0`, so an out-of-window
cell is rendered but cannot move a rate, a streak, a per-habit total or an active
day count. The two are reported separately on `stats` as `windowStart` /
`windowEnd`, and a test pins that a single entry still yields 365 cells.

`futureDays` became a **count** of unreached days rather than a 0/1 flag, because
with a full-year grid `days` is always the month's length and the count is now the
only thing distinguishing "March is ahead of me" from "March was empty". It is
computed from `cell.date > today`, not inferred from "the month came after the
last cell".

The dashboard's `buildYearView(byDate, year, today)` gained a required `year` and
`today` for this, and normalises every row it emits: the wire type
(`{ date, score, level }`) carries no `pad` or `future`, so those are resolved in
the one place that knows the year and the date, and a fetched row can never reach
the grid with `future === undefined`.

**A rendering-layer version of the same bug, caught on the final pass.** The
dashboard matrix uses `grid-flow-col grid-rows-7`, and that advances a cell's
position by *rendering* it. The leading pad cells returned `null`, so the grid
packed every following day upward and each column after the first was off by the
pad count — the exact misalignment the component exists to prevent, reintroduced
after the model had been fixed. They now render as `invisible` spans: `null` removes
the element, `invisible` holds the position and keeps the node out of the
accessibility tree.

### 28.6 Two views, two questions

| | Year view | Months view |
| - | - | - |
| Question | "Am I trending up or down?" | "How did October actually go?" |
| Shape | 53 week-columns, 14px cells | 12 month blocks, 22px cells |
| Best for | anyone with a year of history | someone three weeks in |

Below **14 active days** the card opens on Months, because 53 columns of 14px cells
is a wall and a new user's single logged day is one dot in it. Year stays one click
away and is never disabled — a default, not a gate. A manual choice is sticky
across year switches. The rule keys off `activeDays`, not `scheduledDays`, so a
user with a year of *due* habits and a week of *activity* still gets the readable
view.

The **year view now carries day-level detail**, matching the month view: each cell
shows the day-of-month number and the completion count (`14 / 3` = day 14, 3
habits completed), and a future day is a dashed outline with no fill rather than a
filled cell, because a fill would read as "nothing done". The `lg` size also
renders a per-day `completed/scheduled` list under each month, with rest days shown
as `—` so "I wasn't asked" never prints as `0/3`.

The month grid uses **explicit responsive columns**
(`grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4`), not
`auto-fit` + `minmax(152px, 1fr)`. An auto-fit track resolves against its
*container*, so as soon as an ancestor constrained that width — a `max-w-fit`
wrapper, a sidebar, a narrower panel — the tracks collapsed toward the minimum and
all twelve months stacked down a single narrow centred column. A media-query column
count is a declaration about the viewport and cannot collapse that way. `xl` stops
at four because a fifth column at 1280px would hand each block ~230px and
reintroduce the wide-margin look in miniature.

Neither card's grid is wrapped in `mx-auto` / `max-w-fit`. That pair was added in
an attempt to "centre" the content and caused both reported symptoms: `max-w-fit`
measures the scrollable year grid and collapsed the months view, and `mx-auto` then
floated that collapsed column in the middle of the panel with symmetric black
gutters. Both grids are `w-full` and left-aligned, directly under their stat
badges.

Empty and future month tiles are a compact bordered tile with a ghost skeleton, not
a 132px dashed rectangle with one centred line — the old version was the tallest
thing in the row while containing the least information, which is what made the
month list read as a column of empty drawers. Only the ghost preview is
`aria-hidden`; the tile must not be, or a screen-reader user loses the one fact it
exists to convey.

The month axis is derived from the same column list as the grid, never laid out
independently, so a label cannot drift off its month when the year starts on a
different weekday or February is short.

**All seven weekdays are labelled** (Sun / Mon / Tue / Wed / Thu / Fri / Sat), at
alternating opacity with italic weekends. This was a `Set([1, 3, 5])` with the
other four rows rendered `text-transparent`, on the theory that seven 9px labels on
a 14px grid is clutter. It is worse than clutter: a reader counting cells downward
finds seven bands and only three names, so every unlabelled row reads as "no data"
— a state this grid uses to mean something else entirely. The gutter is a fixed
`w-7` so a three-character label never clips the grid.

**The month axis lives inside the scroll container.** It used to be a sibling of
the `overflow-x-auto` element, above it, so once the strip was wider than the card
the labels stayed put while the weeks scrolled past them and stopped naming
anything. That is a second, independent reason the axis could look unlabelled. One
scroller now holds the axis and the matrix, and the axis is its own
`grid` built from the *same* `repeat()` template as the matrix, so `Jan` sits over
January's first column by construction rather than by a calculated `margin-left`.
The habit-side axis is no longer absolutely positioned.

### 28.7 The Achievements showcase

The dashboard's achievement card was three badges in a full-width row, so it had
three circles in its left third and a dead area beside them. Rebuilt as a
`repeat(auto-fill, minmax())` grid, so the column count follows the available width
and follows the real number of achievements — three fill three columns, twenty
fill five.

**The progress-ring geometry bug.** The old ring was
`<svg viewBox="0 0 46 46">` with `r = (size - stroke) / 2` inside a container of
exactly `size`, putting the stroke's outer edge at exactly `size / 2`. A
`strokeLinecap="round"` extends `stroke / 2` past each dash end, so the cap at the
12 o'clock start rendered outside the box and was clipped by the parent's
`overflow: hidden`. **That clipped cap is the "cyan dot at the top"** — not a stray
element, a legitimate round cap cut in half. Fixed by making the SVG larger than
the ring (`box = size + stroke`) so nothing can touch the edge, and by using
`strokeDasharray = "${C} ${C}"` so the two round caps at the seam cannot overlap
into a second blob.

**One snapshot, not two requests.** `AchievementService.getShowcase` derives the
earned and locked sets from a single `buildWorldState` (~10 queries). The old
approach made two requests and rendered the halves side by side, so the world
state was built twice and nothing reconciled the lists — an achievement unlocked
between the two calls appeared twice.

**`category` and `rarity` were always in the data.** `ACHIEVEMENT_DEFINITIONS`
has carried 20 definitions across 6 categories and 5 rarities since before the
strip existed; the API simply never sent them. Added to the response — static
config, no schema change — which is what makes the category label and the rarity
tier on each tile possible.

`celebrated` is a real column, so the **New** chip reflects application state
rather than a client-side guess that would replay on every page load. The ring
draw-on is a staggered *entrance* (A5), not a celebration replay.

### 28.8 Files

| File | Role | Tests |
| ---- | ---- | ----- |
| `lib/habits/contribution-eligibility.ts` | The pure eligibility mirror | 20 |
| `lib/habits/contributions.ts` | Year model, levels, streaks, months | 23 |
| `lib/habits/contribution-visual.ts` | Palette, cell states, legend | 11 |
| `lib/dashboard/contributions.ts` | Dashboard grid span, month view, stats | 31 |
| `server/services/habit-contribution.service.ts` | Six queries, composes | — |
| `app/api/habits/contributions/route.ts` | Thin handler | — |
| `components/habits/HabitContributionHeatmap.tsx` | Card shell, header, view default | — |
| `components/habits/ContributionGrid.tsx` | Year view, month axis, weekday gutter, tooltip | — |
| `components/habits/ContributionMonths.tsx` | Month view, responsive grid, day counts | — |
| `components/habits/ContributionInsights.tsx` | Month/weekday/habit breakdown | — |
| `components/dashboard/contributions/ContributionYearGrid.tsx` | Dashboard year matrix, `grid-flow-col` | — |
| `components/dashboard/ContributionHeatmap.tsx` | Dashboard card, metric badges | — |
| `components/achievements/AchievementRing.tsx` | Ring geometry | — |
| `components/achievements/AchievementsShowcase.tsx` | The showcase grid | — |
| `app/api/achievements/showcase/route.ts` | Thin handler | — |

`npm test` is **131 passing across 7 files**. The five new dashboard-contribution
tests that matter are the ones that pin the range, not the invariant: that a
single entry still yields 365 cells, that an empty map still yields 53 columns, and
that out-of-window days render but move no number. The week-alignment tests passed
through the entire bug, which is the point — they assert the invariant on whatever
range they are handed, and nothing asserted the range.

### 28.9 Header and legend

**Duplicated metrics, removed.** The card printed `Active days`, `Current streak`
and `Best streak` in the header *and* again in the six-tile grid ~200px below, so
the same three numbers appeared twice in two different visual registers. The tiles
are the better home — they have room for a label and a number at equal weight — so
the header now carries only the qualifiers the tiles do not (year, days, rate,
since-when). The dead `Metric` helper went with it.

The dashboard card had the same defect in a different form: `best run` was in the
`subtitle` prop *and* in a stats row underneath, so it appeared twice in one card.
Both are now a single inline badge group (`Active days 1/274 · Current streak 1d ·
Best run 1d`), derived from the same rows the grid paints so it can never
contradict what is on screen.

**The legend caption is a tooltip.** As a full-width paragraph beside a five-square
legend it inverted the hierarchy — the explanation outweighed the key it explained.
It is now an `ℹ️` button with `title`, which gives keyboard and pointer users the
same string and adds no hover-only content. The legend still lists the actual
levels in use, so it is a key rather than decoration; it no longer includes a
"rest day" swatch, because a rest day is *not* visually distinct from a zero in the
current palette (see open item 1).

The six metric tiles use `grid-cols-2 md:grid-cols-3 lg:grid-cols-6` with
`items-stretch` and `h-full` on each tile, and the hint carries `mt-auto` so every
hint sits on the same baseline even when one wraps to two lines. The middle
breakpoint is `md:` rather than `sm:` because between 640 and 768px three tiles of
~200px fit fine, so jumping 3 → 2 there was a reflow with no reason.

### 28.10 Open items

| # | Item |
| - | ---- |
| 1 | **A rest day and a zero look identical.** `UNSCHEDULED` gets the same `CELL_FLOOR` as a logged miss, so "nothing was due" and "I did nothing" are indistinguishable in the grid, and the legend cannot name it. The `lg` month readout does distinguish them in text (`—` vs `0/3`), which is what the day-level counts were for, but the matrix itself does not. The fix is a separate visual treatment for `UNSCHEDULED` — a hollow cell with a centred dot, or a dashed edge — which needs a design decision, not a code change. |
| 2 | `Year` view shows 52-53 columns on a laptop and scrolls horizontally. That is GitHub's own answer. Now that grid span and scoring window are separate, `WINDOW_DAYS` in `lib/dashboard/contributions.ts` controls the *fetch* range only; shortening the rendered strip would need a separate argument to `buildYearView`. |
| 3 | The month view's unreached months are still ghost tiles, so a brand-new user sees ~4 readable months and 8 placeholders. This is now driven by `month > reachedMonth` rather than the dead `days === 0` test, so a month the user *lived through with no activity* correctly renders as a real grid of neutral cells — but the asymmetry between reached-empty and unreached is still visible. |
| 4 | The dashboard and habits cards use different month-view designs: the dashboard is a horizontal scroller with all twelve months in a row, the habits page is a wrapped 4-column grid. The dashboard one has no empty-state tiles at all. Deliberate, but undocumented — worth confirming it is intended. |
| 5 | The eligibility mirror pins `habit.startDay` to `DEFAULT_TZ`, matching `calculateHabitEligibility`. That pinning is itself a smell — every other date comparison in the habits system uses the user's zone — so the two can disagree by a day for a user far from IST. Matching it was the right call for *this* feature, because a grid whose habit-start boundary differs from the `/today` checklist would be a new "two definitions, one page" bug. Fixing the zone belongs in `calculateHabitEligibility` where every caller sees it at once. |
| 6 | `/api/achievements/next` still exists and is still used by the achievements *page*; it now overlaps the showcase endpoint. Consolidating them is a follow-up, not a blocker. |
| 7 | **`npm run build` has not been run** since the grid-span rewrite. `type-check` and all 131 tests pass and lint reports 0 errors, but a production compile is a separate check — an earlier JSX-comment error in `ContributionMonths.tsx` surfaced only at build time. |