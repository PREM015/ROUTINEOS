/**
 * Feature flag evaluation.
 *
 * Flags are read from `prisma.featureFlag` (system-wide entries created by
 * seeds/admin). Evaluation combines the global toggle, per-flag rollout
 * percentage, and explicit user-role/user-id allowlists. Safe to call in server
 * components and Route Handlers; `isFeatureEnabled` degrades to `false` when
 * the table is unreachable.
 */

import type { FeatureFlag, Role } from '@prisma/client';
import prisma from '@/lib/prisma';

export interface FlagResult {
  key: string;
  isEnabled: boolean;
  reason: 'flag-disabled' | 'rollout' | 'role' | 'allowlist' | 'missing';
}

/** Flags whose evaluation is (un)available. */
export const FEATURE_FLAG_KEYS = [
  'ai-insights',
  'weekly-recap',
  'goal-deadline-reminders',
  'habit-smoothing',
  'focus-sessions',
  'export-center',
] as const;

export type FeatureFlagKey = (typeof FEATURE_FLAG_KEYS)[number];

/** Valid flag keys including emoji-friendly aliases used across the app. */
export const VALID_FLAG_KEYS: readonly string[] = [...FEATURE_FLAG_KEYS];

/** Deterministic per-flag shuffle bucket (0..99), without hashing deps. */
export function flagRolloutBucket(key: string): number {
  let hash = 0;
  for (let i = 0; i < key.length; i += 1) {
    hash = (Math.imul(hash, 31) + key.charCodeAt(i)) | 0;
  }
  return (hash >>> 0) % 100;
}

/**
 * Validate that a key is a known flag key (exact or any-case). Returns the
 * canonical key when valid.
 */
export function validateFlagKey(key: string): string | null {
  const normalized = key.toLowerCase();
  return (
    VALID_FLAG_KEYS.find((flag) => flag.toLowerCase() === normalized) ?? null
  );
}

export interface FlagContext {
  userId?: string;
  role?: Role;
}

type FlagAccess = Pick<FeatureFlag, 'enabledForRoles' | 'enabledForUsers'>;

/** `enabledFor*` columns are JSON arrays stored as strings. */
function parseStringArray(value: string | null): string[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed) ? parsed.filter((item: unknown): item is string => typeof item === 'string') : [];
  } catch {
    return [];
  }
}

function isRoleListed(row: FlagAccess, role?: Role): boolean {
  if (!role) return false;
  return parseStringArray(row.enabledForRoles).includes(role);
}

function isUserListed(row: FlagAccess, userId?: string): boolean {
  if (!userId) return false;
  return parseStringArray(row.enabledForUsers).includes(userId);
}

/**
 * Fetch a flag row by key (nullable when absent).
 */
export async function getFeatureFlag(key: string): Promise<FeatureFlag | null> {
  try {
    return await prisma.featureFlag.findUnique({ where: { key } });
  } catch {
    return null;
  }
}

/**
 * Evaluate a flag for a context, returning the full decision record.
 */
export async function checkFlag(
  key: string,
  context: FlagContext = {}
): Promise<FlagResult> {
  const row = await getFeatureFlag(key);
  if (!row) return { key, isEnabled: false, reason: 'missing' };
  if (!row.isEnabled) return { key, isEnabled: false, reason: 'flag-disabled' };

  if (isRoleListed(row, context.role)) {
    return { key, isEnabled: true, reason: 'role' };
  }
  if (isUserListed(row, context.userId)) {
    return { key, isEnabled: true, reason: 'allowlist' };
  }

  const percent = Number(row.rolloutPercent ?? 0);
  if (percent > 0 && flagRolloutBucket(key) < Math.min(100, percent)) {
    return { key, isEnabled: true, reason: 'rollout' };
  }
  return { key, isEnabled: false, reason: 'rollout' };
}

/**
 * Boolean convenience wrapper over `checkFlag`. Honors the `FEATURE_FLAGS_OFF`
 * env kill-switch (ignored in tests).
 */
export async function isFeatureEnabled(
  key: string,
  context: FlagContext = {}
): Promise<boolean> {
  if (process.env.NODE_ENV !== 'test' && process.env.FEATURE_FLAGS_OFF === 'true') {
    return false;
  }
  return (await checkFlag(key, context)).isEnabled;
}

/**
 * Resolve client/query-string flag overrides (admin preview): keys matching
 * `flag_<key>=1/0` win over DB state. Unknown keys are ignored.
 */
export function resolveFlagOverrides(
  params: Readonly<URLSearchParams> | Record<string, unknown>
): Record<string, boolean> {
  const overrides: Record<string, boolean> = {};
  for (const key of VALID_FLAG_KEYS) {
    const value =
      typeof params.get === 'function' ? params.get(`flag_${key}`) : null;
    if (value === '1' || value === 'true') overrides[key] = true;
    if (value === '0' || value === 'false') overrides[key] = false;
  }
  return overrides;
}

/**
 * Expose every flag with its current availability (admin/dashboard use).
 */
export async function listFeatureFlags(): Promise<
  Array<FeatureFlag & { available: boolean }>
> {
  try {
    const rows = await prisma.featureFlag.findMany({ orderBy: { key: 'asc' } });
    return rows.map((row) => ({ ...row, available: true }));
  } catch {
    return [];
  }
}

/**
 * Whether any flag access rules can apply (authorization helper).
 */
export function hasFlagAccess(
  row: FlagAccess,
  context: FlagContext = {}
): boolean {
  return isRoleListed(row, context.role) || isUserListed(row, context.userId);
}