# RoutineOS — Archify Diagram Catalogue & Execution Plan

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

---

## Catalogue status

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
| 45 | Routine log to score recalc | — | next |
| 69 | Daily score cron | — | queued |
| 78–84 | Analytics & reporting (7) | — | queued |

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
