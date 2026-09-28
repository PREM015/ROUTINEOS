# AGENTS.md

RoutineOS ("daily-plan" repo): Next.js 16 (App Router) + React 19 + TypeScript + Tailwind v4 + Prisma 7 + Vitest productivity platform. All app code lives in `src/`.

## Read these before coding (they are the project's spec)
- `AGENT.MD` — mandatory work instruction: complete every phase in `PLAN.MD`, do not stop after one phase, never assume a file is complete just because it exists (files often contain TODOs/stubs), verify against `PLAN.MD` at the end.
- `PLAN.MD` — phase-by-phase implementation plan (Phase 0–46) with the exact files required per phase.
- `FILE.MD` — per-file coding standard: repositories (`src/server/repositories/*.repository.ts`) are the only DB access layer, services (`src/server/services/*.service.ts`) hold all business logic, API routes must be thin and delegate to services. API response format: `{ success: true, data }` / `{ error: string, details? }`. Never trust client-supplied userId; always authenticate and validate with Zod.
- Gotcha: `.md` files are gitignored (the `.gitignore` `.md` rule), so these docs and this file are not under version control.

## Commands (npm)
- `npm run dev` / `npm run build` / `npm run start`
- Type check: `npm run type-check` (`tsc --noEmit`). tsconfig is strict with `noUnusedLocals`, `noUnusedParameters`, and `noUncheckedIndexedAccess` — unused vars and unchecked index access will fail.
- Lint: `npm run lint` / `lint:fix` run `eslint .` with the flat config `eslint.config.mjs` (extends `next/core-web-vitals`, `next/typescript`, `prettier`). It reports **0 errors and ~165 warnings** (all `react-hooks` / `no-console` advisories, pre-existing across the tree). `next build` no longer lints.
- Tests: `npm test` (Vitest; config `vitest.config.ts` runs `tests/**/*.test.ts` in `node` env, no setup files, no DB). Run a single file with `npx vitest run tests/<file>.test.ts`.
  - Config wires `resolve.alias` for `@/*` and `@prisma/client` (→ `src/generated/prisma`), so both aliases work in tests. `@/lib/prisma` throws without `DATABASE_URL` — service-level tests must `vi.mock` the repository/service modules.
  - `tests/` contains three pure suites, none needing a database: `tests/lib/settings.schema.test.ts` (36), `tests/lib/enums.test.ts` (5), `tests/domain/tier-weights.test.ts` (3). `npm test` → 44 passing. An earlier version of this file claimed 45 tests across four files including Playwright; those files do not exist. There is no `test:e2e` script and no `playwright.config.*`.

## Client/server boundary (important)
- `src/generated/prisma` resolves to the **Node** client entry point (679 KB, imports Node built-ins). Importing a Prisma **enum as a value** from it inside a `'use client'` file pulls that into the browser bundle. In client components use `src/constants/prisma-enums.ts` (a plain-object mirror, kept in sync by `tests/lib/enums.test.ts`). `import type { ... } from '@/generated/prisma'` is fine — it is erased at compile time.
- `src/app/globals.css` must stay valid UTF-8. A single invalid byte makes Turbopack fail with `invalid utf-8 sequence ... failed to convert rope into string`. PowerShell 5.1's `Add-Content`/`Out-File` mangle non-ASCII, so edit that file with the editor tools, not the shell.

## Database (Prisma 7)
- Prisma 7 requires `prisma.config.ts` (present). The client is generated into `src/generated/prisma` (committed to git). All Prisma imports use `@/generated/prisma`; there are **zero** uses of `@prisma/client`. Don't hand-edit the generated folder.
- After changing `prisma/schema.prisma`, run `npm run db:generate`. `postinstall` already runs `prisma generate || exit 0`.
- `DATABASE_URL` comes from env (see `.env.example`); the schema datasource block deliberately has no `url` (it is supplied via `prisma.config.ts`). Local Postgres: `docker compose up postgres` (postgres:15, port 5432). Push schema: `npm run db:push`; seed: `npm run db:seed`.
- `prisma db push --accept-data-loss` is guarded: Prisma refuses to run it from an agent without the user pasting explicit consent. The `DATABASE_URL` in `.env` points at a remote Neon database, so confirm whether it is a dev or production instance before pushing.

## User settings (single source of truth)
- `UserSettings` is a **single row per user**, owned by the zustand store `src/store/settings.store.ts` and read through the `useSettings()` hook (`src/hooks/useSettings.ts`). Every page under `src/app/(dashboard)/settings` goes through it — do **not** hand-roll a `useState` + `GET /api/settings` fetch, that is what previously let sibling pages disagree about the same column.
- Writes are `save(patch)` (optimistic, then reconciled against the row `PUT /api/settings` returns). `patchLocal(patch)` is for local-only optimistic edits while typing.
- The store is loaded on sign-in and `reset()` on sign-out by `useSettingsLoader` in `src/components/auth/AuthProvider.tsx`.
- `applyAppearance()` projects `animationsEnabled` / `compactMode` onto `<html>`. The `dark` class is owned exclusively by `next-themes` — do not toggle it from the store.
- `timezone` exists on both `User` and `UserSettings`; `UserService.updateSettings` writes both in one call. Keep it that way or the score bucketing and the UI will drift.
- `updateSettingsSchema` (`src/lib/validation/settings.schema.ts`) is a plain `z.object`, so **unknown keys are silently stripped**. A field missing from that schema appears to save (the PUT returns 200) and then reverts on reload. When adding a settings column, add it to the schema in the same change. Time fields are `.nullable()` — send `null` to clear them; `''` fails the `HH:mm` regex, and `undefined` is dropped by `JSON.stringify`.
- Dashboard widget preferences are a deliberate exception: they live in `localStorage` under `routineos.dashboard.widgets` (per-device) and are read by `WidgetGate` in `src/components/dashboard/DashboardWidgets.tsx`, which the dashboard page wraps every widget in.

## Known repo issues (expected; don't be surprised)
- Tailwind is v4 (`@import "tailwindcss"` + `@theme` in `src/app/globals.css`, `@tailwindcss/postcss` in package.json and `postcss.config.mjs`) — `next build` compiles and generates statically without errors.
- `.husky/*` hooks, `lint-staged.config.js`, `commitlint.config.js`, and `.github/workflows/*` are `// TODO` stub files. Hook files contain JS-comment text, so any active hook fails — commit with `--no-verify` if hooks are installed. `prepare: husky install` is deprecated on husky v9 (prints a warning but runs).
- Dynamic API routes declare `params` as `Promise<{...}>` and **must** `await` it. Next 15+ makes `params` a Promise; the 13 routes that destructured it synchronously (including `integrations/[provider]/disconnect`, which broke Settings > Integrations) are fixed. Verify with `grep -rn "params: {" src/app/api`.

## Architecture map
- Routes: `src/app` — `(auth)/` (login/register), `(dashboard)/` (app pages), `api/**/route.ts` (thin handlers), `api/cron/*`. Of the three cron endpoints, `compute-daily-scores` is a real backfill job (bounded to 200 rows/run, idempotent via upsert) and `generate-insights` is still a stub returning `generated: 0`. `sleep-notifications` is real but absent from `vercel.json`, so it needs an external scheduler.
- Backend: `src/server/{repositories,services,ai,audit,notifications,recap,data}`.
- Pure logic/helpers: `src/lib/*`, `src/config/*` (e.g. scoring weights), `src/constants/*` (client-safe enum mirrors), validation `src/lib/validation/*` (Zod), domain+API types `src/types/*`.
- Auth: NextAuth with the **jwt** strategy, so the framework never writes a `DeviceSession` row. `components/auth/DeviceSessionTracker.tsx` registers this browser via `POST /api/auth/device-session` (keyed on a localStorage `deviceId`, upserted on `@@unique([userId, deviceId])`). `sessionVersion` is what actually invalidates live JWTs — `AuthService.logoutAll` / `changePassword` / `deleteAccount` bump it, because deleting `DeviceSession` rows alone does not stop a stateless token.
- Domains: habits, routines, goals/projects/tasks, sleep/wellness, daily scoring, streaks/achievements, weekly/monthly reviews, AI insights, quotes.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
