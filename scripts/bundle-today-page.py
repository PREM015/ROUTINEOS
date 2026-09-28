#!/usr/bin/env python3
"""
bundle-today-page.py

Concatenates every file that renders or feeds the /today page into a single
`todaypage.py` so it can be handed to a frontend-only AI for a UI redesign
without giving it the whole repository.

Why this exists
---------------
`/today` is composed from 12 files that do not live in one folder, plus an app
shell, a theme file, 13 shared UI primitives, hooks, stores and 25 API routes.
Handing over `src/components/today/` alone makes the receiving AI guess at:

  * the 4 /today components that live OUTSIDE that folder
    (StreakCard, SleepQualityMeter, DayContextSelector, AddHabitModal)
  * the API response shapes (the `{ success, data }` envelope)
  * which files are safe to edit vs. shared and therefore dangerous
  * the server/client boundary rules

This script emits all of that with a manifest, per-file metadata, a data
contract section, and explicit DO-NOT-EDIT warnings.

Usage
-----
    python scripts/bundle-today-page.py                 # default: full context
    python scripts/bundle-today-page.py --tier core     # only the editable set
    python scripts/bundle-today-page.py --out todaypage.py
    python scripts/bundle-today-page.py --include-recent  # + files changed today

Tiers
-----
    core  Page entry + the 7 today components + the 4 external /today
          components + the 13 shared primitives they import. This is the set a
          redesign actually edits.
    full  core, plus the app shell, providers, hooks, stores, lib helpers,
          theme CSS and every API route /today calls. Larger, but the receiving
          AI can then respect real contracts instead of inventing them.

Stdlib only. No third-party dependencies.
"""

from __future__ import annotations

import argparse
import datetime as _dt
import os
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent

# --------------------------------------------------------------------------
# Manifest
#
# tier:      "core" files are the editable surface. "full" files are context.
# role:      what the file does, injected into the bundle so the receiving AI
#            does not have to infer it.
# caution:   rendered as a warning above the file. "SHARED" means editing it
#            changes pages other than /today.
# --------------------------------------------------------------------------

MANIFEST: list[tuple[str, str, str, str, str]] = [
    # tier, path, role, caution, note
    (
        "core",
        "src/app/(dashboard)/today/page.tsx",
        "The /today page. Server component (async RSC).",
        "CORE",
        "Composes all 8 cards. Calls auth(), userService.getTimezone(), "
        "getTodayString(tz) and RoutineService.getRoutineForDate(). "
        "Passes only serialisable props (date: string, resolvedDayType: string) "
        "to client children. CANNOT pass callbacks from here - interactive parts "
        "must be 'use client'.",
    ),

    # --- the 7 components in src/components/today/ ---
    (
        "core",
        "src/components/today/TodayDayType.tsx",
        "Day-type card: shows today's day type + lets the user change it.",
        "CORE",
        "Calls GET /api/day-mode?date=, POST /api/day-mode, "
        "GET /api/day-types?active=true. Accepts an optional className prop.",
    ),
    (
        "core",
        "src/components/today/TodayScore.tsx",
        "Today's score card (0-100 + letter grade).",
        "CORE",
        "Calls GET /api/score/{date}. Reads data.totalScore and "
        "data.overallGrade. Note: grade colours are inline hex from "
        "src/types/score.ts, which fails dark-mode contrast - a known issue "
        "worth fixing in a redesign.",
    ),
    (
        "core",
        "src/components/today/TodayGoals.tsx",
        "Today's goals card.",
        "CORE",
        "Calls GET /api/goals/today?date=. Uses calendarDaysBetween() for the "
        "days-remaining label. getPriorityColor() has one missing dark: "
        "variant (pink).",
    ),
    (
        "core",
        "src/components/today/TodaySleep.tsx",
        "Sleep card: active timer, bedtime prompt, log form, quality summary.",
        "CORE",
        "Biggest file (~495 lines). Owns 5 inline sub-components. State and all "
        "mutations come from the useSleepSession hook - do not re-implement. "
        "Calls GET /api/sleep/session, POST .../start, .../stop, .../respond, "
        "and POST /api/sleep for manual logging.",
    ),
    (
        "core",
        "src/components/today/TodayHabitChecklist.tsx",
        "Today's habit checklist - the main interactive card.",
        "CORE",
        "Largest file (~502 lines). Calls GET /api/habits/today?date=, "
        "GET /api/habits?status=ACTIVE&limit=100, POST /api/habits/{id}/log, "
        "POST /api/habits/{id}/skip, POST /api/habits/today (ADD/REMOVE), "
        "PUT /api/habits/{id}. Fires runAchievementCheck() on COMPLETED. "
        "Known issue: a fixed w-80 popover overflows 320px phones.",
    ),
    (
        "core",
        "src/components/today/CurrentRoutineBlock.tsx",
        "The currently-running routine block with a progress bar.",
        "CORE",
        "Calls GET /api/routine/today and re-polls every 60s plus on a "
        "'day-mode-changed' event. Progress maths lives in "
        "src/lib/routine/duration.ts.",
    ),
    (
        "core",
        "src/components/today/DailyReflection.tsx",
        "Daily reflection: gratitude, priorities, mood/energy/stress sliders.",
        "CORE",
        "Calls GET /api/reflections?date= and POST /api/reflections. "
        "Known issue: grid-cols-4 at all widths overflows narrow phones.",
    ),

    # --- 4 /today components that live OUTSIDE src/components/today/ ---
    (
        "core",
        "src/components/streak/StreakCard.tsx",
        "Streak card (current / longest / total days + next milestone).",
        "CORE",
        "IMPORTANT: lives in components/streak/, not components/today/. "
        "Only /today imports it today, so it is safe to edit. "
        "Calls GET /api/streak. Known issue: text-orange-600 has no dark: "
        "variant.",
    ),
    (
        "core",
        "src/components/sleep/SleepQualityMeter.tsx",
        "Sleep quality meter (0-100 bar + labelled band).",
        "CORE",
        "IMPORTANT: lives in components/sleep/, and is ALSO rendered by "
        "SleepCard.tsx. It already exposes `compact` and `className` props - "
        "use them rather than forking it. Known issue: the raw SleepLog row "
        "from /api/sleep/session only has a partial shape; see the contract.",
    ),
    (
        "core",
        "src/components/context/DayContextSelector.tsx",
        "The grid of selectable day types.",
        "CORE",
        "IMPORTANT: lives in components/context/ and is documented as a "
        "general routine control, so it is also reachable from /routine "
        "settings. Changing its look can affect /routine.",
    ),
    (
        "core",
        "src/components/habits/AddHabitModal.tsx",
        "Create-a-habit modal, opened from the habit checklist.",
        "SHARED - ALSO ON /habits",
        "IMPORTANT: rendered by BOTH /today and /habits. Restyling it changes "
        "two pages. Prefer passing className/props over editing its body. "
        "Contains a hand-rolled textarea that duplicates the Textarea "
        "primitive, and raw hex colour swatches for the user's habit colour.",
    ),

    # --- 13 shared primitives ---
    ("core", "src/components/ui/Card.tsx", "Card surface primitive.", "SHARED (54 import sites)", "Do not fork. Edit once, all pages follow."),
    ("core", "src/components/ui/Button.tsx", "Button primitive.", "SHARED (66 import sites)", "Do not fork. Has an `isLoading` prop. Known issue: the `success` variant hardcodes text-white, which fails in dark mode."),
    ("core", "src/components/ui/Skeleton.tsx", "Loading placeholder.", "SHARED (40 import sites)", "Has a `shine` shimmer variant."),
    ("core", "src/components/ui/Badge.tsx", "Badge pill primitive.", "SHARED (26 import sites)", "Colour variants are already dark-mode paired."),
    ("core", "src/components/ui/Input.tsx", "Labelled input.", "SHARED (21 import sites)", "Supports icon, error and helperText."),
    ("core", "src/components/ui/EmptyState.tsx", "Empty state.", "SHARED (8 import sites)", "Dashed border + icon chip. Used by TodayGoals and TodayHabitChecklist."),
    ("core", "src/components/ui/Progress.tsx", "Animated progress bar.", "SHARED (4 import sites)", "Uses framer-motion but has NO 'use client' - it only works because every consumer is a client component. Do not import it from a server component."),
    ("core", "src/components/ui/Checkbox.tsx", "Radix checkbox.", "SHARED", "Used by the habit checklist."),
    ("core", "src/components/ui/Popover.tsx", "Radix popover.", "ONLY /today - low risk", "Base width is w-72; the habit checklist overrides it to a fixed w-80, which overflows narrow phones."),
    ("core", "src/components/ui/Collapsible.tsx", "Radix collapsible.", "ONLY /today - low risk", "Used by the 'Change day type' disclosure."),
    ("core", "src/components/ui/Dialog.tsx", "Radix dialog.", "SHARED (6 import sites)", "Built on modal-frame.ts. Shares the overlay/grain/panel class contract with Modal.tsx."),
    ("core", "src/components/ui/Textarea.tsx", "Labelled textarea.", "SHARED (6 import sites)", "Used 9x by DailyReflection."),
    ("core", "src/components/ui/Slider.tsx", "Radix slider.", "ONLY /today - low risk", "Used 4x by DailyReflection."),
    ("core", "src/components/ui/modal-frame.ts", "Shared modal class contract (pure consts).", "SHARED", "OVERLAY_CLASS, GRAIN_CLASS, PANEL_CLASS, HEADER_CLASS, BODY_CLASS, FOOTER_CLASS. Keep Dialog and Modal in sync if you change it."),

    # --- app shell ---
    ("full", "src/app/layout.tsx", "Root layout. Wraps EVERY page.", "SHARED - do not edit for a /today redesign", "Owns ThemeProvider, AuthProvider, AppProvider, SWRegistration. Imports globals.css."),
    ("full", "src/app/(dashboard)/layout.tsx", "Dashboard layout. Wraps /today.", "SHARED - do not edit for a /today redesign", "Mounts Sidebar, Header, Footer, MobileNav, SkipLink, OfflineBanner, DataErrorBanner, SleepPromptHost, FloatingFocusBar, CelebrationHost. Note the pb-20 md:pb-8 on <main>: it exists solely to clear the fixed MobileNav."),
    ("full", "src/components/layout/Header.tsx", "Top bar. Contains the notification bell.", "SHARED - every page", "Also where the notification-centre UI (ERROR.md L1) must live."),
    ("full", "src/components/layout/Sidebar.tsx", "Desktop sidebar. Hidden below md.", "SHARED - every page", ""),
    ("full", "src/components/layout/MobileNav.tsx", "Fixed bottom nav. Hidden at md+.", "SHARED - every page", "Height is h-[calc(4rem+env(safe-area-inset-bottom))]; the dashboard layout's bottom padding compensates for it."),
    ("full", "src/components/layout/Footer.tsx", "Footer.", "SHARED - every page", ""),
    ("full", "src/components/layout/Navigation.tsx", "Nav item list with an animated active pill.", "SHARED", "Uses framer-motion layoutId=\"nav-active-pill\"."),
    ("full", "src/components/layout/ThemeToggle.tsx", "Light/dark switch.", "SHARED", "The `dark` class is owned exclusively by next-themes. Do not toggle it from a store or component."),
    ("full", "src/components/layout/Logo.tsx", "Logo.", "SHARED", ""),
    ("full", "src/components/layout/DataErrorBanner.tsx", "Fixed error banner.", "SHARED - every page", "Renders fixed inset-x-0 top-0 z-50, so it overlaps /today content when shown."),
    ("full", "src/components/offline/OfflineBanner.tsx", "Offline banner.", "SHARED", "Its Banner primitive is light-only (bg-blue-50 etc. with no dark: variant) - a real dark-mode bug."),
    ("full", "src/components/ui/Banner.tsx", "Banner primitive.", "SHARED", "Known dark-mode bug: all five tone variants are light-palette-only."),
    ("full", "src/components/ui/SkipLink.tsx", "Skip-to-content link.", "SHARED", ""),
    ("full", "src/components/shared/SleepPromptHost.tsx", "Global sleep prompt.", "SHARED", "Returns null when pathname === '/today' because TodaySleep renders its own prompt."),
    ("full", "src/components/focus/FloatingFocusBar.tsx", "Floating focus timer.", "SHARED - every page", "Visible on /today during a focus session. Fixed w-72 with no viewport clamp. Uses raw hex in MODE_META."),
    ("full", "src/components/achievements/CelebrationHost.tsx", "Achievement toast host.", "SHARED", ""),
    ("full", "src/components/achievements/AchievementPopup.tsx", "Achievement toast.", "SHARED - every page", "Known dark-mode bug: border-gray-200 bg-white and text-gray-900, so it renders as a white card in dark mode. Fixed w-80, no viewport clamp."),
    ("full", "src/app/(dashboard)/loading.tsx", "Route loading skeleton.", "SHARED", ""),
    ("full", "src/app/(dashboard)/error.tsx", "Route error boundary.", "SHARED", ""),

    # --- providers / hooks / stores ---
    ("full", "src/components/providers/ThemeProvider.tsx", "next-themes wrapper.", "SHARED", "Sole owner of the `dark` class (attribute=\"class\")."),
    ("full", "src/components/auth/AuthProvider.tsx", "next-auth SessionProvider + settings loader.", "SHARED", "Loads UserSettings into the zustand store on sign-in and resets on sign-out."),
    ("full", "src/context/AppContext.tsx", "Global data context (habits, routine, goals, dayMeta).", "SHARED", "Fires GET /api/habits?includeArchived=true&limit=100, /api/routine, /api/goals, /api/habits/logs?date=."),
    ("full", "src/hooks/useSleepSession.ts", "Sleep session state + mutations.", "SHARED", "Module-singleton store via useSyncExternalStore, ref-counted, 15s poll that pauses when the tab is hidden. Exports SleepLogView, SleepPromptView, SleepStateView. Do NOT re-implement this."),
    ("full", "src/hooks/useSettings.ts", "Reads the UserSettings store.", "SHARED", "The only sanctioned way to read settings."),
    ("full", "src/hooks/useUserTimezone.ts", "User's IANA timezone + today.", "SHARED", "Falls back browser zone, then UTC."),
    ("full", "src/store/settings.store.ts", "Zustand UserSettings store.", "SHARED", "applyAppearance() projects animationsEnabled/compactMode onto <html>."),
    ("full", "src/store/achievement.store.ts", "Achievement check queue.", "SHARED", "runAchievementCheck() is called after a habit is completed."),

    # --- lib / types / constants ---
    ("full", "src/lib/dates.ts", "Timezone-aware date helpers.", "SHARED - pure", "getTodayString(tz), calendarDaysBetween(from,to), nowForUser(tz), DEFAULT_TZ. There is NO src/lib/dates/ directory."),
    ("full", "src/lib/sleep/calculate-duration.ts", "Sleep duration + 0-100 score maths.", "SHARED - pure", "calculateSleepScore(actual, planned, quality, feltRested). Requires a planned window; returns null semantics when there is no target."),
    ("full", "src/lib/sleep/sleep-score.ts", "Sleep score bands.", "SHARED - pure", "getSleepScoreBand(score) and getQualityLabel(q). All classes are already dark-mode paired."),
    ("full", "src/lib/routine/duration.ts", "Current block + progress maths.", "SHARED - pure", "getCurrentBlock, calculateBlockProgress."),
    ("full", "src/lib/api-client.ts", "apiRequest / fetchWithAuth.", "SHARED - pure", "apiRequest only unwraps `.data` when envelope.success === true."),
    ("full", "src/lib/utils.ts", "cn() (clsx + tailwind-merge).", "SHARED - pure", ""),
    ("full", "src/lib/motion.ts", "Shared easing constants.", "SHARED - pure", "EASE."),
    ("full", "src/components/motion/Mount.tsx", "Scroll-in animation wrapper.", "SHARED - 9 uses on /today + 4 on /dashboard", "Tune the `delay` prop per instance. Do NOT change its defaults - that re-animates /dashboard."),
    ("full", "src/components/motion/useCountUp.ts", "Animated number counter.", "SHARED", "Used by TodayScore."),
    ("full", "src/types/score.ts", "ScoreGrade type + SCORE_GRADES colour map.", "SHARED - also /dashboard, /analytics", "SCORE_GRADES carries inline hex per grade; several fail dark-mode contrast."),
    ("full", "src/types/routine.ts", "DayTypeDefinition and routine types.", "SHARED", ""),
    ("full", "src/types/sleep.ts", "SleepLog / SleepFormData types.", "SHARED", ""),
    ("full", "src/constants/day-types.ts", "Canonical default day types.", "SHARED - single source of truth", "DEFAULT_DAY_TYPES, enumValueForSlug(). The user's real day types are DayTypeDefinition rows in the DB, not this list."),
    ("full", "src/constants/routine.ts", "DAY_TYPE_CONFIG (icon + label per enum).", "SHARED", ""),
    ("full", "src/constants/habit-tiers.ts", "HABIT_TIER_CONFIG.", "SHARED", ""),
    ("full", "src/constants/prisma-enums.ts", "Client-safe enum mirror.", "SHARED", "In client components import enums from HERE, never from @/generated/prisma (that is the Node client entry point and would leak into the browser bundle). `import type` from @/generated/prisma is fine - it is erased at compile time."),

    # --- theme ---
    ("full", "src/app/globals.css", "Theme tokens + custom utilities.", "SHARED - THE ONLY SHARED VISUAL FILE", "@theme inline maps --color-* to --*. :root and .dark hold the values. Utilities used by /today: .gradient-mesh-animated, .glass-panel, .shadow-soft, .glow-primary, .conic-gradient-ring, .fade-rise-in, .popover-in, .content-in, .overlay-glass, .noise-overlay, .light-sweep, .animate-shimmer. MUST stay valid UTF-8 - one bad byte breaks Turbopack."),

    # --- API routes ---
    ("full", "src/app/api/score/[date]/route.ts", "GET today's score.", "BACKEND - read only", "Returns { success: true, data }. Always recalculates for today; past dates are served as stored."),
    ("full", "src/app/api/streak/route.ts", "GET streak + milestones.", "BACKEND - read only", "Returns { success: true, data }."),
    ("full", "src/app/api/day-mode/route.ts", "GET/POST the day's mode + day type.", "BACKEND - read only", "POST body: { date, mode: 'DAY_TYPE'|'CLEAR', dayType, dayTypeId }."),
    ("full", "src/app/api/day-types/route.ts", "GET day type definitions.", "BACKEND - read only", "?active=true returns only the user's rows."),
    ("full", "src/app/api/routine/today/route.ts", "GET the routine for today.", "BACKEND - read only", ""),
    ("full", "src/app/api/habits/today/route.ts", "GET today's habit log; POST ADD/REMOVE.", "BACKEND - read only", ""),
    ("full", "src/app/api/habits/route.ts", "GET habit list.", "BACKEND - read only", "?status=ACTIVE&limit=100"),
    ("full", "src/app/api/habits/[id]/route.ts", "PUT rename a habit.", "BACKEND - read only", ""),
    ("full", "src/app/api/habits/[id]/log/route.ts", "POST log a habit for a date.", "BACKEND - read only", "Statuses: COMPLETED / SKIPPED / etc."),
    ("full", "src/app/api/habits/[id]/skip/route.ts", "POST skip a habit.", "BACKEND - read only", ""),
    ("full", "src/app/api/goals/today/route.ts", "GET goals due today.", "BACKEND - read only", ""),
    ("full", "src/app/api/reflections/route.ts", "GET/POST the daily reflection.", "BACKEND - read only", ""),
    ("full", "src/app/api/sleep/route.ts", "GET/POST a manual sleep log.", "BACKEND - read only", ""),
    ("full", "src/app/api/sleep/session/route.ts", "GET sleep state for today.", "BACKEND - read only", "Returns { timezone, active, prompt, todaySleepLog }. Polled every 15s."),
    ("full", "src/app/api/sleep/session/start/route.ts", "POST start tracking sleep.", "BACKEND - read only", ""),
    ("full", "src/app/api/sleep/session/stop/route.ts", "POST stop and write the log.", "BACKEND - read only", ""),
    ("full", "src/app/api/sleep/session/respond/route.ts", "POST answer the bedtime prompt.", "BACKEND - read only", "Actions: NOT_YET / START_NOW / DISMISS."),
    ("full", "src/app/api/settings/route.ts", "GET/PUT UserSettings.", "BACKEND - read only", "PUT is partial; unknown keys are silently stripped by the Zod schema."),
]

CONTRACT = r'''
================================================================================
DATA CONTRACT  -  what the /today UI reads and writes
================================================================================

ENVELOPE  (every route, per FILE.MD)
    success : { success: true, data: <payload> }
    error   : { error: string, details?: unknown }

    `apiRequest<T>()` only unwraps `.data` when `envelope.success === true`.
    A route returning a bare object makes `data.success` falsy and the caller
    silently renders nothing - that exact bug shipped once on /api/score.
    Never call apiRequest against a route that does not use the envelope.

ENDPOINTS CONSUMED BY /today
    GET    /api/score/{date}
           -> data: { totalScore: number|null, overallGrade: ScoreGrade|null,
                     coreScore, growthScore, bonusScore,
                     habitCompletionRate, routineCompletionRate, sleepScore }

    GET    /api/streak
           -> data: { currentStreak, longestStreak, totalCompletedDays,
                     lastCompletedDate, nextMilestone, milestones[] }

    GET    /api/day-mode?date={date}
           -> data: { dayType, dayTypeId, dayTypeName, hasException, ... }
    POST   /api/day-mode
           body { date, mode:'DAY_TYPE', dayType, dayTypeId }
           body { date, mode:'CLEAR' }

    GET    /api/day-types?active=true
           -> data: DayTypeDefinition[]  { id, name, slug, color, icon, ... }
           These DB rows are the ONLY legitimate source of day types. Do not
           hardcode a day-type list in a component.

    GET    /api/routine/today
           -> data: { blocks[], currentBlock, ... }

    GET    /api/habits/today?date={date}
           -> data: { habits[], logs[] }
    GET    /api/habits?status=ACTIVE&limit=100
    POST   /api/habits/{id}/log      body { date, status }
    POST   /api/habits/{id}/skip     body { date }
    POST   /api/habits/today         body { date, action:'ADD'|'REMOVE', habitId }
    PUT    /api/habits/{id}          body { name }

    GET    /api/goals/today?date={date}
    GET    /api/reflections?date={date}      -> data: reflection|null
    POST   /api/reflections                 body { date, gratitude, priorities,
                                                  mood, energy, stress, focus, note }

    GET    /api/sleep
    POST   /api/sleep                       body { date, actualBedtime,
                                                  actualWakeTime, quality(1-5),
                                                  feltRested, wakeUpCount, notes }
    GET    /api/sleep/session
           -> data: { timezone, active, prompt, todaySleepLog }
           Polled every 15s; the poll pauses while the tab is hidden.
    POST   /api/sleep/session/start | stop | respond

STATES EVERY CARD MUST HANDLE
    loading  (first fetch in flight)
    error    (fetch failed - the project convention is an inline error with a
              Retry, NOT a silent blank card; silent no-ops were a real bug)
    empty    (no data - must show an intentional empty state with a CTA, and
              must NOT render a 0 that reads as a real measurement)
    forbidden/auth-expired (401 -> the app signs the user out)

CLIENT / SERVER BOUNDARY RULES
    today/page.tsx is a SERVER component. It may pass only JSON-serialisable
    props: string, number, boolean, null, plain objects/arrays.
    It CANNOT pass a function (onClick, onChange) to any child.
    Any interactive part must be a separate file starting with 'use client'.
    All eight cards are already 'use client'.

STYLING RULES THAT MATTER
    1. No raw hex (#10b981). Use a theme token (bg-primary, text-muted-foreground)
       or `color-mix(in srgb, var(--primary) 12%, transparent)`. Raw hex is
       tuned for one theme and silently breaks the other - 153 such lines
       already exist in src/components.
    2. No `bg-white`, `text-gray-`, `bg-gray-50`. Use `bg-card`,
       `text-foreground`, `text-muted-foreground`, `border-border`.
    3. Never write `text-X-500` without its `dark:text-X-400` partner. Every
       missing dark: variant is a visible dark-mode bug - 312 such lines exist.
    4. Tokens available: background, foreground, card, card-foreground, muted,
       muted-foreground, border, primary, primary-foreground, destructive,
       destructive-foreground. Utilities: .glass-panel, .gradient-mesh-animated,
       .shadow-soft, .glow-primary, .conic-gradient-ring, .fade-rise-in,
       .overlay-glass, .noise-overlay, .light-sweep, .animate-shimmer.
    5. Responsive: design mobile-first, then `sm:` / `md:` / `lg:`. Avoid fixed
       pixel widths (w-80, w-72, h-28 w-28) - clamp with max-w-[calc(100vw-2rem)].
       The dashboard layout already reserves pb-20 md:pb-8 for the fixed
       MobileNav, so the last card must not be pushed under it.
    6. Respect prefers-reduced-motion. The <html> element also gets
       .reduce-motion from the settings store when animations are disabled.

BUILD / TOOLCHAIN CONSTRAINTS
    TypeScript is strict: noUnusedLocals, noUnusedParameters and
    noUncheckedIndexedAccess are ON. An unused import or arr[i] without a guard
    will fail the build.
    React 19 + Next.js 16 (App Router). Tailwind v4 via @theme in globals.css
    (there is no tailwind.config.js). Prisma 7, client generated into
    src/generated/prisma - do not hand-edit that folder.
    Lint: `eslint .` with 0 errors and ~205 pre-existing warnings; warnings are
    not a deploy blocker.
'''


def human(n: int) -> str:
    return f"{n:,}"


def build_manifest_table(tier: str) -> str:
    rows = [m for m in MANIFEST if tier == "full" or m[0] == "core"]
    lines = [
        f"{'#':>3}  {'CAUTION':<38} {'LINES':>6}  PATH",
        f"{'#':>3}  {'-'*38} {'-'*6}  {'-'*60}",
    ]
    for i, (_t, path, _role, caution, _note) in enumerate(rows, 1):
        full = ROOT / path
        count = human(len(full.read_text(encoding="utf-8", errors="replace").splitlines())) if full.is_file() else "MISSING"
        lines.append(f"{i:>3}  {caution:<38} {count:>6}  {path}")
    return "\n".join(lines)


def bundle(tier: str, out_path: Path, include_missing: bool) -> tuple[Path, int, int]:
    files = [m for m in MANIFEST if tier == "full" or m[0] == "core"]

    missing = [p for _t, p, _r, _c, _n in files if not (ROOT / p).is_file()]
    present = [m for m in files if (ROOT / m[1]).is_file()]

    if missing and not include_missing:
        print("WARNING - manifest lists files that do not exist:", file=sys.stderr)
        for p in missing:
            print(f"  - {p}", file=sys.stderr)
        print("  (they will be listed in the manifest but skipped)", file=sys.stderr)

    stamp = _dt.datetime.now().strftime("%Y-%m-%d %H:%M")
    out: list[str] = []
    w = out.append

    w('"""')
    w("=" * 78)
    w("  RoutineOS - /today page source bundle")
    w(f"  generated {stamp} by scripts/bundle-today-page.py")
    w("=" * 78)
    w("")
    w("WHAT THIS IS")
    w("  Every source file that renders or feeds http://localhost:3000/today,")
    w("  concatenated into one file so the UI can be redesigned without a full")
    w("  repo checkout. Each file is preceded by its path, its role, a caution")
    w("  marker, and notes about the data it consumes.")
    w("")
    w("HOW TO USE THIS FILE")
    w("  1. Read the DATA CONTRACT section at the end FIRST - it defines the")
    w("     response envelopes, the states to handle, and the styling rules.")
    w("  2. Only edit files marked CAUTION = CORE. Everything else is either")
    w("     shared with other pages (the app shell, globals.css, the UI")
    w("     primitives) or is backend.")
    w("  3. Keep the props each component receives and the endpoints it calls.")
    w("     Redesign presentation, never the data contract.")
    w("  4. Remember today/page.tsx is a SERVER component: it cannot pass")
    w("     callbacks to children.")
    w("")
    w("TIER")
    w(f"  {tier}  ({len(present)} files)")
    w('"""')
    w("")
    w("# " + "=" * 76)
    w("# FILE MANIFEST")
    w("# " + "=" * 76)
    w("#")
    w("# CORE   = the editable surface. Safe to redesign.")
    w("# SHARED = also used by other pages. Editing it changes more than /today.")
    w("# BACKEND/PURE = do not edit for a UI change.")
    w("#")
    w(build_manifest_table(tier))
    w("")
    w("")
    w("# " + "=" * 76)
    w("# SOURCES")
    w("# " + "=" * 76)

    for tier_tag, path, role, caution, note in present:
        full = ROOT / path
        body = full.read_text(encoding="utf-8", errors="replace")
        lines = body.count("\n") + 1

        w("")
        w("# " + "=" * 76)
        w(f"# FILE      : {path}")
        w(f"# ROLE      : {role}")
        w(f"# CAUTION   : {caution}")
        w(f"# LINES     : {human(lines)}")
        if note:
            wrapped: list[str] = []
            line = "# NOTE      : "
            for word in note.split():
                if len(line) + len(word) + 1 > 78:
                    wrapped.append(line)
                    line = "#             "
                line += word + " "
            wrapped.append(line)
            out.extend(wrapped)
        w("# " + "=" * 76)
        w("")
        w(body.rstrip("\n"))
        w("")

    w("")
    w(CONTRACT.rstrip("\n"))
    w("")
    w("")
    w("# " + "=" * 76)
    w(f"# END OF BUNDLE - {len(present)} files")
    if missing:
        w(f"# NOTE: {len(missing)} manifest entries were missing on disk:")
        for p in missing:
            w(f"#   - {p}")
    w("# " + "=" * 76)

    out_path.write_text("\n".join(out) + "\n", encoding="utf-8")
    return out_path, len(present), len(body)


def main() -> int:
    ap = argparse.ArgumentParser(
        description="Bundle every /today-related file into one file for a UI redesign handoff."
    )
    ap.add_argument(
        "--tier",
        choices=("core", "full"),
        default="full",
        help="core = only the editable set; full = + shell, hooks, theme, API routes (default: full)",
    )
    ap.add_argument(
        "--out",
        default="todaypage.py",
        help="output filename (default: todaypage.py)",
    )
    ap.add_argument(
        "--dir",
        default=".",
        help="output directory, relative to the repo root (default: .)",
    )
    ap.add_argument(
        "--include-missing",
        action="store_true",
        help="keep going even if manifest files are missing from disk",
    )
    args = ap.parse_args()

    out_path = (ROOT / args.dir / args.out).resolve()
    out_path.parent.mkdir(parents=True, exist_ok=True)

    path, count, _ = bundle(args.tier, out_path, args.include_missing or True)

    size_kb = path.stat().st_size / 1024
    print(f"wrote {path}")
    print(f"  tier   : {args.tier}")
    print(f"  files  : {count}")
    print(f"  size   : {size_kb:.0f} KB")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
