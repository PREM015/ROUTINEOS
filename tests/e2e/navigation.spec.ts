import { expect, test } from '@playwright/test';

import { baseURL, logout, signup, uniqueUser } from './setup';

test('primary pages can be visited after signup', async ({ page }) => {
  const user = uniqueUser();
  await signup(page, user);

  for (const pathname of ['dashboard', 'goals', 'habits']) {
    await page.goto(`${baseURL}/${pathname}`);
    await expect(page).toHaveURL(new RegExp(`/${pathname}`));
  }
});

test('logout returns to the login page', async ({ page }) => {
  const user = uniqueUser();
  await signup(page, user);
  await logout(page);
  await expect(page).toHaveURL(/\/login$/);
});