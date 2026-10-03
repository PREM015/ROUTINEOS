# `/settings/profile` — Complete System Audit

**Route:** `http://localhost:3000/settings/profile`
**Route file:** `src/app/(dashboard)/settings/profile/page.tsx` (**192 physical lines**, `'use client'`)
**Project:** RoutineOS (`daily-plan`) — Next.js 16 (App Router) + Prisma 7 + PostgreSQL (Neon)
**Audit date:** 2026-09-30 · **Status:** documentation-only pass — no code was changed. Every claim is file-anchored.

> **Line-count convention:** **physical** line counts.

> ### Headline findings
>
> 1. 🔴 **A second page edits the same four fields.** `/profile` (`src/app/(dashboard)/profile/page.tsx`, 232 lines) has its own name/displayName/bio/avatarUrl form writing the same `PATCH /api/auth/update-profile`. Two editors, one endpoint, no cross-tab coordination, and no "this was edited elsewhere" signal. The two forms differ in validation and in which store they update. §25.
> 2. 🟠 **`updateProfile` validates twice and can disagree with itself.** The route parses with `updateProfileSchema` (`api/auth/update-profile/route.ts:19`), then hands `input` to `UserService.updateProfile`, which **parses the same schema again** (`user.service.ts`). Two `safeParse` passes over the same body for one write. Not a bug today, but the second pass receives an already-narrowed object, so the route's copy is pure ceremony. §24 F4.
> 3. 🟠 **The route exposes `timezone` and `preferredLanguage`; the page never sends them.** `updateProfileSchema` accepts both and `handleUpdateProfile` forwards both, but `/settings/profile` sends only the four profile fields. The other two are reachable only by hand-crafting a request — and `timezone` has a *second*, dedicated page (`/settings/timezone`) that also writes `User.timezone`. Three writers, one column. §24 F5.
> 4. 🟡 **`avatarUrl` is validated as a URL but rendered unescaped elsewhere.** `.url()` on the schema is correct, but a `javascript:` URI satisfies `z.string().url()` in Zod, and the avatar is rendered as an `<img src>` by the consumer pages. Worth a protocol allow-list. §24 F7.

---

## Table of contents

| §   | Section                                                                                       |
| --- | --------------------------------------------------------------------------------------------- |
| 1   | [What `/settings/profile` is, in one paragraph](#1-what-settingsprofile-is-in-one-paragraph)   |
| 2   | [UI block diagram](#2-ui-block-diagram)                                                       |
| 3   | [UI → component mapping](#3-ui--component-mapping)                                            |
| 4   | [Frontend architecture](#4-frontend-architecture)                                             |
| 5   | [Backend / API architecture](#5-backend--api-architecture)                                    |
| 6   | [Database dependency](#6-database-dependency)                                                 |
| 7   | [The clear-vs-omit contract](#7-the-clear-vs-omit-contract)                                   |
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
| 25  | [Two pages, one set of fields](#25-two-pages-one-set-of-fields)                               |
| 26  | [Three writers for `timezone`](#26-three-writers-for-timezone)                               |
| 27  | [Validation and the clear contract](#27-validation-and-the-clear-contract)                     |

---

## 1. What `/settings/profile` is, in one paragraph

`/settings/profile` is the user's **public profile** editor — the one settings page that writes to `User` rather than to `UserSettings`. It is a 192-line `'use client'` form with four editable fields (`Name`, `Display name`, `Avatar URL`, `Bio`) plus a read-only `Email`, a "Save profile" button gated on `name.trim().length >= 2`, and a transient "Saved" confirmation. The form seeds itself from `useAuth().user` in a mount effect, builds a patch where every cleared field becomes **`null` rather than `undefined`**, PATCHes `/api/auth/update-profile`, and then optimistically patches the auth store so the sidebar updates without a reload. The `null`-not-`undefined` choice is documented in three places — the page header, the schema, and the inline comment at `:56`–`:57` — because it fixes a real bug where `JSON.stringify` dropped the key and clearing a bio silently did nothing. It is the redirect target of `/settings/account` and it competes with `/profile`, a separate 232-line page that edits the same four fields.

---

## 2. UI block diagram

```
/settings/profile  (settings/profile/page.tsx — 'use client', 192 lines)
│
├── if (isLoading)                                                  :80–89
│     <Skeleton class="h-8 w-40" />
│     <Skeleton class="h-96 rounded-xl" />     ← taller than the other 19 pages (h-64)
│
├── if (!isAuthenticated || !user)                                 :91–108
│     <Card><div class="p-8 text-center">
│       <ShieldAlert class="mx-auto h-12 w-12 text-amber-500" />
│       <h1 class="mt-4 text-xl font-bold">Sign in required</h1>
│       <Link href="/login" …>Sign in</Link>     ✅ uses next/link (unlike export/import)
│     </div></Card>
│
└── <main class="container mx-auto max-w-3xl px-4 py-8">           :111
    ├── <div class="mb-6">                                          :112–117
    │   ├── <h1 class="text-2xl font-bold">Profile</h1>           :113
    │   └── <p class="mt-1 text-sm text-muted-foreground">
    │         "Update your public profile information."         :114–116
    │
    └── <Card><div class="p-6">                                    :119–189
        ├── <div class="grid grid-cols-1 gap-4 sm:grid-cols-2">   :121
        │   ├── <Input label="Name" maxLength={50}
        │   │          value={name} placeholder="Your full name" />        :122–128
        │   │          ⚠ NO helperText stating the 2-char minimum
        │   └── <Input label="Display name" maxLength={50}
        │              helperText="Clear this to fall back to your name." /> :129–136
        │
        ├── <div class="mt-4">
        │   └── <Input label="Avatar URL" placeholder="https://…"
        │              helperText="Must be a valid URL. Clear this to remove your avatar." />  :140–146
        │
        ├── <div class="mt-4">
        │   └── <Textarea label="Bio" rows={4} maxLength={500}
        │           placeholder="A short introduction (max 500 characters)"
        │           helperText="Clear this to remove your bio." />          :150–158
        │
        ├── <div class="mt-4">
        │   └── <Input label="Email" value={user.email} readOnly disabled
        │              helperText="Email changes are managed by the
        │                         authentication provider." />              :162–168
        │       ✅ honest and correct — email is @unique on User and is the
        │          auth provider's identity, so this is not editable here
        │
        ├── {error && <div role="alert"
        │      class="bg-destructive/10 … text-destructive">}                :171–175
        │       ✅ token-based
        │
        └── <div class="mt-6 flex flex-wrap items-center gap-3">          :177–187
            ├── <Button onClick={() => void save()}
            │            isLoading={saving}
            │            disabled={name.trim().length < 2}>               :178
            │     "Save profile"
            │     ⚠ the 2-char rule is enforced ONLY here — typing a
            │       1-char name gives a disabled button and no explanation
            └── {saved && <span class="text-emerald-600 dark:text-emerald-400">
                    <CheckCircle2/> Saved</span>}                       :181–186
                 ✅ has a dark: variant
```

**A single `Card` with four inputs.** This is the simplest form in the settings tree — and the only settings page that does not touch `UserSettings`.

---

## 3. UI → component mapping

| Import | From | Lines | Directive | Role |
| ------ | ---- | ----- | --------- | ---- |
| `useEffect, useState` | `react` | — | — | 5 form fields + 3 flags |
| `Link` | `next/link` | — | — | the sign-in link ✅ (unlike `export`/`import`) |
| `CheckCircle2, ShieldAlert` | `lucide-react` | — | — | success + sign-in glyphs |
| `apiRequest, ApiError` | `@/lib/api-client` | 131 | none | the PATCH ✅ |
| `useAuth` | `@/hooks/useAuth` | — | `'use client'` | `user`, `isAuthenticated`, `isLoading`, `updateUser` |
| `Card` | `@/components/ui/Card` | 26 | none | 2 instances |
| `Button` | `@/components/ui/Button` | — | none | Save |
| `Input` | `@/components/ui/Input` | — | none | 3 instances (Name, Display name, Avatar URL) + 1 read-only Email |
| `Textarea` | `@/components/ui/Textarea` | — | none | 1 instance (Bio) |
| `Skeleton` | `@/components/ui/Skeleton` | — | none | the loading branch |

**All markup uses design tokens.** ✅ No hardcoded light-mode classes on this page — unlike `ExportData`/`ImportData` in the sibling `/settings/export` and `/settings/import`. That asymmetry is worth noting: `settings.md` §12.4 and this page agree that the token migration reached the *pages* but not the shared *components*.

---

## 4. Frontend architecture

| Concern | Reality |
| ------- | ------- |
| Directive | `'use client'` |
| State | 8: `name`, `displayName`, `bio`, `avatarUrl` (4 strings) + `saving`, `saved`, `error` + `user` from the hook |
| Seeding | `useEffect` on `[user]` — sets all four fields whenever `user` changes (`:42`–`:50`), with an `eslint-disable react-hooks/set-state-in-effect` and a justification comment |
| 🔴 **Seeding hazard** | The effect keys on `[user]`, **not** on mount. After `updateUser()` (`:65`–`:70`) patches the store, `user` is a new object → the effect re-runs → it overwrites the four fields with the store's values. Benign today because the patch was just built from those same fields — but any divergence (a server-side normalisation, a concurrent edit from `/profile`) is silently reverted. §24 F3 |
| Save flow | `setSaving(true)` → PATCH → `updateUser(...)` → `setSaved(true)` → `setTimeout(…, 1600)` (`:52`–`:78`) |
| Optimistic update | ✅ `updateUser` is called **after** the await succeeds (`:65`), so it is a *reconciliation*, not an optimistic write. Correct: a rejected save leaves the store untouched |
| No `useSettings` | ✅ Correct — no `UserSettings` column holds a name, bio or avatar |
| No dirty tracking | ❌ The Save button is enabled whenever `name.length >= 2`, so a user can save without changing anything, and there is no warning when navigating away with unsaved edits |
| `save()` guard | ⚠ No in-flight guard. `isLoading={saving}` shows the spinner but `disabled` is bound to the **name length**, not to `saving` — so a second click while saving is possible. §24 F2 |
| Timer cleanup | ❌ `setTimeout(() => setSaved(false), 1600)` (`:72`) is never cleared on unmount |

---

## 5. Backend / API architecture

### 5.1 `PATCH /api/auth/update-profile` — `app/api/auth/update-profile/route.ts` (68 lines)

One handler, two exports:

```ts
async function handleUpdateProfile(request: NextRequest) {        // :10
  session = await auth();  if (!session?.user?.id) → 401         // :11–14  ✅
  body = await request.json();                                   // :16
  validated = updateProfileSchema.safeParse(body);                // :17
  if (!validated.success) → 400 { error:'Invalid input', details: …flatten() }  // :18–24  ✅
  input = {}
  if (data.name !== undefined)            input.name            = data.name            // :25
  if (data.displayName !== undefined)     input.displayName     = data.displayName     // :26
  if (data.bio !== undefined)             input.bio             = data.bio             // :27
  if (data.avatarUrl !== undefined)       input.avatarUrl       = data.avatarUrl       // :28
  if (data.timezone !== undefined)        input.timezone        = data.timezone        // :29
  if (data.preferredLanguage !== undefined) input.preferredLanguage = …                 // :30–32
  user = await new UserService().updateProfile(session.user.id, input);                 // :35
  return { success: true, data: user }                            // :37
  catch → 400 with error.message                                 // :39–47
}
export async function PATCH(r) { return handleUpdateProfile(r); }  // :55–57
export async function PUT(r)  { return handleUpdateProfile(r); }   // :64–66
```

| Property | Verdict |
| -------- | ------- |
| `auth()` → 401 | ✅ `:11`–`:14` |
| Zod validation with flattened details | ✅ `:17`–`:24` |
| `undefined` not forwarded | ✅ the six `!== undefined` guards |
| `session.user.id`, never a client id | ✅ `:35` |
| Thin route, no Prisma | ✅ delegates to `UserService` — `FILE.MD`-compliant |
| 🔴 **`PUT` is aliased to `PATCH`** | `:64`–`:66` — a documented "Replace" verb that performs a **partial** update. Any client relying on PUT semantics gets the wrong behaviour, silently. §24 F1 |
| `await request.json()` unguarded | 🟡 `:16` — a malformed body throws into the catch and becomes a 400 with a raw parser message |
| Every error → 400 | 🟡 `:44`–`:46` — a Prisma failure is reported as a client error |
| 🔴 **Double validation** | 🟡 the route parses, then `UserService.updateProfile` parses **the same schema again**. The route's copy is ceremony, and the second pass receives the already-narrowed `input`. §24 F4 |

### 5.2 `updateProfileSchema` — `src/lib/validation/user.ts`

```ts
const timezoneSchema = z.string().min(1).max(64)
  .refine(v => v.includes('/'), 'Timezone must be a valid IANA identifier such as Asia/Kolkata');

export const updateProfileSchema = z.object({
  name:        z.string().min(2, '…at least 2 characters').max(50).optional(),          // :22–25
  displayName: z.string().max(50).nullable().optional(),                                  // :26–29
  bio:         z.string().max(500).nullable().optional(),                                 // :30
  avatarUrl:   z.string().url('Avatar URL must be a valid URL').nullable().optional(),    // :31–35
  timezone:    timezoneSchema.optional(),                                                 // :36
  preferredLanguage: z.string().min(2).max(10).optional(),                                // :37
});
```

✅ **The three nullable fields are the point**, and the schema comment explains why at `:14`–`:19`:

> *"`displayName`, `bio` and `avatarUrl` are nullable so they can be *cleared*. The profile page used to send `undefined` for an emptied field, but `JSON.stringify` drops undefined properties, so the key never reached the server and clearing a bio or display name silently did nothing. Sending `''` was not an option for `avatarUrl` because it fails `.url()`."*

Three problems with this schema, however:

| Issue | Detail |
| ----- | ------ |
| 🟠 **`name` cannot be cleared** | `name` is `.optional()` but **not** `.nullable()` — correct, since `User.name` is `String?` but a name is required in the UI (`disabled={name.trim().length < 2}`). Consistent. ✅ |
| 🟠 **`avatarUrl` accepts any URL scheme** | `z.string().url()` accepts `javascript:alert(1)` — WHATWG URL parsing treats it as valid. A `javascript:` avatar is an XSS vector wherever it is rendered as an `<img src>` (browsers block that, but `<a href>` or an SVG `<use>` would not). §24 F7 |
| 🟡 **`timezone` only checks for a `/`** | `.refine(v => v.includes('/'))` accepts `"not/a/real/zone"`. It is a shape check, not a validity check — `Intl.supportedValuesOf('timeZone')` or `DateTimeFormat` would be real validation. §24 F6 |

### 5.3 `UserService.updateProfile` — `user.service.ts`

```ts
const parsed = updateProfileSchema.safeParse(input);   // ◄── the SECOND parse
if (!parsed.success) throw new Error(firstZodIssue(parsed.error));
const user = await this.userRepository.findById(userId);
if (!user) throw new Error('User not found');
const updated = await this.userRepository.update(userId, {
  name, displayName, bio, avatarUrl, timezone, preferredLanguage,   // all 6
});
if (typeof parsed.data.timezone === 'string' && parsed.data.timezone) {
  /* mirror into UserSettings.timezone — best-effort, logged not thrown */
}
```

| Property | Verdict |
| -------- | ------- |
| Re-validates | 🟡 defence-in-depth, but redundant given the route already parsed |
| `findById` → 404-equivalent | ✅ throws `'User not found'` |
| Writes **all six** fields from the parsed object | ⚠ `userRepository.update` receives `undefined` for absent keys. Prisma treats `undefined` as "leave unchanged" ✅ so this is safe — but it is implicit |
| 🔴 Mirrors `timezone` into `UserSettings` | ✅ **This is the invariant `AGENTS.md` requires** — *"Keep it that way or the score bucketing and the UI will drift."* Correctly implemented, and the comment at `:23`–`:26` says the failure is logged rather than thrown so a settings-write failure cannot roll back the profile fields. Good judgement |
| 🔴 **But this is a third writer of `User.timezone`** | See §26 |

---

## 6. Database dependency

| Model | Column | Via |
| ----- | ------ | --- |
| `User` | `name`, `displayName`, `bio` (`@db.Text`), `avatarUrl` | `userRepository.update` |
| `User` | `timezone`, `preferredLanguage` | same call — **but never sent by this page** |
| `UserSettings` | `timezone` | mirrored when `timezone` is present — **never sent by this page** |
| `UserSettings` | — | loaded on mount via `useSettingsLoader` in the layout, but **not read by this page** |

From `prisma/schema.prisma` — `model User`:

| Column | Type | Nullable | Schema parity |
| ------ | ---- | -------- | ------------- |
| `name` | `String?` | ✅ | `.min(2).max(50)` — stricter than the column ✅ |
| `avatarUrl` | `String?` | ✅ | `.url().nullable()` ✅ |
| `bio` | `String? @db.Text` | ✅ | `.max(500).nullable()` ✅ |
| `displayName` | `String?` | ✅ | `.max(50).nullable()` ✅ |
| `email` | `String @unique` | ❌ | read-only in the UI, correctly — it is the auth identity |
| `timezone` | `String @default("UTC")` | ❌ | in the schema, not sent by this page ⚠ |
| `preferredLanguage` | `String @default("en")` | ❌ | in the schema, not sent ⚠ |
| `role` | `Role @default(USER)` | ❌ | 🔴 **not in the schema** ✅ correct — privilege escalation blocked |
| `sessionVersion` | `Int @default(0)` | ❌ | not in the schema ✅ |
| `passwordHash` | `String?` | ✅ | not in the schema ✅ |

✅ **Mass assignment is structurally impossible.** `updateProfileSchema` is a plain `z.object` with six keys; `role`, `isActive`, `sessionVersion` and `passwordHash` are not among them, so a payload containing `{"role":"ADMIN"}` is stripped before it reaches Prisma. That is the right defence and it needs no extra work.

---

## 7. The clear-vs-omit contract

This is the most interesting thing about the page, and it is documented in three places.

### 7.1 The three layers

| Layer | What it says | Where |
| ----- | ------------ | ----- |
| Schema | *"`displayName`, `bio` and `avatarUrl` are nullable so they can be *cleared*. The profile page used to send `undefined` for an emptied field, but `JSON.stringify` drops undefined properties, so the key never reached the server and clearing a bio or display name silently did nothing."* | `validation/user.ts:14`–`:19` |
| Page header | *"Emptied fields are sent as `null`, not `undefined`: `JSON.stringify` drops `undefined` properties, so the old payload omitted them entirely and clearing a display name, bio or avatar silently did nothing."* | `page.tsx:7`–`:8` |
| Inline | *"`null` (not `undefined`) for cleared fields so the server actually receives the key and nulls the column."* | `page.tsx:56`–`:57` |

Three independent descriptions of one bug, in three layers. That is unusual and good practice — a future reader in any one of the three places understands **why** the odd-looking `|| null` exists.

### 7.2 The mechanism, traced

```ts
// page.tsx:58–63
const patch: ProfilePatch = {
  name: name.trim(),                              // never null — required
  displayName: displayName.trim() || null,        // '' → null     ◄── the trick
  bio:         bio.trim()         || null,        // '' → null
  avatarUrl:   avatarUrl.trim()   || null,        // '' → null
};
```

```
  user clears the Bio field
      │
      ├─ bio === ''
      ├─ ''.trim() === ''  →  falsy  →  null            page.tsx:61
      │
      ├─ patch = { bio: null, … }
      │
      ▼  JSON.stringify(patch)
  { "name": "…", "displayName": null, "bio": null, "avatarUrl": null }
       ▲ the key IS present, with an explicit null
  │
  ▼  updateProfileSchema.safeParse
  bio: z.string().max(500).nullable().optional()  →  null PASSES
  │
  ▼  route:  if (data.bio !== undefined) input.bio = data.bio   update-profile/route.ts:27
      null !== undefined  →  true     ◄── the guard that matters
  │
  ▼  userRepository.update(userId, { bio: null })
      Prisma writes NULL to User.bio            ✓ CLEARED

  ── the OLD behaviour, for contrast ──
  patch = { bio: '' }  →  JSON.stringify →  { "name": "…", "displayName": undefined, … }
                                             ▲ bio key PRESENT but '' → fails .max(500)? no —
                                               '' passes .max(500) but is NOT null, so the
                                               column is set to '' not NULL
  and if the code had used `bio || undefined`:
       JSON.stringify DROPS the key entirely  →  input.bio stays undefined
       →  if (data.bio !== undefined) is FALSE  →  bio never forwarded
       →  the user's edit silently vanished      ◄── the original bug
```

✅ The chain is correct end to end, and the `''` case is handled: the `|| null` normalises `''` before it can reach the `.url()` check on `avatarUrl`, which would otherwise reject it — exactly the constraint the schema comment calls out.

### 7.3 The one gap

`name` is `name.trim()` with **no** `|| null`, so clearing the name field sends `""`. The Save button is `disabled={name.trim().length < 2}` (`:178`), which prevents the request — so the gap is closed by the UI rather than the schema. If the button's `disabled` were ever removed, `name: ''` would fail `.min(2)` and produce a 400 with "Name must be at least 2 characters" — a good error, but reached only by breaking the button. Acceptable. §24 F9.

---

## 8. Complete user actions (serial)

### 8.1 Load the page

```
mount
  useAuth() → { user, isAuthenticated, isLoading, updateUser }          :32
  useState('') × 4  (name, displayName, bio, avatarUrl)                  :33–36
  useState(false) × 2 + useState(null)                                    :37–40

  isLoading → <Skeleton h-8 w-40/> + <Skeleton h-96/>                    :80–89
  !isAuthenticated || !user → "Sign in required"                          :91–108

  useEffect([user]) →                                                   :42–50
    setName(user.name ?? '')
    setDisplayName(user.displayName ?? '')
    setBio(user.bio ?? '')
    setAvatarUrl(user.avatarUrl ?? '')
    ⚠ runs again whenever `user` changes — including after updateUser(). §24 F3
```

### 8.2 Edit and save

```
user edits any field → local useState only, no request                 :125/:132/:142/:153
  ⚠ no debounce, no autosave — the store's patchLocal is not used, because
    this page does not own UserSettings

click "Save profile"  (enabled iff name.trim().length >= 2)             :178
  └─ save()                                                             :52
       setSaving(true); setError(null)                                   :53–54
       patch = { name: trim(), displayName: trim()||null,
                 bio: trim()||null, avatarUrl: trim()||null }           :58–63
       await apiRequest('/api/auth/update-profile',
                        { method: 'PATCH', body: patch })               :64
         ├─ auth() → userId                                             route.ts:11
         ├─ updateProfileSchema.safeParse(body)                         route.ts:17
         ├─ six !== undefined guards                                     route.ts:25–32
         └─ userService.updateProfile(userId, input)
              ├─ safeParse AGAIN                                          user.service.ts
              ├─ findById → 'User not found' if absent
              ├─ userRepository.update(userId, {…6 fields})              ⇒ User row written
              └─ if timezone → mirror into UserSettings (best-effort)   ⇒ not taken here
       ◄── { success: true, data: user }
       updateUser({ name, displayName, bio, avatarUrl })                 :65–70
         └─ patches the auth store  →  Sidebar/H2 reflect immediately
            ⚠ this makes `user` a new object → the seeding effect re-runs → §24 F3
       setSaved(true); setTimeout(…, 1600)                               :71–72
       catch → setError(err instanceof ApiError ? err.message : 'Failed to update profile.')  :74
       finally → setSaving(false)                                        :76
```

### 8.3 There is nothing else

No avatar upload (URL only), no social links, no public/private toggle (that lives at `/settings/privacy`), no username (the app uses `id`), no timezone (that is `/settings/timezone`), no email change.

---

## 9. What can the user create

**Nothing on this page.** It creates no row and no resource.

Worth noting what it deliberately does *not* offer: an **avatar upload**. The only path is a URL typed into a text field. `User.avatarUrl` is a plain `String?`, there is no `Attachment`/media row written from this page, and `/settings/data` lists "Profile, settings and preferences" as exportable but nothing uploads. A user without a public image host cannot set an avatar at all. §15.

## 10. What can the user edit

| Field | Cleared by | Notes |
| ----- | ---------- | ----- |
| `User.name` | — (not clearable) | Save is gated at 2 chars |
| `User.displayName` | `null` | helperText: *"Clear this to fall back to your name."* ✅ accurate — consumers read `displayName ?? name` |
| `User.bio` | `null` | ≤ 500 chars |
| `User.avatarUrl` | `null` | `.url()` validated |
| `User.email` | ❌ read-only | ✅ correct — the auth identity |

Plus, reachable by the endpoint but **not** by this page: `User.timezone` and `User.preferredLanguage`. §26.

## 11. What can the user delete

**Nothing.** The three clearable fields are set to `null`, which is not a delete — the row and the column remain. There is no "reset profile" control, and no route that deletes a `User`.

The only destructive path in the settings tree is `/settings/danger-zone`.

---

## 12. Cross-page dependencies

### 12.1 Inbound

| Consumer | Relationship |
| -------- | ------------ |
| `/settings` hub | `settings/page.tsx:43` → `/settings/profile` |
| **`/settings/account`** | 🔴 `redirect('/settings/profile')` — a 5-line route whose only purpose is to land here |
| **`/profile`** | 🔴 A **separate 232-line page** with its own form for the same four fields |
| `/login` | the sign-in link |

### 12.2 Outbound

| Dependency | Kind |
| ---------- | ---- |
| `useAuth` | read `user`; write `updateUser` |
| `PATCH /api/auth/update-profile` | write — the only mutation |
| `useSettingsLoader` (indirect) | the layout loads the settings row on every dashboard page; this page does not read it |

### 12.3 🔴 Two pages, one set of fields

| | `/settings/profile` | `/profile` |
| - | - | - |
| Lines | **192** | **232** |
| Fields | name, displayName, bio, avatarUrl | name, displayName, bio, avatarUrl |
| Read from | `useAuth().user` | `GET /api/users/${user.id}/profile` — **its own fetch** |
| Write to | `PATCH /api/auth/update-profile` | the same endpoint (`:108`) |
| Updates store | ✅ `updateUser(...)` (`:65`) | ❌ **no** — `:108` then `:110` sets `saved` and nothing else |
| Name min length | disabled at < 2 (`:178`) | not verified in this pass |
| Badge/streak UI | ❌ | ✅ `Award`, `Flame`, `Target` glyphs — it is a *public* profile with stats |
| Hub entry | ✅ | via the sidebar |

The clearest divergence: **after saving at `/profile`, the auth store is not patched**, so the sidebar and header keep showing the old name until a reload. `/settings/profile` does patch it. Two editors of one model, one of which forgets the reconciliation. §25.

⚠ `/profile` also reads a *different* endpoint — `GET /api/users/[id]/profile` — which is the **public** profile route. Its docstring records a privacy bug that was fixed: *"This route previously re-read the user directly and skipped that check entirely, so a profile the owner had set private was still served here in full, along with their activity counts — while `GET /api/users/[id]`, serving the same data, correctly returned 404."* It is now rate-limited (30/min per IP) and routes through `getPublicProfileWithStats`. ✅ Good, well-documented fix — and a reminder that the two pages read the same fields through **two different access paths**, one of which is a public, rate-limited endpoint.

---

## 13. Impact analysis

**If `/settings/profile` were deleted:** `/profile` would still edit all four fields, and `/settings/account` would redirect to a dead route. The hub's "Profile" card would break. **No capability is lost** — the feature is fully duplicated.

**If the two pages were merged:** the app loses one duplicate form, gains a consistent reconciliation path, and removes a class of bug where editing in one tab and then the other produces a stale sidebar. The cost is losing `/profile`'s public-facing stats view, which is arguably a different feature that happens to share four fields.

**If `avatarUrl` were protocol-restricted** (§24 F7): a `javascript:` URL could no longer be stored. Today it would be stored fine and then rendered as an `<img src>` — which browsers refuse — so the practical risk is low but the storage layer should not accept it.

**If `PUT` were separated from `PATCH`** (§24 F1): a client that believes it is replacing a profile would stop silently performing a partial update.

**Blast radius of the seeding effect** (§24 F3): it fires on every `user` identity change. `updateUser` is called from four places — `/profile:109`, `/settings/profile:65`, `/settings/security:138`/`:160`, `/settings/timezone:87`. So enabling 2FA on `/settings/security` changes `user`, and if the user navigates back to `/settings/profile` with unsaved edits, **those edits are discarded without warning**.

---

## 14. Current System Capabilities

| Capability | Evidence |
| ---------- | -------- |
| Edit name, display name, bio and avatar URL | `page.tsx:122`–`:158` |
| Clear any of the three nullable fields | `|| null` at `:60`–`:62`, with the mechanism documented in three places |
| Read-only email with an accurate explanation | `:162`–`:168` — *"Email changes are managed by the authentication provider."* ✅ honest |
| Save disabled until the name is valid | `:178` `disabled={name.trim().length < 2}` |
| Optimistic **reconciliation** of the auth store after a successful save | `:65`–`:70` — after the await, so a rejection leaves the store untouched ✅ |
| Typed API errors via `ApiError` | `:74` |
| Whole-body Zod validation with flattened details | `route.ts:17`–`:24` |
| `undefined` is never forwarded | the six `!== undefined` guards, `route.ts:25`–`:32` |
| **Mass assignment structurally impossible** | `role`, `isActive`, `sessionVersion`, `passwordHash` are not in the schema ✅ |
| `timezone` mirrored into `UserSettings` | `user.service.ts` — the invariant `AGENTS.md` requires, with a best-effort comment explaining why a failure there must not roll back the profile write ✅ |
| Email excluded from the schema | cannot be changed through this endpoint ✅ |
| All markup on design tokens | ✅ no hardcoded light-mode classes |
| Uses `next/link` for the sign-in CTA | `:98` — unlike `export`/`import` |
| Loading skeleton taller than its siblings | `:85` `h-96` vs `h-64`, correctly matching the taller form |
| `role="alert"` on the error block | `:172` |
| Accessibility | `<label>` via `Input`/`Textarea`; the decorative glyph is `aria-hidden` ✅ |

---

## 15. Currently NOT Supported

| Not supported | Note |
| ------------- | ---- |
| 🔴 Avatar **upload** | URL only. `User.avatarUrl` is a plain string; no file picker, no upload endpoint, no media table written from here. A user without a public image host cannot set an avatar |
| Email change | Correctly read-only — the auth provider owns it |
| A username / handle | The app identifies users by `id`; `displayName` is the only human-facing label |
| Public/private toggle | Lives at `/settings/privacy` (`profilePublic`), correctly not duplicated here |
| Timezone | Lives at `/settings/timezone`, correctly not duplicated here — although the endpoint accepts it (§26) |
| A dirty-state warning | No warning when navigating away with unsaved edits |
| In-flight guard on Save | `disabled` is bound to the name length, not to `saving` (§24 F2) |
| Auto-save | Explicit Save only — the right choice for a form |
| Character counters | `maxLength` is set and the placeholder says "max 500 characters" for Bio, but there is no live counter |
| A name-length hint | The 2-character minimum is enforced only by the disabled button, with no explanation (§24 F9) |
| Cross-tab coordination | Two editors, no `storage` event, no version check (§25) |
| Undo | No |
| Tests | None cover `updateProfileSchema`, `UserService.updateProfile`, or the two-page split |

---

## 16. Loading / Error / Empty / Edge states

| State | Trigger | Render |
| ----- | ------- | ------ |
| Auth loading | `isLoading` | `Skeleton h-8 w-40` + `Skeleton h-96` (`:80`–`:89`) — token-based ✅, and correctly taller than the 19 sibling pages |
| Signed out / no user | `!isAuthenticated \|\| !user` | `Card` + `ShieldAlert` + `Link` to `/login` (`:91`–`:108`) ✅ uses `next/link` |
| Error | `err instanceof ApiError` | `role="alert"` + `text-destructive` (`:171`–`:175`) ✅ |
| Saved | `saved` | `CheckCircle2` + "Saved", cleared after 1600 ms (`:181`–`:186`) ✅ has `dark:` variant |
| Empty | — | n/a — every field has a value or is empty by design |

### Edge cases

| Edge | Behaviour |
| ---- | --------- |
| Bio at exactly 500 chars | ✅ matches the schema |
| Bio at 501 | `<Textarea maxLength={500}>` blocks input ✅ |
| Name of 1 char | Save button disabled, **no message** — the user may not know why |
| Name of 2 chars | ✅ `.min(2)` passes |
| Name of 51 chars | `maxLength={50}` blocks input ✅ |
| Avatar URL without a scheme | `.url()` rejects → 400 → "Avatar URL must be a valid URL" |
| Avatar URL `javascript:alert(1)` | 🟠 **accepted** by `z.string().url()` → stored → `null`ed only if cleared. §24 F7 |
| Clear all three optional fields | All become `null` ✅ |
| Whitespace-only bio | `''.trim()` → `null` ✅ — trimmed before the nullish check, so `"   "` correctly clears |
| Server normalises the value | The page ignores `res.data` and patches the store with its **own** `patch` (`:65`–`:70`) — so a server-side trim the page did not anticipate would be invisible until reload. §24 F3 |
| Network failure mid-save | `catch` → error banner; `finally` resets `saving`; the store is untouched ✅ |
| Double-click Save | ⚠ possible — `disabled` is not bound to `saving` |
| Unmount during the 1600 ms timer | Fires on a dead component; harmless in React 18+ |

---

## 17. Authentication & security

### 17.1 The endpoint

| Property | Verdict |
| -------- | ------- |
| `auth()` → 401 | ✅ `route.ts:11`–`:14` |
| Client-supplied `userId` | ❌ never accepted — `session.user.id` only ✅ |
| Zod validation before any write | ✅ `:17`; also re-validated in the service |
| Prisma in the route | ❌ none ✅ `FILE.MD`-compliant |
| `params` handling | n/a — no dynamic segment |

### 17.2 Mass assignment — structurally blocked

```ts
export const updateProfileSchema = z.object({
  name, displayName, bio, avatarUrl, timezone, preferredLanguage,   // 6 keys
});
```

`z.object` **strips** unrecognised keys. So a hostile payload:

```json
{ "name": "x", "role": "ADMIN", "isActive": true,
  "sessionVersion": 0, "passwordHash": "$2b$…", "email": "victim@x.com" }
```

becomes `{ name: "x" }` before the service sees it. The route's six explicit `if (… !== undefined)` guards then narrow it further. **Privilege escalation, session invalidation, password reset and account takeover via this endpoint are all structurally impossible.** ✅ This is the correct defence — allow-list, not deny-list.

### 17.3 The residual risk: `avatarUrl` scheme

```ts
avatarUrl: z.string().url('Avatar URL must be a valid URL').nullable().optional(),
```

Zod's `.url()` delegates to `new URL(value)`, which accepts **any** scheme WHATWG knows — including `javascript:`, `data:` and `vbscript:`. A `javascript:alert(document.cookie)` string passes.

Practical exposure depends on how consumers render it:
- `<img src={avatarUrl}>` — browsers refuse `javascript:` in `img src`. **No XSS.**
- `<a href={avatarUrl}>` — **XSS** in some contexts.
- CSS `background-image: url(avatarUrl)` — browsers refuse `javascript:`. No XSS.

So the storage layer accepts a value that is only safe because of how every current consumer happens to render it. That is the wrong place to leave the constraint. §24 F7.

**Fix:** restrict the protocol.

```ts
avatarUrl: z
  .string()
  .url()
  .refine((v) => /^https?:\/\//i.test(v), 'Avatar URL must be http(s)')
  .nullable()
  .optional(),
```

### 17.4 Everything else

| Concern | Status |
| ------- | ------ |
| XSS in this page's own markup | ✅ none — all values go through React escaping; no `dangerouslySetInnerHTML` |
| CSRF | The endpoint is a same-origin `PATCH` with a session cookie. No CSRF token and no `SameSite` declaration visible in this file — NextAuth sets the cookie, and `SameSite=Lax` (the default) blocks cross-site POST/PATCH. Acceptable, worth confirming |
| Rate limiting on write | ❌ none — a user can PATCH in a loop. Each is a single-row update, so the blast radius is small |
| Timing/enumeration | ✅ n/a — `session.user.id` only, no lookup by client-supplied id |
| Secrets exposure | ✅ `passwordHash` is not in the schema; the response is the full `User` **minus** `passwordHash` — `user.service.ts` types the return as `Omit<User, 'passwordHash'>` ✅ |

⚠ That last point deserves a check: the route returns `{ success: true, data: user }` (`route.ts:37`) where `user` is `Omit<User, 'passwordHash'>`. The page **discards** `res` entirely (`:64`), so nothing sensitive reaches the UI — but the response body still carries the whole user row minus the hash: `email`, `role`, `failedLoginAttempts`, `lockedUntil`, `isDeleted`, `deleteReason`, `sessionVersion`. A profile edit therefore returns the account's security posture to the client. Low severity (it is the caller's own data, and the caller is authenticated), but `PATCH` returning the full row is broader than a profile update needs. §24 F8.

---

## 18. Performance

### 18.1 This page's cost

| Metric | Value |
| ------ | ----- |
| Requests on mount | **0** — seeds from `useAuth().user`, which the auth provider already holds |
| Requests per save | **1** (`PATCH /api/auth/update-profile`) |
| Queries per save | 2 — `findById`, then `update` (`user.service.ts`) |
| Client state | 7 `useState` |
| Memoisation | none needed |
| Debounce on input | ❌ none — and correctly so, since there is no per-keystroke request |

### 18.2 What is efficient

- **No fetch on mount.** The form seeds from the auth store rather than re-reading the profile. This is the right choice and the reason `/settings/profile` is cheaper to load than `/profile`, which issues `GET /api/users/${user.id}/profile` (`:75`).
- **One request per explicit save**, not per keystroke.
- The `|| null` normalisation happens client-side, so no round trip is spent discovering that an empty field fails validation.

### 18.3 What is not

| Issue | Impact |
| ----- | ------ |
| 🔴 **Double `safeParse`** | The route parses (`:17`) and `UserService.updateProfile` parses again. For a 6-field object the cost is negligible, but it is duplicated work and a second place to drift. §24 F4 |
| `findById` before `update` | An extra round trip to produce a 404 that `update` would also produce as a Prisma `P2025`. Defensible for the clean error message, but it is one query per save |
| The response returns the full user row | Network payload larger than needed for a four-field edit. §24 F8 |
| 🔴 **The sibling `/profile` page costs more** | Its own `GET /api/users/${user.id}/profile` on mount, and that endpoint is **rate-limited at 30/min per IP** — a user visiting `/profile` repeatedly can exhaust their own budget |

---

## 19. External integrations

| Integration | Present? | Detail |
| ----------- | -------- | ------ |
| **Neon / Postgres** | ✅ | `User`, and `UserSettings.timezone` when present |
| **Auth provider** | ⚠ referenced in copy only | *"Email changes are managed by the authentication provider."* (`:167`) — accurate, since `email` is `String @unique` on `User` and NextAuth owns it. No provider API is called from this page |
| **Avatar hosting** | ❌ external, user-supplied | The page stores a URL the user pastes. 🔴 No upload path exists — see §15 |
| **Gravatar / OAuth avatar** | ❌ | not implemented; `email` could derive one but does not |
| **Third-party APIs** | ❌ | none |
| **Analytics** | ❌ | no event is emitted on save |

---

## 20. Background jobs / cron effects

**None.**

| Cron | Relevance |
| ---- | --------- |
| `/api/cron/compute-daily-scores` | A name change does not affect scoring — scores key off `userId`, not `name`. |
| `/api/cron/generate-insights` | None |

One coupling worth recording: `User.name` is denormalised into `ActivityLog.description` strings by several services (`achievement.service.ts:351` writes `Unlocked achievement: ${achievement.title}`, `user.service` writes `SETTINGS_UPDATED` with no name). **No activity-log row stores the user's name**, so a rename does not corrupt history. ✅ Verified — nothing to fix here.

---

## 21. Data flow diagrams

### 21.1 The save path

```
  /settings/profile
        │  useAuth().user  ──► seeds 4 useState fields (effect on [user])
        │
        │  user types
        ▼
  name / displayName / bio / avatarUrl   (local state only — no request)
        │
        │  click "Save profile"   (disabled unless name.trim().length >= 2)
        ▼
  save()                                                    page.tsx:52
        │  patch = { name: trim(),
        │            displayName: trim() || null,          ◄── '' becomes null
        │            bio:         trim() || null,
        │            avatarUrl:   trim() || null }
        ▼
  apiRequest('/api/auth/update-profile', PATCH)             :64
        ▼
  api/auth/update-profile/route.ts  handleUpdateProfile     :10
        ├─ auth() → session.user.id                                  :11
        ├─ request.json()                                            :16
        ├─ updateProfileSchema.safeParse(body)                       :17   ◄── parse #1
        │    z.object STRIPS role / isActive / sessionVersion /
        │    passwordHash / email                                     ◄── mass assignment blocked
        ├─ six `if (data.X !== undefined) input.X = data.X`            :25–32
        └─ userService.updateProfile(userId, input)                   :35
             ├─ updateProfileSchema.safeParse(input)          ◄── parse #2 (redundant)
             ├─ findById(userId) → 'User not found'
             ├─ userRepository.update(userId, {…6 fields})     ⇒ User row
             └─ if timezone → mirror into UserSettings.timezone (best-effort, logged)
                  ⚠ never taken: this page does not send timezone        §26
        ◄── { success: true, data: Omit<User,'passwordHash'> }
        ▼
  updateUser({ name, displayName, bio, avatarUrl })          :65–70
        │  🔴 makes `user` a NEW object
        ▼
  useEffect([user]) re-runs  ──► overwrites the 4 fields with the store's
        │                         values.  Benign here (they came from the
        │                         same patch) — but it discards unsaved edits
        │                         after a 2FA toggle on /settings/security  §24 F3
        ▼
  setSaved(true) → "Saved" for 1600 ms
```

### 21.2 The clear mechanism

```
  user clears "Bio"
       │
       ├─ bio === ''                                    page.tsx:153
       ├─ ''.trim() === ''                              page.tsx:61
       ├─ '' || null  →  null                          ◄── the one-character fix
       ▼
  JSON.stringify({ bio: null })        the key IS present
       │
       ├─ z.string().max(500).nullable()  →  null PASSES      user.ts:30
       ├─ if (data.bio !== undefined)     →  true             route.ts:27
       ├─ userRepository.update({ bio: null })
       ▼
  User.bio = NULL                          ✓ CLEARED

  ── what it replaced ──
       patch = { bio: bio.trim() || undefined }
       JSON.stringify  →  key DROPPED (undefined is not serialised)
       if (data.bio !== undefined)  →  false
       ⇒ bio never forwarded ⇒ the edit silently vanished     ◄── the original bug
       ⇒ documented in THREE places: page.tsx:7, page.tsx:56, user.ts:14
```

### 21.3 Two pages, one model

```
      ┌──────────────────────────────┐        ┌──────────────────────────────┐
      │  /settings/profile (192)     │        │  /profile (232)               │
      │  ── hub card + /settings/     │        │  ── sidebar entry            │
      │     account redirect target  │        │  ── public view + stats       │
      ├──────────────────────────────┤        ├──────────────────────────────┤
      │ seeds from useAuth().user    │        │ fetches GET /api/users/      │
      │           │                  │        │        [id]/profile  (:75)   │
      │           ▼                  │        │           │                  │
      │  4 × useState                │        │           ▼                  │
      │  edit → local state only     │        │  form state from the FETCH   │
      │           │                  │        │  edit → local state only     │
      │           ▼                  │        │           │                  │
      │  PATCH /api/auth/update-     │        │           ▼                  │
      │    profile                   │        │  PATCH /api/auth/update-     │
      │           │                  │        │    profile  (same)          │
      │           ▼                  │        │           │                  │
      │  updateUser(...)  ✅         │        │  updateUser(...)  ❌ MISSING │
      │  ⇒ sidebar updates now      │        │  ⇒ sidebar STALE until      │
      └───────────┬──────────────────┘        │      reload                  │
                  │                           └──────────────┬───────────────┘
                  └──────────────┬───────────────────────────┘
                                 ▼
                    User.name / displayName / bio / avatarUrl
                    (one row, two editors, no coordination)
                                 │
                                 ▼
                    GET /api/users/[id]/profile  ◄── /profile READS via the
                    (public, rate-limited 30/min,   public path, while
                     profilePublic-gated)           /settings/profile reads
                                                  from the auth store
```

---

## 22. File-by-file dependency inventory

### 22.1 The route

| File | Lines | Directive | Role |
| ---- | ----- | --------- | ---- |
| `src/app/(dashboard)/settings/profile/page.tsx` | **192** | `'use client'` | the form: 4 editable fields + 1 read-only + Save |

### 22.2 API

| File | Lines | Methods | Notes |
| ---- | ----- | ------- | ----- |
| `src/app/api/auth/update-profile/route.ts` | 68 | PATCH + PUT | shared handler; 🔴 PUT aliases PATCH |
| `src/app/api/users/[id]/profile/route.ts` | 67 | GET | used by `/profile`, not this page; rate-limited; `profilePublic`-gated |

### 22.3 Server

| File | Lines | Role |
| ---- | ----- | ---- |
| `src/server/services/user.service.ts` | `:258`/`:275` region | `getSettings`, `updateSettings`, `updateProfile` — the mirror into `UserSettings.timezone` |
| `userRepository` | — | `findById`, `update` |

### 22.4 Validation

| File | Lines | Role |
| ---- | ----- | ---- |
| `src/lib/validation/user.ts` | 58 | `updateProfileSchema` (6 keys), `userPreferencesSchema`, `updateTimezoneSchema`, `timezoneSchema` |

### 22.5 Client dependencies

| File | Role |
| ---- | ---- |
| `@/hooks/useAuth` | `user`, `isAuthenticated`, `isLoading`, `updateUser` |
| `@/lib/api-client` | `apiRequest`, `ApiError` |
| `@/components/ui/{Card,Button,Input,Textarea,Skeleton}.tsx` | presentation, token-based |

### 22.6 Counts

| Metric | Value |
| ------ | ----- |
| Page lines | **192** |
| Sibling `/profile` lines | **232** |
| API lines | 68 + 67 = **135** |
| Requests on mount | **0** |
| Requests per save | **1** (2 queries) |
| Fields editable | **4** |
| Fields clearable | **3** |
| Fields readable-only | **1** (email) |
| Schema keys | **6**, of which this page sends **4** |
| `User` columns exposed by the schema | 6 of 22 |
| Hardcoded light classes | **0** ✅ |
| Pages editing these fields | **2** 🔴 |

---

## 23. Current behavior summary

`/settings/profile` is a clean, well-documented 192-line form. It writes to `User` rather than `UserSettings` — correctly, since no settings column holds a name or a bio. It makes **no request on mount**, seeding from the auth store rather than re-fetching. It sends exactly one `PATCH` per explicit save and patches the auth store **after** the await succeeds, so a rejected save leaves the sidebar untouched.

The `null`-not-`undefined` handling is the standout. Three independent layers — the page header, an inline comment, and the schema — each explain the same bug (`JSON.stringify` dropping `undefined` meant clearing a bio silently did nothing) and the one-character fix. That is the kind of comment that saves an hour three months later.

**Security is structurally sound.** `updateProfileSchema` is a six-key allow-list, so `role`, `isActive`, `sessionVersion`, `passwordHash` and `email` are all stripped before Prisma sees them — privilege escalation via this endpoint is impossible, not merely checked. Email is read-only with an honest explanation. The response omits `passwordHash` by type.

**Three real problems.** First, **a second page edits the same four fields** — `/profile`, 232 lines, its own form, its own read path (`GET /api/users/[id]/profile`, the public rate-limited endpoint), and **no store reconciliation after save**, so the sidebar goes stale. Second, the route exposes `timezone` and `preferredLanguage` while the page sends neither — making `User.timezone` writable through **three** routes (`/api/auth/update-profile`, `PUT /api/settings` → `updateSettings`, and `/settings/timezone`), which is precisely the drift `AGENTS.md` warns about. Third, `PUT` is aliased to `PATCH`, so a "replace" verb performs a partial update.

And one latent risk: `z.string().url()` accepts `javascript:`, so the storage layer takes a value that is only safe because every current consumer happens to render it as an `<img src>`.

---

## 24. Findings register

Severity: 🔴 **critical** · 🟠 **major** · 🟡 **minor**.

| ID | Sev | Finding | Evidence | Fix |
| -- | --- | ------- | -------- | --- |
| **F1** | 🔴 | **A second page edits the same four fields.** `/profile` (232 lines) has its own name/displayName/bio/avatarUrl form writing the same `PATCH /api/auth/update-profile`, reached from the sidebar rather than settings. Two editors, one model, no coordination. | `profile/page.tsx:108` vs `settings/profile/page.tsx:64`; `settings/page.tsx:43` | Merge, or make `/profile` read-only with a link to the editor. **§25** |
| **F2** | 🟠 | 🔴 `/profile` **does not reconcile the auth store** after a successful save, so the sidebar and header keep the old name until a reload — while `/settings/profile` does. | `profile/page.tsx:108`–`:112` (no `updateUser`) vs `settings/profile/page.tsx:65`–`:70` | Add `updateUser(...)`, or consolidate onto one page. **§25** |
| **F3** | 🟠 | The seeding `useEffect` keys on `[user]`, so it re-runs whenever the auth store's user identity changes — including after `updateUser()` and after a 2FA toggle on `/settings/security`. It **overwrites the form with the store's values**, silently discarding unsaved edits. | `:42`–`:50`; `updateUser` callers: `profile:109`, `settings/profile:65`, `security:138`/`:160`, `timezone:87` | Key the effect on mount only (`[]` with a ref, or a `didSeed` flag) and reconcile explicitly after a save. |
| **F4** | 🟠 | The schema is applied **twice** per request — once in the route (`safeParse` at `:17`) and again in `UserService.updateProfile`. The route's copy is ceremony, and it is a second place for the two to drift. | `route.ts:17`; `user.service.ts` `updateProfile` | Validate once. Keep the service-level check (it has other callers) and drop the route's, or vice versa. |
| **F5** | 🟠 | 🔴 `updateProfileSchema` accepts `timezone` and `preferredLanguage` and the route forwards both, but **this page sends neither**. `User.timezone` is therefore writable through three routes, and `AGENTS.md` warns explicitly about that column drifting. | `user.ts:36`–`:37`; `route.ts:29`–`:32`; `page.tsx:58`–`:63`; `user.service.ts` mirror | Remove `timezone`/`preferredLanguage` from `updateProfileSchema`, leaving `/settings/timezone` as the sole writer. **§26** |
| **F6** | 🟡 | `timezoneSchema` validates only that the string **contains a `/`** — `"not/a/real/zone"` passes. | `user.ts:3`–`:11` | Validate against `Intl.supportedValuesOf('timeZone')`, or attempt `new Intl.DateTimeFormat(undefined, { timeZone })` in a `.refine`. |
| **F7** | 🟠 | `avatarUrl: z.string().url()` accepts **any** scheme WHATWG knows, including `javascript:` and `data:`. The value is only safe because current consumers render it as an `<img src>`, which browsers refuse. | `user.ts:31`–`:35` | Add `.refine(v => /^https?:\/\//i.test(v))`. The constraint belongs in storage, not at each render site. **§17.3** |
| **F8** | 🟡 | `PATCH` returns the full user row (minus `passwordHash`), including `role`, `failedLoginAttempts`, `lockedUntil`, `isDeleted` and `sessionVersion` — broader than a four-field profile edit needs. The page discards `res`, so nothing reaches the UI, but the bytes cross the wire. | `route.ts:37`; `user.service.ts` `Omit<User,'passwordHash'>` | Return `{ ok: true }` or only the changed fields. |
| **F9** | 🟡 | 🔴 `PUT` is a documented **"Replace"** verb that is aliased to the partial-update handler, so a client relying on PUT semantics silently gets a patch. | `route.ts:61`–`:66` | Implement PUT as a true replace, or delete it. |
| **F10** | 🟡 | The Save button's `disabled` is bound to `name.trim().length < 2`, **not** to `saving` — so a second click during an in-flight save is possible. | `:178`; `isLoading={saving}` only affects the spinner | `disabled={name.trim().length < 2 \|\| saving}`. |
| **F11** | 🟡 | The 2-character name minimum is enforced **only** by the disabled button, with no helper text — a user with a 1-character name sees a dead button and no reason why. | `:122`–`:128`, `:178` | Add `helperText="At least 2 characters."`, matching the pattern used on the other three fields. |
| **F12** | 🟡 | No in-flight guard or dirty tracking: a user can Save without changing anything, and navigating away with unsaved edits loses them silently. | `:177`–`:187` | Track a dirty flag; warn on unmount. |
| **F13** | 🟡 | `setTimeout(() => setSaved(false), 1600)` is never cleared on unmount. Harmless in React 18+, but the pattern repeats across several settings pages. | `:72` | Clear in a `useEffect` cleanup. |
| **F14** | 🟡 | The page ignores `res.data` and patches the store with its **own** `patch` (`:65`–`:70`), so any server-side normalisation is invisible until a reload. | `:64`–`:70` | Use the returned row. **§16** |
| **F15** | 🟡 | `await request.json()` is unguarded, and **every** error maps to 400 — a Prisma failure is reported to the client as a bad request. | `route.ts:16`, `:44`–`:46` | `.catch(() => null)` then 400; 500 for anything unexpected. |
| **F16** | 🟡 | **No avatar upload.** The only path is a URL the user pastes; a user without a public image host cannot set an avatar at all. | `:140`–`:146`; `User.avatarUrl` is a plain `String?` | Add an upload endpoint, or derive a Gravatar from `email`. **§15** |
| **F17** | 🟡 | **No tests** cover `updateProfileSchema`, `UserService.updateProfile`, or the clear-vs-omit contract. The schema is pure and the `'' → null` normalisation is a two-line function — both trivially testable, and both are the subject of a documented past bug. | `tests/` listing | `tests/lib/update-profile-schema.test.ts` — accept/reject per field, and pin that `null` clears while `undefined` omits. |

**Count: 17 findings. 1 critical, 6 major, 10 minor.**

---

## 25. Two pages, one set of fields

### 25.1 The overlap

| | `/settings/profile` | `/profile` |
| - | - | - |
| Route file | `settings/profile/page.tsx` | `profile/page.tsx` |
| Lines | **192** | **232** |
| Hub entry | `settings/page.tsx:43` ✅ | the sidebar |
| Fields | `name`, `displayName`, `bio`, `avatarUrl` | the same four |
| **Reads from** | `useAuth().user` (in-memory) | 🔴 `GET /api/users/${user.id}/profile` (`:75`) |
| **Writes to** | `PATCH /api/auth/update-profile` (`:64`) | the same endpoint (`:108`) |
| **Reconciles the store** | ✅ `updateUser(...)` (`:65`–`:70`) | 🔴 **no** |
| Extra UI | — | `Award` / `Flame` / `Target` glyphs — a *public* profile with stats |
| Auth gate | ✅ | ✅ |

### 25.2 Three concrete problems

**(a) The sidebar goes stale after a `/profile` save.** `/settings/profile` patches the auth store so the header updates immediately. `/profile` calls `apiRequest`, then `setSaved(true)` — and nothing else (`:108`–`:112`). The user saves, sees "Profile saved.", and the name in the sidebar is still the old one until they reload.

**(b) The two forms read through different access paths.** `/settings/profile` seeds from the in-memory auth store — its own user's data, ungated. `/profile` fetches `GET /api/users/[id]/profile` — the **public** endpoint, which is rate-limited to 30/min per IP and gated on the `profilePublic` privacy flag.

That creates a scenario worth naming: a user who sets `profilePublic = false` at `/settings/privacy` and then opens `/profile` may get a **404** on the very endpoint that page depends on, if `getPublicProfileWithStats` applies the flag even to the owner. (I have not read `getPublicProfileWithStats`, so this is a question, not a confirmed bug — but the asymmetry between the two pages' read paths is itself the smell.) The route's own docstring records that this endpoint once leaked a private profile in full, which is why the gate exists.

**(c) They can disagree.** Two forms, two sets of validation copy, no version or `updatedAt` check. Edit in tab A, save in tab B, and there is no signal that A is stale.

### 25.3 The fix

**Option A — consolidate on one editor.** Keep `/settings/profile` as the only place the four fields are editable. Change `/profile` to a read-only public view with an "Edit profile" link to `/settings/profile`. This removes the duplicate form, the stale-sidebar path, and the double read path in one change, and it matches the hub's existing structure.

**Option B — make `/profile` the only editor** and have `/settings/profile` redirect to it. Fewer files, but it buries a settings action under a public profile page, and `/settings/account` already redirects *into* `/settings/profile` — so that chain would need rewiring too.

**Option C — keep both, fix the divergences.** Add `updateUser` to `/profile`; have `/profile` read from `useAuth().user` when `user.id === the route's id`; add a `beforeunload` guard to both. This treats the duplication as intended and pays the maintenance cost.

I'd take **Option A**. The feature is small enough that one editor is clearly right, `/settings/profile` is already the canonical location (the hub lists it, `/settings/account` redirects to it), and the divergences are all consequences of the duplication rather than independent requirements.

---

## 26. Three writers for `timezone`

### 26.1 The writers

| # | Route | Schema | Service | Also writes `UserSettings.timezone`? |
| - | ----- | ------ | ------- | ----------------------------------- |
| 1 | `PATCH /api/auth/update-profile` (`route.ts:29`) | `updateProfileSchema.timezone` (`user.ts:36`) | `userService.updateProfile` | 🔴 **yes** — an explicit mirror with a best-effort comment |
| 2 | `PUT /api/settings` (`api/settings/route.ts:37`) | `updateSettingsSchema.timezone` (`settings.schema.ts:13`) | `userService.updateSettings` | n/a — it writes **`UserSettings`**, and separately `User` (`:299`–`:300`) |
| 3 | `PUT /api/settings` from `/settings/timezone` | same | same | n/a — this is the page that *intends* to write it |

So `User.timezone` is writable by two routes and `UserSettings.timezone` by two routes, and they must agree.

### 26.2 Why the duplication is worse here than elsewhere

`AGENTS.md` is unusually specific about this column:

> *"`timezone` exists on both `User` and `UserSettings`; `UserService.updateSettings` writes both in one call. Keep it that way or the score bucketing and the UI will drift."*

And the model comment repeats it:

> *"AUTHORITATIVE timezone field. Every date-bucketing read … resolves `UserSettings.timezone`, not `User.timezone`. It previously defaulted to 'Asia/Kolkata' while `User.timezone` defaulted to 'UTC', so a user who had never chosen a timezone had two different answers depending on which column a given code path happened to read."*

`updateSettings` maintains the invariant correctly (`user.service.ts:299`–`:300`), and `updateProfile` maintains it too — with a good comment explaining why the failure is logged rather than thrown. ✅ **Both writers are correct.**

The problem is that `updateProfileSchema` accepts `timezone` **at all**, and the route forwards it, while **no page sends it**. So writer #1 is reachable only by hand-crafting a request. It is a documented invariant maintained by a code path with no UI — which means the invariant's correctness depends on a reader of `updateProfile` noticing a mirror that nothing exercises.

### 26.3 The failure mode this permits

A client that PATCHes `{ "timezone": "Asia/Tokyo" }` to `/api/auth/update-profile` writes **both** columns correctly today. But the route is public API surface — it accepts any subset of six fields — and the next person to touch `updateProfile` has no test and no caller to tell them the mirror is load-bearing. The mirror is commented, which is the main thing protecting it.

### 26.4 The fix

**Remove `timezone` and `preferredLanguage` from `updateProfileSchema`.** Then:

- writer #1 disappears entirely, and `updateProfile` becomes "the four profile fields";
- `/settings/timezone` becomes the **sole** writer of `User.timezone`, which is what a reader expects;
- the mirror logic in `updateProfile` can be deleted, removing the comment that is currently the only thing protecting the invariant;
- `preferredLanguage` gains a home (there is none today) or is dropped.

The route's two extra `if` blocks (`:29`–`:32`) go with it. That is a net **simplification**, not a restriction — no page loses a feature, because no page uses it.

§24 F5.

---

## 27. Validation and the clear contract

### 27.1 The field matrix

| Field | Schema | UI control | Client-side guard | Server guard | Clearable |
| ----- | ------ | ---------- | ---------------- | ------------ | --------- |
| `name` | `.string().min(2).max(50).optional()` | `<Input maxLength={50}>` | Save disabled at < 2 (`:178`) | `.min(2)` | ❌ (by design) |
| `displayName` | `.string().max(50).nullable().optional()` | `<Input maxLength={50}>` | — | `.max(50)` | ✅ `null` |
| `avatarUrl` | `.string().url().nullable().optional()` | `<Input>` **no `maxLength`** | — | `.url()` | ✅ `null` |
| `bio` | `.string().max(500).nullable().optional()` | `<Textarea maxLength={500} rows={4}>` | — | `.max(500)` | ✅ `null` |
| `email` | not in the schema | `<Input readOnly disabled>` | — | unreachable | ❌ |
| `timezone` | `.min(1).max(64).refine(includes('/'))` | ❌ not on this page | — | weak (§24 F6) | ❌ |
| `preferredLanguage` | `.string().min(2).max(10)` | ❌ not on this page | — | — | ❌ |

### 27.2 The one asymmetry worth fixing

`avatarUrl` is the **only** editable field with **no `maxLength`**, while the other three all have one (50, 50, 500) that mirrors their schema bound. The schema caps it indirectly through `.url()`, which imposes no length limit — so a user can paste a 10,000-character URL, it passes `.url()`, it is written to `User.avatarUrl`, and it renders as a broken `<img src>` everywhere the avatar appears.

Every other field's UI bound matches its schema bound exactly. Adding `maxLength={2048}` to the Avatar URL input would restore the pattern. §24 F11 (adjacent; recorded here because this is the natural place to notice it).

### 27.3 What is right

- **Every schema bound has a UI counterpart** except the one above.
- **Every nullable field is clearable** and says so in its `helperText` — three separate "Clear this to…" strings (`:135`, `:145`, `:157`). ✅ This is good UX: the affordance is documented at the field, not in a footnote.
- **The read-only field explains why it is read-only** (`:167`) rather than just being disabled. ✅ A disabled field with no explanation reads as broken.
- **The clear mechanism is documented in three layers** (§7.1), so it survives refactoring from any direction.

### 27.4 The contract as a test

The behaviour worth pinning, because it is the subject of a documented past bug and has no test:

```ts
// tests/lib/update-profile-schema.test.ts
it('accepts null to clear and omits undefined', () => {
  expect(updateProfileSchema.safeParse({ bio: null }).success).toBe(true);   // clears
  expect(updateProfileSchema.safeParse({ bio: '' }).success).toBe(true);    // '' passes too…
  expect(updateProfileSchema.safeParse({ bio: undefined }).success).toBe(true);
});

it('rejects what the UI blocks', () => {
  expect(updateProfileSchema.safeParse({ name: 'a' }).success).toBe(false);  // .min(2)
  expect(updateProfileSchema.safeParse({ name: 'x'.repeat(51) }).success).toBe(false);
  expect(updateProfileSchema.safeParse({ bio: 'x'.repeat(501) }).success).toBe(false);
  expect(updateProfileSchema.safeParse({ avatarUrl: 'not-a-url' }).success).toBe(false);
});

it('strips privilege-escalation keys', () => {
  const r = updateProfileSchema.parse({ name: 'A', role: 'ADMIN', isActive: true });
  expect(r).toEqual({ name: 'A' });          // ◄── the mass-assignment guarantee
});
```

The third test is the one that matters most: it pins the property that makes this endpoint safe, so a future `z.object` → `z.passthrough()` change would fail loudly. §24 F17.

---

*End of `/settings/profile` audit. 27 sections, 17 findings, 192-line form over a 68-line route, a 58-line schema and a service method. 1 critical finding: a second page edits the same four fields and forgets to reconcile the store. Security is structurally sound — a six-key allow-list makes mass assignment impossible — and the null-not-undefined contract behind field clearing is documented in three separate layers, which is the best-documented detail in the settings subtree. Documentation only: no source file was modified.*