import { expect, test } from '@playwright/test';

import { baseURL } from './setup';

test.describe('auth gate', () => {
  test('login page is publicly accessible', async ({ page }) => {
    await page.goto(`${baseURL}/login`);
    await expect(page.getByLabel('Email')).toBeVisible();
  });

  test('register page is publicly accessible', async ({ page }) => {
    await page.goto(`${baseURL}/register`);
    await expect(page.getByLabel('Email')).toBeVisible();
  });

  test('private pages stay behind authentication', async ({ page }) => {
    await page.goto(`${baseURL}/onboarding`);
    await expect(page).not.toHaveURL(/\/onboarding$/);
  });
});