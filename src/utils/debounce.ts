/**
 * Debounce — delay function invocation until events stop firing.
 * The returned function also exposes `cancel` and `flush`.
 */

export interface DebounceOptions {
  /** Invoke immediately on the first call of a burst. */
  leading?: boolean;
  /** Invoke after the wait period following the last call. */
  trailing?: boolean;
}

export interface DebouncedFunction<A extends unknown[], R> {
  (...args: A): void;
  /** Cancel any pending invocation. */
  cancel(): void;
  /** Run any pending invocation now and return its result. */
  flush(): R | undefined;
}

/**
 * Create a debounced version of `fn` that waits `wait` ms after the last call.
 * With `leading`, the first call fires immediately; with `trailing` (default),
 * a final call fires after the quiet period.
 * @example const save = debounce(updateServer, 300)
 */
export function debounce<A extends unknown[], R>(
  fn: (...args: A) => R,
  wait = 0,
  options: DebounceOptions = {}
): DebouncedFunction<A, R> {
  const { leading = false, trailing = true } = options;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let lastArgs: A | null = null;
  let hasPending = false;
  let lastResult: R | undefined;

  const invoke = (): void => {
    if (!hasPending || lastArgs === null) return;
    lastResult = fn(...lastArgs);
    lastArgs = null;
    hasPending = false;
  };

  const debounced = ((...args: A): void => {
    lastArgs = args;
    hasPending = true;

    if (leading && timer === null) invoke();
    if (timer !== null) clearTimeout(timer);

    timer = setTimeout(() => {
      timer = null;
      if (trailing) invoke();
    }, wait);
  }) as DebouncedFunction<A, R>;

  debounced.cancel = (): void => {
    if (timer !== null) clearTimeout(timer);
    timer = null;
    lastArgs = null;
    hasPending = false;
  };

  debounced.flush = (): R | undefined => {
    if (timer !== null) clearTimeout(timer);
    timer = null;
    invoke();
    return lastResult;
  };

  return debounced;
}