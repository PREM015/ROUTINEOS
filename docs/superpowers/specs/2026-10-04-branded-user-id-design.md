# Branded `UserId` — design

Date: 2026-10-04
Sub-project: **F** of the `/focus` gap programme (F → E → B → A → C → D → G)

## Problem

`focus.md` §44.1 recorded a follow-up that was not applied because it "touches every
repository". The underlying defect class is narrow and specific:

> Two same-typed identifiers in the same position is the one parameter-order mistake
> TypeScript is structurally blind to.

Every identifier in this schema is a `cuid()`, so every method signature that takes
more than one id is `(...: string, ...: string)`. Swapping two adjacent `string`
arguments compiles cleanly and produces a wrong-row read or write at runtime.

Measured surface (recursive counts across `src`, excluding `src/generated`):

| Measurement | Count |
| --- | --- |
| `userId: string` parameters | **951** |
| Signatures with adjacent `(userId, xId)` — the bug class | **285** |
| `session.user.id` reads in API routes (223 `route.ts` files) | **630** |
| Repository files / service files | 46 / 56 (both directories flat) |
| Test files | 29 (4 declare a `USER` constant) |
| Id-bearing parameters typed `any` | **0** |

By area:

| Area | `userId` params | Adjacent pairs |
| --- | --- | --- |
| `src/server/repositories` | 406 | 98 |
| `src/server/services` | 410 | 150 |
| `src/lib` | 70 | 29 |
| `src/server/audit` | 21 | 7 |
| `src/server/notifications` | 10 | 1 |
| `src/server/analytics` / `ai` / `data` / `recap` | 16 | 0 |
| `src/app/api` / `src/store` | 5 | 0 |

The focus domain alone carries 9 `(userId, sessionId)` pairs in `focus.service.ts`
(`getSession`, `requireActive`, `pauseSession`, `resumeSession`, `extendSession`,
`heartbeat`, `listEvents`, `deleteSession`, `assertCategoryOwned`) and 5 more in
`focus.repository.ts`. This is the domain where the mistake was actually made.

Note the zero in the last row of the risk table: no id-bearing parameter is typed `any`,
so the brand will be effective everywhere it is applied. An earlier count taken with a
non-recursive glob understated every figure here by roughly 2x.

## Feasibility

Prisma types its string columns as `id?: StringFilter<"X"> | string`, and
`StringFilter.equals?: string`. A branded `UserId = string & { ... }` is a subtype of
`string`, so branded ids pass into `where` clauses and `connect` payloads **with no cast
layer**. The refactor is therefore mechanical rather than invasive: no Prisma shim, no
`as unknown as string` at the data layer.

## Decision

**Brand inbound `userId` parameters only.** Model fields and repository return types
stay `string`.

Rationale: the defect class is an *argument* passed in the wrong slot. Branding
parameters closes exactly that. Branding return types as well would force a `toUserId()`
at every Prisma row read (`row.userId` is a plain `string`) and cascade through all 46
repositories — a much larger diff guarding a narrower risk, since a returned id flows
outward into display code where a wrong value is a wrong label rather than a wrong-row
write.

## Design

### 1. The brand — `src/types/ids.ts` (new)

```ts
declare const userIdBrand: unique symbol;

export type UserId = string & { readonly [userIdBrand]: true };

/** The single place a raw string becomes a `UserId`. */
export function toUserId(raw: string): UserId {
  return raw as UserId;
}
```

A `unique symbol` brand rather than the common `__brand: 'UserId'` string-literal form:
the literal form is structurally forgeable, since any object literal claiming
`{ __brand: 'UserId' }` typechecks. `unique symbol` makes the type genuinely nominal.

### 2. Producers

Two helpers, so the 630 route sites take a one-word change rather than a cast:

| Helper | Use |
| --- | --- |
| `toUserId(raw)` | any boundary where a `string` becomes a user id (cron handlers, webhook payloads, seeds) |
| `userIdFromSession(session)` | API routes holding a NextAuth session |

`userIdFromSession` throws on a missing session rather than branding `undefined`. The
routes already guard for an absent session and return 401 before reaching the service
layer; the helper is defence in depth, not the primary check.

Measured across the 223 `route.ts` files: **199** narrow the session itself
(`if (!session?.user?.id) return 401`), **0** narrow a `userId` variable, **2** are auth
endpoints with a different shape. So the session-taking helper fits today's call sites.
A future route using the variable-narrowing shape would not compile against it — which is
the correct outcome, not an accident to be worked around.

**One route is deliberately different.** `GET /api/admin/audit-log` reads `userId` from
`searchParams`, because an admin browsing another user's audit log is a real case. It is
gated behind `requireAdmin` and returns 403 otherwise, so this is authorized rather than
a trust violation. It calls `toUserId` directly and must not be given the session helper.

### 3. Consumers

Every inbound `userId` parameter in `src/server/**`, `src/lib/**` and
`src/app/api/**` becomes `UserId`. No other identifier type is branded in this
sub-project — see "Out of scope".

## Implementation waves

Each wave ends with `npm run type-check` clean, so a reviewer can follow one domain at
a time.

1. **Scaffolding** — `src/types/ids.ts` + `userIdFromSession`. No call sites changed, so
   nothing breaks.
2. **focus** — `focus.service.ts`, `focus.repository.ts`, `src/app/api/focus/**`, and the
   6 focus test files. Highest-risk domain and the one where the bug was found; proves
   the pattern before it spreads.
3. **routine, habit, goal, project/task** — the densest adjacent-pair domains.
4. **journal, sleep, score, settings**.
5. **`src/server/services` + `src/server/repositories` sweep** (816 params) — to zero
   remaining `userId: string` parameters.
6. **`src/lib`, `src/server/{audit,notifications,analytics,ai,data,recap}`** (127 params).
7. **API routes** — 630 `session.user.id` reads → `userIdFromSession(session)`.
8. **Tests** — brand the `USER` constant once at module scope per file (4 files declare
   one today) rather than per call site.

Waves 2-4 are the ones that need judgement; 5-8 are mechanical sweeps driven entirely by
compiler output.

## The compiler is the work list

Re-typing a parameter makes `tsc` fail at every call site that passes a raw string. The
producer set is therefore **self-enumerating** — there is no separate audit step and no
site that can be silently missed. The majority of call sites need no edit: a caller
already threading a branded value satisfies the new signature silently.

## Risk controls

- **Clear the caches before trusting a green run.** `tsconfig.json` sets
  `incremental: true`, so `npm run type-check` can report 0 errors from a stale
  `.tsbuildinfo` while `npx tsc --noEmit` reports real failures. ESLint caches the same
  way. This bit during sub-project B: a green `type-check` was hiding a
  `Cannot find name 'session'` that only `next build`'s own type pass found. The
  authoritative check is:

  ```
  npx tsc --noEmit          # not `npm run type-check`, which may be cached
  npx eslint . --no-cache
  npm test
  npm run build
  ```

  Delete `*.tsbuildinfo` and `.next` first when a result looks surprising.
- **`next build` type-checks independently** and catches what a cached `type-check`
  misses, so a green `type-check` alone is not evidence the build will pass.

- **Purely type-level.** Values remain strings at runtime, in JWTs and on the wire.
  Branding happens at the edge, so serialization and the NextAuth `jwt` strategy are
  unaffected.
- **`any` defeats the brand — but the audit is already clean.** A nominal type provides
  no protection where a value arrives as `any`. A recursive scan found **zero**
  id-bearing parameters typed `any`, so nothing needs fixing before wave 1. Re-checked
  at the end of the sweep: an `any` introduced mid-refactor would silently punch a hole
  in the guarantee, and that is the one regression this refactor cannot detect on its own.
- **`as UserId` defeats the brand silently.** A compiled probe confirmed that
  `safe('sess-1' as UserId, ...)` passes with no error, whereas the same call without
  the cast is a compile error. An `as` anywhere in the chain therefore removes the
  protection permanently and invisibly. Mitigation, and the reason wave 7 must not be
  done by sprinkling casts:
  - only `toUserId()` is ever written; `as UserId` appears nowhere in the diff;
  - the negative `@ts-expect-error` test in **Testing** fails if the type is ever widened
    back, so the guarantee is regression-tested rather than assumed;
  - wave 7's route diff is reviewed specifically for `as UserId`.
- **Contravariance is a real break class under `strictFunctionTypes`.** A probe confirmed
  `(userId: UserId, sessionId: string) => void` is not assignable to
  `(userId: string, sessionId: string) => void`. A scan found only **2** such
  function-typed positions, both in `src/app/(dashboard)/social/page.tsx`, and **0** bare
  method references passed as callbacks. Handled by widening those two to accept
  `UserId`; re-checked per wave.
- **Five signatures take two user ids** — `(actorId, userId)` in `admin-user.service.ts`
  (×3) and `(userId, otherUserId)` in `social.service.ts` / `social.repository.ts`. These
  are the cases the brand *does* protect, and only because of a deliberate rule: **a
  parameter is branded if and only if it is named exactly `userId`.** Branding `actorId`
  or `otherUserId` as `UserId` would make those swaps undetectable.
- **No new `eslint-disable`**, per the standing constraint on this codebase.
- **Generated Prisma client is never hand-edited**; no change is needed there anyway.

## Testing

Type-level only, so verification is the compiler plus the existing suite:

- `npm run type-check` — must be 0 errors, and must *stay* 0 after each wave.
- `npm test` — 716 tests across 29 files must stay green.
- **A negative type test that the brand actually bites.** A throwaway probe compiled
  during design confirmed the mechanism works, but a probe is deleted; a permanent
  `@ts-expect-error` assertion is what stops a later edit quietly widening the type back
  to `string`. It asserts that a plain `string` is rejected in a `UserId` slot, that a
  `UserId` is accepted by a plain-`string` sink (the Prisma direction), and that
  `as UserId` is never used in `src/**` — that last one enforced by a test that greps the
  source, since the compiler cannot catch it.
- **A source grep for `as UserId`** as a standing check. The compiler cannot detect an
  `as` cast reintroducing the hole; only a text check can.

## Out of scope

- Branding other identifier types (`SessionId`, `BlockId`, `GoalId`). Deferred: the
  `UserId` brand already prevents `userId`/`xId` swaps, which is the recorded defect
  class. `SessionId` would be the first candidate if a second instance of the bug appears.
- Branding `actorId` / `otherUserId`. Deliberately excluded — see Risk controls.
- Model fields and repository return types (see "Decision").
- Any runtime behaviour change.
- `src/app/api/admin/audit-log`'s query-string `userId`, which is authorized and correct
  as-is.

## Programme context

This is sub-project **F** of seven. Doing it first is deliberate: B (settings/presets),
A (context rail) and D (notification scheduling) each add service and repository
signatures, and the brand protects those as they land rather than re-touching them after.

Remaining order after F: **E** forced-colors + text alternatives → **B** settings and
presets → **A** context rail → **C** offline outbox → **D** server-side notifications →
**G** export/import/seed data paths.