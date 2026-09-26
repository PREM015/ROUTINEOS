/**
 * Next.js Instrumentation Hook
 * https://nextjs.org/docs/app/building-your-application/optimizing/instrumentation
 *
 * Runs once on server startup (both dev and prod). The dev-only sessionVersion
 * bump is the only logic here — it forces all existing JWT sessions to be
 * rejected the moment the dev server restarts, so stale sessions from a
 * previous run never bleed into a fresh dev environment.
 *
 * In production NODE_ENV !== "development", so the bump is never applied.
 */

export async function register() {
  // Only execute inside the Node.js runtime (not the Edge runtime).
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;

  // Development-only: invalidate all existing sessions on every server boot
  // by incrementing every user's sessionVersion. The JWT callback in auth.ts
  // compares the token's snapshot of sessionVersion against the DB value and
  // rejects on mismatch — so all pre-restart sessions immediately 401.
  if (process.env.NODE_ENV === 'development') {
    try {
      // Dynamic import avoids pulling prisma into the edge bundle.
      const { default: prisma } = await import('@/lib/prisma');
      const result = await prisma.user.updateMany({
        data: { sessionVersion: { increment: 1 } },
      });
      console.log(
        `[dev] sessionVersion bumped for ${result.count} user(s) — all previous sessions invalidated.`
      );
    } catch (err) {
      // Log but do not crash the server — a failed bump is undesirable but
      // not fatal; the worst case is a stale dev session surviving a restart.
      console.warn('[dev] Failed to bump sessionVersion on startup:', err);
    }
  }
}
