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
- Lint: broken as configured. `npm run lint` / `lint:fix` run `next lint`, which was removed in Next 16. Use `npx eslint .` / `npx eslint --fix .` (flat config `eslint.config.mjs`; extends `next/core-web-vitals`, `next/typescript`, `prettier`). `next build` no longer lints.
- Tests: `npm test` (Vitest; config `vitest.config.ts` runs `tests/**/*.test.ts` in `node` env, no setup files, no DB). Run a single file with `npx vitest run tests/<file>.test.ts`.
  - Gotcha: `tests/feature-routes.test.ts` imports via the `@/` alias, but `vitest.config.ts` never wires up `vite-tsconfig-paths` (it's installed but unused), so that one test fails to resolve. Either fix the vitest config or use relative imports when touching it.
  - Many `tests/**` files (integration/, utils/, e2e/) are `expect(true).toBe(true)` stubs — don't rely on them as coverage. `npm run test:e2e` (Playwright) has no `playwright.config.*` and its specs are vitest stubs; not runnable as-is.

## Database (Prisma 7)
- Prisma 7 requires `prisma.config.ts` (present). The client is generated into `src/generated/prisma` (committed to git). Imports use both `@prisma/client` and `@/generated/prisma/client` — both work; don't hand-edit the generated folder.
- After changing `prisma/schema.prisma`, run `npm run db:generate`. `postinstall` already runs `prisma generate || exit 0`.
- `DATABASE_URL` comes from env (see `.env.example`); the schema datasource block deliberately has no `url` (it is supplied via `prisma.config.ts`). Local Postgres: `docker compose up postgres` (postgres:15, port 5432). Push schema: `npm run db:push`; seed: `npm run db:seed`.

## Known repo issues (expected; don't be surprised)
- Tailwind is v4 (`@import "tailwindcss"` + `@theme` in `src/app/globals.css`, `@tailwindcss/postcss` in package.json), but `postcss.config.mjs` still registers the v3 `tailwindcss` plugin — PostCSS will break `next dev`/`next build` until that is corrected.
- `.husky/*` hooks, `lint-staged.config.js`, `commitlint.config.js`, and `.github/workflows/*` are `// TODO` stub files. Hook files contain JS-comment text, so any active hook fails — commit with `--no-verify` if hooks are installed. `prepare: husky install` is deprecated on husky v9 (prints a warning but runs).

## Architecture map
- Routes: `src/app` — `(auth)/` (login/register), `(dashboard)/` (app pages), `api/**/route.ts` (thin handlers), `api/cron/*` (Vercel cron jobs per `vercel.json`).
- Backend: `src/server/{repositories,services,ai,audit,notifications,recap,data}`.
- Pure logic/helpers: `src/lib/*`, `src/config/*` (e.g. scoring weights), `src/constants/*`, validation `src/schemas/*` (Zod), domain+API types `src/types/*`.
- Domains: habits, routines, goals/projects/tasks, sleep/wellness, daily scoring, streaks/achievements, weekly/monthly reviews, AI insights, quotes.