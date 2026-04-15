import { test, expect } from '@playwright/test';
import { setupStorage } from '../helpers/setup-storage.js';
import { navigateTo } from '../helpers/navigate-to.js';
import { mockAllApiRoutes } from '../helpers/mock-api.js';

test.describe('W4: Pipeline Management', () => {
  test.beforeEach(async ({ page }) => {
    await mockAllApiRoutes(page);
    await setupStorage(page, 'with-5-jobs');
    await navigateTo(page, 'pipeline');
    // Wait for pipeline to render — wait for a specific job to ensure cards loaded
    await expect(page.getByText('Your Pipeline')).toBeVisible({ timeout: 10000 });
    await expect(page.getByText('Stripe').first()).toBeVisible({ timeout: 10000 });
  });

  test('all jobs render in pipeline', { tag: '@critical' }, async ({ page }) => {
    await expect(page.getByText('Stripe').first()).toBeVisible({ timeout: 5000 });
    await expect(page.getByText('Oscar Health').first()).toBeVisible();
    await expect(page.getByText('Anthropic').first()).toBeVisible();
    await expect(page.getByText('Datadog').first()).toBeVisible();
    await expect(page.getByText('Calm').first()).toBeVisible();
  });

  test('filter pills filter by status', { tag: '@critical' }, async ({ page }) => {
    // Click the Applied filter pill (it shows "Applied · 2")
    await page.locator('.nav-pill', { hasText: /^Applied/ }).click();
    await expect(page.getByText('Stripe').first()).toBeVisible();
    await expect(page.getByText('Datadog').first()).toBeVisible();
    // Anthropic (Saved) and Calm (Rejected) should not be visible
    await expect(page.getByText('Anthropic')).not.toBeVisible();
    // Reset to All
    await page.locator('.nav-pill', { hasText: 'All' }).click();
    await expect(page.getByText('Anthropic').first()).toBeVisible();
  });

  test('select all and bulk update', { tag: '@critical' }, async ({ page }) => {
    await page.getByRole('button', { name: 'Select All' }).click();
    // Wait for "X of Y selected" text to appear
    await expect(page.getByText(/of \d+ selected/)).toBeVisible();
    // Change status via the select inside the dark bulk action bar
    const bulkSelect = page.locator('select').first();
    await bulkSelect.selectOption('Recruiter Screen');
    // Click the Apply button (btn-primary class)
    await page.locator('.btn-primary', { hasText: 'Apply' }).first().click();
    await expect(page.getByText(/Updated \d+ jobs/)).toBeVisible();
  });

  test('expand job shows detail', { tag: '@critical' }, async ({ page }) => {
    await page.getByText('Stripe').first().click();
    await expect(page.getByText('STATUS')).toBeVisible();
    await expect(page.getByText('DATE ADDED')).toBeVisible();
  });

  test('export CSV triggers download', { tag: '@critical' }, async ({ page }) => {
    const downloadPromise = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Export CSV' }).click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toContain('aster-pipeline');
  });

  test('remove job from pipeline', { tag: '@critical' }, async ({ page }) => {
    // Expand a job that's easy to find — Datadog
    await page.getByText('Datadog').first().click();
    await page.getByRole('button', { name: 'Remove' }).click();
    // Datadog should disappear
    await expect(page.getByText('Datadog')).not.toBeVisible();
    // Others still visible
    await expect(page.getByText('Stripe').first()).toBeVisible();
  });
});
