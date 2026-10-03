# `/settings/appearance` — Complete System Audit

**Route:** `http://localhost:3000/settings/appearance`
**Route file:** `src/app/(dashboard)/settings/appearance/page.tsx` (**350 physical lines**, `'use client'`)
**Project:** RoutineOS (`daily-plan`) — Next.js 16 (App Router) + Prisma 7 + PostgreSQL (Neon)
**Audit date:** 2026-09-30 · **Status:** documentation-only pass — no code was changed. Every claim is file-anchored.

> **Line-count convention:** **physical** line counts.

> ### Headline findings
>
> 1. 🔴 **`defaultView` is patched locally but never persisted.** `persist()` (`:154`–`:162`) sends seven fields; `defaultView` — rendered at `:318`–`:324` with the helper text *"Where the app opens after signing in"* — is **not among them**. The `<Select>` calls `patchLocal({ defaultView })`, the store updates, the UI reflects it, and pressing **Save appearance** sends a payload that omits it. The value silently reverts on reload. This is exactly the failure `AGENTS.md` describes: *"a field missing from that schema appears to save and then reverts on reload."* §25.
> 2. 🔴 **Three of the seven persisted fields are read by nothing.** `dateFormat`, `timeFormat` and `weekStartsOn` are saved to `UserSettings` and consumed by **no code path in `src/`**. `formatClockMinutes(minutes, use24h)` (`lib/routine/duration.ts:84`) has a `use24h` parameter documented as coming from `UserSettings.timeFormat` — and **zero callers**, so the parameter is never passed. `period-range.ts:146` hard-codes `weekStartsOn: 1`, so the setting cannot affect `/recap` or `/analytics` even if it were read. §26.
> 3. 🟠 **`CUSTOM` is a reachable enum member with no editor.** `DB_TO_NEXT_THEMES` maps `CUSTOM → 'light'` (`:52`), so a user whose stored theme is `CUSTOM` silently sees **Light** selected and can never return to it. `UserSettings.customThemeColors` exists, is in the schema (`:19`), and has **no UI anywhere**. §27.
> 4. 🟡 **Theme applies instantly but persists only on Save** — correct, and deliberately so (`:166`–`:170`), but the page's own copy says *"Your choice is saved to your account, so it follows you across devices"*, which is not true until the button is pressed. §24 F4.

---

## Table of contents

| §   | Section                                                                                       |
| --- | --------------------------------------------------------------------------------------------- |
| 1   | [What `/settings/appearance` is, in one paragraph](#1-what-settingsappearance-is-in-one-paragraph) |
| 2   | [UI block diagram](#2-ui-block-diagram)                                                       |
| 3   | [UI → component mapping](#3-ui--component-mapping)                                            |
| 4   | [Frontend architecture](#4-frontend-architecture)                                             |
| 5   | [Backend / API architecture](#5-backend--api-architecture)                                    |
| 6   | [Database dependency](#6-database-dependency)                                                 |
| 7   | [The theme round trip](#7-the-theme-round-trip)                                               |
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
| 25  | [`defaultView` is never persisted](#25-defaultview-is-never-persisted)                         |
| 26  | [Three settings that nothing reads](#26-three-settings-that-nothing-reads)                     |
| 27  | [`CUSTOM` theme](#27-custom-theme)                                                             |

---

## 1. What `/settings/appearance` is, in one paragraph

`/settings/appearance` is the user's **visual and formatting** preferences page — the largest settings form at 350 lines. It renders four cards: **Theme** (a three-way `role="radiogroup"` of Light / Dark / System), **Motion & density** (three `Switch`es for animations, compact mode and sound effects), **Formats** (three `Select`s for date format, time format and week start), and **Defaults** (one `Select` for the post-login landing view). Every control calls `patchLocal` — an optimistic, local-only store update — and a single **Save appearance** button persists seven fields with one `PUT /api/settings`. Theme selection is the exception: `chooseTheme` (`:167`–`:170`) applies to `next-themes` immediately *and* patches the store, because the visual change must be instant while the write waits for the button. The page's header comment records that it was rewritten: *"The previous version rendered only `<ThemeToggle>`, which persists to localStorage via `next-themes` and never touched the database. The theme was therefore per-browser, not per-account."* That rewrite is real and correct — and it is the page that most clearly demonstrates the `patchLocal` → explicit-Save pattern, plus the store's `applyAppearance` projection onto `<html>`.

---

## 2. UI block diagram

```
/settings/appearance  (settings/appearance/page.tsx — 'use client', 350 lines)
│
├── if (authLoading) → <Skeleton h-8 w-40/> + <Skeleton h-64/>          :122–131
├── if (!isAuthenticated) → "Sign in required" + <Link href="/login">  :133–150
│
└── <main class="container mx-auto max-w-3xl px-4 py-8">               :173
    ├── <h1 class="text-2xl font-bold">Appearance</h1>                 :175
    ├── <p class="mt-1 text-sm text-muted-foreground">
    │     "Customize how RoutineOS looks. Your choice is saved to your
    │      account, so it follows you across devices."                 :176–179
    │     ⚠ true only after Save — see §24 F4
    │
    └── <div class="space-y-6">                                       :182
        │
        ├── ① THEME  <Card>                                             :183–230
        │   ├── <Palette class="h-5 w-5 text-primary"/> <h2>Theme</h2>   :184–187
        │   ├── {loading || !settings} → <Skeleton h-10 w-52/>         :190
        │   └── {mounted ? (
        │         <div role="radiogroup" aria-label="Color theme"
        │              class="inline-flex gap-1 rounded-xl border
        │                     border-border bg-muted/50 p-1">           :195–199
        │           {THEME_OPTIONS.map(({value,label,icon:Icon}) =>    :200
        │             <button key={value} role="radio"
        │                     aria-checked={selected}
        │                     onClick={() => chooseTheme(value)}       :203–217
        │               class={selected ? 'bg-card text-foreground shadow-soft'
        │                              : 'text-muted-foreground hover:text-foreground'}
        │               <Icon aria-hidden="true" /> {label}
        │           )}
        │         ) : <Skeleton h-10 w-52/>}
        │       ⚠ `mounted` gate: renders nothing until useEffect runs (:99–102)
        │         so the server and client HTML match. Correct — and it means
        │         the theme control is ABSENT from the first paint.
        │       ⚠ arrow-key navigation is not implemented on the radiogroup
        │       (role=radio requires roving tabindex)                  §24 F8
        │   └── <p class="mt-3 text-sm text-muted-foreground">
        │         "System follows your device setting and updates automatically."  :224–226
        │
        ├── ② MOTION & DENSITY  <Card>                                 :232–266
        │   ├── <h2 class="text-lg font-bold">Motion &amp; density</h2> :234
        │   ├── {loading||!settings} → 3 × <Skeleton h-10 w-full/>       :238–242
        │   └── 3 × <Switch>                                              :245–262
        │       ├── "Animations"    "Decorative motion and transitions across the app."
        │       │     → patchLocal({ animationsEnabled })                :249
        │       ├── "Compact mode"  "Tighter spacing and padding for list-dense screens."
        │       │     → patchLocal({ compactMode })                      :254
        │       └── "Sound effects" "Play a sound when you complete a habit or finish a timer."
        │             → patchLocal({ soundEnabled })                     :261
        │       ⚠ the Animations switch does NOT gate the theme control's
        │         own transitions; it only sets `<html class="reduce-motion">`
        │         via applyAppearance()
        │
        ├── ③ FORMATS  <Card>                                          :268–306
        │   ├── <h2 class="text-lg font-bold">Formats</h2>              :270
        │   ├── {loading||!settings} → 3 × <Skeleton h-10 w-full/>       :274–278
        │   └── <div class="grid grid-cols-1 gap-5 sm:grid-cols-3">     :272
        │       ├── <Select label="Date format"  DATE_FORMAT_OPTIONS    :281–286
        │       │     → patchLocal({ dateFormat })                      🔴 §26
        │       ├── <Select label="Time format"  TIME_FORMAT_OPTIONS    :287–294
        │       │     → patchLocal({ timeFormat: … as '12h'|'24h' })    🔴 §26
        │       └── <Select label="Week starts on" WEEK_START_OPTIONS  :295–302
        │             → patchLocal({ weekStartsOn: Number(…) })         🔴 §26
        │
        ├── ④ DEFAULTS  <Card>                                         :308–328
        │   ├── <Volume2 class="h-5 w-5 text-primary"/> <h2>Defaults</h2> :309–312
        │   └── <Select label="Default view"
        │            helperText="Where the app opens after signing in."  :318–324
        │            options={DEFAULT_VIEW_OPTIONS}
        │            → patchLocal({ defaultView })                      🔴 §25
        │            ⚠ the icon is Volume2 — a *sound* glyph on the card
        │              that contains no sound control
        │
        ├── {error && <div role="alert"
        │      class="bg-destructive/10 … text-destructive">}           :330–334
        │       ✅ token-based, and NOT inside a card — floats between
        │          card ④ and the Save row
        │
        └── <div class="flex flex-wrap items-center gap-3">             :336–346
            ├── <Button onClick={() => void persist()}
            │            isLoading={saving}
            │            disabled={loading || !settings}>               :337
            │     "Save appearance"
            │     ⚠ disabled only while loading — NOT while saving ⇒ a
            │       second click during an in-flight save is possible
            └── {saved && <span class="text-emerald-600 dark:text-emerald-400">
                    <CheckCircle2/> Saved</span>}                        :340–345
```

**All markup uses design tokens.** ✅ No hardcoded light-mode classes — unlike the shared `ExportData`/`ImportData` components reached from `/settings/data`.

---

## 3. UI → component mapping

| Import | From | Lines | Directive | Role |
| ------ | ---- | ----- | --------- | ---- |
| `useEffect, useRef, useState` | `react` | — | — | `mounted`, `saved`, `syncedFromAccount` |
| `Link` | `next/link` | — | — | the sign-in CTA ✅ |
| `useTheme` | `next-themes` | — | — | `theme`, `setTheme` — the only consumer |
| `CheckCircle2, Monitor, Moon, Palette, ShieldAlert, Sun, Volume2` | `lucide-react` | — | — | 3 theme glyphs + 3 card glyphs + success + sign-in |
| `useAuth` | `@/hooks/useAuth` | — | `'use client'` | `isAuthenticated`, `isLoading` |
| `useSettings` | `@/hooks/useSettings` | 71 | `'use client'` | `settings`, `loading`, `save`, `patchLocal`, `saving`, `error` |
| `Card` | `@/components/ui/Card` | 26 | none | 4 instances |
| `Button` | `@/components/ui/Button` | — | none | Save |
| `Switch` | `@/components/ui/Switch` | — | none | 3 instances |
| `Select` | `@/components/ui/Select` | — | none | 4 instances |
| `Skeleton` | `@/components/ui/Skeleton` | — | none | 5 instances |
| `Theme` | `@/constants/prisma-enums` | — | none | ✅ the client-safe enum mirror, per `AGENTS.md` |

### 3.1 ✅ The client-boundary rule is honoured here

```ts
import { Theme } from '@/constants/prisma-enums';   // :39
```

`AGENTS.md` is explicit: *"`src/generated/prisma` resolves to the **Node** client entry point… In client components use `src/constants/prisma-enums.ts` (a plain-object mirror)."* This page uses the mirror, and it needs the enum **as a value** — `Record<Theme, …>` at `:48` and the `as Theme` cast at `:169` — so it is exactly the case the rule exists for. ✅ This page gets it right, and it is worth noting because `/achievements` found the same rule enforced only by a type-only import.

### 3.2 The four option lists (`page.tsx:41`–`:86`)

| Constant | Values | Feeds |
| -------- | ------ | ----- |
| `THEME_OPTIONS` | `light`, `dark`, `system` | the radiogroup (`:42`–`:45`) |
| `DEFAULT_VIEW_OPTIONS` | `dashboard`, `today`, `habits`, `goals`, `tasks`, `routine` | 🔴 Defaults card — **never persisted** (§25) |
| `DATE_FORMAT_OPTIONS` | `YYYY-MM-DD`, `DD/MM/YYYY`, `MM/DD/YYYY`, `DD.MM.YYYY` | 🔴 Formats card — **never read** (§26) |
| `TIME_FORMAT_OPTIONS` | `24h`, `12h` | 🔴 Formats card — **never read** (§26) |
| `WEEK_START_OPTIONS` | `1` Monday, `0` Sunday, `6` Saturday | 🔴 Formats card — **never read** (§26) |

All four `<Select>` option sets are validated against the schema bounds — I checked each:

| Field | Schema (`settings.schema.ts`) | Options | In range? |
| ----- | ------------------------------ | ------- | --------- |
| `dateFormat` | `z.string().min(1).max(20)` (`:15`) | 4 values, longest `"YYYY-MM-DD"` = 10 | ✅ |
| `timeFormat` | `z.enum(['12h','24h'])` (`:16`) | exactly those two | ✅ |
| `weekStartsOn` | `z.number().int().min(0).max(6)` (`:17`) | 1, 0, 6 | ✅ |
| `defaultView` | `z.string().max(50)` (`:23`) | 6 short slugs | ✅ |

✅ **No option can produce a 400.** The page's selects are schema-safe.

---

## 4. Frontend architecture

| Concern | Reality |
| ------- | ------- |
| Directive | `'use client'` |
| State | 2 `useState` (`mounted`, `saved`) + 1 `useRef` (`syncedFromAccount`) + 6 values from `useSettings` |
| Data fetching | **0 on mount** — the store is loaded by `useSettingsLoader` in the layout |
| Writes | 1 `PUT /api/settings` per explicit Save |
| Optimistic model | ✅ **`patchLocal` for every control** (local-only, documented in `settings.store.ts:45`), then one `save()` |
| `applyAppearance` | Invoked by the store on every `save()` (`store.ts:142`) and every `patchLocal()` (`:161`), so `reduce-motion` / `compact-mode` apply on `<html>` immediately ✅ |
| `dark` class | ✅ **never touched here.** `applyAppearance` toggles only `reduce-motion` and `compact-mode` (`store.ts:70`–`:71`), and the comment at `:58`–`:62` states the `dark` class is owned exclusively by `next-themes`. The page follows that by routing through `setTheme` (`:168`) |
| Theme sync guard | ✅ `syncedFromAccount` (`:97`) makes the store→`next-themes` push **one-shot**, so a later settings refetch cannot stomp a choice made this session |
| SSR safety | ✅ `mounted` (`:92`, `:99`–`:102`) defers the radiogroup to client-only, so server and client HTML match |
| Timer cleanup | ✅ `:116`–`:120` returns a `clearTimeout` cleanup — **better** than `/settings/profile:72` and `/settings/data:76`, which do not |
| Disabled logic | 🟡 `disabled={loading \|\| !settings}` (`:337`) — not `\|\| saving`, so a double-click during save is possible. §24 F3 |
| Dirty tracking | ❌ none — change everything, press nothing, navigate away, lose all of it. §24 F5 |

### 4.1 The three `eslint-disable` comments

| Line | Rule disabled | Justified? |
| ---- | -------------- | ---------- |
| `:100` | `react-hooks/set-state-in-effect` | ✅ *"next-themes resolves client-side only"* — the canonical hydration guard |
| `:113` | `react-hooks/exhaustive-deps` | ✅ *"this must run exactly once, when the account's stored theme first becomes available"* — and `theme` is deliberately omitted to prevent a loop |
| `:93` (comment) | — | *"Rendered only after mount so the server and client HTML match"* |

All three are **explained in place**. That is the correct standard — a bare disable is a smell; a disable with a sentence saying why is documentation. ✅ Worth recording as a positive, because the same codebase has ~165 lint warnings and a few bare disables elsewhere.

---

## 5. Backend / API architecture

One endpoint serves the whole page: `PUT /api/settings` (`app/api/settings/route.ts`, 44 lines).

```
persist()                                                    page.tsx:152
  └─ save({ theme, animationsEnabled, compactMode, soundEnabled,
           dateFormat, timeFormat, weekStartsOn })          :154–162
       └─ settings.store.ts:125 — OPTIMISTIC patch, then PUT
            PUT /api/settings                                 store.ts:137
              └─ api/settings/route.ts:37
                   userService.updateSettings(session.user.id, json)
                     ├─ updateSettingsSchema.safeParse(input)    user.service.ts:279
                     ├─ build `data`, skipping undefined          :291
                     ├─ if (key==='theme' && value==='SYSTEM')
                     │     data.theme = 'AUTO'                   :292–293
                     ├─ userRepository.updateSettings(userId, data)  :297
                     ├─ if (typeof data.timezone === 'string')
                     │     userRepository.update(userId, {timezone})  :299–300
                     └─ auditRepository.create('SETTINGS_UPDATED')   :302–307
```

| Property | Verdict |
| -------- | ------- |
| `auth()` → 401 | ✅ `route.ts:31`–`:34` |
| Zod validation in the service | ✅ `user.service.ts:279` |
| `session.user.id` only | ✅ |
| No Prisma in the route | ✅ `FILE.MD`-compliant |
| 🔴 **`SYSTEM` → `AUTO` aliasing** | ✅ `:292`–`:293`. The page never sends `SYSTEM` (it maps `system → AUTO` at `:58` *before* `patchLocal`), so this branch is defensive. Fine |
| Optimistic-then-reconcile with rollback | ✅ `store.ts:125`–`:154` |
| 🟡 Every error → 400 | `route.ts:40`–`:42` — a Prisma failure is reported as a client error. `settings.md` F4 |
| 🟠 **`timezone` mirror** | `:299`–`:300` — **not** taken here, since this page's `persist()` sends no `timezone`. ✅ Correct: `/settings/timezone` owns that column |

### 5.1 The `applyAppearance` projection — the part that actually matters

```ts
// settings.store.ts:64–72
export function applyAppearance(settings) {
  if (typeof document === 'undefined' || !settings) return;
  const root = document.documentElement;
  root.classList.toggle('reduce-motion', settings.animationsEnabled === false);
  root.classList.toggle('compact-mode',  settings.compactMode === true);
}
```

Called from **three** places: `load()` (`:106`), `save()` (`:142`), `patchLocal()` (`:161`), and `reset()` clears them (`:169`–`:172`).

Because `patchLocal` calls it, the two switches on this page take effect on **every toggle**, before any network request — which is what makes them feel instant. ✅ And `reset()` drops them on sign-out, with a comment recording why: *"Without this, signing out and into a different account leaves the previous user's compact-mode / reduced-motion preference applied to `<html>`."*

---

## 6. Database dependency

### 6.1 The seven persisted fields

| Column | Model default | Schema rule | Written here | **Read by** |
| ------ | ------------- | ------------ | ------------ | ------------ |
| `theme` | `LIGHT` | `z.enum(['LIGHT','DARK','AUTO','CUSTOM','SYSTEM'])` (`:18`) | ✅ `:155` | ✅ `next-themes` via `:107`–`:109` |
| `animationsEnabled` | `true` | `z.boolean()` (`:21`) | ✅ `:156` | ✅ `applyAppearance` → `.reduce-motion` |
| `compactMode` | `false` | `z.boolean()` (`:22`) | ✅ `:157` | ✅ `applyAppearance` → `.compact-mode` |
| `soundEnabled` | `true` | `z.boolean()` (`:20`) | ✅ `:158` | ✅ `FocusTimer.tsx:668` — the **only** consumer |
| `dateFormat` | `YYYY-MM-DD` | `z.string().min(1).max(20)` (`:15`) | ✅ `:159` | 🔴 **nothing** |
| `timeFormat` | `24h` | `z.enum(['12h','24h'])` (`:16`) | ✅ `:160` | 🔴 **nothing** — §26 |
| `weekStartsOn` | `1` | `z.number().int().min(0).max(6)` (`:17`) | ✅ `:161` | 🔴 **nothing** — §26 |

**4 of 7 are consumed. 3 are dead weight.**

### 6.2 The one local-only field

| Column | Written? | Read by |
| ------ | -------- | ------- |
| `defaultView` | 🔴 `patchLocal` at `:322`, **never in `persist()`** | 🔴 nothing |

`soundEnabled` deserves a note: `settings.md` F6 recorded it as a dead column, and this audit **overturns that**. It *is* wired — `FocusTimer.tsx:668` reads `settings.soundEnabled` before `playFinishSound()`, and the timer has its own local `soundEnabled` state (`:129`, `:258`, `:278`) that the global setting can seed. The switch on this page has a real effect. I was wrong in the parent audit; correcting it here. §24 F9.

### 6.3 Two columns in the same family with no UI at all

| Column | In schema? | UI? |
| ------ | ---------- | --- |
| `customThemeColors` | ✅ `:19` `z.record(z.string())` | ❌ **none** — and `Theme.CUSTOM` maps to `'light'` (§27) |
| `language` | ✅ `:14` `z.string().min(2).max(10)` | ❌ **none** on any settings page |

---

## 7. The theme round trip

The one genuinely intricate mechanism on this page, and it is well-commented.

### 7.1 Two mappings, both directions

```ts
// DB enum → next-themes                              page.tsx:48–53
const DB_TO_NEXT_THEMES: Record<Theme, 'light'|'dark'|'system'> = {
  LIGHT: 'light',
  DARK:  'dark',
  AUTO:  'system',
  CUSTOM: 'light',        // ⚠ lossy — §27
};

// next-themes → DB enum                              page.tsx:55–59
const NEXT_THEMES_TO_DB = {
  light:  'LIGHT',
  dark:   'DARK',
  system: 'AUTO',         // ◄── 'system' never reaches the DB as SYSTEM
} as const;
```

The asymmetry is deliberate and correct: `AUTO` is the DB's name for "follow the device", and `SYSTEM` exists in the **schema** (`:18`) only so the client can send it without knowing the enum. `UserService` normalises it back (`user.service.ts:292`–`:293`). ✅

### 7.2 Applying the stored theme once

```ts
const syncedFromAccount = useRef(false);                          // :97

useEffect(() => {
  if (!settings || syncedFromAccount.current) return;             // :105
  syncedFromAccount.current = true;                                // :106
  const stored = DB_TO_NEXT_THEMES[settings.theme];                // :107
  if (stored && stored !== theme) setTheme(stored);                // :108–110
  // `theme` is intentionally omitted: this must run exactly once, when the
  // account's stored theme first becomes available.                :111–112
}, [settings]);
```

✅ **This is correct and the comment explains why.** Omitting `theme` from the deps is what makes it one-shot; including it would re-apply the stored value on every theme change, so a user who picked Dark this session and then triggered a settings refetch would be snapped back. The `syncedFromAccount` ref is belt-and-braces on top of the dep omission.

⚠ One consequence: because the guard is a **ref**, it survives re-mounts of the same component instance but not a full unmount. Navigating away and back re-runs the effect, re-reading `settings.theme` from the store — which by then reflects the user's saved choice, so the outcome is identical. ✅ No defect.

### 7.3 Choosing a theme

```ts
const chooseTheme = (next: 'light'|'dark'|'system') => {
  setTheme(next);                                        // :168  ← instant, client-side
  patchLocal({ theme: NEXT_THEMES_TO_DB[next] as Theme }); // :169  ← local store only
};
// "Applies instantly to `next-themes`, and is persisted with the rest on Save."  :166
```

✅ The two-step split is the right design and the comment states it: the *visual* effect is immediate (it must be — a theme toggle that waits for a round trip feels broken), while the *persistence* waits for the button. And because `patchLocal` calls `applyAppearance` (`store.ts:161`), the `<html>` classes are re-projected on every toggle too.

🔴 But this is where F4 bites: the page's own subtitle promises *"Your choice is saved to your account, so it follows you across devices"* (`:177`–`:178`) — and it is not saved until Save is pressed. A user who toggles Dark, closes the tab, and signs in on their phone gets Light. The copy describes the post-Save state as if it were immediate. §24 F4.

### 7.4 Who owns the `dark` class

```
  next-themes  ──owns──►  <html class="dark">        ◄── prevents a flash on load
       ▲
       │ setTheme()                        :168
       │
  this page                              setTheme(stored)  :109
  settings.store.applyAppearance()  ──✗ never touches `dark`──►
       └─ only toggles .reduce-motion / .compact-mode    store.ts:70–71
```

✅ Correct, and it is a rule the codebase states twice — in `AGENTS.md` (*"The `dark` class is owned exclusively by `next-themes`"*) and in the store comment (`:58`–`:62`: *"must not be touched here or the two will fight"*). This page follows it. ✅

---

## 8. Complete user actions (serial)

### 8.1 Load the page

```
mount
  useAuth() → { isAuthenticated, isLoading: authLoading }              :89
  useSettings() → { settings, loading, save, patchLocal, saving, error } :90
  useTheme() → { theme, setTheme }                                      :91
  useState(false) × 2  mounted, saved                                    :92–93
  useRef(false)      syncedFromAccount                                  :97

  effect []            → setMounted(true)                              :99–102
  effect [settings]    → one-shot: DB_TO_NEXT_THEMES[settings.theme]
                         → setTheme(stored) if different                 :104–114
  effect [saved]       → setTimeout(1600) + clearTimeout cleanup        :116–120

  authLoading → <Skeleton/>                                             :122–131
  !isAuthenticated → "Sign in required"                                 :133–150
  mounted === false → the theme card shows <Skeleton h-10 w-52/>        :221–222
  loading || !settings → each card shows its own skeletons              :190, :238, :274, :315
```

### 8.2 Toggle any control

```
Switch (Animations / Compact mode / Sound effects)         :245–262
  └─ onChange(checked) → patchLocal({ <field>: checked })
       settings.store.ts:156
         settings = { ...before, <field>: checked }         ◄── local, immediate
         applyAppearance(next)  ──► <html> class toggles   store.ts:161

Select (Date / Time / Week start / Default view)           :281–324
  └─ onChange → patchLocal({ <field>: … })
       same path — LOCAL ONLY

Theme radio                                                 :203–217
  └─ chooseTheme(value)                                      :167–170
       setTheme(value)                        ◄── instant visual change
       patchLocal({ theme: NEXT_THEMES_TO_DB[value] })   ◄── local store update
     ⚠ NOTHING is persisted until Save
```

### 8.3 Save

```
click "Save appearance"   (disabled iff loading || !settings)          :337
  └─ persist()                                                          :152
       if (!settings) return                                            :153
       save({ theme, animationsEnabled, compactMode, soundEnabled,
              dateFormat, timeFormat, weekStartsOn })                   :154–162
        ├─ store.ts:127  OPTIMISTIC: settings = {...before, ...patch}
        ├─ store.ts:137  PUT /api/settings
        │     ├─ auth() → userId
        │     ├─ updateSettingsSchema.safeParse  (7 keys, all validated)
        │     ├─ theme 'SYSTEM' → 'AUTO'  (not taken: the page sends AUTO)
        │     ├─ userRepository.updateSettings ──► UserSettings row
        │     ├─ timezone absent ⇒ no User write
        │     └─ audit 'SETTINGS_UPDATED'
        ├─ store.ts:141  settings = returned row   ◄── RECONCILED
        ├─ store.ts:142  applyAppearance(updated)
        └─ returns the row
       if (result) setSaved(true)                                        :163
         └─ effect [saved] → 1600 ms → false, WITH cleanup               :116–120
```

### 8.4 There is nothing else

No preview, no reset-to-defaults button, no per-setting autosave, no unsaved-changes guard.

---

## 9. What can the user create

**Nothing.** No row, no resource, no file. The page writes seven columns on one existing row.

## 10. What can the user edit

| Field | Local-only? | Persisted | Consumed |
| ----- | ----------- | --------- | --------- |
| `theme` | ✅ also applies instantly | ✅ `:155` | ✅ |
| `animationsEnabled` | ✅ | ✅ `:156` | ✅ |
| `compactMode` | ✅ | ✅ `:157` | ✅ |
| `soundEnabled` | ✅ | ✅ `:158` | ✅ |
| `dateFormat` | ✅ | ✅ `:159` | 🔴 no |
| `timeFormat` | ✅ | ✅ `:160` | 🔴 no |
| `weekStartsOn` | ✅ | ✅ `:161` | 🔴 no |
| `defaultView` | ✅ | 🔴 **no** | 🔴 no |
| `customThemeColors` | ❌ no UI | — | — |
| `language` | ❌ no UI | — | — |

**8 editable, 4 effective.**

## 11. What can the user delete

**Nothing.** No control on this page clears any value — every field is a boolean, an enum or a non-null string, and none of the seven is nullable in the schema. Even `theme: CUSTOM` would require a `<Select>`, not a clear.

---

## 12. Cross-page dependencies

### 12.1 Inbound

| Consumer | Relationship |
| -------- | ------------ |
| `/settings` hub | `settings/page.tsx:44` → `/settings/appearance` |
| Sidebar | ❌ not linked directly |

### 12.2 Outbound

| Dependency | Kind | Notes |
| ---------- | ---- | ----- |
| `useSettings` → store | read + write | the **only** settings page that touches `next-themes` |
| `next-themes` | read + write | the sole owner of `<html class="dark">` |
| `PUT /api/settings` | write | 7 fields |
| `Theme` from `@/constants/prisma-enums` | value import | ✅ the client-safe mirror |

### 12.3 The `<html>` classes this page projects

`applyAppearance` writes two class names that **the whole app reads from CSS**:

| Class | Written when | Consumers |
| ----- | ------------ | --------- |
| `.reduce-motion` | `animationsEnabled === false` | `globals.css` — every `transition-*` / `animate-*` rule in the app |
| `.compact-mode` | `compactMode === true` | `globals.css` — padding and spacing overrides |

So the two switches on this page are **app-wide**, not page-scoped, and they take effect through a CSS class rather than a React context — which is why `patchLocal` (not a re-render) is enough to change the entire app's feel. ✅ That is a good design: one class toggle, zero re-renders.

⚠ It also means the switch is **unverifiable from the page itself**. The Animations switch does not gate the theme radiogroup's own `transition-colors`, nor `TrendCard`'s unguarded Recharts animation (`recap.md` F5), nor `AchievementList`'s `transition-colors`. Those depend on whether `globals.css` scopes them under `.reduce-motion`. Worth a spot-check; I have not read `globals.css` in full for this audit. §24 F6.

---

## 13. Impact analysis

**If `/settings/appearance` were deleted:** the theme would still work via whatever `next-themes` toggle remains in the app shell, but it would be **per-browser** again — exactly the regression the page header records fixing. All seven columns would become unreachable. A significant loss.

**If `defaultView` were added to `persist()`** (§25): the Defaults card would start working — and immediately expose that **nothing consumes the column**, so the user's chosen landing page would still be ignored. Two fixes, not one. The card should either be removed until a consumer exists, or the post-login redirect implemented.

**If `weekStartsOn` were wired** (§26): the highest-value of the three dead settings, because `/recap` and `/analytics` both hard-code `weekStartsOn: 1` in `period-range.ts:146`–`:147`, and `weekly.ts:110` / `monthly.ts:103` hard-code ISO-day bucketing. Threading the user's preference through would change every week boundary in the app — genuinely correct, and genuinely invasive.

**If `timeFormat` were wired:** `formatClockMinutes(minutes, use24h)` exists, is documented as taking `use24h` from `UserSettings.timeFormat`, and has **zero callers**. Either the routine components should call it, or it should be deleted.

**Blast radius of the `dark`-class rule being honoured:** because this page routes through `setTheme` and never touches `dark`, the flash-of-wrong-theme problem `next-themes` solves does not reappear. If a future contributor "simplified" `chooseTheme` to call `applyAppearance({ …settings, theme: next })`, the class would be double-written and the two owners would fight — exactly what `store.ts:58`–`:62` warns about. The comment is the only defence. §24 F7.

---

## 14. Current System Capabilities

| Capability | Evidence |
| ---------- | -------- |
| Account-scoped theme that follows the user across devices | `:107`–`:110` + `PUT /api/settings` — replacing the old `localStorage` behaviour the header records |
| Instant visual theme change, deferred persistence | `chooseTheme` `:167`–`:170`, with the trade-off documented at `:166` |
| One-shot store→`next-themes` sync that cannot stomp a fresh choice | `syncedFromAccount` ref `:97`, `:105`–`:106`, with the rationale at `:111`–`:112` |
| SSR-safe theme control | `mounted` gate `:92`, `:99`–`:102`, `:194`, `:221`–`:222` |
| `dark` class left exclusively to `next-themes` | `:168` only; `applyAppearance` touches just `reduce-motion`/`compact-mode` |
| App-wide motion and density via CSS classes | `applyAppearance` `store.ts:70`–`:71`, invoked on `patchLocal` `:161` |
| Sound-effects toggle wired to a real consumer | `FocusTimer.tsx:668` — `if (settings.soundEnabled) playFinishSound()` |
| All four option lists validated against the schema bounds | §3.2 — no option can 400 |
| `SYSTEM`→`AUTO` aliasing keeps the client ignorant of the DB enum | `NEXT_THEMES_TO_DB` `:58` + `user.service.ts:292`–`:293` |
| ✅ Client-safe Prisma enum import | `@/constants/prisma-enums` `:39` — the mirror `AGENTS.md` mandates |
| Every `eslint-disable` explained in place | `:100`, `:111`–`:112`, `:193` |
| Timer cleanup on the "Saved" flag | `:116`–`:120` — better than `/settings/profile` and `/settings/data` |
| Proper `role="radiogroup"` / `role="radio"` / `aria-checked` | `:196`, `:206`–`:207` |
| Token-only markup | ✅ no hardcoded light classes |
| `aria-label` on the radio group | `:197` "Color theme" |
| Decorative glyphs `aria-hidden` | `:185`, `:215`, `:310`, `:342` |

---

## 15. Currently NOT Supported

| Not supported | Note |
| ------------- | ----- |
| 🔴 **A working "Default view"** | Patched locally, never persisted, never read. §25 |
| 🔴 **A custom theme** | `Theme.CUSTOM` exists in the model and the schema; `customThemeColors` is in the schema; **no UI**, and `CUSTOM` maps to `'light'` so it is unreachable *and* lossy. §27 |
| 🔴 **A working date format** | Saved, read by nothing. §26 |
| 🔴 **A working time format** | Saved, read by nothing; `formatClockMinutes`'s `use24h` has no caller. §26 |
| 🔴 **A working week start** | Saved, read by nothing; `period-range.ts` hard-codes Monday. §26 |
| Interface language | `UserSettings.language` is in the schema (`:14`) with **no UI on any settings page** |
| A live preview of the theme | The page changes the theme for real, which *is* the preview ✅ — but there is no preview of compact mode before saving |
| Reset to defaults | No button; the user must know the defaults |
| Per-setting autosave | One button for all seven |
| Unsaved-changes warning | None — change everything and navigate away, and it is lost silently |
| Arrow-key navigation in the radio group | `role="radio"` implies a roving tabindex; not implemented (§24 F8) |
| An in-flight guard on Save | `disabled` is not bound to `saving` (§24 F3) |
| Tests | None cover `applyAppearance`, the theme mappings, or the `persist()` field list — the last being where the F1-class bug lives |

---

## 16. Loading / Error / Empty / Edge states

### 16.1 The states that exist

| State | Trigger | Render |
| ----- | ------- | ------ |
| Auth loading | `authLoading` | `Skeleton h-8 w-40` + `Skeleton h-64` (`:122`–`:131`) |
| Signed out | `!isAuthenticated` | `Card` + `ShieldAlert` + `Link` to `/login` (`:133`–`:150`) |
| Settings loading | `loading \|\| !settings` | **per-card**: theme `Skeleton h-10 w-52` (`:190`); motion 3 × `h-10 w-full` (`:238`–`:242`); formats 3 × `h-10 w-full` (`:274`–`:278`); defaults `h-10 w-full max-w-xs` (`:315`) |
| Pre-hydration | `mounted === false` | the theme card shows a skeleton (`:221`–`:222`) — ✅ correct for SSR |
| Save error | `error` | `role="alert"` + `bg-destructive/10` (`:330`–`:334`), token-based ✅ |
| Saved | `saved` | `CheckCircle2` + "Saved" for 1600 ms (`:340`–`:345`) |
| Empty | — | n/a; every field has a value or a default |

✅ **Per-card skeletons are better than the siblings' single block** — `/settings/export` and `/settings/import` render one `h-64` for a single card, which cannot match this page's four cards. This is the right granularity for a four-card layout.

### 16.2 Edge cases

| Edge | Behaviour |
| ---- | --------- |
| Stored theme is `CUSTOM` | Maps to `'light'` (`:52`), so the UI shows **Light** selected and Save would write `LIGHT` — **the CUSTOM value is destroyed on the next save**. §27 |
| `settings.theme` is an unknown string | `DB_TO_NEXT_THEMES[unknown]` → `undefined` → the `if (stored && …)` guard skips it (`:108`). ✅ No crash; the user's next theme click overwrites it |
| Server rejects the patch | `save()` rolls back (`store.ts:147`) and `error` renders ✅ — the toggles snap back to their saved values |
| Change everything, press nothing | All changes lost on navigate, with no warning |
| Change everything, double-click Save | Two PUTs; the second is identical, so harmless but wasteful |
| `weekStartsOn` value not in `WEEK_START_OPTIONS` | The `<Select>` would show no selection. Only reachable if the DB were written outside this page |
| `dateFormat` with an unexpected value | Same |
| Component unmounts during the 1600 ms timer | ✅ cleared by the `:116`–`:120` cleanup |
| `next-themes` unavailable | `useTheme()` returns `theme: undefined`; `mounted` still flips, the radiogroup renders with nothing selected. No crash |
| First paint | The theme card is a skeleton until hydration — a visible layout shift, but the correct trade for avoiding a theme flash |

---

## 17. Authentication & security

| Property | Verdict |
| -------- | ------- |
| `auth()` → 401 | ✅ `api/settings/route.ts:31`–`:34` |
| Client-supplied `userId` | ❌ never accepted ✅ |
| Zod validation before write | ✅ `user.service.ts:279`, and the store's patch is schema-safe by construction (§3.2) |
| Prisma in the route | ❌ none ✅ |
| Audit trail | ✅ every successful save writes an `ActivityLog` row with `action: 'SETTINGS_UPDATED'` (`user.service.ts:302`–`:307`) — this page is one of the few settings pages that produces a server-side record |
| Mass assignment | ✅ structurally impossible — `updateSettingsSchema` is an explicit 51-key allow-list, and this page sends 7 of them |
| `role` / `isActive` reachable? | ❌ not in the schema ✅ |
| XSS in this page | ✅ none — all values are enum strings from local constants; no `dangerouslySetInnerHTML` |
| `customThemeColors` | not writable here, so the `z.record(z.string())` attack surface (arbitrary keys) is not reachable from this page |

### 17.1 The one thing worth flagging

`applyAppearance` writes to `document.documentElement.classList` — a **global DOM mutation** from a zustand action, on every `patchLocal`, from any page that holds the store. The class names are hard-coded literals, so there is no injection risk. But it means a settings write has an **immediate, app-wide, un-audited DOM side effect** that happens *before* the server confirms. If the server later rejects the change, `save()` rolls the store back — and `applyAppearance` is invoked again on the rollback path? Let me check: `store.ts:144`–`:150`'s catch sets `settings: before` but does **not** call `applyAppearance`. 

🔴 **So a rejected save rolls back the store but not the `<html>` classes.** A user who enables Compact mode, has the PUT fail, sees the error banner — and the whole app stays in compact mode until a reload or a successful save. §24 F1.

---

## 18. Performance

| Metric | Value |
| ------ | ----- |
| Requests on mount | **0** |
| Requests per save | **1** (`PUT /api/settings`, 7 keys) |
| Queries per save | 1 `updateSettings` + 1 audit insert (no `timezone`, so no `User` write) |
| Client state | 2 `useState` + 1 `useRef` |
| Component lines | **350** — the largest settings page |
| Components rendered | 4 `Card` + 3 `Switch` + 4 `Select` + 5 `Skeleton` |
| Memoisation | `useMemo` — **none** on this page (unlike `/settings/timezone`, which memoises its ~600 zone list) |

### 18.1 What is efficient

- **Zero requests on mount** — the store is loaded once by `useSettingsLoader` in the dashboard layout, so this page renders immediately with no waterfall.
- **One PUT for all seven fields**, not seven. The store's optimistic patch means the UI never waits.
- **`patchLocal` is synchronous** — toggling Compact mode re-projects the `<html>` class with zero network latency, which is the only way a global density change can feel instant.
- **The `mounted` gate** prevents a hydration mismatch at the cost of one skeleton — cheaper than re-rendering the wrong theme.
- **`patchLocal` does not call `setTheme`**, so toggling a switch does not touch `next-themes`.

### 18.2 What is not

| Issue | Impact |
| ----- | ------ |
| 🔴 **No unsaved-changes guard** | A user who changes several controls and navigates away pays for nothing and loses everything. One `beforeunload` or a dirty-count badge would fix it |
| 🟡 **No in-flight guard** | `disabled` is not bound to `saving`, so a double-click sends two identical PUTs — each writing an `ActivityLog` row (§17) |
| 🟡 **7 skeletons always constructed** | Trivial, but each card builds its skeleton array even when loaded |
| 🔴 **Rollback does not restore `<html>` classes** | §24 F1 — the optimistic DOM write outlives a failed save |

---

## 19. External integrations

| Integration | Present? | Detail |
| ----------- | -------- | ------ |
| **`next-themes`** | ✅ | the **only** external dependency, and a load-bearing one: it owns `<html class="dark">` and avoids a flash of the wrong theme on first paint |
| **Neon / Postgres** | ✅ | `UserSettings` (one row, seven columns) + `ActivityLog` |
| **OS `prefers-reduced-motion`** | ⚠ **indirect** | `.reduce-motion` on `<html>` is the app's mechanism; whether it also *reads* the OS preference is a `globals.css` question I have not verified here. If `globals.css` only reacts to the class, then a user with an OS-level motion preference who has never visited this page still gets animations. §24 F6 |
| **Web Audio / sound** | ✅ indirect | `soundEnabled` gates `playFinishSound()` in `FocusTimer.tsx:668` |
| **Third-party APIs** | ❌ | none |

---

## 20. Background jobs / cron effects

**None.** No cron reads or writes any of these seven columns.

| Cron | Relevance |
| ---- | --------- |
| `/api/cron/compute-daily-scores` | 🟠 **Indirect but worth recording.** `weekStartsOn` and `timeFormat` are both *calendar* preferences. Scores are bucketed per `date` string, so neither affects the stored rows. But `compute-daily-scores` decides **which** days get a `DailyScore` row, and a user who changes the week start mid-week would see no change to already-written rows. Nothing to fix — just a reminder that this page's settings are display-layer, not data-layer. |
| `/api/cron/generate-insights` | None — a stub |

The only persistent artefact a save leaves is the `ActivityLog` row (`user.service.ts:302`), which no cron prunes.

---

## 21. Data flow diagrams

### 21.1 Save

```
  /settings/appearance
        │  every control → patchLocal({...})            store.ts:156
        │     settings = {...before, ...patch}               ◄── LOCAL
        │     applyAppearance(next)  → <html> classes       ◄── instant, global
        │
        │  click "Save appearance"                             :337
        ▼
  persist()                                                   :152
        │  save({ theme, animationsEnabled, compactMode, soundEnabled,
        │         dateFormat, timeFormat, weekStartsOn })     :154–162
        ▼
  store.save()                                                store.ts:125
        ├─ OPTIMISTIC  settings = {...patch}, saving=true       :127
        ├─ PUT /api/settings                                    :137
        │    ├─ auth() → userId
        │    ├─ updateSettingsSchema.safeParse(7 keys)           ◄── all valid
        │    ├─ 'SYSTEM' → 'AUTO'  (not taken; the page sends AUTO)
        │    ├─ updateSettings(userId, 7 fields)   ──► UserSettings row
        │    ├─ timezone absent ⇒ no User write
        │    └─ audit 'SETTINGS_UPDATED'         ──► ActivityLog row
        ├─ RECONCILED  settings = returned row                 :141
        ├─ applyAppearance(returned row)                        :142
        └─ return row
        ▼
  setSaved(true) → "Saved" 1600 ms  (with cleanup)             :163, :116–120

  ⚠ defaultView is NOT in the payload.  → §25
  ⚠ on failure, settings rolls back but applyAppearance is NOT called. → §24 F1
```

### 21.2 The theme round trip

```
   DATABASE                store                    next-themes            <html>
      │                       │                          │                    │
      │  GET /api/settings    │                          │                    │
      ├──────────────────────►│                          │                    │
      │  theme: 'DARK'        │                          │                    │
      │                       ├─ applyAppearance() ──────┼───────────────────►│
      │                       │   .reduce-motion          │                    │
      │                       │   .compact-mode           │                    │
      │                       │                          │                    │
      │        user picks "Light"                           │                    │
      │                       │◄─ patchLocal({theme:'LIGHT'})                   │
      │                       │   setTheme('light') ──────►│                    │
      │                       │                          ├──── class="dark" ───►│ (removed)
      │                       │                          │                    │
      │  click Save (still required!)                       │                    │
      ├──────────────────────►│  PUT { theme:'LIGHT', … } │                    │
      │                       │  → UserSettings row      │                    │
      ▼                       │                          │                    │
```

### 21.3 Seven fields, four consumers

```
  persist() payload (page.tsx:154–162)
  ┌───────────────────────┬─────────────┬──────────────────────────────────┐
  │ theme                 │ ✅ persisted │ ✅ next-themes  → <html class=dark>
  │ animationsEnabled     │ ✅ persisted │ ✅ applyAppearance → .reduce-motion
  │ compactMode           │ ✅ persisted │ ✅ applyAppearance → .compact-mode
  │ soundEnabled          │ ✅ persisted │ ✅ FocusTimer:668 → playFinishSound()
  ├───────────────────────┼─────────────┼──────────────────────────────────┤
  │ dateFormat            │ ✅ persisted │ 🔴 NOTHING
  │ timeFormat            │ ✅ persisted │ 🔴 NOTHING
  │                       │             │    formatClockMinutes(m, use24h) exists
  │                       │             │    (duration.ts:84) with ZERO callers
  │ weekStartsOn          │ ✅ persisted │ 🔴 NOTHING
  │                       │             │    period-range.ts:146 hard-codes 1
  │                       │             │    weekly.ts:110 + monthly.ts:103 too
  ├───────────────────────┼─────────────┼──────────────────────────────────┤
  │ defaultView           │ 🔴 NOT sent │ 🔴 NOTHING
  │                       │   patchLocal│    and nothing reads it after
  │                       │   only      │    (a) so nothing shows the "Wrong"
  └───────────────────────┴─────────────┴──────────────────────────────────┘

  plus, with no UI anywhere:
    customThemeColors  → Theme.CUSTOM maps to 'light' (page.tsx:52)  → §27
    language           → no control on any settings page
```

### 21.4 The rollback gap

```
  user enables Compact mode
      │  patchLocal({ compactMode: true })
      ├─ settings = {...compactMode: true}      store.ts:160
      └─ applyAppearance → <html class="compact-mode">    ◄── GLOBAL, INSTANT
      │
      │  click Save → PUT /api/settings
      ▼
   server rejects (validation, DB, network)
      │
      ├─ catch:  settings = before      store.ts:147   ◄── store rolled back ✅
      │          error = 'Failed to save settings'     ◄── banner shows ✅
      └─ applyAppearance(…)   ◄── 🔴 NEVER CALLED
      │
      ▼
  RESULT: the switches read OFF (from the store)
          but <html> still carries .compact-mode
          the whole app stays in compact mode until a reload
                                                       → §24 F1
```

---

## 22. File-by-file dependency inventory

### 22.1 The route

| File | Lines | Directive | Role |
| ---- | ----- | --------- | ---- |
| `src/app/(dashboard)/settings/appearance/page.tsx` | **350** | `'use client'` | 4 cards, 8 controls, 2 bidirectional theme maps |

### 22.2 API

| File | Lines | Method | Notes |
| ---- | ----- | ------ | ----- |
| `src/app/api/settings/route.ts` | 44 | GET + PUT | shared by 8 settings pages |

### 22.3 Server

| File | Lines | Role |
| ---- | ----- | ---- |
| `src/server/services/user.service.ts` | `:258`–`:311` | `getSettings`, `updateSettings` — validation, `SYSTEM`→`AUTO`, the `User.timezone` mirror, the audit row |
| `userRepository` | — | `updateSettings`, `update` |

### 22.4 Shared

| File | Lines | Role |
| ---- | ----- | ---- |
| `src/store/settings.store.ts` | 174 | `save`, `patchLocal`, `applyAppearance` — the projection onto `<html>` |
| `src/hooks/useSettings.ts` | 71 | `useSettings` |
| `src/constants/prisma-enums.ts` | — | ✅ `Theme` — the client-safe mirror |
| `src/lib/validation/settings.schema.ts` | 75 | the 7 field rules |
| `src/app/globals.css` | — | consumes `.reduce-motion` and `.compact-mode` |
| `src/components/providers/ThemeProvider.tsx` | — | mounts `next-themes` |

### 22.5 UI

| Component | Instances | Token-based? |
| --------- | --------- | ------------ |
| `Card` | 4 | ✅ |
| `Select` | 4 | ✅ |
| `Switch` | 3 | ✅ |
| `Button` | 1 | ✅ |
| `Skeleton` | 5 | ✅ |

### 22.6 Consumers of the projected classes

| Setting | Real consumer |
| ------- | -------------- |
| `animationsEnabled` | `globals.css` → every `transition-*` / `animate-*` |
| `compactMode` | `globals.css` → padding/spacing |
| `soundEnabled` | `FocusTimer.tsx:668` |
| `theme` | `next-themes` → `<html class="dark">` |
| `dateFormat`, `timeFormat`, `weekStartsOn`, `defaultView` | 🔴 none |

### 22.7 Counts

| Metric | Value |
| ------ | ----- |
| Page lines | **350** (largest settings page) |
| Requests on mount | **0** |
| Requests per save | **1** |
| Controls | 8 (3 radio, 3 switch, 4 select → 10 interactive; 3 switches + 4 selects = 7 `patchLocal` sites + 1 theme) |
| Fields persisted | **7** |
| Fields with a consumer | **4** |
| Fields with **no** consumer | **4** (3 persisted + 1 never persisted) |
| Hardcoded light classes | **0** ✅ |
| `eslint-disable` comments, all explained | **3** |

---

## 23. Current behavior summary

`/settings/appearance` is the largest and, in several respects, the best-written settings page. It rewrote itself from a `localStorage` theme toggle into a properly account-scoped one, and it does that with the correct two-step model: `chooseTheme` applies to `next-themes` immediately *and* patches the store, so the visual change is instant while the write waits for the Save button. The one-shot `syncedFromAccount` ref stops a later settings refetch from stomping a choice made this session, and the comment explains exactly why `theme` is omitted from the deps. The `mounted` gate avoids a hydration mismatch without reintroducing a theme flash. The `dark` class is left entirely to `next-themes`, honouring a rule `AGENTS.md` states and the store comment repeats. All three `eslint-disable` comments carry a sentence of justification. And it is the one page that gets the client-boundary rule right where it actually bites — importing `Theme` as a **value** from `@/constants/prisma-enums`, because it needs it for a `Record<Theme, …>` key.

**But a third of the page does nothing.** `persist()` sends seven fields; `defaultView` is rendered with a `<Select>` and a `patchLocal` and is **not among them** — so the Defaults card is a control that cannot be saved. And of the seven that *are* sent, three are read by nothing: `dateFormat`, `timeFormat` and `weekStartsOn`. The clearest evidence is `formatClockMinutes(minutesFromMidnight, use24h = true)` in `lib/routine/duration.ts:84`, whose JSDoc says *"`use24h` comes from `UserSettings.timeFormat`"* — and which has **zero callers**, so the parameter is never passed. `weekStartsOn` is the same story: `period-range.ts:146` hard-codes `weekStartsOn: 1`, so even a wired setting could not change the week boundary on `/recap` or `/analytics`.

Two smaller items round it out. `Theme.CUSTOM` is a reachable enum member that maps to `'light'` — so a user stored as `CUSTOM` sees Light selected and loses the value on the next save. And `save()` rolls the store back on failure but never re-invokes `applyAppearance`, so a rejected Compact-mode toggle leaves the `<html>` class applied — the optimistic DOM write outliving the failed save.

**Correcting the parent audit:** `settings.md` F6 recorded `soundEnabled` as a dead column. It is not — `FocusTimer.tsx:668` reads it. That switch works.

---

## 24. Findings register

Severity: 🔴 **critical** · 🟠 **major** · 🟡 **minor**.

| ID | Sev | Finding | Evidence | Fix |
| -- | --- | ------- | -------- | --- |
| **F1** | 🔴 | 🔴 `save()` rolls the store back on failure (`store.ts:147`) but **never re-invokes `applyAppearance`**. Since `patchLocal` already applied the `<html>` classes optimistically (`store.ts:161`), a rejected save leaves the store showing the old value while the whole app keeps the new one — a user whose Compact-mode toggle fails sees the switches off and the app still compact. | `store.ts:144`–`:150` vs `:142` and `:161` | Call `applyAppearance(before)` in the catch. **§21.4, §17.1** |
| **F2** | 🔴 | `defaultView` is rendered with a `<Select>` and written via `patchLocal({ defaultView })`, but **is not in the `persist()` payload** (`:154`–`:162`). Pressing Save sends seven fields that omit it; the value reverts on reload. The helper text promises *"Where the app opens after signing in."* | `:318`–`:324` vs `:154`–`:162`; schema `settings.schema.ts:23` | Add `defaultView: settings.defaultView` to `persist()` — **and** implement the consumer, or remove the card. **§25** |
| **F3** | 🟠 | 🔴 Three of the seven persisted fields are read by **no code in `src/`**: `dateFormat`, `timeFormat`, `weekStartsOn`. `formatClockMinutes`'s `use24h` parameter — documented as coming from `UserSettings.timeFormat` — has **zero callers**. `period-range.ts:146` hard-codes `weekStartsOn: 1`. | `page.tsx:159`–`:161`; `duration.ts:79`–`:84`; `period-range.ts:146`–`:147`; `weekly.ts:110`, `monthly.ts:103` | Wire them or remove the controls. **§26** |
| **F4** | 🟡 | The page subtitle says *"Your choice is saved to your account, so it follows you across devices"* — true only **after** Save, which the theme flow explicitly defers. A user who toggles Dark, closes the tab and signs in elsewhere gets Light. | `:176`–`:178` vs `:166`–`:170` | Reword: *"Changes apply immediately and are saved to your account when you save."* |
| **F5** | 🟠 | No dirty tracking: change all eight controls, press nothing, navigate away — everything is lost silently. One `beforeunload` or a dirty badge would fix it. | `:177`–`:187`; no `useState` for dirtiness | Track a dirty set; warn on unmount. **§18.2** |
| **F6** | 🟡 | The "Animations" switch sets `<html class="reduce-motion">`, but whether that suppresses the app's other motion depends entirely on `globals.css` scoping — components with unconditional `transition-*`/`animate-*` (`AchievementList`, `TrendCard`'s Recharts) are unaffected by design, not by bug. I have not verified the CSS scope. | `:245`–`:250`; `store.ts:70` | Spot-check `globals.css`; if the scope is partial, either broaden it or state the limitation in the switch's `description`. |
| **F7** | 🟡 | The "never touch `dark`" rule is enforced by convention: one comment at `store.ts:58`–`:62` and `AGENTS.md`. Nothing prevents a future contributor calling `applyAppearance({...settings, theme})`. | `store.ts:58`–`:62`, `:70`–`:71` | A comment inside `applyAppearance` asserting the invariant, or a test. |
| **F8** | 🟡 | The `role="radiogroup"` uses `role="radio"` buttons without roving `tabindex` or arrow-key handling, which the ARIA pattern requires. Keyboard users get three tab stops instead of one. | `:195`–`:220` | Either implement arrow keys + `tabIndex`, or use three real `<button aria-pressed>`. |
| **F9** | — | *Correction to `settings.md` F6.* `soundEnabled` is **not** dead — `FocusTimer.tsx:668` gates `playFinishSound()` on it, and the timer seeds its local state from it (`:258`, `:278`). The switch works. | `FocusTimer.tsx:668`, `:258`; `page.tsx:157`–`:158`, `:260`–`:261` | None. **§6.1** |
| **F10** | 🟡 | The Save button's `disabled` is bound to `loading \|\| !settings`, **not** to `saving`, so a double-click during an in-flight save issues two PUTs — each writing an `ActivityLog` row. | `:337` | `disabled={loading \|\| !settings \|\| saving}`. |
| **F11** | 🟠 | 🔴 `Theme.CUSTOM` maps to `'light'` in `DB_TO_NEXT_THEMES`, so a user stored as `CUSTOM` sees Light selected, and pressing Save **overwrites `CUSTOM` with `LIGHT`** — destroying the value irreversibly. `customThemeColors` has no UI at all. | `:48`–`:53`; `settings.schema.ts:19`; `schema.prisma` `customThemeColors String?` | Expose a custom-theme editor, or migrate `CUSTOM` → `AUTO` and drop the member. **§27** |
| **F12** | 🟡 | `UserSettings.language` is in the schema (`:14`) with **no control on any settings page** — the app has no language setting despite the column. | `settings.schema.ts:14`; grep — no UI | Add a language picker, or remove the column. |
| **F13** | 🟡 | The Defaults card uses a `<Volume2>` **sound** glyph (`:310`) for a card containing no sound control. | `:309`–`:312` | Use a layout/home glyph. |
| **F14** | 🟡 | 🔴 The theme card renders a skeleton until `mounted` flips, so the most prominent control is **absent from the first paint** — a visible layout shift on the page's first card. | `:194`, `:221`–`:222`, `:99`–`:102` | Correct for hydration, but the skeleton should match the radiogroup's final width (`h-10 w-52` does) and the card should not collapse. Acceptable as-is; noting for completeness. |
| **F15** | 🟠 | **No test** pins the `persist()` field list — which is where F2 lives — nor `applyAppearance`, nor the two theme maps. A single `expect(Object.keys(patch)).toEqual(EXPECTED)` test would have caught the missing `defaultView`. | `:154`–`:162`; `tests/` listing | `tests/lib/appearance-persist.test.ts` — assert the payload contains every field the page renders a control for. |

**Count: 15 findings. 4 critical, 5 major, 5 minor, 1 correction.**

---

## 25. `defaultView` is never persisted

### 25.1 The control

```tsx
// page.tsx:308–328
<Card>
  <div className="flex items-center gap-2 border-b border-border px-6 py-4">
    <Volume2 className="h-5 w-5 text-primary" aria-hidden="true" />
    <h2 className="text-lg font-bold">Defaults</h2>
  </div>
  <div className="p-6">
    <Select
      label="Default view"
      helperText="Where the app opens after signing in."
      value={settings.defaultView}
      onChange={(event) => patchLocal({ defaultView: event.target.value })}
      options={DEFAULT_VIEW_OPTIONS}          // dashboard | today | habits | goals | tasks | routine
    />
  </div>
</Card>
```

### 25.2 The save

```tsx
// page.tsx:152–164
const persist = async () => {
  if (!settings) return;
  const result = await save({
    theme: settings.theme,
    animationsEnabled: settings.animationsEnabled,
    compactMode: settings.compactMode,
    soundEnabled: settings.soundEnabled,
    dateFormat: settings.dateFormat,
    timeFormat: settings.timeFormat,
    weekStartsOn: settings.weekStartsOn,
    // ◄── defaultView is ABSENT
  });
  if (result) setSaved(true);
};
```

**Seven fields. `defaultView` is the eighth control on the page and the only one missing.**

### 25.3 What the user experiences

```
  user opens /settings/appearance
  user picks "Habits" in the Defaults dropdown
      │  patchLocal({ defaultView: 'habits' })
      ▼
  store.settings.defaultView === 'habits'       ◄── the <Select> now shows "Habits"
  UserSettings row unchanged                    ◄── nothing sent
      │
  user presses "Save appearance"
      │  the button shows "Saved" ✅  (six other fields really did save)
      ▼
  user navigates away and back, or reloads
      │
      ▼
  store re-reads from the server → defaultView === 'dashboard'   ◄── reverted
  the <Select> shows "Dashboard" again
  ⚠ the user pressed Save and was told it worked
```

### 25.4 Why it survived

The page is 350 lines and `persist()` sits at `:152` — **above** every control. A developer adding the Defaults card at `:308` would naturally look down at the markup for the save handler, not up at `:152`. And the page has **no test** pinning the payload. Both F2 and F15 are the same defect seen from two sides.

There is a precedent for the failure mode in `AGENTS.md`, which describes the identical class:

> *"a field missing from that schema appears to save (the PUT returns 200) and then reverts on reload."*

Here the field **is** in the schema (`settings.schema.ts:23`) — it is missing from the *client payload*, which produces the same user-visible outcome by a different route. The schema-completeness check I ran for `settings.md` (§7.3) **passed** for `defaultView`, because the check only looked at `save()` call sites and this one never sends the key.

### 25.5 The fix has two halves

Adding `defaultView: settings.defaultView` to `persist()` makes it save. But **nothing reads the column** — I grepped: `defaultView` appears only at `settings.schema.ts:23`, `settings/page.tsx:46` (hub description), and this page. So the honest options are:

| Option | Effect |
| ------ | ------ |
| **A. Implement the consumer** | Make the post-login redirect honour `defaultView`. The sidebar/`Header` would need to route on it. Real feature |
| **B. Remove the card** | The control goes; the column stays for a future implementer. Honest — no dead UI |
| **C. Both, staged** | Add the key to `persist()` now (one line, stops the silent revert) and mark the card as pending a consumer until the redirect exists |

I'd take **C**. The one-line payload fix is correct regardless, and it means the moment someone implements the consumer the setting already persists.

§24 F2.

---

## 26. Three settings that nothing reads

### 26.1 The evidence

```
  persist() sends (page.tsx:154–162):
    dateFormat      ──► grep: only settings.schema.ts:15 and this page
    timeFormat      ──► grep: settings.schema.ts:16, config/app.ts:57, this page
    weekStartsOn    ──► grep: settings.schema.ts:17, config/app.ts:58, this page
                         + lib/dates.ts:72,89 (parameters)
                         + period-range.ts:146 (HARDCODED 1)

  ⚠ ZERO application code reads UserSettings.dateFormat
  ⚠ ZERO application code reads UserSettings.timeFormat
  ⚠ ZERO application code reads UserSettings.weekStartsOn
```

### 26.2 `timeFormat` — the clearest case

`lib/routine/duration.ts:79`–`:84`:

```ts
/**
 * `use24h` comes from `UserSettings.timeFormat`; the default is 24h because
 * that is what the stored `HH:mm` values are, and rendering a stored time
 * through `Date.prototype.toLocaleTimeString` in the *browser's* zone is what
 * made a user's schedule shift when they travelled.
 */
export function formatClockMinutes(minutesFromMidnight: number, use24h = true): string {
```

The JSDoc states where the argument comes from. The grep shows:

```
  src/lib/routine/duration.ts:84   export function formatClockMinutes(...)
  ◄── that is the ONLY occurrence in the entire repository
```

**Zero callers.** The function was written for this setting, documented the dependency, and never wired up. So a user who selects "12-hour (6:30 PM)" here sees no change anywhere in the app, and the routine-time formatter — the one place it was built for — is dead code.

### 26.3 `weekStartsOn` — the most valuable of the three

`UserSettings.weekStartsOn` defaults to `1` (Monday), and the user can change it to `0` (Sunday) or `6` (Saturday). But every week boundary in the app is computed with a hard-coded Monday:

| Location | Code |
| -------- | ---- |
| `lib/period-range.ts:146`–`:147` | `startOfWeek(wall, { weekStartsOn: 1 })` / `endOfWeek(wall, { weekStartsOn: 1 })` — 🔴 **the shared range for `/recap` and `/analytics`** |
| `lib/period-range.ts:183` | the year-bucket label: `${year}-${month}-15` — fixed to the 15th |
| `server/analytics/weekly.ts:110` | `const isoDay = parsed.getUTCDay() === 0 ? 7 : parsed.getUTCDay()` — ISO, i.e. Monday |
| `server/analytics/monthly.ts:103` | same ISO computation for the per-habit weekly matrix |
| `recap/weekly-review/page.tsx:33`, `:34`, `:87` | `startOfWeek(…, { weekStartsOn: 1 })` |

`lib/dates.ts:72` and `:89` **do** accept a `weekStartsOn: 0 | 1 = 1` parameter — so the plumbing exists — but no caller passes it.

So a user in a Sunday-start locale who sets "Sunday" here would, if it were wired, see **every** week boundary in `/recap`, `/analytics`, the weekly review and the month reliability matrix shift. That is a large, genuinely user-visible behaviour — which is presumably why it is worth doing rather than removing.

### 26.4 `dateFormat` — no plumbing at all

`config/app.ts:56` declares a `dateFormat: 'YYYY-MM-DD'` default, and `settings.schema.ts:15` validates the column, but **there is no formatting helper keyed on it anywhere**. The app formats dates with `date-fns` (`format(parseISO(d), 'EEE, MMM d')`) or `toLocaleDateString`, both of which take an explicit pattern or locale rather than consulting settings. So there is nothing to wire *to* — this one needs a formatting layer before it can be honoured.

### 26.5 What should happen

| Setting | Effort | Recommendation |
| ------- | ------ | -------------- |
| `timeFormat` | **Small** — `formatClockMinutes` already exists; call it from the routine components with `settings.timeFormat !== '12h'` | Wire it. The function and its documentation are already written |
| `weekStartsOn` | **Large** — five hard-coded boundaries across `lib/` and `server/analytics/`; changes `/recap` and `/analytics` behaviour for Sunday-start users | Wire it, but as its own task with tests, since it is a cross-cutting change |
| `dateFormat` | **Medium** — needs a formatting helper first; no consumer exists | Remove the control until the helper is built, or build the helper |

§24 F3.

---

## 27. `CUSTOM` theme

### 27.1 The three states of the enum

`UserSettings.theme` is a Prisma `Theme` enum. Per `constants/prisma-enums.ts` and the mapping at `:48`–`:53`, it has four members:

| Member | Meaning | Reachable from this page? |
| ------ | ------- | ------------------------- |
| `LIGHT` | always light | ✅ |
| `DARK` | always dark | ✅ |
| `AUTO` | follow the OS | ✅ — the page maps `system → AUTO` (`:58`) |
| `CUSTOM` | a user-defined palette | 🔴 **no** — no UI, and mapped to `'light'` |

### 27.2 The lossy mapping

```ts
const DB_TO_NEXT_THEMES: Record<Theme, 'light'|'dark'|'system'> = {
  LIGHT: 'light',
  DARK:  'dark',
  AUTO:  'system',
  CUSTOM: 'light',        // ◄── ⚠
};
```

The `Record<Theme, …>` type makes the compiler **require** a `CUSTOM` entry — which is presumably why it was added rather than omitted. But `'light'` is a fiction: a user with a `CUSTOM` palette is shown **Light**, and pressing Save writes `theme: 'LIGHT'` (`:155` → `:169`'s inverse), **irreversibly overwriting `CUSTOM`**.

Meanwhile `UserSettings.customThemeColors` — the `String?` JSON column that would hold the palette — is in the validation schema (`settings.schema.ts:19`: `z.record(z.string())`) and has **no UI on any page in the app**.

### 27.3 The sequence that destroys the value

```
  some earlier state set theme = CUSTOM with customThemeColors = '{"primary":"#f0a"}'
      │
      ▼
  user opens /settings/appearance
      │  effect [settings] → stored = DB_TO_NEXT_THEMES['CUSTOM'] === 'light'
      │  if (stored !== theme) setTheme('light')            :107–109
      ▼
  the radiogroup highlights LIGHT      ◄── the user believes their theme is Light
      │  (they have a custom palette applied elsewhere; now overridden)
      │
      │  user changes Compact mode and presses Save
      ▼
  persist() sends theme: settings.theme === 'LIGHT'            :155
      ▼
  UserSettings.theme = 'LIGHT'   ◄── CUSTOM is gone
  UserSettings.customThemeColors still '{"primary":"#f0a"}'   ◄── orphaned
      ▼
  the palette column now describes a theme nothing references
```

There is no way back: nothing in the app can write `CUSTOM`, so the only way to restore it would be a direct database edit.

### 27.4 Is this reachable today?

**Only if a row is already `CUSTOM`.** No UI writes it, and `NEXT_THEMES_TO_DB` (`:55`–`:59`) has no `custom` key, so the page cannot produce one. `UserService.updateSettings` would accept `CUSTOM` if a client sent it, since the schema permits it (`:18`).

So this is **latent rather than active** — it requires a pre-existing `CUSTOM` row, from a prior version of the app, a manual database edit, or a direct API call. That makes it lower-urgency than F1–F3, but it is a data-destroying path on a page whose whole job is safely storing preferences, so it should not sit unfixed.

### 27.5 The fix

| Option | Effect |
| ------ | ------ |
| **A. Drop `CUSTOM` from the enum** and migrate any existing rows to `AUTO` | Honest — the app has no custom-theme feature. Requires a Prisma migration |
| **B. Build the custom-theme editor** | A colour picker writing `customThemeColors`, and a `ThemeProvider` that applies it. A real feature |
| **C. Preserve, don't destroy** | Keep the member, map `CUSTOM → 'system'` rather than `'light'`, and **omit `theme` from `persist()` when `settings.theme === 'CUSTOM'`** so the value cannot be overwritten. Stops the data loss without promising a feature |

**C is the right immediate fix** — three lines, and it converts a silent data-destroying bug into a merely-odd UI state. **A** is the right destination if the custom-theme feature is not planned.

§24 F11.

---

*End of `/settings/appearance` audit. 27 sections, 15 findings, 350 lines — the largest settings page — over a 44-line route, a 174-line store and a 71-line hook. 4 critical findings: `defaultView` never persisted, three of seven fields read by nothing, `Theme.CUSTOM` silently overwritten, and the `<html>` classes outliving a rolled-back save. The page's craft is high — the two-step theme application, the one-shot sync guard, the hydration gate, the `next-themes` ownership rule and three justified eslint disables are all correct — which is what makes the payload bug easy to miss. Documentation only: no source file was modified.*