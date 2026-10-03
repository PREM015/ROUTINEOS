/**
 * Shared, thin fetch wrapper used by all zustand stores.
 *
 * RoutineOS API routes follow the response contract:
 *   Success: { success: true, data: T, meta?: unknown }
 *   Error:   { error: string, details?: unknown }
 *
 * This client unwraps `.data` for success envelopes, throws an `ApiError`
 * for non-2xx responses (and network failures), and always sends the session
 * cookie so NextAuth JWT auth works out of the box.
 */

export interface ApiRequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  body?: unknown;
  query?: Record<string, unknown>;
  /**
   * Abort the request.
   *
   * Needed by any hook that re-fetches on a changing key (a date, a query). It
   * used to be impossible to cancel an `apiRequest`, so a component switching
   * dates had no way to stop the previous response from landing — which is how a
   * slow request for Monday could paint over Tuesday.
   */
  signal?: AbortSignal;
}

interface ApiEnvelope {
  success?: boolean;
  data?: unknown;
  meta?: unknown;
  error?: string;
  details?: unknown;
}

export class ApiError extends Error {
  readonly status: number;
  readonly details: unknown;

  constructor(message: string, status: number, details?: unknown) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.details = details;
  }
}

function toQueryString(query: Record<string, unknown>): string {
  const params = new URLSearchParams();

  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null) continue;

    if (Array.isArray(value)) {
      const joined = value
        .filter((item) => item !== null && item !== undefined)
        .map(String)
        .join(',');
      if (joined.length > 0) params.set(key, joined);
    } else {
      params.set(key, String(value));
    }
  }

  const serialized = params.toString();
  return serialized.length > 0 ? `?${serialized}` : '';
}

export async function apiRequest<T>(
  path: string,
  options: ApiRequestOptions = {}
): Promise<T> {
  const { method = 'GET', body, query, signal } = options;

  const headers: Record<string, string> = {};
  let payload: BodyInit | undefined;

  if (body !== undefined) {
    headers['Content-Type'] = 'application/json';
    payload = JSON.stringify(body);
  }

  const url = query ? `${path}${toQueryString(query)}` : path;

  let response: Response;
  try {
    response = await fetch(url, {
      method,
      headers,
      body: payload,
      credentials: 'include',
      cache: 'no-store',
      signal,
    });
  } catch (err) {
    // An abort is not a failure. Swallowing it into `ApiError(…, 0)` made a
    // cancelled request indistinguishable from a network outage, so a caller
    // replacing its data on failure would blank the screen every time the user
    // simply changed the date.
    if (err instanceof DOMException && err.name === 'AbortError') throw err;
    throw new ApiError(
      err instanceof Error ? err.message : 'Network request failed',
      0
    );
  }

  const contentType = response.headers.get('content-type') ?? '';
  const json: unknown = contentType.includes('application/json')
    ? await response.json()
    : null;

  if (!response.ok) {
    const envelope = json as ApiEnvelope | null;
    throw new ApiError(
      envelope?.error ?? `Request failed with status ${response.status}`,
      response.status,
      envelope?.details
    );
  }

  if (json === null) return undefined as T;

  const envelope = json as ApiEnvelope;
  if (envelope.success === true && envelope.data !== undefined) {
    return envelope.data as T;
  }

  return json as T;
}

/**
 * Extract a readable message from a failed API response.
 *
 * Prefers the first Zod `fieldErrors` entry, because "startTime: Start time
 * must be HH:mm" tells a user what to fix and a bare "Invalid input" does not.
 * Exported so there is one implementation: `AppContext` carried its own copy
 * and the two could drift.
 */
export function apiErrorMessage(json: unknown, fallback: string): string {
  if (json && typeof json === 'object') {
    const envelope = json as {
      error?: string;
      details?: { fieldErrors?: Record<string, string[] | undefined> };
    };
    const first = Object.entries(envelope.details?.fieldErrors ?? {}).find(
      ([, messages]) => messages?.length
    );
    if (first) {
      const [field, messages] = first;
      const detail = messages?.[0];
      if (detail) return `${field}: ${detail}`;
    }
    if (typeof envelope.error === 'string' && envelope.error) return envelope.error;
  }
  return fallback;
}

/** Simple fetch wrapper that throws on non-ok responses */
export async function fetchWithAuth(
  path: string,
  options: RequestInit = {}
): Promise<Response> {
  const response = await fetch(path, {
    ...options,
    credentials: 'include',
    cache: 'no-store',
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });
  return response;
}