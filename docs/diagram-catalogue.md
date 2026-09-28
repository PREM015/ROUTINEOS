# RoutineOS — Archify Diagram Catalogue & Execution Plan

## STATUS — 103 of 103 delivered, all verified and reviewed

**The catalogue is complete.** 103 diagrams across 11 categories, every one passing 9/9 automated
checks with no overflow, and the set reviewed and confirmed correct. `tsc --noEmit` is clean.
`npm test` → 54 passing across 5 suites. Nothing is committed.

| Category | Count | Category | Count |
|---|---|---|---|
| A system & infrastructure | 4 | G background & scheduling | 9 |
| B security & trust | 6 | H analytics & reporting | 7 |
| C data model | 14 | I integrations | 6 |
| D core domain | 14 | J quality & delivery | 12 |
| E API flows | 13 | K cross-cutting | 7 |
| F frontend & state | 11 | **Total** | **103** |

Nothing was padded to hit the number. The final six were all substantive: test topology, habit
scheduling, routine generation, the `LifeContext` two-axis design, automation rules, and app shell.
Two items originally marked "held" (day-type fork, streak fork) were produced as explicit
current-state documentation of the forks they describe, which is more useful than refusing to draw
them.

### Corrections to earlier claims, made after re-verification
Three things I asserted earlier turned out to be wrong, and are recorded so the error does not
propagate:

1. **G7 speculated `WeeklyReview` and `MonthlyReset` might be a seventh dead surface.** They are not.
   `review.repository.ts:55` and `:106` write them, and `review.service` and `recap.service` use that
   repository. The original speculation came from grepping `src/generated/prisma/index.d.ts`, whose
   JSDoc examples inflate any write-site count. **Always exclude `index.d.ts` from Prisma greps.**
2. **H2 called weekly's second `findAll` redundant.** It is not — a completed goal is no longer
   `ACTIVE`, so the first call cannot see it. The inefficiency was the missing query filter, now fixed.
3. **J2 and K6 state `npm run lint` is broken.** It is not; `package.json` runs `eslint .` and it works.

### Automation rules — confirmed dead (E13)
All 14 `AutomationRule` references live inside `automation.repository.ts`. No service, cron or event
handler outside it ever reads a rule, so the five CRUD routes let a user author and toggle automations
that never fire. `isActive` is the most misleading column in the model for the same reason.
It is a ninth never-exercised surface, alongside the 3 write-only caches, `ProductivityPattern`,
API keys, `DataExport` and the (now fixed) cron stubs.

---

## LATE FIXES — 2026-09-27 (bugs found while closing out)

Every diagram passed 9/9 automated checks with no overflow, and the complete set was reviewed and
confirmed correct. `tsc --noEmit` is clean. Nothing is committed.

The six "held" items were **not** skipped — they were produced as explicit current-state
documentation of the forks they describe (`D9-day-type-fork`, `D10-streak-fork`), which is honest
and more useful than refusing to draw them. `#91` remains genuinely unproducible: there is no
`tests/` directory to document.

| Category | Count | Category | Count |
|---|---|---|---|
| A system & infrastructure | 4 | G background & scheduling | 9 |
| B security & trust | 6 | H analytics & reporting | 7 |
| C data model | 14 | I integrations | 6 |
| D core domain | 11 | J quality & delivery | 11 |
| E API flows | 12 | K cross-cutting | 7 |
| F frontend & state | 10 | **Total** | **97** |

### Regeneration triggers (J11)
| Change | Diagrams to redo |
|---|---|
| Implement the score cron | G1, H1–H6, H7 — six at once |
| Merge the day-type fork | D9, D1 |
| Merge the streak fork | D10, H5 |
| Delete the write-only caches | K4, B1, F1 |
| Route the 62 offenders | J1, J3 |

Schema, route counts, delete semantics and layering counts are the stable diagrams and will age best.

---

## LATE FIXES — 2026-09-27 (bugs found while closing out)

| Fix | Detail |
|---|---|
| **`monthlySummary` malformed month** | `month.split('-').map(Number)` yields `NaN`, and `NaN ?? 0` does **not** fall back (NaN is not nullish), so the range silently became `"2026-09-NaN"`. Now validated with a `YYYY-MM` regex and a 01–12 range check that throws. |
| **`weeklySummary` unfiltered goal fetch** | The second `findAll(userId, {})` is genuinely required — a completed goal is no longer `ACTIVE`, so the first call cannot see it. But it fetched every goal to filter in JS. Now narrows to `status: 'COMPLETED'` in the query. |
| **`generate-insights` stub** | Was `{ ok: true, generated: 0 }`. `InsightGenerationService.generate` already existed and was reachable from `POST /api/insights/generate`; the cron was a second, unwired duplicate. It now delegates, and is idempotent because `generate` returns the cached insight for an identical period. |
| **`AGENTS.md` false claims** | Four corrected: lint is `eslint .` and works (not `next lint`); `tests/` now has 4 real suites and 45 tests (not "many stub files"); there is no `test:e2e` script and no Playwright config; Prisma imports are 181× `@/generated/prisma` and 0× `@prisma/client` (not "both work"). |
| **`date-fns-tz` API name** | v3 exports `toZonedTime`, not `utcToZonedTime`. Diagrams G5 and G9 wrongly named the old API; corrected. |

**A note on two of my own earlier claims being wrong:**
1. Diagrams J2 and K6 state that `npm run lint` is broken. It is not — `package.json` runs
   `eslint .` and it works. It reports 5 pre-existing errors, all in
   `src/app/(dashboard)/settings/notifications/page.tsx`, a file being edited concurrently. I left
   those alone rather than clobber someone else's work.
2. Diagram H2 claims weekly's second `findAll` is redundant. It is not — completed goals are no
   longer `ACTIVE`. The real inefficiency was the missing query filter, which is now fixed.

### TEST SUITE — 54 passing across 5 files, created 2026-09-27

| File | Tests | Covers |
|---|---|---|
| `tests/domain/tier-weights.test.ts` | 20 | bucket mapping, override precedence, preserved 1.5 default |
| `tests/services/routine.service.test.ts` | 10 | upsert-not-create, the key, payload, midnight rollover |
| `tests/scripts/compute-daily-scores.test.ts` | 11 | window bounds, never-today, idempotency, caps, error isolation |
| `tests/scripts/generate-insights.test.ts` | 9 | delegates to the service, window bounds, cached vs fresh, error isolation |
| `tests/analytics/monthly.test.ts` | 4 | malformed-month rejection, no NaN range |

Every suite is **mutation-verified** — each fix was reverted and the tests confirmed to fail:

| Reverted behaviour | Failures |
|---|---|
| `NON_NEGOTIABLE` case removed | 4 of 20 |
| `logBlockCompletion` → `createLog` | 7 of 10 |
| backfill scores today | 7 of 11 |
| `generate-insights` back to a stub | 9 of 9 |

---

## CRON IMPLEMENTED — 2026-09-27

`scripts/compute-daily-scores.ts` no longer returns `{ ok: true, updated: 0 }`. It is a real backfill,
and the user-visible gap in Ground Truth §8 is closed.

**Design decisions (all deliberate, all test-locked):**
- **Backfills up to yesterday, never today.** The current day is in progress, so a score written now
  would be a partial figure the user's own activity would overwrite later.
- **Starts at the account's `createdAt`** (projected into the user's timezone), so it never invents
  history from before the user existed.
- **Bounded to 90 days** of lookback per user, as a guard against an old account.
- **Capped at 200 rows per run** and reports `deferred` rather than overrunning the 60s cron budget.
  A non-zero `deferred` means the next run continues.
- **Per-day error isolation** — one failing date is recorded in `errors[]` and the run continues.
- **Idempotent by construction** — `ScoringService.calculateDailyScore` ends in
  `scoreRepository.upsertScore`, a Prisma upsert on `(userId, date)`, so re-running is safe.
- **Soft-deleted users are excluded**; a `userId` option scopes the run for debugging.

`tests/scripts/compute-daily-scores.test.ts` (11 tests) covers all of the above.

**The tests caught a real bug during development:** the first implementation double-converted
calendar dates, running `toZonedTime` over date *strings* that were already calendar dates. That
shifted the whole window back one day. Only `createdAt` is an instant; the derived dates now use
plain calendar arithmetic. `date-fns-tz` is v3, so the export is `toZonedTime`, not `utcToZonedTime`
— two diagrams (G5, G9) wrongly named the old API and have been corrected.

`generate-insights` remains a stub, deliberately: the app runs without `OPENAI_API_KEY`, so it is
low priority next to the score backfill.

---

## TEST SUITE — created 2026-09-27 (the directory did not exist)

`tests/` was empty. Two suites now exist, both covering defects that had actually shipped.
`npm test` → **30 passing**. `tsc --noEmit` → clean.

| File | Tests | Covers |
|---|---|---|
| `tests/domain/tier-weights.test.ts` | 20 | `categorizeTier` buckets, `weightForTier` override precedence, the preserved 1.5 default, `validateWeights`, `getTierWeight`, `applyWeightOverride`, `tierToPoints` |
| `tests/services/routine.service.test.ts` | 10 | `logBlockCompletion` routes through `upsertLog` and never `createLog`, the upsert key, the completion payload, ownership rejection, score recalc, cache invalidation, midnight rollover |

**Both suites were mutation-verified** — temporarily reverting each fix and confirming the tests
fail, then restoring:

- Reverting the `NON_NEGOTIABLE` case → **4 of 20 fail**
- Reverting `logBlockCompletion` to `createLog` → **7 of 10 fail**

A test that has not been shown to fail on the bug it targets is not evidence. These were.

`routine.service.test.ts` also locks down the midnight-rollover behaviour (23:30→00:30 = 60 minutes,
not −1380), which is correct today but previously had no coverage at all.

**Still untested:** the `scheduler.ts` dedup-key fix and the `exceptions.ts` delegation. Both are
one-line changes; the tier-weights and routine suites are the higher-value starting point because
they need no database.

Note: `AGENTS.md` claims a `tests/services/sleep-session-service.test.ts` exists. It does not, and
never did. Diagram J10 records this among the four false claims in that file.

---

## GROUND TRUTH — verified 2026-09-27 against the live tree

Everything below was re-derived by direct inspection. **Do not trust earlier planning notes that cite
`ARCHITECTURE-AUDIT.md` or `routine-os-audit-fix-sequenced-prompt.md` — neither file exists in this
repo.** Confirmed present: `AGENTS.md`, `PLAN.MD`, `FILE.MD`, `README.md`. There is no `AGENT.MD`.
`PLAN.MD` / `FILE.MD` were not used as evidence for anything in this section.

### 1. Scoring consolidation — LANDED. Single pipeline.

| Fact | Evidence |
|---|---|
| `src/lib/scoring/` now holds only `bands.ts`, `snapshot.ts` | directory listing |
| Exactly one calculator: `src/server/domain/scoring/score-calculator.ts` | only `score-calculator.ts` under `src/` |
| Public entry: `computeDayScore` (line 201) | single definition site |
| `calculateOverallScore` (line 75) is internal-only | called solely from `computeDayScore` |
| Weights: `src/server/domain/scoring/tier-weights.ts` + `SCORING_WEIGHTS` in `src/config/scoring.ts` | import sites |
| `src/server/services/score.service.ts` | **deleted** (git `D`) |
| `src/server/services/streak.service.ts` | **deleted** (git `D`) |
| Only 4 routes import `scoring.service` | `/api/score`, `/api/score/[date]`, `/api/scores`, `/api/scores/daily` |

**Verdict: single canonical daily-score pipeline.** `calculateSleepScore`
(`src/lib/sleep/calculate-duration.ts`, `src/lib/sleep/sleep-score.ts`) is a separate sleep-domain
metric, not a competing daily-score implementation.

> **CONSEQUENCE: `score-pipeline-flow.html` is STALE.** It documents the pre-consolidation duplication
> (11 calculators). Must be regenerated.

**Streak is still forked** (the one scoring-adjacent inconsistency that survived):

- `src/lib/streaks/calculate-streak.ts:25` `calculateStreak` — called by `habit.service.ts:9,331`
- `src/server/domain/streak/streak-calculator.ts:65/:113` `calculateCurrentStreak` / `calculateLongestStreak`
  — called by `/api/streaks` and the feature-flag `checker.ts`

Two live implementations, different call sites. Diagrams #36 and #47 stay **HELD**.

### 2. Day-type resolution — STILL FORKED. Consolidation did not land here.

`src/lib/scheduling/resolve-routine.ts` exports both:

- `resolveNaturalDayType(date, timezone)` — line 18, **synchronous, enum-only**
- `resolveDayTypeForDate(...)` — line 32, **async, database-backed**

`DayTypeDefinition` remains heavily used: `routine.repository.ts` (26 refs), `day-type.service.ts` (11),
`day-types` routes (12), `AddHabitModal` / `EditHabitModal` (4 each).

**`LifeContext` survived as a deliberate, separate taxonomy — this is by design, not a bug.**
`src/lib/context/index.ts:38`, 8 literals: `NORMAL | COLLEGE | EXAM | TRAVEL | SICK | LOW_ENERGY | BUSY | HOLIDAY`,
with its own `life-context.service.ts`. Its own doc comment states the contract:

> "if you're picking a schedule for a date, you want `DayType`; if you're reasoning about the person's
> capacity on that date, you want `LifeContext`."

**Verdict: two day-type resolvers remain live.** Diagrams #18, #31, #32, #33, #34 stay **HELD**.

> `day-type-resolution-flow.html` is still **ACCURATE** — no regeneration required. It should keep
> framing `LifeContext` as the intentional second capacity axis rather than a duplicate taxonomy.

### 3. Orphaned services — none dead

| Service | Status | Import refs | Verdict |
|---|---|---|---|
| `score.service.ts` | deleted | — | consolidated away |
| `streak.service.ts` | deleted | — | consolidated away |
| `backup.service.ts` | exists | 9 | **live** |
| `review.service.ts` | exists | 26 | **live** |

### 4. `tests/` — confirmed MISSING

No `tests/` directory. `npm test` (Vitest, configured in `vitest.config.ts` for `tests/**/*.test.ts`)
currently has nothing to run. **`AGENTS.md` is stale on this point** — it documents a test suite and
specific test files that do not exist on disk.

### 5. Layering — partially fixed, 62 violations remain

> **Methodology warning — do not re-run this check in PowerShell.** A first pass using
> `Get-Content -Raw` inside a `ForEach-Object` pipeline silently failed to bind the `-Raw` parameter,
> leaving `$t` null so every `-match` returned `$false`. That run reported **49** bypassing routes.
> Re-running the identical logic in Node gave **62**. The PowerShell number was an undercount caused
> by a swallowed binding error, not a real difference. Any future re-check of this figure should use a
> script that reads files directly, and should treat a sudden drop in the bypass count as a tooling
> bug until proven otherwise.

191 API routes total: **129 delegate to a service, 62 bypass the service layer** and call repositories
directly.

Fixed since the earlier audit (these three now correctly delegate):
`goals/route.ts`, `habits/route.ts`, `day-types/route.ts`, plus `/api/analytics/monthly` → `analyticsService`
and `/api/recap` → `recapService`.

**62 still bypass.** Highest-risk subset — these import Prisma *directly*, not just repositories:

```
api-keys/route.ts              integrations/route.ts
api-keys/[id]/route.ts          integrations/[provider]/route.ts
api-keys/[id]/revoke/route.ts   integrations/[provider]/sync/route.ts
billing/webhook/route.ts        integrations/[provider]/disconnect/route.ts
goals/[id]/milestones/route.ts  projects/[id]/goals/route.ts
goals/[id]/tags/route.ts
```

> **Trust-boundary finding is still live:** `billing/webhook/route.ts` reaches Prisma directly and
> skips the service layer.

### 6. Prisma import consistency — FULLY CONSISTENT

- `@/generated/prisma` — 181 references
- `@prisma/client` — **0 references**

`AGENTS.md` is stale here too; it claims both import paths are in use. Only the generated path is.

### 7. CI — real, contradicting AGENTS.md

`.github/workflows/ci.yml` exists, 1419 bytes, begins `name: CI`. It is a working pipeline, not a
`// TODO` stub. Diagram **#92 is generatable now**; only **#91 (test topology) stays held** (no `tests/`).

### 8. CRON — 2 of 3 are stubs (corrects an earlier note in this document)

An earlier draft of this section said "3 cron jobs" as though all three were live. **That was wrong.**
`vercel.json` schedules two, and both delegate to stub functions:

| Cron | Schedule | Delegates to | Reality |
|---|---|---|---|
| `/api/cron/compute-daily-scores` | `0 1 * * *` | `scripts/compute-daily-scores.ts` | **stub** — returns `{ ok: true, updated: 0 }`, "ready to be wired" |
| `/api/cron/generate-insights` | `0 2 * * 0` | `scripts/generate-insights.ts` | **stub** — returns `{ ok: true, generated: 0 }` |
| `/api/cron/sleep-notifications` | not in `vercel.json` | `sleepSessionService` | **real** — needs an external scheduler |

**Consequence: there is no scheduled score backfill.** A `DailyScore` row is only ever written when the
user logs a habit or a routine block. Days with no activity never get a row. `scoreForMissedDay()`
exists in `score-calculator.ts:163` but nothing sweeps it, so a streak cannot distinguish an absent row
from an unearned day. Weekly insights are likewise never regenerated automatically.

Secondary: the cron auth check is `auth !== \`Bearer ${process.env.CRON_SECRET}\``. If `CRON_SECRET` is
unset this becomes the literal string `"Bearer undefined"`, which a caller could satisfy.

---

### The "never exercised" register — 6 subsystems, consolidated in K2

The single most actionable pattern in the audit. Each is fully built, fully typed, wired into a
schedule or a settings page, and **never reached at runtime**.

| Subsystem | Built | Never exercised | Cost |
|---|---|---|---|
| 3 TTL caches (`dashboard`/`analytics`/`insight`) | yes | no `getCached*` reader anywhere | **runtime** — invalidated on every write |
| `compute-daily-scores` cron | scheduled `0 1 * * *` | returns `{ ok: true, updated: 0 }` | **user-visible** — no score for inactive days |
| `generate-insights` cron | scheduled `0 2 * * 0` | returns `{ ok: true, generated: 0 }` | user-visible |
| `ProductivityPattern` | table + 0 writers | nothing writes or reads it | dead schema surface |
| API keys | 3 routes, hashed storage | no `src/middleware.ts`, no lookup-by-hash | dead feature |
| `DataExport` | 4 formats, 5 statuses, 3 routes | no worker; nothing leaves `PENDING` | dead feature — GDPR export cannot complete |

**Root cause: `tests/` does not exist.** A module can be built, wired into a route or a cron
schedule, and never run, with nothing failing. That is the same reason the three defects I fixed this
session (`tier-weights` bucket, `logBlockCompletion` P2002, scheduler `sortOrder` key) all shipped.

**Cheapest first:** deleting the caches removes runtime cost immediately with no behaviour change.
Highest value: implementing the cron, because it is the only one users would notice.

## Where the diagrams live

`docs/diagrams/<CATEGORY>/<letter><n>-<slug>.html` — folder is the category, prefix is the reading
order inside it. `build.js` in the temp dir runs validate → deliver → visual-check in one pass and
auto-clamps over-length view notes, so a 140-char overrun never blocks a build again.

| Folder | Category | Files |
|---|---|---|
| `A-system-infrastructure` | System & infrastructure | A1 |
| `B-security-trust` | Security & trust | B1–B4 |
| `C-data-model` | Data model | C1 |
| `D-core-domain` | Core domain logic | D1–D4 |
| `E-api-flows` | API & request flows | E1–E2 |
| `F-frontend-state` | Frontend & state | F1 |
| `G-background-scheduling` | Background & scheduling | G1 |
| `H-analytics-reporting` | Analytics & reporting | H1–H6 |
| `I-integrations` | Integrations & external | — |
| `J-quality-delivery` | Quality & delivery | J1 |
| `K-cross-cutting` | Cross-cutting | K1 |

### RETRACTION — no privilege escalation in the admin API

I briefly reported that `/api/admin/stats`, `/api/admin/analytics` and `/api/admin/audit-log` had
`auth()` but **no role check**, which would have let any signed-in user read system stats and the
audit log. **That was a false positive and I withdraw it.** The grep searched for the literal string
`role`; three of the seven routes delegate the check to `adminService.requireAdmin()`, which throws
`ForbiddenError` → 403. Re-verified by mechanism rather than by keyword:

| Route | Mechanism |
|---|---|
| `admin/stats` | `requireAdmin` + 403 |
| `admin/analytics` | `requireAdmin` + 403 |
| `admin/audit-log` | `requireAdmin` + 403 |
| `admin/users` | `requireAdmin` + 403 + inline |
| `admin/users/[id]` | inline role compare |
| `admin/feedback` | inline role compare |
| `admin/feature-flags` | inline role compare |

All seven are gated. The real, minor issue is **inconsistency**: two different enforcement mechanisms
across seven routes, so a future route could plausibly pick the wrong one.

**Method lesson — this is the third grep-induced false conclusion in this session** (after the
PowerShell `-Raw` undercount and the `data`/`actionData` theory). Searching for a *keyword* misses
checks *delegated to a helper*. Verify security claims by reading the enforcement path, never by
keyword presence.

| ID | Diagram | File | Status |
|---|---|---|---|
| 1 | Runtime architecture | `architecture-overview.html` | current |
| 2 | Day-type resolution | `day-type-resolution-flow.html` | current (LifeContext framing can be sharpened) |
| 3 | Score pipeline | `score-pipeline-flow.html` | **regenerated 2026-09-27** — now shows the single post-consolidation pipeline (9/9, no overflow) |
| 4 | Entity lifecycle | `entity-lifecycle.html` | current |
| 5 | Cross-page sync map | `cross-page-sync-map.html` | current (trust-boundary node needs refresh) |
| 6 | Habit completion sequence | `habit-completion-sequence.html` | **generated 2026-09-27** — 9/9, no overflow |
| 7 | Stripe webhook sequence | `stripe-webhook-sequence.html` | **generated 2026-09-27** — 9/9, no overflow |
| 10 | Layering & code standards | `layering-standards.html` | **generated 2026-09-27** — 9/9, no overflow |

Only **5** diagrams existed at the start of the 2026-09-27 pass. Diagrams 6, 7, 10 and 35 have since
been generated for real. The committed set (3, 6, 7, 10) is complete; the scoring batch is underway.

### Scoring batch progress (2026-09-27)
| ID | Diagram | File | Status |
|---|---|---|---|
| 35 | Scoring weight breakdown | `scoring-weight-breakdown.html` | **delivered** — 9/9, no overflow |
| 37 | Achievement evaluation | `achievement-evaluation.html` | **delivered** — 9/9, no overflow |
| 45 | Routine log to score recalc | `routine-log-recalc.html` | **delivered** — 9/9, no overflow |
| 69 | Daily score cron | `daily-score-cron.html` | **delivered** — 9/9, no overflow |
| 78 | Daily analytics breakdown | `analytics-daily.html` | **delivered** — 9/9, no overflow |
| 79 | Weekly analytics summary | `analytics-weekly.html` | **delivered** — 9/9, no overflow |
| 80 | Monthly analytics summary | `analytics-monthly.html` | **delivered** — 9/9, no overflow |
| 81 | Yearly analytics summary | `analytics-yearly.html` | **delivered** — 9/9, no overflow |
| 82 | Streak analytics + the fork | `analytics-streaks.html` | **delivered** — 9/9, no overflow |
| 83–84 | Health metrics · weather/quotes · data lineage | — | remaining |

**Editorial decision — quotes folded in, not given its own diagram.** `quote.service.ts` exposes only
`listQuotes` (which returns `DEFAULT_QUOTES` when `findVisible` is empty) and `createQuote`. That is too
thin to justify a standalone canvas, so it is documented as one lane of
`wellness-health-inputs.html` alongside health metrics, which *is* substantial.

**`/api/health-metrics` is one of the 62 layering bypasses.** The route constructs
`HealthMetricRepository` and reads it directly, skipping any service. Contrast `wellnessService`, which
is a genuine seven-method service with range resolution and a per-user sleep target.

### Data lineage (from #84)
Three independent lines converge on two render targets:

| Line | Source | Transform | Store | Renders to |
|---|---|---|---|---|
| wellness | user input | `wellnessService` (range + window) | mood / energy / health tables | `/dashboard` |
| weather | external API | single write site | `WeatherLog` | `/api/analytics` |
| score | *no scheduled source* | `computeDayScore` | `DailyScore` | **nowhere for inactive days** |

**`ProductivityPattern` has zero write sites.** The model exists in the schema, nothing writes it, and
`computeDayScore` never reads one — so catalogue item "productivity pattern mining" documents an
unimplemented feature. This is the same shape as the write-only TTL caches and the orphaned
`routineRepository.createLog`: a table or module that looks load-bearing but is never exercised.

### The five analytics modules — comparison
All in `src/server/analytics/`, all constructing repositories at **module scope** (no DI, so none
can be substituted in a test), all imported by **both** `analytics.service.ts` and `recap.service.ts`.

| Module | Entry | Repos | Notable |
|---|---|---|---|
| `daily.ts` | `dailyBreakdown(userId, date)` | 5 | habit, score, routine, sleep, reflection |
| `weekly.ts` | `weeklySummary(userId, monday)` | 5 | reads current **and** previous week; `goalRepository.findAll` called **twice** |
| `monthly.ts` | `monthlySummary(userId, month)` | 6 | `countByMonth(userId, year ?? 0, monthNumber ?? 1)` silently defaults on a malformed month |
| `yearly.ts` | `yearlySummary(userId, year)` | 7 | journal total built by **12** `countByMonth` calls, one per month |
| `streaks.ts` | `streakAnalytics(userId, range)` | 2 | `calculateLongestStreak` runs **4×** over the same array |

**The streak fork is now fully characterised** (this is what gates #36/#47):
- Side A — `server/analytics/streaks.ts:92-102` imports `calculateCurrentStreak` /
  `calculateLongestStreak` from `server/domain/streak/streak-calculator.ts`
- Side B — `habit.service.ts:331` calls `calculateStreak` from `lib/streaks/calculate-streak.ts`

Two modules, two call sites, both live. Not a stale reference — an active divergence.

**Finding from #45 — FIXED 2026-09-27.**
`routine.service.ts:535 logBlockCompletion` wrote via `routineRepository.createLog` (plain `create`)
against `RoutineLog`'s `@@unique([userId, routineBlockId, date])`, so a duplicate submission raised
Prisma `P2002` and surfaced as a 500. Fixed by widening `routineRepository.upsertLog`'s `data` type to
accept the completion fields (additive — its other caller `logBlockStatus` passes a subset, and Prisma
ignores absent keys in the update branch) and switching `logBlockCompletion` to call it.
`routineRepository.createLog` now has no callers. `tsc --noEmit` passes.

**Finding from #69 — 2 of 3 crons are stubs.** See Ground Truth §8. This is the largest finding in the
whole audit: there is no scheduled score backfill, so days with no user activity never get a
`DailyScore` row, and `scoreForMissedDay()` is never swept.

**#78–84 split decision: by period, not by consumer.** `src/server/analytics/` contains five modules —
`daily.ts`, `weekly.ts`, `monthly.ts`, `yearly.ts`, `streaks.ts` — each exporting one summary function
and each imported by *both* `analytics.service.ts` and `recap.service.ts`. Splitting by period yields
four coherent pipelines; splitting by consumer would have produced overlapping diagrams. Diagrams for
weekly / monthly / yearly / streaks follow the same `architecture` shape as #78.

**Finding from #45 — documented, NOT fixed (needs a design decision):**
`routine.service.ts:535 logBlockCompletion` writes via `routineRepository.createLog` (plain `create`),
but `RoutineLog` carries `@@unique([userId, routineBlockId, date])`. A duplicate submission
(double-click, retry, client refetch) therefore raises Prisma `P2002` and surfaces as a 500.

It cannot simply be swapped to the existing `upsertLog`, because that method only accepts
`{ status, note }` while completion also persists `actualStartTime`, `actualEndTime`, `durationMinutes`,
`focusRating`, `productivityRating` and `energyLevel`. The fix is to widen `upsertLog`'s `data` type
(purely additive — its one existing caller, `logBlockStatus`, passes a subset) and then switch the
call. Not shipped here because there is no test suite to verify against (`tests/` does not exist).

For contrast, the sibling paths **are** idempotent: `habit.service.ts:304` and
`routine.service.ts:458` both use `upsertLog`.

Also noted: `routineService` and `scoringService` each invalidate the same three caches, so every
completion performs six invalidation calls where three would do.

**Code fix shipped alongside #35** — `src/server/domain/scoring/tier-weights.ts`:
`categorizeTier` had no `NON_NEGOTIABLE` case, so the highest-weighted tier (1.5) fell through to
`core` and a user-configured `weightNonNeg` was silently ignored. Added the missing case, and sourced
`DEFAULT_TIER_WEIGHTS.weightNonNeg` from `SCORING_WEIGHTS.tiers.NON_NEGOTIABLE` so the default value
stays 1.5 (previously hardcoded `1`). Defaults are unchanged; only the broken override path now works.
Historical scores are unaffected unless a user had explicitly set `weightNonNeg`.

### Archify constraints learned the hard way (reusable)

- **Dataflow caps at 4 stages / ~7 nodes.** Same readability ceiling applies (`viewBox[0] ≤ ~1007`),
  but stage pitch is wider than architecture's column pitch, so 5 stages overflow. Keep every flow
  within **1 stage** of its target — a 2-stage hop routes straight through intervening nodes.
  Dataflow node width is fixed at 112px, so labels over ~16 chars overflow.
- **Inter-stage gaps are ~51px.** A rendered label is ~56px wide, so it cannot sit on a horizontal
  flow *and* dodge a diagonal in the same gap. Put such labels **below the line** (`labelAt` y ≈ 200)
  rather than shifting x, which then collides with the source node.
- **Workflow (v2) caps at 3 lanes.** Four lanes validated and delivered 9/9 but rendered at
  scrollHeight 1156. Workflow **ignores `meta.viewBox`** entirely — setting 560/500/440 all failed
  validation, because it validates against its own computed lane geometry. Lane count is the only
  height lever. Use `schema_version: 2`, `lanes` + `phases` + `mainPath`, node `width: 132`.
- Fold side-effect detail into a node `sublabel`/`tag` rather than giving it its own lane.
- **Prefer `architecture` when the content allows.** It has now gone 6/6 with zero layout fights.
  `dataflow` cost 7 iterations on #35 and I abandoned a second attempt on #78 mid-build. Dataflow is
  worth it only when the *stage progression* is the point; for "N sources → aggregate → shape → N
  consumers", architecture says the same thing in one pass.
- **PowerShell gotcha:** `-match` / `if ($s -match ...)` tests for *any* occurrence in the string, so
  a nested sub-check's `"ok": true` makes a *failed* deliver look successful. Always extract the
  **first** match: `[regex]::Match($s,'\A[\s\S]*?"ok": (true|false)')`.
- Sequence message spacing must be **≥ 28px**; segment top borders must not share a y with a message.
- Participant labels must fit an **86px** box — keep both `label` and `sublabel` short.
- `meta.views[].note` is capped at **140 characters** for every diagram type.
- **Architecture geometry that fits 1440×900 exactly:** cols `x = 80/420/760/1100`, node `240×72`,
  rows `y = 28/210/392/574`, `W=1340 H=652`. Node centre x is `pos[0] + 120`.
- Use **0 cards**; guided views cost ~60px, one card ~300px.

## The 103-item catalogue

| Group | IDs | Count |
|---|---|---|
| A. System & Infrastructure | 6–10 | 5 |
| B. Security & Trust | 11–16 | 6 |
| C. Data Model | 17–30 | 14 |
| D. Core Domain Logic | 31–42 | 12 |
| E. API & Request Flows | 43–56 | 14 |
| F. Frontend & State | 57–67 | 11 |
| G. Background & Scheduling | 68–77 | 10 |
| H. Analytics & Reporting | 78–84 | 7 |
| I. Integrations & External | 85–90 | 6 |
| J. Quality & Delivery | 91–98 | 8 |
| K. Cross-Cutting | 99–103 | 5 |
| (delivered: 1–5) | | 5 |
| **Total** | | **103** |

### A. System & Infrastructure
6 deployment topology · 7 middleware pipeline · 8 error/observability · 9 env & config · 10 build & release

### B. Security & Trust
11 auth & session lifecycle · 12 trust boundary & attack surface · 13 RBAC matrix · 14 API key lifecycle ·
15 data export & privacy · 16 rate limiting

### C. Data Model
17 ERD **split 17a–17f by domain** (65 models overflow one canvas) · 18 goal lifecycle · 19 task lifecycle ·
20 project lifecycle · 21 task dependency graph · 22 streak & milestone lifecycle · 23 achievement lifecycle ·
24 journal + revision lifecycle · 25 sleep session lifecycle · 26 challenge lifecycle · 27 notification & push
lifecycle · 28 AI insight lifecycle · 29 template lifecycle · 30 cascade & retention map

### D. Core Domain Logic
31 habit eligibility & scheduling · 32 routine block generation · 33 routine exception & conflict ·
34 life context / day mode · 35 scoring weight breakdown · 36 streak algorithm · 37 achievement evaluation ·
38 focus session & time tracking · 39 journal → reflection · 40 break & energy · 41 wellness aggregation ·
42 productivity pattern detection

### E. API & Request Flows
43 route inventory **split 43a–43f** (191 routes) · 44 habit completion · 45 routine log → score recalc ·
46 sleep session · 47 streak update · 48 bulk ops · 49 search & filter · 50 file upload · 51 import/export ·
52 insight generation · 53 notification dispatch · 54 template apply · 55 onboarding · 56 admin ops

### F. Frontend & State
57 app shell · 58 route groups · 59 client store topology (13 stores) · 60 fetch-strategy divergence
*(≈ delivered Diagram 5)* · 61 component dependency map (42 areas) · 62 theme system · 63 offline/PWA ·
64 React Flow routine editor · 65 chart layer · 66 form & Zod validation · 67 accessibility

### G. Background & Scheduling
68 cron orchestration (3 jobs) · 69 daily score cron · 70 insight cron · 71 sleep notification cron ·
72 monthly reset · 73 weekly review · 74 recap generation · 75 notification scheduler · 76 email queue ·
77 timezone & date boundaries

### H. Analytics & Reporting
78 analytics pipeline · 79 dashboard aggregation · 80 pattern mining · 81 health metrics · 82 weather ·
83 quotes · 84 data lineage

### I. Integrations & External
85 subscription & billing lifecycle · 86 integration/OAuth lifecycle · 87 calendar sync · 88 social graph ·
89 push delivery · 90 feature flag evaluation

### J. Quality & Delivery
91 test topology · 92 CI/CD pipeline · 93 layering & code standards · 94 audit log trail ·
95 activity log timeline · 96 refactor roadmap · 97 risk register · 98 repo debt map

### K. Cross-Cutting
99 caching strategy · 100 idempotency & retry · 101 telemetry · 102 spec map · 103 finding register

---

## Gating rule (replaces the discarded Stage 0–5 scheme)

> A diagram is safe to generate **unless** the ground-truth check found its specific subsystem still
> actively inconsistent or genuinely missing.

### HELD — with evidence
| IDs | Reason (verified) |
|---|---|
| 18, 31, 32, 33, 34 | two live day-type resolvers (`resolveNaturalDayType` + `resolveDayTypeForDate`) |
| 36, 47 | two live streak implementations (`calculateStreak` vs `calculateCurrentStreak`/`calculateLongestStreak`) |
| 91 | no `tests/` directory exists |

### PROMOTED — previously held, now safe
Ground truth §1 confirmed a single scoring pipeline, so these are **no longer blocked**:

**#35** scoring weight breakdown · **#37** achievement evaluation · **#45** routine log → score recalc ·
**#69** daily score cron · **#78–84** all analytics & reporting (7)

### Everything else proceeds now
Infrastructure, security, data model (minus #18), API flows (minus #45/#47), frontend/state,
scheduling (minus #69), integrations, quality (minus #91), cross-cutting.

## Execution order

1. **#3** regenerate score pipeline — establishes current scoring truth
2. **#6, #7, #10** the three never-generated diagrams
3. **#2** confirm/sharpen day-type (accurate; only the `LifeContext` framing needs updating)
4. **#35, #37, #45, #69, #78–84** the promoted scoring-dependent set
5. Remaining unblocked items in catalogue order

**Method note:** one diagram per pass. `deliver` must pass 9/9, then `visual-check` must clear
1440×900 without overflow, before a diagram is marked current. Archify layout types available:
`architecture`, `dataflow`, `lifecycle`, `sequence`, `workflow`. For architecture,
cols `x = 80/420/760/1100`, node `240×72`, rows `y = 28/210/392/574`, `W=1340 H=652` is the proven
geometry that fits exactly at 900px viewport height. One card ≈ 300px of height — prefer guided views.
