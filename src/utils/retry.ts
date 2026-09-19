/**
 * Retry and timeout helpers for resilient async operations.
 */

export interface RetryOptions {
  /** Maximum number of retries (attempts = retries + 1). Default 3. */
  retries?: number;
  /** Base delay between attempts in ms. Default 100. */
  delayMs?: number;
  /** Exponential backoff multiplier per attempt. Default 2. */
  backoffFactor?: number;
  /** Optional predicate to decide whether a given error is retryable. */
  retryIf?: (error: unknown, attempt: number) => boolean;
}

const wait = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Call an async function, retrying on failure with exponential backoff.
 * @example await retry(() => fetchData(), { retries: 5, delayMs: 200 })
 */
export async function retry<T>(fn: () => Promise<T>, options: RetryOptions = {}): Promise<T> {
  const { retries = 3, delayMs = 100, backoffFactor = 2, retryIf } = options;
  let lastError: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      if (attempt >= retries) break;
      if (retryIf && !retryIf(error, attempt)) break;
      await wait(delayMs * Math.pow(backoffFactor, attempt));
    }
  }
  throw lastError;
}

/**
 * Wrap a function so it automatically retries on failure.
 * @example const fetchWithRetry = createRetryableFn(fetchData, { retries: 2 })
 */
export function createRetryableFn<T extends unknown[], R>(
  fn: (...args: T) => Promise<R>,
  options: RetryOptions = {}
): (...args: T) => Promise<R> {
  const { retries = 3, delayMs = 100, backoffFactor = 2, retryIf } = options;
  return async (...args: T): Promise<R> => {
    let lastError: unknown;
    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        return await fn(...args);
      } catch (error) {
        lastError = error;
        if (attempt >= retries) break;
        if (retryIf && !retryIf(error, attempt)) break;
        await wait(delayMs * Math.pow(backoffFactor, attempt));
      }
    }
    throw lastError;
  };
}

/**
 * Race a promise against a timeout; rejects with `message` if it is not settled in time.
 * @example await withTimeout(fetchData(), 5000, 'Request timed out')
 */
export function withTimeout<T>(
  promise: Promise<T>,
  ms: number,
  message = 'Operation timed out'
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(message)), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error: unknown) => {
        clearTimeout(timer);
        reject(error);
      }
    );
  });
}