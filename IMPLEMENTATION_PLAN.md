# Offline-First Smart Notification & Routine Tracking System - Implementation Plan

## Executive Summary

This plan implements a complete, reliable, intelligent notification system for RoutineOS that works offline-first. The system builds upon the existing architecture (which already has strong foundations) and fills critical gaps.

---

## Current State Analysis

### ✅ What Already Works Well
1. **Sleep Tracking**: Auto-start at bedtime, prompts with YES/NOT_YET, manual confirmation of actual sleep/wake times, 16h stale session cleanup
2. **Routine Block Notifications**: Start reminders with DONE/SNOOZE actions, day-type-aware scheduling (8-day horizon), duplicate prevention
3. **Habit & Goal Reminders**: Per-habit reminders at configured times, goal deadline approaching/overdue
4. **Offline Foundation**: Service Worker with IndexedDB (outbox + schedule mirror), `scheduledTime` (desktop) + `periodicsync` (Android), push notifications with action buttons
5. **Settings System**: Per-category notification toggles, single source of truth via Zustand store
6. **DayType System**: User-defined day types, exceptions, bulk resolution, template auto-provisioning
7. **Cron Infrastructure**: Consolidated `notification-tick` (sleep prompts + schedule + dispatch in one call)

### ❌ Critical Gaps to Fill

| Requirement | Current State | Gap |
|-------------|---------------|-----|
| **Sleep pre-warning at 23:00** | Only bedtime prompt at targetBedtime | Missing entirely |
| **Wake-up confirmation at 05:00** | No scheduled wake-up notification | Missing entirely |
| **Routine completion reminders** | Only start reminders exist | No pre-start (15min), completion, end reminders |
| **Advance DayType planning** | No UI for tomorrow's DayType confirmation | Missing entirely |
| **Offline notification delivery** | Partial (scheduledTime + periodicsync) | Needs reliability enhancements, wake confirmations offline |
| **Notification actions → DB updates** | Only routine DONE/SNOOZE | Missing: sleep confirm, wake confirm, block completion, habit completion |
| **Centralized notification management** | Distributed across schedulers | No cancellation, rescheduling, priority system |
| **Notification Settings UI** | Settings exist, no UI page | Missing entirely |
| **50+ notifications/day performance** | Unclear scaling | Needs optimization |

---

## Implementation Phases

### Phase 1: Sleep System Enhancements (Week 1)

#### 1.1 Sleep Pre-Warning at 23:00
- **File**: `src/server/services/sleep-session.service.ts`
- Add `ensurePreSleepPrompt()` creating `SLEEP_PRE_WARNING` notification at 23:00
- Configurable via `sleepPreWarningEnabled` + `sleepPreWarningTime` settings (default 23:00)
- Exclude from generic dispatch (like `SLEEP_PROMPT`)

#### 1.2 Wake-Up Confirmation at 05:00
- **File**: `src/server/services/sleep-session.service.ts`
- Add `ensureWakePrompt()` creating `SLEEP_WAKE_CONFIRMATION` at `targetWakeTime`
- Actions: "I woke up at 05:00", "I woke up later", "Still sleeping"
- On "I woke up later" → open wake time picker (like existing WakeConfirmDialog)
- Auto-stop session if user confirms wake time

#### 1.3 Sleep Settings Extensions
- **File**: `src/lib/validation/settings.schema.ts`
- Add: `sleepPreWarningEnabled`, `sleepPreWarningTime`, `wakeConfirmationEnabled`, `wakeConfirmationTime`
- Update `UserSettings` model if needed (columns likely exist)

#### 1.4 UI Updates
- **File**: `src/components/today/TodaySleep.tsx`
- Show pre-warning banner when active
- Wake confirmation dialog (reuses WakeConfirmDialog pattern)
- Update SleepQualityMeter to show scheduled vs actual

---

### Phase 2: Routine Block Notification Enhancements (Week 1-2)

#### 2.1 Notification Types for Each Phase
Extend `NotificationType` enum (Prisma schema) with:
- `ROUTINE_PRE_START` - 15 min before (configurable)
- `ROUTINE_COMPLETION` - At scheduled end time
- `ROUTINE_END_REMINDER` - "Your session ended, did you complete?"

#### 2.2 Enhanced Scheduler
- **File**: `src/server/notifications/scheduler.ts`
- For each routine block, schedule 3 notifications:
  1. **Pre-start**: `block.startTime - advanceMinutes` (default 15)
  2. **Start**: At `block.startTime` (existing `ROUTINE_START`)
  3. **Completion**: At `block.endTime` (new `ROUTINE_COMPLETION`)
- Each with appropriate actions:
  - Pre-start: "Get Ready", "Snooze 10m"
  - Start: "Started", "Not Yet", "Skip"
  - Completion: "Completed", "Partially Done", "Not Done", "Extend"

#### 2.3 Action Handlers
- **File**: `src/server/services/notification.service.ts` → `applyAction()`
- Add handlers for new action types:
  - `STARTED` → Update `RoutineLog` with `actualStartTime`, status `IN_PROGRESS`
  - `NOT_YET` → No DB change, maybe snooze
  - `SKIP` → Update `RoutineLog` with status `MISSED`
  - `COMPLETED` → Update `RoutineLog` with `actualEndTime`, status `COMPLETED`
  - `PARTIAL` → Update `RoutineLog` with status `PARTIAL`
  - `EXTEND` → Snooze completion reminder, keep session open

#### 2.4 Cancel Outdated Notifications
- When block completed early → cancel pending completion/end reminders
- When block skipped → cancel all future reminders for that block today
- When schedule changes → reschedule all affected notifications

---

### Phase 3: Advance DayType Planning (Week 2)

#### 3.1 Data Model
Add `TomorrowDayTypePlan` table (or extend `RoutineException` with status fields):
```prisma
model TomorrowDayTypePlan {
  id            String   @id @default(cuid())
  userId        String
  date          DateTime @db.Date          // Target date (tomorrow)
  dayTypeId     String?                    // Selected DayTypeDefinition
  dayType       DayType                    // Enum fallback
  status        PlanStatus                 // PENDING | SELECTED | CONFIRMED | SYNCED
  isManual      Boolean   @default(true)
  selectedAt    DateTime?
  confirmedAt   DateTime?
  changedAt     DateTime?
  previousDayTypeId String?
  routineVersion   Int      @default(0)
  notificationsScheduled Boolean @default(false)
  localSynced   Boolean   @default(false)
  serverSynced  Boolean   @default(false)
  createdAt     DateTime  @default(now())
  updatedAt     DateTime  @updatedAt

  @@unique([userId, date])
  @@index([userId])
}
```

#### 3.2 Planning Service
- **File**: `src/server/services/day-type-planning.service.ts` (new)
- `getTomorrowPlan(userId)` - Returns current plan or null
- `selectTomorrowDayType(userId, dayTypeId)` - User selects, status = SELECTED
- `confirmTomorrowDayType(userId)` - Generate routine, schedule notifications, status = CONFIRMED
- `changeTomorrowDayType(userId, newDayTypeId)` - Recalculate everything
- `applyFallbackIfNeeded(userId)` - If no selection by midnight, apply fallback, log reason

#### 3.3 API Routes
- `GET /api/today/tomorrow-plan` - Get tomorrow's plan
- `POST /api/today/tomorrow-plan/select` - Select DayType
- `POST /api/today/tomorrow-plan/confirm` - Confirm selection
- `POST /api/today/tomorrow-plan/change` - Change selection

#### 3.4 UI Component
- **File**: `src/components/today/TomorrowPlanner.tsx` (new)
- Show on /today page: "Plan Tomorrow" section
- Date, DayType selector (all user's DayTypeDefinitions), Confirm button
- Status badges: Pending → Selected → Confirmed → Synced
- Show generated routine preview after confirmation

#### 3.5 Integration with Scheduler
- When confirmed, call `scheduleRoutineBlockNotifications` for tomorrow's blocks
- Schedule sleep/wake notifications based on confirmed DayType's sleep schedule
- Schedule habit/goal reminders for tomorrow

---

### Phase 4: Offline-First Architecture Enhancements (Week 2-3)

#### 4.1 Service Worker Improvements
- **File**: `public/sw.js`
- **Wake confirmation offline**: Add `sleep-wake-confirm` action handler
- **Routine completion offline**: Add `ROUTINE_COMPLETED`/`ROUTINE_MISSED` handlers
- **Habit completion offline**: Add `HABIT_DONE` handler
- **Better deduplication**: Use `firedAt` + `notificationId` + `action` triple
- **Background fetch API** (where supported) for more reliable wake-ups

#### 4.2 IndexedDB Schema Enhancements
- **File**: `public/sw.js` (DB_VERSION = 2)
- Add `sleepSessions` store for pending sleep confirmations
- Add `routineActions` store for pending routine block actions
- Add `habitActions` store for pending habit completions
- Each with: `id`, `type`, `payload`, `idempotencyKey`, `createdAt`, `retryCount`

#### 4.3 Offline Notification Scheduling (Client-Side)
- **File**: `src/lib/pwa/offline-scheduler.ts` (new)
- When online: fetch server schedule, mirror to SW
- When offline: use locally cached DayType + routine blocks to compute notifications
- Generate notifications for next 48h using pure JS (no server needed)
- Store in `schedule` store, register `periodicsync`

#### 4.4 Sync Engine
- **File**: `src/lib/pwa/sync-engine.ts` (new)
- On reconnect: flush outbox → apply server updates → refresh schedule mirror
- Conflict resolution: server wins for timestamps, client wins for user confirmations
- Exponential backoff: 1s, 2s, 4s, 8s, 16s, 30s, 60s (max)
- Dead letter queue for permanently failed items

---

### Phase 5: Notification Actions → Database Updates (Week 3)

#### 5.1 Extended Action Endpoint
- **File**: `src/app/api/notifications/action/route.ts`
- Handle new action types:
  - `SLEEP_START` → `sleepSessionService.startSleep()`
  - `SLEEP_DISMISS` → `sleepSessionService.respondToPrompt(NOT_YET)`
  - `SLEEP_WAKE_CONFIRM` → `sleepSessionService.stopSleep(actualTimes)`
  - `ROUTINE_STARTED` → `routineService.logBlockStatus(status: IN_PROGRESS, actualStartTime)`
  - `ROUTINE_COMPLETED` → `routineService.logBlockStatus(status: COMPLETED, actualEndTime)`
  - `ROUTINE_PARTIAL` → `routineService.logBlockStatus(status: PARTIAL)`
  - `ROUTINE_SKIP` → `routineService.logBlockStatus(status: MISSED)`
  - `HABIT_DONE` → `habitService.logHabit()`
  - `GOAL_PROGRESS` → `goalService.updateProgress()`

#### 5.2 Service Worker Action Handlers
- **File**: `public/sw.js` → `notificationclick`
- For each action, POST to appropriate endpoint with idempotency key
- Queue to outbox if offline
- Update local UI via `postMessage` to client

#### 5.3 Idempotency Keys
- Format: `${action}:${entityId}:${date}:${timestamp}`
- Server validates and deduplicates

---

### Phase 6: Centralized Notification Management (Week 3-4)

#### 6.1 Notification Manager Service
- **File**: `src/server/services/notification-manager.service.ts` (new)
- `scheduleNotificationsForDate(userId, date, dayType)` - Single entry point
- `cancelNotificationsForBlock(userId, blockId)` - Cancel all for a block
- `rescheduleNotificationsForDate(userId, date)` - Full reschedule
- `getPendingNotifications(userId, dateRange)` - Query pending
- Priority levels: CRITICAL (sleep), HIGH (routine start), NORMAL (habit), LOW (goal)

#### 6.2 Deduplication Service
- **File**: `src/server/services/notification-dedup.service.ts` (new)
- Key: `(userId, type, relatedEntityId, scheduledDate)`
- Prevent duplicate across all producers
- Cleanup stale PENDING notifications (>48h old)

#### 6.3 Notification Grouping
- Group by time window (15min buckets)
- Collapse same-type notifications
- Summary notifications for multiple due items

---

### Phase 7: Notification Settings UI (Week 4)

#### 7.1 Settings Page
- **File**: `src/app/(dashboard)/settings/notifications/page.tsx` (new)
- Sections:
  - Master toggle (notificationsEnabled)
  - Per-category toggles (routine, habits, goals, sleep, tasks, streaks, achievements)
  - Timing preferences (advance minutes, quiet hours)
  - Sleep-specific (pre-warning, wake confirmation, auto-start)
  - Routine-specific (pre-start, start, completion, end)
  - Offline status indicator
  - Pending sync count
  - Test notification buttons

#### 7.2 Integration with Settings Store
- All toggles flow through `useSettingsStore.save()`
- Immediate local feedback, background sync

---

### Phase 8: Performance & Scaling (Week 4)

#### 8.1 Batch Operations
- Bulk create notifications (already done in scheduler)
- Bulk cancel via `notificationRepository.deleteMany()`
- Single query for day-type resolution (already bulk-loaded)

#### 8.2 Caching
- Cache resolved DayType for 24h
- Cache user notification preferences
- Memoize `getNextOccurrence` per block per day

#### 8.3 Monitoring
- Add metrics: notifications scheduled/sent/failed per user per day
- Alert if >50 notifications/day/user not handled

---

### Phase 9: Testing & Acceptance (Week 4-5)

#### 9.1 Unit Tests (Vitest)
- Sleep pre-warning timing
- Wake confirmation flow
- Routine block 3-phase notifications
- DayType planning state machine
- Offline action queue
- Sync conflict resolution

#### 9.2 Integration Tests
- Full sleep cycle: pre-warning → prompt → auto-start → wake confirm → log
- Routine block: pre-start → start → completion
- DayType change → reschedule
- Offline → online sync

#### 9.3 E2E Scenarios (Manual)
1. Sleep Tests: Auto-start at 00:00, 23:00 pre-warning, 05:00 wake confirm
2. Routine Tests: 3-phase notifications, actual times recorded, early completion cancels
3. Offline Tests: Notifications fire offline, interactions queued, sync on reconnect
4. Performance: 50+ notifications/day, no duplicates, no polling

---

## Database Changes Required

### Minimal Schema Additions
```prisma
// 1. Tomorrow DayType Plan
model TomorrowDayTypePlan {
  id              String   @id @default(cuid())
  userId          String
  date            DateTime @db.Date
  dayTypeId       String?
  dayType         DayType
  status          PlanStatus @default(PENDING)
  isManual        Boolean  @default(true)
  selectedAt      DateTime?
  confirmedAt     DateTime?
  changedAt       DateTime?
  previousDayTypeId String?
  routineVersion  Int      @default(0)
  notificationsScheduled Boolean @default(false)
  localSynced     Boolean  @default(false)
  serverSynced    Boolean  @default(false)
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt

  @@unique([userId, date])
  @@index([userId])
}

enum PlanStatus {
  PENDING
  SELECTED
  CONFIRMED
  SYNCED
  FALLBACK_APPLIED
}

// 2. Add to NotificationType enum (already has 40+, add):
// ROUTINE_PRE_START, ROUTINE_COMPLETION, ROUTINE_END_REMINDER
// SLEEP_PRE_WARNING, SLEEP_WAKE_CONFIRMATION

// 3. Add to UserSettings (columns likely exist, just need schema validation):
// sleepPreWarningEnabled, sleepPreWarningTime, wakeConfirmationEnabled, wakeConfirmationTime
```

---

## Files to Create/Modify

### New Files
1. `src/server/services/day-type-planning.service.ts`
2. `src/server/services/notification-manager.service.ts`
3. `src/server/services/notification-dedup.service.ts`
3. `src/lib/pwa/offline-scheduler.ts`
4. `src/lib/pwa/sync-engine.ts`
5. `src/components/today/TomorrowPlanner.tsx`
6. `src/app/(dashboard)/settings/notifications/page.tsx`
7. `src/app/api/today/tomorrow-plan/route.ts`
8. `src/app/api/notifications/action/route.ts` (extend)

### Modified Files
1. `prisma/schema.prisma` - Add `TomorrowDayTypePlan`, extend `NotificationType`
2. `src/server/services/sleep-session.service.ts` - Pre-warning, wake confirm
3. `src/server/notifications/scheduler.ts` - 3-phase routine notifications
4. `src/server/services/notification.service.ts` - New action handlers
5. `public/sw.js` - Enhanced offline handlers, DB v2
6. `src/lib/validation/settings.schema.ts` - New sleep settings
7. `src/components/today/TodaySleep.tsx` - UI for pre-warning, wake confirm
8. `src/lib/pwa/offline-schedule.ts` - Enhanced sync
9. `src/app/api/cron/notification-tick/route.ts` - Add tomorrow planning

---

## Risk Mitigation

| Risk | Mitigation |
|------|------------|
| Browser notification limits | Respect `requireInteraction`, group notifications, use `tag` for deduplication |
| Service Worker killed by OS | Accept: document limitation, push as primary, local as fallback |
| Duplicate notifications | Triple-key dedup (userId, type, relatedEntityId, date), `firedAt` in SW |
| Clock drift across timezones | Always use `fromZonedTime`/`toZonedTime`, store user timezone in settings |
| Sync conflicts | Server-wins for timestamps, client-wins for user confirmations, idempotency keys |
| Migration complexity | Additive schema only, no breaking changes, feature flags for new behavior |

---

## Success Criteria

1. **Sleep**: Pre-warning at 23:00 ✓, prompt at 00:00 ✓, auto-start ✓, wake confirm at 05:00 ✓, actual times stored ✓
2. **Routine**: 3-phase notifications per block ✓, actual start/end times ✓, early completion cancels future ✓
3. **DayType**: Tomorrow planned today ✓, user confirms ✓, routine generated in advance ✓
4. **Offline**: Notifications fire without internet ✓, interactions queued ✓, sync on reconnect ✓
5. **DB Updates**: Every notification action updates existing records ✓
6. **Performance**: 50+ notifications/day handled ✓, no duplicates ✓, no polling ✓
7. **Settings**: Full UI control ✓, per-category toggles work ✓

---

## Dependencies

- No new external dependencies
- Uses existing: `date-fns-tz`, `zod`, `zustand`, `next-auth`, `prisma`
- Browser APIs: Service Worker, Push API, IndexedDB, Background Sync, Periodic Sync

---

## Timeline Estimate

| Phase | Duration | Dependencies |
|-------|----------|--------------|
| 1: Sleep Enhancements | 3 days | None |
| 2: Routine Notifications | 4 days | Phase 1 |
| 3: DayType Planning | 4 days | Phase 1, 2 |
| 4: Offline Architecture | 5 days | Phase 1, 2 |
| 5: Action → DB Updates | 3 days | Phase 2, 4 |
| 6: Notification Manager | 3 days | Phase 2, 5 |
| 7: Settings UI | 2 days | Phase 1, 2, 3 |
| 8: Performance | 2 days | Phase 6 |
| 9: Testing | 3 days | All |
| **Total** | **~29 days** | |

---

## Next Steps

1. Review and approve this plan
2. Start Phase 1 implementation (Sleep Enhancements)
3. Run `npm run db:generate` after schema changes
4. Run `npm test` after each phase
5. Run `npm run type-check` and `npm run lint` before committing