import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

const publicPaths = ['/login', '/register', '/'];

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  const isPublicPath = publicPaths.some((path) => {
    if (path === '/') return pathname === '/';
    return pathname.startsWith(path);
  });

  const isProtectedPath = !isPublicPath && pathname !== '/api/auth' && !pathname.startsWith('/api/auth/');

  if (isProtectedPath) {
    const token = request.cookies.get('next-auth.session-token') ?? request.cookies.get('__Secure-next-auth.session-token');
    if (!token) {
      const loginUrl = new URL('/login', request.url);
      return NextResponse.redirect(loginUrl);
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico).*)'],
};
