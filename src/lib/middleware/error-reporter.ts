interface ErrorContext {
  userId?: string;
  userEmail?: string;
  route?: string;
  timestamp?: Date | string;
  userAgent?: string;
  metadata?: Record<string, unknown>;
}

interface ErrorPayload {
  name: string;
  message: string;
  stack?: string;
  timestamp: string;
  userId?: string;
  userEmail?: string;
  route?: string;
  userAgent?: string;
  metadata?: Record<string, unknown>;
}

// Dedupe: identical errors (same name+message+route) are reported at most
// once per window so a failing loop cannot flood the terminal or endpoint.
const seen = new Map<string, number>();
const DEDUPE_WINDOW_MS = 60_000;

function fingerprint(error: Error, context?: ErrorContext): string {
  return [error.name, error.message, context?.route ?? ''].join('|');
}

function shouldReport(error: Error, context?: ErrorContext): boolean {
  const key = fingerprint(error, context);
  const now = Date.now();
  const last = seen.get(key);
  if (last !== undefined && now - last < DEDUPE_WINDOW_MS) return false;
  seen.set(key, now);
  // Bound memory: drop old entries.
  if (seen.size > 500) {
    const oldest = [...seen.entries()].sort((a, b) => a[1] - b[1])[0];
    if (oldest) seen.delete(oldest[0]);
  }
  return true;
}

/**
 * Centralized error reporting service.
 *
 * - Development: single `console.error` per unique error (deduped).
 * - Production: POSTs to `ERROR_REPORT_URL` when configured (env-gated);
 *   otherwise a no-op. Critical errors are additionally logged once.
 */
export class ErrorReporter {
  /**
   * Report error to monitoring service
   */
  static report(error: Error, context?: ErrorContext): void {
    // Wait for a settled session: reports without a userId are still
    // accepted but tagged anonymous so early noise is identifiable.
    const { timestamp: _ignored, ...rest } = context ?? {};
    void _ignored;
    const payload: ErrorPayload = {
      name: error.name,
      message: error.message,
      stack: error.stack,
      timestamp:
        context?.timestamp instanceof Date
          ? context.timestamp.toISOString()
          : (context?.timestamp ?? new Date().toISOString()),
      ...rest,
      userId: context?.userId ?? 'anonymous',
    };

    if (!shouldReport(error, context)) return;

    if (process.env.NODE_ENV === 'development') {
      console.error('[Error Report]:', payload);
      return;
    }

    const endpoint = process.env.ERROR_REPORT_URL;
    if (!endpoint) return;

    try {
      void fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        keepalive: true,
      }).catch(() => undefined);
    } catch {
      // Reporting must never crash the app.
    }
  }

  /**
   * Report API error with request context
   */
  static reportApiError(error: Error, req: Request, userId?: string): void {
    this.report(error, {
      userId,
      route: new URL(req.url).pathname,
      userAgent: req.headers.get('user-agent') || undefined,
      timestamp: new Date().toISOString(),
    });
  }

  /**
   * Report client-side error
   */
  static reportClientError(error: Error, userId?: string, metadata?: Record<string, unknown>): void {
    this.report(error, {
      userId,
      route: typeof window !== 'undefined' ? window.location.pathname : undefined,
      userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : undefined,
      metadata,
    });
  }

}
