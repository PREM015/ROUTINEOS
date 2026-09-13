-- This migration deliberately performs each data move before making the
-- corresponding constraint stricter. Do not replace it with a raw schema push:
-- existing routine, reflection, category, and minimum-day data would be lost.

-- Auth/onboarding and account-security state.
ALTER TABLE "User"
  ADD COLUMN IF NOT EXISTS "emailVerified" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "sessionVersion" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "failedLoginAttempts" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "lockedUntil" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "onboardingCompletedAt" TIMESTAMP(3);

ALTER TABLE "UserSettings"
  ADD COLUMN IF NOT EXISTS "retroactiveEditDays" INTEGER NOT NULL DEFAULT 3;

CREATE TABLE IF NOT EXISTS "PasswordResetToken" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "tokenHash" TEXT NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "usedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PasswordResetToken_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "PasswordResetToken_tokenHash_key" ON "PasswordResetToken"("tokenHash");
CREATE INDEX IF NOT EXISTS "PasswordResetToken_userId_idx" ON "PasswordResetToken"("userId");
ALTER TABLE "PasswordResetToken" DROP CONSTRAINT IF EXISTS "PasswordResetToken_userId_fkey";
ALTER TABLE "PasswordResetToken" ADD CONSTRAINT "PasswordResetToken_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE IF NOT EXISTS "EmailVerificationToken" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "tokenHash" TEXT NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "usedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "EmailVerificationToken_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "EmailVerificationToken_tokenHash_key" ON "EmailVerificationToken"("tokenHash");
CREATE INDEX IF NOT EXISTS "EmailVerificationToken_userId_idx" ON "EmailVerificationToken"("userId");
ALTER TABLE "EmailVerificationToken" DROP CONSTRAINT IF EXISTS "EmailVerificationToken_userId_fkey";
ALTER TABLE "EmailVerificationToken" ADD CONSTRAINT "EmailVerificationToken_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Category names become case/whitespace-insensitive. A collision is stopped
-- explicitly before the unique index is created, so no category reference is
-- silently reassigned or discarded.
ALTER TABLE "Category" ADD COLUMN IF NOT EXISTS "nameNormalized" TEXT;
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "Category"
    GROUP BY "userId", lower(btrim("name"))
    HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'Cannot normalize categories: duplicate names differ only by case or whitespace. Merge those categories first.';
  END IF;
END $$;
UPDATE "Category"
SET "name" = btrim("name"), "nameNormalized" = lower(btrim("name"))
WHERE "nameNormalized" IS NULL;
ALTER TABLE "Category" ALTER COLUMN "nameNormalized" SET NOT NULL;
DROP INDEX IF EXISTS "Category_userId_name_key";
CREATE UNIQUE INDEX IF NOT EXISTS "Category_userId_nameNormalized_key" ON "Category"("userId", "nameNormalized");

-- Routine blocks used to have an optional template and their own day type.
-- Create a default template for every affected user/day type, backfill blocks,
-- then remove the duplicate source of truth.
INSERT INTO "RoutineTemplate" ("id", "userId", "name", "dayType", "isDefault", "createdAt", "updatedAt")
SELECT
  'migrated_' || md5(blocks."userId" || ':' || blocks."dayType"::text),
  blocks."userId",
  'Migrated ' || initcap(lower(replace(blocks."dayType"::text, '_', ' '))) || ' routine',
  blocks."dayType",
  true,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM (
  SELECT DISTINCT b."userId", b."dayType"
  FROM "RoutineBlock" b
  WHERE b."templateId" IS NULL
) AS blocks
WHERE NOT EXISTS (
  SELECT 1 FROM "RoutineTemplate" t
  WHERE t."userId" = blocks."userId"
    AND t."dayType" = blocks."dayType"
    AND t."isDefault" = true
);

UPDATE "RoutineBlock" b
SET "templateId" = t."id"
FROM "RoutineTemplate" t
WHERE b."templateId" IS NULL
  AND t."userId" = b."userId"
  AND t."dayType" = b."dayType"
  AND t."isDefault" = true;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM "RoutineBlock" WHERE "templateId" IS NULL) THEN
    RAISE EXCEPTION 'Routine block backfill failed: each block must have a template before the migration can continue.';
  END IF;
END $$;
ALTER TABLE "RoutineBlock" ALTER COLUMN "templateId" SET NOT NULL;
ALTER TABLE "RoutineBlock" DROP COLUMN IF EXISTS "dayType";
CREATE INDEX IF NOT EXISTS "RoutineBlock_templateId_idx" ON "RoutineBlock"("templateId");
CREATE INDEX IF NOT EXISTS "RoutineTemplate_userId_dayType_isDefault_idx" ON "RoutineTemplate"("userId", "dayType", "isDefault");

-- The frequency enum turns invalid recurrence values into database errors.
DO $$ BEGIN
  CREATE TYPE "HabitFrequencyType" AS ENUM ('DAILY', 'SPECIFIC_WEEKDAYS', 'WEEKLY_TARGET', 'MONTHLY_TARGET', 'ONE_TIME');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
ALTER TABLE "Habit"
  ALTER COLUMN "frequencyType" TYPE "HabitFrequencyType"
  USING (
    CASE "frequencyType"::text
      WHEN 'WEEKDAYS' THEN 'SPECIFIC_WEEKDAYS'
      WHEN 'WEEKENDS' THEN 'SPECIFIC_WEEKDAYS'
      WHEN 'SPECIFIC_DAYS' THEN 'SPECIFIC_WEEKDAYS'
      WHEN 'DAILY' THEN 'DAILY'
      WHEN 'WEEKLY_TARGET' THEN 'WEEKLY_TARGET'
      WHEN 'MONTHLY_TARGET' THEN 'MONTHLY_TARGET'
      WHEN 'ONE_TIME' THEN 'ONE_TIME'
      ELSE 'DAILY'
    END::"HabitFrequencyType"
  );

-- Convert the minimum-day JSON array into referentially-safe rows before the
-- old column goes away. Only habits owned by the same user are imported.
CREATE TABLE IF NOT EXISTS "MinimumDayTemplateHabit" (
  "id" TEXT NOT NULL,
  "templateId" TEXT NOT NULL,
  "habitId" TEXT NOT NULL,
  CONSTRAINT "MinimumDayTemplateHabit_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "MinimumDayTemplateHabit_templateId_habitId_key"
  ON "MinimumDayTemplateHabit"("templateId", "habitId");
INSERT INTO "MinimumDayTemplateHabit" ("id", "templateId", "habitId")
SELECT
  'migrated_' || md5(template."id" || ':' || item."habitId"),
  template."id",
  item."habitId"
FROM "MinimumDayTemplate" template
CROSS JOIN LATERAL jsonb_array_elements_text(COALESCE(NULLIF(template."habitIds", '')::jsonb, '[]'::jsonb)) AS item("habitId")
INNER JOIN "Habit" habit ON habit."id" = item."habitId" AND habit."userId" = template."userId"
ON CONFLICT ("templateId", "habitId") DO NOTHING;
ALTER TABLE "MinimumDayTemplate" DROP COLUMN IF EXISTS "habitIds";
ALTER TABLE "MinimumDayTemplateHabit" DROP CONSTRAINT IF EXISTS "MinimumDayTemplateHabit_templateId_fkey";
ALTER TABLE "MinimumDayTemplateHabit" ADD CONSTRAINT "MinimumDayTemplateHabit_templateId_fkey"
  FOREIGN KEY ("templateId") REFERENCES "MinimumDayTemplate"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MinimumDayTemplateHabit" DROP CONSTRAINT IF EXISTS "MinimumDayTemplateHabit_habitId_fkey";
ALTER TABLE "MinimumDayTemplateHabit" ADD CONSTRAINT "MinimumDayTemplateHabit_habitId_fkey"
  FOREIGN KEY ("habitId") REFERENCES "Habit"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Copy reflection data into its independent record before removing it from the
-- computed score snapshot. Null values are intentionally preserved.
CREATE TABLE IF NOT EXISTS "DailyReflection" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "date" TEXT NOT NULL,
  "energy" INTEGER,
  "mood" INTEGER,
  "reflectionText" TEXT,
  "biggestWin" TEXT,
  "biggestDifficulty" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "DailyReflection_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "DailyReflection_userId_date_key" ON "DailyReflection"("userId", "date");
INSERT INTO "DailyReflection" ("id", "userId", "date", "energy", "mood", "reflectionText", "biggestWin", "biggestDifficulty", "createdAt", "updatedAt")
SELECT
  'migrated_' || md5(score."userId" || ':' || score."date"),
  score."userId", score."date", score."energy", score."mood", score."reflectionText", score."biggestWin", score."biggestDifficulty", score."createdAt", score."updatedAt"
FROM "DailyScore" score
WHERE score."energy" IS NOT NULL OR score."mood" IS NOT NULL OR score."reflectionText" IS NOT NULL OR score."biggestWin" IS NOT NULL OR score."biggestDifficulty" IS NOT NULL
ON CONFLICT ("userId", "date") DO NOTHING;
ALTER TABLE "DailyReflection" DROP CONSTRAINT IF EXISTS "DailyReflection_userId_fkey";
ALTER TABLE "DailyReflection" ADD CONSTRAINT "DailyReflection_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DailyScore"
  ALTER COLUMN "coreScore" DROP NOT NULL,
  ALTER COLUMN "coreScore" DROP DEFAULT,
  ALTER COLUMN "growthScore" DROP NOT NULL,
  ALTER COLUMN "growthScore" DROP DEFAULT,
  ALTER COLUMN "bonusScore" DROP NOT NULL,
  ALTER COLUMN "bonusScore" DROP DEFAULT,
  ALTER COLUMN "totalScore" DROP NOT NULL,
  ALTER COLUMN "totalScore" DROP DEFAULT;
ALTER TABLE "DailyScore"
  DROP COLUMN IF EXISTS "energy",
  DROP COLUMN IF EXISTS "mood",
  DROP COLUMN IF EXISTS "reflectionText",
  DROP COLUMN IF EXISTS "biggestWin",
  DROP COLUMN IF EXISTS "biggestDifficulty";

-- Notification delivery data and optional web-push registrations.
DO $$ BEGIN
  CREATE TYPE "NotificationType" AS ENUM ('HABIT_REMINDER', 'ROUTINE_REMINDER', 'GOAL_DEADLINE', 'WEEKLY_REVIEW', 'MONTHLY_RESET', 'STREAK_MILESTONE');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  CREATE TYPE "NotificationStatus" AS ENUM ('PENDING', 'SENT', 'FAILED', 'DISMISSED');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
CREATE TABLE IF NOT EXISTS "NotificationLog" (
  "id" TEXT NOT NULL, "userId" TEXT NOT NULL, "type" "NotificationType" NOT NULL,
  "relatedEntityId" TEXT, "title" TEXT NOT NULL, "body" TEXT,
  "scheduledFor" TIMESTAMP(3) NOT NULL, "sentAt" TIMESTAMP(3),
  "status" "NotificationStatus" NOT NULL DEFAULT 'PENDING', "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "NotificationLog_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "NotificationLog_userId_status_scheduledFor_idx" ON "NotificationLog"("userId", "status", "scheduledFor");
ALTER TABLE "NotificationLog" DROP CONSTRAINT IF EXISTS "NotificationLog_userId_fkey";
ALTER TABLE "NotificationLog" ADD CONSTRAINT "NotificationLog_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
CREATE TABLE IF NOT EXISTS "PushSubscription" (
  "id" TEXT NOT NULL, "userId" TEXT NOT NULL, "endpoint" TEXT NOT NULL,
  "p256dh" TEXT NOT NULL, "auth" TEXT NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PushSubscription_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "PushSubscription_endpoint_key" ON "PushSubscription"("endpoint");
ALTER TABLE "PushSubscription" DROP CONSTRAINT IF EXISTS "PushSubscription_userId_fkey";
ALTER TABLE "PushSubscription" ADD CONSTRAINT "PushSubscription_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Quotes were introduced after the initial migration and need their own table.
CREATE TABLE IF NOT EXISTS "Quote" (
  "id" TEXT NOT NULL, "userId" TEXT NOT NULL, "text" TEXT NOT NULL, "author" TEXT,
  "isPublic" BOOLEAN NOT NULL DEFAULT false, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL, CONSTRAINT "Quote_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "Quote_isPublic_createdAt_idx" ON "Quote"("isPublic", "createdAt");
ALTER TABLE "Quote" DROP CONSTRAINT IF EXISTS "Quote_userId_fkey";
ALTER TABLE "Quote" ADD CONSTRAINT "Quote_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Security events are meaningful only when the enum can represent them.
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'ACCOUNT_DELETED';
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'LOGIN_FAILED';
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'ACCOUNT_LOCKED';
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'PASSWORD_RESET_REQUESTED';
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'PASSWORD_RESET_COMPLETED';
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'LOGOUT_ALL_SESSIONS';
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'EMAIL_VERIFIED';
