'use client';

import { getFocusRuntime } from '@/store/focus.store';

/**
 * Hook to access the focus runtime API.
 * The runtime is registered by FocusRuntime component mounted in the dashboard layout.
 * Returns null if the runtime hasn't mounted yet (e.g., during SSR or before hydration).
 */
export function useFocusRuntime() {
  const runtime = getFocusRuntime();
  return runtime;
}

export default useFocusRuntime;