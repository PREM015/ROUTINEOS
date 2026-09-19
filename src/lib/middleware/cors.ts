import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

/**
 * CORS middleware for API routes.
 * Injects permissive-but-scoped CORS headers and short-circuits preflight
 * requests.
 */

export interface CorsOptions {
  allowedOrigins?: readonly string[];
  allowCredentials?: boolean;
  allowedMethods?: readonly string[];
  allowedHeaders?: readonly string[];
  /** Seconds the browser may cache the preflight result. */
  maxAge?: number;
}

const DEFAULT_ORIGINS: readonly string[] = [
  'http://localhost:3000',
  'http://localhost:3001',
];

const DEFAULT_METHODS: readonly string[] = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'];

const DEFAULT_HEADERS: readonly string[] = [
  'Content-Type',
  'Authorization',
  'X-Requested-With',
];

export function getCorsHeaders(
  origin: string | null,
  options: CorsOptions = {}
): Record<string, string> {
  const allowedOrigins = options.allowedOrigins ?? DEFAULT_ORIGINS;
  const headers: Record<string, string> = {};

  if (origin && allowedOrigins.includes(origin)) {
    headers['Access-Control-Allow-Origin'] = origin;
    if (options.allowCredentials ?? true) {
      headers['Access-Control-Allow-Credentials'] = 'true';
    }
  }

  headers['Access-Control-Allow-Methods'] = (options.allowedMethods ?? DEFAULT_METHODS).join(', ');
  headers['Access-Control-Allow-Headers'] = (options.allowedHeaders ?? DEFAULT_HEADERS).join(', ');

  if (options.maxAge !== undefined) {
    headers['Access-Control-Max-Age'] = String(options.maxAge);
  }

  return headers;
}

/**
 * Whether a request origin is permitted to call this API.
 */
export function isAllowedOrigin(
  origin: string | null,
  options: CorsOptions = {}
): boolean {
  if (!origin) return false;
  return (options.allowedOrigins ?? DEFAULT_ORIGINS).includes(origin);
}

/**
 * Wrap a handler with CORS support. OPTIONS preflight requests are answered
 * directly with a 204.
 */
export function withCors(
  handler: (req: NextRequest) => Promise<Response> | Response,
  options: CorsOptions = {}
) {
  return async (req: NextRequest) => {
    const origin = req.headers.get('origin');
    const headers = getCorsHeaders(origin, options);

    if (req.method === 'OPTIONS') {
      return new NextResponse(null, { status: 204, headers });
    }

    const response = await handler(req);
    const next = new NextResponse(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers: response.headers,
    });
    for (const [key, value] of Object.entries(headers)) {
      next.headers.set(key, value);
    }
    return next;
  };
}