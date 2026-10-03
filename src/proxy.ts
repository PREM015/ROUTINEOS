import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getToken } from 'next-auth/jwt';

const publicPaths = [
  '/',
  // Public marketing and legal pages. These are indexable, appear in
  // /sitemap.xml, and are linked from the site footer and the cookie consent
  // banner.
  //
  // `/about`, `/why` and `/faq` were missing from this list even though they
  // ship `index, follow` metadata, carry the public Navbar/Footer, and are
  // linked from the landing page footer — so an anonymous visitor (precisely
  // the audience for a marketing page) was silently 307'd to
  // /login?callbackUrl=/faq. `/privacy` and `/terms` then inherited the same
  // fault, which is worse: the consent banner links to the Privacy Policy, and
  // following it while logged out bounced to a sign-in form.
  '/about',
  '/why',
  '/faq',
  '/privacy',
  '/terms',
  // Shown when a signed-in user lacks the required role. Redirecting it to
  // /login would turn a 403 into a confusing auth prompt.
  '/unauthorized',
  '/login',
  '/register',
  '/forgot-password',
  '/reset-password',
  '/change-password',
  '/verify-email',
  '/email-verified',
  '/verify-2fa',
  '/setup-2fa',
  '/resend-verification',
  '/logout',
];

function isHttpsRequest(request: NextRequest): boolean {
  const forwarded = request.headers.get('x-forwarded-proto');
  if (forwarded) return forwarded.split(',')[0]?.trim() === 'https:';
  return request.nextUrl.protocol === 'https:';
}

/**
 * NextAuth decides the session-cookie NAME from the *configured* URL, not from
 * the incoming request:
 *
 *   next-auth/lib/env.js  ->  const url = process.env.AUTH_URL ?? process.env.NEXTAUTH_URL
 *   @auth/core init.js    ->  useSecureCookies ?? url.protocol === 'https:'
 *   @auth/core cookie.js  ->  cookiePrefix = useSecureCookies ? '__Secure-' : ''
 *
 * Our `.env` points NEXTAUTH_URL at the https production origin, so even when
 * `next dev` serves http://localhost:3000 NextAuth writes
 * `__Secure-authjs.session-token`. Chrome accepts a `Secure` cookie from
 * http://localhost, so sign-in genuinely succeeded — but this proxy asked
 * getToken() for the plain `authjs.session-token` name, decoded nothing, and
 * treated a live session as anonymous. Every protected page then 307'd to
 * /login?callbackUrl=..., which is the "I sign in and stay on the login page"
 * loop.
 *
 * Resolve it the same way NextAuth does, from the configured URL.
 *
 * Named `shouldUseSecureCookies` rather than `useSecureCookies`: this is a
 * plain synchronous helper with no React hook semantics, and the `use` prefix
 * made `react-hooks/rules-of-hooks` treat the call inside `readSessionToken`
 * as an illegal hook call (a lint error, and a misleading signal to readers).
 */
function shouldUseSecureCookies(request: NextRequest): boolean {
  const configured = process.env.AUTH_URL ?? process.env.NEXTAUTH_URL;
  if (configured) {
    try {
      return new URL(configured).protocol === 'https:';
    } catch {
      // Unparseable config: fall through to sniffing the request.
    }
  }
  return isHttpsRequest(request);
}

/**
 * Read the session token, tolerating either cookie naming.
 *
 * NextAuth owns the write, this file owns the read, and the two must never
 * disagree — a disagreement is indistinguishable from "not signed in" and locks
 * the user out of the whole app. The second attempt is a safety net for the
 * case where the configured URL and the served origin genuinely differ (e.g. a
 * per-environment NEXTAUTH_URL), which is exactly the situation that produced
 * this bug.
 */
async function readSessionToken(request: NextRequest) {
  const secret = process.env.AUTH_SECRET ?? process.env.NEXTAUTH_SECRET;
  const secure = shouldUseSecureCookies(request);
  const preferred = await getToken({ req: request, secret, secureCookie: secure }).catch(() => null);
  if (preferred) return preferred;
  return getToken({ req: request, secret, secureCookie: !secure }).catch(() => null);
}

export async function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;

  // Auth is decided by a VALID decoded session token, not by the mere
  // presence of a cookie. A stale, expired, mis-signed or tampered cookie
  // must look exactly like a missing one: the login page shows, and the
  // proxy never bounces /login back onto a protected route (that mismatch
  // is what produced the endless /dashboard <-> /login redirect loop).
  const token = await readSessionToken(request);
  const authenticated = token !== null;

  const isPublicPath = publicPaths.some((path) => {
    if (path === '/') return pathname === '/';
    return pathname === path || pathname.startsWith(`${path}/`);
  });

  const isAuthApi = pathname === '/api/auth' || pathname.startsWith('/api/auth/');

  // Authenticated users should not sit on login/register: single server
  // redirect — only when the session actually decodes.
  if (pathname === '/login' || pathname === '/register') {
    if (authenticated) {
      const callbackUrl = request.nextUrl.searchParams.get('callbackUrl');
      const target =
        callbackUrl && callbackUrl.startsWith('/') && !callbackUrl.startsWith('//')
          ? callbackUrl
          : '/dashboard';
      return NextResponse.redirect(new URL(target, request.url));
    }
    return NextResponse.next();
  }

  if (isPublicPath || isAuthApi) {
    return NextResponse.next();
  }

  // API routes (non-auth): let the handler return 401 JSON, never redirect.
  if (pathname.startsWith('/api/')) {
    return NextResponse.next();
  }

  // Protected page without a VALID session: one server-side redirect.
  if (!authenticated) {
    const loginUrl = new URL('/login', request.url);
    loginUrl.searchParams.set('callbackUrl', `${pathname}${search}`);
    return NextResponse.redirect(loginUrl, 307);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    '/((?!api|_next/static|_next/image|favicon.ico|manifest.webmanifest|manifest.json|sw.js|icons|offline|apple-icon|icon).*)',
  ],
};