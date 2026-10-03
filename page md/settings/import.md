# `/settings/import` — Complete System Audit

**Route:** `http://localhost:3000/settings/import`
**Route file:** `src/app/(dashboard)/settings/import/page.tsx` (**79 physical lines**, `'use client'`)
**Project:** RoutineOS (`daily-plan`) — Next.js 16 (App Router) + Prisma 7 + PostgreSQL (Neon)
**Audit date:** 2026-09-30 · **Status:** documentation-only pass — no code was changed. Every claim is file-anchored.
**Note:** the page is a 61-line wrapper. The feature lives in `components/data/ImportData.tsx` (262 lines), `ImportPreview.tsx` (160) and a four-layer server stack. All are covered here; the client-component detail is cross-referenced from [`settings/data.md`](data.md).

> **Line-count convention:** **physical** line counts.

> ### Headline findings
>
> 1. 🔴 **The importer's client and server disagree about the payload shape.** `ImportData.VALID_COLLECTION_KEYS` accepts `journal`, `sleep`, `routine`, `categories`, `tags`, `focusSessions`, `wellness`, `reflections`, `settings`, `projects`, `tasks`. The server schema `importPayloadSchema` accepts only `habits`, `goals`, `projects`, `tasks`, `journalEntries`, `sleepLogs`, `records`, `source`, `version`. **`journal` ≠ `journalEntries`, `sleep` ≠ `sleepLogs`, `settings`/`routine`/`categories`/`tags`/`focusSessions`/`wellness`/`reflections` are not in the schema at all** — and because the schema is a plain `z.object`, they are silently stripped. A user whose backup uses the exporter's key names gets a `skipped: 0` and no error. §25.
> 2. 🔴 **The page's copy is stronger than the implementation.** `import/page.tsx:69` promises *"Every other collection in the file is reported as skipped with an honest count"* — but `ImportService.UNSUPPORTED_COLLECTIONS` counts only `projects`, `tasks`, `journalEntries`, `sleepLogs` (`import.service.ts:18`–`:23`). A `routine` collection of 40 blocks is accepted, previewed, uploaded, and **not counted anywhere**. §24 F2.
> 3. 🟠 **The import is not atomic and has no undo.** `ImportService.importUserData` awaits `importHabits` then `importGoals` sequentially (`import.service.ts:42`–`:43`), and neither is wrapped in a transaction that spans both. A failure in `importGoals` leaves the habits already written. The page promises *"never duplicated, never deleted"* (`:68`) — both true — but says nothing about partial application. §24 F6.
> 4. 🟡 **`ImportData` bypasses `apiRequest`** and hand-rolls `fetch`, so it loses `ApiError`, unwraps the envelope manually, and has no 401 handling — while `ExportData` in the same component folder uses `apiRequest` correctly. §27.

---

## Table of contents

| §   | Section                                                                                       |
| --- | --------------------------------------------------------------------------------------------- |
| 1   | [What `/settings/import` is, in one paragraph](#1-what-settingsimport-is-in-one-paragraph)     |
| 2   | [UI block diagram](#2-ui-block-diagram)                                                       |
| 3   | [UI → component mapping](#3-ui--component-mapping)                                            |
| 4   | [Frontend architecture](#4-frontend-architecture)                                             |
| 5   | [Backend / API architecture](#5-backend--api-architecture)                                    |
| 6   | [Database dependency](#6-database-dependency)                                                 |
| 7   | [The import contract](#7-the-import-contract)                                                 |
| 8   | [Complete user actions (serial)](#8-complete-user-actions-serial)                             |
| 9   | [What can the user create](#9-what-can-the-user-create)                                       |
| 10  | [What can the user edit](#10-what-can-the-user-edit)                                          |
| 11  | [What can the user delete](#11-what-can-the-user-delete)                                      |
| 12  | [Cross-page dependencies](#12-cross-page-dependencies)                                        |
| 13  | [Impact analysis](#13-impact-analysis)                                                        |
| 14  | [Current System Capabilities](#14-current-system-capabilities)                                |
| 15   | [Currently NOT Supported](#15-currently-not-supported)                                        |
| 16  | [Loading / Error / Empty / Edge states](#16-loading--error--empty--edge-states)               |
| 17  | [Authentication & security](#17-authentication--security)                                     |
| 18  | [Performance](#18-performance)                                                                |
| 19  | [External integrations](#19-external-integrations)                                            |
| 20  | [Background jobs / cron effects](#20-background-jobs--cron-effects)                           |
| 21  | [Data flow diagrams](#21-data-flow-diagrams)                                                  |
| 22  | [File-by-file dependency inventory](#22-file-by-file-dependency-inventory)                    |
| 23  | [Current behavior summary](#23-current-behavior-summary)                                      |
| 24  | [Findings register](#24-findings-register)                                                     |
| 25  | [The client/server key mismatch](#25-the-clientserver-key-mismatch)                           |
| 26  | [Route duplication](#26-route-duplication)                                                     |
| 27  | [`ImportData` bypasses `apiRequest`](#27-importdata-bypasses-apirequest)                       |

---

## 1. What `/settings/import` is, in one paragraph

`/settings/import` is a 79-line wrapper that renders the shared `<ImportData />` component and explains what it does. It has the same two early-return branches as its sibling `/settings/export` — an auth-loading `<Skeleton>` and a "Sign in required" card — then a page heading, the import card, and a second card titled **"What is imported?"** with three bullets: *"Habits and goals are merged into your account (never duplicated, never deleted)"*, *"Every other collection in the file is reported as skipped with an honest count"*, and *"Nothing is ever wiped — import is entity-merge, never data loss"*. The feature itself is a 262-line client component that reads a `.json` file **in the browser**, validates it against 13 recognised top-level keys, renders a preview, and — on an explicit click — POSTs the entire parsed object to `/api/import`, where a four-layer server stack validates it with a shared Zod schema and merges habits and goals via `ImportService`. The page holds **no state of its own**.

---

## 2. UI block diagram

```
/settings/import  (settings/import/page.tsx — 'use client', 79 lines)
│
├── if (isLoading)                                                  :20–29
│     <Skeleton class="h-8 w-40" /> + <Skeleton class="h-64 rounded-xl" />
│
├── if (!isAuthenticated)                                           :31–48
│     <Card><div class="p-8 text-center">
│       <ShieldCheck class="mx-auto h-12 w-12 text-muted-foreground" /> :36
│       <h1 class="mt-4 text-xl font-bold">Sign in required</h1>        :37
│       <a href="/login" class="… bg-primary …">Sign in</a>            :38–43
│          ⚠ raw <a>, not next/link ⇒ full page load
│          ⚠ unreachable: proxy.ts redirects first
│     </div></Card>
│
└── <main class="container mx-auto max-w-3xl px-4 py-8">           :51
    ├── <div class="mb-6">                                          :52–57
    │   ├── <h1 class="text-2xl font-bold">Import</h1>             :53
    │   └── <p class="mt-1 text-sm text-muted-foreground">
    │         "Restore your data from a JSON backup file."        :54–56
    │
    ├── ① <ImportData />                                           :59
    │   └── components/data/ImportData.tsx (262)
    │       <Card><div class="p-6">
    │         ├── <FileUp class="h-5 w-5 text-blue-600" />
    │         ├── <h2 class="text-lg font-bold text-gray-900">Import Data</h2>  🔴 §27-note
    │         ├── <p class="mt-1 text-sm text-gray-600">                         🔴
    │         ├── DROPZONE <label class="mt-5 flex cursor-pointer …
    │         │     flex-col items-center justify-center rounded-xl
    │         │     border-2 border-dashed px-6 py-10 text-center">
    │         │     error ? 'border-red-300 bg-red-50/50'
    │         │       : 'border-gray-300 hover:border-blue-400 hover:bg-blue-50/40'   🔴
    │         │     ├── <Upload class="h-8 w-8 text-gray-400" />
    │         │     ├── reading ? 'Reading file…' : fileName ?? 'Click to select a JSON file'
    │         │     ├── '.json backup files are supported'
    │         │     └── <input ref={inputRef} type="file"
    │         │            accept="application/json,.json"
    │         │            onChange={handleFileChange}
    │         │            disabled={reading} class="sr-only"
    │         │            aria-label="Choose a JSON backup file" />     ✅ a11y
    │         ├── {error} → <div role="alert" class="bg-red-50 …">       🔴
    │         └── {parsed} →                                            :160–215
    │               ├── <Badge variant="primary"><FileText/> {fileName}</Badge>
    │               ├── counts.map → <Badge variant="success">{name}: {n}</Badge>
    │               ├── <ImportPreview data={parsed} />          (160 lines, 12 🔴)
    │               ├── <Info/> "persists habits and goals as entity merges;
    │               │         any other collections … reported as skipped, never deleted"
    │               ├── <Button onClick={handleImport}>Import data</Button>
    │               └── {importResult} → "Imported N items (M skipped)"
    │
    └── ② <Card class="mt-6">                                       :61–76
        └── <div class="p-6">
            ├── <FileUp class="h-5 w-5 text-muted-foreground" />     ✅ token-aware
            ├── <h2 class="text-lg font-bold">What is imported?</h2>  :65
            ├── <ul class="mt-4 list-inside space-y-1 text-sm
            │        text-muted-foreground">                          :67–71
            │   ├── "• Habits and goals are merged into your account
            │   │     (never duplicated, never deleted)"
            │   ├── "• Every other collection in the file is reported as
            │   │     skipped with an honest count"      🔴 §24 F2 — only 4 keys are counted
            │   └── "• Nothing is ever wiped — import is entity-merge,
            │         never data loss"                   ✅ true
            └── <p class="mt-4 text-xs text-muted-foreground">       :72–74
                  "Use a backup exported from the Export page or
                   downloaded via /api/export/download."
```

**The page contributes 2 of the 5 DOM subtrees.** Everything else is `ImportData`.

---

## 3. UI → component mapping

| Import | From | Lines | Directive | Role |
| ------ | ---- | ----- | --------- | ---- |
| `FileUp, ShieldCheck` | `lucide-react` | — | — | card-2 glyph + sign-in glyph |
| `useAuth` | `@/hooks/useAuth` | — | `'use client'` | `isAuthenticated`, `isLoading` |
| `Card` | `@/components/ui/Card` | 26 | none | 2 instances |
| `Skeleton` | `@/components/ui/Skeleton` | — | none | the loading branch |
| `ImportData` | `@/components/data/ImportData` | **262** | `'use client'` `:1` | the entire feature |

**Five imports. Zero state. Zero effects.** Structurally identical to `/settings/export` (81 lines) except for the title, the subtitle, the component, and the second card's copy. §26.

### 3.1 What this page does not import

| Not imported | Consequence |
| ------------ | ----------- |
| `useSettings` / the store | Import does not touch `UserSettings` ✅ correct — it writes `Habit` and `Goal` |
| `apiRequest` / `fetch` | The page makes no request; `ImportData` does (via raw `fetch`) |

---

## 4. Frontend architecture

| Concern | Reality |
| ------- | ------- |
| Directive | `'use client'` — for `useAuth` only |
| State | **None** |
| Data fetching | None at the page level |
| `loading.tsx` / `error.tsx` | Neither exists; the page hand-rolls a `Skeleton` branch |
| `metadata` | None — inherits `privateMetadata`, so `noindex` |
| Early returns | Two, both before the main render |
| Auth branch reachability | ❌ `proxy.ts` redirects first — one of 20 duplicated copies of this gate |

### 4.1 `ImportData`'s state (the real page logic)

`ImportData.tsx:44`–`:54` — 7 pieces:

| State | Type | Purpose |
| ----- | ---- | ------- |
| `inputRef` | `useRef<HTMLInputElement \| null>` | reset to `''` in `finally` so re-picking the same file re-fires `onChange` ✅ |
| `fileName` | `string \| null` | the dropzone label and a badge |
| `parsed` | `unknown` | gates the whole preview block |
| `counts` | `ParsedCount[]` | one badge per collection key |
| `error` | `string \| null` | a `role="alert"` block |
| `reading` | `boolean` | disables the input, swaps the label |
| `importing` | `boolean` | spinner + disabled button |
| `importResult` | `{ imported, skipped } \| null` | the success banner |

### 4.2 The file is read entirely client-side

`ImportData.tsx:69` — `const text = await file.text()`. The file is **never uploaded** before confirmation; parsing, validation and previewing all happen in the tab. ✅ That is the right design: an invalid backup costs zero server round trips, and the user sees exactly what would be imported before anything is written.

⚠ The cost is memory — see §18.

---

## 5. Backend / API architecture

### 5.1 `POST /api/import` — `app/api/import/route.ts` (51 lines)

```ts
const body: unknown = await request.json().catch(() => null);        // :29  ✅ guarded
const validated = importPayloadSchema.safeParse(body);               // :30
if (!validated.success)
  return 400 { error: 'Invalid import payload', details: …flatten() } // :31–36
const result = await importService.importUserData(
  session.user.id, validated.data);                                  // :38–41
return { success: true, data: result };                              // :43
catch → 500 { error: 'Failed to import data', details: String(error) }  :44–49
```

| Property | Verdict |
| -------- | ------- |
| `auth()` → 401 | ✅ `:24`–`:27` |
| Body parse guarded | ✅ `:29` uses `.catch(() => null)` — **better** than `export/request/route.ts:33`, which does not |
| Whole-body Zod validation before persistence | ✅ `:30`, and the docstring says *"never persists unvalidated data"* (`:15`) |
| Flattened details on 400 | ✅ `:33` |
| Delegates to a service | ✅ `:38` — no Prisma in the route, which `import.service.ts:10`–`:14` records as a deliberate fix |
| Standard `{ success, data }` envelope | ✅ `:43` |
| **500 leaks `String(error)`** | 🟡 `:47` — an internal message reaches the client |

The route docstring is accurate and unusually good: it states the four guarantees (auth, validate, delegate, envelope) and the "entity-merge, never wipe" contract (`:20`).

### 5.2 `importPayloadSchema` — `src/lib/validation/import.schema.ts` (121 lines)

```ts
export const importPayloadSchema = z.object({                       // :94
  source: z.enum(['ROUTINEOS','NOTION','TODOIST','TRELLO',
                  'GOOGLE_CALENDAR','APPLE_HEALTH','GOOGLE_FIT','CUSTOM'])
         .optional(),                                                // :95–97
  version: z.number().int().min(1).optional().default(1),            // :98
  habits:         z.array(importHabitSchema).optional(),             // :99
  goals:          z.array(importGoalSchema).optional(),              // :100
  projects:       z.array(importProjectSchema).optional(),           // :101
  tasks:          z.array(importTaskSchema).optional(),              // :102
  journalEntries: z.array(importJournalSchema).optional(),           // :103
  sleepLogs:      z.array(importSleepSchema).optional(),             // :104
  records:        z.array(importedRecord).optional(),                // :105
});                                                                  // :106
```

**Nine keys. Eight of them are collections.** The schema is a plain `z.object`, so any other key in the payload is **silently stripped** rather than rejected — which is precisely why the mismatch in §25 is invisible at runtime.

Per-collection item schemas are **derived from the create schemas** rather than restated:

```ts
export const importHabitSchema = z.object({
  name:     createHabitSchema.shape.name,          // :8
  tier:     createHabitSchema.shape.tier,          // :10
  frequencyType: createHabitSchema.shape.frequencyType,   // :14
  points:   createHabitSchema.shape.points,        // :20
  …
});
```

✅ That is a genuinely good pattern — a change to `createHabitSchema` propagates to the importer automatically, so an import can never accept a field the create form rejects. Six schemas are composed this way (`:8`, `:27`, `:41`, `:53`, `:65`, `:75`), plus a `importedRecord` union of all six (`:85`–`:92`).

⚠ One asymmetry: `importHabitSchema` adds `category: z.string().max(100)` (`:11`) and `tags` (`:24`) which `createHabitSchema` may not have, while `importGoalSchema` requires `startDate` **and** `endDate` (`:35`–`:36`) — so a goal in a backup missing `endDate` fails the whole payload with a 400. §24 F5.

### 5.3 `ImportService` — `src/server/services/import.service.ts` (54 lines)

```ts
const UNSUPPORTED_COLLECTIONS = [
  'projects', 'tasks', 'journalEntries', 'sleepLogs',
] as const;                                                        // :18–23

async importUserData(userId, payload) {
  let imported = 0;
  imported += await importHabits(userId, payload.habits ?? [], prisma);   // :42
  imported += await importGoals(userId, payload.goals ?? [], prisma);    // :43

  const skipped = UNSUPPORTED_COLLECTIONS.reduce((total, key) => {
    const entries = payload[key];
    return total + (Array.isArray(entries) ? entries.length : 0);
  }, 0);                                                              // :45–48

  return { imported, skipped };
}
```

| Property | Verdict |
| -------- | ------- |
| The service owns the Prisma handle | ✅ `:1` — the docstring at `:10`–`:14` records that the route used to import the singleton itself, which "put database access in the route layer" |
| Counts are derived from the payload, never fabricated | ✅ `:46`–`:47` — the docstring at `:34`–`:36` says so explicitly |
| Nothing is deleted | ✅ — only `importHabits` and `importGoals` are called, both merges |
| **`records` is never counted** | 🟠 `:105` of the schema accepts it; the service ignores it entirely, so a `records`-style payload imports 0 and skips 0 |
| 🔴 **Only 4 keys are counted as skipped** | `journalEntries`, `sleepLogs`, `projects`, `tasks`. Everything else the client accepts — `routine`, `categories`, `tags`, `focusSessions`, `wellness`, `reflections`, `settings` — is neither imported nor counted. §24 F2 |
| **Sequential, not parallel** | 🟡 `:42`–`:43` — two independent collections awaited one after the other; `Promise.all` would halve the latency |
| **Not atomic** | 🟠 if `importGoals` throws, the habits already written stay written. No `$transaction`. §24 F6 |

### 5.4 `server/data/importer.ts` (154 lines) and `exporter.ts` (259 lines)

`importHabits(userId, habits, prisma)` and `importGoals(userId, goals, prisma)` take the client explicitly, so the importer is reusable outside a request ✅. `exportUserData` produces the payload. `server/data/preview.ts` (7 lines) and `validator.ts` (8 lines) exist but are **not imported by the import path** — `ImportService` calls `importer.ts` directly. §24 F9.

---

## 6. Database dependency

| Model | Via | Purpose |
| ----- | --- | -------- |
| `Habit` (+ children) | `server/data/importer.ts` `importHabits` | merged |
| `Goal` (+ children) | `server/data/importer.ts` `importGoals` | merged |
| `prisma` singleton | `import.service.ts:1` | passed into the importer |

**Two models written. Nothing deleted. Nothing read for validation beyond the two arrays.** That is a deliberately small blast radius, and it is the strongest thing about this feature.

⚠ `import.service.ts:1` imports `prisma` from `@/lib/prisma`, which `AGENTS.md` warns **throws at import time without `DATABASE_URL`**. So any test that reaches `ImportService` needs either a database or a module mock — the same constraint it records for service-level tests elsewhere. §24 F11.

---

## 7. The import contract

### 7.1 What the three layers each promise

| Layer | Claim | Source |
| ----- | ----- | ------ |
| Page copy | "Habits and goals are merged (never duplicated, never deleted)" | `import/page.tsx:68` |
| Page copy | "Every other collection … is reported as skipped with an honest count" | `import/page.tsx:69` |
| Page copy | "Nothing is ever wiped — import is entity-merge, never data loss" | `import/page.tsx:70` |
| Component copy | "persists habits and goals as entity merges; any other collections … reported as skipped, never deleted" | `ImportData.tsx:181`–`:183` |
| Route docstring | "Import is entity-merge, never wipe: nothing is ever deleted." | `import/route.ts:20` |
| Service | `UNSUPPORTED_COLLECTIONS = [projects, tasks, journalEntries, sleepLogs]` | `import.service.ts:18`–`:23` |

**Claims 1, 3, 4, 5 and 6 agree and are true.** Claim 2 — the "honest count" for *every* other collection — is **false** for any collection outside the four in `UNSUPPORTED_COLLECTIONS`. §24 F2.

### 7.2 The key-name mismatch

```
  ImportData.VALID_COLLECTION_KEYS  (ImportData.tsx:22–36) — 13 keys the UI will
  treat as a recognised collection and badge as "name: n"

    habits  goals  tasks  projects  categories  tags  routine
    focusSessions  journal  sleep  wellness  reflections  settings

                          ┌──────────────────────────────────────────┐
                          │  importPayloadSchema  (import.schema.ts  │
                          │  :99–105) — 8 collection keys            │
                          │                                          │
                          │  habits  goals  projects  tasks          │
                          │  journalEntries  sleepLogs  records      │
                          └──────────────────────────────────────────┘

    ✅ habits      ✅ goals      ✅ tasks      ✅ projects
    ❌ journal      → schema wants "journalEntries"   ← NAME MISMATCH
    ❌ sleep        → schema wants "sleepLogs"        ← NAME MISMATCH
    ❌ routine      → not in the schema at all        ← SILENTLY STRIPPED
    ❌ categories   → not in the schema at all        ← SILENTLY STRIPPED
    ❌ tags         → not in the schema at all        ← SILENTLY STRIPPED
    ❌ focusSessions→ not in the schema at all        ← SILENTLY STRIPPED
    ❌ wellness     → not in the schema at all        ← SILENTLY STRIPPED
    ❌ reflections  → not in the schema at all        ← SILENTLY STRIPPED
    ❌ settings     → not in the schema at all        ← SILENTLY STRIPPED
```

`z.object` strips unknown keys rather than rejecting, so a payload with `routine` and `settings` arrives at the service as an object containing only `version` (defaulted to `1`), and the import reports `imported: 0, skipped: 0` — with the UI having shown `routine: 40` and `settings: 1` as recognised badges moments earlier. §25.

---

## 8. Complete user actions (serial)

### 8.1 Choose a file

```
click the dropzone <label>                          ImportData.tsx:132
  └─ <input type="file" accept="application/json,.json"
         onChange={handleFileChange} disabled={reading} class="sr-only">   :143–151

handleFileChange(event)                                                  :56
  file = event.target.files?.[0];  if (!file) return                      :60–61
  setReading(true); clear error/parsed/counts; setFileName(file.name)     :62–66
  try
    text = await file.text()                                             :69   ◄── CLIENT-SIDE
    json = JSON.parse(text)                                              :70
    validation = validateImport(json)                                    :71 → :221
      ├─ Array.isArray(json) → { error:null, counts:[{entities, n}] }    :222–227
      ├─ typeof !== 'object' || null → "must be a JSON object or array"  :229–234
      ├─ entries.length === 0 → "The file is empty."                     :237–239
      └─ per entry:
           items = Array.isArray(value) ? value
                    : (value === null || typeof value !== 'object') ? []
                    : [value]                                           :245
           if (items.length === 0) continue                              :246
           name = VALID_COLLECTION_KEYS.has(key) ? key : `${key}*`       :247
           counts.push({ name, count: items.length }); recognized++       :248–249
      recognized === 0 → "No recognizable entity collections found…"     :252–257
    if (validation.error) → setError; return                             :72–75
    setParsed(json); setCounts(validation.counts)                         :76–77
  catch → "The selected file is not valid JSON…"                         :78–79
  finally → setReading(false); inputRef.current.value = ''               :81–83  ✅ re-pick works
```

`validateImport` is a **pure function with no imports** — trivially testable, and untested. §24 F12.

### 8.2 Preview

`{Boolean(parsed) && …}` (`:160`) renders the file-name badge, one `variant="success"` badge per recognised key, and `<ImportPreview data={parsed} />` (`:175`) — which receives the already-parsed object, so it does not re-parse ✅.

### 8.3 Import

```
click "Import data"                                                    :185
  └─ handleImport()                                                      :86
       if (!parsed) return                                               :87
       setImporting(true); clear error/result                            :88–91
       POST /api/import      ◄── RAW fetch, NOT apiRequest                :94–98   §27
         headers: { 'Content-Type': 'application/json' }
         body: JSON.stringify(parsed)      ◄── the ENTIRE file, re-serialised
       !response.ok → parse { error } → throw Error(body.error ?? `Import failed (${status})`)  :100–105
       result = await response.json() as { data?: { imported?, skipped? } }                        :107
       setImportResult({ imported: result.data?.imported ?? 0,
                        skipped:  result.data?.skipped  ?? 0 })       :110–113
       catch → setError(err.message)                                      :114–115
       finally → setImporting(false)                                       :117
```

⚠ **After a successful import the page does not reload.** The user is shown *"Imported N items"* and stays on the page — but any list elsewhere in the app (`/habits`, `/goals`) still shows the pre-import state until a manual reload. §24 F7.

⚠ `imported` and `skipped` are read with `?? 0` from a cast type (`:107`–`:113`), so a malformed response silently reports `0`. Using `apiRequest` removes the cast (§27).

---

## 9. What can the user create

| Thing | Mechanism | Persisted |
| ----- | --------- | --------- |
| `Habit` rows | `importHabits(userId, payload.habits, prisma)` — `import.service.ts:42` | ✅ merged |
| `Goal` rows | `importGoals(userId, payload.goals, prisma)` — `:43` | ✅ merged |

Nothing else. The component's 13 accepted keys and the server's 8 are reconciled down to **two**.

## 10. What can the user edit

**Not deliberately** — but a merge is an update. The page promises *"never duplicated"* (`:68`), so a habit already present is updated rather than re-created. What that means for a user's existing data — whether `points`/`tier`/`frequency` are overwritten from the file — is **not disclosed** on this page, in `ImportData`, or in `ImportPreview`. The preview shows *counts*, not a field-level diff. §24 F8.

That is the single most important missing disclosure on the page: a user restoring an old backup may silently overwrite newer edits to a habit they have since retuned.

## 11. What can the user delete

**Nothing.** ✅ And this is the feature's strongest property, stated three times across the page, the component and the route, and honoured in code — `import.service.ts` calls only the two import functions, and there is no `deleteMany` anywhere in `server/data/importer.ts`.

The only deletion path in the settings tree is `/settings/danger-zone`, via `DeleteAccount.tsx` (107 lines) and `POST /api/auth/delete-account`.

---

## 12. Cross-page dependencies

### 12.1 Inbound — who renders `ImportData`

| Route | Line |
| ----- | ---- |
| **`/settings/import`** | `:59` |
| **`/settings/data`** | `:91` |

Plus the hub lists both (`settings/page.tsx:82`), and the page's own copy points at `/settings/export` (`:73`), so **four** routes form one feature cluster. §26.

### 12.2 Outbound

| Dependency | Kind |
| ---------- | ---- |
| `useAuth` | read |
| `POST /api/import` | write — the entire parsed file |
| `components/data/ImportPreview` | render |

### 12.3 Cross-links between the settings data routes

```
  /settings/import  :73 ──► "Use a backup exported from the Export page
                             or downloaded via /api/export/download."
                              │
                              ▼
                        /settings/export   (81 lines)
                              │
                              ▼
                        <ExportData/> → POST /api/export/request
                              │
                              ▼
                        BackupService.createExport
                              │
                              ▼
                        exportUserData()  ←── what keys does it emit?
                              │
                              ▼
                        ??? the file the user then feeds to /settings/import
```

🔴 **This is where F1 bites.** If `exportUserData` emits `journal` and the importer's schema wants `journalEntries`, then the documented round-trip — export here, import there — is **broken for every collection except habits and goals**, and the page's own instruction at `:73` sends the user straight into it. §25.

---

## 13. Impact analysis

**If `/settings/import` were deleted:** import remains reachable at `/settings/data`, which renders the same component. Only the "What is imported?" card is lost. Nothing else in the app imports data.

**If the key mismatch were fixed** (align `VALID_COLLECTION_KEYS` with the schema, or make the schema accept the exporter's names): backups would round-trip correctly, and the "honest count" promise becomes true. This is the single highest-value fix on this page.

**If `records` were handled** or removed from the schema: the payload shape stops advertising a collection the service ignores.

**If the page reloaded after a successful import:** the user would see their newly-imported habits on `/habits` without a manual refresh — the difference between "it worked" and "did it work?".

**If a field-level preview were added:** the "never duplicated" claim would be verifiable, and a user could see which of their habits would be overwritten before committing.

**Blast radius of the non-atomic import:** a user with 200 habits and 50 goals who hits an error at goal 47 has 200 habits merged and 47 goals merged and 3 missing, with a 500 on screen and no way to tell what landed except re-running. Re-running is safe for merges (idempotent by construction, given "never duplicated") which mitigates it — but the UI does not say so. §24 F6.

---

## 14. Current System Capabilities

| Capability | Evidence |
| ---------- | -------- |
| File read and validated **entirely in the browser** before any upload | `ImportData.tsx:69`–`:71` ✅ |
| A scalar JSON file is rejected with a specific message | `:229`–`:234` ✅ |
| An empty object is rejected | `:237`–`:239` ✅ |
| Unknown keys are shown as `name*` rather than hidden | `:247` ✅ |
| A file with no recognised collections is rejected | `:252`–`:257` ✅ |
| Re-picking the same file re-fires `onChange` | `inputRef.value = ''` in `finally`, `:82` ✅ |
| A count badge per recognised collection, with `toLocaleString()` | `:167`–`:171` ✅ |
| `sr-only` file input with an explicit `aria-label` | `:149`–`:150` ✅ |
| `role="alert"` on every error block | `:155` ✅ |
| The merge-vs-skip contract is disclosed **before** the user confirms | `ImportData.tsx:179`–`:184` |
| Whole-body Zod validation before any persistence | `import/route.ts:30`, docstring `:15` ✅ |
| Body parse is `.catch(() => null)`-guarded | `import/route.ts:29` ✅ (better than the export route) |
| Per-item schemas **derived from the create schemas** | `import.schema.ts:8`, `:27`, `:41`, `:53`, `:65`, `:75` ✅ |
| Service owns the Prisma handle; the route has no DB access | `import.service.ts:10`–`:14` ✅ `FILE.MD`-compliant |
| Importer takes an explicit client, so it is reusable outside a request | `importer.ts` signature ✅ |
| Skipped counts are derived from the payload, never fabricated | `import.service.ts:45`–`:48`, docstring `:34`–`:36` ✅ |
| **Nothing is ever deleted** | only two merge functions are called ✅ — stated three times and honoured |
| The route docstring states its four guarantees accurately | `import/route.ts:12`–`:21` ✅ |
| Standard `{ success, data }` envelope | `import/route.ts:43` |

---

## 15. Currently NOT Supported

| Not supported | Note |
| ------------- | ----- |
| 🔴 **A working export → import round trip beyond habits and goals** | The exporter's key names and the importer's schema disagree — §25 |
| 🔴 **An accurate skipped count** | Only 4 of the client's 13 keys are counted; the rest are neither imported nor counted — §24 F2 |
| `records` payload support | In the schema (`import.schema.ts:105`), never read by the service — §24 F3 |
| A dry run | `importQuerySchema` has `mode`/`overwrite`/`dryRun` (`import.schema.ts:108`–`:112`) — 🔴 **never imported by anything** and there is no route reading query params at all |
| A field-level preview / diff | The preview shows counts, not what will change — §24 F8 |
| Undo | No. A merge is forward-only |
| Partial-import recovery | Non-atomic, and the UI does not say so — §24 F6 |
| Importing `categories`, `tags`, `routine`, `focusSessions`, `wellness`, `reflections`, `settings` | Accepted by the UI, stripped by the schema — §25 |
| A file-size guard | `file.text()` → `JSON.parse` → `JSON.stringify` with no threshold — §24 F4 |
| Import progress | A single `importing` boolean |
| A reload after import | The user must refresh manually to see the result elsewhere — §24 F7 |
| A cancel | None |
| Parallel collection import | `import.service.ts:42`–`:43` awaits sequentially — §24 F10 |
| PDF / Markdown import | The export produces them; the importer is JSON-only |
| **Dark theme** | 9 classes in `ImportData` + 12 in `ImportPreview` |
| Tests | None cover `validateImport`, `importer.ts`, `import.service.ts` or `import.schema.ts` |

---

## 16. Loading / Error / Empty / Edge states

### 16.1 The page's own two branches

| State | Trigger | Render |
| ----- | ------- | ------ |
| Auth loading | `isLoading` | `Skeleton h-8 w-40` + `Skeleton h-64` (`:20`–`:29`) — token-based ✅ |
| Signed out | `!isAuthenticated` | `Card` + `ShieldCheck` + `<a href="/login">` (`:31`–`:48`) — 🔴 raw `<a>`; 🔴 unreachable behind `proxy.ts` |

### 16.2 `ImportData`'s states

| State | Trigger | Render |
| ----- | ------- | ------ |
| no file | initial | dropzone "Click to select a JSON file" |
| reading | `:62` | "Reading file…", input disabled |
| validation error | `:73` | `role="alert"`; dropzone turns `border-red-300 bg-red-50/50` |
| parse error | `:79` | `role="alert"` "not valid JSON" |
| previewed | `:76` | badges + preview + disclosure + Import button |
| importing | `:89` | `Loader2 animate-spin` + "Importing…" + button `title="Importing…"` |
| imported | `:110` | green banner "Imported N items (M skipped)" |

### 16.3 Edge cases

| Edge | Behaviour |
| ---- | --------- |
| Non-JSON file | "The selected file is not valid JSON. Choose a backup file exported by RoutineOS." ✅ |
| JSON scalar (`"x"`, `42`, `null`) | "The file must be a JSON object or array. Found a scalar value instead." ✅ |
| `{}` | "The file is empty. Nothing to import." ✅ |
| Top-level array | Accepted, one badge `entities: n` ✅ |
| Unknown keys | Shown as `name*` — visible, not hidden ✅ |
| Nested object instead of an array | Coerced to a 1-element array → counted as 1 ✅ `:245` |
| Key with an empty array | `continue` — not counted, not shown ✅ `:246` |
| Re-picking the same file | Works ✅ `:82` |
| 🔴 **Key name mismatch** | Silently stripped by Zod; `imported: 0, skipped: 0`, no error — §25 |
| 🔴 **Huge file** | Three full copies in the tab; no guard — §24 F4 |
| 500 from the server | `err.message` in a red box; `details: String(error)` is **not** shown — §24 F13 |
| 400 with `details` | The flattened Zod detail is discarded; the user sees only the message — §24 F13 |
| Import succeeds | Banner shown; **the page does not reload** — §24 F7 |
| Import partially applied | A 500 with no indication of what landed — §24 F6 |
| Long filename | `<Badge>` with no clamp; the row is `flex-wrap` so it wraps ✅ acceptable |
| 500 collection keys | 500 badges, no cap — §24 F14 |

---

## 17. Authentication & security

### 17.1 The endpoint

| Property | Verdict |
| -------- | ------- |
| `auth()` → 401 | ✅ `import/route.ts:24`–`:27` |
| Client-supplied `userId` | ❌ not accepted — `session.user.id` only ✅ |
| Whole-body Zod validation before persistence | ✅ `:30`; docstring *"never persists unvalidated data"* `:15` |
| Standard response envelope | ✅ `:43` |
| DB access in the route | ❌ none — delegated to `ImportService` ✅ `FILE.MD`-compliant |

### 17.2 What the endpoint accepts

This is the security-relevant surface, because the importer writes rows from **user-supplied JSON**:

| Vector | Status |
| ------ | ------ |
| **Mass assignment** | ✅ Contained. Every item is validated by a Zod schema derived from the corresponding `create*Schema` (`import.schema.ts:8`–`:39`), and `z.object` strips unknown keys. A payload containing `{ "isAdmin": true }` is dropped. |
| **Cross-tenant writes** | ✅ `userId` comes from the session, never the payload. `importHabits(userId, …)` and `importGoals(userId, …)` both take it as the first argument. |
| **SQL / NoSQL injection** | ✅ No raw query — Prisma parameterised throughout `importer.ts`. |
| **`endDate` required on goals** | ✅ `:36` — a goal without it fails validation rather than being written malformed. |
| **String lengths** | ✅ `.max(100)` on tags/category, `.max(200)` on journal title, `.max(2000)` on sleep notes, `.max(100)` on habit category. |
| **Enums** | ✅ `goal.status` is a closed 6-member enum (`:37`); `source` an 8-member enum (`:96`); `mood`/`energy`/`quality` clamped 1–5 (`:71`–`:82`). |
| **Unbounded arrays** | 🟡 `habits`, `goals`, `projects`, `tasks`, `journalEntries`, `sleepLogs` and `records` have **no `.max()`** — a payload of a million habits is schema-valid. The `free` plan caps habits at 20 (`config/app.ts:22`) but nothing enforces it on import. §24 F9 |
| **Unbounded body** | 🟡 No `Content-Length` check before `request.json()`. Vercel caps the request body (4.5 MB on the Hobby plan) so this is mitigated by the platform, not by the app. |
| **Error leakage** | 🟡 `details: String(error)` on the 500 (`:47`) can expose an internal message. |
| **Rate limiting** | ❌ none. Each call can write an unbounded number of rows. |

### 17.3 The mass-assignment defence depends on schema derivation

The reason this is safe is `importHabitSchema.name = createHabitSchema.shape.name` (`:8`) rather than a restated string. If someone later hand-writes `name: z.string()` to "decouple" it, the importer would accept a shape the create form rejects — and the two would drift silently. The current pattern is right; it deserves a comment saying why. This is the positive counterpart to `/settings/data`'s `data-lifecycle.ts`, where the same care *is* documented (`data-lifecycle.ts:5`–`:8` pins the schema bounds).

### 17.4 The honest disclosure

The page's three bullets (`import/page.tsx:68`–`:70`) are accurate and unusually well-judged: the user is told **before** confirming that this is a merge, that other collections are skipped, and that nothing is deleted. That is the correct disclosure for a destructive-adjacent operation, and it is repeated in the component (`:179`–`:184`) so the user sees it at the point of action, not only in a separate card. ✅

What is *not* disclosed: whether a matching habit is **updated** or skipped, and whether the file's values win over the user's current ones. §24 F8.

---

## 18. Performance

### 18.1 This page's cost

| Metric | Value |
| ------ | ----- |
| Requests on mount | **0** |
| Component lines rendered | 262 (`ImportData`) + 160 (`ImportPreview`) = **422** |
| Page state | none |
| Client state | 7 `useState` + 1 `useRef` |

### 18.2 The client-side memory cost

```
file (say 40 MB of JSON)
  └─ await file.text()          → a ~40 MB JS string          :69
  └─ JSON.parse(text)           → an object graph, plausibly 120–250 MB   :70
  └─ JSON.stringify(parsed)     → another ~40 MB string        :97
       all three alive simultaneously in the browser tab

then: fetch() → the browser serialises and buffers again for the request
```

There is **no `file.size` guard**, and `accept="application/json,.json"` (`:146`) is an advisory hint — the browser does not enforce it, so a user can drag any file in. A user who selects the export they just downloaded, on a multi-year account, risks a tab OOM before the request is ever sent. §24 F4.

### 18.3 The server-side cost

```
POST /api/import
  ├─ request.json()                     the whole body, buffered + parsed
  ├─ importPayloadSchema.safeParse      a full structural walk
  ├─ importHabits(userId, habits, prisma)     awaited
  ├─ importGoals(userId, goals, prisma)       awaited   ◄── sequential, not parallel
  └─ reduce over 4 keys
```

Two observations:

1. **`importHabits` and `importGoals` are awaited sequentially** (`import.service.ts:42`–`:43`) despite being independent. `Promise.all` would overlap them. §24 F10.
2. **Neither is wrapped in a transaction spanning both**, so a throw in `importGoals` leaves the habits written. For a merge operation that is idempotent by construction — re-running is safe — so the practical risk is lower than it first appears, but the UI gives no signal about what landed. §24 F6.

### 18.4 What is efficient

- **Zero requests on mount** — the import component fetches nothing until a file is chosen.
- **The file is parsed client-side first**, so an invalid backup costs no server round trip ✅ — the right trade.
- `ImportPreview` receives the already-parsed object rather than re-parsing ✅ (`:175`).
- `validateImport` is a single pass over the top-level entries (`:244`–`:250`) — O(keys), not O(rows).
- The skipped count is a 4-element `reduce` over arrays already in memory (`:45`–`:48`) — no extra query.

---

## 19. External integrations

| Integration | Present? | Detail |
| ----------- | -------- | ------ |
| **Neon / Postgres** | ✅ | `Habit`, `Goal` + their children, via the Prisma singleton in `ImportService` |
| **File system** | ❌ | none — the file never leaves the browser until the POST |
| **Third-party APIs** | ❌ | none. Despite `source` accepting `NOTION`, `TODOIST`, `TRELLO`, `GOOGLE_CALENDAR`, `APPLE_HEALTH` and `GOOGLE_FIT` (`import.schema.ts:96`), there is **no connector for any of them** — the enum advertises integrations that do not exist. §24 F15 |
| **Object storage** | ❌ | n/a |
| **Queue** | ❌ | the import runs synchronously on the request path |

⚠ The `source` enum is the one place where this page advertises a capability it does not have. A user hand-authoring a Todoist export with `source: "TODOIST"` will get exactly the same treatment as a RoutineOS backup — and the client will badge `source` as `source*` (unrecognised, since it is a string not an array, so `items = []` and it is skipped entirely at `:246`). The six third-party names are pure fiction at present.

---

## 20. Background jobs / cron effects

**None.** Import is entirely synchronous and user-initiated.

| Cron (`vercel.json`) | Relevance |
| -------------------- | --------- |
| `/api/cron/compute-daily-scores` | Indirect. Imported habits and goals become eligible for scoring on subsequent days, so an import changes future `DailyScore` rows — not existing ones. |
| `/api/cron/generate-insights` | None — a stub |

There is no job that depends on import state, and none that import depends on. This is the one settings feature that is cleanly self-contained.

---

## 21. Data flow diagrams

### 21.1 End to end

```
  /settings/import  (79 lines — auth gate + heading + 2 cards)
        │
        │  click the dropzone
        ▼
  ImportData.handleFileChange()                            ImportData.tsx:56
        │  read + parse + validate — ALL CLIENT-SIDE, zero network
        │  ├─ file.text()                                     :69
        │  ├─ JSON.parse(text)                                :70
        │  └─ validateImport(json)                            :71 → :221
        │       VALID_COLLECTION_KEYS (13) :22–36
        │       unknown key → `${key}*`         :247
        │
        ▼
  preview: count badges + <ImportPreview data={parsed}/>    :167–176
        │
        │  click "Import data"     ◄── the ONLY write action
        ▼
  handleImport()                                              :86
        │  POST /api/import   (raw fetch)                      :94
        │  body: JSON.stringify(parsed)
        ▼
  api/import/route.ts
        │  auth() → userId                                      :24
        │  request.json().catch(() => null)                     :29   ✅ guarded
        │  importPayloadSchema.safeParse(body)                   :30
        │     z.object STRIPS anything not in the 9 keys         ◄── §25
        │  importService.importUserData(userId, validated.data)  :38
        ▼
  ImportService.importUserData                        import.service.ts:37
        │  imported += await importHabits(userId, payload.habits ?? [], prisma)   :42
        │  imported += await importGoals (userId, payload.goals  ?? [], prisma)   :43
        │     ⚠ sequential, not parallel; ⚠ no transaction spanning both
        │  skipped  = reduce over ['projects','tasks',
        │                          'journalEntries','sleepLogs']                 :45–48
        │     ⚠ only 4 keys — routine/settings/categories/tags/… counted nowhere
        ▼
  ◄── { success: true, data: { imported, skipped } }      route.ts:43
        │
        ▼
  setImportResult(...)  :110–113
        │
        └─ 🔴 no router.refresh(), no reload — the rest of the app still
           shows the pre-import state until the user refreshes.     §24 F7
```

### 21.2 The mismatch, drawn

```
  the file the user selects
  ┌────────────────────────────────────────────────┐
  │ { "habits": [...], "goals": [...],             │  ← works
  │   "routine": [...], "categories": [...],       │  ← stripped
  │   "tags": [...], "settings": {...},            │  ← stripped
  │   "journal": [...],  "sleep": [...],           │  ← stripped (WRONG NAME)
  │   "focusSessions": [...], "wellness": [...] }  │  ← stripped
  └────────────────────────────────────────────────┘
                      │  POST
                      ▼
  importPayloadSchema.safeParse()
  ┌────────────────────────────────────────────────┐
  │ { habits, goals,                                │  ← survives
  │   version: 1 }                                 │  ← defaulted
  └────────────────────────────────────────────────┘   the other 7 keys are
                      │                              dropped by z.object,
                      ▼                              not rejected
  ImportService
  ┌────────────────────────────────────────────────┐
  │ imported = habits.length + goals.length         │
  │ skipped  = 0    ◄── routine/categories/tags/    │
  │                   journal/sleep/settings were   │
  │                   never in UNSUPPORTED_COLLECTIONS
  └────────────────────────────────────────────────┘
                      │
                      ▼
  the UI just showed:  routine: 40   categories: 12
                        tags: 8   settings: 1
  …and reports:  "Imported 12 items (0 skipped)"
```

### 21.3 Route duplication

```
  hub: settings/page.tsx
    :80  Data    ──► /settings/data    ──► <ExportData/> + <ImportData/> + lifecycle
    :81  Export  ──► /settings/export  ──► <ExportData/>               + "What is included?"
    :82  Import  ──► /settings/import  ──► <ImportData/>               + "What is imported?"

  ⇒ 3 hub cards, 2 components, 3 routes
  ⇒ /settings/data is a strict superset of the other two
  ⇒ the two explanatory cards exist only on the wrappers
  ⇒ a user who clicks "Data" gets no explanation of what import will do
                                                        §26, §24 F14
```

---

## 22. File-by-file dependency inventory

### 22.1 The route

| File | Lines | Directive | Role |
| ---- | ----- | --------- | ---- |
| `src/app/(dashboard)/settings/import/page.tsx` | **79** | `'use client'` | auth gate + heading + `<ImportData />` + "What is imported?" card |

### 22.2 Components

| File | Lines | Directive | Role |
| ---- | ----- | --------- | ---- |
| `src/components/data/ImportData.tsx` | **262** | `:1` | pick, validate, preview, POST |
| `src/components/data/ImportPreview.tsx` | 160 | — | renders the parsed object |

### 22.3 API

| File | Lines | Method | Notes |
| ---- | ----- | ------ | ----- |
| `src/app/api/import/route.ts` | 51 | POST | auth, zod, delegate |

### 22.4 Server

| File | Lines | Role |
| ---- | ----- | ---- |
| `src/server/services/import.service.ts` | 54 | owns the Prisma handle; `UNSUPPORTED_COLLECTIONS` |
| `src/server/data/importer.ts` | 154 | `importHabits`, `importGoals` — take the client explicitly |
| `src/server/data/exporter.ts` | 259 | `exportUserData` — produces the counterpart payload |
| `src/server/data/preview.ts` | 7 | ⚠ not in the import path |
| `src/server/data/validator.ts` | 8 | ⚠ not in the import path |

### 22.5 Validation

| File | Lines | Role |
| ---- | ----- | ---- |
| `src/lib/validation/import.schema.ts` | 121 | 6 per-item schemas derived from `create*Schema`, `importPayloadSchema`, `importQuerySchema` |
| `src/schemas/{habit,goal,project,task}.schema.ts` | — | the source shapes |

### 22.6 Counts

| Metric | Value |
| ------ | ----- |
| Page lines | **79** |
| Component lines | **262 + 160 = 422** |
| API lines | **51** |
| Service + importer + schema lines | **54 + 154 + 121 = 329** |
| Requests on mount | **0** |
| Endpoints | 1 |
| Models written | 2 |
| Models deleted | **0** ✅ |
| Client-accepted keys / schema keys / imported keys | 13 / 8 / **2** |
| Hardcoded light classes | **21** (9 + 12) |
| `importQuerySchema` consumers | **0** |

---

## 23. Current behavior summary

`/settings/import` is a 79-line wrapper — the same two early-return branches, the same heading, the same skeleton shapes as its sibling `/settings/export`. It holds no state and issues no request on mount. The feature is a 262-line client component that reads the backup **entirely in the browser**, validates it against 13 recognised top-level keys, shows a count badge per collection, and — only on an explicit click — POSTs the whole parsed object to a four-layer server stack.

**What is genuinely excellent here.** The client reads and validates before uploading, so an invalid backup costs no server round trip and the user sees what would be imported first. The route validates the **whole body** before any persistence and says so in its docstring. The per-item schemas are **derived from the `create*Schema` shapes** rather than restated, so the importer can never accept a field the create form rejects — and that is what makes mass assignment structurally impossible rather than merely checked. The service owns the Prisma handle so the route has no database access, exactly as `FILE.MD` requires. Skipped counts are derived from the payload and never fabricated. And the merge-never-wipe contract is disclosed *before* the user confirms, and repeated at the point of action in the component itself.

**Three things break it.** First, the client and the server disagree about the payload: the UI recognises `journal`, `sleep`, `routine`, `categories`, `tags`, `focusSessions`, `wellness`, `reflections` and `settings`, while the schema wants `journalEntries`, `sleepLogs`, and nothing at all for the other seven — and `z.object` strips rather than rejects, so the failure is a silent `imported: 0, skipped: 0` after the UI has just badged `routine: 40`. Since `/settings/import:73` tells the user to feed in a file from `/settings/export`, the documented round trip is broken for everything except habits and goals. Second, the page's promise that *"every other collection … is reported as skipped with an honest count"* holds only for the four keys in `UNSUPPORTED_COLLECTIONS`. Third, the import is not atomic and the page does not reload afterwards, so a partial success is both silent and invisible.

---

## 24. Findings register

Severity: 🔴 **critical** · 🟠 **major** · 🟡 **minor**.

| ID | Sev | Finding | Evidence | Fix |
| -- | --- | ------- | -------- | --- |
| **F1** | 🔴 | **The client and server disagree about the payload shape, so the documented export→import round trip is broken.** `VALID_COLLECTION_KEYS` accepts `journal`, `sleep`, `routine`, `categories`, `tags`, `focusSessions`, `wellness`, `reflections`, `settings`; `importPayloadSchema` accepts only `habits`, `goals`, `projects`, `tasks`, `journalEntries`, `sleepLogs`, `records`. `journal ≠ journalEntries` and `sleep ≠ sleepLogs`, and seven keys are absent entirely — stripped by `z.object` without error. `/settings/import:73` sends the user straight into this. | `ImportData.tsx:22`–`:36` vs `import.schema.ts:99`–`:105`; `z.object` strip semantics | Derive `VALID_COLLECTION_KEYS` from the schema's key list, or extend the schema to the exporter's names. One shared constant would prevent recurrence. **§25, §21.2** |
| **F2** | 🔴 | 🔴 The page promises *"Every other collection in the file is reported as skipped with an honest count"* — but `UNSUPPORTED_COLLECTIONS` covers only `projects`, `tasks`, `journalEntries`, `sleepLogs`. A `routine` collection of 40 blocks is previewed, uploaded, and **counted nowhere**: not imported, not skipped. | `import/page.tsx:69`; `ImportData.tsx:181`–`:183`; `import.service.ts:18`–`:23` | Compute `skipped` from *every* key in the payload minus the two imported, rather than a hard-coded list. **§7.1** |
| **F3** | 🟠 | 🔴 `records` is accepted by the schema (`:105`) and **never read** by the service. A `records`-style payload imports 0 and skips 0. | `import.schema.ts:105`; `import.service.ts:42`–`:48` | Handle it or remove it from the schema. |
| **F4** | 🟠 | No file-size guard: `file.text()` → `JSON.parse` → `JSON.stringify` keeps three full copies alive in the tab, and `accept="application/json,.json"` is an advisory hint the browser does not enforce. | `ImportData.tsx:69`, `:70`, `:97`, `:146` | Check `file.size` first and refuse above a threshold. **§18.2** |
| **F5** | 🟡 | `importGoalSchema` requires **both** `startDate` and `endDate` (`:35`–`:36`), so a single goal missing `endDate` fails the **entire payload** with a 400 and nothing is imported. | `import.schema.ts:35`–`:36` | Make `endDate` optional, or report per-record errors rather than failing the batch. |
| **F6** | 🟠 | **The import is not atomic.** `importHabits` then `importGoals` are awaited sequentially with no transaction spanning both, so a failure in `importGoals` leaves the habits already written — with a 500 and no indication of what landed. | `import.service.ts:42`–`:43` | `$transaction`, or report partial counts in the response. **§13, §18.3** |
| **F7** | 🟠 | After a successful import the page does **not** reload, so `/habits` and `/goals` still show the pre-import state until a manual refresh. | `ImportData.tsx:110`–`:113` | `router.refresh()` on success. |
| **F8** | 🟠 | The page discloses that habits and goals are "merged (never duplicated, never deleted)" but **not** whether a matching habit is updated, nor whether the file's values overwrite the user's current ones. There is no field-level diff — `ImportPreview` shows counts only. | `import/page.tsx:68`; `ImportData.tsx:167`–`:176` | State the overwrite rule explicitly; ideally show a diff. |
| **F9** | 🟠 | Collection arrays have **no `.max()`** in the schema, so a payload of a million habits is schema-valid and would write a million rows in one request. The free plan caps habits at 20 (`config/app.ts:22`) but nothing enforces it here. | `import.schema.ts:99`–`:105` | Add `.max()` per collection, and enforce the plan limit. |
| **F10** | 🟡 | `importHabits` and `importGoals` are awaited sequentially despite being independent; `Promise.all` would halve the latency. | `import.service.ts:42`–`:43` | `Promise.all`. |
| **F11** | 🟡 | `import.service.ts:1` imports `prisma` from `@/lib/prisma`, which throws at import time without `DATABASE_URL` — so any test touching `ImportService` needs a DB or a mock. | `import.service.ts:1`; `AGENTS.md` | Document the constraint next to the import, as `AGENTS.md` does for services. |
| **F12** | 🟡 | `validateImport` is a **pure, dependency-free function with 6 distinct branches** — scalar, `{}`, array, unknown key, empty array, valid — and has **no test**. | `ImportData.tsx:221`–`:260`; `tests/` listing | `tests/lib/import-validate.test.ts` — one table-driven test covers all six. |
| **F13** | 🟠 | Both the 400's `details` (flattened Zod issues) and the 500's `details: String(error)` are discarded by the client, which shows only `err.message`. The most actionable diagnostic the server sends is thrown away, and the 500 can leak an internal message. | `import/route.ts:33`, `:47`; `ImportData.tsx:104`, `:115` | Use `apiRequest` (see F16) so `ApiError` carries the details, and stop returning `String(error)` to the client. |
| **F14** | 🟡 | `counts.map` renders one badge per key with no cap, so a 500-key JSON produces 500 badges. | `ImportData.tsx:167`–`:171` | Cap and show "+N more". |
| **F15** | 🟠 | `source` accepts `NOTION`, `TODOIST`, `TRELLO`, `GOOGLE_CALENDAR`, `APPLE_HEALTH` and `GOOGLE_FIT`, and **no connector exists for any of them**. The enum advertises six integrations the product does not have. | `import.schema.ts:95`–`:97`; `grep` — no such importer | Trim the enum to `ROUTINEOS` / `CUSTOM`. **§19** |
| **F16** | 🟠 | `ImportData` bypasses `apiRequest`, so it loses `ApiError`, unwraps `{success,data}` by hand with `?? 0` defaults that mask a malformed response, and renders a 401 as a bare "Unauthorized" with no route to `/login`. `ExportData`, in the same folder, uses `apiRequest` correctly. | `ImportData.tsx:94`–`:115` vs `ExportData.tsx:14`, `:76`, `:96` | One-line change; §27. |
| **F17** | 🟡 | `importQuerySchema` (`mode`, `overwrite`, `dryRun`) is **exported and never imported by anything**, and no route reads query params — so `dryRun` and `overwrite` are advertised capabilities that do not exist. | `import.schema.ts:108`–`:112`; `import/route.ts` | Remove it, or implement a preview endpoint. **§15** |
| **F18** | 🟡 | `server/data/preview.ts` (7 lines) and `validator.ts` (8 lines) exist but are not in the import path — `ImportService` calls `importer.ts` directly. Dead surface. | `import.service.ts:2` | Wire them in or delete them. |
| **F19** | 🟡 | **Route duplication with unequal information.** `/settings/import` and `/settings/data` both render `<ImportData />`, and the hub lists both. This one has the "What is imported?" card; that one does not — so a user who clicks "Data" gets the import feature with no explanation of what it does. | `import/page.tsx:59`, `:61`–`:76`; `data/page.tsx:91`; `settings/page.tsx:80`–`:82` | Merge; move the explanatory card. **§26** |
| **F20** | 🟡 | Hardcoded light-mode: 9 classes in `ImportData` + 12 in `ImportPreview` — the ERROR.md I3 class. On a dark theme the "Import Data" heading is near-invisible. | `ImportData.tsx:126`, `:128`, `:135`, `:140`, `:142`, `:155`, `:179`, `:207`; `ImportPreview.tsx` (12) | Tokens. One pass fixes `/settings/data` too. |
| **F21** | 🟡 | The signed-out branch uses `<a href="/login">` rather than `next/link` — one of 20 duplicated copies of a gate `proxy.ts` makes unreachable. | `import/page.tsx:38`; `proxy.ts` | Extract one shared `<RequireAuth>`; use `Link`. |

**Count: 21 findings. 2 critical, 11 major, 8 minor.**

---

## 25. The client/server key mismatch

### 25.1 The two lists

```ts
// ImportData.tsx:22–36 — what the UI will badge as a recognised collection
const VALID_COLLECTION_KEYS = new Set([
  'habits', 'goals', 'tasks', 'projects', 'categories', 'tags', 'routine',
  'focusSessions', 'journal', 'sleep', 'wellness', 'reflections', 'settings',
]);                                                        // 13 keys
```

```ts
// import.schema.ts:94–106 — what the server will accept
export const importPayloadSchema = z.object({
  source, version,
  habits, goals, projects, tasks, journalEntries, sleepLogs, records,
});                                                        // 8 collection keys
```

### 25.2 The reconciliation

| Client key | In schema? | Outcome |
| ---------- | ---------- | ------- |
| `habits` | ✅ `habits` | imported |
| `goals` | ✅ `goals` | imported |
| `tasks` | ✅ `tasks` | skipped and counted ✅ |
| `projects` | ✅ `projects` | skipped and counted ✅ |
| `journal` | 🔴 **`journalEntries`** | **stripped** |
| `sleep` | 🔴 **`sleepLogs`** | **stripped** |
| `routine` | 🔴 absent | **stripped** |
| `categories` | 🔴 absent | **stripped** |
| `tags` | 🔴 absent | **stripped** |
| `focusSessions` | 🔴 absent | **stripped** |
| `wellness` | 🔴 absent | **stripped** |
| `reflections` | 🔴 absent | **stripped** |
| `settings` | 🔴 absent | **stripped** |

**2 of 13 client keys are actually imported. 2 more are correctly skipped and counted. 9 are silently discarded.**

### 25.3 Why it is silent

`importPayloadSchema` is a plain `z.object`. Zod's default `.strip()` behaviour **removes** unrecognised keys and reports success — it does not error. So:

```
  POST body  { habits: [...], goals: [...], routine: [40 items], settings: {...} }
        │
        ▼
  importPayloadSchema.safeParse(body)
        │
        ├─ success: TRUE          ◄── unknown keys are stripped, not rejected
        │  .data = { habits, goals, version: 1 }
        ▼
  ImportService
     imported = habits.length + goals.length
     skipped  = 0        ◄── routine/settings are not in UNSUPPORTED_COLLECTIONS
        ▼
  200 { success: true, data: { imported: N, skipped: 0 } }
```

The user has just watched the UI badge `routine: 40` and `settings: 1` as recognised collections (`:167`–`:171`), clicked Import, and been told the import succeeded with nothing skipped. **The data they expected to restore was discarded and the UI reported success.**

### 25.4 Why this is the highest-value fix on the page

The page's own instruction creates the trap:

```
import/page.tsx:72–74
  "Use a backup exported from the Export page or downloaded via
   /api/export/download."
```

So the user is told to produce a file with `/settings/export` and feed it to `/settings/import`. **That round trip works for exactly two collections.** Everything else the exporter happens to emit is dropped, and everything else the user might reasonably put in the file is dropped.

`exporter.ts` (259 lines) is the other half of this and was not fully read for this audit — but the two files were evidently written at different times against different key namings, and nothing pinned them. `ImportData.tsx` uses short singular names (`journal`, `sleep`, `routine`); `import.schema.ts` uses the **Prisma model names** (`journalEntries`, `sleepLogs`). The Prisma convention is the correct one — it matches `model JournalEntry` and `model SleepLog` — so the *client* is the side that drifted.

### 25.5 The fix

**Derive one list from the other.** Do not maintain two:

```ts
// The single source of truth is the schema. Import it here and badge
// against its keys — the client list drifted from the server's naming and
// silently discarded 9 of 13 collections.
import { importPayloadSchema } from '@/lib/validation/import.schema';

const VALID_COLLECTION_KEYS = new Set(
  Object.keys(importPayloadSchema.shape).filter(
    (k) => !['source', 'version'].includes(k)
  )
) as Set<string>;
```

That is safe because `import.schema.ts` has no server-only imports — it pulls `createHabitSchema` and friends from `src/schemas/`, all of which are plain Zod. ✅ And it means a future schema change automatically updates the preview.

**Then fix the two naming mismatches** by deciding which side is right. The schema matches the Prisma model names, so the *exporter* should emit `journalEntries` / `sleepLogs` — or the schema should accept both:

```ts
journalEntries: z.array(importJournalSchema).optional(),
journal:        z.array(importJournalSchema).optional(),   // legacy alias
```

**And add the missing collections** (`routine`, `categories`, `tags`, `focusSessions`, `wellness`, `reflections`, `settings`) as either accepted-and-skipped or genuinely implemented. The first is honest and cheap; the second is a feature.

§24 F1.

---

## 26. Route duplication

### 26.1 The cluster

| Hub card | Route | Lines | Renders | Explanatory card |
| -------- | ----- | ----- | ------- | ---------------- |
| `Data` (`:80`) | `/settings/data` | 169 | `<ExportData/>` + `<ImportData/>` + lifecycle | ❌ |
| `Export` (`:81`) | `/settings/export` | 81 | `<ExportData/>` | ✅ "What is included?" |
| `Import` (`:82`) | `/settings/import` | 79 | `<ImportData/>` | ✅ "What is imported?" |

Three hub cards, **two components**, three routes. `/settings/data` is a strict superset of the other two.

### 26.2 The information is in the wrong place

The disclosure that matters most on the import page — *"import is entity-merge, never wipe"* — appears in **two** places on `/settings/import` (the card at `:68`–`:70` and the component's inline note at `:181`–`:183`) and **nowhere** on `/settings/data`. So a user who clicks the more prominent "Data" card, sees the dropzone, and clicks Import has never been told they are not about to overwrite their data.

That asymmetry is the same defect as `export.md` §26, in the other direction: here the safety information is stranded on the page the hub de-emphasises.

### 26.3 The fix

Merge all three into `/settings/data`:

1. Move the "What is imported?" card from `import/page.tsx:61`–`:76` into `data/page.tsx`, below `<ImportData />`.
2. Move "What is included?" from `export/page.tsx:61`–`:78` likewise.
3. Delete `settings/export/page.tsx` and `settings/import/page.tsx`.
4. Drop the `Export` and `Import` entries from `settingsGroups` (`settings/page.tsx:81`–`:82`).

Net: 21 hub cards → 19, two wrappers deleted, both explanations on the page that shows the features, one component per route.

§24 F19.

---

## 27. `ImportData` bypasses `apiRequest`

### 27.1 Side by side

```ts
// ExportData.tsx — the sanctioned client
import { apiRequest, ApiError } from '@/lib/api-client';                       // :14

const requested = await apiRequest<ExportRequestResult>('/api/export/request', {
  method: 'POST',
  body: { format },
});                                                                            // :76–79

const row = await apiRequest<ExportStatusRow>(`/api/export/status/${exportId}`); // :46

catch (err) {
  setError(err instanceof ApiError ? err.message : 'Unable to request…');       // :96
}
```

```ts
// ImportData.tsx — hand-rolled
const response = await fetch('/api/import', {                                  // :94
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(parsed),
});

if (!response.ok) {
  const body = (await response.json().catch(() => null)) as { error?: string } | null;
  throw new Error(body?.error ?? `Import failed (${response.status})`);           // :100–105
}

const result = (await response.json()) as { data?: { imported?: number; skipped?: number } };
setImportResult({
  imported: result.data?.imported ?? 0,                                          // :110–113
  skipped:  result.data?.skipped  ?? 0,
});
```

### 27.2 Four consequences

| # | Consequence |
| - | ----------- |
| 1 | **`ApiError` is unavailable.** The catch uses `err instanceof Error` (`:115`), so a structured API error with a status code and flattened Zod details collapses to a bare string. |
| 2 | 🔴 **The server's most useful diagnostic is discarded.** `import/route.ts:33` returns `{ error: 'Invalid import payload', details: validated.error.flatten() }` and `:47` returns `{ error, details: String(error) }`. The client reads only `body?.error` (`:104`) and drops `details` — so a user whose payload fails the schema is told *"Invalid import payload"* with **no indication of which field**. |
| 3 | **`?? 0` masks a malformed response.** `result.data?.imported ?? 0` (`:111`) means a server returning `{ data: { imported: "5" } }` sets a **string** into a number slot, and a missing field silently becomes `0` — indistinguishable from a genuine zero. |
| 4 | **No auth-failure handling.** A 401 renders as a bare "Unauthorized" in a red box with no link to `/login`, even though this very page has a sign-in branch 30 lines below. |

### 27.3 Why it happened

`ImportData` needed to POST a body that is **already-parsed JSON**, and the author reached for `fetch`. But `apiRequest<T>(path, { method, body })` takes an object and serialises it — which is what every other settings page uses, including `ExportData` **in the same folder, one file away**.

So this is drift, not a design difference. Two components in `components/data/` disagree about how to call the API.

### 27.4 The fix

```ts
// ImportData.tsx
import { apiRequest, ApiError } from '@/lib/api-client';

try {
  const result = await apiRequest<{ imported: number; skipped: number }>('/api/import', {
    method: 'POST',
    body: parsed,                     // apiRequest serialises — no JSON.stringify
  });
  setImportResult(result);            // no cast, no ?? 0
} catch (err) {
  setError(err instanceof ApiError ? err.message : 'Import failed');
}
```

Two lines removed, one import added, and the component gains typed errors, envelope unwrapping and 401 handling.

**Verify the envelope first:** `apiRequest` unwraps `.data`, and `POST /api/import` returns `{ success: true, data: { imported, skipped } }` (`import/route.ts:43`) — exactly what `apiRequest` expects. ✅

§24 F16.

---

*End of `/settings/import` audit. 27 sections, 21 findings, 79-line wrapper over 422 lines of component code, 51 lines of API and 329 lines of service/importer/schema. 2 critical findings, both in the contract between client and server: a key-name mismatch that silently discards 9 of 13 recognised collections, and a skipped-count promise that covers 4 keys. The security posture is strong — whole-body Zod validation, schemas derived from the create shapes, session-scoped writes, nothing ever deleted — and that is recorded as such. Documentation only: no source file was modified.*