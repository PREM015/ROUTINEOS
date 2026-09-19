import { randomUUID } from 'node:crypto';

import type { Page } from '@playwright/test';

export const baseURL = process.env.E2E_BASE_URL ?? 'http://localhost:3000';

export interface TestUser {
  name: string;
  email: string;
  password: string;
}

export function uniqueUser(): TestUser {
  const suffix = randomUUID().slice(0, 8);
  return {
    name: `Test User ${suffix}`,
    email: `test-${suffix}@example.com`,
    password: 'Password123',
  };
}

export async function signup(page: Page, user: TestUser): Promise<void> {
  await page.goto(`${baseURL}/register`);
  await page.getByLabel('Name').fill(user.name);
  await page.getByLabel('Email').fill(user.email);
  await page.getByLabel('Password').fill(user.password);
  await page.getByRole('button', { name: 'Create Account', exact: true }).click();
  await page.waitForLoadState('domcontentloaded');
}

export async function login(page: Page, user: TestUser): Promise<void> {
  await page.goto(`${baseURL}/login`);
  await page.getByLabel('Email').fill(user.email);
  await page.getByLabel('Password').fill(user.password);
  await page.getByRole('button', { name: 'Sign In', exact: true }).click();
  await page.waitForLoadState('domcontentloaded');
}

export async function logout(page: Page): Promise<void> {
  await page.goto(`${baseURL}/logout`);
  await page.waitForLoadState('domcontentloaded');
}