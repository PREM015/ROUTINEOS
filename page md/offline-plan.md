# Offline-first reminders & input queue — implementation plan and status

Status: **partially built, deliberately paused.** The UI work on `/today` took priority.
This file exists so the work can be resumed without re-deriving the research.

Owner note: nothing here is speculative. Every claim was verified against the repo or the
platform docs. Where something is *not* supported, that is stated plainly rather than
worked around silently.

---

## 1. What was already in the repo (and why none of it worked)

Before writing anything, an audit turned up four things that made the whole offline story
inert:

| Finding | Location | Consequence |
|---|---|---|
| `syncPendingHabits()` was a `console.log` | `public/sw.js` (old) | The `sync` handler could never flush anything |
| The outbox lived in `localStorage` | `src/lib/offline/queue.ts` | **A service worker cannot read `localStorage`.** Even a real handler would have found nothing |
| `queueAction` had **zero call sites** | `src/lib/offline/queue.ts` | The queue was always empty |
| No `message` handler | `public/sw.js` | A page had no channel at all to tell the worker anything |

There was also a **second, conflicting** queue key (`pendingChanges` in
`PendingChanges.tsx` / `SyncStatus.tsx`) that was likewise never written to, and
`src/lib/offline/sync.ts` POSTed to `/api/sync`, **a route that does not exist**.

While fixing the SW, a live unrelated bug surfaced: the server sends notification identity
nested (`push.service.ts` → `{ ...payload, data: { notificationId, promptId } }`) while
`sw.js` read it top-level. Both values were always `undefined`, so **every** notification
action button in the app — Acknowledge, Snooze, "Start sleep" — silently did nothing, and
"Start sleep" POSTed `{"promptId": undefined}` which `respondSchema` rejected with a 400.
That is fixed, along with a `tag` fallback keyed on the notification id (it previously fell
through to the literal `'routineos'`, collapsing *every* notification in the app into one).

---

## 2. Platform reality — read this before designing anything

This determines the architecture and is the single most important constraint.

| Capability | Chrome desktop | Chrome Android | Safari / iOS | Firefox |
|---|---|---|---|---|
| `NotificationOptions.scheduledTime` (deferred show) | ✅ | ❌ | ❌ | ❌ |
| Background Sync | ✅ | ✅ | ❌ | ❌ |
| Periodic Background Sync | ✅ (PWA installed) | ✅ (PWA installed) | ❌ | ❌ |
| Web Push (server-driven) | ✅ | ✅ | ✅ (iOS 16.4+, installed) | ✅ |

Consequences, stated plainly:

- **Offline scheduled reminders are impossible on iPhone.** There is no polyfill. If an
  iOS user is ever in scope, offline reminders must degrade to "fires when the app is next
  opened".
- `scheduledTime` alone would work on the user's laptop and **silently do nothing on their
  phone** — the two platforms need different mechanisms, which is why both are implemented.
- Periodic Sync additionally requires the **PWA to be installed**, not merely opened. There
  is no install prompt in the app today; `src/lib/pwa/install.ts` and `InstallPrompt.tsx`
  exist but are **dead code with zero importers**.
- A service worker is killed after ~30s idle. Any `setTimeout`-based scheduler inside the
  worker will be terminated. This is why the platform provides `scheduledTime`/
  `periodicsync` instead, and why neither should be replaced by an in-worker timer.

**Target platform as stated by the user: Chrome only, desktop and mobile.** Both columns are
therefore covered, with the caveats above.

---

## 3. What is built (working)

### Files added
- `src/lib/offline/idb.ts` — minimal IndexedDB wrapper, **no new dependency** (`package.json`
  ships no `idb`/`dexie`/`localforage`/`workbox`). Stores: `outbox`, `schedule`.
- `src/lib/offline/outbox.ts` — queue user mutations, flush on reconnect, `submitOrQueue()`.
- `src/lib/pwa/offline-schedule.ts` — mirrors the server's notification plan into the worker.
- `src/components/offline/OfflineSync.tsx` — mounted in the dashboard layout; runs the
  mirror every 15 min, on mount, and on every reconnect; registers Periodic Sync.

### `public/sw.js` changes
- Real IndexedDB layer (outbox + schedule), readable from inside the worker.
- `message` handler: `SCHEDULE_UPSERT`, `SCHEDULE_CLEAR`, `OUTBOX_PUSH`, `FLUSH`.
- `periodicsync` handler → `fireDue()`, the **Android** offline path.
- `sync` handler → real `flushOutbox()` + `fireDue()` (replaces the `console.log` stub).
- `fireDue()` fires mirrored notifications whose time has passed, then deletes them.
- Push/SW payload nesting fixed; `promptId` forwarded; per-notification `tag`.

### Client behaviour
- `submitOrQueue()`: sends now if online, otherwise queues. Ticking a habit with no
  connection keeps the optimistic UI, queues the write, and **toasts that it is queued**.
- Offline Undo works: the outbox replays oldest-first and stops on failure, so a queued
  tick followed by a queued undo lands `COMPLETED` then `MISSED` — the correct end state.
- `OfflineBanner` now reads the real pending count instead of calling the dead `syncQueue`.

### De-duplication between push and offline firing
Each mirrored record carries `firedAt`. `fireDue()` sets it and deletes the record;
`syncNotificationSchedule()` preserves `firedAt` for ids it has seen fired. **A user does
not receive the same reminder twice** when online.

---

## 4. What is NOT done — the real gaps

Ordered by risk. **Do 1 before enabling this for real users.**

### 1. Server-side idempotency is missing — writes can double-apply ⚠️
Every queued action carries a client-generated `idempotencyKey`, sent as
`X-Idempotency-Key`. **No route reads that header.** Offline replay is inherently
at-least-once: a request that landed but whose response was lost is indistinguishable from
one that never arrived, so it is retried. `/api/habits/[id]/log` is not naturally idempotent —
a replayed log would double-count.

Fix:
1. Add `dedupeKey String? @unique` to `NotificationLog`, **and** a generic idempotency
   table (or per-entity column) for mutations.
2. In a shared helper, check the key first and return the stored response on replay.
3. **Requires a Prisma migration on a remote Neon database — needs explicit user consent.**

Also note `createMany({ skipDuplicates: true })` in
`src/server/repositories/notification.repository.ts` is a **no-op**: there is no unique
constraint on `NotificationLog` for it to skip. Dedupe today is an application-level
read-then-write (`countByTypeAndRelatedId`), which is a TOCTOU race — two concurrent ticks
can both insert.

### 2. Only the habit toggle is queued
`submitOrQueue` is wired into `TodayHabitChecklist.toggleHabit` only. Still to convert:
goal check-ins, goal progress, routine start/complete, sleep-time writes, focus completion.

### 3. `notificationclick` has no offline fallback
The sleep answer branches (`sw.js`) have **no `.catch()`**. Offline, the answer is lost.
Fix: on fetch failure, write to the `outbox` store instead of dropping it.

### 4. Dead code should be deleted
- `src/lib/offline/sync.ts` — POSTs to `/api/sync`, **which does not exist**
- `src/lib/offline/storage.ts`, `conflict.ts` — zero importers
- `src/lib/offline/queue.ts` — superseded by `outbox.ts` (localStorage, unreachable from SW)
- the duplicate `pendingChanges` key in `PendingChanges.tsx` / `SyncStatus.tsx`
- `src/lib/pwa/background-sync.ts`, `install.ts`, `offline.ts`, `InstallPrompt.tsx`,
  `OfflineIndicator.tsx`, `PendingChanges.tsx`, `SyncStatus.tsx` — all zero importers

`conflict.ts` returns a `'merge'` verdict but nothing merges, and it compares `updatedAt` —
a field `NotificationLog` does not have.

### 5. No install prompt
Periodic Sync needs the PWA **installed**. `registerPeriodicSync()` returns a boolean that
is currently ignored. Surface it so a phone user can be told to install the app.

### 6. The push pipeline itself is fragile — worth fixing regardless
`vercel.json` declares only **two daily** crons. The 5-minute notification tick is driven
by `.github/workflows/notification-scheduler.yml`, which self-documents that GitHub may
delay ticks near the hour boundary, uses `continue-on-error: true` (silent failures), and is
**auto-disabled after 60 days of public-repo inactivity**. `CRON_SECRET` is absent from
`.env.example`. If the server cannot reliably push, the offline path stops being a nicety
and becomes load-bearing.

### 7. `sw.js` cache hygiene
`CACHE_NAME` is a hardcoded `'routineos-v1'`, not build-stamped; `activate` deletes every
other cache. Any future Cache Storage store would be wiped on every SW update — IndexedDB is
unaffected, which is one reason it was chosen. `/sw.js` also has no explicit `Cache-Control`
in `next.config.ts`, so update latency depends on platform defaults. The fetch handler also
caches cross-origin GETs and RSC payloads; restricting `cache.put` to same-origin
navigations and static assets would be safer.

---

## 5. Suggested order of work

1. Idempotency keys honoured server-side (needs DB migration + consent).
2. Offline `.catch` on `notificationclick` → enqueue.
3. Queue the remaining mutations.
4. Delete the dead modules.
5. Install prompt + surface `registerPeriodicSync()`'s result.
6. Move the 5-minute tick off GitHub Actions onto a real scheduler.

---

## 6. Related context

- `page md/today.md` — `/today` audit, including open items O6 ("the offline queue never
  enqueues") which this work partially closes.
- `page md/notifications.md` — full notification architecture audit (19 sections).
- `page md/AGENTS.md` — repo conventions. Note it references a nonexistent `AGENT.MD`
  (corrected) and previously claimed 44 passing tests in files that do not exist
  (corrected); **there is still no test suite at all** — `npm test` exits 1.
