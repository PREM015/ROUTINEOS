-- Post-`db push` backfill and constraint.
--
-- Run AFTER `npm run db:push` succeeds. Everything here is idempotent.
--
-- On an empty database every UPDATE is a no-op and only the partial index does
-- real work — which is the point of running `focus-backfill-dry-run.sql` first.

-- =============================================================================
-- 1. `pausedTotalSeconds`: NULL -> 0
--
-- The column is `Int @default(0)`, so new rows are fine, but every row written
-- before the migration has NULL. `settleSession` derives whether a countdown has
-- expired from this number; reading NULL there as "no pause" would expire a
-- genuinely paused session early and truncate its credit.
-- =============================================================================
UPDATE "FocusSession"
   SET "pausedTotalSeconds" = 0
 WHERE "pausedTotalSeconds" IS NULL;

-- =============================================================================
-- 2. `type`: infer from the historical title
--
-- A pure widening: anything unrecognised becomes FOCUS, which is exactly what the
-- old title-blind aggregations counted. Nothing is lost.
--
-- The `::"FocusSessionType"` cast is required, not cosmetic. A bare `CASE` over
-- text literals has type `text`, and Postgres will not implicitly coerce `text`
-- to an enum — it errors with "column type is of type FocusSessionType but
-- expression is of type text". Since the column is only enum after `db push`,
-- this statement cannot be written any other way.
-- =============================================================================
UPDATE "FocusSession"
   SET "type" = (CASE "title"
     WHEN 'Short break'       THEN 'SHORT_BREAK'
     WHEN 'Long break'        THEN 'LONG_BREAK'
     WHEN 'Stopwatch session' THEN 'STOPWATCH'
     ELSE 'FOCUS'
   END)::"FocusSessionType";

-- =============================================================================
-- 3. `abortedAt`: recover the writes that were silently dropped
--
-- `FocusService.createSession` has always built `abortedAt` for a stopped
-- session, but `FocusRepository.createSession` never wrote it — the field was not
-- on the repository's input interface, so TypeScript accepted the object and
-- Prisma discarded the value.
--
-- So every stopped/skipped/mode-switched session has `completedAt: NULL,
-- abortedAt: NULL`, which is byte-identical to a *running* session, and
-- `findActiveByUserId` reads exactly that shape as "currently running". Those rows
-- are why the app reported abandoned timers as live forever.
--
-- `createdAt` stands in for the end time: it is the only timestamp the old code
-- wrote for an aborted row, and it is within a second of the real one.
--
-- The `actualDuration IS NOT NULL` guard is what makes this precise. The old
-- `postSession` only wrote a row once the run had elapsed at least a second, so a
-- row with no duration is not an ended session — it is a half-constructed row, and
-- it is left alone for manual review rather than guessed at.
-- =============================================================================
UPDATE "FocusSession"
   SET "abortedAt" = "createdAt"
 WHERE "completedAt" IS NULL
   AND "abortedAt"  IS NULL
   AND "actualDuration" IS NOT NULL;

-- =============================================================================
-- 4. `endReason`: derive from the terminal timestamps
--
--   completedAt set            -> COMPLETED. Unambiguous: only one code path ever
--                                 set it, and only on a successful completion.
--   abortedAt set              -> STOPPED. Skip and mode-switch are
--                                 indistinguishable in the data, so STOPPED is
--                                 the honest label rather than a fabricated one.
--   neither, has a duration    -> STOPPED.
--   neither, no duration       -> LEFT NULL. This is the genuinely ambiguous row,
--                                 and `endReason = NULL` is what marks it: the
--                                 statistics module reads a null end reason as
--                                 "unknown", never as completed.
-- =============================================================================
UPDATE "FocusSession"
   SET "endReason" = 'COMPLETED'
 WHERE "completedAt" IS NOT NULL
   AND "endReason" IS NULL;

UPDATE "FocusSession"
   SET "endReason" = 'STOPPED'
 WHERE "completedAt" IS NULL
   AND "abortedAt"  IS NOT NULL
   AND "endReason" IS NULL;

UPDATE "FocusSession"
   SET "endReason" = 'STOPPED'
 WHERE "completedAt" IS NULL
   AND "abortedAt"  IS NULL
   AND "actualDuration" IS NOT NULL
   AND "endReason" IS NULL;

-- =============================================================================
-- 5. `source`: all existing history came from the timer
-- =============================================================================
UPDATE "FocusSession"
   SET "source" = 'TIMER'
 WHERE "source" IS NULL;

-- =============================================================================
-- 6. `timezone` + `localDate`: snapshot the user's current zone
--
-- APPROXIMATE, and deliberately so: the true zone at the time of each session is
-- not recoverable, because nothing stored it. Today's setting is the best
-- available approximation, and the dry-run report says so.
-- =============================================================================
UPDATE "FocusSession" fs
   SET "timezone" = coalesce(us."timezone", 'UTC')
  FROM "UserSettings" us
 WHERE us."userId" = fs."userId"
   AND fs."timezone" IS NULL;

-- Computed in that zone rather than in UTC, so it is a genuine calendar date and
-- not a shifted one — which is the whole reason the column exists.
UPDATE "FocusSession" fs
   SET "localDate" = (fs."startedAt" AT TIME ZONE coalesce(fs."timezone", 'UTC'))::date
 WHERE fs."localDate" IS NULL;

-- =============================================================================
-- 7. `focusSettings`: one row per user who already has focus history
--
-- Seeded lazily rather than for every account: a user who has never run a session
-- does not need a settings row, and `getOrCreate` on read creates it on first use
-- anyway. This only avoids a surprise for users who have data and would otherwise
-- be served hardcoded defaults that disagree with their browser-local values.
--
-- `soundEnabled` is gated by the user's *master* switch rather than this model's
-- own default of `false`, so migrating someone who already has sound on does not
-- silently turn it off for them.
-- =============================================================================
INSERT INTO "FocusSettings" (
  "id", "userId", "focusMinutes", "shortBreakMinutes", "longBreakMinutes",
  "cyclesBeforeLongBreak", "autoStartBreak", "autoStartFocus", "keepScreenAwake",
  "reflectionMode", "reflectionMinimumMinutes", "dailyTargetMinutes",
  "streakDayMinutes", "weeklyTargetMinutes", "soundEnabled", "soundVolume",
  "ambientSound", "showWallClock", "breakSuggestions", "adaptiveSuggestions",
  "createdAt", "updatedAt"
)
SELECT
  gen_random_uuid()::text,
  u."id",
  25, 5, 15, 4,
  true, false, false,
  'MIN_LENGTH', 10,
  120, 25, NULL,
  coalesce(us."soundEnabled", false),
  50, NULL,
  true, true, false,
  now(), now()
FROM "User" u
LEFT JOIN "UserSettings" us ON us."userId" = u."id"
WHERE EXISTS (SELECT 1 FROM "FocusSession" fs WHERE fs."userId" = u."id")
ON CONFLICT ("userId") DO NOTHING;

-- =============================================================================
-- 8. One active session per user — the partial unique index.
--
-- The hard guarantee behind "starting a second session aborts the first". The
-- service also checks, so the user gets a readable message instead of a constraint
-- violation, but only this index makes the invariant true under concurrency: two
-- devices racing to start would both pass a service-level check and both insert.
--
-- Raw SQL because Prisma has no syntax for a partial index. Asserted by
-- `tests/lib/focus-active-index.test.ts`, which fails if this is missing — the one
-- way a hand-maintained raw-SQL index can silently disappear.
--
-- "Active" is `completedAt IS NULL AND abortedAt IS NULL`, the same predicate
-- `findActiveByUserId` has always used. Keeping the two in agreement is the point:
-- the index constrains exactly the state the application calls "running".
-- =============================================================================
CREATE UNIQUE INDEX IF NOT EXISTS "one_active_session_per_user"
    ON "FocusSession" ("userId")
 WHERE "completedAt" IS NULL
   AND "abortedAt" IS NULL;
