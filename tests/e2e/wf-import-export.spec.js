import { test, expect } from '@playwright/test';
import { setupStorage } from '../helpers/setup-storage.js';
import { navigateTo } from '../helpers/navigate-to.js';
import { mockAllApiRoutes } from '../helpers/mock-api.js';

test.describe('W5: Import History', () => {
  test.beforeEach(async ({ page }) => {
    await mockAllApiRoutes(page);
    await setupStorage(page, 'onboarded-no-jobs');
    await navigateTo(page, 'pipeline');
  });

  test('empty pipeline shows empty state', { tag: '@critical' }, async ({ page }) => {
    await expect(page.getByText('No roles here yet')).toBeVisible();
  });

  test('CSV import with header row', { tag: '@critical' }, async ({ page }) => {
    await page.getByRole('button', { name: 'Import History' }).click();
    await expect(page.getByText('Import Past Applications')).toBeVisible();
    // Fill CSV textarea
    const csvData = 'Company,Role,Date Applied,Outcome,Notes\nAcme Corp,Engineer,2025-06-01,No Response,\nGlobal Inc,Designer,2025-05-15,Rejected,Generic';
    await page.locator('textarea').first().fill(csvData);
    await page.getByRole('button', { name: 'Parse' }).click();
    await expect(page.getByText('2 jobs parsed')).toBeVisible();
    await page.getByRole('button', { name: /Import 2 jobs/ }).click();
    await expect(page.getByText(/Imported 2 jobs/)).toBeVisible();
    // Modal closes, jobs visible
    await expect(page.getByText('Acme Corp')).toBeVisible();
    await expect(page.getByText('Global Inc')).toBeVisible();
  });

  test('bulk paste import', { tag: '@critical' }, async ({ page }) => {
    await page.getByRole('button', { name: 'Import History' }).click();
    await page.getByRole('button', { name: 'Bulk Paste' }).click();
    const bulkData = 'Figma | Designer | Applied | 2025-07-01\nLinear | Engineer | Saved | 2025-07-02';
    await page.locator('textarea').first().fill(bulkData);
    await page.getByRole('button', { name: 'Parse' }).click();
    await expect(page.getByText('2 jobs parsed')).toBeVisible();
    await page.getByRole('button', { name: /Import 2 jobs/ }).click();
    await expect(page.getByText(/Imported 2 jobs/)).toBeVisible();
    await expect(page.getByText('Figma')).toBeVisible();
    await expect(page.getByText('Linear')).toBeVisible();
  });

  test('imported jobs persist after refresh', { tag: '@critical' }, async ({ page }) => {
    // Import via CSV
    await page.getByRole('button', { name: 'Import History' }).click();
    await page.locator('textarea').first().fill('Acme Corp,Engineer,2025-06-01,No Response,');
    await page.getByRole('button', { name: 'Parse' }).click();
    await page.getByRole('button', { name: /Import 1 job/ }).click();
    await expect(page.getByText(/Imported 1 job/)).toBeVisible();
    // Reload
    await page.reload();
    await page.waitForLoadState('networkidle');
    await navigateTo(page, 'pipeline');
    await expect(page.getByText('Acme Corp')).toBeVisible();
  });
});
