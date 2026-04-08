import { test, expect } from '@playwright/test';
import { setupStorage } from '../helpers/setup-storage.js';
import { navigateTo } from '../helpers/navigate-to.js';
import { mockAllApiRoutes } from '../helpers/mock-api.js';

test.describe('Visual Regression', () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
  });

  test('Dashboard view matches baseline', async ({ page }) => {
    await mockAllApiRoutes(page);
    await setupStorage(page, 'with-5-jobs');
    await navigateTo(page, 'dashboard');
    // Wait for dashboard content to render (Today's Actions loads from mock)
    await expect(page.getByText("Today's Actions")).toBeVisible({ timeout: 10000 });
    await expect(page.getByText('Follow up with Oscar Health')).toBeVisible({ timeout: 5000 });
    await page.waitForTimeout(500);
    await expect(page).toHaveScreenshot('dashboard.png', { maxDiffPixelRatio: 0.1 });
  });

  test('Analyze view matches baseline', async ({ page }) => {
    await mockAllApiRoutes(page);
    await setupStorage(page, 'onboarded-no-jobs');
    await navigateTo(page, 'analyze');
    await expect(page.getByText('Analyze a job')).toBeVisible();
    await page.waitForTimeout(300);
    await expect(page).toHaveScreenshot('analyze.png', { maxDiffPixelRatio: 0.1 });
  });

  test('Pipeline view matches baseline', async ({ page }) => {
    await mockAllApiRoutes(page);
    await setupStorage(page, 'with-5-jobs');
    await navigateTo(page, 'pipeline');
    await expect(page.getByText('Your Pipeline')).toBeVisible({ timeout: 10000 });
    await expect(page.getByText('Stripe').first()).toBeVisible({ timeout: 5000 });
    await page.waitForTimeout(300);
    await expect(page).toHaveScreenshot('pipeline.png', { maxDiffPixelRatio: 0.1 });
  });

  test('Strategy view matches baseline', async ({ page }) => {
    await mockAllApiRoutes(page);
    await setupStorage(page, 'onboarded-no-jobs');
    await navigateTo(page, 'strategy');
    await expect(page.getByText('Job Search Strategy')).toBeVisible();
    await page.waitForTimeout(300);
    await expect(page).toHaveScreenshot('strategy.png', { maxDiffPixelRatio: 0.1 });
  });

  test('Resume view (empty state) matches baseline', async ({ page }) => {
    await mockAllApiRoutes(page);
    await setupStorage(page, 'onboarded-no-resume');
    await navigateTo(page, 'workshop');
    await expect(page.getByText('Upload your resume first')).toBeVisible();
    await page.waitForTimeout(300);
    await expect(page).toHaveScreenshot('resume-empty.png', { maxDiffPixelRatio: 0.1 });
  });

  test('Preferences modal matches baseline', async ({ page }) => {
    await mockAllApiRoutes(page);
    await setupStorage(page, 'onboarded-no-jobs');
    await page.locator('button', { hasText: 'Prefs' }).first().click();
    await expect(page.getByText('Job Search Preferences')).toBeVisible();
    await page.waitForTimeout(300);
    await expect(page).toHaveScreenshot('preferences-modal.png', { maxDiffPixelRatio: 0.1 });
  });
});
