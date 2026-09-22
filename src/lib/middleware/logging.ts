import type { NextRequest } from 'next/server';

/**
 * Logging middleware for API routes.
 * Structured request logging with leveled output.
 */

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface RequestLogEntry {
  method: string;
  path: string;
  status: number;
  durationMs: number;
  userId?: string;
  level: LogLevel;
  timestamp: string;
}

const LevelPriority: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

export const LOG_LEVEL: LogLevel = (process.env.LOG_LEVEL as LogLevel) ?? 'info';

export function toLogLevel(value: unknown): LogLevel {
  if (
    typeof value === 'string' &&
    Object.prototype.hasOwnProperty.call(LevelPriority, value)
  ) {
    return value as LogLevel;
  }
  return 'info';
}

/**
 * Whether `level` passes the configured threshold.
 */
export function shouldLog(level: LogLevel): boolean {
  return LevelPriority[level] >= LevelPriority[LOG_LEVEL];
}

/**
 * Structured console writer. Outputs JSON lines in production and pretty text
 * in development.
 */
export class ApiLogger {
  log(level: LogLevel, message: string, meta: Record<string, unknown> = {}): void {
    if (!shouldLog(level)) return;
    const entry = {
      level,
      message,
      timestamp: new Date().toISOString(),
      ...meta,
    };
    if (process.env.NODE_ENV === 'development') {
      // eslint-disable-next-line no-console
      console.log(`[${level.toUpperCase()}] ${message}`, meta);
    } else {
      // eslint-disable-next-line no-console
      console.log(JSON.stringify(entry));
    }
  }

  debug(message: string, meta: Record<string, unknown> = {}): void {
    this.log('debug', message, meta);
  }

  info(message: string, meta: Record<string, unknown> = {}): void {
    this.log('info', message, meta);
  }

  warn(message: string, meta: Record<string, unknown> = {}): void {
    this.log('warn', message, meta);
  }

  error(message: string, meta: Record<string, unknown> = {}): void {
    this.log('error', message, meta);
  }
}

export const logger = new ApiLogger();

/**
 * Build a standard request log entry.
 */
export function describeRequest(
  req: NextRequest,
  response: Response,
  durationMs: number,
  userId?: string
): RequestLogEntry {
  const status = response.status;
  const level: LogLevel = status >= 500 ? 'error' : status >= 400 ? 'warn' : 'info';
  return {
    method: req.method,
    path: new URL(req.url).pathname,
    status,
    durationMs: Math.round(durationMs),
    userId,
    level,
    timestamp: new Date().toISOString(),
  };
}

/**
 * Wrap a handler with request/response logging. The request body is not
 * logged to avoid exfiltrating payloads.
 */
export function withLogging(
  handler: (req: NextRequest) => Promise<Response> | Response,
  options: { disable?: boolean } = {}
) {
  return async (req: NextRequest) => {
    if (options.disable) {
      return handler(req);
    }
    const startedAt = performance.now();
    const response = await handler(req);
    const durationMs = performance.now() - startedAt;
    logger.info('request', { ...describeRequest(req, response, durationMs) });
    return response;
  };
}