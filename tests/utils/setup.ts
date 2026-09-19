import { vi } from 'vitest';

export interface TestEnvConfig {
  timeout: number;
  retry: number;
  environment: 'node';
  restoreMocks: boolean;
}

export const TEST_TIMEOUT = 10_000;

export const testEnvConfig: TestEnvConfig = {
  timeout: TEST_TIMEOUT,
  retry: 0,
  environment: 'node',
  restoreMocks: true,
};

export function resetMocks(): void {
  vi.clearAllMocks();
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
}