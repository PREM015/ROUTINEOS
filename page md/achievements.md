# `/achievements` — Complete System Audit

**Route:** `http://localhost:3000/achievements`
**Route file:** `src/app/(dashboard)/achievements/page.tsx` (443 physical / 412 non-blank lines, `'use client'`)
**Project:** RoutineOS (`daily-plan`) — Next.js 16 (App Router) + Prisma 7 + PostgreSQL (Neon)
**Audit date:** 2026-09-30 · **Amended:** 2026-09-30 (documentation-only pass — no code was changed; see [§24](#24-findings-register))
**Status:** describes **only** what exists in the codebase. Every claim is file-anchored.

> **Line-count convention:** **physical** line counts. PowerShell's `Measure-Object -Line` skips blank lines and reports 412 for `achievements/page.tsx` — use `(Get-Content file).Count` for the physical figure.

> ### Three critical defects, all in the XP / rarity / progress layer
>
> 1. **`rarityOfTitle` can never resolve.** `ACHIEVEMENT_DEFINITIONS` is keyed by `id` (`'first-habit-streak'`), but `getAchievementById(title)` is handed the row's **display name** (`'First Streak'`). No name equals any id, so the lookup returns `undefined` for **all 20** definitions, and `xpForRow` falls back to clamping `row.level` — which stores the **criterion threshold**, not a tier index — into the rarity ladder. **14 of 20 achievements render the wrong rarity chip and the wrong XP.** The grid and the history then disagree, because the grid resolves rarity by name and the history does not. See [§7.1](#71--critical--rarityoftitle-can-never-resolve).
> 2. **`lateEvenings` counts only *today's* sessions after 20:00** — `countCompletedSessions(userId, fromZonedTime(\`${today}T20:00:00\`, tz))` filters `startedAt >= today 20:00` with no lower bound. `night-owl` requires **20**, so it is **unreachable**. See [§26](#26-lateevenings-semantics--night-owl-is-unreachable).
> 3. **`timeframe` is never read.** `checkCriteria` compares `totals[field]` against `criterion.value` and ignores `criterion.timeframe` entirely, so `perfect-day` / `perfect-week` / `perfect-month` / `perfect-year` / `consistency-king` all evaluate as *all-time cumulative* counts. A user with 7 perfect days spread across two years unlocks **"Perfect Week"**, whose description says *"Log 7 consecutive perfect days"*. See [§27](#27-timeframe-is-decorative).

> ### Also structural
> - `src/types/achievements.ts` is **575 lines with zero importers**, and its `:11` imports `AchievementType` **as a value** from `@/generated/prisma` — a client-boundary violation if it were ever imported from a `'use client'` file.
> - `Achievement.celebrated` exists on the model and is **never written**. `POST /api/achievements/celebrate` writes an `ActivityLog` row and returns, leaving the column `false` forever.
> - Both unlock notifications and the unlock email link to `/achievements/${achievementId}`. **No such route exists** — `src/app/(dashboard)/achievements/` contains only `page.tsx`. Every one of those links 404s.
> - **No unique constraint on `Achievement`.** Four independent callers can race and write duplicate rows for the same definition; the page then counts them twice (XP and the "N of M" denominator).

---

## Table of contents

| §   | Section                                                                                       |
| --- | --------------------------------------------------------------------------------------------- |
| 1   | [What `/achievements` is, in one paragraph](#1-what-achievements-is-in-one-paragraph)           |
| 2   | [UI block diagram](#2-ui-block-diagram)                                                       |
| 3   | [UI → component mapping](#3-ui--component-mapping)                                            |
| 4   | [Frontend architecture](#4-frontend-architecture)                                             |
| 5   | [Backend / API architecture](#5-backend--api-architecture)                                    |
| 6   | [Database dependency](#6-database-dependency)                                                 |
| 7   | [The achievement catalogue — 20 definitions](#7-the-achievement-catalogue--20-definitions)     |
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
| 25  | [`perfectWeeks` counts non-consecutive weeks](#25-perfectweeks-counts-non-consecutive-weeks)   |
| 26  | [`lateEvenings` semantics — Night Owl is unreachable](#26-lateevenings-semantics--night-owl-is-unreachable) |
| 27  | [`timeframe` is decorative](#27-timeframe-is-decorative)                                       |

---

## 1. What `/achievements` is, in one paragraph

`/achievements` is the app's **badge gallery**. It is a `'use client'` Client Component (`page.tsx:1`) rendering three `Stagger`-animated sections inside a `max-w-6xl` container with a `gradient-mesh-animated` backdrop: a **header** with a `Trophy` glyph, the title, and a live "N of M achievements unlocked" line; a **trophy-level summary** card showing a 🏆/👑 tile, the numeric `Trophy Level`, total XP earned, a `ProgressBar` toward the next level, and five rarity-count chips; a **filterable grid** (`AchievementList`) of all 20 catalogue tiles — earned ones first, then locked, filterable by status and rarity; and an **"Unlock History"** grouped timeline of past unlocks with per-row rarity and `+N XP` chips. Everything comes from **two** requests: `GET /api/achievements` (earned rows, default limit 50) and `GET /api/achievements/next?count=100` (progress toward the unearned). **No progress is persisted** — it is recomputed per request by `AchievementService.getNextUnearned`, which builds a world-state snapshot of **13–14 queries across 12 repositories**. Unlocks are evaluated **server-side and fire-and-forget** on every habit log, every goal completion, and every focus session finish; there is no cron and no scheduler.

---

## 2. UI block diagram

```
/achievements  (src/app/(dashboard)/achievements/page.tsx — 'use client', 443 lines)
│
└── <div class="container relative mx-auto max-w-6xl px-4 py-6 sm:py-8">        :280
    │
    ├── [background] div.gradient-mesh-animated.pointer-events-none             :292–295
    │               absolute.inset-0.-z-10.opacity-60   (aria-hidden="true")
    │
    └── <div class="relative">                                                 :297
        │
        ├── HEADER — <Stagger>                                                :298–310
        │   ├── <h1 class="font-display text-2xl sm:text-3xl">
        │   │     <Trophy class="h-7 w-7 text-amber-500"/> "Achievements"      :300–303
        │   └── <p class="text-muted-foreground">
        │         rows ? "{unlockedCount} of {achievements.length} achievements
        │                   unlocked. Keep the streak going."
        │               : "Track milestones as you build consistency."          :304–308
        │         ⚠ the denominator is achievements.length = earned.length + locked.length,
        │           so duplicate DB rows inflate it past 20
        │
        ├── {error && <p role="alert" class="… bg-destructive/10 …">}          :312–316
        │        ⚠ set ONLY by the FIRST request (`:143`); a failure of
        │          /api/achievements/next is swallowed at `:163` and never shown
        │
        ├── LOADING  {!rows && !error → <Spinner class="h-6 w-6"/> py-16}       :318–321
        │            ⚠ no skeleton; the layout is a bare centred spinner
        │
        └── {!loading && <>                                                     :323–438
            │
            ├── ① SUMMARY — <Stagger delay={0.08}>                              :325–372
            │   └── <Card class="p-6">                                         :326
            │       └── <div class="flex flex-col gap-6 lg:flex-row lg:items-center">  :327
            │           │
            │           ├── LEFT (identity block)
            │           │   ├── <div class="flex h-16 w-16 rounded-2xl
            │           │   │        bg-amber-500/10 text-3xl ring-2 ring-amber-500/40">
            │           │   │     👑 when maxed, else 🏆   (aria-hidden)          :329–331
            │           │   └── "Trophy Level" (uppercase, tracking-wide)         :333–335
            │           │       {levelInfo.level}  — text-3xl tabular-nums       :336
            │           │       "{totalXp} XP earned"                             :337–339
            │           │
            │           └── RIGHT (min-w-0 flex-1)
            │               ├── "Next level (N)" | "Maximum level"              :344–347
            │               ├── "{currentXp} / {neededForNext} XP" | "Max"       :348–350
            │               ├── <ProgressBar value={currentXp} max={neededForNext}
            │               │     color={maxed ? '#f59e0b' : '#8b5cf6'}
            │               │     ariaLabel="Progress to next trophy level"/>     :352–361
            │               └── 5 × <Badge style={rarityChipStyle(...)}>         :362–368
            │                     "{icon} {count} {label}"  ← rarityCounts
            │
            ├── ② GRID — <Stagger delay={0.14}>                                :374–376
            │   └── <AchievementList achievements={achievements} />            :375
            │       ⚠ L374 and L379 are indented two spaces short of L325's
            │         sibling <Stagger> — cosmetic only, Prettier would reflow
            │
            └── ③ HISTORY — <Stagger delay={0.2}>                              :379–437
                └── <section class="mt-10" aria-labelledby="unlock-history-heading">  :380
                    ├── <h2 id="unlock-history-heading">
                    │     <Medal class="h-5 w-5 text-amber-500"/> "Unlock History"   :381–384
                    ├── history.length === 0
                    │     ? <Card><EmptyState icon={<Sparkles/>}
                    │           title="No unlocks yet"
                    │           description="Complete habits, goals and focus
                    │                      sessions — the first achievement is close."/>  :385–392
                    └── else <div class="mt-4 space-y-6">                       :394–434
                          └── per DAY GROUP (keyed group[0].dateKey, newest first)
                              ├── <p class="… uppercase tracking-wide">{dateKey}  :397–399
                              └── <Card class="divide-y divide-border overflow-hidden">  :400
                                  └── per entry — flex items-center gap-3 px-4 py-3   :405
                                      ├── 40px tile, bg = rarityTint(entry.color ?? rarity.color)  :406–412
                                      ├── title (truncate) + description (truncate)  :413–419
                                      ├── <Badge style={rarityChipStyle(rarity.color)}>{rarity}  :422
                                      ├── <Badge variant="success">+{entry.xp} XP  :423
                                      └── {entry.time} (hidden below sm)           :424–426
```

### 2.1 `AchievementList` internals — `src/components/achievements/AchievementList.tsx` (127 lines)

```
<div class={cn('w-full', className)}>                                     :69
├── FILTER BAR  (only when showFilters !== false — the page omits the prop)  :71–107
│   ├── <div role="group" aria-label="Filter by status"
│   │     class="flex items-center gap-1 rounded-lg bg-gray-100 p-1">       :72
│   │   └── 3 × <button aria-pressed={status === value}
│   │         class={cn('rounded-md px-3 py-1.5 text-sm font-medium …',
│   │                active ? 'bg-white text-gray-900 shadow-sm'
│   │                       : 'text-gray-500 hover:text-gray-800')}>       :74–92
│   │         All | Unlocked | Locked  + a tabular-nums count span
│   └── <select value={tier} aria-label="Filter by tier"
│         class="rounded-md border border-gray-300 bg-white …">            :94–106
│         <option value="ALL">All tiers</option> + one per ACHIEVEMENT_RARITIES entry
├── filtered.length === 0 → <EmptyState icon={<Trophy/>}
│     title="No achievements match"
│     description="Try clearing the filters." (only when a filter is active)>  :110–115
└── <div class="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">  :117
    └── filtered.map(a => <AchievementBadge key={a.id} achievement={a} />) :118–120
```

⚠ **The filter bar is hardcoded light** — `bg-gray-100` (`:72`), `bg-white text-gray-900` (`:83`), `text-gray-500` (`:83`), `text-gray-400` (`:87`), `border-gray-300 bg-white` (`:98`). None of these invert. On a dark theme this is the brightest block on the page. This is the exact class of bug ERROR.md I3 names, and `AchievementBadge` was fixed for it while `AchievementList` was not. §24 F15.

### 2.2 `AchievementBadge` internals — `src/components/achievements/AchievementBadge.tsx` (149 lines)

```
<Card class={cn('group flex h-full flex-col p-4 transition-all duration-200',
                unlocked ? 'hover:shadow-md' : 'opacity-80 hover:opacity-100')}
      aria-label={`${name} — ${unlocked ? 'unlocked' : 'locked'}`}>       :56–65
├── <div class="flex items-start justify-between gap-3">                   :66
│   ├── 48px ICON TILE  <div class="flex h-12 w-12 rounded-xl text-2xl
│   │      … grayscale when locked"                                       :67–86
│   │      unlocked → backgroundColor: rarityTint(accentColor)
│   │                 boxShadow: 0 0 0 2px rarityTint(accentColor)
│   │      locked   → backgroundColor: 'var(--muted)'   ◄── theme-aware
│   │      glyph → <Award/> unlocked | <Lock/> locked                     :105–110
│   └── right column: <Badge variant={unlocked ? 'success' : 'default'}
│                      class="text-[10px] uppercase tracking-wide">        :88–93
│                      → "Unlocked" | "Locked"
│                    <Badge class="text-[10px]" style={rarityChipStyle(rarity.color)}>  :97–101
│                      → "{rarity.icon} {rarity.label}"
├── <div class="mt-3 flex items-center gap-1.5">                           :105
│   └── <h3 class="truncate text-sm font-semibold text-foreground"
│         title={name}>{name}</h3>                    ◄── token, not text-gray-900  :117–119
├── <p class="mt-1 line-clamp-2 text-xs text-muted-foreground">{description}  :122–126
├── {achievement.progress && (                                            :128
│     <ProgressBar value={progress.current} max={progress.target}
│                  color={unlocked ? accentColor : undefined}
│                  label={`${current} / ${target}`} showPct />)}          :130–136
└── {unlockedAt && unlocked && <p class="mt-3 text-[11px] text-muted-foreground">
      {formatDate(new Date(unlockedAt))}</p>}                              :140–144
```

⚠ **`progress` is never set for an earned tile.** `page.tsx:197` passes `parseProgress(row.metadata)`, and `metadata` is written by the service as `{"definitionId":"…"}` only — it has no `current`/`target`, so `parseProgress` returns `undefined`. The bar renders only for **locked** tiles that `getNextUnearned` could measure. §24 F16.

### 2.3 `ProgressBar` internals — `src/components/achievements/ProgressBar.tsx` (100 lines)

```
safeMax         = max > 0 ? max : 1                                       :63
clamped         = Math.min(Math.max(value, 0), safeMax)                    :64
percentage      = Math.round((clamped / safeMax) * 100)                    :65
isHexColor      = typeof color === 'string' && color.startsWith('#')       :67
usesClassColor  = !isHex && COLOR_CLASSES.has(color)                        :68–69

{(label || showPct) && <div class="mb-1 flex justify-between text-xs">
    {label && <span class="font-medium text-gray-600">{label}</span>}      :73–78
    {showPct && <span class="tabular-nums text-gray-400">{percentage}%</span>}
</div>}

TRACK: <div class="h-2 w-full overflow-hidden rounded-full bg-gray-200"    :79–86
           role="progressbar" aria-valuenow={clamped}
           aria-valuemin={0} aria-valuemax={safeMax}>
FILL:  <div class={cn('h-full rounded-full transition-[width] duration-300',
                      barClassName,
                      usesClassColor ? color : 'bg-blue-600')}
           style={{ width: `${percentage}%`,
                    backgroundColor: isHexColor ? color : undefined }} />  :87–94

role/aria: aria-valuenow is the CLAMPED number, not the raw value            :83
```

⚠ **`COLOR_CLASSES` (`:36`–`:51`, 14 entries) is dead.** `usesClassColor` requires a non-hex string present in that set. Both call sites pass a `#`-hex or `undefined` (`page.tsx:359`, `AchievementBadge.tsx:133`), so the `bg-blue-600` fallback at `:91` is what always renders. §24 F14.

⚠ **The track is `bg-gray-200`** (`:80`) and the label/percent use `text-gray-600` / `text-gray-400` (`:75`–`:76`) — hardcoded light-mode greys, not tokens. On a dark theme the track is a bright bar and the label is low-contrast. §24 F15.

---

## 3. UI → component mapping

### 3.1 Direct imports from `page.tsx` (`page.tsx:3`–`:25`)

| Import | From | Lines | Directive | Role |
| ------ | ---- | ----- | --------- | ---- |
| `Trophy, Medal, Sparkles` | `lucide-react` | — | — | header + history + empty-state glyphs |
| `ACHIEVEMENT_DEFINITIONS, ACHIEVEMENT_RARITIES, rarityChipStyle, rarityTint, type AchievementRarity` | `@/lib/constants/achievements` | **400** | none — `import type { AchievementType }` at `:1` is erased | the 20-entry catalogue + 5 rarity tiers + theme-safe chip helpers |
| `ACHIEVEMENT_XP, computeTrophyLevel, xpForRow` | `@/lib/achievements/xp` | **143** | none | the XP engine (**§7.1** is the defect) |
| `apiRequest` | `@/lib/api-client` | **131** | none | unwraps `{success, data}`; throws `ApiError` |
| `Card` | `@/components/ui/Card` | 26 | **none** | RSC-safe |
| `Badge` | `@/components/ui/Badge` | 24 | **none** | RSC-safe |
| `Spinner` | `@/components/ui` (barrel) | 14 | **none** | loading only |
| `EmptyState` | `@/components/ui/EmptyState` | 52 | **none** | history-empty only |
| `AchievementList` | `@/components/achievements/AchievementList` | 127 | `'use client'` | filter bar + grid |
| `ProgressBar` | `@/components/achievements/ProgressBar` | 100 | `'use client'` | the summary XP bar |
| `Stagger` | `@/components/today/ui` (`:303`) | 402 | none — imports `useReducedMotion` | 4 entrance animations |
| `type AchievementCardData` | `@/components/achievements/AchievementBadge` | 149 | `'use client'` | **type-only import**, so the component itself is not pulled in |

✅ **The client boundary is clean.** `lib/constants/achievements.ts:1` is `import type { AchievementType }` — erased at compile time. `lib/achievements/xp` → `./definitions` → `@/lib/constants/achievements` → `@/lib/utils`. **No `@/server/**`, no `@/lib/prisma`, no Prisma value import is reachable from this page.** The contrast with the dead `src/types/achievements.ts:11` (a Prisma *value* import) is §24 F19.

### 3.2 `src/components/achievements/**` — exhaustive (5 files, **0 dead**)

| # | File | Physical / non-blank | Directive | Importers | Renders |
| - | ---- | -------------------- | --------- | --------- | ------- |
| 1 | `AchievementPopup.tsx` | **264** / 243 | `'use client'` `:1` | **`CelebrationHost.tsx:15`** | fixed bottom-right `z-50` toast; framer-motion spring in/out; `role="status" aria-live="polite"`; auto-hide with a shrinking countdown bar. Prop-driven queue **plus** a fallback "latest unlock" fetch with bounded retry |
| 2 | `AchievementBadge.tsx` | **149** / 138 | `'use client'` `:1` | `AchievementList.tsx:21` (named) — **not** imported by the page | one card (§2.2) |
| 3 | `AchievementList.tsx` | **127** / 115 | `'use client'` `:1` | **`page.tsx:22`** | filter bar + responsive grid (§2.1) |
| 4 | `ProgressBar.tsx` | **100** / 92 | `'use client'` `:1` | **`page.tsx:23`** and `AchievementBadge.tsx:29` | the static bar (§2.3) |
| 5 | `CelebrationHost.tsx` | **32** / 26 | `'use client'` `:1` | **`src/app/(dashboard)/layout.tsx:11`**, rendered `:64` | 15-line adapter: reads `useAchievementStore` (`events`, `dismissFirst`), passes `events[0] ?? null` + `autoHideMs={8000}` |

### 3.3 Transitive UI dependencies (all server-compatible, no directive)

| File | Physical / non-blank | Note |
| ---- | -------------------- | ---- |
| `components/ui/Card.tsx` | 26 / 23 | `cva` variants; the page uses the default. |
| `components/ui/Badge.tsx` | 24 / 21 | `cva` variants `default\|primary\|success\|danger\|warning`; the page uses `success` (`:423`) and default. `style` spreads onto the root element. |
| `components/ui/EmptyState.tsx` | 52 / 48 | `page.tsx:387`, `AchievementList.tsx:111` |
| `components/ui/Spinner.tsx` | 14 / 14 | `page.tsx:320` |
| `components/today/ui.tsx` | 402 / 380 | `Stagger` at `:303`, used **4×** (`page.tsx:298, 325, 374, 379`) |

### 3.4 The sibling component that is **not** on this page

`src/components/dashboard/AchievementsStrip.tsx` — **337 physical / 319 non-blank**, `'use client'`. The dashboard panel. It hits **the same two endpoints**: `GET /api/achievements?limit=6` (`:234`) and `GET /api/achievements/next?count=3` (`:235`). Local `Ring` (`:84`, SVG `stroke-dashoffset` draw-on with `--ring-delay` stagger) and `Medallion` (`:139`). Renders through `Panel` (`components/dashboard-ui/Panel.tsx`, 303 lines) so it inherits the loading/error/empty contract. Links to `/achievements` at `:293`. Toggled by `DashboardWidgets.tsx:76` (`{ key: 'achievements', … enabled: true }`). Exports `ACHIEVEMENTS_RIM` (`:337`) for the dashboard loading skeleton.

⚠ Because `AchievementsStrip` is on `/dashboard` and this page also renders the catalogue, **both surfaces resolve rarity differently**: the strip never displays rarity at all (it shows only icon + title + caption), so this page's wrong-rarity bug is invisible there and obvious here.

### 3.5 The store

`src/store/achievement.store.ts` — **102 physical / 92 non-blank**, `'use client'` `:15`. Exports `useAchievementStore` (`:64`) and `runAchievementCheck()` (`:90` → `POST /api/achievements/unlock`). **Exactly three callers**: `components/today/TodayHabitChecklist.tsx:292` (only when the new status is `COMPLETED`), `components/focus/FocusTimer.tsx:683`, `app/(dashboard)/goals/page.tsx:194` (only when `completed`). All three `void` it and swallow failures.

---

## 4. Frontend architecture

### 4.1 Page structure

| Concern | Reality |
| ------- | ------- |
| Directive | `'use client'` — `page.tsx:1`. No server component, no `loading.tsx`, no `error.tsx`, no `page` metadata export, no `Suspense` boundary. The entire route is one client bundle. |
| Data fetching | **Two independent `useEffect` fetches**, not a shared hook. The primary is `await`ed (`:140`) and drives the loading spinner; the secondary is fire-and-forget (`:157`–`:167`) and **cannot set `error`**. |
| Loading gate | `!rows && !error` (`:318`). `rows` is `AchievementRow[] | null`; it is only set on success or on error, so a successful empty result (`[]`) is indistinguishable from "loaded". Both render the full page. |
| Empty gate | Only for history (`:385`). **A user with 0 unlocks still sees 20 locked tiles** plus a trophy level of 1 — the page never presents an overall empty state. |
| Error gate | A single `<p role="alert">` (`:313`) that appears *above* the content while the rest of the page still renders. There is no retry affordance. |
| Derived state | Two `useMemo`s. `achievements` (`:174`–`:224`) joins earned rows + catalogue. `totalXp/levelInfo/rarityCounts/history` (`:228`–`:277`) maps earned rows again. `xpForRow` is called **once per row** in the second memo (`:230`) and **once per row** in the first (`:195`, as a fallback only). |
| Two join keys | Earned rows are matched to the catalogue **by `name`** (`:188`, `:203`, `:231`) while `nextUp` rows are keyed **by `id`** (`:184`) with a `name` fallback (`:185`). §24 F12. |
| Stagger | 4 `<Stagger>` wrappers with delays `0`, `0.08`, `0.14`, `0.2` — header, summary, grid, history. |
| Client-only formatting | `formatUnlockTime` (`:85`–`:89`) and `localDateKey` (`:91`–`:100`) use `toLocaleTimeString` / `toLocaleDateString` with **no `timeZone` option**, so the grouping key is the *browser's* zone while `AchievementService` buckets by the *user's stored* zone. A user who travels, or whose stored `timezone` differs from the device's, can see two groups for one day or one group for two. §24 F17. |
| No error boundary | A throw inside any `useMemo` blanks the whole route (the nearest boundary is the group layout's, if any). |

### 4.2 `apiRequest` contract — `src/lib/api-client.ts` (131 lines)

`apiRequest<T>(path, { query, method, … })` (`:60`) unwraps `{ success: true, data }` to `T` (`:109`) and **throws** `ApiError` otherwise (`:113`). The page therefore receives the raw array, and `meta` (the `total` from `GET /api/achievements`) is discarded — the page recomputes its own counts from the returned page of rows.

### 4.3 The celebration path is a **separate** client flow

`/achievements` never renders a toast. `runAchievementCheck()` (store `:90`) pushes events into the zustand queue; `CelebrationHost` — mounted once in `src/app/(dashboard)/layout.tsx:64` — feeds `events[0]` to `AchievementPopup` with `autoHideMs={8000}`. `AchievementPopup` keeps a **local** queue (`:92`) and dedupes the prop into it (`:100`–`:107`); `dismiss()` pops locally, writes `routineos_last_achievement_seen` to `localStorage` (`:157`, `:67`–`:73`) and calls `onDismiss` → `dismissFirst()`.

When no prop is supplied, the popup falls back to fetching the most recent unlock (`GET /api/achievements?limit=1`, `:116`–`:118`) and suppresses it if the id matches `localStorage` (`:124`). Failures retry with linear backoff `2000ms × (attempt+1)` up to `MAX_FETCH_ATTEMPTS = 2` (`:47`, `:135`–`:142`) — a fix for a previous bug where a single transient 500 permanently disabled celebrations.

⚠ Because `CelebrationHost` renders `events[0] ?? null`, and the popup's fallback fires whenever the queue is empty, **every dashboard page load issues a `GET /api/achievements?limit=1`** through the popup — a second achievements request on top of whatever the page itself requests.

### 4.4 Reduced motion / theme

`Stagger` and `AchievementPopup` both honour `prefers-reduced-motion` (`framer-motion` in the popup; `useReducedMotion` in `today/ui.tsx`). Colour handling is theme-aware in `AchievementBadge` (`var(--muted)`, `rarityTint`, `rarityChipStyle`) but **not** in `AchievementList`'s filter bar or `ProgressBar`'s track. §24 F15.

---

## 5. Backend / API architecture

### 5.1 Routes — four, all thin, all session-scoped

| Route | File | Method | Auth | Validation | Delegates to |
| ----- | ---- | ------ | ---- | ---------- | ------------ |
| `/api/achievements` | `src/app/api/achievements/route.ts` (53 lines) | GET | `auth()` → 401 | `listAchievementsSchema` (`:14`): `limit` coerce int 1–100, `offset` coerce int ≥0 | `AchievementService.listRecent(userId, limit)` |
| `/api/achievements/next` | `src/app/api/achievements/next/route.ts` (62 lines) | GET | `auth()` → 401 | `nextSchema` (`:27`): `count` coerce int 1–100 | `AchievementService.getNextUnearned(userId, count ?? 3)` |
| `/api/achievements/unlock` | `src/app/api/achievements/unlock/route.ts` (35 lines) | POST | `auth()` → 401 | **none needed** — takes no body | `achievementService.checkForUnlocks(userId)` |
| `/api/achievements/celebrate` | `src/app/api/achievements/celebrate/route.ts` (56 lines) | POST | `auth()` → 401 | `celebrateAchievementSchema` (`src/schemas/achievement.schema.ts:8`) — optional `milestoneId` / `achievementId`, `.refine` requires ≥1 | `celebrateMilestone` or `celebrateAchievement` |

None of the four reads a userId from the request. `achievementId as string` at `celebrate/route.ts:43` is guarded by the schema's `.refine`. Error mapping: `celebrate` converts a thrown `Error` whose message `endsWith('not found')` into a **404** (`celebrate/route.ts:47`–`:49`) — string matching on an error message, which any thrown `Error('Achievement not found')` from any layer would also satisfy.

`/api/achievements` returns `{ success: true, data, meta: { total, limit, offset } }`. `meta.total` comes from `listRecent`'s second query. `offset` is validated and echoed but **never forwarded to any query** — `recentUnlocked(userId, limit)` takes no offset (`achievement.repository.ts:114`), so `?offset=50` returns the same first page. §24 F13.

### 5.2 `AchievementService` — `src/server/services/achievement.service.ts` (429 lines)

Four public methods plus a module-private `buildWorldState`.

```
GET /api/achievements
  listRecent(userId, limit=50)                                          :204–213
    Promise.all ─┬─ AchievementRepository.recentUnlocked(userId, limit)  orderBy unlockedAt desc
                 └─ AchievementRepository.findUnlocked(userId)          full findMany, then .length
    → { achievements, total }
    ⚠ both queries are the same rows; `total` is a full materialisation purely to count

GET /api/achievements/next
  getNextUnearned(userId, count=3)                                      :232–292
    1 AchievementRepository.findByUserId(userId)                        :247
    2 definitionIdOf(row) → ownedSet                                    :248–252
    3 unowned = allDefinitions − ownedSet;  [] if empty (hot-path bail) :254–255
    4 buildWorldState(userId, { includeActiveDates: false })            :257   ◄── 12 queries
    5 per definition: criteria[0] → resolveCriterionValue → { current, target, percent }
      current = null when the field is unresolvable (deliberate ≠ 0)   :262–280
    6 sort: percent DESC, nulls last; .slice(0, count)                  :285–291

POST /api/achievements/unlock
  checkForUnlocks(userId)                                              :300–357
    1 AchievementRepository.findByUserId(userId)                        :310
    2 definitionIdOf → ownedIds / ownedSet                              :312–316
    3 BAIL: if every definition is owned → return []                    :317–319  ◄── the hot path
    4 buildWorldState(userId)  (includeActiveDates defaults TRUE)       :321     ◄── 13 queries
    5 evaluateUnlocks(userId, worldState, ownedIds)                     :322     (pure)
    6 for…of { await } — SEQUENTIAL, not Promise.all                    :327–354
        repository.create(userId, { type, title, description, icon, color,
          level: criteria[0]?.value ?? 1,                               :328  ◄── threshold, not tier
          metadata: JSON.stringify({ definitionId }) })                  :336  ◄── no progress written
        buildUnlockEvent(definition, achievement.unlockedAt)             :339
        notificationService.notifyAchievement(userId, { id, title })     :342–345
        auditRepository.createActivity({ action: 'ACHIEVEMENT_UNLOCKED' })  :346–353

POST /api/achievements/celebrate
  getStreakWithMilestones(userId)                                      :363–374
    StreakRepository.findByUserId → create if absent → getUncelebratedMilestones
    ⚠ also reachable as GET /api/streak (src/app/api/streak/route.ts:18) — a *read*
      that CREATES a Streak row
  celebrateMilestone(userId, milestoneId)                              :381–401
    findMilestoneById(id, userId) → throw 'Streak milestone not found'
    → StreakRepository.celebrateMilestone → audit 'MILESTONE_CELEBRATED'
  celebrateAchievement(userId, achievementId)                          :408–426
    this.repository.findById(userId, achievementId) → throw 'Achievement not found'
    → audit 'ACHIEVEMENT_CELEBRATED'   ⚠ and NOTHING ELSE
```

### 5.3 `buildWorldState` — the 13–14 query snapshot (`achievement.service.ts:76`–`:196`)

```
timezone = UserRepository().getSettings(userId).then(s => s?.timezone || DEFAULT_TZ)
           .catch(() => DEFAULT_TZ)                                     :92–95
today    = getTodayString(timezone)                                     :96
window   = [shiftCalendarDay(today, -730), today]   (PATTERN_HISTORY_DAYS = 730)  :44, :118
threshold= THRESHOLDS.achievements.perfectDay = 95                     :119

Promise.all #1  (:121–140)   6 queries
  StreakRepository.findByUserId(userId)                  → totals.streak = currentStreak ?? 0
  GoalRepository.findAll(userId, {})                      → goalsCompleted = filter(status==='COMPLETED').length
  ScoreRepository.findPerfectDayDates(userId, w, 95)     → perfectDayDates (select: date only)
  ScoreRepository.countActiveDays(userId, w)              → daysActive
  SleepRepository.countEarlyWakeups(userId, w, '06:00')   → earlyWakeups
  ScoreRepository.findByDate(userId, today)               → dailyScore = totalScore

Promise.all #2  (:142–154)   6 queries
  HabitRepository.countAllCompletedLogs(userId)           → totalHabitLogs   (UNBOUNDED — no range)
  MoodRepository.countMoodLogs(userId)                    ┐
  MoodRepository.countEnergyLogs(userId)                   ┴→ wellnessLogs = sum
  FocusRepository.countCompletedSessions(userId,
                    fromZonedTime(`${today}T20:00:00`, tz)) → lateEvenings   ◄── §26
  FocusRepository.getStats(userId)                        → focusHours = totalFocusMinutes/60
  JournalRepository.getStreakData(userId)                 → journalDates (every distinct date)

activeDates = includeActiveDates
              ? ScoreRepository.findActiveDayDates(userId, w)   : []      :158–160

perfectWeeks: bucket perfectDayDates by ISO week (Mon-anchored)          :165–173
              → count weeks with ≥ 7 members                              ◄── §25

return { totals: {…14 keys…}, streaks: {}, dates: { activeDates }, counts: {} }  :175–195
```

**Query budget:** 1 (settings) + 6 + 6 + 1 (`findActiveDayDates`) = **14** on the evaluation path, **13** on the `/next` path. **12 repository instances** (`User`, `Streak`, `Goal`, `Score` ×4, `Sleep`, `Habit`, `Mood` ×2, `Focus` ×2, `Journal`, `Achievement`).

**Three of those results are never read by any caller:**
- `dates.activeDates` — written, and `checker.resolveStreakValue` (`checker.ts:126`) is the only reader, but `totals.streak` is always a number so `resolveStreakValue` **never reaches** the `activeDates` branch. The comment at `achievement.service.ts:86`–`:89` admits this.
- `totals.journalEntries` — no definition in the catalogue has `field: 'journalEntries'`, so the whole `getStreakData` query (an unbounded `findMany` over every distinct journal date) is spent to fill a key nobody reads. §24 F10.
- `totals.focusMinutes` — only `focusHours` is referenced by a definition. Harmless but dead.

**Two totals are unbounded while four are windowed.** `countAllCompletedLogs(userId)` and `getStats(userId)` are called with no date range, so `milestone-habits-1000` (1000 logs) and `focus-champion` (500 sessions) genuinely mean *all time*, while `early-riser` (10 wake-ups) and `milestone-days-30` (30 days) are capped at 730 days despite declaring `timeframe: 'ALL_TIME'`. §24 F11.

### 5.4 `AchievementRepository` — `src/server/repositories/achievement.repository.ts` (128 lines)

| Method | Line | Query | Used by |
| ------ | ---- | ----- | ------- |
| `findByUserId` | 13 | `findMany({ userId, orderBy: unlockedAt desc })` | `checkForUnlocks:310`, `getNextUnearned:247` |
| `findUnlocked` | 27 | **byte-identical** to `findByUserId` | `listRecent:210` |
| `findById` | 41 | `findFirst({ id, userId })` — ownership-scoped | `celebrateAchievement:412` |
| `create` | 57 | `create({ data, user: connect })` | `checkForUnlocks:329` |
| `createMany` | 76 | `createMany({ skipDuplicates: true })` | **nothing — dead.** `skipDuplicates` needs a unique index and there is none. §24 F18 |
| `isUnlocked` | 97 | `count({ id, userId }) > 0` | **nothing — dead** |
| `recentUnlocked` | 114 | `findMany({ userId, orderBy: unlockedAt desc, take: min(limit,100) })` | `listRecent:209` |

### 5.5 Pure evaluation layer

| Module | Lines | Exports | Reads |
| ------ | ----- | ------- | ----- |
| `src/lib/constants/achievements.ts` | 400 | `ACHIEVEMENT_CATEGORIES` (7), `ACHIEVEMENT_RARITIES` (5), `ACHIEVEMENT_DEFINITIONS` (20), `AchievementCriteria`/`Definition` types, `rarityChipStyle`/`rarityTint` re-exports of `accentChipStyle`/`accentTint` (`@/lib/utils:94`, `:108`), 5 lookup helpers | nothing |
| `src/lib/achievements/definitions.ts` | 93 | re-exports the registry + `allDefinitions` (`:53`), `getAchievementById` (`:65`), `definitionsByCategory` (`:77`), `definitionsByRarity` (`:89`) | nothing |
| `src/lib/achievements/checker.ts` | 210 | `AchievementWorldState`, `resolveCriterionValue` (`:92`), `checkCriteria` (`:155`), `checkDefinition` (`:171`), `checkSnapshots` (`:201`) | nothing |
| `src/lib/achievements/unlock-logic.ts` | 135 | `hasUnlocked` (`:24`), `evaluateUnlocks` (`:37`), `canCelebrate` (`:72`), `buildUnlockEvent` (`:120`) | nothing |
| `src/lib/achievements/xp.ts` | 143 | `ACHIEVEMENT_XP`, `xpNeededForLevel` (`:29`), `cumulativeXpForLevel` (`:35`), `computeTrophyLevel` (`:68`), `rarityOfTitle` (`:103`), `xpOfTitle` (`:113`), `xpForRow` (`:133`), `MAX_TROPHY_LEVEL = 50` | nothing |
| `src/config/scoring.ts` | 272 | `THRESHOLDS.achievements = { perfectDay: 95, excellentDay: 85, goodDay: 70 }` | nothing |

**Dead exports in this layer** — each is defined, documented with an `@example`, and never imported anywhere:
`checker.ts:201 checkSnapshots` · `unlock-logic.ts:72 canCelebrate` · `xp.ts:113 xpOfTitle` · `definitions.ts:77 definitionsByCategory` · `definitions.ts:89 definitionsByRarity` · `constants/achievements.ts:382 getAchievementDefinition` · `:386 getCategoryConfig` · `:390 getRarityConfig` · `constants/achievements.ts:394 findDefinitionsByCategory` · `:398 findDefinitionsByRarity`. `ALL_FIELDS`-style classification aside, `checker.ts:105`–`:110`'s `field === 'streak'` fallback and `resolveStreakValue`'s per-habit/`activeDates` branches (`:116`–`:132`) are also unreachable, because `buildWorldState` always sets `totals.streak` to a number. §24 F9.

### 5.6 The XP ladder

```
ACHIEVEMENT_XP = { COMMON: 10, UNCOMMON: 25, RARE: 50, EPIC: 100, LEGENDARY: 250 }   xp.ts:17–23
xpNeededForLevel(level)     = level < 1 ? 0 : 100 + (level-1) * 150                  xp.ts:29
cumulativeXpForLevel(level) = Σ xpNeededForLevel(1 … level-1)                        xp.ts:35
computeTrophyLevel(xp)      → { level, currentXp, nextLevelAt, neededForNext, progress, maxed }  xp.ts:68
MAX_TROPHY_LEVEL = 50                                                              xp.ts:59

Level 1 reached at      0 XP
Level 2 reached at    100 XP
Level 3 reached at    250 XP     (100 + 150)
Level 4 reached at    450 XP     (100 + 150 + 200)
…
Level 50 (max) at  184,900 XP   (50 terms of 100 + 150k)
```

**One nuance worth stating:** with the *corrected* XP values, the **entire** 20-achievement catalogue is worth `10+25+50+100+250` per rarity tier as earned — realistically a user earns a mix, so level 1–3 covers a normal account and level 50 requires ~740 legendary-tier equivalents, i.e. the ladder is effectively unbounded by design. This is not a defect, but it does mean `maxed` is unreachable in practice.

---

## 6. Database dependency

### 6.1 `model Achievement` — `prisma/schema.prisma:1912`–`:1938`

```prisma
model Achievement {
  id     String @id @default(cuid())
  userId String
  user   User   @relation(fields: [userId], references: [id], onDelete: Cascade)

  type        AchievementType
  title       String
  description String?         @db.Text

  icon  String?
  color String?

  level Int @default(1) // for tiered achievements

  unlockedAt DateTime @default(now())
  celebrated Boolean  @default(false)
  isPublic   Boolean  @default(false)

  metadata String? // JSON with achievement details

  createdAt DateTime @default(now())

  @@index([userId, unlockedAt])
  @@index([type, level])
  @@index([userId, createdAt])
}
```

Column-by-column against how the app actually uses it:

| Column | Written by | Read by | Verdict |
| ------ | ---------- | ------- | ------- |
| `id` | Prisma default `cuid()` | `AchievementBadge key`, notification `relatedEntityId`, the **404** `/achievements/${id}` link | cuid — **not** a definition id. §24 F7 |
| `userId` | `AchievementRepository.create` via `user.connect` (`:65`) | every query is `userId`-scoped | ✅ ownership enforced in the query, not in JS |
| `type` | `definition.type` (`achievement.service.ts:330`) | nowhere on the page; `@@index([type, level])` exists for it | 15 enum values, **12 never used** by the catalogue |
| `title` | `definition.name` (`:331`) | `unlockedByTitle` map (`page.tsx:175`), `rarityOfTitle` (`xp.ts:103`) | **Denormalised display name.** This is the root of §7.1 |
| `description` | `definition.description` | `row.description ?? definition?.description` (`page.tsx:192`) | duplicated from the catalogue; `?? ` fallback is unreachable for app-written rows |
| `icon` / `color` | `definition.icon` / `definition.color` | `row.icon ?? definition?.icon` (`page.tsx:193`–`:194`) | same duplication |
| `level` | **`definition.criteria[0]?.value ?? 1`** (`:328`) | `xpForRow`'s rarity fallback (`xp.ts:141`), `AchievementPopup`'s "Level N" chip (`AchievementPopup.tsx:234`–`:236`) | 🔴 **Stores a threshold, not a level.** The schema comment says "for tiered achievements" and `@@index([type, level])` implies a tier, but `first-goal-completed` stores `1` (threshold) and `milestone-habits-1000` stores `1000`. §24 F6 |
| `unlockedAt` | default `now()` | `orderBy` on both list queries, the history grouping key | ✅ |
| `celebrated` | **never written** | **never read** | 🔴 Dead column. `celebrateAchievement` writes only an `ActivityLog`. §24 F4 |
| `isPublic` | never written | never read | Dead column — no sharing feature exists |
| `metadata` | `JSON.stringify({ definitionId: definition.id })` (`:336`) | `definitionIdOf` (`achievement.service.ts:51`–`:59`), `parseProgress` (`page.tsx:66`–`:81`) | The **only** reliable `definition.id` link — and the page ignores it for joining, using `title` instead. `parseProgress` looks for `current`/`target` keys that are never written. §24 F12, F16 |
| `createdAt` | default | never read | dead |

🔴 **No `@@unique` anywhere.** Three indexes, all non-unique: `[userId, unlockedAt]`, `[type, level]`, `[userId, createdAt]`. There is nothing preventing two rows for the same definition, and `createMany`'s `skipDuplicates: true` (`:86`) has no index to skip against. §24 F11.

### 6.2 `enum AchievementType` — `prisma/schema.prisma:192`–`:207`

15 members. The catalogue uses 12. **`PERFECT_QUARTER` and `CUSTOM` are never written**, and `ACHIEVEMENT_CATEGORIES.CUSTOM` (`constants/achievements.ts:52`–`:57`) is likewise unused — no definition has `category: 'CUSTOM'`. Categories in use: `HABITS`, `GOALS`, `CONSISTENCY` (×4), `LIFESTYLE` (×2), `MASTERY` (×3), `MILESTONES` (×2) — 6 of 7.

### 6.3 The 14 models the snapshot reads

| Model | Line | Repository call | Achieved total | Window |
| ----- | ---- | --------------- | --------------- | ------ |
| `User` (settings) | — | `UserRepository.getSettings` | `timezone` | — |
| `Streak` | 1872 | `findByUserId` | `streak` = `currentStreak` | current value, not history |
| `Goal` | 1139 | `findAll(userId, {})` | `goalsCompleted` | **unbounded, full rows** |
| `DailyScore` | 1494 | `findPerfectDayDates` | `perfectDays` | 730 d |
| `DailyScore` | 1494 | `countActiveDays` | `daysActive` | 730 d |
| `DailyScore` | 1494 | `findByDate(today)` | `dailyScore` | today only |
| `DailyScore` | 1494 | `findActiveDayDates` | `dates.activeDates` (**unread**) | 730 d |
| `SleepLog` | 1294 | `countEarlyWakeups(…, '06:00')` | `earlyWakeups` | 730 d |
| `SleepLog` | 1294 | `countCompletedSessions` → no, this is `FocusSession` | — | — |
| `FocusSession` | 1602 | `countCompletedSessions(userId, fromZonedTime(today 20:00))` | `lateEvenings` | **today 20:00 → now** |
| `FocusSession` | 1602 | `getStats(userId)` | `focusHours`, `focusMinutes` | **unbounded** |
| `HabitLog` | 1012 | `countAllCompletedLogs(userId)` | `totalHabitLogs` | **unbounded** |
| `MoodLog` | 1368 | `countMoodLogs(userId)` | `wellnessLogs` (½) | **unbounded** |
| `EnergyLog` | 1397 | `countEnergyLogs(userId)` | `wellnessLogs` (½) | **unbounded** |
| `JournalEntry` | 1565 | `getStreakData(userId)` | `journalEntries` (**unread**) | **unbounded** |
| `Achievement` | 1912 | `findByUserId` ×2 | owned-set | all |

### 6.4 Two related models

`model Streak` (`:1872`) — `userId` is **`@unique`**, so there is exactly one streak row per user, and `currentStreak` is a single scalar. `totals.streak` is therefore a *global* streak, not "the longest per-habit streak" that `checker.resolveStreakValue`'s doc comment describes (`checker.ts:113`–`:115`). The three habit-streak achievements (`3 / 7 / 30 / 100 / 365`) all read that one number. §24 F8.

`model StreakMilestone` (`:1894`) — has a real `celebrated Boolean`, and `StreakRepository.celebrateMilestone` **does** write it (`:206`). So the *milestone* half of `POST /api/achievements/celebrate` works end-to-end, while the *achievement* half of the same endpoint writes nothing. That asymmetry is the clearest statement of the bug.

### 6.5 Side-effect tables

`checkForUnlocks` writes an `ActivityLog` row per unlock (`action: 'ACHIEVEMENT_UNLOCKED'`, `achievement.service.ts:346`–`:353`) and `notificationService.notifyAchievement` writes a `NotificationLog` (`notification.service.ts:548`–`:561`). Neither is in a transaction with the `Achievement` insert, so a notification failure after a successful insert leaves the badge awarded but unsignalled — and `checkForUnlocks` is `await`ed inside a `for…of` whose failure propagates to the caller. `habit.service.ts:386` and `goal.service.ts:320`/`:346` all attach `.catch()`, so the user action still succeeds. §24 F20.

---

## 7. The achievement catalogue — 20 definitions

Source: `src/lib/constants/achievements.ts:151`–`:372`. `Object.values()` order is the registry's insertion order, and `allDefinitions` (`definitions.ts:53`) preserves it — that order is what "closest first" then slices, and what `checkForUnlocks` returns in.

| # | id | name | type | category | rarity | criteria | `timeframe` | resolves? |
| - | -- | ---- | ---- | -------- | ------ | -------- | ----------- | --------- |
| 1 | `first-habit-streak` | First Streak 🌟 | `HABIT_STREAK` | HABITS | COMMON | `streak >= 3` | — | ✅ |
| 2 | `habit-streak-7` | One Week Strong 🔥 | `HABIT_STREAK` | HABITS | UNCOMMON | `streak >= 7` | — | ✅ |
| 3 | `habit-streak-30` | Month of Mastery 💎 | `HABIT_STREAK` | HABITS | RARE | `streak >= 30` | — | ✅ |
| 4 | `habit-streak-100` | Century Streak 🏆 | `HABIT_STREAK` | HABITS | EPIC | `streak >= 100` | — | ✅ |
| 5 | `habit-streak-365` | Iron Habit 👑 | `HABIT_STREAK` | HABITS | LEGENDARY | `streak >= 365` | — | ✅ |
| 6 | `first-goal-completed` | First Win 🏁 | `GOAL_COMPLETED` | GOALS | COMMON | `goalsCompleted >= 1` | — | ✅ |
| 7 | `goals-completed-10` | Goal Getter 🎖️ | `GOAL_COMPLETED` | GOALS | UNCOMMON | `goalsCompleted >= 10` | — | ✅ |
| 8 | `goals-completed-50` | Wall of Wins 🏆 | `GOAL_COMPLETED` | GOALS | **LEGENDARY** | `goalsCompleted >= 50` | — | ✅ |
| 9 | `perfect-day` | Perfect Day 💯 | `PERFECT_DAY` | CONSISTENCY | UNCOMMON | `dailyScore >= 95` | `DAY` | ⚠ today only |
| 10 | `perfect-week` | Perfect Week 🔥 | `PERFECT_WEEK` | CONSISTENCY | RARE | `perfectDays >= 7` | `WEEK` | ⚠ not consecutive |
| 11 | `perfect-month` | Perfect Month 👑 | `PERFECT_MONTH` | CONSISTENCY | EPIC | `perfectDays >= 30` | `MONTH` | ⚠ not consecutive |
| 12 | `perfect-year` | Perfect Year 🌟 | `PERFECT_YEAR` | CONSISTENCY | LEGENDARY | `perfectDays >= 365` | `YEAR` | ⚠ not consecutive, and 730-day window |
| 13 | `early-riser` | Early Riser 🌅 | `EARLY_RISER` | LIFESTYLE | UNCOMMON | `earlyWakeups >= 10` | `ALL_TIME` | ⚠ 730-day cap |
| 14 | `night-owl` | Night Owl 🌙 | `NIGHT_OWL` | LIFESTYLE | UNCOMMON | `lateEvenings >= 20` | `ALL_TIME` | 🔴 **unreachable** |
| 15 | `productivity-master` | Productivity Master 👑 | `PRODUCTIVITY_MASTER` | MASTERY | EPIC | `focusHours >= 100` | `ALL_TIME` | ✅ |
| 16 | `wellness-warrior` | Wellness Warrior 💚 | `WELLNESS_WARRIOR` | MASTERY | RARE | `wellnessLogs >= 30` | `ALL_TIME` | ✅ |
| 17 | `focus-champion` | Focus Champion 🧠 | `FOCUS_CHAMPION` | MASTERY | LEGENDARY | `focusSessions >= 500` | `ALL_TIME` | ✅ |
| 18 | `consistency-king` | Consistency King 👑 | `CONSISTENCY_KING` | CONSISTENCY | EPIC | `perfectWeeks >= 4` | `MONTH` | ⚠ not consecutive |
| 19 | `milestone-habits-1000` | Thousand Builders 📍 | `MILESTONE` | MILESTONES | RARE | `totalHabitLogs >= 1000` | `ALL_TIME` | ✅ |
| 20 | `milestone-days-30` | One Month In 📆 | `MILESTONE` | MILESTONES | UNCOMMON | `daysActive >= 30` | `ALL_TIME` | ✅ |

**Every definition has exactly one criterion.** That is load-bearing in three places: `checkForUnlocks` writes `level = definition.criteria[0]?.value ?? 1` (`:328`); `getNextUnearned` reads only `criteria[0]` for `target` (`:263`); and the `?? 1` fallback implies a multi-criterion definition was anticipated. Nothing enforces it — adding a second criterion today would silently drop it from both the `level` column and the progress ring. §24 F21.

**Distinct criterion fields: 12** — `streak`, `goalsCompleted`, `dailyScore`, `perfectDays`, `earlyWakeups`, `lateEvenings`, `focusHours`, `wellnessLogs`, `focusSessions`, `perfectWeeks`, `totalHabitLogs`, `daysActive`. The snapshot produces 14 totals, so the two extras (`journalEntries`, `focusMinutes`) are unmatched, matching §5.3.

**Rarity distribution (as defined):** COMMON ×3, UNCOMMON ×5, RARE ×4, EPIC ×4, LEGENDARY ×4. Total catalogue value if fully earned: `3×10 + 5×25 + 4×50 + 4×100 + 4×250 = 1,705 XP` → trophy level 6. **As currently rendered**, the history and the XP total disagree with that (§7.1).

### 7.1 🔴 Critical — `rarityOfTitle` can never resolve

```
constants/achievements.ts:151   ACHIEVEMENT_DEFINITIONS = { 'first-habit-streak': {…}, … }   ← keyed by id
xp.ts:103  rarityOfTitle(title) { return getAchievementById(title)?.rarity; }
xp.ts:65   getAchievementById(id) { return ACHIEVEMENT_DEFINITIONS[id]; }   ← same id-keyed registry
```

The service writes `title: definition.name` (`:331`). So the lookup receives `'First Streak'`, `'One Week Strong'`, `'Month of Mastery'`… and the registry is keyed `'first-habit-streak'`, `'habit-streak-7'`, `'habit-streak-30'`… **No name string equals any id string.** `getAchievementById` returns `undefined` for all 20 rows, every time, for every user.

Control then falls to `xpForRow`'s fallback (`xp.ts:141`):

```ts
const clamped = TIER_ORDER[Math.max(0, Math.min(TIER_ORDER.length - 1, row.level - 1))] ?? 'COMMON';
```

`TIER_ORDER = ['COMMON','UNCOMMON','RARE','EPIC','LEGENDARY']` (`:119`) — indices 0–4. And `row.level` is the **criterion threshold** (§6.1). So the rendered tier is a function of how big the target number is:

| definition | `level` (= threshold) | `level-1` clamped | **rendered tier** | **true tier** | verdict |
| ---------- | --------------------- | ----------------- | ----------------- | ------------- | ------- |
| First Streak | 3 | 2 | **RARE** | COMMON | 🔴 |
| One Week Strong | 7 | 4 | **LEGENDARY** | UNCOMMON | 🔴 |
| Month of Mastery | 30 | 4 | **LEGENDARY** | RARE | 🔴 |
| Century Streak | 100 | 4 | **LEGENDARY** | EPIC | 🔴 |
| Iron Habit | 365 | 4 | **LEGENDARY** | LEGENDARY | ✅ by luck |
| First Win | 1 | 0 | **COMMON** | COMMON | ✅ by luck |
| Goal Getter | 10 | 4 | **LEGENDARY** | UNCOMMON | 🔴 |
| Wall of Wins | 50 | 4 | **LEGENDARY** | LEGENDARY | ✅ by luck |
| Perfect Day | 95 | 4 | **LEGENDARY** | UNCOMMON | 🔴 |
| Perfect Week | 7 | 4 | **LEGENDARY** | RARE | 🔴 |
| Perfect Month | 30 | 4 | **LEGENDARY** | EPIC | 🔴 |
| Perfect Year | 365 | 4 | **LEGENDARY** | LEGENDARY | ✅ by luck |
| Early Riser | 10 | 4 | **LEGENDARY** | UNCOMMON | 🔴 |
| Night Owl | 20 | 4 | **LEGENDARY** | UNCOMMON | 🔴 |
| Productivity Master | 100 | 4 | **LEGENDARY** | EPIC | 🔴 |
| Wellness Warrior | 30 | 4 | **LEGENDARY** | RARE | 🔴 |
| Focus Champion | 500 | 4 | **LEGENDARY** | LEGENDARY | ✅ by luck |
| Consistency King | 4 | 3 | **EPIC** | EPIC | ✅ by luck |
| Thousand Builders | 1000 | 4 | **LEGENDARY** | RARE | 🔴 |
| One Month In | 30 | 4 | **LEGENDARY** | UNCOMMON | 🔴 |

**14 of 20 render the wrong tier** (the 6 "by luck" rows are correct only because their threshold happens to land in the right bucket). Every threshold ≥ 5 saturates to `LEGENDARY`.

**The consequence is a self-contradiction on one screen.** The grid resolves rarity by **name** (`page.tsx:188` → `definition?.rarity ?? xpForRow(row).rarity`) so cards are **correct**. The history resolves it by `xpForRow` alone (`page.tsx:230`) so history rows are **wrong**. Both are rendered from the same `rows` array, ~55 lines apart, in the same viewport:

```
grid card   →  "🏅 First Streak   [RARE]  💎"          (definition.rarity — correct)
history row →  "🏅 First Streak   [RARE]  +50 XP"      (xpForRow — should be COMMON, +10 XP)
```

And because `totalXp` is summed from the same wrong tiers (`page.tsx:246`), the **trophy level and the whole XP progress bar are wrong too** — a user with only `First Streak` unlocked is shown 50 XP and is closer to level 2 than they are.

**Suggested fix** (not applied): join on the id that already exists in `metadata`. Either

```ts
// xp.ts — accept the id the service actually stored
export function rarityOfDefinitionId(id: string): AchievementRarity | undefined {
  return getAchievementById(id)?.rarity;
}
```
with callers reading `definitionIdOf(row.metadata)`, or — smallest possible change — make the fallback impossible to reach by giving `AchievementService` a `rarity` in the API row (it is already known: `definition.rarity` is in `UnlockEvent` at `unlock-logic.ts:106`). Either way `level` should stop being read as a tier, which also fixes §24 F6.

---

## 8. Complete user actions (serial)

Everything a user can do that touches this system, in the order the code executes it.

### 8.1 Load `/achievements`

```
GET /api/achievements                       (awaited — drives loading/error)
  auth() → 401 | AchievementService.listRecent(userId, limit=50)
    Promise.all ─┬─ recentUnlocked(userId, 50)  take 50, orderBy unlockedAt desc
                 └─ findUnlocked(userId)        full materialisation, .length   ← total
  → { success: true, data: AchievementRow[], meta: { total, limit: 50, offset: 0 } }
  apiRequest unwraps .data                                                            api-client.ts:109

GET /api/achievements/next?count=100      (fire-and-forget, cannot set error)
  auth() → 401 | AchievementService.getNextUnearned(userId, 100)
    findByUserId → ownedSet → unowned (≤ 20)
    buildWorldState(userId, { includeActiveDates: false })   ◄── 12 queries
    per definition: criteria[0] → { current, target, percent }
    sort percent DESC, nulls last → slice(0, 100)             service.ts:285–291
  → { success: true, data: NextUpRow[] }        (≤ 20 rows; the 100 cap is inert)
```

⚠ **`count=100` is inert.** The catalogue has 20 definitions and `getNextUnearned` filters to *unowned* ones (`service.ts:254`), so the response can never exceed 20 rows. The route's docstring justifies the `max(100)` cap by claiming "the catalogue is 12 definitions" (`next/route.ts:22`) — stale, and the same stale number appears at `page.tsx:160`. Harmless, but the comments misdescribe the code. §24 F22.

⚠ The **same snapshot runs twice** on a dashboard page load that includes both this page's strip and the page itself: `AchievementsStrip` requests `count=3`, the page requests `count=100`, and each call re-runs `buildWorldState` independently. There is no cache and no shared request.

### 8.2 Filter the grid

`AchievementList` holds `status` and `tier` in local `useState` (`:45`–`:46`) and filters in a `useMemo` (`:48`–`:57`). Pure client-side, no request. Counts are recomputed on every render of the `counts` memo (`:59`–`:66`). State is **not** lifted and **not** persisted — a filter resets on navigation. There is no URL query param, so the grid is not shareable or linkable.

### 8.3 Earn an achievement (the only write path)

```
user completes a habit | a goal | a focus session
  │
  ├─ SERVER-SIDE, fire-and-forget (each with its own .catch):
  │     habit.service.ts:386          achievementService.checkForUnlocks(userId)
  │     goal.service.ts:320, :346     achievementService.checkForUnlocks(userId)
  │     (each `new AchievementService()` — no shared instance)
  │
  ├─ CLIENT-SIDE:
  │     store/achievement.store.ts:90  runAchievementCheck()
  │       → POST /api/achievements/unlock
  │       → checkForUnlocks
  │       → pushEvents(...)
  │     callers: TodayHabitChecklist.tsx:292, goals/page.tsx:194, FocusTimer.tsx:683
  │
  └─ checkForUnlocks                    achievement.service.ts:300–357
       L310  read owned rows FIRST
       L317  if every definition is already owned → return []      ◄── the hot-path bail
       L321  buildWorldState(userId)         ~13 queries, 12 repositories
       L322  evaluateUnlocks(userId, worldState, ownedIds)   lib/achievements/unlock-logic
       L327  for…of { await }  ◄── SEQUENTIAL, not Promise.all
         L328  level = definition.criteria[0]?.value ?? 1      ◄── a THRESHOLD, not a level
         L329  repository.create(userId, {
                 type, title: definition.name, description, icon, color, level,
                 metadata: JSON.stringify({ definitionId: definition.id }) })
         L339  buildUnlockEvent(definition, achievement.unlockedAt)
         L342  notificationService.notifyAchievement(userId, { id, title })
         L346  auditRepository.createActivity({ action: 'ACHIEVEMENT_UNLOCKED', … })
       L356  return the events in catalogue order
```

A single user action can therefore trigger the check **two or three times concurrently**: `goal.service.ts` fires on completion and `goals/page.tsx:194` fires on the client for the same completion, and `habit.service.ts:386` fires alongside `TodayHabitChecklist.tsx:292`. Neither the client nor the server path takes a lock, and there is no unique index (§6.1). 🔴 **The duplicate-row race described in §24 F11 is the direct consequence of four independent callers and no unique constraint.**

Consequences of a duplicate row, all user-visible on this page:
- `unlockedCount` (`page.tsx:226`) counts rows, not distinct definitions → "**6** of 21 achievements unlocked" on a 20-achievement catalogue.
- `achievements.length` (`:223`) inflates the denominator the same way.
- The grid renders **two identical cards** (keyed by `row.id`, so React keeps both).
- `totalXp` (`:246`) double-counts.
- The history shows the same badge twice, on the same or adjacent day.

### 8.4 Dismiss a celebration toast

`AchievementPopup.dismiss` (`:155`–`:161`) pops its local queue, writes `routineos_last_achievement_seen` to `localStorage`, then calls `onDismiss` → `CelebrationHost`'s `dismissFirst` → `store.dismissFirst` slices the zustand queue (`:79`–`:80`). Auto-hide fires the same path after `autoHideMs` (default **8000** from `CelebrationHost:27`; the component's own default is 7000). The progress bar animates `width: 100% → 0%` over exactly `autoHideMs` (`:249`–`:255`), so the countdown and the dismissal are in sync.

⚠ The **local** queue and the **store** queue are two independent arrays. If a new event is pushed while one is on screen, the popup appends it locally (`:100`–`:107`) *and* the store has it queued; dismissing once pops the local head only. A second dismiss is needed to advance the store, so the next toast can appear to "replay" the event the user just dismissed. §24 F23.

### 8.5 Reach the page from elsewhere

`DashboardWidgets.tsx:76` toggles the strip; the strip's "View all" links to `/achievements` (`AchievementsStrip.tsx:293`). The **notification bell** also links here — but via `/achievements/${achievement.id}`, which does not exist (§24 F7). The `StreakBadge` and `StreakCard` components fetch `/api/streak`, which is served by `AchievementService.getStreakWithMilestones` (`api/streak/route.ts:18`) — the same class, a different method, sharing no state with this page.

---

## 9. What can the user create

**Nothing.** `/achievements` has no create affordance: no button, no form, no modal, no `POST` from the page. The only writes to `Achievement` are server-side `checkForUnlocks` inserts (`achievement.service.ts:329`) and `POST /api/achievements/celebrate`'s audit row (`:417`–`:423`).

This is a deliberate design — the catalogue is a compile-time constant (`ACHIEVEMENT_DEFINITIONS`, `constants/achievements.ts:151`) and the DB table is a **record of unlocks**, not a definition store. The table's shape confirms it: it stores `title`, `description`, `icon`, `color` as **denormalised copies** of the definition rather than a `definitionId` column, which is what you would write if definitions were user-editable rows.

Consequences of that choice, all documented as findings because they are real costs:
- A catalogue edit (rename, rarity change, icon change) does **not** retro-apply. `row.title` keeps the old string, the page's `unlockedByTitle` join misses, and the badge appears **twice** — once as an earned row, once as a locked catalogue entry. There is no migration and no fallback to `metadata.definitionId`. §24 F24.
- The catalogue cannot be extended without a deploy, and there is no admin surface.
- `ACHIEVEMENT_CATEGORIES.CUSTOM` (`:52`) and `AchievementType.CUSTOM` exist for a user-created feature that does not exist.

## 10. What can the user edit

**Nothing on this page.** The only state the user controls is the transient filter (`status`, `tier` in `AchievementList`'s local `useState`, `:45`–`:46`), which is not persisted anywhere and resets on navigation.

The closest thing to an edit in the whole domain is `POST /api/achievements/celebrate`, which the page never calls and **no component in the repo calls** — the only reference to that path outside the route itself is a comment in `push.service.ts:77`. It is a fully implemented, authenticated, audited, unreachable endpoint. §24 F25.

Not editable, and worth stating because the UI implies otherwise:
- Achievement name, description, icon, colour, rarity, criteria — all compile-time.
- The displayed `level` — it is derived at insert time and never updated, so a catalogue threshold change leaves old rows with a stale number.
- `celebrated` — the column exists, the audit row is written, the column is never set (§24 F4).
- `isPublic` — no write, no read, no feature.

## 11. What can the user delete

**Nothing.** There is no `DELETE` route under `src/app/api/achievements/` — the directory contains exactly `route.ts`, `celebrate/route.ts`, `next/route.ts`, `unlock/route.ts`. `AchievementRepository` has no delete method.

The only way a row disappears is `User` deletion, via `onDelete: Cascade` on `Achievement.user` (`schema.prisma:1915`).

This is the right call for an append-only ledger — an achievement is a historical fact and un-earning it would be dishonest. But it interacts badly with the duplicate-row race (§8.3): there is no way for a user to clear a duplicate, and no admin cleanup path. §24 F26.

---

## 12. Cross-page dependencies

### 12.1 Inbound — what this page's data depends on

| Source | What is read | How |
| ------ | ------------- | --- |
| `/api/achievements` | owned `Achievement` rows | `page.tsx:140`, `AchievementsStrip.tsx:234`, `AchievementPopup.tsx:116` |
| `/api/achievements/next` | unowned + progress | `page.tsx:161`, `AchievementsStrip.tsx:235` |
| `@/lib/constants/achievements` | the 20 definitions, 5 rarities, chip helpers | `page.tsx:6`–`:11` |
| `@/lib/achievements/xp` | `ACHIEVEMENT_XP`, `computeTrophyLevel`, `xpForRow` | `page.tsx:12`–`:16` |

Transitively, the two endpoints depend on **12 repositories** across **14 models** (§6.3) — habits, goals, scores, sleep logs, focus sessions, mood logs, energy logs, journal entries, streaks. So `/achievements` is a read of nearly the entire database.

### 12.2 Outbound — who depends on this page's system

| Consumer | Relationship |
| -------- | ------------ |
| `src/app/(dashboard)/layout.tsx:64` | mounts `CelebrationHost` → `AchievementPopup` on **every** dashboard page |
| `src/components/dashboard/AchievementsStrip.tsx` | same two endpoints; renders 6 owned + 3 next; links here at `:293` |
| `components/dashboard/DashboardWidgets.tsx:76` | user toggle for the strip |
| `components/today/TodayHabitChecklist.tsx:292` | fires `runAchievementCheck()` on a habit completing |
| `components/focus/FocusTimer.tsx:683` | fires it on a focus session ending |
| `app/(dashboard)/goals/page.tsx:194` | fires it on a goal completing |
| `server/services/habit.service.ts:386` | fires `checkForUnlocks` server-side |
| `server/services/goal.service.ts:320`, `:346` | fires it server-side (twice) |
| `server/services/notification.service.ts:548` | `notifyAchievement` writes the notification + the 404 link |
| `server/services/email.service.ts:391` | `sendAchievementUnlocked` — **zero callers** |
| `emails/achievement-unlocked.tsx` (119 lines) | the template, registered at `lib/email/templates.ts:26` |
| `app/api/streak/route.ts:18` | `getStreakWithMilestones` on the same service class |
| `app/(dashboard)/analytics/page.tsx:25` | `components/analytics/AchievementsStrip` (51 lines) renders `AnalyticsAchievement[]` from `src/types/analytics.ts` — a **different**, read-only strip |
| `components/calendar/page.tsx:135` | shows `milestone.celebrated`, i.e. `StreakMilestone`, not `Achievement` |

### 12.3 🔴 A duplicated component with a different contract

There are **two** `AchievementsStrip.tsx` files:

| File | Lines | Data source | Renders rarity? | Ring? |
| ---- | ----- | ------------ | --------------- | ----- |
| `components/dashboard/AchievementsStrip.tsx` | 337 | live `GET /api/achievements` + `/next` | no | yes (SVG `stroke-dashoffset`) |
| `components/analytics/AchievementsStrip.tsx` | 51 | `AnalyticsAchievement[]` prop from `/analytics` | no | no |

Both are named identically, both render a strip of achievements, and neither imports the other. The analytics one is presentational and takes props; the dashboard one fetches for itself. §24 F27.

---

## 13. Impact analysis

**If `/achievements` were deleted:** the route and its page vanish; `AchievementList`, `AchievementBadge`, `ProgressBar` lose one of two importers (`ProgressBar` keeps `AchievementBadge`); `AchievementsStrip`'s "View all" link 404s. Unlocks would keep happening — `checkForUnlocks` is called from three server sites and three client sites, none of which is this page. The trophy level, the 20-definition catalogue, and the unlock ledger would all survive, headless.

**If `checkForUnlocks` were removed:** the table stops growing, `GET /api/achievements` returns only what already exists, the history freezes, the toast never fires (the popup fallback would keep replaying the newest existing row once per browser, then stop via `localStorage`), and `/next` becomes the only live surface. The dashboard strip would still show progress rings — it reads `/next`, not the ledger.

**If `rarityOfTitle` were fixed (§7.1):** 14 of 20 badges immediately display their true rarity, the history stops contradicting the grid, and `totalXp` drops by a large factor for most users (a `First Streak` goes 50 → 10 XP), which lowers trophy levels. **This is a visible regression to users who have seen the current numbers** — worth a migration note rather than a silent fix.

**If the duplicate race were fixed with a unique index:** existing duplicate rows must be de-duplicated first or the `createMany`/insert would start throwing on `P2002`. A composite `@@unique([userId, type, level])` would be wrong — `level` is a threshold, and two definitions legitimately share `(type, level)` pairs. The correct key is `definitionId`, which **is not a column**: it only exists as JSON inside `metadata`. Fixing this properly means promoting `definitionId` to a real column. §24 F28.

**Blast radius of the `timeframe` bug (§27):** 5 of 20 definitions (`perfect-day`, `perfect-week`, `perfect-month`, `perfect-year`, `consistency-king`) evaluate against the wrong scope. The most visible is `perfect-day`, whose `dailyScore` is **today's** score only — so the badge can only fire in the evening of a qualifying day, and a user who qualifies while offline never gets it.

**Blast radius of the 404 links:** every achievement notification (in-app bell, `NotificationHistory.tsx:468` renders `actionUrl` as an `<a href>`) and every achievement email button points at a non-existent route. In-app this is a dead "Achievement unlocked: X" entry the user can click forever with no destination. §24 F7.

---

## 14. Current System Capabilities

Everything below is implemented and reachable today.

| Capability | Evidence |
| ---------- | -------- |
| 20 achievements across 6 categories and 5 rarity tiers | `constants/achievements.ts:151`–`:372` |
| Persistent unlock ledger, cascade-deleted with the user | `schema.prisma:1912`, `AchievementRepository:57` |
| Server-side unlock evaluation on habit, goal and focus writes | `habit.service.ts:386`, `goal.service.ts:320`/`:346`, `FocusTimer.tsx:683` |
| Hot-path bail once everything is owned (1 query instead of 13) | `achievement.service.ts:317`–`:319` |
| Bounded 730-day history window | `PATTERN_HISTORY_DAYS = 730`, `achievement.service.ts:44` |
| Aggregate-only reads — no full-row materialisation for counts | `countActiveDays`, `countEarlyWakeups`, `findPerfectDayDates`, `findActiveDayDates` (`score.repository.ts:109`, `:137`, `:168`; `sleep.repository.ts:179`) |
| Timezone-correct "today" and 20:00 boundary (was hard-coded UTC) | `getTodayString(tz)`, `fromZonedTime`, `achievement.service.ts:96`, `:150` |
| Opt-out of the per-day list for the `/next` path | `includeActiveDates` option, `:78`, `:91`, `:158` |
| Progress toward unearned badges with a deliberate `null` for "untracked" | `getNextUnearned:268`, `page.tsx:53` |
| "Closest first" ordering with unmeasurable badges last | `service.ts:285`–`:291` |
| Derived trophy level, XP and progress bar — nothing persisted | `xp.ts:68`, `page.tsx:272` |
| Rarity histogram and per-row XP chips | `page.tsx:248`–`:257`, `:422`–`:423` |
| Day-grouped unlock history | `page.tsx:259`–`:269`, `:380`–`:434` |
| Client-side status + rarity filters with live counts | `AchievementList.tsx:45`–`:66` |
| Responsive 1→4 column grid | `AchievementList.tsx:117` |
| In-app notification + audit row per unlock | `notification.service.ts:548`, `achievement.service.ts:346` |
| Streak-milestone celebration (the working half of `/celebrate`) | `streak.repository.ts:202`–`:209` |
| Ambient motivation on `/dashboard`, toggleable | `AchievementsStrip.tsx`, `DashboardWidgets.tsx:76` |
| Celebration toast with auto-hide, countdown and reduced-motion | `AchievementPopup.tsx:164`–`:171`, `:186`–`:191` |
| Bounded retry so one 500 can't silence celebrations for the session | `AchievementPopup.tsx:47`, `:135`–`:142` |
| Theme-aware rarity chips and tints (WCAG AA on light and dark) | `constants/achievements.ts:126` → `utils.ts:94`, `:108` |
| Clean client/server boundary on this route | §3.1 — no `@/server/**`, no Prisma value import |

---

## 15. Currently NOT Supported

None of the following exists. Each is listed with the specific thing that is missing, because most read as "obviously it does that".

| Not supported | What is actually missing |
| ------------- | ------------------------ |
| Creating or editing an achievement | No write path from the UI; the catalogue is a compile-time constant (§9, §10) |
| Deleting or hiding an achievement | No `DELETE` route, no repository method (§11) |
| Custom or user-defined achievements | `AchievementType.CUSTOM` and `ACHIEVEMENT_CATEGORIES.CUSTOM` exist; nothing writes or renders them |
| Per-achievement detail page | **No `src/app/(dashboard)/achievements/[id]/`** — yet `notifyAchievement` and `sendAchievementUnlocked` both link to it (§24 F7) |
| Sharing or public achievements | `isPublic` column, never written, never read |
| A `celebrated` flag that works | Column exists; `celebrateAchievement` writes only an audit row (§24 F4) |
| True rarity-driven XP | `rarityOfTitle` never resolves; 14/20 wrong (§7.1) |
| A working XP/level that matches the catalogue | Same root cause — `totalXp` is summed from the broken tiers |
| Consecutive-day streak logic | `perfect-week` / `perfect-month` / `perfect-year` count *cumulative* days; `perfectWeeks` counts non-adjacent weeks (§25, §27) |
| `timeframe`-scoped criteria | `checkCriteria` never reads `criterion.timeframe` (`checker.ts:155`–`:166`) |
| An all-time `night-owl` | `lateEvenings` is bounded by today's 20:00 — the badge is unreachable (§26) |
| Resetting or re-rolling progress | No route, no repository method (§11) |
| Server-side pagination on this page | `offset` is validated and echoed in `meta` but never forwarded (§24 F13) |
| Persisting grid filters | Local `useState` in `AchievementList`; no URL param, lost on navigation |
| Persisting progress toward a locked badge | `metadata` carries only `definitionId`, so an earned tile can never render its own progress bar (§24 F16) |
| Offline / cached read | No SWR/React Query, no `loading.tsx`, no `error.tsx`, no offline cache for this route |
| Optimistic UI | None — the page has no mutations at all |
| Per-achievement "how do I get this" guidance | `description` is a static one-liner; no criterion echo, no link to the relevant page |
| Automated achievement email | `email.service.ts:391` `sendAchievementUnlocked` and `emails/achievement-unlocked.tsx` are fully written but **have zero callers** (§24 F29) |
| A test for any of it | `tests/` has 6 files (`score-calculator`, `dashboard-contributions`, `dashboard-derive`, `habit-contribution-eligibility`, `habit-contributions`, `routine-duration`). **None** touches `checker.ts`, `unlock-logic.ts`, `xp.ts`, or `achievement.service.ts`. The three critical defects in this document are all in pure, trivially-testable functions. §24 F30 |

---

## 16. Loading / Error / Empty / Edge states

### 16.1 The five states that exist

| State | Trigger | Render | Gap |
| ----- | ------- | ------ | --- |
| **Loading** | `rows === null && !error` | a centred `<Spinner class="h-6 w-6" />` in `py-16` (`page.tsx:318`–`:321`) | No skeleton. The summary card, the 20 tiles and the history have known heights; a skeleton would prevent the layout jump this causes. Also: because `/next` resolves separately, a fast `/next` + slow `/api/achievements` still shows the spinner, and a slow `/next` shows the page with locked tiles that briefly have no progress bars |
| **Error** | the first request throws | `<p role="alert" class="… bg-destructive/10 text-destructive">` above the content (`page.tsx:312`–`:316`) | **The rest of the page still renders.** With `rows === null` the `achievements` memo produces `[]`, so the grid shows "No achievements match / Try clearing the filters." — which is a *filter* empty state shown when there are no filters. No retry button; the user must reload. |
| **Empty (earned)** | `GET /api/achievements` → `[]` | The full page renders: level 1, 0 XP, an empty progress bar, five chips reading `0`, 20 locked tiles, and the history `EmptyState` ("No unlocks yet", `page.tsx:385`–`:392`) | There is no *page-level* empty state and no onboarding hint beyond the `EmptyState` description. A new user sees a working-looking page of 20 unearnable tiles. |
| **Empty (grid)** | a filter matches nothing | `EmptyState` with `description` only when a filter is active (`AchievementList.tsx:110`–`:115`) | ✅ correctly worded |
| **Empty (history)** | no unlocks | `EmptyState` "No unlocks yet" with a "complete habits, goals and focus sessions" hint (`page.tsx:385`–`:392`) | ✅ |

### 16.2 States that do not exist

- **Partial failure of `/next`** — swallowed at `page.tsx:163`–`:165`. Intentional and documented in the comment at `:151`–`:155` ("progress is an enhancement, not a requirement"), and it is the right call: the worst case is locked tiles without progress bars, which is the previous behaviour. But it is **invisible** — no console warning, no telemetry, so a permanently-broken `/next` would look like "no progress data" forever.
- **Stale data** — no revalidation, no `revalidate`, no refetch on focus. The page shows whatever was there at mount; a badge unlocked on another tab never appears until reload.
- **Duplicate rows** — not an edge case the UI defends against; it silently inflates every count (§8.3).
- **Very long titles** — `truncate` + `title` attribute on the card (`AchievementBadge.tsx:117`–`:119`) and in history (`page.tsx:414`); descriptions are `line-clamp-2` (`:123`) and `truncate` (`:418`). ✅
- **Empty `description`/`icon`/`color`** — every `??` fallback resolves (`page.tsx:192`–`:194`, `:234`–`:238`, `AchievementBadge.tsx:53`, `:85`, `AchievementPopup.tsx:202`).
- **Reduced motion** — `Stagger` and the popup both respect it. ✅
- **`maxed` state** — renders 👑, "Maximum level", "Max" (`page.tsx:330`, `:346`, `:349`). Unreachable in practice (§5.6).
- **`localStorage` unavailable** — `readLastSeen`/`writeLastSeen` both try/catch (`AchievementPopup.tsx:59`–`:73`). ✅ Private-mode safe.
- **Negative / NaN XP** — `computeTrophyLevel` guards with `Number.isFinite` and `Math.max(0, …)` (`xp.ts:69`). ✅
- **`percent` > 100** — clamped in `getNextUnearned` (`service.ts:279`) and again in the strip's `Ring` (`AchievementsStrip.tsx:99`). ✅

---

## 17. Authentication & security

### 17.1 The route itself

`/achievements` is a client component under `src/app/(dashboard)/`, which is covered by the group layout's `privateMetadata` (`layout.tsx:26`) and by `src/proxy.ts` redirecting unauthenticated requests to `/login`. There is no page-level auth check — correct for a client page; the data is protected server-side.

### 17.2 Every endpoint re-derives identity from the session

All four routes call `auth()` first and return 401 without it:

```
route.ts:21-24          achievements      GET   auth() → session.user.id
next/route.ts:33-36     achievements/next GET   auth() → session.user.id
unlock/route.ts:14-17   achievements/unlock POST auth() → session.user.id
celebrate/route.ts:16-19 achievements/celebrate POST auth() → session.user.id
```

✅ **No route accepts a `userId` from the client.** `unlock` takes no body at all. This is the rule `FILE.MD` states and it holds.

### 17.3 Input validation

| Endpoint | Validation | Notes |
| -------- | ---------- | ----- |
| `GET /api/achievements` | `listAchievementsSchema` (`:14`–`:17`) — `limit` coerced int 1–100, `offset` coerced int ≥ 0, both optional | Empty strings become `undefined` via `searchParams.get(…) \|\| undefined` (`:28`), so `?limit=` is not a validation error. ✅ |
| `GET /api/achievements/next` | `nextSchema` (`:27`–`:29`) — `count` coerced int 1–100 | ✅ |
| `POST /api/achievements/celebrate` | `celebrateAchievementSchema` (`schemas/achievement.ts:8`–`:15`) — two optional `min(1)` strings + `.refine` requiring ≥ 1 | ✅ Correctly requires one. `achievementId as string` (`celebrate/route.ts:43`) is safe because of the refine |
| `POST /api/achievements/unlock` | **no schema — no body is read** | ✅ Correct |

### 17.4 Ownership enforcement

Every repository query that could touch another user's rows is `userId`-scoped: `findByUserId` (`:15`), `findById` (`:46` — `findFirst({ id, userId })`), `isUnlocked` (`:100`), `recentUnlocked` (`:119`), `createMany` (`:82`). `celebrateAchievement` uses `findById(userId, achievementId)` (`service.ts:412`) and `celebrateMilestone` uses `findMilestoneById(milestoneId, userId)` (`:385`), both of which throw `'… not found'` rather than returning someone else's row.

✅ **No IDOR is reachable.** The `as string` cast and the `'not found'` message-matching (§5.1) are style concerns, not security holes.

### 17.5 Injection and rendering

- All Prisma access goes through `findMany`/`count`/`aggregate` with structured `where` objects. **No `$queryRaw`, no `$executeRaw`, no string interpolation** anywhere in this domain. ✅
- Notification body text interpolates `achievement.title` into a plain string (`notification.service.ts:556`–`:557`). That is a DB-stored value, not user input — but the title originates from `definition.name`, a compile-time constant, so it cannot be attacker-controlled. The **email** path does escape: `escapeHtml(achievement.title)` (`email.service.ts:398`). ✅
- React escapes all interpolated values by default; `title={…}` attributes and `style={{ … }}` inline colours are the only non-text sinks, and `accentColor` is always a catalogue hex or a DB copy of one. ✅

### 17.6 Rate limiting and abuse

❌ **None.** `POST /api/achievements/unlock` is an **unauthenticated-costly** endpoint: any authenticated client can call it in a loop. Each call costs 1 query when everything is owned (`service.ts:317`) but **13 queries** when anything remains unowned, and `buildWorldState` includes four **unbounded** aggregates (`countAllCompletedLogs`, `getStats`, `countMoodLogs`, `countEnergyLogs`). A user with 19/20 badges can force 13 queries per request, and with the trigger also firing automatically on every habit log, a burst of habit toggles is 13 queries each. §24 F31.

There is no idempotency key, no debounce, and no per-user rate limit on any of the four routes.

### 17.7 Privacy

Achievements are private by default (`isPublic` never set true). The `GET` endpoints return only the caller's rows. There is no export of achievements in `/settings/export` and no cross-user leak path. The `level` column and the `metadata` JSON are never rendered raw. ✅

---

## 18. Performance

### 18.1 The page's own cost

| Cost | Number | Notes |
| ---- | ------ | ----- |
| HTTP requests on mount | **2** | `page.tsx:140`, `:161` — issued in parallel, neither awaited by the other |
| …plus 1 from the toast | **3** | `CelebrationPopup`'s fallback fires because `CelebrationHost` passes `null` whenever the store queue is empty (`AchievementPopup.tsx:110`–`:125`). On **every** dashboard page, not just this one |
| Queries for `/api/achievements` | **2** | `recentUnlocked` + `findUnlocked` — the same rows twice, the second purely for `.length` (`service.ts:208`–`:212`) |
| Queries for `/api/achievements/next` | **13** | §5.3 |
| Rows materialised by `/next` | ≤ 20 | The `count=100` cap is inert (§8.1) |
| Client `useMemo` work | 2 passes over `rows` | `:174`–`:224`, `:228`–`:277`; each calls `DEFINITIONS.find` per row — O(rows × 20) |
| Bundle | 443-line page + 5 components | All client-side; the catalogue (400 lines) and `xp.ts` (143) ship to the browser |
| Caching | **none** | No `revalidate`, no `fetch` cache options, no SWR/React Query, no `unstable_cache` |

### 18.2 The two query problems worth naming

**(a) `listRecent` fetches every row twice.** `recentUnlocked` takes 50 and `findUnlocked` takes all, then `.length`. For a user with 20 badges that is 50 rows + 20 rows to produce a page of 20 and the number 20. A `count()` would be one index-only scan. §24 F32.

**(b) Four aggregates are unbounded while four are windowed to 730 days.** `countAllCompletedLogs(userId)`, `getStats(userId)`, `countMoodLogs(userId)`, `countEnergyLogs(userId)` take no range, and `getStreakData` returns **every distinct journal date** as an array (474-line repository, `journal.repository.ts:419`–`:435`). These are `count()`s and a `select: { date }` — cheap per row in Postgres, but they scan the user's entire history on every evaluation and every `/next` request, and `getStreakData`'s array is built, shipped over the wire, and then only `.length`'d. §24 F10, §24 F33.

The 730-day window itself (`PATTERN_HISTORY_DAYS`) is a deliberate and well-reasoned optimisation, documented at `:35`–`:43`: the longest criteria is a perfect-week streak, so capping at two years changes no reachable result. The same reasoning does **not** extend to the four unbounded calls.

### 18.3 What was already fixed

Documenting these because they show the intended trajectory:
- The owned-set read moved **before** `buildWorldState` with a bail-out (`service.ts:310`–`:319`) — the single biggest win, since it turns the common case (everything owned) from 13 queries into 1.
- The four 730-day full-row loads became aggregate/column-only queries (`score.repository.ts:109`, `:137`, `:168`; `sleep.repository.ts:179`) — `calculationData` JSON no longer crosses the network per row.
- `includeActiveDates: false` lets `/next` skip the per-day list (`service.ts:91`, `:158`).
- UTC hard-coding was replaced with the user's timezone (`getTodayString(tz)`, `fromZonedTime`) — `:69`–`:75` documents the `Asia/Tokyo` bug this fixed.

### 18.4 Still on the hot path

`checkForUnlocks` runs on **every habit log** (`habit.service.ts:386`) and twice per goal completion (`goal.service.ts:320`, `:346`), plus once per client action (`TodayHabitChecklist.tsx:292`, `FocusTimer.tsx:194`, `FocusTimer.tsx:683`). Until every definition is owned, each is 13 queries. For a typical user — who will own maybe 8 of 20 — **that is 13 queries per habit tap, forever.** The bail-out only helps users who have completed the catalogue.

The correct fix is not to make the query cheaper; it is to evaluate only the definitions whose criteria could have changed. A habit log can only affect `streak`, `perfectDays`, `daysActive`, `totalHabitLogs` and `dailyScore` — 8 of 20 definitions — so 12 of the 13 queries are wasted on every habit tap. There is also no debounce: a user toggling five habits in ten seconds pays 65 queries. §24 F31.

---

## 19. External integrations

| Integration | Present? | Detail |
| ----------- | -------- | ------ |
| **Neon / Postgres** | ✅ | `@/lib/prisma` via `DATABASE_URL`; all 14 models in §6.3 |
| **In-app notifications** | ✅ | `notificationService.notifyAchievement` (`notification.service.ts:548`–`:561`) writes a `NotificationLog` with `type: ACHIEVEMENT_UNLOCKED`, `relatedEntityId`, and `actionUrl: /achievements/${id}`. Surfaced in `NotificationHistory.tsx:466`–`:468` and filterable as `category=achievements` (`api/notifications/route.ts:45`). Dispatch runs via `dispatchDueNotifications`; `ACHIEVEMENT_UNLOCKED` is **not** in `DISPATCH_EXCLUDED_TYPES` (`:110`), so out-of-app channels are attempted. |
| **Email (Resend/SMTP)** | ⚠ written, never called | `email.service.ts:391` `sendAchievementUnlocked(to, { id, title })` builds a body with `renderButton(\`${APP_URL}/achievements/${id}\`, 'View achievement')` and calls `sendEmail`. The template is registered at `lib/email/templates.ts:26` and `emails/achievement-unlocked.tsx` (119 lines) exists with `subjectMap` at `lib/email/html.ts:38`. **Zero callers** — `checkForUnlocks` calls `notifyAchievement` (in-app) and nothing else. §24 F29 |
| **Push notifications** | ❌ | `push.service.ts:77` mentions `/api/achievements/celebrate` only in a comment about config collection. No push subscription for achievements. |
| **AI services** | ❌ | `src/server/ai` is not touched by this domain. Achievement descriptions are static. |
| **External analytics / telemetry** | ❌ | No error reporting, no metrics, no tracing. The `/next` failure swallow (`page.tsx:163`) is unobservable. |
| **Calendar / iCal** | ❌ | Not referenced. |

🔴 **Both outbound links are broken.** `notification.service.ts:560` and `email.service.ts:398` construct `/achievements/${achievementId}`. `src/app/(dashboard)/achievements/` contains exactly one file — `page.tsx`. There is **no `[id]` route**, so every achievement notification's click-through and every achievement email's button lands on a 404. The IDs are `cuid()`s, so even the *page* could not resolve one to a catalogue entry without the `metadata.definitionId` lookup. §24 F7.

---

## 20. Background jobs / cron effects

**None. There is no scheduled achievement evaluation anywhere.**

`vercel.json` declares exactly two crons:

| Path | Schedule | Relevance |
| ---- | -------- | --------- |
| `/api/cron/compute-daily-scores` | `0 1 * * *` | **Indirectly.** It backfills `DailyScore`, which is the source of `dailyScore`, `perfectDays` and `daysActive`. So a user who has never had scores computed cannot earn `perfect-day`, `perfect-week`, `perfect-month`, `perfect-year` or `consistency-king` regardless of behaviour. |
| `/api/cron/generate-insights` | `0 2 * * 0` | None — a stub returning `generated: 0`. |

Neither cron touches `Achievement`. Consequences:

- **Achievements are entirely event-driven.** They are evaluated only when a habit is logged, a goal is completed, a focus session ends, or `/api/achievements/unlock` is called manually. A user who completes a perfect day without logging a habit that day gets no check — and `perfect-day` reads **today's** score, so the window closes at midnight.
- **Bulk/imported data never triggers evaluation.** Seeding, `db:seed`, CSV imports (`/settings/import`), or restoring a backup all write habits/goals/scores without firing the trigger. The badges then appear only after the user's next interactive write.
- **There is no reconciliation job.** If the duplicate race (§8.3) or a catalogue change (§9) leaves the ledger inconsistent, nothing ever repairs it.
- `sleep-notifications` is absent from `vercel.json` and needs an external scheduler — unrelated to this domain, but it confirms the cron surface is thin.

---

## 21. Data flow diagrams

### 21.1 Earn → persist → notify (the write path)

```
   user action                    server                         database
       │                             │                               │
       ├─ habit log ──────────────►  │                               │
       │    habit.service:386        │                               │
       │    (fire-and-forget .catch) │                               │
       │                             ├─ Achievement.findByUserId ───► │
       │                             │◄── owned rows                 │
       │                             │   all 20 owned? → return []   │
       │                             ├─ buildWorldState ────────────► │  13 queries
       │                             │   Streak, Goal, DailyScore×3,  │  across 12 repos
       │                             │   SleepLog, Focus×2, HabitLog, │  14 models
       │                             │   MoodLog, EnergyLog, Journal  │
       │                             │◄── 14 totals                   │
       │                             ├─ evaluateUnlocks (PURE)       │
       │                             │   for each definition:         │
       │                             │     checkCriteria(criteria,   │
       │                             │       worldState)              │
       │                             │       ^ timeframed? NO        │
       │                             │       ^ multi-criterion? NO   │
       │                             │     && !hasUnlocked(id)       │
       │                             ├─ for…of { await } ───────────► │  Achievement.create
       │                             │   metadata={definitionId}      │  level=threshold
       │                             ├─ notifyAchievement ─────────► │  NotificationLog
       │                             │   actionUrl /achievements/:id │  ⚠ 404
       │                             ├─ createActivity ────────────► │  ActivityLog
       │                             │   action ACHIEVEMENT_UNLOCKED │
       │                             │◄── UnlockEvent[]               │
       │◄── (nothing — fire-and-forget, errors swallowed)             │
       │                                                                  │
       ├─ AND, in parallel:                                               │
       │    store.runAchievementCheck() ── POST /api/achievements/unlock │
       │      → the SAME 13 queries, concurrently, no lock               │
       │      → pushEvents ─► store.events ─► CelebrationHost            │
       │                                ─► AchievementPopup (8s toast)   │
       │                                                                  │
       ├─ AND, for goals only: goal.service:320 AND :346 fire            │
       │    the same call twice, plus goals/page:194 on the client        │
       └──────────────────────────────────────────────────────────────────┘
              ⇒ up to 4 concurrent evaluations, no unique index
                ⇒ duplicate rows are possible (§24 F11)
```

### 21.2 Read — the page's two requests

```
  mount
    │
    ├─(A) GET /api/achievements ──────────────────────────────┐
    │      auth → listRecent(userId, 50)                       │
    │        ├─ recentUnlocked(userId, 50)   take 50  ──► DB   │ 2 queries
    │        └─ findUnlocked(userId)          all rows ──► DB  │ same rows
    │      ← AchievementRow[] + meta.total                    │
    │      ⇒ rows ──► spinner off, page renders               │
    │                                                        │
    └─(B) GET /api/achievements/next?count=100  (parallel)   │
           auth → getNextUnearned(userId, 100)                 │
             ├─ Achievement.findByUserId ────────────────► DB  │ 1
             ├─ ownedSet = definitionIdOf(metadata)            │
             ├─ unowned = catalogue − ownedSet                │
             ├─ buildWorldState(includeActiveDates:false) ► DB│ 12
             ├─ per definition: { current, target, percent }   │
             ├─ sort percent DESC, nulls last → slice         │
           ← NextUpRow[] (≤ 20)                               │
             ⇒ nextUp ──► locked tiles gain progress bars     │
                          ⚠ failure swallowed, no error state  ┘

  render
    ├─ achievements = earned.map(by NAME) ++ locked.map(by ID)      :174–224
    │    ⚠ two join keys; metadata.definitionId is ignored         :175 vs :184
    ├─ totalXp = Σ ACHIEVEMENT_XP[xpForRow(row).rarity]             :246
    │    ⚠ xpForRow → rarityOfTitle → getAchievementById(name)    :230
    │      ⇒ undefined for all 20 ⇒ clamps `level` into the ladder  ⇒ 14/20 wrong
    ├─ levelInfo = computeTrophyLevel(totalXp)                      :273
    ├─ rarityCounts = tally by xpForRow rarity                      :248–257
    │    ⚠ the 5 header chips are wrong, not just the history
    └─ history = group by localDateKey(unlockedAt), sort desc       :259–269
         ⚠ localDateKey uses the BROWSER timezone, no tz option    :91–100
           while the service buckets by the USER's stored timezone
```

### 21.3 Cross-surface rarity divergence

```
                    ACHIEVEMENT_DEFINITIONS  (constants/achievements.ts:151)
                              │                    keyed by id
              ┌───────────────┴───────────────┐
              │ name                         │ id
              ▼                              ▼
   page.tsx:188  DEFINITIONS.find(          page.tsx:205  progressById
        item.name === row.title)                 │
              │ CORRECT rarity                    │ correct progress
              ▼                                   ▼
        grid card [RARE]                    locked tile progress bar
                                    ┌──────────────────────────┐
                                    │                          │
        xp.ts:103  rarityOfTitle(title)                          │
                  getAchievementById(title)                      │
                    ▲                                          ▲
                    │ registry keyed by id,                     │
                    │ fed a NAME ──► undefined                  │
                    ▼                                          ▼
              xp.ts:141  clamp(row.level − 1) into        service:266
                       TIER_ORDER[0..4]                 resolveCriterionValue
                       level = the THRESHOLD                 │
                       ≥5 ⇒ LEGENDARY                          │
                    ▼                                          ▼
        history row [LEGENDARY] +250 XP     ── SAME ──► header rarity chips
        totalXp  (wrong)                                   trophy level (wrong)
```

---

## 22. File-by-file dependency inventory

### 22.1 Direct — the route and its components

| File | Lines | Directive | Role | Notes |
| ---- | ----- | --------- | ---- | ----- |
| `src/app/(dashboard)/achievements/page.tsx` | 443 / 412 | `'use client'` | the route | 2 fetches, 2 memos, 3 sections |
| `src/components/achievements/AchievementList.tsx` | 127 / 115 | `'use client'` | filter + grid | filter bar hardcoded light (F15) |
| `src/components/achievements/AchievementBadge.tsx` | 149 / 138 | `'use client'` | one card | theme-aware; progress only when passed |
| `src/components/achievements/ProgressBar.tsx` | 100 / 92 | `'use client'` | the bar | `COLOR_CLASSES` dead (F14); track hardcoded (F15) |
| `src/components/achievements/AchievementPopup.tsx` | 264 / 243 | `'use client'` | toast | fallback fetch + bounded retry |
| `src/components/achievements/CelebrationHost.tsx` | 32 / 26 | `'use client'` | store→popup adapter | mounted in `(dashboard)/layout.tsx:64` |

### 22.2 Direct — the API layer

| File | Lines | Role | Notes |
| ---- | ----- | ---- | ----- |
| `src/app/api/achievements/route.ts` | 53 | `GET` list | `offset` validated, never forwarded (F13) |
| `src/app/api/achievements/next/route.ts` | 62 | `GET` progress | stale "12 definitions" comment (F22) |
| `src/app/api/achievements/unlock/route.ts` | 35 | `POST` evaluate | no body, no rate limit (F31) |
| `src/app/api/achievements/celebrate/route.ts` | 56 | `POST` celebrate | unreachable from the UI (F25) |
| `src/schemas/achievement.schema.ts` | 17 | celebrate validation | `.refine` is correct |
| `src/server/services/achievement.service.ts` | 429 | all business logic | `buildWorldState` at `:76` |
| `src/server/repositories/achievement.repository.ts` | 128 | the only DB access for `Achievement` | `findUnlocked` dupes `findByUserId`; `createMany`/`isUnlocked` dead (F18) |

### 22.3 Direct — the pure layer

| File | Lines | Role | Notes |
| ---- | ----- | ---- | ----- |
| `src/lib/constants/achievements.ts` | 400 | catalogue, rarities, categories, chip helpers | type-only Prisma import at `:1` ✅; 5 unused helpers; `CUSTOM` unused |
| `src/lib/achievements/definitions.ts` | 93 | `allDefinitions`, `getAchievementById`, 2 unused helpers | re-export shim |
| `src/lib/achievements/checker.ts` | 210 | `resolveCriterionValue`, `checkCriteria` | **ignores `timeframe` (§27)**; `checkSnapshots` + streak fallbacks dead (F9) |
| `src/lib/achievements/unlock-logic.ts` | 135 | `evaluateUnlocks`, `buildUnlockEvent`, `canCelebrate` | `canCelebrate` dead |
| `src/lib/achievements/xp.ts` | 143 | the XP engine | **§7.1 defect**; `xpOfTitle` dead |
| `src/config/scoring.ts` | 272 | `THRESHOLDS.achievements.perfectDay = 95` | shared with scoring |

### 22.4 Indirect — repositories and models read by the snapshot

| Repository | Lines | Methods used | Models |
| ---------- | ----- | ------------ | ------ |
| `user.repository.ts` | 523 | `getSettings` | `User`, `UserSettings` |
| `streak.repository.ts` | 212 | `findByUserId`, `getUncelebratedMilestones`, `findMilestoneById`, `celebrateMilestone` | `Streak`, `StreakMilestone` |
| `goal.repository.ts` | 625 | `findAll` (**unbounded**) | `Goal` |
| `score.repository.ts` | 303 | `findPerfectDayDates`, `countActiveDays`, `findActiveDayDates`, `findByDate` | `DailyScore` |
| `sleep.repository.ts` | 232 | `countEarlyWakeups` | `SleepLog` |
| `focus.repository.ts` | 416 | `countCompletedSessions`, `getStats` (**unbounded**) | `FocusSession` |
| `habit.repository.ts` | 817 | `countAllCompletedLogs` (**unbounded**) | `HabitLog` |
| `mood.repository.ts` | 381 | `countMoodLogs`, `countEnergyLogs` (**unbounded**) | `MoodLog`, `EnergyLog` |
| `journal.repository.ts` | 474 | `getStreakData` (**unbounded, result unused**) | `JournalEntry` |
| `audit.repository.ts` | 233 | `createActivity` | `ActivityLog` |
| `notification.service.ts` | 730 | `notifyAchievement` | `NotificationLog` |

### 22.5 Indirect — UI and types

| File | Lines | Relationship |
| ---- | ----- | ------------ |
| `src/lib/api-client.ts` | 131 | unwraps `{success,data}`, throws `ApiError` |
| `src/components/ui/{Card,Badge,EmptyState,Spinner}.tsx` | 26 / 24 / 52 / 14 | presentation |
| `src/components/today/ui.tsx` | 402 | `Stagger` at `:303`, 4 uses |
| `src/store/achievement.store.ts` | 102 | `runAchievementCheck`, the event queue |
| `src/app/(dashboard)/layout.tsx` | — | mounts `CelebrationHost` at `:64` |
| `src/components/dashboard/AchievementsStrip.tsx` | 337 | same 2 endpoints, different presentation |
| `src/components/analytics/AchievementsStrip.tsx` | 51 | **duplicate component name**, prop-driven (F27) |
| `src/components/dashboard/DashboardWidgets.tsx` | — | `:76` toggle |
| `src/emails/achievement-unlocked.tsx` | 119 | template, **never sent** (F29) |
| `src/types/analytics.ts` | 264 | `AnalyticsAchievement` for the analytics strip |
| `src/types/achievements.ts` | **575** | 🔴 **zero importers**, `:11` Prisma value import (F19) |

### 22.6 🔴 Dead file — `src/types/achievements.ts` (575 lines)

Imported by **nothing** in the repo. `grep -rn "from '@/types/achievements'"` returns zero hits; the only match anywhere is its own header comment at `:1`.

Its contents: `AchievementWithUser`, `AchievementWithFullUser`, `AchievementMinimal`, `CreateAchievementInput`, `UpdateAchievementInput`, `AchievementFilter`, `AchievementStats`, and ~15 more interfaces, most annotated "Use when you need to…".

Two problems beyond the size:

1. **`:11` imports a Prisma enum as a value:**
   ```ts
   import type { Achievement, User } from '@/generated/prisma'   // ✅ erased
   import { AchievementType } from '@/generated/prisma'            // 🔴 a runtime value
   ```
   `@/generated/prisma` resolves to the **Node** client entry (679 KB, imports Node built-ins). A value import from it inside a `'use client'` file pulls Prisma into the browser bundle — the exact failure `AGENTS.md` warns about, and the reason `src/constants/prisma-enums.ts` exists. It is currently harmless *only* because nothing imports the file. The type-only import at `:8` next to it is the correct pattern.
2. It models `userId` as a **required input field** (`CreateAchievementInput.userId` at `:57`) — the opposite of `FILE.MD`'s rule and of what the four routes actually do (§17.2). Following this file's shape would introduce the IDOR the routes currently avoid.

§24 F19.

---

## 23. Current behavior summary

**What the page does, end to end.** Loads two things in parallel: the caller's earned `Achievement` rows, and — for every definition they do *not* own — a progress figure recomputed from a 13-query snapshot of their entire history. Renders a trophy level derived from XP that is itself derived from a rarity lookup that never succeeds (§7.1), five rarity chips from the same broken lookup, a 20-tile grid (earned cards correct, locked cards with progress rings), and a day-grouped history whose rarity chips and `+N XP` values disagree with the cards directly above them. Filtering is client-side and resets on navigation.

**How badges get earned.** Only as a side effect of an interactive write — a habit log, a goal completion, a focus session end — through `checkForUnlocks`, which fires from three server sites and three client sites, often several at once for a single action, with no lock and no unique index. There is no cron, no reconciliation, and no bulk path, so imported or seeded data earns nothing until the user next acts interactively.

**What is genuinely solid.** The `ownedSet` bail-out (13 queries → 1 once everything is owned), the 730-day window, the aggregate-only reads, the `includeActiveDates` opt-out, the timezone-correct date handling, the deliberate `null` for "unmeasurable" progress, the closest-first ordering with unmeasurable badges last, the clean client/server boundary on this route, and the ownership-scoped queries in every repository method. This code has clearly been through a real optimisation and correctness pass — the three defects in this document are in the *presentation and scoping* layer, not the hot path.

**The three critical defects, restated.** `rarityOfTitle` looks up a display name in an id-keyed registry, so 14 of 20 badges show the wrong tier and the wrong XP, and the page contradicts itself (§7.1). `lateEvenings` counts only today's post-20:00 sessions, so `night-owl` can never be earned (§26). `timeframe` is never read, so `perfect-day`, `perfect-week`, `perfect-month`, `perfect-year` and `consistency-king` all evaluate as all-time cumulative counts and `perfect-week` can be earned by 7 perfect days spread over two years (§27).

**The structural ones.** `celebrated` is never written (§24 F4). Both notification and email deep-links 404 (§24 F7). `level` stores a threshold and is read as a tier (§24 F6). No unique index, so duplicates are possible and unremovable (§24 F11, F26). A 575-line type file with a Prisma value import has zero importers (§24 F19). An entire achievement email pipeline is written and never called (§24 F29). And not one of the three pure evaluation functions has a test, though `tests/` already proves the pattern works for `routine-duration` and `score-calculator` (§24 F30).

---

## 24. Findings register

Severity: 🔴 **critical** (wrong or missing user-visible behaviour) · 🟠 **major** (correctness/perf/data risk) · 🟡 **minor** (dead code, stale comments, cosmetic).

| ID | Sev | Finding | Evidence | Fix |
| -- | --- | ------- | -------- | --- |
| **F1** | 🔴 | `rarityOfTitle` looks a display **name** up in an **id**-keyed registry, so it returns `undefined` for all 20 definitions; the fallback clamps the **threshold** into the rarity ladder, and every value ≥ 5 saturates to `LEGENDARY`. **14 of 20 badges show the wrong rarity chip and the wrong XP**, the history contradicts the grid, and `totalXp`/trophy level are wrong. | `xp.ts:103`–`:105`, `xp.ts:141`, `xp.ts:65`, `definitions.ts:68`, `constants:151`; grid resolves by name at `page.tsx:188`, history by `xpForRow` at `page.tsx:230` | Join on `metadata.definitionId`, or return `rarity` in the API row (`unlock-logic.ts:106` already has it). **§7.1** |
| **F2** | 🔴 | `lateEvenings` counts completed focus sessions with `startedAt >= today 20:00` and **no lower bound**, so it is a count of *this evening*. `night-owl` needs **20**. Unreachable. | `achievement.service.ts:148`–`:151`, `focus.repository.ts:274`–`:287`, `constants:295`–`:305` | Pass a window start (`fromZonedTime(\`${today}T20:00:00\`, tz)` minus N days, or drop the parameter entirely for an all-time count). **§26** |
| **F3** | 🔴 | `checkCriteria` never reads `criterion.timeframe`, so all-time semantics apply to `DAY`/`WEEK`/`MONTH`/`YEAR` criteria. `perfect-week` ("7 consecutive perfect days") unlocks on 7 perfect days anywhere in 730 days; `perfect-month`/`perfect-year` likewise. `perfect-day` reads only **today's** score, so it is invisible to a user who qualifies while offline. | `checker.ts:155`–`:166`, `constants:249`–`:283`, `:348`; `score.repository.ts:137` | Scope the query by `timeframe` before aggregating, and compute *consecutive runs* rather than counts for the week/month/year definitions. **§27** |
| **F4** | 🔴 | `Achievement.celebrated` is **never written**. `celebrateAchievement` validates ownership and writes an `ActivityLog`, then returns — the column stays `false` forever. The milestone half of the same endpoint *does* work (`streak.repository.ts:206`), which makes the asymmetry stark. | `achievement.service.ts:408`–`:426`, `schema.prisma:1927`, `achievement.repository.ts` (no update method) | Add `markCelebrated(userId, id)` and call it. **§10** |
| **F5** | 🟠 | `POST /api/achievements/celebrate` is fully implemented, authenticated, audited — and called by **nothing** in the repo. | `celebrate/route.ts:14`, `service.ts:381`/`:408`; only other mention is a comment at `push.service.ts:77` | Wire it to the toast dismiss, or delete the endpoint. **§10** |
| **F6** | 🟠 | `level` stores `definition.criteria[0]?.value` — a **threshold** — under a schema comment reading "for tiered achievements", with `@@index([type, level])` implying a tier. Then it is read *as* a tier by `xpForRow` (`xp.ts:141`) and rendered as "Level N" by `AchievementPopup.tsx:234`. `first-goal-completed` stores `1`; `milestone-habits-1000` stores `1000`. | `achievement.service.ts:328`, `schema.prisma:1924`/`:1935`, `xp.ts:141`, `AchievementPopup.tsx:234` | Stop writing a threshold into a tier column; add a real `definitionId` column and drop the tier reading. **§6.1** |
| **F7** | 🔴 | Every achievement notification and email links to `/achievements/${achievementId}`. **No `[id]` route exists** — the directory holds only `page.tsx`. All such links 404. | `notification.service.ts:560`, `email.service.ts:398`, `NotificationHistory.tsx:466`–`:468`; `ls src/app/(dashboard)/achievements` → `page.tsx` only | Point at `/achievements`, or add an `[id]` page that resolves via `metadata.definitionId`. **§19** |
| **F8** | 🟠 | `totals.streak` is the single `Streak.currentStreak` (the model is `userId @unique`), yet `checker.resolveStreakValue`'s doc describes "longest **per-habit** streak" and its per-habit/`activeDates` branches are unreachable. All five habit-streak badges read one global number. | `schema.prisma:1872`–`:1875`, `service.ts:177`, `checker.ts:113`–`:132`, `:105`–`:110` | Either supply `streaks` per habit, or fix the comment to match the single global streak. **§6.4** |
| **F9** | 🟡 | Dead code in the pure layer: `checker.ts:201 checkSnapshots`, `checker.ts:105`–`:132` streak fallbacks, `unlock-logic.ts:72 canCelebrate`, `xp.ts:113 xpOfTitle`, `definitions.ts:77`/`:89`, `constants:382`/`:386`/`:390`/`:394`/`:398`, `achievement.repository.ts:76 createMany`, `:97 isUnlocked`. Nine exports each carry an `@example` suggesting callers exist. | grep across `src` — zero importers for each | Delete, or wire up. `canCelebrate` was presumably meant to gate F4. |
| **F10** | 🟠 | `buildWorldState` runs `JournalRepository.getStreakData` — an **unbounded** `findMany` returning every distinct journal date as an array — to fill `totals.journalEntries`, which **no definition references**. The array is built, shipped, then `.length`'d and discarded. The service's own comment at `:86`–`:89` admits `activeDates` is unread; `journalEntries` is the same problem. | `service.ts:153`, `:190`, `journal.repository.ts:419`–`:435`, `constants` (no `journalEntries` field) | Delete the query and the total, or replace with a `count()`. **§5.3** |
| **F11** | 🔴 | **No unique constraint on `Achievement`.** `checkForUnlocks` is guarded only by the in-memory owned-set at `:317`, and **four** independent callers can race: `habit.service.ts:386`, `goal.service.ts:320`, `goal.service.ts:346`, and `store.achievement.store.ts:90` (itself called from 3 components). Duplicate rows inflate `unlockedCount`, `achievements.length`, `totalXp`, the grid and the history. `createMany`'s `skipDuplicates: true` has no index to skip against. | `schema.prisma:1934`–`:1936`, `service.ts:310`–`:319`, `achievement.repository.ts:81`–`:87` | Promote `definitionId` to a column and add `@@unique([userId, definitionId])`. Note `@@unique([userId, type, level])` would be **wrong** — two definitions legitimately share `(type, level)`. **§8.3** |
| **F12** | 🟠 | The page joins earned rows to the catalogue by **`title`** (`:188`, `:203`, `:231`) while `nextUp` is keyed by **`id`** (`:184`) with a name fallback (`:185`) — two different keys for the same join. A catalogue rename silently duplicates a badge (earned + locked) instead of matching it, even though `metadata.definitionId` is present and reliable. | `page.tsx:175`–`:185`, `:188`, `:203`, `:231`; `definitionIdOf` at `service.ts:51` | Expose `definitionId` in the API row and join on it. **§9, §24 F24** |
| **F13** | 🟠 | `GET /api/achievements` validates `offset`, echoes it in `meta.offset`, and **never forwards it to a query** — `recentUnlocked(userId, limit)` takes no offset. `?offset=50` returns the same first page. | `achievements/route.ts:16`, `:28`–`:29`, `:47`; `achievement.repository.ts:114`–`:127`; `base.repository.ts:58` already supports it | Thread `offset` into `recentUnlocked` → `buildPaginationQuery(limit, offset)`. |
| **F14** | 🟡 | `ProgressBar.COLOR_CLASSES` (14 entries) is unreachable: `usesClassColor` needs a non-hex string in the set, but both call sites pass a `#`-hex or `undefined`. `bg-blue-600` (`:91`) always renders. | `ProgressBar.tsx:36`–`:51`, `:68`–`:69`, `:91`; callers `page.tsx:359`, `AchievementBadge.tsx:133` | Delete the set, or document that `color` is hex-only and drop the class branch. |
| **F15** | 🟠 | Hardcoded light-mode greys in `AchievementList`'s filter bar (`bg-gray-100` `:72`, `bg-white text-gray-900` `:83`, `border-gray-300 bg-white` `:98`) and `ProgressBar`'s track (`bg-gray-200` `:80`, `text-gray-600` `:75`, `text-gray-400` `:76`). None invert — on a dark theme these are the brightest, lowest-contrast elements on the page. `AchievementBadge` and `AchievementPopup` were fixed for exactly this; these two were not. | as cited; the fixed siblings: `AchievementBadge.tsx:79`, `AchievementPopup.tsx:186`–`:192` | Swap to tokens (`bg-muted`, `bg-card`, `text-foreground`, `text-muted-foreground`, `border-border`). |
| **F16** | 🟡 | `parseProgress(row.metadata)` looks for `current`/`target` keys that the service never writes (`metadata` is `{definitionId}` only), so an **earned** tile can never render a progress bar. The locked-tile path works. | `page.tsx:66`–`:81`, `:197`; `service.ts:336` | Drop `parseProgress`, or write progress into `metadata` at unlock time. |
| **F17** | 🟠 | `localDateKey`/`formatUnlockTime` use `toLocaleDateString`/`toLocaleTimeString` with **no `timeZone` option**, so history grouping follows the **browser's** zone while `AchievementService` buckets by the user's **stored** `timezone`. A user whose device zone differs from their setting — or who travels — sees two groups for one day or one group for two. | `page.tsx:85`–`:100`, `:241`–`:242`; service uses `getTodayString(timezone)` at `:96` | Pass the user's timezone from settings, or group server-side. |
| **F18** | 🟡 | `AchievementRepository.findUnlocked` (`:27`) is byte-identical to `findByUserId` (`:13`); both are called by `listRecent` (`service.ts:208`–`:212`), so the same rows are fetched twice per list request, one of them unbounded, purely to take `.length`. | as cited | Replace the second call with `prisma.achievement.count()`. **§18.2** |
| **F19** | 🟠 | `src/types/achievements.ts` — **575 lines, zero importers**. Its `:11` imports `AchievementType` **as a value** from `@/generated/prisma` (the 679 KB Node entry), which would pull Prisma into a browser bundle the moment a `'use client'` file imported it; `:8` next to it shows the correct type-only form. It also models `CreateAchievementInput.userId` as required — the opposite of `FILE.MD` and of all four routes. | `types/achievements.ts:1`, `:8`, `:11`, `:57`; grep → 0 importers | Delete the file. **§22.6** |
| **F20** | 🟡 | The `Achievement` insert, the `NotificationLog` insert and the `ActivityLog` insert are three separate awaited writes in a `for…of` with no transaction. A failure after the first leaves a badge awarded but unsignalled, and the loop aborts, so remaining definitions in the same batch are skipped. | `service.ts:327`–`:354` | Wrap each definition's three writes in `prisma.$transaction`. |
| **F21** | 🟠 | "Every definition has exactly one criterion" is assumed in two places (`level = criteria[0]?.value ?? 1`, `const criterion = definition.criteria[0]`) but **enforced nowhere**. Adding a second criterion to any definition would silently drop it from both the `level` column and the progress ring. | `service.ts:263`, `:328`; `constants:132`–`:137` | Validate at module load: throw if any definition has ≠ 1 criterion. |
| **F22** | 🟡 | Stale comments claim the catalogue has **12** definitions; it has **20**. The `max(100)` cap on `/next` is justified by that stale number, and the cap is inert anyway since `getNextUnearned` returns at most the unowned subset of 20. | `next/route.ts:22`–`:25`, `page.tsx:159`–`:160` | Correct the comments; drop the cap to the catalogue size. **§8.1** |
| **F23** | 🟡 | `AchievementPopup` keeps a **local** queue while `CelebrationHost` keeps a **store** queue. An event pushed while one is on screen is appended to both; dismissing pops only the local head, so the next toast can replay the just-dismissed event. | `AchievementPopup.tsx:92`, `:100`–`:107`, `:155`–`:161`; `CelebrationHost.tsx:21`; `achievement.store.ts:79` | Drive the popup from the store alone and remove the local queue. |
| **F24** | 🟠 | Catalogue edits do not retro-apply: the row stores a denormalised `title`, and the page joins by `title`. Renaming a definition makes the badge appear **twice** — once as an earned row, once as a locked catalogue entry — with no migration and no `definitionId` fallback. | `service.ts:331`; `page.tsx:175`, `:203` | Same fix as F12: join on `definitionId`. |
| **F25** | 🟡 | `POST /api/achievements/celebrate` is unreachable (§F5), and `celebrate/route.ts:47`–`:49` maps a 404 by string-matching `error.message.endsWith('not found')` — any layer throwing `Error('… not found')` produces a 404. | as cited | Use a typed error class. |
| **F26** | 🟠 | Duplicates are **unremovable by the user**: there is no `DELETE` route and no repository delete method, and the only removal path is `User` cascade. Combined with F11 this means a race that writes one duplicate is permanent. | `src/app/api/achievements/` (4 files, no DELETE), `achievement.repository.ts` | Add a maintenance job that de-duplicates on `metadata.definitionId`. |
| **F27** | 🟡 | Two different components are both named `AchievementsStrip` — `components/dashboard/` (337 lines, self-fetching, SVG progress rings) and `components/analytics/` (51 lines, prop-driven). Neither imports the other. | as cited | Rename one, or extract the shared shell. **§12.3** |
| **F28** | 🟠 | The obvious fix for F11 — `@@unique([userId, type, level])` — is **wrong**, because `level` stores a threshold: `perfect-day` (95) and `goals-completed-10` (10) are different `(type, level)` pairs today, but two `MILESTONE` definitions could legitimately collide on threshold. Documented here so the mistake is not repeated. | `service.ts:328`; `schema.prisma:1935` | Key on a promoted `definitionId` column. |
| **F29** | 🟠 | The whole achievement **email** pipeline exists and is never used: `email.service.ts:391 sendAchievementUnlocked` (**zero callers**), `emails/achievement-unlocked.tsx` (119 lines), `lib/email/templates.ts:26`, `lib/email/html.ts:38`. `checkForUnlocks` sends in-app only. | as cited | Call it, or delete the dead surface. **§19** |
| **F30** | 🟠 | **No tests touch this domain.** `tests/` has 6 files (`score-calculator`, `dashboard-contributions`, `dashboard-derive`, `habit-contribution-eligibility`, `habit-contributions`, `routine-duration`) — none imports `checker.ts`, `unlock-logic.ts` or `xp.ts`. All three critical defects live in pure, dependency-free functions that Vitest would cover in a few lines each, and `tests/lib/routine-duration.test.ts` already demonstrates the pattern. | `tests/` listing | Add `tests/lib/achievements.test.ts`: `rarityOfTitle` resolves for all 20 names-or-ids; `checkCriteria` honours `timeframe`; `computeTrophyLevel` boundaries; `evaluateUnlocks` with a hand-built `AchievementWorldState`. |
| **F31** | 🟠 | **No rate limiting** on any of the four routes. `POST /api/achievements/unlock` costs 13 queries whenever anything is unowned, and `buildWorldState` includes four unbounded aggregates. It also fires automatically on every habit log and every goal completion, with no debounce — five habit taps in ten seconds is 65 queries. | the four route files; §18.4 | Add per-user rate limiting, debounce the client trigger, and narrow evaluation to the definitions whose criteria the triggering domain can affect. |
| **F32** | 🟡 | `listRecent` materialises every owned row twice (F18) and returns `meta.total` the page **discards**, recomputing its own counts from the returned page. | `service.ts:208`–`:212`; `page.tsx:140` (unwrapped `.data` only), `:226` | Use `meta.total` for the denominator; `count()` for the total. |
| **F33** | 🟡 | Four snapshot aggregates are **unbounded** while four are capped at 730 days — and two of the unbounded ones feed definitions that declare `timeframe: 'ALL_TIME'` while the capped ones feed `ALL_TIME` definitions too, so the window is inconsistent with the declared scope. | `service.ts:144`–`:152`; `constants:293`, `:304`, `:315`, `:326`, `:337`, `:359`, `:370` | Make the window uniform and derive it from each criterion's `timeframe`. |

**Count: 33 findings — 7 critical, 16 major, 10 minor.**

---

## 25. `perfectWeeks` counts non-consecutive weeks

`consistency-king` — *"Record 4 perfect weeks in a row"* (`constants/achievements.ts:339`–`:349`) — gates on `perfectWeeks >= 4`. Here is what `perfectWeeks` actually is:

```
achievement.service.ts:165–173
  const weekCounts = new Map<string, number>();
  for (const date of perfectDayDates) {
    const parsed  = new Date(`${date}T00:00:00Z`);
    const isoDay  = parsed.getUTCDay() === 0 ? 7 : parsed.getUTCDay();   // Sun→7, Mon→1
    const mondayMs= parsed.getTime() - (isoDay - 1) * 86_400_000;
    const monday  = new Date(mondayMs).toISOString().slice(0, 10);
    weekCounts.set(monday, (weekCounts.get(monday) ?? 0) + 1);
  }
  const perfectWeeks = Array.from(weekCounts.values()).filter(c => c >= 7).length;
```

Three readings of the description, and the code satisfies the weakest one:

| Reading | Requires | Code |
| ------- | -------- | ---- |
| "4 weeks, each with 7 perfect days" | 4 qualifying weeks, any order | ✅ what it does |
| "4 consecutive qualifying weeks" | 28 **consecutive** perfect days | ❌ |
| "`timeframe: 'MONTH'`" | all 4 inside one calendar month | ❌ `timeframe` is ignored (F3) |

So a user with perfect weeks in January, April, July and October earns "Consistency King", and so does a user with 7 perfect days in each of 4 non-adjacent weeks inside a single month. The `MONTH` timeframe in the definition is decorative.

**The fix is to detect runs, not count buckets.** Once `perfectDayDates` (already a sorted `string[]` from `findPerfectDayDates`) is in hand, a single pass tracking `currentRun` and `bestRun` over consecutive calendar days answers "7 consecutive", "30 consecutive" and "365 consecutive" exactly — and would fix `perfect-week`, `perfect-month`, `perfect-year` and `consistency-king` together. It also makes `timeframe` implementable, since a run can be bounded by a date range.

---

## 26. `lateEvenings` semantics — Night Owl is unreachable

```
constants/achievements.ts:295–305
  'night-owl': {
    name: 'Night Owl',
    description: 'Log 20 productive late-evening sessions',
    criteria: [{ field: 'lateEvenings', operator: '>=', value: 20, timeframe: 'ALL_TIME' }],
    rarity: 'UNCOMMON',
  }

achievement.service.ts:142–154
  new FocusRepository().countCompletedSessions(
    userId,
    fromZonedTime(`${today}T20:00:00`, timezone)     // ← lower bound is TODAY 20:00
  ),
  …
  totals: { …, lateEvenings: lateEveningCount, … }     // :181

focus.repository.ts:274–287
  async countCompletedSessions(userId, startedAfter?) {
    return this.prisma.focusSession.count({
      where: { userId, completedAt: { not: null },
                ...(startedAfter && { startedAt: { gte: startedAfter } }) },
    });
  }
```

`startedAfter` is the **only** bound. The call passes 20:00 *tonight*, so the query is
`completedAt != null AND startedAt >= today 20:00` — i.e. **the sessions you have already completed since 8pm this evening**. The result is therefore in `{0, 1, 2, …}` and resets to 0 at local midnight.

`night-owl` requires **20**. The maximum attainable value is the number of focus sessions a user can finish in one evening. **The badge can never be unlocked**, at any streak, by any user, on any plan.

This is a regression, not an original design. The comment at `achievement.service.ts:69`–`:75` records the previous bug — the boundary was hard-coded `T20:00:00.000Z` and `today` was `new Date().toISOString().slice(0, 10)`, so for `Asia/Tokyo` the boundary was 05:00 the next morning local. That fix was correct and necessary, and it corrected the *timezone*; what it left behind is the missing **lower bound** on the range.

**Three ways to fix, in order of fidelity to the description:**

1. **All-time (matches `timeframe: 'ALL_TIME'`):** drop the argument —
   `countCompletedSessions(userId)` — counting every completed session ever, then filter late-evening ones client-side. Wrong: it counts morning sessions too.
2. **All-time, filtered in SQL:** add an `OR: [{ startedAt: { gte: 20:00 local } }, { startedAt: { lt: 05:00 local } }]` style predicate, or store a derived `startedHour` column. Correct and cheap if the predicate is indexable.
3. **Named helper, reused everywhere:** add `lateEveningCount(userId, from, to)` to `FocusRepository` with explicit `from`/`to` arguments, and have the service pass the window its `timeframe` implies. This is the option that scales to the other 19 definitions once `timeframe` is implemented (F3).

Until then, `night-owl` sits in the grid as a locked tile whose progress bar reads `0/20` forever — the only definition in the catalogue that is not merely mis-scoped but impossible.

---

## 27. `timeframe` is decorative

```
constants/achievements.ts:132–137
  export interface AchievementCriteria {
    field: string;
    operator: '>=' | '<=' | '==' | '>';
    value: number;
    timeframe?: 'DAY' | 'WEEK' | 'MONTH' | 'YEAR' | 'ALL_TIME';   // ← declared
  }

checker.ts:155–166
  export function checkCriteria(criteria, state) {
    if (criteria.length === 0) return false;
    return criteria.every((criterion) => {
      const current = resolveCriterionValue(criterion.field, state);
      if (current === undefined) return false;
      return compareOperator(current, criterion.operator, criterion.value);
    });
  }
```

`criterion.timeframe` is never referenced. `AchievementWorldState` carries no date-window information either — its `dates` bucket (`checker.ts:60`) holds only `activeDates`, and only the `streak` fallback reads it. So the evaluation function has **no way** to honour a timeframe even in principle: it receives a scalar and a comparator.

### The five affected definitions

| id | `criteria` | Declared | Actual evaluation | Correct? |
| -- | ---------- | -------- | ----------------- | -------- |
| `perfect-day` | `dailyScore >= 95`, `timeframe: 'DAY'` | today | `ScoreRepository.findByDate(userId, today).totalScore` (`service.ts:139`, `:179`) — genuinely today's score | ✅ *by accident*: the query is already day-scoped, so the ignored timeframe is coincidentally right |
| `perfect-week` | `perfectDays >= 7`, `WEEK` | 7 days this week | `perfectDays` = count of all `DailyScore ≥ 95` in the **730-day** window | ❌ needs consecutive-run detection over one week (§25) |
| `perfect-month` | `perfectDays >= 30`, `MONTH` | 30 days this month | same 730-day count | ❌ |
| `perfect-year` | `perfectDays >= 365`, `YEAR` | 365 days this year | same 730-day count — a 730-day window can contain 365, but not 365 *consecutive* | ❌ |
| `consistency-king` | `perfectWeeks >= 4`, `MONTH` | 4 consecutive weeks in a month | non-adjacent qualifying weeks (§25) | ❌ |

Three further definitions declare `timeframe: 'ALL_TIME'` and are *also* mis-scoped, though in the opposite direction — they are capped at 730 days by the snapshot window rather than being truly unbounded:

| id | Declared | Actual |
| -- | -------- | ------ |
| `early-riser` | `ALL_TIME`, 10 wake-ups | `countEarlyWakeups(userId, today−730, today, '06:00')` — a user with 10 early wake-ups spread over three years cannot earn it |
| `milestone-days-30` | `ALL_TIME`, 30 active days | same 730-day cap (harmless at n=30) |
| `milestone-habits-1000` | `ALL_TIME` | `countAllCompletedLogs(userId)` — genuinely unbounded ✅ |
| `night-owl` | `ALL_TIME` | 🔴 today's evening only (§26) |
| `productivity-master` / `wellness-warrior` / `focus-champion` | `ALL_TIME` | unbounded ✅ |

### Why this matters beyond correctness

`timeframe` is the vocabulary the catalogue uses to express "recent", and it is the natural place to fix two other problems:

- **It would scope the query.** Today every criteria check runs against a **730-day** window chosen by one constant (`PATTERN_HISTORY_DAYS`) regardless of what the definition asked for. With `timeframe` honoured, `perfect-day` would query one day, `perfect-week` seven, `milestone-days-30` thirty — which is also what makes the 730-day cap safe: today it is a compromise, and it silently breaks `early-riser`.
- **It would give `getNextUnearned` an honest progress figure.** `service.ts:263`–`:279` computes `{current, target, percent}` from `criteria[0]` alone. For `perfect-week` it currently reports `187/7` → 100%, i.e. a badge the user is "ready" for on the strength of 187 scattered perfect days. With a windowed `current`, the ring would show `3/7` and mean it.

**Suggested fix:** give `AchievementWorldState` the window it was built for (`{ from, to, timezone }`), have `buildWorldState` accept a range derived from the definitions being evaluated, and make `resolveCriterionValue` return `undefined` when `timeframe` is set but no window-scoped value is available — which the existing `null`/`undefined` handling at `service.ts:268` and `page.tsx:53` already renders as "not tracked" rather than a false `0`. The rendering layer is ready; only the evaluation is missing.

---

*End of `/achievements` audit. 27 sections · 33 findings · 4 critical XP/rarity/progress defects, 4 structural defects, 12 repository/service/data dependencies, 14 models, 20 definitions. Documentation only — no source file was modified.*