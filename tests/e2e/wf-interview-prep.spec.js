import { test, expect } from '@playwright/test';
import { setupStorage } from '../helpers/setup-storage.js';
import { navigateTo } from '../helpers/navigate-to.js';
import { mockAllApiRoutes } from '../helpers/mock-api.js';

test.describe('W9: Interview Prep', () => {
  test.beforeEach(async ({ page }) => {
    await mockAllApiRoutes(page);
    await setupStorage(page, 'with-5-jobs');
    await navigateTo(page, 'pipeline');
  });

  test('interview prep for job advanced to HM Interview', async ({ page }) => {
    // Oscar Health is "Recruiter Screen" — expand it and change to HM Interview
    await page.getByText('Oscar Health').first().click();
    // Wait for detail panel to render, then change status
    await page.waitForTimeout(500);
    // Find the status select in the expanded detail and change to HM Interview
    const selects = page.locator('select');
    // The first select on the page in the detail panel should be the status dropdown
    await selects.first().selectOption('HM Interview');
    await page.waitForTimeout(300);
    // Now Interview Prep button should appear
    const prepBtn = page.getByRole('button', { name: /Interview Prep/ });
    await expect(prepBtn).toBeVisible({ timeout: 5000 });
    await prepBtn.click();
    // Wait for modal
    await expect(page.getByText('Likely Questions')).toBeVisible({ timeout: 15000 });
    // Verify questions from fixture
    await expect(page.getByText('launched a product from zero to one')).toBeVisible();
    // Verify research
    await expect(page.getByText('Research Before the Interview')).toBeVisible();
    await expect(page.getByText('competitive positioning')).toBeVisible();
  });

  test('interview prep button hidden for non-interview statuses', async ({ page }) => {
    // Expand Stripe (Applied status)
    await page.getByText('Stripe').first().click();
    // Interview Prep button should NOT be visible in the expanded detail
    const detailPanel = page.locator('.fade-in').last();
    await expect(detailPanel.getByRole('button', { name: /Interview Prep/ })).not.toBeVisible();
  });
});
