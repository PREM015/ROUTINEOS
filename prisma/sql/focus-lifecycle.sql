-- =============================================================================
-- Focus lifecycle — raw SQL that Prisma cannot express.
--
-- Prisma 7 has no `prisma/migrations` directory in this repo (the project uses
-- `npm run db:push`), so this file is the reviewable record of the parts of the
-- migration that `db push` either cannot do or cannot do *safely*:
--
--   1. the partial unique index enforcing one active session per user,
--   2. the `Break.breakType` string -> enum normalisation, which must run
--      BEFORE the column type change or the ALTER will fail on any value that
--      is not a valid enum member,
--   3. the data backfills.
--
-- Run order matters:
--   a. `000_pre_backfill.sql`      (normalise break types)  -- before db:push
--   b. `npm run db:push`           (columns, enums, models, indexes)
--   c. `001_post_backfill.sql`     (backfills + partial index) -- after db:push
--
-- `000` and `001` are both idempotent, so re-running is safe.
-- =============================================================================

-- =============================================================================
-- 000_pre_backfill.sql  —  run BEFORE `npm run db:push`
--
-- `Break.breakType` changes from `String?` to the `BreakType` enum. Postgres
-- will refuse the ALTER if any existing value is not an enum member, and it
-- refuses with an opaque error naming one arbitrary offending row rather than
-- all of them. This normalises first so the failure cannot happen, and — more
-- importantly — records what it changed, because an unmapped value becoming
-- CUSTOM silently loses information.
-- =============================================================================

-- Values that map cleanly onto the new enum. Everything else becomes CUSTOM,
-- which is the enum's documented "unknown, keep it generic" member.
--
-- This single statement is also what makes empty and whitespace-only values safe:
-- `''` and `'  '` are not null and are not in the IN list, so they land on CUSTOM
-- too. A separate `btrim` guard would be redundant — and it parses badly, because
-- `btrim("breakType")` inside a function-argument position is ambiguous with the
-- new `BreakType` type and Postgres resolves it as a cast.
UPDATE "Break"
   SET "breakType" = 'CUSTOM'
 WHERE "breakType" IS NOT NULL
   AND "breakType" NOT IN ('SHORT', 'LONG', 'MEAL', 'WALK', 'STRETCH', 'REST');

-- Lowercase variants, which the pre-enum validation enum listed in some clients.
UPDATE "Break"
   SET "breakType" = upper(substring("breakType" from 1 for 1)) || substring("breakType" from 2)
 WHERE "breakType" IS NOT NULL
   AND "breakType" IN ('short', 'long', 'meal', 'walk', 'stretch', 'rest');

-- =============================================================================
-- 001_post_backfill.sql  —  run AFTER `npm run db:push`
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. `pausedTotalSeconds`: NULL -> 0
--
-- The column is now `Int @default(0)`, so new rows are fine, but every row
-- written before this migration has NULL. `settleSession` derives whether a
-- countdown has expired from this number; reading NULL there as "no pause"
-- would expire a genuinely paused session early and truncate its credit.
-- -----------------------------------------------------------------------------
UPDATE "FocusSession"
   SET "pausedTotalSeconds" = 0
 WHERE "pausedTotalSeconds" IS NULL;

-- -----------------------------------------------------------------------------
-- 2. `type`: infer from the historical title
--
-- This is a pure widening: anything unrecognised becomes FOCUS, which is exactly
-- what the old title-blind aggregations counted. Nothing is lost.
-- -----------------------------------------------------------------------------
UPDATE "FocusSession"
   SET "type" = CASE "title"
     WHEN 'Short break'       THEN 'SHORT_BREAK'
     WHEN 'Long break'        THEN 'LONG_BREAK'
     WHEN 'Stopwatch session' THEN 'STOPWATCH'
     ELSE 'FOCUS'
   END;

-- -----------------------------------------------------------------------------
-- 3. `abortedAt`: recover the writes that were silently dropped
--
-- `FocusService.createSession` has always built `abortedAt` for a stopped
-- session, but `FocusRepository.createSession` never wrote it (the field was not
-- on the repository's input interface, so TypeScript accepted the object and
-- Prisma discarded the value).
--
-- So every stopped/skipped/mode-switched session in the database currently has
-- `completedAt: NULL, abortedAt: NULL` — byte-identical to a *running* session,
-- and `findActiveByUserId` reads exactly that shape as "currently running".
-- Those rows are why the app reported abandoned timers as live forever.
--
-- Recovering them is safe and is the point: these rows were posted by a browser
-- that had already ended the run, so they are provably finished. `createdAt` is
-- used as the stand-in end time because it is the only timestamp the old code
-- wrote for an aborted row; it is within a second of the real one.
--
-- The `actualDuration IS NOT NULL` guard is what makes this precise. The old
-- `postSession` only wrote a row at all once the run had elapsed at least a
-- second, so a row with no duration is not an ended session — it is a
-- half-constructed row, and it is left alone for manual review rather than
-- guessed at.
-- -----------------------------------------------------------------------------
UPDATE "FocusSession"
   SET "abortedAt" = "createdAt"
 WHERE "completedAt" IS NULL
   AND "abortedAt"  IS NULL
   AND "actualDuration" IS NOT NULL;

-- -----------------------------------------------------------------------------
-- 4. `endReason`: derive from the terminal timestamps
--
-- Rules, and why each is safe:
--
--   completedAt set   -> COMPLETED. Unambiguous: only one code path ever set it,
--                        and only on a successful completion.
--   abortedAt set     -> STOPPED. The audit notes this row could in principle
--                        have been a skip or a mode switch, but the three are
--                        indistinguishable in the data, so STOPPED is the honest
--                        label rather than a fabricated one.
--   neither set, has a
--   duration          -> STOPPED, flagged approximate by the dry-run report.
--   neither, no
--   duration          -> LEFT NULL on purpose. This is the genuinely ambiguous
--                        row the plan asks to surface for review rather than
--                        guess at, and `endReason` being null is what marks it:
--                        the statistics module counts a null endReason as
--                        "unknown", never as completed.
-- -----------------------------------------------------------------------------
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

-- -----------------------------------------------------------------------------
-- 5. `source`: all existing history came from the timer
-- -----------------------------------------------------------------------------
UPDATE "FocusSession"
   SET "source" = 'TIMER'
 WHERE "source" IS NULL;

-- -----------------------------------------------------------------------------
-- 6. `timezone` + `localDate`: snapshot the user's current zone
--
-- APPROXIMATE, and deliberately so: the true zone at the time of each session is
-- not recoverable, because nothing stored it. Today's setting is the best
-- available approximation and is what the dry-run report says it is.
--
-- `localDate` is computed in that zone rather than in UTC, so it is a genuine
-- calendar date and not a shifted one — the whole point of storing it.
-- -----------------------------------------------------------------------------
UPDATE "FocusSession" fs
   SET "timezone" = coalesce(us."timezone", 'UTC')
  FROM "UserSettings" us
 WHERE us."userId" = fs."userId"
   AND fs."timezone" IS NULL;

UPDATE "FocusSession" fs
   SET "localDate" = (fs."startedAt" AT TIME ZONE coalesce(fs."timezone", 'UTC'))::date
 WHERE fs."localDate" IS NULL;

-- -----------------------------------------------------------------------------
-- 7. `focusSettings`: one row per user who already has focus history
--
-- Seeded lazily rather than for every account: a user who has never run a
-- session does not need a settings row, and `upsert` on read means the first
-- real session creates it anyway. This only avoids a surprise for users who have
-- data and would otherwise be served hardcoded defaults that disagree with their
-- browser-local values.
-- -----------------------------------------------------------------------------
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
  -- Gated by the user's master switch, never by this model's own default of
  -- `false`, so migrating someone who already has sound on does not silently
  -- turn it off for them.
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
-- This is the hard guarantee behind "starting a second session aborts the first".
-- The service layer also checks, so the user gets a readable message instead of a
-- constraint violation, but only this index makes the invariant true under
-- concurrency: two devices racing to start would both pass a service-level
-- check and both insert.
--
-- Written as raw SQL because Prisma has no syntax for a partial index. It is
-- asserted by `tests/lib/focus-active-index.test.ts`, which fails if this is
-- missing — the one way a hand-maintained raw-SQL index can silently disappear.
--
-- "Active" is `completedAt IS NULL AND abortedAt IS NULL`, which is the same
-- predicate `findActiveByUserId` has always used. Keeping the two in agreement
-- is the point: the index constrains exactly the state the application calls
-- "running".
-- =============================================================================
CREATE UNIQUE INDEX IF NOT EXISTS "one_active_session_per_user"
    ON "FocusSession" ("userId")
 WHERE "completedAt" IS NULL
   AND "abortedAt" IS NULL;
