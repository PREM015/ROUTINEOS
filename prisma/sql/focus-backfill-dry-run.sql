-- =============================================================================
-- Focus lifecycle backfill — DRY RUN.
--
-- Read-only. Every statement is a SELECT that reports what the corresponding
-- UPDATE in `focus-lifecycle.sql` *would* change, before anything is changed.
--
-- Run this against the target database, read the output, and only then run the
-- real thing. The point is specifically the row counts: a backfill that is about
-- to rewrite 400,000 rows deserves to be a surprise nobody got.
--
-- The two rows to actually look at are the ones at the bottom — the ambiguous
-- rows that the backfill deliberately refuses to guess at.
-- =============================================================================

\echo '--- 1. FocusSession total, and how the type backfill will split it ---'
SELECT
  count(*)                                                  AS total_rows,
  count(*) FILTER (WHERE "completedAt" IS NOT NULL)        AS completed,
  count(*) FILTER (WHERE "abortedAt"  IS NOT NULL)         AS already_aborted,
  count(*) FILTER (WHERE "completedAt" IS NULL
                     AND "abortedAt"  IS NULL)            AS currently_looks_running,
  count(*) FILTER (WHERE title = 'Short break')            AS title_short_break,
  count(*) FILTER (WHERE title = 'Long break')             AS title_long_break,
  count(*) FILTER (WHERE title = 'Stopwatch session')      AS title_stopwatch,
  count(*) FILTER (WHERE title = 'Focus session')          AS title_focus
FROM "FocusSession";

\echo ''
\echo '--- 2. Focus minutes that will be REMOVED from totals by the type backfill ---'
\echo '    (rows currently counted as focus work that are actually breaks)'
SELECT
  coalesce(us."timezone", 'UTC') AS timezone,
  CASE fs."title"
    WHEN 'Short break'       THEN 'SHORT_BREAK'
    WHEN 'Long break'        THEN 'LONG_BREAK'
    WHEN 'Stopwatch session' THEN 'STOPWATCH'
    ELSE 'FOCUS'
  END                        AS resolved_type,
  count(*)                   AS rows,
  sum(fs."actualDuration")    AS minutes_removed_from_totals
FROM "FocusSession" fs
LEFT JOIN "UserSettings" us ON us."userId" = fs."userId"
WHERE fs."completedAt" IS NOT NULL
  AND fs."actualDuration" IS NOT NULL
  AND fs."title" IN ('Short break', 'Long break')
GROUP BY 1, 2
ORDER BY minutes_removed_from_totals DESC NULLS LAST;

\echo ''
\echo '--- 3. abortedAt recovery: rows that look RUNNING but are provably ended ---'
\echo '    These are the frozen-timer rows. Each one is currently reported by'
\echo '    GET /api/focus/active as a live session.'
SELECT
  count(*)                       AS rows_to_recover,
  min("createdAt")               AS oldest,
  max("createdAt")               AS newest,
  sum("actualDuration")          AS minutes_they_were_credited_for,
  count(DISTINCT "userId")       AS affected_users
FROM "FocusSession"
WHERE "completedAt" IS NULL
  AND "abortedAt"  IS NULL
  AND "actualDuration" IS NOT NULL;

\echo ''
\echo '--- 4. Rows the backfill will NOT touch, because it refuses to guess ---'
\echo '    No terminal timestamp AND no actualDuration. The plan calls these'
\echo '    genuinely ambiguous; they keep endReason = NULL, which the statistics'
\echo '    module reads as "unknown", never as completed.'
SELECT
  count(*)                 AS ambiguous_rows,
  count(DISTINCT "userId") AS affected_users,
  min("startedAt")         AS oldest,
  max("startedAt")         AS newest
FROM "FocusSession"
WHERE "completedAt"  IS NULL
  AND "abortedAt"   IS NULL
  AND "actualDuration" IS NULL;

\echo ''
\echo '--- 5. Partial unique index target: users who would VIOLATE one-active-per-user ---'
\echo '    Must be zero, or the index creation in step 8 will fail and abort the'
\echo '    migration. Anything non-zero means two of a user''s rows are both'
\echo '    "not completed and not aborted" — i.e. either a genuine double-start,'
\echo '    or rows the abandoned-at backfill has not run yet.'
WITH active AS (
  SELECT "userId", count(*) AS open_rows
  FROM "FocusSession"
  WHERE "completedAt" IS NULL AND "abortedAt" IS NULL
  GROUP BY "userId"
)
SELECT "userId", open_rows
FROM active
WHERE open_rows > 1
ORDER BY open_rows DESC
LIMIT 50;

\echo ''
\echo '--- 6. Break.breakType values that will NOT map onto the new enum ---'
\echo '    Should be empty after 000_pre_backfill.sql; anything here means run'
\echo '    that file first, because the ALTER will fail on these.'
SELECT "breakType", count(*)
FROM "Break"
WHERE "breakType" IS NOT NULL
  AND "breakType" NOT IN ('SHORT', 'LONG', 'MEAL', 'WALK', 'STRETCH', 'REST')
GROUP BY 1
ORDER BY 2 DESC;

\echo ''
\echo '--- 7. Accounts that will get a FocusSettings row ---'
SELECT
  count(DISTINCT fs."userId") AS users_with_history_but_no_settings_row
FROM "FocusSession" fs
LEFT JOIN "FocusSettings" f ON f."userId" = fs."userId"
WHERE f."id" IS NULL;

\echo ''
\echo '--- 8. Break volume, for context on the Break repositioning ---'
\echo '    If this is zero the Break table is genuinely unused, which means the'
\echo '    break-annotation feature has no historical data to preserve.'
SELECT
  count(*)                    AS break_rows,
  count(*) FILTER (WHERE "focusSessionId" IS NOT NULL) AS linked_to_a_session
FROM "Break";
