# `/settings/timezone` — Complete System Audit

**Route:** `http://localhost:3000/settings/timezone`
**Route file:** `src/app/(dashboard)/settings/timezone/page.tsx` (**183 physical lines**, `'use client'`)
**Project:** RoutineOS (`daily-plan`) — Next.js 16 (App Router) + Prisma 7 + PostgreSQL (Neon)
**Audit date:** 2026-09-30 · **Status:** documentation-only pass — no code was changed. Every claim is file-anchored.

> **Line-count convention:** **physical** line counts.

> ### This is the highest-stakes settings page in the app
>
> `UserSettings.timezone` is not a formatting preference. `AGENTS.md` states: *"Every date-bucketing read (habit logs, daily scores, streaks, analytics ranges, sleep sessions) resolves `UserSettings.timezone`."* The model comment says the same and records the bug it fixed: *"It previously defaulted to 'Asia/Kolkata' while `User.timezone` defaulted to 'UTC', so a user who had never chosen a timezone had two different answers depending on which column a given code path happened to read."* Getting this page wrong shifts a user's entire history.
>
> **Findings below are mostly good news**: the dual-column invariant is maintained in one call, the page is the sole legitimate writer, the option list is properly memoised, and the live-time preview is a nice touch. The four issues are real but none is a data-integrity risk.

---

## Table of contents

| §   | Section                                                                                       |
| --- | --------------------------------------------------------------------------------------------- |
| 1   | [What `/settings/timezone` is, in one paragraph](#1-what-settingstimezone-is-in-one-paragraph)   |
| 2   | [UI block diagram](#2-ui-block-diagram)                                                       |
| 3   | [UI → component mapping](#3-ui--component-mapping)                                            |
| 4   | [Frontend architecture](#4-frontend-architecture)                                             |
| 5   | [Backend / API architecture](#5-backend--api-architecture)                                    |
| 6   | [Database dependency](#6-database-dependency)                                                 |
| 7   | [The dual-column invariant](#7-the-dual-column-invariant)                                     |
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
| 25  | [The dual-column invariant holds](#25-the-dual-column-invariant-holds)                         |
| 26  | [Three writers for one column](#26-three-writers-for-one-column)                               |
| 27  | [The option list](#27-the-option-list)                                                         |

---

## 1. What `/settings/timezone` is, in one paragraph

`/settings/timezone` is a single-`Select` page that sets the timezone every date-bucketing read in the app resolves against. It offers the full IANA zone list from `Intl.supportedValuesOf('timeZone')` — roughly 600 entries — with a 16-zone curated fallback for engines that lack the API, memoises that list so it is not rebuilt per render, and displays the **current local time in the selected zone** as a live preview beneath the control. The choice is written with `patchLocal` and persisted by one **Save timezone** button through the shared settings store; on success it *also* patches the auth store via `updateUser`, so the sidebar and any date formatting update without a reload. Its header comment records two prior bugs it was rewritten to fix: it used to read `GET /api/users/[id]/settings` while every other settings page read `GET /api/settings` (so two tabs could disagree), and the dual-column `User.timezone` / `UserSettings.timezone` pair could drift. Both are fixed.

---

## 2. UI block diagram

```
/settings/timezone  (settings/timezone/page.tsx — 'use client', 183 lines)
│
├── if (authLoading) → <Skeleton h-8 w-40/> + <Skeleton h-56/>         :88–99
├── if (!isAuthenticated) → "Sign in required" + <Link href="/login"> :101–121
│
└── <main class="container mx-auto max-w-3xl px-4 py-8">            :124
    ├── <h1 class="text-2xl font-bold">Timezone</h1>                :125
    ├── <p class="mt-1 text-sm text-muted-foreground">
    │     "Used to interpret your local day for scores and reviews." :126–128
    │
    └── <Card><div class="p-6">                                     :131
        ├── <Globe class="h-5 w-5 text-primary"/> <h2>Preferred timezone</h2>  :133–136
        │
        ├── {loading || !settings} → <Skeleton class="mt-5 h-10 w-full max-w-sm"/>  :138
        │
        └── <div class="mt-5 max-w-sm">                            :141
            ├── <Select label="Timezone"                           :142–147
            │     value={timezone}                                 ◄── settings?.timezone ?? 'UTC'
            │     onChange={(e) => patchLocal({ timezone: e.target.value })}
            │     options={options}          ◄── useMemo, ~600 entries
            │     helperText="Daily scores, streaks and reviews are
            │                  bucketed by this timezone."
            │     ✅ accurate — §5 confirms every bucketing read uses it
            │
            ├── <p class="mt-2 text-sm text-muted-foreground">    :148–157
            │     "Current local time: "
            │     <span class="font-medium text-foreground">
            │       {new Intl.DateTimeFormat(undefined, {
            │            timeZone: timezone, dateStyle:'medium', timeStyle:'short',
            │          }).format(new Date())}
            │     </span>
            │     ✅ the single best touch on the page — it makes an
            │        abstract IANA identifier concrete, and it updates
            │        because patchLocal re-renders with the new value
            │
            ├── {error && <div role="alert"
            │      class="mt-4 bg-destructive/10 … text-destructive">}   :159–165
            │     ✅ token-based, inside the card
            │
            └── <div class="mt-6 flex flex-wrap items-center gap-3">  :167–179
                ├── <Button onClick={() => void persist()}
                │            isLoading={saving}
                │            disabled={loading || !settings}>          :168
                │     "Save timezone"
                │     ⚠ not bound to `saving` ⇒ double-click possible
                └── {saved && <span class="text-emerald-600 dark:text-emerald-400">
                        <CheckCircle2/> Saved</span>}                   :172–177
```

**One card, one select, one preview, one button.** The second-simplest settings page after `/settings/privacy`.

---

## 3. UI → component mapping

| Import | From | Lines | Directive | Role |
| ------ | ---- | ----- | --------- | ---- |
| `useEffect, useMemo, useState` | `react` | — | — | `saved`; the memoised zone list |
| `Link` | `next/link` | — | — | the sign-in CTA ✅ |
| `CheckCircle2, Globe, ShieldAlert` | `lucide-react` | — | — | success + card + sign-in glyphs |
| `useAuth` | `@/hooks/useAuth` | — | `'use client'` | `isAuthenticated`, `isLoading`, **`updateUser`** |
| `useSettings` | `@/hooks/useSettings` | 71 | `'use client'` | `settings`, `loading`, `save`, `patchLocal`, `saving`, `error` |
| `Card` | `@/components/ui/Card` | 26 | none | 2 instances |
| `Button` | `@/components/ui/Button` | — | none | Save |
| `Select` | `@/components/ui/Select` | — | none | **1** — carrying ~600 options |
| `Skeleton` | `@/components/ui/Skeleton` | — | none | 3 instances |

**All markup uses design tokens.** ✅

---

## 4. Frontend architecture

| Concern | Reality |
| ------- | ------- |
| Directive | `'use client'` |
| State | 1 `useState` (`saved`) |
| `useMemo` | ✅ **1**, and it is the right one — `getTimeZoneOptions().map(...)` over ~600 zones, with the comment *"Resolved lazily and memoised: `Intl.supportedValuesOf` returns ~600 zones and is not cheap enough to call on every render."* (`:74`–`:77`) |
| Data fetching | **0 on mount** |
| Writes | 1 `PUT /api/settings`, 1 key |
| Optimistic model | ✅ `patchLocal` on change, explicit Save |
| 🔴 **Dual-store update** | ✅ **`updateUser({ timezone })` after `save()` resolves** (`:85`) — the only settings page that patches the auth store as well as the settings store. §7 |
| Timer cleanup | ✅ `:67`–`:70` returns `clearTimeout` |
| `useEffect` count | 1 (the timer) |
| Save `disabled` | 🟡 bound to `loading \|\| !settings`, **not** to `saving` |

### 4.1 Why this page patches the auth store and `/settings/appearance` does not

Both pages call `save()` through the same store. The difference:

| Page | `updateUser` after save? | Why |
| ---- | ------------------------ | --- |
| **`/settings/timezone`** | ✅ `:85` | 🔴 The auth store holds `user.timezone`, and the **server writes both columns**. Without the local patch, the sidebar and any component reading `user.timezone` would show the old zone until a reload — while the database already has the new one. |
| `/settings/appearance` | ❌ | `theme`, `compactMode` etc. are not on `User`, so there is nothing to reconcile. |
| `/settings/profile` | ✅ `:65` | same reason — it writes `User` fields |
| `/settings/security` | ✅ `:138`/`:160` | 2FA state lives on `User` |
| `/settings/data`, `/settings/habits`, … | ❌ | `UserSettings` only |

✅ **The rule is consistent**: patch the auth store exactly when the write touched `User`. This page is the only `UserSettings`-only page that also writes `User`, and it correctly patches both.

### 4.2 The one thing that is not memoised

The live-time preview calls `new Intl.DateTimeFormat(...)` **inline in the render body** (`:150`–`:154`). `Intl.DateTimeFormat` construction is the expensive part of that API — roughly 10–40× the cost of `.format()`. It re-runs on every render of this page, and it is memoised on neither the zone nor anything else.

The page re-renders on: mount, `saved` toggling (twice per save), and `patchLocal`. So the practical cost is a handful of `Intl.DateTimeFormat` constructions per page visit — negligible in absolute terms. But it is the one place on this page where memoisation would pay, and the same file *already* demonstrates the pattern 70 lines above for the zone list. §24 F4.

⚠ A second, subtler issue: the preview has **no refresh timer**, so it shows the time at render. A user who leaves the tab open for an hour sees a stale clock. Minor — it is a confirmation aid, not a clock — but worth noting since the string reads like a live value. §24 F5.

---

## 5. Backend / API architecture

### 5.1 `PUT /api/settings` — the write

```
persist()                                                    page.tsx:79
  └─ save({ timezone })                                       :80
       └─ store.ts:137  PUT /api/settings
            └─ api/settings/route.ts:37  userService.updateSettings(session.user.id, json)
                 ├─ updateSettingsSchema.safeParse({ timezone })      user.service.ts:279
                 │    timezone: z.string().min(1)                     settings.schema.ts:13
                 ├─ build `data`, skipping undefined                 :291
                 ├─ userRepository.updateSettings(userId, data)      ──► UserSettings row
                 ├─ if (typeof data.timezone === 'string')           :299
                 │    userRepository.update(userId, { timezone })     :300
                 │      └─► User row        ★ THE INVARIANT ★
                 └─ audit 'SETTINGS_UPDATED'                         :302–307
```

**Two writes, one call.** That is precisely what `AGENTS.md` requires, and it is implemented correctly and unconditionally — there is no path where `UserSettings.timezone` is written without `User.timezone`.

### 5.2 Validation

| Layer | Rule |
| ----- | ---- |
| `settings.schema.ts:13` | `timezone: z.string().min(1, 'Timezone is required').optional()` — **any non-empty string** |
| Client source | `Intl.supportedValuesOf('timeZone')` or a 16-entry curated list |

🟠 The schema does **not** validate that the string is a real IANA identifier. Any non-empty string is accepted. That matters more here than for other settings: a stored `"Mars/Olympus"` would make `fromZonedTime(…, 'Mars/Olympus')` throw a `RangeError` inside every date-bucketing call in the app — `getPeriodRange`, `getTodayString`, `formatInTimeZone`, `countEarlyWakeups`, the recap snapshot, the achievements snapshot. §24 F1.

A malformed zone would therefore not corrupt data; it would break date formatting app-wide, per request, until corrected. The `<Select>` makes it hard to produce from the UI, but the endpoint is public API surface. `updateProfileSchema` has a `timezoneSchema` with a `.refine(v => v.includes('/'))` (`validation/user.ts:3`–`:11`) — **`settings.schema.ts` has no equivalent.** An inconsistency between the two schemas for the same column. §24 F2.

### 5.3 The read side — who consumes this value

`AGENTS.md` says every date-bucketing read resolves `UserSettings.timezone`. Verified for the main consumers:

| Consumer | Line | Reads |
| -------- | ---- | ----- |
| `lib/dates.ts` `getTodayString(tz)` | `:32` | ✅ the parameter is required |
| `hooks/useUserTimezone.ts` | `:30`–`:41` | ✅ `settings.timezone` from the store, falling back to the browser zone |
| `recap.service.ts` `getReport` | `:167`–`:170` | ✅ `getSettings` → `getPeriodRange(period, anchor, timezone)` |
| `achievement.service.ts` `buildWorldState` | `:92`–`:96` | ✅ `getSettings` → `getTodayString(timezone)` |
| `period-range.ts` `getPeriodRange` | `:124` | ✅ timezone is the 3rd parameter |
| `server/repositories/*` (scores, sleep, habits) | — | ✅ all receive date strings pre-bucketed by the caller |

✅ **The helper text at `:146` is accurate**: *"Daily scores, streaks and reviews are bucketed by this timezone."*

---

## 6. Database dependency

| Model | Column | Default | Written | Read by |
| ----- | ------ | ------- | ------- | ------- |
| `UserSettings` | `timezone String` | `"UTC"` | ✅ `:80` → `updateSettings:297` | ✅ every date-bucketing read |
| `User` | `timezone String` | `"UTC"` | ✅ `:80` → `updateSettings:300` | ✅ the auth store, `useAuth` consumers |
| `ActivityLog` | — | — | ✅ indirect | one `SETTINGS_UPDATED` row per save |

✅ **Both defaults are `"UTC"`**, which is what `AGENTS.md` and the model comment require (*"Defaulting to 'UTC' also matches `DEFAULT_TZ` in `lib/dates.ts`"*). The historical `Asia/Kolkata` vs `UTC` mismatch that the model comment records is gone from the schema.

---

## 7. The dual-column invariant

### 7.1 Where the drift came from

The model comment is unusually specific:

> *"It previously defaulted to 'Asia/Kolkata' while `User.timezone` defaulted to 'UTC', so a user who had never chosen a timezone had two different answers depending on which column a given code path happened to read."*

So the bug was not that the two columns were written inconsistently — it was that their **defaults** differed, so a user who never visited settings had two different timezones depending on which code path read which column.

### 7.2 How it is held now

```
  user changes the <Select>
        │  patchLocal({ timezone: 'Asia/Tokyo' })      store.ts:156
        ▼
  click "Save timezone"
        ▼
  PUT /api/settings { timezone: 'Asia/Tokyo' }
        ▼
  userService.updateSettings
     ├─ userRepository.updateSettings(userId, { timezone })    ──► UserSettings.timezone
     ├─ if (typeof data.timezone === 'string')                 ──► User.timezone
     │    userRepository.update(userId, { timezone })
     └─ audit
        ▼
  ◄── { success: true, data: <the UserSettings row> }
        ▼
  store.ts:141  settings = updated row            ◄── settings store reconciled
  page.tsx:85   updateUser({ timezone })           ◄── auth store reconciled
        ▼
  BOTH client stores now agree with BOTH database columns
```

✅ **Four things have to go right, and all four do:**

1. `data.timezone` is a string, so the `typeof` guard at `:299` passes.
2. `UserSettings` is written unconditionally by `updateSettings`.
3. `User` is written in the same call — never separately.
4. **Both** client stores are patched, so the UI matches without a reload.

Point 4 is the one that is easy to miss and that this page gets right: `save()` reconciles the settings store (`store.ts:141`) but knows nothing about the auth store, so the explicit `updateUser({ timezone })` at `:85` is necessary. Without it the sidebar would show the old zone against a database that already has the new one — the same class of drift, one layer up. The comment at `:83`–`:84` says exactly this: *"Mirror onto the auth store so the sidebar / date formatting update without a reload. The server writes `User.timezone` in the same call."*

### 7.3 The residual hole: a third writer

`updateProfileSchema` accepts `timezone` (`validation/user.ts:36`) and `api/auth/update-profile/route.ts:29` forwards it. `UserService.updateProfile` mirrors it into `UserSettings` with a best-effort comment. So `User.timezone` is writable through:

| Writer | Writes `User` | Writes `UserSettings` |
| ------ | ------------- | --------------------- |
| `PUT /api/settings` (`updateSettings:299`) | ✅ | ✅ |
| `PATCH /api/auth/update-profile` (`updateProfile`) | ✅ | ✅ (best-effort, logged not thrown) |
| `PUT /api/auth/update-profile` (same handler) | ✅ | ✅ |

**Three routes, all maintaining the invariant — but only this page has UI.** The other two are reachable by hand-crafted request only. `profile.md` §26 makes the same argument and recommends removing `timezone` from `updateProfileSchema`. This page is the one place the invariant is exercised by a user action, which is why the mirroring in `updateSettings` is safe to rely on. §26.

⚠ One asymmetry worth noting: `updateSettings` throws if the settings write fails (no try/catch around `:297`), while `updateProfile` logs-and-continues if the settings mirror fails (*"a failure here must not roll back the profile fields the user actually asked to change"*). For `updateSettings` the two writes are the *same* operation, so throwing is correct. The difference is appropriate to each context. ✅

---

## 8. Complete user actions (serial)

### 8.1 Load

```
mount
  useAuth() → { isAuthenticated, isLoading: authLoading, updateUser }   :61
  useSettings() → { settings, loading, save, patchLocal, saving, error } :62
  useState(false) saved                                                  :63

  effect [saved] → setTimeout(1600) + clearTimeout cleanup               :67–70

  useMemo(() => getTimeZoneOptions().map(z => ({value:z, label:z})), [])  :75–78
    └─ getTimeZoneOptions()                                :51–64
         Intl.supportedValuesOf?  ──yes──► return ~600 zones              :58
                             ──no/error─► return FALLBACK_TIMEZONES (16) :63

  const timezone = settings?.timezone ?? 'UTC'                             :79

  authLoading          → <Skeleton h-8 w-40/> + <Skeleton h-56/>       :88–99
  !isAuthenticated     → "Sign in required"                              :101–121
  loading || !settings → <Skeleton h-10 w-full max-w-sm/>                :140
  otherwise            → <Select> + the live-time preview
```

### 8.2 Change the zone

```
user picks a zone from the <Select>
  └─ onChange(e) → patchLocal({ timezone: e.target.value })             :144
       store.ts:156  settings = {...before, timezone}      ◄── LOCAL
       applyAppearance(next)                                ◄── no-op for a string
     │
     ▼  the page re-renders with the new `timezone`
  ┌────────────────────────────────────────────────────────────┐
  │ <Select value={newZone}>            shows the new selection   │
  │ "Current local time: "             shows the time in the      │
  │   new Intl.DateTimeFormat(...)}    new zone  ◄── instant      │
  └────────────────────────────────────────────────────────────┘
     ⚠ nothing is persisted until Save
```

**This is the best UX on the page.** The live preview turns an opaque IANA identifier into something verifiable, and because `patchLocal` is synchronous the user gets confirmation *before* committing — which is exactly what you want from a setting that silently re-buckets your whole history.

### 8.3 Save

```
click "Save timezone"                            (disabled iff loading || !settings)   :168
  └─ persist()                                                        :79
       if (!settings) return                                          :80
       const result = await save({ timezone })                        :81
        ├─ store.ts:127  OPTIMISTIC patch
        ├─ PUT /api/settings
        │    ├─ auth() → userId
        │    ├─ safeParse: timezone is a non-empty string
        │    ├─ UserSettings.timezone ◄──► row updated
        │    ├─ User.timezone       ◄──► row updated        ★ invariant ★
        │    └─ audit 'SETTINGS_UPDATED'
        ├─ store.ts:141  settings = returned row        ◄── reconciled
        └─ returns the row
       if (result) {
         updateUser({ timezone })      ◄── auth store reconciled        :85
         setSaved(true)                                                        :86
       }
         └─ effect [saved] → 1600 ms → false, WITH cleanup              :67–70
```

### 8.4 There is nothing else

No auto-detect button, no "use my device timezone" shortcut, no current-value label, no search filter over the ~600 options, no reset.

The missing auto-detect is the most notable gap: `useUserTimezone` already falls back to `Intl.DateTimeFormat().resolvedOptions().timeZone` (`hooks/useUserTimezone.ts:31`–`:37`), so the device zone is **already known** — the page just does not offer it as a one-click option. A user who has never set a timezone (the overwhelming majority) must scroll a 600-item dropdown to find their own. §24 F3.

---

## 9. What can the user create

**Nothing.** One column on an existing row.

## 10. What can the user edit

| Field | Local | Persisted | Also written by the server? |
| ----- | ----- | --------- | --------------------------- |
| `UserSettings.timezone` | ✅ `patchLocal` | ✅ `:81` | ✅ |
| `User.timezone` | ✅ via `updateUser` | ✅ **server-side** | ✅ `:300` |

**One user-facing field, two columns, one atomic write.** That is the correct shape for this invariant.

## 11. What can the user delete

**Nothing.** A timezone cannot be unset — `updateSettingsSchema.timezone` is `z.string().min(1)`, so `null` is rejected and `''` fails `.min(1)`. The only way to clear it is `PATCH /api/auth/update-profile` with `timezone` omitted, which leaves the existing value. There is no "unset / follow device" option, even though `useUserTimezone` has a browser fallback that would support exactly that. §24 F3.

---

## 12. Cross-page dependencies

### 12.1 Inbound

| Consumer | Relationship |
| -------- | ------------ |
| `/settings` hub | `settings/page.tsx:45` → `/settings/timezone` |
| Sidebar | ❌ |
| `useUserTimezone` | reads the value; does not link here |

### 12.2 Outbound — the widest blast radius of any settings page

| Dependency | Kind |
| ---------- | ---- |
| `useSettings` → store | read + write |
| `useAuth` → **`updateUser`** | write — unique among `UserSettings`-only pages |
| `PUT /api/settings` | write — 1 key, **2 database columns** |

**The value this page sets is read by, at minimum:**

| Consumer | Where |
| -------- | ----- |
| `useUserTimezone()` | 17 call sites across the app, per `AGENTS.md` |
| `recap.service.ts:167`–`:170` | every `/api/recap` request |
| `achievement.service.ts:92`–`:96` | every `/api/achievements/next` and `/unlock` |
| `period-range.ts` | `/recap` and `/analytics` navigation |
| `countEarlyWakeups`, `findPerfectDayDates`, `getMoodRange`, … | the score and sleep buckets |
| `/today`, `/habits`, `/routine`, `/journal`, `/goals` | date-keyed writes |

🔴 **This single dropdown re-buckets the user's entire history interpretation.** A user who moves from `America/New_York` to `Europe/London` does not move any data — but every subsequent "today" is computed in the new zone, so a habit logged at 23:30 local belongs to a different day than it did an hour ago. Nothing on this page says so. §13.

### 12.3 The sibling that also writes this column

`/settings/profile` → `PATCH /api/auth/update-profile` → `updateProfileSchema.timezone` → `UserService.updateProfile` → mirrors into `UserSettings`. **No UI sends it**, so it is not reachable by a user action — but the code path exists and maintains the invariant. §26.

---

## 13. Impact analysis

**If `/settings/timezone` were deleted:** the value would become unreachable — no other page has a timezone control. Since it defaults to `"UTC"`, every user who never set it would keep scoring, bucketing habits and computing streaks in **UTC**, which is wrong for essentially everyone outside the UK. **A significant correctness regression**, not a lost convenience.

**If the schema stopped validating `min(1)`:** `''` would be accepted, `getTodayString('')` would throw, and the failure would surface inside unrelated features — a recap 500, an achievements unlock that silently throws inside a `.catch`. This is the "validate the value that everything depends on" case, and `updateProfileSchema` already gets it right with a `.refine`.

**If a malformed zone reached the database** (`PATCH /api/auth/update-profile` with `timezone: "Mars/Olympus"`): `fromZonedTime` throws a `RangeError`. Every subsequent request that reads the setting and calls a date helper would fail — `/recap`, `/api/achievements/next`, `/api/settings` consumers, `useUserTimezone` on the client. The app would be effectively unusable for that user until they corrected it, and the error message would name a date function rather than the setting. §24 F1.

**If the `updateUser` mirror at `:85` were removed:** the sidebar and any component reading `user.timezone` would show the old zone while the database had the new one — the same drift the model comment records, one layer up. The comment at `:83`–`:84` is the only defence.

**Blast radius of a *correct* change:** re-bucketing. A user moving zones changes which day their 23:30 habit belongs to, which changes `DailyScore` alignment for today onward (past `DailyScore` rows are keyed by a date string and are not rewritten), and which shifts `perfectDays` counts in `/recap`. None of this is destructive, and `retrospectiveEditDays` exists for corrections — 🔴 except that setting is inert (`data.md` §25). So a user who moves zones cannot easily fix the boundary days afterwards. Worth knowing; not this page's fault.

---

## 14. Current System Capabilities

| Capability | Evidence |
| ---------- | -------- |
| The complete IANA zone list, ~600 entries | `Intl.supportedValuesOf('timeZone')` `:58` |
| A curated fallback for engines without the API | `FALLBACK_TIMEZONES`, 16 zones `:28`–`:45`, `:63` |
| The option list is memoised, with the reason stated | `useMemo` `:75`–`:78` + comment `:74` |
| **Live local-time preview** for instant feedback | `:148`–`:157` |
| 🔴 **Both database columns written in one call** | `user.service.ts:299`–`:300` — the invariant `AGENTS.md` requires |
| 🔴 **Both client stores reconciled after save** | `store.ts:141` (settings) + `:85` (auth) |
| Accurate helper text naming the consumers | `:146` — *"Daily scores, streaks and reviews are bucketed by this timezone."* ✅ verified against `recap.service.ts` and `achievement.service.ts` |
| Both column defaults are `"UTC"`, matching `DEFAULT_TZ` | `schema.prisma` ×2; `lib/dates.ts:25` |
| Documented fix for the two-tab divergence bug | header `:8`–`:11` |
| Documented fix for the dual-column drift | header `:12`–`:14` |
| Timer cleanup | `:67`–`:70` ✅ |
| `role="alert"` on the error, token-based | `:159`–`:165` |
| Saved confirmation with a `dark:` variant | `:172`–`:177` |
| `next/link` for the sign-in CTA | `:114` |
| Token-only markup | ✅ |
| Skeleton sized to the control it replaces | `:140` `h-10 w-full max-w-sm` — matches `max-w-sm` at `:141` ✅ |

---

## 15. Currently NOT Supported

| Not supported | Note |
| ------------- | Note |
| **"Use my device timezone"** | 🔴 The biggest gap. `useUserTimezone` already resolves `Intl.DateTimeFormat().resolvedOptions().timeZone` (`hooks/useUserTimezone.ts:31`–`:37`) — the page could offer it as a one-click option and does not. A first-time user must scroll ~600 entries. §24 F3 |
| **An "unset / follow device" option** | `z.string().min(1)` forbids `null`; the browser fallback in `useUserTimezone` would support it perfectly |
| Searching / filtering the ~600 options | A native `<select>` has no typeahead. At 600 entries, finding `America/Argentina/Buenos_Aires` by scrolling is genuinely painful |
| Grouping by region | No continent grouping |
| Validating the zone against the IANA list | The schema accepts any non-empty string — §24 F1 |
| Warning about re-bucketing | Nothing explains that changing the zone changes which day past-evening activity belongs to |
| DST transition preview | The live time shows the current offset; a DST change date is not surfaced |
| Grouping by UTC offset | Would make the list far more navigable |
| Region-grouped ordering | `Intl.supportedValuesOf` returns alphabetical-by-region already, so this is partly free |
| Tests | None cover the dual-write invariant, the schema, or `getTimeZoneOptions`'s fallback |

---

## 16. Loading / Error / Empty / Edge states

| State | Trigger | Render |
| ----- | ------- | ------ |
| Auth loading | `authLoading` | `Skeleton h-8 w-40` + `Skeleton h-56` (`:88`–`:99`) |
| Signed out | `!isAuthenticated` | `Card` + `ShieldAlert` + `Link` (`:101`–`:121`) |
| Settings loading | `loading \|\| !settings` | `Skeleton h-10 w-full max-w-sm` (`:140`) |
| Error | `error` | `role="alert"` + `bg-destructive/10` (`:159`–`:165`) |
| Saved | `saved` | `CheckCircle2` + "Saved" for 1600 ms (`:172`–`:177`) |
| Empty | n/a | one string field |

### Edge cases

| Edge | Behaviour |
| ---- | --------- |
| `settings` is null | `timezone` falls back to `'UTC'` (`:79`) — so the preview and the `<Select>` still render a valid value ✅ |
| `Intl.supportedValuesOf` missing (older Safari) | Falls through to the 16-zone list `:63` ✅ |
| `Intl.supportedValuesOf` throws | `try/catch` falls through `:59`–`:62` ✅ |
| Stored zone is not in the option list | 🔴 The `<Select>` `value` matches no option → **the control renders with no selection**, and the preview would throw a `RangeError` inside `new Intl.DateTimeFormat` if `settings.timezone` were malformed. Reachable only if the value was written outside this page (§26) or the schema was bypassed (§24 F1) |
| Stored zone is a valid IANA id but a **legacy** one (e.g. `Asia/Calcutta`) | `supportedValuesOf` excludes renamed zones, so the same no-selection outcome. A real risk for an old account |
| Zone changed, nothing saved | Local only; the preview updates, the DB does not. Navigating away reverts |
| Double-click Save | 🟡 Two PUTs, two `UserSettings` writes, two `User` writes, two audit rows |
| Save rejected | `save()` rolls the store back (`store.ts:147`) ✅. But 🔴 **`updateUser` at `:85` is inside `if (result)`, so it correctly does not fire** ✅ — worth stating, because the auth store would otherwise be left with the new zone and the database with the old |
| Unmount during the timer | ✅ cleared at `:69` |
| Preview goes stale | 🟠 It renders at render time with no refresh timer (§4.2) |

---

## 17. Authentication & security

| Property | Verdict |
| -------- | ------- |
| `auth()` → 401 | ✅ `api/settings/route.ts:31`–`:34` |
| Client-supplied `userId` | ❌ never accepted ✅ |
| Zod validation | 🟡 `.min(1)` only — no IANA check (§24 F1) |
| Prisma in the route | ❌ none ✅ |
| Audit trail | ✅ `SETTINGS_UPDATED` per save |
| Mass assignment | ✅ structurally impossible — 51-key allow-list, 1 key sent |
| Privilege escalation via this endpoint | ❌ not possible — `role` is not in the schema |

### 17.1 The one security-adjacent property worth naming

`timezone` is a **location signal**. It is the second-most-privacy-relevant field in `UserSettings` after `profilePublic`/`shareStats` — `privacy.md` §5.2 records that `getPublicProfile` deliberately excludes `timezone` and `preferredLanguage` as *"locale and approximate-location signals"*:

> *"Deliberately excluded: `role` (privilege information), `email`, `timezone` and `preferredLanguage` (locale and approximate-location signals), and `onboardingCompletedAt` (an account-age signal useful for fingerprinting)."*

✅ **That exclusion is enforced and it is consistent**: the public profile returns only `id`, `name`, `displayName`, `bio`, `avatarUrl`, `createdAt`. The timezone a user sets on this page never leaves through the profile routes.

🟠 But it **does** leave through the **leaderboard**? No — `getLeaderboard` returns `id`, `name`, `avatarUrl`, `averageScore`, streaks and `totalDays`. No timezone. ✅

So the only exposure is to the user's own session and the database, which is correct. Worth recording explicitly, because it is the kind of thing a future contributor adding a field to the leaderboard row might not consider.

### 17.2 Rate limiting

❌ None on `PUT /api/settings` — shared by all 8 store-backed settings pages. Each call is two single-row updates plus an audit insert, so the blast radius is small, but there is no per-user cap. Low priority. §24 F6.

---

## 18. Performance

| Metric | Value |
| ------ | ----- |
| Requests on mount | **0** |
| Requests per save | **1** (`PUT /api/settings`, 1 key) |
| Writes per save | **2 rows** (`UserSettings` + `User`) + 1 `ActivityLog` insert |
| Client state | 1 `useState` |
| `useMemo` | **1** — over ~600 zones ✅ |
| `Intl.DateTimeFormat` constructions | 🟡 one per render, **not memoised** (§4.2) |

### 18.1 What is efficient

- **The memoisation is the right call and is justified in place** (`:74`): `Intl.supportedValuesOf` allocates a ~600-element array, and `.map` allocates 600 option objects. Doing that on every render would be wasteful; `useMemo` with `[]` makes it once per mount. ✅
- **Zero requests on mount** — the store is warm from the layout loader.
- **The `<Select>` is the only one in the settings tree with ~600 options.** At ~600 DOM `<option>` elements this is the largest single control in the app, and it is the reason the fallback list exists for older engines that cannot even enumerate the zones.
- **One request per save** for two columns.

### 18.2 What is not

| Issue | Impact |
| ----- | ------ |
| 🟠 **600 `<option>` elements** | The heaviest control in the app. No typeahead, no grouping, no virtualisation. Browsers handle it; finding a zone does not feel good |
| 🟡 `Intl.DateTimeFormat` per render | ~10–40× the cost of `.format()`. A handful of constructions per page visit — negligible in absolute terms, and the same file already demonstrates `useMemo` 70 lines above |
| 🔴 **The preview has no refresh timer** | The rendered time goes stale on a long-lived tab (§16) |

Neither of the last two matters much. The first does, and it is a UX finding rather than a performance one (§24 F3).

---

## 19. External integrations

| Integration | Present? | Detail |
| ----------- | -------- | ------ |
| **ECMA-402 `Intl`** | ✅ | `Intl.supportedValuesOf('timeZone')` for the option list; `Intl.DateTimeFormat` for the live preview. Both are platform APIs — **no third-party timezone library is used anywhere** ✅ |
| **IANA tzdata** | ✅ | Via the runtime's bundled copy. ⚠️ Note that the *server* (Node) and the *client* (browser) may ship different tzdata versions, so `supportedValuesOf` could differ between them — a zone deprecated in one runtime may be absent in the other. The page uses the **client's** list, while the server accepts any string, so a mismatch would surface as the no-selection edge in §16 |
| **Neon / Postgres** | ✅ | 2 columns + 1 audit row |
| **Third-party APIs** | ❌ | none — a deliberate and correct choice; a hosted tz API would add a failure mode to a critical setting |

---

## 20. Background jobs / cron effects

**No cron writes this column, but two crons are sensitive to it.**

| Cron | Relevance |
| ---- | --------- |
| `/api/cron/compute-daily-scores` | 🔴 **The most important interaction in the app.** This job decides which days get a `DailyScore` row, and it runs at `0 1 * * *` — 01:00 **server time** (UTC on Vercel). A user in `America/Los_Angeles` is at 17:00 the previous day when the job runs. So "yesterday" for that user is still in progress when scores are computed. The timezone setting does not fix this — the job's own bucketing does — but it is the reason the column matters so much, and the reason a wrong value shifts an entire day of scoring rather than just a display string. |
| `/api/cron/generate-insights` | None — a stub |

Nothing else reads or writes the column. There is no cron that re-buckets history after a timezone change — which is correct, since past `DailyScore` rows are keyed by a date string and rewriting them would be destructive.

---

## 21. Data flow diagrams

### 21.1 The save — two columns, one call

```
  /settings/timezone
        │  pick a zone
        ▼
  patchLocal({ timezone })                    store.ts:156
    settings = {...before, timezone}             ◄── LOCAL
        │  the page re-renders:
        │    <Select value>            → new selection
        │    "Current local time: …"   → the time in the new zone   ◄── instant feedback
        │
        │  click "Save timezone"                          :168
        ▼
  persist()                                           :79
        └─ save({ timezone })                            :81
             ├─ OPTIMISTIC                              store.ts:127
             ├─ PUT /api/settings
             │    ├─ auth() → userId
             │    ├─ safeParse  timezone: z.string().min(1)      ⚠ shape only
             │    ├─ userRepository.updateSettings ──► UserSettings.timezone
             │    ├─ if (typeof data.timezone === 'string')
             │    │    userRepository.update ────────► User.timezone   ★ INVARIANT ★
             │    └─ audit 'SETTINGS_UPDATED' ─────► ActivityLog
             ├─ RECONCILED  settings = returned row    store.ts:141
             └─ returns the row
        ▼
  if (result) { updateUser({ timezone }); setSaved(true) }   :84–87
        │    ▲ the auth store — store.save() cannot do this, it
        │      does not know the auth store exists
        └─ auth store now agrees with BOTH columns
```

### 21.2 The invariant and its three writers

```
              UserSettings.timezone   User.timezone   UI can reach it?
  ────────────────────────────────────────────────────────────────
  PUT /api/settings
    updateSettings:297            updateSettings:300      ✅ /settings/timezone
      (unconditional)              (guarded by typeof)    THE intended path
                                     ─ both or neither ──
  PATCH /api/auth/update-profile
    updateProfile mirror           updateProfile:direct    ❌ no UI sends it
      best-effort, LOGGED not
      thrown (: comment says a
      failure must not roll back
      the profile fields)
                                     ─ both or neither ──
  PUT /api/auth/update-profile
    identical handler              identical               ❌ no UI sends it
                                     ─ both or neither ──

  ⚠ all three maintain the invariant. Only one is exercised by a user action,
    so only one is covered by the app's real traffic — which is why the other
    two should be removed from updateProfileSchema.  → §26
```

### 21.3 What happens downstream when this value changes

```
  user moves America/New_York → Europe/London
        │
        ▼
  useUserTimezone().today          ──► every date key in the client
        │
        ▼
  GET /api/recap?period=day&date=…  ──► getPeriodRange(period, anchor, timezone)
        │                                  startOfWeek(wall, {weekStartsOn:1})
        ▼
  RecapService.buildExtras        ──► 19–21 queries, all date-bucketed
        ▼
  GET /api/achievements/next      ──► buildWorldState(tz)
        │                                  getTodayString(tz)
        │                                  streakAnalytics(2000-01-01 → end)
        ▼
  /api/cron/compute-daily-scores  ──► which days get a DailyScore row

  ⚠ past DailyScore rows are keyed by a date string and are NOT rewritten.
    So a habit logged at 23:30 local belongs to a different day than it did
    before — and because retroactiveEditDays is inert (data.md §25), the
    user cannot easily correct the boundary afterwards.
```

---

## 22. File-by-file dependency inventory

### 22.1 The route

| File | Lines | Directive | Role |
| ---- | ----- | --------- | ---- |
| `src/app/(dashboard)/settings/timezone/page.tsx` | **183** | `'use client'` | 1 `Select`, 1 live preview, 1 Save, 1 `updateUser` |

### 22.2 API

| File | Lines | Method | Notes |
| ---- | ----- | ------ | ----- |
| `src/app/api/settings/route.ts` | 44 | GET + PUT | 🔴 the **two**-column write happens in the service |
| `src/app/api/auth/update-profile/route.ts` | 68 | PATCH + PUT | ⚠ an alternative `timezone` writer, no UI |

### 22.3 Server

| File | Lines | Role |
| ---- | ----- | ---- |
| `src/server/services/user.service.ts` | `:258`/`:275` | `getSettings`, `updateSettings` — 🔴 the invariant at `:299`–`:300` |
| `userRepository` | — | `getSettings`, `createSettings`, `updateSettings`, `update` |

### 22.4 Shared

| File | Lines | Role |
| ---- | ----- | ---- |
| `src/store/settings.store.ts` | 174 | `save` (reconciles the settings row), `patchLocal` |
| `src/hooks/useSettings.ts` | 71 | `useSettings` |
| `src/hooks/useAuth.ts` | — | `updateUser` — the second store this page writes |
| `src/lib/validation/settings.schema.ts` | 75 | `timezone: z.string().min(1)` `:13` |
| `src/lib/validation/user.ts` | 58 | `timezoneSchema` with `.refine(includes('/'))` `:3`–`:11` — ⚠ stricter, and unused here |
| `src/lib/dates.ts` | 253 | `DEFAULT_TZ = 'UTC'` `:25`, `getTodayString(tz)` `:32` |
| `src/hooks/useUserTimezone.ts` | 45 | reads the value; supplies the browser fallback this page does not offer |

### 22.5 UI

| Component | Instances |
| --------- | --------- |
| `Card` | 2 |
| `Select` | 1 (≈600 options) |
| `Button` | 1 |
| `Skeleton` | 3 |

### 22.6 Downstream consumers of the stored value

| Consumer | Where |
| -------- | ----- |
| `useUserTimezone()` | **17 call sites** repo-wide |
| `recap.service.ts` | `:167`–`:170` |
| `achievement.service.ts` | `:92`–`:96` |
| `period-range.ts` | `getPeriodRange` `:124`, `shiftAnchor` `:93` |
| score / sleep / habit / journal / focus repositories | all receive pre-bucketed date strings |

### 22.7 Counts

| Metric | Value |
| ------ | ----- |
| Page lines | **183** |
| Requests on mount | **0** |
| Requests per save | **1** |
| Database columns written per save | **2** |
| Client stores reconciled | **2** |
| Settings edited | 1 |
| Column invariants maintained | **1**, correctly |
| UI-reachable alternative writers | 0 of 2 |
| Zone options | ~600, or 16 in fallback |
| Hardcoded light classes | **0** ✅ |

---

## 23. Current behavior summary

`/settings/timezone` is a 183-line page whose entire job is one string — and it gets the hard parts right. The dual-column invariant that `AGENTS.md` singles out as the one most likely to drift is maintained **unconditionally** in `UserService.updateSettings`, and this page additionally patches the **auth** store after saving, which is the step a page that only touched `UserSettings` would miss. The two stores and the two columns end up agreeing, with no reload.

The UX is better than the minimum. The live local-time preview turns an opaque IANA identifier into something the user can verify *before* committing — which is exactly the right feedback for a setting that silently re-buckets history. The helper text names the actual consumers rather than restating the label, and it is accurate: I confirmed that `recap.service.ts` and `achievement.service.ts` both read this exact column. The option list is properly memoised with the reason stated, and there is a 16-zone fallback with a `try/catch` for engines that lack `Intl.supportedValuesOf`. The header comment records both prior bugs — the two-tab divergence from reading a different endpoint, and the dual-column drift — so the reasoning survives.

**Four issues, none of them a data-integrity risk.** The schema validates only `min(1)`, so a malformed zone stored through the *other* writer would make `fromZonedTime` throw inside every date-bucketing call app-wide — and `updateProfileSchema` already has a stricter `timezoneSchema` the settings schema lacks. There is no "use my device timezone" button, even though `useUserTimezone` resolves exactly that value for its fallback, so a first-time user must scroll ~600 unsearchable entries to find their own zone. There is no "unset / follow device" option either, though `min(1)` forbids the `null` that would enable it. And the live preview constructs an `Intl.DateTimeFormat` on every render in a file that demonstrates `useMemo` 70 lines earlier.

**One structural note:** `PATCH /api/auth/update-profile` also accepts `timezone` and also maintains the invariant, but no UI sends it. Three routes write this column and only one is exercised by a user action — which is why the other two should be removed rather than left as untested duplicates of a critical invariant.

---

## 24. Findings register

Severity: 🔴 **critical** · 🟠 **major** · 🟡 **minor**.

| ID | Sev | Finding | Evidence | Fix |
| -- | --- | ------- | -------- | --- |
| **F1** | 🟠 | 🔴 `updateSettingsSchema.timezone` is `z.string().min(1)` — **any non-empty string is accepted**. A malformed value would make `fromZonedTime`/`formatInTimeZone` throw a `RangeError` inside every date-bucketing read app-wide (`getPeriodRange`, `getTodayString`, the recap snapshot, the achievements snapshot), surfacing as unrelated 500s in other features. `updateProfileSchema` already has a stricter `timezoneSchema` — the two schemas disagree about the same column. | `settings.schema.ts:13` vs `validation/user.ts:3`–`:11`; `lib/dates.ts`; `recap.service.ts:170` | Share one `timezoneSchema`, ideally validating against `Intl.supportedValuesOf('timeZone')` in a `.refine`. **§27** |
| **F2** | 🟠 | 🔴 `PATCH /api/auth/update-profile` and `PUT` are a **second and third** writer of `User.timezone`, reachable only by hand-crafted request. All three maintain the invariant correctly — but only this page's path is exercised by real traffic, so two untested duplicates guard the app's most drift-prone column. | `validation/user.ts:36`; `api/auth/update-profile/route.ts:29`; `user.service.ts` `updateProfile` | Remove `timezone` from `updateProfileSchema`, leaving this page the sole UI writer. **§26, §7.3** |
| **F3** | 🟠 | No **"use my device timezone"** option, despite `useUserTimezone` already resolving `Intl.DateTimeFormat().resolvedOptions().timeZone` for its fallback. A first-time user must scroll ~600 unsearchable entries to find their own zone. | `hooks/useUserTimezone.ts:31`–`:37`; `page.tsx:142`–`:147` | Add a "Detect: {zone}" option, and an "Unset / follow device" choice (`null` would need `.nullable()`). **§15** |
| **F4** | 🟡 | The live preview constructs `new Intl.DateTimeFormat(...)` **inline in the render body** (`:150`–`:154`), un-memoised. `Intl.DateTimeFormat` construction is ~10–40× the cost of `.format()`. Negligible in absolute terms — and the same file demonstrates `useMemo` 70 lines earlier. | `:148`–`:157` vs `:75`–`:78` | `useMemo` on `[timezone]`. |
| **F5** | 🟡 | The preview has **no refresh timer**, so the rendered time goes stale on a long-lived tab. It reads like a live clock. | `:148`–`:157` | A 30 s interval, or label it *"at the time this page loaded"*. |
| **F6** | 🟡 | No rate limiting on `PUT /api/settings` (shared by 8 store-backed pages). Each call is two single-row updates plus an audit insert. | `api/settings/route.ts:29` | Low priority — but the endpoint deserves a per-user cap. |
| **F7** | 🟡 | The Save button's `disabled` is bound to `loading \|\| !settings`, **not** to `saving`, so a double-click issues two PUTs — each writing both columns and an audit row. | `:168` | `disabled={loading \|\| !settings \|\| saving}`. |
| **F8** | 🟠 | A stored zone that is not in the option list — a **legacy IANA name** such as `Asia/Calcutta`, which `supportedValuesOf` excludes — renders the `<Select>` with **no selection** and would make the preview throw. Reachable for an account whose zone was set before the rename, or via F1/F2. | `:142`–`:154`; `Intl.supportedValuesOf` semantics | Add the stored value to the options when it is missing, or normalise on read. |
| **F9** | 🟡 | Nothing tells the user that changing the zone **re-buckets** which day past-evening activity belongs to, while past `DailyScore` rows are not rewritten — and `retroactiveEditDays`, which would let them correct it, is inert. | `recap.service.ts`; `data.md` §25 | Add a short note: *"Changing this affects how days are grouped from now on; existing scores are not recalculated."* |
| **F10** | 🟡 | **No test** pins the dual-column invariant — that `updateSettings` writes both, or that they stay equal. The invariant is the single most drift-prone property in the settings subsystem per `AGENTS.md`, and it is enforced only by two adjacent lines. | `user.service.ts:299`–`:300`; `tests/` listing | `tests/services/user-settings.test.ts` — assert both columns change together. `profile.md` F17 and `settings.md` F10 make the same request for their layers. |

**Count: 10 findings. 0 critical, 5 major, 5 minor.**

---

## 25. The dual-column invariant holds

### 25.1 What the invariant is

`User.timezone` and `UserSettings.timezone` are two columns holding one value. `User.timezone` is the value the **auth layer** knows about; `UserSettings.timezone` is the value every **date-bucketing read** resolves. `AGENTS.md` makes it a hard requirement:

> *"`timezone` exists on both `User` and `UserSettings`; `UserService.updateSettings` writes both in one call. Keep it that way or the score bucketing and the UI will drift."*

And the model comment records the bug that made the rule necessary: the two columns previously had **different defaults** (`Asia/Kolkata` vs `UTC`), so a user who never touched settings had two different answers depending on which code path read which column.

### 25.2 Three things must hold, and all three do

| # | Requirement | Status | Evidence |
| - | ----------- | ------ | -------- |
| 1 | Both columns share a default | ✅ | both `@default("UTC")`, matching `DEFAULT_TZ` (`lib/dates.ts:25`) |
| 2 | Every write updates both | ✅ | `user.service.ts:299`–`:300`, unconditional on the `typeof` guard |
| 3 | Both client stores reflect the result | ✅ | `store.ts:141` (settings) **and** `page.tsx:85` (auth) |

Requirement 3 is the one this page uniquely contributes, and it is easy to miss: `store.save()` reconciles only the settings store. It knows nothing about the auth store, so without the explicit `updateUser({ timezone })` at `:85` the sidebar would show the old zone against a database holding the new one — the same drift, one layer up. The comment at `:83`–`:84` says exactly that.

### 25.3 The asymmetry between the two writers, and why it is right

`updateSettings` (this page's path) writes `UserSettings` **then** `User`, with no try/catch — so a failure in the second write leaves them inconsistent and **throws**, surfacing as a failed save.

`updateProfile` writes `User` **then** best-effort `UserSettings`, catching and logging — with the comment: *"a failure here must not roll back the profile fields the user actually asked to change, so it is logged rather than thrown."*

Different order, different failure policy, and **both correct for their context**. For `updateSettings` the two writes *are* the operation, so partial failure must be visible. For `updateProfile` a timezone mirror is a side effect of a profile edit, so a mirror failure must not lose the edit. ✅ This is a considered distinction, not an accident.

### 25.4 The remaining hole

`updateProfileSchema` also accepts `timezone`, and `updateProfile` also maintains the invariant. So there are **three** routes that write this column and all three keep it consistent — but two of them are reachable only by hand-crafted request.

That is not a bug today. It is a **test-coverage** gap on the app's most drift-prone property: the invariant is enforced by two adjacent lines in one method, plus a mirrored pair in another, and **no test covers either**. F10 is a one-test fix that would protect the most consequential invariant in the settings subsystem.

§24 F2, F10.

---

## 26. Three writers for one column

### 26.1 The writers

| # | Route | Schema field | Service method | UI |
| - | ----- | ------------ | -------------- | --- |
| 1 | `PUT /api/settings` | `updateSettingsSchema.timezone` (`settings.schema.ts:13`) | `updateSettings` | ✅ **this page** |
| 2 | `PATCH /api/auth/update-profile` | `updateProfileSchema.timezone` (`validation/user.ts:36`) | `updateProfile` | ❌ |
| 3 | `PUT /api/auth/update-profile` | same schema, same handler | `updateProfile` | ❌ |

Writers 2 and 3 are the same handler — `api/auth/update-profile/route.ts:61`–`:66` exports `PUT` as an alias for `PATCH`, so it is really **two** writers, not three. Either way: two code paths, one of them reachable from the UI.

### 26.2 Why this page is the right sole owner

The value is a **global display and bucketing preference**, not a profile attribute. It belongs in `/settings/timezone`, which:

- offers the complete IANA list;
- shows a live preview so the user can verify before committing;
- states what the value affects;
- reconciles both client stores.

`/settings/profile` offers none of that — it would be a bare `<Select>` on a page about names and bioses, with no explanation of what is being changed.

### 26.3 The fix

Remove one line from `validation/user.ts`:

```ts
export const updateProfileSchema = z.object({
  name, displayName, bio, avatarUrl,
  // timezone: removed — /settings/timezone owns it, and updateProfile's
  // mirror into UserSettings is an untested duplicate of updateSettings'
  // unconditional write.
  preferredLanguage: z.string().min(2).max(10).optional(),
});
```

Then delete the mirror block in `updateProfile` and the two `if` guards in `api/auth/update-profile/route.ts:29`. Net: **fewer lines**, one owner, one place to test.

⚠ **Check for callers first.** `grep` shows `updateProfileSchema` is used by the route and by `UserService.updateProfile`; `updateProfile` is called from the route. So the change is contained — but `/settings/security` and `/settings/profile` both call `updateUser({...})` client-side and neither sends `timezone`, so no UI breaks.

`preferredLanguage` deserves the same treatment or a home: it is in `updateProfileSchema` and on the model, and **no settings page has a control for it** (`appearance.md` F12). §24 F2.

---

## 27. The option list

### 27.1 What it is

```ts
// page.tsx:51–64
function getTimeZoneOptions(): readonly string[] {
  if (typeof Intl !== 'undefined' && typeof Intl.supportedValuesOf === 'function') {
    try { return Intl.supportedValuesOf('timeZone'); }
    catch { /* Fall through to the curated list. */ }
  }
  return FALLBACK_TIMEZONES;    // 16 entries, :28–:45
}
```

✅ The two-layer approach is right: the full list where available, a usable subset where not. The `typeof` guard handles a missing API and the `try/catch` handles a throwing one — both real failure modes on older Safari.

### 27.2 The three problems

**(a) ~600 options with no typeahead.** `<Select>` renders a native `<select>`; browsers give no search for 600 entries. Finding `America/Argentina/Buenos_Aires` by scrolling is genuinely painful, and the hub's own `PeriodControl` solves a smaller version of the same problem by using a 4-tab strip instead of a long list.

**(b) No device-zone shortcut.** `useUserTimezone` computes `Intl.DateTimeFormat().resolvedOptions().timeZone` (`hooks/useUserTimezone.ts:31`–`:37`) and uses it as the fallback when settings have not loaded. The value is **already in memory on this very page**. Offering it as a labelled first option — *"Use my device timezone (Europe/London)"* — would remove the scroll for the majority of users, who have never set a timezone and want their own.

**(c) Legacy zone names break the control.** `Intl.supportedValuesOf` returns **canonical** names only. `Asia/Calcutta` (renamed `Asia/Kolkata`), `America/Buenos_Aires` (→ `America/Argentina/Buenos_Aires`) and `US/Eastern` (→ `America/New_York`) are excluded. A user whose stored value is a legacy alias renders a `<Select>` with **no matching option** — the control appears empty — and the live preview would throw a `RangeError` on that value.

That third one is the only correctness issue, and it is reachable: the column is a plain string that has been written since before the tzdata renames, and two other routes can write it without the option list constraining them (§26). F8.

### 27.3 What would fix it

```tsx
// Normalise on read, and always include the stored value in the options.
const stored = settings?.timezone ?? 'UTC';
const options = useMemo(() => {
  const zones = getTimeZoneOptions();
  return zones.includes(stored) ? zones : [stored, ...zones];
}, [stored]);
```

Three lines, and it closes the legacy-name gap. Combined with a device-zone option prepended, and the control becomes usable.

**Do not** add a third-party timezone library for this — the platform `Intl` API is complete, the app already uses it, and adding a dependency to the app's most critical setting would introduce a failure mode for no gain.

§24 F1, F3, F8.

---

*End of `/settings/timezone` audit. 27 sections, 10 findings, 183 lines over a 44-line route and a 71-line hook. Zero critical findings — and that is the headline: this is the page that owns the app's most drift-prone invariant, and it maintains it correctly on both the server (`user.service.ts:299`–`:300`) and on both client stores. The five issues are a schema that validates shape rather than identity, two untested duplicate writers, a 600-item dropdown with no device-zone shortcut, an unmemoised `Intl.DateTimeFormat`, and a stale time preview. Documentation only: no source file was modified.*