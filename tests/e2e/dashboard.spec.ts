import { expect, test } from '@playwright/test';

import { baseURL, signup, uniqueUser } from './setup';

test('unauthenticated visitors are redirected to login for dashboard routes', async ({ page }) => {
  await page.goto(`${baseURL}/dashboard`);
  await expect(page).toHaveURL(/\/login/);
});

test('an authenticated user can visit the dashboard', async ({ page }) => {
  const user = uniqueUser();
  await signup(page, user);
  await page.goto(`${baseURL}/dashboard`);
  await expect(page).toHaveURL(/\/dashboard/);
});

test('goals and habits pages are reachable after authentication', async ({ page }) => {
  const user = uniqueUser();
  await signup(page, user);
  await page.goto(`${baseURL}/goals`);
  await expect(page).toHaveURL(/\/goals/);
  await page.goto(`${baseURL}/habits`);
  await expect(page).toHaveURL(/\/habits/);
});