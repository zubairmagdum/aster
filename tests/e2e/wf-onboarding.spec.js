import { test, expect } from '@playwright/test';
import { setupStorage } from '../helpers/setup-storage.js';
import { mockAllApiRoutes } from '../helpers/mock-api.js';

test.describe('W1: Onboarding Journey', () => {
  test('fresh user sees onboarding welcome', { tag: '@critical' }, async ({ page }) => {
    await mockAllApiRoutes(page);
    await setupStorage(page, 'empty');
    await page.goto('/');
    await expect(page.getByText('Land the job')).toBeVisible();
    await expect(page.getByText('you actually want')).toBeVisible();
  });

  test('skip onboarding goes to app', { tag: '@critical' }, async ({ page }) => {
    await mockAllApiRoutes(page);
    await setupStorage(page, 'empty');
    await page.goto('/');
    await page.getByText('Skip onboarding').click();
    await expect(page.getByRole('button', { name: 'Dashboard' })).toBeVisible();
  });

  test('onboarded user skips directly to app', { tag: '@critical' }, async ({ page }) => {
    await mockAllApiRoutes(page);
    await setupStorage(page, 'onboarded-no-jobs');
    await page.goto('/');
    await expect(page.getByText('Land the job')).not.toBeVisible();
    await expect(page.getByRole('button', { name: 'Dashboard' })).toBeVisible();
  });

  test('inferred prefs banner shows in Prefs modal', { tag: '@critical' }, async ({ page }) => {
    await page.goto('/');
    await page.evaluate(() => {
      localStorage.clear();
      localStorage.setItem('aster_onboarded', JSON.stringify(true));
      localStorage.setItem('aster_resume', '"test resume"');
      localStorage.setItem('aster_resume_name', '"test.pdf"');
      localStorage.setItem('aster_jobs', '[]');
      localStorage.setItem('aster_contacts', '[]');
      localStorage.setItem('aster_profile', '{}');
      const prefs = {
        minSalary: 175000, workMode: "Remote", employmentType: "Full-time",
        seniorityTarget: "", cannotMeetRequirements: [], excludedIndustries: [],
        excludedCities: [], targetIndustries: ["Technology"],
        importantPerks: [], customExclusions: "", customTargetIndustries: "",
        prefsInferred: true, inferredSummary: "Senior professional with platform experience"
      };
      localStorage.setItem('aster_prefs', JSON.stringify(prefs));
    });
    await page.reload();
    await page.waitForLoadState('networkidle');
    await mockAllApiRoutes(page);
    await page.getByText('Prefs', { exact: false }).first().click();
    await expect(page.getByText('auto-detected from your resume')).toBeVisible();
    await expect(page.getByText('We read you as:')).toBeVisible();
  });
});
