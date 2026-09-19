import { expect, test } from '@playwright/test';

import { baseURL, login, logout, signup, uniqueUser } from './setup';
import type { TestUser } from './setup';

test.describe('authentication flows', () => {
  let user: TestUser;

  test.beforeEach(() => {
    user = uniqueUser();
  });

  test('register page renders the sign-up form', async ({ page }) => {
    await page.goto(`${baseURL}/register`);
    await expect(page.getByLabel('Name')).toBeVisible();
    await expect(page.getByLabel('Email')).toBeVisible();
    await expect(page.getByLabel('Password')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Create Account', exact: true })).toBeVisible();
  });

  test('login page renders the sign-in form', async ({ page }) => {
    await page.goto(`${baseURL}/login`);
    await expect(page.getByLabel('Email')).toBeVisible();
    await expect(page.getByLabel('Password')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Sign In', exact: true })).toBeVisible();
  });

  test('a user can register and reach the dashboard', async ({ page }) => {
    await signup(page, user);
    await expect(page).toHaveURL(/\/dashboard$/);
  });

  test('a user can sign out', async ({ page }) => {
    await signup(page, user);
    await logout(page);
    await expect(page).toHaveURL(/\/login$/);
  });

  test('a registered user can log back in', async ({ page }) => {
    await signup(page, user);
    await logout(page);
    await login(page, user);
    await expect(page).toHaveURL(/\/dashboard$/);
  });
});