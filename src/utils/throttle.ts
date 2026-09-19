/**
 * Throttle — limit how often a function can fire, at most once per `wait` ms.
 * The returned function also exposes `cancel` and `flush`.
 */

export interface ThrottleOptions {
  /** Fire immediately on the first call. Default true. */
  leading?: boolean;
  /** Fire once more at the end of the window if calls were throttled. Default true. */
  trailing?: boolean;
}

export interface ThrottledFunction<A extends unknown[], R> {
  (...args: A): R | undefined;
  /** Cancel any pending trailing invocation. */
  cancel(): void;
  /** Run any pending invocation now and return its result. */
  flush(): R | undefined;
}

/**
 * Create a throttled version of `fn` that runs at most once every `wait` ms.
 * @example const onScroll = throttle(handleScroll, 100)
 */
export function throttle<A extends unknown[], R>(
  fn: (...args: A) => R,
  wait = 0,
  options: ThrottleOptions = {}
): ThrottledFunction<A, R> {
  const { leading = true, trailing = true } = options;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let lastArgs: A | null = null;
  let hasPending = false;
  let lastResult: R | undefined;
  let lastRun = 0;

  const invoke = (args: A): R => {
    lastRun = Date.now();
    lastResult = fn(...args);
    return lastResult;
  };

  const throttled = ((...args: A): R | undefined => {
    const now = Date.now();
    const remaining = wait - (now - lastRun);

    if (lastRun === 0 && leading) return invoke(args);
    if (remaining <= 0) {
      if (timer !== null) {
        clearTimeout(timer);
        timer = null;
      }
      hasPending = false;
      lastArgs = null;
      return invoke(args);
    }

    lastArgs = args;
    hasPending = true;
    if (trailing && timer === null) {
      timer = setTimeout(() => {
        timer = null;
        if (hasPending && lastArgs !== null) {
          hasPending = false;
          const pending = lastArgs;
          lastArgs = null;
          invoke(pending);
        }
      }, remaining);
    }
    return lastResult;
  }) as ThrottledFunction<A, R>;

  throttled.cancel = (): void => {
    if (timer !== null) clearTimeout(timer);
    timer = null;
    lastArgs = null;
    hasPending = false;
  };

  throttled.flush = (): R | undefined => {
    if (timer !== null) clearTimeout(timer);
    timer = null;
    if (hasPending && lastArgs !== null) {
      hasPending = false;
      const pending = lastArgs;
      lastArgs = null;
      return invoke(pending);
    }
    return lastResult;
  };

  return throttled;
}