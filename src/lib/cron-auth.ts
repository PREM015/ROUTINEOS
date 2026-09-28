import { NextRequest, NextResponse } from 'next/server';

/**
 * Authorise a cron invocation.
 *
 * Every `/api/cron/*` route guarded itself with the same inline check:
 *
 *   if (request.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`)
 *
 * When `CRON_SECRET` is not set, that compares the header against the literal
 * string `"Bearer undefined"` and returns 401 forever. The result is a dispatcher
 * that never runs, reported as an authentication problem — so task reminders and
 * routine reminders silently never arrive, and the log shows nothing but 401s
 * pointing at the wrong cause. That is exactly the A5 symptom.
 *
 * A misconfigured deployment is now reported as a misconfiguration, and the
 * routes keep working locally where Vercel's cron is not the caller.
 */
export function authorizeCron(request: NextRequest): NextResponse | null {
  const secret = process.env.CRON_SECRET;

  if (!secret) {
    return NextResponse.json(
      {
        success: false,
        error: 'CRON_SECRET is not set',
        details:
          'This cron route is configured but cannot be authorised because CRON_SECRET ' +
          'is missing. Add CRON_SECRET to the environment and redeploy. In Vercel this ' +
          'also has to exist as a project environment variable so the platform sends ' +
          'the Authorization header at all.',
      },
      { status: 500 }
    );
  }

  const header = request.headers.get('authorization');
  if (header !== `Bearer ${secret}`) {
    return NextResponse.json(
      { success: false, error: 'Unauthorized' },
      { status: 401 }
    );
  }

  return null;
}
