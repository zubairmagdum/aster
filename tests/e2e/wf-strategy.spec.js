import { test, expect } from '@playwright/test';
import { setupStorage } from '../helpers/setup-storage.js';
import { navigateTo } from '../helpers/navigate-to.js';
import { mockAllApiRoutes } from '../helpers/mock-api.js';

test.describe('W7: Strategy Hub', () => {
  test('fill inputs → generate brief → verify sections', async ({ page }) => {
    await mockAllApiRoutes(page);
    await setupStorage(page, 'onboarded-no-jobs');
    await navigateTo(page, 'strategy');
    await page.locator('input[placeholder*="Senior role"]').fill('Staff Engineer at AI company');
    await page.locator('textarea').first().fill('Referrals from former colleagues');
    await page.locator('textarea').nth(1).fill('Cold applications getting no response');
    await page.getByRole('button', { name: 'Generate Weekly Brief' }).click();
    await expect(page.getByText('Weekly Focus')).toBeVisible({ timeout: 10000 });
    await expect(page.getByText('Double Down')).toBeVisible();
    await expect(page.getByText('Stop Doing')).toBeVisible();
    await expect(page.getByText('Encouragement')).toBeVisible();
    await expect(page.getByText('Submit 3 applications')).toBeVisible();
  });

  test('inputs and brief persist after reload', async ({ page }) => {
    await mockAllApiRoutes(page);
    await setupStorage(page, 'onboarded-no-jobs');
    await navigateTo(page, 'strategy');
    await page.locator('input[placeholder*="Senior role"]').fill('Staff Engineer at AI company');
    await page.locator('textarea').first().fill('Referrals work');
    await page.locator('textarea').nth(1).fill('Cold apps fail');
    await page.getByRole('button', { name: 'Generate Weekly Brief' }).click();
    await expect(page.getByText('Weekly Focus')).toBeVisible({ timeout: 10000 });
    await page.reload();
    await page.waitForLoadState('networkidle');
    await navigateTo(page, 'strategy');
    await expect(page.locator('input[placeholder*="Senior role"]')).toHaveValue('Staff Engineer at AI company');
    await expect(page.getByText('Weekly Focus')).toBeVisible();
  });
});
