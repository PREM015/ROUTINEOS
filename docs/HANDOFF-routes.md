# HANDOFF: remaining repository-direct routes (49)

**Auto-generated from the live tree.** Every `route.ts` that imports a repository without
importing a service, grouped by domain, with the exact repository calls each one makes.

Already converted and building (use as the reference pattern): **`tags`**, **`categories`**,
**`automations`** (4 routes).

## Recipe (proven three times)

1. Add the methods the route needs to `src/server/services/<domain>.service.ts`. If the
   service already exists, check first whether the method is there - several "service
   exists" domains turned out to be missing the exact method the route called.
2. Move the Zod schema and the ownership/existence checks into the service. Reuse
   `src/schemas/*.schema.ts` where one exists rather than redefining it.
3. Keep any object-to-JSON-string serialisation in the service; the repository wants
   strings for JSON columns.
4. Throw from `src/lib/errors/app-error.ts` (`NotFoundError`, `ConflictError`,
   `ValidationError`) and keep the route's existing error-to-status mapping so response
   shapes do not change.
5. `npm run type-check` -> `npx prettier --write <touched>` -> `npm run build`.

**`tsc` will NOT catch an import cycle. `npm run build` will.** Keep service-to-service
imports lazy (`await import(...)` inside the method) where a cycle is possible.

## Services that already exist

`achievement`, `admin`, `analytics`, `api-key`, `attachment`, `auth`, `automation`, `backup`, `bulk`, `category`, `day-mode`, `day-type`, `email`, `focus`, `goal`, `habit`, `import`, `insight`, `life-context`, `notification`, `pattern`, `project`, `push`, `quote`, `recap`, `review`, `routine`, `scoring`, `search`, `sleep`, `sleep-session`, `streak-recompute`, `tag`, `task`, `template`, `upload`, `user`, `wellness`

## Domains with no service yet

`billing`, `challenges`, `feature-flags`, `feedback`, `goals`, `health-metrics`, `integrations`, `nutrition`, `projects`, `push-subscriptions`, `social`, `templates`, `time-tracking`, `users`

---

### `social` (5) - NO SERVICE

- `social/connections/route.ts` - GET
- `social/follow/route.ts` - POST
- `social/followers/route.ts` - GET
- `social/following/route.ts` - GET
- `social/unfollow/route.ts` - POST

### `users` (5) - NO SERVICE

- `users/route.ts` - GET
  - `admin.listUsers`, `admin.countUsers`
- `users/[id]/activity/route.ts` - GET
  - `audit.findByUserId`
- `users/[id]/push-subscriptions/route.ts` - GET, POST, DELETE
  - `pushSubscription.findAll`, `pushSubscription.create`, `pushSubscription.delete`
- `users/[id]/route.ts` - GET
- `users/[id]/settings/route.ts` - GET
  - `user.getSettings`

### `challenges` (4) - NO SERVICE

- `challenges/route.ts` - GET, POST
- `challenges/[id]/join/route.ts` - POST
- `challenges/[id]/leave/route.ts` - POST
- `challenges/[id]/route.ts` - GET, PATCH, DELETE

### `goals` (4) - NO SERVICE

- `goals/[id]/checkin/route.ts` - POST
  - `goal.findById`, `goal.addProgressLog`, `goal.update`
- `goals/[id]/history/route.ts` - GET
  - `goal.findById`, `goal.getProgressHistory`
- `goals/[id]/milestones/route.ts` - GET, POST
  - `goal.findById`, `goal.getMilestones`, `goal.createMilestone`
- `goals/[id]/tags/route.ts` - GET, PUT
  - `goal.findWithRelations`, `goal.findById`, `tag.findById`, `goal.update`

### `integrations` (4) - NO SERVICE

- `integrations/route.ts` - GET, POST
  - `integration.findAll`, `integration.connect`
- `integrations/[provider]/disconnect/route.ts` - POST
  - `integration.findByProvider`, `integration.disconnect`
- `integrations/[provider]/route.ts` - GET, PATCH
  - `integration.findByProvider`, `integration.updateStatus`, `integration.updateTokens`
- `integrations/[provider]/sync/route.ts` - POST
  - `integration.findByProvider`, `integration.updateStatus`

### `time-tracking` (4) - NO SERVICE

- `time-tracking/route.ts` - GET, POST
- `time-tracking/start/route.ts` - POST
- `time-tracking/stop/route.ts` - POST
- `time-tracking/[id]/route.ts` - GET, PATCH, DELETE

### `admin` (3) - service exists

- `admin/feature-flags/route.ts` - GET, POST
- `admin/feedback/route.ts` - GET, PATCH
- `admin/users/[id]/route.ts` - GET, PATCH, DELETE

### `templates` (3) - NO SERVICE

- `templates/public/route.ts` - GET
  - `template.listPublic`
- `templates/route.ts` - GET, POST
  - `template.findAll`, `template.createTemplate`
- `templates/[id]/route.ts` - GET, PATCH, DELETE
  - `template.findById`, `template.update`, `template.delete`

### `auth` (2) - service exists

- `auth/check-email/route.ts` - POST
  - `user.emailExists`
- `auth/check-reset-token/route.ts` - POST
  - `authToken.isResetTokenValid`

### `feature-flags` (2) - NO SERVICE

- `feature-flags/check/route.ts` - GET
- `feature-flags/route.ts` - GET, POST

### `feedback` (2) - NO SERVICE

- `feedback/route.ts` - GET, POST
- `feedback/[id]/route.ts` - GET, PATCH

### `focus` (2) - service exists

- `focus/[id]/complete/route.ts` - POST
- `focus/[id]/route.ts` - GET, PATCH, DELETE

### `health-metrics` (2) - NO SERVICE

- `health-metrics/route.ts` - GET, POST
  - `healthMetric.findAll`, `healthMetric.create`
- `health-metrics/[id]/route.ts` - GET, PATCH, DELETE
  - `healthMetric.findById`, `healthMetric.update`, `healthMetric.delete`

### `nutrition` (2) - NO SERVICE

- `nutrition/route.ts` - GET, POST
  - `nutrition.findAll`, `nutrition.createMany`
- `nutrition/[id]/route.ts` - GET, PATCH, DELETE
  - `nutrition.findById`, `nutrition.update`, `nutrition.delete`

### `push-subscriptions` (2) - NO SERVICE

- `push-subscriptions/route.ts` - GET, POST
  - `pushSubscription.findAll`, `pushSubscription.create`
- `push-subscriptions/[id]/route.ts` - DELETE
  - `pushSubscription.findById`, `pushSubscription.delete`

### `billing` (1) - NO SERVICE

- `billing/webhook/route.ts` - POST
  - `subscription.findByStripeSubscriptionId`, `subscription.upsertByUserId`

### `projects` (1) - NO SERVICE

- `projects/[id]/goals/route.ts` - GET, POST
  - `project.findById`, `project.getGoals`, `goal.findById`, `goal.update`

### `wellness` (1) - service exists

- `wellness/weather/route.ts` - GET, POST
  - `weather.findByUserId`, `weather.upsert`

