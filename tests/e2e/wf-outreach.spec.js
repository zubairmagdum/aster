import { test, expect } from '@playwright/test';
import { setupStorage } from '../helpers/setup-storage.js';
import { navigateTo } from '../helpers/navigate-to.js';
import { mockAllApiRoutes } from '../helpers/mock-api.js';

test.describe('W6: Outreach Workflow', () => {
  test('select job → get strategy → generate message → copy', async ({ page }) => {
    await mockAllApiRoutes(page);
    await setupStorage(page, 'with-5-jobs');
    await navigateTo(page, 'outreach');
    // Wait for sidebar to render with jobs
    await expect(page.getByText('Stripe').first()).toBeVisible({ timeout: 10000 });
    await page.getByText('Stripe').first().click();
    // Get Strategy — wait for API response
    await page.getByRole('button', { name: 'Get Strategy' }).click();
    await expect(page.getByText('Hiring Manager', { exact: true })).toBeVisible({ timeout: 15000 });
    await expect(page.getByText('Internal Recruiter', { exact: true })).toBeVisible({ timeout: 5000 });
    // Generate message for first tier
    await page.getByRole('button', { name: /Generate/ }).first().click();
    await expect(page.getByRole('button', { name: 'Proof-led' })).toBeVisible({ timeout: 10000 });
    await expect(page.getByRole('button', { name: 'Question-led' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Value-led' })).toBeVisible();
    // Click Proof-led
    await page.getByRole('button', { name: 'Proof-led' }).click();
    // Verify message content from fixture
    await expect(page.getByText('scaling platform team')).toBeVisible();
    // Verify Copy button exists (clipboard API may not work in headless)
    await expect(page.getByRole('button', { name: 'Copy' })).toBeVisible();
  });
});
