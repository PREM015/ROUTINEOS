import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getToken } from 'next-auth/jwt';

const publicPaths = [
  '/',
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
  if (forwarded) return forwarded.split(',')[0]?.trim() === 'https';
  return request.nextUrl.protocol === 'https:';
}

export async function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;

  // Auth is decided by a VALID decoded session token, not by the mere
  // presence of a cookie. A stale, expired, mis-signed or tampered cookie
  // must look exactly like a missing one: the login page shows, and the
  // proxy never bounces /login back onto a protected route (that mismatch
  // is what produced the endless /dashboard <-> /login redirect loop).
  const token = await getToken({
    req: request,
    secret: process.env.NEXTAUTH_SECRET,
    secureCookie: isHttpsRequest(request),
  }).catch(() => null);
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