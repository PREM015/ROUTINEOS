"use client";

/**
 * Client-side feature flag hooks.
 *
 * Data source is the `GET /api/feature-flags` endpoint (assumed to exist or
 * to 404). On any failure the hook degrades to `disabled`, so UI never
 * breaks because flag evaluation is unavailable.
 */

import { useEffect, useMemo, useState } from 'react';

export interface FeatureFlagState {
  flags: Record<string, boolean>;
  loading: boolean;
}

let sharedPromise: Promise<FeatureFlagState> | null = null;

function loadFlags(
  endpoint: string,
  fallback: Record<string, boolean>,
  onError?: (error: unknown) => void
): Promise<FeatureFlagState> {
  if (sharedPromise && endpoint === '/api/feature-flags') {
    return sharedPromise;
  }
  const promise = fetch(endpoint)
    .then((response) => {
      if (!response.ok) {
        throw new Error(`Flag endpoint responded ${response.status}`);
      }
      return response.json() as Promise<{ data?: Record<string, boolean> }>;
    })
    .then((payload) => {
      const flags = payload.data ?? fallback;
      return { flags, loading: false };
    })
    .catch((error: unknown) => {
      onError?.(error);
      return { flags: fallback, loading: false };
    });

  if (endpoint === '/api/feature-flags') {
    sharedPromise = promise;
  }
  return promise;
}

const EMPTY_STATE: FeatureFlagState = { flags: {}, loading: true };

/**
 * Load feature flags once (and share the result across hook instances).
 */
export function useFeatureFlags(options: {
  endpoint?: string;
  fallback?: Record<string, boolean>;
  onError?: (error: unknown) => void;
} = {}): FeatureFlagState {
  const endpoint = options.endpoint ?? '/api/feature-flags';
  const fallback = options.fallback ?? {};
  const onError = options.onError;

  const [state, setState] = useState<FeatureFlagState>(EMPTY_STATE);

  useEffect(() => {
    let cancelled = false;
    void loadFlags(endpoint, fallback, onError).then((loaded) => {
      if (!cancelled) setState(loaded);
    });
    return () => {
      cancelled = true;
    };
  }, [endpoint, fallback, onError]);

  return state;
}

/**
 * Subscribe to a single flag key.
 */
export function useFeatureFlag(
  key: string,
  options: {
    endpoint?: string;
    defaultValue?: boolean;
  } = {}
): { enabled: boolean; loading: boolean } {
  const defaultValue = options.defaultValue ?? false;
  const state = useFeatureFlags({ endpoint: options.endpoint });

  return useMemo(
    () => ({
      enabled: state.flags[key] ?? defaultValue,
      loading: state.loading,
    }),
    [state.flags, state.loading, key, defaultValue]
  );
}