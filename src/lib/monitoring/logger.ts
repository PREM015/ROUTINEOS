/**
 * Structured application logger.
 *
 * Zero-dependency leveled logging with optional JSON output. In production all
 * logs are emitted as structured JSON (one object per line) so they can be
 * shipped to a log aggregator; in development they are pretty-printed.
 */

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const LEVEL_ORDER: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

const PREFIXES: Record<LogLevel, string> = {
  debug: '🐞',
  info: 'ℹ️',
  warn: '⚠️',
  error: '🚨',
};

export interface LogEntry {
  level: LogLevel;
  message: string;
  scope?: string;
  timestamp: string;
  metadata?: Record<string, unknown>;
}

const envLevel = (process.env.LOG_LEVEL ?? 'info').toLowerCase();
let configuredLevel: LogLevel = envLevel in LEVEL_ORDER ? (envLevel as LogLevel) : 'info';

/** Change the minimum level emitted at runtime. */
export function setLogLevel(level: LogLevel): void {
  configuredLevel = level;
}

export function getLogLevel(): LogLevel {
  return configuredLevel;
}

/** Whether JSON output is preferred (`LOG_FORMAT=json` or in production). */
function useJson(): boolean {
  return (
    process.env.LOG_FORMAT === 'json' ||
    (process.env.NODE_ENV ?? 'development') === 'production'
  );
}

function write(entry: LogEntry): void {
  const { level, message, scope, timestamp, metadata } = entry;
  const line = useJson()
    ? JSON.stringify({
        level,
        message,
        scope,
        timestamp,
        ...metadata,
      })
    : `${timestamp} ${PREFIXES[level]} [${scope ?? 'app'}] ${message}${
        metadata && Object.keys(metadata).length > 0
          ? ` ${safeInspect(metadata)}`
          : ''
      }`;

  if (level === 'error') {
    console.error(line);
  } else if (level === 'warn') {
    console.warn(line);
  } else {
    console.log(line);
  }
}

function safeInspect(metadata: Record<string, unknown>): string {
  try {
    return JSON.stringify(metadata);
  } catch {
    return '[unserializable metadata]';
  }
}

function logAt(
  level: LogLevel,
  message: string,
  scopeOrMeta?: string | Record<string, unknown>,
  metadata?: Record<string, unknown>
): void {
  if (LEVEL_ORDER[level] < LEVEL_ORDER[configuredLevel]) return;

  const scope =
    typeof scopeOrMeta === 'string' ? scopeOrMeta : undefined;
  const meta =
    typeof scopeOrMeta === 'string'
      ? metadata
      : typeof scopeOrMeta === 'object'
        ? scopeOrMeta
        : undefined;

  write({
    level,
    message,
    scope,
    timestamp: new Date().toISOString(),
    metadata: meta,
  });
}

/** Log at `debug` level. */
export function debug(message: string, meta?: Record<string, unknown>, scope = 'app'): void {
  logAt('debug', message, scope, meta);
}

/** Log at `info` level. */
export function info(message: string, meta?: Record<string, unknown>, scope = 'app'): void {
  logAt('info', message, scope, meta);
}

/** Log at `warn` level. */
export function warn(message: string, meta?: Record<string, unknown>, scope = 'app'): void {
  logAt('warn', message, scope, meta);
}

/** Log at `error` level, tolerating thrown values of any type. */
export function error(message: string, meta?: Record<string, unknown>, scope = 'app'): void {
  logAt('error', message, scope, meta);
}

/**
 * Create a logger pre-bound to a scope, so callers don't repeat the scope arg.
 *
 * @example
 * const logger = createLogger('routines');
 * logger.info('Routine applied');
 */
export function createLogger(scope: string) {
  return {
    debug: (message: string, meta?: Record<string, unknown>) => logAt('debug', message, scope, meta),
    info: (message: string, meta?: Record<string, unknown>) => logAt('info', message, scope, meta),
    warn: (message: string, meta?: Record<string, unknown>) => logAt('warn', message, scope, meta),
    error: (message: string, meta?: Record<string, unknown>) => logAt('error', message, scope, meta),
  };
}

/** Convert a thrown value into a structured, loggable record. */
export function serializeError(exception: unknown): Record<string, unknown> {
  if (exception instanceof Error) {
    return {
      name: exception.name,
      message: exception.message,
      stack: exception.stack,
    };
  }
  if (typeof exception === 'string') {
    return { message: exception };
  }
  try {
    return { message: JSON.stringify(exception) };
  } catch {
    return { message: String(exception) };
  }
}