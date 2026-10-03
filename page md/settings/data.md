# `/settings/data` — Complete System Audit

**Route:** `http://localhost:3000/settings/data`
**Route file:** `src/app/(dashboard)/settings/data/page.tsx` (169 physical lines, `'use client'`)
**Project:** RoutineOS (`daily-plan`) — Next.js 16 (App Router) + Prisma 7 + PostgreSQL (Neon)
**Audit date:** 2026-09-30 · **Status:** documentation-only pass — no code was changed. Every claim is file-anchored.
**Note:** the page itself is a thin host; the substance lives in `ExportData` (194 lines), `ImportData` (262), `ImportPreview` (160) and four API routes. This audit covers all of them, because a page's real behaviour is its children.

> **Line-count convention:** **physical** line counts.

> ### Headline findings
>
> 1. 🔴 **The three data-lifecycle settings this page exists to expose do nothing.** `dataRetentionDays`, `retroactiveEditDays` and `autoArchiveCompletedDays` are editable here, validated by the schema, stored in the DB — and read by **no code in the application**. I grepped the entire `src/` tree. There is no retention job, no archive job, and no retroactive-edit guard. The page's own header comment (`:11`–`:12`) says it "adds the data-lifecycle controls … that had schema + Prisma columns but no UI" — the UI was added; the **behaviour** was not. §25.
> 2. 🔴 **`ExportData` and `ImportData` are hardcoded light-mode and unreadable in dark theme.** 32 hardcoded `text-gray-900` / `bg-white` / `bg-red-50` / `border-green-200`-style classes across the three components, none using a design token. This is the exact ERROR.md I3 class that `AchievementBadge`, `AchievementPopup` and `AchievementsStrip` were fixed for — these three were not. §26.
> 3. 🟠 **`ImportData` bypasses `apiRequest`** and hand-rolls `fetch`, so it reads `response.json()` directly and cannot use `ApiError`; meanwhile `ExportData` in the *same card list* uses `apiRequest`. Two different error-handling strategies for two sibling features. §27.
> 4. 🟡 **`ImportData` sends `settings` in the payload.** `VALID_COLLECTION_KEYS` includes `'settings'` (`:35`), so a backup's settings block is accepted, previewed, and POSTed — and the importer "reports every other collection as skipped". A user who exports, edits their settings in the file, and re-imports gets a **silent no-op**. §24 F7.

---

## Table of contents

| §   | Section                                                                                       |
| --- | --------------------------------------------------------------------------------------------- |
| 1   | [What `/settings/data` is, in one paragraph](#1-what-settingsdata-is-in-one-paragraph)         |
| 2   | [UI block diagram](#2-ui-block-diagram)                                                       |
| 3   | [UI → component mapping](#3-ui--component-mapping)                                            |
| 4   | [Frontend architecture](#4-frontend-architecture)                                             |
| 5   | [Backend / API architecture](#5-backend--api-architecture)                                    |
| 6   | [Database dependency](#6-database-dependency)                                                 |
| 7   | [The data-lifecycle settings](#7-the-data-lifecycle-settings)                                 |
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
| 25  | [The data-lifecycle settings are inert](#25-the-data-lifecycle-settings-are-inert)             |
| 26  | [Hardcoded light-mode classes](#26-hardcoded-light-mode-classes)                               |
| 27  | [`ImportData` bypasses `apiRequest`](#27-importdata-bypasses-apirequest)                       |

---

## 1. What `/settings/data` is, in one paragraph

`/settings/data` is the user's **data lifecycle** page — the GDPR-flavoured corner of settings. It renders three stacked cards: `<ExportData />` (request a JSON or CSV export of the whole account, poll until it completes, then download), `<ImportData />` (pick a `.json` backup, see a client-side preview of what it contains, then POST it to be merged), and a **Data lifecycle** card holding three `<Select>` dropdowns — data retention, retroactive edit window, auto-archive — which persist through the shared settings store. The page is a 169-line host with almost no logic of its own: two auth branches, one `persist()` helper, three selects and a Save button. Its header comment records that it was **rewritten**: *"The previous version of this page was a static server component whose 'Export JSON' button had no `onClick` and whose file input had no `onChange` — both were dead."* That rewrite is real and the buttons work. But it wired the UI for three settings that no code reads (§25), and it inherited three components that are entirely hardcoded light-mode (§26).

---

## 2. UI block diagram

```
/settings/data  (settings/data/page.tsx — 'use client', 169 lines)
│
├── if (isLoading)  → <Skeleton h-8 w-40> + <Skeleton h-64>          :37–46
├── if (!isAuthenticated) → <Card> "Sign in required" + <a href="/login">  :48–65
│
└── <main class="container mx-auto max-w-3xl px-4 py-8">             :81
    ├── <h1 class="text-2xl font-bold">Data Management</h1>           :83
    ├── <p class="mt-1 text-sm text-muted-foreground">
    │     "Export, restore and control how long your RoutineOS data is kept."  :84–86
    │
    └── <div class="space-y-6">                                       :89
        │
        ├── ① <ExportData />                     components/data/ExportData.tsx (194)
        │   └── <Card><div class="p-6">
        │       ├── header: <FileDown class="h-5 w-5 text-blue-600"/>
        │       │          <h2 class="… text-gray-900">Export Data</h2>   🔴 hardcoded
        │       ├── <p class="mt-1 text-sm text-gray-600">              🔴
        │       │     "Generate a portable copy… Exports are stored for 7 days."
        │       ├── FORMAT <select id="export-format">  JSON | CSV      :117–126
        │       │     disabled while requesting/polling
        │       │     class="… border-gray-300 bg-white …"              🔴
        │       ├── <Button onClick={handleExport}                     :129–136
        │       │     disabled + isLoading while busy
        │       │     label: "Requesting…" | "Processing…" | "Export Data"
        │       ├── busy line: <Loader2 class="animate-spin"/> + text  :139–146
        │       ├── {error} → <div role="alert" class="bg-red-50 …">  :148–153  🔴
        │       └── {phase==='done'} → success block                   :155–188
        │             <div class="border-green-200 bg-green-50/70">     🔴
        │             ├── <CheckCircle2 class="text-green-600"/>
        │             ├── Size: formatBytes(fileSize)                   :166–171
        │             ├── Expires: formatDate(expiresAt)               :172–177
        │             └── <a href={result.fileUrl} download>            :179–186
        │                   "Download export"
        │
        ├── ② <ImportData />                     components/data/ImportData.tsx (262)
        │   └── <Card><div class="p-6">
        │       ├── header: <FileUp/> <h2 class="… text-gray-900">Import Data</h2>  🔴
        │       ├── <p class="mt-1 text-sm text-gray-600">                        🔴
        │       ├── DROPZONE <label class="border-2 border-dashed …">   :132–152
        │       │     error ? 'border-red-300 bg-red-50/50' : 'border-gray-300 hover:border-blue-400 …'  🔴
        │       │     <input ref={inputRef} type="file"
        │       │            accept="application/json,.json"
        │       │            onChange={handleFileChange}
        │       │            class="sr-only" aria-label="Choose a JSON backup file" />
        │       ├── {error} → <div role="alert" class="bg-red-50 …">              :154–158  🔴
        │       └── {parsed} →                                         :160–215
        │             ├── <Badge variant="primary">{fileName}</Badge>  :163–166
        │             ├── counts.map → <Badge variant="success">
        │             │      "{name}: {count.toLocaleString()}"        :167–171
        │             ├── <ImportPreview data={parsed} />              :174–176
        │             ├── <Info/> disclosure: "persists habits and goals as
        │             │   entity merges; any other collections … reported
        │             │   as skipped, never deleted."                    :179–184
        │             ├── <Button onClick={handleImport}> "Import data" :185–203
        │             └── {importResult} → green success banner         :206–213
        │
        └── ③ DATA LIFECYCLE  <Card>                                   :93–165
            ├── header: <Database class="h-5 w-5 text-primary"/>
            │          <h2 class="text-lg font-bold">Data lifecycle</h2>
            │
            ├── {loading || !settings} → 3 × <Skeleton h-10 w-full>   :99–104
            │
            └── 3 × <Select>  (each wrapped in max-w-sm)              :107–141
                ├── "Data retention"          → RETENTION_OPTIONS     :108–116
                │     helperText "How long completed days are kept before being
                │                  eligible for cleanup."
                ├── "Retroactive edit window" → EDIT_WINDOW_OPTIONS    :120–128
                │     helperText "How far back you can still log a habit after
                │                  the fact."
                └── "Auto-archive after"      → ARCHIVE_OPTIONS       :132–140
                      helperText "Days move to the archive after this many days."
                 all three: onChange → patchLocal({ …: Number(value) })  ◄── local only
                 ⚠ NO auto-save — the values sit in the store until Save is pressed
            │
            ├── {error} → <div role="alert" class="bg-destructive/10 …">  :143–150
            │     ✅ token-based (destructive), unlike ExportData/ImportData
            │
            └── <Button onClick={() => void persist()} isLoading={saving}>  :152–162
                  "Save data settings"
                  {saved && <span class="text-emerald-600 dark:text-emerald-400">
                     <CheckCircle2/> Saved</span>}   ✅ theme-aware (has dark: variant)
                  ⚠ saved resets after a bare setTimeout(1600) with no cleanup
```

### 2.1 `ExportData` state machine (`ExportData.tsx:62`)

```
        idle ──handleExport()──► requesting ──POST /api/export/request──► polling
           ▲                        │                                        │
           │                        │ (throw)                        pollExport()
           │                        ▼                                 10 × 1500ms
        failed ◄────────────────────┘                                    │
                                                                      ▼
                                                       COMPLETED ──► done
                                                       FAILED ─────► failed
                                                       (10 attempts, no COMPLETED/FAILED)
                                                                          │
                                                                          ▼
                                                                     failed
                                                    "Export timed out after repeated polling."
```

`POLL_ATTEMPTS = 10`, `POLL_INTERVAL_MS = 1500` (`:41`–`:42`) → a hard ceiling of **~13.5 s**. `pollExport` returns a synthetic `{ status: 'FAILED', errorMessage: 'Export timed out…' }` cast to `ExportStatusRow` (`:52`) when the loop is exhausted. §24 F9.

### 2.2 `ImportData` state machine (`ImportData.tsx:44`–`:54`)

```
  no file ──onChange──► reading ──file.text()──► JSON.parse()──► validateImport()
                            │                        │                 │
                            │                   (throw)            (error)
                            ▼                        ▼                 ▼
                    inputRef.value='' ◄──────────── failed ◄────────── failed
                                                                 ("No recognizable
                                                                   entity collections")

  parsed set ──► preview renders ──► "Import data"──► importing ──► importResult | failed
                                            POST /api/import
```

`validateImport` (`:221`–`:260`) accepts a top-level array (`{ name: 'entities', count }`) or an object; it walks the entries, coerces a non-array object to a 1-element array (`:245`), and prefixes any key not in `VALID_COLLECTION_KEYS` with `*` (`:247`) — so `myCustomThing*` is shown rather than hidden. If nothing has ≥ 1 item it returns *"No recognizable entity collections found (habits, goals, tasks, projects, etc.)."* §24 F7.

---

## 3. UI → component mapping

### 3.1 `settings/data/page.tsx` imports

| Import | From | Lines | Role |
| ------ | ---- | ----- | ---- |
| `useState` | `react` | — | `saved` |
| `CheckCircle2, Database, ShieldAlert` | `lucide-react` | — | success glyph, section glyph, sign-in glyph |
| `useAuth` | `@/hooks/useAuth` | — | `isAuthenticated`, `isLoading` |
| `useSettings` | `@/hooks/useSettings` | 71 | `settings`, `loading`, `save`, `patchLocal`, `saving`, `error` |
| `Card` | `@/components/ui/Card` | 26 | 2 instances |
| `Button` | `@/components/ui/Button` | — | Save |
| `Select` | `@/components/ui/Select` | — | 3 instances |
| `Skeleton` | `@/components/ui/Skeleton` | — | auth + settings loading |
| `ExportData` | `@/components/data/ExportData` | **194** | card ① |
| `ImportData` | `@/components/data/ImportData` | **262** | card ② |
| `RETENTION_OPTIONS, EDIT_WINDOW_OPTIONS, ARCHIVE_OPTIONS` | `@/lib/constants/data-lifecycle` | — | the 3 option lists |

### 3.2 `components/data/**` — all 4 files

| File | Lines | `'use client'` | Imported by | Hardcoded light classes |
| ---- | ----- | -------------- | ----------- | ----------------------- |
| `ExportData.tsx` | 194 | `:1` | `settings/data`, `settings/export` | **11** 🔴 |
| `ImportData.tsx` | 262 | `:1` | `settings/data`, `settings/import` | **9** 🔴 |
| `ImportPreview.tsx` | 160 | — | `ImportData:20` | **12** 🔴 |
| `DeleteAccount.tsx` | 107 | — | `settings/danger-zone` (not this page) | — |

**Total hardcoded light-mode classes on this page: 32.** §26.

### 3.3 The page renders `ExportData` + `ImportData` **and** so do `/settings/export` and `/settings/import`

| Route | Renders |
| ----- | ------- |
| `/settings/data` | `<ExportData />` + `<ImportData />` + the lifecycle card |
| `/settings/export` (81 lines) | `<ExportData />` only, plus an auth gate |
| `/settings/import` (79 lines) | `<ImportData />` only, plus an auth gate |

So the user can reach the same two features from **three** places. That is not duplication of *logic* — the components are shared, which is correct — but `/settings/export` and `/settings/import` are now pure wrappers around a single card each. The hub lists all three (`settings/page.tsx:81`–`:82`), so "Export" appears twice in the same settings tree. §24 F10.

---

## 4. Frontend architecture

| Concern | Reality |
| ------- | ------- |
| Directive | `'use client'` — all of `page.tsx`, `ExportData`, `ImportData` |
| State, page | 1 `useState` (`saved`) + 6 values from `useSettings` |
| State, `ExportData` | 6: `format`, `phase`, `result`, `status`, `error`, `cancelledRef` |
| State, `ImportData` | 7: `inputRef`, `fileName`, `parsed`, `counts`, `error`, `reading`, `importing`, `importResult` |
| Optimistic update | ✅ `patchLocal` on every `<Select>` (`:112`, `:124`, `:136`), then explicit Save → `save()` (`:69`–`:73`) |
| Auto-save | ❌ **none** — the selects do not persist until Save is clicked, unlike most store-backed settings pages. Correct choice here: three numbers with a destructive edge (retention) should not fire a `PUT` per dropdown change |
| Save feedback | `saved` flag + `setTimeout(…, 1600)` (`:76`) |
| Refetch on change | ✅ none — a good property; the store is the cache |
| `useCallback` deps | `ExportData:99` — `[format]`, correct |
| File reading | `file.text()` (`ImportData:69`) — fully client-side, no upload of the raw file before confirm |
| Reset semantics | `importRef.current.value = ''` in `finally` (`ImportData:82`) so re-picking the same file fires `onChange` again ✅ |
| Cancellation | `ExportData` has a `cancelledRef` (`:66`, `:80`, `:84`, `:93`) ✅ — but **no unmount cleanup**, so the flag is only checked *between* awaits and never set on unmount. §24 F11 |
| Error typing | `ExportData` uses `ApiError` (`:14`, `:96`); `ImportData` uses raw `fetch` and `instanceof Error` (`:104`, `:115`). Inconsistent. §27 |

---

## 5. Backend / API architecture

### 5.1 `PUT /api/settings` — the lifecycle card

`page.tsx:69` → `save({ dataRetentionDays, retroactiveEditDays, autoArchiveCompletedDays })` → `settings.store.ts:137` `PUT /api/settings` → `api/settings/route.ts:37` → `userService.updateSettings` (`user.service.ts:275`) → `updateSettingsSchema.safeParse` (`:279`) → `userRepository.updateSettings`. ✅ Thin route, validation in the service, optimistic-then-reconcile in the store.

Schema bounds (`settings.schema.ts:61`–`:63`):

| Field | Rule |
| ----- | ---- |
| `retroactiveEditDays` | `int, 0–30` |
| `autoArchiveCompletedDays` | `int, 0–365` |
| `dataRetentionDays` | `int, 30–3650` |

And the option lists in `lib/constants/data-lifecycle.ts` document the same bounds in a header comment (`dataRetentionDays 30–3650`, `retroactiveEditDays 0–30`, `autoArchiveCompletedDays 0–365`) — ✅ **every option value is inside its bound**, verified:

| List | Values | Bound | OK |
| ---- | ------ | ----- | -- |
| `RETENTION_OPTIONS` | 30, 90, 180, 365, 730, 3650 | 30–3650 | ✅ |
| `EDIT_WINDOW_OPTIONS` | 0, 1, 3, 7, 14, 30 | 0–30 | ✅ |
| `ARCHIVE_OPTIONS` | 0, 30, 60, 90, 180, 365 | 0–365 | ✅ |

### 5.2 `POST /api/export/request` — `app/api/export/request/route.ts` (71 lines)

```ts
const exportRequestSchema = z.object({
  format: z.enum(['JSON', 'CSV', 'PDF', 'MARKDOWN']),          // :8
  includeArchived: z.boolean().optional(),                      // :9
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),// :10
  endDate:   z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),// :11
});                                                              // :7–12
```

✅ `auth()` → 401; `safeParse` → 400 with `error.flatten()`; delegates the whole lifecycle to `backupService.createExport` (`:43`–`:48`). The docstring at `:20`–`:24` records the bug it fixed: *"The previous version of this route duplicated that orchestration inline and returned a `/api/export/download/{id}` URL for a file it never wrote, so the download endpoint 404'd."*

The response shape (`:50`–`:58`) is `{ exportId, fileUrl: '/api/export/download/{id}', fileSize, expiresAt }` — note `fileUrl` in the **response** is a URL, while the same-named **column** stores a bare filename. The client uses the response's value, so the download link is correct. §7.2, §21.3.

⚠ The client only ever sends `{ format }` (`ExportData.tsx:78`), so `includeArchived`, `startDate` and `endDate` are **unreachable from the UI** — there is no date-range or archive-inclusion control anywhere. A user with years of history always exports everything. §24 F8.

### 5.3 `GET /api/export/status/[id]` — 44 lines

Polls by `exportId`. Returns `ExportStatusRow` (`:22`–`:39` in `ExportData`): `status`, `fileUrl`, `fileSize`, `requestedAt`, `completedAt`, `expiresAt`, `errorMessage`. The route correctly `await`s `params` (`AGENTS.md`'s Next 15+ requirement).

### 5.4 `GET /api/export/download/[id]` — 116 lines — **the security-critical one**

```ts
exportRow = await backupService.getExport(session.user.id, id);           // :47
…
const fileName = path.basename(exportRow.fileUrl);                         // :69
// Defensive: the name is derived from stored data, so reject anything that
// is not a bare filename before it reaches the filesystem.
if (fileName !== exportRow.fileUrl || fileName.includes('..')) {           // :73
  return 400 'Invalid export file name';
}
const filePath = path.join(process.cwd(), '.data', 'exports',
                           session.user.id, fileName);                     // :77–83
bytes = await fs.readFile(filePath);                                       // :87
return new NextResponse(new Uint8Array(bytes), {
  headers: { 'Content-Type': contentTypeFor(exportRow.format),
             'Content-Disposition': `attachment; filename="${fileName}"` },  // :100
});
```

**Ownership** is enforced in `BackupService.getExport`: `if (!exportRow || exportRow.userId !== userId) throw new Error('Export not found')` — so a foreign `id` 404s rather than 403ing, which is the right non-enumerating behaviour. ✅

**Path traversal** is defended twice: `path.basename` collapses any directory component, and the `fileName !== exportRow.fileUrl` equality check rejects anything that was not already a bare filename. ✅ I verified `BackupService.storedFileName` is a **pass-through** (`backup.service.ts:112`–`:114` — `return fileName`), so the stored value is whatever `createExport` generated, not user input.

**Files live outside `public/`** (`.data/exports/<userId>/<name>`) so this authorized route is the only read path — the comment at `:66`–`:68` records that `fileUrl` "used to hold a `/uploads/...` public path". ✅ Good design: exports are not world-readable.

Three residual issues: the `Content-Disposition` filename is interpolated unescaped (`:100`); the file is read fully into memory with `fs.readFile` and then copied through `new Uint8Array(bytes)` (`:87`, `:96`) — **two** full-size buffers per download, so a large export is loaded twice; and there is **no expiry enforcement at read time** — `expiresAt` is stored and displayed but never checked, so an "expired" export still downloads until `BackupService` deletes the file. §24 F12, §24 F13.

### 5.5 `POST /api/import` — `app/api/import/route.ts` (51 lines)

Accepts `{ imported, skipped }`. Per the UI copy at `ImportData.tsx:181`–`:183` and the page header at `settings/data/page.tsx:8`–`:9`, it **persists habits and goals as entity merges** and reports every other collection as skipped — "never deleted, never silently dropped". That is a defensively-worded contract, and the UI states it verbatim before the user confirms. ✅

---

## 6. Database dependency

| Model | Via | Purpose |
| ----- | --- | -------- |
| `UserSettings` | `userRepository.updateSettings` | the 3 lifecycle columns |
| `UserSettings` | `UserRepository.getSettings` (store load) | read on mount |
| `User` | `userRepository.update` — **only if** `timezone` is in the patch | never from this page's `save()` (`:69`–`:73`), so not triggered |
| `DataExport` | `dataExportRepository` via `BackupService` | create, poll, download, delete |
| `ActivityLog` | `auditRepository.create` (`SETTINGS_UPDATED`) | written by `userService.updateSettings:302` |

### 6.1 `DataExport` — the export ledger

From `backup.service.ts`, the fields the client sees are `id`, `format`, `status`, `fileUrl`, `fileSize`, `requestedAt`, `completedAt`, `expiresAt`, `errorMessage` (`ExportData.tsx:29`–`:39`).

| Field | Set by | Value |
| ----- | ------ | ----- |
| `status` | `createExport` → `COMPLETED` (`:214`–`:216`) or `FAILED` | drives the poll |
| `fileUrl` | `this.storedFileName(fileName)` (`:213`) | 🔴 a **bare file name**, despite the name |
| `fileSize` | `fileBytes` (`:217`) | displayed via `formatBytes` |
| `expiresAt` | `new Date(Date.now() + EXPIRATION_DAYS * 86_400_000)` (`:220`) with `EXPIRATION_DAYS = 7` (`:24`) | displayed, **never enforced at read time** |

`formatBytes` (`ExportData.tsx:55`–`:58`) only ever prints B or KB — a 40 MB export reads **"40960.0 KB"**. §24 F6.

### 6.2 The three lifecycle columns

| Column | Model default | Schema bound | Options offered | Read by |
| ------ | ------------- | ------------ | --------------- | ------- |
| `dataRetentionDays` | `365` | 30–3650 | 30 / 90 / 180 / 365 / 730 / 3650 | 🔴 **nothing** |
| `retroactiveEditDays` | `3` | 0–30 | 0 / 1 / 3 / 7 / 14 / 30 | 🔴 **nothing** |
| `autoArchiveCompletedDays` | `90` | 0–365 | 0 / 30 / 60 / 90 / 180 / 365 | 🔴 **nothing** |

I grepped all of `src/` for each name. The only hits outside the settings page, the schema and the constants file are in the **legal pages**, and they reference a *different* constant:

```
src/app/(legal)/privacy/page.tsx:218-219   APP_CONFIG.limits.{free,pro}.dataRetentionDays
src/app/(legal)/terms/page.tsx:106,109     APP_CONFIG.limits.{free,pro}.dataRetentionDays
src/config/app.ts:28                       free:     90
src/config/app.ts:38                       pro:     365
src/config/app.ts:48                       premium:  -1
```

So there are **two** retention numbers: a per-plan constant in `config/app.ts` that the privacy policy and terms quote, and a per-user column that this page edits. The legal pages promise retention by **plan**; this page offers retention by **user choice**, up to 10 years. A free-plan user can set 3650 days while the privacy policy they agreed to says their data is kept 90. That is a **compliance contradiction**, not merely an inert setting. §25.

---

## 7. The data-lifecycle settings

### 7.1 What the page claims

| Label | Helper text (verbatim) | Card |
| ----- | ---------------------- | ---- |
| "Data retention" | "How long completed days are kept before being eligible for cleanup." | "eligible for cleanup" |
| "Retroactive edit window" | "How far back you can still log a habit after the fact." | "you can still log" |
| "Auto-archive after" | "Days move to the archive after this many days." | "move to the archive" |

All three are written as **statements of enforced behaviour**. None of the three is enforced. §25.

### 7.2 Two "fileUrl"s, two meanings

This is the single most confusing naming in the export path, and it is worth stating precisely because a reader following `fileUrl` from client to disk will reach the wrong conclusion:

| Layer | Field | Value | Consumer |
| ----- | ----- | ----- | -------- |
| HTTP response | `data.fileUrl` | `/api/export/download/<exportId>` (a **URL**) — `request/route.ts:54` | `ExportData.tsx:180` `<a href={result.fileUrl} download>` ✅ |
| DB column | `DataExport.fileUrl` | the **bare file name** — `backup.service.ts:213` via `storedFileName` | `download/[id]/route.ts:69` `path.basename(...)` ✅ |

Both consumers are correct, so there is no bug — but the shared column name carrying two different kinds of value is a trap for anyone who later assumes it is a URL. The download route's comment (`:66`–`:68`) acknowledges the history. §24 F14.

### 7.3 `EXPIRATION_DAYS = 7` and the "stored for 7 days" copy

`ExportData.tsx:109` says *"Exports are stored for 7 days."* `backup.service.ts:24` says `EXPIRATION_DAYS = 7`, and `:220` sets `expiresAt = now + 7 days`. ✅ **The copy is accurate.**

But "stored for 7 days" implies deletion at day 7, and there is no job that deletes them:

| Mechanism | Present? |
| --------- | -------- |
| A cron that purges expired `DataExport` rows | ❌ — `vercel.json` has only `compute-daily-scores` and `generate-insights` |
| An expiry check in `download/[id]/route.ts` | ❌ — `:55`–`:64` checks only `status`, `fileUrl`, `fileSize` |
| Lazy deletion on read | ❌ |
| `BackupService.deleteExport` | ✅ exists (`backup.service.ts`, called by… **nothing** on this page) |

So exports accumulate on disk indefinitely. §24 F13, §20.

---

## 8. Complete user actions (serial)

### 8.1 Change a data-lifecycle value and save

```
user picks "2 years" in the "Data retention" <Select>            data/page.tsx:108-116
  │
  └─ onChange → patchLocal({ dataRetentionDays: 730 })           :112
        └─ settings.store.ts:156 — merges into the cached row
           applyAppearance(next)  ◄── no-op for these fields      store.ts:161
        ⚠ LOCAL ONLY. Nothing is sent. Reloading before Save discards the change.

user clicks "Save data settings"                                  :153
  │
  └─ persist()                                                     :67
       if (!settings) return                                      :68
       save({ dataRetentionDays, retroactiveEditDays,
              autoArchiveCompletedDays })                         :69-73
        └─ settings.store.ts:125 — OPTIMISTIC: merges the patch    :127-133
             set({ settings: {...before, ...patch}, saving: true, pending: +1 })
           PUT /api/settings                                        :137-140
             └─ api/settings/route.ts:37  userService.updateSettings
                  ├─ updateSettingsSchema.safeParse                user.service.ts:279
                  ├─ build `data`, skipping undefined              :291
                  │    (timezone not in the patch ⇒ no User write) :299
                  └─ userRepository.updateSettings                :297
           on success → set({ settings: updated })  ◄── RECONCILED  :141
                         applyAppearance(updated)
                         return updated
           on failure → set({ settings: before })   ◄── ROLLED BACK :147
        └─ if (result) → setSaved(true); setTimeout(1600)           :74-77
             ⚠ the timeout is never cleared on unmount
```

### 8.2 Request an export

```
click "Export Data"                                ExportData.tsx:129
  │
  └─ handleExport()                                                    :68
       cancelledRef.current = false                                     :69
       setError/setResult/setStatus → null                             :70-72
       setPhase('requesting')                                           :75
       POST /api/export/request  { format }                            :76-79
         └─ zod: format ∈ JSON|CSV|PDF|MARKDOWN                        request:8
            backupService.createExport(userId, {...})                  request:43
              ├─ serializeExport  ── exportUserData(userId, ...)      backup:~120
              ├─ mkdir .data/exports/<userId>                          backup:208
              ├─ fs.writeFile(path.join(dir, fileName), serialized)   backup:~210
              └─ update → COMPLETED, fileUrl=<name>, fileSize, expiresAt=+7d  :214-220
       ◄── { exportId, fileUrl: '/api/export/download/<id>', fileSize, expiresAt }
       if (cancelledRef.current) return                                 :80
       setPhase('polling')                                              :82
       pollExport(exportId)                                             :83 → :44
         for attempt in 0..9:
           GET /api/export/status/<id>                                  :46
           COMPLETED | FAILED → return row                              :47
           if attempt < 9 → sleep(1500)                                :48-50
         ◄── synthetic { status:'FAILED', errorMessage:'Export timed out…' }  :52
       setStatus(row); setResult(requested)                             :86-87
       setPhase(row.status === 'COMPLETED' ? 'done' : 'failed')         :88
       if FAILED → setError(row.errorMessage ?? 'The export failed…')   :89-91
```

Note the `cancelledRef` is **never set to `true` anywhere** — it is initialised to `false` at `:66` and reset to `false` at `:69`, and read at `:80`/`:84`/`:93`, but nothing ever writes `true`. The guard is therefore inert. §24 F11.

### 8.3 Download the export

```
click <a href={result.fileUrl} download>                 ExportData.tsx:179-186
  │
  └─ GET /api/export/download/<exportId>                 download/[id]/route.ts:33
       auth() → 401                                        :35-38
       const { id } = await context.params                 :40  ◄── correctly awaited
       if (!id) → 400 'Invalid export id'                  :41-43
       backupService.getExport(userId, id)                  :47
         └─ if (!row || row.userId !== userId) throw 'Export not found'   ◄── ✅ ownership
       catch 'Export not found' → 404                       :49-51
       if (status !== COMPLETED || !fileUrl || !fileSize) → 409   :55-64
       fileName = path.basename(row.fileUrl)                :69
       if (fileName !== row.fileUrl || includes('..')) → 400 :73   ◄── ✅ traversal guard
       filePath = cwd/.data/exports/<userId>/<fileName>     :77-83
       fs.readFile → ENOENT → 404 'Export file is missing'  :87-93
       ◄── 200, Content-Type from format, Content-Disposition attachment
```

### 8.4 Import a backup

```
click the dropzone <label>                                  ImportData.tsx:132
  └─ <input type="file" accept="application/json,.json" class="sr-only">   :143-151
       onChange → handleFileChange(event)                   :56
         file = event.target.files?.[0]; if (!file) return  :60-61
         setReading(true); clear error/parsed/counts        :62-66
         const text = await file.text()                     :69   ◄── fully client-side
         const json = JSON.parse(text)                      :70
         validateImport(json)                               :71 → :221
           ├─ Array.isArray → { error:null, counts:[{entities,n}] }        :222-227
           ├─ typeof !== object || null → "must be a JSON object or array"  :229-234
           ├─ entries.length === 0 → "The file is empty."                  :237-239
           └─ else per entry: coerce to array, skip empty, name or `${key}*`  :244-250
              recognized === 0 → "No recognizable entity collections found…" :252-257
         validation.error → setError; return                :72-75
         setParsed(json); setCounts(validation.counts)       :76-77
         catch → "The selected file is not valid JSON…"     :78-79
         finally → setReading(false); inputRef.value = ''    :81-83  ◄── ✅ re-pick works

  ▼ preview: <ImportPreview data={parsed} />                :174-176
    counts render as <Badge variant="success">{name}: {n}</Badge>  :167-171

click "Import data"                                         :185
  └─ handleImport()                                          :86
       if (!parsed) return                                   :87
       setImporting(true); clear error/result                :88-91
       POST /api/import  (RAW fetch — not apiRequest)         :94-98   ◄── §27
         body: JSON.stringify(parsed)   ◄── the ENTIRE file is re-serialised
         !response.ok → parse { error } → throw               :100-105
         ◄── { data: { imported, skipped } }
         setImportResult({ imported: ?? 0, skipped: ?? 0 })  :110-113
       catch → setError(message)                             :114-115
       finally → setImporting(false)                          :117
```

⚠ The whole backup is parsed **and re-serialised** (`JSON.parse` at `:70`, `JSON.stringify` at `:97`). A 50 MB export doubles in memory as a string, a parsed object graph, and a second string — all in the browser tab, before the request. §24 F5.

---

## 9. What can the user create

| Thing | Mechanism | Persisted where |
| ----- | --------- | ---------------- |
| A `DataExport` row | `POST /api/export/request` → `backupService.createExport` | `DataExport` |
| A file on disk | `fs.writeFile` in `BackupService` | `.data/exports/<userId>/<name>` — **outside `public/`**, so only the authorized route can read it ✅ |
| Imported entities | `POST /api/import` — habits and goals **merged**; every other collection reported as skipped | `Habit`, `Goal` (and their children) |
| An `ActivityLog` | `userService.updateSettings:302` | on every lifecycle Save |

`IncludeArchived`, `startDate` and `endDate` are accepted by the export schema but **unreachable** from this UI — `ExportData` sends only `{ format }` (`:78`). §24 F8.

## 10. What can the user edit

| Thing | Mechanism |
| ----- | --------- |
| `dataRetentionDays` | `<Select>` → `patchLocal` → Save → `PUT /api/settings` — 🔴 read by nothing |
| `retroactiveEditDays` | same — 🔴 read by nothing |
| `autoArchiveCompletedDays` | same — 🔴 read by nothing |

`ExportData`/`ImportData` are write-only flows; there is no edit of an existing export.

⚠ **The `<Select>`s are local-only until Save.** `patchLocal` is documented in `settings.store.ts:45` as *"Optimistic local-only update. Use for text fields while typing"* — using it for a `<select>` is correct, but it means the page has a **dirty state it does not track**: change a value, navigate away, and it is silently lost with no warning and no `beforeunload` guard. §24 F15.

## 11. What can the user delete

**Nothing from this page.** Notably:

- `BackupService.deleteExport` exists (and correctly `unlink`s the backing file with a `console.warn` on failure) but **nothing calls it** — there is no delete button, no route, and no cron. So a user cannot remove an export they requested, and neither can the system. §24 F13.
- `/settings/danger-zone` holds the only destructive control in the subtree, and `DeleteAccount.tsx` (107 lines) lives in the same `components/data/` folder but is not rendered here.

---

## 12. Cross-page dependencies

### 12.1 Inbound — who renders this page's components

| Component | Rendered by |
| --------- | ----------- |
| `ExportData` | **`settings/data/page.tsx:90`**, `settings/export/page.tsx` |
| `ImportData` | **`settings/data/page.tsx:91`**, `settings/import/page.tsx` |
| `ImportPreview` | `ImportData.tsx:20` → `:175` |
| `RETENTION_OPTIONS` et al. | `settings/data/page.tsx:25`–`:29` |

So each of export/import is reachable from **two** routes, and the hub (`settings/page.tsx:80`–`:82`) lists `Data`, `Export` and `Import` as three separate cards. Three cards, two features.

### 12.2 Outbound — what this page reads or calls

| Dependency | Kind | Notes |
| ---------- | ---- | ----- |
| `useSettings` → store | read + write | `settings`, `save`, `patchLocal` |
| `useAuth` | read | `isAuthenticated`, `isLoading` |
| `POST /api/settings` | write | the lifecycle card |
| `POST /api/export/request` | write | creates a `DataExport` + a file |
| `GET /api/export/status/[id]` | read | polled up to 10× |
| `GET /api/export/download/[id]` | read | the download link |
| `POST /api/import` | write | entity merge |
| `@/lib/constants/data-lifecycle` | pure | the 3 option lists |
| `src/config/app.ts` `APP_CONFIG.limits` | pure | **not** used here — but quoted by the legal pages, which contradicts what this page edits (§25) |

### 12.3 A legal-page contradiction

| Source | Claim |
| ------ | ----- |
| `(legal)/privacy/page.tsx:218`–`:219` | "…{APP_CONFIG.limits.free.dataRetentionDays} days on the free plan and {…pro…} days on Pro, while Premium…" |
| `(legal)/terms/page.tsx:106`, `:109` | "…{…free…} days of history retained… projects with {…pro…} days of history." |
| `config/app.ts:28` / `:38` / `:48` | free **90**, pro **365**, premium **-1** (unlimited) |
| **This page** | lets the user choose 30 … **3650** days, on any plan |

The legal pages state retention as a property of the **subscription**; the settings page presents it as a **user preference**. A user on the free plan can select "10 years" and nothing will stop them — and nothing will happen either, because no retention job exists. So the setting is simultaneously **unenforced** and **contradictory** with the published policy. That combination is worth resolving before it is exposed to anyone who reads the privacy policy. §25.

---

## 13. Impact analysis

**If `/settings/data` were deleted:** `/settings/export` and `/settings/import` still work — they each render one of the two components. Only the lifecycle card is lost, and since all three of its settings are inert (§25), **no behaviour changes at all**. The hub's three cards would drop to two.

**If the lifecycle card were the page's only content:** it would be a page whose entire purpose is three dropdowns that do nothing. Which is, in effect, what it is today minus the parts that work.

**If the dark-mode classes were fixed** (§26): 32 hardcoded classes across three shared components become tokens. The benefit is not cosmetic here — on a dark theme the current `text-gray-900` headings are near-invisible on the `bg-card` surface, and the `bg-red-50`/`bg-green-50` banners are bright light-mode blocks. The "Export Data" and "Import Data" card titles and both success banners are effectively unreadable for dark-theme users. The same components are rendered on `/settings/export` and `/settings/import` too, so one fix lands on three pages.

**If `dataRetentionDays` were wired:** the change would be user-visible in three places at once — old `DailyScore` rows becoming eligible for deletion, `retroactiveEditDays` gating how far back a habit log can be written, and archived days disappearing from `/today`. That is a large, user-affecting feature, which is presumably why it was never finished. The current state — UI present, behaviour absent — is the worst of both: it advertises a capability and silently does nothing.

**If the export polling ceiling were raised:** a large account's export would succeed instead of reporting *"Export timed out after repeated polling."* after ~13.5 s, having actually completed server-side — so the file exists but the UI tells the user it failed. That is the most misleading single behaviour on this page. §24 F9.

---

## 14. Current System Capabilities

| Capability | Evidence |
| ---------- | -------- |
| Full-account export in JSON or CSV | `POST /api/export/request`, `ExportData.tsx:117`–`:126` |
| Server-side serialization of the user's data | `BackupService.serializeExport` → `exportUserData` |
| Files written **outside** `public/`, so no public URL exists | `backup.service.ts:208`; download route comment `:66`–`:68` |
| Ownership enforced on every read | `BackupService.getExport` → `row.userId !== userId` ⇒ `'Export not found'` |
| Path traversal defended twice | `path.basename` + `fileName !== row.fileUrl` + `includes('..')` — `download/[id]:69`–`:75` |
| `params` correctly awaited on both dynamic routes | `download/[id]:40`, `status/[id]` — `AGENTS.md`'s Next 15+ rule ✅ |
| Correct `Content-Type` per format (incl. CSV and Markdown) | `contentTypeFor` `:15`–`:26` |
| `Content-Disposition: attachment` so browsers save rather than render | `:100` |
| 409 when an export is not ready | `:60`–`:63` |
| Polling with a bounded attempt count | `POLL_ATTEMPTS = 10`, `POLL_INTERVAL_MS = 1500` — `:41`–`:42` |
| Client-side file picking + validation **before** any upload | `file.text()` + `JSON.parse` + `validateImport` — `:69`–`:71` |
| Unrecognized collections shown as `name*` rather than hidden | `:247` |
| Import is a **merge**, and the UI says so before confirming | `ImportData:181`–`:183`, `settings/data:8`–`:9` |
| Import reports skipped counts honestly | `importResult.skipped` `:211` |
| File input reset so re-picking the same file re-fires `onChange` | `:82` ✅ |
| `sr-only` file input with an explicit `aria-label` | `:149`–`:150` ✅ |
| Option values all inside their schema bounds | §5.1 — verified |
| The lifecycle card's error state is theme-aware | `bg-destructive/10 text-destructive` `:144`–`:146` ✅ |
| Optimistic save with rollback via the shared store | `settings.store.ts:125`–`:154` |
| **All three previously-dead buttons now work** | page header `:6`–`:9` |

---

## 15. Currently NOT Supported

| Not supported | Note |
| ------------- | ---- |
| 🔴 **Any enforcement of the three lifecycle settings** | No retention job, no archive job, no edit-window guard. §25 |
| Deleting an export | `BackupService.deleteExport` exists, is never called; no UI, no route |
| Expiring an export at read time | `expiresAt` is displayed and never checked |
| Export **date range** | `startDate`/`endDate` are in the schema; the UI sends only `{ format }` |
| Export **with archived data** | `includeArchived` is in the schema; unreachable from the UI |
| PDF / Markdown export from the UI | The schema accepts all four formats; the `<select>` offers JSON and CSV only |
| Listing past exports | `BackupService.getExports` exists; nothing calls it |
| Progress reporting during export | Status is polled but no percentage is rendered |
| Cancelling an in-flight export | `cancelledRef` is never set to `true` |
| A retry button on export failure | The error renders, but the only way to retry is to change the format and back |
| Import **rollback** | An import merges; there is no undo and no dry-run beyond the preview |
| Importing anything but habits and goals | Every other collection is "reported as skipped" — silently, in the sense that the user sees a count but not which keys |
| Client-side file size guard | A multi-hundred-MB JSON is parsed in the tab with no size check |
| Import progress | Single `importing` boolean |
| **Dark theme** | 32 hardcoded light-mode classes. §26 |
| **Tests** | `tests/` has 6 files; none touches `backup.service.ts`, `ExportData`, `ImportData`, `data-lifecycle.ts` or `validateImport` |
| A `loading.tsx` / `error.tsx` | Absent for the route; the page hand-rolls both skeletons |
| A dirty-state guard on the lifecycle selects | Changing a value then navigating loses it silently |

---

## 16. Loading / Error / Empty / Edge states

### 16.1 The page's own states

| State | Trigger | Render |
| ----- | ------- | ------ |
| Auth loading | `isLoading` | `Skeleton h-8 w-40` + `Skeleton h-64` (`:37`–`:46`) |
| Signed out | `!isAuthenticated` | `Card` + `ShieldAlert` + "Sign in required" + `<a href="/login">` (`:48`–`:65`) — uses a raw `<a>`, not `next/link`, so it is a **full page load** |
| Settings loading | `loading \|\| !settings` | 3 × `Skeleton h-10 w-full` (`:99`–`:104`) |
| Save error | `error` from the store | `role="alert"` with `bg-destructive/10` (`:143`–`:150`) ✅ |
| Saved | `saved` | `CheckCircle2` + "Saved", cleared after 1600 ms (`:156`–`:161`) ✅ theme-aware |

⚠ The `isAuthenticated` gate is unreachable in practice — `proxy.ts` redirects before the page renders. It is one of 20 duplicated copies of this gate (`settings.md` F11). And its `<a href="/login">` rather than `<Link>` forces a full reload. §24 F16.

### 16.2 `ExportData` states

| State | Trigger | Render |
| ----- | ------- | ------ |
| idle | initial | format select + "Export Data" |
| requesting | `:75` | `isLoading` button + "Sending export request…" |
| polling | `:82` | `Loader2 animate-spin` + "Compiling your data — this usually takes a few seconds…" |
| done | `:88` | green block: size, expiry, download link |
| failed | `:88`/`:92` | `role="alert"` red block with the server's `errorMessage` |

🔴 The `polling` copy promises *"this usually takes a few seconds"* while the ceiling is **~13.5 s**, after which the user is told the export "timed out" even if it completed. §24 F9.

### 16.3 `ImportData` states

| State | Trigger | Render |
| ----- | ------- | ------ |
| no file | initial | dropzone, "Click to select a JSON file" |
| reading | `:62` | "Reading file…" |
| error | `:73`/`:79` | `role="alert"` red block; dropzone turns `border-red-300 bg-red-50/50` |
| previewed | `:76` | file-name badge, count badges, `<ImportPreview>`, the merge disclosure and the Import button |
| importing | `:89` | `Loader2` + "Importing…" |
| imported | `:110` | green banner "Imported N items (M skipped)" |

### 16.4 Edge cases

| Edge | Behaviour |
| ---- | --------- |
| **Not a JSON file** | "The selected file is not valid JSON. Choose a backup file exported by RoutineOS." ✅ |
| **Valid JSON scalar** (`"hello"`, `42`, `null`) | "The file must be a JSON object or array. Found a scalar value instead." ✅ — `:229`–`:234` |
| **`{}`** | "The file is empty. Nothing to import." ✅ `:237`–`:239` |
| Array at top level | Accepted; one badge reads `entities: n` ✅ `:222`–`:227` |
| Unknown keys | Shown as `name*` with an asterisk — visible, not hidden ✅ `:247` |
| Nested object instead of an array | Coerced to a 1-element array, so a single `{…}` counts as 1 ✅ `:245` |
| Re-picking the same file | Works — `inputRef.value = ''` in `finally` ✅ `:82` |
| **Export larger than 1024 KB** | `formatBytes` has no MB branch → "40960.0 KB" 🔴 §24 F6 |
| Export still processing when the link is clicked | 409 "Export is not ready yet" — but the UI only shows the link after `COMPLETED`, so unreachable in practice |
| Export file deleted from disk | 404 "Export file is missing" ✅ `download:91` |
| Expired export | 🔴 **still downloads** — no expiry check. §24 F13 |
| Very long filename | `<Badge variant="primary">` has no `truncate`; the badge row is `flex-wrap` so it wraps to its own line. Acceptable |
| Huge `counts` array | `flex-wrap` badges, one per key. A 500-key file produces 500 badges — no cap 🔴 §24 F4 |
| `save()` while already saving | No guard — two rapid clicks issue two `PUT`s. `pending` tracks the count but the button only reflects `saving` ✅ §24 F17 |
| Page unloaded during the 1600 ms saved timer | `setSaved(false)` fires on a dead component. Harmless; React 18+ no longer warns. Minor |

---

## 17. Authentication & security

### 17.1 All four export routes and the import route are session-scoped

| Route | Check |
| ----- | ----- |
| `POST /api/export/request` | `auth()` → 401 (`:28`–`:31`) ✅ |
| `GET /api/export/status/[id]` | `auth()` → 401 ✅ |
| `GET /api/export/download/[id]` | `auth()` → 401 (`:35`–`:38`) ✅ |
| `POST /api/import` | `auth()` → 401 ✅ |
| `PUT /api/settings` | `auth()` → 401 (`route.ts:31`–`:34`) ✅ |

**No route accepts a `userId` from the client.** ✅ The `FILE.MD` rule holds throughout.

### 17.2 Export file path — audited, and it holds

```
exportRow.fileUrl  ──(user-controlled? no)──►  generated by BackupService.createExport
                                                     │
                                        storedFileName(fileName)  backup.service.ts:112
                                                     │  a PASS-THROUGH
                                                     ▼
                                          a bare generated file name

download/[id]/route.ts
  :69   fileName = path.basename(row.fileUrl)          ◄── strips any directory component
  :73   if (fileName !== row.fileUrl || fileName.includes('..')) → 400
  :77   path.join(process.cwd(), '.data', 'exports', session.user.id, fileName)
                                                       ▲
                                                       └── the DIRECTORY is the session's
                                                           own id, not anything from the row
```

Two independent defences, and the per-user directory is keyed off `session.user.id` — so even a hostile `fileUrl` could not escape another user's directory. ✅ **No path traversal.**

### 17.3 Exfiltration surface

| Concern | Status |
| ------- | ------ |
| Can one user read another's export? | ❌ No — `row.userId !== userId` throws before any filesystem access |
| Can an export be read without a session? | ❌ No — 401 first |
| Are export files in `public/`? | ❌ No — `.data/exports/<userId>/`, reachable only through the authorized route ✅ |
| Does the download link leak an id? | It leaks a `cuid`, which is not guessable and is useless without the session |
| Does the response disclose anything about other users? | 404 "Export not found" for a foreign id — no enumeration ✅ |

### 17.4 The import endpoint is the weakest link

`ImportData` POSTs the **entire parsed backup** to `POST /api/import`. Whatever that route does with each collection is the real risk surface, and the page's contract is that it merges habits and goals and skips the rest. Two things the page does **not** do:

- **It does not confirm what will be overwritten.** The disclosure says *"persists habits and goals as entity merges"* — it does not say whether a matching habit is updated or duplicated.
- **It does not re-validate on the server.** `validateImport` is client-side only (`:221`), and the payload is `JSON.stringify(parsed)` — whatever was in the file. Server-side validation is the route's responsibility, and I have not read `import/route.ts` in full; that belongs to the `/settings/import` audit.

🔴 `Content-Disposition: attachment; filename="${fileName}"` interpolates a stored value into a header without escaping. `fileName` is server-generated today, so it is not attacker-controlled — but the defence is one refactor away from mattering. §24 F12.

### 17.5 Rate limiting

❌ None on any of the five routes. `POST /api/export/request` triggers a **full serialization of the user's entire account** and a disk write. A loop of N calls costs N full exports. There is no per-user quota, no cooldown, and no check for an export already in flight. §24 F18.

---

## 18. Performance

### 18.1 The page's own cost

| Metric | Value |
| ------ | ------ |
| Requests on mount | **0** — the store is loaded by `useSettingsLoader` in the layout |
| Components rendered | 3 cards, 2 of them substantial |
| Client state | 14 `useState` across the three files |
| Memoisation | `ExportData` uses `useCallback` for `handleExport` (`:68`–`:99`); nothing else memoises |
| Data size on mount | 1 settings row (cached in zustand) |

### 18.2 Export — the expensive path

```
POST /api/export/request
  └─ backupService.createExport
       ├─ serializeExport → exportUserData(userId, {...})     ◄── reads EVERY table
       │    ⚠ how many queries, I did not read exportUserData — but the output is
       │      "a portable copy of your data", i.e. the whole account
       ├─ mkdir + fs.writeFile                                  ◄── serial, on the request path
       └─ update → COMPLETED
  ◄── immediately (the route awaits createExport)

Client then polls GET /api/export/status/<id>
  └─ the row is already COMPLETED, so attempt 0 returns
```

🔴 **The "polling" phase is theatre.** `createExport` is `await`ed to completion inside `POST /api/export/request` (`:43`), and it sets `status: COMPLETED` before returning (`backup.service.ts:214`). So by the time `pollExport` issues its first request the row is already terminal, and the loop exits on attempt 0. The "Compiling your data — this usually takes a few seconds…" message at `ExportData.tsx:144` is displayed while a single GET runs.

So the *real* cost is entirely inside the `POST`, which is why the 30 s Vercel function ceiling (`vercel.json` `app/api/**`) is the binding constraint, not the polling. For a large account a synchronous full-account serialization plus a disk write can plausibly exceed it.

The polling loop is therefore **not harmful but not useful** — it is a fallback for a design where the work is queued. If `createExport` were made async (enqueue + return), the polling would earn its keep and the UI copy would become true. As written, the 10 × 1500 ms ceiling never triggers. §24 F9.

### 18.3 Import — the memory-heavy path

```
file (say 50 MB of JSON)
  └─ await file.text()            → a ~50 MB JS string
  └─ JSON.parse(text)             → an object graph, plausibly 150–300 MB
  └─ JSON.stringify(parsed)       → another ~50 MB string
       all three alive simultaneously, in the browser tab
```

There is **no file-size guard** anywhere in `handleFileChange` (`:56`–`:84`), and `accept="application/json,.json"` (`:146`) is an advisory hint the browser enforces loosely — the `accept` attribute is not a validation. A user who selects the export they just downloaded, on an account with a few years of data, risks a tab OOM. The server would then receive a multi-megabyte body that `api/import` must also parse. §24 F5.

### 18.4 What is efficient

- The lifecycle card adds **zero** requests on mount — the store is already warm.
- `patchLocal` means a `<Select>` change is free; only an explicit Save issues a `PUT`.
- The file is parsed **client-side before upload**, so an invalid backup costs no server round trip. ✅ Good design.
- `ImportPreview` receives the already-parsed object rather than re-parsing. ✅
- `formatBytes` and `formatDate` are tiny local helpers — no date library for two formats. ✅

---

## 19. External integrations

| Integration | Present? | Detail |
| ----------- | -------- | ------ |
| **Local filesystem** (`node:fs/promises`) | ✅ | `BackupService` writes `.data/exports/<userId>/`; `download/[id]:87` reads it. 🔴 **This does not work on Vercel's serverless filesystem** — `process.cwd()` is a read-only, ephemeral layer, so exports written in one invocation are not guaranteed to exist in the next, and are lost on every cold start. On the configured **Neon + Vercel** deployment, export download is unreliable by construction. §24 F1 |
| **Neon / Postgres** | ✅ | `UserSettings`, `DataExport`, `ActivityLog`, plus every table `exportUserData` reads |
| **Email** | ❌ | No "your export is ready" notification, despite a 7-day expiry that implies the user should be told |
| **Object storage (S3/R2)** | ❌ | ❗ The absence is the root of F1. A signed-URL flow would fix it |
| **Third-party APIs** | ❌ | none |
| **Clipboard** | ❌ | none |

---

## 20. Background jobs / cron effects

**The two retention settings this page exposes would need a cron, and there is none.**

| Cron (`vercel.json`) | Schedule | Relevance |
| -------------------- | -------- | --------- |
| `/api/cron/compute-daily-scores` | `0 1 * * *` | Writes `DailyScore`. `dataRetentionDays` governs how long those rows are kept — so a retention job would have to coexist with a job that creates them daily |
| `/api/cron/generate-insights` | `0 2 * * 0` | A stub returning `generated: 0` |

**Missing jobs, each of which a user setting implies exists:**

| Implied job | Triggered by | Present? |
| ----------- | ------------ | -------- |
| Delete `DailyScore` / `HabitLog` rows older than `dataRetentionDays` | `dataRetentionDays` | ❌ |
| Move completed days to an archive after `autoArchiveCompletedDays` | `autoArchiveCompletedDays` | ❌ |
| Purge `DataExport` rows past `expiresAt` and unlink their files | `EXPIRATION_DAYS = 7` | ❌ — `BackupService.deleteExport` exists and is never called |
| Reject a habit log older than `retroactiveEditDays` | `retroactiveEditDays` | ❌ — nothing reads it, so the user can edit any date |

The last one is the most concrete: `/today` and `/habits` accept a `HabitLog` for any date. With `retroactiveEditDays = 0` ("Today only"), a user who back-dates a habit six months still succeeds. The setting's own helper text — *"How far back you can still log a habit after the fact"* — describes an enforced limit that does not exist. §25.

`/recap` and `/analytics` likewise read `DailyScore` with no retention awareness, so a future retention job would silently change their windows. Not a defect today; a coupling to record.

---

## 21. Data flow diagrams

### 21.1 The lifecycle card — save path

```
 user <Select>                    store                      API                      DB
    │                              │                         │                        │
    ├─ onChange ──────────────────►│                         │                        │
    │   patchLocal({ field: n })   │                         │                        │
    │   settings.store.ts:156      │                         │                        │
    │     settings = {...before, field: n}   ◄── LOCAL ONLY    │                        │
    │     applyAppearance(next)    │        (no request)      │                        │
    │                              │                         │                        │
    │  ┌── navigates away / reloads ──► change discarded, no warning               │
    │                              │                         │                        │
    ├─ "Save data settings" ──────►│                         │                        │
    │   persist()  data:67         │                         │                        │
    │   save({3 fields})           │                         │                        │
    │   store.ts:125                │                         │                        │
    │     settings = {...patch}    │  ◄── OPTIMISTIC         │                        │
    │     saving = true, pending++ │                         │                        │
    │                              ├─ PUT /api/settings ────►│                        │
    │                              │                         ├─ auth() → userId      │
    │                              │                         ├─ userService           │
    │                              │                         │   .updateSettings      │
    │                              │                         │     zod.safeParse      │
    │                              │                         │     (30-3650 / 0-30 /  │
    │                              │                         │      0-365 bounds)     │
    │                              │                         │     timezone absent    │
    │                              │                         │     ⇒ no User write    │
    │                              │                         ├─ userRepository ─────►│
    │                              │                         │   .updateSettings     │
    │                              │                         ├─ auditRepository ─────►│
    │                              │                         │   'SETTINGS_UPDATED'   │
    │                              │◄── { success, data: row }                        │
    │   store.ts:141               │                         │                        │
    │     settings = row  ◄── RECONCILED (not the patch)     │                        │
    │     applyAppearance(row)     │                         │                        │
    │   data:74  setSaved(true) ──► "Saved" for 1600 ms       │                        │
    │                              │                         │                        │
    │   on FAILURE:                │                         │                        │
    │     settings = before  ◄── ROLLED BACK  store.ts:147   │                        │
    │     error → role="alert"     │                         │                        │
    ▼                              ▼                         ▼                        ▼
             ⟵ and now: NOTHING READS THESE THREE COLUMNS. See §25.
```

### 21.2 Export — the polling is theatre

```
 click "Export Data"
      │
      ▼
 POST /api/export/request  { format }
      │
      ├─ zod: format ∈ JSON|CSV|PDF|MARKDOWN
      ├─ backupService.createExport(userId, {…})
      │     ├─ exportUserData(userId)          ◄── reads EVERY table, synchronously
      │     ├─ mkdir .data/exports/<userId>
      │     ├─ fs.writeFile(dir/<name>, serialized)
      │     └─ update → status = COMPLETED ─────────────────┐
      ▼                                                    │
 ◄── { exportId, fileUrl:'/api/export/download/<id>',
       fileSize, expiresAt: now + 7d }                     │
      │                                                    │
      ├─ setPhase('polling')  "Compiling… few seconds"     │
      │                                                    │
      ▼  pollExport(exportId)                               │
      GET /api/export/status/<id>  ────────────────────────┘
      ◄── status: 'COMPLETED'      ← attempt 0. The loop exits here.
         (9 further attempts and ~13.5 s of ceiling never used)

 click "Download export"
      │
      ▼
 GET /api/export/download/<id>
      ├─ auth() → userId
      ├─ getExport(userId, id) → row.userId !== userId ⇒ throw ⇒ 404   ✅
      ├─ status !== COMPLETED || !fileUrl || !fileSize ⇒ 409
      ├─ fileName = path.basename(row.fileUrl)                        ✅
      ├─ fileName !== row.fileUrl || includes('..') ⇒ 400            ✅
      ├─ fs.readFile(cwd/.data/exports/<userId>/<fileName>)
      │     🔴 on Vercel: this layer is ephemeral — may not exist
      └─ 200 + Content-Type + Content-Disposition: attachment

 expiresAt is displayed, never enforced ⇒ an expired export still downloads. §24 F13
```

### 21.3 Two meanings of `fileUrl`

```
                 ┌─────────────────────────────────────────────┐
                 │        BackupService.createExport           │
                 │                                             │
   fileName = "<generated>.json"                               │
                 │                                             │
                 │  storedFileName(fileName)  backup:112       │
                 │  └─ return fileName      (PASS-THROUGH)     │
                 └────────────────┬────────────────────────────┘
                                  │
                    ┌─────────────┴─────────────┐
                    │                           │
        DB: DataExport.fileUrl            RESPONSE: data.fileUrl
        = "routineos-export-<id>.json"    = "/api/export/download/<id>"
        (a bare FILE NAME)                (a URL)
                    │                           │
                    ▼                           ▼
        download/[id]:69                  ExportData:180
        path.basename(row.fileUrl)        <a href={result.fileUrl} download>
                    │                           │
                    ▼                           ▼
        fs.readFile(cwd/.data/exports/
                    <userId>/<fileName>)     browser fetches the route
                    │
                    ▼
        bytes ──► new Uint8Array(bytes)   ◄── a SECOND full-size copy
```

### 21.4 The inert settings — what a user can set vs what exists

```
  UserSettings columns the page edits        Code that reads them
  ───────────────────────────────────        ─────────────────────
  dataRetentionDays        (30…3650)  ──────►  (nothing)
        │                                        │
        │  BUT (legal)/privacy:218 quotes         │
        ▼  APP_CONFIG.limits.free.dataRetentionDays = 90
  config/app.ts:28  free: 90
  config/app.ts:38  pro:  365
  config/app.ts:48  premium: -1
        │
        └─► the POLICY says retention follows the plan
             the UI says retention follows the user
             neither is enforced                              → §25, F1

  retroactiveEditDays      (0…30)     ──────►  (nothing)
        │
        ▼  helperText: "How far back you can still log a habit after the fact."
  /today, /habits accept a HabitLog for ANY date.
  With retroactiveEditDays = 0 ("Today only"), a 6-month back-dated
  habit still succeeds.                                        → §25, F2

  autoArchiveCompletedDays (0…365)    ──────►  (nothing)
        │
        ▼  helperText: "Days move to the archive after this many days."
  No archive table is written by anything.
```

---

## 22. File-by-file dependency inventory

### 22.1 The route

| File | Lines | Directive | Role |
| ---- | ----- | --------- | ---- |
| `src/app/(dashboard)/settings/data/page.tsx` | **169** | `'use client'` | host page: 2 auth branches, lifecycle card, 2 embedded components |

### 22.2 Components — `src/components/data/**`

| File | Lines | Directive | Role | Dark-mode defects |
| ---- | ----- | --------- | ---- | ----------------- |
| `ExportData.tsx` | **194** | `:1` | request + poll + download | **11** 🔴 |
| `ImportData.tsx` | **262** | `:1` | pick + validate + preview + POST | **9** 🔴 |
| `ImportPreview.tsx` | 160 | — | renders the parsed object | **12** 🔴 |
| `DeleteAccount.tsx` | 107 | — | not rendered here (danger-zone) | — |

### 22.3 API routes — 5

| File | Lines | Methods | Notes |
| ---- | ----- | ------- | ----- |
| `src/app/api/export/request/route.ts` | 71 | POST | zod, delegates to `BackupService` |
| `src/app/api/export/status/[id]/route.ts` | 44 | GET | polls by id |
| `src/app/api/export/download/[id]/route.ts` | 116 | GET | ownership + traversal guards ✅ |
| `src/app/api/import/route.ts` | 51 | POST | merge habits + goals, skip the rest |
| `src/app/api/settings/route.ts` | 44 | GET/PUT | the lifecycle card |

### 22.4 Server

| File | Lines | Role |
| ---- | ----- | ---- |
| `src/server/services/backup.service.ts` | — | `createExport`, `getExport`, `getExports`, `deleteExport`, `storedFileName`, `exportsDirFor`, `serializeExport` |
| `src/server/services/user.service.ts` | `:258`–`:311` | `getSettings`, `updateSettings` |
| `exportUserData` (in `server/data/`) | — | the full-account serializer |
| `dataExportRepository` | — | `findAllByUser`, `findById`, `update` |

### 22.5 Pure / shared

| File | Lines | Role |
| ---- | ----- | ---- |
| `src/lib/constants/data-lifecycle.ts` | 45 | the 3 option lists; the header comment pins the schema bounds ✅ |
| `src/store/settings.store.ts` | 174 | `save`, `patchLocal`, `applyAppearance` |
| `src/hooks/useSettings.ts` | 71 | `useSettings` |
| `src/lib/validation/settings.schema.ts` | 75 | the three `int` bounds at `:61`–`:63` |
| `src/config/app.ts` | — | `APP_CONFIG.limits.*.dataRetentionDays` — **not** used here, but quoted by the legal pages (§12.3) |

### 22.6 Counts

| Metric | Value |
| ------ | ----- |
| Page lines | 169 |
| Component lines rendered by the page | 194 + 262 + 160 = **616** |
| API route lines | 71 + 44 + 116 + 51 = **282** |
| Requests on mount | **0** |
| Hardcoded light-mode classes | **32** 🔴 |
| `UserSettings` columns edited | 3 |
| …read by any code | **0** 🔴 |
| Crons that would honour them | **0** 🔴 |

---

## 23. Current behavior summary

`/settings/data` hosts two working, well-scoped features and one non-functional card. **Export** requests a full-account dump, polls for completion and hands back an authorized download link — and the download route is genuinely careful: ownership is enforced in the service, path traversal is defended twice with a server-generated filename, files live outside `public/`, and `params` is correctly awaited. **Import** reads the backup in the browser, validates it against 13 known collection keys before any upload, shows a preview, states plainly that it merges habits and goals and skips everything else, and reports what it did. Both were dead buttons until this page was rewritten, and the rewrite is real.

The **Data lifecycle** card is the problem. All three of its dropdowns persist correctly — through the shared store, with optimistic-then-reconcile semantics and a rollback on failure — and all three are read by **no code in the application**. There is no retention job, no archive job, no purge of expired exports, and no guard preventing a back-dated habit log. Worse, the retention setting **contradicts the privacy policy**: `/legal/privacy` and `/legal/terms` quote `APP_CONFIG.limits.free.dataRetentionDays = 90` as a property of the plan, while this page offers the user 30–3650 days on any plan.

Two further issues are structural rather than cosmetic. The export writes to `process.cwd()/.data/exports/` — **ephemeral storage on Vercel**, so download is unreliable on the configured deployment. And the "polling" phase is theatre: `createExport` is awaited to completion and sets `COMPLETED` before the `POST` returns, so the first status GET exits the loop immediately, while the UI shows "Compiling your data — this usually takes a few seconds" and holds a ~13.5 s ceiling that never fires.

Finally, all three data components are hardcoded light-mode — 32 `text-gray-900` / `bg-white` / `bg-red-50` / `border-green-200` classes — so on a dark theme the two card titles and both success banners are close to invisible. Those same components render on `/settings/export` and `/settings/import` too.

---

## 24. Findings register

Severity: 🔴 **critical** · 🟠 **major** · 🟡 **minor**.

| ID | Sev | Finding | Evidence | Fix |
| -- | --- | ------- | -------- | --- |
| **F1** | 🔴 | Exports are written to `process.cwd()/.data/exports/<userId>/` via `node:fs`. On **Vercel** that is a read-only, ephemeral, per-invocation layer: the file written during `POST /api/export/request` is frequently absent by the time `GET /api/export/download/[id]` runs in a later invocation, and is lost on every cold start. The feature the page's header says was fixed ("the download endpoint 404'd") still 404s on the configured deployment — just for a different reason. | `backup.service.ts:208` + `exportsDirFor:101`; `download/[id]:77`–`:93`; `vercel.json` deploys to Vercel (Neon `DATABASE_URL`) | Store exports in object storage (S3/R2) and return a short-lived signed URL. Until then, note the limitation explicitly. **§19** |
| **F2** | 🔴 | `retroactiveEditDays` is editable and its helper text reads *"How far back you can still log a habit after the fact"*, but **nothing reads it**. `/today` and `/habits` accept a `HabitLog` for any date, so a user who selects "Today only" can still back-date a habit six months. | `data/page.tsx:120`–`:128`; grep: no consumer; `settings.schema.ts:61` | Enforce the window in `HabitService.createLog`, or remove the control. **§25** |
| **F3** | 🔴 | `dataRetentionDays` and `autoArchiveCompletedDays` are likewise read by nothing, and there is no retention or archive cron. The helper texts assert enforced behaviour ("kept before being eligible for cleanup", "Days move to the archive after this many days") that does not exist. | `data/page.tsx:107`–`:141`; `vercel.json` has no such cron | Implement the jobs, or remove the card. **§25** |
| **F4** | 🔴 | `dataRetentionDays` **contradicts the published privacy policy.** `/legal/privacy:218` and `/legal/terms:106` state retention as `APP_CONFIG.limits.{free,pro}.dataRetentionDays` (90 / 365) — a property of the **plan** — while this page lets any user choose up to **3650** days. The two statements cannot both be true. | `(legal)/privacy/page.tsx:218`–`:219`; `(legal)/terms/page.tsx:106`, `:109`; `config/app.ts:28`/`:38`/`:48`; `data/page.tsx:108` | Reconcile: either the policy follows the setting, or the setting is clamped to the plan limit. **§12.3** |
| **F5** | 🔴 | 32 hardcoded light-mode classes across `ExportData` (11), `ImportData` (9) and `ImportPreview` (12) — `text-gray-900`, `text-gray-600`, `bg-white`, `border-gray-300`, `bg-red-50`, `text-red-700`, `border-green-200`, `bg-green-50/70`, `text-green-800`, `focus:ring-blue-600`. On a dark theme the two card titles and both success banners are close to invisible. This is the ERROR.md I3 class that `AchievementBadge`, `AchievementPopup` and `AchievementsStrip` were fixed for; these three were not. | as counted; `ExportData.tsx:106`, `:108`, `:114`, `:122`, `:149`, `:158`, `:167`, `:179`–`:182`; `ImportData.tsx:126`, `:128`, `:135`, `:142`, `:155` | Replace with tokens: `text-foreground`, `text-muted-foreground`, `bg-card`, `border-border`, `bg-destructive/10 text-destructive`, `bg-success/10`. **§26** |
| **F6** | 🟠 | The export **polling phase is theatre.** `createExport` is `await`ed to completion inside `POST /api/export/request` and sets `status: COMPLETED` before returning, so `pollExport` exits on attempt 0. The "Compiling your data — this usually takes a few seconds…" copy shows during one GET, and the 10 × 1500 ms ceiling (≈ 13.5 s) never fires. | `request/route.ts:43`; `backup.service.ts:214`–`:216`; `ExportData.tsx:41`–`:52`, `:83`, `:144` | Either make `createExport` asynchronous (enqueue + return) so polling earns its keep, or drop the polling and the copy. Also move the work off the request path — it is bounded by the 30 s function ceiling. **§18.2, §21.2** |
| **F7** | 🟠 | `VALID_COLLECTION_KEYS` includes `'settings'`, so a backup's settings block is accepted, counted, previewed and POSTed — and the importer "reports every other collection as skipped". A user who exports, edits settings in the file and re-imports gets a **silent no-op**: the file is read, validated, previewed, uploaded, and reported as imported-with-skips. | `ImportData.tsx:35`, `:167`–`:171`, `:94`–`:98` | Either implement the settings merge, or drop `'settings'` from the accepted keys so the UI says "skipped" up front. **§2.2** |
| **F8** | 🟠 | `includeArchived`, `startDate` and `endDate` are in the export schema but **unreachable** from the UI — `ExportData` sends only `{ format }`. There is no date-range control and no archive toggle, so every export is the whole account. | `request/route.ts:9`–`:11`; `ExportData.tsx:78` | Add the controls, or drop the unused schema fields. |
| **F9** | 🟡 | 🔴 Exports are never deleted. `BackupService.deleteExport` exists (and correctly unlinks the file) but nothing calls it; `getExports` is likewise uncalled; there is no purge cron; and `download/[id]` **never checks `expiresAt`** — only `status`, `fileUrl`, `fileSize`. So an export dated 6 months ago still downloads, contrary to "Exports are stored for 7 days". | `backup.service.ts:24`, `:275`–`:280`; `download/[id]:55`–`:64`; `ExportData.tsx:109`; `vercel.json` | Add a purge cron and an `expiresAt` check in the download route. **§7.3, §20** |
| **F10** | 🟡 | `formatBytes` has only B and KB branches, so a 40 MB export displays **"40960.0 KB"**. | `ExportData.tsx:55`–`:58` | Add an MB/GB branch. |
| **F11** | 🟡 | `cancelledRef` in `ExportData` is initialised and **reset to `false`** but never set to `true` — not on unmount, not on a new export, nowhere. The three guards at `:80`/`:84`/`:93` are therefore inert, and a response arriving after unmount can still `setState`. | `ExportData.tsx:66`, `:69`, `:80`, `:84`, `:93` | Add a `useEffect(() => () => { cancelledRef.current = true }, [])`. |
| **F12** | 🟠 | `Content-Disposition: attachment; filename="${fileName}"` interpolates a stored value into a header unescaped. The value is server-generated today so it is not attacker-controlled, but the defence is one refactor away. Separately, `fs.readFile` + `new Uint8Array(bytes)` produces **two** full-size buffers for every download. | `download/[id]:87`, `:96`, `:100` | Escape the filename; stream the file instead of buffering twice. |
| **F13** | 🟡 | `/settings/export` and `/settings/import` are 81- and 79-line wrappers around a single card each, while `/settings/data` renders both plus the lifecycle card. The hub lists all three, so "Export" appears twice in the settings tree. | `settings/export/page.tsx:18`; `settings/import/page.tsx:17`; `settings/data/page.tsx:90`–`:91`; `settings/page.tsx:80`–`:82` | Retire the two wrappers or drop the two hub cards. **§3.3** |
| **F14** | 🟡 | 🔴 `fileUrl` means two different things in one flow: a bare **file name** on the `DataExport` column, and a **URL** in the HTTP response. Both consumers are currently correct, but the shared name is a trap. | `backup.service.ts:112`–`:114`, `:213`; `request/route.ts:54`; `download/[id]:69`; `ExportData.tsx:180` | Rename the column to `fileName`, or return `downloadUrl` in the response. **§7.2, §21.3** |
| **F15** | 🟡 | The three `<Select>`s are local-only until Save (`patchLocal`), and the page tracks no dirty state. Changing a value and navigating away loses it with no warning and no `beforeunload` guard — on a page whose values are presented as retention policy. | `data/page.tsx:112`, `:124`, `:136`; `settings.store.ts:45`, `:156` | Track a dirty flag and warn, or save on change. |
| **F16** | 🟡 | The signed-out branch uses `<a href="/login">` rather than `<next/link>`, forcing a full page reload. It is one of 20 duplicated copies of this gate, which `proxy.ts` makes unreachable anyway. | `data/page.tsx:55`; `proxy.ts` | Extract one shared `<RequireAuth>`; use `Link`. **§16.1** |
| **F17** | 🟡 | `persist()` has no in-flight guard; two rapid clicks on "Save data settings" issue two `PUT`s. The store tracks `pending` correctly, but the button reflects only `saving`. | `data/page.tsx:153`; `settings.store.ts:131`, `:152` | Disable on `saving \|\| pending > 0`. |
| **F18** | 🟠 | No rate limiting on any of the five routes. `POST /api/export/request` performs a **full-account serialization and a disk write** per call, with no per-user quota, no cooldown, and no check for an export already in flight. | `request/route.ts:26`; `backup.service.ts` `createExport` | Rate-limit per user and reject a second in-flight export. |
| **F19** | 🟠 | No file-size guard before `await file.text()` → `JSON.parse` → `JSON.stringify`. Three full copies of the backup are alive simultaneously in the browser tab, and `accept="application/json,.json"` is an advisory hint, not validation. | `ImportData.tsx:69`, `:70`, `:97`, `:146` | Check `file.size` first and refuse above a threshold; consider a streaming parse. **§18.3** |
| **F20** | 🟡 | `counts.map` renders one `<Badge>` per collection key with no cap, so a 500-key JSON produces 500 badges. | `ImportData.tsx:167`–`:171` | Cap the badges and show "+N more". |
| **F21** | 🟡 | The `setSaved(false)` timeout is never cleared on unmount. Harmless in React 18+, but the same pattern appears on several settings pages. | `data/page.tsx:76` | Clear in a `useEffect` cleanup. |
| **F22** | 🟠 | **Zero tests** cover this page or anything it depends on. `validateImport` and `formatBytes` are pure and trivially testable; the three schema bounds are already documented in `data-lifecycle.ts` and would be pinned by one assertion. | `tests/` listing | `tests/lib/data-lifecycle.test.ts` — every option value inside its schema bound, and `validateImport` against a scalar / `{}` / array / unknown-key fixture. |

**Count: 22 findings. 5 critical, 8 major, 9 minor.**

---

## 25. The data-lifecycle settings are inert

The page's own header comment states its purpose (`:11`–`:12`):

> *"adds the data-lifecycle controls (`dataRetentionDays`, `retroactiveEditDays`, `autoArchiveCompletedDays`) that had schema + Prisma columns but no UI."*

That is an accurate description of what the commit did — and it is precisely the problem. The gap it closed was **UI**, and UI was not the gap.

### 25.1 What I searched

```
grep -rn "dataRetentionDays"        src/  →  3 real hits
grep -rn "retroactiveEditDays"      src/  →  3 real hits
grep -rn "autoArchiveCompletedDays" src/  →  3 real hits

  src/app/(dashboard)/settings/data/page.tsx   ← the only writer
  src/lib/validation/settings.schema.ts         ← the bound
  src/lib/constants/data-lifecycle.ts           ← the option list
  prisma/schema.prisma                          ← the column

  (legal)/privacy, (legal)/terms, config/app.ts  ← a DIFFERENT retention constant
```

**Zero consumers.** No service, repository, cron or API route reads any of the three.

### 25.2 The three settings, restated

| Setting | Model default | Helper text shown to the user | Reality |
| ------- | ------------- | --------------------------- | ------- |
| `retroactiveEditDays` = 3 | `3` | *"How far back you can still log a habit after the fact."* | `/today` and `/habits` post a `HabitLog` for **any** date. With `0` ("Today only") selected, a six-month back-dated habit still succeeds. |
| `dataRetentionDays` = 365 | `365` | *"How long completed days are kept before being eligible for cleanup."* | Nothing is ever cleaned up. The phrase "eligible for cleanup" describes a job that does not exist. |
| `autoArchiveCompletedDays` = 90 | `90` | *"Days move to the archive after this many days."* | No archive table is written by any code path. |

All three helper texts are written as **statements of enforced behaviour**. That is the defect: not that the feature is missing, but that the UI asserts it exists.

### 25.3 The contradiction with the privacy policy

This is the part that outranks the other two.

```
  src/config/app.ts
    limits.free.dataRetentionDays     = 90        ◄── what the POLICY promises
    limits.pro.dataRetentionDays      = 365
    limits.premium.dataRetentionDays  = -1        (unlimited)

  src/app/(legal)/privacy/page.tsx:218
    "…{APP_CONFIG.limits.free.dataRetentionDays} days on the free plan and
     {APP_CONFIG.limits.pro.dataRetentionDays} days on Pro, while Premium…"

  src/app/(dashboard)/settings/data/page.tsx:108
    <Select label="Data retention" options={RETENTION_OPTIONS} />
    RETENTION_OPTIONS = 30, 90, 180, 365, 730, 3650
```

So the app makes **two** incompatible claims about how long user data is kept:

| Source | Claim |
| ------ | ----- |
| Privacy policy and Terms | A function of the **subscription plan** |
| This settings page | A user choice, up to **10 years**, on any plan |

A free-plan user who reads the policy believes their data is kept 90 days. The same user, on this page, can select "10 years" — and nothing will happen either way, because no job reads the column. Neither statement is enforced; both are published.

That is a compliance exposure, not merely a missing feature, and it is the strongest argument for either implementing retention or removing the control.

### 25.4 The fix, in order of preference

**Option A — implement the two jobs, and enforce the third.**
1. Add `/api/cron/purge-expired-data` to `vercel.json` (daily, after `compute-daily-scores`). Delete `DailyScore` / `HabitLog` rows older than `dataRetentionDays`.
2. Have the same job move days older than `autoArchiveCompletedDays` into an archive table — **or** drop the setting, since "archive" implies a data model that does not exist.
3. Enforce `retroactiveEditDays` in `HabitService.createLog`: reject a `date` earlier than `today − retroactiveEditDays` with a 422. This one is cheap and needs no new table.
4. Clamp the `<Select>` to the user's plan limit so the UI cannot contradict the policy.

**Option B — remove the card.** Delete the lifecycle `<Card>`, the `RETENTION_OPTIONS` import and the three constants file. Nothing breaks, because nothing read them. This is a one-commit fix that removes the compliance contradiction outright.

**Option C — mark it as coming soon.** Keep the selects but disable them with *"Retention controls are not active in this release."* Honest, but it keeps dead UI in the product.

I'd take **Option A step 3 immediately** (it is small, self-contained, and the helper text is currently a lie), **Option B for `dataRetentionDays`/`autoArchiveCompletedDays`** until the jobs exist, and reconcile the policy text either way. §24 F2, F3, F4.

---

## 26. Hardcoded light-mode classes

### 26.1 The count

| File | Hardcoded light classes |
| ---- | ----------------------- |
| `components/data/ExportData.tsx` | **11** |
| `components/data/ImportData.tsx` | **9** |
| `components/data/ImportPreview.tsx` | **12** |
| **Total on this page** | **32** |

### 26.2 Where they are, and what they look like in dark theme

`ExportData.tsx`:

| Line | Class | Element | Dark-theme result |
| ---- | ----- | ------- | ----------------- |
| `:106` | `text-lg font-bold text-gray-900` | **"Export Data"** `<h2>` | near-black on a dark card → **invisible** |
| `:108` | `text-sm text-gray-600` | description | very low contrast |
| `:114` | `text-sm font-medium text-gray-700` | "Format" label | low contrast |
| `:122` | `border-gray-300 bg-white` | `<select>` | white block, the brightest thing on the page |
| `:140` | `text-sm text-gray-500` | busy line | low contrast |
| `:149` | `bg-red-50 … text-red-700` | error alert | light-mode red block on a dark card |
| `:155`–`:158` | `border-green-200 bg-green-50/70` | success panel | light-mode green block |
| `:163`, `:165` | `text-green-600`, `text-green-800` | success glyph + heading | OK-ish (accent colours read on dark) |
| `:167` | `text-sm text-green-700` | size/expiry text | low contrast on the pale green panel |
| `:182` | `bg-blue-600 … focus:ring-blue-600` | download button | acceptable — a solid accent |

`ImportData.tsx`:

| Line | Class | Element |
| ---- | ----- | ------- |
| `:126` | `text-lg font-bold text-gray-900` | **"Import Data"** `<h2>` → invisible |
| `:128` | `text-sm text-gray-600` | description |
| `:135` | `border-gray-300 hover:border-blue-400 hover:bg-blue-50/40` | dropzone |
| `:140` | `text-sm font-medium text-gray-700` | "Click to select a JSON file" |
| `:142` | `text-xs text-gray-500` | ".json backup files are supported" |
| `:155` | `bg-red-50 … text-red-700` | error alert |
| `:179` | `text-xs text-gray-500` | the merge disclosure |
| `:207` | `bg-green-50 … text-green-700` | success banner |

⚠ Note the **page's own** markup is correct: `text-foreground`, `text-muted-foreground`, `text-primary`, `bg-destructive/10`, `text-emerald-600 dark:text-emerald-400`. The page was written with tokens; the two components it embeds were not. That is why the defect is invisible in code review of `page.tsx` — you have to open the children.

### 26.3 Why this class specifically

`AGENTS.md` records that the Achievements section had *"the UI blocks … not good in black theme and white theme"*, and the codebase contains a long trail of deliberate fixes for it:

- `AchievementBadge.tsx:73`–`:79` — locked tile switched from a hardcoded `#f3f4f6` to `var(--muted)`, with the comment *"a locked tile used to hardcode `#f3f4f6`, a near-white grey, so in dark mode every locked achievement rendered as a bright block"*
- `AchievementBadge.tsx:111`–`:116` — `text-gray-900` / `text-gray-500` swapped for `text-foreground`
- `AchievementPopup.tsx:186`–`:192` — *"This panel was hardcoded light … on a dark theme the achievement popup — the one moment the app deliberately interrupts the user — flashed a white card"*
- `constants/achievements.ts:110`–`:126` — `accentChipStyle` introduced because *"against a white card those fail WCAG AA — `#22c55e` is 2.3:1"*
- `recap/TrendCard.tsx:24`–`:29` — converted to `var(--color-card)` CSS properties

The pattern was recognised, the fix was documented in detail, and it was applied to `components/achievements/**` and `components/recap/**`. `components/data/**` was missed. And `/recap`'s own audit found the *same* class surviving in `AchievementList` and `ProgressBar` (`recap.md` F15) — so this is the third subtree where a token migration has been incomplete.

### 26.4 The fix

Every occurrence maps mechanically. The tokens already exist (`globals.css:28`–`:33`):

| Hardcoded | Token |
| --------- | ----- |
| `text-gray-900` | `text-foreground` |
| `text-gray-700`, `text-gray-600`, `text-gray-500` | `text-muted-foreground` |
| `bg-white` | `bg-card` |
| `border-gray-300`, `border-gray-400` | `border-border` |
| `bg-red-50 text-red-700`, `border-red-300` | `bg-destructive/10 text-destructive`, `border-destructive/30` |
| `bg-green-50/70 border-green-200 text-green-800`, `text-green-700` | `bg-success/10 border-success/30 text-success` |
| `focus:ring-blue-600` | `focus-visible:ring-ring` |

`Button`, `Badge`, `Card` and `Skeleton` — the components this page *does* use correctly — are already token-based, which is why the mix looks accidental rather than deliberate.

**One caveat worth stating.** `AGENTS.md` warns that `globals.css` must stay valid UTF-8 and that PowerShell read-modify-write mangles non-ASCII. This fix touches `.tsx` files only, not `globals.css` — provided the tokens above already exist, which they do. Verify `success` exists before using `bg-success/10`; if not, `emerald`/`primary` are the safe substitutions.

### 26.5 The blast radius

The same three components render on `/settings/export` and `/settings/import`, so one pass fixes **three pages**. `DeleteAccount.tsx` (107 lines, the fourth file in `components/data/`) should be checked at the same time.

§24 F5.

---

## 27. `ImportData` bypasses `apiRequest`

### 27.1 Two strategies, side by side

```ts
// ExportData.tsx — the sanctioned client          components/data/ExportData.tsx
import { apiRequest, ApiError } from '@/lib/api-client';                     // :14
…
const requested = await apiRequest<ExportRequestResult>('/api/export/request', {
  method: 'POST',
  body: { format },
});                                                                          // :76–79
const row = await apiRequest<ExportStatusRow>(`/api/export/status/${exportId}`);  // :46
…
catch (err) {
  setError(err instanceof ApiError ? err.message : 'Unable to request…');     // :96
}
```

```ts
// ImportData.tsx — hand-rolled                        components/data/ImportData.tsx
…
const response = await fetch('/api/import', {                                // :94
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(parsed),
});

if (!response.ok) {
  const body = (await response.json().catch(() => null)) as { error?: string } | null;
  throw new Error(body?.error ?? `Import failed (${response.status})`);       // :100–105
}

const result = (await response.json()) as { data?: { imported?: number; skipped?: number } };
setImportResult({
  imported: result.data?.imported ?? 0,
  skipped: result.data?.skipped ?? 0,
});                                                                            // :107–113
```

Four concrete consequences:

| # | Consequence |
| - | ----------- |
| 1 | **No `ApiError`.** `catch` uses `err instanceof Error` (`:115`), so a structured API error with a status code and field details is flattened to a bare message string. `ExportData` on the same page keeps the typed error. |
| 2 | **The `{ success, data }` envelope is unwrapped by hand** (`:107`–`:113`), so the `?? 0` defaults silently mask a malformed response. A server that returned `{ data: { imported: "5" } }` would set `imported: "5"` — a string in a number slot. |
| 3 | **No auth-failure handling.** `apiRequest` throws `ApiError` on any non-success envelope, which several pages special-case for 401. `ImportData` renders a 401 as a bare "Unauthorized" message in a red box with no route to `/login`. |
| 4 | **`headers` is hand-written** (`:96`) rather than derived, so it can drift from what `apiRequest` sends. |

### 27.2 Why it probably happened

`ImportData` needed to POST a body that is **already parsed JSON**, and the author reached for `fetch` rather than checking whether `apiRequest` accepts a pre-serialised body. It does — `apiRequest<T>(path, { method, body })` is used by `ExportData` with an object, and by every settings page that writes to a domain endpoint.

So this is a small inconsistency, not a design difference. The two components sit side by side in the same `space-y-6` stack on the same page, and they disagree about how to talk to the API.

### 27.3 The fix

```ts
// ImportData.tsx
import { apiRequest, ApiError } from '@/lib/api-client';
…
try {
  const result = await apiRequest<{ imported: number; skipped: number }>('/api/import', {
    method: 'POST',
    body: parsed,                       // apiRequest serialises; no JSON.stringify
  });
  setImportResult(result);              // no ?? 0 defaults
} catch (err) {
  setError(err instanceof ApiError ? err.message : 'Import failed');
}
```

One import, one call, and the two cards on this page behave identically.

**Note the security caveat.** `apiRequest` unwraps `.data` (per `achievements.md` §4.2) — so the fix must match what `POST /api/import` actually returns. It currently returns `{ success: true, data: { imported, skipped } }`, which is exactly the envelope `apiRequest` expects. Worth confirming against `import/route.ts` before changing it, since that route is not fully covered by this audit.

§24 F7 is the related content finding; this section covers the mechanism.

---

*End of `/settings/data` audit. 27 sections, 22 findings, 169-line host page plus 616 lines of component code and 282 lines of API routes. 5 critical findings: three inert settings (one contradicting the published privacy policy), hardcoded light-mode across 32 classes, and exports written to ephemeral serverless storage. Documentation only: no source file was modified.*