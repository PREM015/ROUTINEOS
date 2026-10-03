# Analytics 2.0 — Phase 0 Exit Note

Date: 2026-10-04. Gate: `T0.1`–`T0.5`. No feature code in this phase.

This plan was written without source access. Everything below was checked against
the tree, and several of its premises turned out to be false. Phase 1 of the
*previous* plan has already been implemented, which changes what remains.

---

## 1. Baselines (T0.3)

| Check | Command | Baseline |
|---|---|---|
| Types | `npm run type-check` | **clean**, 0 errors |
| Lint | `npm run lint` | **0 errors, 213 warnings** |
| Tests | `npm test` | **781 passed / 781**, 34 files |
| Build | `NODE_OPTIONS=--max-old-space-size=8192 npm run build` | **succeeds**, full static route table emitted |

### The heap crash is not real

T0.3 says "the audits report a heap crash in `tsc`, so run it with a larger Node
heap". Not reproducible. `tsc --noEmit` completes clean at default heap, and
`next build` completes with an 8 GB heap. No `NODE_OPTIONS` is needed.

Keep the raised heap in CI if it is already there — it costs nothing — but do not
treat it as fixing a known problem, and do not investigate it as one.

### The test count moved during Phase 0, and not because of me

`tests/lib/focus-durations.test.ts` was created at 01:43, *after* the 01:22
baseline run. It appeared mid-verification. The Focus rewrite is landing files
concurrently with this work (see §5). Baseline arithmetic:

- 01:22 baseline: 30 files / 724 tests
- plus my 2 files / 36 tests (`calendar-date`, `analytics-score-average`)
- plus 2 files / 21 tests from the concurrent Focus work
- = **34 files / 781 tests** ✓ reconciles exactly

**Re-measure the baseline at the start of every phase.** It is a moving target.

---

## 2. T0.4 — the (verify) items, answered

### 2.1 Who writes `User.preferences` — answered, and it is a hazard

**One existing writer: 2FA state.** `lib/security/totp.ts` exports exactly the two
primitives D4 needs, and they are already merge-safe:

- `parsePreferences(raw)` — safe parse, returns `{}` for null, non-object, or
  malformed JSON.
- `readTwoFactorState` / `writeTwoFactorState` — the writer spreads the whole
  parsed object and replaces **only** `prefs.auth.twoFactor`
  (`totp.ts:188-194`). Its own docstring says "preserving every other preference
  key".

Callers: `auth.service.ts` (5 sites), `lib/auth.ts:147`. Nobody else touches it.

So analytics would be the **second** writer, under `prefs.analytics`. D4's
"merge, never overwrite" is satisfied by reusing `parsePreferences` and following
the `writeTwoFactorState` shape. No new mechanism needed.

**But there is a lost-update race the plan does not mention, and it is a real one.**
Both writers do read-modify-write on the whole column:

```
analytics service:  read preferences → merge prefs.analytics → write whole string
2FA service:        read preferences → merge prefs.auth.twoFactor → write whole string
```

No transaction, no `updatedAt` check, no optimistic lock. Two concurrent writes
lose one namespace — a user enabling 2FA at the same moment they save an analytics
view loses their view, or loses their 2FA secret. This is a security-relevant
failure, not just a UX one.

Mitigation, and it is cheap: do the read-modify-write inside a
`prisma.$transaction` with a `where: { id, updatedAt }` guard, and retry on miss.
Or simpler and sufficient for the volume involved: a serialised per-user promise
chain in the service layer. **Decide this before T6.1**, not during it.

### 2.2 Week start (A8) — no longer (verify). Confirmed broken and reachable.

`lib/period-range.ts:146-147` hardcodes `startOfWeek(wall, { weekStartsOn: 1 })`.
`UserSettings.weekStartsOn` exists (`schema.prisma:624`), is in the settings Zod
schema (`settings.schema.ts:17`, `z.number().int().min(0).max(6)`), so a user **can**
set `0`. Nothing passes it into `getPeriodRange`. The file's own header says
"weeks start on Monday".

Affects `/analytics`, `/recap`, `/reports`. Proceed with T2.3 as written.

### 2.3 Compute-on-demand scoring — feasible, already exposed

`ScoringService.recalculateDate(userId, date)` (`scoring.service.ts:300`), already
called by `GET /api/scores/daily:74`, `GET /api/score`, `GET /api/score/[date]`.
`ScoreRepository` also has `countActiveDays`, `findActiveDayDates`,
`getAverageScore`, and (added in Phase 1) `findLatestDate`.

A "compute now" affordance on the freshness chip needs no new capability.

### 2.4 Reuse candidates — all 11 exist

`ContributionHeatmap`, `GoalsVelocity`, `DayTypePerformance`, `LifeBalanceRadar`,
`lib/dashboard/contributions.ts`, `lib/wellness/correlations.ts`, `useKeyboard`,
`DateRangePicker`, `Drawer`, `Modal`, `emails/weekly-summary.tsx`. All present.

Existence only — **suitability is still unverified.** They were written for
`/dashboard`, whose data shapes come from `DashboardOverviewService`, not from
`AnalyticsService`. Assuming `ContributionHeatmap` accepts analytics data without
reading it is exactly the error this gate exists to catch.

### 2.5 Drill-down routes (T3.3) — all 7 exist

`/today`, `/habits/[id]`, `/routine`, `/journal/[date]`, `/recap`, `/calendar`,
`/focus`. No route needs inventing.

### 2.6 Indexes (§3.4) — cannot be verified here

Requires a live database, and `DATABASE_URL` points at remote Neon. Blocked behind
hard gate 2. Treat the index list as unconfirmed.

---

## 3. Plan premises that are false — fix before building

### 3.1 A2 / T1.3 / §5.2 "bounded reads" — already done. Delete the item.

All four named reads already honour their range, and the fourth is never called.

| Plan claim | Reality |
|---|---|
| `timeEntry` unbounded | `time-entry.repository.ts:199-208` — `from`/`to` → `where.startTime.gte/lte` |
| `nutrition` unbounded | `nutrition.repository.ts:96-103` — `startDate`/`endDate` → `where.date.gte/lte` |
| `healthMetric` unbounded | `health-metric.repository.ts:58-66` — same pattern |
| `goal.findAll` unbounded | **Never called by this endpoint.** `analytics.service.ts` calls `findCompletedMilestones(userId, rangeStart, rangeEnd)`, which is range-scoped |

T1.3's regression test ("proving unchanged results for a known fixture period")
would pass trivially and prove nothing.

### 3.2 D3 "insights are pure functions over already-loaded data" — will not work

This is the most consequential error, because it is a design constraint rather
than a fact, and building to it wastes Phase 2.

The insight rules in §5.3 need data the dashboard does not load:

| Rule | Needs | Dashboard loads? |
|---|---|---|
| Best weekday | 4 weeks of `DailyScore` | no — one period |
| Slipping habit | **3 comparison periods** | no — one comparison |
| Sleep and score drift | trailing 14 d + prior 14 d | no |
| Anomaly | trailing 28-day mean | no |

`AnalyticsService.getDashboard` loads exactly one period plus (day/week only) one
comparison. Four of the eight rules need a **bounded trailing read** the service
does not perform.

D3 has to become: *"pure functions over a purpose-built, range-bounded input the
service assembles"* — the pure/impure split still holds and the rules stay
testable, but there is a real read to add. Budget for it.

Corollary: "best weekday" and "sleep and score drift" are inherently
multi-period. On a `day` tab they are either suppressed or they silently widen the
query. Pick one deliberately; the minimum-data thresholds in §5.3 do not currently
cover it.

### 3.3 AC-4 is wrong as written

> "A freshness chip appears only when days in range lack a score."

Taken literally, the chip appears on **today, every morning** — the default tab —
because the scoring cron runs at 01:00 and today's score does not exist until then.
It would also appear on every period predating the account, which will never be
computed.

Phase 1 gates it on the newest score falling **inside** the selected period, which
excludes both cases. AC-4 should read:

> "A freshness chip appears only when the period already contains at least one
> score and elapsed days within it have none."

### 3.4 T1.2 (§4.1 sections) is Phase 3 work, not Phase 1

The section/status split is `A9` in the inventory and `T3.1` in the task list, but
it is scheduled in Phase 1 as T1.2 and again in Phase 3. Schedule it once.

It is also the only genuinely breaking change in the plan. §4.1 promises "all
existing fields keep their names and meaning" and "/reports, /recap are untouched".
Those hold for an *additive* change, and `sections` defaults to `overview` — but
`comparison` becoming "present for every period with a `basis` field" is a
behaviour change. Checked: `/recap` does **not** consume `comparison`; it computes
its own `trend` inside `recap.service.ts` from `weeklySummary`. So AC-3 ("hero,
`/recap` and `/reports` show the same habit rate") is unaffected, and the promise
is safe as written. Worth stating explicitly because the plan asserts it without
having checked.

---

## 4. Already done — do not rebuild

Phase 1 of the previous plan covered most of what this plan calls Phase 1:

| This plan | Status |
|---|---|
| T1.1 strict validation | **Done.** `isCalendarDate` shared by route Zod, service `assertDate`/`assertPeriod`, and the URL hook. Throws → 400. |
| T1.4 freshness | **Done**, with the AC-4 correction in §3.3. |
| T1.5 error reporting | **Done.** Aborts and 401 excluded, 429 included. |
| T1.6 rate limit | **Done.** Per **user** (not IP), 30/min, `429` + `RateLimitError`. |
| T1.7 accessibility | **Done.** Ring `role="img"` + label; mood summary + figure table; `PeriodControl` roving `tabIndex` + arrows + `aria-controls`, with `role="tabpanel"` wired on `/analytics` **and** `/recap`; `motion-reduce:` guards. |
| T1.2 sections | **Not started.** See §3.4. |
| T1.3 bounded reads | **Not needed.** See §3.1. |

Also already fixed, from the same pass, and worth carrying into the release notes
because they change numbers a user can see:

- `PeriodChart` no longer coerces a `null` gap to `0` (`PeriodChart.tsx:131`), so
  the table, the sr-only summary and the tooltip finally agree.
- `hero.core/growth/bonus` are populated for **month and year**; they were
  permanently `null`.
- `hero.daysScored` is the real count. A week used to claim `7` and a month `1`
  regardless of what was scored, and it is what the "out of N days" phrasing is
  built from.
- `MoodPulseCard` no longer labels a month of data "today".

---

## 5. Standing risk: concurrent edits

The working tree has **~350 modified files** and **~20 untracked**, all
uncommitted — an in-flight Focus rewrite (`src/components/focus/*`,
`src/lib/focus/metrics.ts`, `tests/lib/focus-*.test.ts`). Files appeared *during*
this verification (see §1).

Phase 4 (Explorer) and Phase 5 will touch focus statistics, which is exactly where
that work is landing. The plan's own §12 mitigation — "avoid focus files" — is not
achievable for T4.1's `focusMinutes` metric. Sequence Phase 4 after the Focus
rewrite merges, or accept the conflict deliberately.

---

## 6. Recommended Phase 2 order

The plan lists T2.1–T2.7. Two changes:

1. **Do T2.3 (week start) first and alone.** It is the only item that can change
   historical numbers for existing users on four surfaces. It wants its own commit
   and its own regression tests, not to be interleaved with six UI tasks. The plan
   lists it third; it should be first.
2. **Resolve §3.2 before T2.4.** The insight engine's input contract determines
   whether the service needs new reads. Building the rules first against a
   "already-loaded data" assumption guarantees a rewrite.

Everything else (T2.1, T2.2, T2.5–T2.7) is additive UI work with no cross-surface
risk and can proceed in any order.
