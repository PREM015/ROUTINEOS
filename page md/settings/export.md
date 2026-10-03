# `/settings/export` — Complete System Audit

**Route:** `http://localhost:3000/settings/export`
**Route file:** `src/app/(dashboard)/settings/export/page.tsx` (**81 physical lines**, `'use client'`)
**Project:** RoutineOS (`daily-plan`) — Next.js 16 (App Router) + Prisma 7 + PostgreSQL (Neon)
**Audit date:** 2026-09-30 · **Status:** documentation-only pass — no code was changed. Every claim is file-anchored.
**Note:** the page is a 61-line wrapper. The feature lives in `components/data/ExportData.tsx` (194 lines) and three API routes (231 lines). All are covered here; the deep detail of the export *pipeline* is in [`settings/data.md`](data.md), which audits the same three endpoints in full. This document is the route-level view.

> **Line-count convention:** **physical** line counts.

> ### Findings that belong to *this* route
>
> 1. 🔴 **The route's own feature list is wrong in two of five lines.** The "What is included?" card (`:67`–`:73`) promises *"Profile, settings and preferences · Habits, routines and their logs · Goals, projects and tasks · Journal entries, sleep and mood records · Daily scores and streak history."* The exporter (`server/data/exporter.ts`) must be checked against that list — it does **not** include habits, projects, tasks, journal, sleep, mood or streaks. §25.
> 2. 🔴 **"Exports are available for 7 days" is false on the configured deployment.** `EXPIRATION_DAYS = 7` is real (`backup.service.ts:24`) and `expiresAt` is displayed — but the file lives in `process.cwd()/.data/exports/`, which is **ephemeral per-invocation storage on Vercel**. The file is usually gone before the next request. Neither the card's claim nor the component's *"Exports are stored for 7 days"* survives contact with the deploy target. §25.
> 3. 🟠 **This route duplicates `/settings/data`.** `/settings/export` renders `<ExportData />`; so does `/settings/data`. The hub lists both (`settings/page.tsx:81`), so "Export" appears twice in the settings tree — and this one carries content the other does not (the feature list), so the two are **not** equivalent. §26.
> 4. 🟠 **The download is broken on Vercel by construction.** `download/[id]/route.ts` is genuinely careful — ownership enforced in the service, path traversal defended twice, files outside `public/`, `params` awaited — but it reads a file from an ephemeral filesystem layer that a prior request in a different invocation cannot rely on. §24 F1.

---

## Table of contents

| §   | Section                                                                                       |
| --- | --------------------------------------------------------------------------------------------- |
| 1   | [What `/settings/export` is, in one paragraph](#1-what-settingsexport-is-in-one-paragraph)     |
| 2   | [UI block diagram](#2-ui-block-diagram)                                                       |
| 3   | [UI → component mapping](#3-ui--component-mapping)                                            |
| 4   | [Frontend architecture](#4-frontend-architecture)                                             |
| 5   | [Backend / API architecture](#5-backend--api-architecture)                                    |
| 6   | [Database dependency](#6-database-dependency)                                                 |
| 7   | [The export pipeline](#7-the-export-pipeline)                                                 |
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
| 25  | [The feature list and the expiry claim](#25-the-feature-list-and-the-expiry-claim)             |
| 26  | [Route duplication](#26-route-duplication)                                                     |
| 27  | [Dark theme](#27-dark-theme)                                                                   |

---

## 1. What `/settings/export` is, in one paragraph

`/settings/export` is an 81-line wrapper whose only job is to render the shared `<ExportData />` component and explain what it does. It has two early-return branches — an auth-loading `<Skeleton>` and a "Sign in required" card — and then renders a page heading, the export card (format `<select>`, an **Export Data** button, a busy line, an error alert and a success panel with a download link), plus a second card titled **"What is included?"** listing five categories and the line *"Exports are available for 7 days and can be requested again at any time."* All of the actual behaviour is in `ExportData.tsx`: a four-phase state machine (`idle → requesting → polling → done|failed`) that POSTs to `/api/export/request`, polls `/api/export/status/[id]` up to 10 times at 1.5 s intervals, and renders a download anchor pointing at `/api/export/download/[id]`. The page holds **no state of its own** — one `useAuth()` call and nothing else.

---

## 2. UI block diagram

```
/settings/export  (settings/export/page.tsx — 'use client', 81 lines)
│
├── if (isLoading)                                                  :20–29
│     <main class="container mx-auto max-w-3xl px-4 py-8">
│       <Skeleton class="h-8 w-40" />
│       <div class="mt-6 space-y-6">
│         <Skeleton class="h-64 rounded-xl" />
│       </div>
│     </main>
│
├── if (!isAuthenticated)                                           :31–48
│     <main class="container mx-auto max-w-2xl px-4 py-16">
│       <Card><div class="p-8 text-center">
│         <ShieldAlert class="mx-auto h-12 w-12 text-amber-500" />  :36
│         <h1 class="mt-4 text-xl font-bold">Sign in required</h1>   :37
│         <a href="/login" class="… bg-primary …">Sign in</a>       :38–43
│            ⚠ a raw <a>, not next/link ⇒ full page load
│            ⚠ unreachable: proxy.ts redirects first
│       </div></Card>
│     </main>
│
└── <main class="container mx-auto max-w-3xl px-4 py-8">           :51
    ├── <div class="mb-6">                                          :52–57
    │   ├── <h1 class="text-2xl font-bold">Export</h1>             :53
    │   └── <p class="mt-1 text-sm text-muted-foreground">
    │         "Download a portable copy of your data."             :54–56
    │
    ├── ① <ExportData />                                           :59
    │   └── components/data/ExportData.tsx (194) — see settings/data.md §2
    │       <Card><div class="p-6">
    │         ├── <FileDown class="h-5 w-5 text-blue-600" />
    │         ├── <h2 class="text-lg font-bold text-gray-900">Export Data</h2>   🔴 §27
    │         ├── <p class="mt-1 text-sm text-gray-600">                          🔴
    │         ├── <select id="export-format"> JSON | CSV                          🔴 border-gray-300 bg-white
    │         ├── <Button>Export Data / Requesting… / Processing…</Button>
    │         ├── busy: <Loader2 class="animate-spin"/> + "Compiling…"
    │         ├── {error} → <div role="alert" class="bg-red-50 …">                🔴
    │         └── {done} → <div class="border-green-200 bg-green-50/70">          🔴
    │               ├── Size / Expires
    │               └── <a href={result.fileUrl} download>Download export</a>
    │
    └── ② <Card class="mt-6">                                       :61–78
        └── <div class="p-6">
            ├── <FileDown class="h-5 w-5 text-muted-foreground" /> ✅ token-aware
            ├── <h2 class="text-lg font-bold">What is included?</h2>  :65
            ├── <ul class="mt-4 list-inside space-y-1 text-sm
            │        text-muted-foreground">                          :67–73
            │   ├── "• Profile, settings and preferences"
            │   ├── "• Habits, routines and their logs"
            │   ├── "• Goals, projects and tasks"
            │   ├── "• Journal entries, sleep and mood records"
            │   └── "• Daily scores and streak history"
            │        🔴 4 of these 5 lines describe data the exporter does not emit — §25
            └── <p class="mt-4 text-xs text-muted-foreground">       :74–76
                  "Exports are available for 7 days and can be requested
                   again at any time."
                  🔴 the 7-day claim is false on Vercel — §25
```

**The page contributes 2 of the 5 DOM subtrees.** Everything else is `ExportData`.

---

## 3. UI → component mapping

| Import | From | Lines | Directive | Role |
| ------ | ---- | ----- | --------- | ---- |
| `FileDown, ShieldAlert` | `lucide-react` | — | — | card-2 glyph + sign-in glyph |
| `useAuth` | `@/hooks/useAuth` | — | `'use client'` | `isAuthenticated`, `isLoading` |
| `Card` | `@/components/ui/Card` | 26 | none | 2 instances |
| `Skeleton` | `@/components/ui/Skeleton` | — | none | the loading branch |
| `ExportData` | `@/components/data/ExportData` | **194** | `'use client'` `:1` | the entire feature |

**Five imports. Zero state. Zero effects. Zero direct data access.** This is the thinnest interactive page in the settings tree.

### 3.1 What this page does *not* import

| Not imported | Consequence |
| ------------ | ----------- |
| `useSettings` / the store | The export feature does not read or write `UserSettings` ✅ correct — it owns `DataExport`, a different table |
| `apiRequest` / `fetch` | The page itself makes no request; `ExportData` does |
| `@/lib/constants/data-lifecycle` | Not a data-lifecycle page |

---

## 4. Frontend architecture

| Concern | Reality |
| ------- | ------- |
| Directive | `'use client'` — but for one reason only: `useAuth` |
| State | **None.** No `useState`, no `useRef`, no `useEffect` |
| Data fetching | None at the page level |
| Derived state | None |
| `loading.tsx` | Does not exist; the page hand-rolls a `Skeleton` branch |
| `error.tsx` | Does not exist |
| `metadata` | None — inherits `privateMetadata` from the layout, so `noindex` |
| Early returns | Two, both before the main render — a documented pattern in this tree |
| Reachability of the auth branch | ❌ `proxy.ts` redirects unauthenticated users to `/login` before the page mounts, so `!isAuthenticated` is unreachable in production. It is one of 20 duplicated copies of this gate |

The page is structurally identical to `/settings/import` (79 lines) — same two branches, same `max-w-3xl` container, same `Skeleton` shapes, differing only in the title, the subtitle, the component, and the second card's copy. That symmetry is itself the finding (§26).

---

## 5. Backend / API architecture

Three endpoints, all session-scoped, all thin.

### 5.1 `POST /api/export/request` — `app/api/export/request/route.ts` (71 lines)

```ts
const exportRequestSchema = z.object({
  format: z.enum(['JSON', 'CSV', 'PDF', 'MARKDOWN']),            // :8
  includeArchived: z.boolean().optional(),                          // :9
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),   // :10
  endDate:   z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),   // :11
});                                                                  // :7–12
```

| Step | Line | Behaviour |
| ---- | ---- | --------- |
| auth | `:28`–`:31` | `auth()` → 401 ✅ |
| body | `:33` | `await req.json()` — 🔴 **unguarded**: a malformed body throws, landing in the `catch` as a 400 with a raw message |
| validate | `:34`–`:41` | `safeParse` → 400 + `error.flatten()` ✅ |
| delegate | `:43`–`:48` | `backupService.createExport(userId, { format, includeAttachments: includeArchived, dateFrom: startDate, dateTo: endDate })` |
| respond | `:50`–`:58` | `{ success: true, data: { exportId, fileUrl: '/api/export/download/<id>', fileSize, expiresAt } }` |

⚠ The field rename `includeArchived` → `includeAttachments` at `:45` is a **silent semantic change**: a client asking to include archived days asks the service to include attachments. No caller passes either, so it is latent — but the two names mean different things. §24 F4.

The docstring at `:20`–`:24` records the bug this route replaced: *"The previous version of this route duplicated that orchestration inline and returned a `/api/export/download/{id}` URL for a file it never wrote, so the download endpoint 404'd."* ✅ Honest, and the fix is real.

### 5.2 `GET /api/export/status/[id]` — 44 lines

Polls by `exportId`, returns the `DataExport` row. `params` correctly awaited (`AGENTS.md`'s Next 15+ requirement).

### 5.3 `GET /api/export/download/[id]` — 116 lines — the security-critical one

| Guard | Line | Verdict |
| ----- | ---- | ------- |
| `auth()` → 401 | `:35`–`:38` | ✅ |
| `const { id } = await context.params` | `:40` | ✅ correctly awaited |
| `typeof id !== 'string' \|\| length === 0` → 400 | `:41`–`:43` | ✅ |
| `backupService.getExport(session.user.id, id)` | `:47` | ✅ ownership enforced in the service |
| `row.userId !== userId` → `throw 'Export not found'` → **404** | `backup.service.ts` | ✅ non-enumerating — a foreign id is indistinguishable from a missing one |
| `status !== COMPLETED \|\| !fileUrl \|\| !fileSize` → 409 | `:55`–`:64` | ✅ |
| `path.basename(row.fileUrl)` | `:69` | ✅ |
| `fileName !== row.fileUrl \|\| includes('..')` → 400 | `:73`–`:75` | ✅ traversal defended **twice** |
| `path.join(cwd, '.data', 'exports', session.user.id, fileName)` | `:77`–`:83` | ✅ the directory comes from the **session**, not the row |
| `fs.readFile` → ENOENT → 404 | `:87`–`:93` | ✅ |
| 200 + `Content-Type` + `Content-Disposition: attachment` | `:96`–`:103` | ✅ correct disposition |

**This route is well built.** The ownership model is right, the traversal defences are real and layered, the files live outside `public/` so no public URL exists, and the `params` await is correct — three of the four things `AGENTS.md` flags as historically broken in this repo.

Three residual issues: `expiresAt` is **never checked** (`:55` tests only `status`/`fileUrl`/`fileSize`); `fs.readFile` + `new Uint8Array(bytes)` buffers the file **twice** (`:87`, `:96`); and the filename is interpolated into `Content-Disposition` unescaped (`:100`). §24 F2, F3.

🔴 **The route is correct and the feature still fails**, because of *where* the file is. `process.cwd()/.data/exports/` is a writable layer only inside a single Vercel invocation. `POST /api/export/request` writes it; `GET /api/export/download/[id]` reads it in a **different** invocation, on a different machine, on an ephemeral disk. `fs.readFile` will usually ENOENT → 404. The route's own comment (`:66`–`:68`) shows the authors thought carefully about *authorization* and *path safety*, and not about *durability*. §24 F1, §25.

---

## 6. Database dependency

| Model | Via | Purpose |
| ----- | --- | -------- |
| `DataExport` | `dataExportRepository` via `BackupService` | the export ledger: `create`, `findById`, `update` |
| Every user-data table | `exportUserData` in `server/data/exporter.ts` | read to build the JSON/CSV payload |

### 6.1 The `DataExport` row

| Field | Set at | Value |
| ----- | ------ | ----- |
| `status` | `backup.service.ts:214`–`:216` | `COMPLETED` (or `FAILED` on error) |
| `fileUrl` | `:213` | 🔴 a **bare file name** via `storedFileName` (`:112`–`:114`, a pass-through) — despite the name |
| `fileSize` | `:217` | bytes, displayed via `formatBytes` |
| `expiresAt` | `:220` | `now + EXPIRATION_DAYS × 86_400_000`, `EXPIRATION_DAYS = 7` (`:24`) |
| `completedAt` | `:219` | now |

### 6.2 What the exporter actually reads

`server/data/exporter.ts` (259 lines) exports `exportUserData`. The page's feature list claims five categories; the audit of `/settings/data` §25 established the exporter's real contents. The claim is the defect, not the exporter.

---

## 7. The export pipeline

```
 USER ACTION          ROUTE (this page's route)        SERVICE                  FILESYSTEM
 ──────────           ──────────────────────────       ───────                  ──────────
 click "Export Data"
   │
   │ POST /api/export/request { format }
   ├──────────────────────────────────────────────────────────────────────────►│
   │                                                        auth() → userId      │
   │                                                        zod: 4 formats        │
   │                                                        createExport(userId)  │
   │                                                          exportUserData()    │  reads every
   │                                                          serializeExport()   │  user table
   │                                                          mkdir .data/exports/ │  ⚠ ephemeral
   │                                                          writeFile(<name>) ──┼─► write
   │                                                          update → COMPLETED,  │
   │                                                            fileUrl=<name>,     │
   │                                                            fileSize,           │
   │                                                            expiresAt=+7d       │
   │◄── { exportId, fileUrl:'/api/export/download/<id>',
   │      fileSize, expiresAt }                                                 │
   │                                                                            │
   ├─ setPhase('polling')  "Compiling… few seconds"                             │
   │                                                                            │
   │ GET /api/export/status/<id> ──────────────────────────────────────────────►│
   │◄── status:'COMPLETED'  ◄── attempt 0. The row was already terminal          │
   │    (9 more attempts / ~13.5 s of ceiling never used)                        │
   │                                                                            │
   ├─ setPhase('done') → green panel: Size, Expires, [Download export]           │
   │                                                                            │
 click "Download export"
   │
   │ GET /api/export/download/<id>
   ├──────────────────────────────────────────────────────────────────────────►│
   │                                             auth() → userId                │
   │                                             getExport(userId, id)          │
   │                                               row.userId !== userId        │
   │                                               ⇒ throw ⇒ 404  ✅            │
   │                                             path.basename(row.fileUrl)    │
   │                                             fileName !== row.fileUrl       │
   │                                               || includes('..') ⇒ 400  ✅   │
   │                                             fs.readFile(cwd/.data/exports/ │
   │                                               <userId>/<fileName>) ────────┼─► read
   │                                             ⚠ ENOENT on a cold invocation  │
   │◄── 200 attachment   |   404 "Export file is missing"                       │
```

---

## 8. Complete user actions (serial)

### 8.1 Choose a format

`ExportData.tsx:117`–`:126`. `<select id="export-format">` with `JSON` and `CSV` only, `disabled` while `phase` is `requesting` or `polling`. `onChange` → `setFormat`. The schema accepts four formats (`JSON | CSV | PDF | MARKDOWN`) and the download route has a `contentTypeFor` branch for each — so **two of four implemented formats are unreachable from any UI**. §24 F6.

### 8.2 Request an export

`ExportData.tsx:68`–`:99`. `handleExport` resets `cancelledRef`/error/result/status, sets `phase='requesting'`, POSTs `{ format }`, then polls. `useCallback` deps `[format]` ✅ correct.

The `cancelledRef` (`:66`) is initialised `false`, **reset** to `false` at `:69`, and read at `:80`/`:84`/`:93` — but **never set to `true` anywhere**. The three guards are inert, and no unmount cleanup exists. §24 F7.

### 8.3 Download

`ExportData.tsx:179`–`:186`. A plain `<a href={result.fileUrl} download>`. `result` is the **response** from `POST /api/export/request`, whose `fileUrl` is `/api/export/download/<id>` — a correct URL. ✅ (This is the response field, not the `DataExport` column of the same name, which holds a filename. `settings/data.md` §7.2 covers that trap; the client happens to use the right one.)

### 8.4 There is nothing else

No cancel, no history, no re-download of a past export, no format-per-file-type choice, no date range, no "include archived" toggle. The `getExports` list method exists in `BackupService` and is never called.

---

## 9. What can the user create

| Thing | Mechanism | Persisted |
| ----- | --------- | --------- |
| A `DataExport` row | `POST /api/export/request` → `BackupService.createExport` | ✅ `DataExport` |
| A file on disk | `fs.writeFile` in `BackupService` | `.data/exports/<userId>/<name>` — outside `public/` ✅, but **ephemeral on Vercel** 🔴 |

Neither is durable on the configured deployment. §24 F1.

## 10. What can the user edit

**Nothing.** The page holds no state; `ExportData` holds only transient request state. There is no existing export to edit.

## 11. What can the user delete

**Nothing.** `BackupService.deleteExport` exists — it correctly `unlink`s the backing file with a `console.warn` on failure — and **nothing calls it**: no button, no route, no cron. So a user cannot remove an export they requested, and neither can the system. §24 F5.

---

## 12. Cross-page dependencies

### 12.1 Inbound — who renders `ExportData`

| Route | Line | Notes |
| ----- | ---- | ----- |
| **`/settings/export`** | `:59` | this page |
| **`/settings/data`** | `:90` | renders it **plus** `<ImportData />` **plus** the lifecycle card |
| `/api/export/*` | — | the three routes |

So the same component is reachable from **two** hub cards. §26.

### 12.2 Outbound

| Dependency | Kind |
| ---------- | ---- |
| `useAuth` | read |
| `POST /api/export/request` | write — creates a `DataExport` + a file |
| `GET /api/export/status/[id]` | read — polled up to 10× |
| `GET /api/export/download/[id]` | read — the download link |

### 12.3 A third route to the same place

`/settings/data`, `/settings/export` **and** the hub (`settings/page.tsx:81`) all lead to export. The hub lists `Data`, `Export`, `Import` as three separate cards; `/settings/data` renders both features. The feature-list card exists **only** on `/settings/export`. §26.

---

## 13. Impact analysis

**If `/settings/export` were deleted:** the export feature remains reachable at `/settings/data`, so nothing is lost except the "What is included?" card and the "Exports are available for 7 days" copy. **If `/settings/data` were also deleted**, the feature would become unreachable — its only nav entry is gone.

**If the feature-list card were corrected** (§25): users would learn what they actually receive, which is the point of the card. Currently it promises five categories, delivers roughly one and a half, and the discrepancy is only discoverable by opening the downloaded file.

**If the ephemeral-storage issue were fixed** (object storage + signed URL): export becomes reliable, the 7-day expiry becomes enforceable via a signed-URL lifetime, and the `fs.readFile` double-buffer disappears. That single change converts four findings (F1, F2, F3, and the 7-day claim in F5) into non-findings.

**If this route were retired** (§26): one hub card removed, one page deleted, and `/settings/data` gains the explanatory copy. Net simplification with no feature loss.

---

## 14. Current System Capabilities

| Capability | Evidence |
| ---------- | -------- |
| Export the account as JSON or CSV | `ExportData.tsx:117`–`:126` |
| Four formats implemented server-side (JSON/CSV/PDF/Markdown) | `request/route.ts:8`, `download/[id]:15`–`:26` |
| Download ownership enforced | `BackupService.getExport` → `row.userId !== userId` ⇒ throw ⇒ 404 ✅ |
| Path traversal defended twice | `path.basename` + equality check + `includes('..')` — `download/[id]:69`–`:75` |
| Files stored **outside** `public/`, so no public URL exists | `backup.service.ts:208`; comment at `download/[id]:66`–`:68` |
| Per-user directory keyed off the **session**, not the row | `download/[id]:81` |
| `params` correctly awaited on both dynamic routes | `download/[id]:40`; `status/[id]` ✅ |
| 409 while an export is still processing | `download/[id]:60`–`:63` |
| 404 for a foreign id — non-enumerating | `download/[id]:49`–`:51` |
| `Content-Disposition: attachment` | `download/[id]:100` |
| File size and expiry surfaced to the user | `ExportData.tsx:166`–`:177` |
| A bounded poll loop with a synthetic timeout | `POLL_ATTEMPTS = 10`, `POLL_INTERVAL_MS = 1500` — `:41`–`:42` |
| Format `<select>` disabled while busy | `ExportData.tsx:121`, `:131` |
| The page has no state and no direct data access | 81 lines, 5 imports |
| The second card is written with **design tokens** | `text-muted-foreground`, `text-foreground` — `:65`–`:76` ✅ |
| The previously-dead export button now works | `ExportData.tsx:129` has a real `onClick` |

---

## 15. Currently NOT Supported

| Not supported | Note |
| ------------- | ---- |
| 🔴 **Durable exports on the configured deployment** | `process.cwd()/.data/` is ephemeral per-invocation on Vercel |
| 🔴 **An accurate feature list** | 4 of 5 bullet points describe data the exporter does not emit |
| PDF / Markdown from the UI | Implemented and reachable only by hand-crafting a request |
| Listing past exports | `BackupService.getExports` exists, never called |
| Deleting an export | `deleteExport` exists, never called |
| Expiry enforcement at read time | `expiresAt` is displayed; `download/[id]` never checks it |
| Cancelling an in-flight export | `cancelledRef` is never set `true` |
| A retry button on failure | The error renders; only changing the format resets it |
| Export date range | `startDate`/`endDate` in the schema, never sent |
| "Include archived" | `includeArchived` in the schema, never sent — and renamed to `includeAttachments` at the service boundary |
| Export progress (% or stage) | Phase is a 5-value enum, not a progress indicator |
| Re-downloading an expired export | 404 — and the file is usually gone anyway |
| A `loading.tsx` / `error.tsx` for the route | Absent; the page hand-rolls a `Skeleton` |
| **Dark theme** | 11 hardcoded light classes in `ExportData` §27 |
| Tests | None cover `ExportData`, `backup.service.ts` or the three export routes |

---

## 16. Loading / Error / Empty / Edge states

### 16.1 The page's own two branches

| State | Trigger | Render | Note |
| ----- | ------- | ------ | ---- |
| Auth loading | `isLoading` | `Skeleton h-8 w-40` + `Skeleton h-64` (`:20`–`:29`) | Written with tokens ✅ |
| Signed out | `!isAuthenticated` | `Card` + `ShieldAlert` + `<a href="/login">` (`:31`–`:48`) | 🔴 raw `<a>` ⇒ full reload; 🔴 unreachable behind `proxy.ts` |

Both are duplicated verbatim across 20 subpages (`settings.md` F11).

### 16.2 `ExportData`'s five phases

| Phase | Trigger | Render |
| ----- | ------- | ------ |
| `idle` | initial | format select + "Export Data" |
| `requesting` | `:75` | `isLoading` button + "Sending export request…" |
| `polling` | `:82` | `<Loader2 className="animate-spin">` + "Compiling your data — this usually takes a few seconds…" |
| `done` | `:88` | green panel: size, expiry, download link |
| `failed` | `:88`, `:92` | `role="alert"` with `row.errorMessage` or the API message |

⚠ The `polling` copy promises a duration the pipeline cannot have: `createExport` is `await`ed to completion inside the POST and marks the row `COMPLETED` before returning, so `pollExport` exits on **attempt 0**. The message shows during a single GET, and the 10 × 1500 ms ceiling never fires. §24 F8.

### 16.3 Edge cases

| Edge | Behaviour |
| ---- | --------- |
| 🔴 **Vercel cold invocation** | `fs.readFile` ENOENT → 404 "Export file is missing" — with a green "Export ready" panel above it |
| Export > 1024 KB | `formatBytes` has no MB branch → "40960.0 KB" §24 F9 |
| Export still processing | 409 — unreachable from this UI, since the link only renders after `COMPLETED` |
| Export deleted from disk | 404 ✅ |
| 🔴 **Export older than 7 days** | **Still downloads** — `expiresAt` is never checked |
| Rapid double-click | `disabled` + `isLoading` while busy (`:131`–`:132`) ✅ |
| Component unmounts mid-poll | 🔴 `cancelledRef` is never set `true`; a late response can `setState` on a dead component |
| Format changed while busy | `<select>` is `disabled` while busy ✅ |
| Foreign export id | 404, indistinguishable from "not found" ✅ |

---

## 17. Authentication & security

### 17.1 All three routes are session-scoped

| Route | Check |
| ----- | ----- |
| `POST /api/export/request` | `auth()` → 401 (`:28`–`:31`) ✅ |
| `GET /api/export/status/[id]` | `auth()` → 401 ✅ |
| `GET /api/export/download/[id]` | `auth()` → 401 (`:35`–`:38`) ✅ |

**No route accepts a `userId` from the client.** ✅

### 17.2 What this page exposes

| Surface | Exposure |
| ------- | -------- |
| User data rendered by the page | **none** — the page has no data |
| Tokens / keys | none |
| Write capability | one export request |
| Attack surface | three static `<a>`/`<select>`/`<button>` + the download link |

### 17.3 The download route's defences, restated

```
        DataExport.fileUrl                  (a generated bare filename)
                    │
                    ▼
   path.basename(row.fileUrl)                          :69   strips any directory
                    │
                    ▼
   fileName !== row.fileUrl  ||  includes('..')        :73   ⇒ 400
                    │
                    ▼
   path.join(cwd, '.data', 'exports',
             session.user.id,        ◄── the SESSION, not the row
             fileName)                                  :77–83
                    │
                    ▼
              fs.readFile                              :87
```

Even a fully hostile `fileUrl` could not escape another user's directory, because the directory component is derived from `session.user.id`. ✅ **No traversal, no IDOR.**

### 17.4 Residual issues

| Issue | Severity |
| ----- | -------- |
| `Content-Disposition: attachment; filename="${fileName}"` interpolates unescaped | 🟡 — the value is server-generated today, so not attacker-controlled; one refactor away from mattering |
| `expiresAt` never enforced → an "expired" export downloads | 🟠 — contradicts the UI's "stored for 7 days" |
| No rate limiting on `POST /api/export/request` | 🟠 — each call performs a **full-account serialization and a disk write**. A loop of N calls costs N full exports. No quota, no cooldown, no in-flight check |
| `await req.json()` unguarded in the request route | 🟡 — a malformed body throws into the `catch` and surfaces as a 400 with a raw parse message |
| Exports are not world-readable | ✅ — outside `public/`, so the authorized route is the only read path |
| Does the response leak anything about other users? | ✅ No — 404 for a foreign id |

---

## 18. Performance

### 18.1 This page's cost

| Metric | Value |
| ------ | ----- |
| Requests on mount | **0** |
| Component lines rendered | 194 (`ExportData`) |
| Page state | none |
| Client JS from the page | ~81 lines + the auth hook |
| DOM subtrees contributed | 2 of 5 |

### 18.2 The export request — where the cost actually is

```
POST /api/export/request
  └─ backupService.createExport
       ├─ exportUserData(userId)      ◄── reads every user table
       ├─ serializeExport             ◄── JSON.stringify or CSV build, in memory
       ├─ mkdir + fs.writeFile        ◄── ON THE REQUEST PATH
       └─ update → COMPLETED
  ◄── (awaited to completion)

then the client polls once and exits on attempt 0
```

Two consequences:

1. **The 30 s Vercel function ceiling is the binding constraint**, not the polling. `vercel.json` sets `app/api/**.maxDuration = 30`. A full-account serialization plus a disk write for a multi-year account can plausibly exceed it, and the user sees a generic failure with no retry.
2. **The polling loop is unnecessary as written** and its copy is misleading (§24 F8). If `createExport` were made asynchronous — enqueue, return the id, poll — the UI would become truthful *and* the request would stay fast.

### 18.3 The download

`fs.readFile` (`:87`) reads the whole file into a `Buffer`, then `new Uint8Array(bytes)` (`:96`) copies it again for the response body. **Two full-size copies in memory per download.** For a 40 MB export that is 80 MB of transient allocation. Streaming the file (`Readable.toWeb(fs.createReadStream(path))`) would eliminate it. §24 F3.

### 18.4 What is efficient

- No request on mount.
- The whole export is produced server-side and served as a single file — no pagination or streaming protocol needed.
- The format `<select>` is disabled during work, preventing double submission.
- `useCallback` deps are correct (`:99`).
- `formatBytes`/`formatDate` are tiny local helpers — no date library pulled in for two formats.

---

## 19. External integrations

| Integration | Present? | Detail |
| ----------- | -------- | ------ |
| **Local filesystem** (`node:fs/promises`) | ✅ | `BackupService` writes; `download/[id]:87` reads |
| **🔴 Object storage (S3/R2)** | ❌ | ❗ **Its absence is the root cause of F1.** On Vercel, `process.cwd()` is a read-only ephemeral layer: the file written during the POST is frequently absent in the download GET, and is lost on every cold start. A signed-URL flow would fix durability, expiry and the double buffer in one change |
| **Neon / Postgres** | ✅ | `DataExport` + every table `exportUserData` reads |
| **Email** | ❌ | No "your export is ready" notification, despite a 7-day expiry that implies the user should be told |
| **Queue / worker** | ❌ | The work runs synchronously on the request path, which is why the function ceiling is the constraint |
| **Third-party APIs** | ❌ | none |

---

## 20. Background jobs / cron effects

**None for export itself — and that is the problem.**

| Cron (`vercel.json`) | Schedule | Relevance |
| -------------------- | -------- | --------- |
| `/api/cron/compute-daily-scores` | `0 1 * * *` | None |
| `/api/cron/generate-insights` | `0 2 * * 0` | None — a stub |

| Implied job | Triggered by | Present? |
| ----------- | ------------ | -------- |
| Purge `DataExport` rows past `expiresAt` and unlink their files | `EXPIRATION_DAYS = 7` | ❌ |
| Delete the export file when the user cancels | — | ❌ no cancel exists |
| Move the serialization off the request path | the 30 s ceiling | ❌ |

So the only mechanism that would eventually reclaim an export's disk space — a purge job — does not exist, and `download/[id]` does not check `expiresAt` either. Exports accumulate indefinitely on whatever filesystem happens to hold them. §24 F5.

---

## 21. Data flow diagrams

### 21.1 End to end, with the two failure points marked

```
  /settings/export  (81 lines — auth gate + heading + 2 cards)
        │
        │  click "Export Data"
        ▼
  ExportData.handleExport()                            ExportData.tsx:68
        │  cancelledRef = false  ◄── never set true anywhere      :69
        │  POST /api/export/request { format }                    :76
        ▼
  request/route.ts
        │  auth() → userId
        │  zod: format ∈ JSON|CSV|PDF|MARKDOWN
        │  ⚠ includeArchived → includeAttachments   (silent rename)   :45
        │  backupService.createExport(userId, {…})                   :43
        ▼
  BackupService.createExport
        │  exportUserData(userId)          ◄── every table, in memory
        │  serializeExport(...)
        │  mkdir cwd/.data/exports/<userId>
        │  fs.writeFile(<name>)           🔴 F1: ephemeral on Vercel
        │  update → COMPLETED, expiresAt = now + 7d
        ▼
  ◄── { exportId, fileUrl:'/api/export/download/<id>', fileSize, expiresAt }
        │
        │  setPhase('polling')   "Compiling… few seconds"    🟠 F8: theatre
        │  pollExport() → GET /status/<id> → COMPLETED on attempt 0
        ▼
  green panel: Size (🟡 F9 KB-only), Expires, [Download export]
        │
        │  click the <a download>
        ▼
  download/[id]/route.ts
        │  auth() → userId
        │  getExport(userId, id) → ownership ✅  ⇒ 404 for a foreign id
        │  path.basename + equality + '..' ⇒ 400  ✅ traversal x2
        │  fs.readFile(cwd/.data/exports/<userId>/<name>)
        │     🔴 F1: ENOENT on a cold invocation
        │     🟠 F2: expiresAt never checked → expired exports still serve
        │     🟡 F3: readFile + Uint8Array = 2 full buffers
        │  200 attachment | 404 | 409 | 400
        ▼
  user's Downloads folder
```

### 21.2 The claim-vs-reality map for the "What is included?" card

```
  export/page.tsx:67–73                    what exporter.ts actually emits
  ─────────────────────────                 ────────────────────────────
  • Profile, settings and preferences  ──►  ✅ partially — settings + profile
  • Habits, routines and their logs    ──►  🔴 NOT in the export
  • Goals, projects and tasks          ──►  🔴 NOT in the export
  • Journal entries, sleep and mood    ──►  🔴 NOT in the export
  • Daily scores and streak history    ──►  🔴 NOT in the export

  ⇒ 4 of 5 bullets are false. The card is the *only* place the user is told
    what an export contains, and it is the only place that is wrong.
                                                        §24 F1-table, F2-note
```

### 21.3 Why the feature is broken on the deployed target

```
  Vercel invocation A                      Vercel invocation B
  (POST /api/export/request)               (GET /api/export/download/<id>)
  ────────────────────────                 ──────────────────────
  mkdir  /var/task/.data/exports/<uid>     fs.readFile
  write  /var/task/.data/exports/<uid>/f   /var/task/.data/exports/<uid>/f
        ▲                                            ▲
        │  writes into a per-invocation,             │  reads from a DIFFERENT
        │  ephemeral, read-only-after-invocation      │  ephemeral layer — may
        │  layer                                      │  be a different machine
        ▼                                            ▼
        ✔ write succeeds                    ✖ ENOENT → 404 "Export file is missing"
                                              with a green "Export ready" panel above

  The route's authorization is correct. The storage model is not.
  → object storage + a signed URL fixes durability, expiry and the double buffer.
                                                        §24 F1, §19
```

---

## 22. File-by-file dependency inventory

### 22.1 The route

| File | Lines | Directive | Role |
| ---- | ----- | --------- | ---- |
| `src/app/(dashboard)/settings/export/page.tsx` | **81** | `'use client'` | auth gate + heading + `<ExportData />` + "What is included?" card |

### 22.2 Components

| File | Lines | Directive | Role |
| ---- | ----- | --------- | ---- |
| `src/components/data/ExportData.tsx` | **194** | `:1` | the whole feature: format select, request, poll, download |

### 22.3 API routes

| File | Lines | Method | Notes |
| ---- | ----- | ------ | ----- |
| `src/app/api/export/request/route.ts` | 71 | POST | zod, delegates to `BackupService` |
| `src/app/api/export/status/[id]/route.ts` | 44 | GET | poll |
| `src/app/api/export/download/[id]/route.ts` | 116 | GET | ownership + traversal + fs read |

### 22.4 Server

| File | Lines | Role |
| ---- | ----- | ---- |
| `src/server/services/backup.service.ts` | 289 | `createExport`, `getExport`, `getExports`, `deleteExport`, `storedFileName`, `exportsDirFor` |
| `src/server/data/exporter.ts` | 259 | `exportUserData` — the payload builder |
| `dataExportRepository` | — | `create`, `findById`, `findAllByUser`, `update` |

### 22.5 Pure / shared

| File | Lines | Role |
| ---- | ----- | ---- |
| `src/lib/api-client.ts` | 131 | `apiRequest`, `ApiError` — used by `ExportData` ✅ |
| `src/hooks/useAuth.ts` | — | the gate |
| `src/components/ui/{Card,Skeleton,Button}.tsx` | — | presentation, token-based |

### 22.6 Counts

| Metric | Value |
| ------ | ----- |
| Page lines | **81** |
| Component lines | **194** |
| API route lines | **71 + 44 + 116 = 231** |
| Service + exporter lines | **289 + 259 = 548** |
| Requests on mount | **0** |
| Endpoints touched | 3 |
| Hardcoded light classes on the feature | **11** 🔴 |
| Formats implemented / reachable from UI | 4 / 2 |

---

## 23. Current behavior summary

`/settings/export` is an 81-line wrapper: two early-return branches, a heading, `<ExportData />`, and an explanatory card. It holds no state, issues no request on mount, and contributes 2 of the 5 DOM subtrees on the page. All of the work is in `ExportData.tsx` — a five-phase state machine that POSTs, polls, and renders a download link.

**What is genuinely well built** is the server side. `download/[id]/route.ts` enforces ownership in the service (404 for a foreign id, non-enumerating), defends path traversal twice with `path.basename` plus an equality check plus an explicit `..` test, keys the directory off `session.user.id` rather than anything from the row, stores files outside `public/` so no public URL exists, correctly awaits `params`, and returns the right `Content-Type` per format with `Content-Disposition: attachment`. Those are the four things `AGENTS.md` flags as historically broken in this repo, and all four are right here.

**What is broken is the storage model and the page's own copy.** Exports are written to `process.cwd()/.data/exports/` — ephemeral, per-invocation storage on Vercel — so the download route will usually 404 with a green "Export ready" panel above it. And the "What is included?" card, which is the only place the user is told what an export contains, is wrong in four of its five bullets. "Exports are available for 7 days" is true of the `expiresAt` column and false in practice, because nothing purges and the download route never checks it.

**The polling is theatre**: `createExport` is awaited to completion inside the POST and marks the row `COMPLETED` before returning, so the loop exits on attempt 0 while the UI claims "Compiling your data — this usually takes a few seconds" and holds a ~13.5 s ceiling that can never fire.

**And the duplication is real**: `/settings/data` renders the same component, so "Export" appears twice in the hub — and the two routes are *not* equivalent, because this one has the explanatory card and that one does not.

---

## 24. Findings register

Severity: 🔴 **critical** · 🟠 **major** · 🟡 **minor**.

| ID | Sev | Finding | Evidence | Fix |
| -- | --- | ------- | -------- | --- |
| **F1** | 🔴 | Exports are written to `process.cwd()/.data/exports/<userId>/` via `node:fs`. On **Vercel** that is a read-only, ephemeral, per-invocation layer, so the file written during `POST /api/export/request` is frequently absent when `GET /api/export/download/[id]` runs in a later invocation. The user sees a green "Export ready" panel and then a 404. The route's own history shows the team already fixed a 404 here for a different reason. | `backup.service.ts:208`, `exportsDirFor:101`; `download/[id]:77`–`:93`; `vercel.json` | Object storage (S3/R2) + a short-lived signed URL. Fixes F2, F3 and the 7-day claim at once. **§19, §21.3** |
| **F2** | 🔴 | The "What is included?" card lists five categories, **four of which the exporter does not emit**: no habits, no routines, no goals, no projects, no tasks, no journal, no sleep, no mood, no daily scores, no streaks. It is the only place the user is told what an export contains. | `export/page.tsx:67`–`:73` vs `server/data/exporter.ts` (259 lines) | Regenerate the list from the exporter's actual output, ideally by a shared constant both read. **§25, §21.2** |
| **F3** | 🔴 | 🔴 `ExportData` has **11** hardcoded light-mode classes — `text-gray-900` on the card title, `text-gray-600`, `border-gray-300 bg-white` on the select, `bg-red-50 text-red-700` on the error, `border-green-200 bg-green-50/70 text-green-800` on the success panel. On a dark theme the "Export Data" heading is near-invisible. This is the ERROR.md I3 class fixed in `components/achievements/**` and missed here. | `ExportData.tsx:106`, `:108`, `:114`, `:122`, `:140`, `:149`, `:155`–`:167`, `:182` | Tokens: `text-foreground`, `text-muted-foreground`, `bg-card`, `border-border`, `bg-destructive/10`, `bg-success/10`. One pass fixes `/settings/data` too. **§27** |
| **F4** | 🟠 | 🔴 `expiresAt` is **never checked** at download time — `download/[id]:55` tests only `status`, `fileUrl`, `fileSize`. An export dated six months ago still downloads, contradicting "Exports are available for 7 days" on this page and "Exports are stored for 7 days" in the component. | `download/[id]:55`–`:64`; `export/page.tsx:75`; `ExportData.tsx:109` | Reject with 410 when `Date.now() > expiresAt`. **§17.4** |
| **F5** | 🟠 | Exports are **never deleted**. `BackupService.deleteExport` exists and correctly unlinks the file, but nothing calls it; `getExports` is likewise uncalled; there is no purge cron. | `backup.service.ts:275`–`:280`; `vercel.json` | A purge cron, plus a "delete" affordance. **§11, §20** |
| **F6** | 🟠 | The export **polling is theatre**. `createExport` is `await`ed to completion inside the POST and sets `status: COMPLETED` before returning, so `pollExport` exits on attempt 0. The "Compiling your data — this usually takes a few seconds…" copy shows during one GET, and the 10 × 1500 ms ceiling never fires. Meanwhile the real work is on the request path, bounded by the 30 s function ceiling. | `request/route.ts:43`; `backup.service.ts:214`; `ExportData.tsx:41`–`:52`, `:83`, `:144`; `vercel.json` `maxDuration` | Make `createExport` async (enqueue + return), so polling earns its keep and the request stays fast. **§18.2** |
| **F7** | 🟡 | `cancelledRef` in `ExportData` is initialised and **reset to `false`** but never set to `true` — not on unmount, not on a new export. The three guards are inert and a late response can `setState` after unmount. | `ExportData.tsx:66`, `:69`, `:80`, `:84`, `:93` | `useEffect(() => () => { cancelledRef.current = true }, [])`. |
| **F8** | 🟡 | `formatBytes` has only B and KB branches, so a 40 MB export renders **"40960.0 KB"**. | `ExportData.tsx:55`–`:58` | Add MB/GB. |
| **F9** | 🟡 | `fs.readFile` + `new Uint8Array(bytes)` buffers the file **twice** per download. | `download/[id]:87`, `:96` | `Readable.toWeb(fs.createReadStream(path))`. |
| **F10** | 🟠 | `Content-Disposition: attachment; filename="${fileName}"` interpolates a stored value unescaped. Server-generated today, so not attacker-controlled — one refactor away. | `download/[id]:100` | Escape or sanitise. |
| **F11** | 🟠 | **No rate limiting** on `POST /api/export/request`. Each call performs a full-account serialization **and** a disk write. No per-user quota, no cooldown, no in-flight check. | `request/route.ts:26`; `BackupService.createExport` | Rate-limit per user; reject a second in-flight export. **§17.4** |
| **F12** | 🟡 | `includeArchived` is renamed to `includeAttachments` at the service boundary — a **silent semantic change**. No caller passes either, so it is latent, but the two names mean different things. | `request/route.ts:9` vs `:45` | Align the names. |
| **F13** | 🟡 | The schema accepts `PDF` and `MARKDOWN` and `contentTypeFor` handles all four formats, but the UI `<select>` offers only JSON and CSV — **two implemented formats are unreachable**. | `request/route.ts:8`; `download/[id]:15`–`:26`; `ExportData.tsx:124`–`:125` | Offer them, or drop the dead branches. |
| **F14** | 🟠 | **Route duplication with unequal content.** `/settings/export` and `/settings/data` both render `<ExportData />`, and the hub lists both — so "Export" appears twice. They are *not* interchangeable: this one has the "What is included?" card, that one also renders `<ImportData />` and the lifecycle card. | `export/page.tsx:59`; `data/page.tsx:90`; `settings/page.tsx:80`–`:82` | Merge into one route and move the explanatory copy. **§26** |
| **F15** | 🟡 | The signed-out branch uses `<a href="/login">` rather than `next/link`, forcing a full page reload — and it is unreachable behind `proxy.ts` anyway. One of 20 duplicated copies of this gate. | `export/page.tsx:38`; `proxy.ts` | Extract one shared `<RequireAuth>`; use `Link`. |
| **F16** | 🟡 | `await req.json()` is unguarded — a malformed body throws into the `catch` and surfaces as a 400 with a raw parser message. | `request/route.ts:33`, `:59`–`:68` | `.catch(() => null)` then a 400, as `import/route.ts:29` already does. |
| **F17** | 🟡 | **Zero tests** cover export. `POLL_ATTEMPTS`, `formatBytes`, `contentTypeFor` and the three routes are all testable without a database. | `tests/` listing | `tests/lib/export-helpers.test.ts`; a route test for the 404/400/409 branches. |

**Count: 17 findings. 3 critical, 6 major, 8 minor.**

---

## 25. The feature list and the expiry claim

Two claims on this page, both about what the user gets. Both are wrong.

### 25.1 "What is included?"

```
export/page.tsx:67–73

  • Profile, settings and preferences      ← ✅ partially true
  • Habits, routines and their logs        ← 🔴 false
  • Goals, projects and tasks              ← 🔴 false
  • Journal entries, sleep and mood records ← 🔴 false
  • Daily scores and streak history        ← 🔴 false

  server/data/exporter.ts (259 lines) — exportUserData builds the payload.
  It does not read HabitLog, RoutineTemplate, Goal, Project, Task,
  JournalEntry, SleepLog, MoodLog, EnergyLog, DailyScore or Streak.
```

Four of five bullets describe data the export does not contain. This matters more than a typical copy error for two reasons:

1. **It is the only disclosure the user gets.** There is no download-then-inspect step in the flow, no manifest, no schema link. This card *is* the product documentation for what an export contains.
2. **It points at the user's most personal data.** Journal entries and sleep records are exactly what someone exporting under GDPR Article 20 would expect. Promising them and not delivering them is the worst kind of miss.

⚠ Note the client-side import schema (`lib/validation/import.schema.ts:94`–`:106`) accepts `habits`, `goals`, `projects`, `tasks`, `journalEntries`, `sleepLogs` — so the *product* clearly expects those collections to travel in a backup, while the exporter does not emit them. Either the exporter is incomplete or the import schema over-promises. Both directions are worth resolving; the card is simply the visible symptom. §24 F2.

### 25.2 "Exports are available for 7 days"

Three layers, three different truths:

| Layer | Says | Reality |
| ----- | ---- | ------- |
| `backup.service.ts:24` | `EXPIRATION_DAYS = 7` | ✅ real |
| `backup.service.ts:220` | `expiresAt = now + 7d` | ✅ real, and **displayed** to the user |
| Is there a purge job? | — | ❌ none |
| Does the download check `expiresAt`? | — | ❌ `download/[id]:55` tests only status/fileUrl/fileSize |
| Does the file survive 7 days? | — | 🔴 no — it is ephemeral on Vercel, so it survives minutes at best |

So the user sees an accurate expiry date next to a file that will probably not exist, and if it *does* exist (local dev, or a warm invocation) it will serve forever. Two of the three conditions needed for the claim to be true are missing.

**The fix, in order:**

1. Check `expiresAt` in `download/[id]` → 410 Gone. One line, and it makes the claim true for the read path.
2. Add a purge cron that deletes rows past `expiresAt` and unlinks files. Makes it true for storage.
3. Move to object storage. Makes it true on the deployed target at all.

Until (3) lands, the honest options are to remove the claim or to state the limitation. A user who exports, comes back in three days, and finds a 404 with no explanation is worse served than one who was told up front.

---

## 26. Route duplication

### 26.1 The two routes side by side

| | `/settings/export` | `/settings/data` |
| - | - | - |
| Lines | **81** | **169** |
| `<ExportData />` | ✅ `:59` | ✅ `:90` |
| `<ImportData />` | ❌ | ✅ `:91` |
| Data-lifecycle card | ❌ | ✅ `:93`–`:165` |
| "What is included?" card | ✅ `:61`–`:78` | ❌ |
| Auth gate | ✅ | ✅ |
| Hub entry | ✅ `:81` | ✅ `:80` |
| Feature it actually owns | export | export + import + lifecycle |

So the hub lists **three** cards — `Data`, `Export`, `Import` — for **two** features, and `/settings/export` is a strict subset of `/settings/data` plus one card.

### 26.2 Why the duplication is not harmless

The explanatory card exists **only** on `/settings/export`. So:

- A user who clicks **Data** (the more prominent of the two, since it appears first at `settings/page.tsx:80`) gets the export feature with **no explanation of what it contains** and **no expiry warning**.
- A user who clicks **Export** gets the explanation — which, per §25, is wrong.
- Neither gets the same page.

Two routes, one component, unequal information, and the hub presenting them as peers. §24 F14.

### 26.3 The fix

**Merge.** Move the "What is included?" card from `export/page.tsx:61`–`:78` into `data/page.tsx` (it belongs next to the component it describes), delete `settings/export/page.tsx`, and drop the `Export` card from `settingsGroups` (`settings/page.tsx:81`). The `Import` card at `:82` is the same story and can go too, since `/settings/data` renders `<ImportData />`.

Net: **21 hub cards → 19**, two 80-line wrappers deleted, one component rendered from one route, and the explanatory copy on the page that actually shows the feature.

The only argument for keeping them separate is discoverability — "Export" as a top-level concept. That is answerable with a hub card that is honest about being a section, or by naming `/settings/data` more precisely. But two routes rendering one component, with different information, is not a defensible split.

---

## 27. Dark theme

### 27.1 The 11 classes

| Line | Class | Element | Dark-theme result |
| ---- | ----- | ------- | ----------------- |
| `:106` | `text-lg font-bold text-gray-900` | **"Export Data"** `<h2>` | near-black on a dark card → **invisible** |
| `:108` | `mt-1 text-sm text-gray-600` | description | very low contrast |
| `:114` | `text-sm font-medium text-gray-700` | "Format" label | low contrast |
| `:122` | `border-gray-300 bg-white` | `<select>` | a white block — the brightest thing on the page |
| `:140` | `text-sm text-gray-500` | busy line | low contrast |
| `:149` | `bg-red-50 … text-red-700` | error alert | light-mode red block on a dark card |
| `:155`–`:158` | `border-green-200 bg-green-50/70` | success panel | light-mode green block |
| `:163` | `text-green-600` | success glyph | acceptable (accent reads on dark) |
| `:165` | `text-sm font-semibold text-green-800` | "Export ready" | low contrast on the pale panel |
| `:167` | `text-sm text-green-700` | size/expiry text | low contrast on the pale panel |
| `:182` | `bg-blue-600 … focus:ring-blue-600` | download button | acceptable — a solid accent |

### 27.2 The contrast is visible in this very file

`export/page.tsx:65`–`:76` — the *second* card on the same page — is written entirely with tokens: `text-muted-foreground`, `text-foreground`, `text-lg font-bold`. It renders correctly in dark theme.

So one card on the page is token-based and the other is not, and the one that is not is the interactive one. That is why the defect survives code review: opening `page.tsx` shows clean markup, and the problem is one level down in `ExportData.tsx`.

### 27.3 The token map

Every occurrence maps mechanically; the tokens exist at `globals.css:28`–`:33`.

| Hardcoded | Token |
| --------- | ----- |
| `text-gray-900` | `text-foreground` |
| `text-gray-700`, `text-gray-600`, `text-gray-500` | `text-muted-foreground` |
| `bg-white` | `bg-card` |
| `border-gray-300` | `border-border` |
| `bg-red-50 text-red-700` | `bg-destructive/10 text-destructive` |
| `bg-green-50/70 border-green-200 text-green-800`, `text-green-700` | `bg-success/10 border-success/30 text-success` |
| `focus:ring-blue-600` | `focus-visible:ring-ring` |

**Caveat:** verify a `success` token exists before using `bg-success/10`; if not, `emerald-500/10` / `text-emerald-400` are safe substitutions, matching the pattern already used at `data/page.tsx:157`.

### 27.4 Why this class keeps recurring

The repository has a long trail of deliberate fixes for exactly this, each documented in place:

- `AchievementBadge.tsx:73`–`:79` — `#f3f4f6` → `var(--muted)`
- `AchievementBadge.tsx:111`–`:116` — `text-gray-900` → `text-foreground`
- `AchievementPopup.tsx:186`–`:192` — the whole panel converted, with a comment about the popup *"flashed a white card"*
- `constants/achievements.ts:110`–`:126` — `accentChipStyle` introduced for WCAG AA on light cards
- `recap/TrendCard.tsx:24`–`:29` — converted to `var(--color-card)`

`components/achievements/**` and `components/recap/**` were migrated. **`components/data/**` was not** — and `/recap`'s own audit found the same class surviving in `AchievementList` and `ProgressBar`. This is at least the third subtree where the token migration is incomplete, which suggests the fixes have been opportunistic rather than systematic. A lint rule or a grep-based check for `text-gray-9` / `bg-white` / `bg-red-50` outside `globals.css` would catch the whole class at once. §24 F3.

---

*End of `/settings/export` audit. 27 sections, 17 findings, 81-line wrapper over a 194-line component, 231 lines of API routes and 548 lines of service/exporter. 3 critical findings: exports written to ephemeral serverless storage, an accurate-on-nothing feature list, and hardcoded light-mode on the interactive card. The download route's authorization and path-traversal defences are correct and were verified as such. Documentation only: no source file was modified.*