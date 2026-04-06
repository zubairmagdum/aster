import { test, expect } from '@playwright/test';
import { setupStorage } from '../helpers/setup-storage.js';
import { navigateTo } from '../helpers/navigate-to.js';
import { mockAllApiRoutes } from '../helpers/mock-api.js';

test.describe('W8: Resume Workshop', () => {
  test('analyze resume → get versions → recommend for JD', async ({ page }) => {
    await mockAllApiRoutes(page);
    await setupStorage(page, 'onboarded-no-jobs');
    await navigateTo(page, 'workshop');
    await page.getByRole('button', { name: 'Analyze My Resume' }).click();
    await expect(page.getByText('Platform Engineering').first()).toBeVisible({ timeout: 10000 });
    await expect(page.getByText('AI Product')).toBeVisible();
    await expect(page.getByText('Growth & Lifecycle')).toBeVisible();
    await expect(page.getByText('Sr PM, Platform')).toBeVisible();
    // Recommendation
    await page.locator('textarea[placeholder*="JD snippet"]').fill('We need a PM for our API platform with experience in developer tools and multi-tenant architecture.');
    await page.getByRole('button', { name: 'Recommend' }).click();
    await expect(page.getByText('API design')).toBeVisible({ timeout: 10000 });
  });

  test('no resume shows empty state', async ({ page }) => {
    await mockAllApiRoutes(page);
    await setupStorage(page, 'onboarded-no-resume');
    await navigateTo(page, 'workshop');
    await expect(page.getByText('Upload your resume first')).toBeVisible();
  });

  test('versions persist after reload', async ({ page }) => {
    await mockAllApiRoutes(page);
    await setupStorage(page, 'onboarded-no-jobs');
    await navigateTo(page, 'workshop');
    await page.getByRole('button', { name: 'Analyze My Resume' }).click();
    await expect(page.getByText('Platform Engineering').first()).toBeVisible({ timeout: 10000 });
    await page.reload();
    await page.waitForLoadState('networkidle');
    await navigateTo(page, 'workshop');
    await expect(page.getByText('Platform Engineering').first()).toBeVisible();
  });
});
