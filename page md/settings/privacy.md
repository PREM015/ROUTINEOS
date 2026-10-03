# `/settings/privacy` — Complete System Audit

**Route:** `http://localhost:3000/settings/privacy`
**Route file:** `src/app/(dashboard)/settings/privacy/page.tsx` (**180 physical lines**, `'use client'`)
**Project:** RoutineOS (`daily-plan`) — Next.js 16 (App Router) + Prisma 7 + PostgreSQL (Neon)
**Audit date:** 2026-09-30 · **Status:** documentation-only pass — no code was changed. Every claim is file-anchored.

> **Line-count convention:** **physical** line counts.

> ### Headline findings
>
> 1. 🔴 **`shareStats` is read by nothing.** The page's own helper text says *"Controls whether your streak, habit count and average score appear on the leaderboard"* and the header comment says *"the leaderboard consults `shareStats`, so these switches gate something real."* Both are false. `UserService.getLeaderboard` calls `userRepository.getAverageScores(sinceDate, limit)` — a `dailyScore.groupBy` across **all** users with no settings filter — and `getLeaderboardCandidates(limit)` selects on `where: { isDeleted: false, isActive: true }`. Neither consults `UserSettings` at all. **The switch is decorative.** §25.
> 2. 🔴 **The leaderboard ignores `profilePublic` too.** A user who turns *Public profile* **off** is still listed by `displayName`, `avatarUrl`, `averageScore`, `currentStreak`, `longestStreak` and `totalDays`. The two switches are independent, and **neither one gates the leaderboard** — so the page's first helper text ("returns 404 for everyone, including the leaderboard") is inaccurate about the leaderboard specifically. §25.
> 3. 🟠 **Every row renders its label and description twice.** Each setting is a hand-built `<div>` with an icon, a title and a paragraph, *plus* a `<Switch>` that carries its own `label` and `description` props. Because `Switch` renders them (`Switch.tsx:28`–`:37`), "Public profile" and its description appear **twice on screen**, stacked. §26.
> 4. 🟡 **`setTimeout` is never cleared** (`:71`), unlike `/settings/appearance:116`–`:120` and `/settings/timezone` which both return a cleanup. §24 F7.

---

## Table of contents

| §   | Section                                                                                       |
| --- | --------------------------------------------------------------------------------------------- |
| 1   | [What `/settings/privacy` is, in one paragraph](#1-what-settingsprivacy-is-in-one-paragraph)   |
| 2   | [UI block diagram](#2-ui-block-diagram)                                                       |
| 3   | [UI → component mapping](#3-ui--component-mapping)                                            |
| 4   | [Frontend architecture](#4-frontend-architecture)                                             |
| 5   | [Backend / API architecture](#5-backend--api-architecture)                                    |
| 6   | [Database dependency](#6-database-dependency)                                                 |
| 7   | [What the two switches actually gate](#7-what-the-two-switches-actually-gate)                 |
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
| 25  | [Neither switch gates the leaderboard](#25-neither-switch-gates-the-leaderboard)               |
| 26  | [Duplicated labels and descriptions](#26-duplicated-labels-and-descriptions)                   |
| 27  | [The rest of the settings surface](#27-the-rest-of-the-settings-surface)                       |

---

## 1. What `/settings/privacy` is, in one paragraph

`/settings/privacy` is a two-switch page plus a static "Your data" card. The first switch is **Public profile** (`UserSettings.profilePublic`), the second is **Share statistics** (`UserSettings.shareStats`); both are `Boolean @default(false)` on the model, both round-trip through the shared settings store via `patchLocal` and one explicit **Save privacy settings** button, and both are documented in the header comment as having been *fixed* — the comment records that `GET /api/users/[id]` once returned a profile to anyone who asked and the leaderboard exposed aggregates unconditionally, and that the public-profile route now consults `profilePublic`. That fix is real and verifiable: `UserService.getPublicProfile` (`:112`) and `getPublicProfileWithStats` both return `null` when `profilePublic === false` and the viewer is not the owner. The **leaderboard half of that claim did not happen** — `getLeaderboard` never reads `UserSettings` — so the page ships one switch that works and one that does not, with copy asserting that both do. The second card is a static list of three links to `/settings/data`, `/settings/export` and `/settings/danger-zone`.

---

## 2. UI block diagram

```
/settings/privacy  (settings/privacy/page.tsx — 'use client', 180 lines)
│
├── if (authLoading) → <Skeleton h-8 w-40/> + <Skeleton h-56/>        :32–43
├── if (!isAuthenticated) → "Sign in required" + <Link href="/login">  :45–64
│
├── {error && <div role="alert"
│      class="mb-6 bg-destructive/10 … text-destructive">              :131–141
│      <ShieldAlert/> {error} }          ✅ OUTSIDE the loading branch
│
└── <main class="container mx-auto max-w-3xl px-4 py-8">             :77
    ├── <h1 class="text-2xl font-bold">Privacy</h1>                   :78
    ├── <p class="mt-1 text-sm text-muted-foreground">
    │     "Control who can see your profile and stats."              :79–81
    │
    ├── ① <Card><div class="p-6">                                    :83–156
    │   │
    │   ├── {loading || !settings} → 2 × <Skeleton h-16 w-full/>      :85–90
    │   │
    │   ├── ROW 1  <div class="flex items-start justify-between gap-4">  :92
    │   │   ├── LEFT TEXT BLOCK                                        :93–105
    │   │   │   ├── <Eye class="h-4 w-4 text-muted-foreground"/>
    │   │   │   ├── <p class="text-sm font-medium text-foreground">
    │   │   │   │      "Public profile"                             :97
    │   │   │   └── <p class="mt-1 text-xs text-muted-foreground">    :98–104
    │   │   │         "When off, /api/users/[id] returns 404 for
    │   │   │          everyone, including the leaderboard. Your name,
    │   │   │          bio and avatar are not readable by other users."
    │   │   │         ⚠ "including the leaderboard" is FALSE — §25
    │   │   └── <Switch label="Public profile"                       :106–112
    │   │           description="Let other users view your profile page and bio."
    │   │           checked={settings.profilePublic}
    │   │           onChange={(c) => patchLocal({ profilePublic: c })}
    │   │       🔴 Switch renders label + description → the row shows
    │   │          "Public profile" and both paragraphs TWICE. §26
    │   │
    │   ├── ROW 2  <div class="flex items-start justify-between gap-4">  :114
    │   │   ├── <Share2/> + <p>"Share statistics"</p>                  :117–122
    │   │   ├── <p>"Controls whether your streak, habit count and average
    │   │   │        score appear on the leaderboard."</p>              :123–126
    │   │   │      🔴 FALSE — getLeaderboard never reads shareStats. §25
    │   │   └── <Switch label="Share statistics"                       :124–131
    │   │           description="Share aggregate stats such as streaks and average score."
    │   │           checked={settings.shareStats}
    │   │           onChange={(c) => patchLocal({ shareStats: c })}
    │   │       🔴 duplicated again
    │   │
    │   ├── {error && <div role="alert" …>}                           :132–138
    │   │     🔴 a SECOND error render site — the page has two, one at :131
    │   │       outside the card and one here inside it. On a save failure
    │   │       BOTH render. §24 F6
    │   │
    │   └── <div class="mt-6 flex flex-wrap items-center gap-3">       :140–149
    │       ├── <Button onClick={() => void persist()} isLoading={saving}>
    │       │     "Save privacy settings"                             :141–143
    │       │     ⚠ no `disabled` — a double-click during save is possible
    │       └── {saved && <span class="text-emerald-600 dark:text-emerald-400">
    │               <CheckCircle2/> Saved</span>}                      :144–148
    │
    └── ② <Card class="mt-6"><div class="p-6">                       :158–177
        ├── <ShieldCheck class="h-5 w-5 text-primary"/>
        ├── <h2 class="text-lg font-bold">Your data</h2>              :161–162
        ├── <ul class="mt-4 list-inside space-y-1 text-sm
        │        text-muted-foreground">                              :163–167
        │   ├── "Export everything at any time from Data → Export"
        │   ├── "Restore from a JSON backup at Data → Import"
        │   └── "Delete your account permanently at Danger Zone"
        └── <div class="mt-4 flex flex-wrap gap-4 text-sm font-medium">  :168–176
            ├── <Link href="/settings/data">       "Data settings"     :169–171
            ├── <Link href="/settings/export">     "Export my data"    :172–174
            └── <Link href="/settings/danger-zone" class="text-destructive">
                  "Delete my account"                              :175–177
                  ✅ the destructive link IS visually distinguished here —
                     the one place in the settings tree where it is
```

---

## 3. UI → component mapping

| Import | From | Lines | Directive | Role |
| ------ | ---- | ----- | --------- | ---- |
| `useState` | `react` | — | — | `saved` only |
| `Link` | `next/link` | — | — | sign-in + 3 data links ✅ |
| `CheckCircle2, Eye, Share2, ShieldAlert, ShieldCheck` | `lucide-react` | — | — | success + 2 row glyphs + sign-in + card glyph |
| `useAuth` | `@/hooks/useAuth` | — | `'use client'` | `isAuthenticated`, `isLoading` |
| `useSettings` | `@/hooks/useSettings` | 71 | `'use client'` | `settings`, `loading`, `save`, `patchLocal`, `saving`, `error` |
| `Card` | `@/components/ui/Card` | 26 | none | 3 instances |
| `Button` | `@/components/ui/Button` | — | none | Save |
| `Switch` | `@/components/ui/Switch` | 44 | `'use client'` | 2 instances |
| `Skeleton` | `@/components/ui/Skeleton` | — | none | 3 instances |

**All markup uses design tokens.** ✅

### 3.1 🔴 `Switch` renders `label` and `description` — hence the duplication

```tsx
// components/ui/Switch.tsx:14–43
export function Switch({ checked, onChange, label, description, disabled = false }: SwitchProps) {
  return (
    <label className="flex items-center select-none …">
      <div className="relative shrink-0">
        <input type="checkbox" className="sr-only" checked={checked} … />
        <div className={checked ? 'bg-primary …' : 'bg-muted border border-border'} />
        <motion.div className="absolute left-1 top-1 bg-white w-4 h-4 rounded-full …"
                     animate={{ x: checked ? 16 : 0 }} />
      </div>
      {(label || description) && (
        <span className="ml-3 min-w-0">
          {label && <span className="block text-sm font-medium text-foreground">{label}</span>}
          {description && <span className="mt-0.5 block text-xs text-muted-foreground">{description}</span>}
        </span>
      )}
    </label>
  );
}
```

So `<Switch label="Public profile" description="Let other users view…" />` renders its own label and description **beside the toggle** — and this page has *already* rendered an equivalent (but different) label and description in the left-hand text block. The user sees:

```
  👁 Public profile                                    ← the hand-built block (:97)
    When off, /api/users/[id] returns 404 for everyone,   ← (:98–104)
    including the leaderboard. Your name, bio and
    avatar are not readable by other users.

  ( ●─── )  Public profile                             ← the Switch's own label (:107)
             Let other users view your profile page
             and bio.                                     ← its own description (:109)
```

Two headings and two paragraphs saying broadly the same thing, with **different claims** — one says the leaderboard is covered, the other does not mention it. §26.

**The fix is one line each:** drop `label` and `description` from both `<Switch>` calls (they are optional in the props type), keeping the hand-built block. That halves the vertical space and removes the contradiction.

**Note the contrast with `/settings/appearance`**, which uses `<Switch label= description=>` **on its own**, without a surrounding text block — correct usage, no duplication. The two pages disagree about the component's contract. §26.

---

## 4. Frontend architecture

| Concern | Reality |
| ------- | ------- |
| Directive | `'use client'` |
| State | **1** `useState` (`saved`) — the leanest settings page |
| Data fetching | **0 on mount** |
| Writes | 1 `PUT /api/settings` with 2 keys |
| Optimistic model | ✅ `patchLocal` on both switches, then one explicit Save |
| Store discipline | ✅ Uses `useSettings` — the store rule `AGENTS.md` mandates |
| `setTimeout` cleanup | 🔴 **none.** `:71` `window.setTimeout(() => setSaved(false), 1600)` — no `useEffect`, no `clearTimeout`. Compare `/settings/appearance:116`–`:120` and `/settings/scoring`, which both return a cleanup. §24 F7 |
| Duplicate error UI | 🔴 **two** `role="alert"` blocks for the same `error` — `:131`–`:141` (outside the card, with a `ShieldAlert` glyph) and `:132`–`:138` (inside the card). A save failure renders **both**. §24 F6 |
| Save `disabled` | ⚠ none — `isLoading={saving}` only. A double-click sends two PUTs. §24 F5 |
| Dirty tracking | ❌ none |
| `useEffect` count | **0** — no seeding effect, no timer effect. The simplest page in the tree |

⚠ The duplicate error block is a direct consequence of the page having been edited incrementally: the outer one at `:131` was presumably added when the author noticed the original one was inside the `loading || !settings` branch (the same bug `/settings/scoring`'s header comment records) and added a second rather than moving the first.

---

## 5. Backend / API architecture

One write endpoint. But the *read* side is where the page's claims are tested, and that spans three routes.

### 5.1 `PUT /api/settings` — the write

`save({ profilePublic, shareStats })` → `store.ts:137` → `api/settings/route.ts:37` → `userService.updateSettings` → `updateSettingsSchema.safeParse` (`settings.schema.ts:64`–`:65`, both `z.boolean().optional()`) → `userRepository.updateSettings`. ✅ Thin, validated, `session.user.id` only, audit row written.

### 5.2 `GET /api/users/[id]` — `profilePublic` **is** honoured ✅

```
userService.getPublicProfile(userId, viewerId)                user.service.ts:92
  user = userRepository.findById(userId)
  if (!user || user.isDeleted || !user.isActive) return null         :104–106
  settings = userRepository.getSettings(userId)
  isSelf = viewerId === userId
  if (settings && settings.profilePublic === false && !isSelf)
    return null                                                      :111–114
  return { id, name, displayName, bio, avatarUrl, createdAt }        :116–122
```

✅ **This is correct, and the documentation around it is unusually good.** The service comment at `:70`–`:91` explains why both reasons for withholding produce a **404 rather than a 403** — *"a stranger must not be able to tell 'this profile is private' from 'this user does not exist'"* — which is the correct information-theoretic choice. It also lists the deliberately excluded fields and why: `role` (*"privilege information"*), `email`, `timezone` and `preferredLanguage` (*"locale and approximate-location signals"*), and `onboardingCompletedAt` (*"an account-age signal useful for fingerprinting"*).

🔴 **But the default is wrong-way-round.** `profilePublic` defaults to **`false`**, so the switch ships **off**. A new user's profile is private — good default. ✅ However a user who never visits this page has a profile that 404s for everyone, which is the safe failure mode. Fine.

### 5.3 `GET /api/users/[id]/profile` — `profilePublic` **is** honoured ✅ (after a documented leak)

`api/users/[id]/profile/route.ts:12`–`:24` records the fix:

> *"This route previously re-read the user directly and skipped that check entirely, so a profile the owner had set private was still served here in full, along with their activity counts — while `GET /api/users/[id]`, serving the same data, correctly returned 404."*

It now calls `getPublicProfileWithStats` (`:46`), which delegates to the same gate, and applies a `RateLimiter` of 30/min keyed on client IP (`:25`–`:29`) because the route is intentionally unauthenticated. ✅ **A genuine privacy bug, found, fixed, and documented in the code that would otherwise reintroduce it.**

### 5.4 🔴 `GET /api/users/leaderboard` — **neither switch is honoured**

```
UserService.getLeaderboard(currentUserId, limit, windowDays)   user.service.ts
  safeLimit = clamp(limit, 1, 100)
  since     = now − windowDays                        sinceDate = ISO slice
  scores    = userRepository.getAverageScores(sinceDate, safeLimit + 1)
                └─ prisma.dailyScore.groupBy({
                     by: ['userId'],
                     where: { date: { gte: sinceDate }, totalScore: { not: null } },
                     _avg: { totalScore: true }, _count: { _all: true },
                     orderBy: { _avg: { totalScore: 'desc' } },
                     take: limit,
                   })                                     ◄── NO settings filter
  ranked    = scores.filter(s => s.userId !== currentUserId).slice(0, safeLimit)
  candidates = userRepository.getLeaderboardCandidates(safeLimit + 1)
                └─ prisma.user.findMany({
                     where: { isDeleted: false, isActive: true },   ◄── NO settings filter
                     select: { id, name, displayName, avatarUrl, streak: { … } },
                     take: limit,
                   })
  return ranked.map(score => ({
    id, name: displayName ?? name ?? 'Anonymous', avatarUrl,
    averageScore, currentStreak, longestStreak, totalDays,
  }))
```

**Neither query joins `UserSettings`.** `UserService` does not even load a settings row in this method. So:

| Field exposed | Gated by |
| ------------- | -------- |
| `displayName` / `name` | 🔴 nothing |
| `avatarUrl` | 🔴 nothing |
| `averageScore` | 🔴 nothing — not `shareStats`, not `profilePublic` |
| `currentStreak` / `longestStreak` / `totalDays` | 🔴 nothing — not `shareStats` |

§25.

---

## 6. Database dependency

| Model | Column | Written | Read by |
| ----- | ------ | ------- | ------- |
| `UserSettings` | `profilePublic` (`@default(false)`) | ✅ `:67` | ✅ `user.service.ts:112`, `getPublicProfileWithStats` |
| `UserSettings` | `shareStats` (`@default(false)`) | ✅ `:68` | 🔴 **nothing** |
| `ActivityLog` | — | ✅ indirect | — one `SETTINGS_UPDATED` row per save |

Two booleans, one row, one `PUT`. The lightest settings page in the tree — and the only one where both values are read by the **same** service method.

---

## 7. What the two switches actually gate

### 7.1 The claim vs the implementation

| Switch | Helper text (verbatim) | Reality |
| ------ | ---------------------- | ------- |
| **Public profile** | *"When off, `/api/users/[id]` returns 404 for everyone, **including the leaderboard**. Your name, bio and avatar are not readable by other users."* | 🟡 **`/api/users/[id]`** ✅ and **`/api/users/[id]/profile`** ✅ return 404. **The leaderboard does not.** |
| **Share statistics** | *"Controls whether your streak, habit count and average score appear on the leaderboard."* | 🔴 **Nothing.** No code reads `shareStats`. |

### 7.2 `profilePublic` — half true, and the half that is false is the privacy-relevant one

The first half of the claim is accurate and well-implemented: both profile routes 404 for a private profile, the 404 is non-enumerating, and `/api/users/[id]/profile` is rate-limited because it is deliberately unauthenticated.

The second half — *"including the leaderboard"* — is not implemented, and the leaderboard is arguably the **more** privacy-relevant of the two surfaces: a profile page shows a name and a bio, whereas the leaderboard publishes a **ranked performance table** with average score and streaks. A user who reads this page and turns the switch off would reasonably conclude their score and streak are no longer published. They are.

### 7.3 `shareStats` — entirely decorative

The header comment at `:9`–`:10` says:

> *"the leaderboard exposed aggregate stats unconditionally. The public-profile route now consults `profilePublic` (below) and the leaderboard consults `shareStats`, so these switches gate something real."*

The first clause is a correct description of the past bug. The second clause describes a fix that **is not in the code** — `getLeaderboard` contains no reference to `shareStats` or to `UserSettings`. A grep across `src/` finds `shareStats` in exactly three places: this page's header comment, this page's `persist()`, and this page's `Switch`. Nowhere else.

So the page ships a comment asserting a security fix that does not exist. §25.

---

## 8. Complete user actions (serial)

### 8.1 Load

```
mount → useAuth() + useSettings()                     :29–30
        useState(false) saved                           :31
        authLoading → <Skeleton h-8 w-40/> + <Skeleton h-56/>   :32–43
        !isAuthenticated → "Sign in required"                  :45–64
        loading || !settings → 2 × <Skeleton h-16 w-full/>    :85–90
        otherwise → 2 rows + the save row
```

### 8.2 Toggle

```
user clicks the toggle
  └─ <input type="checkbox" class="sr-only"> onChange      Switch.tsx:21
       └─ onChange(e.target.checked) → onChange(checked)
            └─ patchLocal({ profilePublic | shareStats: checked })
                 store.ts:156
                   settings = {...before, <field>: checked}   ◄── LOCAL
                   applyAppearance(next)                      ◄── no-op for booleans
        ⚠ nothing is sent until Save
```

### 8.3 Save

```
click "Save privacy settings"                           :141
  └─ persist()                                            :65
       save({ profilePublic, shareStats })                 :66–69
        ├─ store.ts:127  OPTIMISTIC patch
        ├─ PUT /api/settings
        │    ├─ auth() → userId
        │    ├─ updateSettingsSchema.safeParse(2 booleans)
        │    ├─ updateSettings ──► UserSettings row
        │    ├─ timezone absent ⇒ no User write
        │    └─ audit 'SETTINGS_UPDATED' ──► ActivityLog
        ├─ store.ts:141  RECONCILED against the returned row
        └─ returns the row
       if (result) → setSaved(true)
                     window.setTimeout(() => setSaved(false), 1600)   :71
                     ⚠ no cleanup
```

### 8.4 Follow the data links

Three `<Link>`s to `/settings/data`, `/settings/export` and `/settings/danger-zone` (`:168`–`:177`). The last is styled `text-destructive` — ✅ **the only place in the settings tree where a link to the account-deletion page is visually marked as dangerous.** The `/settings` hub itself does not do this (`settings.md` F8).

---

## 9. What can the user create

**Nothing.**

## 10. What can the user edit

| Field | Cleared? | Gated by | Effective? |
| ----- | -------- | -------- | --------- |
| `profilePublic` | n/a (boolean) | ✅ `/api/users/[id]`, `/api/users/[id]/profile` | 🟡 yes, except the leaderboard |
| `shareStats` | n/a (boolean) | 🔴 nothing | 🔴 no |

## 11. What can the user delete

**Nothing from this page.** It links to `/settings/danger-zone`, which does the deleting — via `DeleteAccount.tsx` and `POST /api/auth/delete-account`.

Worth noting the information architecture here is **good**: this page is where a GDPR-minded user looks for "delete my data", and the card puts it third in a list with Export and Import — discoverable without being the first thing they see. ✅

---

## 12. Cross-page dependencies

### 12.1 Inbound

| Consumer | Relationship |
| -------- | ------------ |
| `/settings` hub | `settings/page.tsx:60` → `/settings/privacy` |
| Sidebar | ❌ |

### 12.2 Outbound

| Dependency | Kind |
| ---------- | ---- |
| `useSettings` → store | read + write |
| `PUT /api/settings` | write — 2 booleans |
| `GET /api/users/[id]` | 🔴 **not called by this page** — it is the surface the switch *gates* |
| `GET /api/users/[id]/profile` | 🔴 same |
| `GET /api/users/leaderboard` | 🔴 same — and the one that is **not** gated |
| 3 internal `<Link>`s | navigation only |

### 12.3 🔴 The read-side surface is three routes, and only two honour the switches

```
  profilePublic = false
        │
        ├─ GET /api/users/[id]            ──► getPublicProfile
        │                                     if (profilePublic === false && !isSelf)
        │                                       return null                 :112
        │                                     ⇒ 404  ✅ ENFORCED
        │
        ├─ GET /api/users/[id]/profile    ──► getPublicProfileWithStats
        │                                     delegates to the same gate
        │                                     ⇒ 404  ✅ ENFORCED (after a documented leak)
        │
        └─ GET /api/users/leaderboard     ──► getLeaderboard
                                              userRepository.getAverageScores()
                                                dailyScore.groupBy(...)
                                                WHERE date >= since      ◄── no settings
                                              userRepository.getLeaderboardCandidates()
                                                user.findMany(...)
                                                WHERE isDeleted=false, isActive=true
                                                                              ◄── no settings
                                              ⇒ 200 with name, avatar, avgScore,
                                                     streaks, totalDays
                                                     🔴 NOT ENFORCED

  shareStats = false
        │
        └─ (nothing anywhere)  🔴 NOT ENFORCED, and never referenced outside this page
```

§25.

---

## 13. Impact analysis

**If `/settings/privacy` were deleted:** the `profilePublic` switch becomes unreachable — and since it defaults to `false`, every account would stay permanently private with no way to open up. `/api/users/[id]` would keep returning 404 for everyone. **A functional regression**, not just a lost page.

**If `shareStats` were enforced in `getLeaderboard`:** the leaderboard would need to join `UserSettings` — either filtering in SQL (`user.settings: { shareStats: true }` on `getLeaderboardCandidates`, and a join on the `groupBy`) or filtering in JS after loading. The `groupBy` is the awkward one: `dailyScore.groupBy` cannot join a one-to-one easily, so the cleanest fix is to fetch the eligible user ids first and pass them as `userId: { in: [...] }` in the `where`. That changes the query shape and the index usage — a real change, but a small one.

**If `profilePublic` were enforced on the leaderboard too:** a user who turns it off disappears from the ranking entirely, which is arguably the correct reading of *"not readable by other users"* — a leaderboard row *is* readable by other users.

**Blast radius of the leaderboard gap:** anyone who has read this page and set both switches off believes their data is private. For `profilePublic` that belief is 80% correct — profile routes 404, leaderboard still lists them. For `shareStats` it is 0% correct.

**Blast radius of the duplicate error block:** a save failure renders two identical red banners 100 px apart, one of them inside the card. Cosmetic, but it makes a real error look like two problems.

---

## 14. Current System Capabilities

| Capability | Evidence |
| ---------- | -------- |
| Public-profile gate honoured on `GET /api/users/[id]` | `user.service.ts:112` ✅ |
| Public-profile gate honoured on `GET /api/users/[id]/profile` | `getPublicProfileWithStats` delegates to the same gate ✅ |
| 🔴 A previously-leaked private profile documented and fixed in the route that caused it | `api/users/[id]/profile/route.ts:16`–`:20` ✅ |
| 404 rather than 403, so private ≠ nonexistent | `user.service.ts:74`–`:76` — *"a stranger must not be able to tell"* ✅ correct information-theoretic choice |
| An explicit field allow-list with reasons | `user.service.ts:87`–`:90` — excludes `role`, `email`, `timezone`, `preferredLanguage`, `onboardingCompletedAt` ✅ |
| The owner always sees their own profile | `isSelf` short-circuit `user.service.ts:113` ✅ |
| Public profile route rate-limited per IP | `api/users/[id]/profile/route.ts:25`–`:29`, 30/min ✅ |
| Both booleans persisted through the shared store | `settings.schema.ts:64`–`:65`, `user.service.ts:297` |
| Error banner **outside** the loading branch | `:131` — and the same class of fix is recorded in `/settings/scoring`'s header comment ✅ |
| Descriptive helper text explaining the *mechanism*, not just the intent | `:98`–`:104` names the exact endpoint ✅ |
| Destructive link visually distinguished | `:175` `text-destructive` — ✅ the only such treatment in the settings tree |
| Data-rights links to Export / Import / Delete | `:168`–`:177` ✅ good information architecture |
| Token-only markup | ✅ |
| `role="alert"` on the error | `:133`, `:135` |
| Saved confirmation with a `dark:` variant | `:145` |

---

## 15. Currently NOT Supported

| Not supported | Note |
| ------------- | Note |
| 🔴 **`shareStats` enforcement** | Nothing reads it. §25 |
| 🔴 **`profilePublic` on the leaderboard** | Not gated. §25 |
| Per-field visibility (hide the bio but show the name) | Two coarse booleans only |
| Blocking a specific user from viewing your profile | No block-list anywhere |
| Per-achievement or per-habit visibility | The toggle is all-or-nothing |
| Anonymised leaderboard entries | `getLeaderboard` falls back to `'Anonymous'` only when the name is null (`:…`), not when privacy forbids it |
| "Who can see me" preview | No way to test the current exposure |
| Activity / login visibility | `DeviceSession` and `lastLoginAt` are not exposed, and not gated |
| Data-retention controls on this page | They are at `/settings/data` — 🔴 and all three are inert (`data.md` §25) |
| An audit view of who viewed your profile | No such record exists |
| Tests | None cover `getPublicProfile`'s gate, `getLeaderboard`, or the page |

---

## 16. Loading / Error / Empty / Edge states

| State | Trigger | Render |
| ----- | ------- | ------ |
| Auth loading | `authLoading` | `Skeleton h-8 w-40` + `Skeleton h-56` (`:32`–`:43`) |
| Signed out | `!isAuthenticated` | `Card` + `ShieldAlert` + `Link` (`:45`–`:64`) |
| Settings loading | `loading \|\| !settings` | 2 × `Skeleton h-16 w-full` (`:85`–`:90`) |
| Error | `error` | 🔴 **two** banners: `:131`–`:141` (with a `ShieldAlert` glyph) and `:132`–`:138` (inside the card) |
| Saved | `saved` | `CheckCircle2` + "Saved", 1600 ms, no cleanup (`:71`, `:144`–`:148`) |
| Empty | n/a | Two booleans always have a value |

### Edge cases

| Edge | Behaviour |
| ---- | --------- |
| 🔴 Save rejected | **Both** error banners render. `save()` rolls the store back (`store.ts:147`), so the switches snap back ✅ but `applyAppearance` is not re-run — irrelevant here, since neither boolean projects to `<html>` ✅ |
| Switch toggled, nothing saved | Local only; navigating away reverts. No warning |
| Double-click Save | Two PUTs, two audit rows. No `disabled` |
| Component unmounts during the 1600 ms timer | 🔴 fires on a dead component. Harmless in React 18+; the cleanup exists on `/settings/appearance` and `/settings/scoring` and is missing here |
| `profilePublic` on, user has no `name` | The leaderboard falls back to `'Anonymous'`; the profile renders `null` and the client handles it (`user.service.ts:99`–`:101`) ✅ |
| `settings` loaded but both fields `false` | Both rows render "off". The *default* state, so a first-time visitor sees the same UI as someone who deliberately chose private — 🔴 no indication that the current state is a default rather than a decision |

That last one is a real UX gap: the page cannot distinguish "I never set this" from "I set this to private", because the defaults and the explicit choice render identically. A first-run hint — *"Your profile is private by default"* — would resolve it. §24 F8.

---

## 17. Authentication & security

### 17.1 The write path

| Property | Verdict |
| -------- | ------- |
| `auth()` → 401 | ✅ `api/settings/route.ts:31`–`:34` |
| Client-supplied `userId` | ❌ never accepted ✅ |
| Zod validation | ✅ `settings.schema.ts:64`–`:65`, both `z.boolean()` |
| Prisma in the route | ❌ none ✅ |
| Audit trail | ✅ `SETTINGS_UPDATED` per save |
| Mass assignment | ✅ structurally impossible — 51-key allow-list; this page sends 2 |

### 17.2 The read path — the actual privacy surface

**This page is a privacy control, so its read-side correctness is the security question.** Assessed in full:

| Surface | Gate | Verdict |
| ------- | ---- | ------- |
| `GET /api/users/[id]` | `profilePublic === false && !isSelf` → `null` → 404 | ✅ correct |
| `GET /api/users/[id]/profile` | same gate, plus 30/min per-IP rate limit | ✅ correct, and a documented past leak was fixed |
| `GET /api/users/leaderboard` | 🔴 **none** | ❌ **not enforced** |
| `GET /api/users/search` | not examined for this audit | ⚠ to verify — it returns user rows and may expose the same fields |

The leaderboard exposure is concrete. For every active, non-deleted user with a score in the window, `getLeaderboard` publishes: `displayName ?? name ?? 'Anonymous'`, `avatarUrl`, `averageScore` (to 1 dp), `currentStreak`, `longestStreak` and `totalDays` — to any authenticated user, with no privacy check and no `shareStats` consultation.

🔴 **A user who sets both switches off on this page still appears on the leaderboard by name with their average score and streaks.** The page tells them the opposite.

### 17.3 What is right about the enforced paths

- **404, not 403** — correct. A 403 would confirm the account exists.
- **Explicit field allow-list** — `role`, `email`, `timezone`, `preferredLanguage`, `onboardingCompletedAt` all excluded, each with a stated reason. `timezone` and `preferredLanguage` as *"approximate-location signals"* is a genuinely thoughtful exclusion.
- **Owner bypass** — `isSelf` means a signed-in user never 404s on their own record.
- **Rate limit on the public route** — the only unauthenticated-by-design surface, limited to 30/min per IP.
- **Deactivated/deleted accounts are hidden** regardless of the switch.

### 17.4 The security-relevant summary

The page is **half a privacy control**. The half that gates the profile routes is implemented carefully, documented in place, and includes a fix for a real leak. The half that gates the leaderboard is not implemented at all, and the page's copy asserts otherwise in three places: the header comment, the first helper text, and the second helper text.

§25.

---

## 18. Performance

| Metric | Value |
| ------ | ------ |
| Requests on mount | **0** |
| Requests per save | **1** (`PUT /api/settings`, 2 keys) |
| Queries per save | 1 `updateSettings` + 1 audit insert |
| Client state | **1** `useState` |
| `useEffect` count | **0** |
| Components | 3 `Card` + 2 `Switch` + 1 `Button` + 3 `Skeleton` |
| Page lines | **180** |

The lightest settings page in the tree. No memoisation, no `useMemo`, no expensive derivations, no option lists to build.

⚠ One consideration worth recording: this page **deliberately does not fetch** `/api/users/[id]` or the leaderboard to show the user their current exposure. A "who can see me" preview would cost one request and would be genuinely useful — but it is a missing feature, not a performance problem. §15.

---

## 19. External integrations

| Integration | Present? | Detail |
| ----------- | -------- | ------ |
| **Neon / Postgres** | ✅ | `UserSettings` (1 row, 2 booleans) + `ActivityLog` |
| **Third-party APIs** | ❌ | none |
| **Email** | ❌ | 🔴 **no confirmation email when a profile becomes private or public.** A privacy change is exactly the kind of event a user would want a record of by email; and the audit row lives only in `ActivityLog`, which has no UI |
| **Analytics** | ❌ | no event emitted when a privacy switch flips |
| **Consent management** | ❌ | the two booleans are the entire consent model; there is no cookie/consent layer, no policy-version record, and nothing that records when a user *accepted* anything |

The last row is the substantive gap. `profilePublic` and `shareStats` are **publication** choices about your own data, which is a legitimate use of two switches. They are not a GDPR consent record, and the page does not claim to be one — worth stating so the distinction is not lost if the app grows.

---

## 20. Background jobs / cron effects

**None.**

| Cron | Relevance |
| ---- | --------- |
| `/api/cron/compute-daily-scores` | Indirect. `averageScore` on the leaderboard is computed from `DailyScore` rows in a rolling `windowDays` window (default 90). So a user who turns *Public profile* off still accrues score rows that the leaderboard query groups over — the data exists and is published even though the UI says otherwise. |
| `/api/cron/generate-insights` | None — a stub |

No cron reads either boolean, and no cron prunes the `ActivityLog` rows these toggles write.

---

## 21. Data flow diagrams

### 21.1 Write

```
  /settings/privacy
        │  click a toggle
        ▼
  <input type="checkbox" class="sr-only">            Switch.tsx:19–22
        └─ onChange → patchLocal({ profilePublic | shareStats })
             store.ts:156  settings = {...before, <field>}
             applyAppearance(next)   ◄── no-op for booleans
        │
        │  click "Save privacy settings"                :141
        ▼
  persist()                                             :65
        └─ save({ profilePublic, shareStats })          :66–69
             ├─ OPTIMISTIC                              store.ts:127
             ├─ PUT /api/settings                        :137
             │    ├─ auth() → userId
             │    ├─ updateSettingsSchema.safeParse (2 × z.boolean())
             │    ├─ updateSettings ──────────────► UserSettings row
             │    └─ audit 'SETTINGS_UPDATED' ─────► ActivityLog row
             ├─ RECONCILED                              :141
             └─ return row
        ▼
  setSaved(true); setTimeout(…, 1600)   🔴 no cleanup     :70–72
```

### 21.2 Read — where the claims are tested

```
  profilePublic / shareStats stored on UserSettings
        │
        ├───────────────── profilePublic ─────────────────┐
        │                                                 │
        ▼                                                 ▼
  GET /api/users/[id]                        GET /api/users/[id]/profile
    userService.getPublicProfile                userService.getPublicProfileWithStats
      user.isDeleted || !isActive → null          delegates to the SAME gate
      settings.profilePublic === false             + RateLimiter 30/min per IP
        && !isSelf → null                       ⇒ 404        ✅ ENFORCED
      ⇒ 404                    ✅ ENFORCED
      returns 6 allow-listed fields only

  shareStats ─────────────────────────────┐
                                           │
                                           ▼
                                    (nothing reads it)   🔴 NOT ENFORCED

  ┌──────────────────────────────────────────────────────────────┐
  │  GET /api/users/leaderboard          user.service.ts           │
  │                                                                │
  │    getAverageScores(sinceDate, limit+1)                        │
  │      dailyScore.groupBy({ by:['userId'],                       │
  │        where:{ date:{gte:sinceDate}, totalScore:{not:null} },  │
  │        _avg:{totalScore:true}, … })      ◄── no settings join  │
  │                                                                │
  │    getLeaderboardCandidates(limit+1)                            │
  │      user.findMany({ where:{ isDeleted:false, isActive:true },  │
  │        select:{ id,name,displayName,avatarUrl,streak{…} }, … }) │
  │                                      ◄── no settings join      │
  │                                                                │
  │    ⇒ { displayName, avatarUrl, averageScore,                   │
  │         currentStreak, longestStreak, totalDays }              │
  │         for every active user, to any authenticated caller     │
  │                                        🔴 NOT ENFORCED          │
  └──────────────────────────────────────────────────────────────┘
```

### 21.3 The duplication, drawn

```
  <div class="flex items-start justify-between gap-4">              :92
    ├── <div>                                                        :93
    │     👁  Public profile                          ◄── hand-built heading
    │        When off, /api/users/[id] returns 404 for
    │        everyone, including the leaderboard. …                  ◄── hand-built copy
    └── <Switch label="Public profile"                               :106
               description="Let other users view your profile page and bio." />
                 └─ Switch.tsx:28–37 renders label + description beside the toggle
                       ◄── a SECOND heading and a SECOND paragraph
                          and the two copies make different claims
```

---

## 22. File-by-file dependency inventory

### 22.1 The route

| File | Lines | Directive | Role |
| ---- | ----- | --------- | ---- |
| `src/app/(dashboard)/settings/privacy/page.tsx` | **180** | `'use client'` | 2 switches + a static data-rights card |

### 22.2 Components

| File | Lines | Directive | Instances |
| ---- | ----- | --------- | --------- |
| `src/components/ui/Switch.tsx` | 44 | `'use client'` | 2 — ⚠ renders the duplicated label/description |
| `src/components/ui/Card.tsx` | 26 | none | 3 |
| `src/components/ui/Button.tsx` | — | none | 1 |
| `src/components/ui/Skeleton.tsx` | — | none | 3 |

### 22.3 API

| File | Lines | Method | Gates this page? |
| ---- | ----- | ------ | ---------------- |
| `src/app/api/settings/route.ts` | 44 | GET + PUT | the write ✅ |
| `src/app/api/users/[id]/route.ts` | — | GET | ✅ `profilePublic` |
| `src/app/api/users/[id]/profile/route.ts` | 67 | GET | ✅ `profilePublic`, rate-limited |
| `src/app/api/users/leaderboard/route.ts` | — | GET | 🔴 **neither** |

### 22.4 Server

| File | Lines | Role |
| ---- | ----- | ---- |
| `src/server/services/user.service.ts` | `:92`/`:125`/`getLeaderboard` | `getPublicProfile` (gated ✅), `getPublicProfileWithStats` (gated ✅), `getLeaderboard` (**ungated** 🔴) |
| `userRepository` | — | `getSettings`, `getAverageScores`, `getLeaderboardCandidates` |

### 22.5 Shared

| File | Lines | Role |
| ---- | ----- | ---- |
| `src/store/settings.store.ts` | 174 | `save`, `patchLocal` |
| `src/hooks/useSettings.ts` | 71 | `useSettings` |
| `src/lib/validation/settings.schema.ts` | 75 | `profilePublic` `:64`, `shareStats` `:65` |

### 22.6 Counts

| Metric | Value |
| ------ | ----- |
| Page lines | **180** (4th smallest settings page) |
| Requests on mount | **0** |
| Requests per save | **1** |
| Client `useState` | **1** |
| `useEffect` | **0** |
| Settings edited | 2 |
| Settings enforced | **1** |
| Surfaces gated | 2 of 3 |
| Duplicate label/description renderings | **4** (2 rows × 2) |
| Duplicate error banners | **2** |
| Hardcoded light classes | **0** ✅ |

---

## 23. Current behavior summary

`/settings/privacy` is the leanest settings page in the tree — 180 lines, one `useState`, zero `useEffect`s, one request per save. It does the store discipline correctly, uses design tokens throughout, puts its error banner outside the loading branch, and links to Export / Import / Delete with the destructive one styled `text-destructive` — the only such treatment in the settings tree.

**One of its two switches works, and works well.** `profilePublic` is enforced on both profile routes with a deliberate design: 404 rather than 403 so a private profile is indistinguishable from a nonexistent one, an explicit six-field allow-list excluding `role`, `email`, `timezone`, `preferredLanguage` and `onboardingCompletedAt` — each exclusion with a stated reason, including `timezone` as an *"approximate-location signal"* — an owner bypass, and a per-IP rate limit on the deliberately-unauthenticated profile route. That route's docstring records a real leak that was found and fixed: it once re-read the user directly and served a private profile in full with activity counts, while the sibling route correctly 404'd.

**The other switch does nothing.** `shareStats` appears in exactly three places in the entire repository: this page's header comment, this page's `persist()`, and this page's `<Switch>`. `UserService.getLeaderboard` issues a `dailyScore.groupBy` across all users and a `user.findMany` on `{ isDeleted: false, isActive: true }` — neither query joins `UserSettings`, and the method never loads a settings row. So the leaderboard publishes every active user's display name, avatar, average score and streaks to any authenticated caller, regardless of the switch.

**And the leaderboard ignores `profilePublic` too**, which makes the first helper text's *"including the leaderboard"* clause wrong in the place where it matters most — a ranked performance table is more revealing than a bio.

The UI compounds this: each row renders a hand-built heading and paragraph *and* passes the same strings as `label`/`description` to a `Switch` that renders them itself, so all four text elements appear twice with subtly different claims. A save failure renders two identical error banners. And `setTimeout` has no cleanup, unlike its two sibling pages.

---

## 24. Findings register

Severity: 🔴 **critical** · 🟠 **major** · 🟡 **minor**.

| ID | Sev | Finding | Evidence | Fix |
| -- | --- | ------- | -------- | --- |
| **F1** | 🔴 | 🔴 **`shareStats` is read by nothing.** `getLeaderboard` calls `getAverageScores` (a `dailyScore.groupBy` with no settings filter) and `getLeaderboardCandidates` (`user.findMany` on `{isDeleted,isActive}` with no settings filter), and never loads a `UserSettings` row. The page's helper text and header comment both assert the opposite. | `user.service.ts` `getLeaderboard`; `user.repository.ts` `getAverageScores`/`getLeaderboardCandidates`; grep — `shareStats` only in `settings/privacy` + `settings.schema` | Filter by `shareStats`. Cleanest shape: fetch eligible ids, then `where: { userId: { in: ids } }` on the `groupBy`. **§25** |
| **F2** | 🔴 | 🔴 **The leaderboard ignores `profilePublic` too**, so a user who turns the first switch off is still published by name, avatar, average score and streaks. The first helper text's *"including the leaderboard"* clause is false. | as F1; `settings/privacy:98`–`:104` | Apply the same `profilePublic === true` filter. **§25** |
| **F3** | 🟠 | Every row renders its heading and paragraph twice: once in a hand-built `<div>` and once via `Switch`'s `label`/`description` props, which it renders itself. The two copies make **different claims** about the leaderboard. | `:92`–`:112`, `:114`–`:131` vs `Switch.tsx:28`–`:37` | Drop `label`/`description` from both `<Switch>` calls (both optional), or drop the hand-built block. **§26** |
| **F4** | 🟠 | The page header comment asserts a security fix that does not exist: *"the leaderboard consults `shareStats`, so these switches gate something real."* | `:9`–`:10` vs F1 | Correct the comment, or implement the gate. A misleading comment about a privacy fix is worse than no comment. |
| **F5** | 🟡 | The Save button has **no `disabled`** — `isLoading={saving}` only — so a double-click issues two PUTs and writes two `ActivityLog` rows. | `:141` | `disabled={saving \|\| loading \|\| !settings}`. |
| **F6** | 🟡 | 🔴 **Two `role="alert"` error banners** for the same `error` — one outside the card at `:131` with a `ShieldAlert` glyph, one inside at `:132`. A save failure renders both. | `:131`–`:141` and `:132`–`:138` | Delete one. |
| **F7** | 🟡 | `setTimeout(() => setSaved(false), 1600)` has **no cleanup**, unlike `/settings/appearance:116`–`:120` and `/settings/scoring`, which both return a `clearTimeout`. | `:71` | Move the timer into a `useEffect` with a cleanup. |
| **F8** | 🟡 | The page cannot distinguish *"I never set this"* from *"I deliberately set this"* — both defaults are `false` and both render identically. A first-time visitor sees two off switches with no indication that privacy is the default. | `schema.prisma` `@default(false)` ×2; `:106`, `:124` | Add a first-run hint: *"Your profile is private by default."* |
| **F9** | 🟠 | 🔴 `GET /api/users/search` returns user rows and was **not** verified for this audit against `profilePublic`. If it exposes `email` or `timezone`, the privacy switch is bypassed on a third surface. | `api/users/search/route.ts` — **not read** | Verify; apply the same gate. **§15** |
| **F10** | 🟡 | The header comment says the previous bug was that *"the leaderboard exposed aggregate stats unconditionally"* — true — but the fix it describes for `profilePublic` was applied to the **profile** routes only, and the comment's next clause implies otherwise. | `:6`–`:11` | Split the claim: profile routes fixed, leaderboard not. |
| **F11** | 🟡 | No dirty tracking: toggle both switches, navigate away, lose both, no warning. | `:140`–`:149` | Track dirtiness; warn on unmount. |
| **F12** | 🟠 | **No tests** cover the privacy gate itself — `getPublicProfile`'s `isSelf` short-circuit, the 404-not-403 choice, or the field allow-list. The allow-list in particular is a security boundary with no regression guard. | `tests/` listing; `user.service.ts:87`–`:122` | `tests/domain/public-profile.test.ts` — a private profile 404s for a stranger, returns for the owner, and never includes `role`/`email`/`timezone`. |

**Count: 12 findings. 2 critical, 5 major, 5 minor.**

---

## 25. Neither switch gates the leaderboard

### 25.1 What the page claims

Three places, in the page's own words:

| Location | Text |
| -------- | ---- |
| Header comment `:9`–`:10` | *"the public-profile route now consults `profilePublic` (below) and **the leaderboard consults `shareStats`**, so these switches gate something real."* |
| Row 1 helper `:98`–`:104` | *"When off, `/api/users/[id]` returns 404 for everyone, **including the leaderboard**."* |
| Row 2 helper `:123`–`:126` | *"**Controls whether** your streak, habit count and average score **appear on the leaderboard**."* |

### 25.2 What `getLeaderboard` actually does

```ts
async getLeaderboard(currentUserId: string, limit = 25, windowDays = 90) {
  const safeLimit = Math.min(Math.max(Number(limit) || 25, 1), 100);
  const since = new Date(); since.setDate(since.getDate() - windowDays);
  const sinceDate = since.toISOString().slice(0, 10);

  const scores = await this.userRepository.getAverageScores(sinceDate, safeLimit + 1);
  //        └─► prisma.dailyScore.groupBy({
  //              by: ['userId'],
  //              where: { date: { gte: sinceDate }, totalScore: { not: null } },
  //              _avg: { totalScore: true }, _count: { _all: true },
  //              orderBy: { _avg: { totalScore: 'desc' } }, take: limit,
  //            })                              ◄── NO UserSettings join

  const ranked = scores.filter(s => s.userId !== currentUserId).slice(0, safeLimit);

  const candidates = await this.userRepository.getLeaderboardCandidates(safeLimit + 1);
  //        └─► prisma.user.findMany({
  //              where: { isDeleted: false, isActive: true },   ◄── NO settings join
  //              select: { id, name, displayName, avatarUrl,
  //                        streak: { currentStreak, longestStreak,
  //                                 totalCompletedDays } },
  //              take: limit,
  //            })

  return ranked.map(score => {
    const user = byId.get(score.userId); if (!user) return null;
    return {
      id: user.id,
      name: user.displayName ?? user.name ?? 'Anonymous',
      avatarUrl: user.avatarUrl,
      averageScore: Math.round(score.averageScore * 10) / 10,
      currentStreak: user.streak?.currentStreak ?? 0,
      longestStreak: user.streak?.longestStreak ?? 0,
      totalDays: user.streak?.totalCompletedDays ?? score.scoredDays,
    };
  }).filter(row => row !== null);
}
```

`UserService` does not call `userRepository.getSettings` anywhere in this method. The two queries cannot filter on a setting they do not join.

### 25.3 The exposure, field by field

| Returned field | Gated by `profilePublic`? | Gated by `shareStats`? |
| --------------- | ------------------------- | ----------------------- |
| `id` | 🔴 no | 🔴 no |
| `name` (`displayName ?? name`) | 🔴 no | 🔴 no |
| `avatarUrl` | 🔴 no | 🔴 no |
| `averageScore` | 🔴 no | 🔴 no |
| `currentStreak` | 🔴 no | 🔴 no |
| `longestStreak` | 🔴 no | 🔴 no |
| `totalDays` | 🔴 no | 🔴 no |

**Seven fields, zero gates.** Any authenticated user loading `/leaderboard` sees every active user's name, avatar and performance ranking over a rolling window (default 90 days).

### 25.4 The grep that settles it

```
$ grep -rn "shareStats" src/  |  grep -v generated |  grep -v settings/privacy | grep -v settings.schema
(no output)
```

The only non-generated occurrences of `shareStats` outside this page and the validation schema: **none**.

### 25.5 Why this is critical rather than merely dead

`defaultView` (in `/settings/appearance`) is also unread — but it is a convenience preference with no privacy dimension. `shareStats` is different in kind:

- It is presented to the user as a **privacy control**, in a page whose entire purpose is privacy.
- The user's reasonable expectation from reading *"Controls whether your streak, habit count and average score appear on the leaderboard"* is that turning it off stops exactly that.
- The failure is **silent and permanent**: the data keeps publishing, and the user has no way to detect it.

A user who decides not to publish their productivity scores, sets this switch, and sees themselves still ranked is worse off than a user who was never offered the switch — because they have been given false assurance.

### 25.6 The fix

Two changes, in order.

**(a) Filter by `shareStats`.** The `groupBy` cannot easily join a one-to-one relation, so fetch the eligible ids first:

```ts
// UserService.getLeaderboard
const eligible = await this.userRepository.getLeaderboardCandidates(safeLimit * 4);
// …or better, a dedicated id query:
const ids = (await this.userRepository.findIdsWithShareStatsEnabled(safeLimit * 4))
  .map(u => u.id);

const scores = await this.userRepository.getAverageScores(sinceDate, safeLimit + 1, ids);
// repository:
getAverageScores(sinceDate: string, limit: number, userIds: string[]) {
  return this.prisma.dailyScore.groupBy({
    by: ['userId'],
    where: {
      userId: { in: userIds },
      date: { gte: sinceDate },
      totalScore: { not: null },
    },
    …
  });
}
```

The `userIds: { in: … }` predicate also **improves** the query: today `getAverageScores` groups `DailyScore` across every user in the database and ranks them, which on a multi-tenant deployment is both wasteful and a mild information leak through row timing.

**(b) Decide what `profilePublic` means for the leaderboard.** Two defensible readings:

| Reading | Implementation |
| ------- | -------------- |
| `profilePublic` covers **profiles only**; `shareStats` governs the leaderboard | Leaderboard filters on `shareStats` alone. Then the row-1 helper text must drop *"including the leaderboard"*, and the leaderboard entry should probably show an anonymised fallback when `profilePublic` is off |
| `profilePublic` is a **single** "am I listed publicly" switch | Both filters apply. Simpler for the user to reason about: one switch, one rule |

I'd take the second. Two switches that overlap on one screen is confusing, and the current wording already reads as though the author intended `profilePublic` to be the master control.

**(c) Fix the comment.** Whatever is chosen, `:9`–`:10` must describe what the code does. A comment asserting a security control that does not exist is the most dangerous artefact on this page, because it stops the next reader from looking.

§24 F1, F2, F4.

---

## 26. Duplicated labels and descriptions

### 26.1 The mechanism

`Switch` is a **labelled** component, not a bare toggle:

```tsx
// Switch.tsx:28–37
{(label || description) && (
  <span className="ml-3 min-w-0">
    {label && <span className="block text-sm font-medium text-foreground">{label}</span>}
    {description && <span className="mt-0.5 block text-xs text-muted-foreground">{description}</span>}
  </span>
)}
```

So passing `label`/`description` renders them to the **right** of the toggle, inside the `<label>` element (which also makes the text a click target — a genuine benefit).

### 26.2 What this page does with it

Each row is a two-column flex: a hand-built text block on the left, the `<Switch>` on the right — and the `<Switch>` is *also* given a `label` and a `description`.

| Row | Hand-built (left) | `Switch` props (right) |
| ---- | ------------------ | ---------------------- |
| 1 | `<Eye/>` + "Public profile" + a 4-line paragraph about `/api/users/[id]` | `label="Public profile"`, `description="Let other users view your profile page and bio."` |
| 2 | `<Share2/>` + "Share statistics" + a 3-line paragraph about the leaderboard | `label="Share statistics"`, `description="Share aggregate stats such as streaks and average score."` |

**Four headings and four paragraphs render where two of each are intended.**

### 26.3 Three consequences

1. **Vertical waste.** Each row roughly doubles in height, and the duplication is visible rather than subtle.
2. 🔴 **The two copies disagree.** Row 1's left block says *"including the leaderboard"*; its `Switch` description does not mention the leaderboard at all. Row 2's left block says the switch controls the leaderboard; its `description` is vaguer. A user reading only one of the two copies gets a different impression — and per §25, the left block is the wrong one.
3. **Screen-reader noise.** Inside a single `<label>`-wrapped control, the accessible name is assembled from all its text. With both copies present the name becomes roughly *"Public profile When off, /api/users/[id] returns 404… Public profile Let other users view your profile page and bio."*

### 26.4 The fix

Drop the props — they are optional:

```tsx
<Switch
  checked={settings.profilePublic}
  onChange={(checked) => patchLocal({ profilePublic: checked })}
/>
```

The hand-built block stays, with its icon, heading and detailed copy. That is the better of the two, because it explains the *mechanism* — which endpoint returns what — and a mechanism explanation is more useful than a restatement of the label.

⚠ One benefit is lost: `Switch`'s label is inside the `<label>` element, so clicking the text toggles the switch. With `label` removed, the hit target shrinks to the 40×24 toggle. If that matters, either keep `label` and drop the hand-built heading (keeping only its explanatory paragraph), or widen the toggle's hit area. Given the toggle is 40×24 — below the ~44px touch minimum `PeriodControl.tsx:57` explicitly cites — **keeping a clickable text label is worth preserving**. The better fix is therefore: keep `label`, drop the duplicated *heading* from the left block, and keep the left block for its paragraph only.

### 26.5 The sibling that gets it right

`/settings/appearance:245`–`:262` uses three `<Switch label= description=>` **without** any surrounding hand-built block:

```tsx
<Switch
  label="Animations"
  description="Decorative motion and transitions across the app."
  checked={settings.animationsEnabled}
  onChange={(checked) => patchLocal({ animationsEnabled: checked })}
/>
```

No duplication, and the whole row is clickable. So the two pages disagree about the component's contract, and `/settings/appearance` has it right. §24 F3.

---

## 27. The rest of the settings surface

Three observations about the page's second card, which is small but does something the rest of the settings tree does not.

### 27.1 The destructive link is marked

```tsx
<Link href="/settings/danger-zone" className="text-destructive hover:underline">
  Delete my account
</Link>
```

`/settings.md` F8 records that the **hub** presents `/settings/danger-zone` identically to `Export` and `Import` — same `glass-panel`, same hover, separated only by an `AlertTriangle` glyph. Here, on the one page a GDPR-minded user is most likely to visit, the destructive destination is styled `text-destructive` while its two siblings are `text-primary`. ✅ **This is the correct treatment and it should be back-ported to the hub.**

### 27.2 The list text duplicates the links

The `<ul>` above the link row says:

- *"Export everything at any time from Data → Export"*
- *"Restore from a JSON backup at Data → Import"*
- *"Delete your account permanently at Danger Zone"*

and then three `<Link>`s repeat the same three destinations with slightly different labels. The bullets add one genuinely useful fact — that import is a **restore from a JSON backup**, and that deletion is **permanent** — while the rest is duplication. Tightening this to one sentence of context per link would read better, but it is a copy issue, not a defect.

### 27.3 The card title is "Your data", which sets up a GDPR expectation the page does not meet

A user arriving at a card called **"Your data"** with the options Export / Import / Delete is thinking about GDPR Article 15 (access), Article 17 (erasure) and Article 20 (portability). The page delivers all three as **links** — correctly, because the work is done by `/settings/export`, `/settings/import` and `/settings/danger-zone`.

But the page is also where a user would reasonably look for:

| GDPR-adjacent expectation | Present? |
| ------------------------- | -------- |
| What data is held about me? | ❌ no inventory |
| Who can see it? | 🟡 partially — and the leaderboard half is broken (§25) |
| How long is it kept? | 🔴 **no** — `/settings/data` has the controls, but all three are inert and contradict the privacy policy (`data.md` §25) |
| Can I correct it? | ✅ `/settings/profile` |
| Can I export it? | ✅ link — 🔴 though the export is written to ephemeral storage (`export.md` F1) |
| Can I delete it? | ✅ link |
| Consent / policy version | ❌ nothing records when a user accepted anything |
| Automated decision-making | ❌ n/a here |

So of the six, **two are broken, one is partial, and three work.** The card's title invites the full set. That is not a defect in the card — it is a useful map of where the product's privacy story has gaps, and this page is where a careful reader will discover them.

§27.3 is worth carrying into any future privacy work: the page is honest about what it links to, and the links mostly work. The failures are all in the surfaces those links point at.

---

*End of `/settings/privacy` audit. 27 sections, 12 findings, 180 lines over a 44-line route and a 71-line hook. 2 critical findings, both the same root cause: `getLeaderboard` joins no settings, so neither `shareStats` nor `profilePublic` gates the one surface where they matter most. The profile-route enforcement is genuinely well built — 404-not-403, an explicit field allow-list with reasons, an owner bypass, a per-IP rate limit, and a documented past leak fixed in place — which makes the leaderboard gap a clear omission rather than a systemic privacy problem. Documentation only: no source file was modified.*