# Notification System — Complete Architecture Audit

**Scope:** every notification the app can create, schedule, deliver, and acknowledge — including web push, email, in-app, service-worker handling, cron scheduling, duplicate prevention, and database state.
**Audit date:** 2026-09-30
**Status:** **documentation only — nothing was modified.** This document describes the system as it exists today, plus its gaps. No implementation changes were made, per instruction.

Every claim is anchored to `file:line`. Anything that could not be confirmed from source is marked **`Needs verification`**.

---

## Table of contents

| § | Section |
| - | ------- |
| 1 | [Executive summary](#1-executive-summary) |
| 2 | [The full pipeline](#2-the-full-pipeline) |
| 3 | [What triggers what, and when](#3-what-triggers-what-and-when) |
| 4 | [Producer reference](#4-producer-reference) |
| 5 | [Routine start and completion reminders](#5-routine-start-and-completion-reminders) |
| 6 | [Sleep and wake-up notifications](#6-sleep-and-wake-up-notifications) |
| 7 | [Habit reminders](#7-habit-reminders) |
| 8 | [Repetition and reminder intervals](#8-repetition-and-reminder-intervals) |
| 9 | [Ignoring and dismissing](#9-ignoring-and-dismissing) |
| 10 | [Completing a task without responding](#10-completing-a-task-without-responding) |
| 11 | [App closed / background behaviour](#11-app-closed--background-behaviour) |
| 12 | [Day-type scheduling](#12-day-type-scheduling) |
| 13 | [Missed notifications and delayed responses](#13-missed-notifications-and-delayed-responses) |
| 14 | [Duplicate prevention](#14-duplicate-prevention) |
| 15 | [Database storage of status and responses](#15-database-storage-of-status-and-responses) |
| 16 | [Configuration and operational dependencies](#16-configuration-and-operational-dependencies) |
| 17 | [Consolidated gaps and limitations](#17-consolidated-gaps-and-limitations) |
| 18 | [Readiness against the five requested capabilities](#18-readiness-against-the-five-requested-capabilities) |
| 19 | [File inventory](#19-file-inventory) |

---

## 1. Executive summary

The system is a **single-table, cron-driven, at-most-once-with-bounded-retry** notification pipeline:

```
GitHub Actions (every 5 min) → GET /api/cron/notification-tick
                                     │
    ┌────────────────────────────────┼────────────────────────────────┐
    │                                │                                │
 producers (INSERT PENDING)    task reminders                 dispatcher (SEND / FAILED)
 scheduler.ts                  task-reminder.ts                notification.service.ts
 habit-reminder.ts                                                 │
 goal-reminder.ts                                                   ├─→ email  (Resend, raw fetch)
 sleep-session.service.ts                                           └─→ web push (web-push/VAPID)
 task-reminder.ts                                                              │
 automation.service.ts                                          service worker → OS toast
 achievement.service.ts                                                       │
                                                                               ↓
                                                                    notificationclick → action endpoint
```

**Key facts:**

| | |
|---|---|
| Storage | **One table**: `NotificationLog` (`prisma/schema.prisma:2118-2154`) |
| Types declared | **40** `NotificationType` values |
| Types **actually produced** | **9** — `ROUTINE_START`, `HABIT_REMINDER`, `GOAL_DEADLINE`, `TASK_DUE`, `TASK_OVERDUE`, `SLEEP_PROMPT`, `SLEEP_TRACKING_STARTED`, `SLEEP_ENDED`, `AUTOMATION`, plus `ACHIEVEMENT_UNLOCKED` (**10 total**) |
| Channels | web push ✅, email ✅, in-app (the DB row) ✅, **SMS ❌ does not exist** despite a settings toggle |
| Driver in production | **only** `.github/workflows/notification-scheduler.yml`. `vercel.json` has **no** notification cron |
| Cadence | every 5 minutes |
| Repetition | **none.** One "SNOOZE 10 min" button and a 3-attempt delivery retry. There is no repeat/nag/recurrence anywhere |
| Atomic claim | **none.** `findMany` then post-hoc status guard — two concurrent dispatchers can both send |
| Quiet hours | **persisted and never read.** No delivery code touches `quietHoursStart/End` |
| Day-type awareness | **selection** is exception-aware for routines; **timing is not.** Every other producer is day-type-blind |
| Completion reconciliation | **none.** Completing a block/habit/task never retires its outstanding notification |
| In-app acknowledgement | **none.** `POST /api/notifications/action` is called *only* from the service worker — there is no in-app button |
| Notification UI on `/today` | **none.** The bell is in the shared `Header`; the list lives at `/notifications` |

---

## 2. The full pipeline

### 2.1 Stage 1 — producers (INSERT)

Insert sites for `NotificationLog` rows, exhaustively:

| Site | file:line |
| ---- | --------- |
| low-level insert | `src/server/notifications/scheduler.ts:41` (`scheduleNotification`) |
| routine block | `src/server/notifications/scheduler.ts:479` |
| daily check-in nudge | `src/server/notifications/scheduler.ts:633` |
| per-habit reminder | `src/server/notifications/habit-reminder.ts:96` |
| goal deadline | `src/server/notifications/goal-reminder.ts:154` |
| task due/overdue | `src/app/api/notifications` ← `src/server/notifications/task-reminder.ts:135` → `notification.service.ts:247` → `notification.repository.ts:76` |
| sleep prompt | `src/server/services/sleep-session.service.ts:149` |
| sleep started | `sleep-session.service.ts:267`, `:332`, `:471` (all created already-`SENT`) |
| sleep ended | `sleep-session.service.ts:400` (already-`SENT`) |
| automation | `src/server/services/automation.service.ts:337` |
| achievement | `src/server/services/notification.service.ts:548` |
| bulk | `src/server/repositories/notification.repository.ts:198` (`createMany`) — **no callers** |

### 2.2 Stage 2 — the fan-out driver

`src/app/api/cron/notification-tick/route.ts:47-92` runs four stages, each independently `try`/`catch`, failures collected in `errors[]`, and the tick still returns 200:

| Stage | Line | Service |
| ----- | ---- | ------- |
| 1 | `:57` | `sleepSessionService.processSleepNotifications()` |
| 2 | `:64` | `scheduleAllReminders()` |
| 2b | `:72` | `taskReminderService.scheduleTaskReminders()` |
| 3 | `:79` | `notificationService.dispatchDueNotifications()` |

> Stale comment: `notification-tick/route.ts:69-70` claims `dispatchDueNotifications` "also invoked" task reminders. It does not (`notification.service.ts:578-727` has no such call). Task reminders run exactly once, in stage 2b.

Auth for all cron routes — `src/lib/cron-auth.ts:19-46`: `Authorization: Bearer ${CRON_SECRET}` strict equality. A **missing** env secret returns **HTTP 500** with `error: 'CRON_SECRET is not set'`, not 401. `CRON_SECRET` is **absent from `.env.example`**.

### 2.3 Stage 3 — the dispatcher

`src/server/services/notification.service.ts:578-727`.

| Constant | Value | Line |
| -------- | ----- | ---- |
| `DISPATCH_BATCH_SIZE` | 100 | `:113` |
| `DISPATCH_MAX_RETRIES` | 3 | `:116` |
| `DISPATCH_EXCLUDED_TYPES` | `[SLEEP_PROMPT]` | `:110` |

**Step 1 — select** (`notification.repository.ts:360-383`):
```ts
where: {
  scheduledFor: { lte: before },
  OR: [
    { status: NotificationStatus.PENDING },
    ...(maxRetries === undefined ? [] :
      [{ status: NotificationStatus.FAILED, retryCount: { lt: maxRetries } }]),
  ],
},
orderBy: { scheduledFor: 'asc' },
take: limit,
```
**No lower bound, no TTL, no staleness cutoff, and no `FOR UPDATE` / lease / claimed-at column.** Rows are "claimed" only *after* the side effect, by a status-guarded write (`notification.repository.ts:316`).

**Step 2 — master switch** (`:603-616`): if `notificationsEnabled === false`, the row is **still written as `status: SENT, sentAt: now`**, with no channel flags. Suppressed and delivered are indistinguishable in the data.

**Step 3 — category gate** (`:620-628`): `CATEGORY_GATES` (`:139-152`) covers only 4 types:
```ts
HABIT_REMINDER          → habitReminders
GOAL_DEADLINE           → goalReminders
ROUTINE_START           → routineStartNotifications
SLEEP_TRACKING_STARTED  → sleepReminderNotifications
```
Gated-out rows are likewise stamped `SENT`. `TASK_DUE`, `TASK_OVERDUE`, `AUTOMATION`, `ACHIEVEMENT_UNLOCKED` have **no gate** and are always delivered subject only to the master switch.

**Step 4 — channels** (`:633-698`): two **independent** `if` blocks, not a `switch`. Email failure does not suppress push; both outcomes are merged into `failures` (`:704`).

> `template: 'habit-reminder'` at `:642` is dead metadata — `sender.ts:50-51` only falls back to the template when `subject`/`html` are absent, and both are supplied. Every notification type's email renders through `renderSimpleHtml`.

**Step 5 — failure** (`:700-709`): per-row failure does **not** abort the batch (`notification.service.ts:576-577` states this is intentional). `markFailed` (`notification.repository.ts:434-459`) increments `retryCount` and truncates `errorMessage` to 1000 chars.

**Step 6 — success** (`:713-723`): `markSent`. **`errorMessage` is never cleared on success**, so a row that failed twice then succeeded carries its stale error text alongside `status: SENT`.

**Batching:** one claim of ≤100 rows, then a strictly sequential `for` loop (`:602`). A slow `web-push` blocks the whole batch, bounded by `vercel.json:17-19` (`maxDuration: 60` for `app/api/cron/**`).

### 2.4 Stage 4 — transport

**Email** — `src/lib/email/sender.ts:47-115`, raw `fetch` to Resend. With no `RESEND_API_KEY` it returns `{ ok: true, transport: 'dev-log' }` (`:55-69`), so the dispatcher sets `channels.email = true` (`:650`) and marks the row `SENT`. **A notification is recorded as successfully emailed in any environment without the key, including production.**

`src/lib/email/queue.ts` (`RETRY_DELAYS = [1s, 5s, 30s]`, `:34`) and `src/lib/email/scheduler.ts` are **100% dead code** relative to notifications — the dispatcher calls `sendEmail` inline and never enqueues.

**Web push** — `src/server/services/push.service.ts:113-216`. VAPID configured once in the constructor (`:84-103`). Never throws; returns `{sent, failed, reason}`.

**SMS** — **does not exist.** `channels.sms` is initialised `false` (`:630`) and never set `true`; `sentViaSMS` is only ever written as the literal `false` (`notification.repository.ts:325`). Yet `settings/notifications/page.tsx:435` advertises an SMS toggle.

**Service worker** — `public/sw.js`.

### 2.5 Stage 5 — acknowledgement

`public/sw.js:196-254` (`notificationclick`) and `POST /api/notifications/action`.

---

## 3. What triggers what, and when

| Producer | Type | `relatedEntityId` | `scheduledFor` | Lead time | Day-type aware? |
| -------- | ---- | ----------------- | --------------- | --------- | --------------- |
| Routine block | `ROUTINE_START` | `block.id` (**no date**) | occurrence − `advanceNotificationMinutes` (`scheduler.ts:466`) | ✅ configurable | selection only |
| Daily check-in | `HABIT_REMINDER` | `daily:<localDate>` | configured time, default `20:00` (`scheduler.ts:588`) | ❌ | ❌ |
| Per habit | `HABIT_REMINDER` | `habit:<id>:<localDate>` | `habit.reminderTime` (`habit-reminder.ts:148-156`) | ❌ | ❌ |
| Goal deadline | `GOAL_DEADLINE` | `goal:<id>:<localDate>` | **`now`** (`goal-reminder.ts:162-164`) | ❌ | ❌ |
| Task due | `TASK_DUE` | `task.id` (**no date**) | **`now`** (`task-reminder.ts:90`) | ❌ | ❌ |
| Task overdue | `TASK_OVERDUE` | `task.id` (**no date**) | **`now`** | ❌ | ❌ |
| Sleep prompt | `SLEEP_PROMPT` | `sleep-prompt:<localDate>` | **`now`**, gated on bedtime | ❌ | ❌ |
| Sleep started | `SLEEP_TRACKING_STARTED` | — | `startedAt`, created `SENT` | — | ❌ |
| Sleep ended | `SLEEP_ENDED` | — | `endedAt`, created `SENT` | — | ❌ |
| Automation | `AUTOMATION` | — | `new Date()` | — | ❌ |
| Achievement | `ACHIEVEMENT_UNLOCKED` | `achievement.id` | `new Date()` | — | ❌ |

### Timezone handling

| Site | Source | Fallback |
| ---- | ------ | -------- |
| Routine occurrence | `scheduler.ts:314` `preferences?.timezone ?? getUserTimezone(userId)` | `DEFAULT_TZ` = `'UTC'` (`:174`) |
| **Daily check-in** | **`scheduler.ts:592` `preferences.timezone ?? 'Asia/Kolkata'`** | ⚠️ **hardcoded IST** |
| Per-habit | `habit-reminder.ts:84` `settings?.timezone ?? DEFAULT_TZ` | UTC |
| Goal | `goal-reminder.ts:124` | UTC |
| Task | `task-reminder.ts:91` — body rendered with `due.toISOString().slice(11,16)` and the literal string `" UTC"` | **UTC in the copy** |
| Sleep | `sleep-session.service.ts:121` | UTC |

> `scheduler.ts:170-174` explicitly documents that a previously hardcoded `"Asia/Kolkata"` was a bug. Line 592 is that same bug, one function lower.

### Gating gates summary

| Producer | Gates |
| -------- | ----- |
| Routine | `notificationsEnabled === false` → 0 (`:305`); `routineStartNotifications === false` → 0 (`:308`); `upcomingRoutineNotifications === false` → advance 0 (`:322`); `block.isRecurring === false` → skip (`:402`); `template.isActive === false` → skip (`:400`); orchestrator also requires `pushNotifications === true` (`schedule-all.ts:54`) |
| Daily check-in | `notificationsEnabled` (`:572`), `dailyReminder` (`:584`), `habitReminders` (`:585`) |
| Per habit | `notificationsEnabled === false \|\| habitReminders === false` (`:79`); **missing settings row is permissive** |
| Goal | `notificationsEnabled === false \|\| goalReminders === false` (`:119`); missing row permissive |
| Task | `!settings \|\| notificationsEnabled !== true \|\| habitReminders !== true` (`:73`) — **strict**, inconsistent with habit/goal |
| Sleep prompt | `sleepReminder !== true` (`:116`), `notificationsEnabled !== true` (`:117`), no `targetBedtime` (`:118`), `now < bedtime` (`:132`), active session or existing log (`:135-139`) |

### Notification status lifecycle

```
                  ┌──────────► SENT ◄──────────┐
                  │      (markSent, incl.      │
   INSERT ──► PENDING │   suppressed-by-gate)   │
                  │             │              │
                  │             ▼              │
                  └──► FAILED ─┘ (markFailed, retryCount++)
                            │  retryCount ≥ 3 → stranded forever
                  ┌─────────┴─────────┐
                  ▼                   ▼
             DISMISSED             READ
          (dismiss / "Not yet")  (markRead / markAllRead)
```

Enum: `PENDING | SENT | FAILED | DISMISSED | READ` (`prisma/schema.prisma:281-287`). Column default `PENDING` (`:2138`).

Transitions:

| From → To | Mechanism | file:line |
| --------- | --------- | --------- |
| `PENDING`/`FAILED` → `SENT` | dispatch success | `notification.repository.ts:298-334` |
| `PENDING`/`FAILED` → `SENT` | master switch off (**retired, not sent**) | `notification.service.ts:610-613` |
| `PENDING`/`FAILED` → `SENT` | category gate off (**retired, not sent**) | `notification.service.ts:622-625` |
| `PENDING`/`FAILED` → `FAILED` | `retryCount++` | `notification.repository.ts:434-459` |
| `PENDING` → `PENDING` | snooze: `scheduledFor += 10 min`, `retryCount → 0`, `errorMessage → null` | `notification.repository.ts:274-296` |
| `PENDING` → `SENT` | sleep prompt resolved | `notification.repository.ts:261`, `:331` |
| any → `DISMISSED` | `markDismissed` — **no status guard** | `notification.repository.ts:464-474` |
| any → `SENT` | `applyAction` DONE/SKIP | `notification.service.ts:448-450` |
| any → `READ` | `markRead` | `notification.repository.ts:135-147` |
| any → `READ` | `markAllRead` — `where: { userId, readAt: null }`, **no status guard** | `notification.repository.ts:152-165` |
| `PENDING` → `DISMISSED` (bulk) | `dismissPendingByType` — **no callers** | `notification.repository.ts:479-489` |

> `markRead` / `markAllRead` can move a **never-delivered** `PENDING` row straight to `READ`.

---

## 4. Producer reference

### 4.1 Routine block reminders — `src/server/notifications/scheduler.ts:299-552`

- Type `ROUTINE_START` (`:479`), `relatedEntityId = block.id` (`:483`), `actionUrl = /today?block=<id>` (`:482`)
- Actions (`:497-500`): `[{ action: 'DONE', title: '✓ Done' }, { action: 'SNOOZE', title: 'Snooze 10m' }]`
- `SNOOZE_MINUTES = 10` (`:18`)
- Window (`:455-456`): `diffMinutes` between the **occurrence** and `now` must be `0 ≤ x ≤ 24*60`, measured against the occurrence, **not** `scheduledFor` — so an advance that pushes `scheduledFor` outside 24 h does not widen the horizon
- Advance (`:466-475`): if `scheduledFor <= now`, the advance is **discarded** and the reminder fires at the block start time
- `advanceNotificationMinutes` has no upper clamp (`prisma/schema.prisma:635`, `Int @default(0)`)

### 4.2 Daily check-in nudge — `scheduler.ts:569-646`

- `HABIT_REMINDER`, `relatedEntityId = daily:<localDate>` (`:637`)
- Fires once the local wall clock has reached the configured time (`:608`); default `20:00` (`:588`)
- **The only producer that filters `status: 'PENDING'` in its dedupe** (`:596-604`)

### 4.3 Per-habit reminders — `src/server/notifications/habit-reminder.ts:45-113`

- Candidate query (`:50-51`): `{ status: 'ACTIVE', reminderEnabled: true, reminderTime: { not: null } }`
- **Does not filter** `frequencyType`, `frequencyValue`, `HabitDayType`, or `HabitOverride` — so a Monday-only or Weekend-only habit with a reminder time gets a reminder on days it does not apply
- `relatedEntityId = habit:<id>:<localDate>` (`:89`)

### 4.4 Goal deadline — `src/server/notifications/goal-reminder.ts:89-173`

- `GOAL_DUE_SOON_DAYS = 3` (`:31`); fires when `daysRemaining ≤ 3` **or** `≥ -3` (`:131-132`) → up to **7 daily nudges** per goal across a missed window
- Filter `{ status: 'ACTIVE' }` (`:94-95`) — no day types, no `GoalDayType`
- `relatedEntityId = goal:<id>:<todayLocal>` (`:137`)

### 4.5 Task reminders — `src/server/notifications/task-reminder.ts:49-111`

- `DUE_SOON_MINUTES = 60` (`:23`), `OVERDUE_WINDOW_HOURS = 24` (`:26`)
- `actionUrl: '/goals'` (`:101`) — an odd landing target for a task notification
- Copy rendered in UTC with a literal `" UTC"` (`:91`, `:99-100`)

### 4.6 Sleep — `src/server/services/sleep-session.service.ts`

| Method | Line | Creates | Status |
| ------ | ---- | ------- | ------ |
| `ensureSleepPrompt` | `:111-174` | `SLEEP_PROMPT` | `PENDING`, **plus an inline push** at `:159-170` |
| `startSleep` | `:267-276` | `SLEEP_TRACKING_STARTED` | `SENT` |
| `respondToPrompt(YES)` | `:332-341` | `SLEEP_TRACKING_STARTED` | `SENT` |
| `stopSleep` | `:400-412` | `SLEEP_ENDED` | `SENT` |
| auto-start (cron) | `:471-480` | `SLEEP_TRACKING_STARTED` + push | `SENT` |

`SLEEP_PROMPT` is in `DISPATCH_EXCLUDED_TYPES` (`notification.service.ts:110`) — it bypasses the dispatcher entirely and is delivered **only** by the direct push at `:159-170`.

### 4.7 Automation — `src/server/services/automation.service.ts:332-344`

`SEND_NOTIFICATION` action creates an `AUTOMATION` row with **no `relatedEntityId`** and **no dedupe**.

Triggered by `TIME_REACHED` (from `/api/cron/run-automations`), `HABIT_COMPLETED` (`habit.service.ts:379`), `SCORE_THRESHOLD` (`scoring.service.ts:258`).

### 4.8 Achievements — `notification.service.ts:548-561`

`ACHIEVEMENT_UNLOCKED`, `relatedEntityId = achievement.id`. Sole caller `achievement.service.ts:299`.

### 4.9 Dead producers — defined, never called

| Symbol | file:line |
| ------ | --------- |
| `notifyGoalDue` | `notification.service.ts:508-525` |
| `notifyHabitReminder` | `notification.service.ts:530-543` |
| `buildWeeklyReviewReminder`, `getWeeklyReviewScheduleTime` | `src/server/notifications/weekly-review.ts` — **module never imported** |
| `markNotificationSent`, `markNotificationFailed` | `scheduler.ts:84-102`, `:107-119` |
| `getPendingNotifications`, `getNotificationsToSend` | `scheduler.ts:62`, `:651` |
| `markPendingByTypeSent`, `dismissPendingByType` | `notification.repository.ts:247`, `:479` |
| `getNotifications`, `delete` | `notification.service.ts:263-272`, `:496-503` |
| `sanitizeNotificationPayload` | `src/lib/feature-helpers.ts:48-62` |
| `enqueueEmail` / `flushEmailQueue` / `runScheduledEmails` | `src/lib/email/queue.ts`, `scheduler.ts:107` |
| `NotificationSettings.tsx`, `QuietHours.tsx`, `ReminderEditor.tsx` | **zero importers** |

`UserSettings.weeklyReviewReminder` (`prisma/schema.prisma:642`) is a persisted setting with **no producer**.

### 4.10 The 31 unproduced `NotificationType` values

`ROUTINE_REMINDER`, `GOAL_MILESTONE`, `WEEKLY_REVIEW`, `MONTHLY_REVIEW`, `QUARTERLY_REVIEW`, `YEARLY_REVIEW`, `WEEKLY_RESET`, `MONTHLY_RESET`, `STREAK_MILESTONE`, `DAILY_SUMMARY`, `FOCUS_SESSION_START`, `BREAK_REMINDER`, `HABIT_MISSED`, `HABIT_STREAK_AT_RISK`, `GOAL_AT_RISK`, `GOAL_COMPLETED`, `ROUTINE_COMPLETED`, `ROUTINE_MISSED`, `DAILY_RESET`, `WEEKLY_SUMMARY`, `MONTHLY_SUMMARY`, `STREAK_BROKEN`, `FOCUS_SESSION_END`, `REMINDER_SNOOZED`, `SLEEP_REMINDER`, `SLEEP_STARTED`, `MOTIVATIONAL`, `PRODUCTIVITY_INSIGHT`, `SYSTEM_UPDATE`.

Both nightly Vercel crons create **zero** notification rows — `scripts/compute-daily-scores.ts` and `scripts/generate-insights.ts` import no notification code.

---

## 5. Routine start and completion reminders

> **Answering your §3 directly: only the START is notified. There is no completion reminder of any kind, and no start confirmation.**

### What exists today

| Moment | Behaviour | Evidence |
| ------ | --------- | -------- |
| Before/at the block start | One `ROUTINE_START` push (+email), with `✓ Done` and `Snooze 10m` buttons | `scheduler.ts:466-500` |
| 10 min after a snooze tap | Same row re-dispatched at `scheduledFor + 10 min` | `notification.repository.ts:274-296` |
| **"Did you actually start at 09:15?"** | ❌ **does not exist** | — |
| **"Did you finish at 11:00?"** | ❌ **does not exist** | — |
| User records the block complete in the UI | The `ROUTINE_START` row is **untouched** | `routine.service.ts:894-945` touches only `RoutineLog` + `DailyScore` |
| User taps `✓ Done` on the toast | `RoutineService.logBlockCompletion(..., 'COMPLETED')` + row → `SENT` | `notification.service.ts:437-450` |

### The data you want is already modelled — nothing writes it from the UI

`RoutineLog` already has the exact fields your §3 requires (`prisma/schema.prisma:920-927`):

```prisma
actualStartTime String?   // HH:mm
actualEndTime   String?   // HH:mm
durationMinutes Int?
focusRating        Int?
productivityRating Int?
energyLevel        Int?
note String?
```

`RoutineService.logBlockCompletion` (`routine.service.ts:894-945`) already accepts and persists **all** of them, computing `durationMinutes` with overnight rollover (`:915-926`). The Zod schema allows them (`src/lib/validation/routine.schema.ts:59`).

**But grepping the entire component tree for `actualStartTime` returns zero UI hits.** The only writers are the service and the repository. `POST /api/routine/today` (`app/api/routine/today/route.ts:40-45`) sends only `{ blockId, date, status, note }` — so the `/today` "Right now" card and `/routine` both record **status only**. There is no form anywhere that asks for an actual start or end time.

### The `DONE` action's own gaps

- `applyAction` assumes `relatedEntityId` is a routine block id — the comment says so (`notification.service.ts:412`). No type guard. For `habit:<id>:<date>`, `goal:<id>:<date>` or a raw task id it would call `logBlockCompletion` and throw `ValidationError('Block not found')` (`routine.service.ts:910-912`). Currently unreachable because no producer attaches `actions` to those rows — but the endpoint has no guard.
- On `DONE`/`SKIP` the row is retired with `markSent(userId, id, { push: true })` (`:449`), which also writes **`sentViaEmail: false`** (`notification.repository.ts:326`) — overwriting a prior successful email flag.
- `SKIP` is accepted by the API (`app/api/notifications/action/route.ts:13`) but **produced by nothing**.

---

## 6. Sleep and wake-up notifications

> **Answering your §2 and §4 directly: the sleep flow exists but is not time-driven, and there is no "did you actually wake at 05:00?" confirmation.**

### The current flow

```
targetBedtime reached (lazy, on poll or cron)
   └─ ensureSleepPrompt()  ──► NotificationLog SLEEP_PROMPT (PENDING) + direct web push
                                    │
                              ┌─────┴─────┐
                       push buttons      auto-start after
                    YES / NOT_YET     sleepAutoStartAfterMinutes
                              │             │
              POST /api/sleep/session/respond   POST ... (cron)
                              │             │
                       SleepSession (USER_CONFIRMED) / (AUTO_NO_RESPONSE)
                              └─────┬─────┘
                                    ▼
                          "I woke up" button
                                    │
                    POST /api/sleep/session/stop
                                    │
              SleepSession.endedAt + SleepLog upserted for the wake date
                                    │
                    NotificationLog SLEEP_ENDED (created already SENT)
```

### Verified behaviour

| Question | Answer |
| -------- | ------ |
| When is the prompt created? | **Lazily**, the first time `resolveSleepState` runs after `targetBedtime` — either the `/today` 15 s poll (`useSleepSession.ts:67`) **or** `processSleepNotifications` from cron (`sleep-session.service.ts:440`). **Not** at a scheduled instant. |
| Is there a notification *at* bedtime? | Only if something polls or the cron runs. There is no `scheduledFor = bedtime` row. |
| What happens at the wake time? | **Nothing.** No producer references `targetWakeTime`. A wake-up notification does not exist. |
| Is there a "did you wake at the scheduled time?" prompt? | ❌ No such notification type or flow. |
| Is there a "did you go to bed at the scheduled time?" prompt? | ❌ No. The bedtime prompt asks only "start or not yet". |
| Can the user enter an actual sleep/wake time afterwards? | **Yes** — but only through the **manual** "Log Sleep" dialog (`TodaySleep.tsx:106-155` → `POST /api/sleep`), which is an ordinary form the user must go find. There is no prompted, "I missed it" entry point. |
| Does auto-start assume the user slept? | **Yes.** `processSleepNotifications` (`sleep-session.service.ts:442-478`) creates a `SleepSession` with `startedAt = targetBedtime` and source `AUTO_NO_RESPONSE` when the timeout elapses — **without any confirmation**. |
| Does the system force a response at an exact time? | No — which is the behaviour you asked for. But it substitutes by **assuming**, not by asking again. |

### Time input support

The manual form uses `<Input type="time">` (`TodaySleep.tsx:435`, `:448`), which is a 24-hour `HH:mm` field. **It can represent any time before or after midnight** (e.g. `23:30`, `00:15`, `05:45`). Overnight handling already exists in `calculateSleepDuration` (`src/lib/sleep/calculate-duration.ts:6-22`), which rolls the wake time forward a day when `wake ≤ bedtime`. So the *data model and maths* already support both directions — what is missing is the **prompted confirmation flow**, not the time handling.

### The `promptId` bug — sleep push buttons are broken

`public/sw.js:183-187` builds the click payload from the incoming push `data` but **drops `promptId`**:

```js
183:     data: {
184:       url: ...,
185:       notificationId: ...,
186:       actions,
187:     },
```

The server sends `data: { promptId: created.id }` (`sleep-session.service.ts:168`). The click handler then reads it back (`sw.js:212`, `:223`) → `undefined` → the body becomes `{"answer":"YES"}` → `respondSchema` requires `promptId: z.string().min(1)` (`app/api/sleep/session/respond/route.ts:20`) → **400**.

The `fetch` on that branch is not `.catch()`-ed, so the rejection is silent. **The `sleep-start` / `sleep-dismiss` push buttons do not work.** The only working sleep-prompt path is the in-page card on `/today` and `SleepPromptHost`.

---

## 7. Habit reminders

### Two producers write the same type

| Producer | `relatedEntityId` | Dedup | Fires |
| -------- | ----------------- | ----- | ----- |
| `scheduleDailyReminder` (`scheduler.ts:569`) | `daily:<localDate>` | **status-scoped** (`PENDING`) | once per day at `dailyReminderTime` (default 20:00) |
| `scheduleHabitReminders` (`habit-reminder.ts:45`) | `habit:<id>:<localDate>` | **not status-scoped** | per habit at `habit.reminderTime` |

Both create `HABIT_REMINDER` and both are gated by `habitReminders` — but via **different settings columns**: the daily one reads `habitReminders` (`scheduler.ts:585`), the per-habit one reads `habitReminders` too (`habit-reminder.ts:79`). Meanwhile the settings page writes `habitReminderNotifications` (`page.tsx:90`) — **a different column that no producer or the dispatcher reads.**

### Gaps

- **No frequency filtering.** `habit-reminder.ts:50-51` selects every `ACTIVE` habit with `reminderEnabled: true` and a `reminderTime`, regardless of `frequencyType`, `frequencyValue`, `HabitDayType` assignments, or `HabitOverride` (skip/pause/reschedule). A Monday-only habit with a reminder is nudged on Saturday.
- **No "already done today" check.** Nothing queries `HabitLog` before creating the reminder, so you can be told to brush your teeth after you have ticked it.
- **No completion notification.** Ticking a habit never creates or retires a row.

---

## 8. Repetition and reminder intervals

> **Answering your §5 directly: there is no repetition. What exists is a single 10-minute snooze and a 3-attempt delivery retry.**

### What "repeat" mechanisms exist

| Mechanism | Location | Semantics | Configurable? |
| --------- | -------- | --------- | ------------- |
| **SNOOZE button** | `scheduler.ts:497-500` → `app/api/notifications/action/route.ts:51-56` → `notification.service.ts:418-429` → `notification.repository.ts:274-296` | Same row, `scheduledFor = now + 10 min`, `retryCount → 0`, `errorMessage → null`. Row stays `PENDING` so the dispatcher re-picks it. | **No** — `SNOOZE_MINUTES = 10` is a module constant, declared **twice** (`scheduler.ts:18` and `action/route.ts:17`) |
| **Delivery retry** | `notification.service.ts:116`, `notification.repository.ts:377-383` / `:441-453` | Re-selects `FAILED && retryCount < 3`. | **No** — hardcoded `3` |

### What does **not** exist

- **No `repeat` / `interval` / `recurrence` / `maxRepeats` column** on `NotificationLog` (`:2118-2154`).
- **No nag-again producer.** Nothing re-queues a notification because it went unanswered.
- **No `UserSettings` column** for a reminder interval. `advanceNotificationMinutes` (`prisma/schema.prisma:635`) is a **lead time**, not an interval, and has no upper clamp.
- `NotificationType.REMINDER_SNOOZED` exists (`:266`) and is mapped to a category (`categories.ts:162`) but is **never created**.
- `src/lib/email/scheduler.ts:34` has a `RepeatFrequency` helper — it is for `ScheduledEmail`, not `NotificationLog`, and is unreferenced.
- `src/server/domain/habit/habit-frequency.ts` `repeatEvery` governs habit *logging* eligibility, not reminders.

### Retry has no backoff

`findDueForDispatch` has **no `nextAttemptAt`/`availableAt` predicate** — only `scheduledFor: { lte: before }` (`notification.repository.ts:362`). A failed row is re-selected on the very **next** tick, so with the 5-minute cron the 3 retries are consumed in **~10 minutes of wall clock**. A snooze (which resets `retryCount` to 0, `:288`) behaves the same way.

### Snooze is uncapped

`notification.repository.ts:274-296` has no attempt counter for snoozes. Tapping "Snooze 10m" repeatedly re-arms the row indefinitely. The only thing that bounds it is that the underlying `ROUTINE_START` dedupe (§14) blocks a *new* row while one is `PENDING` — which means a snoozed routine reminder **also blocks all future routine reminders for that block**.

---

## 9. Ignoring and dismissing

### Dismiss

`PATCH /api/notifications/[id]` `{action:'dismiss'}` → `notification.service.ts:481-491` → `notification.repository.ts:464-474`:
```ts
where: { id: notificationId, userId },
data: { status: NotificationStatus.DISMISSED, dismissedAt: new Date() },
```
**No status guard.** Nothing else changes: `readAt`, `sentAt` untouched; no channel suppression; no entity-level memory.

> The `dismissed === 0` idempotency branch at `notification.service.ts:487` is **unreachable** — with no status guard, `updateMany` always returns 1.

### Does dismissing stop future notifications for that entity?

**No — and for routine blocks it actively backfires.**

```ts
// src/server/notifications/scheduler.ts:130
where: { userId, type, relatedEntityId: routineBlockId, status: 'PENDING' },
```

Because the dedupe only counts `PENDING` rows, dismissing one **removes it from the dedupe set**, so the next tick is free to queue a fresh reminder for the same block.

For habits and goals the dedupe key embeds the local date and does **not** filter status (`habit-reminder.ts:92`, `goal-reminder.ts:140`), so those are one-per-day regardless.

### Is there a "don't ask again"?

**No.** Nothing suppresses a type, entity, or category permanently on the basis of feedback. `Habit.reminderEnabled` is never written by notification code. The only durable opt-outs are the category-wide `UserSettings` columns.

### What if the user simply never responds?

- `status` is already `SENT`; no producer targets a `SENT` row, so **it is never re-sent**.
- It stays **unread forever**. `unreadCount` filters only `{ userId, readAt: null, dismissedAt: null }` (`notification.repository.ts:186`) — **no status filter**, so the bell badge counts unsent, future-scheduled, and failed rows as "unread".
- There is **no TTL, no auto-expiry, no archive job, no read-receipt deadline**.
- Removing it from the badge requires dismissing — and **no client surfaces that action** (§11).

---

## 10. Completing a task without responding

> **Answering your §9 directly: nothing reconciles. This is the single largest structural gap.**

Grepping `notificationLog` / `notificationRepository` across `src/server` returns matches in **only four files**: `notification.repository.ts`, `notifications/scheduler.ts`, `notifications/habit-reminder.ts`, `notifications/goal-reminder.ts` (plus `notification.service.ts` and `sleep-session.service.ts` via the repository wrapper).

**No habit, task, goal, routine, score, or automation service touches a notification row.**

| Path | What it writes | Notification side effect |
| ---- | -------------- | ----------------------- |
| `POST /api/habits/[id]/log` → `HabitService` | `HabitLog`, `Streak`, `DailyScore` | **none** |
| `POST /api/routine/today` → `RoutineService.logBlockCompletion` | `RoutineLog`, `DailyScore` (`:928`, `:941-942`) | **none** |
| `POST /api/tasks/[id]/complete` | `Task` | **none** — `TASK_DUE`/`TASK_OVERDUE` rows persist |
| `POST /api/goals/[id]/checkin` | `GoalProgress`, `Goal` | **none** |
| `POST /api/focus/[id]/complete` | `FocusSession` | **none** |

### Consequence

`findDueForDispatch` (`notification.repository.ts:360-383`) has **no join to `RoutineLog`, `HabitLog`, or `Task`** and no check that the entity is already done. A `PENDING` reminder for a block you completed an hour ago will still be dispatched — **including a push toast and an email**.

### The orphaned primitives that would do this

`dismissPendingByType(userId, type)` (`notification.repository.ts:479-489`) and `markPendingByTypeSent(userId, type)` (`:247-257`) — both would retire outstanding rows by type, and **both have zero callers**.

---

## 11. App closed / background behaviour

### End-to-end with the app fully closed

```
GitHub Actions → curl /api/cron/notification-tick → producers insert
   → dispatchDueNotifications → pushService.sendToUser → web-push → browser push service
   → service worker 'push' handler → registration.showNotification → OS toast
```

**No tab, no React, no page load is involved.**

### What requires the tab open

| Behaviour | Needs the tab? | Evidence |
| --------- | -------------- | -------- |
| Push receipt + toast | **No** | `sw.js:149-194` |
| `notificationclick` action buttons | **No** | `sw.js:196-254` |
| Offline navigation to `actionUrl` | **No** | `sw.js:256-265` |
| **Unread bell badge** | **Yes** — 60 s poll | `NotificationBell.tsx:43` |
| **Clearing the dispatch backlog** | **Yes** | `runCatchUp` fires from `GET /api/notifications` (`app/api/notifications/route.ts:95`) |
| In-app sleep prompt card | **Yes** — 15 s poll | `useSleepSession.ts:67` |
| The notification list at all | **Yes** | `/notifications` page |

### The service-worker click handler — `public/sw.js:196-254`

| `event.action` | Target |
| -------------- | ------ |
| `sleep-start` | `POST /api/sleep/session/respond` `{promptId, answer:'YES'}` — ⚠️ **broken, `promptId` is dropped** (§6) |
| `sleep-dismiss` | `POST /api/sleep/session/respond` `{promptId, answer:'NOT_YET'}` — ⚠️ same |
| any other non-`open` with `data.notificationId` | `POST /api/notifications/action` `{notificationId, action}` |
| `open`, or body click | navigate only |

**Navigation** — `focusOrOpen` (`sw.js:256-265`): if **any** window client exists, the **first one matched is navigated and focused**. The notification does not open in the tab you were using. Only with zero windows does it `openWindow`.

### The `notificationclick` handler — `public/sw.js:196-254`

| `event.action` | Target |
| -------------- | ------ |
| `sleep-start` | `POST /api/sleep/session/respond` `{promptId, answer:'YES'}` — ⚠️ **broken, `promptId` is dropped** (§6) |
| `sleep-dismiss` | `POST /api/sleep/session/respond` `{promptId, answer:'NOT_YET'}` — ⚠️ same |
| any other non-`open` with `data.notificationId` | `POST /api/notifications/action` `{notificationId, action}` |
| `open`, or body click | navigate only |

**Navigation** — `focusOrOpen` (`sw.js:256-265`): if **any** window client exists, the **first one matched is navigated and focused**. The notification does not open in the tab you were using. Only with zero windows does it `openWindow`.

### Every push shares the tag `'routineos'`

```js
// public/sw.js:178
tag: data && typeof data.tag === 'string' ? data.tag : 'routineos',
```

**No producer ever sets `tag`** — grep for `tag:` in `src/server` returns only Prisma `Category.tag` relation includes. Combined with `renotify: true` (`:179`), a second routine reminder **replaces** the first toast instead of stacking, contradicting the design note at `sw.js:146-148`.

### In-app acknowledgement does not exist

`POST /api/notifications/action` is called from **exactly one place**: `public/sw.js:237`. **No React component calls it.** Grep for `api/notifications` across `src` returns only `NotificationBell.tsx:33` (GET), `NotificationHistory.tsx:128` (GET), `NotificationHistory.tsx:200` (markAllRead), and a comment in `Header.tsx:63`.

`NotificationHistory` offers only: period filters, category chips, tag chips, paging, "Mark all as read", and an "Open" link (`:466-473`) — which **navigates but sends nothing to the server**, leaving the row unread and unsatisfied.

> **A user who never grants push permission, or uses a browser without push, has no way to acknowledge or dismiss an individual notification — only "mark all as read".**

### Where the UI *is*

`NotificationBell` is mounted in the shared header (`src/components/layout/Header.tsx:6,67`), so it appears on `/today` and every authenticated page. It polls `GET /api/notifications?limit=1` every 60 s for `unreadCount` (`:32-33`, `:42-43`), swallows errors (`:36-39`), renders only an icon + a `99+`-capped badge (`:58-65`), and navigates to `/notifications` on click (`:52`).

**`/today` itself renders no notification UI** — grep for `otification` in `src/app/(dashboard)/today/` returns nothing. The full list is `src/app/(dashboard)/notifications/page.tsx:25` → `NotificationHistory.tsx`.

### Background sync is a no-op

```js
// public/sw.js:130-139
if (event.tag === 'sync-habits') { event.waitUntil(syncPendingHabits()); }
async function syncPendingHabits() { console.log('Syncing pending habits...'); }
```
No `sync` tag is ever registered.

### In-app catch-up is dispatch-only

`app/api/notifications/route.ts:95` fires `runCatchUp(userId)` — not awaited, throttled to 5 minutes by an **in-memory per-instance `Map`** (`:27`, `:37`, documented `:29-36`). It calls `dispatchDueNotifications({ userId })` (`:162-163`) and **never produces**. If the producers have not run, there is nothing to catch up on, and an idle user gets nothing.

---

## 12. Day-type scheduling

> **Answering your §11 and your §1 directly: routine reminders are half day-type-aware; everything else is blind. There is no mechanism that asks about, or schedules against, tomorrow's day type.**

### Routine blocks: aware for *selection*, blind for *timing*

Selection resolves the exception correctly (`scheduler.ts:357-374`):
```ts
for (let dayOffset = 0; dayOffset < 8; dayOffset += 1) {
  const localDate = shiftCalendarDay(todayLocal, dayOffset);
  const exception = await routineRepository.findException(userId, localDate);
  const resolved = resolveDayTypeFromException(localDate, timezone, exception ?? undefined);
  const templateId = exception?.dayTypeId
    ? exception.dayTypeId
    : (await routineRepository.findTemplateByDayType(userId, resolved.dayType))?.id;
  ...
}
```

But the resolved `localDate` is then **written through `as never` and immediately voided** (`scheduler.ts:421-425`):
```ts
localDate,
} as never);
}
void localDate;
void dayOffset;
```

The actual `scheduledFor` comes from `getNextOccurrence`, which re-derives the date from **weekday-only matching on the coarse `RoutineTemplate.dayType`** (`scheduler.ts:248-266`):
```ts
case 'WORKDAY': { const d = weekdayOfLocalDate(localDate); return d >= 1 && d <= 5; }
case 'WEEKEND': { const d = weekdayOfLocalDate(localDate); return d === 0 || d === 6; }
// Holidays / exam days / low energy / custom are not auto-derived, so the
// template is treated as applying to any day, matching the old switch.
default: return true;
```
called with `block.template.dayType` (`scheduler.ts:444-450`) — the coarse `RoutineTemplate.dayType @default(CUSTOM)` column (`prisma/schema.prisma:821`), **not** `RoutineException.dayType`.

**Consequence:** a `CUSTOM` / `HOLIDAY` / `EXAM_DAY` / `LOW_ENERGY` template chosen via an exception is timed by "any day", so its reminder lands on the first future day whose wall clock matches — **not necessarily the exception date.**

### Every other producer is day-type-blind

| Producer | Missing filter |
| -------- | -------------- |
| Habit | no `frequencyType`, `HabitDayType`, `HabitOverride`, or `RoutineException` |
| Goal | no `GoalDayType`, no `RoutineException` |
| Task | no day types at all |
| Daily check-in | settings only |
| Sleep prompt | settings / bedtime / session state only |

The eligibility helpers that *do* implement this — `src/lib/habits/eligibility.ts`, `src/server/domain/habit/habit-frequency.ts`, `GoalService.getVisibleGoalsForDate` — are **not called by any notification producer**.

### Day types that exist but are never scheduled against

`WORKDAY`, `WEEKEND`, `HOLIDAY`, `EXAM_DAY`, `LOW_ENERGY`, `CUSTOM` (`prisma/schema.prisma:52-59`).

- **No automatic holiday detection anywhere in the codebase.**
- `HOLIDAY`/`EXAM_DAY`/`LOW_ENERGY` templates hit the `default: return true` branch, so they are treated as "every day".
- `DailyScore.isRestDay` / `isMinimumDay` exist and are settable via `POST /api/day-mode {mode:'REST'|'MINIMUM'}`, but **no notification producer reads them**, and `/today` never sends those modes.

### No "tomorrow" scheduling exists

There is **no** code path anywhere in `src/server/notifications`, `notification.service.ts`, or the cron routes that references tomorrow. Grep for `tomorrow` in notification code returns only two incidental code comments (`goal-reminder.ts:135`, `scheduler.ts:278`).

**There is no notification type, producer, or UI that asks the user what kind of day tomorrow will be.**

---

## 13. Missed notifications and delayed responses

> **Answering your §12 directly: notifications are delivered late rather than dropped — but "late" can mean hours, and two failure modes strand rows permanently.**

### Late, never dropped — for `PENDING` rows

`findDueForDispatch` (`notification.repository.ts:362`) uses `scheduledFor: { lte: before }` with **no lower bound and no TTL**. Any row whose `scheduledFor` has passed is selected, however old, ordered oldest-first (`:419`), batched at 100, so a backlog drains across ticks.

Corroborated in-repo: `notification-tick/route.ts:43-45` — "a missed tick causes a *late* notification, never a lost one".

### Two ways a row is stranded permanently

1. **`FAILED` with `retryCount >= 3`** — never re-selected (`:381`), never deleted, never surfaced beyond the "Not delivered" chip (`NotificationHistory.tsx:453-457`). No dead-letter, no expiry, no user notification.
2. **`SLEEP_PROMPT` never resolved** — excluded from the dispatcher (`notification.service.ts:110`), delivered only by the inline push. If the push fails and neither `respondToPrompt` nor the auto-start cron runs, the row stays `PENDING` forever.

### No backoff on retry

Three retries consumed in ~10 minutes (§8). A transient push outage does not get a longer window.

### Cron failure modes

| Condition | Effect |
| --------- | ------ |
| `NOTIFICATION_BASE_URL` repo variable unset | Workflow exits 1 before the curl (`.github/workflows/notification-scheduler.yml:71-76`). **The entire producer + dispatcher pipeline stops silently.** Nothing is produced; the in-app catch-up only dispatches. |
| `CRON_SECRET` repo secret unset | Same (`:78-83`) |
| `CRON_SECRET` unset app-side | `cron-auth.ts:20-35` returns **500** with `error: 'CRON_SECRET is not set'`. `CRON_SECRET` is **absent from `.env.example`**. |
| Tick exceeds 60 s | `vercel.json:17-19` caps `app/api/cron/**` at `maxDuration: 60`; the workflow allows `--max-time 120` (`:96`). Server-side truncation is masked by `continue-on-error: true` (`:94`). |
| Endpoint `/api/cron/run-automations` | **No configured caller** — `TIME_REACHED` automations with `SEND_NOTIFICATION` never fire. |
| `/api/cron/{schedule-routine-notifications, dispatch-notifications, sleep-notifications}` | **No configured caller.** `sleep-notifications/route.ts:12-14` states a scheduler *must* point at it; no such config exists in-repo. **`Needs verification`** whether an out-of-repo scheduler targets them. |
| GitHub Actions on public repos | Auto-disabled after 60 days of inactivity (`:38-39`); GitHub may also delay scheduled workflows (`:29-31`). |

### No test coverage

`vitest.config.ts:13` includes `tests/**/*.test.ts` — **no such directory exists**.

---

## 14. Duplicate prevention

> **Answering your §13 directly: four different dedupe strategies are in use, and three of them are not date-scoped. This is the single most consequential set of bugs in the system.**

| Producer | Rule | Status-scoped? | Date-scoped? | Result |
| -------- | ---- | -------------- | ------------- | ------ |
| Routine block | `count({ userId, type, relatedEntityId: block.id, status: 'PENDING' })` (`scheduler.ts:130`) | ✅ PENDING only | ❌ **no** | **One live reminder per block at a time — not per occurrence** |
| Daily check-in | `count({ …, relatedEntityId: daily:<date>, status: 'PENDING' })` (`:596-604`) | ✅ | ✅ | one per day |
| Per habit | `count({ userId, type, relatedEntityId })` (`habit-reminder.ts:92`) | ❌ | ✅ | one per habit per day, ever |
| Goal | `count({ userId, type, relatedEntityId })` (`goal-reminder.ts:140`) | ❌ | ✅ | one per goal per day, ever |
| Task due/overdue | `hasReminder` → `countByTypeAndRelatedId(userId, type, task.id)` (`notification.repository.ts:212-224`) | ❌ | ❌ | ⚠️ **`TASK_DUE` fires at most once per task, ever** |
| Sleep prompt | `countByTypeAndRelatedId(… promptKey)` (`sleep-session.service.ts:125-130`) | ❌ | ✅ | one per local date |
| Automation | **none** (`automation.service.ts:337`) | ❌ | ❌ | every trigger creates a row |
| In-run | `seenBlockIds` set (`scheduler.ts:355`, `:406-407`) and `seenBlocks` keyed on `block.id` (`:429`, `:439-441`) | — | — | guards one pass |

### Consequences

**Routine blocks.** `getNextOccurrence` searches forward up to 8 days (`scheduler.ts:269-284`) and picks the first future match. But the dedupe checks only for a `PENDING` row keyed on the block id. Because a dispatched row moves to `SENT`, the next day's occurrence **can** be queued. However:
- while a snoozed row is `PENDING`, **all** future occurrences for that block are blocked;
- once **dismissed**, the row leaves `PENDING` and the dedupe stops seeing it — so a dismissal is what *re-enables* reminders.

**Tasks.** `relatedEntityId = task.id` with no date and no status filter means a `TASK_DUE` row, once created, permanently blocks any future `TASK_DUE` for that task. **A recurring task is reminded exactly once, ever.** `TASK_OVERDUE` behaves identically.

### Duplicates that *are* possible

- **No atomic claim.** `findMany` with no `FOR UPDATE`, no lease, no claimed-at column (`notification.repository.ts:360-383`). Two concurrent dispatchers select the same row and **both send**; only the post-hoc status guard (`markSent`, `:316`) de-duplicates the *database write*, never the delivery. The only practical guards are the workflow-level `concurrency` group (`notification-scheduler.yml:55-59`) and the in-process throttle (`notifications/route.ts:37`).
- **Automation rows have no dedupe at all** — `HABIT_COMPLETED` fires `automation.service.ts` per habit log (`habit.service.ts:379`) and `SCORE_THRESHOLD` per score computation (`scoring.service.ts:258`, which runs on every habit log *and* every routine-block completion *and* every sleep write).
- **`markSent` guard accepts `PENDING` and `FAILED`** (`:316`) — intentional for retries, but it means a genuinely concurrent double-dispatch both passes.

---

## 15. Database storage of status and responses

### The model — `prisma/schema.prisma:2118-2154`

```prisma
model NotificationLog {
  id     String @id @default(cuid())
  userId String
  user   User   @relation(fields: [userId], references: [id], onDelete: Cascade)

  type            NotificationType
  relatedEntityId String?      // producers put heterogeneous keys here: block ids,
                                // "habit:<id>:<date>", "daily:<date>", "sleep-prompt:<date>"

  title String
  body  String? @db.Text

  actionUrl  String?
  actionData String?   // JSON: actions[] for the push notification

  scheduledFor DateTime
  sentAt       DateTime?
  readAt       DateTime?
  dismissedAt  DateTime?

  status NotificationStatus @default(PENDING)

  sentViaEmail Boolean @default(false)
  sentViaPush  Boolean @default(false)
  sentViaSMS   Boolean @default(false)

  errorMessage String?
  retryCount   Int     @default(0)

  @@index([userId, status, scheduledFor])
  @@index([type, status])
  @@index([userId, createdAt])
}
```

**There is no separate response/answer table.** Every response is a column on the row.

### Field write map — exhaustive

| Field | Written by | **Never written by** |
| ------ | ---------- | ------------------- |
| `status` | `notification.repository.ts:89` (create), `:141` (`READ`), `:158` (`READ`), `:319` (`SENT`), `:450` (`FAILED`), `:468` (`DISMISSED`); `scheduler.ts:54,639`; `habit-reminder.ts:105`; `goal-reminder.ts:165`; `task-reminder.ts:104`; `sleep-session.service.ts:154,272,337,408,476` | — every enum value is written somewhere. `DISMISSED` only via the **uncalled** `PATCH` route and the sleep "Not yet" path |
| `sentAt` | `notification.repository.ts:86`, `:320` | never on `markFailed`, `markRead`, `markAllRead`, `markDismissed`, or `snooze` |
| `readAt` | `notification.repository.ts:87` (create — **never passed by any caller**), `:140`, `:157` | never by the dispatcher, `applyAction`, or `dismiss` |
| `dismissedAt` | `notification.repository.ts:88` (create — **never passed**), `:468` | never by `markFailed`, `markSent`, `snooze` |
| `sentViaEmail` | `notification.repository.ts:323`; `:90` (create — never passed) | only `true` from `notification.service.ts:650` |
| `sentViaPush` | `notification.repository.ts:324`; `:91` (create — never passed) | only `true` from `notification.service.ts:681` or `applyAction`'s hardcoded `{push:true}` (`:449`) |
| `sentViaSMS` | `notification.repository.ts:325`; `:92` (create — never passed) | ⚠️ **never `true` by any code path** — SMS has no implementation |
| `errorMessage` | `notification.repository.ts:93` (create — never passed), `:289` (snooze → `null`), `:451` (`markFailed`) | ⚠️ **never cleared by `markSent`** — a row that fails then succeeds keeps stale error text with `status: SENT` |
| `retryCount` | `notification.repository.ts:452` (increment), `:288` (snooze → 0) | never reset by `markSent` |

Six parameters on `NotificationRepository.create` (`notification.repository.ts:19-25`, forwarded `:87-93`) — `readAt`, `dismissedAt`, `sentViaEmail`, `sentViaPush`, `sentViaSMS`, `errorMessage` — are **structurally dead**: `NotificationService.createNotification` (`:247-257`) never passes them.

### Fields read by no UI at all

- **`retryCount`** — never in any response. Only read by the repository's own re-selection filter (`:381`) and `markFailed` guard (`:447`).
- **`sentViaEmail` / `sentViaPush` / `sentViaSMS`** — grep hits **only** in `notification.repository.ts` and the dead `scheduler.ts:97-99`. Written and never displayed.
- **`dismissedAt`** — read only by `unreadCount` (`notification.repository.ts:186`).

### Where responses are stored

| User response | Persisted as |
| ------------- | ------------ |
| Acknowledged `DONE` | `status = SENT`, `sentAt = now`, `sentViaPush = true`, **`sentViaEmail = false`** (`notification.service.ts:449` → `notification.repository.ts:321-327`) |
| Acknowledged `SKIP` | same, plus a `RoutineLog` with `status: 'SKIPPED'` (`:444`) |
| Snoozed | `scheduledFor += 10 min`, row stays `PENDING`, `retryCount → 0` |
| Dismissed | `status = DISMISSED`, `dismissedAt = now` |
| Marked read | `status = READ`, `readAt = now` (`:135-147`) |
| Marked all read | same, `where: { userId, readAt: null }` — **no status guard** (`:152-165`) |
| Sleep prompt YES / NOT_YET | `SENT` / `DISMISSED` (`sleep-session.service.ts:267`, `:302`) |

**No response payload is ever stored** — there is no "the user said it started at 09:20" anywhere. `RoutineLog.actualStartTime/actualEndTime` is the only field that could hold it, and **no UI writes it** (§5).

### One integrity note

`findAll` (`notification.repository.ts:104-117`) filters on `userId` and optional `readAt: null` only, and orders by `createdAt DESC` (`:111`), **not** `scheduledFor`. So `getHistory` (`notification.service.ts:310-314`) returns **every** row including future-scheduled `PENDING` and `FAILED` ones — and `unreadCount` (`:186`) counts them all as unread. Inconsistent with `unreadOnly=true` (`app/api/notifications/route.ts:56-59`), which filters `readAt: null` and therefore **includes** dismissed rows while `unreadCount` excludes them.

---

## 16. Configuration and operational dependencies

| Setting | Column | Read by a producer? | Read by the dispatcher? |
| ------- | ------ | ------------------- | ----------------------- |
| `notificationsEnabled` | `prisma/schema.prisma:617` | ✅ all | ✅ `:607` |
| `pushNotifications` | `:619` | ✅ routine only (`schedule-all.ts:54`) | ✅ `:659` |
| `emailNotifications` | `:618` | ❌ | ✅ `:633` |
| `smsNotifications` | `:620` | ❌ | ❌ **never read** |
| `routineStartNotifications` | `:627` | ✅ `:308` | ✅ `:141` |
| `upcomingRoutineNotifications` | `:628` | ✅ `:322` | ❌ |
| `sleepReminderNotifications` | `:629` | ❌ | ✅ `:143` |
| `habitReminders` | `:640` | ✅ `:585`, `habit-reminder.ts:79` | ✅ `:140` |
| `goalReminders` | `:641` | ✅ `goal-reminder.ts:119` | ✅ `:141` |
| `habitReminderNotifications` | `:630` | ❌ **never read** | ❌ |
| `goalReminderNotifications` | `:631` | ❌ **never read** | ❌ |
| `dailyReminder`, `dailyReminderTime` | `:638-639` | ✅ `:584`, `:588` | ❌ |
| `quietHoursStart`, `quietHoursEnd` | `:621-622` | ❌ | ❌ **never read anywhere** |
| `advanceNotificationMinutes` | `:635` | ✅ `:322` | ❌ |
| `sleepReminder`, `targetBedtime`, `sleepAutoStartEnabled`, `sleepAutoStartAfterMinutes` | `:605-609` | ✅ `sleep-session.service.ts:116-142` | ❌ |
| `weeklyReviewReminder` | `:642` | ❌ **no producer exists** | ❌ |

### Category mapping — `src/lib/notifications/categories.ts:141-213`

`routine` · `habits` · `goals` · `tasks` · `sleep` · `focus` · `streaks` · `reviews` · `achievements` · `insights` · `settings`, with fallback `'system'` (`:215-217`). This is a **display/filter map only** — it is never consulted when creating a row.

`journal` has **no entry** (`:199-208`) but is still listed in `CATEGORY_ORDER` (`:48-62`), so the filter renders with a permanent zero count.

### VAPID — `src/server/services/push.service.ts:84-103`

| State | Behaviour |
| ----- | --------- |
| Keys missing | `vapidError` set (`:89-91`); `sendToUser` returns `{sent:0, failed:0, reason}` without sending (`:114-127`). **In the dispatcher, `push.failed === 0`, so no failure is recorded** — `push.reason` is only consulted inside the `failed > 0` branch (`notification.service.ts:688-694`). The row is marked `SENT` with `sentViaPush: false`. **Misconfiguration is invisible in the data.** |
| `VAPID_SUBJECT` missing | Defaults to `mailto:dev@routineos.example` (`:34`); push still works |
| `VAPID_SUBJECT` invalid (e.g. `localhost`) | `web-push` throws, caught at `:98-102` → same silent degradation as missing keys |
| Mismatched key pair | `setVapidDetails` accepts them at configure time; failure surfaces per-send as HTTP 403 (`:184-195`). The device is **not pruned** and cannot self-heal |
| Browser registered against an older key | Identical 403 path |

`.env` lines 29-31 define all three keys non-empty. **None of `.env.example`, `.env.local.example`, or `.env.production` contains any `VAPID` or `RESEND` entry**, and `vercel.json:8-10` sets `SKIP_ENV_VALIDATION: "1"`, so a clone or deploy following the example envs gets push and email **silently disabled while still recorded as delivered**. **`Needs verification`** — whether a runtime env check exists outside `src/`.

### Push subscription lifecycle

- **Creation** — only via `settings/notifications/page.tsx:257-323`. `src/lib/pwa/push-client.ts:35-54` (`ensurePushSubscription`) has **zero callers**.
- **Storage** — upsert on the unique `endpoint` (`push-subscription.repository.ts:27-47`), refreshing `isActive: true`.
- **Retrieval** — `findAll(userId)` (`:56-65`) has **no `isActive` filter and no pagination**. Every send loads every subscription the user has ever registered. `isActive` is written only by the upsert (`:36,44`) and **read by nothing**, so the settings page's "Active/Inactive" label (`page.tsx:683`) is always "Active". `lastUsedAt` is only updated on re-registration (`:45`), never on send.
- **Pruning** — 404 / 410 / 400 → the subscription is deleted (`push.service.ts:178-183`). **403 → kept**, with a specific diagnostic (`:184-195`). No other background sweep.
- **Diagnostics** — `POST /api/push/test` (503 if unconfigured, 409 with `reason` if no device reached) is the only user-facing signal.

---

## 17. Consolidated gaps and limitations

Ordered by impact.

### Blocking

| # | Gap | Evidence |
| - | --- | -------- |
| 1 | **`sleep-start` / `sleep-dismiss` push buttons always 400.** The SW push handler drops `promptId`; the click handler reads `undefined`. | `public/sw.js:183-187` vs `:212`, `:223`; `app/api/sleep/session/respond/route.ts:20` |
| 2 | **No completion reconciliation.** Completing a block/habit/task/goal never retires its outstanding notification; the reminder still fires. | §10 — no service outside `notification*` touches a row |
| 3 | **`TASK_DUE` fires at most once per task, ever.** Dedup key has no date and no status filter. | `notification.repository.ts:212-224`, `task-reminder.ts:87` |
| 4 | **No atomic claim.** `findMany` then post-hoc status guard — concurrent dispatchers can both send. | `notification.repository.ts:360-383` vs `:316` |
| 5 | **No wake-up notification and no sleep/wake confirmation.** The user asked for both. Nothing references `targetWakeTime` in a notification. | §6 |
| 6 | **Auto-start assumes the user slept**, with `startedAt = targetBedtime`, without confirmation. | `sleep-session.service.ts:442-478` |

### High

| # | Gap | Evidence |
| - | --- | -------- |
| 7 | **No in-app acknowledgement.** `POST /api/notifications/action` is SW-only; a user without push cannot dismiss or acknowledge anything individually. | §11 |
| 8 | **No repetition of any kind.** Only a 10-min snooze (hardcoded twice) and a 3-attempt delivery retry. | §8 |
| 9 | **Quiet hours persisted, exposed in the UI, and never read.** | `prisma/schema.prisma:621-622`; zero readers in `src/server` or `src/lib` |
| 10 | **Suppressed notifications are stamped `SENT` with `sentAt`.** No `SKIPPED`/`SUPPRESSED` status exists. | `notification.service.ts:610-613`, `:622-625`; enum has 5 values only |
| 11 | **Email recorded as delivered without `RESEND_API_KEY`.** | `sender.ts:55-69` → `notification.service.ts:650` |
| 12 | **Push recorded as delivered without VAPID keys**, because `failed === 0` short-circuits the reason check. | `push.service.ts:114-127` → `notification.service.ts:688-694` |
| 13 | **`errorMessage` never cleared on success.** | `notification.repository.ts:321-327` |
| 14 | **Every push shares `tag: 'routineos'` with `renotify: true`** → reminders replace each other instead of stacking. No producer sets `tag`. | `public/sw.js:178-179` |
| 15 | **`'Asia/Kolkata'` hardcoded at `scheduler.ts:592`**, contradicting `DEFAULT_TZ` used everywhere else in the same file. | §3 |
| 16 | **The entire pipeline has a single point of failure.** One GitHub Action, two required secrets, and if either is unset nothing is produced — silently. | §13 |

### Medium

| # | Gap | Evidence |
| - | --- | -------- |
| 17 | **Habit reminders ignore frequency, day types and overrides.** | `habit-reminder.ts:50-51` |
| 18 | **Routine reminder timing ignores the exception's day type** — the resolved `localDate` is voided. | `scheduler.ts:421-425` vs `:248-266` |
| 19 | **No "already done today" check** before any reminder. | §7 |
| 20 | **`unreadCount` counts unsent and failed rows**; `unreadOnly=true` includes dismissed rows. | `notification.repository.ts:186` vs `notifications/route.ts:56-59` |
| 21 | **No in-app dismiss/read button.** `PATCH /api/notifications/[id]` has **zero client callers**. | §11 |
| 22 | **`retryCount`, `sentVia*` are never exposed in any response.** | §15 |
| 23 | **Six `NotificationRepository.create` parameters are structurally dead.** | `notification.repository.ts:19-25` vs `notification.service.ts:247-257` |
| 24 | **Retry has no backoff** — 3 attempts in ~10 minutes. | `notification.repository.ts:362` |
| 25 | **`focusOrOpen` navigates the first matching window**, not the one the user was using. | `public/sw.js:256-265` |
| 26 | **`DONE`/`SKIP` assume a routine block id** with no type guard. | `notification.service.ts:412` |
| 27 | **`habitReminderNotifications` / `goalReminderNotifications` are written by settings and read by nothing.** | `prisma/schema.prisma:630-631` |
| 28 | **`pushSubscription.isActive` is written and never read**; `lastUsedAt` never updated on send. | `push-subscription.repository.ts:36,44,56-59` |

### Dead code

| Area | Items |
| ---- | ----- |
| Producers | `notifyGoalDue`, `notifyHabitReminder`, `weekly-review.ts` (whole module), `markNotificationSent`, `markNotificationFailed`, `getPendingNotifications`, `getNotificationsToSend` |
| Repository | `createMany`, `markPendingByTypeSent`, `dismissPendingByType` |
| Service | `getNotifications`, `delete` |
| Email | `queue.ts` (whole), `scheduler.ts` (whole), `email.service.ts`'s three notification methods |
| Push | `push-client.ts` (`ensurePushSubscription`, `removePushSubscription`, `deleteSubscription`, `registerServiceWorker`) |
| Components | `NotificationSettings.tsx`, `QuietHours.tsx`, `ReminderEditor.tsx` — **zero importers**; hardcoded Tailwind inconsistent with the design system; `onSave: (settings: any) => void`; and `QuietHours.tsx:16-17` calls `handleUpdate()` **inside the setter callback**, so it reads stale state on every change |
| Other | `sanitizeNotificationPayload`, `UserSettings.weeklyReviewReminder` (no producer) |
| Settings | **SMS toggle** (`settings/notifications/page.tsx:435`) with no implementation |

### Stale comments

- `notification-tick/route.ts:69-70` — claims the dispatcher invokes task reminders; it does not.
- `sleep-session.service.ts:21-23` — claims sleep prompts are "exempt from quiet hours"; there is no quiet-hours code to be exempt from.
- `NotificationService.dismiss` (`:462`) — describes an idempotent no-op that the status guard-less implementation cannot produce.

---

## 18. Readiness against the five requested capabilities

**Mapping only — no design proposed, no code written.** This states what exists, what is adjacent, and what is absent, so you can direct the next step.

### §1 — Tomorrow's day-type selection

| Need | Status |
| ---- | ------ |
| A notification asking about tomorrow | ❌ **Absent.** No producer, no `NotificationType`, no code path referencing tomorrow in the notification layer |
| Surface on `/today` | ❌ `/today` renders no notification UI (bell is in the shared `Header`) |
| Persist a choice for tomorrow | ⚠️ **The write path already exists** — `RoutineException` is `@@unique([userId, date])`, and `POST /api/day-mode` already accepts an arbitrary `date`. Only the day-bound is wrong |
| Update routine / habits / goals accordingly | ⚠️ **Resolution already consumes `RoutineException`** (`resolveDayTypeForDate`) for habits, goals and routine templates — so an exception written for tomorrow *would* take effect. But routine **notification timing** ignores it (§12) |

### §2 / §4 — Sleep and wake-up time confirmation

| Need | Status |
| ---- | ------ |
| Automatic start at the target bedtime | ⚠️ **Partial** — auto-start exists (`AUTO_NO_RESPONSE`, `sleep-session.service.ts:442-478`) but is driven by a **timeout after a lazily-created prompt**, not by the clock, and it **assumes** the user slept |
| Wake-up notification at `targetWakeTime` | ❌ **Absent** |
| "Did you wake at the scheduled time?" prompt | ❌ **Absent** |
| "Did you go to bed at the scheduled time?" prompt | ❌ **Absent** — the bedtime prompt only offers start / not-yet |
| Enter the actual time | ⚠️ **Manual form only** (`TodaySleep.tsx` "Log Sleep" dialog). `SleepLog.actualBedtime/actualWakeTime` exist and `SleepService.logSleep` writes them |
| Support earlier *and* later times, across midnight | ✅ **Already works.** `<input type="time">` accepts any `HH:mm`; `calculateSleepDuration` rolls the wake time forward past midnight. The data model and maths are not the blocker |
| Compute total duration from actual times | ✅ **Exists** — `calculateSleepDuration` → `SleepLog.actualDurationMinutes` |
| Don't force a response at an exact time | ⚠️ Partly — there is no exact-time prompt at all, but the substitute is *assumption*, not *re-asking*. No "you still owe me last night's sleep" flow exists |

### §3 — Routine start and completion tracking

| Need | Status |
| ---- | ------ |
| Notify at the block start | ✅ **Exists** — `ROUTINE_START`, with configurable lead time |
| "Did you start at 09:15?" 10 min later | ❌ **Absent** — no second-prompt producer |
| Enter the actual start time | ⚠️ **Field exists, no UI.** `RoutineLog.actualStartTime` + `logBlockCompletion` + Zod all support it; zero components reference it. `POST /api/routine/today` sends only `{ blockId, date, status, note }` |
| "Haven't started yet" | ❌ **Absent** — `DONE` / `SNOOZE` / `SKIP` are the only actions, and only `DONE`/`SKIP` are produced |
| Completion prompt at the block end | ❌ **Absent** — nothing references `block.endTime` outside duration maths |
| Enter the actual completion time | ⚠️ Same as start — `RoutineLog.actualEndTime` exists, no UI writes it |
| Analytics on delay / consistency | ⚠️ **Data would exist** — `RoutineLog.actualStartTime/actualEndTime/durationMinutes` are all persisted by `logBlockCompletion`; the *population* step is missing |

### §5 — Repetition and reminder intervals

| Need | Status |
| ---- | ------ |
| Fixed repeat interval | ❌ **Absent** — no column, no producer, no setting |
| Configurable interval | ❌ **Absent** — no `UserSettings` column. `SNOOZE_MINUTES = 10` is a module constant declared twice (`scheduler.ts:18`, `action/route.ts:17`) |
| Repeat asking "have you completed it?" | ❌ **Absent** — snooze re-sends the *identical* row; nothing changes the message |
| Stop on completion | ⚠️ **Partly** — `DONE` retires the row, but only via the push button (§10 gap 7: no in-app equivalent), and completing through the UI never retires it |
| Prevent over-notification | ⚠️ Partial — `CATEGORY_GATES` (4 types), master switches, and the dedupe rules; but no repeat cap and no per-entity suppression |

### §6 — This audit

Delivered in §§1-19 above.

### Two cross-cutting prerequisites

Whatever you direct next, these two are load-bearing and currently broken in ways that would mask new work:

1. **Sleep push buttons return 400** (§17 #1) — any sleep-prompt feature built on push would silently fail.
2. **No completion reconciliation** (§17 #2) — any "ask me again until I answer" feature would stack on rows that nothing retires.

---

## 19. File inventory

### Route / cron

- `src/app/api/cron/notification-tick/route.ts` — the consolidated production driver (4 stages)
- `src/app/api/cron/schedule-routine-notifications/route.ts` — producers only; **no configured caller**
- `src/app/api/cron/dispatch-notifications/route.ts` — task reminders + dispatch; **no configured caller**
- `src/app/api/cron/sleep-notifications/route.ts` — sleep prompts; **no configured caller**
- `src/app/api/cron/run-automations/route.ts` — `TIME_REACHED` automations; **no configured caller**
- `src/app/api/cron/compute-daily-scores/route.ts`, `generate-insights/route.ts` — Vercel crons; create **zero** notification rows
- `src/app/api/notifications/route.ts` — history list + markAllRead + `runCatchUp` dispatch
- `src/app/api/notifications/[id]/route.ts` — `PATCH {read|dismiss}`; **zero client callers**; no `DELETE`
- `src/app/api/notifications/action/route.ts` — `DONE | SNOOZE | SKIP`; called only by the SW
- `src/app/api/push-config/route.ts`, `push/test/route.ts`, `push-subscriptions/route.ts`, `push-subscriptions/[id]/route.ts`
- `src/app/api/users/[id]/push-subscriptions/route.ts` — the path the settings page actually uses
- `src/app/(dashboard)/notifications/page.tsx` — the only notification list
- `src/app/(dashboard)/settings/notifications/page.tsx` — all toggles, quiet hours, VAPID, device management

### Producers

- `src/server/notifications/scheduler.ts` (22 KB) — routine blocks + daily check-in
- `src/server/notifications/schedule-all.ts` — the producer orchestrator
- `src/server/notifications/habit-reminder.ts`
- `src/server/notifications/goal-reminder.ts`
- `src/server/notifications/task-reminder.ts`
- `src/server/notifications/weekly-review.ts` — **dead module**
- `src/server/services/sleep-session.service.ts` — sleep prompt / started / ended
- `src/server/services/automation.service.ts` — `SEND_NOTIFICATION`
- `src/server/services/notification.service.ts` — `createNotification`, `dispatchDueNotifications`, `applyAction`, `snooze`, `dismiss`, `notifyAchievement`

### Delivery

- `src/server/services/push.service.ts` — VAPID config, `sendToUser`, subscription pruning
- `src/lib/email/sender.ts` — Resend over raw `fetch`
- `src/lib/email/queue.ts`, `scheduler.ts` — **dead**
- `src/server/services/email.service.ts` — auth mail only; its notification methods are dead

### State

- `src/server/repositories/notification.repository.ts` — the entire row state machine
- `src/server/repositories/push-subscription.repository.ts`
- `src/server/repositories/audit.repository.ts` — used by automations/achievements, not notifications

### Client

- `public/sw.js` — precache, network-first fetch (capped, `/api` excluded), `push`, `notificationclick`, background sync
- `src/components/SWRegistration.tsx`
- `src/components/notifications/NotificationBell.tsx` — mounted in the shared `Header`
- `src/components/notifications/NotificationHistory.tsx` — the only list UI
- `src/components/notifications/{NotificationSettings,QuietHours,ReminderEditor}.tsx` — **orphaned prototypes**
- `src/components/shared/SleepPromptHost.tsx` — `null` on `/today`; renders the prompt elsewhere
- `src/lib/pwa/notifications.ts` — `showNotification`
- `src/lib/pwa/push-client.ts` — **dead**

### Domain

- `src/lib/notifications/categories.ts` — `NotificationType → category`, `CATEGORY_ORDER`, `tagsFor`
- `src/lib/cron-auth.ts` — bearer auth; 500 when `CRON_SECRET` is unset
- `src/hooks/useSettings.ts` / `src/store/settings.store.ts` — settings access
- `src/lib/dates.ts` — `getTodayString`, `DEFAULT_TZ`

### Config

- `vercel.json` — two crons (**no notification cron**), `maxDuration` 60 for `app/api/cron/**`
- `.github/workflows/notification-scheduler.yml` — **the** notification driver, every 5 min
- `src/lib/validation/settings.schema.ts` — all the notification toggles
- `src/schemas/notification.schema.ts` — `notificationPreferencesSchema`, **no callers**
- `prisma/schema.prisma` — `NotificationLog` (2118), `NotificationType` (220), `NotificationStatus` (281), `PushSubscription` (2156), `UserSettings` (570)

### Data model notes

- `NotificationLog.relatedEntityId String?` — **untyped and heterogeneous**: a bare `RoutineBlock`/`Task` id for some types, and prefixed keys (`habit:<id>:<date>`, `goal:<id>:<date>`, `daily:<date>`, `sleep-prompt:<date>`) for others. Nothing parses it, and `applyAction` assumes the bare-block form (`notification.service.ts:412`).
- `NotificationLog` has no unique constraint on `(userId, type, relatedEntityId)`. **All duplicate prevention is application-level `count()` queries**, which are race-prone: two concurrent producer passes can both insert.
- Indexes present: `[userId, status, scheduledFor]`, `[type, status]`, `[userId, createdAt]` — none supports a date-partitioned dedupe.

---

*End of audit. Every claim is anchored to `file:line`. Nothing was modified — this is documentation of the system as it exists. Items that could not be confirmed from source are marked **`Needs verification`**.*