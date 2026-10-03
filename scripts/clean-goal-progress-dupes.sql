-- GoalProgress duplicate cleanup
-- Keep the earliest createdAt row per goalId+date, delete the rest.

WITH dupes AS (
  SELECT "goalId", "date", array_agg(id ORDER BY "createdAt" ASC) AS ids, count(*) AS cnt
  FROM "GoalProgress"
  GROUP BY "goalId", "date"
  HAVING count(*) > 1
)
DELETE FROM "GoalProgress"
WHERE id IN (
  SELECT unnest(ids[2:]) FROM dupes
);