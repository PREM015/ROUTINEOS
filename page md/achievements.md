# `/achievements` — Complete System Audit

**Route:** `http://localhost:3000/achievements`
**Route file:** `src/app/(dashboard)/achievements/page.tsx` (452 physical / 421 non-blank lines, `'use client'`)
**Project:** RoutineOS (`daily-plan`) — Next.js 16 (App Router) + Prisma 7 + PostgreSQL (Neon)
**Original audit:** 2026-09-30 · **Phase 1 remediation:** 2026-10-03 (code changed — see [§24](#24-findings-register) and [§28](#28-phase-1-remediation--what-changed))
**Status:** describes **only** what exists in the codebase. Every claim is file-anchored.
**This document:** 1622 lines · 29 sections · 37 findings

> **Line-count convention:** **physical** line counts. PowerShell's `Measure-Object -Line` skips blank lines — use `(Get-Content file).Count` for the physical figure.

> ## ⚠ Verification status — read this first
>
> The Phase 1 changes in this revision are **written but not fully verified**:
>
> - `npm run type-check` (`tsc --noEmit`) **exhausted the heap and died** (`Fatal process out of memory: Zone`) at the default Node heap. A retry with `--max-old-space-size=8192` was started and aborted before it finished. **The compiler has not confirmed these files.**
> - `npm run lint` and `npm test` have **not** been run against this code.
> - `npm run db:generate` **has** been run: `src/generated/prisma` contains `Achievement.definitionId` and the `userId_definitionId` compound key.
> - `npm run db:push` has **NOT** been run, deliberately. The remote `DATABASE_URL` is Neon and `prisma db push --accept-data-loss` is guarded. **The live database has no `definitionId` column and no `userId_definitionId` index.** Until it is pushed, `createForDefinition` will fail at runtime on the `findUnique({ where: { userId_definitionId } })` call. See [§29](#29-outstanding-work--migration-runbook).
> - **No test covers any of this.** `tests/` has 20 files and not one imports `checker.ts`, `xp.ts`, `timeframes.ts`, `metadata.ts` or `unlock-logic.ts`. §24 F30 remains open and is now the highest-value gap.
> - ⚠ **Some files were being edited concurrently while this document was written.** `focus.repository.ts` went 416 → 648 → 869 lines and `timeframes.ts` 228 → 241 during the pass, so line anchors for those two were re-verified last and may drift again. Every other anchor in this document was read directly from the current file. Treat line numbers as "as of this revision", not as stable identifiers — the symbol names are the reliable reference.

> ### Phase 1 outcome — the four critical XP/rarity/progress defects
>
> | # | Was | Now |
> | - | --- | --- |
> | 1 | `rarityOfTitle` looked a display **name** up in an **id**-keyed registry, so it returned `undefined` for all 20 definitions and the fallback clamped the *threshold* into the rarity ladder — **14 of 20 badges showed the wrong tier and the wrong XP** ([§7.1](#71-was-critical--rarityoftitle-could-never-resolve)) | ✅ Fixed. `Achievement.definitionId` is a real column; `rarityOfRow` resolves by id, then by name for legacy rows, then falls back to an **explicit** `UNKNOWN_ACHIEVEMENT_RARITY`. `level` is never read as a tier. |
> | 2 | `lateEvenings` counted only sessions started **after 20:00 today**, so `night-owl` (20 sessions) was **unreachable** ([§26](#26-was-critical--lateevenings-semantics--night-owl-was-unreachable)) | ✅ Fixed. All-time count of completed, non-aborted sessions, with the local hour evaluated per session in the user's own timezone. |
> | 3 | `timeframe` was **never read**, so `perfect-week` unlocked on 7 perfect days spread over two years ([§27](#27-was-critical--timeframe-was-decorative)) | ✅ Fixed. `checker.ts` now honours `timeframe`; run-shaped criteria use **monotonic best-ever runs** so a missed day cannot retract an earned badge. |
> | 4 | `Achievement.celebrated` was **never written** — `celebrateAchievement` wrote an audit row and returned | ✅ Fixed. `markCelebrated(userId, id)` is an owner-scoped `updateMany`. |
>
> ### Newly introduced by Phase 1
>
> - 🔴 **The `perfectDayDates` key in the world state is never read.** The service publishes it under `dates.perfectDayDates`, but `resolveCriterionValue` looks up `dates[`${field}Dates`]`, and the only definition using that family is `perfect-day`, whose field is `perfectDays` — so it looks for `perfectDaysDates`. Nothing matches. The array is loaded on every request and read by nothing. §24 **F34**.
> - 🟠 **`night-owl` now loads every completed session start, unbounded, into memory** to filter in JavaScript. That is the correct *semantics* bought with an O(all sessions) read on every evaluation. §24 **F35**.
> - 🟠 **The unique index cannot be applied before the duplicates are gone**, and the reconcile script needs the column to already exist. This is a genuine ordering constraint, not a nit. §24 **F36**.

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
| 25  | [`perfectWeeks` counts non-consecutive weeks — RESOLVED](#25-perfectweeks-counted-non-consecutive-weeks--resolved) |
| 26  | [`lateEvenings` semantics — RESOLVED](#26-was-critical--lateevenings-semantics--night-owl-was-unreachable) |
| 27  | [`timeframe` was decorative — RESOLVED](#27-was-critical--timeframe-was-decorative)           |
| 28  | [Phase 1 remediation — what changed](#28-phase-1-remediation--what-changed)                   |
| 29  | [Outstanding work + migration runbook](#29-outstanding-work--migration-runbook)               |

---

## 1. What `/achievements` is, in one paragraph

`/achievements` is the app's **badge gallery**. It is a `'use client'` Client Component (`page.tsx:1`) rendering three `Stagger`-animated sections inside a `max-w-6xl` container with a `gradient-mesh-animated` backdrop: a **header** with a `Trophy` glyph, the title, and a live "N of M achievements unlocked" line; a **trophy-level summary** card showing a 🏆/👑 tile, the numeric `Trophy Level`, total XP earned, a `ProgressBar` toward the next level, and five rarity-count chips; a **filterable grid** (`AchievementList`) of all 20 catalogue tiles — earned ones first, then locked, filterable by status and rarity; and an **"Unlock History"** grouped timeline of past unlocks with per-row rarity and `+N XP` chips. Everything comes from **two** requests: `GET /api/achievements` (earned rows, default limit 50) and `GET /api/achievements/next?count=100` (progress toward the unearned). **No progress is persisted** — it is recomputed per request by `AchievementService.getNextUnearned`, which builds a world-state snapshot of **14 queries across 12 repositories**. Unlocks are evaluated **server-side and fire-and-forget** on every habit log, every goal completion, and every focus session finish; there is no cron and no scheduler.

---

## 2. UI block diagram

```
/achievements  (src/app/(dashboard)/achievements/page.tsx — 'use client', 452 lines)
│
└── <div class="container relative mx-auto max-w-6xl px-4 py-6 sm:py-8">        :289
    │
    ├── [background] div.gradient-mesh-animated.pointer-events-none             :301–304
    │               absolute.inset-0.-z-10.opacity-60   (aria-hidden="true")
    │
    └── <div class="relative">                                                 :306
        │
        ├── HEADER — <Stagger>                                                :307–319
        │   ├── <h1 class="font-display text-2xl sm:text-3xl">
        │   │     <Trophy class="h-7 w-7 text-amber-500"/> "Achievements"      :309–312
        │   └── <p class="text-muted-foreground">
        │         rows ? "{unlockedCount} of {achievements.length} achievements
        │                   unlocked. Keep the streak going."
        │               : "Track milestones as you build consistency."          :313–317
        │         ✅ the denominator is now honest: the earned set and the locked
        │           set are joined on ONE key (definitionId), so a duplicate row is
        │           the only thing that can still inflate it
        │
        ├── {error && <p role="alert" class="… bg-destructive/10 …">}          :321–325
        │        ⚠ set ONLY by the FIRST request (:151); a failure of
        │          /api/achievements/next is swallowed at :171 and never shown
        │
        ├── LOADING  {!rows && !error → <Spinner class="h-6 w-6"/> py-16}       :327–330
        │            ⚠ no skeleton; the layout is a bare centred spinner
        │
        └── {!loading && <>                                                     :331–448
            │
            ├── ① SUMMARY — <Stagger delay={0.08}>                              :334–381
            │   └── <Card class="p-6">                                         :335
            │       └── <div class="flex flex-col gap-6 lg:flex-row lg:items-center">  :336
            │           │
            │           ├── LEFT (identity block)
            │           │   ├── <div class="flex h-16 w-16 rounded-2xl
            │           │   │        bg-amber-500/10 text-3xl ring-2 ring-amber-500/40">
            │           │   │     👑 when maxed, else 🏆   (aria-hidden)          :338–340
            │           │   └── "Trophy Level" (uppercase, tracking-wide)         :342–344
            │           │       {levelInfo.level}  — text-3xl tabular-nums       :345
            │           │       "{totalXp} XP earned"                             :346–348
            │           │
            │           └── RIGHT (min-w-0 flex-1)
            │               ├── "Next level (N)" | "Maximum level"              :354–356
            │               ├── "{currentXp} / {neededForNext} XP" | "Max"       :357–359
            │               ├── <ProgressBar value={currentXp} max={neededForNext}
            │               │     color={maxed ? '#f59e0b' : '#8b5cf6'}
            │               │     ariaLabel="Progress to next trophy level"/>     :361–370
            │               └── 5 × <Badge style={rarityChipStyle(...)}>         :371–377
            │                     "{icon} {count} {label}"  ← rarityCounts
            │
            ├── ② GRID — <Stagger delay={0.14}>                                :383–385
            │   └── <AchievementList achievements={achievements} />            :384
            │
            └── ③ HISTORY — <Stagger delay={0.2}>                              :388–446
                └── <section class="mt-10" aria-labelledby="unlock-history-heading">  :389
                    ├── <h2 id="unlock-history-heading">
                    │     <Medal class="h-5 w-5 text-amber-500"/> "Unlock History"   :390–393
                    ├── history.length === 0
                    │     ? <Card><EmptyState icon={<Sparkles/>}
                    │           title="No unlocks yet"
                    │           description="Complete habits, goals and focus
                    │                      sessions — the first achievement is close."/>  :394–401
                    └── else <div class="mt-4 space-y-6">                       :403–443
                          └── per DAY GROUP (keyed group[0].dateKey, newest first)
                              ├── <p class="… uppercase tracking-wide">{dateKey}  :406–408
                              └── <Card class="divide-y divide-border overflow-hidden">  :409
                                  └── per entry — flex items-center gap-3 px-4 py-3   :414
                                      ├── 40px tile, bg = rarityTint(entry.color ?? rarity.color)  :415–421
                                      ├── title (truncate) + description (truncate)  :422–429
                                      ├── <Badge style={rarityChipStyle(rarity.color)}>{rarity}  :431
                                      ├── <Badge variant="success">+{entry.xp} XP  :432
                                      └── {entry.time} (hidden below sm)           :433–435
```

### 2.1 `AchievementList` internals — `src/components/achievements/AchievementList.tsx` (127 lines, unchanged)

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

### 2.2 `AchievementBadge` internals — `src/components/achievements/AchievementBadge.tsx` (149 lines, unchanged)

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

⚠ **`progress` is still never set for an earned tile.** `page.tsx:206` passes `parseProgress(row.metadata)`, and `metadata` is written by the service as `{"definitionId":"…"}` only — it has no `current`/`target`, so `parseProgress` returns `undefined`. The bar renders only for **locked** tiles that `getNextUnearned` could measure. §24 F16.

### 2.3 `ProgressBar` internals — `src/components/achievements/ProgressBar.tsx` (100 lines, unchanged)

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

⚠ **`COLOR_CLASSES` (`:36`–`:51`, 14 entries) is dead.** `usesClassColor` requires a non-hex string present in that set. Both call sites pass a `#`-hex or `undefined` (`page.tsx:368`, `AchievementBadge.tsx:133`), so the `bg-blue-600` fallback at `:91` is what always renders. §24 F14.

⚠ **The track is `bg-gray-200`** (`:80`) and the label/percent use `text-gray-600` / `text-gray-400` (`:75`–`:76`) — hardcoded light-mode greys, not tokens. On a dark theme the track is a bright bar and the label is low-contrast. §24 F15.

---

## 3. UI → component mapping

### 3.1 Direct imports from `page.tsx` (`page.tsx:3`–`:27`)

| Import | From | Lines | Directive | Role |
| ------ | ---- | ----- | --------- | ---- |
| `Trophy, Medal, Sparkles` | `lucide-react` | — | — | header + history + empty-state glyphs |
| `ACHIEVEMENT_DEFINITIONS, ACHIEVEMENT_RARITIES, rarityChipStyle, rarityTint, type AchievementRarity` | `@/lib/constants/achievements` | **412** | none — `import type { AchievementType }` at `:1` is erased | the 20-entry catalogue + 5 rarity tiers + theme-safe chip helpers |
| `ACHIEVEMENT_XP, computeTrophyLevel, xpForRow` | `@/lib/achievements/xp` | **167** | none | the XP engine (**fixed** — §7.1) |
| **`definitionIdOf`** | **`@/lib/achievements/metadata`** | **48** | none | 🆕 **the canonical join key**: column first, `metadata` as legacy fallback |
| **`getAchievementById`** | **`@/lib/achievements/definitions`** | **107** | none | 🆕 resolves a row's definition by **id**, replacing the old `DEFINITIONS.find(item => item.name === row.title)` |
| `apiRequest` | `@/lib/api-client` | **131** | none | unwraps `{success, data}`; throws `ApiError` |
| `Card` | `@/components/ui/Card` | 26 | **none** | RSC-safe |
| `Badge` | `@/components/ui/Badge` | 24 | **none** | RSC-safe |
| `Spinner` | `@/components/ui` (barrel) | 14 | **none** | loading only |
| `EmptyState` | `@/components/ui/EmptyState` | 52 | **none** | history-empty only |
| `AchievementList` | `@/components/achievements/AchievementList` | 127 | `'use client'` | filter bar + grid |
| `ProgressBar` | `@/components/achievements/ProgressBar` | 100 | `'use client'` | the summary XP bar |
| `Stagger` | `@/components/today/ui` (`:303`) | 402 | none — imports `useReducedMotion` | 4 entrance animations |
| `type AchievementCardData` | `@/components/achievements/AchievementBadge` | 149 | `'use client'` | **type-only import**, so the component itself is not pulled in |

✅ **The client boundary is still clean.** `lib/constants/achievements.ts:1` is `import type { AchievementType }` — erased at compile time. The two new imports are the reason that matters: `metadata.ts` and `definitions.ts` were written specifically to be **Prisma-free**, so a `'use client'` file can join on the definition id without pulling `@/generated/prisma` (679 KB Node entry) into the browser bundle. `lib/achievements/xp` → `./definitions` → `@/lib/constants/achievements` → `@/lib/utils`. **No `@/server/**`, no `@/lib/prisma`, no Prisma value import is reachable from this page.**

### 3.2 `src/components/achievements/**` — exhaustive (5 files, **0 dead**, all unchanged by Phase 1)

| # | File | Physical / non-blank | Directive | Importers | Renders |
| - | ---- | -------------------- | --------- | --------- | ------- |
| 1 | `AchievementPopup.tsx` | **264** / 243 | `'use client'` `:1` | **`CelebrationHost.tsx:15`** | fixed bottom-right `z-50` toast; framer-motion spring in/out; `role="status" aria-live="polite"`; auto-hide with a shrinking countdown bar. Prop-driven queue **plus** a fallback "latest unlock" fetch with bounded retry |
| 2 | `AchievementBadge.tsx` | **149** / 138 | `'use client'` `:1` | `AchievementList.tsx:21` (named) — **not** imported by the page | one card (§2.2) |
| 3 | `AchievementList.tsx` | **127** / 115 | `'use client'` `:1` | **`page.tsx:24`** | filter bar + responsive grid (§2.1) |
| 4 | `ProgressBar.tsx` | **100** / 92 | `'use client'` `:1` | **`page.tsx:25`** and `AchievementBadge.tsx:29` | the static bar (§2.3) |
| 5 | `CelebrationHost.tsx` | **32** / 26 | `'use client'` `:1` | **`src/app/(dashboard)/layout.tsx:11`**, rendered `:64` | 15-line adapter: reads `useAchievementStore` (`events`, `dismissFirst`), passes `events[0] ?? null` + `autoHideMs={8000}` |

### 3.3 Transitive UI dependencies (all server-compatible, no directive)

| File | Physical / non-blank | Note |
| ---- | -------------------- | ---- |
| `components/ui/Card.tsx` | 26 / 23 | `cva` variants; the page uses the default. |
| `components/ui/Badge.tsx` | 24 / 21 | `cva` variants `default\|primary\|success\|danger\|warning`; the page uses `success` (`:432`) and default. `style` spreads onto the root element. |
| `components/ui/EmptyState.tsx` | 52 / 48 | `page.tsx:396`, `AchievementList.tsx:111` |
| `components/ui/Spinner.tsx` | 14 / 14 | `page.tsx:329` |
| `components/today/ui.tsx` | 402 / 380 | `Stagger` at `:303`, used **4×** (`page.tsx:307, 334, 383, 388`) |

### 3.4 The sibling component that is **not** on this page

`src/components/dashboard/AchievementsStrip.tsx` — **337 physical / 319 non-blank**, `'use client'`. The dashboard panel. It hits **the same two endpoints**: `GET /api/achievements?limit=6` (`:234`) and `GET /api/achievements/next?count=3` (`:235`). Local `Ring` (`:84`, SVG `stroke-dashoffset` draw-on with `--ring-delay` stagger) and `Medallion` (`:139`). Renders through `Panel` (`components/dashboard-ui/Panel.tsx`, 303 lines) so it inherits the loading/error/empty contract. Links to `/achievements` at `:293`. Toggled by `DashboardWidgets.tsx:76` (`{ key: 'achievements', … enabled: true }`). Exports `ACHIEVEMENTS_RIM` (`:337`) for the dashboard loading skeleton.

⚠ The strip never displays rarity, so it never showed the rarity bug and does not benefit visibly from the rarity fix — but it **does** read `percent` from `/next`, so it inherits the corrected timeframe semantics.

### 3.5 The store

`src/store/achievement.store.ts` — **102 physical / 92 non-blank**, `'use client'` `:15`. Exports `useAchievementStore` (`:64`) and `runAchievementCheck()` (`:90` → `POST /api/achievements/unlock`). **Exactly three callers**: `components/today/TodayHabitChecklist.tsx:292` (only when the new status is `COMPLETED`), `components/focus/FocusTimer.tsx:683`, `app/(dashboard)/goals/page.tsx:194` (only when `completed`). All three `void` it and swallow failures.

---

## 4. Frontend architecture

### 4.1 Page structure

| Concern | Reality |
| ------- | ------- |
| Directive | `'use client'` — `page.tsx:1`. No server component, no `loading.tsx`, no `error.tsx`, no `page` metadata export, no `Suspense` boundary. The entire route is one client bundle. |
| Data fetching | **Two independent `useEffect` fetches** inside one `useEffect` (`:144`–`:180`), not a shared hook. The primary is `await`ed (`:148`) and drives the loading spinner; the secondary is fire-and-forget (`:165`–`:175`) and **cannot set `error`**. |
| Loading gate | `!rows && !error` (`:327`). `rows` is `AchievementRow[] | null`; it is only set on success or on error, so a successful empty result (`[]`) is indistinguishable from "loaded". Both render the full page. |
| Empty gate | Only for history (`:394`). **A user with 0 unlocks still sees 20 locked tiles** plus a trophy level of 1 — the page never presents an overall empty state. |
| Error gate | A single `<p role="alert">` (`:322`) that appears *above* the content while the rest of the page still renders. There is no retry affordance. |
| Derived state | Two `useMemo`s. `achievements` (`:182`–`:233`) joins earned rows + catalogue. `totalXp/levelInfo/rarityCounts/history` (`:237`–`:286`) maps earned rows again. `xpForRow` is called **once per row** in each. |
| **Join key** | ✅ **One key now.** `unlockedByDefinition` is keyed by `definitionIdOf(row)` (`:189`–`:191`) and the locked set is filtered against that same id space (`:212`). Previously the earned rows joined on **`title`** and the progress rows on **`id`** — §24 F12 is fixed. |
| Stagger | 4 `<Stagger>` wrappers with delays `0`, `0.08`, `0.14`, `0.2` — header, summary, grid, history. |
| Client-only formatting | `formatUnlockTime` (`:94`–`:97`) and `localDateKey` (`:99`–`:108`) use `toLocaleTimeString` / `toLocaleDateString` with **no `timeZone` option**, so the grouping key is the *browser's* zone while `AchievementService` buckets by the *user's stored* zone. A user who travels, or whose stored `timezone` differs from the device's, can see two groups for one day or one group for two. §24 F17. |
| No error boundary | A throw inside any `useMemo` blanks the whole route (the nearest boundary is the group layout's, if any). |

### 4.2 `apiRequest` contract — `src/lib/api-client.ts` (131 lines)

`apiRequest<T>(path, { query, method, … })` (`:60`) unwraps `{ success: true, data }` to `T` (`:109`) and **throws** `ApiError` otherwise (`:113`). The page therefore receives the raw array, and `meta` (the `total` from `GET /api/achievements`) is discarded — the page recomputes its own counts from the returned page of rows. §24 F32.

### 4.3 The celebration path is a **separate** client flow

`/achievements` never renders a toast. `runAchievementCheck()` (store `:90`) pushes events into the zustand queue; `CelebrationHost` — mounted once in `src/app/(dashboard)/layout.tsx:64` — feeds `events[0]` to `AchievementPopup` with `autoHideMs={8000}`. `AchievementPopup` keeps a **local** queue (`:92`) and dedupes the prop into it (`:100`–`:107`); `dismiss()` pops locally, writes `routineos_last_achievement_seen` to `localStorage` (`:157`, `:67`–`:73`) and calls `onDismiss` → `dismissFirst()`.

When no prop is supplied, the popup falls back to fetching the most recent unlock (`GET /api/achievements?limit=1`, `:116`–`:118`) and suppresses it if the id matches `localStorage` (`:124`). Failures retry with linear backoff `2000ms × (attempt+1)` up to `MAX_FETCH_ATTEMPTS = 2` (`:47`, `:135`–`:142`) — a fix for a previous bug where a single transient 500 permanently disabled celebrations.

⚠ Because `CelebrationHost` renders `events[0] ?? null`, and the popup's fallback fires whenever the queue is empty, **every dashboard page load issues a `GET /api/achievements?limit=1`** through the popup — a second achievements request on top of whatever the page itself requests.

### 4.4 Reduced motion / theme

`Stagger` and `AchievementPopup` both honour `prefers-reduced-motion` (`framer-motion` in the popup; `useReducedMotion` in `today/ui.tsx`). Colour handling is theme-aware in `AchievementBadge` (`var(--muted)`, `rarityTint`, `rarityChipStyle`) but **not** in `AchievementList`'s filter bar or `ProgressBar`'s track. §24 F15.

---

## 5. Backend / API architecture

### 5.1 Routes — five, all thin, all session-scoped

| Route | File | Method | Auth | Validation | Delegates to |
| ----- | ---- | ------ | ---- | ---------- | ------------ |
| `/api/achievements` | `src/app/api/achievements/route.ts` (53 lines) | GET | `auth()` → 401 | `listAchievementsSchema` (`:14`): `limit` coerce int 1–100, `offset` coerce int ≥0 | `AchievementService.listRecent(userId, limit)` |
| `/api/achievements/next` | `src/app/api/achievements/next/route.ts` (62 lines) | GET | `auth()` → 401 | `nextSchema` (`:27`): `count` coerce int 1–100 | `AchievementService.getNextUnearned(userId, count ?? 3)` |
| `/api/achievements/showcase` | `src/app/api/achievements/showcase/route.ts` | GET | `auth()` → 401 | none needed — no params | `AchievementService.getShowcase(userId, lockedCount ?? 12)` |
| `/api/achievements/unlock` | `src/app/api/achievements/unlock/route.ts` (35 lines) | POST | `auth()` → 401 | **none needed** — takes no body | `achievementService.checkForUnlocks(userId)` |
| `/api/achievements/celebrate` | `src/app/api/achievements/celebrate/route.ts` (56 lines) | POST | `auth()` → 401 | `celebrateAchievementSchema` (`src/schemas/achievement.schema.ts:8`) — optional `milestoneId` / `achievementId`, `.refine` requires ≥1 | `celebrateMilestone` or `celebrateAchievement` |

None of the five reads a userId from the request. `achievementId as string` at `celebrate/route.ts:43` is guarded by the schema's `.refine`. Error mapping: `celebrate` converts a thrown `Error` whose message `endsWith('not found')` into a **404** (`celebrate/route.ts:47`–`:49`) — string matching on an error message, which any thrown `Error('Achievement not found')` from any layer would also satisfy. §24 F25.

`/api/achievements` returns `{ success: true, data, meta: { total, limit, offset } }`. `meta.total` comes from `listRecent`'s second query. `offset` is validated and echoed but **never forwarded to any query** — `recentUnlocked(userId, limit)` takes no offset (`achievement.repository.ts:230`), so `?offset=50` returns the same first page. §24 F13.

### 5.2 `AchievementService` — `src/server/services/achievement.service.ts` (658 lines)

Five public methods plus `buildWorldState` and two module-private helpers (`resolveDefinitionProgress`, `byClosestFirst`).

```
GET /api/achievements
  listRecent(userId, limit=50)                                              :421–429
    Promise.all ─┬─ AchievementRepository.recentUnlocked(userId, limit)  orderBy unlockedAt desc
                 └─ AchievementRepository.findUnlocked(userId)          full findMany, then .length
    → { achievements, total }
    ⚠ both queries are the same rows; `total` is a full materialisation purely to count

GET /api/achievements/showcase
  getShowcase(userId, lockedCount=12)                                       :340–419
    Promise.all ─┬─ AchievementRepository.findByUserId(userId)
                 └─ buildWorldState(userId, { includeActiveDates: false })  ◄── ONE snapshot
    const { worldState, today } = snapshot                                 :345
    ownedIds ← definitionIdOf(row)  (column → metadata → null)            :347–351
    unlocked ← existing.map(…)  rarity ← definition?.rarity
                                   ?? UNKNOWN_ACHIEVEMENT_RARITY         :366
              sort unlockedAt desc
    locked  ← allDefinitions − ownedIds
              resolveDefinitionProgress(definition, worldState, today)   :380
              sort byClosestFirst → slice(0, lockedCount)
    → { unlocked, locked, counts: { unlocked, inProgress, locked, total } }

GET /api/achievements/next
  getNextUnearned(userId, count=3)                                          :452–497
    1 AchievementRepository.findByUserId(userId)                           :467
    2 definitionIdOf(row) → ownedSet                                       :468–472
    3 unowned = allDefinitions − ownedSet;  [] if empty (hot-path bail)    :474–475
    4 const { worldState, today } = buildWorldState(…, { includeActiveDates:false })  :477  ◄── 13 queries
    5 per definition: resolveDefinitionProgress(…)  →  { current, target, percent }   :483
      current = null when the field is unresolvable (deliberate ≠ 0)
    6 sort byClosestFirst (percent DESC, nulls last); .slice(0, count)     :495–496

POST /api/achievements/unlock
  checkForUnlocks(userId)                                                  :507–580
    1 AchievementRepository.findByUserId(userId)                           :516
    2 definitionIdOf → ownedIds / ownedSet                                 :518–522
    3 BAIL: if every definition is owned → return []                       :523–525  ◄── the hot path
    4 const { worldState, today } = buildWorldState(userId)                :527     ◄── 14 queries
    5 evaluateUnlocks(userId, worldState, ownedIds, today)                 :528     (pure)
    6 for…of { await } — SEQUENTIAL, not Promise.all                       :533
        const { achievement, created } =
          repository.createForDefinition(userId, definition.id, {          :541–553
            type, title: definition.name, description, icon, color,
            level: criteria[0]?.value ?? 1,        ◄── still a THRESHOLD
            metadata: JSON.stringify({ definitionId: definition.id }) })
        if (!created) continue;   ◄── the loser of the race skips notify+audit  :555
        buildUnlockEvent(definition, achievement.unlockedAt)               :557
        notificationService.notifyAchievement(userId, { id, title })       :560–563
        auditRepository.createActivity({ action: 'ACHIEVEMENT_UNLOCKED' }) :564–571

POST /api/achievements/celebrate
  getStreakWithMilestones(userId)                                          :581–592
    StreakRepository.findByUserId → create if absent → getUncelebratedMilestones
    ⚠ also reachable as GET /api/streak (src/app/api/streak/route.ts:18) — a *read*
      that CREATES a Streak row
  celebrateMilestone(userId, milestoneId)                                  :599–619
    findMilestoneById(id, userId) → throw 'Streak milestone not found'
    → StreakRepository.celebrateMilestone → audit 'MILESTONE_CELEBRATED'
  celebrateAchievement(userId, achievementId)                              :631–655
    const achievement = await this.repository.markCelebrated(userId, achievementId)  :641
    if (!achievement) throw 'Achievement not found'                        :642–644
    → audit 'ACHIEVEMENT_CELEBRATED'
    ✅ the ownership check IS the update's `where` clause — no read-then-write window
```

### 5.3 `buildWorldState` — the 14-query snapshot (`achievement.service.ts:128`–`:266`)

Returns **`{ worldState, today, timezone }`**, not the state alone. `today` is threaded into `checkCriteria` / `evaluateUnlocks` so a windowed criterion can be placed, and recomputing it would be a second settings read for a value that can differ across a midnight boundary mid-request.

```
timezone = UserRepository().getSettings(userId).then(s => s?.timezone || DEFAULT_TZ)
           .catch(() => DEFAULT_TZ)                                        :148–151
today    = getTodayString(timezone)                                        :152
window   = [historyStart(today), today]   (PATTERN_HISTORY_DAYS = 730)     :60, :174
threshold= THRESHOLDS.achievements.perfectDay = 95                        :175

Promise.all #1  (:177–193)   7 queries
  StreakRepository.findByUserId(userId)                 → totals.streak = currentStreak ?? 0
  GoalRepository.findAll(userId, {})                     → goalsCompleted = filter(status==='COMPLETED').length
  ScoreRepository.findPerfectDayDates(userId, w, 95)    → perfectDayDates (select: date only)
  ScoreRepository.countActiveDays(userId, w)             → daysActive
  SleepRepository.countEarlyWakeups(userId, w, '06:00')  → earlyWakeups
  ScoreRepository.findByDate(userId, today)              → dailyScore = totalScore
  FocusRepository.findCompletedSessionStarts(userId)     → startedAt[]   🆕 replaces countCompletedSessions

Promise.all #2  (:195–201)   5 queries
  HabitRepository.countAllCompletedLogs(userId)          → totalHabitLogs   (UNBOUNDED)
  MoodRepository.countMoodLogs(userId)                   ┐
  MoodRepository.countEnergyLogs(userId)                  ┴→ wellnessLogs = sum   (UNBOUNDED)
  FocusRepository.getStats(userId)                       → focusHours/focusMinutes/focusSessions (UNBOUNDED)
  JournalRepository.getStreakData(userId)                → journalEntries  (UNBOUNDED, result unused — F10)

activeDates = includeActiveDates ? findActiveDayDates(userId, w) : []     :205–207

lateEvenings = sessionStarts.filter(startedAt => isLateEvening(startedAt, timezone)).length  :218–220
               ✅ all-time; "late evening" = local hour ≥ 20 in the USER's zone

perfectDayStreak  = longestConsecutiveRun(perfectDayDates)                :231
perfectWeekStreak = longestPerfectWeekStreak(perfectDayDates)             :232
               ✅ both monotonic best-ever, so a missed day cannot retract an earned badge

return { worldState: { totals: {…15 keys…}, streaks: {},                    :234–265
                       dates: { activeDates, perfectDayDates }, counts: {} },
         today, timezone }
```

**Query budget:** 1 (settings) + 7 + 5 + 1 (`findActiveDayDates`) = **14** on the evaluation path, **13** on the `/next` and `/showcase` paths. **12 repository instances** (`User`, `Streak`, `Goal`, `Score` ×4, `Sleep`, `Habit`, `Mood` ×2, `Focus` ×2, `Journal`, `Achievement`). The count is unchanged from before Phase 1 — `countCompletedSessions` was replaced 1:1 by `findCompletedSessionStarts`.

⚠ **`dates.perfectDayDates` (`:259`) is dead weight.** `resolveCriterionValue` looks up `dates[`${field}Dates`]`, i.e. `perfectDaysDates` for `field: 'perfectDays'`. Nothing matches, so the array is built, returned and read by no caller. §24 **F34**.

**Three of those results are still never read by any caller:**
- `dates.activeDates` — `checker.resolveStreakValue` (`checker.ts:154`) is the only reader, but `totals.streak` is always a number so the `activeDates` branch is unreachable.
- `totals.journalEntries` — no definition in the catalogue has `field: 'journalEntries'`, so the whole `getStreakData` query (an unbounded `findMany` over every distinct journal date) fills a key nobody reads. §24 F10.
- `totals.focusMinutes` — only `focusHours` is referenced by a definition. Harmless but dead.

**Two totals are unbounded while four are windowed.** `countAllCompletedLogs(userId)` and `getStats(userId)` are called with no date range, so `milestone-habits-1000` and `focus-champion` genuinely mean *all time*, while `early-riser` and `milestone-days-30` are capped at 730 days despite declaring `timeframe: 'ALL_TIME'`. §24 F11/F33.

### 5.4 `AchievementRepository` — `src/server/repositories/achievement.repository.ts` (244 lines)

| Method | Line | Query | Used by |
| ------ | ---- | ----- | ------- |
| `findByUserId` | 13 | `findMany({ userId, orderBy: unlockedAt desc })` | `checkForUnlocks:516`, `getNextUnearned:467`, `getShowcase:342` |
| `findUnlocked` | 27 | **byte-identical** to `findByUserId` | `listRecent` only — ⚠ F18 |
| `findById` | 41 | `findFirst({ id, userId })` — ownership-scoped | `markCelebrated:148` |
| `create` | 57 | `create({ data, user: connect })` | **nothing now** — `checkForUnlocks` moved to `createForDefinition` |
| **`createForDefinition`** 🆕 | 89 | `definitionId === null` → plain `create`; else `findUnique({ userId_definitionId })`, and on `P2002` re-reads and returns `created: false` | `checkForUnlocks:541` |
| **`markCelebrated`** 🆕 | 138 | `updateMany({ where: { id, userId }, data: { celebrated: true } })`, then `findById` to return the row | `celebrateAchievement:635` |
| **`findDuplicateDefinitionGroups`** 🆕 | 165 | `findMany({ userId, definitionId: { not: null } }, select: { id, definitionId })` grouped in JS | **nothing** — reporting only; `scripts/reconcile-achievements.ts` owns the merge |
| `createMany` | 192 | `createMany({ skipDuplicates: true })` | **nothing — still dead.** §24 F9 |
| `isUnlocked` | 213 | `count({ id, userId }) > 0` | **nothing — still dead** |
| `recentUnlocked` | 230 | `findMany({ userId, orderBy: unlockedAt desc, take: min(limit,100) })` | `listRecent` |

`createForDefinition`'s race handling depends on `BaseRepository.isUniqueConstraintError` (`base.repository.ts:90`) — a `protected` helper that recognises `P2002`. ✅ it exists; the repository compiles against it.

### 5.5 Pure evaluation layer

| Module | Lines | Exports | Reads |
| ------ | ----- | ------- | ----- |
| `src/lib/constants/achievements.ts` | **412** | `ACHIEVEMENT_CATEGORIES` (7), `ACHIEVEMENT_RARITIES` (5), `ACHIEVEMENT_DEFINITIONS` (20), `AchievementCriteria`/`Definition` types, `rarityChipStyle`/`rarityTint`, lookup helpers | nothing |
| `src/lib/achievements/definitions.ts` | **107** | re-exports the registry + `allDefinitions`, `getAchievementById`, 🆕 **`getAchievementByName`** (`:79`), `definitionsByCategory`, `definitionsByRarity` | nothing |
| `src/lib/achievements/checker.ts` | **257** | `AchievementWorldState`, `resolveCriterionValue` (`:120`), `checkCriteria` (`:199`), `checkDefinition` (`:216`), `checkSnapshots` (`:247`) | `./timeframes` |
| `src/lib/achievements/timeframes.ts` 🆕 | **241** | `TIMEFRAME_DAYS` (`:53`), `isWindowedTimeframe` (`:62`), `calendarDaysBetween` (`:74`), `shiftDate` (`:79`), `countDatesWithinTimeframe` (`:104`), `longestConsecutiveRun` (`:127`), `currentConsecutiveRun` (`:157`), `weekStart` (`:172`), `countPerfectWeeks` (`:185`), `perfectWeekStarts` (`:190`), `longestPerfectWeekStreak` (`:212`), `LATE_EVENING_START_HOUR` (`:221`), `isLateEvening` (`:235`) | `date-fns-tz` only |
| `src/lib/achievements/metadata.ts` 🆕 | **48** | `AchievementRowIdentity`, `definitionIdOf` (`:35`) | nothing |
| `src/lib/achievements/unlock-logic.ts` | **136** | `hasUnlocked` (`:24`), `evaluateUnlocks` (`:37`, now takes `today`), `canCelebrate` (`:72`), `buildUnlockEvent` (`:120`) | nothing |
| `src/lib/achievements/xp.ts` | **167** | `ACHIEVEMENT_XP`, `xpNeededForLevel`, `cumulativeXpForLevel`, `computeTrophyLevel`, 🆕 `rarityOfDefinitionId` (`:107`), 🆕 `rarityOfRow` (`:126`), `xpOfTitle` (`:143`), `xpForRow` (`:161`), `UNKNOWN_ACHIEVEMENT_RARITY` | `./definitions` |
| `src/config/scoring.ts` | 272 | `THRESHOLDS.achievements = { perfectDay: 95, excellentDay: 85, goodDay: 70 }` | nothing |

**`timeframes.ts` and `metadata.ts` are deliberately Prisma-free and server-free.** That is what makes them importable from a `'use client'` file (`page.tsx:17`) *and* from `tests/` without a `DATABASE_URL` — the constraint `AGENTS.md` calls out about `@/lib/prisma` throwing at import time. Both are therefore testable in isolation today, which is exactly what F30 says nobody has done.

**Still-dead exports in this layer:** `checker.ts:247 checkSnapshots` · `unlock-logic.ts:72 canCelebrate` · `xp.ts:143 xpOfTitle` · `definitions.ts` `definitionsByCategory`/`definitionsByRarity` · `constants/achievements.ts` 5 unused helpers · `achievement.repository.ts:192 createMany` / `:213 isUnlocked` / `:165 findDuplicateDefinitionGroups`. §24 F9.

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

**Rarity resolution, after Phase 1** (`xp.ts:126`–`:135`, `:161`–`:167`):

```
rarityOfRow(row):
  row.definitionId  → getAchievementById(row.definitionId)?.rarity      ← canonical
  else              → getAchievementByName(row.title)?.rarity           ← legacy rows
  else              → undefined

xpForRow(row, override?):
  override ?? rarityOfRow(row) ?? UNKNOWN_ACHIEVEMENT_RARITY ('COMMON')  ◄── a stated
                                                                          default, not a guess
  → { xp: ACHIEVEMENT_XP[rarity], rarity }
```

✅ `row.level` is **never** consulted. It cannot be: `level` stores the criterion *threshold* (`7` for a 7-day streak, `1000` for a 1000-log milestone), and clamping that into a 5-entry ladder is what produced 14 wrong tiers.

---

## 6. Database dependency

### 6.1 `model Achievement` — `prisma/schema.prisma:2296`–`:2336`

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

  /// Stable catalogue key (an id in `ACHIEVEMENT_DEFINITIONS`).
  /// … (12-line doc comment: canonical join key, metadata fallback,
  ///     nullable on purpose, Postgres treats NULLs as distinct)
  definitionId String?

  createdAt DateTime @default(now())

  @@index([userId, unlockedAt])
  @@index([type, level])
  @@index([userId, createdAt])
  @@unique([userId, definitionId], map: "userId_definitionId")     // 🆕
}
```

Column-by-column against how the app actually uses it:

| Column | Written by | Read by | Verdict |
| ------ | ---------- | ------- | ------- |
| `id` | Prisma default `cuid()` | `AchievementBadge key`, notification `relatedEntityId`, the **404** `/achievements/${id}` link | cuid — **not** a definition id. §24 F7 |
| `userId` | every write path | every query is `userId`-scoped | ✅ ownership enforced in the query, not in JS |
| `type` | `definition.type` (`achievement.service.ts:546`) | nowhere on the page; `@@index([type, level])` exists for it | 15 enum values, **12 never used** by the catalogue |
| `title` | `definition.name` (`:547`) | `xpForRow`'s **last-resort** fallback only (`xp.ts:134`) | demoted from join key to display string ✅ |
| `description` | `definition.description` | `row.description ?? definition?.description` (`page.tsx:199`) | duplicated from the catalogue |
| `icon` / `color` | `definition.icon` / `definition.color` | `row.icon ?? definition?.icon` (`page.tsx:200`–`:201`) | same duplication |
| `level` | **`definition.criteria[0]?.value ?? 1`** (`:534`, `:550`) | `AchievementPopup`'s "Level N" chip | 🟡 **still stores a threshold**, but no longer read as a rarity tier ✅. The schema comment "for tiered achievements" is still misleading. §24 F6 |
| `unlockedAt` | default `now()` | `orderBy` on both list queries, the history grouping key | ✅ |
| `celebrated` | **`markCelebrated`** (`achievement.repository.ts:145`) | `getShowcase` (`:372`), `canCelebrate` | ✅ **fixed** — was F4 |
| `isPublic` | never written | never read | Dead column — no sharing feature exists |
| `metadata` | `JSON.stringify({ definitionId })` (`:551`) | `definitionIdOf` fallback, `parseProgress` | still the **legacy** carrier; `parseProgress` still looks for keys that are never written (§24 F16) |
| **`definitionId`** 🆕 | `createForDefinition` (`repository:109`) | `definitionIdOf`, `rarityOfRow`, the unique index | ✅ **canonical join key** |
| `createdAt` | default | never read | dead |

🔴→🟡 **`@@unique([userId, definitionId])` now exists in the schema** (`map: "userId_definitionId"`), which is the correct key — *not* `[userId, type, level]`, which would be wrong because `level` is a threshold (§24 F28). `definitionId` is nullable on purpose: `CUSTOM` achievements are not in the catalogue, and Postgres treats NULLs as distinct inside a unique index, so custom rows stay unrestricted while a catalogue achievement can be earned exactly once.

🔴 **The live database does not have this yet.** `npm run db:push` has not been run. See [§29](#29-outstanding-work--migration-runbook).

### 6.2 `enum AchievementType` — `prisma/schema.prisma`

15 members. The catalogue uses 12. **`PERFECT_QUARTER` and `CUSTOM` are never written**, and `ACHIEVEMENT_CATEGORIES.CUSTOM` is likewise unused. Categories in use: `HABITS`, `GOALS`, `CONSISTENCY` (×4), `LIFESTYLE` (×2), `MASTERY` (×3), `MILESTONES` (×2) — 6 of 7.

### 6.3 The models the snapshot reads

| Model | Repository call | Achieved total | Window |
| ----- | --------------- | --------------- | ------ |
| `User` (settings) | `UserRepository.getSettings` | `timezone` | — |
| `Streak` | `findByUserId` | `streak` = `currentStreak` | current value, not history |
| `Goal` | `findAll(userId, {})` | `goalsCompleted` | **unbounded, full rows** |
| `DailyScore` | `findPerfectDayDates` | `perfectDays`, `perfectDayStreak`, `perfectWeekStreak` | 730 d |
| `DailyScore` | `countActiveDays` | `daysActive` | 730 d |
| `DailyScore` | `findByDate(today)` | `dailyScore` | today only |
| `DailyScore` | `findActiveDayDates` | `dates.activeDates` (**unread**) | 730 d |
| `SleepLog` | `countEarlyWakeups(…, '06:00')` | `earlyWakeups` | 730 d |
| `FocusSession` | 🆕 `findCompletedSessionStarts` (completed, non-break, `startedAt` only) | `lateEvenings` | **unbounded** ⚠ F35 |
| `FocusSession` | `getStats(userId)` | `focusHours`, `focusMinutes`, `focusSessions` | **unbounded** |
| `HabitLog` | `countAllCompletedLogs(userId)` | `totalHabitLogs` | **unbounded** |
| `MoodLog` | `countMoodLogs(userId)` | `wellnessLogs` (½) | **unbounded** |
| `EnergyLog` | `countEnergyLogs(userId)` | `wellnessLogs` (½) | **unbounded** |
| `JournalEntry` | `getStreakData(userId)` | `journalEntries` (**unread**) | **unbounded** |
| `Achievement` | `findByUserId` ×3 | owned-set | all |

### 6.4 Two related models

`model Streak` — `userId` is **`@unique`**, so there is exactly one streak row per user, and `currentStreak` is a single scalar. `totals.streak` is therefore a *global* streak, not "the longest per-habit streak" that `checker.resolveStreakValue`'s doc comment describes. The five habit-streak achievements (`3 / 7 / 30 / 100 / 365`) all read that one number. §24 **F8 — still open.**

`model StreakMilestone` — has a real `celebrated Boolean`, and `StreakRepository.celebrateMilestone` writes it. ✅ **The asymmetry noted in the original audit is gone**: both halves of `POST /api/achievements/celebrate` now persist.

### 6.5 Side-effect tables

`checkForUnlocks` writes an `ActivityLog` row per unlock (`action: 'ACHIEVEMENT_UNLOCKED'`, `achievement.service.ts:564`–`:571`) and `notificationService.notifyAchievement` writes a `NotificationLog`. Neither is in a transaction with the `Achievement` insert, so a notification failure after a successful insert leaves the badge awarded but unsignalled. `checkForUnlocks` is `await`ed inside a `for…of` whose failure propagates; `habit.service.ts` and `goal.service.ts` attach `.catch()`, so the user action still succeeds. §24 **F20 — still open.**

---

## 7. The achievement catalogue — 20 definitions

Source: `src/lib/constants/achievements.ts:162`–`:384`. `Object.values()` order is the registry's insertion order, and `allDefinitions` preserves it — that order is what "closest first" then slices, and what `checkForUnlocks` returns in.

| # | id | name | type | category | rarity | criteria | `timeframe` | resolves? |
| - | -- | ---- | ---- | -------- | ------ | -------- | ----------- | --------- |
| 1 | `first-habit-streak` | First Streak 🌟 | `HABIT_STREAK` | HABITS | COMMON | `streak >= 3` | — | ⚠ global streak (F8) |
| 2 | `habit-streak-7` | One Week Strong 🔥 | `HABIT_STREAK` | HABITS | UNCOMMON | `streak >= 7` | — | ⚠ F8 |
| 3 | `habit-streak-30` | Month of Mastery 💎 | `HABIT_STREAK` | HABITS | RARE | `streak >= 30` | — | ⚠ F8 |
| 4 | `habit-streak-100` | Century Streak 🏆 | `HABIT_STREAK` | HABITS | EPIC | `streak >= 100` | — | ⚠ F8 |
| 5 | `habit-streak-365` | Iron Habit 👑 | `HABIT_STREAK` | HABITS | LEGENDARY | `streak >= 365` | — | ⚠ F8 |
| 6 | `first-goal-completed` | First Win 🏁 | `GOAL_COMPLETED` | GOALS | COMMON | `goalsCompleted >= 1` | — | ✅ |
| 7 | `goals-completed-10` | Goal Getter 🎖️ | `GOAL_COMPLETED` | GOALS | UNCOMMON | `goalsCompleted >= 10` | — | ✅ |
| 8 | `goals-completed-50` | Wall of Wins 🏆 | `GOAL_COMPLETED` | GOALS | **LEGENDARY** | `goalsCompleted >= 50` | — | ✅ |
| 9 | `perfect-day` | Perfect Day 💯 | `PERFECT_DAY` | CONSISTENCY | UNCOMMON | **`perfectDays >= 1`** | `ALL_TIME` | ✅ **changed** — was `dailyScore >= 95` / `DAY` |
| 10 | `perfect-week` | Perfect Week 🔥 | `PERFECT_WEEK` | CONSISTENCY | RARE | **`perfectDayStreak >= 7`** | `ALL_TIME` | ✅ **changed** — was `perfectDays >= 7` / `WEEK` |
| 11 | `perfect-month` | Perfect Month 👑 | `PERFECT_MONTH` | CONSISTENCY | EPIC | **`perfectDayStreak >= 30`** | `ALL_TIME` | ✅ **changed** |
| 12 | `perfect-year` | Perfect Year 🌟 | `PERFECT_YEAR` | CONSISTENCY | LEGENDARY | **`perfectDayStreak >= 365`** | `ALL_TIME` | ✅ **changed** — 730-day window ≥ 365 ✅ |
| 13 | `early-riser` | Early Riser 🌅 | `EARLY_RISER` | LIFESTYLE | UNCOMMON | `earlyWakeups >= 10` | `ALL_TIME` | ⚠ 730-day cap (F33) |
| 14 | `night-owl` | Night Owl 🌙 | `NIGHT_OWL` | LIFESTYLE | UNCOMMON | `lateEvenings >= 20` | `ALL_TIME` | ✅ **was unreachable** — now all-time |
| 15 | `productivity-master` | Productivity Master 👑 | `PRODUCTIVITY_MASTER` | MASTERY | EPIC | `focusHours >= 100` | `ALL_TIME` | ✅ |
| 16 | `wellness-warrior` | Wellness Warrior 💚 | `WELLNESS_WARRIOR` | MASTERY | RARE | `wellnessLogs >= 30` | `ALL_TIME` | ✅ |
| 17 | `focus-champion` | Focus Champion 🧠 | `FOCUS_CHAMPION` | MASTERY | LEGENDARY | `focusSessions >= 500` | `ALL_TIME` | ✅ |
| 18 | `consistency-king` | Consistency King 👑 | `CONSISTENCY_KING` | CONSISTENCY | EPIC | **`perfectWeekStreak >= 4`** | `ALL_TIME` | ✅ **changed** — was `perfectWeeks >= 4` / `MONTH` |
| 19 | `milestone-habits-1000` | Thousand Builders 📍 | `MILESTONE` | MILESTONES | RARE | `totalHabitLogs >= 1000` | `ALL_TIME` | ✅ |
| 20 | `milestone-days-30` | One Month In 📆 | `MILESTONE` | MILESTONES | UNCOMMON | `daysActive >= 30` | `ALL_TIME` | ✅ |

### 7.1 What changed in the catalogue, and why

**The three `perfect-*` definitions moved from a *count inside a window* to a *monotonic best-ever run*.** This is the single most consequential edit in Phase 1 and it deserves the reasoning on the record.

The declared timeframes were `DAY` / `WEEK` / `MONTH` / `YEAR`. Implementing those literally means `perfect-week` = "7 perfect days among the last 7 days". That is a **rolling target**: the moment a day is missed the count drops, and a user who was one check away from firing never fires. The unlock check only runs on a habit log, a goal completion or a focus-session end — so a user who qualifies at 23:50 and opens the app at 00:05 has already missed the window, and the badge is silently unreachable for reasons they cannot see or control.

Run-shaped criteria therefore resolve against **best-ever runs**, supplied as lifetime totals:

| Definition | Before | After | Claim it now makes |
| ---------- | ------ | ----- | ------------------ |
| `perfect-day` | `dailyScore >= 95` scoped to **today** | `perfectDays >= 1`, all-time | "Score 95 or higher on a single day" — once earned, always earned |
| `perfect-week` | `perfectDays >= 7` (scattered, 730 d) | `perfectDayStreak >= 7` | "Score 95 or higher on 7 days **in a row**" ✅ matches the description |
| `perfect-month` | `perfectDays >= 30` (scattered) | `perfectDayStreak >= 30` | "…on 30 days in a row" ✅ |
| `perfect-year` | `perfectDays >= 365` (scattered) | `perfectDayStreak >= 365` | "…on 365 days in a row" ✅ |
| `consistency-king` | `perfectWeeks >= 4` (non-adjacent weeks) | `perfectWeekStreak >= 4` | "Record 4 perfect weeks **in a row**" ✅ matches the description |

✅ **Every description now describes what the code measures.** In the original catalogue four of these descriptions promised consecutiveness that the code never checked.

⚠ **The trade-off, stated plainly:** a user who once had a 7-day run and has since had a bad month still holds `perfect-week`. That is *correct* for an award — you do not take back a medal — but it means the badge is a record of a past achievement, not a live challenge. If a future revision wants "earn this in the current week", that is a **different achievement** (`perfect-week-current`) and should coexist with this one, not replace it.

⚠ **`perfect-year` is bounded by the 730-day window.** A 365-consecutive-day run needs at least 365 days of history, and the window provides 730, so the result is correct for every user whose history is ≤ 730 days. A user with *more* than two years of history could in principle have had a 365-day run that falls outside the window — unreachable in practice (a 365-day perfect run inside a 730-day window is the only realistic shape), but it is a ceiling, not a proof.

**Rarity distribution (as defined):** COMMON ×3, UNCOMMON ×5, RARE ×4, EPIC ×4, LEGENDARY ×4. Total catalogue value if fully earned: `3×10 + 5×25 + 4×50 + 4×100 + 4×250 = 1,705 XP` → trophy level 6. ✅ **The grid, the history, the header chips and the XP total now all agree with this number**, because all four resolve through the same `xpForRow`.

**Every definition still has exactly one criterion.** That is load-bearing in two places: `checkForUnlocks` writes `level = definition.criteria[0]?.value ?? 1`, and `resolveDefinitionProgress` reads only `criteria[0]` for `target`. Nothing enforces it — adding a second criterion today would silently drop it from both the `level` column and the progress ring. §24 F21.

**Distinct criterion fields: 12** — `streak`, `goalsCompleted`, `perfectDays`, `perfectDayStreak`, `perfectWeekStreak`, `earlyWakeups`, `lateEvenings`, `focusHours`, `wellnessLogs`, `focusSessions`, `totalHabitLogs`, `daysActive`. The snapshot produces **15** totals, so three (`dailyScore`, `focusMinutes`, `journalEntries`) are unmatched — matching §5.3.

### 7.2 ✅ RESOLVED — `rarityOfTitle` can no longer fail

**The original defect, verbatim:** `ACHIEVEMENT_DEFINITIONS` is keyed by `id` (`'first-habit-streak'`), but `getAchievementById(title)` was handed the row's **display name** (`'First Streak'`). No name equals any id, so the lookup returned `undefined` for **all 20** definitions, and `xpForRow` fell back to clamping `row.level` — which stores the **criterion threshold** — into the rarity ladder. **14 of 20 achievements rendered the wrong rarity chip and the wrong XP**, and the grid contradicted the history on the same screen.

**The fix, in three parts:**

1. **`Achievement.definitionId` is a real column** (`schema.prisma:2328`). The service writes it on every insert (`achievement.repository.ts:109`). The generated client carries it.
2. **`definitionIdOf(row)`** (`metadata.ts:35`) resolves the id with a documented precedence: **column first, `metadata` JSON as the legacy fallback, `null` for a genuinely custom row.** This is the single rule the page, the service, the showcase and the XP engine all now share — they no longer each invent their own join.
3. **`rarityOfRow`** (`xp.ts:126`) tries the id, then the name, then returns `undefined`; `xpForRow` (`xp.ts:161`) falls back to **`UNKNOWN_ACHIEVEMENT_RARITY`**, an exported constant. A legacy row cannot be `COMMON` in the summary and `EPIC` in the history, because there is only one code path.

**And the page joined on the id** (`page.tsx:189`–`:191`), so the two-join-key contradiction (§24 F12) is gone at the same time.

⚠ **User-visible consequence, unchanged from the original audit's warning:** trophy levels will **drop** for most users. A `First Streak` goes 50 XP → 10 XP. Users who have seen the old numbers will see a lower level. This needs a release note, not a silent fix.

⚠ **`level` is no longer read as a tier, but it is still written as a threshold** and `AchievementPopup` still renders it as "Level N" (`AchievementPopup.tsx:234`). So a `Thousand Builders` card can still say "Level 1000". §24 **F6 — partially fixed.**

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
    const { worldState, today } = buildWorldState(userId, { includeActiveDates: false })  ◄── 13 queries
    per definition: resolveDefinitionProgress(definition, worldState, today) → { current, target, percent }
    sort byClosestFirst → slice(0, 100)                            service.ts:495–496
  → { success: true, data: NextUpRow[] }        (≤ 20 rows; the 100 cap is inert)
```

⚠ **`count=100` is inert.** The catalogue has 20 definitions and `getNextUnearned` filters to *unowned* ones, so the response can never exceed 20 rows. The route's docstring justifies the `max(100)` cap by claiming "the catalogue is 12 definitions" (`next/route.ts:22`) — stale, and **the same stale number is still in the page** at `page.tsx:167` ("The whole catalogue is 12 definitions"). Harmless, but both comments misdescribe the code. §24 F22.

⚠ The **same snapshot runs twice** on a dashboard page load that includes both this page's strip and the page itself: `AchievementsStrip` requests `count=3`, the page requests `count=100`, and each call re-runs `buildWorldState` independently. There is no cache and no shared request. `/api/achievements/showcase` exists precisely to fix this (§5.1) but **this page does not use it yet** — that is Phase 2.

### 8.2 Filter the grid

`AchievementList` holds `status` and `tier` in local `useState` and filters in a `useMemo`. Pure client-side, no request. Counts are recomputed on every render. State is **not** lifted and **not** persisted — a filter resets on navigation. There is no URL query param, so the grid is not shareable or linkable.

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
  └─ checkForUnlocks                    achievement.service.ts:507–580
       L516  read owned rows FIRST
       L523  if every definition is already owned → return []      ◄── the hot-path bail
       L527  const { worldState, today } = buildWorldState(userId)   ~14 queries
       L528  evaluateUnlocks(userId, worldState, ownedIds, today)
       L533  for…of { await }  ◄── SEQUENTIAL, not Promise.all
         L541  const { achievement, created } = repository.createForDefinition(
                  userId, definition.id,
                  { type, title: definition.name, description, icon, color, level,
                    metadata: JSON.stringify({ definitionId: definition.id }) })
                ⚠ requires the `userId_definitionId` index to exist in the DATABASE
         L555  if (!created) continue;     ◄── lost the race → no notification, no audit
         L557  buildUnlockEvent(definition, achievement.unlockedAt)
         L560  notificationService.notifyAchievement(userId, { id, title })
         L564  auditRepository.createActivity({ action: 'ACHIEVEMENT_UNLOCKED', … })
```

✅ **The duplicate-row race is now closed at the database level.** A single user action can still trigger the check two or three times concurrently, but `createForDefinition` upserts on `@@unique([userId, definitionId])`, so the losers receive `created: false` and skip both the notification and the audit row. One badge, one notification, one audit entry — regardless of how many callers race.

⚠ **The index is in the schema but not in the database.** Until `db:push` runs, `findUnique({ where: { userId_definitionId } })` throws. §24 F36, [§29](#29-outstanding-work--migration-runbook).

### 8.4 Dismiss a celebration toast

`AchievementPopup.dismiss` pops its local queue, writes `routineos_last_achievement_seen` to `localStorage`, then calls `onDismiss` → `CelebrationHost`'s `dismissFirst` → `store.dismissFirst` slices the zustand queue. Auto-hide fires the same path after `autoHideMs` (default **8000** from `CelebrationHost:27`; the component's own default is 7000).

⚠ The **local** queue and the **store** queue are two independent arrays. If a new event is pushed while one is on screen, the popup appends it locally *and* the store has it queued; dismissing once pops the local head only. A second dismiss is needed to advance the store, so the next toast can appear to "replay" the event the user just dismissed. §24 F23.

⚠ **`celebrateAchievement` is still not called by anything.** The toast dismiss path writes `localStorage`, not the `celebrated` column. So the column is now *correctly persisted when the endpoint is used*, but nothing in the UI uses the endpoint. §24 **F5 — still open**, and it is now the last thing standing between a fixed column and a working "new badge" indicator.

### 8.5 Reach the page from elsewhere

`DashboardWidgets.tsx:76` toggles the strip; the strip's "View all" links to `/achievements`. The **notification bell** also links here — but via `/achievements/${achievement.id}`, which does not exist (§24 F7). The `StreakBadge` and `StreakCard` components fetch `/api/streak`, which is served by `AchievementService.getStreakWithMilestones` — the same class, a different method, sharing no state with this page.

---

## 9. What can the user create

**Nothing.** `/achievements` has no create affordance: no button, no form, no modal, no `POST` from the page. The only writes to `Achievement` are server-side `checkForUnlocks` inserts and `markCelebrated`.

This is a deliberate design — the catalogue is a compile-time constant (`ACHIEVEMENT_DEFINITIONS`) and the DB table is a **record of unlocks**, not a definition store.

✅ **The rename hazard is fixed.** The table now stores a real `definitionId` alongside the denormalised display copies, and every consumer resolves the catalogue entry through `definitionIdOf` (column → metadata). Renaming `First Streak 🌟` to `First Streak` in the registry no longer produces a badge that appears twice (once earned, once locked). The `title`/`description`/`icon`/`color` columns still hold the *old* strings for pre-existing rows, so a renamed definition's history entry shows the old name — but it appears **once**, in the right place, with the right rarity and XP. §24 F24 fixed; a cosmetic "re-render history from the catalogue" pass would close the rest.

Still true:
- The catalogue cannot be extended without a deploy, and there is no admin surface.
- `ACHIEVEMENT_CATEGORIES.CUSTOM` and `AchievementType.CUSTOM` exist for a user-created feature that does not exist.

## 10. What can the user edit

**Nothing on this page.** The only state the user controls is the transient filter in `AchievementList`'s local `useState`, which is not persisted anywhere and resets on navigation.

The closest thing to an edit in the whole domain is `POST /api/achievements/celebrate`, which the page never calls and **no component in the repo calls** — the only reference outside the route is a comment in `push.service.ts:77`. It is a fully implemented, authenticated, audited, unreachable endpoint. §24 F5.

Not editable, and worth stating because the UI implies otherwise:
- Achievement name, description, icon, colour, rarity, criteria — all compile-time.
- The displayed `level` — derived at insert time and never updated, so a catalogue threshold change leaves old rows with a stale number. It is also a threshold wearing a level's name. §24 F6.
- `isPublic` — no write, no read, no feature.

✅ `celebrated` **is** now written (`markCelebrated`), scoped to the owner, and read by `getShowcase` — but nothing calls the endpoint that writes it.

## 11. What can the user delete

**Nothing.** There is no `DELETE` route under `src/app/api/achievements/`. `AchievementRepository` has no delete method.

The only way a row disappears is `User` deletion, via `onDelete: Cascade` on `Achievement.user`.

This is the right call for an append-only ledger — an achievement is a historical fact and un-earning it would be dishonest.

✅ **Duplicates are now at least *mergeable***, which was the substance of the original complaint: `scripts/reconcile-achievements.ts` groups rows by `(userId, definitionId)`, keeps the earliest, ORs `celebrated`/`isPublic`, keeps the richest `metadata`, fills `icon`/`color`, and deletes the rest — behind an explicit `--apply` flag with a dry-run default. `findDuplicateDefinitionGroups` (`:165`) reports them per user without mutating. §24 F26 mitigated; still no user-facing delete, which is correct.

---

## 12. Cross-page dependencies

### 12.1 Inbound — what this page's data depends on

| Source | What is read | How |
| ------ | ------------- | --- |
| `/api/achievements` | owned `Achievement` rows | `page.tsx:148`, `AchievementsStrip.tsx:234`, `AchievementPopup.tsx:116` |
| `/api/achievements/next` | unowned + progress | `page.tsx:169`, `AchievementsStrip.tsx:235` |
| `@/lib/constants/achievements` | the 20 definitions, 5 rarities, chip helpers | `page.tsx:5`–`:11` |
| `@/lib/achievements/xp` | `ACHIEVEMENT_XP`, `computeTrophyLevel`, `xpForRow` | `page.tsx:12`–`:16` |
| **`@/lib/achievements/metadata`** 🆕 | `definitionIdOf` — the join key | `page.tsx:17` |
| **`@/lib/achievements/definitions`** 🆕 | `getAchievementById` — resolve by id | `page.tsx:18` |

Transitively, the two endpoints depend on **12 repositories** across **14 models** — habits, goals, scores, sleep logs, focus sessions, mood logs, energy logs, journal entries, streaks. So `/achievements` is a read of nearly the entire database.

### 12.2 Outbound — who depends on this page's system

| Consumer | Relationship |
| -------- | ------------ |
| `src/app/(dashboard)/layout.tsx:64` | mounts `CelebrationHost` → `AchievementPopup` on **every** dashboard page |
| `src/components/dashboard/AchievementsStrip.tsx` | same two endpoints; renders 6 owned + 3 next; links here |
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
| `app/(dashboard)/analytics/page.tsx:25` | `components/analytics/AchievementsStrip` — a **different**, read-only strip |
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

**If the rarity fix (§7.2) is deployed:** 14 of 20 badges immediately display their true rarity, the history stops contradicting the grid, and `totalXp` drops by a large factor for most users — lowering trophy levels. **This is a visible regression to users who have seen the current numbers** and needs a migration note. It is the correct trade: the old numbers were wrong.

**If the `@@unique` index is pushed without running the reconcile script first:** `prisma db push` will **fail** if any user already has two rows for the same definition, because Postgres cannot build a unique index over duplicate keys. This is not a hypothetical — the original audit documented four independent unlock callers with no constraint (§24 F11), so duplicates are likely already present in any long-lived database. The runbook is [§29](#29-outstanding-work--migration-runbook).

**If `night-owl`'s fix is deployed:** the badge becomes earnable for the first time. Users who were 19 sessions away will now see the counter actually move, and the tile will show a real number instead of a value that reset at local midnight.

**Blast radius of the timeframe change (§27):** `perfect-week`, `perfect-month`, `perfect-year` and `consistency-king` now require *consecutive* runs. Some users who qualified under the old scattered-count rule **already hold the badge** — the unique index will not re-evaluate them, and `checkForUnlocks` skips anything already owned. So the change is strictly a tightening for future unlocks, never a revocation. That is the desired behaviour for an award ledger, but it does mean the catalogue's unlock counts will diverge from a fresh replay of history.

**Blast radius of the 404 links:** every achievement notification and every achievement email button points at a non-existent route. §24 F7.

---

## 14. Current System Capabilities

Everything below is implemented and reachable today.

| Capability | Evidence |
| ---------- | -------- |
| 20 achievements across 6 categories and 5 rarity tiers | `constants/achievements.ts:162`–`:384` |
| Persistent unlock ledger, cascade-deleted with the user | `schema.prisma:2296`, `achievement.repository.ts:89` |
| Server-side unlock evaluation on habit, goal and focus writes | `habit.service.ts:386`, `goal.service.ts:320`/`:346`, `FocusTimer.tsx:683` |
| Hot-path bail once everything is owned (1 query instead of 14) | `achievement.service.ts:523`–`:525` |
| Bounded 730-day history window | `PATTERN_HISTORY_DAYS`, `achievement.service.ts:60` |
| Aggregate-only reads — no full-row materialisation for counts | `countActiveDays`, `countEarlyWakeups`, `findPerfectDayDates`, `findActiveDayDates` |
| Timezone-correct "today", and a **timezone-correct** late-evening boundary | `getTodayString(tz)`, `isLateEvening(startedAt, tz)`, `achievement.service.ts:152`, `:218` |
| ✅ **Rarity resolved by stable definition id, with a metadata fallback** | `definitionIdOf` (`metadata.ts:35`), `rarityOfRow` (`xp.ts:126`), `Achievement.definitionId` (`schema.prisma:2328`) |
| ✅ **XP and rarity agree across grid, history, chips and total** | one code path: `xpForRow` (`xp.ts:161`), used at `page.tsx:204` and `:240` |
| ✅ **`timeframe` is read; windowed criteria fail closed rather than guessing** | `resolveCriterionValue` (`checker.ts:120`–`:148`), `countDatesWithinTimeframe` (`timeframes.ts:104`) |
| ✅ **Consecutive-run semantics matching the badge descriptions** | `longestConsecutiveRun` (`timeframes.ts:127`), `longestPerfectWeekStreak` (`timeframes.ts:212`) |
| ✅ **Night Owl is earnable** — all-time, local-hour, completed non-break sessions | `findCompletedSessionStarts` (`focus.repository.ts:581`), `isLateEvening` (`timeframes.ts:235`), `LATE_EVENING_START_HOUR` (`:221`) |
| ✅ **Unlocks are idempotent under concurrency** — one badge, one notification, one audit row | `createForDefinition` (`achievement.repository.ts:89`–`:126`), `if (!created) continue` (`service.ts:555`) |
| ✅ **`celebrated` persists, owner-scoped** | `markCelebrated` (`achievement.repository.ts:138`–`:152`), `service.ts:641` |
| ✅ **A duplicate-reconciliation script exists, dry-run by default** | `scripts/reconcile-achievements.ts` (169 lines) |
| ✅ **One world-state build serves both halves of a showcase** | `getShowcase` (`service.ts:340`), `resolveDefinitionProgress` (`service.ts:285`) |
| Opt-out of the per-day list for the `/next` and `/showcase` paths | `includeActiveDates` option, `service.ts:129`, `:205` |
| Progress toward unearned badges with a deliberate `null` for "untracked" | `resolveDefinitionProgress` (`service.ts:285`–`:308`) |
| "Closest first" ordering with unmeasurable badges last | `byClosestFirst` (`service.ts:311`–`:319`) |
| Derived trophy level, XP and progress bar — nothing persisted | `xp.ts:68`, `page.tsx:282` |
| Rarity histogram and per-row XP chips | `page.tsx:257`–`:266`, `:431`–`:432` |
| Day-grouped unlock history | `page.tsx:268`–`:278`, `:388`–`:446` |
| Client-side status + rarity filters with live counts | `AchievementList.tsx:45`–`:66` |
| Responsive 1→4 column grid | `AchievementList.tsx:117` |
| In-app notification + audit row per unlock | `notification.service.ts:548`, `achievement.service.ts:564` |
| Streak-milestone celebration | `streak.repository.ts` `celebrateMilestone` |
| Ambient motivation on `/dashboard`, toggleable | `AchievementsStrip.tsx`, `DashboardWidgets.tsx:76` |
| Celebration toast with auto-hide, countdown and reduced-motion | `AchievementPopup.tsx:164`–`:191` |
| Bounded retry so one 500 can't silence celebrations for the session | `AchievementPopup.tsx:47`, `:135`–`:142` |
| Theme-aware rarity chips and tints | `constants/achievements.ts` → `utils.ts` |
| Clean client/server boundary on this route | §3.1 — no `@/server/**`, no Prisma value import |

---

## 15. Currently NOT Supported

| Not supported | What is actually missing |
| ------------- | ------------------------ |
| Creating or editing an achievement | No write path from the UI; the catalogue is a compile-time constant (§9, §10) |
| Deleting an achievement | No `DELETE` route, no repository method (§11) |
| Custom or user-defined achievements | `AchievementType.CUSTOM` and `ACHIEVEMENT_CATEGORIES.CUSTOM` exist; nothing writes or renders them |
| Per-achievement detail page | **No `src/app/(dashboard)/achievements/[id]/`** — yet `notifyAchievement` and `sendAchievementUnlocked` both link to it (§24 F7) |
| Sharing or public achievements | `isPublic` column, never written, never read |
| A "new badge" indicator in the UI | `celebrated` **is** persisted now, but nothing calls `POST /api/achievements/celebrate` (§24 F5) |
| Resetting or re-rolling progress | No route, no repository method (§11) |
| Server-side pagination on this page | `offset` is validated and echoed in `meta` but never forwarded (§24 F13) |
| Persisting grid filters | Local `useState` in `AchievementList`; no URL param, lost on navigation |
| Progress bar on an **earned** tile | `metadata` carries only `definitionId`, so `parseProgress` returns `undefined` (§24 F16) |
| Offline / cached read | No SWR/React Query, no `loading.tsx`, no `error.tsx` |
| Optimistic UI | None — the page has no mutations at all |
| Per-achievement "how do I get this" guidance | `description` is a static one-liner; no criterion echo, no link to the relevant page |
| Automated achievement email | `email.service.ts:391` and `emails/achievement-unlocked.tsx` are fully written but **have zero callers** (§24 F29) |
| 🔴 **A single-request achievements page** | `/api/achievements/showcase` exists and returns both halves from one snapshot, but `page.tsx` still issues two requests (§8.1) |
| 🔴 **Any test coverage at all** | `tests/` has 20 files. **None** imports `checker.ts`, `unlock-logic.ts`, `xp.ts`, `timeframes.ts` or `metadata.ts`. Four of the seven defects fixed in Phase 1 were in pure, dependency-free functions that Vitest covers in a few lines each. §24 F30 |

---

## 16. Loading / Error / Empty / Edge states

### 16.1 The five states that exist

| State | Trigger | Render | Gap |
| ----- | ------- | ------ | --- |
| **Loading** | `rows === null && !error` | a centred `<Spinner class="h-6 w-6" />` in `py-16` (`page.tsx:327`–`:330`) | No skeleton. The summary card, the 20 tiles and the history have known heights. Also: because `/next` resolves separately, a fast `/next` + slow `/api/achievements` still shows the spinner, and a slow `/next` shows the page with locked tiles that briefly have no progress bars |
| **Error** | the first request throws | `<p role="alert" class="… bg-destructive/10 text-destructive">` above the content (`page.tsx:321`–`:325`) | **The rest of the page still renders.** With `rows === null` the `achievements` memo produces `[]`, so the grid shows "No achievements match / Try clearing the filters." — a *filter* empty state shown when there are no filters. No retry button |
| **Empty (earned)** | `GET /api/achievements` → `[]` | The full page renders: level 1, 0 XP, an empty progress bar, five chips reading `0`, 20 locked tiles, and the history `EmptyState` (`page.tsx:394`–`:401`) | No *page-level* empty state. A new user sees a working-looking page of 20 unearnable tiles |
| **Empty (grid)** | a filter matches nothing | `EmptyState` with `description` only when a filter is active (`AchievementList.tsx:110`–`:115`) | ✅ correctly worded |
| **Empty (history)** | no unlocks | `EmptyState` "No unlocks yet" with a completion hint (`page.tsx:394`–`:401`) | ✅ |

### 16.2 States that do not exist

- **Partial failure of `/next`** — swallowed at `page.tsx:171`. Intentional and documented in the comment at `:156`–`:164` ("progress is an enhancement, not a requirement"), and it is the right call. But it is **invisible** — no console warning, no telemetry.
- **Stale data** — no revalidation, no refetch on focus. A badge unlocked on another tab never appears until reload.
- **Duplicate rows** — the unique index prevents new ones **once pushed**; existing ones are handled by the reconcile script, not by the UI.
- **Very long titles** — `truncate` + `title` attribute on the card and in history; descriptions are `line-clamp-2` and `truncate`. ✅
- **Reduced motion** — `Stagger` and the popup both respect it. ✅
- **`maxed` state** — renders 👑, "Maximum level", "Max". Unreachable in practice (§5.6).
- **`localStorage` unavailable** — `readLastSeen`/`writeLastSeen` both try/catch. ✅ Private-mode safe.
- **Negative / NaN XP** — `computeTrophyLevel` guards with `Number.isFinite` and `Math.max(0, …)`. ✅
- **`percent` > 100** — clamped in `resolveDefinitionProgress` (`service.ts:306`) and again in the strip's `Ring`. ✅
- **Unmeasurable criterion** — `null`, distinct from `0`, sorted last. ✅ This is the one piece of edge-case design that was right from the start and is now applied consistently to all three surfaces.

---

## 17. Authentication & security

### 17.1 The route itself

`/achievements` is a client component under `src/app/(dashboard)/`, which is covered by the group layout's `privateMetadata` and by `src/proxy.ts` redirecting unauthenticated requests to `/login`. There is no page-level auth check — correct for a client page; the data is protected server-side.

### 17.2 Every endpoint re-derives identity from the session

All five routes call `auth()` first and return 401 without it. ✅ **No route accepts a `userId` from the client.** `unlock` takes no body at all.

### 17.3 Input validation

| Endpoint | Validation | Notes |
| -------- | ---------- | ----- |
| `GET /api/achievements` | `limit` coerced int 1–100, `offset` coerced int ≥ 0 | Empty strings become `undefined`, so `?limit=` is not a validation error. ✅ |
| `GET /api/achievements/next` | `count` coerced int 1–100 | ✅ |
| `GET /api/achievements/showcase` | none — no params read | ✅ |
| `POST /api/achievements/celebrate` | two optional `min(1)` strings + `.refine` requiring ≥ 1 | ✅ Correctly requires one. The `as string` cast is safe because of the refine |
| `POST /api/achievements/unlock` | **no schema — no body is read** | ✅ Correct |

### 17.4 Ownership enforcement

Every repository query that could touch another user's rows is `userId`-scoped. ✅ **The Phase 1 change strengthens this.** `celebrateAchievement` previously did `findById(userId, id)` and then wrote; it now calls `markCelebrated(userId, id)`, whose ownership check **is** the `where` clause of the `updateMany` — there is no window in which another user's id could be used to flip a flag. `null` from `markCelebrated` means "not yours, or does not exist", which is the same answer the caller needs, and it produces the same 404.

✅ **No IDOR is reachable.**

### 17.5 Injection and rendering

- All Prisma access goes through `findMany`/`count`/`create`/`updateMany` with structured `where` objects. **No `$queryRaw`, no `$executeRaw`, no string interpolation** in this domain. ✅
- Notification body text interpolates `achievement.title` into a plain string. That is a DB-stored value originating from `definition.name`, a compile-time constant, so it cannot be attacker-controlled. The **email** path escapes: `escapeHtml(achievement.title)`. ✅
- React escapes all interpolated values by default. `accentColor` is always a catalogue hex or a DB copy of one. ✅

### 17.6 Rate limiting and abuse

❌ **None.** `POST /api/achievements/unlock` is an **unauthenticated-costly** endpoint: any authenticated client can call it in a loop. Each call costs 1 query when everything is owned, but **14 queries** when anything remains unowned, and `buildWorldState` includes several **unbounded** reads. There is no idempotency key, no debounce, and no per-user rate limit on any route. §24 F31.

⚠ **Phase 1 made this marginally worse.** `findCompletedSessionStarts` returns *every* completed session's `startedAt`, unbounded, on every evaluation — a heavier query than the `count()` it replaced. §24 **F35.**

### 17.7 Privacy

Achievements are private by default (`isPublic` never set true). The `GET` endpoints return only the caller's rows. The `level` column and the `metadata` JSON are never rendered raw. ✅

---

## 18. Performance

### 18.1 The page's own cost

| Cost | Number | Notes |
| ---- | ------ | ----- |
| HTTP requests on mount | **2** | `page.tsx:148`, `:169` |
| …plus 1 from the toast | **3** | `AchievementPopup`'s fallback fires because `CelebrationHost` passes `null` whenever the store queue is empty. On **every** dashboard page |
| Queries for `/api/achievements` | **2** | `recentUnlocked` + `findUnlocked` — the same rows twice, the second purely for `.length` |
| Queries for `/api/achievements/next` | **13** | §5.3 |
| Queries for `/api/achievements/showcase` | **14** | one snapshot for both halves, vs 27 if the page used two endpoints |
| Rows materialised by `/next` | ≤ 20 | the `count=100` cap is inert (§8.1) |
| Client `useMemo` work | 2 passes over `rows` | `:182`–`:233`, `:237`–`:286` |
| Bundle | 452-line page + 5 components + 3 pure modules | All client-side; the catalogue (412 lines) and the pure layer ship to the browser |
| Caching | **none** | No `revalidate`, no SWR/React Query, no `unstable_cache` |

### 18.2 The query problems worth naming

**(a) `listRecent` fetches every row twice.** `recentUnlocked` takes 50 and `findUnlocked` takes all, then `.length`. §24 F18/F32.

**(b) Several aggregates are unbounded while others are windowed to 730 days.** `countAllCompletedLogs`, `getStats`, `countMoodLogs`, `countEnergyLogs`, `getStreakData` — and now `findCompletedSessionStarts` — take no range. These are cheap per row in Postgres, but they scan the user's entire history on every evaluation and every `/next` request, and `getStreakData`'s array is shipped over the wire and then only `.length`'d. §24 F10/F33/F35.

The 730-day window is a deliberate optimisation documented in the service: the longest criteria is a 365-consecutive-day run, so capping at two years changes no reachable result. The same reasoning does **not** extend to the unbounded calls.

### 18.3 What Phase 1 preserved

- The owned-set read stays **before** `buildWorldState` with a bail-out (`service.ts:516`–`:525`) — the biggest single win, turning the common case from 14 queries into 1.
- The 730-day aggregate/column-only queries are untouched.
- `includeActiveDates: false` still lets the read paths skip the per-day list.
- `getTodayString(tz)` and the timezone-correct late-evening boundary are preserved and now correct for Night Owl too.

### 18.4 Still on the hot path

`checkForUnlocks` runs on **every habit log** and twice per goal completion, plus once per client action. Until every definition is owned, each is 14 queries. For a typical user who will own maybe 8 of 20, **that is 14 queries per habit tap, forever.** The bail-out only helps users who have completed the catalogue.

The correct fix is not to make the query cheaper; it is to evaluate only the definitions whose criteria could have changed. A habit log can only affect `streak`, `perfectDays`, `perfectDayStreak`, `perfectWeekStreak`, `daysActive`, `totalHabitLogs` and `dailyScore`. There is also no debounce. §24 F31.

---

## 19. External integrations

| Integration | Present? | Detail |
| ----------- | -------- | ------ |
| **Neon / Postgres** | ✅ | `@/lib/prisma` via `DATABASE_URL`; all 14 models in §6.3 |
| **In-app notifications** | ✅ | `notifyAchievement` writes a `NotificationLog` with `type: ACHIEVEMENT_UNLOCKED`, `relatedEntityId`, and `actionUrl: /achievements/${id}`. **Phase 1: now written at most once per badge**, since the loser of a race skips it (`service.ts:555`) |
| **Email** | ⚠ written, never called | `email.service.ts:391` + `emails/achievement-unlocked.tsx`. **Zero callers** (§24 F29) |
| **Push notifications** | ❌ | `push.service.ts:77` mentions `/api/achievements/celebrate` only in a comment |
| **AI services** | ❌ | `src/server/ai` is not touched. Descriptions are static |
| **External analytics / telemetry** | ❌ | No error reporting, metrics or tracing. The `/next` failure swallow is unobservable |
| **Calendar / iCal** | ❌ | Not referenced |

🔴 **Both outbound links are still broken.** `notification.service.ts` and `email.service.ts` construct `/achievements/${achievementId}`. There is **no `[id]` route**. Every achievement notification's click-through and every achievement email's button lands on a 404. §24 F7.

⚠ **Phase 1 made `definitionId` available, which is exactly what an `[id]` route needs.** The page-level detail route is now cheap to build: the row carries the catalogue id, so `achievementId → definitionId → definition` resolves without a title match.

---

## 20. Background jobs / cron effects

**None. There is no scheduled achievement evaluation anywhere.**

`vercel.json` declares two crons. `/api/cron/compute-daily-scores` backfills `DailyScore`, which is the source of `perfectDays`, `perfectDayStreak` and `perfectWeekStreak` — so a user who has never had scores computed cannot earn any of the four `perfect-*` badges regardless of behaviour. `/api/cron/generate-insights` is a stub.

Neither cron touches `Achievement`. Consequences:

- **Achievements are entirely event-driven.** A user who completes a perfect day without logging a habit that day gets no check.
- **Bulk/imported data never triggers evaluation.** Seeding, CSV imports and backup restores write habits/goals/scores without firing the trigger.
- **There is still no reconciliation job.** Phase 1 added a **manual** script (`scripts/reconcile-achievements.ts`) but nothing schedules it.

---

## 21. Data flow diagrams

### 21.1 Earn → persist → notify (the write path, after Phase 1)

```
   user action                    server                         database
       │                             │                               │
       ├─ habit log ──────────────►  │                               │
       │    habit.service:386        │                               │
       │    (fire-and-forget .catch) │                               │
       │                             ├─ Achievement.findByUserId ───► │
       │                             │◄── owned rows                 │
       │                             │   all 20 owned? → return []   │
       │                             ├─ buildWorldState ────────────► │  14 queries
       │                             │◄── { worldState, today, tz }  │  across 12 repos
       │                             ├─ evaluateUnlocks (PURE)       │
       │                             │   checkDefinition(def, state, │
       │                             │                      today)    │
       │                             │   && !hasUnlocked(id)          │
       │                             ├─ createForDefinition ────────► │  upsert on
       │                             │   findUnique(userId_          │  userId_
       │                             │            definitionId)      │  definitionId
       │                             │   ├─ hit  → created:false ────┼─► skip notify+audit
       │                             │   └─ miss → create            │
       │                             │             │                  │
       │                             │   ⚠ P2002 (lost race)         │
       │                             │     → re-read, created:false  │
       │                             ├─ notifyAchievement ─────────► │  NotificationLog
       │                             │   actionUrl /achievements/:id │  ⚠ 404
       │                             ├─ createActivity ────────────► │  ActivityLog
       │                             │◄── UnlockEvent[]               │
       │◄── (nothing — fire-and-forget, errors swallowed)             │
       │                                                                  │
       ├─ AND, in parallel:                                               │
       │    store.runAchievementCheck() ── POST /api/achievements/unlock │
       │      → the same 14 queries, concurrently, no lock               │
       │      → but the unique index makes the WRITE safe                │
       │      → pushEvents ─► store.events ─► CelebrationHost            │
       │                                ─► AchievementPopup (8s toast)   │
       └──────────────────────────────────────────────────────────────────┘
              ⇒ up to 4 concurrent evaluations
                ⇒ ONE row, ONE notification, ONE audit row  ✅
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
             ├─ ownedSet = definitionIdOf(column→metadata)    │
             ├─ unowned = catalogue − ownedSet                │
             ├─ buildWorldState(includeActiveDates:false) ► DB│ 13
             ├─ resolveDefinitionProgress(def, state, today)   │
             ├─ sort byClosestFirst → slice                   │
           ← NextUpRow[] (≤ 20)                               │
             ⇒ nextUp ──► locked tiles gain progress bars     │
                          ⚠ failure swallowed, no error state  ┘

  render
    ├─ achievements = earned.map(by definitionId) ++ locked.map(by id)  :182–233
    │    ✅ ONE join key: definitionIdOf(row) at :190 and :212
    ├─ totalXp = Σ ACHIEVEMENT_XP[xpForRow(row).rarity]                 :255
    │    ✅ xpForRow → rarityOfRow → definitionId ?? name ?? COMMON     :240
    ├─ levelInfo = computeTrophyLevel(totalXp)                          :282
    ├─ rarityCounts = tally by the same xpForRow rarity                 :257–266
    │    ✅ grid, history, chips and total can no longer disagree
    └─ history = group by localDateKey(unlockedAt), sort desc           :268–278
         ⚠ localDateKey uses the BROWSER timezone, no tz option         :99–108
           while the service buckets by the USER's stored timezone
```

### 21.3 The rarity resolution path, after Phase 1

```
              ACHIEVEMENT_DEFINITIONS  (constants/achievements.ts)
                            │  keyed by id
              ┌─────────────┴─────────────┐
              │ getAchievementById        │ getAchievementByName
              ▼                           ▼
      definitionIdOf(row)          legacy rows only
        1. row.definitionId  ← canonical (schema.prisma:2328)
        2. row.metadata       ← legacy JSON
        3. null                        │
              │                        │
              └──────────┬─────────────┘
                         ▼
                  rarityOfRow (xp.ts:126)
                         │  undefined ⇒
                         ▼
              UNKNOWN_ACHIEVEMENT_RARITY ('COMMON')
                         │  a STATED default
                         ▼
              xpForRow(row) → { xp, rarity }
                         │
        ┌────────────────┼────────────────┐
        ▼                ▼                ▼
   grid card        history row     header chips
   + totalXp:282    +xp chip :432   :371–377

   ⚠ row.level is NEVER consulted — it is a threshold, not a tier.
```

---

## 22. File-by-file dependency inventory

### 22.1 Direct — the route and its components

| File | Lines | Directive | Role | Notes |
| ---- | ----- | --------- | ---- | ----- |
| `src/app/(dashboard)/achievements/page.tsx` | **452 / 421** | `'use client'` | the route | 2 fetches, 2 memos, 3 sections; 🆕 joins on `definitionId` |
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
| `src/app/api/achievements/showcase/route.ts` | — | 🆕 `GET` both halves from one snapshot | **not yet used by the page** |
| `src/app/api/achievements/unlock/route.ts` | 35 | `POST` evaluate | no body, no rate limit (F31) |
| `src/app/api/achievements/celebrate/route.ts` | 56 | `POST` celebrate | still unreachable from the UI (F5) |
| `src/schemas/achievement.schema.ts` | 17 | celebrate validation | `.refine` is correct |
| `src/server/services/achievement.service.ts` | **658 / 608** | all business logic | `buildWorldState` at `:128`; 🆕 `getShowcase`, `resolveDefinitionProgress`, `byClosestFirst` |
| `src/server/repositories/achievement.repository.ts` | **244 / 231** | the only DB access for `Achievement` | 🆕 `createForDefinition`, `markCelebrated`, `findDuplicateDefinitionGroups`; `findUnlocked` still dupes `findByUserId` (F18) |

### 22.3 Direct — the pure layer

| File | Lines | Role | Notes |
| ---- | ----- | ---- | ----- |
| `src/lib/constants/achievements.ts` | **412 / 390** | catalogue, rarities, categories, chip helpers | 🆕 run-shaped criteria (§7.1) |
| `src/lib/achievements/definitions.ts` | **107 / 99** | `allDefinitions`, `getAchievementById`, 🆕 `getAchievementByName` (`:79`) | re-export shim |
| `src/lib/achievements/checker.ts` | **257 / 238** | `resolveCriterionValue`, `checkCriteria`, `checkDefinition` | ✅ **honours `timeframe`**; `checkSnapshots` + streak fallbacks still dead (F9) |
| `src/lib/achievements/timeframes.ts` 🆕 | **241 / 222** | window / run / local-hour rules | Prisma-free and server-free ⇒ client-safe **and** unit-testable |
| `src/lib/achievements/metadata.ts` 🆕 | **48 / 46** | `definitionIdOf` — the one join rule | ditto |
| `src/lib/achievements/unlock-logic.ts` | **136 / 125** | `evaluateUnlocks` (`:37`, now takes `today`), `buildUnlockEvent` | `canCelebrate` dead |
| `src/lib/achievements/xp.ts` | **167 / 150** | the XP engine | ✅ **fixed** (§7.2); `xpOfTitle` still dead |
| `src/config/scoring.ts` | 272 | `THRESHOLDS.achievements.perfectDay = 95` | shared with scoring |

### 22.4 Indirect — repositories and models read by the snapshot

| Repository | Methods used | Models |
| ---------- | ------------ | ------ |
| `user.repository.ts` | `getSettings` | `User`, `UserSettings` |
| `streak.repository.ts` | `findByUserId`, `getUncelebratedMilestones`, `findMilestoneById`, `celebrateMilestone` | `Streak`, `StreakMilestone` |
| `goal.repository.ts` | `findAll` (**unbounded**) | `Goal` |
| `score.repository.ts` | `findPerfectDayDates`, `countActiveDays`, `findActiveDayDates`, `findByDate` | `DailyScore` |
| `sleep.repository.ts` | `countEarlyWakeups` | `SleepLog` |
| `focus.repository.ts` | 🆕 `findCompletedSessionStarts` (**unbounded**), `getStats` (**unbounded**) | `FocusSession` |
| `habit.repository.ts` | `countAllCompletedLogs` (**unbounded**) | `HabitLog` |
| `mood.repository.ts` | `countMoodLogs`, `countEnergyLogs` (**unbounded**) | `MoodLog`, `EnergyLog` |
| `journal.repository.ts` | `getStreakData` (**unbounded, result unused**) | `JournalEntry` |
| `audit.repository.ts` | `createActivity` | `ActivityLog` |
| `base.repository.ts` | 🆕 `isUniqueConstraintError` (`:90`), `buildPaginationQuery` | — |
| `notification.service.ts` | `notifyAchievement` | `NotificationLog` |

### 22.5 Indirect — UI and types

| File | Lines | Relationship |
| ---- | ----- | ------------ |
| `src/lib/api-client.ts` | 131 | unwraps `{success,data}`, throws `ApiError` |
| `src/components/ui/{Card,Badge,EmptyState,Spinner}.tsx` | 26 / 24 / 52 / 14 | presentation |
| `src/components/today/ui.tsx` | 402 | `Stagger` at `:303`, 4 uses |
| `src/store/achievement.store.ts` | 102 | `runAchievementCheck`, the event queue |
| `src/app/(dashboard)/layout.tsx` | — | mounts `CelebrationHost` |
| `src/components/dashboard/AchievementsStrip.tsx` | 337 | same 2 endpoints, different presentation |
| `src/components/analytics/AchievementsStrip.tsx` | 51 | **duplicate component name** (F27) |
| `src/components/dashboard/DashboardWidgets.tsx` | — | strip toggle |
| `src/emails/achievement-unlocked.tsx` | 119 | template, **never sent** (F29) |
| `src/types/analytics.ts` | 264 | `AnalyticsAchievement` for the analytics strip |
| `src/types/achievements.ts` | **575** | 🔴 **zero importers**, `:11` Prisma value import (F19) |
| `scripts/reconcile-achievements.ts` 🆕 | **169 / 149** | dry-run-by-default duplicate reconciliation |

### 22.6 🔴 Dead file — `src/types/achievements.ts` (575 lines)

Imported by **nothing** in the repo. Its `:11` imports `AchievementType` **as a value** from `@/generated/prisma` (the 679 KB Node entry), which would pull Prisma into a browser bundle the moment a `'use client'` file imported it; the type-only import at `:8` next to it is the correct pattern. It also models `CreateAchievementInput.userId` as **required** — the opposite of `FILE.MD`'s rule and of what all five routes do. §24 F19.

⚠ **Phase 1 makes this file more dangerous, not less.** The correct pattern is now demonstrated three times over — `metadata.ts` (48 lines, no Prisma import, safe in `'use client'` *and* in `tests/`) does in miniature what this 575-line file tries to do. Delete it.

---

## 23. Current behavior summary

**What the page does, end to end.** Loads two things in parallel: the caller's earned `Achievement` rows, and — for every definition they do *not* own — a progress figure recomputed from a 13-query snapshot of their history. Renders a trophy level derived from XP that is now derived from a rarity lookup that **always resolves**, five rarity chips from the same lookup, a 20-tile grid, and a day-grouped history. Filtering is client-side and resets on navigation.

**How badges get earned.** Only as a side effect of an interactive write, through `checkForUnlocks`, which fires from three server sites and three client sites, often several at once for a single action. There is no cron and no bulk path.

**What changed, in one paragraph.** Before Phase 1, four things were broken in a way a user could see: rarity resolved by display name against an id-keyed registry (14 of 20 badges wrong, and the page contradicted itself on one screen); Night Owl was mathematically unreachable; four badges promised consecutiveness the code never checked; and `celebrated` was never written. All four are now fixed in code, each with a documented reason and a single shared code path so they cannot drift apart again. The catalogue's run-shaped criteria now use monotonic best-ever runs, XP/rarity resolve through `definitionId` with an explicit fallback, unlocks are idempotent under concurrency via a real unique index, and celebration persists owner-scoped.

**What is genuinely solid, before and after.** The owned-set bail-out, the 730-day window, the aggregate-only reads, the `includeActiveDates` opt-out, timezone-correct date handling, the deliberate `null` for "unmeasurable", closest-first ordering with unmeasurable badges last, the clean client/server boundary, and ownership-scoped queries everywhere. Phase 1 preserved all of it.

**What is still wrong.** The unique index is in the schema but **not in the database**, so `checkForUnlocks` will throw at runtime until it is pushed. The `perfectDayDates` series is loaded and never read. `night-owl` is now correct but does an unbounded read to achieve it. The achievement email pipeline is written and never called. `level` still stores a threshold. Both notification and email deep-links 404. Nothing calls the celebrate endpoint. `totals.streak` is still one global `currentStreak`. A 575-line type file with a Prisma value import has zero importers. **And not one of the pure evaluation functions has a test**, though `tests/` proves the pattern works for `routine-duration` and `score-calculator`. **And `npm run type-check` has not been run to completion** — it exhausted the Node heap, and the retry was aborted.

---

## 24. Findings register

Severity: 🔴 **critical** · 🟠 **major** · 🟡 **minor**. Status: ✅ **fixed** · 🟡 **partial** · ⬜ **open**.

| ID | Sev | Status | Finding | Resolution |
| -- | --- | ------ | ------- | ---------- |
| **F1** | 🔴 | ✅ | `rarityOfTitle` looked a display **name** up in an **id**-keyed registry → `undefined` for all 20; the fallback clamped the **threshold** into the rarity ladder, saturating at `LEGENDARY`. **14 of 20 badges showed the wrong tier and the wrong XP**, the history contradicted the grid, and `totalXp`/trophy level were wrong. | `Achievement.definitionId` promoted to a column; `definitionIdOf` (column → metadata) + `rarityOfRow` (id → name → undefined) + `UNKNOWN_ACHIEVEMENT_RARITY`; the page joins on the id. **`level` is never read as a tier.** §7.2 |
| **F2** | 🔴 | ✅ | `lateEvenings` counted completed sessions with `startedAt >= today 20:00` and no lower bound — a count of *this evening*. `night-owl` needs **20**. Unreachable. | `findCompletedSessionStarts` (all-time, `completedAt not null`, `abortedAt null`) + `isLateEvening(instant, tz)` per session. §26 |
| **F3** | 🔴 | ✅ | `checkCriteria` never read `criterion.timeframe`, so `DAY`/`WEEK`/`MONTH`/`YEAR` all meant all-time. `perfect-week` unlocked on 7 scattered days. | `resolveCriterionValue(field, state, timeframe, today)`; `timeframes.ts` defines trailing windows and **fails closed** when a window cannot be placed. Run-shaped criteria converted to monotonic lifetime runs. §27 |
| **F4** | 🔴 | ✅ | `Achievement.celebrated` was **never written** — `celebrateAchievement` wrote an audit row and returned. The milestone half of the same endpoint *did* work. | `markCelebrated(userId, id)` — owner-scoped `updateMany`, read-back, `null` → 404. §6.1 |
| **F5** | 🟠 | ⬜ | `POST /api/achievements/celebrate` is fully implemented, authenticated, audited — and called by **nothing**. | Still open. Now the only thing between a fixed column and a working "new badge" indicator. Wire it to the toast dismiss. |
| **F6** | 🟠 | 🟡 | `level` stores `criteria[0].value` — a **threshold** — under a comment reading "for tiered achievements", and was read *as* a tier. | The tier reading is gone (§7.2). The column **still stores a threshold** and `AchievementPopup` still renders "Level N". Rename the column or stop writing a threshold. |
| **F7** | 🔴 | ⬜ | Every notification and email links to `/achievements/${id}`. **No `[id]` route exists.** All such links 404. | Still open — but `definitionId` now exists on the row, so the route is cheap to build. |
| **F8** | 🟠 | ⬜ | `totals.streak` is the single `Streak.currentStreak` (the model is `userId @unique`), yet `resolveStreakValue`'s doc describes "longest **per-habit** streak" and its branches are unreachable. | Still open. Either supply `streaks` per habit, or fix the comment. |
| **F9** | 🟡 | 🟡 | Dead exports in the pure layer, each carrying an `@example` suggesting callers exist. | Partly reduced: `rarityOfTitle`/`xpOfTitle` collapsed. **Still dead:** `checkSnapshots`, `canCelebrate`, `xpOfTitle`, `definitionsByCategory`/`ByRarity`, 5 `constants` helpers, `createMany`, `isUnlocked`, `findDuplicateDefinitionGroups`, `perfectWeeks` in `TOTAL_FIELDS`. |
| **F10** | 🟠 | ⬜ | `getStreakData` — an **unbounded** `findMany` returning every distinct journal date — fills `totals.journalEntries`, which no definition references. | Still open. Delete the query and the total, or replace with a `count()`. |
| **F11** | 🔴 | 🟡 | **No unique constraint on `Achievement`.** Four independent callers could race and write duplicate rows, inflating every count on the page. | Schema now has `@@unique([userId, definitionId])` and `createForDefinition` upserts on it. 🔴 **But the index is not in the database** — `db:push` has not run. §29 |
| **F12** | 🟠 | ✅ | The page joined earned rows by **`title`** while `nextUp` was keyed by **`id`** with a name fallback — two keys for one join. A rename duplicated a badge. | One key: `unlockedByDefinition` keyed by `definitionIdOf(row)`. §4.1 |
| **F13** | 🟠 | ⬜ | `offset` is validated, echoed in `meta`, and **never forwarded** to a query. | Still open. Thread it into `recentUnlocked`. |
| **F14** | 🟡 | ⬜ | `ProgressBar.COLOR_CLASSES` (14 entries) is unreachable; `bg-blue-600` always renders. | Still open. |
| **F15** | 🟠 | ⬜ | Hardcoded light-mode greys in `AchievementList`'s filter bar and `ProgressBar`'s track. None invert. | Still open. |
| **F16** | 🟡 | ⬜ | `parseProgress(row.metadata)` looks for `current`/`target` keys the service never writes, so an **earned** tile can never render a progress bar. | Still open. Drop `parseProgress`, or write progress at unlock time. |
| **F17** | 🟠 | ⬜ | `localDateKey`/`formatUnlockTime` use no `timeZone` option, so grouping follows the **browser's** zone while the service buckets by the user's **stored** zone. | Still open. Pass the user's timezone, or group server-side. |
| **F18** | 🟡 | ⬜ | `findUnlocked` is byte-identical to `findByUserId`; both are called by `listRecent`, so the same rows are fetched twice, one unbounded, purely for `.length`. | Still open. Replace with `count()`. |
| **F19** | 🟠 | ⬜ | `src/types/achievements.ts` — **575 lines, zero importers**, with a Prisma **value** import at `:11`. | Still open, and more dangerous now that the correct pattern exists in `metadata.ts`. §22.6 |
| **F20** | 🟡 | ⬜ | The `Achievement`, `NotificationLog` and `ActivityLog` inserts are three separate awaited writes in a `for…of` with no transaction. | Still open. The race is now closed; the partial-failure window is not. |
| **F21** | 🟠 | ⬜ | "Every definition has exactly one criterion" is assumed in two places but **enforced nowhere**. | Still open. Validate at module load. |
| **F22** | 🟡 | ⬜ | Stale comments claim the catalogue has **12** definitions; it has **20** — in `next/route.ts:22` **and** `page.tsx:167`. | Still open. |
| **F23** | 🟡 | ⬜ | `AchievementPopup` keeps a local queue while `CelebrationHost` keeps a store queue; dismissing pops only the local head. | Still open. |
| **F24** | 🟠 | ✅ | Catalogue edits did not retro-apply: the row stored a denormalised `title` and the page joined on it, so a rename made a badge appear **twice**. | Fixed by the same id join as F12. Residual: history rows still show the *old* display strings for pre-existing rows (cosmetic). |
| **F25** | 🟡 | ⬜ | `celebrate/route.ts` maps a 404 by string-matching `error.message.endsWith('not found')`. | Still open. Use a typed error class. |
| **F26** | 🟠 | 🟡 | Duplicates were **unremovable**: no `DELETE` route, no repository delete method, only user cascade. | Mitigated: `scripts/reconcile-achievements.ts` merges by `(userId, definitionId)`, dry-run by default; `findDuplicateDefinitionGroups` reports. No user-facing delete — correctly. |
| **F27** | 🟡 | ⬜ | Two different components are both named `AchievementsStrip`. | Still open. |
| **F28** | 🟠 | ✅ | `@@unique([userId, type, level])` would be **wrong**, because `level` stores a threshold. Documented so the mistake is not repeated. | Avoided: the index is on `definitionId`. |
| **F29** | 🟠 | ⬜ | The whole achievement **email** pipeline exists and is never used. | Still open. Call it, or delete the dead surface. |
| **F30** | 🟠 | ⬜ | **No tests touch this domain.** All the critical defects live in pure, dependency-free functions. | **Still open and now the highest-value gap.** `tests/` has 20 files; none imports `checker.ts`, `unlock-logic.ts`, `xp.ts`, `timeframes.ts` or `metadata.ts`. `timeframes.ts` and `metadata.ts` were written Prisma-free *specifically* so they are testable with no `DATABASE_URL`. |
| **F31** | 🟠 | ⬜ | **No rate limiting** on any route; `/unlock` costs 14 queries whenever anything is unowned, and fires on every habit log with no debounce. | Still open. |
| **F32** | 🟡 | ⬜ | `listRecent` materialises every owned row twice and returns a `meta.total` the page **discards**. | Still open. |
| **F33** | 🟡 | ⬜ | Several snapshot aggregates are **unbounded** while others are capped at 730 days — including definitions that declare `ALL_TIME`. | Still open. `early-riser` is the visible case: a user with 10 early wake-ups over three years still cannot earn it. |
| **F34** | 🟠 | 🆕 ⬜ | **`dates.perfectDayDates` is never read.** The service publishes it at `service.ts:259`, but `resolveCriterionValue` looks up `dates[`${field}Dates`]` — i.e. `perfectDaysDates` for `field: 'perfectDays'`. Nothing matches, so a 730-day array is built, returned and consumed by no one. It also means **no catalogue definition currently exercises the dated-series path**, so the trailing-window code is correct-by-construction but untested in production. | Rename the key to `perfectDaysDates`, or change the resolver's convention. |
| **F35** | 🟠 | 🆕 ⬜ | **`night-owl`'s fix introduced an unbounded read.** `findCompletedSessionStarts` returns *every* completed session's `startedAt` with no range, and filters in JavaScript — replacing a cheap `count()`. Correct semantics bought with O(all sessions) memory on every evaluation and every `/next` request. | Add a stored `startedHour`, or a range predicate, or filter in SQL. |
| **F36** | 🔴 | 🆕 ⬜ | **The schema is ahead of the database.** `db:push` has not run, so `createForDefinition`'s `findUnique({ where: { userId_definitionId } })` will throw at runtime, and the unique index cannot be created until duplicates are merged — while the reconcile script needs the column to exist first. | Staged runbook in §29. **This is the one blocking item.** |
| **F37** | 🟠 | 🆕 ⬜ | **Phase 1 is unverified.** `tsc --noEmit` died with `Fatal process out of memory: Zone`; the `--max-old-space-size=8192` retry was aborted. `lint` and `test` have not run. | Run all three. The pure modules are the cheapest place to start. |

**Count: 37 findings — 7 critical, 19 major, 11 minor. By status: 7 fixed, 4 partial, 26 open (4 of them new).**

---

## 25. `perfectWeeks` counted non-consecutive weeks — RESOLVED

**The original defect:** `consistency-king` — *"Record 4 perfect weeks in a row"* — gated on `perfectWeeks >= 4`, where `perfectWeeks` was a count of weeks containing ≥ 7 perfect days, with no adjacency requirement. A user with perfect weeks in January, April, July and October earned it.

**The fix has two halves.**

**Half 1 — runs are now detected, not counted.** `timeframes.ts` gained three pure functions:

```
longestConsecutiveRun(dates)    → number  longest run of consecutive days     timeframes.ts:127–145
perfectWeekStarts(dates)        → Set<monday>  weeks with all 7 days present  timeframes.ts:190–203
countPerfectWeeks(dates)        → number  (kept, now correct-by-construction) timeframes.ts:185–187
longestPerfectWeekStreak(dates) → number  consecutive perfect weeks          timeframes.ts:212–214
```

`longestPerfectWeekStreak` is literally `longestConsecutiveRun([...perfectWeekStarts(dates)])` — compose the week set, then reuse the day-run algorithm. Both are one pass over a sorted, de-duplicated array.

**Half 2 — the service and the catalogue use them.** `buildWorldState` computes two new lifetime totals from the `perfectDayDates` array it already loads (`service.ts:231`–`:232`):

```
perfectDayStreak  = longestConsecutiveRun(perfectDayDates)
perfectWeekStreak = longestPerfectWeekStreak(perfectDayDates)
```

and `consistency-king` now gates on `perfectWeekStreak >= 4`. The **same two totals also fixed `perfect-week`, `perfect-month` and `perfect-year`**, which had the identical non-adjacency bug. §7.1.

⚠ **Both totals are monotonic by construction**, which is the deliberate design choice: they never decrease as history grows. That is what makes them safe to unlock against — a trailing-window count would retract an earned badge the moment a day was missed. `calculateCurrentStreak` in the streak domain is the wrong tool for this and is not used: it deliberately treats "today not yet logged" as non-breaking, which is correct for a *current* streak and wrong for a lifetime best. That reasoning is written into `timeframes.ts` so it is not undone.

⚠ `perfectWeeks` itself is now **dead**: no definition uses the field, and `buildWorldState` no longer returns it (it is still declared in `AchievementWorldState.totals` and still listed in `TOTAL_FIELDS`). §24 F9.

---

## 26. `lateEvenings` semantics — Night Owl was unreachable — RESOLVED

**The original defect:**

```
constants/achievements.ts   night-owl: lateEvenings >= 20, timeframe 'ALL_TIME'
achievement.service.ts      countCompletedSessions(userId, fromZonedTime(`${today}T20:00:00`, tz))
focus.repository.ts         where: { userId, completedAt: { not: null }, startedAt: { gte: startedAfter } }
```

`startedAfter` was the **only** bound, and it was 20:00 *tonight*. So the query counted the sessions finished since 8pm this evening, and the counter reset to 0 at local midnight. `night-owl` requires 20. **The badge could never be unlocked, at any streak, by any user, on any plan.**

**The fix, in three parts.**

**1. The predicate is now all-time.** `FocusRepository.findCompletedSessionStarts` (`focus.repository.ts:581`–`:591`) selects only `startedAt`, for `completedAt != null` **and** `type IN FOCUS_TIME_TYPES`, with **no date range**. Breaks are excluded — `SHORT_BREAK` / `LONG_BREAK` / `STOPWATCH` are not late-evening *focus* sessions, and this is the same break-exclusion every other focus aggregate applies. (The repository's own doc comment records the other half of the reason: neither `count` nor a `where` clause can express a *local clock hour* test, because the column is UTC and Postgres' `EXTRACT(HOUR …)` would read it as UTC regardless of what the user set.)

**2. The hour is evaluated per session, in the user's timezone.** `timeframes.ts` adds the rule and the constant:

```
LATE_EVENING_START_HOUR = 20                                    timeframes.ts:221
isLateEvening(instant, timezone, fromHour = 20)                 timeframes.ts:235–241
  → toZonedTime(instant, timezone).getHours() >= fromHour
```

The service counts `sessionStarts.filter(startedAt => isLateEvening(startedAt, timezone)).length` (`service.ts:218`–`:220`). This is the **right** shape and the **right** zone: `startedAt` is stored UTC, and a fixed `T20:00:00.000Z` boundary is precisely the bug that predates this one — for `Asia/Tokyo`, 20:00 UTC is 05:00 the next morning local.

**3. `LATE_EVENING_START_HOUR` is exported rather than inlined**, so the threshold is one named constant rather than a literal repeated across the catalogue, the service and the test that should exist.

```ts
isLateEvening(new Date('2026-09-10T12:00:00Z'), 'UTC')       // => false (12:00 local)
isLateEvening(new Date('2026-09-10T12:00:00Z'), 'Asia/Tokyo') // => true  (21:00 local)
```

⚠ **The honest cost.** "All-time, filtered in JavaScript" means loading every completed session's `startedAt` into memory on every evaluation. That is strictly more expensive than the `count()` it replaced, and it is unbounded. It is the correct *semantics* bought with a real cost. §24 **F35** — the fix is a stored `startedHour` column, or a SQL range predicate.

⚠ The description says "**productive** late-evening sessions". The predicate is `completedAt != null`, which is the app's definition of productive/completed. Reasonable, but it is an interpretation.

---

## 27. `timeframe` was decorative — RESOLVED

**The original defect, verbatim:**

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
    …
      const current = resolveCriterionValue(criterion.field, state);   // ← timeframe never read
```

`criterion.timeframe` was never referenced anywhere. The evaluation function received a scalar and a comparator and **had no way to honour a timeframe even in principle**.

**The fix has three parts.**

**1. `timeframes.ts` defines the vocabulary.** A window is *trailing*, not calendar-aligned:

| timeframe | window |
| --------- | ------ |
| `DAY` | the user's current calendar day |
| `WEEK` | the 7 days ending today |
| `MONTH` | the 30 days ending today |
| `YEAR` | the 365 days ending today |
| `ALL_TIME` | unbounded |

Calendar alignment was rejected on purpose, and the reasoning is in the module header: a calendar-aligned week means "Perfect Week" is unreachable until Sunday, and a calendar-aligned month means "Perfect Month" is unreachable until the 31st. **An achievement nobody can earn is worse than an imprecise one.** Trailing windows are also what "the last 7 days were perfect" means to a person.

**2. `checker.ts` threads `timeframe` and `today`, and fails closed.**

```
resolveCriterionValue(field, state, timeframe?, today?)          :120–148
  1. state.dates[`${field}Dates`] exists → count it inside the window
  2. totals → counts → derived streak
  3. windowed timeframe AND today === undefined → undefined      :130
```

Line 130 is the important one. A **windowed criterion with no dated series, or no reference day, returns `undefined` — not a lifetime fallback.** Substituting a lifetime count for a windowed criterion is exactly what let "Perfect Week" unlock on seven scattered days, so the resolver refuses to guess. `undefined` is already rendered as `null` → "not tracked" by the existing UI, so this needed no rendering change.

`checkCriteria`, `checkDefinition`, `checkSnapshots` and `evaluateUnlocks` all gained an optional `today`, and `buildWorldState` now **returns** `{ worldState, today, timezone }` so one settings read serves the whole request rather than risking a midnight boundary mid-flight.

**3. The catalogue stopped depending on rolling windows** (§7.1). Because `resolveCriterionValue` is the single place that interprets `timeframe`, and because all five milestone criteria now resolve against monotonic lifetime runs, **no definition in the current catalogue uses a trailing window.** That is a deliberate choice — a rolling target cannot be reliably unlocked given that evaluation only fires on user actions — and it is documented in `timeframes.ts`.

⚠ **The consequence, stated plainly:** the trailing-window code path is correct and independently testable, but **no production criterion currently exercises it**, and the one dated series the service publishes (`perfectDayDates`) is not even read because of the key mismatch in §24 F34. The windowed semantics are therefore best described as **implemented and unit-testable, but not yet load-bearing**.

### 27.1 ⚠ `early-riser` is still mis-scoped — the honest loose end

`early-riser` declares `timeframe: 'ALL_TIME'` and requires 10 wake-ups before 06:00. Its value comes from `countEarlyWakeups(userId, today−730, today, '06:00')` — capped at 730 days. **A user with 10 early wake-ups spread over three years cannot earn it.** `timeframe` being honoured does not fix this, because the *query* is windowed independently of the criterion: `resolveCriterionValue` reads the aggregate it is given, and the service decides the query's range. The remaining fix is to derive the query range from the widest `ALL_TIME` criterion, or to make `early-riser`'s scope explicit. §24 F33.

The same applies to `milestone-days-30` (harmless at n=30) and, in the other direction, `totalHabitLogs` and `focusStats` are genuinely unbounded — so the catalogue currently mixes windowed and unbounded aggregates under the same `ALL_TIME` label.

---

## 28. Phase 1 remediation — what changed

Every file touched, and why. Line counts are physical / non-blank, before → after.

| File | Before | After | Change |
| ---- | ------ | ----- | ------ |
| `prisma/schema.prisma` | — | — | `Achievement.definitionId String?` + `@@unique([userId, definitionId], map: "userId_definitionId")`, with a 12-line doc comment explaining why nullable |
| `src/lib/achievements/timeframes.ts` | — | **241 / 222** | 🆕 trailing windows, consecutive runs, perfect-week runs, `isLateEvening`, `LATE_EVENING_START_HOUR` |
| `src/lib/achievements/metadata.ts` | — | **48 / 46** | 🆕 `definitionIdOf` — column first, metadata fallback, `null` for custom rows |
| `src/lib/achievements/checker.ts` | 210 | **257 / 238** | `timeframe` + `today` plumbing; `perfectDayStreak`/`perfectWeekStreak` totals; fail-closed windowed resolution |
| `src/lib/achievements/xp.ts` | 143 | **167 / 150** | `rarityOfDefinitionId`, `rarityOfRow`, `UNKNOWN_ACHIEVEMENT_RARITY`; `level` no longer read as a tier |
| `src/lib/achievements/definitions.ts` | 93 | **107 / 99** | `getAchievementByName` — the legacy-row fallback |
| `src/lib/achievements/unlock-logic.ts` | 135 | **136 / 125** | `evaluateUnlocks` takes `today` |
| `src/lib/constants/achievements.ts` | 400 | **412 / 390** | five criteria rewritten to run-shaped lifetime claims + corrected descriptions |
| `src/server/services/achievement.service.ts` | 429 | **658 / 608** | `buildWorldState` returns `{worldState, today, timezone}`; all-time `lateEvenings`; two streak totals; `getShowcase`; `resolveDefinitionProgress` + `byClosestFirst`; `createForDefinition` with `if (!created) continue`; `markCelebrated` |
| `src/server/repositories/achievement.repository.ts` | 128 | **244 / 231** | `createForDefinition` (upsert + P2002 recovery), `markCelebrated`, `findDuplicateDefinitionGroups` |
| `src/server/repositories/focus.repository.ts` | 416 | **869** ⚠ | `findCompletedSessionStarts` — completed, non-break, `startedAt` only. **This file is under active concurrent change** (416 → 648 → 869 during Phase 1); the method is at `:581` as of the last check |
| `src/app/(dashboard)/achievements/page.tsx` | 443 | **452 / 421** | one join key (`definitionIdOf`); `getAchievementById` for the definition lookup; `xpForRow` given the id |
| `src/generated/prisma/**` | — | — | regenerated — `definitionId` and `userId_definitionId` present |
| `scripts/reconcile-achievements.ts` | — | **169 / 149** | 🆕 dry-run-by-default duplicate reconciliation |
| `page md/achievements.md` | 1449 | this file | this document |

### 28.1 Design decisions worth defending in review

1. **Monotonic runs, not rolling windows, for milestone criteria.** A rolling target cannot be reliably unlocked when evaluation only fires on user actions. Cost: a badge is a record of a past achievement, not a live challenge. If a "this week" variant is wanted, it should be a *new* definition alongside the old one — awards should not be revoked.
2. **`null` ≠ `0`, everywhere.** Preserved from the original design and now applied consistently across `getShowcase`, `getNextUnearned` and the page. Unmeasurable sorts last rather than masquerading as "next".
3. **One shared resolver for rarity, one for progress.** `rarityOfRow` and `resolveDefinitionProgress` exist so the grid, the history, the header chips, the showcase and the unlock check cannot drift apart again. That drift *was* the original bug.
4. **`metadata` is a fallback, not the key.** Keeping both is what lets the fix ship without a data migration on the read path.
5. **`UNKNOWN_ACHIEVEMENT_RARITY` is exported.** A named default is auditable; a derived guess is how the original bug happened.
6. **The unique constraint is on `definitionId`, never `[userId, type, level]`.** Documented at F28 precisely because the latter is tempting and wrong.

### 28.2 ⚠ A defect introduced and fixed during Phase 1

`scripts/reconcile-achievements.ts` was written with a **stray NUL byte (0x00)** embedded inside the duplicate-group key template literal:

```
const key = `${row.userId}`␀`${definitionId}`;
```

The NUL was acting as the separator. It made the file unreadable as text (`read` refused it as binary) and would have produced colliding group keys. It was removed at the byte level — deliberately **not** via a PowerShell read-modify-write, which `AGENTS.md` warns corrupts non-ASCII content — and a real `.` separator was restored:

```
const key = `${row.userId}.${definitionId}`;
```

Recorded here because it is exactly the kind of thing that survives a casual review: the file now *looks* fine, and nothing in `tsc` would have pointed at the byte.

---

## 29. Outstanding work + migration runbook

### 29.1 🔴 Blocking — the database is behind the schema

`prisma/schema.prisma` declares `definitionId` and `@@unique([userId, definitionId])`. `src/generated/prisma` knows about both. **The remote Neon database has neither.** Until that changes, `AchievementRepository.createForDefinition` throws on `findUnique({ where: { userId_definitionId } })` — i.e. **every** `checkForUnlocks` call fails, which means **no new achievement can be unlocked at all**.

There is a genuine ordering constraint:

1. The unique index cannot be created while duplicate rows exist — Postgres refuses to build a unique index over duplicate keys.
2. `scripts/reconcile-achievements.ts` reads `row.definitionId`, so it cannot run before the column exists.

**So this must be staged, in three pushes.** Confirm with the user whether `DATABASE_URL` is dev or production before doing any of it — `prisma db push --accept-data-loss` is guarded and needs explicit consent.

| Step | Action | Notes |
| ---- | ------ | ----- |
| **0** | Back up. `SELECT count(*) FROM "Achievement";` and a `pg_dump` of the table | This is the only irreversible step |
| **1** | Push **without** the unique constraint — add `definitionId String?` alone | Use a temporary schema edit, `npm run db:push`, then restore the `@@unique` line |
| **2** | `npx tsx scripts/reconcile-achievements.ts` | Dry run first. It prints scanned / unclassified / groups / backfills / duplicates / rows-to-delete and merges nothing. Re-run with `--apply` to merge: keeps the earliest row, ORs `celebrated`/`isPublic`, keeps the richest `metadata`, fills `icon`/`color`, deletes the rest |
| **3** | Restore the `@@unique` line and `npm run db:push` | Succeeds only because step 2 removed the duplicates |
| **4** | `npm run db:generate`, then re-verify | The client is already correct, but regenerate for cleanliness |

`scripts/reconcile-achievements.ts` is **not** wired to an npm script. Consider adding one, e.g. `"db:reconcile-achievements": "tsx scripts/reconcile-achievements.ts"`.

### 29.2 🔴 Blocking — nothing is verified

| Command | Status |
| ------- | ------ |
| `npm run type-check` | ❌ `Fatal process out of memory: Zone` at the default heap. Retry with `NODE_OPTIONS=--max-old-space-size=8192` was **aborted before finishing** |
| `npm run lint` | ❌ not run. Expect 0 errors / ~165 pre-existing warnings per `AGENTS.md` |
| `npm test` | ❌ not run |
| `npm run build` | ❌ not run |

The generated Prisma `.d.ts` is 156k+ lines, which is why `tsc` needs the larger heap. **Until type-check passes, every claim in this document is a code-reading claim, not a compiler-confirmed one.**

### 29.3 🟠 High value — the tests that do not exist

`tests/` has 20 files and **zero** touch this domain. All of Phase 1's logic is in pure, dependency-free modules that Vitest runs in the `node` environment with no `DATABASE_URL`. `AGENTS.md` already documents the pattern.

The highest-value additions, in order:

| Test file | Should pin |
| --------- | ----------- |
| `tests/lib/achievement-timeframes.test.ts` | window boundaries (7/30/365) around a known `today`; `longestConsecutiveRun` on scattered vs consecutive dates; `longestPerfectWeekStreak` on adjacent vs non-adjacent perfect weeks; `isLateEvening` across `UTC` and `Asia/Tokyo` — **the timezone case is the regression that made the old code wrong** |
| `tests/lib/achievement-metadata.test.ts` | column wins over metadata; metadata fallback; malformed JSON → `null`; missing both → `null` |
| `tests/lib/achievement-xp.test.ts` | `rarityOfRow` resolves all 20 ids; `rarityOfRow` resolves all 20 names; unknown → `UNKNOWN_ACHIEVEMENT_RARITY`; **`row.level` is never read** — a row with `level: 1000` and an unknown title must not become `LEGENDARY` |
| `tests/lib/achievement-criteria.test.ts` | 7 **scattered** perfect days must **not** satisfy `perfect-week`; 7 **consecutive** must; a windowed criterion with no `today` returns `undefined` (fails closed) |
| `tests/lib/achievement-celebration.test.ts` | `markCelebrated` scoped to the owner — needs `vi.mock` on the repository module (`@/lib/prisma` throws without `DATABASE_URL`) |

The XP test's third case is the one that would have caught F1 in the first place.

### 29.4 🟠 Remaining defects, grouped

**Blocking:** §29.1 (db), §29.2 (verification), **F36**.

**Correctness / data:**
- **F34** — `perfectDayDates` is loaded and never read; the resolver's key convention disagrees with the service's. Either rename the key or change the convention. Until then the trailing-window path is unexercised.
- **F35** — `night-owl`'s unbounded `findCompletedSessionStarts`. Add a stored `startedHour`, or a range predicate.
- **F8** — `totals.streak` is one global `currentStreak`; the doc claims per-habit.
- **F33** — `early-riser` is capped at 730 days under an `ALL_TIME` label.
- **F16** — `parseProgress` reads keys that are never written, so earned tiles never show a bar.
- **F17** — history grouping uses the browser's timezone, the service uses the user's.

**Still-unreachable features:**
- **F5** — nothing calls `POST /api/achievements/celebrate`, so the now-correct `celebrated` column drives no UI.
- **F7** — both notification and email deep-links 404. `definitionId` on the row makes the `[id]` route cheap now.
- **F29** — the whole email pipeline is written and never called.

**Page / UX (unchanged by Phase 1):** **F13** offset ignored · **F14** dead `COLOR_CLASSES` · **F15** hardcoded light greys · **F22** stale "12 definitions" comment · **F23** popup dual queue · **F32** `meta.total` discarded.

**Dead code:** **F9** — `checkSnapshots`, `canCelebrate`, `xpOfTitle`, `definitionsByCategory`/`ByRarity`, 5 `constants` helpers, `createMany`, `isUnlocked`, `findDuplicateDefinitionGroups`, `perfectWeeks`. **F19** — the 575-line `src/types/achievements.ts`.

**Performance:** **F31** no rate limit / no debounce / 14 queries per habit tap · **F18**+**F32** `listRecent` double-fetches · **F10** unread unbounded journal query.

### 29.5 The obvious next increment

1. Land §29.1 and §29.2 — push in three stages, then `type-check`, `lint`, `test`.
2. Add the five test files in §29.3. They are cheap and they pin every decision in §28.1.
3. Fix **F34** (one-line key rename) and **F35** (one indexed predicate) — both are small and both are in code Phase 1 just touched.
4. Wire the page to `/api/achievements/showcase` — the endpoint already returns both halves from one snapshot, which removes a request and one full `buildWorldState` from every page load.
5. Wire the toast dismiss to `POST /api/achievements/celebrate` (**F5**), which makes the fixed `celebrated` column visible and gives the "new badge" state a source of truth.
6. Add `achievements/[id]` (**F7**) and repoint both deep-links at it.

---

*End of `/achievements` audit. 29 sections · 1622 lines · 37 findings (7 fixed, 4 partial, 26 open) · 14 models · 20 definitions · 12 repositories · **Phase 1 code is written but NOT compiler-verified and NOT pushed to the database** — see §29.*