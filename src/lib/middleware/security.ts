import type { NextRequest } from 'next/server';
import { sanitizeHtml } from '@/lib/security/sanitize';

/**
 * Security middleware for API routes.
 * Hardening headers, input sanitization, and transport checks.
 */

export interface SecurityOptions {
  /** Enforce HTTPS except for localhost. */
  requireSecure?: boolean;
  /** Apply default hardening headers to responses. */
  setHeaders?: boolean;
}

const SENSITIVE_KEYS = new Set([
  'password',
  'token',
  'secret',
  'clientSecret',
  'client_secret',
  'authorization',
  'apiKey',
  'accessToken',
  'refreshToken',
]);

export function securityHeaders(): Record<string, string> {
  return {
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'X-XSS-Protection': '1; mode=block',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'Permissions-Policy':
      'camera=(), microphone=(), geolocation=(), interest-cohort=()',
    'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
    'Content-Security-Policy':
      "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'",
  };
}

/**
 * Whether a request is secure: HTTPS or loopback.
 */
export function isSecureRequest(req: NextRequest): boolean {
  const protocol = req.headers.get('x-forwarded-proto') ?? new URL(req.url).protocol;
  if (protocol.startsWith('https')) return true;
  const host = req.headers.get('host') ?? '';
  return (
    host.startsWith('localhost') || host.startsWith('127.0.0.1') || host.startsWith('::1')
  );
}

/**
 * Apply hardening headers to an existing response.
 */
export function withSecurityHeaders(response: Response): Response {
  const headers = new Headers(response.headers);
  for (const [key, value] of Object.entries(securityHeaders())) {
    headers.set(key, value);
  }
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

/**
 * Recursively strip HTML from every string in `value`, except sensitive fields
 * that hold opaque values. `null` is kept for nullable keys.
 */
export function sanitizeBody<T>(value: T): T {
  if (typeof value === 'string') {
    return sanitizeHtml(value) as T;
  }
  if (Array.isArray(value)) {
    return value.map(item => sanitizeBody(item)) as T;
  }
  if (value !== null && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(record)) {
      out[key] = SENSITIVE_KEYS.has(key) ? item : sanitizeBody(item);
    }
    return out as T;
  }
  return value;
}

/**
 * Wrap a handler with security hardening. Rejects plain-HTTP non-loopback
 * requests when `requireSecure` is enabled, and decorates the response with
 * security headers.
 */
export function withSecurity(
  handler: (req: NextRequest) => Promise<Response> | Response,
  options: SecurityOptions = {}
) {
  return async (req: NextRequest) => {
    if (options.requireSecure ?? true) {
      if (!isSecureRequest(req)) {
        return new Response(JSON.stringify({ success: false, error: 'HTTPS required' }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' },
        });
      }
    }
    const response = await handler(req);
    return options.setHeaders ?? true ? withSecurityHeaders(response) : response;
  };
}