# `/journal` — Complete System Audit

**Route:** `http://localhost:3000/journal`
**Route file:** `src/app/(dashboard)/journal/page.tsx` (564 physical lines, `'use client'`)
**Sibling route:** `src/app/(dashboard)/journal/[date]/page.tsx` (103 physical lines) — audited in full because it is the editor's per-day entry point
**Project:** RoutineOS (`daily-plan`) — Next.js (App Router) + Prisma + PostgreSQL (Neon)
**Audit date:** 2026-09-30 · **Amended:** 2026-09-30 (documentation-only pass — no code was changed; see [§24](#24-findings-register))
**Status of this document:** describes **only** what exists in the codebase. Every claim is file-anchored.

> **Line-count convention:** **physical** line counts. PowerShell's `Measure-Object -Line` skips blank lines and reports 534 for `journal/page.tsx` and 92 for `[date]/page.tsx`.

> **The single most important structural fact about this domain: there is no `journal.service.ts`.**
> `src/server/services/` contains 54 services and **journal is not among them**. Every `/api/journal/**` route imports its business logic directly from **`src/lib/journal/crud.ts`** — a file in `lib/`, which is supposed to stay pure, that instantiates `new JournalRepository()` at module scope and issues Prisma queries. **Journal is the only domain in this codebase structured this way.** See [§26](#26-architectural-violations).

> **A second fact worth knowing up front:** `JournalEntry` has **`@@unique([userId, date])`**. There can be **exactly one journal entry per user per day.** This constrains the entire UX and is the reason `/journal/[date]` cannot create a back-dated entry.

---

## Table of contents

| §   | Section                                                                                                         |
| --- | --------------------------------------------------------------------------------------------------------------- |
| 1   | [What `/journal` is, in one paragraph](#1-what-journal-is-in-one-paragraph)                                     |
| 2   | [UI block diagram](#2-ui-block-diagram)                                                                         |
| 3   | [UI → component mapping](#3-ui--component-mapping)                                                              |
| 4   | [Frontend architecture](#4-frontend-architecture)                                                               |
| 5   | [Backend / API architecture](#5-backend--api-architecture)                                                      |
| 6   | [Database dependency](#6-database-dependency)                                                                   |
| 7   | [Date, mood and tag logic](#7-date-mood-and-tag-logic)                                                         |
| 8   | [Complete user actions (serial)](#8-complete-user-actions-serial)                                               |
| 9   | [What can the user create](#9-what-can-the-user-create)                                                         |
| 10  | [What can the user edit](#10-what-can-the-user-edit)                                                            |
| 11  | [What can the user delete](#11-what-can-the-user-delete)                                                        |
| 12  | [Cross-page dependencies](#12-cross-page-dependencies)                                                          |
| 13  | [Impact analysis](#13-impact-analysis)                                                                          |
| 14  | [Current System Capabilities](#14-current-system-capabilities)                                                  |
| 15  | [Currently NOT Supported](#15-currently-not-supported)                                                          |
| 16  | [Loading / Error / Empty / Edge states](#16-loading--error--empty--edge-states)                                 |
| 17  | [Authentication & security](#17-authentication--security)                                                       |
| 18  | [Performance](#18-performance)                                                                                  |
| 19  | [External integrations](#19-external-integrations)                                                              |
| 20  | [Background jobs / cron effects](#20-background-jobs--cron-effects)                                             |
| 21  | [Data flow diagrams](#21-data-flow-diagrams)                                                                    |
| 22  | [File-by-file dependency inventory](#22-file-by-file-dependency-inventory)                                      |
| 23  | [Current behavior summary](#23-current-behavior-summary)                                                        |
| 24  | [Findings register](#24-findings-register)                                                                     |
| 25  | [The three parallel mood stores](#25-the-three-parallel-mood-stores)                                           |
| 26  | [Architectural violations](#26-architectural-violations)                                                       |
| 27  | [Dead surface inventory](#27-dead-surface-inventory)                                                            |

---

## 1. What `/journal` is, in one paragraph

`/journal` is the app's **writing surface**. It is a `'use client'` Client Component (`page.tsx:1`) that renders a **320 px sidebar** (daily-reflection shortcut, mood calendar, tag + date filters, recently-deleted trash) beside a **main column** containing either the `JournalEditor` or a paginated grid of `JournalEntry` cards. The editor is a full `RichTextEditor` (contentEditable + `document.execCommand`) with title, two 1–5 rating pickers (mood and energy), a tag combobox, and a **`localStorage` autosave draft** that survives reload and warns on `beforeunload`. Every write goes through a real soft-delete/restore/permanent-delete lifecycle, and **every title or content edit snapshots a `JournalRevision` before overwriting**, so a full version history with per-revision restore is available behind a dialog. Because `JournalEntry` has `@@unique([userId, date])`, there can be only one entry per day; the calendar's day cells are therefore the only path to a per-day route (`/journal/[date]`), and the list is the only path to everything else. The domain has **no AI surface at all** and **no service layer**.

---

## 2. UI block diagram

### 2.1 `/journal` — `page.tsx:564` lines

```
/journal  (src/app/(dashboard)/journal/page.tsx — 'use client')
│
└── <div class="container relative mx-auto max-w-6xl">              :201
    │
    ├── [background] div.gradient-mesh-animated.pointer-events-none
    │               .-z-10.opacity-60  (aria-hidden)                  :214–217
    │
    └── <div class="relative">                                          :219
        │
        ├── <Stagger>                                                   :220–244
        │   ├── <header>  <h1> <BookOpen/> "Journal"                    :222
        │   │            <p> "Capture reflections, track mood and energy…"  :229
        │   │            <Button primary onClick={startNew}> "New entry"  :231
        │   │                  ⚠ rendered ONLY when !creating && !editing
        │   │
        │   ├── {error && <p role="alert">}                             :246–250   load failure
        │   ├── {actionError && <p role="alert">}                       :252–256   mutation failure
        │   │
        │   └── {entries === null ? <Spinner class="h-6 w-6"/> py-16       :258–261
        │          : <div class="grid grid-cols-1 gap-6
        │                    lg:grid-cols-[320px_1fr] lg:gap-8">}           :263
        │
        ├── SIDEBAR (320px column)                                      :265–406
        │   │
        │   ├── CARD 1 — Daily reflection                               :265–291
        │   │     <Sparkles/> + <h2>
        │   │     body = a 4-way ternary on:
        │   │        reflectionError / hasTodayReflection === null /
        │   │        hasTodayReflection / else
        │   │     {reflectionError && <p role="alert">}                 :279–283
        │   │     <Button onClick={() => router.push('/today')}>         :284–290
        │   │        label: "Open today's reflection" | "Take today's reflection"
        │   │        <ArrowRight/>
        │   │
        │   ├── CARD 2 — Calendar                                       :293–298
        │   │     └── <JournalCalendar moodByDate={moodByDate}
        │   │                       onSelectDate={d => router.push(`/journal/${d}`)} />
        │   │          ⚠ THE ONLY INBOUND LINK TO /journal/[date]
        │   │
        │   ├── CARD 3 — Filters                                        :300–339
        │   │     ├── <Select label="Tag">  All tags | one per tag       :304–311
        │   │     │      ⚠ value = t.id, but the editor resolves tag NAMES (§7.3)
        │   │     ├── <Input label="Date" type="date">                   :313–320
        │   │     └── {tagFilter || dateFilter} && <Button ghost onClick=clearFilters>  :322–332
        │   │            <X/> "Clear filters"
        │   │     ⚠ both setters also call setPage(1)
        │   │
        │   └── CARD 4 — Recently deleted (n)                            :341–406
        │         ├── Show/Hide ghost toggle (showTrash)                 :346–356
        │         ├── {showTrash && (deletedEntries.length === 0
        │         │    ? "Trash is empty."
        │         │    : <ul> … </ul>)}
        │         └── per trashed entry:
        │               entryLabel + formatDate(entry.date)
        │               <Button outline RotateCcw> Restore       → runRestore      :374–381
        │               <Button outline Trash2>     Delete forever → setPendingDelete  :382–389
        │               both disabled={busy}
        │
        └── MAIN COLUMN (mutually exclusive)                            :409–504
            │
            ├── BRANCH A — editor mode (creating || editing)             :423–438
            │     ├── <Button ghost onClick=closeEditor> <X/> "Close editor"  :424–431
            │     └── <JournalEditor key={editing?.id ?? 'new'}
            │                      entry={editing ?? undefined}
            │                      availableTags={tags}
            │                      onSaved={handleSaved}
            │                      onCancel={closeEditor} />             :432–437
            │           ⚠ the key forces a full remount per entry so draft restore re-runs
            │
            └── BRANCH B — list mode                                     :439–503
                  ├── <h2> "Recent entries"  + "(n of m)" when filtered  :440–447
                  ├── "No entries match these filters." <Card>  when filtered===0 && filters  :449–454
                  └── <JournalList entries={paged}
                                   onSelect={id => { setCreating(false); setEditingId(id) }}
                                   page={safePage} pageCount={pageCount}
                                   onPageChange={setPage}
                                   renderActions={…} />                 :456–503
                        └── per entry, three ghost size="sm" Buttons under the card:
                              <Pencil/>  Edit     → setEditingId(id)                :477–484
                              <History/> History  → setHistoryId(id)                :485–492
                              <Trash2/>   Delete  → setPendingDelete({permanent:false})  :493–500

<Dialog> DELETE CONFIRM                                  page.tsx:509–539
   title       = 'Delete forever?' | 'Move to trash?'
   description quotes pendingDelete.title
   body        = extra guidance text
   footer      = Cancel outline  +  confirm isLoading={busyId !== null}

<Dialog size="lg"> VERSION HISTORY                         page.tsx:541–561
   title = `History — ${entryLabel(historyEntry)}` | 'Version history'
   └── <JournalVersionHistory entryId={historyId}
                              onRestored={() => void load()} />          :554
   (no footer)
```

### 2.2 `/journal/[date]` — `[date]/page.tsx:103` lines

```
/journal/2026-09-30
│
├── <Link href="/journal"> "← Back to journal"                 :59–65
├── <h1>{formatHeading(date)}</h1>                             :68–72
│     new Date(`${date}T12:00:00`) → toLocaleDateString('en-US',
│       {weekday, month, day, year})
│     ⚠ T12:00:00 local avoids the UTC-midnight off-by-one (§7.1)
├── {error && <p role="alert">}                               :74–78
│
└── three branches:
    ├── entries === null   → <Spinner>                       :80–83
    ├── entry (entries?.[0])
    │     └── <JournalEditor key={entry.id} entry={entry}
    │                      availableTags={tags}
    │                      onSaved={() => void load()} />    :85–92
    └── else → <EmptyState icon={<PenLine/>}
    │                 title="No entry for this day"
    │                 action → router.push('/journal') />     :94–99
          ⚠ DEAD END — the only action navigates AWAY (§11.2)

Local state: entries, tags, error  (3 hooks)
max-w-3xl (vs /journal's max-w-6xl)
NO onCancel, NO trash, NO history, NO filters, NO calendar, NO delete
```

### 2.3 `JournalEditor` — `src/components/journal/JournalEditor.tsx` (416 lines)

```
<Card class={cn('p-5', className)}>                              :336
├── <h2> 'Edit journal entry' | 'New journal entry'              :338
├── {draftRestored && <p role="status"> blue notice}            :340–347
├── <Input label="Title" maxLength={200}>                        :349–355
├── <RichTextEditor value onChange placeholder>                  :357–364
├── 2 × picker()  in <div class="sm:grid-cols-2">               :371–374
│     labelled 'Mood' and 'Energy'
│     picker(label, value, onChange) — a PLAIN FUNCTION returning JSX, :286–333
│       5 × <button title={MOOD_LABELS[rating]} aria-pressed={selected}>
│            selected → style={{backgroundColor: MOOD_COLORS[rating]}}
│            onClick  → onChange(selected ? null : rating)   ← toggles OFF
│       + conditional "Clear" button
│       ⚠ BOTH pickers share MOOD_COLORS, and Energy's title shows
│         MOOD words ("Bad"…"Great") — §24 F6
├── <TagInput label="Tags" tags … />                             :376
├── {error && <p role="alert"> red}                             :379
├── {savedMessage && <p role="status"> green}                   :382
└── footer                                                     :388–415
      ├── {dirty && "Unsaved changes" amber  mr-auto}
      ├── {onCancel && <Button ghost> Cancel}
      └── <Button primary isLoading={saving} onClick={save}>
            <Save hidden while saving/>  'Save changes' | 'Create entry'
```

### 2.4 `JournalVersionHistory` — 150 lines

```
<Card>
├── header + per-revision rows, newest-first
│     each: title + 140-char stripped-HTML preview + <Button> Restore
├── loading → Spinner
├── empty   → "No version history yet."
└── error   → <p role="alert">
Restore → POST /api/journal/[id]/revisions/[revisionId]/restore   :72
        → onRestored() → the page calls load()
```

---

## 3. UI → component mapping

### 3.1 Direct imports from `page.tsx`

```
page.tsx
├── src/components/journal/JournalCalendar.tsx        (192)   :20  used :294
├── src/components/journal/JournalList.tsx            (72)    :21  used :454
│   └── src/components/journal/JournalEntry.tsx       (123)   JournalList.tsx:15
│       ├── src/components/ui/Badge.tsx               (24)
│       ├── src/components/tags/TagBadge.tsx          (50)    :15
│       │   └── src/lib/utils.ts  formatDate, cn      (127)
│       └── lucide-react  Heart, Calendar
├── src/components/journal/JournalEditor.tsx          (416)   :22  used :431
│   ├── src/components/ui/RichTextEditor.tsx          (160)   :25   ⚠ deprecated + XSS risk
│   ├── src/components/tags/TagInput.tsx              (178)   :26
│   │   └── src/components/tags/TagBadge.tsx          (50)    :14
│   ├── src/components/ui/{Card,Input,Button}.tsx
│   ├── src/lib/utils.ts  cn                          (127)
│   └── src/hooks/useUserTimezone.ts                  (45)    :29
├── src/components/journal/JournalVersionHistory.tsx  (150)   :23  used :554
│   └── src/components/ui/{Card,Button,Spinner}.tsx
├── src/components/today/ui.tsx                       (402)   :23  used :220  ⚠ only Stagger L303
│   └── framer-motion (motion, useReducedMotion)
├── src/components/ui/index.tsx  (barrel, 26 lines)    :19
│   Button, Card, Dialog, Input, Select, Spinner, EmptyState
│   ⚠ the barrel re-exports 26 modules; journal renders 7
├── src/lib/api-client.ts       (131)  apiRequest, ApiError
├── src/lib/utils.ts            (127)  cn, formatDate
├── src/lib/dates.ts            (253)  getTodayString, DEFAULT_TZ
├── src/hooks/useUserTimezone.ts (45)  useUserTimezone
├── next/navigation             useRouter, useParams (on [date])
└── framer-motion, lucide-react (BookOpen, Plus, Pencil, History, Trash2,
                                  RotateCcw, X, ArrowRight, Sparkles, Save, PenLine)
```

⚠ `page.tsx:23` carries **two import statements on one physical line**: `import { Stagger } from '@/components/today/ui';import JournalVersionHistory from '@/components/journal/JournalVersionHistory';` — a merge/formatting artifact.

### 3.2 `src/components/journal/**` — exhaustive (5 files, **zero dead files**)

| Path                            | Physical | Directive | Imported by | Renders |
| ------------------------------ | -------- | --------- | ----------- | ------- |
| `JournalEditor.tsx`             | **416** | `'use client'` | `journal/page.tsx:22` (`:431`) **AND** `journal/[date]/page.tsx:11` (`:85`) | Create/edit form: title, `RichTextEditor`, two 1–5 pickers, `TagInput`, draft autosave + `beforeunload`, Save/Cancel |
| `JournalCalendar.tsx`           | 192    | `'use client'` | `journal/page.tsx:20` (`:294`) | Month grid heatmap; each day tinted by that day's mood via `MOOD_COLORS`; chevron prev/next nav (`h-10` buttons); today ring; colour legend; `onSelectDate(date)` |
| `JournalVersionHistory.tsx`     | 150    | `'use client'` | `journal/page.tsx:23` (`:554`) | `JournalRevision[]` newest-first with title + 140-char stripped preview + per-revision Restore |
| `JournalEntry.tsx`              | 123    | `'use client'` | `JournalList.tsx:15` (and `MOOD_LABELS`/`MOOD_COLORS` by `wellness/mood/page.tsx:9`, `MoodCalendar.tsx:15`, `JournalCalendar.tsx:16`, `JournalEditor.tsx:27`) | Single entry card: title / `formatDate` / favorite `Heart` / 3-line stripped-HTML preview / mood `Badge` / energy `Badge` / `TagBadge` row. Whole card is a `<button>` when `onSelect` is set |
| `JournalList.tsx`               | 72     | `'use client'` | `journal/page.tsx:21` (`:454`) | Responsive 1/2/3-col grid of `JournalEntry` with a `renderActions` slot under each, `EmptyState` at 0 items, `Pagination` footer |

**Positive finding: no file in `src/components/journal/` is dead.** Every one has a live importer — the only audited domain so far where that is true.

⚠ **Layering smell:** `MOOD_COLORS` / `MOOD_LABELS` are defined in `JournalEntry.tsx` but consumed by `JournalCalendar`, `JournalEditor`, `components/wellness/MoodCalendar.tsx` and `app/(dashboard)/wellness/mood/page.tsx:9`. **The wellness domain imports from `components/journal/**`**, which inverts the dependency.

### 3.3 Transitive components

| Path                              | Physical | Mode | Role |
| --------------------------------- | -------- | ---- | ---- |
| `components/ui/RichTextEditor.tsx` | 160 | client | `contentEditable` + `document.execCommand` toolbar (bold/italic/underline/ul/ol). Header comment `:9`–`:11` warns it is **deprecated and an XSS risk** |
| `components/ui/Pagination.tsx`     | 103 | client | prev/next + numbered links + ellipsis |
| `components/ui/Dialog.tsx`         | 148 | client | Radix `Dialog`; the page uses 2 instances |
| `components/ui/EmptyState.tsx`     | 52  | **none** | |
| `components/ui/Button.tsx`         | 52  | client | |
| `components/ui/Card.tsx`           | 26  | **none** | |
| `components/ui/Input.tsx`          | 98  | client | |
| `components/ui/Select.tsx`         | 55  | client | |
| `components/ui/Spinner.tsx`        | 14  | **none** | |
| `components/ui/Badge.tsx`          | 24  | **none** | |
| `components/ui/index.tsx`          | 26  | **none** | the **barrel** — 26 `export *` |
| `components/tags/TagInput.tsx`     | 178 | client | Combobox chips: Enter/comma add, Backspace removes last, ↑/↓ navigate, Esc closes, max 8 suggestions |
| `components/tags/TagBadge.tsx`     | 50  | client | |
| `components/today/ui.tsx`         | 402 | client | ⚠ pulls the **entire 402-line** today UI module for one `Stagger` wrapper |

---

## 4. Frontend architecture

### 4.1 Page structure

| Concern               | Reality (both routes)                                                                                              |
| --------------------- | ------------------------------------------------------------------------------------------------------------------ |
| Component kind        | **Client Component** on both — `'use client'` L1 in each. Not `async`.                                                |
| Sibling route files   | `journal/page.tsx` (564) + `journal/[date]/page.tsx` (103). **NO `loading.tsx`, `error.tsx`, `layout.tsx`, `not-found.tsx` or `template.tsx` anywhere under `journal/`.** |
| Route-segment loading | Falls through to `(dashboard)/loading.tsx` (5 lines) → `<PageSkeleton />`. ⚠ **Never fires** — both pages are Client Components that render synchronously; they have their own `<Spinner>` states instead. |
| Route-segment error   | Falls through to `(dashboard)/error.tsx` (97 lines) — reports via `ErrorReporter`. No journal-specific boundary. |
| Layout                | `(dashboard)/layout.tsx` (69 lines, server); `metadata = privateMetadata('RoutineOS')` at `:34`.                    |
| Page metadata         | **None.** Both pages are Client Components, so `generateMetadata` is impossible.                                       |

### 4.2 Providers / contexts active on `/journal`

| Provider                                 | File                                              | Does it affect `/journal` content?                                                                             |
| ---------------------------------------- | ------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| `ThemeProvider`                          | `components/providers/ThemeProvider.tsx`          | **Yes** — `glass-panel`, `gradient-mesh-animated`, all `dark:` variants.                                        |
| `AuthProvider`                           | `components/auth/AuthProvider.tsx`                | Indirect — `AuthSync` pre-loads `UserSettings`, which `useUserTimezone()` returns and which decides the draft key.  |
| `AppProvider`                            | `context/AppContext.tsx`                          | ❌ **No effect.** `/journal` reads **no** context member. But `AppContext` still fetches habits + routines + goals here, and `DataErrorBanner` surfaces their failures. |
| `DataErrorBanner` (layout)               | `components/shared/DataErrorBanner.tsx`           | ⚠ **False positives** — reads `useApp().dataError`, so a failed `/api/goals` shows a goals banner on the journal page. |
| `OfflineSync` / `OfflineBanner` (layout) | `components/offline/**`                           | Present. ⚠ **Journal entries are not queued** — every write is a raw `apiRequest`.                               |
| `SleepPromptHost`, `CelebrationHost`, `FloatingFocusBar` | `components/**`                  | No content effect.                                                                                              |

`/journal` creates **no** `React.Context` of its own.

### 4.3 State inventory

#### 4.3.1 `/journal` page — **16** `useState` (`:46`–`:64`)

| State | Line | Purpose |
| ----- | ---- | ------- |
| `entries` | `:46` | `JournalEntryWithRelations[] \| null`. **`null` is the loading sentinel** — the whole grid is hidden while it is. |
| `deletedEntries` | `:47` | trashed entries, `limit: 50` |
| `tags` | `:48` | from `GET /api/tags` |
| `error` | `:49` | **load** failure → one `role="alert"` at `:246`–`:250` |
| `actionError` | `:50` | **mutation** failure → a second `role="alert"` at `:252`–`:256` |
| `editingId` | `:51` | entry id being edited |
| `creating` | `:52` | new-entry mode |
| `pendingDelete` | `:53` | `{id, title, permanent}` — the dialog's payload |
| `busyId` | `:54` | which row is mid-mutation |
| `historyId` | `:55` | entry id whose history dialog is open |
| `showTrash` | `:56` | trash card expanded? |
| `tagFilter` | `:57` | selected `Tag.id` |
| `dateFilter` | `:58` | selected `YYYY-MM-DD` |
| `page` | `:59` | 1-based page index |
| `hasTodayReflection` | `:60` | from `GET /api/reflections?date=userToday` |
| `reflectionError` | `:61` | that fetch's error |

**Derived (all `useMemo` / plain):** `moodByDate` `:106`–`:112` (a `Map<date, mood>` for the calendar) · `filtered` `:114`–`:127` (sort `b.date.localeCompare(a.date)`, then tag-id and date-key filters) · `pageCount` `:129` · `safePage` `:130` (clamped to `pageCount`) · `paged` `:131`–`:134` · `editing` `:136`–`:139` · `historyEntry` `:141`–`:147` (searches **both** `entries` and `deletedEntries`, so a trashed entry's history still opens).

**Callbacks:** `load` `:66`–`:83` (`useCallback`, a `Promise.all` of 3 requests) · `closeEditor` `:149`–`:152` · `handleSaved` `:154`–`:157` · `runDelete` `:159`–`:181` · `runRestore` `:183`–`:195` · `entryLabel` `:197`–`:198` (→ `title || 'Untitled entry'`).

**Module-level consts / helpers:** `toDateKey(date)` `:27`–`:29` = `new Date(date).toISOString().slice(0,10)` — **UTC**, not the user's timezone (§7.1) · `PAGE_SIZE = 6` `:31` · `interface PendingDelete` `:33`–`:37`.

#### 4.3.2 `JournalEditor` — 11 `useState` + 1 `useRef` (`:99`–`:108`)

`title` · `content` · `mood: number \| null` · `energy: number \| null` · `tagNames: string[]` — all six seeded from `baseline` (a `useMemo` over `entry`, `:88`–`:97`) — plus `saving` · `error` · `savedMessage` · `draftRestored`, and the `draftAppliedForKey` ref.

#### 4.3.3 `JournalCalendar` / `JournalList` / `JournalEntry` / `JournalVersionHistory`

The three smaller components keep their state internally (the active month, the expanded preview, the loading/error flags) — see §22.

#### 4.3.4 Derived and client-only

| State        | Kind   | Owner | Notes |
| ------------ | ------ | ----- | ----- |
| `userToday`  | derived | `useUserTimezone().today` | gates the `useEffect` at `:85`–`:104` |
| `moodByDate` | `useMemo` | `:106` | `Map<string, number>` from `entries` |
| `filtered` / `paged` | `useMemo` | `:114`, `:131` | client-side; the server was already asked for `limit: 100` |
| draft        | **localStorage** | `JournalEditor:162` | §10 |
| URL / query state | — | **None** | `page`, `tagFilter`, `dateFilter` are **not** in the URL, so filters and pagination are lost on reload |

### 4.4 Hooks used on `/journal`

| Hook                             | File                                    | Inputs      | Outputs | Side effects / API |
| -------------------------------- | --------------------------------------- | ----------- | ------- | ------------------ |
| `useRouter()`                    | `next/navigation`                        | –           | router  | `push('/today')` `:285`; `push(`/journal/${date}`)` `:296`; `push('/journal')` on `[date]` `:99` |
| `useParams<{date: string}>()`    | `next/navigation` (on `[date]`)         | –           | `{date}` | ⚠ **not awaited** — correct for a Client Component                                       |
| `apiRequest<T>()`                | `lib/api-client.ts:60`                   | path, `{method, body, query}` | unwrapped `T`; throws `ApiError{status, details}` | `credentials:'include'`, `cache:'no-store'`; unwraps `data` only when `success === true && data !== undefined` |
| `useUserTimezone()`              | `hooks/useUserTimezone.ts:45`            | –           | `{timezone, today, isLoading}` | reads `useSettings()`; `today` decides the new-entry draft key |
| `useCallback`                    | React                                    | `[]`        | `load`  | identity stabilises the mount effect |
| `useMemo` ×3                     | React                                    | see §4.3.1  | derived | pure |
| `useState` ×16 + editor's 11     | React                                    | –           | see §4.3 | pure |

**`fetchWithAuth`** (`lib/api-client.ts:117`) — the raw-`Response` wrapper used by `/habits` and `/routine` — is **not used by journal**; journal is the first audited route to use `apiRequest` throughout.

---

## 5. Backend / API architecture

### 5.1 Endpoints called by the journal UI — 12 requests

| # | Endpoint | Method | Caller | `auth()` | Zod schema | "Service" fn (`lib/journal/crud.ts`) | Repository fn | Prisma |
| - | -------- | ------ | ------ | -------- | ---------- | ------------------------------------ | ------------- | ------ |
| 1 | `/api/journal` | GET | `page.tsx:69`–`:71` (`limit: 100`) · `[date]/page.tsx:40` (`?date=`) | ✅ `route.ts:18` | `journalEntryQuerySchema` `schemas/journal.schema.ts:31` | `listJournalEntries` `:237` | `findAll` `journal.repository.ts:109` | `JournalEntry`, `JournalEntryTag`, `Tag` |
| 2 | `/api/journal` | POST | `JournalEditor.tsx:271` | ✅ `route.ts:112` | `createJournalEntrySchema` `schema:3` | `createJournalEntry` `:33` | `create` `repo:39` | `JournalEntry` (+ nested `createMany` `JournalEntryTag`) |
| 3 | `/api/journal/[id]` | PATCH | `JournalEditor.tsx:271` | ✅ `[id]/route.ts:71` | `journalEntryIdSchema` `schema:17` **+** `updateJournalEntrySchema` `schema:15` | `updateJournalEntry` `:60` | `findById`, `createRevision`, `update`, `setTags`, `findById` | `JournalEntry`, `JournalRevision`, `JournalEntryTag` |
| 4 | `/api/journal/[id]` | DELETE | `page.tsx:169`–`:171` | ✅ `[id]/route.ts:129` | `journalEntryIdSchema` | `softDeleteJournalEntry` `:158` | `softDelete` `repo:221` | `JournalEntry` |
| 5 | `/api/journal/[id]/permanent` | DELETE | `page.tsx:165`–`:167` | ✅ `permanent/route.ts:29` | `journalEntryIdSchema` | `getJournalEntryIncludingDeleted` `:133` + `permanentlyDeleteJournalEntry` `:187` | `findById(includeDeleted)` + `permanentDelete` `repo:262` | `JournalEntry`, `JournalRevision` (cascade) |
| 6 | `/api/journal/[id]/restore` | POST | `page.tsx:188` | ✅ `restore/route.ts:25` | `journalEntryIdSchema` | `restoreJournalEntry` `:173` | `restore` `repo:241` | `JournalEntry` |
| 7 | `/api/journal/deleted` | GET | `page.tsx:73`–`:75` (`limit: 50`) | ✅ `deleted/route.ts:12` | `deletedJournalQuerySchema` `schema:26` | `listDeletedJournalEntries` `:197` | `findDeleted` `repo:200` | `JournalEntry`, `JournalEntryTag`, `Tag` |
| 8 | `/api/journal/[id]/revisions` | GET | `JournalVersionHistory.tsx:54` | ✅ `revisions/route.ts:26` | `journalEntryIdSchema` | `listJournalRevisions` `:210` | `listRevisions` `repo:306` | `JournalRevision` |
| 9 | `/api/journal/[id]/revisions/[revisionId]/restore` | POST | `JournalVersionHistory.tsx:72` | ✅ `restore/route.ts:26` | `journalRevisionIdSchema` `schema:21` | `restoreJournalRevision` `:221` | `restoreRevision` `repo:331` (in `$transaction`) | `JournalEntry`, `JournalRevision` |
| 10 | `/api/tags` | GET | `page.tsx:72` · `[date]/page.tsx:41` · `JournalEditor.tsx:246` (409 retry) | ✅ `tags/route.ts:21` | ❌ **none** | `tagService.list` `tag.service.ts:30` | `TagRepository.listForUser` `tag.repository.ts:32` | `Tag` |
| 11 | `/api/tags` | POST | `JournalEditor.tsx:237` | ✅ `tags/route.ts:44` | `createTagSchema` `schemas/tag.schema.ts` | `tagService.create` `tag.service.ts:34` | `TagRepository.create` `tag.repository.ts:60` | `Tag` |
| 12 | `/api/reflections` | GET | `page.tsx:91`–`:93` | ✅ `reflections/route.ts:12` | ❌ **none** — only a `date` presence check `:20`–`:25` | `lifeContextService.getReflection` `life-context.service.ts:59` | `ReflectionRepository.findByDate` | `DailyReflection` |

✅ **All 12 derive `userId` from `session.user.id` after `await auth()`.** No client-supplied `userId` is trusted anywhere.

### 5.2 Journal API routes the UI **never** calls

| Endpoint                        | Physical | Status |
| ------------------------------- | -------- | ------ |
| `/api/journal/entries`          | **105** | 🔴 **Entire file unreachable.** GET only. **Violates the Zod policy** — a hand-rolled `/^\d{4}-\d{2}-\d{2}$/` regex at `:23` and manual `Number.isNaN` pagination checks at `:39`–`:44` instead of a schema. Also returns a `meta.summary` aggregation block that nothing consumes. |
| `/api/journal/[id]/tags`        | **95**   | 🔴 **Both GET and PUT unreachable.** The editor attaches tags through `PATCH /api/journal`'s `tagIds` instead. Uses an **inline** `setTagsSchema` (`z.array(z.string().min(1)).max(50)`) at `:6`–`:8`, not `@/schemas/journal.schema.ts`. |
| `/api/search/journal`           | **48**   | 🔴 **Unreachable.** The `/search` page calls `/api/search` → `SearchService.globalSearch` → `journalRepository.search`, never this ranked/snippet endpoint. `searchJournalEntries` is thus live but only via this dead route. |
| `GET /api/journal/[id]`         | (in the 157-line `[id]` file) | 🔴 **Unreachable** — only PATCH and DELETE are called. |

### 5.3 No journal AI / mood-logging endpoints

- **No `/api/journal/ai*`, no mood-writing endpoint, no prompt endpoint.**
- `grep journal|Journal` in `src/server/ai/**` → **no matches**. `src/server/ai/prompt.ts` (61 lines, `buildInsightPrompt`) is generic DAILY/WEEKLY/MONTHLY coaching and is **not** journal-aware.
- Mood in `/journal` writes only `JournalEntry.mood` (`Int?`). It **never** writes `MoodLog` — so a `/journal` mood is invisible to `/wellness/mood`, `/api/analytics`, and the scoring engine (which reads `MoodLog`). **Three parallel mood stores** — see §25.

---

## 6. Database dependency

### 6.1 Models read/written by `/journal`

| Model                | Purpose                  | Key fields used                                                                                                     | Rel. to User         | Rel. to "today"              | Read                      | Write                                              | Indirect                    |
| -------------------- | ------------------------ | -------------------------------------------------------------------------------------------------------------------- | -------------------- | ---------------------------- | ------------------------- | -------------------------------------------------- | -------------------------- |
| `JournalEntry`       | one entry per day        | `id,date,title,content,mood,energy,gratitude,isFavorite,isArchived,deletedAt`                                          | `userId`             | **`@@unique([userId,date])`** | ✅                     | ✅ (create, update, softDelete, restore, permanentDelete) | ✅            |
| `JournalRevision`    | a pre-edit snapshot      | `id,entryId,title,content,createdAt`                                                                                 | `userId`, `entryId`  | –                            | ✅ (history dialog)      | ✅ (on every title/content change; on revision restore) | ✅                          |
| `JournalEntryTag`    | entry ↔ tag join         | `entryId`, `tagId`                                                                                                   | via `JournalEntry`   | –                            | ✅                       | ✅ (`createMany` / `deleteMany`+`createMany` in a `$transaction`) | ✅             |
| `Tag`                | a label                  | `id,name,color` (**`icon` never used**)                                                                               | `userId`             | –                            | ✅ (nested)               | ✅ (`POST /api/tags` for a new tag name)              | ✅                          |
| `DailyReflection`    | the `/today` reflection  | `date`, `mood`, `energy`, `stress`, `focus`, `reflectionText`, `gratitude`, …                                         | `userId`             | `@@unique([userId,date])`    | ✅ **read-only**         | ❌                                                | ✅                          |
| `MoodLog`            | wellness mood            | `mood`, `energy`, `stress`, `anxiety`, `focus`                                                                       | `userId`             | `date`                       | ❌                       | ❌ **journal never writes here**                       | ✅                          |
| `User`               | account                  | `id`                                                                                                                 | —                    | –                            | ✅ (session only)         | ❌                                                |                             |
| `Attachment`         | a file on an entity      | `entityType` — **`'JOURNAL'` is a documented value** (`:2098`)                                                       | `userId`             | –                            | ❌                       | ❌ **no attachment UI or route targets journal**      | ✅                          |
| `Achievement`        | unlocked badges          | `type`, `title`, `level`                                                                                             | `userId`             | –                            | ✅ (`getStreakData`)      | ✅                                                | ✅                          |

### 6.2 `JournalEntry` — the full model (`schema.prisma:1565`–`:1596`, 32 lines)

```prisma
model JournalEntry {
  id     String @id @default(cuid())
  userId String
  user   User   @relation(fields:[userId], references:[id], onDelete: Cascade)
  date        String   // YYYY-MM-DD
  title       String?
  content     String   @db.Text
  mood        Int?     // 1-5
  energy      Int?     // 1-5
  gratitude   String?  // JSON array
  isFavorite  Boolean  @default(false)
  isArchived  Boolean  @default(false)
  tags        JournalEntryTag[]
  revisions   JournalRevision[]
  deletedAt   DateTime?
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  @@unique([userId, date])      // ⚠ ONE entry per user per day
  @@index([userId, isFavorite])
  @@index([isArchived])
  @@index([date, userId])
  @@index([userId, deletedAt])
}
```

⚠ **There is no `MoodType` enum, no `JournalType` enum, no `mood`/`prompt`/`gratitude` model.** `mood`, `energy`, `stress` and `focus` are all plain `Int? // 1-5`. `gratitude` is a `String?` holding a JSON array. A grep of the schema for `MoodType|JournalType` returns **0 hits**.

### 6.3 `JournalRevision` — only title + content are versioned (`schema.prisma:795`–`:808`)

```prisma
model JournalRevision {
  id        String       @id @default(cuid())
  entryId   String
  entry     JournalEntry @relation(..., onDelete: Cascade)
  userId    String
  user      User         @relation(..., onDelete: Cascade)
  title     String?
  content   String       @db.Text
  createdAt DateTime     @default(now())

  @@index([entryId, createdAt])
}
```

⚠ **Mood, energy, tags and gratitude changes are never snapshotted.** Restoring an old revision silently keeps the *current* mood/energy, so history and displayed state can disagree. See §24 F4.

### 6.4 `JournalEntryTag` (`schema.prisma:784`–`:793`, 10 lines)

```prisma
model JournalEntryTag {
  id      String       @id @default(cuid())
  entryId String
  entry   JournalEntry @relation(..., onDelete: Cascade)
  tagId   String
  tag     Tag          @relation(..., onDelete: Cascade)

  @@unique([entryId, tagId])
  @@index([tagId])
}
```

⚠ Unlike `GoalDayType`, there is **no denormalised `userId`** here — ownership is enforced purely through the parent entry.

### 6.5 Related models

| Model             | Lines | Relevance |
| ----------------- | ----- | --------- |
| `Tag`             | 731–749 | `name`, `color String?`, `icon String?`, `@@unique([userId, name])`, `journalEntries JournalEntryTag[]`. **`icon` is never written or read by journal.** |
| `DailyReflection` | 1533–1563 | **The `/today` reflection — a completely separate store.** Its own `mood`, `energy`, `stress`, `focus`, `reflectionText`, `biggestWin`, `biggestDifficulty`, `lessonsLearned`, `gratitude`, `improvements`, `tomorrowFocus`, `tomorrowPriorities`; `@@unique([userId, date])`. ⚠ **Not joined to `JournalEntry`.** `page.tsx:284`–`:291` sends the user to `/today` for "reflections" — the two mood records never sync. |
| `MoodLog`         | 1368–1395 | `mood Int //1-5`, `energy/stress/anxiety/focus Int?`, `triggers`/`activities` JSON, `location`, `weather`, `notes`. **Journal never writes here.** |
| `Attachment`      | 2093–2116 | `entityType String // GOAL, JOURNAL, REFLECTION, PROJECT, etc.` — `'JOURNAL'` documented, zero implementation. |
| `User`            | 394–523  | `journalEntries JournalEntry[]` `:466`, `journalRevisions JournalRevision[]` `:467` |

### 6.6 Fields on `JournalEntry` that `/journal` cannot write or reach

| Field          | Where it exists                          | Reachable? |
| -------------- | ---------------------------------------- | ---------- |
| `isFavorite`   | schema `:1571`, `createJournalEntrySchema`, `updateJournalEntrySchema`, `crud.ts:44`, rendered as a `Heart` at `JournalEntry.tsx:66`–`:68` | 🔴 **No UI sets it.** `toggleJournalFavorite` `crud.ts:261` has **zero callers, no route, no UI**. The Heart badge is therefore unreachable in practice. |
| `isArchived`   | schema `:1572`, validated, returned by the API, and filtered in `crud.ts:253` | 🔴 **No UI sets it and no UI exposes the filter.** `setJournalArchived` `crud.ts:273` has **zero callers**. |
| `gratitude`    | schema `:1570` (a JSON-string array), `createJournalEntrySchema`, `updateJournalEntrySchema`, `crud.ts:41`/`:96`, and the dead `export.ts` | 🔴 **No field on either route.** Only `/today`'s separate `DailyReflection.gratitude` exists in the UI. |
| `Tag.icon`     | schema `:735` | 🔴 never written or rendered |

---

## 7. Date, mood and tag logic

### 7.1 The two date helpers disagree about timezone

```
page.tsx:27–29
  toDateKey(date: Date | string): string
    return new Date(date).toISOString().slice(0,10)
    ⚠ UTC — NOT the user's timezone

[date]/page.tsx:13–22
  formatHeading(date: string): string
    new Date(`${date}T12:00:00`)                      ← ⚠ NO 'Z' → local noon
      .toLocaleDateString('en-US', {weekday, month, day, year})
    ⚠ T12:00:00 *local* is deliberate: it avoids the UTC-midnight
      off-by-one. (Contrast [date]'s own date-parsing above.)
    returns the raw string on NaN

JournalEditor.tsx:81
  const { today } = useUserTimezone()
    ⚠ NOT new Date().toISOString() — the comment at :78–80 records that
      this fixes entries filed under the previous day at 22:00 IST

lib/dates.ts:32–35
  getTodayString(tz)
    format(toZonedTime(new Date(), tz), 'yyyy-MM-dd')
    ⚠ tz is MANDATORY (the module comment at :1–13 explains why)
```

`toDateKey` is used for the `dateFilter` comparison at `page.tsx:121`–`:124`, where both sides are `YYYY-MM-DD` strings from the API — so the UTC coercion is harmless **there**. It is still a latent trap if it is ever handed a timestamp. §24 F2.

### 7.2 Mood rating vocabulary

```
JournalEntry.tsx   MOOD_COLORS  — a Record<number, string> of 5 hex colours
JournalEntry.tsx   MOOD_LABELS  — a Record<number, string>, presumably 1..5
JournalEditor.tsx:41   RATINGS = [1, 2, 3, 4, 5]     ← hard-coded, not shared
```

⚠ **Three independent definitions of the 1–5 scale.** `RATINGS` is not derived from `MOOD_LABELS`'s keys, so adding a 6th mood in one place would not propagate.

**Both pickers share `MOOD_COLORS`.** Energy is coloured with the same mood palette, and `Energy`'s `title` attribute shows mood words ("Bad"…"Great") on the Energy control. `JournalEditor.tsx:286`–`:333` is a plain function returning JSX, not a component, so its 10 buttons are re-created on every render.

### 7.3 Tag resolution — the page filters by **id**, the editor resolves by **name**

```
FILTER SIDEBAR                                     page.tsx:304–311
  <Select label="Tag">
    [{value:'', label:'All tags'}, ...tags.map(t => ({value: t.id, label: t.name}))]
  ⚠ the VALUE is t.id
  → filtered filter: h.tags?.some(t => t.tagId === tagFilter)   :120–123

EDITOR                                            JournalEditor.tsx:222–233
  const idByName = new Map(availableTags.map(t => [t.name, t.id]))
  for each tagName:
    exact match → push id
    no match    → push to `unresolved` (case-insensitively deduped)
  ⚠ the KEY is t.name
  → for each unresolved name: POST /api/tags, then (on 409) re-GET and match by name
```

**Two different vocabularies for the same tag.** It works because they meet at the database, but it means a tag renamed in one place and not the other would silently detach. §24 F3.

### 7.4 Search normalisation

```
lib/journal/search.ts:15–17
  normalizeSearchTerm(term) = term.trim().replace(/\s+/g,' ').toLowerCase()
```
Used only by `searchJournalEntries`, which is reachable only through the **dead** `/api/search/journal` route. `/journal`'s own search box — of which there is none; the search the user might expect is the dead ranked endpoint.

---

## 8. Complete user actions (serial)

### 8.1 On first mount of `/journal`

| # | Action                                | Mechanism                             | Requests |
| - | ------------------------------------- | ------------------------------------- | -------- |
| 1 | `AppProvider` mounts (root layout)     | `AppContext.tsx:535`–`:548`           | `GET /api/habits` (loop) ∥ `GET /api/routine` ∥ `GET /api/goals` — ⚠ **none read by `/journal`** |
| 2 | `useUserTimezone()` resolves           | `settings` → browser → `'UTC'`        | –        |
| 3 | `useEffect` gated on `userToday` → `load()` | `page.tsx:85`–`:104`             | `Promise.all([GET /api/journal?limit=100, GET /api/journal/deleted?limit=50, GET /api/tags])` |
| 4 | A **separate unawaited IIFE** fetches the reflection | `page.tsx:96`–`:101` — **not** inside `load()` | `GET /api/reflections?date=<userToday>` |
| 5 | `entries === null` → `<Spinner> py-16` | `:258`–`:261`                          | –        |
| 6 | `useCallback(load)` is stable, so the effect runs once | –                                 | –        |

**Total: 3 + N + 1.** ⚠ The reflection fetch is **outside** `load()`, so a failure in it sets `reflectionError` and nothing else — the docblock at `page.tsx:96`–`:101` records that the previous code set `false` on error and reported a 500 as a confident fact.

### 8.2 Entry actions

| # | User action                        | Handler                    | Optimistic | Requests | Follow-up |
| - | ---------------------------------- | -------------------------- | ---------- | -------- | --------- |
| 1 | Click **New entry**                  | `:231`                     | –          | –        | `setEditingId(null); setCreating(true)`; ⚠ the button is **hidden** while the editor is open |
| 2 | Type in the title / content / pickers / add a tag | `JournalEditor` local state | –          | –        | a 500 ms debounced draft write to `localStorage` |
| 3 | Click **Save** / **Create entry**    | `save()` `JournalEditor:198`–`:284` | ❌ | `POST /api/journal` or `PATCH /api/journal/[id]` `:270`–`:273` | `removeItem(draftKey)`; `setSavedMessage`; `onSaved(result)` |
| 4 | Click **Cancel** / **Close editor**  | `closeEditor` `:149`      | ❌          | –        | ⚠ **the draft is NOT cleared** — it stays in `localStorage` and reappears next time |
| 5 | Click an entry card                  | `onSelect` → `:456`        | –          | –        | `setCreating(false); setEditingId(id)` |
| 6 | Click **Edit** under a card          | `:477`–`:484`              | –          | –        | `setEditingId(id)` |
| 7 | Click **History** under a card        | `:485`–`:492`              | –          | `GET /api/journal/[id]/revisions` on dialog open | opens the `size="lg"` Dialog |
| 8 | Click **Restore** on a revision       | `JournalVersionHistory:72` | ❌          | `POST /api/journal/[id]/revisions/[revisionId]/restore` | `onRestored()` → `page.tsx:554` calls `load()` |
| 9 | Click **Delete** under a card         | `:493`–`:500`              | –          | –        | `setPendingDelete({id, title, permanent: false})` |
| 10 | Confirm **Move to trash** / **Delete forever** | `runDelete` `:159`–`:181` | ❌ | `DELETE /api/journal/[id]` **or** `DELETE /api/journal/[id]/permanent` `:165`–`:171` | closes the editor if it was open; `await load()` |
| 11 | Click **Restore** in the trash card   | `runRestore` `:183`–`:195` | ❌        | `POST /api/journal/[id]/restore` `:188`         | `await load()` |
| 12 | Click **Delete forever** in the trash card | same as #10 with `permanent: true` | ❌ | `DELETE /api/journal/[id]/permanent`       | `await load()` |
| 13 | Click a calendar day cell             | `onSelectDate` → `:296`    | –          | –        | `router.push(`/journal/${date}`)` |
| 14 | Click **Open today's reflection**      | `:284`–`:290`              | –          | –        | `router.push('/today')` |
| 15 | Type a tag in the `TagInput` and press Enter/comma | `TagInput` | –      | `POST /api/tags` **on save only** `:237` | on 409: re-`GET /api/tags` and match by name |

**Keyboard:** `TagInput` supports Enter, comma, Backspace, ↑/↓ and Esc. **Nothing else in the journal UI has a keyboard shortcut**; every other control is pointer-driven. `beforeunload` guards unsaved editor changes.

**There is no `<Link>` to `/journal` from `/journal/[date]`'s list context and no `<Link>` from `/journal` to `/journal/[date]`** — the calendar's `onSelectDate` is a `router.push`, not an anchor, so middle-click and open-in-new-tab do not work on a calendar day.

### 8.3 `/journal/[date]` actions

| # | User action           | Handler                  | Requests |
| - | --------------------- | ------------------------ | -------- |
| 1 | Page mounts           | `useEffect`              | `Promise.all([GET /api/journal?date=<d>, GET /api/tags])` `:40`–`:41` |
| 2 | Edit and **Save**     | `JournalEditor.save()`   | `PATCH /api/journal/[id]` |
| 3 | Click **← Back to journal** | `<Link href="/journal">` `:59`–`:65` | – |
| 4 | Empty state action    | `router.push('/journal')` `:99` | – |

**No `onCancel` prop is passed**, so the editor on this route has **no cancel button** — the only way out is the back link, and `beforeunload` does not fire on an SPA navigation. §24 F5.

---

## 9. What can the user create

| Thing                | Entry point                       | Request                                    | Validation                                | Notes |
| -------------------- | --------------------------------- | ------------------------------------------ | ----------------------------------------- | ----- |
| **A `JournalEntry`** | **New entry** → `JournalEditor` → Save | `POST /api/journal` `JournalEditor:271`  | `createJournalEntrySchema` `schemas/journal.schema.ts:3` | Title (optional, ≤200), content (required, ≤10000 after stripping HTML), `date`, `mood?` 1–5, `energy?` 1–5, `isFavorite?`, `isArchived?`, `gratitude?`, `tagIds?`. ⚠ The editor sends **only** `date`, `title`, `content`, `mood`, `energy`, `tagIds`. |
| **A `JournalRevision`** | **implicit** — on any title or content change | `PATCH /api/journal/[id]`               | –                                         | `crud.ts:88` snapshots the **existing** title and content **before** overwriting — correct ordering |
| **A `Tag`**          | typing a new name in `TagInput`, on save | `POST /api/tags` `JournalEditor:237`    | `createTagSchema`                          | On **409** (duplicate) it re-GETs the list and matches by name (`:246`) — the comment at `:211`–`:217` records this as a fix for silent data loss. |
| **`JournalEntryTag`** | implicit — `tagIds` on save       | via create / `PATCH`                      | cuid array                                | `createMany` on create; `deleteMany`+`createMany` in a `$transaction` on update |
| **A `DailyReflection`** | only on `/today`                 | `POST /api/reflections`                    | `reflectionSchema`                         | `/journal` **reads** it (`:91`) and links to it (`:285`); it never writes it |

---

## 10. What can the user edit

| Target                        | Entry point                        | Request                              | Validation                    | Notes |
| ----------------------------- | ---------------------------------- | ------------------------------------ | ----------------------------- | ----- |
| **An entry's title, content, mood, energy, tags** | the editor → **Save changes** | `PATCH /api/journal/[id]` `JournalEditor:271` | `updateJournalEntrySchema` `schema:15` + `journalEntryIdSchema` `:17` | **Up to 5 queries**: findById → createRevision → update → setTags → findById. ⚠ `mood`/`energy` are sent only when `!== null` (`JournalEditor:262`–`:265`), so clearing a rating is impossible. |
| **An entry's date**           | 🔴 **no UI**                        | the schema accepts `date`            | –                             | ⚠ `@@unique([userId, date])` means an edit into an occupied date throws P2002 |
| **`isFavorite`**              | 🔴 **no UI**                        | –                                    | –                             | `toggleJournalFavorite` is dead |
| **`isArchived`**              | 🔴 **no UI**                        | –                                    | –                             | `setJournalArchived` is dead |
| **`gratitude`**               | 🔴 **no UI**                        | –                                    | –                             | No field on either route |
| **The tag filter**            | the `Select` `:304`                 | –                                    | –                             | local only |
| **The date filter**           | the date `Input` `:313`             | –                                    | –                             | local only |
| **The page index**            | `Pagination` via `JournalList`      | –                                    | –                             | local only; **lost on reload** |
| **Trash visibility**          | the Show/Hide toggle `:346`         | –                                    | –                             | local only |

⚠ **`journalEntryQuerySchema.sortBy` / `.sortOrder` are validated and then silently ignored** — `journal.repository.ts:109` hard-codes `orderBy: {date:'desc'}`. §24 F8.

---

## 11. What can the user delete

| Target                         | Entry point                                       | Request                                  | Effect |
| ------------------------------ | ------------------------------------------------- | ---------------------------------------- | ------ |
| **An entry → trash**           | **Delete** under a card → "Move to trash?" confirm | `DELETE /api/journal/[id]` `page.tsx:169` | `crud.ts:158` → `repo.softDelete:221` → a `findFirst({id,userId})` guard, then `update({data:{deletedAt: new Date()}})`. **Reversible.** |
| **An entry → forever**         | **Delete forever** in the trash card → confirm     | `DELETE /api/journal/[id]/permanent` `page.tsx:165` | `crud.ts:187` → `repo.permanentDelete:262` → `journalEntry.delete({where:{id}})`. `JournalRevision` rows cascade. **Irreversible.** |
| **An entry → hard delete, bypass trash** | 🔴 **no path**                         | `repo.delete:187` via dead `crud.deleteJournalEntry:147` | ⚠ **no route ever hard-deletes**, and the dead method is the only caller of the dead `repo.delete` |
| **A `JournalRevision`**        | 🔴 **no UI**                                        | –                                        | Revisions are only removed by the `onDelete: Cascade` on their entry. They accumulate forever otherwise. |
| **A tag from an entry**        | `TagInput`'s remove affordance                       | via `PATCH` with the reduced `tagIds`     | `repo.setTags` does `deleteMany` + `createMany` in a transaction — ⚠ it **does not verify the tags belong to the user** |
| **A `Tag` itself**             | 🔴 **no UI anywhere**                                | –                                        | A tag whose last entry is removed stays in the `Tag` table forever |

### 11.1 The delete dialog is genuinely two-stage ✅

`page.tsx:159`–`:181` `runDelete` branches on `pendingDelete.permanent`:

- **Soft path** — title `"Move to trash?"`, `DELETE /api/journal/[id]`, reversible via the trash card.
- **Permanent path** — title `"Delete forever?"`, `DELETE /api/journal/[id]/permanent`, irreversible.

⚠ But the permanent path is only reachable **from inside the trash card**, so a user has to trash an entry and then permanently delete it. There is **no** "Delete forever" in the main list, and **no** "Delete" shortcut in the main list either — the two-step is enforced by the UI, which is the right call.

### 11.2 `/journal/[date]`'s empty state is a dead end 🔴

```
[date]/page.tsx:94–99
  <EmptyState
    icon={<PenLine/>}
    title="No entry for this day"
    action={ ??? → router.push('/journal') } />
```

There is **no way to create an entry for a past date**. Clicking an empty day cell in the calendar lands on a page whose only action navigates away. Combined with `@@unique([userId, date])`, the user's options for a past date are:

1. Create today's entry, then… nothing — the editor never sends a different `date`.
2. Go to `/journal` and create today's entry — which lands on today's date.

**So the `/journal/[date]` route is a read-and-edit view for existing entries, and a dead end for everything else.** §24 F1.

---

## 12. Cross-page dependencies

### 12.1 Inbound — what links to `/journal`

| Source                                                | Line | Targets |
| ----------------------------------------------------- | ---- | ------- |
| `components/layout/Sidebar.tsx`                       | `:27` | `/journal` |
| `components/layout/JumpTo.tsx`                        | `:43` | `/journal` |
| `app/(dashboard)/search/page.tsx`                     | `:72` | `/journal` — journal **search results go to the list, not to the entry** |

### 12.2 Inbound — what links to `/journal/[date]`

**Exactly one user action in the entire codebase:** clicking a day cell in `JournalCalendar`, which fires `onSelectDate(date)` then `router.push` to `/journal/{date}` (`page.tsx:296`).

Not linked from: the entry list, the entry card, the history dialog, the sidebar, the footer, `JumpTo.tsx`, `Sidebar.tsx`, or the search page. The only way back is the `<Link>` at `[date]/page.tsx:60`.

### 12.3 Outbound — what `/journal` depends on

| Data                    | Produced by                                          | Drift risk |
| ----------------------- | ---------------------------------------------------- | ---------- |
| `entries`               | `GET /api/journal?limit=100`                           | Hard-capped at **100**. The list paginates at `PAGE_SIZE = 6`, but there is no way to reach entry 101. |
| `hasTodayReflection`    | `GET /api/reflections?date=<userToday>`                | Correctly reported as *not known* on failure — `page.tsx:96`-`:101` records that the previous code set `false` on error and reported a 500 as a confident "Take today's reflection". |
| `tags`                  | `GET /api/tags`                                        | Low. |
| `today` / `userToday`   | `useUserTimezone()`                                    | The draft key and the new-entry date both derive from it, and there is **no** effect keyed on it for the entries list, so a timezone change mid-session does not refetch. |
| `AppContext.*`          | `AppContext.fetchAll()`                                | **Unused**, yet `DataErrorBanner` surfaces their failures. |

### 12.4 Who reads what `/journal` writes

| Reader                                                | What it reads |
| ----------------------------------------------------- | ------------- |
| `analytics/monthly.ts:150`, `analytics/yearly.ts:194`  | `JournalRepository.countByMonth(userId, year, month)` |
| `achievement.service.ts:153`                            | `JournalRepository.getStreakData(userId)` -> a `string[]` of distinct dates |
| `search.service.ts:159`, `lib/journal/search.ts:114`   | `JournalRepository.search(userId, term, limit)` |
| `/wellness/mood/page.tsx:9`, `wellness/MoodCalendar.tsx:15` | `MOOD_LABELS` / `MOOD_COLORS` — **but not journal data** |

**`JournalEntry.mood` is read by nobody outside this page's own calendar heatmap.** The three parallel mood stores mean a `/journal` mood reaches no dashboard, no score and no analytics. §25.

### 12.5 Cross-domain import inversion

```
components/wellness/MoodCalendar.tsx:15   ->  MOOD_COLORS from components/journal/JournalEntry.tsx
app/(dashboard)/wellness/mood/page.tsx:9  ->  MOOD_LABELS from components/journal/JournalEntry.tsx
```

**The wellness domain imports from `components/journal/**`.** `MOOD_COLORS` / `MOOD_LABELS` belong in `src/constants/`, alongside `constants/habit-tiers.ts` and `constants/routine.ts`.

---

## 13. Impact analysis

### 13.1 If `GET /api/journal` fails

- `error` is set; the `role="alert"` paragraph renders at `:246`-`:250`.
- The `entries === null` spinner at `:258`-`:261` is evaluated first, so on failure `entries` stays `null` and **the spinner shows forever** with the error paragraph above it. `entries === null` is the loading sentinel, and nothing ever sets it to `[]` on failure. §24 F8.
- The sidebar's reflection card and the calendar still work — they read other state.

### 13.2 If a **save** fails

- `JournalEditor`'s own `error` state is set (`:379`, `role="alert"` red).
- The **draft is retained** — `removeItem(draftKey)` only runs after a 2xx (`:274`). **This is the correct behaviour and the reason the draft system exists.**
- `onSaved` is not called, so the page does not reload.
- `actionError` on the **page** is set only for delete/restore failures, not save failures — those use the editor's own error. Two different error channels for two classes of mutation.

### 13.3 If a **tag creation** fails during save

`JournalEditor.tsx:235`-`:259`:

```
for each unresolved tag name:
  POST /api/tags
    2xx          -> use the returned id
    ApiError 409 -> re-GET /api/tags, match by name, use that id
    any other    -> THROW "Could not create tag <name>"
```

A non-409 failure **aborts the whole save** — the entry is not written even though the content is fine. The draft survives, so the user can retry. The comment at `:211`-`:217` records that the previous behaviour silently dropped the tags.

### 13.4 Blast radius of each write

| Action                | Writes                                                                              | Reversible? |
| --------------------- | ----------------------------------------------------------------------------------- | ----------- |
| Create an entry       | `JournalEntry` + `JournalEntryTag` rows; possibly a new `Tag`                      | Delete then Restore |
| **Edit title or content** | `JournalRevision` (snapshot) + `JournalEntry` + `JournalEntryTag` (delete+create)  | Yes, via the version-history dialog |
| **Edit mood/energy/tags only** | `JournalEntry` + `JournalEntryTag`. **No revision is created** — `crud.ts:86` only snapshots when `titleChanged \|\| contentChanged` | **No** — the previous mood is gone |
| Delete then trash     | `JournalEntry.deletedAt`                                                            | Restore |
| Delete forever         | `JournalEntry` + cascade `JournalRevision` + `JournalEntryTag`                        | **No** |
| Restore a revision     | `JournalRevision` (new snapshot of current) + `JournalEntry` (overwrite) in a `$transaction` | Yes — only by doing it again |

The middle row is the important one. `crud.ts:84`-`:88` computes `titleChanged` / `contentChanged` and only calls `createRevision` if either is true. So a user who changes their mood from 3 to 5 **loses the old value with no history**, while a typo fix is fully reversible. That is a defensible design (snapshotting every mood change would flood the table) but it is **not** what "Version history" implies in the UI.

### 13.5 Effects on other domains

- **Achievements** depend on `getStreakData` — the count of **distinct dates with a non-deleted entry**. Deleting today's entry immediately lowers the journal streak.
- **Analytics** (`monthly.ts:150`, `yearly.ts:194`) count entries per month via `countByMonth`, which filters `deletedAt: null`. Trashing an entry retroactively changes a past month.
- **Search** (`search.service.ts:159`, `lib/journal/search.ts:114`) filters `deletedAt: null` too, so a trashed entry disappears from `/search` immediately.
- **Nothing else reads `JournalEntry`.** Focus minutes, habits, goals and routines are entirely unaffected.

---

## 14. Current System Capabilities

What `/journal` demonstrably does today:

1. **Creates and edits a journal entry** with title, rich-text content, mood (1-5), energy (1-5) and tags.
2. **Files one entry per calendar day**, keyed on the user's timezone.
3. **Autosaves a draft to `localStorage` 500 ms after every keystroke**, restores it on the next open, and shows a "draft restored" notice only when the draft actually differed from the saved baseline.
4. **Warns before losing unsaved work** with a `beforeunload` guard (modern-browser-correct: `preventDefault()` with no `returnValue`).
5. **Values the content defensively** — `readDraft` type-checks every field, `Array.isArray`-filters `tagNames`, and wraps everything in `try/catch`; the quota failure on the write side is swallowed too.
6. **Shows a month calendar heatmap** tinted by each day's recorded mood, with today ringed and a colour legend.
7. **Filters** by tag and by exact date, with a distinct "No entries match these filters" state separate from the empty state.
8. **Paginates** at 6 entries per page with numbered links and ellipsis.
9. **Soft-deletes, restores and permanently deletes**, with two differently-worded confirmations and the permanent path gated behind the trash.
10. **Snapshots a revision before every title or content overwrite**, and offers a version-history dialog with per-revision restore — transactionally, so restoring itself is undoable.
11. **Creates tags inline** on save, including a 409-conflict recovery path that re-fetches and matches by name.
12. **Surfaces the `/today` reflection state** in the sidebar as a shortcut, with four distinct copy states (error / not-yet-written / written / loaded) — and correctly reports *not* knowing on fetch failure.
13. **Clears a mood or energy rating** with a dedicated "Clear" button and a toggle-off click.
14. **Exposes a per-day route** at `/journal/[date]` for reading and editing a specific entry.

---

## 15. Currently NOT Supported

### 15.1 Dead exported functions in `src/lib/journal/crud.ts` — 4 of 18

| Export                        | Line | Why dead |
| ----------------------------- | ---- | -------- |
| `getJournalEntryByDate`       | 120  | No caller; no route uses it. Its only consumer would be `JournalRepository.findByDate` (`:91`), which is therefore transitively dead. |
| `deleteJournalEntry` (hard)   | 147  | No caller; **no route ever hard-deletes**. Its only consumer is `JournalRepository.delete` (`:187`), also dead. |
| `toggleJournalFavorite`       | 261  | **No caller, no route, no UI** — yet `isFavorite` is a schema column, is validated on create and update, is returned by every read, and is **rendered as a Heart badge** at `JournalEntry.tsx:66`-`:68`. |
| `setJournalArchived`          | 273  | **No caller, no route, no UI** — yet `isArchived` is validated and is filtered in `crud.ts:253`. |

### 15.2 Dead repository methods — 2 of 17

| Method       | Line | Note |
| ------------ | ---- | ---- |
| `findByDate` | `:91`  | only reachable through dead `getJournalEntryByDate` |
| `delete`     | `:187` | only reachable through dead `deleteJournalEntry` |

Unused `BaseRepository` helpers: `exists` `:31`, `verifyOwnership` `:42`, `buildOrderQuery` `:78`, `isUniqueConstraintError` `:90`.

### 15.3 Dead API routes — 3 files + 1 handler

`/api/journal/entries` (105) · `/api/journal/[id]/tags` (95) · `/api/search/journal` (48) · `GET /api/journal/[id]`.

**`/api/journal/entries` also violates the Zod policy** with a hand-rolled regex (`:23`) and manual pagination checks (`:39`-`:44`).

### 15.4 Dead files

- **`src/lib/journal/export.ts` — 125 physical lines, ZERO importers.** Seven exports: `JournalExportFormat`, `parseGratitude`, `entryToMarkdown`, `journalEntriesToMarkdown`, `journalEntriesToJson`, `exportJournalEntries`, `journalExportFilename`. **No export or download button exists anywhere in the journal UI.** `src/app/api/export/**` and `server/services/backup.service.ts` do not use it either.
  `parseGratitude` here (`:14`-`:30`) duplicates an unrelated local `parseGratitude` at `components/today/DailyReflection.tsx:43` — same name, different signature, same logic.
- **`src/app/api/journal/entries/route.ts` — 105 lines.**

### 15.5 Dead types — `src/types/journal.ts` (246 lines, ~85 % unused)

Used: `JournalEntryWithRelations` `:16`, `JournalSearchResult` `:163` (via `lib/journal/search.ts`).

**Zero-consumer exports:** `JournalEntryListItem` `:23` · `JournalGratitudeItem` `:42` (only the dead `export.ts`) · `JournalTagAssignment` `:47` · `CreateJournalEntryInput` `:56` · `UpdateJournalEntryInput` `:67` · `CreateJournalEntryResponse` `:78` · `UpdateJournalEntryResponse` `:84` · `AddJournalTagsInput` `:94` · `RemoveJournalTagInput` `:99` · `ToggleJournalFavoriteInput` `:108` · `ToggleJournalFavoriteResponse` `:113` · `ArchiveJournalEntryInput` `:119` · `ArchiveJournalEntryResponse` `:124` · `Pagination` `:134` · `JournalEntryQueryParams` `:141` · `JournalListResponse` `:157` · `JournalAnalytics` `:176` · `JournalMoodTrendPoint` `:203` · `JournalStreak` `:209` · `JournalWordStats` `:215` · `isJournalEntryWithRelations` `:225` · `isValidJournalMoodRating` `:236` · `JournalEntriesByMonth` `:244` · `JournalGratitudeList` `:246`.

`CreateJournalEntryInput` / `UpdateJournalEntryInput` here are **shadowed** by the identically-named Zod-inferred types in `src/schemas/journal.schema.ts:45`-`:46`. A real collision trap.

### 15.6 Unused props and unreachable UI

| Item                                    | Where                          | Note |
| --------------------------------------- | ------------------------------ | ---- |
| `JournalCalendarProps.entries` + `JournalCalendarEntry` | `JournalCalendar.tsx:20`-`:23`, `:26` | Only `moodByDate` is ever passed (`page.tsx:295`). The `entries` branch `:68`-`:70` is dead. |
| `JournalCalendarProps.initialMonth`    | `JournalCalendar.tsx:31`       | **Never passed anywhere.** |
| `parseMonth(value?)` optional branch    | `JournalCalendar.tsx:35`-`:44` | only reachable via `initialMonth` — dead |
| `JournalCalendarProps.className`        | `:32`                          | never passed |
| `JournalEditorProps.className`          | `JournalEditor.tsx:38`         | never passed by either route (consumed in `cn('p-5', className)` `:336`) |
| `JournalListProps.className`            | `JournalList.tsx:26`           | never passed |
| `JournalVersionHistoryProps.className`  | `:22`                          | never passed |
| `RichTextEditor` `label`, `disabled`, `showToolbar` | `RichTextEditor.tsx:42`-`:46` | journal passes only `value`/`onChange`/`placeholder` |
| **`isFavorite` (Heart badge)**          | `JournalEntry.tsx:66`-`:68`    | rendered but **unreachable in practice** — nothing in the app can set it |
| `isArchived`                            | returned by the API            | never settable, never filterable in the UI |
| `gratitude`                             | schema + repo + `export.ts`    | no field on either route |
| **`journalEntryQuerySchema.sortBy` / `.sortOrder`** | `schema:38`-`:39` | validated, then **silently ignored** — `findAll` hard-codes `orderBy: {date:'desc'}` |
| `Tag.icon`                              | `schema:735`                   | never written or rendered |
| `Attachment.entityType = 'JOURNAL'`     | `schema:2098`                  | documented value, zero implementation |
| `Stagger`'s `className` / `delay` / `id` | `today/ui.tsx:305`-`:319`    | `page.tsx:220` passes only children |

### 15.7 Missing entirely

- **No export / download.** `lib/journal/export.ts` implements markdown and JSON export; no UI calls it.
- **No `isFavorite` UI**, despite the column, the schema, the service function and the badge.
- **No `isArchived` UI**, despite the column, the schema, the service function and a server-side filter branch.
- **No `gratitude` field**, despite the column, the JSON (de)serialisation in `crud.ts:41`/`:96` and a full markdown renderer.
- **No search box** on the page — the ranked search endpoint exists and is dead.
- **No attachments**, despite `Attachment.entityType = 'JOURNAL'`.
- **No pagination beyond entry 100.** `limit: 100` is hard-capped client-side; the server accepts `offset` but the page never sends it.
- **No sort control**, despite two validated query params.
- **No filters beyond tag and exact date** — no mood filter, no favourite filter, no archived filter, no text filter, no date *range*.
- **No way to create a back-dated entry.** §11.2
- **No filters or pagination in the URL**, so both are lost on reload.
- **No `loading.tsx` / `error.tsx`** of its own.
- **No offline support.** Every write is a raw `apiRequest`; nothing enqueues to `routineos_offline_queue`.
- **No revision pruning.** `JournalRevision` rows accumulate forever.
- **No AI surface at all** — no journal prompt, no journal summary, no journal insight.
- **No `moodLog` write**, so the mood never reaches `/wellness`, `/analytics` or the score.
- **No tests.** Nothing in `tests/` covers journal, `crud.ts`, `JournalRepository`, or any of the five components.

---

## 16. Loading / Error / Empty / Edge states

### 16.1 Loading

| State                        | Trigger                        | Rendering |
| ---------------------------- | ------------------------------ | --------- |
| **Route loading**            | server/client navigation       | `(dashboard)/loading.tsx` -> `<PageSkeleton />`. **Never fires** — both pages are Client Components that render synchronously. |
| **`/journal` initial**       | `entries === null`              | `<Spinner class="h-6 w-6"/>` centred, `py-16` `:258`-`:261`. **The whole two-column grid is hidden**, so the sidebar's calendar and filters are absent during load. |
| **`/journal/[date]`**        | `entries === null`              | `<Spinner>` `:80`-`:83` |
| **Calendar month switch**    | chevron click                   | No loading state — it recomputes locally from `moodByDate` |
| **Revision history**         | `JournalVersionHistory` loading | `<Spinner>` inside the dialog |
| **Save**                     | `saving`                        | `Button isLoading` -> `disabled` + `aria-busy` (`Button.tsx:42`); the `Save` icon is hidden and the label swaps |
| **Delete / Restore**         | `busyId`                        | the row's buttons `disabled`; the confirm button `isLoading={busyId !== null}` |

### 16.2 Error

**Three separate error channels on the page**, each with its own `role="alert"`:

| Error             | Where set                          | Surface |
| ----------------- | ---------------------------------- | ------- |
| `error`           | `load()`'s catch `:66`-`:83`       | `<p role="alert">` at `:246`-`:250`. **Does not clear `entries`, so the spinner at `:258` shows forever underneath it.** |
| `actionError`     | `runDelete` `:180` / `runRestore` `:194` | `<p role="alert">` at `:252`-`:256` |
| `reflectionError` | the **separate, unawaited** IIFE `:96`-`:101` | `<p role="alert">` at `:279`-`:283`, inside the sidebar card, and the card's body becomes a 4-way ternary |
| `JournalEditor.error` | `validate()` failure `:200` or a thrown save `:281` | `<p role="alert">` red at `:379` |
| `JournalEditor.savedMessage` | after a 2xx `:275` | `<p role="status">` green at `:382` |
| `JournalEditor.draftRestored` | the restore effect `:129` | `<p role="status">` blue at `:340`-`:347` |
| `JournalVersionHistory.error` | its fetch | `<p role="alert">` inside the dialog |
| **A 409 tag conflict** | `JournalEditor:243`-`:250` | **recovered silently** — re-`GET /api/tags` and match by name |
| render crash       | any                                 | `(dashboard)/error.tsx` (97 lines). No journal-specific boundary. |

**Positive:** the editor distinguishes `role="alert"` (error) from `role="status"` (success and draft-restored) correctly, and the save-failure path **keeps the draft**.

### 16.3 Empty

| Condition                                        | Rendering |
| ------------------------------------------------ | --------- |
| `entries` loaded, `filtered.length === 0`, **filters active** | a "No entries match these filters." `<Card>` at `:449`-`:454` — **distinct from the truly-empty case** |
| `filtered.length === 0`, no filters, no entries  | `<EmptyState>` from `JournalList.tsx` with the `renderActions` slot |
| `deletedEntries.length === 0` and trash open     | "Trash is empty." `:363`-`:365` |
| `/journal/[date]` with no entry                  | `<EmptyState icon={<PenLine/>} title="No entry for this day" action -> /journal />` `:94`-`:99` |
| Revision history with none                       | "No version history yet." |
| `hasTodayReflection === null`                    | the sidebar card says it hasn't been checked (not that it doesn't exist) |

### 16.4 Edge cases

| Edge case                                              | Handling |
| ------------------------------------------------------ | -------- |
| **An empty calendar day cell**                          | `/journal/[date]` renders a dead-end `EmptyState` whose only action navigates away. §24 F1 |
| **An entry that exists only in the trash**              | `historyEntry` at `:141`-`:147` searches **both** `entries` and `deletedEntries`, so the history dialog opens correctly for a trashed entry |
| **`page` beyond `pageCount` after a delete**            | `safePage` `:130` clamps the index |
| **Editor remount between entries**                      | `key={editing?.id ?? 'new'}` `:433` forces a full remount so `draftAppliedForKey` resets and draft restore re-runs |
| **A draft identical to the saved baseline**              | not restored (`:117`-`:124`), so no spurious "draft restored" banner |
| **Mood cleared to `null`**                              | the payload spreads `...(mood !== null ? {mood} : {})` `:262` — **which means clearing sends nothing, so the server keeps the old value** |
| **`localStorage` throws**                               | every access wrapped in `try/catch` (`:244`, `:421`, `:507`, `:549`) — degrades to in-memory |
| **A tag name that collides case-insensitively**          | the 409 path matches by exact name after re-fetch; a `Campus`/`campus` pair would fail to match and abort the save |
| **`toDateKey` given a timestamp**                       | coerces to **UTC**, which is wrong for a user at a negative offset. Harmless today (both sides are `YYYY-MM-DD` strings) |
| **Editing an entry's `date` into an occupied slot**      | no UI sends `date`; the schema allows it, so a raw PATCH would throw P2002 |
| **A draft from a previous day**                         | the new-entry draft key is `journal-draft:date:${today}` — **a new day means a new key**, so yesterday's abandoned new-entry draft is orphaned forever |
| **`/journal/[date]` with no `onCancel`**                | the editor has **no cancel button** on this route, and `beforeunload` does not fire on SPA navigation |

---

## 17. Authentication & security

| Concern                | Reality |
| ---------------------- | ------- |
| Session enforcement    | Every journal endpoint performs `await auth()`. `journal/route.ts:18` (GET) and `:112` (POST); `[id]:71, :129`; `permanent:29`; `restore:25`; `deleted:12`; `revisions:26`; `[revisionId]/restore:26`; `tags:21, :44`. |
| User identity          | **All 12 endpoints derive `userId` from `session.user.id` after `await auth()`.** No client-supplied `userId` is trusted anywhere. |
| Ownership on write     | `journal.repository.ts` uses `where: {id: entryId, userId}` on `update` (`:168`) and `delete` (`:187`) — Prisma's compound-unique trick, so a wrong-owner write throws. `softDelete` (`:221`), `restore` (`:241`) and `permanentDelete` (`:262`) each begin with a `findFirst({id, userId})` guard and throw `'Journal entry not found'`. |
| Ownership on revision  | `createRevision` `:282`, `listRevisions` `:306` and `restoreRevision` `:331` all guard with `{entryId, userId}`, and `restoreRevision` additionally requires `{id: revisionId, entryId, userId}` — so a user cannot restore another user's revision onto their own entry. |
| **Tag ownership is NOT verified** | `JournalRepository.setTags` (`:371`-`:391`) does `deleteMany` + `createMany` in a transaction **without checking the tags belong to the user**. Contrast `src/lib/tags/manager.ts:169`-`:176` `setEntityTags`, which **does** (`prisma.tag.findMany({where:{id:{in:[...tagIds]}, userId}})`). **Two competing implementations; only the unchecked one is wired up.** §24 F3 |
| Input validation       | `createJournalEntrySchema` `schema:3`, `updateJournalEntrySchema` `:15`, `journalEntryIdSchema` `:17`, `journalRevisionIdSchema` `:21`, `deletedJournalQuerySchema` `:26`, `journalEntryQuerySchema` `:31` — all in one shared module. |
| **Routes that bypass Zod** | `/api/journal/entries` uses a **hand-rolled regex** at `:23` and manual `Number.isNaN` pagination checks at `:39`-`:44`. `/api/journal/[id]/tags` uses an **inline** schema at `:6`-`:8`. `GET /api/tags` and `GET /api/reflections` have **no** schema (the latter only a presence check at `:20`-`:25`). |
| **XSS** | `ui/RichTextEditor.tsx` is `contentEditable` + `document.execCommand`. Its own header comment at `:9`-`:11` warns it is **deprecated and an XSS risk**. Journal content is stored and **rendered unsanitised** — `JournalEntry.tsx` and `JournalVersionHistory` strip HTML for the *preview* only; the editor renders the raw stored value back into a `contentEditable`. **There is no sanitiser anywhere in the journal path.** |
| `title` length          | <=200 in the schema and `maxLength={200}` on the input — and the client `validate()` `:191` mirrors it |
| `content` length        | <=10000 in the schema; the client `validate()` `:190` **strips HTML then** checks length, so a 10,000-character payload of tags is rejected client-side |
| `mood` / `energy` range | 1-5 ints |
| CSRF                   | Same-origin cookie JWT, `credentials:'include'`. **No CSRF token.** |
| Rate limiting          | **None** on any journal route. A PATCH triggers up to 5 queries including a revision insert, and is unlimited. |
| `beforeunload`          | `preventDefault()` when `dirty && !saving`, **no `returnValue`** — the modern-browser-correct form |
| a11y: ratings          | 5 buttons with `title={MOOD_LABELS[rating]}` and `aria-pressed={selected}`. **No `role="radiogroup"`** on the group, so `title` is the only accessible name. |
| a11y: filters          | `Select label="Tag"` and `Input label="Date"` are properly associated via `useId` |
| a11y: errors           | every error uses `role="alert"`; successes use `role="status"` |
| a11y: the calendar     | each day cell fires `onSelectDate`. **No `role="grid"`, no arrow-key navigation, no `aria-label` describing the date on the cell** — the "today ring" is visual only. |
| a11y: nav              | the calendar's day cells are `router.push` handlers, **not anchors** — so middle-click / open-in-new-tab / "copy link address" do not work. |
| `tsconfig` strictness  | `strict`, `noUnusedLocals`, `noUnusedParameters`, `noUncheckedIndexedAccess` all on. |
| Lint                   | Exactly **one** `eslint-disable` in the whole journal domain: `page.tsx:87` — `// eslint-disable-next-line react-hooks/set-state-in-effect -- mount data fetch` |
| TODO / FIXME / HACK    | **Zero** in any journal file — no `TODO`, `FIXME`, `HACK`, `XXX`, `@ts-ignore` or `@ts-expect-error`. The only annotations are explanatory comments. |

---

## 18. Performance

### 18.1 Request cost

| Metric                          | Value |
| ------------------------------- | ----- |
| Requests on first paint          | **3 + N** — `Promise.all([/api/journal?limit=100, /api/journal/deleted?limit=50, /api/tags])` **plus** a separate unawaited `/api/reflections?date=` |
| Requests loaded and discarded    | **3 of 4** — `/api/habits`, `/api/routine`, `/api/goals` from `AppContext` |
| Requests per **save**            | **1 + N** — one `POST`/`PATCH`, **plus one `POST /api/tags` per new tag name**. Worst case: resolve 3 unresolved names, then 1 PATCH + 3 POSTs (or 1 PATCH + 1 GET + 3 POSTs if a 409 occurs) |
| Queries per PATCH (server)       | **up to 5** — findById, createRevision, update, setTags (delete+create in a transaction), findById |
| Queries per POST (server)        | **2** — `create` then `findById` (`crud.ts:37`, `:43`) |
| Requests per filter change       | **0** — client-side |
| Requests per page change         | **0** — client-side, over the already-fetched 100 |
| Pollers                          | **none** |

### 18.2 Render cost

- **`JournalEditor` is 416 lines with 11 `useState`.** Every keystroke sets `content`, which re-renders the whole `contentEditable` subtree and re-creates the 10 rating buttons, because `picker` (`:286`) is a plain function returning JSX rather than a component.
- The **500 ms autosave debounce** (`:147`-`:168`) fires a `JSON.stringify` of the entire draft, including the full rich-text HTML, on every pause in typing.
- `dirty` (`:133`-`:143`) does a **field-by-field diff including an order-insensitive tag comparison** on every render.
- `filtered` (`:114`) sorts then filters on `[entries, tagFilter, dateFilter]`; `paged` (`:131`) slices. Both memoised.
- `moodByDate` (`:106`) builds a `Map` from `entries` — memoised.
- `JournalCalendar` recomputes its 42-cell grid on every `entries` change, which is fine (6 entries per page).

### 18.3 Query cost

- `findAll` (`:109`) includes `{tags:{include:{tag:true}}, _count:{select:{tags:true}}}` — so `limit: 100` is 100 entries plus a per-entry tag join plus a per-entry tag count. **None of which the page reads**: it uses `entry.tags[].tag.name` for chips and `entry.mood` for the heatmap, but never `_count.tags`.
- `listRevisions` (`:306`) loads **all** revisions for an entry with no `take` — an entry edited 500 times loads 500 rows.
- `findDeleted` (`:200`) loads the trash on every single `load()`, i.e. **on every page mount, every save, every delete and every restore** — even when the trash card is collapsed. `showTrash` only controls whether it is *rendered*, not whether it is *fetched*.
- `restoreRevision` (`:331`) uses `this.transaction` correctly.

### 18.4 Known waste

| # | Waste                                                              | Where |
| - | ------------------------------------------------------------------ | ----- |
| 1 | `/api/habits` + `/api/routine` + `/api/goals` fetched and discarded  | `AppContext.tsx:546`, `:556`-`:586` |
| 2 | **The trash is fetched on every `load()`** even when collapsed       | `page.tsx:73`-`:75` inside the `Promise.all` at `:67` |
| 3 | `POST /api/journal` is followed by `findById`                       | `crud.ts:37`, `:43` — 2 queries per create. `create` could return the relations. |
| 4 | `PATCH` is followed by `findById`                                  | `crud.ts:37`, `:43` — the same, on the create path |
| 5 | `_count: {tags: true}` computed and never read                       | `journal.repository.ts:109` |
| 6 | **`Stagger` pulls the entire 402-line `today/ui.tsx`** for one animation wrapper | `page.tsx:23`, `:220` |
| 7 | The UI barrel pulls **26 modules** for the 7 it renders               | `page.tsx:19`, `Editor:24`, `VersionHistory:16`, `[date]:10` |
| 8 | `listRevisions` has no `take`                                        | `journal.repository.ts:306` |

---

## 19. External integrations

**None. The journal domain has zero AI and zero third-party surface.**

- **No AI call.** `grep journal|Journal` in `src/server/ai/**` returns **no matches**. `src/server/ai/prompt.ts` (61 lines) exports only `buildInsightPrompt(data, 'DAILY'|'WEEKLY'|'MONTHLY')`, which is generic coaching and **not** journal-aware. `src/server/ai/insight.service.ts` never reads a `JournalEntry`.
- **No e-mail, no web push, no calendar sync, no billing call, no upload, no external API.**
- `Attachment.entityType = 'JOURNAL'` is a documented value in the schema (`:2098`) with **no** attachment UI, route or provider.

---

## 20. Background jobs / cron effects

`/journal` has no cron-driven behaviour, but it is a **writer** of data three subsystems read:

| Reader | Method | Effect of a journal write |
| ------ | ------ | ------------------------ |
| **Achievements** | `achievement.service.ts:153` -> `JournalRepository.getStreakData(userId)` -> a `string[]` of distinct non-deleted dates | A journal entry advances the journal streak; **deleting today's entry immediately lowers it.** |
| **Analytics (monthly)** | `analytics/monthly.ts:150` -> `countByMonth(userId, year, month)` — filters `deletedAt: null` | Trashing an entry **retroactively changes a past month's count.** |
| **Analytics (yearly)** | `analytics/yearly.ts:194` -> the same method | same |
| **Search** | `search.service.ts:159`, `lib/journal/search.ts:114` -> `journalRepository.search(userId, term, limit)` — filters `deletedAt: null` | A trashed entry disappears from `/search` immediately |
| `compute-daily-scores` cron | — | **Journal never enters `DailyScore`.** `scoring.service.ts` reads `Habit`, `HabitLog`, `RoutineLog`, `SleepLog`, `UserSettings` — **not** `JournalEntry`. |

**Net:** writing a journal entry moves achievements and analytics; it does **not** move the score, and its `mood` does not move `/dashboard`, `/wellness` or `/analytics` either (§25).

---

## 21. Data flow diagrams

### 21.1 Page load

```
  Browser
    │
    ├─ root layout mounts AppProvider ─────────────────────────────────┐
    │   Promise.all: GET /api/habits || /api/routine || /api/goals   │
    │   -> all three DISCARDED by /journal                            │
    │                                                                   │
    ├─ useUserTimezone() -> { timezone, userToday }                    │
    │                                                                   │
    ├─ useEffect [userToday] -> load()          page.tsx:85-104         │
    │     Promise.all:                                                │
    │       ├─ GET /api/journal?limit=100                             │
    │       ├─ GET /api/journal/deleted?limit=50   <- fetched even     │
    │       │                                         when collapsed   │
    │       └─ GET /api/tags                                           │
    │                                                                   │
    ├─ SEPARATE unawaited IIFE  page.tsx:96-101                      │
    │     └─ GET /api/reflections?date=<userToday>                    │
    │           -> hasTodayReflection | reflectionError               │
    │           NOT part of load(); a failure affects only the card    │
    │                                                                   │
    └─ render  entries === null ? <Spinner py-16>  : <two-column grid>  :258 / :263
```

### 21.2 Saving an entry

```
  user types / picks a rating / adds a tag
    │
    ├─ 500 ms debounce -> localStorage.setItem(draftKey, JSON)   :162
    │     swallowed quota errors
    │
  user clicks Save / Create entry
    │
    ├─ validate()                                  :185-191
    │     strip HTML -> content non-empty?
    │     content.length <= 10000?  title.length <= 200?
    │
    ├─ resolve tag NAMES -> ids                     :222-233
    │     exact match against availableTags
    │     no match -> push to `unresolved` (case-insensitive dedupe)
    │
    ├─ for each unresolved name                    :235-259
    │     POST /api/tags
    │       2xx        -> use the id
    │       409       -> GET /api/tags, match by name, use that id
    │       anything  -> THROW "Could not create tag"
    │                   => THE WHOLE SAVE IS ABORTED (draft survives)
    │
    ├─ payload: { date, title?, content,
    │             ...(mood   !== null ? {mood}   : {}),
    │             ...(energy !== null ? {energy} : {}),
    │             tagIds }                        :261-268
    │     isFavorite / isArchived / gratitude are NEVER sent
    │
    ├─ POST /api/journal  |  PATCH /api/journal/[id]   :270-273
    │     │
    │     ├─ auth()  +  Zod parse
    │     └─ lib/journal/crud.ts
    │          POST:  createJournalEntry       :33
    │                   -> repo.create                       -> JournalEntry + tags
    │                   -> repo.findById                      <- query #2
    │          PATCH: updateJournalEntry      :60
    │                   -> schema.parse
    │                   -> repo.findById                      <- query #1
    │                   -> titleChanged || contentChanged ?
    │                       yes -> repo.createRevision  <- SNAPSHOT BEFORE OVERWRITE  :88
    │                   -> repo.update                       <- query #3
    │                   -> tagIds !== undefined ? repo.setTags  <- queries #4 (tx)  :99
    │                   -> repo.findById                      <- query #5
    │
    ├─ removeItem(draftKey)                         :274   only after a 2xx
    ├─ setSavedMessage('Changes saved - previous version kept in history.')  :275
    └─ onSaved(result) -> page.tsx:154 handleSaved -> await load()
```

### 21.3 Deleting and restoring

```
  Delete under a card
    └─ setPendingDelete({ id, title, permanent: false })   :500
         └─ <Dialog> "Move to trash?"  :509-539
              └─ runDelete()                        :159
                   DELETE /api/journal/[id]               :169
                     -> crud.softDelete :158 -> repo.softDelete :221
                        findFirst({id,userId}) guard -> update({deletedAt: now})

  Delete forever inside the trash card
    └─ setPendingDelete({ id, title, permanent: true })
         └─ <Dialog> "Delete forever?"              :509-539
              └─ runDelete()
                   DELETE /api/journal/[id]/permanent              :165
                     -> crud.getJournalEntryIncludingDeleted :133
                        -> repo.findById(userId, id, includeDeleted=true)
                     -> crud.permanentlyDeleteJournalEntry :187
                        -> repo.permanentDelete :262 -> journalEntry.delete({where:{id}})
                        -> JournalRevision rows CASCADE

  Restore  (either path)
    └─ runRestore()                              :183
         POST /api/journal/[id]/restore            :188
           -> crud.restoreJournalEntry :173 -> repo.restore :241
              findFirst({id,userId}) guard -> update({deletedAt: null})

  either way -> await load()   -> 3 requests + the reflection IIFE
```

### 21.4 The revision lifecycle

```
  user edits title or content -> Save
    │
    ├─ repo.findById                       <- read the CURRENT state
    ├─ titleChanged || contentChanged ?
    │     ├─ yes -> repo.createRevision(userId, entryId, existing.title, existing.content)
    │     │          SNAPSHOTS THE OLD VALUE, NOT THE NEW ONE
    │     └─ no  -> NO REVISION.  A mood-only or tag-only edit is
    │              silently unrecoverable.
    └─ repo.update  <- overwrite

  user opens History -> GET /api/journal/[id]/revisions  (no take)
  user clicks Restore on a revision
    └─ POST /api/journal/[id]/revisions/[revisionId]/restore
         └─ repo.restoreRevision                        journal.repository.ts:331
              $transaction:
                tx.journalEntry.findFirst       guard
                tx.journalRevision.findFirst   guard {id, entryId, userId}
                tx.journalRevision.create      <- snapshot the CURRENT state
                                                    => the restore is ITSELF undoable
                tx.journalEntry.update         <- overwrite title + content
              mood / energy / tags / gratitude are NOT touched by the
                restore and NOT captured by the snapshot - so restoring an
                old revision keeps the CURRENT mood.
```

---

## 22. File-by-file dependency inventory

Physical line counts. Paths relative to the repo root.

### 22.1 Route files

| File                                         | Physical | Non-blank | Directive | Export |
| -------------------------------------------- | -------- | --------- | --------- | ------ |
| `src/app/(dashboard)/journal/page.tsx`        | **564** | 534 | `'use client'` L1 | `default function JournalPage()` L45 |
| `src/app/(dashboard)/journal/[date]/page.tsx` | **103** | 92  | `'use client'` L1 | `default function JournalDatePage()` L28 |

**That is the entire tree under `journal/`** — no `loading.tsx`, `error.tsx`, `layout.tsx`, `not-found.tsx` or `template.tsx`. Inherited from the group: `layout.tsx` (69), `loading.tsx` (5), `error.tsx` (97).

Local declarations: `toDateKey` `:27`-`:29` · `PAGE_SIZE = 6` `:31` · `interface PendingDelete` `:33`-`:37` · `formatHeading` `[date]:13`-`:22`.

### 22.2 Components — `src/components/journal/` (5 files, **zero dead**)

| File                        | Physical | Directive | Exports | Importer(s) | Reachable? |
| --------------------------- | -------- | --------- | ------- | ----------- | ---------- |
| `JournalEditor.tsx`         | **416** | `'use client'` | default (`:416`) | `journal/page.tsx:22` (`:431`), `journal/[date]/page.tsx:11` (`:85`) | both routes |
| `JournalCalendar.tsx`       | 192    | `'use client'` | default | `journal/page.tsx:20` (`:294`) | yes |
| `JournalVersionHistory.tsx` | 150    | `'use client'` | default | `journal/page.tsx:23` (`:554`) | yes |
| `JournalEntry.tsx`          | 123    | `'use client'` | default, **`MOOD_COLORS`**, **`MOOD_LABELS`** | `JournalList.tsx:15`; the two constants by 4 other files | yes |
| `JournalList.tsx`           | 72     | `'use client'` | default | `journal/page.tsx:21` (`:454`) | yes |

### 22.3 Other components

| Path                              | Physical | Mode | Role |
| --------------------------------- | -------- | ---- | ---- |
| `components/ui/RichTextEditor.tsx` | 160 | client | **deprecated, XSS risk** |
| `components/ui/Pagination.tsx`     | 103 | client | |
| `components/ui/Dialog.tsx`         | 148 | client | Radix; 2 instances on `page.tsx` |
| `components/ui/EmptyState.tsx`     | 52  | **none** | |
| `components/ui/Button.tsx`         | 52  | client | |
| `components/ui/Card.tsx`           | 26  | **none** | |
| `components/ui/Input.tsx`          | 98  | client | |
| `components/ui/Select.tsx`         | 55  | client | |
| `components/ui/Spinner.tsx`        | 14  | **none** | |
| `components/ui/Badge.tsx`          | 24  | **none** | |
| `components/ui/index.tsx`          | 26  | **none** | the **barrel** — 26 `export *` |
| `components/tags/TagInput.tsx`     | 178 | client | |
| `components/tags/TagBadge.tsx`     | 50  | client | |
| `components/today/ui.tsx`         | 402 | client | only `Stagger` `:303`-`:338` is used |

### 22.4 Client-side lib / hook / types

| Path                            | Physical | Role |
| ------------------------------- | -------- | ---- |
| `lib/api-client.ts`             | 131 | `apiRequest` `:60`, `ApiError` `:27`-`:37`. `fetchWithAuth` `:117` is **not** used by journal |
| `lib/utils.ts`                  | 127 | `cn` `:7`-`:9` (`twMerge(clsx(...))`); **`formatDate` `:14`-`:21`** — see §22.7 |
| `lib/dates.ts`                  | 253 | `DEFAULT_TZ` `:25`, `getTodayString` `:32`-`:35`, `todayForUser` `:38`-`:40` |
| `lib/journal/crud.ts`           | **291** | **DB-backed**, not pure — §26 |
| `lib/journal/search.ts`         | 121    | `normalizeSearchTerm` `:15`, `countOccurrences` `:22`, `buildSnippet` `:41`, `rankResults` `:61`, `searchJournalEntries` `:106` — **only reachable from the dead `/api/search/journal`** |
| `lib/journal/export.ts`         | **125** | **ZERO IMPORTERS** |
| `lib/tags/manager.ts`           | 201 | `setEntityTags` `:169`-`:176` (**ownership-checked**, unused), `countTagUsage` `:113`-`:124` |
| `hooks/useUserTimezone.ts`      | 45     | |
| `types/journal.ts`              | 246    | ~85 % dead exports — §15.5 |
| `schemas/journal.schema.ts`     | –      | 6 exported schemas + 6 types |

### 22.5 Server-side files reached

| Path                                            | Physical | Reached via |
| ----------------------------------------------- | -------- | ----------- |
| `app/api/journal/route.ts`                      | – | GET, POST |
| `app/api/journal/[id]/route.ts`                 | **157** | PATCH, DELETE (GET is dead) |
| `app/api/journal/[id]/permanent/route.ts`       | – | DELETE |
| `app/api/journal/[id]/restore/route.ts`         | – | POST |
| `app/api/journal/[id]/revisions/route.ts`       | – | GET |
| `app/api/journal/[id]/revisions/[revisionId]/restore/route.ts` | – | POST |
| `app/api/journal/deleted/route.ts`              | – | GET |
| `app/api/journal/entries/route.ts`              | **105** | **orphaned** |
| `app/api/journal/[id]/tags/route.ts`             | **95** | **orphaned** |
| `app/api/search/journal/route.ts`               | **48** | **orphaned** |
| `app/api/tags/route.ts`                         | – | GET, POST |
| `app/api/reflections/route.ts`                  | – | GET (read-only) |
| **`server/services/journal.service.ts`**         | — | **DOES NOT EXIST** |
| `lib/journal/crud.ts`                           | **291** | the de-facto "service" for all 6 live journal routes |
| `server/repositories/journal.repository.ts`      | **474** | 15 of 17 methods |
| `server/repositories/base.repository.ts`        | 122 | `transaction` `:22`, `buildPaginationQuery` `:58` (**caps `take` at 100**), `handleError` `:111` |
| `server/repositories/tag.repository.ts`          | 175 | `listForUser` `:32`, `create` `:60` |
| `server/repositories/reflection.repository.ts`   | – | `findByDate` via `life-context.service.ts:59` |
| `server/services/tag.service.ts`                | – | `list` `:30`, `create` `:34` |
| `server/services/life-context.service.ts`        | – | `getReflection` `:59` — this one **is** a proper service, which is why journal's absence stands out |
| `schemas/journal.schema.ts`                     | – | 6 schemas |
| `schemas/tag.schema.ts`                         | – | `createTagSchema` |
| `lib/errors/app-error.ts`                       | 104 | thrown as `'Journal entry not found'` strings by the repository, not typed errors |
| `prisma/schema.prisma`                          | 2466 | 3 models + 4 enums |

### 22.6 `src/schemas/journal.schema.ts` — the shared validation module

| Line | Export | Shape |
| ---- | ------ | ----- |
| 3    | `createJournalEntrySchema` | `title?` <=200 · `content` required, <=10000 · `date` regex · `mood?` 1-5 · `energy?` 1-5 · `isFavorite?` · `isArchived?` · `gratitude?` · `tagIds?` cuid array |
| 15   | `updateJournalEntrySchema` | the same, all optional |
| 17   | `journalEntryIdSchema` | `z.string().cuid()` |
| 21   | `journalRevisionIdSchema` | `z.string().cuid()` |
| 26   | `deletedJournalQuerySchema` | `limit`, `offset` |
| 31   | `journalEntryQuerySchema` | `search?` · `mood?` · `isFavorite?` · `isArchived?` · `startDate?` · `endDate?` · `tagId?` · `limit` 1-100 · `offset` >=0 · **`sortBy?`** · **`sortOrder?`** — both ignored |
| 45-46 | `CreateJournalEntryInput`, `UpdateJournalEntryInput` | **shadow** the identically-named exports in `types/journal.ts:56`, `:67` |

### 22.7 `formatDate` — the shared date formatter has a UTC trap

```
lib/utils.ts:14-21
  formatDate(date)
    new Date(date).toLocaleDateString('en-US', {year:'numeric', month:'long', day:'numeric'})
```

For a `'YYYY-MM-DD'` string this constructs a **UTC-midnight** `Date`, so a user at a negative UTC offset (e.g. `America/New_York`) sees the **previous day**.

It is used at `page.tsx:371` (the trash list), `JournalEntry.tsx:63` and `:113`. **Every visible date on this page is therefore one day early for most of the Americas.** §24 F7.

By contrast `[date]/page.tsx:17` uses `new Date(`${date}T12:00:00`)` — **local** noon — which is the correct pattern and demonstrates the bug is a choice, not an oversight.

---

## 23. Current behavior summary

### 23.1 What actually happens, end to end

1. The root layout fetches habits, routines and goals. **`/journal` reads none of them** — but a failure still raises a `DataErrorBanner`.
2. The page fetches 100 entries, the 50-entry trash, and the tag list in one `Promise.all`, then **separately and un-awaited** fetches today's reflection.
3. Entries are filtered client-side by tag and date, and paginated 6 at a time out of the already-fetched 100.
4. Clicking a calendar day navigates to `/journal/[date]`, which loads that single entry and opens the editor. **An empty day is a dead end.**
5. Typing in the editor autosaves a draft to `localStorage` after 500 ms and warns on `beforeunload`.
6. Saving resolves tag names to ids (creating tags as needed), then issues one POST/PATCH — **up to five queries server-side**, including a revision snapshot when the title or content changed.
7. Changing only the mood writes **no revision**, so that change is unrecoverable.
8. Deleting offers trash (reversible) or, from inside the trash, permanent (cascades revisions).
9. The version-history dialog snapshots before restoring, so **a restore is itself undoable** — but it restores title and content only, leaving the current mood in place.

### 23.2 The shape of the page in one line each

| Dimension            | Reality |
| -------------------- | ------- |
| Rendering strategy   | fully client-side; **no server component, no server fetch, no streamed data** |
| Data ownership       | **none** — reads **no** context member. Like `/focus`, it is insulated from `AppContext` — but still pays for its fetches. |
| Data size            | capped at **100 entries** and **50 trashed**, with client-side filtering and no way to reach entry 101 |
| Writes               | 4 endpoints; a save can fan out to **4 requests** with 3 new tags |
| Revisioning          | title + content only, snapshotted before overwrite, restored transactionally |
| Soft delete          | two-stage, with distinct confirmations and a trash card |
| Real-time            | none — no polling, no websocket |
| Offline              | **none** — every write is a raw `apiRequest` |
| Filters in the URL   | **none** — tag, date and page are all lost on reload |
| Persisted state      | the editor's draft only, under `journal-draft:entry:{id}` / `journal-draft:date:{today}` |
| Accessibility        | correct `role="alert"` vs `role="status"` split; `aria-pressed` on the ratings; **no `radiogroup`, no calendar grid semantics, and the calendar's day cells are `router.push` handlers rather than anchors** |
| XSS                  | **`RichTextEditor` content is stored and rendered unsanitised**, and the component's own header comment says so |
| Internationalisation | none — all copy is hard-coded English literals |
| Tests                | **none** |

---

## 24. Findings register

**This pass changed no code.** Severity: **H** = wrong behaviour, a security gap, or a dead feature a user can notice · **M** = wasted work or an internal inconsistency · **L** = cosmetic or hygiene.

| #  | Sev | Finding                                                                                                                | Location                                              | Impact                                                                                                   | Suggested fix |
| -- | --- | ---------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- | ------------- |
| F1  | **H** | **There is no way to create a back-dated entry.** Clicking an empty calendar day navigates to `/journal/[date]`, which renders an `EmptyState` whose only action is `router.push('/journal')`. The editor never sends a different `date`, so the new-entry flow always files under `userToday`. | `[date]/page.tsx:94-99`; `JournalEditor:262`; `page.tsx:296` | The calendar is a navigation control that leads nowhere for any day without an entry — which is most days for most users. | Pass a `date` prop to `JournalEditor` on `/journal/[date]` and let it create on first save. |
| F2  | **H** | **Rich-text content is stored and rendered unsanitised.** `ui/RichTextEditor.tsx` is `contentEditable` + `document.execCommand`; its own header comment at `:9-11` states it is deprecated and an XSS risk. There is **no sanitiser anywhere in the journal path**. | `ui/RichTextEditor.tsx:9-11`; `JournalEditor:357-364`; `JournalEntry.tsx` | Stored HTML is replayed into a `contentEditable` and exported (via the dead `export.ts`) verbatim. | Sanitise on write (DOMPurify) or switch to a Markdown textarea. |
| F3  | **H** | **`JournalRepository.setTags` does not verify tag ownership.** It does `deleteMany` + `createMany` in a transaction without checking the tags belong to the user. `src/lib/tags/manager.ts:169-176` `setEntityTags` **does** check. | `journal.repository.ts:371-391` vs `lib/tags/manager.ts:169` | A user could attach another user's `Tag.id` to their entry by PATCHing with a foreign id. Two competing implementations, only the unchecked one wired up. | Add `prisma.tag.findMany({where:{id:{in: tagIds}, userId}})` to `setTags`, and delete `setEntityTags`. |
| F4  | **H** | **A mood-only or tag-only edit creates no revision.** `crud.ts:86` snapshots only when `titleChanged \|\| contentChanged`. | `crud.ts:84-88` | Changing your mood from 3 to 5 is silently unrecoverable, while a typo fix is fully reversible — the opposite of what "Version history" implies. | Also snapshot when `mood`/`energy`/`gratitude` change. |
| F5  | **M** | **`/journal/[date]` passes no `onCancel`**, so the editor on that route has **no cancel button** — and `beforeunload` does not fire on SPA navigation, so unsaved work there is lost silently on any in-app link. | `[date]/page.tsx:85-92` (no `onCancel`) | A data-loss path with no guard. | Pass `onCancel={() => router.back()}`. |
| F6  | **M** | **Energy is coloured and labelled with the mood vocabulary.** Both pickers share `MOOD_COLORS`, and Energy's `title` shows "Bad" through "Great". | `JournalEditor.tsx:286-333` | A user reading the Energy tooltip is told how they feel, not how alert they are. | Give Energy its own palette and labels. |
| F7  | **M** | **`formatDate` shows the previous day for most of the Americas.** `lib/utils.ts:14-21` builds a `Date` from a `'YYYY-MM-DD'` string at **UTC midnight**; any negative offset renders the prior date. Used at `page.tsx:371`, `JournalEntry.tsx:63`, `:113`. | `lib/utils.ts:14-21` | **Every visible date on the page is one day early for a large share of users.** `[date]/page.tsx:17` demonstrates the correct pattern (`T12:00:00` local). | Change `formatDate` to append `T12:00:00` before formatting. |
| F8  | **M** | **A failed load leaves the spinner on screen forever.** `entries === null` is the loading sentinel; `load()`'s catch sets `error` but never sets `entries` to `[]`, so the `entries === null` branch at `:258` keeps rendering **underneath** the alert. | `page.tsx:66-83`, `:258-261` | The user sees an error and an eternal spinner, with no way to tell the page finished loading. | `setEntries([])` in the catch. |
| F9  | **M** | **`mood` and `energy` cannot be cleared.** The payload spreads `...(mood !== null ? {mood} : {})`, so clearing sends nothing and the server keeps the old value — despite the dedicated "Clear" button and the toggle-off click. | `JournalEditor:262-265` | The Clear button appears to work and does not. | Declare both `.nullable()` in the schema and send `null`. |
| F10 | **M** | **`sortBy` / `sortOrder` are validated and then ignored.** `journalEntryQuerySchema` `:38-39` accepts both, but `journal.repository.ts:109` hard-codes `orderBy: {date:'desc'}`. | `schema:38` vs `journal.repository.ts:109` | A client that sends either gets silently different behaviour. | Pass them into `buildOrderQuery`. |
| F11 | **M** | **`GET /api/journal/entries` bypasses Zod entirely** — a hand-rolled regex at `:23` and manual `Number.isNaN` pagination checks at `:39-44` — and returns a `meta.summary` block nothing consumes. | `entries/route.ts:23, 39-44` | A direct `FILE.MD` violation, on a route with no UI. | Delete the route, or move its schema into `@/schemas/journal.schema.ts`. |
| F12 | **M** | **The trash is fetched on every `load()`** even when the trash card is collapsed. `showTrash` controls rendering, not fetching. | `page.tsx:67`, `:73-75` | One wasted request on every mount, save, delete and restore. | Fetch it lazily on first expand. |
| F13 | **M** | **`GET /api/reflections` is fetched outside `load()`**, in a separate unawaited IIFE — so its failure is isolated (correct, per the `:96-101` comment) but it is also invisible to `load()`'s error state and to the trash. | `page.tsx:96-101` | A deliberate design choice, but it means four independent failure channels for one page. | Keep the isolation; consider a `loadAll` that returns a per-source result. |
| F14 | **M** | **`toDateKey` coerces to UTC.** `new Date(date).toISOString().slice(0,10)` is correct for the `YYYY-MM-DD` strings it currently receives, and wrong for any timestamp. | `page.tsx:27-29` | A latent trap; `JournalEditor:78-80` documents exactly this bug being fixed elsewhere. | Use `useUserTimezone().today`-style formatting, or drop the helper. |
| F15 | **M** | **Tag vocabulary mismatch between the filter and the editor.** The `Select` uses `Tag.id` as its value; `JournalEditor` builds `idByName` keyed on `Tag.name`. | `page.tsx:304-311` vs `JournalEditor:222` | They meet at the database, so it works — but a rename on one side silently detaches on the other. | Have the editor resolve by id (it receives the entry's `tagIds`), falling back to name only for new tags. |
| F16 | **M** | **`CreateJournalEntryInput` / `UpdateJournalEntryInput` are declared twice** — once in `types/journal.ts:56`/`:67` (dead) and once as the Zod-inferred types in `schemas/journal.schema.ts:45-46` (live). | two files | A real collision trap: an import resolves silently to the wrong, unused shape. | Delete the `types/journal.ts` pair. |
| F17 | **M** | **`JournalEntry.mood` reaches nothing.** No score, no `/dashboard` widget, no `/wellness` view and no analytics aggregate reads it. §25. | `crud.ts:44`; `scoring.service.ts` | The user records a mood daily and nothing ever uses it. | Write a `MoodLog` alongside, or read `JournalEntry.mood` in `analytics` and `scoring`. |
| F18 | **M** | **`listRevisions` has no `take`.** An entry edited 500 times loads 500 rows. | `journal.repository.ts:306` | Unbounded payload for the history dialog. | `.take(50)`. |
| F19 | **M** | **`POST /api/journal` performs 2 queries** (`create` then `findById`), and so does `PATCH` (up to 5). | `crud.ts:37`, `:43`, `:99` | Every save is a multi-query round trip. | Return `findWithRelations` from the repository's `create`/`update`. |
| F20 | **M** | **`_count: {tags: true}` is computed and never read** by any consumer of `findAll`. | `journal.repository.ts:109` | A per-entry aggregate on a 100-row query. | Remove it. |
| F21 | **M** | **No AI surface at all.** `grep journal|Journal` in `src/server/ai/**` returns no matches; `prompt.ts` is journal-unaware. | `server/ai/**` | A rich, dated, mood-tagged corpus of the user's own writing that no feature reads. | A "summarise my week from my journal" insight. |
| F22 | **M** | **No export UI**, despite `lib/journal/export.ts` (125 lines) implementing markdown **and** JSON export with a filename helper. | `export.ts:8-125` | A complete feature with no button. | Add an Export button to the journal header. |
| F23 | **M** | **`isFavorite` and `isArchived` are fully plumbed and entirely unreachable.** Both columns exist, both are in both schemas, both are filtered server-side (`crud.ts:251-255`), `isFavorite` is **rendered as a Heart badge**, and `toggleJournalFavorite` / `setJournalArchived` have **zero callers, no route and no UI**. | `schema`, `crud.ts:251-268, 273-280`, `JournalEntry.tsx:66-68` | Two features that a reader would reasonably believe exist. | Add a favourite toggle and an archive action, or remove the columns. |
| F24 | **M** | **No way to delete a `Tag`**, and no pruning of orphaned `JournalRevision` rows. | – | The `Tag` table and `JournalRevision` table grow without bound. | Add an orphan sweep to the existing cron. |
| F25 | **L** | **`page.tsx:23` carries two import statements on one physical line.** | `page.tsx:23` | A merge artifact; not Prettier-shaped. | Reformat. |
| F26 | **L** | **JSX indentation at `page.tsx:214-219` and `:424-503` is inconsistent** — the `<div className="relative">` at `:219` and the fragments at `:424`/`:440`/`:502` are not nested to match. | two ranges | Compiles; not Prettier-shaped. | Run Prettier. |
| F27 | **L** | **`picker` is a plain function returning JSX, not a component.** Its 10 buttons are re-created on every render, including every keystroke. | `JournalEditor.tsx:286-333` | Unnecessary remounts of 10 buttons. | Extract it to a real component, and give Energy its own labels/colors. |
| F28 | **L** | **`MOOD_COLORS`, `MOOD_LABELS` and `RATINGS` are three independent definitions of the 1-5 scale.** | `JournalEntry.tsx`, `JournalEditor.tsx:41` | A sixth mood would not propagate. | Derive `RATINGS` from `Object.keys(MOOD_LABELS)`. |
| F29 | **L** | **Cross-domain import inversion:** `components/wellness/*` imports `MOOD_COLORS` / `MOOD_LABELS` from `components/journal/JournalEntry.tsx`. | `wellness/MoodCalendar.tsx:15`, `wellness/mood/page.tsx:9` | The wellness domain depends on the journal domain. | Move both to `src/constants/`. |
| F30 | **L** | **`Stagger` pulls the entire 402-line `today/ui.tsx`** for one animation wrapper. | `page.tsx:23`, `:220` | Bundle cost. | Extract `Stagger` into its own module. |
| F31 | **L** | **The UI barrel pulls 26 modules for the 7 journal renders.** | `page.tsx:19`, `Editor:24`, `VersionHistory:16`, `[date]:10` | Bundle cost. | Import directly. |
| F32 | **L** | **The calendar's day cells are `router.push` handlers, not anchors.** | `JournalCalendar.tsx` -> `page.tsx:296` | Middle-click, open-in-new-tab and "copy link address" all fail. | Render a `<Link>` per day. |
| F33 | **L** | **Exactly one `eslint-disable`** in the whole journal domain — `page.tsx:87`, `react-hooks/set-state-in-effect`, justified as "mount data fetch". Positive. | `page.tsx:87` | – | – |
| F34 | **L** | **Zero `TODO`/`FIXME`/`HACK`/`@ts-ignore`/`@ts-expect-error`** in any journal file. The only annotations are explanatory comments. Positive — the defects above are inherited from shared code, not left as stubs. | all journal files | – | – |
| F35 | **L** | **No tests** for the journal domain. | `tests/**` | `crud.ts`, `JournalRepository`, `JournalEditor`'s draft system and all five components are untested. | The `dirty`/`readDraft`/`toDateKey` pure helpers are ideal first targets. |

---

## 25. The three parallel mood stores

Journal's mood handling is the clearest example in this codebase of a value being captured and then never used.

### 25.1 The three stores

| Store                    | Columns                                                        | Written by                                                        | Read by |
| ----------------------- | -------------------------------------------------------------- | ------------------------------------------------------------------ | ------- |
| **`JournalEntry.mood`** | `mood Int? // 1-5`, `energy Int? // 1-5`, `gratitude String?` (JSON array) | `/journal`'s `JournalEditor` `:286-333` | **only this page's own calendar heatmap** |
| **`DailyReflection`**   | `mood`, `energy`, `stress`, `focus` (all 1-5), `reflectionText`, `biggestWin`, `biggestDifficulty`, `lessonsLearned`, `gratitude`, `improvements`, `tomorrowFocus`, `tomorrowPriorities` | `/today`'s `DailyReflection` component | `/today`'s `TodaySleep` card, the recap pages |
| **`MoodLog`**           | `mood Int //1-5`, `energy`/`stress`/`anxiety`/`focus Int?`, `triggers`/`activities` (JSON), `location`, `weather`, `notes` | `/wellness/mood` | **`scoring.service.ts`**, `analytics.service.ts`, `/dashboard` |

### 25.2 What that means concretely

```
user opens /journal, records mood 4 / energy 3
   └─ JournalEntry.mood = 4

   ├─ /journal's calendar heatmap          -> tinted green          yes
   ├─ /dashboard                             -> nothing
   ├─ /analytics                             -> nothing
   ├─ /wellness/mood                         -> nothing
   ├─ the daily score (DailyScore)          -> nothing
   └─ /recap (weekly / monthly)             -> nothing
```

### 25.3 And the two "gratitude" fields are unrelated

`JournalEntry.gratitude` is a JSON-string array — **validated, serialised in `crud.ts:41`/`:96`, and rendered by the dead `export.ts:60-67`.** There is **no gratitude field on either journal route.**

`DailyReflection.gratitude` is a separate column on a separate model, written by `/today`'s `DailyReflection` component, which has its own local `parseGratitude` at `components/today/DailyReflection.tsx:43` — the same name and the same logic as `lib/journal/export.ts:14-30`, with a different signature.

**The user has two gratitude features' worth of schema and zero UI for either.**

### 25.4 The fix, cheapest first

| # | Fix | Cost | Effect |
| - | --- | ---- | ------ |
| 1 | In `JournalEditor.save()`, also `POST` the mood to a `MoodLog` | small | A journal mood starts reaching the score, `/dashboard` and `/wellness`. |
| 2 | Delete `JournalEntry.gratitude` or add the field to the editor | small | Stops the two gratitude schemas from diverging silently. |
| 3 | Add a `dailyMood` read to `analytics.service.ts` that falls back to `DailyReflection` when `MoodLog` is empty | small | `/analytics` starts showing a mood trend. |

---

## 26. Architectural violations

`FILE.MD` states: *repositories (`src/server/repositories/*.repository.ts`) are the only DB access layer; services (`src/server/services/*.service.ts`) hold all business logic; API routes must be thin and delegate to services.* Journal breaks all three clauses.

### 26.1 Violation 1 — there is no `journal.service.ts`

`src/server/services/` contains **54** services:

`achievement`, `admin`, `admin-user`, `analytics`, `api-key`, `attachment`, `audit`, `auth`, `automation`, `backup`, `billing`, `bulk`, `category`, `challenge`, `dashboard-overview`, `day-mode`, `day-type`, `email`, `feature-flag`, `feedback`, `focus`, `goal`, `habit`, `health-metric`, `import`, `insight`, `integration`, `life-context`, `notification`, `nutrition`, `pattern`, `project`, `push`, `push-subscription`, `quote`, `recap`, `review`, `routine`, `scoring`, `search`, `sleep`, `sleep-session`, `social`, `streak-recompute`, `subscription`, `tag`, `task`, `template`, `time-tracking`, `upload`, `user`, `weather`, `wellness`.

**There is no `journal`.** Every `/api/journal/**` route imports business logic directly from `src/lib/journal/crud.ts`. A grep for `lib/journal/crud` returns **9 route files**.

Journal is the **only** domain in the repo structured this way.

### 26.2 Violation 2 — `lib/` is doing database I/O

```
src/lib/journal/crud.ts:2    import { JournalRepository } from '@/server/repositories/journal.repository'
src/lib/journal/crud.ts:16   const journalRepository = new JournalRepository()
src/lib/journal/crud.ts:33+  await repo.create(...) / repo.findById(...) / repo.update(...)
```

`lib/` is meant to be pure. `AGENTS.md` names `src/lib/scheduling/day-type.ts` as the example — *"that is what makes it importable with no environment"* — and `life-context.service.ts:17-18` documents the same rule for reflections. `crud.ts` violates it, and so does `lib/journal/search.ts` (which instantiates `JournalRepository` at `:10`).

The practical cost: **`lib/journal/*` cannot be imported by a test without a `DATABASE_URL`**, which is exactly the constraint that makes service-level tests in this repo require `vi.mock`.

### 26.3 Violation 3 — three routes bypass Zod

| Route | Problem |
| ----- | ------- |
| `api/journal/entries/route.ts` | hand-rolled regex `:23`, manual `Number.isNaN` pagination `:39-44` — instead of `@/schemas/journal.schema.ts` |
| `api/journal/[id]/tags/route.ts` | **inline** `setTagsSchema` at `:6-8`, not the shared module |
| `api/tags` GET, `api/reflections` GET | no schema at all (the latter only a presence check) |

### 26.4 Violation 4 — the repository throws bare strings

```
journal.repository.ts:221, 241, 262, 282, 306, 331   throw new Error('Journal entry not found')
                                                     throw new Error('Journal revision not found')
```

`src/lib/errors/app-error.ts` provides `NotFoundError` `:72` and `ValidationError` `:48`, and `habit.service.ts` and `goal.service.ts` both use them. Journal uses neither, so **every journal route answers 400 for a missing entry** rather than 404 — the same defect recorded for goals in `goals.md` §24 F14.

### 26.5 Violation 5 — two parallel tag-assignment implementations

| Implementation | Ownership check? | Used by |
| -------------- | ----------------- | -------- |
| `JournalRepository.setTags` `:371-391` | **none** | `crud.updateJournalEntry` — **the only wired path** |
| `lib/tags/manager.ts setEntityTags` `:169-176` | `where:{id:{in:[...]}, userId}` | nothing |

### 26.6 The fix

Create `src/server/services/journal.service.ts` that absorbs the 14 live functions from `crud.ts`, then delete `crud.ts` or reduce it to a pure module. Estimated **~40 lines of new file plus import-path changes across 9 routes.** That single change resolves violations 1, 2 and, with `NotFoundError`, part of 4.

---

## 27. Dead surface inventory

| Category                                          | Count | Lines |
| ------------------------------------------------- | ----- | ----- |
| Dead API routes (files)                            | **3** | **248** |
| Dead API handlers                                 | **1** | (inside the 157-line `[id]` file) |
| Dead exports in `lib/journal/crud.ts`              | **4** of 18 | ~60 |
| Dead repository methods                            | **2** of 17 | ~40 |
| **Dead file** `lib/journal/export.ts`             | **1** | **125** |
| Dead exports in `types/journal.ts`                 | **23** of ~26 | 246 total |
| Unused props on live journal components            | **6** | – |
| Reachable-only-via-a-dead-route lib exports        | **4** | 121 (`search.ts`) |
| `JournalEntry` columns with no UI                  | **3** of 11 | – |
| Schemas validated then ignored                     | **2** (`sortBy`, `sortOrder`) | – |
| `eslint-disable` suppressions                      | **1** | – |
| `TODO` / `FIXME` / commented-out code              | **0** | – |
| Tests                                             | **0** | 0 |

**Roughly 900 lines of dead or unreachable code in the journal domain**, against a live surface of 564 + 103 + 416 + 192 + 150 + 123 + 72 = 1,620 lines.

The three highest-leverage fixes are **F2** (unsanitised rich text), **F3** (unchecked tag ownership) and **F1** (the calendar dead end).

---

*End of `/journal` audit.*