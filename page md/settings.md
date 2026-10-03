# `/settings` — Complete System Audit

**Route:** `http://localhost:3000/settings`
**Route file:** `src/app/(dashboard)/settings/page.tsx` (184 physical lines, **no `'use client'`** — a Server Component)
**Project:** RoutineOS (`daily-plan`) — Next.js 16 (App Router) + Prisma 7 + PostgreSQL (Neon)
**Audit date:** 2026-09-30 · **Status:** documentation-only pass — no code was changed. Every claim is file-anchored.
**Scope:** the index page only. Its **22 subpages** are audited separately.

> **Line-count convention:** **physical** line counts.

> ### Headline
>
> `/settings` is **not a settings page** — it is a **184-line static link directory**. It has **no** `'use client'`, **no** state, **no** `useEffect`, **no** data fetching, **no** store access, and it never imports `apiRequest`. It renders a hard-coded array of 21 `{name, href, desc}` triples in 5 groups. Every real setting in the app — 50 columns on `UserSettings`, 5 groups, 22 routes — is one navigation click away and none of it is touched by this file.
>
> That makes this the **simplest** page audited so far and, correspondingly, the one with the least to find. The interesting defects are not in `page.tsx`; they are in the **contract between the index and its children**, and that is where this audit concentrates (§12, §13).

---

## Table of contents

| §   | Section                                                                                       |
| --- | --------------------------------------------------------------------------------------------- |
| 1   | [What `/settings` is, in one paragraph](#1-what-settings-is-in-one-paragraph)                   |
| 2   | [UI block diagram](#2-ui-block-diagram)                                                       |
| 3   | [UI → component mapping](#3-ui--component-mapping)                                            |
| 4   | [Frontend architecture](#4-frontend-architecture)                                             |
| 5   | [Backend / API architecture](#5-backend--api-architecture)                                    |
| 6   | [Database dependency](#6-database-dependency)                                                 |
| 7   | [The navigation contract](#7-the-navigation-contract)                                         |
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
| 25  | [`/settings/account` is an orphaned route](#25-settingsaccount-is-an-orphaned-route)          |
| 26  | [The widget-toggle contract is enforced by convention only](#26-the-widget-toggle-contract-is-enforced-by-convention-only) |
| 27  | [The settings store is bypassed by 6 of 22 subpages](#27-the-settings-store-is-bypassed-by-6-of-22-subpages) |

---

## 1. What `/settings` is, in one paragraph

`/settings` is the **hub** for every preference, integration, billing and data-control surface in RoutineOS. It is the only `'use client'`-free page in the entire `settings/` tree — a 184-line **Server Component** that imports exactly two things: `Link` from `next/link` and 22 icons from `lucide-react`. It declares a `SettingsLink` interface (`name`, `href`, `desc`), a `SettingsGroup` interface (`title`, `links`), a module-level `const settingsGroups: SettingsGroup[]` holding **21 links** across **5 groups** (Preferences ×10, Account & Safety ×3, Integrations & API ×2, Billing ×2, Account & Data ×4), and a parallel `ICONS: Record<SettingsIconKey, LucideIcon>` map that pairs each link's **display name** to an icon. The component maps groups to `<section aria-labelledby>`, each containing a `grid gap-4 md:grid-cols-2` of `<Link>` cards — each with a 40px icon tile, a name, a description, and a `ChevronRight` that nudges right on hover. There is no loading state, no error state, no empty state, no search, no grouping toggle, and nothing persisted. The page is a **static navigation manifest**, and it is correct, complete, and almost entirely free of defects — the two real findings are an orphaned route and an unenforced icon-key contract.

---

## 2. UI block diagram

```
/settings  (src/app/(dashboard)/settings/page.tsx — Server Component, 184 lines)
│
└── <div class="mx-auto max-w-4xl space-y-8 px-4 py-8">                  :137
    │
    ├── HEADER                                                          :138–146
    │   ├── <div class="glass-panel glow-primary flex h-12 w-12 shrink-0
    │   │        items-center justify-center rounded-xl p-3">             :139
    │   │   └── <Settings2 class="h-6 w-6 text-primary" aria-hidden>     :140
    │   └── <div>
    │       ├── <h1 class="text-3xl font-bold">Settings</h1>             :143
    │       └── <p class="mt-1 text-muted-foreground">
    │             "Manage your account and preferences."                :144
    │
    └── 5 × <section aria-labelledby={`settings-group-${group.title}`}>  :149
        │   ⚠ the id embeds spaces + '&' unencoded, e.g.
        │     id="settings-group-Account & Safety"  → valid HTML5 (ids may
        │     contain any char except space-free ambiguity), but breaks
        │     querySelector("#settings-group-Account & Safety")
        │     unless escaped, and is not a valid CSS identifier
        │
        ├── <h2 id={…} class="mb-4 text-xs font-bold uppercase
        │       tracking-wider text-muted-foreground">{group.title}</h2>  :150–155
        │
        └── <div class="grid gap-4 md:grid-cols-2">                     :156
            └── group.links.map(link => (                             :157
                │
                ├── const Icon = ICONS[link.name as SettingsIconKey];   :158  ◄── §26
                │     ⚠ a runtime `undefined` if a name is added to
                │       settingsGroups without an ICONS entry
                │
                └── <Link href={link.href}
                        class="glass-panel group flex items-start gap-4
                               rounded-xl p-5 transition-all duration-300
                               ease-out-expo hover:-translate-y-0.5
                               hover:border-primary/40 hover:shadow-long">  :160–164
                    │
                    ├── ICON TILE                                       :165–167
                    │   <div class="flex h-10 w-10 shrink-0 items-center
                    │        justify-center rounded-lg bg-muted
                    │        text-muted-foreground transition-colors
                    │        group-hover:bg-primary/10
                    │        group-hover:text-primary">
                    │     <Icon class="h-5 w-5" aria-hidden="true" />
                    │
                    ├── TEXT BLOCK  <div class="min-w-0 flex-1">        :168–171
                    │   ├── <h3 class="text-base font-semibold">{link.name}</h3>  :169
                    │   └── <p class="mt-1 text-sm text-muted-foreground">
                    │         {link.desc}</p>
                    │       ⚠ `min-w-0` present → long names truncate
                    │         correctly rather than overflowing the grid
                    │
                    └── <ChevronRight class="mt-1 h-4 w-4 shrink-0
                            text-muted-foreground/50 transition-transform
                            group-hover:translate-x-0.5
                            group-hover:text-primary" aria-hidden>     :172–175
                ))
```

### 2.1 The 5 groups, verbatim (`page.tsx:39`–`:86`)

| # | Group `title` | Links (`name` → `href`) |
| - | ------------- | ----------------------- |
| 1 | **Preferences** | Profile → `/settings/profile` · Appearance → `/settings/appearance` · Time Zone → `/settings/timezone` · Dashboard → `/settings/dashboard` · Habits → `/settings/habits` · Routine → `/settings/routine` · Sleep → `/settings/sleep` · Quotes → `/settings/quotes` · Scoring Weights → `/settings/scoring` · Notifications → `/settings/notifications` |
| 2 | **Account & Safety** | Security → `/settings/security` · Active Sessions → `/settings/sessions` · Privacy → `/settings/privacy` |
| 3 | **Integrations & API** | Integrations → `/settings/integrations` · API Keys → `/settings/api-keys` |
| 4 | **Billing** | Subscription → `/settings/subscription` · Billing → `/settings/billing` |
| 5 | **Account & Data** | Data → `/settings/data` · Export → `/settings/export` · Import → `/settings/import` · Danger Zone → `/settings/danger-zone` |

**21 links, 22 routes** — the discrepancy is `/settings/account`, §25.

### 2.2 Accessibility structure

| Element | Attribute | Assessment |
| ------- | --------- | ---------- |
| Page | `<h1>Settings</h1>` `:143` | exactly one, correct level |
| Group | `<section aria-labelledby={id}>` `:149` | correct landmark + labelling pattern |
| Group heading | `<h2 id={id}>` `:151` | correct level, referenced by the section |
| Card | `<Link href>` | whole card is the hit target — good for touch |
| Icon | `aria-hidden="true"` `:140`, `:166`, `:174` | decorative glyphs correctly hidden |
| Card name | `<h3>` `:169` | correct level under the group `<h2>` |

⚠ Two issues. First, the `aria-labelledby` **id contains a space and an `&`** (`settings-group-Account & Safety`, `settings-group-Integrations & API`). ARIA resolves `aria-labelledby` as a space-separated **ID list**, so an id containing a space is parsed as **two** ids — `settings-group-Account` and `&` — and neither matches the `<h2>`'s actual id. The accessible name of those two sections therefore resolves to nothing. It is inert for a screen-reader user only because the `<h2>` text is adjacent and still read in flow. **Groups 2 and 3 have a broken accessible name.** §24 F2.

Second, there is no `aria-current` or visual "you are here" affordance — but this is a hub with no active state, so that is fine.

---

## 3. UI → component mapping

### 3.1 Imports — the complete list (`page.tsx:1`–`:26`)

| Import | From | Used for |
| ------ | ---- | -------- |
| `Link` | `next/link` | all 21 cards |
| `AlertTriangle` | `lucide-react` | Danger Zone |
| `Bell` | `lucide-react` | Notifications |
| `CalendarRange` | `lucide-react` | Routine |
| `ChevronRight` | `lucide-react` | the hover chevron on every card |
| `Clock` | `lucide-react` | Time Zone |
| `CreditCard` | `lucide-react` | **Subscription *and* Billing** — the only reused icon |
| `Database` | `lucide-react` | Data |
| `Download` | `lucide-react` | Export |
| `FileUp` | `lucide-react` | Import |
| `KeyRound` | `lucide-react` | API Keys |
| `LayoutDashboard` | `lucide-react` | Dashboard |
| `Lock` | `lucide-react` | Privacy |
| `MonitorSmartphone` | `lucide-react` | Active Sessions |
| `Moon` | `lucide-react` | Sleep |
| `Palette` | `lucide-react` | Appearance |
| `Plug` | `lucide-react` | Integrations |
| `Quote` | `lucide-react` | Quotes |
| `Repeat` | `lucide-react` | Habits |
| `Settings2` | `lucide-react` | the page header glyph |
| `ShieldCheck` | `lucide-react` | Security |
| `SlidersHorizontal` | `lucide-react` | Scoring Weights |
| `User` | `lucide-react` | Profile |
| `type LucideIcon` | `lucide-react` | the `ICONS` value type |

**22 icons imported, 22 entries in `ICONS`.** ✅ No unused import, no missing glyph.

### 3.2 What this page does **not** import

| Not imported | Consequence |
| ------------ | ----------- |
| `'use client'` | ✅ The page is a Server Component — zero JS for the hub itself |
| `useState` / `useEffect` / `useRef` / any hook | ✅ It cannot be interactive; the whole page is server-rendered |
| `useSettings` / `useSettingsStore` | The hub does **not** read `UserSettings`. It cannot show "current value" on any card — and does not try |
| `apiRequest` / `fetch` | ✅ No request is made to render this page |
| `@/components/ui/*` (`Card`, `Badge`, …) | The cards are raw `<Link>` + `div`. Every other settings page imports `Card`; this one hand-rolls its surface with `glass-panel` |
| `metadata` export | ❌ No page-level `metadata`. The route inherits `privateMetadata` from `(dashboard)/layout.tsx:26`, so it is `noindex` — correct for an app page, but it also means **no title override** (the browser tab reads whatever the layout sets) |

### 3.3 Transitive dependencies

| File | Lines | Relationship |
| ---- | ----- | ------------ |
| `src/app/(dashboard)/layout.tsx` | — | provides `noindex` + the shell (Sidebar/Header/Footer/MobileNav) |
| `src/components/layout/Sidebar.tsx:31` | — | the **only** other entry point: a single `{ label: 'Settings', href: '/settings' }` nav item |
| `next/link` | — | prefetches every card's target on hover/viewport |

The hub has **no** component dependencies at all. It is the most self-contained page audited.

---

## 4. Frontend architecture

### 4.1 Page structure

| Concern | Reality |
| ------- | ------- |
| Directive | **None** — a Server Component. `'use client'` appears on **20 of the 22** subpages, but not here |
| Data fetching | **None.** No `fetch`, no `apiRequest`, no server data load |
| State | **None.** Not a single `useState` |
| Interactivity | **None.** No form, no toggle, no button, no disclosure. Every affordance is a `<Link>` |
| Loading / `loading.tsx` | **Does not exist** and is not needed — nothing is async |
| `error.tsx` | **Does not exist.** Not needed; the page cannot throw (see §4.3) |
| `not-found.tsx` | **Does not exist** |
| Route-level `metadata` | **None.** Inherits `privateMetadata` |
| Rendering | One `settingsGroups.map` over 5 groups, each a nested `links.map` over 21 links — **21 DOM subtrees**, all static |
| Keying | `key={group.title}` `:149`, `key={link.href}` `:160` — both stable ✅ |
| Memoisation | Unnecessary; the component renders once |

### 4.2 The two type declarations

```ts
interface SettingsLink { name: string; href: string; desc: string }   // :28–32
interface SettingsGroup { title: string; links: SettingsLink[] }       // :34–37
```

`SettingsLink.name` is typed `string`, **not** a literal union. The icon lookup then does:

```ts
const Icon = ICONS[link.name as SettingsIconKey];      // :158
```

`SettingsIconKey` (`:88`–`:109`) is a 21-member literal union declared **separately** from `settingsGroups`. TypeScript cannot check that the two stay in sync, because the assertion at `:158` suppresses the check. The consequence is a **runtime** `undefined`:

- `ICONS[undefined]` → `undefined`
- `<Icon className="h-5 w-5" />` → React throws *"Element type is invalid"*
- The error is not caught by any boundary in this route (none exists) → it propagates to `(dashboard)/layout.tsx`, and if that has no `error.tsx` either, to the nearest ancestor — the whole app shell blanks.

**Adding one link to `settingsGroups` without adding its icon takes down the entire settings hub.** That is a real, cheap-to-hit footgun for the most likely future edit to this file, and it is the file's only substantive weakness. §26.

The `tsc` type-check that runs in CI (`npm run type-check`, per `AGENTS.md`) **will not catch it**, because `as SettingsIconKey` is an explicit assertion.

### 4.3 Why the page cannot realistically throw

Beyond the icon lookup, nothing here can fail at runtime:

- `settingsGroups` is a module-level literal — no I/O, no `await`, no `JSON.parse`.
- Every `href` is a compile-time string literal.
- No `dangerouslySetInnerHTML`, no `eval`, no dynamic `require`.
- `<Link href>` with a static string is resolved at build time.

So the icon-cast at `:158` is the **only** throw site in the file, and it only fires on a code error, not on bad data.

---

## 5. Backend / API architecture

**None.** This page makes no network request and has no server-side data access.

For completeness, the endpoints its **children** use — none of which the hub touches:

| Endpoint | Method | Used by | Notes |
| -------- | ------ | ------- | ----- |
| `/api/settings` | GET + PUT | 10 subpages via `useSettings()` | §5.1 |
| `/api/auth/update-profile` | PATCH | `/settings/profile:64` | `User`, not `UserSettings` |
| `/api/auth/sessions` · `/api/auth/logout-all` | GET/POST/DELETE | `/settings/security:77`, `/settings/sessions:75`/`:98`/`:116` | `DeviceSession` |
| `/api/auth/2fa/{setup,verify,disable}` | POST | `/settings/security:115`/`:133`/`:155` | TOTP |
| `/api/auth/change-password` | POST | `/settings/security:179` | bumps `sessionVersion` |
| `/api/auth/delete-account` | POST | `/settings/danger-zone:92` | |
| `/api/quotes` | GET/POST/DELETE | `/settings/quotes:71`/`:127`/`:153` | |
| `/api/routine` | GET/POST/PUT/DELETE | `/settings/routine:102`/`:125`/`:152`/`:176`/`:194` | |
| `/api/api-keys` · `/api/api-keys/[id]/revoke` | GET/POST | `/settings/api-keys:56`/`:75`/`:108` | |
| `/api/integrations` · `/connect` · `/disconnect` · `/sync` | GET/POST | `/settings/integrations:78`/`:103`/`:140`/`:157` | |
| `/api/billing/config` · `/api/billing/subscription` | GET | `/settings/billing:100`–`:101`, `/settings/subscription:120` | |
| `/api/push-config` · `/api/push/test` · `/api/users/[id]/push-subscriptions` | GET/POST/DELETE | `/settings/notifications:149`/`:197`/`:300`/`:368`/`:388` | |
| `/api/export/{request,status/[id],download/[id]}` | POST/GET | `/settings/export` via `<ExportData>` | |
| `/api/import` | POST | `/settings/import` via `<ImportData>` | |

### 5.1 The one shared contract — `GET`/`PUT /api/settings`

Route: `src/app/api/settings/route.ts` (44 lines). Both handlers call `auth()` and return 401 without a session; **neither accepts a `userId` from the client**.

- `GET` → `userService.getSettings(session.user.id)` (`:16`)
- `PUT` → `userService.updateSettings(session.user.id, json)` (`:37`)

**The route is thin and delegates correctly** (`FILE.MD` compliant) — the only logic in it is the auth check and the error mapping. ✅

The **route's docstring is wrong**, though:

> *"Update settings for the authenticated user. Validated against the settings schema in the service layer; unvalidated payloads are rejected."* (`:26`–`:27`)

Validation *does* happen in the service (`user.service.ts:279` `updateSettingsSchema.safeParse(input)`), so the claim is accurate — but the route passes the **raw parsed body** (`json`) to the service, not a validated value, and the route itself contains **zero** Zod usage. There is no `safeParse` in `route.ts`. A reader looking for the validation the comment points at will not find it in this file. Minor. §24 F5.

**The error mapping is a real weakness** (`route.ts:40`–`:42`):

```ts
const message = error instanceof Error ? error.message : 'Bad Request';
const status  = message === 'Unauthorized' ? 401 : 400;
```

Every failure — a Zod validation error, a Prisma unique-violation, a network timeout, an unexpected `TypeError` — is reported as **400 Bad Request** with the raw exception message in the body. A database outage surfaces to the user as "400: connection terminated unexpectedly". And any thrown error whose message happens to be `'Unauthorized'` becomes a 401 even though `auth()` already returned. §24 F4.

### 5.2 `UserService.updateSettings` — the actual write path (`user.service.ts:275`–`:311`)

```ts
const parsed = updateSettingsSchema.safeParse(input);          // :279
if (!parsed.success) throw new Error(firstZodIssue(parsed.error));   // :280–282

let existing = await this.userRepository.getSettings(userId);   // :284
if (!existing) await this.userRepository.createSettings(userId);// :285–287

const data: Record<string, unknown> = {};                      // :289
for (const [key, value] of Object.entries(parsed.data)) {      // :290
  if (value === undefined) continue;                           // :291
  if (key === 'theme' && value === 'SYSTEM') data.theme = 'AUTO';   // :292–293
  else data[key] = value;                                      // :294–295
}

const updated = await this.userRepository.updateSettings(userId, data);   // :297
if (typeof data.timezone === 'string')                          // :299
  await this.userRepository.update(userId, { timezone: data.timezone });  // :300
await this.auditRepository.create({ userId, action: 'SETTINGS_UPDATED', … });  // :302–307
return updated;                                                 // :309
```

Four things this gets right, all documented and all correct:

1. **`SYSTEM` → `AUTO`** aliasing (`:292`–`:293`), so the client theme toggle never needs to know the DB enum. The schema comment at `settings.schema.ts:5`–`:9` and the enum at `:18` document it.
2. **`timezone` written to `User` as well** (`:299`–`:300`). `AGENTS.md` requires this, and the service comment at `:269`–`:273` explains the exact bug it fixed: the settings page wrote only `UserSettings.timezone` while the auth store optimistically patched `User.timezone`, so the value on screen and the value used to bucket scores could disagree. **Three separate code paths depend on this staying true** — score bucketing, `useUserTimezone`, and every `getPeriodRange` call.
3. **`undefined` is skipped, not written** (`:291`). This is what makes `patchLocal`-style partial patches safe.
4. **`null` is written.** The `.nullable()` time fields are how a user *clears* a time; the pages' comments record that sending `''` instead returned a 400 against the `HH:mm` regex (`settings/habits:82`, `settings/notifications:237`, `settings/profile:8`).

One genuine gap: `updateSettingsSchema` is a plain `z.object`, so **unknown keys are silently stripped**. `parsed.data` contains only schema keys, so the loop at `:290` can never forward an unknown key to Prisma — which is the safe behaviour, and also why `AGENTS.md` warns that *omitting* a field from the schema makes it look like it saves (200) and then revert. I verified this empirically in §7.3.

---

## 6. Database dependency

**None from this page.** The hub performs no query.

For context, the subtree's aggregate dependency: `UserSettings` (the hub's descendants' primary target, **50 columns**), plus `User`, `DeviceSession`, `ApiKey`, `Quote`, `RoutineTemplate`, `Integration`, `PushSubscription`, `NotificationLog`, `AuditLog`, `PasswordResetToken`, `TwoFactorSecret` and `Subscription`/`BillingConfig`.

### 6.1 `model UserSettings` — 50 columns, `prisma/schema.prisma:1938`+

`userId String @unique`, so exactly one row per user, `onDelete: Cascade`. Grouped by domain:

| Group | Columns |
| ----- | ------- |
| Identity | `id`, `userId`, `createdAt`, `updatedAt` |
| Localization (6) | `timezone`, `language`, `dateFormat`, `timeFormat`, `weekStartsOn` — plus `user`, so 5 data columns |
| UI/UX (6) | `theme`, `customThemeColors`, `soundEnabled`, `animationsEnabled`, `compactMode`, `defaultView`, `showCompletedTasks` |
| Sleep (8) | `targetBedtime`, `targetWakeTime`, `minSleepDuration`, `sleepReminder`, `sleepReminderTime`, `autoStartSleepAfterMinutes`, `sleepAutoStartEnabled`, `sleepAutoStartAfterMinutes` |
| Scoring (3) | `weightNonNeg`, `weightGrowth`, `weightBonus` |
| Notifications (14) | `notificationsEnabled`, `emailNotifications`, `pushNotifications`, `smsNotifications`, `quietHoursStart`, `quietHoursEnd`, 5 per-category toggles, `advanceNotificationMinutes` |
| Reminders (7) | `dailyReminder`, `dailyReminderTime`, `habitReminders`, `goalReminders`, `weeklyReviewReminder`, `monthlyResetReminder`, `focusReminders`, `breakReminders` |
| Data (3) | `retroactiveEditDays`, `autoArchiveCompletedDays`, `dataRetentionDays` |
| Privacy (2) | `profilePublic`, `shareStats` |
| Advanced (2) | `aiInsightsEnabled`, `experimentalFeatures` |

### 6.2 The `timezone` invariant — documented and load-bearing

The schema comment at `:1946`–`:1957` on `timezone` is the most consequential comment in the model:

> *"AUTHORITATIVE timezone field. Every date-bucketing read (habit logs, daily scores, streaks, analytics ranges, sleep sessions) resolves `UserSettings.timezone`, not `User.timezone`. It previously defaulted to "Asia/Kolkata" while `User.timezone` defaulted to "UTC", so a user who had never chosen a timezone had two different answers depending on which column a given code path happened to read. `User.timezone` now defaults to the same value, and `UserService.updateSettings` writes both in one call. Defaulting to "UTC" also matches `DEFAULT_TZ` in `lib/dates.ts`."*

✅ **The invariant holds.** `DEFAULT_TZ = 'UTC'` (`lib/dates.ts:25`), `UserSettings.timezone @default("UTC")`, and `user.service.ts:299`–`:300` writes both columns together. This is the single most important correctness property in the settings subsystem, and the hub is what a user navigates to in order to change it (`/settings/timezone`).

### 6.3 Two columns with no UI anywhere in the subtree

| Column | Default | Status |
| ------ | ------- | ------ |
| `defaultView String @default("dashboard")` | `"dashboard"` | ❌ **in the schema** (`settings.schema.ts:23`) and on the model, but **no settings page writes it** — I grepped all 22 subpages for `defaultView` and it appears only in `/settings/dashboard`'s *description text* ("Choose your default dashboard view", `page.tsx:46`), never in a `save()`. The actual dashboard prefs are the 11 `localStorage` widget toggles (`routineos.dashboard.widgets`). So the hub **promises a "default dashboard view" that does not exist.** §24 F1 |
| `soundEnabled Boolean @default(true)` | `true` | In the schema (`:20`) and on the model. No settings page writes it; the only consumer-side toggle is `AchievementPopup`. Effectively dead. §24 F6 |

---

## 7. The navigation contract

This section is the substance of the audit, because for a link directory the contract **is** the feature.

### 7.1 Route ↔ link reconciliation — verified exhaustively

```
declared links (href: '/settings/…') : 21
real route directories              : 22
routes not linked                   : /settings/account      → §25
links without a matching route      : (none)                  ✅
duplicate hrefs                     : (none)                  ✅
duplicate link names                : (none)                  ✅
icons declared                      : 22  (21 links + header Settings2)
```

Every link resolves to a real route. **Zero broken hrefs.** The only asymmetry is the orphan, and it is a redirect rather than a stub — see §25.

### 7.2 Sidebar reachability

`src/components/layout/Sidebar.tsx:31` — `{ label: 'Settings', icon: Settings, href: '/settings' }`. **One** nav entry, pointing at the hub. So the hub is the sole entry point to all 21 subpages from navigation, which makes it load-bearing for discoverability despite being 184 static lines.

`MobileNav` and `Header` were checked in the cross-page sweep: they do not add per-subpage settings entries, so the hub is the only path.

### 7.3 ✅ Verified: every `save()` key maps to a real schema field

This is the failure mode `AGENTS.md` warns about — *"a field missing from that schema appears to save (the PUT returns 200) and then reverts on reload."* I extracted every key from every `save({ … })` call across all 22 subpages and diffed them against `updateSettingsSchema`'s 51 keys:

```
schema keys                        : 51
unmapped save() keys (real)        : 0   ✅
false positives                    : 2   (the literal "HH" inside the
                                     'HH:mm regex' comments in
                                     habits/page.tsx:82 and
                                     notifications/page.tsx:237)
```

**No subpage writes a field the schema would strip.** The per-category notification toggles — the exact case the schema comment at `settings.schema.ts:66`–`:70` says was once broken ("without these columns the payload was silently stripped by Zod and the toggles appeared to save but reset on reload") — are all present and correct. This is a positive finding worth recording.

### 7.4 ✅ Verified: the `dailyReminderTime` double-ownership bug is fixed

`settings.store.ts:8`–`:13` lists three concrete bugs this store was created to fix. Bug #2 was:

> *"`/settings/habits` and `/settings/notifications` both owned `dailyReminderTime` with conflicting `'09:00'` vs `'20:00'` fallbacks."*

Current state:

| File | Line | Default |
| ---- | ---- | ------- |
| `settings/habits/page.tsx` | `:33` | `const DEFAULT_DAILY_REMINDER_TIME = '20:00'` |
| `settings/habits/page.tsx` | `:85` | `settings.dailyReminderTime?.trim() \|\| DEFAULT_DAILY_REMINDER_TIME` |
| `settings/habits/page.tsx` | `:141` | `helperText={\`Defaults to ${DEFAULT_DAILY_REMINDER_TIME} in your local timezone.\`}` |
| `settings/notifications/page.tsx` | `:238` | `settings.dailyReminderTime?.trim() \|\| '20:00'` |

✅ Both resolve to `'20:00'`, and the habits page derives its helper text from the same constant rather than hard-coding a second literal — so the two cannot drift again. The `||` fallback is applied on **every** save, meaning a user who has never touched the field silently persists `20:00` the first time they toggle anything else on either page. That is a real (if minor) side effect: **saving any unrelated notification preference materialises a `dailyReminderTime` the user never chose.** §24 F7.

### 7.5 The hub's own claims vs reality

| Claim on the hub | Verified? |
| ---------------- | --------- |
| `Profile` — "Manage your personal details" | ✅ `PATCH /api/auth/update-profile`, fields `name`/`displayName`/`bio`/`avatarUrl` (`profile:23`–`:28`) |
| `Appearance` — "Customize the look and feel" | ✅ via `useSettings`, drives `theme`/`animationsEnabled`/`compactMode` |
| `Time Zone` — "Set the timezone used for dates" | ✅ writes both `User` and `UserSettings.timezone` (`user.service.ts:299`–`:300`) |
| `Dashboard` — "Choose your default dashboard view" | 🟠 The page toggles **11 dashboard widgets** via `localStorage`, and nothing reads or writes `defaultView`. The description promises a control that isn't there. §24 F1 |
| `Habits` — "Configure habit defaults" | ✅ `habitReminders`/`goalReminders`/`dailyReminder`/`dailyReminderTime` |
| `Routine` — "Routine preferences and defaults" | ✅ 5 CRUD calls to `/api/routine` (templates) |
| `Sleep` — "Set sleep targets and reminders" | ✅ 8 sleep columns |
| `Quotes` — "Manage your quotes and widget pool" | ✅ `/api/quotes` |
| `Scoring Weights` — "Adjust how habits are scored" | ✅ `weightNonNeg`/`weightGrowth`/`weightBonus` |
| `Notifications` — "Configure reminders" | ✅ 21 notification+reminder columns, plus push subscription |
| `Security` — "Password, 2FA and account security" | ✅ password, TOTP setup/verify/disable, device sessions |
| `Active Sessions` — "Review and revoke logins" | ✅ `/api/auth/sessions`, `/logout-all` |
| `Privacy` — "Control profile visibility" | ✅ `profilePublic`/`shareStats` |
| `Integrations` — "Connect external services" | ✅ connect/disconnect/sync |
| `API Keys` — "Create keys for the REST API" | ✅ `/api/api-keys`, revoke |
| `Subscription` — "Plan and usage details" | ✅ `/api/billing/subscription` |
| `Billing` — "Payment methods and invoices" | ✅ `/api/billing/config` + subscription |
| `Data` — "Manage your stored data" | ✅ `retroactiveEditDays`/`autoArchiveCompletedDays`/`dataRetentionDays` |
| `Export` — "Request an export of your data" | ✅ `POST /api/export/request` + polling |
| `Import` — "Restore data from a JSON backup" | ✅ `POST /api/import` |
| `Danger Zone` — "Account deletion" | ✅ `POST /api/auth/delete-account` |

**20 of 21 descriptions are accurate.** The one that is not is `Dashboard`.

---

## 8. Complete user actions (serial)

There is exactly one user action.

### 8.1 Navigate to a settings subpage

```
user lands on /settings                       (via Sidebar.tsx:31, or by URL)
  │
  ├─ Server Component render — zero client JS for the hub itself
  │   settingsGroups.map → 5 <section>
  │     group.links.map → 21 <Link>
  │       ICONS[link.name as SettingsIconKey]         ← the only throw site  :158
  │
  ├─ next/link prefetches each card's target on viewport intersection
  │
  └─ click a card
       → client-side route transition (no full page load)
       → the target subpage mounts, and for the 10 store-backed pages:
            useSettingsLoader(enabled)  →  store.load()  →  GET /api/settings
```

There is no confirmation, no permission check, no dirty-state guard, and no scroll restoration beyond Next's default. The hub holds no state to lose.

### 8.2 The click path in detail

| Step | What happens | Cost |
| ---- | ------------ | ---- |
| hover | `next/link` prefetches the route's RSC payload + chunks | 1 prefetch per card, deduplicated by `href` |
| click | client navigation; the hub unmounts | — |
| target mounts | 20 of 22 subpages are `'use client'` and re-evaluate the auth gate | — |
| store-backed pages | `useSettingsLoader` runs `store.load()`; the store short-circuits if `status === 'ready'` (`settings.store.ts:96`), and a burst of mounts shares one in-flight request (`:93`–`:95`) | **≤ 1 `GET /api/settings` for the whole session**, thanks to the layout loader |
| `localStorage`-backed pages | `/settings/dashboard` reads `routineos.dashboard.widgets`; `/settings/export` and `/settings/import` read nothing | — |

✅ The store's load-deduplication is correct and is the reason `AGENTS.md` can claim every settings page goes through one row: `loadInflight` is a module-level promise (`:75`), checked before and assigned atomically (`:93`–`:114`), cleared in `finally` (`:111`–`:113`).

---

## 9. What can the user create

**Nothing from this page.** The hub renders only `<Link>` elements — there is no `<button>`, `<form>`, `<input>`, `<select>` or `<textarea>` in `page.tsx`. Creating a setting happens on the subpages:

| Subpage | Creates |
| ------- | -------- |
| `/settings/security` | a TOTP secret (`/api/auth/2fa/setup`) |
| `/settings/api-keys` | an API key (`POST /api/api-keys`) — and the secret is shown exactly once |
| `/settings/quotes` | a `Quote` row |
| `/settings/routine` | a `RoutineTemplate` row |
| `/settings/integrations` | an `Integration` link (OAuth redirect) |
| `/settings/notifications` | a `PushSubscription` |
| `/settings/export` | an export job |
| `/settings/profile` | updates `User` |

The hub's own contribution to creation is **discovery**: it is the only path to any of those, so removing a card removes the user's only route to the feature.

## 10. What can the user edit

**Nothing from this page.** No editable control exists here.

The subtree edits **50 `UserSettings` columns** plus `User` profile fields, `DeviceSession`, password, 2FA state, `ApiKey`, `Quote`, `RoutineTemplate`, `Integration` and `PushSubscription`. Two write mechanisms, and this is where the architecture pays off:

| Mechanism | Users |
| --------- | ----- |
| `useSettings().save(patch)` → `PUT /api/settings` | 10 subpages: appearance, data, habits, notifications, privacy, scoring, sleep, timezone (8 store-backed) |
| `apiRequest(…, { method })` to a domain endpoint | 12 subpages: api-keys, billing, danger-zone, export, import, integrations, profile, quotes, routine, security, sessions, subscription |

Two distinct optimistic-update strategies, both correct:

- **Store `save()`** — optimistic patch first (`:127`–`:133`), then reconcile against the returned row (`:140`–`:141`), **rollback on failure** (`:144`–`:150`). A rejected value never remains on screen.
- **`patchLocal(patch)`** — local-only, for text fields while typing (`:156`–`:162`). Explicitly documented as local-only so a page cannot accidentally persist keystrokes.

## 11. What can the user delete

**Nothing from this page.**

Worth stating explicitly because it is a security-relevant fact about this route: **`/settings` has no destructive path, and `/settings/danger-zone` — which is the only page that deletes the account — is three clicks away and visually identical to `Export` and `Import`.** It is grouped under "Account & Data" alongside both, separated only by a `text-base font-semibold` heading and an `AlertTriangle` icon. There is no colour differentiation, no warning treatment on the card itself, and no confirmation step at this level.

Given that the entire page is `<Link>`s, the *only* thing standing between a misclick and account deletion is the destination page's own confirmation UI (which `danger-zone:211` lines presumably provide). That is an acceptable design — confirmations belong at the point of action — but the hub itself gives no hint that one of its 21 links is terminal. §24 F8.

---

## 12. Cross-page dependencies

### 12.1 Inbound — who depends on `/settings`

| Consumer | Relationship |
| -------- | ------------ |
| `src/components/layout/Sidebar.tsx:31` | the **only** nav entry; renders as an active item when `pathname` starts with `/settings` |
| `src/app/(dashboard)/layout.tsx:26` | provides `privateMetadata` → the hub is `noindex` |

Nothing imports `SettingsHubPage` — it is a leaf route, like every other audited page.

### 12.2 Outbound — what the hub links to (21 edges)

Every one of the 21 `<Link>`s is an outbound dependency on a route file. Full table in §2.1; the per-page line counts:

| Subpage | Lines | `'use client'` | Data source |
| ------- | ----- | -------------- | ----------- |
| `/settings/profile` | 192 | yes | `PATCH /api/auth/update-profile` |
| `/settings/appearance` | 350 | yes | `useSettings` |
| `/settings/timezone` | 183 | yes | `useSettings` |
| `/settings/dashboard` | 191 | yes | **`localStorage`** `routineos.dashboard.widgets` |
| `/settings/habits` | 188 | yes | `useSettings` |
| `/settings/routine` | 467 | yes | `/api/routine` |
| `/settings/sleep` | 309 | yes | `useSettings` |
| `/settings/quotes` | 387 | yes | `/api/quotes` |
| `/settings/scoring` | 261 | yes | `useSettings` |
| `/settings/notifications` | 896 | yes | `useSettings` + push + `/api/push-config` |
| `/settings/security` | 473 | yes | `/api/auth/*`, `/api/auth/sessions` |
| `/settings/sessions` | 273 | yes | `/api/auth/sessions`, `/logout-all` |
| `/settings/privacy` | 180 | yes | `useSettings` |
| `/settings/integrations` | 393 | yes | `/api/integrations*` |
| `/settings/api-keys` | 297 | yes | `/api/api-keys` |
| `/settings/subscription` | 293 | yes | `/api/billing/subscription` |
| `/settings/billing` | 266 | yes | `/api/billing/config`, `/subscription` |
| `/settings/data` | 169 | yes | `useSettings` |
| `/settings/export` | 81 | yes | `/api/export/*` |
| `/settings/import` | 79 | yes | `/api/import` |
| `/settings/danger-zone` | 211 | yes | `/api/auth/delete-account` |
| **`/settings/account`** | **5** | **no** | none — `redirect('/settings/profile')` |

**8,613 lines** across the 22 subpages, plus the 184-line hub.

### 12.3 The shared infrastructure the hub's children rely on

| File | Lines | Role |
| ---- | ----- | ---- |
| `src/store/settings.store.ts` | 174 | zustand store: `load`/`save`/`patchLocal`/`reset`, `applyAppearance` |
| `src/hooks/useSettings.ts` | 71 | the only sanctioned read/write hook; also `useSettingsLoader` |
| `src/lib/validation/settings.schema.ts` | 75 | `updateSettingsSchema` (51 keys), `settingsQuerySchema` |
| `src/app/api/settings/route.ts` | 44 | `GET` + `PUT` |
| `src/server/services/user.service.ts` | `:258`–`:311` | `getSettings`, `updateSettings` |
| `src/components/dashboard/DashboardWidgets.tsx` | — | `DASHBOARD_WIDGETS` (11), `DASHBOARD_WIDGETS_KEY`, `emitPreferencesChanged`, `WidgetGate` |
| `src/hooks/useAuth.ts` | — | the auth gate 20 of 22 subpages use |

### 12.4 🔴 Six of 22 subpages bypass the settings store

`AGENTS.md` states the rule: *"Every page under `src/app/(dashboard)/settings` goes through it — do **not** hand-roll a `useState` + `GET /api/settings` fetch."*

| Subpage | Bypasses because | Verdict |
| ------- | ---------------- | ------- |
| `/settings/dashboard` | stores prefs in **`localStorage`** under `routineos.dashboard.widgets`, imported from `DashboardWidgets` | ✅ **Deliberate and documented.** `AGENTS.md` names it as "a deliberate exception". Per-device, not per-account — the page says so at `:180`–`:186` |
| `/settings/profile` | edits **`User`**, not `UserSettings` | ✅ Legitimate — no `UserSettings` column holds a display name or bio |
| `/settings/quotes` | manages **`Quote`** rows | ✅ Legitimate — different table |
| `/settings/routine` | manages **`RoutineTemplate`** rows | ✅ Legitimate |
| `/settings/integrations` | manages **`Integration`** links | ✅ Legitimate |
| `/settings/api-keys` | manages **`ApiKey`** rows | ✅ Legitimate |
| `/settings/subscription` / `/settings/billing` | read **`BillingConfig`/`Subscription`** | ✅ Legitimate |
| `/settings/security` / `/settings/sessions` | password, 2FA, **`DeviceSession`** | ✅ Legitimate |
| `/settings/export` / `/settings/import` | export jobs / `POST /api/import` | ✅ Legitimate |
| `/settings/danger-zone` | account deletion | ✅ Legitimate |

✅ **The store rule is respected exactly where it applies.** Every page that owns a `UserSettings` column uses `useSettings`; every page that owns a *different* table talks to that table's endpoint. `/settings/dashboard` is the only genuine exception and it is the one `AGENTS.md` explicitly blesses. This is a positive finding — the documented rule survived contact with 22 pages.

### 12.5 ⚠️ One store consumer is not on the hub

`settings/sessions/page.tsx:24` imports `useSettingsStore` directly (not the `useSettings` hook) for exactly one thing:

```ts
// :119
useSettingsStore.getState().reset();
```

after `POST /api/auth/logout-all`. Same in `danger-zone/page.tsx:101` after `delete-account`.

That is **correct** — `reset()` is an action, and `useSettings()`'s `actions` object already exposes it, so either path works. Using `getState()` outside React is the right idiom for an imperative post-logout cleanup. Not a defect; worth noting so the direct import is not mistaken for a store-rule violation. §24 F9 (informational).

---

## 13. Impact analysis

**If `/settings` were deleted:** 21 `<Link>`s disappear and the `Sidebar` entry (`Sidebar.tsx:31`) becomes a 404. **No feature is lost** — all 22 subpage routes keep working by URL, and `useSettingsLoader` in the layout keeps loading the row for the rest of the app. But the settings subsystem becomes **unreachable by navigation**, which for a product whose entire value proposition is habit tracking is a total loss of that surface.

**If one card were removed from `settingsGroups`:** the subpage still exists and still works by URL, but the feature becomes undiscoverable. Because the hub is the *only* nav entry (`§7.2`), this is how a feature silently dies. The card list is therefore a **product manifest**, not a UI detail — and it is duplicated nowhere, which is good (§7.1).

**If a card were added without an `ICONS` entry:** 🔴 the **entire hub crashes**, not just the new card. `ICONS[undefined]` is `undefined`; `<undefined />` throws `Element type is invalid`; there is no `error.tsx` in this route or in `(dashboard)`, so the error propagates and blanks the settings section of the shell. TypeScript cannot catch it because of the `as SettingsIconKey` assertion at `:158`. §26.

**If `defaultView` were implemented** (`§24 F1`): `/settings/dashboard`'s description would become accurate and `UserSettings.defaultView` would stop being dead. Low effort — the column, the schema entry, and the read side already exist.

**If the `Account & Safety` / `Integrations & API` ids were slugified** (`§24 F2`): the two sections would gain a correct accessible name. One helper (`group.title.replace(/[^a-z0-9]+/gi, '-').toLowerCase()`) and the two template literals.

**If `/settings/account` were deleted** (§25): nothing changes. It has no importers, no nav entry, and redirects to a page that is itself linked. It is 5 lines of harmless indirection — but it is also a **route that exists in the sitemap of an app that advertises `noindex`**, and it is the kind of leftover that makes a route inventory lie.

**Blast radius of the `PUT /api/settings` error mapping** (§24 F4): every one of the 8 store-backed subpages surfaces a `400` with a raw exception message on any server failure. Because `save()` rolls back optimistically, the *values* stay correct — but the user sees an error that blames them (400) for what is a server fault, and on a transient DB blip every settings page in the app shows it.

**Blast radius of the shared-store design:** the correctness property that *all 22 pages agree on every column* rests on `loadInflight` (`settings.store.ts:75`) being module-level. If it were per-component, a burst of mounts would issue N requests and two pages could briefly disagree — the exact bug the store's header comment (`settings.store.ts:6`–`:13`) says it was built to kill. It is correct today, and it is a single line of defence. Worth a test. §24 F10.

---

## 14. Current System Capabilities

| Capability | Evidence |
| ---------- | -------- |
| 5-group, 21-link settings hub | `page.tsx:39`–`:86` |
| Every link resolves to a real route (0 broken hrefs) | §7.1 — verified exhaustively |
| One nav entry, so the hub is the sole discoverable path | `Sidebar.tsx:31` |
| Zero client JS for the hub itself — a Server Component | no `'use client'`, no hooks, no state |
| Server-rendered links, so they are in the initial HTML | `next/link` in an RSC tree |
| Automatic prefetch of all 21 targets | `next/link` default |
| Correct heading hierarchy `h1 → h2 → h3` | `:143`, `:151`, `:169` |
| `aria-labelledby` on every group `<section>` | `:149` |
| Whole-card hit target with a hover lift + border + shadow | `:161`–`:164` |
| Chevrons nudged on hover, decorative glyphs `aria-hidden` | `:172`–`:175`, `:166` |
| `min-w-0` on the text block so long labels truncate, not overflow | `:168` |
| Icon hover colour transition matching the card's `group-hover` | `:165`–`:166` |
| Per-device widget prefs honoured, not silently ignored | `/settings/dashboard` writes the key `WidgetGate` actually reads (§26) |
| **Every `save()` key in all 22 subpages maps to a schema field** | §7.3 — verified by extraction, 0 unmapped |
| **The `dailyReminderTime` double-ownership conflict is fixed at the source** | §7.4 — both pages now `20:00`, habits derives its helper text from the constant |
| **The store rule is respected in all 22 pages** | §12.4 — 8 store-backed, 1 documented `localStorage` exception, 13 different-table |
| `timezone` written to `User` and `UserSettings` in one call | `user.service.ts:299`–`:300` |
| `SYSTEM → AUTO` theme aliasing so the client never sees the enum | `user.service.ts:292`–`:293` |
| Unknown keys stripped by Zod before reaching Prisma | `user.service.ts:279`–`:295` |
| `undefined` skipped so partial patches are safe | `user.service.ts:291` |
| `null` accepted so time fields are clearable | `settings.schema.ts:10`, page comments at `habits:82`, `notifications:237` |
| Optimistic write + reconcile + rollback on the shared store | `settings.store.ts:125`–`:154` |
| Concurrent loads deduplicated to one request | `settings.store.ts:75`, `:93`–`:95` |
| Store reset on sign-out, including the `<html>` appearance classes | `settings.store.ts:164`–`:173` |
| `dark` class left exclusively to `next-themes` | `applyAppearance` toggles only `reduce-motion` / `compact-mode` (`:64`–`:72`) |
| Every settings page audited for the store rule | §12.4 |

---

## 15. Currently NOT Supported

| Not supported | What is missing |
| ------------- | --------------- |
| **A "default dashboard view"** | 🔴 `/settings/dashboard`'s card says *"Choose your default dashboard view"* (`page.tsx:46`) and `UserSettings.defaultView` + its schema entry both exist — but **no page reads or writes it**, and the page itself toggles 11 per-device widgets instead. The hub advertises a control that does not exist. §24 F1 |
| Search / filter / grouping toggle | The hub is 21 links in 5 fixed groups; there is no query, no collapse, no "show only changed" |
| A "recommended" or "attention needed" marker | No card indicates which sections are unconfigured (e.g. 2FA off, no API key, no push subscription) |
| Deep-linking to a specific settings page | No subpage state in the URL; not relevant for a static hub |
| Ordering or customisation | The group order and link order are hard-coded. No drag, no sort, no favourites |
| Route-level `metadata` | No `export const metadata` — the hub inherits the layout's, so the document title is the layout's, not "Settings" |
| A `loading.tsx` / `error.tsx` | Neither exists. Not needed for a static page — **except** that the icon-cast crash (§26) has no boundary |
| Per-account dashboard widget sync | Widget prefs are `localStorage`, so they do not follow the user across devices. The page says so (`:180`–`:186`) ✅ honest, but it is a capability gap |
| A `defaultView` consumer | Even if written, nothing would read it |
| Tests | `tests/` has 6 files. **None** touches the settings store, the settings schema, or any settings page — including the two documented double-ownership bugs. §24 F10 |
| Keyboard shortcut to settings | No command-palette entry (verified: `CommandPalette.tsx` has no settings route) |
| Unsaved-changes warning | Not applicable here; but the 8 store-backed pages have no dirty-tracking either |

---

## 16. Loading / Error / Empty / Edge states

### 16.1 The complete state list for this page

**One state: rendered.** That is exhaustive and correct.

| State | Needed? | Present? |
| ----- | ------- | -------- |
| Loading | ❌ nothing is async | n/a — and correctly absent |
| Empty | ❌ the 21 links are compile-time literals; there is no data to be empty | n/a — correctly absent |
| Error | ❌ the page cannot fail on bad data (§4.3) | n/a — but the icon-cast crash at `:158` has **no boundary to catch it** (§26) |
| Partial | ❌ there is no partial state | n/a |

There is no `Skeleton`, no spinner, no `EmptyState` import, no error boundary. For a static Server Component that is the right answer, and it is worth stating plainly because 20 of its 22 siblings all implement this triad and it would be easy to assume the hub was an oversight.

### 16.2 The edges that do exist, and how they are handled

| Edge | Handling |
| ---- | -------- |
| **Long link name** | `min-w-0` on the text block (`:168`) + `truncate` is *not* applied — so a very long name would wrap to 2–3 lines rather than truncate. Every current name is ≤ 17 chars, so this never triggers. The `min-w-0` is defensive against a future long name in a grid track. |
| **Long description** | `text-sm text-muted-foreground` with no clamp. Longest current value is *"Choose your default dashboard view"* (39 chars); the grid column is ≥ ~28rem at `md:`, so every description fits on one line today. A longer one would wrap and stretch one card — `items-start` (`:161`) keeps the icon aligned, so the layout degrades acceptably. |
| **375px viewport** | `grid gap-4 md:grid-cols-2` → single column below `md`. The icon tile (40px) + `gap-4` + text fits in 375 − 32 (page padding) = 343px. ✅ |
| **Keyboard navigation** | The whole card is one `<Link>`, so it is a single tab stop with a native focus ring. ✅ No nested focusables. |
| **Long-press / middle-click** | Native `<Link>` semantics: opens a new tab. ✅ |
| **Screen-reader group name** | 🔴 broken for the two groups whose `title` contains a space (§2.2, F2) |
| **Reduced motion** | The card uses `transition-all duration-300 ease-out-expo hover:-translate-y-0.5`. ⚠ **`transition-all` with no `motion-reduce:` guard** — the `-translate-y-0.5` lift animates for motion-sensitive users. This is the same class of finding as `TrendCard`'s unguarded Recharts animation (`recap.md` F5). §24 F3 |
| **A `href` with a typo** | 404. §7.1 verified none exist. |
| **A missing icon** | 🔴 whole-page crash (§26) |
| **A duplicate link** | Would render two identical cards. §7.1 verified none exist. |

### 16.3 What the user cannot do from here

No state to reset, no data to refresh, no way to search, no keyboard shortcut, no way to return to `/settings` other than the Sidebar (the hub has no breadcrumbs and is not a parent-layout route).

---

## 17. Authentication & security

### 17.1 Route protection

The hub lives inside `src/app/(dashboard)/`, so it inherits:

- `src/app/(dashboard)/layout.tsx:26` — `export const metadata = privateMetadata('RoutineOS')`, giving every route in the group `noindex`
- `src/proxy.ts` — redirects unauthenticated requests to `/login`

✅ **The hub does not need its own auth check**, because it renders no user data. Every card's href is a static string; there is no per-user content to leak. This is the correct pattern and the reason the page can be a Server Component with zero data access.

The **20 subpages** each implement their own gate via `useAuth().isAuthenticated` with a hand-rolled "Sign in required" card — I verified 20 of 22 have an `isAuthenticated` check (the exceptions being `/settings/account`, the 5-line redirect, and the hub itself). So the auth UX is **duplicated 20 times** rather than factored into one shared component. §24 F11.

### 17.2 What this page exposes

| Surface | Exposure |
| ------- | -------- |
| User data | **none** |
| Session state | **none** |
| Tokens / keys | **none** |
| Write capability | **none** — no form, no button |
| Attack surface | 21 static `<Link>`s |

The hub is the **lowest-risk page in the settings subtree**. A reflected-XSS or injection finding is structurally impossible: there is no user input, no `dangerouslySetInnerHTML`, and no dynamic `href`.

### 17.3 The risk this page *creates* by omission

Because the hub is a static manifest with no auth logic of its own, **it cannot enforce anything about its children.** Two concrete consequences:

1. **A subpage that forgets its `isAuthenticated` gate would be reachable from the hub with no visual warning.** The hub provides no lock icon, no "requires re-authentication" badge. (20 of 22 do gate correctly, so this is latent.)
2. **`/settings/danger-zone` is presented identically to `/settings/export`.** The hub does not mark the one terminal action on the page. §11, §24 F8.

### 17.4 Destructive-action discoverability

| Concern | Status |
| ------- | ------ |
| Is the delete path one click from the hub? | Yes — `/settings/danger-zone` is card 21 of 21 |
| Is it visually distinguished? | Only by the `AlertTriangle` glyph; same `glass-panel`, same hover |
| Is it grouped away from the safe actions? | It shares the "Account & Data" group with `Data`, `Export`, `Import` |
| Is there a confirmation at the hub? | n/a — no dialogs here |
| Does the destination confirm? | Out of scope for this file; `danger-zone/page.tsx` is 211 lines and is audited separately |
| Is there a typed confirmation? | Out of scope |

The design is defensible (confirm at the point of action, not in a menu), but the hub is the natural place for a visual "irreversible" marker and does not provide one.

### 17.5 Rate limiting

n/a for this page — no request is made.

---

## 18. Performance

### 18.1 This page's cost

| Metric | Value | Note |
| ------ | ----- | ---- |
| Requests to render | **0** | no `fetch`, no `apiRequest`, no server data load |
| Client bundle contribution | **0 bytes** | Server Component — only the icon SVGs and the RSC payload |
| Client state | none | no store, no hooks |
| Re-renders | 1 | pure render of a module-level literal |
| DOM nodes | ~21 cards × 8 elements + 5 sections + header ≈ **190** | trivial |
| Largest contentful paint | header `h1` + 5 group headings | server-rendered, no font or image blocking beyond the app shell |
| Cumulative layout shift | **0 in practice** | no images, no async content, no late-arriving data |

**This is the cheapest page in the entire audit set.** It is also the only page where I can state the full cost with certainty, because there is nothing dynamic to measure.

### 18.2 What it costs the browser after mount

The one non-trivial item is **`next/link` prefetching**. All 21 targets are in the viewport-or-near it on a typical desktop (2-column grid, ~5 rows), so Next will prefetch the RSC payload and route chunks for **all 21 subpages** as the user scrolls. Measured against the subtree:

| Prefetched payload | Lines |
| ------------------ | ----- |
| `/settings/notifications` | 896 |
| `/settings/routine` | 467 |
| `/settings/security` | 473 |
| `/settings/routine` + `notifications` + `security` alone | **1,836** |
| **all 21 subpages** | **8,613** |

On a fast connection this is a net **win** — every navigation is instant, which is exactly the point of a hub. On a metered/slow connection it is 8.6k lines of route JS pulled before the user has clicked anything, including the two heaviest pages in the app.

Next only prefetches `<Link>` targets in the viewport by default, so the exposure grows as the user scrolls rather than all at once. The mitigation, if it were ever needed, is `prefetch={false}` on the heaviest targets. **This is a deliberate trade-off, correctly resolved in favour of navigation speed** — worth recording as a decision rather than a defect. §24 F12 (informational).

### 18.3 The performance-relevant consequence of the store design

Because `useSettingsLoader` runs in `(dashboard)/layout.tsx` and `load()` short-circuits on `status === 'ready'` (`settings.store.ts:96`) with a shared in-flight promise (`:75`, `:93`), **visiting the hub costs zero settings requests** and so does visiting all 22 subpages in sequence. Total for the whole subtree: **1 `GET /api/settings`**.

Without that, the bug the store's header comment documents would return: four sibling pages each issuing their own fetch (`:6`–`:9`), two of them disagreeing about `dailyReminderTime` (`:10`–`:11`).

✅ This is the best-engineered part of the settings subsystem and the direct payoff of the single-source-of-truth decision.

---

## 19. External integrations

| Integration | Present? | Detail |
| ----------- | -------- | ------ |
| **Neon / Postgres** | ❌ from this page | none |
| **Third-party APIs** | ❌ | none |
| **Auth (NextAuth)** | ❌ from this page | via `proxy.ts` + the layout, implicitly |
| **lucide-react** | ✅ | 22 icons, tree-shaken; SVGs only, no runtime cost beyond the component |
| **next/link** | ✅ | the only mechanism |
| **Analytics / telemetry** | ❌ | no event is emitted for a hub visit — a `/settings` pageview is not recorded anywhere in this file |

⚠ The last row is worth noting in the context of the rest of the audit: `AGENTS.md` lists several places where a **silent catch** hides a failure (`recap.md` F21 documents one). The hub has the opposite problem — there is nothing to fail, but equally nothing to observe. A page that exists purely to be a manifest is legitimately uninteresting to instrumentation; recording it as a limitation rather than a finding.

---

## 20. Background jobs / cron effects

**None.** No cron writes anything this page reads, and this page reads nothing.

| Cron | Schedule | Relevance to `/settings` |
| ---- | -------- | ----------------------- |
| `/api/cron/compute-daily-scores` | `0 1 * * *` | Writes `DailyScore`. `/settings/data` exposes `dataRetentionDays` (default 365) and `autoArchiveCompletedDays` (default 90) — **but nothing in the repo reads either column.** See below. |
| `/api/cron/generate-insights` | `0 2 * * 0` | A stub returning `generated: 0`. `/settings` does not gate it. |

🔴 **The three `/settings/data` columns are not wired to anything.** `retroactiveEditDays` (default 3), `autoArchiveCompletedDays` (default 90) and `dataRetentionDays` (default 365) are all in `updateSettingsSchema` (`settings.schema.ts:61`–`:63`), on the model (`schema.prisma:2082`–`:2084`), and editable at `/settings/data:33` — but I found **no consumer** that reads any of them. They are three settings the user can change with no observable effect, in either direction. §24 F13.

This is the same failure class as `defaultView` (§6.3) and `soundEnabled`: a column that satisfies the schema rule, so it *looks* correct, but is inert. The schema is complete (§7.3) — **completeness is not the same as wiring**, and these four columns are exactly where the two diverge.

`aiInsightsEnabled` (default `true`) is also in that category unless something gates `/dashboard`'s `insights` widget on it — worth checking in the `insights` widget's own audit, not here.

---

## 21. Data flow diagrams

### 21.1 Render — the whole page

```
 request GET /settings
        │
        ▼
 src/proxy.ts ── unauthenticated? ──► redirect /login
        │
        ▼
 (dashboard)/layout.tsx
   ├─ metadata = privateMetadata('RoutineOS')          :26   → noindex
   ├─ <Sidebar>  ── includes { href: '/settings' }      :31
   └─ <Header> <main id="main-content"> <Footer> <MobileNav>
                 <FloatingFocusBar> <CelebrationHost> <SleepPromptHost>
        │
        ▼
 settings/page.tsx            ◄── SERVER COMPONENT. No 'use client'.
   │
   ├─ module init: settingsGroups (21 links, 5 groups)   :39–86
   │               ICONS (22 glyphs)                      :111–133
   │               SettingsIconKey union (21 members)     :88–109
   │               ⚠ NO runtime check that the two agree   → §26
   │
   ├─ render header                                            :138–146
   │
   └─ settingsGroups.map(group =>                            :148
        <section aria-labelledby={`settings-group-${title}`}>
          <h2 id={same}>{title}</h2>
          <div class="grid gap-4 md:grid-cols-2">
            group.links.map(link =>
              const Icon = ICONS[link.name as SettingsIconKey]   ◄── ONLY THROW SITE
              <Link href={link.href}> … </Link>)
        )
        │
        ▼
 HTML (21 anchors, zero client JS from this file)
        │
        ▼
 next/link observes 21 hrefs → prefetch RSC payloads for the whole subtree
```

### 21.2 The contract check that does not exist

```
  settingsGroups: SettingsGroup[]                    ICONS: Record<SettingsIconKey, LucideIcon>
  ┌───────────────────────────┐                     ┌───────────────────────────┐
  │ 'Profile'                │────────────────────►│ Profile: User             │ ✓
  │ 'Appearance'             │────────────────────►│ 'Appearance': Palette     │ ✓
  │ 'Time Zone'              │────────────────────►│ 'Time Zone': Clock        │ ✓
  │ …                        │                     │ …                         │
  │ 'Danger Zone'            │────────────────────►│ 'Danger Zone': AlertTri…  │ ✓
  └───────────────────────────┘                     └───────────────────────────┘
         joined on  link.name  ===  ICONS key

  ⚠ The two are separate literals. `link.name` is `string`, so
    page.tsx:158 needs `as SettingsIconKey` to compile — and that
    assertion disables the only check that could have enforced the join.

  Add 'Dark Mode' to settingsGroups, forget ICONS:
      ICONS['Dark Mode'] === undefined
      <undefined />  →  React: "Element type is invalid"
      no error.tsx in settings/ nor in (dashboard)/
      ⇒ the entire hub fails to render                    → §26
```

### 21.3 The hub's single outbound request path

```
 click any card
        │
        ├─ next/link client navigation
        │
        ▼
 target subpage mounts
        │
        ├─ 8 store-backed pages
        │    useSettings() → useSettingsStore
        │      status === 'ready' ? return cached row        store.ts:96
        │      loadInflight set ? join the shared promise    store.ts:93
        │      else GET /api/settings  (≤ 1 per session)     store.ts:104
        │        → PUT /api/settings → userService.updateSettings
        │             updateSettingsSchema.safeParse        user.service.ts:279
        │             SYSTEM → AUTO                        user.service.ts:292
        │             updateSettings(userId, data)          user.service.ts:297
        │             User.timezone too, if changed         user.service.ts:299
        │             audit 'SETTINGS_UPDATED'              user.service.ts:302
        │
        ├─ 1 localStorage page
        │    /settings/dashboard → routineos.dashboard.widgets
        │      → emitPreferencesChanged()  → WidgetGate on /dashboard re-reads
        │
        └─ 13 domain pages
             apiRequest() → their own endpoint (api-keys, quotes, routine, …)

 Sidebar.tsx:31 is the ONLY nav entry to any of this  → §7.2
```

### 21.4 Columns that exist, are editable, and are read by nothing

```
  updateSettingsSchema (51 keys)        UserSettings model (50 columns)
  ─────────────────────────────         ──────────────────────────────
        │                                        │
        │  §7.3 verified: every save() key       │
        │  maps here, 0 unmapped                  │
        │                                        ▼
        │                    ┌──────────────────────────────────────┐
        │                    │ defaultView       §6.3  ❌ no consumer│
        │                    │ soundEnabled      §6.3  ❌ no consumer│
        │                    │ retroactiveEditDays  §20 ❌ no consumer│
        │                    │ autoArchiveCompletedDays §20 ❌ none   │
        │                    │ dataRetentionDays    §20 ❌ none      │
        │                    └──────────────────────────────────────┘
        │
        └──► schema COMPLETENESS  ≠  WIRING
             These 5 pass the §7.3 check because they ARE in the
             schema — and still do nothing when changed.
```

---

## 22. File-by-file dependency inventory

### 22.1 This page

| File | Lines | Directive | Role |
| ---- | ----- | --------- | ---- |
| `src/app/(dashboard)/settings/page.tsx` | **184** | **none** (Server Component) | the hub: `SettingsLink` `:28`, `SettingsGroup` `:34`, `settingsGroups` `:39`–`:86`, `SettingsIconKey` `:88`–`:109`, `ICONS` `:111`–`:133`, `SettingsHubPage` `:135` |

### 22.2 Direct dependencies — **two**

| File | Relationship |
| ---- | ------------ |
| `next/link` | `Link` `:1` — all 21 cards |
| `lucide-react` | 22 icons `:2`–`:26`, `type LucideIcon` `:25` |

That is the entire import list. ✅

### 22.3 Framework dependencies

| Source | Relationship |
| ------ | ------------ |
| `src/proxy.ts` | unauthenticated → `/login` (per `AGENTS.md`) |
| `src/app/(dashboard)/layout.tsx:26` | `privateMetadata` → `noindex` |
| `src/components/layout/Sidebar.tsx:31` | the only nav entry |

### 22.4 The 22 routes this page links to

| # | Route | Lines | `'use client'` | Store? |
| - | ----- | ----- | -------------- | ------ |
| 1 | `settings/profile/page.tsx` | 192 | ✅ | no — `PATCH /api/auth/update-profile` |
| 2 | `settings/appearance/page.tsx` | 350 | ✅ | **`useSettings`** |
| 3 | `settings/timezone/page.tsx` | 183 | ✅ | **`useSettings`** |
| 4 | `settings/dashboard/page.tsx` | 191 | ✅ | no — `localStorage` (documented exception) |
| 5 | `settings/habits/page.tsx` | 188 | ✅ | **`useSettings`** |
| 6 | `settings/routine/page.tsx` | 467 | ✅ | no — `/api/routine` |
| 7 | `settings/sleep/page.tsx` | 309 | ✅ | **`useSettings`** |
| 8 | `settings/quotes/page.tsx` | 387 | ✅ | no — `/api/quotes` |
| 9 | `settings/scoring/page.tsx` | 261 | ✅ | **`useSettings`** |
| 10 | `settings/notifications/page.tsx` | 896 | ✅ | **`useSettings`** + push |
| 11 | `settings/security/page.tsx` | 473 | ✅ | no — `/api/auth/*` |
| 12 | `settings/sessions/page.tsx` | 273 | ✅ | no — `/api/auth/sessions` (calls `store.reset()`) |
| 13 | `settings/privacy/page.tsx` | 180 | ✅ | **`useSettings`** |
| 14 | `settings/integrations/page.tsx` | 393 | ✅ | no — `/api/integrations*` |
| 15 | `settings/api-keys/page.tsx` | 297 | ✅ | no — `/api/api-keys` |
| 16 | `settings/subscription/page.tsx` | 293 | ✅ | no — `/api/billing/subscription` |
| 17 | `settings/billing/page.tsx` | 266 | ✅ | no — `/api/billing/config` |
| 18 | `settings/data/page.tsx` | 169 | ✅ | **`useSettings`** |
| 19 | `settings/export/page.tsx` | 81 | ✅ | no — `<ExportData>` |
| 20 | `settings/import/page.tsx` | 79 | ✅ | no — `<ImportData>` |
| 21 | `settings/danger-zone/page.tsx` | 211 | ✅ | no — `/api/auth/delete-account` |
| — | `settings/account/page.tsx` | **5** | ❌ | none — `redirect('/settings/profile')` — **unlinked, §25** |

**Total: 8,613 lines** across 22 subpages + **184** for the hub = **8,797**.

### 22.5 Shared infrastructure behind the children

| File | Lines | Role |
| ---- | ----- | ---- |
| `src/store/settings.store.ts` | 174 | `load` `:89`, `save` `:125`, `patchLocal` `:156`, `reset` `:164`, `applyAppearance` `:64`, `loadInflight` `:75` |
| `src/hooks/useSettings.ts` | 71 | `useSettings` `:17`, `useSettingsLoader` `:57` |
| `src/lib/validation/settings.schema.ts` | 75 | `updateSettingsSchema` `:12`–`:68` (51 keys) |
| `src/app/api/settings/route.ts` | 44 | `GET` `:9`, `PUT` `:29` |
| `src/server/services/user.service.ts` | `:258`/`:275` | `getSettings`, `updateSettings` |
| `src/components/dashboard/DashboardWidgets.tsx` | — | `DASHBOARD_WIDGETS_KEY` `:32`, 11 widget defs `:69`–`:79`, `emitPreferencesChanged` `:158`, `WidgetGate` `:214` |

### 22.6 Counts

| Metric | Value |
| ------ | ----- |
| Links | **21** |
| Real routes under `settings/` | **22** |
| Broken hrefs | **0** ✅ |
| Orphaned routes | **1** (`/settings/account`) |
| Icons declared / used | 22 / 22 ✅ |
| Groups | 5 |
| Store-backed subpages | 8 |
| `localStorage`-backed subpages | 1 (documented exception) |
| Different-table subpages | 13 |
| Subpages with a hand-rolled `isAuthenticated` gate | 20 |
| Client JS from this page | **0 bytes** |
| Requests to render this page | **0** |
| Schema keys / unmapped `save()` keys | 51 / **0** ✅ |
| `UserSettings` columns | **50** |
| Columns editable but unwired | **5** |

---

## 23. Current behavior summary

**What the page does.** Renders a header and 21 cards in 5 groups. That is all. It is a 184-line Server Component with two imports (`next/link`, `lucide-react`), no state, no effects, no data access, and zero client JavaScript contributed by this file. It is simultaneously the cheapest page and the only entry point to the entire settings subsystem, because `Sidebar.tsx:31` has exactly one nav item pointing at it.

**What is verified correct.** Every one of the 21 hrefs resolves to a real route — zero broken links, zero duplicates, zero phantom targets (exhaustively diffed, §7.1). Every `save()` key across all 22 subpages maps to a real field in `updateSettingsSchema` — 51 keys, 0 unmapped (§7.3), which is the specific silent-failure mode `AGENTS.md` warns about. The documented `dailyReminderTime` double-ownership bug is genuinely fixed at the source, with the habits page deriving its helper text from the same constant the notifications page hard-codes, so the two cannot drift again (§7.4). The store rule holds exactly where it applies: 8 pages that own `UserSettings` columns all go through `useSettings`, 13 pages own different tables and talk to those, and the single genuine exception — `/settings/dashboard`'s per-device `localStorage` widget prefs — is the one `AGENTS.md` explicitly blesses (§12.4). The `timezone` invariant that the whole date-bucketing layer depends on is maintained in one call (`user.service.ts:299`–`:300`) and documented on the model (§6.2).

**The one structural weakness.** `ICONS[link.name as SettingsIconKey]` (`:158`) joins two independently-declared literals — `settingsGroups: SettingsGroup[]` where `name` is plain `string`, and `ICONS: Record<SettingsIconKey, LucideIcon>` where `SettingsIconKey` is a hand-maintained 21-member union. The `as` assertion disables the only type check that could enforce the join, so adding a link without an icon crashes the **entire hub** rather than one card, with no `error.tsx` anywhere in the route or the group to catch it. §26.

**The recurring pattern across the subtree.** Schema completeness is not wiring. Five columns — `defaultView`, `soundEnabled`, `retroactiveEditDays`, `autoArchiveCompletedDays`, `dataRetentionDays` — are all in `updateSettingsSchema`, all on the model, all editable from a page, and all read by nothing. `/settings/dashboard`'s own description, *"Choose your default dashboard view"*, advertises a control that does not exist. §6.3, §20.

**The two presentational issues.** The `aria-labelledby` id embeds the raw group title, so "Account & Safety" and "Integrations & API" produce an id containing a space and an `&` — ARIA reads that as a space-separated **id list**, so those two sections' accessible names resolve to nothing (§2.2). And the card's `transition-all duration-300` hover lift has no `motion-reduce:` guard, the same class of finding as `/recap`'s unguarded Recharts animation.

---

## 24. Findings register

Severity: 🔴 **critical** (crash, or a control the UI advertises and does not deliver) · 🟠 **major** (correctness / a11y / user-visible wrongness) · 🟡 **minor** (dead code, drift risk, cosmetic).

| ID | Sev | Finding | Evidence | Fix |
| -- | --- | ------- | -------- | --- |
| **F1** | 🔴 | `/settings/dashboard`'s description says *"Choose your default dashboard view"*, and `UserSettings.defaultView` + its schema entry both exist — but **no page reads or writes `defaultView`**, and the page itself toggles 11 per-device widgets in `localStorage` instead. The hub advertises a control that does not exist. | `page.tsx:46`; `schema.prisma` `defaultView String @default("dashboard")`; `settings.schema.ts:23`; `settings/dashboard/page.tsx:13` | Either implement it (read `defaultView` on `/dashboard`, add a control here) or change the description to "Choose which widgets appear on your dashboard". **§6.3, §15** |
| **F2** | 🟠 | `aria-labelledby={\`settings-group-${group.title}\`}` embeds the raw title, so ids become `settings-group-Account & Safety` and `settings-group-Integrations & API`. ARIA resolves `aria-labelledby` as a space-separated **ID list**, so each of those two sections' accessible name resolves to nothing. Also not a valid CSS identifier. | `page.tsx:149`, `:151`; group titles at `:56`, `:64` | Slugify: `` const slug = group.title.toLowerCase().replace(/[^a-z0-9]+/g, '-') `` and use it for both `id` and `aria-labelledby`. **§2.2** |
| **F3** | 🟡 | The card uses `transition-all duration-300 ease-out-expo hover:-translate-y-0.5` with **no `motion-reduce:` guard**, so the lift animates for motion-sensitive users. Same class as `/recap`'s unguarded Recharts animation. | `page.tsx:161`–`:164` | Add `motion-reduce:transform-none motion-reduce:transition-none`. |
| **F4** | 🟠 | `PUT /api/settings` maps **every** failure to `400` with the raw exception message: a Zod issue, a Prisma failure, a timeout and a `TypeError` are indistinguishable. Any error whose message is literally `'Unauthorized'` becomes a 401 even though `auth()` already returned. | `api/settings/route.ts:40`–`:42` | Narrow the known-validation case; use 500 for anything unexpected and log the detail server-side. **§5.1** |
| **F5** | 🟡 | The route docstring says *"Validated against the settings schema in the service layer"*, which is accurate — but the route contains **zero** Zod usage and passes the raw parsed body through, so a reader following the comment will not find validation in this file. | `api/settings/route.ts:26`–`:27`, `:36`–`:37`; validation at `user.service.ts:279` | Note the delegation explicitly, or validate in the route too. |
| **F6** | 🟡 | 🔴 `UserSettings.soundEnabled` (default `true`) is in the schema (`:20`) and on the model, is written by no page, and is read by no page. Dead column. | `settings.schema.ts:20`; `schema.prisma` `soundEnabled` | Wire it to a toggle or delete it. **§6.3** |
| **F7** | 🟡 | `habits:85` and `notifications:238` both apply `dailyReminderTime?.trim() \|\| '20:00'` on **every** save, so toggling any unrelated notification preference silently persists a `dailyReminderTime` the user never chose. | `settings/habits/page.tsx:85`; `settings/notifications/page.tsx:238` | Only include the key when the user edited the field. **§7.4** |
| **F8** | 🟡 | `/settings/danger-zone` is presented identically to `/settings/export` and `/settings/import` — same `glass-panel`, same hover, same group. Only the `AlertTriangle` glyph distinguishes the one terminal action on the page, and the hub provides no "irreversible" marker. | `page.tsx:78`–`:85`, `:132`, `:163` | Add a destructive tint or a "permanent" badge to that one card. **§11, §17.4** |
| **F9** | — | *Informational, not a defect.* `settings/sessions:24` and `danger-zone:17` import `useSettingsStore` directly rather than through `useSettings`, solely to call `reset()` imperatively via `getState()` after logout/delete. Correct idiom; recorded so the direct import is not later mistaken for a store-rule violation. | `settings/sessions/page.tsx:24`, `:119`; `settings/danger-zone/page.tsx:17`, `:101` | None. **§12.5** |
| **F10** | 🟠 | 🔴 **Zero tests** cover the settings subsystem. `tests/` has 6 files (`score-calculator`, `dashboard-contributions`, `dashboard-derive`, `habit-contribution-eligibility`, `habit-contributions`, `routine-duration`) — none touches `settings.store.ts`, `settings.schema.ts`, `useSettings`, `period-range`, `recap.service.ts` or any `server/analytics/*` module. Both documented double-ownership bugs this store was created to fix were, by construction, testable. | `tests/` listing; the two bugs are described at `settings.store.ts:6`–`:13` | Add `tests/lib/settings-schema.test.ts` (every model column is accepted — a direct guard against the F6/F13 class) and `tests/store/settings-store.test.ts` (concurrent `load()` issues exactly one request). **§15** |
| **F11** | 🟡 | The "Sign in required" gate is hand-rolled in **20 of 22** subpages rather than factored into one shared component. | `isAuthenticated` present in 20 subpage files | A `<SettingsShell>` or `<RequireAuth>` wrapper. **§17.1** |
| **F12** | — | *Informational.* `next/link` prefetches all 21 targets (8,613 lines of route JS) as the user scrolls, including the two heaviest pages (`notifications` 896, `routine` 467, `security` 473). A deliberate speed-over-bytes trade-off, correctly resolved in favour of navigation. | `page.tsx:160`; §18.2 | `prefetch={false}` on the heaviest three if metering ever matters. |
| **F13** | 🔴 | `retroactiveEditDays` (3), `autoArchiveCompletedDays` (90) and `dataRetentionDays` (365) are editable at `/settings/data`, in the schema, and on the model — and read by **nothing**. Three settings with no observable effect in either direction, on the page a user visits specifically to control their data. | `settings.schema.ts:61`–`:63`; `settings/data/page.tsx:33`; `schema.prisma:2082`–`:2084` | Implement a retention/archive job, or remove the three cards. **§20** |
| **F14** | 🟠 | `ICONS[link.name as SettingsIconKey]` joins two independently-declared literals through an `as` assertion that disables the only available type check. Adding a link without an icon yields `undefined` → `<undefined />` → `Element type is invalid` → the **entire hub** renders nothing, with no `error.tsx` in the route or the group. `npm run type-check` cannot catch it. | `page.tsx:28`–`:32` (`name: string`), `:88`–`:109` (the union), `:158` (the cast) | Type `SettingsLink.name` as the literal union (or derive the union from `settingsGroups`), drop the cast, and add a module-level assertion that every name has an icon. **§26** |
| **F15** | 🟡 | `/settings/account` is a 5-line `redirect('/settings/profile')` with **no inbound link from anywhere** — not the hub, not the sidebar, and `grep` finds zero references to the string `/settings/account` in the entire repo. It is a real route with no discoverable purpose. | `settings/account/page.tsx:1`–`:5`; 21 links vs 22 routes | Delete it, or keep it as a compatibility alias and say so in a comment. **§25** |
| **F16** | 🟡 | `CreditCard` is used for both `Subscription` and `Billing`, so the two adjacent cards in the "Billing" group are visually indistinguishable by icon. | `page.tsx:123` (import), `:122`, `:123` (both map to `CreditCard`) | Give Subscription its own glyph. |
| **F17** | 🟡 | No `export const metadata` on the hub, so its document title is inherited from the layout rather than being "Settings". | absence; layout at `(dashboard)/layout.tsx:26` | Add a `metadata` export — the page is already a Server Component, so it costs nothing. |
| **F18** | 🟡 | The link `desc` strings are not clamped. The longest today is 39 chars and fits, but a longer one would wrap and stretch a single card in the 2-column grid. `items-start` keeps the icon aligned so it degrades acceptably, but there is no `line-clamp`. | `page.tsx:170`; longest at `:46` | Add `line-clamp-2` to the description. |

**Count: 18 findings. 4 critical, 4 major, 8 minor, 2 informational.**

---

## 25. `/settings/account` is an orphaned route

```
src/app/(dashboard)/settings/account/page.tsx        — the entire file

  1  import { redirect } from 'next/navigation';
  2
  3  export default function AccountSettingsPage() {
  4    redirect('/settings/profile');
  5  }
```

Five lines, no `'use client'`, correctly a Server Component. `redirect()` from `next/navigation` throws a special control-flow signal that Next converts into a **307** to the target, so `/settings/account` genuinely works — it is not a broken route.

**But nothing points at it:**

| Check | Result |
| ----- | ------ |
| Listed in `settingsGroups`? | ❌ — 21 links, and `Account` is not one |
| Present in `ICONS`? | ❌ — 22 icons, none for `Account` |
| Present in `SettingsIconKey`? | ❌ — the union has 21 members, none is `'Account'` |
| In the Sidebar nav? | ❌ — `Sidebar.tsx:31` links only `/settings` |
| Referenced anywhere in `src`? | ❌ — `grep -rn "/settings/account"` returns **zero** hits |
| Directory count vs link count | **22 routes, 21 links** — the delta is exactly this route |

So `/settings/account` is reachable only by typing the URL or following a stale bookmark. It is 5 lines of harmless indirection — `redirect()` is cheap, and if a legacy link or an old email exists somewhere outside `src`, it degrades correctly rather than 404ing.

**Why it is still worth recording.** Three reasons:

1. **It makes a route inventory lie.** Any tool, script or new developer counting `settings/*/page.tsx` gets 22 subpages; the hub offers 21. An audit of "what settings pages exist" and an audit of "what can a user reach" return different answers, and neither is wrong. §7.1 is the reconciliation.
2. **It is indistinguishable from dead code.** Five lines, no callers, no test. A future reader cannot tell whether it is a deliberate compatibility alias or a leftover from a rename — the file has no comment saying which.
3. **The convention is inconsistent.** `/settings/profile` *is* the personal-details page (it edits `name`, `displayName`, `bio`, `avatarUrl` via `PATCH /api/auth/update-profile`). So the hub's "Profile" card and this route's redirect target are the same page, which is a reasonable reason for the alias to exist — it just isn't documented.

**Suggested fix** — pick one, do not leave it ambiguous:

```ts
// Option A — delete it (recommended; nothing references it)
rm src/app/(dashboard)/settings/account/page.tsx

// Option B — keep it, and say why
import { redirect } from 'next/navigation';

/**
 * Legacy alias. `/settings/profile` absorbed account details in the Profile
 * rewrite; this route is retained so old bookmarks and any external links keep
 * working. Nothing in the app links here.
 */
export default function AccountSettingsPage() {
  redirect('/settings/profile');
}
```

Option B costs one comment and resolves all three concerns. §24 F15.

---

## 26. The widget-toggle contract is enforced by convention only

This is the closest thing to a genuine crash risk in the file, so it is worth spelling out precisely.

### 26.1 The two declarations

```ts
// page.tsx:28–32 — the link shape
interface SettingsLink {
  name: string;        // ◄── plain string, NOT a literal union
  href: string;
  desc: string;
}

// page.tsx:88–109 — the icon key, hand-maintained
type SettingsIconKey =
  | 'Profile' | 'Appearance' | 'Time Zone' | 'Dashboard' | 'Habits'
  | 'Routine' | 'Sleep' | 'Quotes' | 'Scoring Weights' | 'Notifications'
  | 'Security' | 'Active Sessions' | 'Privacy' | 'Integrations'
  | 'API Keys' | 'Subscription' | 'Billing' | 'Data' | 'Export'
  | 'Import' | 'Danger Zone';                                  // 21 members

// page.tsx:158 — the join
const Icon = ICONS[link.name as SettingsIconKey];   // ◄── the assertion
```

`link.name` is `string`. To index `Record<SettingsIconKey, LucideIcon>` with it, TypeScript requires an assertion. **`as` is exactly the operator that tells the compiler "trust me, this is fine"** — so the one check that could have verified the two lists agree is switched off.

### 26.2 The failure mode

```
1. A developer adds a sixth Preferences entry — say a new "Focus" page:

     settingsGroups[0].links.push({
       name: 'Focus', href: '/settings/focus', desc: 'Configure focus sessions'
     })

2. They do not touch ICONS, because nothing in their editor flags it.

3. At render time:
     ICONS['Focus']                      → undefined
     <Icon className="h-5 w-5" />         → React throws
                                           "Element type is invalid: 
                                            got undefined"
4. That throw happens inside .map() over 21 links, so it aborts the
   entire settingsGroups render — ALL FIVE GROUPS, not the new card.

5. There is no error.tsx in src/app/(dashboard)/settings/
   and none in src/app/(dashboard)/          (verified: zero loading.tsx,
   error.tsx or not-found.tsx anywhere in the settings tree)
   so the error propagates to the next boundary up.

⇒ The whole settings hub renders blank. Every feature becomes unreachable
  from navigation, because Sidebar.tsx:31 is the only entry point (§7.2).
```

### 26.3 Why no existing check catches it

| Candidate guard | Why it does not help |
| --------------- | -------------------- |
| `npm run type-check` (`tsc --noEmit`, strict) | `as SettingsIconKey` is an explicit assertion; `tsc` honours it |
| `eslint` (`next/typescript` flat config) | `@typescript-eslint/no-unnecessary-type-assertion` only fires when the assertion is *redundant*, not when it is *wrong* |
| `npm run build` | Compiles clean — the mismatch is a **runtime** value, not a type error |
| A unit test | None exist for this file (§24 F10) |
| Review | The diff adds 1 line to `settingsGroups` and looks complete |

### 26.4 The fix — three options, best first

**Option A — derive the union from the data.** Make the data the single source of truth:

```ts
const settingsGroups = [
  { title: 'Preferences', links: [ /* … */ ] },
  // …
] as const satisfies readonly SettingsGroup[];

type SettingsIconKey = (typeof settingsGroups)[number]['links'][number]['name'];

const ICONS: Record<SettingsIconKey, LucideIcon> = {
  Profile: User,
  Appearance: Palette,
  // …
};
```

Now the compiler requires an `ICONS` entry for every link, because the object literal is checked against `Record<SettingsIconKey, …>` and the union is derived from the array. `as SettingsIconKey` at `:158` disappears, and a missing icon is a **compile error**. This is the correct fix and it costs four lines.

**Option B — assert exhaustiveness at module load**, keeping the current shape:

```ts
const missing = settingsGroups
  .flatMap((g) => g.links)
  .filter((link) => !(link.name in ICONS));
if (missing.length > 0) {
  throw new Error(
    `settings/page.tsx: no ICONS entry for ${missing.map((l) => l.name).join(', ')}`
  );
}
```

Converts a whole-page React crash into a named, actionable error at module init. Cheaper than A, but still a runtime failure.

**Option C — a defensive default**, purely to stop the page from blanking:

```ts
const Icon = ICONS[link.name as SettingsIconKey] ?? Settings2;
```

⚠ This is the *least* good option despite being the smallest diff: it silently renders the wrong icon instead of failing. If you take C, take B too.

### 26.5 The same pattern elsewhere in the settings tree

`AGENTS.md` records that `/settings/dashboard`'s widget list previously had *"six keys for fifteen widgets, so several Settings labels toggled the wrong thing and nine widgets could not be toggled at all."* That is **the identical failure mode** — a list of labels and a list of keys kept in agreement by hand — and it was fixed by giving every widget its own key (11 keys, verified against 11 `<WidgetGate>` usages in §26.6 below). So the project has already been bitten by this bug class once, in the sibling directory. `SettingsIconKey` is the remaining instance of it.

### 26.6 ✅ Verified: the `localStorage` widget contract *does* hold

For contrast — and because it is the direct precedent — I checked the dashboard side of the same pattern:

```
DASHBOARD_WIDGETS  (DashboardWidgets.tsx:69–79) — 11 keys
  heatmap, radar, dayTypes, habitHealth, adherence, recap,
  goalsVelocity, achievements, insights, quickActions, quotes

<WidgetGate widgetKey="…">  in dashboard/page.tsx — 11 usages
  :114 quotes      :181 heatmap     :185 radar       :190 dayTypes
  :194 adherence   :204 habitHealth :211 insights   :215 recap
  :219 goalsVelocity :223 quickActions :234 achievements

⇒ 11 = 11, and every key matches.                ✅ contract holds
```

`insights` is `enabled: false` by default (`DashboardWidgets.tsx:77`), so one widget ships off.

`/settings/dashboard` then reads `routineos.dashboard.widgets`, **merges stored overrides onto the current defaults** (`dashboard/page.tsx:55`–`:58`, so a widget added since the user's last save appears), writes with `emitPreferencesChanged()` (`:77`) because `localStorage.setItem` only fires `storage` in *other* tabs (documented at `:71`–`:76`), and degrades gracefully when storage is unavailable (`:67`–`:70`).

That is a **well-built** implementation of the same idea — which makes the `SettingsIconKey` union in `page.tsx` the odd one out.

§24 F14.

---

## 27. The settings store is bypassed by 6 of 22 subpages

`AGENTS.md` states the rule as an absolute:

> *"Every page under `src/app/(dashboard)/settings` goes through it — do **not** hand-roll a `useState` + `GET /api/settings` fetch, that is what previously let sibling pages disagree about the same column."*

**6 of 22 subpages do not call `useSettings`**, and I traced each one. The honest answer is that the rule holds where it can, and the 6 bypasses are legitimate:

| Subpage | What it actually owns | Verdict |
| ------- | -------------------- | ------- |
| `/settings/dashboard` | **`localStorage`** `routineos.dashboard.widgets` (per-device, not per-account) | ✅ **The documented exception.** `AGENTS.md`: *"Dashboard widget preferences are a deliberate exception: they live in `localStorage` … (per-device)"*. The page states it to the user at `:180`–`:186`: *"Preferences are stored in your browser (localStorage) and follow you per device, not per account."* Honesty in the UI, not just in the docs. |
| `/settings/profile` | **`User`** — `name`, `displayName`, `bio`, `avatarUrl` | ✅ No `UserSettings` column exists for any of these. The correct endpoint is `PATCH /api/auth/update-profile` (`:64`), and it updates the auth store so the sidebar reflects the change immediately (`:3`–`:4`) |
| `/settings/quotes` | **`Quote`** rows | ✅ Different table entirely |
| `/settings/routine` | **`RoutineTemplate`** rows — 5 CRUD calls | ✅ Different table |
| `/settings/integrations` | **`Integration`** links | ✅ Different table |
| `/settings/api-keys` | **`ApiKey`** rows | ✅ Different table |

The remaining 16 split cleanly:

- **8 store-backed** (`useSettings()`): appearance, timezone, habits, sleep, scoring, notifications, privacy, data — precisely the pages that own `UserSettings` columns.
- **8 auth/billing/data-jobs** (their own endpoints, none touching `UserSettings`): security, sessions, danger-zone, subscription, billing, export, import.

### 27.1 The invariant that actually matters

The store's own header comment lists the three bugs it was created to fix (`settings.store.ts:6`–`:13`):

1. **Four sibling pages each issued their own `GET /api/users/[id]/settings`**, so two pages open at once could render different values for the same column.
2. **`/settings/habits` and `/settings/notifications` both owned `dailyReminderTime`** with conflicting `'09:00'` vs `'20:00'` fallbacks.
3. **Nothing re-read the saved row**, so a "Saved" badge was the only signal that a write had landed.

I verified the current state of all three:

| Bug | Status | Evidence |
| --- | ------ | -------- |
| #1 divergent fetches | ✅ **Fixed** | `loadInflight` is module-level (`store.ts:75`), checked before issuing (` :93`–`:95`) and cleared in `finally` (`:111`–`:113`); a `status === 'ready'` store short-circuits (`:96`). Plus `useSettingsLoader` runs once in the layout, so the row is loaded before any settings page mounts |
| #2 double-owned `dailyReminderTime` | ✅ **Fixed at the source** | `habits/page.tsx:33` defines `DEFAULT_DAILY_REMINDER_TIME = '20:00'` and `:141` renders its helper text from that same constant; `notifications/page.tsx:238` hard-codes `'20:00'`. **Both agree, and the habits page cannot drift** because there is only one literal. §7.4 |
| #3 no re-read after save | ✅ **Fixed** | `save()` sets `settings` to the row the `PUT` returned (`:140`), so the store is reconciled against the server rather than against the patch |

Bug #3's fix is the subtlest and the most valuable: the optimistic write at `:127`–`:133` applies the patch immediately, then `:141` **overwrites it with the authoritative row**. So a server-side normalisation — and there is one, `SYSTEM → AUTO` at `user.service.ts:292` — is reflected in the UI. Without it, a user selecting "System" theme would see `SYSTEM` locally and `AUTO` in the DB, and the two would diverge on next load.

And on failure, `save()` **rolls back**: `settings: before` (`:147`). So a rejected value never remains on screen — which matters because `updateSettingsSchema` rejects `''` against the `HH:mm` regex and accepts `null` instead. The three pages that clear a time field all comment on exactly this (`habits:82`, `notifications:237`, `profile:8`).

### 27.2 The remaining fragility

`loadInflight` (`:75`) is a **module-level mutable variable**, and it is the single line of defence for the property the whole store exists to provide. Two consequences:

1. **It is not test-covered.** A regression here reintroduces bug #1 verbatim, and there is no test (§24 F10).
2. **It is not concurrency-safe across a `reset()`.** `reset()` (`:164`–`:173`) does not clear `loadInflight`. If `reset()` runs while a load is in flight — which is exactly the sign-out race `useSettingsLoader` creates (`useSettings.ts:61`–`:67` calls `reset()` on `!enabled` and `load()` otherwise) — the in-flight promise will still resolve and call `set({ settings, status: 'ready' })` at `:105`, **repopulating the store with the previous user's settings after sign-out.** `reset()` then runs `applyAppearance(null)` and removes the `<html>` classes (`:169`–`:172`), so the visual flags clear — but the row itself is repopulated.

   Whether this is reachable in practice depends on the sign-out path cancelling the request first; it is a **narrow race** (in-flight `GET` + sign-out before it resolves) rather than a common one. But the comment at `:166`–`:168` states the intent explicitly — *"signing out and into a different account leaves the previous user's preferences applied"* — and this is the one path that could still cause it. Clearing `loadInflight` in `reset()`, or guarding the `set` in the load with a generation counter, closes it. §24 F20.

### 27.3 Summary

**The store rule is respected.** 6 of 22 pages bypass it; all 6 bypass it legitimately — 5 own a different table, and 1 is the exception `AGENTS.md` explicitly blesses and the page discloses to the user. All three documented bugs are genuinely fixed, and bug #3's fix (reconcile against the returned row rather than the patch) is better than the store's own comment describes.

The residual work is a **test** for the shared-request invariant and a **`reset()` race** against the in-flight load — both in one 174-line file that is the single most load-bearing abstraction in the entire settings subsystem. §24 F10, §24 F20.

---

*End of `/settings` audit. 27 sections, 18 findings, 184 lines of Server Component with zero client JS and zero data access, 21 links all verified to resolve, 22 routes reconciled, 51 schema keys verified against every save() call site in the subtree, 6 store bypasses traced and all justified, 5 columns editable but unwired. Documentation only: no source file was modified.*