import { expect, test } from '@playwright/test';

import { login, logout, signup, uniqueUser } from './setup';
import type { TestUser } from './setup';

test.describe('signup and login round trip', () => {
  let user: TestUser;

  test.beforeEach(() => {
    user = uniqueUser();
  });

  test('signup then logout then login completes a full auth round trip', async ({ page }) => {
    await signup(page, user);
    await expect(page).toHaveURL(/\/dashboard$/);

    await logout(page);
    await expect(page).toHaveURL(/\/login$/);

    await login(page, user);
    await expect(page).toHaveURL(/\/dashboard$/);
  });
});