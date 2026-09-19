import { vi } from 'vitest';

export type FetchImplementor = (
  input: RequestInfo | URL,
  init?: RequestInit
) => Promise<Response>;

export type FetchMock = ReturnType<typeof vi.fn<FetchImplementor>>;

export interface ResponseOptions {
  status?: number;
  statusText?: string;
  headers?: Record<string, string>;
}

export function jsonResponse(payload: unknown, options: ResponseOptions = {}): Response {
  const status = options.status ?? 200;
  const headers = new Headers(options.headers);
  if (options.headers?.['content-type'] === undefined) {
    headers.set('content-type', 'application/json');
  }
  return new Response(JSON.stringify(payload), {
    status,
    statusText: options.statusText ?? (status >= 200 && status < 300 ? 'OK' : 'Error'),
    headers,
  });
}

export function textResponse(body: string, options: ResponseOptions = {}): Response {
  const status = options.status ?? 200;
  return new Response(body, {
    status,
    statusText: options.statusText ?? (status >= 200 && status < 300 ? 'OK' : 'Error'),
    headers: options.headers,
  });
}

export function stubGlobalFetch(impl: FetchImplementor): FetchMock {
  const mock = vi.fn(impl);
  vi.stubGlobal('fetch', mock);
  return mock as FetchMock;
}

export function stubFetchSuccess(payload: unknown, options: ResponseOptions = {}): FetchMock {
  return stubGlobalFetch(async () => jsonResponse(payload, options));
}

export function stubFetchError(status: number): FetchMock {
  return stubGlobalFetch(async () => jsonResponse({ error: 'request failed' }, { status }));
}

export function stubFetchNetworkError(): FetchMock {
  return stubGlobalFetch(async () => {
    throw new TypeError('fetch failed');
  });
}

export interface MockResponseLike {
  json: ReturnType<typeof vi.fn>;
  status: ReturnType<typeof vi.fn>;
  setHeader: ReturnType<typeof vi.fn>;
  end: ReturnType<typeof vi.fn>;
}

export function createMockRes(): MockResponseLike {
  return {
    json: vi.fn(),
    status: vi.fn(),
    setHeader: vi.fn(),
    end: vi.fn(),
  };
}

export function restoreFetch(): void {
  vi.unstubAllGlobals();
}

export function toJson(response: Response): Promise<unknown> {
  return response.json();
}