import type { LoginInput, RegisterInput, SessionData, SessionUser } from '../../src/types/auth';

export interface AuthUserOverrides {
  [key: string]: unknown;
}

export function makeSessionUser(overrides: AuthUserOverrides = {}): SessionUser {
  return {
    id: 'user-1',
    email: 'riri@example.com',
    name: 'Riri',
    role: 'USER',
    avatarUrl: null,
    timezone: 'Asia/Kolkata',
    emailVerified: null,
    onboardingCompletedAt: null,
    ...overrides,
  };
}

export const defaultSessionUser = makeSessionUser();

export function makeSessionData(
  user: SessionUser = defaultSessionUser,
  overrides: Record<string, unknown> = {}
): SessionData {
  return {
    user,
    expires: '2026-09-17T12:00:00.000Z',
    ...overrides,
  };
}

export function makeLoginInput(overrides: Partial<LoginInput> = {}): LoginInput {
  return { email: 'riri@example.com', password: 'password123', ...overrides };
}

export function makeRegisterInput(overrides: Partial<RegisterInput> = {}): RegisterInput {
  return {
    name: 'Riri',
    email: 'riri@example.com',
    password: 'Password123',
    ...overrides,
  };
}

export const fixtureBaseTime = '2026-09-17T10:00:00.000Z';