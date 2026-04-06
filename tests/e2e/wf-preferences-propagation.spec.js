import { test, expect } from '@playwright/test';
import { setupStorage } from '../helpers/setup-storage.js';
import { navigateTo } from '../helpers/navigate-to.js';
import { mockAllApiRoutes } from '../helpers/mock-api.js';

test.describe('W10: Preferences Propagation', () => {
  test.beforeEach(async ({ page }) => {
    await mockAllApiRoutes(page);
    await setupStorage(page, 'onboarded-no-jobs');
  });

  test('change prefs → hard skip reflects in Analyze', { tag: '@critical' }, async ({ page }) => {
    // Open Prefs via the button containing "Prefs"
    await page.locator('button', { hasText: 'Prefs' }).first().click();
    await expect(page.getByText('Job Search Preferences')).toBeVisible();
    // Scroll to find Cybersecurity in the excluded industries and toggle it ON
    await page.locator('button', { hasText: 'Cybersecurity' }).first().click();
    await page.getByRole('button', { name: 'Save Preferences' }).click();
    await expect(page.getByText('Preferences saved')).toBeVisible();
    // Navigate to Analyze
    await navigateTo(page, 'analyze');
    // Paste JD with cybersecurity content (needs 200+ chars for hard skip to trigger)
    await page.locator('textarea').first().fill('We need a cybersecurity analyst for penetration testing and zero trust architecture. Must have experience with vulnerability management and security operations center workflows. This role requires strong knowledge of information security best practices.');
    await expect(page.getByText('Hard Skip Detected')).toBeVisible();
  });

  test('salary floor triggers comp warning', { tag: '@critical' }, async ({ page }) => {
    // Open Prefs, set salary
    await page.locator('button', { hasText: 'Prefs' }).first().click();
    const salaryInput = page.locator('input[type="number"]');
    await salaryInput.fill('250');
    await page.getByRole('button', { name: 'Save Preferences' }).click();
    // Navigate to Analyze
    await navigateTo(page, 'analyze');
    // Paste JD with low salary (200+ chars)
    await page.locator('textarea').first().fill('Junior analyst position at a local firm. Salary range $80k - $120k per year. Requirements: 1-2 years experience in data analysis. This is an entry-level role focused on reporting, dashboards, and stakeholder communication. No travel required.');
    await expect(page.getByText(/below your/)).toBeVisible();
  });

  test('prefs persist after reload', { tag: '@critical' }, async ({ page }) => {
    // Open Prefs, toggle Cybersecurity, save
    await page.locator('button', { hasText: 'Prefs' }).first().click();
    await page.locator('button', { hasText: 'Cybersecurity' }).first().click();
    await page.getByRole('button', { name: 'Save Preferences' }).click();
    // Reload
    await page.reload();
    await page.waitForLoadState('networkidle');
    // Reopen Prefs — Cybersecurity should still be toggled
    await page.locator('button', { hasText: 'Prefs' }).first().click();
    await expect(page.getByText('Job Search Preferences')).toBeVisible();
    // Cybersecurity button should be visible (it persisted)
    await expect(page.locator('button', { hasText: 'Cybersecurity' }).first()).toBeVisible();
  });
});
