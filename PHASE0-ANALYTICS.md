# Phase 0 — Verified State: `/analytics`

Date: 2026-10-04. Scope: verification only, no feature code.
Method: every claim in the upgrade plan checked against source, not against the audit.

## 0. Baseline

| Check | Command | Result |
|---|---|---|
| Types | `npm run type-check` | **clean**, 0 errors |
| Lint | `npm run lint` | **0 errors, 209 warnings** |
| Tests | `npm test` | **724 passed / 724**, 30 files, 4.53s |

Analytics-specific tests, both present:

| File | Tests |
|---|---|
| `tests/lib/analytics-format.test.ts` | 11 |
| `tests/lib/analytics-period-habits.test.ts` | 23 |
| **Total** | **34** |

The audit's "34 tests" claim is **confirmed**. There are **no** tests for
`AnalyticsService`, the dashboard route, `usePeriodUrlState`, or any component.

### Working tree is mid-rewrite — read this first

`git status` shows **~350 modified files** and **17 untracked new files**: an
in-flight Focus runtime rewrite (`src/components/focus/*`, `src/lib/focus/metrics.ts`,
six new `tests/lib/focus-*.test.ts`). All of it uncommitted.

Consequences for this plan:
- Plan item D.16 / K / Phase 5 ("align focus numbers with `/focus`") is **further
  along than the plan assumes** — the shared counting rule and metrics layer already
  exist and are green.
- Any analytics work started now will touch files the Focus rewrite also touches
  (`focus.repository.ts`, `analytics.service.ts`, `globals.css`). Sequence it.

### Two repo-doc claims are themselves stale

- `AGENTS.md` says `.md` files are gitignored. They are not — `git check-ignore`
  returns nothing for a root `.md` file, and `page md/*.md` is tracked. This note
  therefore **will** appear in `git status`.
- `AGENTS.md` says `generate-insights` is a stub returning `generated: 0`. It is not
  a stub. See W-2.

---

## 1. Verdicts — plan is correct

| Claim | Verdict | Evidence |
|---|---|---|
| F26 one failing read blanks all 15 cards | **CONFIRMED** | `analytics.service.ts:199-220`, single `Promise.all` over 21 promises |
| F16 fetch failures bypass `ErrorReporter` | **CONFIRMED** | `api-client.ts` never imports the reporter; `usePeriodUrlState.ts:124-130` only sets a string |
| No rate limit on the heaviest endpoint | **CONFIRMED** | 0 rate-limit refs across all 5 `api/analytics/*` routes. Precedent exists: `RateLimiter` from `lib/middleware/rate-limit`, used by `api/users/[id]` and `api/users/[id]/profile` |
| F21 `InsightRepository.dismiss` unscoped, zero callers | **CONFIRMED** | `insight.repository.ts:77-81` — `delete({ where: { id } })`, no `userId`. Repo-wide grep: no importers |
| F23 `AICalloutCard` uses raw `fetch` | **CONFIRMED** | `AICalloutCard.tsx:38` |
| F29 `stat-tile` imported by two specifiers | **CONFIRMED** | `analytics/FocusSummaryCard.tsx:4` uses `@/components/recap/stat-tile`; `recap/*` use `./stat-tile` |
| F29 barrel cost | **CONFIRMED** | `components/ui/index.tsx` re-exports **26** modules incl. `RichTextEditor`; `page.tsx:20` imports `Spinner` from it |
| F35 five dead chart components | **CONFIRMED** | `Gauge`, `Histogram`, `PieChart`, `SparkLine`, `TreeMap` — zero importers |
| F46 no reduced-motion guard | **CONFIRMED, precisely** | `globals.css` has 9 blocks but all are **class-scoped** to named animations. No blanket rule. So `page.tsx:208` `transition-opacity duration-200` and `page.tsx:195` `animate-spin` are both unguarded |
| ARIA tabs with no panels / arrow keys | **CONFIRMED** | `PeriodControl.tsx:88-111` — `role="tablist"`, `role="tab"`, `aria-selected`, but no `id`, no `aria-controls`, no `tabpanel`, no `tabIndex` roving, no key handler |
| Hero ring has no accessible label | **CONFIRMED** | `page.tsx:231-247` — ring divs are `aria-hidden`, the number `<span>` carries no label and no visually-hidden text |
| `MoodPulseCard` has no text alternative | **CONFIRMED** | no `sr-only` summary, no data table, `ariaLabel` only |
| All 12 detail datasets fetched while collapsed | **CONFIRMED** | `page.tsx:439` gates **render** only; the service loads everything unconditionally |
| No drill-down anywhere on the page | **CONFIRMED** | no `Link` in `page.tsx` except none; sub-tiles (`page.tsx:288`) and tiles (`page.tsx:489`) are `<div>` |
| Month/year have no comparison | **CONFIRMED** | `buildComparison` returns `null` for anything but day/week — `analytics.service.ts:689` |
| Freshness is invisible and scores can lag | **CONFIRMED** | `compute-daily-scores.ts:50` `DEFAULT_MAX_SCORES = 200`, 90-day lookback, nightly. >200 outstanding never catches up |
| First load is a bare spinner, not a skeleton | **CONFIRMED** | `page.tsx:140-146` |
| Focus numbers use the pre-Focus-rewrite definition | **CONFIRMED** | `buildFocusSummary` counts `listBreaks` separately and uses raw `getStats` totals |

### Verify items resolved

- **(verify) week start** — **CONFIRMED BROKEN, and user-reachable.**
  `period-range.ts:146-147` hardcodes `startOfWeek(wall, { weekStartsOn: 1 })`.
  `UserSettings.weekStartsOn Int @default(1)` exists (`schema.prisma:624`), is in
  `settings.schema.ts:17` (`z.number().int().min(0).max(6)`), so a user **can** set it
  to `0`. Nothing passes it into `getPeriodRange`. The file's own header comment says
  "weeks start on Monday". A Sunday-start user gets the wrong week on `/analytics`,
  `/recap` and `/reports`.
- **(verify) compute-on-demand scoring** — **FEASIBLE, and already exposed.**
  `ScoringService.recalculateDate(userId, date)` exists (`scoring.service.ts:300`)
  and `GET /api/scores/daily:74` already calls it for today. The freshness chip's
  "Compute now" needs no new capability. `ScoreRepository` also already has
  `countActiveDays` / `findActiveDayDates` / `getAverageScore`, so a latest-scored-date
  read is cheap.
- **(verify) the two analytics test files** — both exist, 34 tests. Confirmed.
- **(verify) every path in section N** — all exist, with three corrections in W-6.

---

## 2. Verdicts — the plan is wrong

These are not judgement calls. Each is a factual error in the plan.

### W-1 — F11 / P0-7 / AC-7 are already satisfied. Do not do this work.

The plan says four reads are unbounded and proposes bounding them. **All four already
honour their range**, and one is never called.

| Plan claim | Reality |
|---|---|
| `timeEntry` unbounded | `time-entry.repository.ts:199-208` — `list()` maps `from`/`to` to `where.startTime.gte/lte` |
| `nutrition` unbounded | `nutrition.repository.ts:96-103` — `findAll()` maps `startDate`/`endDate` to `where.date.gte/lte` |
| `healthMetric` unbounded | `health-metric.repository.ts:58-66` — same pattern |
| `goal.findAll` unbounded | **`goal.findAll` is never called by this endpoint.** `analytics.service.ts:212` calls `findCompletedMilestones(userId, rangeStart, rangeEnd)`, which is range-scoped |

**P0 item 7 should be deleted.** Acceptance criterion 7 is already met. If it is
"verified" as written it will pass trivially and teach nobody anything.

### W-2 — F7 / D.15 rest on a false premise. The cron is real.

`scripts/generate-insights.ts` is fully implemented: `DEFAULT_MAX_USERS = 25`,
7-day window, calls `insightGenerationService.generate` + `patternService`, returns
`{ ok, generated, cached, usersScanned, deferred, patternsUpdated, errors }`, and its
own header says it *used to* be the `{ generated: 0 }` stub. It is **scheduled** in
`vercel.json` at `0 2 * * 0`. `POST /api/insights/generate` also exists.

So "build or remove" is the wrong question, and removing the card would delete a
working feature. See §4 for the real question.

### W-3 — F24 is false. Dismissal is already persisted; it is a *hard delete*.

The plan says dismissal is client-state only and offers to "persist it server-side".
It already is: `AICalloutCard.tsx:38` DELETEs, the route calls
`AnalyticsService.dismissInsight`, which calls `InsightRepository.deleteOwned(userId, id)`.

Three things are wrong here instead, and none is the plan's concern:
1. It is a **`deleteMany`**, not a dismissal. There is no `dismissedAt` on `AIInsight`.
   "Dismiss" permanently destroys the row, so the next cron run regenerates it and the
   user dismisses the same insight forever.
2. `deleteOwned`'s return value is **discarded** (`analytics.service.ts:112`). A
   non-existent id, or another user's id, returns `{ success: true }` with 200. Not a
   data leak — `userId` is in the `where` — but it is a silent-success oracle.
3. `dismissInsight` is wedged between two private field declarations
   (`analytics.service.ts:107-113`, with `private routineRepository` on line 114).
   Valid TypeScript, but it is why the class reads oddly.

### W-4 — F5 is overstated, and the real bug is different and worse.

The route already rejects an invalid `period`: `dashboardQuerySchema` uses
`z.enum(['day','week','month','year'])` and returns **400** (`route.ts:8,30-35`). The
service's silent `isPeriod(query.period) ? … : 'day'` fallback is only reachable by a
direct service caller. So AC-1 is half-written already.

The live defect the audit missed: **`date` is regex-validated, not date-validated.**
`route.ts:9` and `analytics.service.ts:75` both use `/^\d{4}-\d{2}-\d{2}$/`. So
`?period=day&date=2026-13-45` passes, reaches
`fromZonedTime('2026-13-45T00:00:00', tz)` → `Invalid Date`, and then
`differenceInCalendarDays(parseISO(...))` returns `NaN`, which propagates into
`daysInRange` and every average derived from it. The client cannot trigger it
(`usePeriodUrlState` uses the same regex, and strips what it rejects), so it is an
API-only correctness hole — but it is a *silent NaN*, not a silent `day`.

### W-5 — F27 is overstated. `size` mostly works.

`PeriodControl.tsx:56-61`: `tabSize`, `navSize`, `labelClass`, `todayClass` all branch
on `size`. Only `arrowClass` is dead — `size === 'sm' ? 'h-4 w-4' : 'h-4 w-4'`,
identical branches. That is a lint-level no-op ternary, not a dead prop. Rename the
finding; do not "fix the size prop".

### W-6 — Component paths and counts in section N are off.

Three of the twelve detail cards are **not** in `components/analytics/`:

| Card | Actual location |
|---|---|
| `MilestoneHitsCard` | `src/components/recap/` |
| `NutritionHealthCard` | `src/components/recap/` |
| `JournalCard` | `src/components/recap/` |

They are shared with `/recap`. Any edit has double blast radius, and the "delete when
safe" list in section N would break `/recap` if followed literally.

`AppContext` is at `src/context/AppContext.tsx` (singular), not `src/contexts/`.

### W-7 — `hero.core/growth/bonus` are still `null` for month and year.

`analytics.service.ts:449-457` carries a comment saying these "used to be populated
for a day and a week and left `null` for a month and a year" and that the fix was to
average the same columns the period modules already load. **The code below that comment
still returns `core: null, growth: null, bonus: null` for month
(`analytics.service.ts:486-489`) and for year (`analytics.service.ts:494-497`).**

The comment describes a fix that was not made. The audit read the comment.

### W-8 — `daysScored` is wrong for week and month.

`buildScoreAverage` is documented as feeding "out of N days" phrasing, and gets N wrong:

- week: `daysScored: week.scores.average > 0 ? 7 : 0` (`analytics.service.ts:480`) —
  hardcodes 7 regardless of how many days were actually scored.
- month: `daysScored: month.scores.average > 0 ? 1 : 0` (`:488`) — reports **one** day
  scored for an entire month.

Year is correct (`year.totalDaysScored`). This needs the real scored-day count, which
the period modules already load.

---

## 3. Findings the audit missed

### M-1 — `PeriodChart` defeats its own documented fix. One line.

`PeriodChart.tsx:15-19` explains exactly why `null` must not become `0`:

> A gap became a zero. … Coercing that to `0` draws a bar at the floor, which reads as
> "you scored zero". It drew a full year of zeroes for anyone whose year had barely started.

Then `PeriodChart.tsx:131` does the coercion:

```
data={data.map((point) => ({ ...point, value: point.value ?? 0 }))}
```

`BarChart` does no null handling of its own — it passes `data` straight to recharts
(`BarChart.tsx:120`). The `measured.length === 0` guard on `:87` only catches the
all-null case.

Practical symptom for mixed data (e.g. a habit never due inside a month, or an
un-reached month on the year chart): the **table says "No data"** (`:170`, correct),
the **sr-only summary says "N entries have no data"** (`:69`, correct), and the
**tooltip says `0%`**. The keyboard/screen-reader path tells the truth and the
sighted-hover path lies. Recharts renders `null` as a genuine gap, so the fix is to
pass `point.value` through unchanged.

Highest value-per-character change in the whole plan.

### M-2 — Tasks and projects are all-time, not period-scoped.

`analytics.service.ts:206-207`:

```
this.taskRepository.findAll(userId, { status: ['TODO','IN_PROGRESS','WAITING'] }),
this.projectRepository.findAll(userId, { status: ['PLANNING','ACTIVE','ON_HOLD'] }),
```

No date bound. In a report whose every other figure is scoped to the selected range,
`TaskQuadrantCard` and `ProjectProgressList` render **byte-identical data on the day,
week, month and year tabs**, with no signal that they are not period figures.

This is arguably intentional (a quadrant is "right now"), but it is undocumented and
undated in the UI, which makes it an honesty problem rather than a performance one.
The audit classified this as a cost issue; it is a labelling issue. Either scope them,
or label them "right now" the way the streak card already is (`page.tsx:379` tags it
"All time" — the precedent exists in this very file).

### M-3 — `/recap` and `/analytics` do not share a code path for the same metric.

`recap.service.ts:520,544,561,578` call the period modules with **3 of 5 arguments**:

```
dailyBreakdown(userId, anchor, timezone)              // no userToday, no periodHabits
weeklySummary(userId, range.start, timezone)          // ditto
monthlySummary(userId, month, timezone)               // ditto
yearlySummary(userId, year, timezone)                 // ditto
```

`analytics.service.ts:230-240` passes all five. So the **definition** is genuinely
shared (both go through `lib/analytics/period-habits`), which is the important part and
the audit was right about it — but the optional params that clip to today and inject
the shared model are **not** applied on the `/recap` path. Any change to those params
moves `/analytics` and `/recap` apart silently.

This is the concrete mechanism behind the plan's `types/recap.ts` drift worry, and it is
a stronger argument for that worry than the type mirror is.

### M-4 — Both charts point `aria-describedby` at an element that usually does not exist.

`PeriodChart.tsx:136` passes `ariaDescribedBy={tableId}`, and `BarChart.tsx:117`
renders `aria-describedby={ariaDescribedBy}`. But the table is inside
`{showTable && …}` (`:145`). Collapsed — the default — the id resolves to nothing. The
sr-only summary on `:127` is the real text alternative and it is always present, so
this is cosmetic rather than harmful; but the `ariaDescribedBy` prop is currently
inert in its default state.

### M-5 — `scripts/generate-insights.ts` bypasses the repository layer.

It imports `prisma` from `@/lib/prisma` directly and calls
`prisma.user.findMany` (`:68`). `FILE.MD` says repositories are the only DB access
layer. `scripts/compute-daily-scores.ts` does the same (`:79, :118`). Pre-existing,
out of `/analytics` scope, but it means W-2's fix has no repository to go through.

### M-6 — `usePeriodUrlState.label` is computed on every load and never used.

`usePeriodUrlState.ts:190-193` builds `label` from a `useMemo` whose dep is `data`, so
`getPeriodRange` re-runs on every successful load. `page.tsx:109-114` destructures nine
of the ten returned fields and **not** `label` — the page uses `range.label` from the
server response instead. Dead work per load, and dead public API surface.

### M-7 — `MoodPulseCard` is captioned "today" and is not.

`MoodPulseCard.tsx:57`: `ariaLabel="Mood and energy today"`. The `moodPulse` array is
built from `getMoodRange(userId, rangeStart, rangeEnd)` (`analytics.service.ts:208`) —
the whole selected period. On the month tab this is a month of points in a 140px-tall
chart labelled "today". The `buildMoodPulse` cap is 300 points
(`analytics.service.ts:72`), so a year renders 300 unlabelled points.

---

## 4. Decision on D.15 — the insight card

**Recommendation: keep the card. The decision is not "build or remove" — it is "why is
it empty".** Removing it would delete a feature that is implemented, scheduled and
wired.

The pipeline is: `vercel.json` `0 2 * * 0` → `api/cron/generate-insights` →
`authorizeCron` → `scripts/generate-insights.ts` → `insightGenerationService.generate`
→ `AIInsight` row → `InsightRepository.findLatestByUser` → `pickInsight`
(`analytics.service.ts:1011`) → `page.tsx:465`.

Five candidate breakpoints, in the order I would check them:

1. **`CRON_SECRET` not set in production.** `authorizeCron` will reject every call and
   the route returns 403 forever. This is the single most likely cause and costs one
   env check.
2. **The 25-user cap never catches up.** `DEFAULT_MAX_USERS = 25`, ordered by
   `createdAt asc`, with a `deferred` counter. Any user beyond the first 25 is starved
   permanently — each run re-scans the *same* first 25. On a live multi-user database
   most users have never had an insight generated.
3. **`pickInsight` skips placeholder rows.** `:1014` rejects `summary.trim() === ''`
   and `summary === 'RECORDED'`. If the generator writes `'RECORDED'` placeholders,
   the card is empty by design.
4. **`insightGenerationService.generate` data thresholds** — may legitimately decline
   to write when there is not enough signal.
5. **`findLatestByUser(userId, 5)`** takes the 5 newest by `generatedAt`. If those 5
   are all placeholders, the card is empty even though older real insights exist.

Items 2, 3 and 5 are all real and all cheap to check. **None of them is fixed by
writing the feature, because the feature is written.**

Unconditionally, either way:
- Delete `InsightRepository.dismiss` (`insight.repository.ts:77-81`) — unscoped and
  unreferenced. Confirmed dead.
- Change `deleteOwned` to a real dismissal or check its `count` and 404 on zero.
  A "Dismiss" button that permanently deletes the row means the weekly cron
  regenerates the identical insight and the user dismisses it again next week.

---

## 5. Revised P0 list

Ordered by value per unit of risk. W-1 removed entirely.

| # | Item | Change from plan |
|---|---|---|
| 1 | **M-1** — stop coercing `null` to `0` in `PeriodChart` | **New. One line.** Highest value in the document. |
| 2 | **W-4** — validate `date` as a real calendar date, not a regex | Replaces F5. AC-1 needs rewriting: the `period` half already returns 400. |
| 3 | **W-8** — fix `daysScored` for week and month | **New.** Wrong numbers today, not a missing feature. |
| 4 | **W-7** — populate `hero.core/growth/bonus` for month and year, or delete the comment claiming it is done | **New.** Two tabs currently show three permanent dashes. |
| 5 | P0-1 — per-widget failure isolation | Unchanged. Still the largest resilience gap. |
| 6 | P0-3 — freshness indicator, with "Compute now" | Unchanged, and now confirmed cheap: `recalculateDate` + `countActiveDays` both exist. |
| 7 | P0-5 — accessibility fixes | Unchanged. Add M-4 and M-7 to scope. |
| 8 | P0-6 — rate limit the dashboard route | Unchanged. Copy the `RateLimiter` pattern from `api/users/[id]`. |
| 9 | P0-4 — report fetch failures via `ErrorReporter` | Unchanged. Exclude aborts (already distinguishable — `api-client.ts:100`) and 401s. |
| 10 | Week start from `UserSettings.weekStartsOn` | Unchanged, now **confirmed broken and user-reachable**. Needs regression tests on all four consumers. |
| 11 | **W-3** — make dismissal a dismissal | **New, replaces the plan's F24 item.** |
| — | ~~P0-7 bound the four unbounded reads~~ | **Deleted. Already done (W-1).** |

Two structural notes for Phase 2:

- `/recap` calls the period modules with 3 of 5 args (M-3). The plan's compatibility
  rule ("any change to a module's output must keep the old fields or update all four
  consumers") should be tightened to: *align `recap.service.ts` to pass all five
  arguments first*, before any module change. Otherwise every module edit carries a
  silent divergence risk.
- Three of the twelve cards are shared with `/recap` (W-6). Any grouping or
  restyling in Phase 4 changes `/recap` too. Decide whether to fork them or restyle
  both deliberately.

---

## 6. Phase 0 checklist status

- [x] Every path in section N confirmed (3 corrections, W-6)
- [x] 34 analytics tests confirmed, both files
- [x] Week start: **confirmed broken, user-reachable**
- [x] Compute-on-demand scoring: **feasible, already exposed at `api/scores/daily`**
- [x] Baseline recorded: types clean, lint 0/209, tests 724/724
- [x] D.15 decided: **keep the card; debug the pipeline** (§4)
- [ ] **Not yet done:** the five §4 breakpoints need a production `CRON_SECRET` check
      and a look at live `AIInsight` rows. Both need environment access this phase did
      not have.
- [ ] **Not yet done:** AC-6 (query count flat at 3 vs 60 habits) needs a seeded
      database. `npm test` is pure-unit with no DB.
