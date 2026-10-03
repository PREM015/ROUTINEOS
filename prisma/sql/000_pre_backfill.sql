-- Pre-`db push` normalisation.
--
-- `Break.breakType` changes from `String?` to the `BreakType` enum. Postgres
-- refuses the ALTER if any existing value is not an enum member, and it refuses
-- with an opaque error naming one arbitrary offending row rather than all of
-- them. This normalises first, so the failure cannot happen and every value that
-- did not map is recorded as CUSTOM rather than silently reinterpreted.
--
-- ⚠ MUST run BEFORE `npm run db:push`. Once the column is enum-typed this script
-- is a no-op at best and an error at worst — `BreakType` is then a type name, so
-- any comparison against a lowercase text literal fails to resolve. That is not
-- hypothetical: it is exactly what happened here, because the schema push landed
-- from another session before this script was first run.
--
-- Idempotent. Safe to re-run before the push.

UPDATE "Break"
   SET "breakType" = 'CUSTOM'
 WHERE "breakType" IS NOT NULL
   AND "breakType" NOT IN ('SHORT', 'LONG', 'MEAL', 'WALK', 'STRETCH', 'REST');
